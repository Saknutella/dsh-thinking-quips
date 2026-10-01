# Roadmap

**Direction.** This plugin is **lightweight personalisation for the status line** —
the indicator in front of the turn-status text plus the text itself, with one
settings surface and nothing else. It stays deliberately small: no dependencies, no
build step, no config file, no network requests. It is not trying to be a phrase
engine — the text rotation is one feature, the indicator is the point. Everything
below serves that.

---

## 0.2.0 — Coexistence & quiet

- [x] **Indicator-only mode** — keep the loading icon, leave the status text
      untouched, so the plugin can sit alongside another status-text plugin instead
      of replacing it.
- [x] **Respect `prefers-reduced-motion`** — the indicator stops animating when the
      OS asks for reduced motion.
- [x] **Boot-time prefetch** (`dsh.client.immediately`) so the plugin is ready before
      the first status line appears.
- [x] **Declared requirements** — `>= 0.1.2-rc.1`, repository/homepage/bugs metadata,
      optional harness peer dependencies.
- [x] **Hardened status-line matching** — DSH 0.1.5 moved the status line into
      `dsh-client-ui-chat` and localized its label to the `chat.deepDiving` key. The
      primary class-token match was unaffected (plugin v0.1.0 already worked on DSH
      0.1.5); the label fallback now also covers the Chinese label, as insurance for
      the day the class token itself changes.

## 0.3.0 — Indicator options

The indicator is the differentiator, so make it a first-class, configurable element.

- [x] **Loader styles** — five, chosen in Settings: dot orbit (default), spinner
      ring, pulse, bouncing dots, equalizer bars. All share the configured font
      color and swap in place.
- [x] **Icon size** — small / medium / large (`0.8` / `1` / `1.25`), applied as a
      `--tq-loader-scale` transform so every style scales together.
- [ ] **Speed / gap** controls for the chosen style.
- [ ] **Phase-aware indicator** — calmer while the model is thinking, quicker while a
      tool is running, warmer on a long turn.
- [ ] **Elapsed-progress ring** — the ring fills as the turn runs, so the indicator
      carries information, not just motion.

## 0.4.0 — Theme & languages

- [x] **Match theme** — one button reads the active theme's accent off the live DOM
      (`--dsw-alias-link` → `--dsw-alias-state-business-primary` →
      `--dsw-static-deepseek-*`), keeps the hue and fits the lightness until the
      colour reaches 4.5:1 against `--dsw-alias-bg-base`. Follows theme switches
      until **Stop following** is pressed or the colour is edited by hand; a
      **Back to brand blue** button appears whenever a custom colour is in effect.
- [ ] **Color presets** — brand blue / violet / teal / amber, one click each.
- [ ] **Generalize the `# <language>` sections** beyond Chinese / English: any
      `# <name>` header becomes a selectable section, and "Follow UI" maps the DSH
      locale onto it.

## 0.5.0 — Shape morph indicator

- [x] **Shape morph** — one SVG outline that becomes a circle → a rounded triangle
      → a rounded square → a circle, turning with a quintic ease so the rotation
      lags the shape and settles into each one. The geometry (rounded-polygon
      radial profiles, the blend, the path builder, both easings) is pure and
      unit-tested; the frame loop stops itself when the indicator leaves the DOM,
      and reduced-motion keeps a static circle.
- [ ] **Morph speed** — exposed by 0.6.0's global multiplier; a no-rotation variant
      for anyone who wants the shape change on its own is still open.

## 0.8.0 — Official surfaces, the settings page & animation stability (current)

Reuse what DSH already ships instead of redrawing it, give the settings a page of their own in
the settings nav, and stop the running line's own re-renders from interrupting what is on screen.

- [x] **Official icon options** — three more loader styles, each reusing DSH's own asset
      rather than a copy of it: `stateDot` renders the seeded `StateDot` in its `ongoing`
      state (a real spinner, through a small React root), `fish` assembles the seeded
      `FISH_LOGO_PATH` into the plugin's own svg, and `native` **clones DSH's own
      running-line whale** out of the live DOM. The clone is byte-identical and keeps both
      of DSH's variants — the 60-frame APNG mask and the static SVG — so the official
      `@supports` / `prefers-reduced-motion` gating keeps working for free. When the icon
      node is not there, `native` falls back to reading the mask out of the official
      stylesheet's CSSOM (the rule is nested two levels deep, `@supports` → `@media`), and
      when neither is available it degrades like the other official options
      (`stateDot → ring`, `fish`/`native` → `orbit`). DSH's whale is a **choice** rather than
      a permanent neighbour: whenever the plugin draws an icon of its own, the wrapper is
      marked (`data-tq-icon`) and the stylesheet retires DSH's node by attribute — leaving
      the node itself untouched — so the line always shows exactly one indicator. Pick
      `native` to have DSH's own whale be that one.
