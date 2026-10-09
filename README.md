# TEKUMA 塔科玛 · 官网门户 (v2)

线上地址 / Live: **https://yuechencui.github.io/tekuma-web/**

纯静态网站：HTML + CSS + 原生 JavaScript，**无需构建、无需任何 API Key**，托管在 GitHub Pages。
所有第三方库、字体、地图瓦片与字形都放在仓库里，访问时**不请求任何外部 CDN / Google / Mapbox**（中国大陆可正常访问）。

---

## 1. 目录结构

```
index.html               首页：P1 主视觉 / P2 项目地图 / P3 关于与服务
project.html             项目详情页模板（project.html?id=项目id）
css/style.css            全站样式（顶部 :root：颜色、字号阶梯、边距等设计变量）
js/i18n.js               ★ 全站中英文文案
js/common.js             ★ 站点设置：服务类别、地图区域、年份列表；语言切换
js/home.js               渲染 P3 四个服务栏
js/map.js                项目地图（MapLibre GL + 自托管矢量瓦片 + DataV 中国边界）
js/project.js            渲染项目详情页
data/projects.json       ★ 项目清单（地图点位 + 详情页内容）
data/tiles/*.pmtiles     自托管矢量底图（Protomaps / OpenStreetMap）
data/geo/overlay.json    中国国界、省界、九段线 + 区域范围（DataV）
assets/fonts/            Instrument Sans + 思源黑体（Noto Sans SC）子集，含 OFL 许可
assets/glyphs/           地图标注字形（Noto Sans，OFL）
vendor/                  maplibre-gl、pmtiles（本地化，含许可证）
scripts/serve.py         本地预览服务器（支持 Range 请求）
scripts/subset-fonts.py  ★ 重新生成字体子集（改了中文文案后运行）
scripts/build-tiles.sh   重新生成底图瓦片
scripts/filter_tiles.py  瓦片精简（build-tiles.sh 调用）
scripts/build-geo.sh     重新下载 DataV 边界并生成 overlay.json（调用 build-overlay.js）
```

## 2. 本地预览

地图瓦片通过 HTTP Range 请求读取，`python3 -m http.server` 不支持，请用仓库自带的服务器：

```bash
python3 scripts/serve.py          # 然后打开 http://localhost:8000
```

## 3. 添加 / 修改项目（最常用）

编辑 `data/projects.json`，在 `"projects": [ ... ]` 里复制一个对象并修改：

```json
{
  "id": "beijing-haidian-2023",
  "name_zh": "海淀某片区城市更新", "name_en": "Haidian Urban Renewal",
  "city_zh": "北京 · 海淀",        "city_en": "Beijing · Haidian",
  "country": "CN", "country_zh": "中国", "country_en": "China",
  "lng": 116.30, "lat": 39.98,
  "year": 2023,
  "regions": ["china", "jjj"],
  "service": "strategy",
  "summary_zh": "一句话简介……", "summary_en": "One-line summary…",
  "body_zh": ["正文第一段", "正文第二段"], "body_en": ["Paragraph one", "Paragraph two"],
  "cover": "assets/projects/beijing-haidian-2023/cover.jpg",
  "gallery": ["assets/projects/beijing-haidian-2023/01.jpg"]
}
```

| 字段 | 说明 |
|---|---|
| `id` | 唯一标识；详情页 `project.html?id=<id>`。正式数据沿用 Kit 目录编号（如 `23-07`；重复编号加 a/b，如 `22-04a`/`22-04b`） |
| `lng` / `lat` | 经纬度（WGS84 小数）。同一城市的项目请使用各自真实位置——**相距 ≥1 km** 时，放大到城市级别就会各自分开显示。坐标相同（<60 m，如一期/二期同一地块）的项目，地图会自动把它们画成相距约 500 m 的一小圈，各自可点；数据仍保留真实坐标 |
| `city_zh` / `city_en` | 写成 `北京 · 海淀` / `Beijing · Haidian`。点 `·` 前的部分是**城市**：同城多个项目在缩小时合并为一个“北京 10”标注，点击即放大到该城市并展开（城市不是筛选项，不需要任何额外设置） |
| `year` | 需在 `js/common.js` 的 `years` 列表中才会出现在筛选里 |
| `regions` | `china`、`jjj`（京津冀）、`yrd`（长三角）、`gba`（粤港澳）。全球视图包含所有项目，无需写 `global` |
| `service` | `strategy` / `design` / `innovation` / `incubation`，或留空 `""`（留空时卡片与详情页不显示服务一栏） |
| `summary_*` / `body_*` | 详情页简介与正文；留空时详情页只显示封面占位、项目信息与上一/下一项目，不留空白区块 |
| `country` | 国家代码；全球视图中同一国家 ≥3 个项目时合并为一个标注（如“中国 28”） |
| `cover` / `gallery` | 图片路径；留空 `""` 时显示占位图 |
| `layers` | 可选：详情页点击叠层图（有序路径数组，≥2 张）。有 `layers` 时用叠层查看器代替 `cover`/`gallery` |
| `example` | 可选：`true` 时显示“示例数据”提示（正式数据中不使用） |

