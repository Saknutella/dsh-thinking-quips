# dsh-thinking-quips

[English](README.md) · [中文](README.zh.md)

`v0.6.2` · a **DSH bundle** (install-and-go) · web client plugin

**Lightweight personalisation for the DeepSeek Harness status line** — the line the
conversation shows while the agent is working (DSH's default `Deep diving...`).
Rotating bilingual quips, six loading icons in three sizes, and one-click
theme-colour matching, all in **Settings → General → Playful quips**.

Incremental by design: no dependencies, no build step, no config file, no network
requests. One hand-written client file, settings in `localStorage`, and stock DSH
packages are **not** modified.

![Six loading icons, and status lines rotating through the shipped quips](assets/preview-gallery.png)

## Features

- **Six loading icons** — dot orbit (default), spinner ring, shape morph, pulse,
  bouncing dots, equalizer bars — each in **S / M / L**.
- **Rotating quips** — your own list, one per line, split into `# Chinese` /
  `# English` sections and edited in a small modal; the **Language** control picks
  which section shows (Follow UI, English only, Chinese only, or Mixed).
- **Font colour** — preview swatch, hex, RGB, or the native colour wheel.
- **Match theme** — one click fits the active theme's accent colour to a readable
  contrast, and keeps following theme switches until you stop it.
- **Text effect** — **Shimmer** (DSH's own sideways sweep, default) or **Wave**, which
  lifts each character (CJK) or each word (Latin) in turn, left to right.
- **Animation speed** — **Slow / Normal / Fast** in one click. Normal is the shipped
  pace and overrides nothing; the others step every animation (including DSH's shimmer)
  to half or double.
- **Time per quip** and **glow strength**.
- **Indicator only** — inject just the icon and leave the status text alone, so it
  can sit alongside another status-text plugin.

## Install

1. Add the package to the profile:
   ```sh
   dsh plugin --profile web add github:Saknutella/dsh-thinking-quips
   ```
2. Add it to `dsh.profile.bundles` in `$DSH_HOME/profiles/web/package.json`:
   ```json
   "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-thinking-quips"] } }
   ```
3. Restart `dsh web`.

**Requirements:** DSH ≥ 0.1.2-rc.1 (the web surface).

**Uninstall:** remove it from `dsh.profile.bundles`, run
`dsh plugin --profile web remove dsh-thinking-quips`, and restart `dsh web`.
