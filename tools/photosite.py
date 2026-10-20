#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dollar Nong 摄影站 · 内容引擎

一个文件解决四件事：
  1. build   扫描 content/ 里的原图，生成网站用的缩略图、大图和站点数据
  2. serve   启动本机管理台（浏览器里上传、排序、改文案、预览、一键发布）
  3. publish build + git commit + git push
  4. watch   盯着 content/ 文件夹，放进去照片就自动重新生成

只依赖 macOS 自带的 python3 和 sips，不需要安装任何东西。
在群晖 / QNAP 的 NAS 上，把 --engine sips 换成 --engine magick 即可用 ImageMagick。
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote, quote

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
CONFIG_PATH = os.path.join(HERE, "photosite.config.json")

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".webp", ".bmp", ".gif", ".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".rw2", ".orf"}

DEFAULT_CONFIG = {
    "content": "../content",
    "web": "../web",
    "port": 8765,
    "thumbSize": 900,
    "thumbQuality": 72,
    "fullSize": 2048,
    "fullQuality": 82,
    "engine": "sips",
    "autoPush": True,
    "gitRemote": "origin",
    "gitBranch": "main",
    "stripMetadata": True,
}

DEFAULT_SITE = {
    "title": "DOLLAR NONG",
    "titleCn": "农多多 摄影",
    "subtitle": "人像 · 商业 · 航拍",
    "intro": "用光线和现场说话。承接人像写真、商业空间、美食与航拍。",
    "about": "常驻南宁的摄影师，长期拍摄人像、商业空间与美食。喜欢自然光，也喜欢把现场原有的气氛留下来。",
    "email": "",
    "phone": "",
    "wechat": "",
    "instagram": "",
    "footerNote": "",
    "worksDesc": "",
    "contactLead": "有拍摄需求，欢迎直接联系。",
    "location": "南宁",
    "services": "人像写真 / 商业空间 / 美食 / 航拍",
    "gear": "",
    "xiaohongshu": "",
}

_run_log = []
_log_lock = threading.Lock()


def log(msg):
    line = time.strftime("%H:%M:%S ") + str(msg)
    with _log_lock:
        _run_log.append(line)
        del _run_log[:-400]
    print(line, flush=True)


def tail_log(n=120):
    with _log_lock:
        return list(_run_log[-n:])


# --------------------------------------------------------------------------
# 基础工具
# --------------------------------------------------------------------------

def load_config():
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
                cfg.update(json.load(fh))
        except Exception as exc:
            log("配置文件读取失败，使用默认值: %s" % exc)
    cfg["content"] = os.path.abspath(os.path.join(HERE, cfg["content"]))
    cfg["web"] = os.path.abspath(os.path.join(HERE, cfg["web"]))
    return cfg


def save_config(cfg):
    out = {k: cfg[k] for k in DEFAULT_CONFIG if k in cfg}
    with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)


def read_json(path, default=None):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        log("读取 %s 失败: %s" % (path, exc))
        return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = "%s.%d.tmp" % (path, os.getpid())
    for attempt in range(4):
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
        try:
            os.replace(tmp, path)
            return
        except FileNotFoundError:
            if attempt == 3:
                raise
            time.sleep(0.2)


def slugify(name):
    s = name.strip()
    s = re.sub(r"^\d+[ _\-.]*", "", s)
    s = re.sub(r"[\s]+", "-", s)
    s = re.sub(r"[^\w\u4e00-\u9fff\-]+", "", s, flags=re.UNICODE)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "album"


def safe_name(name):
    name = os.path.basename(name.replace("\\", "/"))
    name = re.sub(r"[\x00-\x1f]", "", name).strip()
    return name or "photo.jpg"


def find_images(folder, exts=IMAGE_EXT):
    items = []
    if not os.path.isdir(folder):
        return items
    for entry in sorted(os.listdir(folder)):
        if entry.startswith(".") or entry.startswith("_"):
            continue
        full = os.path.join(folder, entry)
        if os.path.isfile(full) and os.path.splitext(entry)[1].lower() in exts:
            items.append(entry)
    return items


def run_cmd(args, cwd=None):
    proc = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = proc.stdout.decode("utf-8", "replace").strip()
    return proc.returncode, out


# --------------------------------------------------------------------------
# 图片处理
# --------------------------------------------------------------------------

