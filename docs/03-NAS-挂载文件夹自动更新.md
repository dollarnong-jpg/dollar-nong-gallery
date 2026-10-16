# NAS 文件夹自动更新

目标：**照片丢进一个文件夹，网站自己更新。** 不用打开管理台，不用碰命令行。

## 三种方案，从易到难

| 方案 | 谁干活 | 适合 | 难度 |
| --- | --- | --- | --- |
| A. Mac 挂载 NAS 文件夹 | 你的 Mac | 想继续用管理台，但照片存在 NAS 上 | ★ |
| B. NAS 上跑定时任务 | NAS 自己 | 想完全脱离电脑，照片一放就更新 | ★★★ |
| C. NAS 上跑容器 | NAS 自己 | 想干净、可迁移、不污染群晖系统 | ★★★ |

建议先做 A，用顺了再上 B 或 C。

---

## 方案 A：Mac 挂载 NAS 文件夹

### 1. 把 NAS 共享文件夹挂到 Mac

Finder → 顶部菜单 **前往 → 连接服务器**（快捷键 `⌘K`）→ 输入：

```
smb://<你的NAS地址或主机名>
```

例如 `smb://192.168.1.10` 或 `smb://synology.local`。

选一个共享文件夹挂载，它会出现在 `/Volumes/` 下面。假设叫 `photo`，那路径就是：

```
/Volumes/photo
```

### 2. 在 NAS 上准备目录

在共享文件夹里建出这个结构：

```
/Volumes/photo/摄影站/content/
/Volumes/photo/摄影站/content/albums/
/Volumes/photo/摄影站/content/albums/01-人像/
/Volumes/photo/摄影站/content/albums/02-美食/
```

`content/albums/` 下面**每个文件夹就是一个相册**。文件夹名字前面加数字可以控制顺序，比如 `01-人像`、`02-美食`、`03-航拍`。

每个相册文件夹里可以放一个 `_album.json`，用来写标题和简介：

```json
{
  "slug": "portrait",
  "title": "人像",
  "subtitle": "PERSON",
  "description": "自然光下的人像记录。",
  "cover": "",
  "orderSort": 100,
  "hidden": false,
  "order": []
}
```

字段说明：

- `slug`：网址里用的短名，建议用英文；不填会按文件夹名自动生成
- `orderSort`：相册之间的排序，数字小的在前
- `cover`：封面用哪个文件名；留空就用第一张
- `hidden`：设成 `true` 就隐藏这个相册
- `order`：照片顺序，写文件名数组；留空就按文件名排

不写这个文件也能用，工具会自动生成一份。

### 3. 把管理台指向 NAS

双击 `tools/摄影站管理台.command` → 右上角「内容目录设置」→ "原图目录"填：

```
/Volumes/photo/摄影站/content
```

保存后**重启管理台**（关掉终端窗口再双击一次）生效。

之后在管理台里上传照片，原图就直接写进 NAS 了。

### 4. 也可以完全不用管理台

直接把照片用 Finder 拖进 `/Volumes/photo/摄影站/content/albums/01-人像/`，然后回管理台点一下「生成」。

### 5. 让 Mac 自动盯着这个文件夹

想连"点生成"都省掉：

```bash
cd "<项目目录>"
python3 tools/photosite.py watch
```

它每 8 秒检查一次，有新照片就自动重新生成。加上 `--publish` 就会连发布一起做：

```bash
python3 tools/photosite.py watch --publish
```

想开机自动跑，把上面这行做成一个 LaunchAgent，或者更省事的办法：把这个命令写进 `tools/摄影站管理台.command`，双击就启动监听。

> 注意：Mac 睡眠时不会执行。这是方案 A 的先天限制，所以照片多、更新频繁的话，建议直接上方案 B。

---

## 方案 B：完全在 NAS 上跑

群晖、威联通都行，思路一样。

### 1. 把项目放到 NAS 上

通过 File Station 或 SMB，把整个项目目录传到：

```
/volume1/photo/摄影站/
```

### 2. 装依赖

在 NAS 上需要两样东西：`python3` 和 `git`。

- **群晖 DSM 7**：套件中心搜 `Python3` 安装；`git` 通常在 **Container Manager** 以外的渠道，或者用 Entware 装（`opkg install git`）。部分机型套件中心自带。
- **威联通 QNAP**：App Center 里搜 `Python` 和 `Git`。

### 3. 换掉图片处理引擎

NAS 上没有 macOS 的 `sips`，要改成 ImageMagick。

先装 ImageMagick（群晖：`opkg install imagemagick`；QNAP：App Center 搜 ImageMagick / Entware）。