> 目前为 Kit 提供的真实项目目录（`brief/projects.xlsx` 及 Kit 后续增删，159 个地图点位）。点位核对过程与依据见仓库外的 `data-work/` 与《TEKUMA项目点位核对表.xlsx》；简介、正文、服务类别与图片待补充。

**北京、深圳以外的城市**：底图在 z9 以上（城市级）只为北京、深圳准备了精细瓦片，其他城市放大后仍可见海岸线、水系、高速公路，但街道较少。需要时见第 7 节添加城市瓦片。

## 4. 修改文字 → 重新生成中文字体子集

所有界面文字在 `js/i18n.js`（`zh` / `en` 键名一一对应）。项目名称/简介在 `data/projects.json`。

中文字体只包含网站实际用到的约 400 个汉字（每个字重约 60 KB）。**修改或新增中文后请运行：**

```bash
pip install fonttools brotli
python3 scripts/subset-fonts.py
```

脚本会扫描 `*.html`、`js/*.js`、`data/projects.json` 中的全部汉字，重新生成 `assets/fonts/NotoSansSC-400/500.woff2` 和英文 `InstrumentSans-latin.woff2`（源字体首次自动下载到 `assets/fonts/src/`，已 git-ignore）。若忘记运行，缺失的字会以系统字体（苹方/微软雅黑）显示，不会出现方框。

- 默认中文；右上角 EN / 中文 切换并记住选择。`?lang=en` 直接打开英文版。

## 5. 设计系统

- **字体**：英文 *Instrument Sans*（可变字体，wght 400–700、wdth 75–100，SIL OFL）——当代瑞士/新怪诞风格，字形紧凑有个性，适合大字号标题，小字号依然清晰，带等宽数字（年份使用 tabular numerals）。中文 *思源黑体 / Noto Sans SC*（Adobe & Google，SIL OFL）400/500 两个字重，与 Instrument Sans 的笔画灰度和 x 高度匹配。
- **字号阶梯**（`:root`）：`--t-display`（主标题，紧字距 −0.035em）→ `--t-h2` → `--t-lead` → `--t-body` → `--t-ui` → `--t-label`（小号大写标签，字距 +0.18em）。中文正文行高约 1.95–2.05、字距 +0.04em；英文行高 1.5–1.65。
- **网格**：一个外边距 `--m`（20–80px，随宽度变化），所有页面（导航、地图界面、关于、服务、详情页、页脚）左右对齐到同一边距；P3 与详情页共用 4 栏网格。
- **颜色**：品牌红 `--red: #E84728`；红底上的白色文字用不透明度分级（`--on-red`、`--on-red-2`、`--on-red-3`）与白色发丝线分隔。

## 6. 地图

- **引擎**：MapLibre GL JS 5（BSD-3，开源 Mapbox GL 分支，本地 `vendor/`），平滑拖拽、惯性、双指缩放。
- **底图**：Protomaps 基础图（OpenStreetMap 数据，ODbL），以 PMTiles 单文件放在 `data/tiles/`，浏览器按 Range 请求只取需要的瓦片：
  | 文件 | 范围 | 级别 | 大小 |
  |---|---|---|---|
  | `world.pmtiles` | 全球 | z0–6 | ≈13.7 MB |
  | `east.pmtiles` | 中国东部（102–125°E, 18–42.5°N） | z7–9 | ≈13.3 MB |
  | `bj.pmtiles` | 北京 | z9–13 | ≈9.2 MB |
  | `sz.pmtiles` | 深圳 / 香港 | z9–13 | ≈7.2 MB |
  
  访问者只下载视野内的瓦片（全球视图约 0.1–0.3 MB；地图引擎与数据在滚动到地图附近时才加载，首屏只需 HTML/CSS/字体约 180 KB）。