def image_size(path):
    code, out = run_cmd(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path])
    w = h = 0
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("pixelWidth:"):
            w = int(re.findall(r"\d+", line)[0]) if re.findall(r"\d+", line) else 0
        elif line.startswith("pixelHeight:"):
            h = int(re.findall(r"\d+", line)[0]) if re.findall(r"\d+", line) else 0
    return w, h


def sips_convert(src, dst, max_size, quality, strip=True):
    """先缩放转换，再就地清除定位与拍摄信息（后者失败不影响出图）。"""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    args = ["sips", "-Z", str(max_size), "-s", "format", "jpeg",
            "-s", "formatOptions", str(quality), "-o", dst, src]
    code, out = run_cmd(args)
    if not os.path.exists(dst):
        raise RuntimeError("sips 处理失败: %s -> %s :: %s" % (src, dst, out))
    if strip:
        run_cmd(["sips", "-d", "GPS", "-d", "allExif", dst])
    return dst


def magick_convert(src, dst, max_size, quality, strip=True):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    exe = shutil.which("magick") or shutil.which("convert")
    if not exe:
        raise RuntimeError("没有找到 ImageMagick")
    args = [exe, src, "-auto-orient", "-resize", "%dx%d>" % (max_size, max_size), "-quality", str(quality)]
    if strip:
        args += ["-strip"]
    args += [dst]
    code, out = run_cmd(args)
    if not os.path.exists(dst):
        raise RuntimeError("ImageMagick 处理失败: %s :: %s" % (src, out))
    return dst


def make_derivative(cfg, src, dst, max_size, quality):
    if cfg.get("engine") == "magick":
        return magick_convert(src, dst, max_size, quality, cfg.get("stripMetadata", True))
    return sips_convert(src, dst, max_size, quality, cfg.get("stripMetadata", True))


def make_lqip(cfg, src, cache):
    """生成内嵌的极小占位图，按 路径+修改时间 缓存，避免每次重建都重跑。"""
    key = "%s|%.0f" % (src, os.path.getmtime(src))
    if key in cache:
        return cache[key]
    tmp = os.path.join(cfg["content"], ".cache", "_lqip.jpg")
    value = ""
    try:
        make_derivative(cfg, src, tmp, 28, 40)
        with open(tmp, "rb") as fh:
            data = fh.read()
        if len(data) <= 6000:
            value = "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")
    except Exception:
        value = ""
    cache[key] = value
    return value


# --------------------------------------------------------------------------
# 内容读取
# --------------------------------------------------------------------------

def scan_albums(cfg):
    albums_dir = os.path.join(cfg["content"], "albums")
    os.makedirs(albums_dir, exist_ok=True)
    albums = []
    for folder in sorted(os.listdir(albums_dir)):
        full = os.path.join(albums_dir, folder)
        if not os.path.isdir(full) or folder.startswith("."):
            continue
        meta = read_json(os.path.join(full, "_album.json"), {}) or {}
        files = find_images(full)
        order = meta.get("order") or []
        if order:
            ranked = {name: i for i, name in enumerate(order)}
            files.sort(key=lambda n: (ranked.get(n, len(ranked)), n))
        albums.append({
            "folder": folder,
            "dir": full,
            "slug": meta.get("slug") or slugify(folder),
            "title": meta.get("title") or slugify(folder),
            "subtitle": meta.get("subtitle", ""),
            "description": meta.get("description", ""),
            "order": meta.get("orderSort", 100),
            "cover": meta.get("cover", ""),
            "hidden": bool(meta.get("hidden", False)),
            "files": files,
            "metaPath": os.path.join(full, "_album.json"),
        })
    albums.sort(key=lambda a: (a["order"], a["folder"]))
    return albums


def repo_info(cfg):
    root = PROJECT
    code, _ = run_cmd(["git", "rev-parse", "--is-inside-work-tree"], cwd=root)
    if code != 0:
        return {"isRepo": False}
    _, remote = run_cmd(["git", "remote", "get-url", cfg.get("gitRemote", "origin")], cwd=root)
    _, branch = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=root)
    _, status = run_cmd(["git", "status", "--porcelain"], cwd=root)
    return {
        "isRepo": True,
        "remote": remote.strip(),
        "branch": branch.strip(),
        "dirty": bool(status.strip()),
    }


# --------------------------------------------------------------------------
# 构建
# --------------------------------------------------------------------------

