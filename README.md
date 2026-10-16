# DOLLAR NONG 摄影站

## 已经上线了

| | 网址 |
| --- | --- |
| **线上网站（公开）** | https://dollarnong-jpg.github.io/dollar-nong-gallery/ |
| **管理台（只在这台电脑上）** | http://127.0.0.1:8765 |
| 本机预览（只看网站） | http://127.0.0.1:8000 |

线上站点由 GitHub Pages 托管，仓库是 `dollarnong-jpg/dollar-nong-gallery` 的 `main` 分支。管理台里点一次「发布到线上」，GitHub 会自动重新构建、大约 1 分钟生效。GitHub 授权已经配置完成，不用再输入验证码或 token。

---

一套可以直接用的个人摄影网站方案：**静态站点 + 本机管理台 + NAS 文件夹更新**。

没有框架，没有 npm，不用装依赖。只用 macOS 自带的 `python3` 和 `sips`。

---

## 三个双击入口

| 双击这个 | 作用 | 网址 |
| --- | --- | --- |
| `打开管理台.command` | 启动管理台并自动打开浏览器 | http://127.0.0.1:8765 |
| `打开网站预览.command` | 只看网站本身 | http://127.0.0.1:8000 |
| `一键发布到 GitHub.command` | 建仓库 + 推送 + 开 Pages + 等上线 | 发布结束会打印网址 |

第一次打开可能被 macOS 拦一下（提示"无法验证开发者"）：**右键点它 → 打开 → 再点"打开"**，之后就不再问了。

管理台开着的时候，网站预览在 http://127.0.0.1:8765/preview/index.html

## 日常怎么更新作品

1. 双击 `打开管理台.command`
2. 浏览器里拖照片进去，改标题、排序、设封面
3. 点「发布到线上」，等大约 1 分钟，刷新线上网站就能看到

不需要再输任何验证码或 token——这台电脑上的 git 已经记住了授权，`一键发布到 GitHub.command` 只在「换电脑 / 换账号」时才需要用。

## 命令行方式

不想双击也可以：

```bash
cd "<这个目录>"
python3 tools/photosite.py serve        # 管理台
python3 tools/onepush.py                # 一键发布
python3 tools/onepush.py --dry-run      # 只看它打算做什么，不联网
```

## 目录结构

```
dollar-nong-photo/
├── 打开管理台.command              ← 双击：启动管理台
├── 打开网站预览.command             ← 双击：只看网站
├── 一键发布到 GitHub.command        ← 双击：建仓库 + 推送 + 上线
│
├── content/                      ← 你放照片的地方（可以指向 NAS）
│   ├── _site.json                站点名字、简介、联系方式
│   ├── albums/
│   │   ├── 01-人像/
│   │   │   ├── _album.json       相册信息（标题、简介、封面、排序）
│   │   │   └── *.jpg             原图
│   │   └── 02-美食/
│   └── .cache/                   构建缓存，可随时删
│
├── web/                          ← 生成出来的网站，只有这里会被发布
│   ├── index.html
│   ├── assets/site.css|site.js
│   ├── data/albums.json|albums.js
│   └── media/<相册>/             缩略图 + 大图
│
├── tools/
│   ├── photosite.py              核心引擎（构建 / 管理台 / 发布 / 监听）
│   ├── onepush.py                一键发布到 GitHub Pages
│   ├── admin/                    管理台界面
│   └── 摄影站管理台.command        双击启动（和根目录那个等价）
│
├── docs/
│   ├── 01-两个旧站点的评测与选型.md
│   ├── 02-上线部署手册.md
│   └── 03-NAS-挂载文件夹自动更新.md
│
└── .github/workflows/pages.yml   GitHub Pages 自动发布
```

**关键点：`content/` 里的原图永远不上传，`web/` 里的压缩副本才会进仓库。**

---

## 命令行速查

```bash
python3 tools/photosite.py build              # 扫描照片，生成网站
python3 tools/photosite.py serve              # 启动管理台
python3 tools/photosite.py publish "更新说明"   # 构建 + 提交 + 推送到 GitHub
python3 tools/photosite.py watch              # 盯着 content/，有变化就重建
python3 tools/photosite.py watch --publish    # 盯着 content/，有变化就重建并发布
python3 tools/photosite.py init               # 初始化目录结构
```

## 管理台能做什么

- 拖拽上传照片（原图写进 `content/`，网站只拿到压缩副本）
- 新建/删除相册，改标题、副标题、简介
- 拖动调整照片顺序，点 ★ 设置封面
- 改站点名字、简介、微信/电话/邮箱
- 「内容目录设置」把原图目录指向 NAS 挂载路径
- 「生成」本地出图，「发布到线上」自动 push

## 图片处理规则

| 用途 | 最长边 | 质量 | 典型体积 |
| --- | --- | --- | --- |
| 缩略图（网格用） | 900px | 72 | 30–80 KB |
| 大图（点击查看用） | 2048px | 82 | 150–450 KB |
| 占位图（内嵌） | 28px | 40 | 不到 1 KB |

每次构建会自动清除定位信息和拍摄信息（`GPS` / `allExif`）。这是一台公开的网站，原图里的拍摄地点不该跟着发出去。

尺寸可以在管理台的「内容目录设置」里改。

## 站点特性

- 深色杂志风格，中文衬线标题
- 首屏大图轮播，带缓慢推镜
- 相册卡片 → 相册详情 → 灯箱，三级浏览
- 灯箱支持键盘左右方向键、Esc、手机左右滑动、底部缩略图条
- 照片按原始比例做"刚好布局"排版，横竖混排不留空
- 先用模糊占位图撑着，大图加载完再淡入
- hash 路由，GitHub Pages 子路径部署不会 404
- 手机上单列自适应

## 上线记录与验证

- 2026-10-16 22:23 真实发布成功：代码已推到 `dollarnong-jpg/dollar-nong-gallery` 的 `main` 分支
- GitHub Actions「Deploy to GitHub Pages」构建通过，线上 `https://dollarnong-jpg.github.io/dollar-nong-gallery/` 返回 200
- 首页、样式、脚本、缩略图逐项验证：全部 200
- 线上数据里有 3 个相册：人像 8 张、美食 4 张、航拍 4 张（示例照片来自你原来的站，等你自己换掉）
- 引擎构建、44 项 HTTP 接口测试、20 项发布脚本测试、JS 语法检查都通过

**还没验证的**：这台机器上没法截图，浏览器里的实际视觉效果（配色、间距、动画）请你打开看一眼。有不满意的地方告诉我改。

## 下一步

1. 打开 https://dollarnong-jpg.github.io/dollar-nong-gallery/ 看视觉效果，要改配色、字号、栏目就告诉我
2. 把 `content/albums/` 里的示例照片换成你自己的（或用管理台拖进去）
3. 想让 NAS 上的照片文件夹自动同步，看 `docs/03-NAS-挂载文件夹自动更新.md`
