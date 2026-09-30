# dsh-thinking-quips

[English](README.md) · [中文](README.zh.md)

`v0.7.0` · **DSH bundle**（装上即用）· Web 客户端插件

**给 DeepSeek Harness 状态行做的轻量个性化** —— 就是智能体工作时会话里显示的那一行
（DSH 默认的 `Deep diving...`）。可轮换的中英俏皮话、六种加载图标 × 三档尺寸、
一键匹配主题色与可选的用时显示，全部集中在 **设置 → 通用设置 → 俏皮话**。

刻意的"增量"：零依赖、无构建、不写配置文件、不发网络请求。一个手写的客户端文件，
设置存在 `localStorage`，**不修改任何 DSH 自带包**。

![六种加载图标、轮播出厂俏皮话的状态行，以及扫光与波浪两种文字特效](assets/preview-gallery.png)

## 功能

- **六种加载图标** —— 点阵环游（默认）、圆环旋转、形变环游、呼吸脉冲、三点跳动、柱状律动，各有 **小 / 中 / 大** 三档。
- **俏皮话轮播** —— 自己维护的列表，每行一条，用 `# Chinese` / `# English` 分段，在一个小弹窗里编辑；
  **语言**控件决定显示哪一段（跟随界面 / 仅英文 / 仅中文 / 混合）。
- **字体颜色** —— 预览色块、HEX、RGB，或原生颜色轮盘。
- **匹配主题色** —— 一键把当前主题的强调色适配到可读对比度，并持续跟随主题切换，直到你手动停止。
- **文字特效** —— **扫光**（默认，渲染 DSH 官方的 `TextShimmer` 组件）、**波浪**（每个字/每个词依次向上跳一下）、
  以及 **流光（旧版）**，复刻 DSH 0.2 之前"文字自身被渐变照亮"的观感。
- **用时显示** —— **随文**把用时并进俏皮话一起参与动画（DSH 0.2 的形式），**旁注**用灰色小字单独显示、
  不参与文字动画（0.1 的形式），也可以 **关闭**。用时取 DSH 官方的回合起始时刻（`turn.start.time`），
  口径与官方 `formatRunDuration` 逐字一致。
- **动画速度** —— **慢 / 正常 / 快** 一键切换。「正常」就是默认速度、不覆盖任何东西；另外两档缩放插件自己的动画。
- **每条显示时间** 与 **发光强度**。
- **只显示加载图标** —— 只注入图标、不动状态文字，可与其他修改状态文字的插件共存。

## 安装

1. 把包装进 profile：
   ```sh
   dsh plugin --profile web add github:Saknutella/dsh-thinking-quips
   ```
2. 在 `$DSH_HOME/profiles/web/package.json` 的 `dsh.profile.bundles` 里加上它：
   ```json
   "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-thinking-quips"] } }
   ```
3. 重启 `dsh web`。

**要求**：DSH ≥ 0.2.0-rc.2（Web 界面）。0.2 的运行行是 `[data-chat-running]`，标签住在 DSH 的
`TextShimmer` 里；插件同时识别这种形状与旧的 `[class*="turnStatus"]`，所以 0.1.x 的老外壳也能跑。

**卸载**：从 `dsh.profile.bundles` 里移除，执行
`dsh plugin --profile web remove dsh-thinking-quips`，再重启 `dsh web`。