def build(cfg, quiet=False):
    t0 = time.time()
    site = dict(DEFAULT_SITE)
    site.update(read_json(os.path.join(cfg["content"], "_site.json"), {}) or {})
    albums = scan_albums(cfg)
    web = cfg["web"]
    media_root = os.path.join(web, "media")
    cache_dir = os.path.join(cfg["content"], ".cache")
    os.makedirs(cache_dir, exist_ok=True)
    lqip_path = os.path.join(cache_dir, "lqip.json")
    lqip_cache = read_json(lqip_path, {}) or {}

    out_albums = []
    total = 0
    for album in albums:
        if album["hidden"]:
            continue
        slug = album["slug"]
        out_dir = os.path.join(media_root, slug)
        thumb_dir = os.path.join(out_dir, "t")
        os.makedirs(thumb_dir, exist_ok=True)

        photos = []
        expected = set()
        for filename in album["files"]:
            src = os.path.join(album["dir"], filename)
            stem = re.sub(r"[^\w\u4e00-\u9fff\-]+", "_", os.path.splitext(filename)[0])[:40].strip("_-")
            digest = hashlib.md5(filename.encode("utf-8")).hexdigest()[:6]
            base = "%s-%s.jpg" % (stem or "photo", digest)
            full_dst = os.path.join(out_dir, base)
            thumb_dst = os.path.join(thumb_dir, base)
            expected.add(base)
            try:
                if not os.path.exists(full_dst) or os.path.getmtime(full_dst) < os.path.getmtime(src):
                    make_derivative(cfg, src, full_dst, cfg["fullSize"], cfg["fullQuality"])
                    if os.path.exists(thumb_dst):
                        os.remove(thumb_dst)
                if not os.path.exists(thumb_dst):
                    make_derivative(cfg, src, thumb_dst, cfg["thumbSize"], cfg["thumbQuality"])
                w, h = image_size(thumb_dst)
            except Exception as exc:
                log("跳过 %s: %s" % (filename, exc))
                continue

            photos.append({
                "file": filename,
                "src": "media/%s/%s" % (quote(slug), base),
                "thumb": "media/%s/t/%s" % (quote(slug), base),
                "w": w,
                "h": h,
                "ratio": round(w / h, 4) if h else 1.0,
                "title": os.path.splitext(filename)[0],
                "lqip": make_lqip(cfg, src, lqip_cache),
            })
            total += 1
            if not quiet:
                log("  %s / %s" % (slug, filename))

        for stale in os.listdir(out_dir):
            p = os.path.join(out_dir, stale)
            if os.path.isfile(p) and stale.lower().endswith(".jpg") and stale not in expected:
                os.remove(p)
        for stale in os.listdir(thumb_dir):
            p = os.path.join(thumb_dir, stale)
            if os.path.isfile(p) and stale.lower().endswith(".jpg") and stale not in expected:
                os.remove(p)

        if not photos:
            log("相册「%s」没有可用照片，已跳过" % album["title"])
            continue

        cover = album["cover"] or photos[0]["src"]
        if cover and not cover.startswith("media/"):
            for photo in photos:
                if photo["file"] == album["cover"]:
                    cover = photo["src"]
                    break
            else:
                cover = photos[0]["src"]

        out_albums.append({
            "slug": slug,
            "title": album["title"],
            "subtitle": album["subtitle"],
            "description": album["description"],
            "cover": cover,
            "coverLqip": next((p["lqip"] for p in photos if p["src"] == cover), photos[0]["lqip"]),
            "count": len(photos),
            "photos": photos,
        })

    payload = {
        "site": site,
        "albums": out_albums,
        "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "photoCount": total,
    }
    write_json(lqip_path, lqip_cache)
    write_json(os.path.join(web, "data", "albums.json"), payload)
    with open(os.path.join(web, "data", "albums.js"), "w", encoding="utf-8") as fh:
        fh.write("window.__ALBUMS__=")
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    with open(os.path.join(web, ".nojekyll"), "w", encoding="utf-8") as fh:
        fh.write("")

    log("构建完成：%d 个相册 / %d 张照片，用时 %.1fs" % (len(out_albums), total, time.time() - t0))
    return payload


# --------------------------------------------------------------------------
# 发布
# --------------------------------------------------------------------------

def redact(text):
    """把 URL 里的 token / 密码遮掉，别让它进日志。"""
    return re.sub(r"//[^/@\s]+@", "//***@", str(text))


