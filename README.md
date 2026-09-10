# dsh-thinking-quips

`v0.1.0` · a **DSH bundle** (install-and-go) · web client plugin

A standalone **DeepSeek Harness client plugin** that rotates playful bilingual
status quips through the running-turn indicator — the little line the
conversation shows while the agent is working (the default `Deep diving...`
shimmer). Stock packages are **not** modified.

![Running status line: the dot-orbit loader with a Chinese quip](assets/screenshot-1.png)

It ships these features:

1. **A 3×3 dot-orbit loading icon** to the left of the running-turn text — the 8
   outer dots chase clockwise (each lights up then fades with a trailing tail),
   the center dot stays empty, colored to match the chosen font color / brand
   blue.
2. **A single language group** (`跟随界面 / 仅英文 / 仅中文 / 混合`) — one
   mutually-exclusive control for which language the quips use:
   - **跟随界面**: Chinese UI → Chinese quips; any non-Chinese UI → English.
   - **仅英文** / **仅中文**: force one language.
   - **混合**: mix English + Chinese.
   (Only applies when the custom quips list is empty.)
3. **Per-quip display time** — a number input (default **8s**) for how long each
   quip stays before rotating.
4. **发光强度 (glow strength)** — a number input (0–100%, default **35%**) for how
   bright the sweeping highlight is.
5. **Settings → General → "俏皮话"** with a **font-color** control: a live
   preview swatch plus **hex** and **RGB** inputs and a **native color wheel**
   (`<input type="color">`). Default is the DeepSeek brand-blue shimmer.
6. A **"设置俏皮话" (manage quips)** button that opens a small modal — a
   **single editable textarea** with `#` language sections and a **Save** button
   in the footer:
   ```
   # Chinese
   中文俏皮话一
   中文俏皮话二
   # English
   an English quip
   another English quip
   ```
   The **语言** group picks which section shows (Mixed→both sections, Chinese
   only→Chinese section, English only→English section, Follow UI→the UI
   language's section). Lines before the first `#` header always show.

   **The textarea is the single source of quips**: it ships pre-filled with the
   default `# Chinese` / `# English` lists, so the plugin reads quips from here
   (no separate hard-coded fallback). Edit them freely — they persist; `恢复默认`
   restores the shipped defaults.

> The running rotator reads `cfg.quipMs`; the sectioned `cfg.quips` is parsed on
> demand. `cfg.perLang` remains available as a second per-language fallback.

## How it works

While a turn runs, `dsh-client-ui-conversation` renders a `TurnStatus` element
(`role="status"`, class `...turnStatus`) at the bottom of the chat. That element
is **hardcoded — not a pluggable slot** — so this plugin hooks it from outside:
it finds the element and keeps swapping its leading text node to the current
quip, leaving the trailing clock span intact. A light poll re-asserts the text
after any React re-render.

Config is persisted to `localStorage` (`dsh-thinking-quips.config`) and mirrored
in a small reactive store, so the rotator, the color override, and the settings
row stay in sync. When a custom color is chosen, the plugin injects a `<style>`
override that replaces only the `background-image` of the `.turnStatus` shimmer
gradient (keeping the animated clip in the brand base rule intact).

## Files

```
dsh-thinking-quips/
├── package.json        # dsh.bundle (patch) + dsh.client + exports["./client"]
├── cordis.patch.yml    # bundle patch: registers this package as a client roster row
├── lib/
│   ├── client.js       # browser half: rotator + settings row + quips modal
│   └── index.js        # node half: no-op apply (needed so the loader mounts the row)
└── README.md
```

## Install (bundle — install and it just works)

`dsh-thinking-quips` is a DSH **bundle**: its own `cordis.patch.yml` registers the
client-roster row, so the only manual step is listing it in the profile's
`dsh.profile.bundles`.

1. Install the package into the target profile's deps — from GitHub (this repo) or npm:
   ```sh
   # from GitHub (git dependency)
   dsh plugin --profile web add github:<your-username>/dsh-thinking-quips

   # or from a registry
   dsh plugin --profile web add dsh-thinking-quips
   ```
2. Add it to `$DSH_HOME/profiles/web/package.json` → `dsh.profile.bundles`:
   ```json
   "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-thinking-quips"] } }
   ```
3. Restart:
   ```sh
   dsh web
   ```

> That's it: the bundle's patch inserts `{id: thinking-quips, name: 'dsh-thinking-quips'}`
> into the browser roster, and because the package declares `dsh.client`, the Web UI
> serves `/plugins/dsh-thinking-quips/client.js` and the browser loads it. No hand-editing
> of `cordis.patch.yml`.

**Uninstall**: remove `dsh-thinking-quips` from `dsh.profile.bundles`, then
`dsh plugin --profile web remove dsh-thinking-quips`, and restart.

## Usage

Open **Settings → General** (the gear). Under **俏皮话**:

- **字体颜色** — click the swatch or the color wheel; type a `#RRGGBB` hex or
  RGB values. The turn-status shimmer recolors in real time. `品牌蓝（默认）`
  restores the brand-blue shimmer.
- **每条显示时间** — number input (seconds, default 8) for how long each quip
  stays before rotating.
- **发光强度** — number input (0–100%, default 35) for how bright the sweeping
  highlight is. At the default blue with glow=35 the original brand shimmer is
  left untouched; changing glow (or picking a custom color) applies a
  controllable glow in that color.
- **语言** — one group of four mutually-exclusive choices: **跟随界面** (follow
  the UI language; non-Chinese → English), **仅英文**, **仅中文**, **混合**.
  This decides which section of the quips list shows.
- **设置俏皮话** — opens the modal: the textarea is **pre-filled with the
  default `# Chinese` / `# English` quips**. Edit freely (one quip per line;
  `;` also works within a section), then **保存**. The **语言** group picks
  which section shows; lines before the first `#` header always show. `恢复默认`
  restores the shipped defaults.

## Tune

Edit the constants at the top of `lib/client.js`:

- `PHRASES_EN` / `PHRASES_ZH` — the default phrase lists.
- `QUIP_MS` (default `3600`) — how long each quip stays.
- `POLL_MS` (default `600`) — how often the status text is re-asserted.
- `DEFAULT_BLUE` (default `#2E5BE8`) — the wheel start / default brand blue.

## Uninstall

1. Remove the `- id: thinking-quips` row from `$DSH_HOME/profiles/web/cordis.patch.yml`.
2. Delete the `dsh-thinking-quips` package (`dsh plugin --profile web remove dsh-thinking-quips`).
3. Restart `dsh web`.

## Notes / limits

- The color override only replaces the shimmer gradient colors; the animated
  shine and the text clip come from DSH's own `.turnStatus` rule.
- Custom quips and color persist in `localStorage` (per browser profile), not in
  the DSH settings document — simple and sync-free.
- The hook matches the status element by the stable `turnStatus` class token
  first, then falls back to the literal `Deep diving` text. If a future DSH build
  renames both, the plugin stops matching and does nothing (it never throws).