- [x] **The raster whale: sized in pixels, with a speed cue** — DSH's running whale is a
      28×28 APNG used as an alpha mask, so the shared `transform: scale()` rasterised it at
      14px and then stretched the bitmap, which is visibly soft at Large. `native` now sizes
      the box itself (`calc((14px + font-delta) * var(--tq-loader-scale))`) and opts out of
      the transform, so the mask is rasterised at its final size (11.2 / 14 / 17.5px — all
      downscales from 28px). The APNG's 60 frame delays live *inside the image*, which no CSS
      property can retime, so a speed level adds the plugin's own swim cue around the
      official motion (`1.4s / speed`), written only off Normal — Normal still overrides
      nothing — stopped by `prefers-reduced-motion`, and explained in the settings row while
      `native` is selected.
- [x] **The icons follow the global font size** — the seven styles the plugin draws itself were
      frozen on a 16px grid, so they silently ignored the one size the user can change globally.
      DSH publishes the content font size as `--dsh-content-font-delta` (= font size − 14px) and
      sizes its own running icon as `14px + delta`; the plugin's own drawings now declare that base
      once (`font-size: calc(16px + var(--dsh-content-font-delta, 0px))`) and express every
      geometry in `em`, so they grow with the text with no JS, no observer and no re-render —
      measured 16 / 17 / 20px at delta 0 / 1 / 4. The mounted official nodes are deliberately
      excluded (`stateDot`/`native` size themselves — the probe showed their `font-size` untouched
      while the native *box* still tracked `14px + delta`), and `native`'s mask branch (`:empty`)
      now includes the delta as well; it was the one place still reading `14px * scale`.
- [x] **A face in the plugin list** — the settings inventory (内置插件) reads display metadata
      from the package WITHOUT loading the plugin, so that row used to show the raw package name
      and the panel's default artwork. It now ships `icon.svg` (36x36, transparent, the soft
      two-gradient recipe the one shipped row with an icon uses — a speech bubble whose pointer
      is a whale fluke) and `locale/{en,zh}.json`; `"./locale/*.json"` had to join `exports`, or
      the resolver never sees the files and the fallback quietly wins. `test-package.mjs`
      asserts every rule DSH applies, including that the row's title equals the plugin's own.
- [x] **The settings live on their own page** — twelve controls were a row under General
      (`settings.general.item`), which is the seat for *one* preference and shared with every
      other plugin that adds one. They moved to `settings.section`: its own nav entry
      (id `thinking-quips`, order 30, label thunk so it follows the locale), rendering the page
      body into the panel's content column.
- [x] **A nav glyph of the plugin's own** — DSH picks the settings-nav icon from a table keyed
      by section id (`navIcon` in dsh-client-ui-settings-general) and hands an unknown id the
      settings gear, so a third-party section cannot supply one. The plugin marks its own nav
      row (`data-tq-section`, matched by the label it registered) and the stylesheet retires the
      gear in that row and paints a **16×16 whale tail** as a mask — same box as DSH's icons
      (measured: viewBox 16, size 16, `ICON_MEDIUM_STROKE` 1.3), drawn filled because a 1.3
      outline closes up at that size. If the panel's markup ever changes, no row matches and the
      gear simply stays.
- [x] **Indicator-only works like the rest of the line** — with the text handed back to DSH,
      the icon used to be *appended*, so it landed to the RIGHT of DSH's own label, and it was
      the single custom-coloured thing on a line whose text kept DSH's default colour. The icon
      is now anchored on "whatever renders the text" (the plugin's own line, else DSH's label),
      the empty plugin line is removed rather than left behind to become that anchor, and the
      icon follows DSH's own running-text token — which `paintHost` also writes when a custom
      colour is set. The mode stays: it is the only way to sit next to another plugin that owns
      the status text.
