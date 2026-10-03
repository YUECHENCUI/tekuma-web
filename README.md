# TEKUMA 塔科玛 · 官网门户 (v1)

线上地址 / Live: **https://yuechencui.github.io/tekuma-web/**

纯静态网站：HTML + CSS + 原生 JavaScript，**无需构建、无需任何 API Key**，直接托管在 GitHub Pages。
所有第三方库、字体与地图数据都已放在仓库里，访问时不依赖外部 CDN（中国大陆可正常访问）。

---

## 1. 目录结构

```
index.html            首页：P1 主视觉 / P2 项目地图 / P3 服务介绍
project.html          项目详情页模板（project.html?id=项目id）
css/style.css         全站样式（顶部 :root 里是颜色、字体等设计变量）
js/i18n.js            ★ 全站中英文文案（只改这一个文件即可修改文字/翻译）
js/common.js          ★ 站点设置：服务类别、地图区域、年份列表；语言切换；颗粒渐变效果
js/home.js            渲染 P3 四个服务栏
js/map.js             项目地图（D3 + TopoJSON；底图 canvas，标注 svg）
js/project.js         渲染项目详情页
data/projects.json    ★ 项目清单（地图点位 + 详情页内容都来自这里）
data/geo/             地图数据（已内置，一般不用动）
assets/fonts/         Inter 字体（英文，已子集化）
assets/img/           图标
assets/projects/      （建议）项目图片放这里：assets/projects/<项目id>/cover.jpg
vendor/               d3、topojson-client（本地化，不走 CDN）
scripts/build-geo.sh  重新生成 data/geo（仅在更换地图数据源时需要）
```

## 2. 本地预览

浏览器直接双击打开 html 无法读取 JSON，请在仓库目录启动一个本地服务器：

```bash
python3 -m http.server 8000
# 然后打开 http://localhost:8000
```

## 3. 添加 / 修改项目（最常用）

编辑 `data/projects.json`，在 `"projects": [ ... ]` 里复制一个对象并修改：

```json
{
  "id": "xiongan-2024",
  "name_zh": "雄安某片区城市设计",
  "name_en": "Xiong'an District Urban Design",
  "city_zh": "雄安新区",          "city_en": "Xiong'an",
  "country": "CN", "country_zh": "中国", "country_en": "China",
  "lng": 115.98, "lat": 39.04,
  "year": 2024,
  "regions": ["china", "jjj"],
  "service": "strategy",
  "summary_zh": "一句话简介……",   "summary_en": "One-line summary…",
  "body_zh": ["正文第一段", "正文第二段"],
  "body_en": ["Paragraph one", "Paragraph two"],
  "cover": "assets/projects/xiongan-2024/cover.jpg",
  "gallery": ["assets/projects/xiongan-2024/01.jpg"]
}
```

| 字段 | 说明 |
|---|---|
| `id` | 唯一标识，只用小写字母/数字/连字符；详情页地址为 `project.html?id=<id>` |
| `lng` / `lat` | 经度 / 纬度（可在地图软件中右键获取坐标，填小数） |
| `year` | 年份数字；需在 `js/common.js` 的 `years` 列表中才会出现在筛选里 |
| `regions` | 地图区域标签：`china`、`jjj`（京津冀）、`yrd`（长三角）、`gba`（大湾区）。全球视图默认包含所有项目，无需写 `global`；北京、天津、河北的项目请写 `china`、`jjj` |
| `service` | `strategy` 战略 / `design` 设计 / `innovation` 创新 / `incubation` 孵化。地图上所有项目使用统一的红点标注，服务类别只以文字显示在地图卡片和详情页中 |
| `country` | 国家代码。全球视图中同一国家项目 ≥3 个时会合并成一个标注（如“中国 16”） |
| `city_zh` | 可写成 `北京 · 海淀` 形式，地图上会显示“北京”或“海淀” |
| `cover` / `gallery` | 图片路径；留空 `""` 时详情页显示占位图 |
| `example` | 示例数据标记。**正式项目请删除这一行**；当所有项目都没有 `example` 时，地图左下角的“示例数据”提示会自动消失 |

> 目前的 20 个项目全部是**示例数据**（名称为“示例项目 · 城市”），请替换为真实项目后删除。

## 4. 修改文字与翻译

所有界面文字都在 `js/i18n.js`，中文在 `zh`、英文在 `en`，键名一一对应。
数组表示多行（桌面端每项一行）。项目名称/简介不在这里，而在 `data/projects.json`。

