# dsh-thinking-quips

[English](README.md) · [中文](README.zh.md)

`v0.5.4` · **DSH bundle**（装上即用）· Web 客户端插件

**给 DeepSeek Harness 状态行做的轻量个性化。** 把运行中状态行（DSH 默认的 `Deep diving...` 微光）
换成可轮换的中英俏皮话，在文字左侧加一个**动态加载图标**（6 种样式、3 档尺寸），
颜色可以手动挑，也可以**一键匹配当前主题**。

刻意的"小"：**零依赖、无构建、不写配置文件、不发网络请求** —— 一个手写的客户端文件，
设置存在 `localStorage`，**不修改任何 DSH 自带包**。

![运行状态行：点阵加载图标 + 一条俏皮话](assets/screenshot-1.png)

## 功能

1. **6 种动态加载图标**，都位于运行状态文字左侧，都支持 **小 / 中 / 大** 三档尺寸
   （默认 **点阵环游** + **中**）：

   | 样式 | 效果 |
   | --- | --- |
   | **点阵环游**（默认） | 3×3 点阵，**外圈 8 个点顺时针依次点亮并带尾迹衰减**，**中心点留空** |
   | **圆环旋转** | 真正的 SVG 圆：淡色整圈底环 + 圆头亮弧扫过 |
   | **形变环游** | 同一个轮廓依次变成 圆 → 圆角三角形 → 圆角方形 → 圆（**三个形状共用同一个中心，原地变形**），配合**带迟滞感**的缓动旋转，每个形状都"落定"一下 |
   | **呼吸脉冲** | 单点一呼一吸 |
   | **三点跳动** | 三个点依次弹跳 |
   | **柱状律动** | 三根柱子从基线上下律动 |

   所有样式都跟随所选的**字体颜色**（默认品牌蓝）。
2. **俏皮话轮播**，在设置里的文本框中按语言分段，由一组 **语言** 控件决定显示哪一段：
   **跟随界面**（中文界面→中文段；非中文界面→英文段）、**仅英文**、**仅中文**、**混合**（两段都显示）。
3. **每条显示时间** —— 数字输入（默认 **8 秒**），控制每条俏皮话停留多久。
4. **发光强度** —— 数字输入（0–100%，默认 **35%**），控制扫过高光的亮度。
5. **字体颜色** —— 实时预览色块，加 **HEX** 与 **RGB** 输入，以及**原生颜色轮盘**
   （`<input type="color">`）。默认是 DeepSeek 品牌蓝微光。
6. **匹配主题色** —— 一个按钮从**实时 DOM** 读取当前主题的强调色（`--dsw-alias-link`，
   也就是 DSH 自己的浅色/深色强调色，第三方主题的 token 也会一并生效），保留色相、
   只把明度调整到**与当前背景对比度 ≥ 4.5:1**。匹配后颜色会**持续跟随**主题切换
   （浅色 ↔ 深色、或换主题），直到你按 **取消跟随** 或手动改一次颜色；按钮下方会写明读到了什么、
   适配成了什么：`#4176e6 → #3970e5 · 对比度 4.5:1 · 浅色`。只要有自定义颜色在生效，
   就会出现 **恢复默认品牌蓝** 按钮。
7. **设置俏皮话** —— 一个小弹窗，内含一个可编辑文本框，用 `#` 语言分段，底部是保存按钮：

   ```
   # Chinese
   一条中文俏皮话
   又一条中文俏皮话
   # English
   an English quip
   another English quip
   ```

   每行一条（段内也支持用 `;` 分隔）。第一个 `#` 标题**之前**的行在**任何模式下都显示**。
8. **只显示加载图标模式** —— 只注入图标、**不动状态文字**，因此可与其他修改状态文字的插件共存，而不是互相覆盖。

![六种加载图标，以及轮播出厂俏皮话的状态行](assets/preview-gallery.png)

以上全部位于 **设置 → 通用设置 → 俏皮话**。

> **要求 DSH >= 0.1.2-rc.1**（Web 界面）。配置存在 `localStorage`——**没有配置文件、不发网络请求、不写文件**；
> 尊重 `prefers-reduced-motion`；定位状态元素优先用稳定的类名 token。

> 那个文本框就是**俏皮话的唯一数据源**：它默认已预填 `# Chinese` / `# English` 两段，
> 因此没有另一份硬编码的默认列表。改动会持久保存；**恢复默认**可还原出厂列表。

设置界面本身是双语的，并**跟随 Web 界面语言**——本页是中文标签；英文界面下的标签见
[English README](README.md)。

## 工作原理

