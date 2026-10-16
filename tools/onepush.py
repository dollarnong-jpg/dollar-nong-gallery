#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键把摄影站发布到 GitHub Pages。

做的事情：
  1. 读取你的 GitHub token（只在内存里用，不写任何文件）
  2. 确认 token 属于哪个账号
  3. 仓库不存在就自动创建
  4. 推送到 GitHub
  5. 自动打开 Pages（用 GitHub Actions 方式）
  6. 轮询等它上线，最后把地址打出来

用法：
  python3 tools/onepush.py                 # 交互式
  python3 tools/onepush.py --repo 名字      # 指定仓库名
  python3 tools/onepush.py --dry-run       # 只打印计划，不联网
"""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
API = "https://api.github.com"
UA = "dollar-nong-photosite/1.0"

DEFAULT_REPO = "dollar-nong-gallery"


def say(msg=""):
    print(msg, flush=True)


def step(msg):
    say("\n\033[1m▶ %s\033[0m" % msg)


def ok(msg):
    say("  \033[32m✓\033[0m %s" % msg)


def warn(msg):
    say("  \033[33m!\033[0m %s" % msg)


def fail(msg):
    say("  \033[31m✗\033[0m %s" % msg)


class ApiError(Exception):
    def __init__(self, status, body):
        self.status = status
        self.body = body
        super().__init__("HTTP %s: %s" % (status, body))


def api(method, path, token=None, payload=None):
    url = path if path.startswith("http") else API + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    req.add_header("User-Agent", UA)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(body) if body.strip() else {})
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"message": body[:300]}
        raise ApiError(exc.code, parsed)
    except urllib.error.URLError as exc:
        raise RuntimeError("连不上 GitHub：%s\n请检查网络，或看看 Clash 之类的代理是否开着。" % exc.reason)


def git(args, env=None, cwd=PROJECT):
    full = ["git"] + args
    proc = subprocess.run(full, cwd=cwd, env=env,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return proc.returncode, proc.stdout.decode("utf-8", "replace").strip()


def read_token():
    say("需要一个 GitHub token。生成方法：")
    say("  1. 打开 https://github.com/settings/tokens?type=beta")
    say("  2. Generate new token → 名字随便填")
    say("  3. Repository access 选 Only select repositories（或 All repositories）")
    say("  4. Permissions 里勾上：Contents = Read and write，Pages = Read and write")
    say("  5. 生成后复制那串 github_pat_... 粘到下面")
    say("")
    for attempt in range(3):
        try:
            token = getpass.getpass("粘贴 token（输入时不显示）: ").strip()
        except Exception:
            token = input("粘贴 token: ").strip()
        if token:
            return token
        warn("没有输入内容，再试一次")
    raise SystemExit("没有拿到 token，已退出。")


def ensure_repo(token, login, repo, private=False, dry=False):
    step("检查仓库 %s/%s" % (login, repo))
    if dry:
        say("  （演练模式，跳过）")
        return "created"
    try:
        status, data = api("GET", "/repos/%s/%s" % (login, repo), token)
        ok("仓库已存在")
        return "exists"
    except ApiError as exc:
        if exc.status != 404:
            raise
    say("  仓库不存在，正在创建…")
    status, data = api("POST", "/user/repos", token, {
        "name": repo,
        "description": "个人摄影作品站",
        "private": bool(private),
        "has_issues": False,
        "has_wiki": False,
        "has_projects": False,
        "auto_init": False,
    })
    ok("已创建 %s" % data.get("html_url", repo))
    return "created"


def ensure_remote(login, repo):
    step("配置远程仓库地址")
    url = "https://github.com/%s/%s.git" % (login, repo)
    code, out = git(["remote", "get-url", "origin"])
    if code == 0:
        if out.strip() != url:
            git(["remote", "set-url", "origin", url])
            ok("已更新 origin → %s" % url)
        else:
            ok("origin 已经是 %s" % url)
    else:
        git(["remote", "add", "origin", url])
        ok("已添加 origin → %s" % url)
    return url


def push(token, login, repo):
    step("推送到 GitHub")
    code, out = git(["rev-parse", "--abbrev-ref", "HEAD"])
    branch = out.strip() or "main"

    basic = base64.b64encode(("%s:%s" % (login, token)).encode("utf-8")).decode("ascii")
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_CONFIG_COUNT"] = "1"
    env["GIT_CONFIG_KEY_0"] = "http.extraheader"
    env["GIT_CONFIG_VALUE_0"] = "Authorization: Basic " + basic

    code, out = git(["-c", "credential.helper=", "push", "-u", "origin", branch], env=env)
    if out:
        say("  " + out.replace("\n", "\n  "))
    if code != 0:
        raise SystemExit("\n推送失败。上面是 git 的原始输出。")
    ok("已推送分支 %s" % branch)
    return branch


def enable_pages(token, login, repo):
    step("开启 GitHub Pages")
    path = "/repos/%s/%s/pages" % (login, repo)
    try:
        status, data = api("GET", path, token)
        if data.get("build_type") == "workflow":
            ok("Pages 已经开好了（GitHub Actions 方式）")
            return data.get("html_url")
        api("PUT", path, token, {"build_type": "workflow"})
        ok("已切换成 GitHub Actions 方式")
        return data.get("html_url")
    except ApiError as exc:
        if exc.status == 404:
            pass
        elif exc.status in (403, 422):
            warn("自动开启失败（%s），需要你手动开一次：" % exc.body.get("message", exc.status))
            say("      仓库 → Settings → Pages → Source 选 GitHub Actions")
            say("      https://github.com/%s/%s/settings/pages" % (login, repo))
            return None
        else:
            raise

    try:
        status, data = api("POST", path, token, {"build_type": "workflow"})
        ok("Pages 已开启（GitHub Actions 方式）")
        return data.get("html_url")
    except ApiError as exc:
        if exc.status == 409:
            ok("Pages 已经在运行了")
            return None
        warn("自动开启失败：%s" % exc.body.get("message", exc.status))
        say("      请手动开一次：https://github.com/%s/%s/settings/pages" % (login, repo))
        return None


def wait_for_pages(token, login, repo, url, timeout=300):
    step("等待上线（最多 %d 秒）" % timeout)
    path = "/repos/%s/%s/pages" % (login, repo)
    started = time.time()
    last = None
    while time.time() - started < timeout:
        try:
            status, data = api("GET", path, token)
            state = data.get("status")
            url = data.get("html_url") or url
            if state and state != last:
                say("  状态：%s" % state)
                last = state
            if state == "built":
                ok("已经上线")
                return url, True
            if state == "errored":
                warn("GitHub 报告构建出错，去 Actions 页面看日志")
                return url, False
        except ApiError as exc:
            if exc.status != 404:
                raise
            if last != "waiting":
                say("  还没有部署记录，等 Actions 跑完…")
                last = "waiting"
        time.sleep(10)

    warn("等了 %d 秒还没好，通常再等 1-2 分钟就行" % timeout)
    return url, False


def main():
    parser = argparse.ArgumentParser(description="一键发布摄影站到 GitHub Pages")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="仓库名，默认 %s" % DEFAULT_REPO)
    parser.add_argument("--private", action="store_true", help="建私有仓库（Pages 需要付费账号）")
    parser.add_argument("--dry-run", action="store_true", help="只打印计划，不联网")
    parser.add_argument("--token", default=None, help="直接给 token（不推荐，会留在命令历史里）")
    args = parser.parse_args()

    say("=" * 60)
    say("  摄影站 · 一键发布到 GitHub Pages")
    say("=" * 60)
    say("项目目录：%s" % PROJECT)
    say("目标仓库：%s" % args.repo)

    code, out = git(["status", "--porcelain"])
    if out.strip():
        warn("有未提交的改动，正在提交…")
        git(["add", "-A"])
        code, out2 = git(["commit", "-m", "更新作品 " + time.strftime("%Y-%m-%d %H:%M")])
        if out2:
            say("  " + out2)
    code, out = git(["rev-parse", "--is-inside-work-tree"])
    if code != 0:
        say("")
        fail("这个目录还不是 git 仓库。先在项目目录执行 git init -b main 再来。")
        raise SystemExit(1)

    if args.dry_run:
        step("演练模式")
        say("  会做这些事：")
        say("   1. 校验 token")
        say("   2. 确认/创建仓库 %s" % args.repo)
        say("   3. git push origin main")
        say("   4. 开启 Pages（GitHub Actions 方式）")
        say("   5. 等上线并打印地址")
        return

    token = args.token or read_token()

    step("校验 token")
    status, me = api("GET", "/user", token)
    login = me.get("login")
    if not login:
        raise SystemExit("token 无效，拿不到账号信息。")
    ok("已登录为 %s" % login)

    ensure_repo(token, login, args.repo, args.private)
    ensure_remote(login, args.repo)
    push(token, login, args.repo)
    url = enable_pages(token, login, args.repo)
    url = url or "https://%s.github.io/%s/" % (login, args.repo)
    url, ready = wait_for_pages(token, login, args.repo, url)

    say("")
    say("=" * 60)
    if ready:
        say("  上线完成")
    else:
        say("  已推送，站点马上就好")
    say("=" * 60)
    say("  网站地址： \033[1m%s\033[0m" % url)
    say("  仓库地址： https://github.com/%s/%s" % (login, args.repo))
    say("  发布记录： https://github.com/%s/%s/actions" % (login, args.repo))
    say("")
    say("  以后更新作品：打开管理台 → 点「发布到线上」")
    say("")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        say("\n已取消。")
        sys.exit(130)
    except ApiError as exc:
        say("")
        fail("GitHub 返回错误 %s：%s" % (exc.status, exc.body.get("message", "")))
        if exc.status == 401:
            say("      token 无效或已过期，重新生成一个。")
        elif exc.status == 403:
            say("      token 权限不够，需要 Contents 和 Pages 的 Read and write。")
        raise SystemExit(1)
    except RuntimeError as exc:
        say("")
        fail(str(exc))
        raise SystemExit(1)