- [x] **The sweep's brightness is a control again** — retired with the `glow` effect it used
      to belong to, it came back where it actually belongs: measured in the installed
      primitives, the official `TextShimmer` stylesheet paints `.sweep { color:
      var(--dsw-alias-label-shimmer) }` and masks it with a moving gradient, so that token IS
      the highlight. `glow` (0–100) now writes a mix of the text colour toward white there: the
      shipped default writes nothing at all (DSH keeps painting), the default colour with
      another brightness writes only the sweep, and a custom colour moves both. The preview
      page reproduces that component from its own stylesheet so the control can be seen.
- [x] **One sweep, not two** — the plugin used to carry its own hand-painted
      `background-clip:text` gradient as the `glow` effect (and as the fallback when the
      primitives were missing). Side by side with the official sweep it was
      indistinguishable, so it is gone: `TEXT_EFFECTS` is now `shimmer` (DSH's own
      `TextShimmer`, rendered through the seed) plus `wave`, the painted-gradient CSS and
      its keyframes are deleted along with the `glow` strength setting, and a shell with no
      primitives falls back to plain text (guarded, so it cannot churn the DOM). A saved
      `official` or `glow` config maps onto the sweep.
- [x] **A re-render must not touch the quip or the animation** — DSH rebuilds the running
      line whenever the turn re-renders (every tool call, and once a second for the elapsed
      label). The plugin used to read "there is no icon in this element yet" as a first paint,
      so every tool call reset the rotation to quip #1 — which changed the text and rebuilt the
      animating container. The rotation now comes from a clock alone (`quipIndex`), and when
      the line is replaced the plugin's own nodes are **carried over** into the new element
      (`adoptNodes`), with the official React root re-pointed rather than remounted. For the
      same reason `wave` now updates its tokens' text in place when the token shape is
      unchanged, so the once-a-second elapsed tick no longer restarts the wave.