回合运行期间，`dsh-client-ui-conversation` 会在聊天底部渲染一个 `TurnStatus` 元素
（`role="status"`，类名含 `...turnStatus`）。该元素是**硬编码的、不是可插槽**，所以本插件从外部挂钩：
用 `MutationObserver` 在它被提交的瞬间就接管（因此不会闪出 `Deep diving...`），用轻量轮询维持文字轮换，
并且**只替换最前面的文本节点**——右侧的计时 span 原样不动。

配置持久化在 `localStorage`（key 为 `dsh-thinking-quips.config`），并镜像到一个极简响应式 store，
使轮播、颜色覆盖与设置行保持同步。选择自定义颜色时，插件注入一个 `<style>`，**只替换微光渐变的
`background-image`**——DSH 自带的流光动画与文字裁切保持不变。

**匹配主题色**不是猜的，是真的去读主题：DSH 的 layout presenter 会把每个主题 token 作为
**内联自定义属性写到 `<body>`** 上（并切换 `body[data-ds-dark-theme]`），所以按钮直接从
**它自己**的计算样式里取 `--dsw-alias-link`（依次回退到 `--dsw-alias-state-business-primary`
与 `--dsw-static-deepseek-*` 色阶），背景取 `--dsw-alias-bg-base`。另有一个
`MutationObserver` 盯着 body 的这两个属性：只要还处于「跟随」状态，换主题就会自动重算。
全部读自 DOM——**不 import 任何 DSH 包，也不依赖主题服务**。

## 文件结构

```
dsh-thinking-quips/
├── package.json         # dsh.bundle（patch）+ dsh.client + exports["./client"]
├── cordis.patch.yml     # bundle patch：把自己注册进浏览器 roster
├── lib/
│   ├── client.js        # 浏览器半边：轮播 + 加载图标 + 设置行 + 弹窗
│   └── index.js         # 节点半边：空 apply（让 loader 能挂载该行）
├── assets/screenshot-1.png
├── screenshots.json     # 供市场读取的截图清单（仅仓库）
└── test/                # 仅开发用的冒烟测试（不进发布包）
    ├── test-load.mjs      # 工厂/apply/颜色覆盖/轮播/清理
    ├── test-sections.mjs  # 分段解析与语言选择
    ├── test-loaders.mjs   # 6 种加载图标（DOM + CSS）
    ├── test-morph.mjs     # 形变环游的几何与运动质量
    ├── test-theme.mjs     # 主题色提取 + 对比度适配
    ├── test-settings-ui.mjs # 设置行在各状态下显示哪些按钮
    └── test-i18n.mjs      # 中英字典对齐
```

## 安装（bundle —— 装上即用）

`dsh-thinking-quips` 是一个 DSH **bundle**：它自带的 `cordis.patch.yml` 会注册那行客户端 roster，
因此唯一需要手动做的，就是把它列进 profile 的 `dsh.profile.bundles`。

1. 把包装进目标 profile 的依赖（来自 GitHub 本仓库，或 npm registry）：
   ```sh
   # 来自 GitHub（git 依赖）
   dsh plugin --profile web add github:Saknutella/dsh-thinking-quips

   # 或来自 registry
   dsh plugin --profile web add dsh-thinking-quips
   ```
2. 加进 `$DSH_HOME/profiles/web/package.json` 的 `dsh.profile.bundles`：
   ```json
   "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-thinking-quips"] } }
   ```
3. 重启：
   ```sh
   dsh web
   ```

> 就这样：bundle 的 patch 会把 `{id: thinking-quips, name: 'dsh-thinking-quips'}`
> 插进浏览器 roster；由于该包声明了 `dsh.client`，Web UI 会提供
> `/plugins/dsh-thinking-quips/client.js` 并由浏览器加载。**无需手改 `cordis.patch.yml`**。

## 卸载

从 `dsh.profile.bundles` 中移除 `dsh-thinking-quips`，然后执行
`dsh plugin --profile web remove dsh-thinking-quips`，最后重启 `dsh web`。

## 使用

打开 **设置 → 通用设置**，找到 **俏皮话**：

- **字体颜色** —— 点色块或颜色轮盘；也可直接输入 `#RRGGBB` 或 RGB 数值。运行状态微光会实时换色。
- **匹配主题色** —— 输入框右边那个按钮：读取当前主题的强调色、按背景适配后直接应用；
  下方一行会写明 `读到的色 → 适配后的色 · 对比度 N:1 · 浅色|深色`。生效期间按钮显示
  **跟随主题中**，颜色会随主题切换自动重算。