- 默认语言：中文；右上角 EN / 中文 即时切换，并记住选择（localStorage）。
- 链接中加 `?lang=en` 可直接打开英文版，例如 `https://yuechencui.github.io/tekuma-web/?lang=en`。

## 5. 修改设计 / 筛选项

- 颜色、字体、间距：`css/style.css` 顶部 `:root`（品牌红 `--red: #E84728`，取自 brief）。
- 服务类别（首页顺序）、区域列表、年份列表：`js/common.js` 顶部 `SITE`。
- 地图底图配色、世界地图中心经线、聚合距离：`js/map.js` 顶部 `STYLE` / `GLOBAL_CENTER` / `clusterPx()`。
- 想新增一个城市群（例如成渝）：在 `scripts/build-geo.sh` 的第 3 步加入对应省份 DataV 文件和标签，运行脚本，再在 `js/common.js` 的 `regions`、`js/i18n.js` 的 `map.region.xxx`、`js/map.js` 的 `DEPTH` 中各加一行。
- 响应式断点（`css/style.css` 顶部注释有完整说明）：桌面 ≥1100px 四列服务；iPad 竖屏（681–1099px）两列、筛选两行；手机（≤680px 或高度 ≤540px 的横屏手机）地图筛选收为折叠按钮、项目卡片为底部弹层、服务单列。`js/map.js` 中 `COMPACT_QUERY` 必须与 CSS 保持一致。
- 已测试设备：桌面 1280×720 至 3440×1440（含 21:9、5:4、MacBook）、iPad mini / 10 / Pro 11 / Pro 12.9 横竖屏、iPhone SE / 14 / 15 Pro Max、Android 360 / 412、手机横屏、Galaxy Fold。

## 6. 发布

```bash
git add -A
git commit -m "Add project: xxx"
git push
```

推送到 `main` 后 GitHub Pages 会自动更新（通常 1–2 分钟）。

## 7. 地图与合规说明

- 中国国界、省界与南海九段线使用阿里云 DataV.GeoAtlas 数据（`geo.datav.aliyun.com`，含台湾、藏南、阿克赛钦），已内置到 `data/geo/`。
- 世界底图只使用 Natural Earth 的**陆地轮廓（不含国界）**，中国范围以 DataV 轮廓覆盖绘制，因此不会出现与中国标准地图冲突的边界。
- 提示：在中国境内公开展示地图，严格意义上需要标准地图或审图号。若网站面向国内正式宣传使用，建议向法务/测绘主管部门确认，必要时改用自然资源部标准地图服务（http://bzdt.ch.mnr.gov.cn/）的底图。

## 8. 第三方资源

D3 v7（ISC）· topojson-client v3（ISC）· Inter 字体（SIL OFL，见 `assets/fonts/Inter-LICENSE.txt`）·
Natural Earth（公有领域，经 world-atlas 获取）· 阿里云 DataV.GeoAtlas。中文字体使用系统字体（苹方 / 微软雅黑 / 思源黑体）。

---

## English (short)

Static site (HTML/CSS/vanilla JS, no build step, no API keys) for TEKUMA, hosted on GitHub Pages.
All libraries, fonts and geodata are vendored — nothing loads from third-party hosts at runtime.

- **Preview:** `python3 -m http.server 8000` → http://localhost:8000
- **Add a project:** copy an object in `data/projects.json` (fields above). `regions` ∈ `china, jjj, yrd, gba` (old `?region=beijing` links fall back to `jjj`); `service` ∈ `strategy, design, innovation, incubation`. Remove `"example": true` from real projects. Detail page: `project.html?id=<id>`.
- **Edit text / translations:** `js/i18n.js` (all UI strings, `zh` + `en`). `?lang=en` opens English.
- **Settings:** services / regions / years in `js/common.js` (map markers are one uniform style; service appears as text in the card and project page); colours in `css/style.css` `:root`; map styling in `js/map.js`.
- **Responsive:** breakpoints documented at the top of `css/style.css` (desktop ≥1100px, tablet portrait 681–1099px, compact = width ≤680px or height ≤540px). Keep `COMPACT_QUERY` in `js/map.js` in sync with the CSS.
- **Deploy:** commit and push to `main`; Pages updates in ~1–2 min.
- **Map data:** China boundary from Alibaba DataV (official Chinese standard incl. Taiwan, South Tibet, Aksai Chin, nine-dash line); world layer is Natural Earth land only (no country borders). Rebuild with `scripts/build-geo.sh`.