def publish(cfg, message=None):
    build(cfg, quiet=True)
    info = repo_info(cfg)
    if not info.get("isRepo"):
        raise RuntimeError("这里还不是 git 仓库。先执行：git init && git remote add origin <你的仓库地址>")
    message = message or ("更新作品 " + time.strftime("%Y-%m-%d %H:%M"))
    steps = [
        # web 是网站产物；content 是相册文案/排序/封面等源数据，必须一起提交
        ["git", "add", "-A", "web", "content"],
        ["git", "commit", "-m", message],
    ]
    for step in steps:
        code, out = run_cmd(step, cwd=PROJECT)
        if out:
            log("$ %s\n%s" % (" ".join(step), out))
        if code != 0 and "nothing to commit" not in out:
            raise RuntimeError("命令失败：%s\n%s" % (" ".join(step), out))
    if cfg.get("autoPush", True):
        # 网络偶尔抽风，自动重试三次，省得手动再点一次「发布」
        code, out = 1, ""
        for attempt in range(1, 4):
            code, out = run_cmd(["git", "push", cfg.get("gitRemote", "origin"), cfg.get("gitBranch", "main")], cwd=PROJECT)
            if out:
                log("$ git push（第 %d 次）\n%s" % (attempt, redact(out)))
            if code == 0:
                break
            if attempt < 3:
                log("推送失败，10 秒后自动重试…")
                time.sleep(10)
        if code != 0:
            raise RuntimeError("推送失败（已自动重试 3 次），请检查网络或仓库权限：\n%s" % out)
        log("已推送到 %s / %s" % (redact(info.get("remote", "")), cfg.get("gitBranch")))
    return True


# --------------------------------------------------------------------------
# 管理台 Web 服务
# --------------------------------------------------------------------------