- **样式**（`js/map.js` 顶部 `C`）：浅色单色，类似 OMA 项目地图——灰色水面、近白陆地、灰色道路细线，放大后逐级出现道路与地名（中文界面显示中文地名）。
- **中国边界**：瓦片中的行政边界在 `filter_tiles.py` 中**全部删除**，国界、省界、九段线只使用阿里云 DataV.GeoAtlas 数据（含台湾、藏南、阿克赛钦）。
- **手势**：桌面滚轮不会劫持页面滚动——按住 Ctrl（Mac 为 ⌘）滚动才缩放（右下有提示）；手机/平板单指滚动页面、双指拖动和缩放地图（MapLibre cooperative gestures）。+ / − 按钮可直接缩放。
- **筛选**：区域（全球/中国/京津冀/长三角/粤港澳）与年份；区域按钮让镜头飞到该区域，留白根据实际界面元素计算。
- **聚合**：屏幕距离聚合；点击任何聚合标注都会放大展开；北京、深圳等同城项目缩小时合并为一个城市标注。

## 7. 重新生成底图（可选）

```bash
# 需要 pmtiles 命令行 (https://github.com/protomaps/go-pmtiles/releases) 与 pip install pmtiles
bash scripts/build-tiles.sh
```

脚本从 Protomaps 每日构建远程读取所需范围（不下载整个星球文件），再用 `filter_tiles.py` 只保留陆地、水面、少量道路、公园与城市名，并删除所有行政边界。
**添加一个城市的精细瓦片**（例如上海）：在 `build-tiles.sh` 末尾仿照 `bj` 加一行（填经纬度范围），运行后在 `js/map.js` 的 `TILES` 中加一项。单文件请保持 < 100 MB（GitHub 限制），整个站点 < 1 GB。

中国边界数据：`bash scripts/build-geo.sh`（需要 Node.js）。

## 8. 发布

```bash
git add -A && git commit -m "Add project: xxx" && git push
```

推送到 `main` 后 GitHub Pages 自动更新（约 1–2 分钟）。

## 9. 合规与第三方资源

- 地图数据 © OpenStreetMap 贡献者（ODbL）· Protomaps · 阿里云 DataV.GeoAtlas。页面右下角已标注。
- 提示：在中国境内公开展示地图，严格意义上需要标准地图或审图号。若网站面向国内正式宣传使用，建议确认合规要求，必要时改用自然资源部标准地图服务的底图。
- MapLibre GL JS（BSD-3）· PMTiles JS（BSD-3）· Instrument Sans（OFL）· Noto Sans SC / 思源黑体（OFL）· Noto Sans 地图字形（OFL）。许可证文件随文件一同放在 `vendor/`、`assets/fonts/`、`assets/glyphs/`。

---

## English (short)

Static site (HTML/CSS/vanilla JS, no build step, no API keys) on GitHub Pages. Everything — libraries, fonts, vector tiles, map glyphs — is self-hosted; nothing loads from third-party hosts at runtime (works in mainland China).

- **Preview:** `python3 scripts/serve.py` → http://localhost:8000 (needs HTTP Range support for `.pmtiles`).
- **Add a project:** copy an object in `data/projects.json`. Use `"city_en": "Beijing · Haidian"` style names; projects sharing the city part merge into one city marker (e.g. "Beijing 10") that zooms in and spreads out on click — cities are not filter items. Keep real coordinates (≥1 km apart separate at city zoom). `regions` ∈ `china, jjj, yrd, gba`; co-located projects (<60 m) are drawn on a small ring (~500 m apart) at runtime; `service`, `summary_*`, `body_*` may be empty and are then hidden.
- **Text:** `js/i18n.js`. After changing any Chinese text run `python3 scripts/subset-fonts.py` (needs `fonttools brotli`) to regenerate the font subsets.
- **Map:** MapLibre GL JS + self-hosted Protomaps PMTiles (world z0–6, east China z7–9, Beijing & Shenzhen z9–13; ≈43 MB total, fetched by range request). Tile-source admin boundaries are removed; China's boundary, provinces and nine-dash line come from Alibaba DataV. Cooperative gestures: Ctrl/⌘ + scroll on desktop, two fingers on touch. Rebuild tiles with `scripts/build-tiles.sh`, boundaries with `scripts/build-geo.sh`.
- **Fonts:** Instrument Sans (OFL) + Noto Sans SC (OFL), subset and self-hosted.
- **Deploy:** push to `main`.