- [x] **The icon keeps its place when the style changes mid-turn** — the rebuild used to
      `appendChild`, so picking another style while a turn was running pushed the icon to the
      END of the line (past the plugin's own text). It is now inserted immediately before the
      plugin's own `line` element, and the "nothing to redraw" path repairs a misplaced icon
      once (checked with `previousElementSibling`, so a whitespace text node cannot make it
      re-insert every pass — that would feed the observer loop fixed below).
- [x] **Two real bugs found by actually rendering the gallery** (not by reading code):
      the shimmer/official fallback deleted and rebuilt its glow container on every pass,
      and the plugin's own `document.body` MutationObserver turned each mutation into
      another pass as a microtask — an endless chain that froze the tab (in headless
      Chromium `DOMContentLoaded` never fired). It now reuses the container, so the
      `data-text` guard holds. Separately, the morph loop's `requestAnimationFrame`
      *handle* was being called as a function, which threw inside `ensureLoader`'s
      try/catch and silently dropped every second and later morph icon; it is now
      cancelled with `cancelAnimationFrame`. Both have regression assertions.
- [x] **Settings controls from the seeds** — the row's hand-written switch, segmented
      controls and modal are now thin wrappers around the seeded `Switch`,
      `SegmentedControl` and `Modal`, each falling back to the old hand-written markup on a
      shell that seeds nothing. The official `Modal` brings its own mask, close button,
      Escape/Tab handling and focus restore (and `data-modal-autofocus` for the textarea).
- [x] **Running surface** — the plugin reads `dshDesktop` / `<html data-platform>` and
      watches the mark, because it can arrive as late as `DOMContentLoaded`. The result is
      a runtime fact: it lives in a store that is deliberately **not** persisted (it must
      never end up in the saved preference config) and is echoed read-only in the settings
      row as `data-tq-surface` / `data-tq-platform`.
- [x] **Offline animation gallery** — `preview/animations.html`, generated by
      `tools/build-preview.mjs`. It embeds the shipped `lib/client.js` verbatim and calls
      the plugin's own `injectPluginCss` / `ensureLoader` / `applyStatusText` / `apply` on
      mock status lines, inlining the official whale stylesheet and logo path extracted
      from the installed DSH. `test/test-preview.mjs` rebuilds it in memory, so a page
      that has fallen behind the plugin is a red self-check rather than silent rot.

## 0.7.0 — DSH 0.2

- [x] **0.2 anchor** — the running line is `[data-chat-running]` now, and the only
      `role="status"` inside it is a screen-reader announcement clipped to 1px, so the old
      `[class*="turnStatus"]` match (and its "Deep diving" text fallback) aimed the quips
      at an invisible node. The plugin matches the attribute first, keeps the 0.1.x token
      as a fallback, and never writes into the announcement.
- [x] **Line ownership** — on 0.2 the visible label lives inside DSH's `TextShimmer` and
      React rewrites it every second (it carries the live elapsed time), with an inert
      decoration copy mirroring it through `data-shimmer-text`. So the plugin hides that
      label by attribute (`data-tq-owned`) and paints its own `.tq-line` instead of
      blanking a node React owns. DSH's whale icon is left alone: the two coexist.
- [x] **Official shimmer via the seed** — 0.2 seeds
      `@deepseek-ai/dsh-client-ui-primitives` for every client plugin, so `shimmer` (and
      its alias `official`) renders DSH's own `TextShimmer` through a small React root
      instead of reimplementing the sweep. `glow` keeps the pre-0.2 painted gradient, on
      the plugin's own node.
- [x] **Elapsed time** — `conversation.chat.turnTail` (official, session-scoped) is
      mounted while the turn is open and hands over `turn.start.time`, so the clock uses
      the official start with a self-timer fallback. Inline folds the duration into the
      animated text (the 0.2 shape); separate renders it as a tertiary-grey note outside
      the animation (the 0.1 shape); off hides it. The format matches DSH's
      `formatRunDuration` (verified over 13 inputs in both locales).
- [x] **Colour hook migration** — the pre-0.2 `background-image` surgery is replaced by
      `--dsw-alias-label-shimmer` on the running wrapper (the official `.running` rule
      re-maps it to its deep-diving tint), plus `--tq-base`/`--tq-hi` for the plugin's own
      nodes.
- [x] **Speed stays ours** — 0.2 animates its sweep on `.sweep`/`.highlight` inside a
      component the plugin does not own, so the speed control scales only the plugin's
      animations (0.6.1's "the official sweep keeps its own pace", now enforced by the
      markup rather than by choice).
- [x] **Declaration hygiene** — `@deepseek-ai/dsh-client-runtime` no longer exists in 0.2
      (the profile still had a dangling junction for it); dropped from `dsh.client.inject`
      and the peers, `engines.dsh` bumped to `>=0.2.0-rc.2`.
- [x] **Adopt more official UI** (landed in 0.8.0) — the settings row used to hand-roll its
      switch, segmented control and modal; `@deepseek-ai/dsh-client-ui-primitives` exports
      `Switch`, `SegmentedControl`, `Modal`, `Toast` and `SettingsForm`, and the row now
      prefers the first three.
- [x] **Native icon options** (landed in 0.8.0) — DSH's whale (`native`), `StateDot` and the
      `FishLogo` path are now loader styles (the zero-copy ways to reach the whale APNG are
      recorded in the source repository's `docs/状态行扩展调研.md`; research notes are not
      shipped in the npm package).

## 0.6.0 — Text effects & one global speed

- [x] **Text effect** — **Shimmer** (DSH's own sweep, default) or **Wave**: each CJK
      glyph / Latin word lifts in turn, left to right, staggered in pure CSS. The wave
      owns its colour and text fill, so it does not depend on DSH's text clip; the line
      is handed back to DSH when the quip list is empty, and the label node React owns
      is blanked rather than removed.
- [x] **One animation speed, in three steps** — Slow / Normal / Fast (0.5× / 1× / 2×)
      scales the loading icons, the shape morph, the wave and DSH's shimmer sweep, through
      one CSS variable (and one elapsed multiplier for the morph). "Normal" is the shipped
      pace and overrides nothing at all.
- [ ] **More effects** — the same machinery admits a typewriter or a per-word fade; the
      tokeniser and the settings dropdown are already in place.
- [ ] **Effect per language** — CJK and Latin could run different effects, since the
      tokeniser already knows which is which.

## Later / considered

- [ ] Optional: persist config in the official DSH settings namespace
      (`$DSH_HOME/settings.yaml`) via a node-side route, so it survives plugin
      upgrades — today it lives in `localStorage`.
- [ ] Optional: publish to npm with build provenance.

## Non-goals

Deliberately **not** planned — they belong to a different, heavier kind of plugin:

- danmaku / bullet-screen output
- theme packs and phrase-pack marketplaces
- typewriter rendering
- browser tab-title rotation
- presets and time-of-day scheduling

This plugin stays the calm, small option: no config file, no network requests, no
file writes, and a status line that is pleasant rather than loud.
