# Roadmap

**Direction.** This plugin owns the **status-line loading indicator** — the small
element in front of the turn-status text — and stays deliberately small. It is not
trying to be a phrase engine: the text rotation is one feature, the indicator is the
point. Everything below serves that.

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

## 0.4.0 — Theme & languages (current)

- [x] **Match theme** — one button reads the active theme's accent off the live DOM
      (`--dsw-alias-link` → `--dsw-alias-state-business-primary` →
      `--dsw-static-deepseek-*`), keeps the hue and fits the lightness until the
      colour reaches 4.5:1 against `--dsw-alias-bg-base`. Follows theme switches
      until the colour is edited by hand.
- [ ] **Color presets** — brand blue / violet / teal / amber, one click each.
- [ ] **Generalize the `# <language>` sections** beyond Chinese / English: any
      `# <name>` header becomes a selectable section, and "Follow UI" maps the DSH
      locale onto it.

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
