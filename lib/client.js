// dsh-thinking-quips — browser client half (expanded).
//
// Adds the requested features on top of the rotating running-turn quips:
//   1. EN / CN adaptation: quips choose a language list from the web UI locale
//      and the plugin's own mode setting (en / zh / both).
//   2. Settings → General → "俏皮话" section with:
//        A. font-color control: preview swatch + hex / RGB inputs + a native
//           color wheel (<input type="color">), default = brand-blue shimmer;
//        B. a "manage quips" button that opens a small modal (language dropdown
//           + Save + quips list editor), styled to the web UI.
//
// Config is persisted to localStorage (schema-free, low risk) and mirrored in a
// tiny reactive store so the rotator, the color override, and the settings row
// all stay in sync. The running-turn status element ("Deep diving..." in the
// brand-blue shimmer) is hardcoded in dsh-client-ui-conversation, so we hook it
// from the outside: find the element, swap its leading text node, and (when a
// custom color is chosen) override the shimmer gradient.

window.__ModuleLoader__.load({
	id: "dsh-thinking-quips",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		// Dependencies every dsh client plugin may rely on as platform seeds.
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");

		const jsx = react_jsx_runtime.jsx;
		const jsxs = react_jsx_runtime.jsxs;

		// ── default quips (single source) ────────────────────────────────────
		// The defaults live in the settings textarea / config `quips`, so the app
		// reads quips from ONE place. Edit them in the web UI and they persist.
		const DEFAULT_QUIPS = [
			"# Chinese",
			"正在思考…",
			"正在翻阅卷宗…",
			"正在梳理脉络…",
			"正在拧螺丝…",
			"正在对齐颗粒度…",
			"正在打破部门壁垒，沉淀方法论…",
			"正在打通闭环，点亮整个链路…",
			"正在把大象装进冰箱…",
			"正在给脑洞充能…",
			"# English",
			"Deep diving...",
			"Digging through the haystack...",
			"Sifting through context...",
			"Consulting the ancient scrolls...",
			"Untangling the thread...",
			"Chasing stray semicolons...",
			"Walking the dependency graph...",
			"Polishing the crystal ball...",
			"Feeding the neurons..."
		].join("\n");

		// ── config ───────────────────────────────────────────────────────────
		const STORAGE_KEY = "dsh-thinking-quips.config";
		const SHIMMER = "shimmer"; // sentinel for the default brand-blue shimmer
		const DEFAULT_BLUE = "#2E5BE8"; // wheel start when on the default shimmer
		/** Selectable loader indicators (the plugin's differentiator). */
		const LOADER_STYLES = ["orbit", "ring", "pulse", "dots", "bars"];
		/** Visual scale per size token (applied as a CSS variable on the loader). */
		const LOADER_SCALES = { sm: 0.8, md: 1, lg: 1.25 };
		const DEFAULTS = { enabled: true, color: SHIMMER, colorTheme: false, langMode: "ui", quips: DEFAULT_QUIPS, perLang: {}, quipMs: 8000, glow: 35, indicatorOnly: false, loader: "orbit", loaderSize: "md" };

		/**
		* Theme accent candidates, tried in order — the first one that resolves to a
		* colour wins. `--dsw-alias-*` are the alias layer DSH's own themes override
		* per scheme (light `#4176e6` / dark `#679efe`), so they are preferred over the
		* static ramp the turn-status shimmer itself uses.
		*/
		const THEME_COLOR_TOKENS = [
			"--dsw-alias-link",
			"--dsw-alias-state-business-primary",
			"--dsw-static-deepseek-500",
			"--dsw-static-deepseek-450"
		];
		/** App-background candidates, used to pick a readable lightness. */
		const THEME_BG_TOKENS = ["--dsw-alias-bg-base", "--dsw-static-neutral-bluish-50"];
		/** Contrast the matched colour must reach against the app background (WCAG AA). */
		const MIN_CONTRAST = 4.5;

		const POLL_MS = 600;    // re-assert cadence (also survives React rebuilds)

		// ── storage + tiny reactive store ────────────────────────────────────
		function loadConfig() {
			let merged = { ...DEFAULTS };
			try {
				const raw = globalThis.localStorage && localStorage.getItem(STORAGE_KEY);
				if (raw) {
					const saved = JSON.parse(raw);
					merged = { ...merged, ...saved };
					// Migrate the old `mode` field ("both"|"en"|"zh") onto langMode.
					if (saved && saved.mode !== void 0) {
						const migrated = { both: "ui", en: "en", zh: "zh" }[saved.mode];
						if (migrated) merged.langMode = migrated;
						delete merged.mode;
					}
					// Migrate an old flat-array `quips` into the sectioned text.
					if (Array.isArray(merged.quips)) merged.quips = merged.quips.join(";\n");
					// Single source: always keep a non-empty quips text (seed defaults).
					if (typeof merged.quips !== "string" || merged.quips.trim() === "") merged.quips = DEFAULT_QUIPS;
				}
			} catch (_) { /* bad JSON -> defaults */ }
			return merged;
		}
		function saveConfig(value) {
			try {
				if (globalThis.localStorage) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
			} catch (_) { /* storage unavailable */ }
		}
		function makeStore(seed) {
			let value = seed;
			const subs = new Set();
			return {
				get: () => value,
				set: (next) => { if (next !== value) { value = next; saveConfig(value); subs.forEach((fn) => fn()); } },
				subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; }
			};
		}
		let _store = null;
		function store() { if (_store === null) _store = makeStore(loadConfig()); return _store; }

		// ── color helpers ────────────────────────────────────────────────────
		function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
		function hexToRgb(hex) {
			const m = /^#?([0-9a-fA-F]{6})$/.exec((hex || "").trim());
			if (!m) return null;
			const v = m[1];
			return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
		}
		function rgbToHex(r, g, b) {
			return "#" + [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)]
				.map((n) => n.toString(16).padStart(2, "0")).join("");
		}
		function mixToWhite(hex, amount) {
			const rgb = hexToRgb(hex);
			if (!rgb) return hex;
			return rgbToHex(
				rgb[0] + (255 - rgb[0]) * amount,
				rgb[1] + (255 - rgb[1]) * amount,
				rgb[2] + (255 - rgb[2]) * amount
			);
		}

		// ── theme colour extraction (Settings → 「匹配主题色」) ──────────────
		/**
		* Parse whatever a CSS custom property / computed style hands back into `#rrggbb`.
		* Handles `#rgb`, `#rrggbb`, `#rrggbbaa` and `rgb()` / `rgba()`; anything else
		* (a gradient, a keyword, an empty string) returns null so the caller can try
		* the next candidate token.
		* @param raw - the computed value to parse.
		* @returns `#rrggbb` or null.
		*/
		function parseCssColor(raw) {
			if (typeof raw !== "string") return null;
			const value = raw.trim();
			if (value === "") return null;
			const hex = /^#([0-9a-fA-F]{3,8})$/.exec(value);
			if (hex) {
				const digits = hex[1];
				if (digits.length === 3 || digits.length === 4) {
					return ("#" + digits.slice(0, 3).split("").map((c) => c + c).join("")).toLowerCase();
				}
				if (digits.length === 6 || digits.length === 8) return ("#" + digits.slice(0, 6)).toLowerCase();
				return null;
			}
			const fn = /^rgba?\(([^)]+)\)$/i.exec(value);
			if (fn) {
				const parts = fn[1].split(/[\s,/]+/).filter((p) => p !== "");
				if (parts.length < 3) return null;
				const nums = parts.slice(0, 3).map((p) => {
					const n = p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p);
					return Number.isFinite(n) ? clamp(n, 0, 255) : NaN;
				});
				if (nums.some((n) => Number.isNaN(n))) return null;
				return rgbToHex(nums[0], nums[1], nums[2]);
			}
			return null;
		}
		/**
		* Resolve the first token that yields a colour, reading computed styles from
		* `node` (custom properties inherit, so any element inside the app works).
		* @param node - element to read from; defaults to body, then the document root.
		* @param names - candidate custom-property names, in priority order.
		* @returns `{ hex, token }` or null when nothing resolved.
		*/
		function resolveToken(node, names) {
			if (typeof getComputedStyle !== "function") return null;
			const target = node || (typeof document !== "undefined" && document.body) || (typeof document !== "undefined" && document.documentElement);
			if (!target) return null;
			let style = null;
			try { style = getComputedStyle(target); } catch (_) { return null; }
			if (!style || typeof style.getPropertyValue !== "function") return null;
			for (const name of names) {
				let value = "";
				try { value = style.getPropertyValue(name); } catch (_) { value = ""; }
				const hex = parseCssColor(value);
				if (hex) return { hex, token: name };
			}
			return null;
		}
		/**
		* The active scheme: the layout presenter sets `body[data-ds-dark-theme]` (and
		* `color-scheme` on `<html>`), so those two are authoritative; the background
		* luminance is the last resort.
		* @param node - element used for the computed-style fallbacks.
		* @returns `"dark"` or `"light"`.
		*/
		function themeScheme(node) {
			try {
				const body = typeof document !== "undefined" ? document.body : null;
				if (body && typeof body.hasAttribute === "function" && body.hasAttribute("data-ds-dark-theme")) return "dark";
			} catch (_) { /* fall through */ }
			try {
				if (typeof getComputedStyle === "function") {
					const target = node || (typeof document !== "undefined" && document.body);
					const scheme = target ? String(getComputedStyle(target).colorScheme || "") : "";
					if (scheme.indexOf("dark") !== -1 && scheme.indexOf("light") === -1) return "dark";
					if (scheme.indexOf("light") !== -1) return "light";
				}
			} catch (_) { /* fall through */ }
			return relativeLuminance(themeBackground(node)) < 0.4 ? "dark" : "light";
		}
		/**
		* The app background colour (custom property first, computed body background
		* second, white last) — used only for the contrast fit.
		* @param node - element to read the custom properties from.
		* @returns `#rrggbb`.
		*/
		function themeBackground(node) {
			const resolved = resolveToken(node, THEME_BG_TOKENS);
			if (resolved) return resolved.hex;
			try {
				if (typeof getComputedStyle === "function") {
					const target = node || (typeof document !== "undefined" && document.body);
					const bg = target ? parseCssColor(getComputedStyle(target).backgroundColor) : null;
					if (bg) return bg;
				}
			} catch (_) { /* fall through */ }
			return "#ffffff";
		}
		/** WCAG relative luminance of a `#rrggbb` colour (0..1). */
		function relativeLuminance(hex) {
			const rgb = hexToRgb(hex) || [255, 255, 255];
			const lin = rgb.map((c) => {
				const s = c / 255;
				return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
			});
			return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
		}
		/** WCAG contrast ratio between two `#rrggbb` colours (1..21). */
		function contrastRatio(a, b) {
			const la = relativeLuminance(a);
			const lb = relativeLuminance(b);
			const hi = Math.max(la, lb);
			const lo = Math.min(la, lb);
			return (hi + 0.05) / (lo + 0.05);
		}
		/** `#rrggbb` → `{h: 0..360, s: 0..100, l: 0..100}` (null when unparsable). */
		function rgbToHsl(hex) {
			const rgb = hexToRgb(hex);
			if (!rgb) return null;
			const r = rgb[0] / 255;
			const g = rgb[1] / 255;
			const b = rgb[2] / 255;
			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);
			const l = (max + min) / 2;
			const d = max - min;
			if (d === 0) return { h: 0, s: 0, l: l * 100 };
			const s = d / (1 - Math.abs(2 * l - 1));
			let h;
			if (max === r) h = 60 * (((g - b) / d) % 6);
			else if (max === g) h = 60 * ((b - r) / d + 2);
			else h = 60 * ((r - g) / d + 4);
			if (h < 0) h += 360;
			return { h, s: s * 100, l: l * 100 };
		}
		/** `{h, s, l}` (same ranges) → `#rrggbb`. */
		function hslToHex(h, s, l) {
			const sat = clamp(s, 0, 100) / 100;
			const light = clamp(l, 0, 100) / 100;
			const c = (1 - Math.abs(2 * light - 1)) * sat;
			const hp = (((h % 360) + 360) % 360) / 60;
			const x = c * (1 - Math.abs((hp % 2) - 1));
			let rgb;
			if (hp < 1) rgb = [c, x, 0];
			else if (hp < 2) rgb = [x, c, 0];
			else if (hp < 3) rgb = [0, c, x];
			else if (hp < 4) rgb = [0, x, c];
			else if (hp < 5) rgb = [x, 0, c];
			else rgb = [c, 0, x];
			const m = light - c / 2;
			return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
		}
		/**
		* Fit a colour to the current background: keep the hue, keep saturation honest
		* (achromatic accents stay achromatic), then move lightness inside the band the
		* background allows and keep pushing until {@link MIN_CONTRAST} is reached.
		* @param hex - the colour to fit (usually the extracted theme accent).
		* @param bg - the app background to fit against.
		* @returns the fitted `#rrggbb`.
		*/
		function fitToTheme(hex, bg) {
			const hsl = rgbToHsl(hex);
			if (!hsl) return DEFAULT_BLUE;
			const background = hexToRgb(bg) ? bg : "#ffffff";
			const dark = relativeLuminance(background) < 0.4;
			const lo = dark ? 62 : 32;
			const hi = dark ? 84 : 56;
			// A near-grey theme accent stays grey; anything chromatic is nudged into a
			// vivid-but-not-neon band so the shimmer reads as a highlight.
			const s = hsl.s < 12 ? hsl.s : clamp(hsl.s, 50, 92);
			let l = clamp(hsl.l, lo, hi);
			let out = hslToHex(hsl.h, s, l);
			const step = dark ? 1 : -1;
			let guard = 0;
			while (contrastRatio(out, background) < MIN_CONTRAST && guard < 100) {
				const next = l + step;
				if (next < lo || next > hi) break;
				l = next;
				out = hslToHex(hsl.h, s, l);
				guard++;
			}
			return out;
		}
		/**
		* Read the active theme's accent colour from the live DOM (never from our own
		* override, which the caller avoids by reading tokens rather than the shimmer).
		* @param node - element inside the app to inherit theme tokens from.
		* @returns `{ raw, token, bg, scheme }`; `raw`/`token` are null when nothing resolved.
		*/
		function themeColor(node) {
			const resolved = resolveToken(node, THEME_COLOR_TOKENS);
			return {
				raw: resolved ? resolved.hex : null,
				token: resolved ? resolved.token : null,
				bg: themeBackground(node),
				scheme: themeScheme(node)
			};
		}
		/**
		* The "match theme colour" result: the extracted accent plus the fitted colour
		* and the numbers the settings row reports.
		* @param node - element inside the app to inherit theme tokens from.
		* @returns `{ raw, token, bg, scheme, color, contrast, fallback }`.
		*/
		function matchThemeColor(node) {
			const info = themeColor(node);
			const source = info.raw || DEFAULT_BLUE;
			const color = fitToTheme(source, info.bg);
			return {
				raw: info.raw,
				token: info.token,
				bg: info.bg,
				scheme: info.scheme,
				color,
				contrast: contrastRatio(color, info.bg),
				fallback: info.raw === null
			};
		}

		// ── running-turn element hook ────────────────────────────────────────
		function runningStatus() {
			const nodes = document.querySelectorAll('[role="status"]');
			for (const el of nodes) {
				const cls = typeof el.className === "string" ? el.className : "";
				if (cls.indexOf("turnStatus") !== -1) return el;
			}
			for (const el of nodes) {
				// DSH >= 0.1.5 renders the label from the i18n key `chat.deepDiving`, so the
				// fallback must cover both locales (en "Deep diving..." / zh "深度求索中...").
				if (/deep diving|深度求索/i.test(el.textContent || "")) return el;
			}
			return null;
		}
		function quipNode(el) {
			const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
			let node;
			while ((node = walker.nextNode())) {
				if (node.parentNode === el) return node;
			}
			return null;
		}
		function applyQuip(el, text) {
			const node = quipNode(el);
			if (node !== null) node.nodeValue = text;
		}
		/**
		* Child cells for one loader style. Each cell gets `--i` (its step index) unless
		* it is a `blank` (the orbit's empty center).
		*/
		function loaderCells(style) {
			if (style === "orbit") {
				// Placed row-major into a 3x3 grid; the value is the clockwise ring index
				// (top-left(0), top-mid(1), top-right(2), mid-right(3), bottom-right(4),
				// bottom-mid(5), bottom-left(6), mid-left(7)); -1 is the empty center.
				return [0, 1, 2, 7, -1, 3, 6, 5, 4];
			}
			if (style === "dots" || style === "bars") return [0, 1, 2];
			return [0]; // ring / pulse: a single element
		}
		/**
		* Inject the loading indicator as the first child of the status element, and
		* re-render it when the configured style changes.
		* @param el - the running-status element.
		* @param style - one of {@link LOADER_STYLES}.
		* @param size - `sm` | `md` | `lg`.
		*/
		function ensureLoader(el, style, size) {
			try {
				if (!el || typeof el.querySelector !== "function" || typeof el.insertBefore !== "function") return;
				const want = LOADER_STYLES.indexOf(style) !== -1 ? style : "orbit";
				const existing = el.querySelector(".tq-loader");
				if (existing !== null) {
					if (existing.getAttribute("data-style") === want) return; // already correct
					if (typeof existing.remove === "function") existing.remove();
				}
				const span = document.createElement("span");
				span.className = "tq-loader tq-loader-" + want;
				span.setAttribute("data-style", want);
				span.style.setProperty("--tq-loader-scale", String(LOADER_SCALES[size] || 1));
				for (const v of loaderCells(want)) {
					const cell = document.createElement("i");
					if (v === -1) cell.className = "blank";
					else cell.style.setProperty("--i", String(v));
					span.appendChild(cell);
				}
				el.insertBefore(span, el.firstChild);
			} catch (_) { /* DOM quirk; never break the shell */ }
		}
		function effectiveLang(locale) { return locale === "zh" ? "zh" : "en"; }
		/**
		* Parse the quips textarea into language sections.
		* "# Chinese"/"# 中文" -> zh; "# English"/"# 英文" -> en; unmarked lines and
		* unknown "# headers" -> other (shown in every mode).
		*/
		function parseQuips(text) {
			const out = { zh: [], en: [], other: [] };
			if (typeof text !== "string" || text.trim() === "") return out;
			let section = "other";
			for (const rawLine of text.split(/\r?\n/)) {
				const line = rawLine.trim();
				if (line === "") continue;
				const m = /^#\s*(.+)$/.exec(line);
				if (m) {
					const h = m[1].trim().toLowerCase();
					section = (h.indexOf("中文") !== -1 || h === "chinese" || h.indexOf("zh") !== -1) ? "zh"
						: (h.indexOf("英文") !== -1 || h === "english" || h.indexOf("en") !== -1) ? "en"
						: "other";
					continue;
				}
				for (const part of line.split(";")) {
					const item = part.trim();
					if (item) out[section].push(item);
				}
			}
			return out;
		}
		function selectPhrases(cfg, locale) {
			const lang = effectiveLang(locale);
			const mode = cfg.langMode || "ui";
			const sections = parseQuips(cfg.quips);
			let list;
			if (mode === "mix") list = sections.zh.concat(sections.en);
			else if (mode === "zh") list = sections.zh.slice();
			else if (mode === "en") list = sections.en.slice();
			else list = (lang === "zh" ? sections.zh : sections.en).slice(); // follow UI
			// Language-agnostic "other" quips always ride along.
			if (sections.other.length) list = list.concat(sections.other);
			return list; // single source: empty -> no quips (status keeps the DSH default text)
		}

		// ── color override for the shimmer element ───────────────────────────
		const COLOR_STYLE_ID = "dsh-thinking-quips-color";
		function applyColorCSS(cfg) {
			if (typeof document === "undefined") return;
			let el = document.getElementById(COLOR_STYLE_ID);
			const isDefault = cfg.color === SHIMMER || !cfg.color;
			const glow = clamp(cfg.glow == null ? 35 : Number(cfg.glow) || 35, 0, 100);
			// Leave the authentic brand-blue shimmer completely untouched at its default glow.
			if (isDefault && glow === 35) {
				if (el) el.textContent = "";
				return;
			}
			const base = isDefault ? DEFAULT_BLUE : cfg.color;
			const hi = mixToWhite(base, glow / 100);
			const css = `[role="status"][class*="turnStatus"]{background-image:linear-gradient(90deg, ${base} 0%, ${base} 40%, ${hi} 50%, ${base} 60%, ${base} 100%) !important}.tq-loader{color:${base} !important}`;
			if (!el) {
				el = document.createElement("style");
				el.id = COLOR_STYLE_ID;
				document.head.appendChild(el);
			}
			el.textContent = css;
		}
		function effectiveHex(cfg) {
			return cfg.color === SHIMMER || !cfg.color ? DEFAULT_BLUE : cfg.color;
		}

		// ── plugin CSS (styles the settings row, modal, and preview) ─────────
		const STYLE_NS = "dsh-thinking-quips-style";
		const CSS = [
			".tq-row{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;align-items:stretch;gap:12px;padding:16px 0;display:flex}",
			".tq-head{flex-direction:row;align-items:center;gap:8px;display:flex}",
			".tq-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
			".tq-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
			".tq-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".tq-colorRow{align-items:center;gap:12px;display:flex;flex-wrap:wrap}",
			".tq-colorBlock{flex-direction:column;gap:8px;display:flex}",
			".tq-themeNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;word-break:break-word}",
			".tq-swatch{width:46px;height:30px;border-radius:8px;flex:none;border:1px solid var(--dsw-alias-border-l2);background-color:#000;background-size:250% 100%;cursor:pointer}",
			".tq-inputs{align-items:center;gap:8px;display:flex;flex-wrap:wrap}",
			".tq-input{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 8px;font:inherit;font-size:13px;line-height:18px}",
			".tq-input[type=number]{width:56px}",
			".tq-input[type=text]{width:92px}",
			".tq-colorPicker{width:42px;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;cursor:pointer;padding:0;overflow:hidden}",
			".tq-btn{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;height:36px;padding:0 14px;font:inherit;font-size:14px;line-height:22px;display:inline-flex;align-items:center;gap:8px}",
			".tq-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".tq-btnGhost{background:transparent;border:1px solid var(--dsw-alias-border-l2)}",
			".tq-btnSmall{height:30px;padding:0 12px;font-size:13px;line-height:18px}",
			".tq-btnOn{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}",
			".tq-actions{align-items:center;gap:8px;display:flex;flex-wrap:wrap}",
			".tq-overlay{z-index:1200;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}",
			".tq-mask{background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);position:absolute;inset:0}",
			".tq-panel{position:relative;z-index:1;background:var(--dsw-alias-bg-layer-2);width:560px;max-width:calc(100vw - 48px);max-height:min(640px,calc(100vh - 48px));box-shadow:var(--dsw-shadow-lv3);border-radius:24px;display:flex;flex-direction:column;overflow:hidden}",
			".tq-panelHead{flex:none;align-items:center;gap:8px;padding:20px 20px 12px;display:flex}",
			".tq-panelTitle{flex:1;color:var(--dsw-alias-label-primary);font-size:16px;font-weight:500;line-height:24px}",
			".tq-panelClose{background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border:none;border-radius:8px;font-size:16px;line-height:24px;padding:2px 8px}",
			".tq-panelClose:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".tq-toolbar{flex:none;align-items:center;gap:12px;padding:4px 20px 14px;display:flex}",
			".tq-toolbarLabel{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}",
			".tq-select{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;align-items:center;gap:10px;padding:0 12px;font-size:14px;line-height:22px;display:inline-flex}",
			".tq-spacer{flex:1}",
			".tq-divider{flex:none;height:1px;background:var(--dsw-alias-border-l2);margin:0 20px}",
			".tq-footer{flex:none;justify-content:flex-end;align-items:center;gap:8px;padding:14px 20px 20px;display:flex}",
			".tq-body{flex:auto;min-height:0;overflow-y:auto;padding:16px 20px 20px;display:flex;flex-direction:column;gap:10px}",
			".tq-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center;padding:24px 0}",
			".tq-list{flex-direction:column;gap:8px;display:flex}",
			".tq-item{align-items:center;gap:8px;display:flex}",
			".tq-item input{flex:1;min-width:0}",
			".tq-itemDel{background:transparent;color:var(--dsw-alias-state-error-primary);cursor:pointer;border:none;border-radius:6px;font-size:14px;padding:2px 6px}",
			".tq-add{align-items:center;gap:8px;display:flex}",
			".tq-textarea{box-sizing:border-box;width:100%;min-height:180px;resize:vertical;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px;font-family:inherit;font-size:14px;line-height:22px}",
			".tq-textarea:focus{outline:2px solid var(--dsw-alias-interactive-border-focus,var(--dsw-static-deepseek-500));outline-offset:1px}",
			".tq-hint{color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px}",
			".tq-timeRow{align-items:center;gap:12px;display:flex;flex-wrap:wrap}",
			".tq-timeLabel{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:18px;flex:none}",
			".tq-timeInput{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 8px;font:inherit;font-size:13px;line-height:18px;width:76px}",
			".tq-timeUnit{color:var(--dsw-alias-label-caption);font-size:13px;line-height:18px}",
			".tq-switch{box-sizing:border-box;width:44px;height:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-interactive-bg-hover-solid);padding:0;position:relative;cursor:pointer;transition:background .18s ease;flex:none}",
			".tq-switch[aria-checked=true]{background:var(--dsw-static-deepseek-500)}",
			".tq-switchKnob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .18s ease}",
			".tq-switch[aria-checked=true] .tq-switchKnob{transform:translateX(20px)}",
			".tq-langRow{align-items:center;gap:12px;display:flex;flex-wrap:wrap}",
			".tq-langText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}",
			".tq-langTitle{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}",
			".tq-langDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".tq-loaderRow{align-items:center;gap:8px;display:flex;flex-wrap:wrap}",
			".tq-seg{display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-interactive-bg-hover-solid);border:1px solid var(--dsw-alias-border-l2);border-radius:18px;padding:3px}",
			".tq-segItem{height:30px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;border-radius:14px;padding:0 12px;font:inherit;font-size:13px;line-height:18px;white-space:nowrap}",
			".tq-segItem:hover{color:var(--dsw-alias-label-primary)}",
			".tq-segActive{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.18)}",
			// ── loading indicators (the plugin's differentiator) ────────────────
			// Every style is a `.tq-loader` span to the LEFT of the status text; the style
			// is a modifier class and the chosen size arrives as --tq-loader-scale.
			".tq-loader{flex:none;align-self:center;margin-right:8px;color:var(--dsw-static-deepseek-500);transform:scale(var(--tq-loader-scale,1));transform-origin:center}",
			// orbit: 3x3, the 8 outer dots chase clockwise, center empty.
			".tq-loader-orbit{display:grid;grid-template-columns:repeat(3,4px);grid-template-rows:repeat(3,4px);gap:2px;place-items:center}",
			".tq-loader-orbit i{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.15;animation:tq-orbit-chase 1.6s linear infinite;animation-delay:calc(var(--i)*.2s)}",
			".tq-loader-orbit i.blank{background:transparent!important;animation:none}",
			// ring: a thin hollow ring spinning a two-quarter arc.
			".tq-loader-ring i{display:block;width:14px;height:14px;box-sizing:border-box;border-radius:50%;border:2px solid transparent;border-top-color:currentColor;border-right-color:currentColor;animation:tq-spin .75s linear infinite}",
			// pulse: one dot breathing.
			".tq-loader-pulse i{display:block;width:10px;height:10px;border-radius:50%;background:currentColor;animation:tq-pulse 1.1s ease-in-out infinite}",
			// dots: three dots typing in sequence.
			".tq-loader-dots{display:inline-flex;align-items:center;gap:3px;height:12px}",
			".tq-loader-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.25;animation:tq-dots 1s ease-in-out infinite;animation-delay:calc(var(--i)*.16s)}",
			// bars: a three-bar equalizer.
			".tq-loader-bars{display:inline-flex;align-items:flex-end;gap:2px;height:13px}",
			".tq-loader-bars i{width:3px;height:100%;border-radius:1.5px;background:currentColor;opacity:.4;transform-origin:bottom;animation:tq-bars 1s ease-in-out infinite;animation-delay:calc(var(--i)*.13s)}",
			"@keyframes tq-orbit-chase{0%,100%{opacity:.15}8%{opacity:1}30%{opacity:.5}50%{opacity:.15}}",
			"@keyframes tq-spin{to{transform:rotate(360deg)}}",
			"@keyframes tq-pulse{0%,100%{transform:scale(.5);opacity:.3}50%{transform:scale(1);opacity:1}}",
			"@keyframes tq-dots{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}",
			"@keyframes tq-bars{0%,100%{transform:scaleY(.35);opacity:.35}50%{transform:scaleY(1);opacity:1}}",
			"@media (prefers-reduced-motion:reduce){.tq-loader i{animation:none!important}.tq-loader-orbit i,.tq-loader-dots i,.tq-loader-pulse i,.tq-loader-bars i{opacity:.7}.tq-loader-bars i{transform:scaleY(.7)}.tq-loader-orbit i.blank{opacity:0}}"
		].join("");

		function injectPluginCss() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_NS)) return;
			const tag = document.createElement("style");
			tag.id = STYLE_NS;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ── dictionary (settings row + modal labels) ─────────────────────────
		const DICT_NS = "dsh-thinking-quips";
		const zh = {
			"quips.title": "俏皮话",
			"quips.desc": "智能体运行时的俏皮话与字体颜色设置。",
			"quips.color": "字体颜色",
			"quips.colorDesc": "默认使用 DeepSeek 品牌蓝色微光，也可自定义颜色。",
			"quips.default": "品牌蓝（默认）",
			"quips.manage": "设置俏皮话",
			"quips.reset": "恢复默认",
			"quips.modalTitle": "俏皮话设置",
			"quips.language": "语言",
			"quips.save": "保存",
			"quips.close": "关闭",
			"quips.textareaPlaceholder": "# Chinese\n在这输入中文俏皮话，每行一条；\n# English\nType English quips here, one per line;",
			"quips.textareaHint": "用 # Chinese / # English 分段；保存后按语言选择取段：混合→两段都显示，仅中文→只显示中文段，仅英文→只显示英文段，跟随界面→按当前界面语言取段。未分段的行始终显示。",
			"quips.mode.en": "仅英文",
			"quips.mode.zh": "仅中文",
			"quips.mode.mix": "混合",
			"quips.lang.ui": "跟随界面",
			"quips.time": "每条显示时间",
			"quips.timeUnit": "秒",
			"quips.glow": "发光强度",
			"quips.matchTheme": "匹配主题色",
			"quips.matchThemeTitle": "读取当前主题的强调色，调整到与背景有足够对比度的颜色；开启后会跟随主题切换",
			"quips.matched": "已匹配主题色",
			"quips.matchFallback": "读不到主题色，已按品牌蓝适配",
			"quips.contrast": "对比度",
			"quips.following": "跟随主题中",
			"quips.scheme.light": "浅色",
			"quips.scheme.dark": "深色",
			"quips.loader": "加载图标",
			"quips.loaderDesc": "状态行左侧动态图标的样式与尺寸。",
			"quips.loader.orbit": "点阵环游",
			"quips.loader.ring": "圆环旋转",
			"quips.loader.pulse": "呼吸脉冲",
			"quips.loader.dots": "三点跳动",
			"quips.loader.bars": "柱状律动",
			"quips.sizeLabel": "图标尺寸",
			"quips.size.sm": "小",
			"quips.size.md": "中",
			"quips.size.lg": "大",
			"quips.langDesc": "语言选择决定显示哪一段：混合→两段都显示；仅中文→中文段；仅英文→英文段；跟随界面→按当前界面语言取段。",
			"quips.indicatorOnly": "只显示加载图标",
			"quips.indicatorOnlyDesc": "开启后只注入加载图标，不替换状态文字——可与其他修改状态文字的插件共存。"
		};
		const en = {
			"quips.title": "Playful quips",
			"quips.desc": "Rotating status quips and font color while the agent is working.",
			"quips.color": "Font color",
			"quips.colorDesc": "Defaults to the DeepSeek brand-blue shimmer; pick any custom color.",
			"quips.default": "Brand blue (default)",
			"quips.manage": "Manage quips",
			"quips.reset": "Reset to default",
			"quips.modalTitle": "Playful quips",
			"quips.language": "Language",
			"quips.save": "Save",
			"quips.close": "Close",
			"quips.textareaPlaceholder": "# Chinese\nType Chinese quips here, one per line;\n# English\nType English quips here, one per line;",
			"quips.textareaHint": "Use # Chinese / # English sections; the language choice picks which shows (Mixed→both, Chinese only→Chinese section, English only→English section, Follow UI→the UI language's section). Unsectioned lines always show.",
			"quips.mode.en": "English only",
			"quips.mode.zh": "Chinese only",
			"quips.mode.mix": "Mixed",
			"quips.lang.ui": "Follow UI",
			"quips.time": "Time per quip",
			"quips.timeUnit": "s",
			"quips.glow": "Glow strength",
			"quips.matchTheme": "Match theme",
			"quips.matchThemeTitle": "Read the theme accent and fit it to a colour with enough contrast against the background; keeps following theme switches once used",
			"quips.matched": "Matched theme color",
			"quips.matchFallback": "No theme color found — fitted the brand blue instead",
			"quips.contrast": "contrast",
			"quips.following": "Following theme",
			"quips.scheme.light": "light",
			"quips.scheme.dark": "dark",
			"quips.loader": "Loader icon",
			"quips.loaderDesc": "Style and size of the animated icon left of the status line.",
			"quips.loader.orbit": "Dot orbit",
			"quips.loader.ring": "Spinner ring",
			"quips.loader.pulse": "Pulse",
			"quips.loader.dots": "Bouncing dots",
			"quips.loader.bars": "Equalizer bars",
			"quips.sizeLabel": "Icon size",
			"quips.size.sm": "Small",
			"quips.size.md": "Medium",
			"quips.size.lg": "Large",
			"quips.langDesc": "Which section shows: Mixed→both; Chinese only→Chinese section; English only→English section; Follow UI→the active UI language.",
			"quips.indicatorOnly": "Indicator only",
			"quips.indicatorOnlyDesc": "Inject only the loading icon and leave the status text alone, so another status-text plugin can coexist."
		};

		// ── state setters (shared by row and modal) ──────────────────────────
		function patchConfig(patch) {
			const st = store();
			st.set({ ...st.get(), ...patch });
		}

		// ── React: color control (preview + hex/rgb + native wheel + theme match) ──
		function ColorControl({ value, onChange, onMatchTheme, following, t }) {
			const isShimmer = value === SHIMMER || !value;
			const base = isShimmer ? DEFAULT_BLUE : value;
			const rgb = hexToRgb(base) || [0, 0, 0];
			const [hexDraft, setHexDraft] = react.useState(base);
			const [rgbDraft, setRgbDraft] = react.useState(rgb);
			// The match report is keyed by the colour it produced, so any manual edit
			// (which changes `value`) drops it instead of leaving a stale claim.
			const [matched, setMatched] = react.useState(null);

			react.useEffect(() => {
				const isDefault = value === SHIMMER || !value;
				const next = isDefault ? DEFAULT_BLUE : value;
				setHexDraft(next);
				setRgbDraft(hexToRgb(next) || [0, 0, 0]);
			}, [value]);

			const commit = (hex) => {
				const valid = hexToRgb(hex);
				if (valid) { onChange(hex); return true; }
				return false;
			};
			const swatchStyle = isShimmer
				? { backgroundImage: `linear-gradient(90deg, ${DEFAULT_BLUE} 0%, ${DEFAULT_BLUE} 40%, ${mixToWhite(DEFAULT_BLUE, 0.35)} 50%, ${DEFAULT_BLUE} 60%, ${DEFAULT_BLUE} 100%)` }
				: { backgroundColor: value };
			const showMatch = matched && matched.color === value;

			return jsxs("div", { className: "tq-colorBlock", children: [
				jsxs("div", { className: "tq-colorRow", children: [
					jsx("button", { type: "button", className: "tq-swatch", style: swatchStyle, title: "preview", "aria-label": "color preview" }),
					jsx("input", { type: "color", className: "tq-colorPicker", value: base, onChange: (e) => { const hex = e.currentTarget.value; setHexDraft(hex); setRgbDraft(hexToRgb(hex) || [0, 0, 0]); onChange(hex); } }),
					jsx("input", { type: "text", className: "tq-input", value: hexDraft, placeholder: "#RRGGBB", onChange: (e) => { const v = e.currentTarget.value; setHexDraft(v); commit(v); },
						onBlur: () => { if (!hexToRgb(hexDraft)) { setHexDraft(value === SHIMMER ? DEFAULT_BLUE : value); } } }),
					jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[0], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [n, rgbDraft[1], rgbDraft[2]]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
					jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[1], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [rgbDraft[0], n, rgbDraft[2]]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
					jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[2], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [rgbDraft[0], rgbDraft[1], n]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
					jsx("button", {
						type: "button",
						className: "tq-btn tq-btnGhost tq-btnSmall" + (following ? " tq-btnOn" : ""),
						title: t("quips.matchThemeTitle"),
						"aria-pressed": following === true,
						onClick: (e) => {
							// Read the tokens from the button itself: it sits inside the app, so
							// it inherits the active theme's custom properties.
							const report = matchThemeColor(e.currentTarget);
							setMatched(report);
							onMatchTheme(report.color);
						},
						children: following ? t("quips.following") : t("quips.matchTheme")
					})
				] }),
				showMatch
					? jsx("div", { className: "tq-themeNote", children:
						(matched.fallback ? t("quips.matchFallback") : t("quips.matched"))
						+ " " + (matched.raw || DEFAULT_BLUE) + " → " + matched.color
						+ " · " + t("quips.contrast") + " " + matched.contrast.toFixed(1) + ":1"
						+ " · " + t("quips.scheme." + matched.scheme) })
					: null
			] });
		}

		// ── React: quips editor modal ────────────────────────────────────────
		function QuipsModal({ cfg, t, onClose }) {
			const [text, setText] = react.useState(typeof cfg.quips === "string" ? cfg.quips : "");

			const save = () => {
				patchConfig({ quips: text });
				onClose();
			};

			return jsxs("div", { className: "tq-overlay", children: [
				jsx("div", { className: "tq-mask", onClick: onClose }),
				jsxs("div", { className: "tq-panel", role: "dialog", "aria-modal": "true", children: [
					jsxs("div", { className: "tq-panelHead", children: [
						jsx("div", { className: "tq-panelTitle", children: t("quips.modalTitle") }),
						jsx("button", { type: "button", className: "tq-panelClose", onClick: onClose, "aria-label": t("quips.close"), children: "\u00d7" })
					] }),
					jsx("div", { className: "tq-divider" }),
					jsxs("div", { className: "tq-body", children: [
						jsx("textarea", { className: "tq-textarea", value: text, placeholder: t("quips.textareaPlaceholder"), spellCheck: false, onChange: (e) => setText(e.currentTarget.value) }),
						jsx("div", { className: "tq-hint", children: t("quips.textareaHint") })
					] }),
					jsxs("div", { className: "tq-footer", children: [
						jsx("div", { className: "tq-spacer" }),
						jsx("button", { type: "button", className: "tq-btn", onClick: save, children: t("quips.save") })
					] })
				] })
			] });
		}

		// ── React: the settings.general.item row ─────────────────────────────
		function QuipsSettingsRow({ t }) {
			const cfg = react.useSyncExternalStore(store().subscribe, store().get);
			const [open, setOpen] = react.useState(false);

			const isShimmer = cfg.color === SHIMMER || !cfg.color;
			const langMode = cfg.langMode || "ui";
			const seconds = Math.max(1, Math.round((cfg.quipMs || 8000) / 1000));
			const glowValue = clamp(cfg.glow == null ? 35 : Number(cfg.glow) || 35, 0, 100);
			return jsxs("div", { className: "tq-row", children: [
				jsxs("div", { className: "tq-head", children: [
					jsxs("div", { className: "tq-headText", children: [
						jsx("div", { className: "tq-title", children: t("quips.title") }),
						jsx("div", { className: "tq-desc", children: t("quips.desc") })
					] }),
					jsxs("div", { className: "tq-actions", children: [
						jsx("button", { type: "button", className: "tq-btn", onClick: () => setOpen(true), children: t("quips.manage") }),
						jsx("button", { type: "button", className: "tq-btn tq-btnGhost", onClick: () => patchConfig({ color: SHIMMER, colorTheme: false, langMode: "ui", quips: DEFAULT_QUIPS, quipMs: 8000 }), children: t("quips.reset") })
					] })
				] }),
				jsxs("div", { className: "tq-headText", children: [
					jsx("div", { className: "tq-title", children: t("quips.color") }),
					jsx("div", { className: "tq-desc", children: t("quips.colorDesc") })
				] }),
				jsx(ColorControl, {
					value: cfg.color,
					following: cfg.colorTheme === true,
					t,
					// Any manual edit stops the theme follow; the match button restarts it.
					onChange: (color) => patchConfig({ color, colorTheme: false }),
					onMatchTheme: (color) => patchConfig({ color, colorTheme: true })
				}),
				isShimmer
					? jsx("button", { type: "button", className: "tq-btn tq-btnGhost", onClick: () => patchConfig({ color: DEFAULT_BLUE, colorTheme: false }), children: t("quips.default") })
					: null,
				jsxs("div", { className: "tq-timeRow", children: [
					jsx("span", { className: "tq-timeLabel", children: t("quips.time") }),
					jsx("input", { type: "number", className: "tq-timeInput", min: 1, max: 120, value: seconds, onChange: (e) => { const s = clamp(Math.round(Number(e.currentTarget.value) || 8), 1, 120); patchConfig({ quipMs: s * 1000 }); } }),
					jsx("span", { className: "tq-timeUnit", children: t("quips.timeUnit") })
				] }),
				jsxs("div", { className: "tq-timeRow", children: [
					jsx("span", { className: "tq-timeLabel", children: t("quips.glow") }),
					jsx("input", { type: "number", className: "tq-timeInput", min: 0, max: 100, value: glowValue, onChange: (e) => { const g = clamp(Math.round(Number(e.currentTarget.value) || 0), 0, 100); patchConfig({ glow: g }); } }),
					jsx("span", { className: "tq-timeUnit", children: "%" })
				] }),
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.loader") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.loaderDesc") })
					] }),
					jsxs("div", { className: "tq-loaderRow", children: [
						jsx("select", {
							className: "tq-select",
							title: t("quips.loader"),
							"aria-label": t("quips.loader"),
							value: LOADER_STYLES.indexOf(cfg.loader) !== -1 ? cfg.loader : "orbit",
							onChange: (e) => patchConfig({ loader: e.currentTarget.value }),
							children: LOADER_STYLES.map(function (s) { return jsx("option", { value: s, children: t("quips.loader." + s) }, s); })
						}),
						jsx("select", {
							className: "tq-select",
							title: t("quips.sizeLabel"),
							"aria-label": t("quips.sizeLabel"),
							value: LOADER_SCALES[cfg.loaderSize] ? cfg.loaderSize : "md",
							onChange: (e) => patchConfig({ loaderSize: e.currentTarget.value }),
							children: ["sm", "md", "lg"].map(function (s) { return jsx("option", { value: s, children: t("quips.size." + s) }, s); })
						})
					] })
				] }),
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.language") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.langDesc") })
					] }),
					jsxs("div", { className: "tq-seg", children: [
						["ui", t("quips.lang.ui")],
						["en", t("quips.mode.en")],
						["zh", t("quips.mode.zh")],
						["mix", t("quips.mode.mix")]
					].map(function (option) {
						return jsx("button", {
							type: "button",
							className: "tq-segItem" + (langMode === option[0] ? " tq-segActive" : ""),
							"aria-pressed": langMode === option[0],
							onClick: () => patchConfig({ langMode: option[0] }),
							children: option[1]
						}, option[0]);
					})})
				] }),
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.indicatorOnly") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.indicatorOnlyDesc") })
					] }),
					jsx("button", {
						type: "button",
						role: "switch",
						"aria-checked": cfg.indicatorOnly === true,
						"aria-label": t("quips.indicatorOnly"),
						className: "tq-switch",
						onClick: () => patchConfig({ indicatorOnly: cfg.indicatorOnly !== true }),
						children: [jsx("span", { className: "tq-switchKnob" })]
					})
				] }),
				open && jsx(QuipsModal, { cfg, t, onClose: () => setOpen(false) })
			] });
		}

		// ── required services (Cordis) ────────────────────────────────────────
		const inject = ["slots", "locale"];

		/**
		* Client plugin body.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			if (window.__DSH_THINKING_QUIPS__) return;
			window.__DSH_THINKING_QUIPS__ = true;
			if (typeof document === "undefined" || !document.body) return;

			injectPluginCss();
			applyColorCSS(store().get());
			store().subscribe(() => applyColorCSS(store().get()));

			// Locale awareness: pick the phrase list from the active UI language.
			const resolveLocale = () => {
				try {
					return (ctx.locale && ctx.locale.getLocale && ctx.locale.getLocale().active) || "en";
				} catch (_) { return "en"; }
			};
			let activeLocale = resolveLocale();
			if (ctx.on) ctx.on("locale/change", (snap) => { activeLocale = (snap && snap.active) || activeLocale; });

			const start = Date.now();
			const timer = setInterval(() => {
				try {
					const cfg = store().get();
					const el = runningStatus();
					if (!el) return;
					ensureLoader(el, cfg.loader, cfg.loaderSize);
					if (cfg.indicatorOnly === true) return; // indicator only: leave the status text to DSH / another plugin
					const quips = selectPhrases(cfg, activeLocale);
					if (!quips.length) return;
					const idx = Math.floor((Date.now() - start) / (cfg.quipMs || 8000)) % quips.length;
					applyQuip(el, quips[idx]);
				} catch (_) { /* never break the shell */ }
			}, POLL_MS);
			// Immediate first pass.
			try {
				const cfg0 = store().get();
				const el0 = runningStatus();
				if (el0) {
					ensureLoader(el0, cfg0.loader, cfg0.loaderSize);
					if (cfg0.indicatorOnly !== true) {
						const quips0 = selectPhrases(cfg0, activeLocale);
						if (quips0.length) applyQuip(el0, quips0[0]);
					}
				}
			} catch (_) { /* noop */ }

			// Instant first-paint: catch the status element the moment it is
			// committed (before the browser paints), so "Deep diving…" never flashes.
			let observer = null;
			try {
				if (typeof MutationObserver !== "undefined" && document.body) {
					observer = new MutationObserver(() => {
						try {
							const el = runningStatus();
							if (!el) return;
							const cfg = store().get();
							const fresh = el.querySelector(".tq-loader") === null;
							ensureLoader(el, cfg.loader, cfg.loaderSize); // no-op when the style already matches
							if (!fresh || cfg.indicatorOnly === true) return; // seed the text on first paint only
							const quips = selectPhrases(cfg, activeLocale);
							if (quips.length) applyQuip(el, quips[0]);
						} catch (_) { /* noop */ }
					});
					observer.observe(document.body, { childList: true, subtree: true });
				}
			} catch (_) { /* MutationObserver unavailable; the poll below still works */ }

			// Theme follow: the layout presenter writes the scheme attribute and every
			// theme token onto <body>, so watching that one element is enough. Re-fit
			// only while the user asked for it, and only when the result actually
			// changes — that keeps this from looping with our own re-render.
			let themeObserver = null;
			try {
				if (typeof MutationObserver !== "undefined" && document.body) {
					themeObserver = new MutationObserver(() => {
						try {
							const cfg = store().get();
							if (cfg.colorTheme !== true) return;
							const report = matchThemeColor(document.body);
							if (report.color !== cfg.color) patchConfig({ color: report.color });
						} catch (_) { /* noop */ }
					});
					themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "style", "class"] });
				}
			} catch (_) { /* no theme follow; the button still matches on click */ }

			// Settings row + dictionaries.
			try {
				const ctxEffect = ctx && typeof ctx.effect === "function" ? ctx.effect.bind(ctx) : null;
				if (ctxEffect) {
					ctxEffect(() => {
						return () => {
							try { if (observer) observer.disconnect(); } catch (_) { /* noop */ }
							try { if (themeObserver) themeObserver.disconnect(); } catch (_) { /* noop */ }
							if (typeof clearInterval === "function") clearInterval(timer);
						};
					});
				}
				ctx.effect(() => ctx.locale.register(DICT_NS, { zh, en }), "dsh-thinking-quips: dictionaries");
				ctx.slots.inject("settings.general.item", () => ctx.slots.register({
					name: "settings.general.item",
					id: "thinking-quips",
					order: 40,
					locale: DICT_NS,
					inject: () => ({})
				}, QuipsSettingsRow));
			} catch (_) { /* slot/registration must not break the shell */ }
		}

		exports.apply = apply;
		exports.inject = inject;
		/**
		* Test seam (also handy from devtools): the pure helpers the smoke tests need
		* to exercise directly. The runtime only ever reads `apply` / `inject`.
		*/
		exports.__internal = {
			THEME_COLOR_TOKENS,
			THEME_BG_TOKENS,
			MIN_CONTRAST,
			parseCssColor,
			relativeLuminance,
			contrastRatio,
			rgbToHsl,
			hslToHex,
			fitToTheme,
			themeBackground,
			themeScheme,
			themeColor,
			matchThemeColor,
			loaderCells,
			selectPhrases,
			parseQuips
		};
		return module.exports;
	}
});