然后编辑 `tools/photosite.config.json`（第一次运行后才会生成，也可以手动建）：

```json
{
  "content": "/volume1/photo/摄影站/content",
  "web": "/volume1/photo/摄影站/web",
  "engine": "magick",
  "fullSize": 2048,
  "fullQuality": 82,
  "thumbSize": 900,
  "thumbQuality": 72,
  "gitRemote": "origin",
  "gitBranch": "main",
  "autoPush": true,
  "stripMetadata": true
}
```

`"engine": "magick"` 是关键，它会改用 ImageMagick 处理图片。

### 4. 手工跑一次

SSH 登录 NAS：

```bash
cd /volume1/photo/摄影站
python3 tools/photosite.py build
```

看到 `构建完成：N 个相册 / M 张照片` 就对了。

### 5. 配好 git 凭据

NAS 要能往 GitHub 推。推荐用 SSH 密钥：

```bash
ssh-keygen -t ed25519 -C "nas-photosite" -f ~/.ssh/photosite -N ""
cat ~/.ssh/photosite.pub
```

把输出的公钥贴到仓库 → **Settings → Deploy keys → Add deploy key**，**务必勾选 "Allow write access"**。

然后配置仓库用这个密钥：

```bash
cd /volume1/photo/摄影站
git config core.sshCommand "ssh -i ~/.ssh/photosite -o IdentitiesOnly=yes"
git remote set-url origin git@github.com:dollarnong-jpg/dollar-nong-gallery.git
```

用 token 也行，但 token 会过期，NAS 上不好更新，密钥更省心。

### 6. 挂定时任务

群晖：**控制面板 → 任务计划 → 新增 → 计划的任务 → 用户定义的脚本**

- 用户账号：选你自己（不要选 root）
- 计划：按需，比如"每天凌晨 3 点"或"每小时"
- 用户定义的脚本：

```bash
cd /volume1/photo/摄影站
/usr/local/bin/python3 tools/photosite.py build
/usr/local/bin/python3 tools/photosite.py publish "自动更新 $(date '+%Y-%m-%d %H:%M')"
```

威联通类似，在 App Center 或 Cron 里加：

```
*/30 * * * * cd /share/photo/摄影站 && python3 tools/photosite.py publish "自动更新"
```

### 7. 更好的做法：常驻监听

如果 NAS 一直开着，比定时任务更及时：

```bash
cd /volume1/photo/摄影站
python3 tools/photosite.py watch --publish
```

放进群晖的"触发的任务"，开机自动启动。照片一存进去，几秒后网站就更新了。

---

## 方案 C：NAS 上跑容器

适合群晖 Plus 系列（有 Container Manager）。

写一个 `Dockerfile`：

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      imagemagick git openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app
ENV PYTHONUNBUFFERED=1
CMD ["python3", "tools/photosite.py", "watch", "--publish"]
```

构建并运行：

```bash
cd /volume1/photo/摄影站
docker build -t photosite .
docker run -d --name photosite --restart unless-stopped \
  -v /volume1/photo/摄影站:/app \
  -v /volume1/homes/你的用户名/.ssh:/root/.ssh:ro \
  photosite
```

这样 NAS 系统本身一点都不会被改动，升级也简单。

---

## 让照片自动从相机到 NAS（可选）

如果想让整个流程再省一步：

- **群晖**：装 Synology Drive Client 或 Cloud Sync，把相机 SD 卡目录同步到 `content/albums/<相册名>/`
- **iPhone 拍完直接传**：装 DS file / Synology Photos，传进对应的相册文件夹
- **Lightroom 导出**：设置导出预设直接导出到挂载的 NAS 相册目录

配合方案 B 的 watch，从拍摄到网站上线的全过程你唯一要做的事就是**把照片存到那个文件夹**。

---

## 几个注意点

1. **原图不要进 git 仓库**。项目根目录的 `.gitignore` 已经排除了 `content/albums/` 下的图片，只保留 `_album.json`。别把这个规则删了。
2. **NAS 上的文件名尽量别用特殊符号**，`/ \ : * ? " < > |` 这些在 SMB 和 Linux 下都会出问题。
3. **大文件多的时候第一次构建会慢**。一张 50MB 的航拍图大概要 1 秒，一百张就是两分钟。之后再更新只有新增的照片会重新处理。
4. **不要在 NAS 上同时编辑同一个相册**，可能出现两个进程同时写 `_album.json`。管理台和 watch 二选一。
5. **公网访问管理台要谨慎**。管理台默认只监听 `127.0.0.1`，不要随手改成 `0.0.0.0` 暴露到公网，它没有登录验证。