- **取消跟随** —— 只在跟随时出现，按它就保留当前颜色、但不再跟着主题变；直接动轮盘/HEX/RGB
  也是同样效果，所以跟随状态不会把你困住。
- **恢复默认品牌蓝** —— 只在设置了自定义颜色之后才出现，按它回到 DSH 自己那份未经改动的微光
  （插件的颜色覆盖会被整个撤掉）。
- **每条显示时间** —— 每条停留的秒数（默认 8）。
- **发光强度** —— 0–100%（默认 35）。在品牌蓝且发光为 35 时，原始微光**完全不动**；
  调整发光（或选了自定义颜色）后，按该颜色套用可控的高光。
- **语言** —— 一组四选一：**跟随界面**、**仅英文**、**仅中文**、**混合**。决定俏皮话列表里显示哪一段。
- **加载图标** —— 并排两个下拉框：**样式**（点阵环游 / 圆环旋转 / 形变环游 / 呼吸脉冲 / 三点跳动 / 柱状律动）
  与**尺寸**（小 / 中 / 大）。改动会在 1 秒内应用到正在运行的状态行。
- **只显示加载图标** —— 只注入加载图标、**不替换状态文字**，这样可与其他修改状态文字的插件共存，而不是互相覆盖。
- **设置俏皮话** —— 打开弹窗；**保存** 把文本框内容写回配置。
- **恢复默认** —— 还原出厂默认值。

## 调参

默认值都在 `lib/client.js`：

- `DEFAULT_QUIPS` —— 出厂俏皮话列表（已按 `# Chinese` / `# English` 分好段）。
- `LOADER_STYLES` —— 加载图标下拉框的顺序（`orbit`、`ring`、`pulse`、`dots`、`bars`、`morph`）；
  `LOADER_SCALES` —— `sm`/`md`/`lg` 三档缩放系数（`0.8` / `1` / `1.25`）。
- `MORPH_*` —— 形变环游：`MORPH_ORDER`（圆 → 三角 → 方）、`MORPH_CHAMFER`（每个角切掉多少 = 圆角程度）、
  `MORPH_RADIUS`、`MORPH_SAMPLES`、`MORPH_CYCLE_MS`（3.3 秒，每个形状约 1 秒）。
- `DEFAULT_BLUE`（默认 `#2E5BE8`）—— 颜色轮盘的起始颜色。
- `THEME_COLOR_TOKENS` —— 「匹配主题色」依次尝试的强调色候选（`--dsw-alias-link`、
  `--dsw-alias-state-business-primary`、`--dsw-static-deepseek-500`、`--dsw-static-deepseek-450`）；
  `THEME_BG_TOKENS` —— 背景候选；`MIN_CONTRAST`（默认 `4.5`）—— 适配后必须达到的对比度。
- `POLL_MS`（默认 `600`）—— 状态文字重新断言的间隔。
- `quipMs` / `glow` / `loader` / `loaderSize` / `colorTheme` —— 每条显示时长、发光强度、
  图标默认值与「是否跟随主题」（属于每个用户自己的配置，见 `DEFAULTS`）。

## 说明与限制

- 插件是**纯加法**：一个新包 + `dsh.profile.bundles` 里一行，**不碰任何 DSH 文件**。
  卸载后即回到原生 DSH。
- 定位状态元素优先用稳定的 `turnStatus` 类名 token，其次回退到默认文案——`Deep diving...` / 「深度求索中...」
  （DSH 从 `chat.deepDiving` 这个 i18n 键渲染）。若未来 DSH 把两者都改名，插件会**静默失效**，从不抛错、也不会弄坏 shell。
- 颜色覆盖只替换微光渐变的颜色；流光动画与文字裁切来自 DSH 自带的 `.turnStatus` 规则。
- **匹配主题色**读的是**计算后**的自定义属性，所以内置主题或第三方主题实际画成什么色它就跟着走，
  而且**不 import 任何 DSH 包**。如果候选 token 一个都取不到（少见的构建方式，或主题把整套 token 换掉了），
  它会退回「按品牌蓝适配」并在界面上说明，而不是直接失败。
- 配置（俏皮话、颜色、发光、时长）保存在**每个浏览器 profile 的 `localStorage`** 里，
  不写进 DSH 的设置文档。
- 依赖 DSH 的 Web 界面（即 profile 里带 `@deepseek-ai/dsh-web-app`）与 React 18（DSH 自带）。
- **要求 DSH >= 0.1.2-rc.1**；已在 `0.1.5-rc.2` 上验证（该版本里运行状态行位于 `dsh-client-ui-chat`）。