ADMIN_DIR = os.path.join(HERE, "admin")

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    cfg = None
    server_version = "photosite/1.0"

    def log_message(self, fmt, *args):
        pass

    # -- 响应helper --------------------------------------------------------
    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, download_name=None):
        if not os.path.isfile(path):
            self.send_error(404, "Not found")
            return
        ext = os.path.splitext(path)[1].lower()
        size = os.path.getsize(path)
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(size))
        if download_name:
            self.send_header("Content-Disposition", 'attachment; filename="%s"' % download_name)
        self.end_headers()
        with open(path, "rb") as fh:
            shutil.copyfileobj(fh, self.wfile)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def read_json_body(self):
        raw = self.read_body()
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    # -- 路由 --------------------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        query = parse_qs(parsed.query)

        if path.startswith("/api/"):
            return self.api_get(path, query)

        if path.startswith("/preview"):
            rel = path[len("/preview"):].lstrip("/") or "index.html"
            return self.send_file(os.path.join(self.cfg["web"], rel))

        if path in ("/", "/index.html", "/admin", "/admin/"):
            return self.send_file(os.path.join(ADMIN_DIR, "index.html"))

        rel = path.lstrip("/")
        target = os.path.join(ADMIN_DIR, rel)
        if os.path.isfile(target):
            return self.send_file(target)

        self.send_error(404, "Not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        query = parse_qs(parsed.query)
        try:
            if path == "/api/upload":
                return self.api_upload(query)
            if path.startswith("/api/"):
                return self.api_post(path, self.read_json_body())
            self.send_error(404, "Not found")
        except Exception as exc:
            log("API 出错 %s: %s" % (path, exc))
            self.send_json({"ok": False, "error": str(exc)}, 400)

    # -- API: 读取 ---------------------------------------------------------
    def api_get(self, path, query):
        cfg = self.cfg
        if path == "/api/state":
            albums = scan_albums(cfg)
            return self.send_json({
                "ok": True,
                "config": {k: cfg[k] for k in DEFAULT_CONFIG},
                "contentDir": cfg["content"],
                "webDir": cfg["web"],
                "site": read_json(os.path.join(cfg["content"], "_site.json"), {}) or {},
                "defaultSite": DEFAULT_SITE,
                "albums": [{
                    "folder": a["folder"], "slug": a["slug"], "title": a["title"],
                    "subtitle": a["subtitle"], "description": a["description"],
                    "order": a["order"], "cover": a["cover"], "hidden": a["hidden"],
                    "count": len(a["files"]), "files": a["files"],
                } for a in albums],
                "repo": repo_info(cfg),
            })
        if path == "/api/log":
            return self.send_json({"ok": True, "lines": tail_log()})
        if path == "/api/thumb":
            album = (query.get("album") or [""])[0]
            name = (query.get("file") or [""])[0]
            for a in scan_albums(cfg):
                if a["slug"] == album or a["folder"] == album:
                    target = os.path.join(a["dir"], safe_name(name))
                    if os.path.isfile(target):
                        return self.send_file(target)
            return self.send_error(404, "Not found")
        self.send_error(404, "Not found")

    # -- API: 写入 ---------------------------------------------------------
    def api_post(self, path, data):
        cfg = self.cfg
        content = cfg["content"]
        albums_dir = os.path.join(content, "albums")

        if path == "/api/site":
            site = read_json(os.path.join(content, "_site.json"), {}) or {}
            site.update(data or {})
            write_json(os.path.join(content, "_site.json"), site)
            return self.send_json({"ok": True})

        if path == "/api/config":
            for key in ("content", "web", "port", "thumbSize", "fullSize", "autoPush", "gitBranch", "gitRemote"):
                if key in data:
                    cfg[key] = data[key]
            cfg["content"] = os.path.abspath(os.path.join(HERE, cfg["content"]))
            cfg["web"] = os.path.abspath(os.path.join(HERE, cfg["web"]))
            save_config(cfg)
            return self.send_json({"ok": True, "contentDir": cfg["content"], "webDir": cfg["web"]})

        if path == "/api/album/create":
            raw = (data.get("name") or "").strip()
            if not raw:
                raise RuntimeError("请填写相册名字")
            folder = raw if re.match(r"^\d", raw) else "%02d-%s" % (len(os.listdir(albums_dir)) + 1, raw)
            full = os.path.join(albums_dir, folder)
            os.makedirs(full, exist_ok=True)
            if not os.path.exists(os.path.join(full, "_album.json")):
                write_json(os.path.join(full, "_album.json"), {
                    "slug": slugify(folder), "title": slugify(folder), "subtitle": "",
                    "description": "", "cover": "", "orderSort": 100, "hidden": False, "order": [],
                })
            return self.send_json({"ok": True, "folder": folder})

        if path == "/api/album/update":
            folder = safe_name(data.get("folder") or "")
            meta_path = os.path.join(albums_dir, folder, "_album.json")
            if not os.path.exists(meta_path) and not os.path.isdir(os.path.dirname(meta_path)):
                raise RuntimeError("相册不存在")
            meta = read_json(meta_path, {}) or {}
            for key in ("slug", "title", "subtitle", "description", "cover", "orderSort", "hidden", "order"):
                if key in data:
                    meta[key] = data[key]
            write_json(meta_path, meta)
            return self.send_json({"ok": True})

        if path == "/api/album/delete":
            folder = safe_name(data.get("folder") or "")
            target = os.path.join(albums_dir, folder)
            if os.path.isdir(target):
                shutil.rmtree(target)
                shutil.rmtree(os.path.join(cfg["web"], "media", slugify(folder)), ignore_errors=True)
            return self.send_json({"ok": True})

        if path == "/api/album/reorder":
            for item in data.get("albums") or []:
                meta_path = os.path.join(albums_dir, safe_name(item.get("folder") or ""), "_album.json")
                meta = read_json(meta_path, {}) or {}
                meta["orderSort"] = item.get("order", 100)
                write_json(meta_path, meta)
            return self.send_json({"ok": True})

        if path == "/api/photo/delete":
            folder = safe_name(data.get("folder") or "")
            name = safe_name(data.get("file") or "")
            target = os.path.join(albums_dir, folder, name)
            if os.path.isfile(target):
                os.remove(target)
            return self.send_json({"ok": True})

        if path == "/api/photo/order":
            folder = safe_name(data.get("folder") or "")
            meta_path = os.path.join(albums_dir, folder, "_album.json")
            meta = read_json(meta_path, {}) or {}
            meta["order"] = data.get("order") or []
            write_json(meta_path, meta)
            return self.send_json({"ok": True})

        if path == "/api/build":
            payload = build(cfg, quiet=True)
            return self.send_json({"ok": True, "albumCount": len(payload["albums"]), "photoCount": payload["photoCount"]})

        if path == "/api/publish":
            publish(cfg, data.get("message"))
            return self.send_json({"ok": True})

        if path == "/api/git/init":
            remote = (data.get("remote") or "").strip()
            run_cmd(["git", "init", "-b", cfg.get("gitBranch", "main")], cwd=PROJECT)
            if remote:
                run_cmd(["git", "remote", "add", cfg.get("gitRemote", "origin"), remote], cwd=PROJECT)
            return self.send_json({"ok": True, "repo": repo_info(cfg)})

        self.send_error(404, "Not found")

    # -- API: 上传（流式写盘，支持大图） ------------------------------------
    def api_upload(self, query):
        cfg = self.cfg
        album = (query.get("album") or [""])[0]
        name = safe_name((query.get("name") or [""])[0])
        if not album or not name:
            raise RuntimeError("缺少相册或文件名")
        target_dir = None
        for item in scan_albums(cfg):
            if album in (item["slug"], item["folder"], slugify(item["folder"])):
                target_dir = item["dir"]
                break
        if target_dir is None:
            raise RuntimeError("相册不存在：%s" % album)
        ext = os.path.splitext(name)[1].lower()
        if ext not in IMAGE_EXT:
            raise RuntimeError("不支持的格式：%s" % ext)

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            raise RuntimeError("空文件")
        os.makedirs(target_dir, exist_ok=True)
        final = os.path.join(target_dir, name)
        stem, suffix = os.path.splitext(name)
        counter = 1
        while os.path.exists(final):
            final = os.path.join(target_dir, "%s_%d%s" % (stem, counter, suffix))
            counter += 1

        tmp = final + ".part"
        remaining = length
        with open(tmp, "wb") as fh:
            while remaining > 0:
                chunk = self.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                fh.write(chunk)
                remaining -= len(chunk)
        os.replace(tmp, final)
        self.send_json({"ok": True, "saved": os.path.basename(final), "size": length})


def serve(cfg):
    Handler.cfg = cfg
    port = int(cfg.get("port") or 8765)
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        # 端口已经被占用，通常说明管理台已经在跑了，直接打开它
        log("管理台已经在运行：http://127.0.0.1:%d" % port)
        try:
            subprocess.run(["open", "http://127.0.0.1:%d" % port], timeout=10)
        except Exception:
            pass
        return
    log("管理台已启动：http://127.0.0.1:%d" % port)
    log("内容目录：%s" % cfg["content"])
    log("按 Ctrl+C 停止")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        log("已停止")


# --------------------------------------------------------------------------
# 监听文件夹
# --------------------------------------------------------------------------

def snapshot(path):
    marks = []
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in files:
            if name.startswith("."):
                continue
            full = os.path.join(root, name)
            try:
                marks.append((full, os.path.getmtime(full), os.path.getsize(full)))
            except OSError:
                pass
    return marks


def watch(cfg, interval=8):
    log("开始监听 %s（每 %ds 检查一次）" % (cfg["content"], interval))
    last = repr(snapshot(cfg["content"]))
    build(cfg, quiet=True)
    while True:
        time.sleep(interval)
        now = repr(snapshot(cfg["content"]))
        if now != last:
            last = now
            log("检测到内容变化，重新生成…")
            try:
                if cfg.get("watchPublish"):
                    publish(cfg, "自动更新作品 " + time.strftime("%Y-%m-%d %H:%M"))
                else:
                    build(cfg, quiet=True)
            except Exception as exc:
                log("出错：%s" % exc)


# --------------------------------------------------------------------------
# 命令行
# --------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    cmd = args[0] if args else "serve"
    cfg = load_config()

    if cmd == "build":
        build(cfg)
    elif cmd == "serve":
        build(cfg, quiet=True)
        serve(cfg)
    elif cmd == "publish":
        publish(cfg, args[1] if len(args) > 1 else None)
    elif cmd == "watch":
        cfg["watchPublish"] = "--publish" in args
        watch(cfg)
    elif cmd == "init":
        os.makedirs(os.path.join(cfg["content"], "albums"), exist_ok=True)
        if not os.path.exists(os.path.join(cfg["content"], "_site.json")):
            write_json(os.path.join(cfg["content"], "_site.json"), DEFAULT_SITE)
        save_config(cfg)
        print("初始化完成：\n  内容目录 %s\n  网站目录 %s" % (cfg["content"], cfg["web"]))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
