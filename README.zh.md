# dsh-thinking-quips

[English](README.md) · [中文](README.zh.md)

`v0.6.0` · **DSH bundle**（装上即用）· Web 客户端插件

**给 DeepSeek Harness 状态行做的轻量个性化** —— 就是智能体工作时会话里显示的那一行
（DSH 默认的 `Deep diving...`）。可轮换的中英俏皮话、六种加载图标 × 三档尺寸、
一键匹配主题色，全部集中在 **设置 → 通用设置 → 俏皮话**。

刻意的"增量"：零依赖、无构建、不写配置文件、不发网络请求。一个手写的客户端文件，
设置存在 `localStorage`，**不修改任何 DSH 自带包**。

![六种加载图标，以及轮播出厂俏皮话的状态行](assets/preview-gallery.png)

## 功能

- **六种加载图标** —— 点阵环游（默认）、圆环旋转、形变环游、呼吸脉冲、三点跳动、柱状律动，各有 **小 / 中 / 大** 三档。
- **俏皮话轮播** —— 自己维护的列表，每行一条，用 `# Chinese` / `# English` 分段，在一个小弹窗里编辑；
  **语言**控件决定显示哪一段（跟随界面 / 仅英文 / 仅中文 / 混合）。
- **字体颜色** —— 预览色块、HEX、RGB，或原生颜色轮盘。
- **匹配主题色** —— 一键把当前主题的强调色适配到可读对比度，并持续跟随主题切换，直到你手动停止。
- **文字特效** —— **扫光**（DSH 原版横向流光，默认）或 **波浪**：每个字（中文）/ 每个词（英文）从左到右依次向上跳一下。
- **动画速度** —— 一个倍率统一调节插件里所有动画：加载图标、形变环游、波浪、以及扫光本身。
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

**要求**：DSH ≥ 0.1.2-rc.1（Web 界面）。

**卸载**：从 `dsh.profile.bundles` 里移除，执行
`dsh plugin --profile web remove dsh-thinking-quips`，再重启 `dsh web`。
