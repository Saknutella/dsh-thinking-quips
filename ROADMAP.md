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

## 0.7.0 — DSH 0.2 (current)

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
- [ ] **Adopt more official UI** — the settings row still hand-rolls its switch,
      segmented control and modal; `@deepseek-ai/dsh-client-ui-primitives` exports
      `Switch`, `SegmentedControl`, `Modal`, `Toast` and `SettingsForm`.
- [ ] **Native icon options** — offer DSH's whale / `StateDot` / `FishLogo` as loader
      styles (the zero-copy ways to reach the whale APNG are recorded in the source
      repository's `docs/状态行扩展调研.md`; research notes are not shipped in the npm package).

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
