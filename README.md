# DOLLAR NONG 摄影站

一套可以直接用的个人摄影网站方案：**静态站点 + 本机管理台 + NAS 文件夹更新**。

没有框架，没有 npm，不用装依赖。只用 macOS 自带的 `python3` 和 `sips`。

---

## 五分钟跑起来

```bash
cd "<这个目录>"
python3 tools/photosite.py build     # 生成网站
python3 tools/photosite.py serve     # 打开管理台
```

或者直接双击 `tools/摄影站管理台.command`。

浏览器打开 `http://127.0.0.1:8765`，左上角点「预览网站」看成品。

想只看网站不看管理台：

```bash
cd web && python3 -m http.server 8000
```

---

## 目录结构

```
dollar-nong-photo/
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
│   ├── admin/                    管理台界面
│   └── 摄影站管理台.command        双击启动
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

## 已验证的内容

在这台机器上实测通过：

- 引擎构建 3 个相册 / 16 张照片，无报错
- 全部 HTTP 接口 44 项检查通过（静态资源、上传、改名、排序、封面、删除、构建、日志）
- `site.js`、`admin.js` 用 JavaScriptCore 做过语法检查，并用 DOM 桩跑通初始化流程
- 无变化时增量重建约 2 秒；新增一张照片约 4 秒（不会重跑整册）

**没有验证的**：实际浏览器里的渲染效果。这台机器上没有 Chrome / Chromium，浏览器自动化通道被安全审批服务故障挡住了。所以配色、间距、动画这些视觉细节请你**打开预览亲眼确认一下**，有不满意的地方告诉我改。

## 下一步

1. 打开预览看视觉效果，把想改的地方告诉我（配色、字体大小、栏目）
2. 把 `content/albums/` 里的示例照片换成你自己的
3. 按照 `docs/02-上线部署手册.md` 推到 GitHub
4. 想接 NAS 就看 `docs/03-NAS-挂载文件夹自动更新.md`
