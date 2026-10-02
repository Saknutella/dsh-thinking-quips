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
		/**
		* The second sentinel: a colour that is not a colour.
		*
		* Its preset writes this instead of a hex, and the rainbow stylesheet paints the line with
		* a flowing six-stop gradient — so the saved config stays schema-free while the line gets
		* a colour that changes on its own.
		*/
		const RAINBOW = "rainbow";
		/**
		* The hues that gradient walks through, in order (degrees).
		*
		* Six stops read as a spectrum rather than as three bands, and every one of them goes
		* through the same fit-then-floor pipeline as a flat preset — so the rainbow cannot become
		* the one choice that quietly breaks the contrast promise the other presets keep.
		*/
		const RAINBOW_HUES = [0, 55, 120, 190, 265, 320];
		/**
		* How bright the sweep is, as a percentage mixed toward white — and the value at which the
		* plugin leaves DSH's own look completely alone.
		*
		* This is the one control that survived the `glow` effect it used to belong to, because it
		* turns out to sit on the official sweep's own knob: `TextShimmer.module.css` paints
		* `.sweep { color: var(--dsw-alias-label-shimmer) }` and masks it with a moving gradient, so
		* that token IS the highlight. Writing a mix of the text colour and white there changes the
		* sweep's brightness for the official component too — no second implementation needed.
		* 35 reproduces the value the removed control defaulted to.
		*/
		const DEFAULT_GLOW = 35;
		/**
		* The one-click colour presets (ROADMAP 0.4.0: "brand blue / violet / teal / amber,
		* one click each").
		*
		* Each entry carries the raw colour it is named after and the dictionary key for its
		* label; the colour a click actually writes is fitted per theme first (see
		* {@link presetPatch}/{@link presetColor}), so a preset can never land below
		* {@link MIN_CONTRAST} just because the app is dark or a third-party theme is grey.
		* The `key` is spelled out rather than derived from `id` so this table is the single
		* description of a preset and the self-check can assert the two never drift.
		*
		* WHY these hues: brand blue is the plugin's own shipped default, and the other three sit
		* well away from it and from each other on the wheel (measured hues: 225.5° / 271.5° /
		* 174.1° / 37.3°), so the chips read as different colours at a glance instead of four
		* shades of blue. The fifth entry is not a hue at all: a sentinel whose chip shows the
		* whole spectrum and whose line is painted by {@link rainbowCSS}.
		*/
		const COLOR_PRESETS = [
			{ id: "blue", base: DEFAULT_BLUE, key: "quips.preset.blue" },
			{ id: "violet", base: "#9333EA", key: "quips.preset.violet" },
			{ id: "teal", base: "#0E9C8E", key: "quips.preset.teal" },
			{ id: "amber", base: "#C47A00", key: "quips.preset.amber" },
			{ id: "rainbow", base: null, key: "quips.preset.rainbow" }
		];
		/**
		* Selectable loader indicators (the plugin's differentiator).
		*
		* Six are drawn by the plugin itself. The last three reuse what DSH already ships,
		* through the seeded primitives or the live DOM, instead of redrawing it:
		* `stateDot` is the official `StateDot` in its `ongoing` state, `fish` is the
		* official logo path, and `native` is DSH's own running-line whale, cloned out of
		* the live line. Each of them degrades to a plugin-drawn icon when its source is
		* missing (see {@link resolveLoader}), because an older shell may have neither.
		*/
		const LOADER_STYLES = [
			"orbit", "pulse", "dots", "bars", "morph", "stateDot", "fish",
			// Contributed sprites (see {@link LOADER_SPRITES}): the two design families the
			// plugin's own icons are joined by. They sit before the official options so the
			// drawn-by-us group stays together and the two DSH-derived entries stay at the end.
			"jelly", "tickTock", "bonk", "pinwheel", "ripple", "beadRun", "sparkleSwap", "bounceBall",
			"native"
		];
		/** The subset that needs `@deepseek-ai/dsh-client-ui-primitives` to render. */
		const OFFICIAL_LOADERS = ["stateDot", "fish"];
		/** Visual scale per size token (applied as a CSS variable on the loader). */
		const LOADER_SCALES = { sm: 0.8, md: 1, lg: 1.25 };
		/** SVG namespace for the SVG-drawn indicators (see {@link ensureMorph}). */
		const SVG_NS = "http://www.w3.org/2000/svg";
		/** Morph geometry in SVG user units inside a {@link MORPH_BOX} square. */
		const MORPH_BOX = 16;
		/**
		* The `viewBox` the contributed sprites are drawn in — the size their geometry was
		* delivered at, so every coordinate in {@link LOADER_SPRITES} is the delivered number
		* (CSS sizes the `<svg>` to `1em`; nothing here is ever a pixel value).
		*/
		const SPRITE_BOX = 24;

		// ── morph geometry ───────────────────────────────────────────────────
		// Everything between these markers is PURE (no DOM): the geometry that turns
		// circle → rounded triangle → rounded square. build-loader-preview.mjs lifts
		// this block verbatim into the offline preview page, so the page animates the
		// plugin's own maths instead of a copy of it. Keep it dependency-free.
		// ── morph geometry: begin ────────────────────────────────────────────
		/** Samples per outline. Divisible by 3 and 4 so both shapes' corners land on one. */
		const MORPH_SAMPLES = 48;
		/** Max shape radius in SVG user units (matches the ring's footprint). */
		const MORPH_RADIUS = 6.5;
		/** Corner cut as a fraction of the half-sector: <1 keeps the corners rounded. */
		const MORPH_CHAMFER = 0.9;
		/** One segment per shape change; this is the whole cycle in ms. */
		const MORPH_CYCLE_MS = 3300;
		/** How far into a segment the turn starts, as a fraction (and it ends as late). */
		const MORPH_SPIN_LAG = 0.1;
		/** The loop order, each with its corner count and where its first corner points. */
		const MORPH_ORDER = ["circle", "triangle", "square"];
		const MORPH_SHAPES = {
			circle: { corners: 0, corner: 0 },
			triangle: { corners: 3, corner: -Math.PI / 2 },   // a corner pointing up
			square: { corners: 4, corner: -Math.PI / 4 }      // axis-aligned
		};
		/**
		* Dense Cartesian outline of one rounded polygon about its circumcentre, with
		* the circumradius at 1. Each radius is the polar form of a regular polygon
		* (`inradius / cos x`, x = the angle from the nearest edge normal) with the
		* corners cut at {@link MORPH_CHAMFER} of the half-sector — clamping the radius
		* turns each corner into a small arc, which is what makes them look rounded.
		*
		* A polygon rather than Gielis' superformula (tried first, discarded): the
		* superformula's corner-to-edge contrast saturates near 1.41, i.e. only a ~25%
		* radius swing, so at 16px a "triangle" read as a wobbling circle.
		* @param kind - `circle` | `triangle` | `square`.
		* @returns `[x, y]` pairs around the outline.
		*/
		function morphOutline(kind) {
			const shape = MORPH_SHAPES[kind] || MORPH_SHAPES.circle;
			const steps = 240; // dense enough that ray-casting it is exact for our purposes
			const points = [];
			const h = Math.PI / Math.max(1, shape.corners);
			const inradius = Math.cos(h);
			const cut = h * MORPH_CHAMFER;
			for (let i = 0; i < steps; i++) {
				const a = shape.corner + (i / steps) * Math.PI * 2;
				if (shape.corners < 3) { points.push([Math.cos(a), Math.sin(a)]); continue; }
				// angular distance from the nearest edge normal, wrapped into [0, 2h)
				const fromNormal = ((a - shape.corner - h) % (2 * h) + 2 * h) % (2 * h);
				const x = Math.min(fromNormal, 2 * h - fromNormal);
				const r = inradius / Math.cos(Math.min(x, cut));
				points.push([Math.cos(a) * r, Math.sin(a) * r]);
			}
			return points;
		}
		/** Distance from the origin to a convex polygon's boundary in one direction. */
		function morphRayRadius(poly, angle) {
			const dx = Math.cos(angle);
			const dy = Math.sin(angle);
			let best = 0;
			for (let i = 0; i < poly.length; i++) {
				const p = poly[i];
				const q = poly[(i + 1) % poly.length];
				const ex = q[0] - p[0];
				const ey = q[1] - p[1];
				const den = dx * ey - dy * ex;
				if (Math.abs(den) < 1e-12) continue;
				const s = (p[0] * dy - p[1] * dx) / den;
				if (s < -1e-9 || s > 1 + 1e-9) continue;
				const t = (p[0] * ey - p[1] * ex) / den;
				if (t > best) best = t;
			}
			return best;
		}
		/** Axis-aligned box of a point list. */
		function morphBounds(points) {
			let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
			for (const p of points) {
				if (p[0] < minX) minX = p[0];
				if (p[0] > maxX) maxX = p[0];
				if (p[1] < minY) minY = p[1];
				if (p[1] > maxY) maxY = p[1];
			}
			return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
		}
		/**
		* Radial outline of one shape, sampled at {@link MORPH_SAMPLES} angles, sample 0
		* at 12 o'clock.
		*
		* Two things happen before sampling, and both matter visually:
		*  1. the outline is re-centred on its BOUNDING BOX. A triangle's circumcentre
		*     is also its centroid, which sits a third of the way up from the base — so
		*     a circumcentre-centred triangle hangs below the middle of its own box and
		*     the morph looked like it drifted upwards instead of changing in place.
		*     Centring the box is what makes every shape share one visual centre.
		*  2. it is normalised so the furthest point is exactly 1, so every shape fits
		*     the same footprint (and nothing outgrows the rotation radius).
		* @param kind - `circle` | `triangle` | `square`.
		* @returns radii normalised so the outermost point is exactly 1.
		*/
		function morphProfile(kind) {
			const outline = morphOutline(kind);
			const box = morphBounds(outline);
			const centred = outline.map((p) => [p[0] - box.cx, p[1] - box.cy]);
			let max = 0;
			for (const p of centred) max = Math.max(max, Math.hypot(p[0], p[1]));
			const scaled = centred.map((p) => [p[0] / max, p[1] / max]);
			const radii = [];
			for (let i = 0; i < MORPH_SAMPLES; i++) {
				radii.push(morphRayRadius(scaled, (i / MORPH_SAMPLES) * Math.PI * 2 - Math.PI / 2));
			}
			// Normalise on the SAMPLED radii (a shape's furthest vertex can sit between
			// two samples), so every profile's maximum is exactly 1 and the shapes share
			// one footprint. The true outline can then poke out by at most the sample
			// step's cosine — 0.2% at 48 samples.
			let sampledMax = 0;
			for (const r of radii) if (r > sampledMax) sampledMax = r;
			return radii.map((r) => r / sampledMax);
		}
		const MORPH_PROFILES = MORPH_ORDER.map(morphProfile);
		/** Smooth accelerate-and-settle easing for the shape morph itself. */
		function morphEase(p) {
			return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
		}
		/**
		* Easing for the turn: the same cubic S-curve as the shape, but delayed by
		* {@link MORPH_SPIN_LAG} at the start and therefore still settling at the end —
		* the rotation drifts behind the shape instead of stopping dead with it.
		*
		* Deliberately NOT a stronger curve. A quintic ease-in-out was tried first for a
		* more pronounced lag and it whips: its peak slope is 5x the average, i.e. 8.6°
		* per frame at 60fps, which reads as a snap rather than a turn. Cubic over the
		* shortened span peaks at ~1.9x, about 3.4°/frame.
		*/
		function morphSpinEase(p) {
			const t = Math.min(1, Math.max(0, (p - MORPH_SPIN_LAG) / (1 - 2 * MORPH_SPIN_LAG)));
			return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		}
		/**
		* The outline at one point of the cycle, already turned by `degrees`.
		*
		* The rotation is baked into the coordinates instead of being a `transform` on
		* the `<svg>`. A transform attribute's pivot behaves differently across engines
		* for the root svg element (and CSS `transform` on SVG defaults to
		* `transform-origin: 0 0`), which showed up as the shape swinging out of its box
		* and over the text once it was past 0°. Rotating the points costs nothing —
		* they are regenerated every frame anyway — and leaves no way for the pivot to
		* be wrong.
		*
		* Order matters, and both steps are here for a reason: the blended outline is
		* first re-centred on its bounding box, then rotated about that centre, then
		* re-centred AGAIN — a rotated triangle's box centre is not its unrotated one,
		* so without the second pass the silhouette would slide around the pivot.
		* @param segment - 0..2, the shape being morphed away from.
		* @param progress - 0..1 within that segment.
		* @param [degrees] - clockwise turn to bake in (default 0).
		* @returns an SVG path (`M…L…Z`) at {@link MORPH_RADIUS}, in the 16-unit box.
		*/
		function morphPath(segment, progress, degrees) {
			const from = MORPH_PROFILES[segment % MORPH_PROFILES.length];
			const to = MORPH_PROFILES[(segment + 1) % MORPH_PROFILES.length];
			const e = morphEase(Math.min(1, Math.max(0, progress)));
			const points = [];
			for (let i = 0; i < MORPH_SAMPLES; i++) {
				const r = (from[i] + (to[i] - from[i]) * e) * MORPH_RADIUS;
				const a = (i / MORPH_SAMPLES) * Math.PI * 2 - Math.PI / 2; // start at 12 o'clock
				points.push([Math.cos(a) * r, Math.sin(a) * r]);
			}
			const blend = morphBounds(points);
			const rad = ((Number.isFinite(degrees) ? degrees : 0) * Math.PI) / 180;
			const cos = Math.cos(rad);
			const sin = Math.sin(rad);
			const turned = points.map((p) => {
				const x = p[0] - blend.cx;
				const y = p[1] - blend.cy;
				return [x * cos - y * sin, x * sin + y * cos];
			});
			const box = morphBounds(turned);
			const half = MORPH_BOX / 2;
			let d = "";
			for (let i = 0; i < turned.length; i++) {
				const x = half + turned[i][0] - box.cx;
				const y = half + turned[i][1] - box.cy;
				d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
			}
			return d + "Z";
		}
		/** Rotation in degrees for the same point of the cycle (one turn per cycle). */
		function morphRotation(segment, progress) {
			const per = 360 / MORPH_PROFILES.length;
			return segment * per + per * morphSpinEase(Math.min(1, Math.max(0, progress)));
		}
		/**
		* One frame of the cycle from the elapsed time alone. Keeping this here (pure,
		* inside the block the preview page reuses) means the only thing left in the
		* DOM layer is `<clock> - <start>` — and a wrong clock can no longer freeze the
		* shape at a fixed frame or throw, because any elapsed value, including a
		* negative one, wraps into a valid frame.
		* @param elapsedMs - milliseconds since the animation started.
		* @returns `{ d, rotation, segment, progress }`.
		*/
		function morphFrame(elapsedMs) {
			const t = Number.isFinite(elapsedMs) ? elapsedMs : 0; // total: never throws
			const wrapped = ((t % MORPH_CYCLE_MS) + MORPH_CYCLE_MS) % MORPH_CYCLE_MS;
			const segmentMs = MORPH_CYCLE_MS / MORPH_PROFILES.length;
			const segment = Math.min(MORPH_PROFILES.length - 1, Math.floor(wrapped / segmentMs));
			const progress = (wrapped % segmentMs) / segmentMs;
			const rotation = morphRotation(segment, progress);
			return {
				d: morphPath(segment, progress, rotation),
				rotation,
				segment,
				progress
			};
		}
		// ── morph geometry: end ──────────────────────────────────────────────
		const DEFAULTS = { enabled: true, color: SHIMMER, colorTheme: false, langMode: "ui", quips: DEFAULT_QUIPS, perLang: {}, quipMs: 8000, glow: DEFAULT_GLOW, indicatorOnly: false, loader: "orbit", loaderSize: "md", textEffect: "shimmer", speed: "normal", clockMode: "inline" };
		/**
		* One animation speed, in three steps rather than a free number: each level is a
		* multiplier over the shipped pace, so "normal" is exactly what the plugin does
		* today and the other two are a clear step either side.
		*
		* It scales every animation under our control — the loading icons, the shape
		* morph's frame loop, the text wave — and DSH's own shimmer sweep as well, which is
		* why "normal" must stay at 1: at 1 nothing is overridden at all.
		*/
		const SPEED_LEVELS = { slow: 0.5, normal: 1, fast: 2 };
		const SPEED_ORDER = ["slow", "normal", "fast"];
		const SPEED_VAR = "--tq-speed";
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
					// Migrate a numeric `speed` (0.6.0/0.6.1, before it became three steps)
					// onto the nearest level.
					if (typeof merged.speed === "number") merged.speed = speedLevel({ speed: merged.speed });
					// Single source: always keep a non-empty quips text (seed defaults).
					if (typeof merged.quips !== "string" || merged.quips.trim() === "") merged.quips = DEFAULT_QUIPS;
				}
			} catch (_) { /* bad JSON -> defaults */ }
			// 0.11.2 dropped the plugin's own spinner ring: DSH's official state dot is the same
			// gesture, so a saved choice of the removed style becomes that official option instead of
			// falling back to the default, which would leave the dropdown and the line disagreeing.
			if (merged.loader === "ring") merged.loader = "stateDot";
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

		// ── running surface: webui or desktop ────────────────────────────────
		// Every client plugin here is expected to work on both surfaces and to know
		// which one it is on (AGENTS §6, docs/06-运行模式.md). This plugin calls no
		// desktop-only bridge, so the fact forks no behaviour — but it is recorded on
		// the DOM and shown in the settings row, because "which surface was it" is the
		// first question a bug report has to answer.
		/** The surfaces a client half can run on. */
		const SURFACES = ["web", "desktop"];
		/**
		* Which surface this client half is running on.
		*
		* One of the two first-party signals, never a guess: the Electron preload bridge
		* (`dshDesktop`, installed earliest, so it wins) and the `<html data-platform>`
		* mark. The mark can arrive as late as `DOMContentLoaded`, which is why
		* {@link watchSurface} exists on top of this read.
		* @param scope - the global to read (defaults to `globalThis`); injectable so the
		* offline check can pass a bare object instead of a browser.
		* @returns `"web"` or `"desktop"`.
		*/
		function detectSurface(scope) {
			const win = scope || globalThis;
			if ("dshDesktop" in win) return "desktop";
			const marked = win.document && win.document.documentElement
				&& win.document.documentElement.dataset && win.document.documentElement.dataset.platform;
			if (typeof marked === "string" && marked !== "") return "desktop";
			return "web";
		}
		/**
		* The visiting device's OS, for the same troubleshooting note. `data-platform`
		* carries the client's OS (`darwin` / `win32` / …), never the server's.
		* @param scope - the global to read (defaults to `globalThis`).
		* @returns `"macos"` | `"windows"` | `"linux"`.
		*/
		function detectPlatform(scope) {
			const win = scope || globalThis;
			const nav = win.navigator || {};
			const marked = win.document && win.document.documentElement
				&& win.document.documentElement.dataset && win.document.documentElement.dataset.platform;
			const device = (typeof marked === "string" && marked !== "" ? marked : nav.platform) || nav.userAgent || "";
			if (/darwin|mac|iphone|ipad/i.test(device)) return "macos";
			if (/win/i.test(device)) return "windows";
			return "linux";
		}
		/**
		* Watch `<html data-platform>` so a late mark still lands.
		*
		* The attribute is written by the shell after this plugin may already be loaded,
		* so reading it once in `apply()` would pin the wrong answer for the whole
		* session. Degrades to a no-op disposer when there is no MutationObserver (or no
		* `<html>`): the initial read is still valid, so nothing is lost.
		* @param onChange - called on every attribute change.
		* @param scope - the global to read (defaults to `globalThis`).
		* @returns a disposer that disconnects the observer.
		*/
		function watchSurface(onChange, scope) {
			const win = scope || globalThis;
			const Observer = win.MutationObserver;
			if (typeof Observer !== "function") return () => {};
			const root = win.document && win.document.documentElement;
			if (!root) return () => {};
			const observer = new Observer(onChange);
			observer.observe(root, { attributes: true, attributeFilter: ["data-platform"] });
			return () => observer.disconnect();
		}
		/** The live runtime facts: surface + platform. */
		function readRuntime() {
			return { surface: detectSurface(), platform: detectPlatform() };
		}
		/**
		* A store for runtime facts. Deliberately NOT {@link makeStore}: that one writes
		* through to `localStorage`, and a runtime fact is not a user preference — it must
		* never end up in the saved config (AGENTS §6.3).
		* @param seed - the initial value.
		*/
		function makeRuntimeStore(seed) {
			let value = seed;
			const subs = new Set();
			return {
				get: () => value,
				set: (next) => {
					// Field-wise: readRuntime() builds a fresh object every refresh, and the
					// observer fires on unrelated attribute writes too.
					if (value && next && value.surface === next.surface && value.platform === next.platform) return;
					value = next;
					subs.forEach((fn) => fn());
				},
				subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; }
			};
		}
		let _runtime = null;
		function runtimeStore() { if (_runtime === null) _runtime = makeRuntimeStore(readRuntime()); return _runtime; }

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
		* Make a colour readable on a background, in the one case {@link fitToTheme} cannot
		* promise it.
		*
		* WHY this exists next to the fit: the fit's lightness band is a LOOK, and it can stop
		* with the ratio still short. Two measured cases from the shipped preset table:
		* fitToTheme("#0E9C8E", "#ffffff") returns #0e978a, which is 3.61:1 on white — under
		* WCAG AA for a colour the user is about to read in the common (light) theme — and on a
		* mid-tone background (`#808080`, what an unstyled or third-party theme can produce) the
		* fit even picks the wrong direction: fitToTheme("#C47A00", "#808080") returns #fcdfb1 at
		* 3.07:1, because neither band is right when the background is neither light nor dark.
		*
		* So this tries pushing lightness away from the background first (down on a light app,
		* up on a dark one) and then the other way, keeping the hue and saturation throughout,
		* so the colour is still the preset the user picked. Pure black/white is the last
		* resort: black and white are equal at 4.58:1 and one of the two is always above that,
		* so the fallback itself cannot miss {@link MIN_CONTRAST}.
		* @param hex - a colour already fitted for `bg`.
		* @param bg - the background it will be painted on.
		* @returns `#rrggbb` with contrast >= {@link MIN_CONTRAST} against `bg`.
		*/
		function readableOn(hex, bg) {
			const background = hexToRgb(bg) ? bg : "#ffffff";
			const extreme = () => (contrastRatio("#000000", background) >= contrastRatio("#ffffff", background) ? "#000000" : "#ffffff");
			const hsl = rgbToHsl(hex);
			if (!hsl) return extreme();
			const away = relativeLuminance(background) < 0.4 ? 1 : -1;
			for (const step of [away, -away]) {
				let level = hsl.l;
				let out = hex;
				let guard = 0;
				while (contrastRatio(out, background) < MIN_CONTRAST && guard < 101) {
					const next = level + step;
					if (next < 0 || next > 100) break;
					level = next;
					out = hslToHex(hsl.h, hsl.s, level);
					guard++;
				}
				if (contrastRatio(out, background) >= MIN_CONTRAST) return out;
			}
			return extreme();
		}
		/**
		* Look a preset up by id.
		* @param id - the preset id.
		* @returns the preset entry, or null (an unknown id from stale storage must not throw).
		*/
		function colorPreset(id) {
			for (const preset of COLOR_PRESETS) if (preset.id === id) return preset;
			return null;
		}
		/**
		* The colour one preset stands for on a given background: its own hue, fitted to the
		* live background and then floored at {@link MIN_CONTRAST}.
		*
		* WHY not store the raw hex: the same chip has to be legible in the light AND the
		* dark theme, and a vivid amber that is fine on a dark app is nearly invisible on a
		* white one. Fitting at click time (against the background that is on screen) is the
		* same mechanism the "Match theme" button already uses, so a preset lands inside the
		* existing colour pipeline instead of beside it.
		* @param id - the preset id.
		* @param bg - the app background to fit against.
		* @returns `#rrggbb`, or null for an unknown id.
		*/
		function presetColor(id, bg) {
			const preset = colorPreset(id);
			if (!preset) return null;
			const background = hexToRgb(bg) ? bg : "#ffffff";
			if (preset.base === null) return rainbowStops(background)[0]; // the rainbow's leading colour
			return readableOn(fitToTheme(preset.base, background), background);
		}
		/**
		* The colours the rainbow gradient is built from, for one background.
		*
		* Every stop runs through the same fit-then-floor pipeline as a flat preset, so no glyph
		* can ever sit on a colour below {@link MIN_CONTRAST} — which is what lets a rainbow be
		* offered without weakening what the other four presets promise. It is readable at a
		* glance in the light theme and in the dark one, because the fitting is per background.
		* @param bg - the app background to fit against.
		* @returns six `#rrggbb` values, in hue order.
		*/
		function rainbowStops(bg) {
			const background = hexToRgb(bg) ? bg : "#ffffff";
			return RAINBOW_HUES.map((hue) => readableOn(fitToTheme(hslToHex(hue, 85, 55), background), background));
		}
		/**
		* The same six colours as a CSS gradient that tiles while it scrolls.
		*
		* The list is written twice on purpose: with `background-size: 200% 100%` the animation
		* runs from `0%` to `100%`, and the second copy makes that end land on the first colour
		* again, so the flow loops without a visible seam.
		* @param bg - the app background to fit against.
		* @returns a `linear-gradient(...)` value.
		*/
		function rainbowGradient(bg) {
			const stops = rainbowStops(bg);
			return "linear-gradient(90deg, " + stops.concat(stops).join(", ") + ")";
		}
		/**
		* The style one preset chip paints its dot with.
		*
		* The four hex presets get their fitted colour; the rainbow gets the whole spectrum as a
		* gradient, which is deliberately **static** — the chip is the label on the button, so it
		* must not move while the user is aiming at it (the line is where the colour flows).
		* @param id - the preset id.
		* @param bg - the app background to fit against.
		* @returns a React style object, or null for an unknown id.
		*/
		function presetSwatch(id, bg) {
			const preset = colorPreset(id);
			if (!preset) return null;
			if (preset.base === null) return { backgroundImage: rainbowGradient(bg) };
			const color = presetColor(id, bg);
			return color === null ? null : { backgroundColor: color };
		}
		/**
		* The config patch one preset click applies.
		*
		* WHY brand blue writes the `shimmer` sentinel instead of a hex: in this plugin
		* `shimmer` IS the brand blue — it is what {@link DEFAULTS}.color ships, what the
		* "Back to brand blue" button and "Reset to default" both write, and the only value
		* that leaves DSH's own `TextShimmer` and its theme token untouched. Writing a fitted
		* hex there would quietly turn the default into an override: the line would stop
		* tracking DSH's own accent, and the "Back to brand blue" button would appear right
		* after the user pressed the button that is supposed to mean "brand blue". The other
		* three presets are genuinely new colours, so they do write their fitted hex.
		*
		* WHY `colorTheme: false` on every preset: a preset is the user naming a colour, and
		* that is the same act as typing a hex or moving the wheel, which already stops the
		* "Match theme" follow. A preset that stayed on follow would be overwritten by the
		* next theme switch, i.e. the click would do nothing visible.
		* @param id - the preset id.
		* @param bg - the app background to fit against.
		* @returns a config patch, or null for an unknown id.
		*/
		function presetPatch(id, bg) {
			const preset = colorPreset(id);
			if (!preset) return null;
			if (preset.id === "blue") return { color: SHIMMER, colorTheme: false };
			// The rainbow is a sentinel too, not a colour: the stylesheet needs to know that the
			// line is painted by a moving gradient rather than by one fitted hex.
			if (preset.id === "rainbow") return { color: RAINBOW, colorTheme: false };
			const color = presetColor(preset.id, bg);
			return color === null ? null : { color, colorTheme: false };
		}
		/**
		* Whether a preset is the one currently in force, so its chip can show it.
		*
		* Matched against the preset's raw base AND its fitted colour, because both are
		* legitimate saved values: a user can type the base hex by hand, and a colour saved
		* under a light theme keeps its light-theme value after the app switches to dark
		* (that is exactly what "not following the theme" means). The brand-blue preset also
		* matches the `shimmer` sentinel, which is what its own click writes.
		* @param id - the preset id.
		* @param color - the configured colour (the `shimmer` sentinel or a `#rrggbb`).
		* @param bg - the background the fitted colour is compared against.
		* @returns true when the chip should render as selected.
		*/
		function presetActive(id, color, bg) {
			const preset = colorPreset(id);
			if (!preset) return false;
			// The rainbow is a sentinel, so it matches only its own saved value.
			if (preset.base === null) return color === RAINBOW;
			const isSentinel = color === SHIMMER || !color;
			if (preset.id === "blue" && isSentinel) return true;
			const current = parseCssColor(color);
			if (current === null) return false;
			const fitted = presetColor(preset.id, bg);
			return current === parseCssColor(preset.base) || (fitted !== null && current === fitted);
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
		*
		* WHY the extra {@link readableOn} step after the fit: the fit's lightness band is a
		* LOOK, and it stops at the band edge even when the ratio is still short — so this
		* function used to hand back a colour below the {@link MIN_CONTRAST} it prints right
		* next to it. Two measured cases: fitToTheme("#0E9C8E", "#ffffff") = #0e978a (3.61:1),
		* and on backgrounds whose luminance falls between 0.18333 and the fit's 0.4
		* dark/light threshold the fit lightens an accent that can only be saved by darkening,
		* so all 3456 sampled accent/background pairs there missed AA (100%). The follow
		* observer writes this colour into the saved config and the settings page shows it to
		* the user, so the miss was user-visible, not cosmetic.
		*
		* That floor is the same one the colour presets use ({@link presetColor}), which is the
		* point: the two entry points into the colour pipeline now make one promise, not two.
		* The fit itself is deliberately left alone — its band is the existing look, and it is
		* pinned by this plugin's own self-check.
		* @param node - element inside the app to inherit theme tokens from.
		* @returns `{ raw, token, bg, scheme, color, contrast, fallback }`.
		*/
		function matchThemeColor(node) {
			const info = themeColor(node);
			const source = info.raw || DEFAULT_BLUE;
			const color = readableOn(fitToTheme(source, info.bg), info.bg);
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

		// ── running-turn element hook (0.2 and 0.1 shapes) ───────────────────
		/**
		* DSH 0.2's running line, found by its explicit attribute: one wrapper holding a
		* screen-reader-only `role="status"` announcement, DSH's own icon, and the visible
		* `TextShimmer` label. The attribute is the only stable hook in that markup
		* (everything else is a CSS-module hash), so it is the primary match.
		* @returns the wrapper, or null.
		*/
		function modernRunning() {
			if (typeof document === "undefined" || typeof document.querySelector !== "function") return null;
			try { return document.querySelector("[data-chat-running]"); } catch (_) { return null; }
		}
		/**
		* Whether one `role="status"` element is 0.2's screen-reader announcement rather
		* than a visible line. Detected structurally — a bare inline element with no element
		* children inside the running wrapper — plus the readable `visuallyHidden` suffix of
		* its hashed class, because writing a quip into that node writes into a 1px clipped
		* element (see the workspace's `docs/05-DSH-0.2-运行状态行变更.md`).
		* @param el - candidate `role="status"` element.
		* @returns true when it must be left alone.
		*/
		function isAnnouncement(el) {
			try {
				const kids = el.children;
				if (kids !== void 0 && kids !== null && kids.length > 0) return false;
				if (typeof el.querySelector === "function" && el.querySelector(".tq-line") !== null) return false;
				const cls = typeof el.className === "string" ? el.className : "";
				if (cls.indexOf("visuallyHidden") !== -1) return true;
				return modernRunning() !== null;
			} catch (_) { return false; }
		}
		/**
		* DSH <= 0.1.x's running line: the visible element itself is `role="status"` and
		* carries the `turnStatus` class token. Kept as a fallback so the plugin still works
		* on an older shell, and so the legacy self-checks stay meaningful.
		* @returns the element, or null.
		*/
		function legacyRunning() {
			if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return null;
			let nodes = [];
			try { nodes = document.querySelectorAll('[role="status"]'); } catch (_) { return null; }
			for (const el of nodes) {
				const cls = typeof el.className === "string" ? el.className : "";
				if (cls.indexOf("turnStatus") !== -1) return el;
			}
			for (const el of nodes) {
				if (isAnnouncement(el)) continue;
				if (/deep diving|深度求索/i.test(el.textContent || "")) return el;
			}
			return null;
		}
		/** The running line to work on, whichever markup generation is loaded. */
		function runningStatus() {
			const modern = modernRunning();
			return modern !== null ? modern : legacyRunning();
		}
		/** Whether `host` is the 0.2 wrapper (the plugin then owns a separate line element). */
		function isModern(host) {
			try {
				return host !== null && typeof host.getAttribute === "function"
					&& typeof host.setAttribute === "function"
					&& (host.getAttribute("data-chat-running") !== null || host.hasAttribute("data-chat-running") === true);
			} catch (_) { return false; }
		}
		/**
		* DSH's visible label node: on 0.1.x a bare text node directly inside the status
		* element, which is what the plugin paints when it does not own the line.
		* @param el - the status element.
		* @returns the text node, or null.
		*/
		function quipNode(el) {
			if (el === null || typeof document.createTreeWalker !== "function") return null;
			const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
			let node;
			while ((node = walker.nextNode())) {
				if (node.parentNode === el) return node;
			}
			return null;
		}
		// ── line ownership (0.2) ─────────────────────────────────────────────
		/** Marks a wrapper whose visible label the plugin has taken over (hides it by CSS). */
		const OWNED_ATTR = "data-tq-owned";
		/**
		* Marks a wrapper whose indicator the plugin owns. Its value is the loader style that
		* got drawn, and the stylesheet keys off its presence to retire DSH's own whale.
		*
		* The whale is a **choice** (the `native` loader), not a permanent fixture: leaving it
		* next to every plugin-drawn icon put two indicators on one line. Hiding it by
		* attribute rather than by touching it matters because React re-renders that subtree
		* every second.
		*/
		const ICON_ATTR = "data-tq-icon";
		/** Class of the plugin's own text element and of its effect children. */
		const LINE_CLASS = "tq-line";
		/**
		* The flex row that holds DSH's icon and label on 0.2, i.e. where the plugin's own
		* line belongs. Falls back to the wrapper itself when the build renames it.
		* @param host - the running wrapper.
		* @returns the element to append the plugin's line to.
		*/
		function visibleContent(host) {
			try {
				if (host !== null && typeof host.querySelector === "function") {
					const found = host.querySelector('[class*="runningContent"]');
					if (found !== null && found !== void 0) return found;
				}
			} catch (_) { /* fall through to the wrapper */ }
			return host;
		}
		/**
		* Give the plugin its own text element inside the running wrapper.
		*
		* DSH's label is hidden with CSS rather than blanked. Blanking would be undone
		* within a second: React re-renders that label every second because it carries the
		* live elapsed time, and the decoration copy inside `TextShimmer` mirrors it through
		* `data-shimmer-text`. A node the plugin owns has neither problem.
		* @param host - the running wrapper.
		* @returns the plugin's line element, or null when it cannot be created.
		*/
		function ensureLine(host) {
			if (host === null) return null;
			try {
				if (typeof host.setAttribute === "function") host.setAttribute(OWNED_ATTR, "");
			} catch (_) { /* the stylesheet also matches the wrapper's attribute selector */ }
			let line = lineOf(host);
			if (line !== null) return line;
			if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
			line = document.createElement("span");
			line.className = LINE_CLASS;
			// Appended LAST on purpose: React only inserts relative to the children it
			// manages, so a trailing node of ours is never reordered away.
			const parent = visibleContent(host);
			if (parent !== null && typeof parent.appendChild === "function") parent.appendChild(line);
			else if (typeof host.appendChild === "function") host.appendChild(line);
			return line;
		}
		/** The plugin's own line inside `host`, if it has one. */
		function lineOf(host) {
			try {
				return host !== null && typeof host.querySelector === "function" ? host.querySelector("." + LINE_CLASS) : null;
			} catch (_) { return null; }
		}
		/**
		* The element the text effects paint into: the plugin's own line on 0.2, the status
		* element itself on 0.1.x (where the label node can simply be written).
		* @param host - the running line element.
		* @returns `{ el, modern }`.
		*/
		function textTarget(host) {
			if (isModern(host)) {
				const line = ensureLine(host);
				if (line !== null) return { el: line, modern: true };
			}
			return { el: host, modern: false };
		}
		/**
		* Remember DSH's own label before the plugin hides it, so the line can be handed
		* back when the quip list is empty. First save wins, but a fresh DSH label (after a
		* locale switch, say) refreshes it.
		* @param host - the running line element.
		*/
		function rememberLabel(host) {
			const node = quipNode(host);
			if (node === null || node.nodeValue === "") return;
			if (typeof host.setAttribute !== "function") return;
			const looksLikeDsh = /deep diving|深度求索/i.test(node.nodeValue);
			if (looksLikeDsh || host.getAttribute("data-tq-label") === null) host.setAttribute("data-tq-label", node.nodeValue);
		}

		// ── elapsed time: the official turn start, with a self-timed fallback ─
		/**
		* Turn facts published by this plugin's headless occupant of DSH's official
		* `conversation.chat.turnTail` seat.
		*
		* That seat hands over a turn's `TurnLocation`, which is where the authoritative
		* `start.time` (the very field DSH's own clock uses) comes from — so the plugin does
		* not have to derive it, and does not need to know which session it is looking at.
		*
		* WHY THIS SLOT NEEDS RULES (measured on DSH 0.2.0-rc.2): the seat is NOT "the open
		* turn". The shell renders it from `TurnTailNodeView`, i.e. once per turn tail in the
		* transcript, and a finished turn's tail stays mounted — so the slot is written by
		* every turn in the conversation, newest and oldest alike. DSH's own running clock
		* reads the latest turn and only uses it while `turn.status === "open"`
		* (`ChatView.runningStartTime`); {@link recordTurnClock} applies the same two rules.
		* Without them the slot keeps the last finished turn's start, and a turn that began
		* seconds ago reports the age of the previous one — the reported "used 3h 24m" bug.
		*/
		const officialTurn = { turn: undefined, startTime: undefined };
		/** Self-timed fallback: when the running line appeared, if no official time is known. */
		let selfStart = 0;
		/** Forget the self-timer (called when the running line leaves the document). */
		function resetSelfClock() { selfStart = 0; }
		/**
		* Offer a turn from the `turnTail` seat, or refuse it.
		*
		* Refused when the turn is not open (a finished turn has no running clock — DSH's own
		* rule), when it carries no finite `start.time`, or when it would move the clock
		* backwards past an open turn already in the slot (an older tail re-mounting after a
		* scroll or a session switch must not win).
		* @param turn - the `TurnLocation.turn` handed to the seat, or undefined.
		* @returns whether the slot now describes this turn.
		*/
		function recordTurnClock(turn) {
			if (turn === void 0 || turn === null) return false;
			const start = turn.start === void 0 ? undefined : turn.start.time;
			const open = turn.status === "open" && typeof start === "number" && Number.isFinite(start);
			if (!open) {
				// The turn this slot holds has just stopped being open: its own tail re-renders at
				// turn/end, and that is the one moment the seat can tell the plugin the clock is
				// over. Clearing from here (and not from a DOM event) is what keeps a refresh in
				// the middle of a turn correct — the seat does not re-run when only the DOM moved.
				if (officialTurn.turn !== undefined && String(officialTurn.turn) === String(turn.turn)) clearTurnClock();
				return false;
			}
			// Newest open turn wins: an older tail re-mounting must not move the clock backwards.
			if (officialTurn.turn !== undefined && typeof officialTurn.startTime === "number" && start < officialTurn.startTime) return false;
			officialTurn.turn = turn.turn;
			officialTurn.startTime = start;
			selfStart = 0; // the official start supersedes the self-timer
			return true;
		}
		/** Forget the official clock when it is this turn's (its seat went away). */
		function releaseTurnClock(number) {
			if (officialTurn.turn === number) {
				officialTurn.turn = undefined;
				officialTurn.startTime = undefined;
			}
		}
		/** Forget the official clock, whoever it described. */
		function clearTurnClock() {
			officialTurn.turn = undefined;
			officialTurn.startTime = undefined;
		}
		/**
		* Pull a duration out of a shell label.
		*
		* The shell ships two locales and {@link DURATION_UNITS} already mirrors both unit rows, so
		* the pattern is derived from the same vocabulary the plugin formats with: `3小时24分32秒`
		* and `3h 24m 32s`. The seconds group is required because both shapes always end in seconds
		* (`45秒` / `45s`), which is what keeps a stray number elsewhere in the label from matching.
		* @param text - the label text.
		* @returns elapsed ms, or undefined when the text carries no duration.
		*/
		function durationFromText(text) {
			if (typeof text !== "string" || text === "") return undefined;
			const m = /(?:(\d+)\s*(?:小时|h))?\s*(?:(\d+)\s*(?:分|m))?\s*(?:(\d+)\s*(?:秒|s))/.exec(text);
			if (m === null) return undefined;
			const hours = m[1] === undefined ? 0 : Number(m[1]);
			const minutes = m[2] === undefined ? 0 : Number(m[2]);
			const seconds = m[3] === undefined ? 0 : Number(m[3]);
			if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return undefined;
			return ((hours * 60 + minutes) * 60 + seconds) * 1000;
		}
		/**
		* The elapsed time the shell itself is displaying.
		*
		* WHY READ THE SHELL'S OWN CLOCK instead of deriving one: DSH knows the running turn's start
		* (it reads it from its own store) and rewrites that label once a second, so its text is the
		* authoritative value — and unlike the plugin's own clocks it survives a page refresh, which
		* re-mounts the plugin but not the shell's store. The plugin hides that label with CSS while
		* it owns the line; it is never removed, so it stays readable. Measured from a user report:
		* the plugin's own clock read 8m 27s while the shell's own line read 10m 46s, the difference
		* being exactly the time since the refresh.
		* @param host - the running line element.
		* @returns elapsed ms, or undefined when the label is absent or carries no duration.
		*/
		function labelDuration(host) {
			if (host === null || host === undefined || typeof host.querySelector !== "function") return undefined;
			let label = null;
			try { label = host.querySelector('[class*="runningText"]'); } catch (_) { label = null; }
			if (label === null || label === undefined) return undefined;
			let text = "";
			try { text = String(label.textContent || ""); } catch (_) { text = ""; }
			const fromText = durationFromText(text);
			if (fromText !== undefined) return fromText;
			// The shell mirrors the same string onto a decoration copy through `data-shimmer-text`
			// (that is what its `::after` paints), so read that when the text nodes are empty.
			try {
				const copy = label.querySelector("[data-shimmer-text]");
				if (copy !== null && copy !== undefined && typeof copy.getAttribute === "function") {
					return durationFromText(String(copy.getAttribute("data-shimmer-text") || ""));
				}
			} catch (_) { /* fall through */ }
			return undefined;
		}
		/**
		* Elapsed ms for the line on screen, best source first.
		*
		* 1. the shell's own label — authoritative and refresh-proof ({@link labelDuration});
		* 2. the official start from the `turnTail` seat ({@link elapsedMs}), for a shell whose
		*    label is missing or carries no duration;
		* 3. the self-timer — the pre-0.7.0 fallback and the last resort.
		* @param host - the running line element.
		* @param now - `Date.now()`.
		* @returns elapsed ms, never negative.
		*/
		function elapsedFrom(host, now) {
			const shown = labelDuration(host);
			if (typeof shown === "number") return Math.max(0, shown);
			return elapsedMs(now);
		}
		/**
		* Elapsed milliseconds for the turn on screen.
		* @param now - `Date.now()`.
		* @returns elapsed ms, never negative.
		*/
		function elapsedMs(now) {
			const official = officialTurn.startTime;
			if (typeof official === "number" && Number.isFinite(official)) return Math.max(0, now - official);
			if (selfStart === 0) selfStart = now;
			return Math.max(0, now - selfStart);
		}
		/**
		* Format a duration exactly the way DSH 0.2's own `formatRunDuration` does: floor to
		* seconds, minutes past a minute, hours only when non-zero. Verified against DSH's
		* implementation over 13 inputs in both locales (0 differences).
		* @param ms - elapsed milliseconds.
		* @param locale - `"zh"` or `"en"`.
		* @returns e.g. `1分5秒` / `1m 5s`.
		*/
		function formatDuration(ms, locale) {
			const unit = DURATION_UNITS[locale] === void 0 ? DURATION_UNITS.en : DURATION_UNITS[locale];
			const total = Math.max(0, Math.floor(ms / 1000));
			const hours = Math.floor(total / 3600);
			const minutes = Math.floor(total / 60) % 60;
			const seconds = total % 60;
			let text = "";
			if (hours > 0) text += String(hours) + unit.hour;
			if (total >= 60) text += String(minutes) + unit.minute;
			return text + String(seconds) + unit.second;
		}
		/**
		* The "inline" clock: one animated string, the way the official label carries
		* `深度求索中，用时 1秒 ···`.
		* @param text - the quip.
		* @param ms - elapsed milliseconds.
		* @param locale - `"zh"` or `"en"`.
		* @returns the composed line.
		*/
		function withInlineClock(text, ms, locale) {
			const make = INLINE_CLOCK[locale] === void 0 ? INLINE_CLOCK.en : INLINE_CLOCK[locale];
			return make(text, formatDuration(ms, locale));
		}
		/**
		* Headless occupant of `conversation.chat.turnTail`. The shell mounts one of these per
		* turn tail in the transcript (finished turns included), so this component does not
		* assume it is the running turn: it offers whatever turn it was handed to
		* {@link recordTurnClock}, which keeps only an open one, and releases its own turn on
		* unmount. Renders nothing.
		* @param props.turn - official `TurnLocation` for the turn this tail belongs to.
		* @returns null (renders nothing).
		*/
		function TurnClockBridge({ turn }) {
			const number = turn === void 0 ? undefined : turn.turn;
			const status = turn === void 0 ? undefined : turn.status;
			const start = turn === void 0 || turn.start === void 0 ? undefined : turn.start.time;
			// Re-run on the fields that decide acceptance: a tail mounted while its turn was
			// still closed must reach the rules again when that turn opens.
			react.useEffect(() => {
				recordTurnClock(turn);
				return () => releaseTurnClock(number);
			}, [number, status, start]);
			return null;
		}

		// ── text effects: the official sweep, or the plugin's own wave ───────
		/**
		* Selectable status-text effects.
		*
		* The sweep is **DSH's own** `TextShimmer`, rendered by the plugin through the seeded
		* primitives: on 0.2 the visible label lives inside that component and is re-rendered
		* every second (it carries the elapsed time), so a plugin that owns the line can only
		* reproduce "the official sweep" by rendering that same component — which is what earlier
		* versions did under both the `shimmer` and `official` names. A hand-painted
		* `background-clip:text` copy of it existed too (`glow`, the pre-0.2 look); it was
		* indistinguishable from the official sweep side by side, so it was retired in favour of
		* one implementation (and one fewer failure mode: the copy was what the microtask freeze
		* came from). `shimmer` is the name saved in existing configs; a saved `official` or
		* `glow` now maps onto it.
		*
		* `wave` is the plugin's own effect and always was.
		*/
		const TEXT_EFFECTS = ["shimmer", "wave"];
		/** Where the elapsed time goes: off, inside the animated text, or beside it. */
		const CLOCK_MODES = ["off", "inline", "separate"];
		/** Wave timing at speed 1: cycle per token, stagger between tokens, lift. */
		const WAVE_CYCLE_MS = 1600;
		const WAVE_GAP_MS = 70;
		const WAVE_LIFT_PX = 3;
		/**
		* The elapsed-time vocabulary, copied from DSH 0.2's own `duration.*Unit` rows so
		* the plugin's clock reads exactly like the official one (including the English
		* units' trailing space, which is what makes "1m 0s" come out right).
		*/
		const DURATION_UNITS = {
			zh: { hour: "小时", minute: "分", second: "秒" },
			en: { hour: "h ", minute: "m ", second: "s" }
		};
		/**
		* The official sentence shapes: `chat.deepDivingFor` is
		* `深度求索中，用时 {duration} ···` / `Deep diving for {duration} ···`, so a quip
		* that carries the time inline reads as `{quip}，用时 {duration}` / `{quip} for
		* {duration}`.
		*/
		const INLINE_CLOCK = {
			zh: (text, duration) => text + "，用时 " + duration,
			en: (text, duration) => text + " for " + duration
		};
		/** Glyphs that animate one-per-character (CJK, kana, Hangul, CJK punctuation). */
		// ── wave tokens: begin ───────────────────────────────────────────────
		// Pure and sentinel-delimited: make-gallery.mjs lifts this block verbatim so the
		// README figure tokenises exactly like the plugin does.
		const CJK_GLYPH = /[\u1100-\u11ff\u2e80-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;
		/**
		* Split a status line into wave tokens: one token per CJK glyph, one per Latin
		* word (so "Deep diving..." is two tokens), with single spaces kept between them.
		* @param text - the line to split.
		* @returns tokens; `" "` marks a space.
		*/
		function waveTokens(text) {
			const out = [];
			let word = "";
			const flush = () => { if (word !== "") { out.push(word); word = ""; } };
			for (const ch of String(text == null ? "" : text)) {
				if (/\s/.test(ch)) {
					flush();
					if (out.length > 0 && out[out.length - 1] !== " ") out.push(" ");
					continue;
				}
				if (CJK_GLYPH.test(ch)) { flush(); out.push(ch); continue; }
				word += ch;
			}
			flush();
			// A trailing space would only add width and shift nothing (spaces get no --i).
			if (out.length > 0 && out[out.length - 1] === " ") out.pop();
			return out;
		}
		// ── wave tokens: end ─────────────────────────────────────────────────
		// ── effect containers ────────────────────────────────────────────────
		/** The wave container inside a line element, if it is there. */
		function waveSpan(el) {
			return el && typeof el.querySelector === "function" ? el.querySelector(".tq-wave") : null;
		}
		/** The container the official `TextShimmer` renders into. */
		function officialSpan(el) {
			return el && typeof el.querySelector === "function" ? el.querySelector(".tq-official") : null;
		}
		/** Drop one container if the DOM node supports removal. */
		function dropSpan(span) {
			if (span !== null && span !== void 0 && typeof span.remove === "function") span.remove();
		}
		/**
		* Remove every effect container except the one being rendered.
		*
		* One entry point for teardown, because the effects are a choice rather than a
		* stack: leaving a stale container behind is how two renderings end up on screen.
		* @param el - the effect target (the plugin's line, or the 0.1.x status element).
		* @param keep - `"wave"`, `"official"`, or undefined for none.
		*/
		function clearEffects(el, keep) {
			if (keep !== "wave") {
				dropSpan(waveSpan(el));
				try {
					if (el && el.classList && typeof el.classList.remove === "function") el.classList.remove("tq-waving");
				} catch (_) { /* no classList: the rule simply keeps applying */ }
			}
			if (keep !== "official") {
				unmountOfficial();
				dropSpan(officialSpan(el));
			}
		}
		/** Remove the wave container (switching back to the other effects). */
		function clearWave(el) { clearEffects(el, void 0); }

		// ── the official sweep, rendered by the plugin ───────────────────────
		/** Cached `@deepseek-ai/dsh-client-ui-primitives` lookup (`undefined` = not tried). */
		let primitivesModule;
		/** Cached `react-dom/client` lookup (`undefined` = not tried). */
		let reactDomModule;
		/**
		* The shell seeds `@deepseek-ai/dsh-client-ui-primitives` for every client plugin,
		* so DSH's own components can be reused instead of reimplemented. Looked up lazily
		* and cached: a shell without the seed must not break the plugin (every caller
		* checks the one export it needs and falls back).
		* @returns the module, or null.
		*/
		function primitives() {
			if (primitivesModule === void 0) {
				try {
					const mod = require("@deepseek-ai/dsh-client-ui-primitives");
					primitivesModule = mod !== null && mod !== void 0 && typeof mod === "object" ? mod : null;
				} catch (_) { primitivesModule = null; }
			}
			return primitivesModule;
		}
		/**
		* @returns the official `TextShimmer` component, or null.
		*/
		function officialShimmer() {
			const mod = primitives();
			return mod !== null && typeof mod.TextShimmer === "function" ? mod.TextShimmer : null;
		}
		/**
		* The official fish/whale logo, as the two plain values DSH's own `FishLogo`
		* component is built from. Read as a pair so a half-present export cannot produce a
		* wrong viewBox.
		* @returns `{ path, box }`, or null.
		*/
		function officialFish() {
			const mod = primitives();
			if (mod === null) return null;
			const path = mod.FISH_LOGO_PATH;
			const box = mod.FISH_LOGO_VIEWBOX;
			if (typeof path !== "string" || path === "" || box === null || box === void 0) return null;
			if (typeof box.width !== "number" || typeof box.height !== "number") return null;
			return { path, box };
		}
		/** @returns the official `StateDot` component, or null. */
		function officialStateDot() {
			const mod = primitives();
			return mod !== null && typeof mod.StateDot === "function" ? mod.StateDot : null;
		}
		/** @returns the official `Switch` component, or null. */
		function officialSwitch() {
			const mod = primitives();
			return mod !== null && typeof mod.Switch === "function" ? mod.Switch : null;
		}
		/** @returns the official `SegmentedControl` component, or null. */
		function officialSegmented() {
			const mod = primitives();
			return mod !== null && typeof mod.SegmentedControl === "function" ? mod.SegmentedControl : null;
		}
		/** @returns the official `Modal` component, or null. */
		function officialModal() {
			const mod = primitives();
			return mod !== null && typeof mod.Modal === "function" ? mod.Modal : null;
		}
		/**
		* `react-dom/client` (also a platform seed). Needed because the official shimmer is
		* a React component and the plugin paints into plain DOM.
		* @returns the module, or null.
		*/
		function reactDom() {
			if (reactDomModule === void 0) {
				try {
					const mod = require("react-dom/client");
					reactDomModule = mod !== null && mod !== void 0 && typeof mod.createRoot === "function" ? mod : null;
				} catch (_) { reactDomModule = null; }
			}
			return reactDomModule;
		}
		/** The live React root used for the official shimmer (at most one). */
		let officialRoot = null;
		/** The element that root is mounted in, so a new line unmounts the old root. */
		let officialHost = null;
		/** The text currently rendered, so the same text never re-renders (it would restart nothing, but costs a pass). */
		let officialText = null;
		/** Unmount the official shimmer root and forget it. */
		function unmountOfficial() {
			if (officialRoot !== null) {
				const root = officialRoot;
				officialRoot = null;
				officialHost = null;
				officialText = null;
				try { root.unmount(); } catch (_) { /* already gone */ }
			} else {
				officialHost = null;
				officialText = null;
			}
		}
		/**
		* Render `text` with DSH's own sweep component.
		* @param el - the effect target.
		* @param text - the line to show.
		* @returns whether the official primitive was available and rendered.
		*/
		function renderOfficial(el, text) {
			const Shimmer = officialShimmer();
			const client = reactDom();
			if (Shimmer === null || client === null || typeof document === "undefined" || typeof document.createElement !== "function") return false;
			if (officialHost !== el) unmountOfficial();
			let box = officialSpan(el);
			if (box === null) {
				box = document.createElement("span");
				box.className = "tq-official";
				if (typeof el.appendChild !== "function") return false;
				el.appendChild(box);
			}
			if (officialRoot === null) {
				try { officialRoot = client.createRoot(box); } catch (_) { officialRoot = null; return false; }
			}
			officialHost = el;
			if (officialText === text) return true;
			try {
				officialRoot.render(react.createElement(Shimmer, { active: true }, text));
			} catch (_) {
				unmountOfficial();
				dropSpan(box);
				return false;
			}
			officialText = text;
			return true;
		}
		/**
		* Write the quip as plain text into the line, with no effect at all.
		*
		* The last resort when the official sweep cannot be rendered (a 0.2 shell that seeds no
		* primitives): the quip stays readable, it just does not animate. There is deliberately
		* no second implementation of the sweep to fall back to — the plugin used to carry one
		* (`glow`) and it was indistinguishable from the official one side by side.
		*
		* Only writes when the value actually changes, and keeps a single text node: an
		* unconditional write would queue a mutation on every pass, which the plugin's own body
		* observer turns into another pass (the freeze fixed in the handover's §9).
		* @param el - the effect target.
		* @param text - the line to show.
		*/
		function renderPlain(el, text) {
			if (typeof document === "undefined" || typeof document.createTextNode !== "function") return;
			let node = quipNode(el);
			if (node === null) {
				node = document.createTextNode("");
				if (typeof el.appendChild !== "function") return;
				el.appendChild(node);
			}
			if (node.nodeValue !== text) node.nodeValue = text;
		}

		// ── text effects: the official sweep, or the wave ────────────────────
		/**
		* Update the wave's existing children IN PLACE when the token shape still matches.
		*
		* WHY THIS EXISTS: with the inline clock the line's text changes once a second, because
		* it carries the elapsed time. Rebuilding the items then restarts every token's animation
		* once a second — the same visible stutter as DSH re-creating the whole line. Writing the
		* new text into the nodes that are already there keeps the animation phase, and the
		* per-token `--i` stagger is unchanged because the shape is unchanged.
		* @param span - the `.tq-wave` container.
		* @param tokens - the new {@link waveTokens} output.
		* @returns whether the in-place path could be taken.
		*/
		function refreshWaveItems(span, tokens) {
			// `childNodes` in a browser, `children` in the offline stubs — the latter hold text
			// nodes in the same list, which is the shape this walk needs.
			const kids = span.childNodes !== void 0 ? span.childNodes : span.children;
			if (kids === void 0 || kids === null || kids.length !== tokens.length) return false;
			for (let i = 0; i < tokens.length; i += 1) {
				const kid = kids[i];
				const item = kid !== null && kid !== void 0 && kid.nodeType === 1
					&& kid.classList !== null && kid.classList !== void 0 && typeof kid.classList.contains === "function"
					&& kid.classList.contains("tq-waveItem");
				// A space must be a text node and a token must be an item; anything else means the
				// structure changed and a rebuild is the honest answer.
				if ((tokens[i] === " ") === item) return false;
			}
			for (let i = 0; i < tokens.length; i += 1) {
				if (tokens[i] === " ") continue;
				const kid = kids[i];
				const text = kid.firstChild;
				if (text !== null && text !== void 0 && text.nodeType === 3) {
					if (text.nodeValue !== tokens[i]) text.nodeValue = tokens[i];
				} else if (kid.textContent !== tokens[i]) {
					kid.textContent = tokens[i];
				}
			}
			return true;
		}
		/**
		* Draw the line as per-token spans so CSS can stagger them.
		*
		* On 0.1.x the label node DSH/React owns is KEPT and merely blanked: deleting a node
		* React still holds is how a plugin breaks the shell. On 0.2 the target is the
		* plugin's own line, which has no label node at all.
		* The rebuild is skipped when the text is unchanged — and when only the text of the
		* tokens changed (the once-a-second elapsed tick), the existing items are updated in
		* place instead of being replaced, so the wave never restarts on its own.
		* @param el - the effect target.
		* @param text - the line to show.
		*/
		function renderWave(el, text) {
			const node = quipNode(el);
			if (node !== null) {
				rememberLabel(el);
				node.nodeValue = ""; // keep the node, hide the plain text
			}
			let span = waveSpan(el);
			if (span === null) {
				span = document.createElement("span");
				span.className = "tq-wave";
				const after = node !== null && node.parentNode === el ? node.nextSibling : null;
				if (after !== null && after !== void 0 && typeof el.insertBefore === "function") el.insertBefore(span, after);
				else if (typeof el.appendChild === "function") el.appendChild(span);
			}
			// Tell the stylesheet the wave owns this line, so DSH's shimmer sweep can stop.
			if (typeof el.classList === "object" && el.classList !== null && typeof el.classList.add === "function") el.classList.add("tq-waving");
			if (span.getAttribute("data-text") === text) return;
			const tokens = waveTokens(text);
			if (refreshWaveItems(span, tokens)) { span.setAttribute("data-text", text); return; }
			span.setAttribute("data-text", text);
			while (span.firstChild) span.removeChild(span.firstChild);
			let index = 0;
			for (const token of tokens) {
				if (token === " ") { span.appendChild(document.createTextNode(" ")); continue; }
				const item = document.createElement("span");
				item.className = "tq-waveItem";
				item.style.setProperty("--i", String(index++));
				item.appendChild(document.createTextNode(token));
				span.appendChild(item);
			}
		}
		/**
		* Give the line back to DSH: drop every effect, restore the label the plugin hid,
		* and (on 0.2) drop the ownership marker so DSH's own label shows again. Called when
		* there is no quip to show (an empty section), which would otherwise leave the line
		* blank.
		* @param host - the running line element.
		*/
		function restoreStatusText(host) {
			const target = textTarget(host);
			clearEffects(target.el, void 0);
			if (target.modern) {
				try {
					if (typeof host.removeAttribute === "function") host.removeAttribute(OWNED_ATTR);
				} catch (_) { /* the marker is an optimisation */ }
				return;
			}
			const node = quipNode(host);
			if (node === null || node.nodeValue !== "") return;
			const saved = typeof host.getAttribute === "function" ? host.getAttribute("data-tq-label") : null;
			if (saved) node.nodeValue = saved;
		}
		/**
		* Put `text` on the running line with whichever effect is configured. The single
		* entry point, so switching effects can never leave two renderings on screen.
		*
		* `wave` paints the plugin's own nodes; the sweep renders DSH's own `TextShimmer`
		* component, because on 0.2 the official sweep lives inside that component and its label
		* is rewritten every second — see the effect list comment.
		* @param host - the running line element.
		* @param text - the quip to show.
		* @param cfg - the config (reads `textEffect`).
		*/
		function applyStatusText(host, text, cfg) {
			const effect = cfg && TEXT_EFFECTS.indexOf(cfg.textEffect) !== -1 ? cfg.textEffect : "shimmer";
			const target = textTarget(host);
			const el = target.el;
			if (el === null) return;
			if (effect === "wave") { clearEffects(el, "wave"); renderWave(el, text); return; }
			// The sweep. On 0.1.x it is left to DSH: there the sweep really is a rule on the
			// status element, so writing the label is all that is needed. On 0.2 it is DSH's own
			// component, rendered by the plugin through the seeded primitives.
			if (!target.modern) {
				if (officialSpan(el) === null && quickLabelWrite(el, text)) return;
				// The plugin is about to render its own copy, so hide DSH's plain label first.
				nodeBlanked(el);
			}
			if (renderOfficial(el, text)) {
				clearEffects(el, "official");
				return;
			}
			// No primitives to render (a 0.2 shell that seeds none): the quip goes in as plain
			// text. This is the only fallback left on purpose — see {@link renderPlain}.
			clearEffects(el, void 0);
			renderPlain(el, text);
		}
		/**
		* The 0.1.x `shimmer` path: write straight into the label node DSH already animates.
		* @param el - the status element.
		* @param text - the quip.
		* @returns whether a label node was written.
		*/
		function quickLabelWrite(el, text) {
			const node = quipNode(el);
			if (node === null) return false;
			clearEffects(el, void 0);
			if (node.nodeValue !== text) node.nodeValue = text;
			return true;
		}
		/**
		* Whether the target holds a DSH-owned plain label that must be hidden before the
		* plugin renders its own copy (the sweep on a 0.1.x shell).
		* @param el - the effect target.
		* @returns whether a label was blanked.
		*/
		function nodeBlanked(el) {
			const node = quipNode(el);
			if (node === null || node.nodeValue === "") return false;
			rememberLabel(el);
			node.nodeValue = "";
			return true;
		}

		// ── the elapsed-time readout ("beside the text") ─────────────────────
		/** The separate clock element inside a line, if it is there. */
		function clockSpan(el) {
			return el && typeof el.querySelector === "function" ? el.querySelector(".tq-clock") : null;
		}
		/**
		* The element the clock lives in: the plugin's own line on 0.2, the status element
		* on 0.1.x.
		* @param host - the running line element.
		* @returns the element, or null.
		*/
		function clockHost(host) {
			if (isModern(host)) return ensureLine(host);
			return host;
		}
		/**
		* Render the duration as its own grey note beside the text (the 0.1.x shape). It is
		* deliberately NOT part of the animated run: keeping it out means the quip's
		* animation is not restarted once per second by a changing duration.
		* @param host - the running line element.
		* @param ms - elapsed milliseconds.
		* @param locale - `"zh"` or `"en"`.
		*/
		function renderClock(host, ms, locale) {
			const line = clockHost(host);
			if (line === null || typeof document === "undefined" || typeof document.createElement !== "function") return;
			let span = clockSpan(line);
			if (span === null) {
				span = document.createElement("span");
				span.className = "tq-clock";
				if (typeof line.appendChild !== "function") return;
				line.appendChild(span);
			}
			const text = formatDuration(ms, locale);
			if (span.textContent !== text) span.textContent = text;
		}
		/** Remove the separate clock (inline and off modes must not leave one behind). */
		function clearClock(host) {
			const line = isModern(host) ? lineOf(host) : host;
			if (line !== null) dropSpan(clockSpan(line));
		}
		/**
		* Hand the visible label back to DSH without dropping the plugin's own icon. Used
		* by `indicatorOnly`, which by definition must not replace the status text.
		*
		* The plugin's own line is dropped with it: it is empty, and leaving it behind would make
		* it the icon's anchor ({@link iconAnchor}), pushing the icon back to the right of DSH's
		* text — the very thing `indicatorOnly` used to do wrong.
		* @param host - the running line element.
		*/
		function releaseOwnership(host) {
			if (host === null || host === void 0) return;
			if (isModern(host)) {
				// Deliberately NOT via `textTarget`: that would CREATE an empty line just to clear
				// it, and creating-then-removing a node on every pass is exactly the kind of churn
				// the plugin's own body observer turns into another pass (handover §9).
				const line = lineOf(host);
				if (line !== null) {
					clearEffects(line, void 0);
					dropSpan(clockSpan(line));
					dropSpan(line);
				}
				try {
					if (typeof host.removeAttribute === "function") host.removeAttribute(OWNED_ATTR);
				} catch (_) { /* the marker is an optimisation */ }
				return;
			}
			// 0.1.x: the status element IS the target, so clear the containers and restore the
			// label node DSH painted there.
			clearEffects(host, void 0);
			dropSpan(clockSpan(host));
			const node = quipNode(host);
			const saved = typeof host.getAttribute === "function" ? host.getAttribute("data-tq-label") : null;
			if (node !== null && node.nodeValue === "" && saved) node.nodeValue = saved;
		}
		/**
		* Child cells for one loader style. Each cell gets `--i` (its step index) unless
		* it is a `blank` (the orbit's empty center). `morph` is real SVG geometry rather than
		* cells, so it returns none.
		*/
		function loaderCells(style) {
			if (style === "orbit") {
				// Placed row-major into a 3x3 grid; the value is the clockwise ring index
				// (top-left(0), top-mid(1), top-right(2), mid-right(3), bottom-right(4),
				// bottom-mid(5), bottom-left(6), mid-left(7)); -1 is the empty center.
				return [0, 1, 2, 7, -1, 3, 6, 5, 4];
			}
			if (style === "dots" || style === "bars") return [0, 1, 2];
			if (style === "morph") return []; // drawn as SVG
			return [0]; // pulse: a single element
		}
		/**
		* The running morph loop's `requestAnimationFrame` HANDLE (at most one loop).
		*
		* It is a handle, not a function: it must be cancelled with `cancelAnimationFrame`.
		* Calling it (`morphStop()`) threw `morphStop is not a function` on every morph built
		* while another one was already looping, and because that throw happened inside
		* `ensureLoader`'s try/catch the icon was never appended — a second morph icon simply
		* never appeared. The gallery page in `preview/` builds three morph cells and lost two
		* of them, which is how this was found.
		*/
		let morphStop = null;
		/**
		* Build the morphing-shape indicator: one SVG path whose outline is rewritten
		* every frame (circle → rounded triangle → rounded square → circle) while the
		* whole shape turns with a little momentum. Runs off `requestAnimationFrame`
		* and stops itself as soon as the indicator leaves the document, so a turn that
		* ends costs nothing.
		* @param span - the `.tq-loader-morph` element to fill.
		*/
		function ensureMorph(span) {
			if (typeof document.createElementNS !== "function") return;
			const svg = document.createElementNS(SVG_NS, "svg");
			svg.setAttribute("viewBox", "0 0 " + MORPH_BOX + " " + MORPH_BOX);
			svg.setAttribute("aria-hidden", "true");
			svg.setAttribute("focusable", "false");
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("class", "tq-morphPath");
			// A still frame (and the reduced-motion state) is the plain circle.
			path.setAttribute("d", morphPath(0, 0));
			svg.appendChild(path);
			span.appendChild(svg);
			if (typeof requestAnimationFrame !== "function") return;
			try {
				if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
			} catch (_) { /* no matchMedia: animate */ }
			if (morphStop !== null) cancelAnimationFrame(morphStop);
			const started = Date.now();
			const frame = () => {
				if (span.isConnected === false || (span.isConnected === void 0 && typeof document.contains === "function" && !document.contains(span))) {
					morphStop = null;
					return;
				}
				try {
					// Date.now() on both sides: the requestAnimationFrame timestamp is a
					// different epoch and would produce a nonsense elapsed value. The frame
					// already carries its own rotation, so nothing sets a transform here.
					// The global speed multiplies elapsed time, i.e. divides every duration.
					const ms = (Date.now() - started) * speedOf(store().get());
					path.setAttribute("d", morphFrame(ms).d);
				} catch (_) { /* keep spinning is optional; never break the shell */ }
				morphStop = requestAnimationFrame(frame);
			};
			morphStop = requestAnimationFrame(frame);
		}
		/** The React root hosting the official `StateDot` loader (at most one). */
		let loaderRoot = null;
		/** The element that root is mounted in, so a rebuild unmounts the old one. */
		let loaderHost = null;
		/** Unmount the official-dot root and forget it (the span it lived in is gone). */
		function unmountLoaderIcon() {
			if (loaderRoot === null) { loaderHost = null; return; }
			const root = loaderRoot;
			loaderRoot = null;
			loaderHost = null;
			try { root.unmount(); } catch (_) { /* already gone */ }
		}
		/**
		* Build the official `StateDot` in its `ongoing` state — DSH's own spinner (a
		* `data-state="ongoing"` svg, 14px, animated by DSH's stylesheet).
		*
		* Rendered through a React root for the same reason the official shimmer is: the
		* component is React and this plugin paints plain DOM. The root lives inside the
		* plugin's own loader span, so DSH's CSS-module class names apply to it unchanged.
		* @param span - the `.tq-loader` element to fill.
		*/
		function ensureStateDot(span) {
			const Dot = officialStateDot();
			const client = reactDom();
			if (Dot === null || client === null || typeof document === "undefined" || typeof document.createElement !== "function") return;
			const box = document.createElement("span");
			box.className = "tq-dotBox";
			if (typeof span.appendChild !== "function") return;
			span.appendChild(box);
			if (loaderHost !== box) unmountLoaderIcon();
			if (loaderRoot === null) {
				try { loaderRoot = client.createRoot(box); } catch (_) { loaderRoot = null; return; }
			}
			loaderHost = box;
			try {
				loaderRoot.render(react.createElement(Dot, { state: "ongoing" }));
			} catch (_) {
				unmountLoaderIcon();
				dropSpan(box);
			}
		}
		/**
		* Build DSH's fish/whale mark from the seeded `FISH_LOGO_PATH` — the same two values
		* the official `FishLogo` component is made of, assembled into an SVG this plugin
		* owns (so no React root is needed for a still shape).
		*
		* It is deliberately NOT animated: DSH ships this mark static (the sidebar brand
		* mark), so spinning it here would invent motion the official one does not have.
		* It is the quiet option next to the six animated indicators.
		* @param span - the `.tq-loader` element to fill.
		*/
		function ensureFish(span) {
			const fish = officialFish();
			if (fish === null || typeof document.createElementNS !== "function") return;
			const svg = document.createElementNS(SVG_NS, "svg");
			svg.setAttribute("viewBox", "0 0 " + fish.box.width + " " + fish.box.height);
			svg.setAttribute("aria-hidden", "true");
			svg.setAttribute("focusable", "false");
			const shape = document.createElementNS(SVG_NS, "path");
			shape.setAttribute("class", "tq-fishPath");
			shape.setAttribute("d", fish.path);
			shape.setAttribute("fill", "currentColor");
			svg.appendChild(shape);
			span.appendChild(svg);
		}
		/**
		* The contributed sprite icons: geometry only, drawn by {@link ensureSprite}.
		*
		* WHY A TABLE INSTEAD OF A FUNCTION PER ICON: eight icons of two design families, all built
		* from the same three or four primitives, so a table keeps every coordinate reviewable in one
		* place — and it is what makes the "no px in the geometry" self-check possible (a rule that
		* walks this table instead of a human reading eight functions).
		*
		* The values are the delivered `viewBox` units, unrounded. `paint` is sugar for the two
		* things every part does: `"fill"` = `fill="currentColor"`, `"stroke"` = `stroke="currentColor"`
		* plus `fill="none"`; a part may instead carry explicit paint attributes in `attrs` (that is
		* how the stroked groups set one `stroke-width` for several children).
		*
		* `frame` is the `viewBox` the sprite is drawn through: a square, measured over one animation
		* cycle in a real browser, that contains everything the sprite draws. The delivered 24-unit box
		* is the COORDINATE space (the geometry below is untouched, and the delivery comparison checks it
		* against the SVG files), but drawing it whole leaves the content filling 17%-86% of a 1em box —
		* the jelly block is 42%, the bead track 56%, the bouncing ball 33% — which reads as "small next
		* to the text" (reported). Framing each sprite on its own content makes one icon as big as the
		* next, and scales its motion with it (the bead's 10.4-unit run is the same fraction of the box).
		*
		* Every part that carries a class also carries the `tq-sprite` marker, and the stylesheet only
		* ever animates classed parts — so ONE reduced-motion rule can freeze whatever is animated,
		* including sprites added later. (Static parts carry the marker too; the class is what decides,
		* and the self-check asserts that every class the stylesheet animates is in the markup.)
		*
		* Anchors: each animated part is wrapped in a `<g transform="translate(…)">` and rotates or
		* squashes about `transform-origin:0 0`, i.e. about the point that group puts at the origin
		* (an axis, a bottom centre, a box centre). That is the delivered convention, and it is also
		* what the stylesheet's per-icon rules assume.
		*
		* Transient parts (bonk's sparks) ship with a static `opacity="0"`: CSS animations outrank the
		* attribute while they run, so the part shows only during its keyframes, and a stopped
		* animation leaves it invisible — which is exactly what the design's still frame asks for.
		*/
		const LOADER_SPRITES = {
			// Busy Bits 02 — a block that squashes onto the ground and springs back.
			jelly: {
				frame: { x: 6.63, y: 6.5, size: 10.75 },
				parts: [{
					tag: "g",
					attrs: { transform: "translate(12 16.8)" },
					parts: [{ tag: "rect", cls: "tq-jelly-body", paint: "fill", attrs: { x: -4.7, y: -9.4, width: 9.4, height: 9.4, rx: 2.7 } }]
				}]
			},
			// Busy Bits 03 — a metronome arm swinging between two walls.
			tickTock: {
				frame: { x: 4.59, y: 5.79, size: 14.83 },
				parts: [{
					tag: "g",
					attrs: { transform: "translate(12 13.6)", "stroke-width": 2.4, "stroke-linecap": "round" },
					parts: [
						{ tag: "path", cls: "tq-tick-case", paint: "stroke", attrs: { d: "M-5.6 6.6 L-2.2 -0.8 M5.6 6.6 L2.2 -0.8 M-6.2 6.6 H6.2" } },
						{ tag: "line", cls: "tq-tick-arm", paint: "stroke", attrs: { x1: 0, y1: 1, x2: 0, y2: -7.4 } },
						{ tag: "circle", cls: "tq-tick-pivot", paint: "fill", attrs: { r: 1.9 } }
					]
				}]
			},
			// Busy Bits 05 — a mallet taps an 8×8 block; the sparks are transient.
			bonk: {
				frame: { x: 4.05, y: -0.37, size: 16.03 },
				parts: [
					{
						tag: "g",
						attrs: { transform: "translate(12.85 4.75) rotate(45)", "stroke-width": 2.4, "stroke-linecap": "round" },
						parts: [{ tag: "line", cls: "tq-bonk-stick", paint: "stroke", attrs: { x1: 0, y1: -6.6, x2: 0, y2: 1.2 } }]
					},
					{
						tag: "g",
						attrs: { transform: "translate(12 15.2)" },
						parts: [{ tag: "rect", cls: "tq-bonk-block", paint: "fill", attrs: { x: -4, y: -8, width: 8, height: 8, rx: 2.2 } }]
					},
					{
						// The sparks are ONE animated group in the delivery (the class sits on the `<g>`,
						// not on the two lines) and their `opacity="0"` is there as well — so a stopped
						// animation leaves the whole pair invisible, which is the still frame.
						tag: "g",
						cls: "tq-bonk-spark",
						attrs: { "stroke-width": 2.4, "stroke-linecap": "round", stroke: "currentColor", opacity: 0 },
						parts: [
							{ tag: "line", attrs: { x1: 8.6, y1: 5.4, x2: 6.6, y2: 3.4 } },
							{ tag: "line", attrs: { x1: 15.4, y1: 5.4, x2: 17.4, y2: 3.4 } }
						]
					}
				]
			},
			// Busy Bits 06 — a three-blade pinwheel turning about the box centre.
			pinwheel: {
				frame: { x: 1, y: 1.01, size: 22 },
				parts: [{
					tag: "g",
					attrs: { transform: "translate(12 12)" },
					parts: [{
						tag: "g",
						cls: "tq-pinwheel-rot",
						attrs: { fill: "currentColor" },
						parts: [
							{ tag: "ellipse", attrs: { cx: 0, cy: -5.8, rx: 2.8, ry: 4.2 } },
							{ tag: "ellipse", attrs: { cx: 0, cy: -5.8, rx: 2.8, ry: 4.2, transform: "rotate(120)" } },
							{ tag: "ellipse", attrs: { cx: 0, cy: -5.8, rx: 2.8, ry: 4.2, transform: "rotate(240)" } },
							{ tag: "circle", attrs: { r: 1.9 } }
						]
					}]
				}]
			},
			// Busy Bits 07 — two rings pulsing outwards half a cycle apart.
			ripple: {
				frame: { x: 2.18, y: 2.18, size: 19.63 },
				parts: [{
					tag: "g",
					attrs: { transform: "translate(12 12)", "stroke-width": 2.4, fill: "none", stroke: "currentColor" },
					parts: [
						{ tag: "circle", cls: "tq-ripple-wave1", attrs: { r: 9.6 } },
						{ tag: "circle", cls: "tq-ripple-wave2", attrs: { r: 9.6 } }
					]
				}]
			},
			// Busy Bits 08 — a bead running the track and reappearing at the start.
			beadRun: {
				frame: { x: 4.37, y: 4.37, size: 15.26 },
				parts: [{
					tag: "g",
					attrs: { transform: "translate(12 12)" },
					parts: [
						{ tag: "line", paint: "stroke", attrs: { x1: -5.2, y1: 0, x2: 5.2, y2: 0, "stroke-width": 2.4, "stroke-linecap": "round" } },
						{ tag: "circle", cls: "tq-bead-run", paint: "fill", attrs: { cx: -5.2, r: 2 } }
					]
				}]
			},
			// Bouncy Pals 02 — two four-point stars blooming in turn (one keyframe set, half a
			// cycle of delay between them; the delivered files spell the same thing out twice).
			sparkleSwap: {
				frame: { x: 3.6, y: 3.6, size: 15.36 },
				parts: [
					{
						tag: "g",
						attrs: { transform: "translate(8.2 8.4)" },
						parts: [{ tag: "path", cls: "tq-sparkle-big", paint: "fill", attrs: { d: "M0 -4.6 Q1.1 -1.1 4.6 0 Q1.1 1.1 0 4.6 Q-1.1 1.1 -4.6 0 Q-1.1 -1.1 0 -4.6 Z" } }]
					},
					{
						tag: "g",
						attrs: { transform: "translate(15.8 15.6) scale(.62)" },
						parts: [{ tag: "path", cls: "tq-sparkle-small", paint: "fill", attrs: { d: "M0 -4.6 Q1.1 -1.1 4.6 0 Q1.1 1.1 0 4.6 Q-1.1 1.1 -4.6 0 Q-1.1 -1.1 0 -4.6 Z" } }]
					}
				]
			},
			// Bouncy Pals 03 — a ball bouncing on its own soft shadow. Drawn in the delivered order
			// (shadow first): the two never overlap, but the port has no reason to differ.
			bounceBall: {
				frame: { x: 3.92, y: 4.14, size: 16.17 },
				parts: [
					{
						tag: "g",
						attrs: { transform: "translate(12 18.8)" },
						parts: [{ tag: "ellipse", cls: "tq-bounce-shadow", paint: "fill", attrs: { rx: 2.7, ry: 1.05, transform: "scale(.68)" } }]
					},
					{
						tag: "g",
						attrs: { transform: "translate(12 11.4)" },
						parts: [{ tag: "circle", cls: "tq-bounce-ball", paint: "fill", attrs: { cy: -3.4, r: 3.4 } }]
					}
				]
			}
		};
		/**
		* Draw one {@link LOADER_SPRITES} icon into the loader span.
		*
		* The `viewBox` is the sprite's own `frame` (see {@link LOADER_SPRITES}); CSS sizes the `<svg>`
		* to `1em`, so the drawing scales with the content font size (see `.tq-loader-sprites svg`)
		* exactly like the plugin's own em-based icons — no width or height is ever written into the
		* markup.
		* @param span - the `.tq-loader` element to fill.
		* @param spec - one entry of {@link LOADER_SPRITES}.
		*/
		function ensureSprite(span, spec) {
			if (typeof document.createElementNS !== "function" || spec === void 0) return;
			const svg = document.createElementNS(SVG_NS, "svg");
			const frame = spec.frame;
			svg.setAttribute("viewBox", frame.x + " " + frame.y + " " + frame.size + " " + frame.size);
			svg.setAttribute("aria-hidden", "true");
			svg.setAttribute("focusable", "false");
			const paint = (node, part) => {
				if (part.paint === "fill") node.setAttribute("fill", "currentColor");
				else if (part.paint === "stroke") {
					node.setAttribute("fill", "none");
					node.setAttribute("stroke", "currentColor");
				}
				const attrs = part.attrs || {};
				for (const key of Object.keys(attrs)) node.setAttribute(key, String(attrs[key]));
				return node;
			};
			const build = (parts, parent) => {
				for (const part of parts) {
					const node = document.createElementNS(SVG_NS, part.tag);
					if (part.cls !== void 0) node.setAttribute("class", part.cls + " tq-sprite");
					paint(node, part);
					build(part.parts || [], node);
					parent.appendChild(node);
				}
			};
			build(spec.parts, svg);
			span.appendChild(svg);
		}
		/**
		* DSH's own running-line whale, found by its CSS-module **local name** and never by
		* the build-generated hash (`EvIC1a_…` changes on any rebuild; `runningIcon` does
		* not). The wrapper we inject into is searched, so the plugin's own copy — which
		* carries the same class tokens by design — is skipped.
		* @param host - the running wrapper.
		* @returns the icon element, or null.
		*/
		function officialWhaleNode(host) {
			try {
				if (!host || typeof host.querySelectorAll !== "function") return null;
				const found = host.querySelectorAll('[class*="runningIcon"]');
				for (const el of found) {
					// Anything inside our own loader is our copy, not DSH's.
					let up = el.parentNode;
					let mine = false;
					while (up && up !== host) {
						const cls = typeof up.className === "string" ? up.className : "";
						if (cls.indexOf("tq-loader") !== -1) { mine = true; break; }
						up = up.parentNode;
					}
					if (!mine) return el;
				}
			} catch (_) { /* no live line: the caller degrades */ }
			return null;
		}
		/** Cached CSSOM mask lookup: `undefined` = not tried, `null` = not found. */
		let whaleMaskValue;
		/**
		* Find the `url(data:image/png;base64,…)` the official stylesheet paints the whale
		* with, by walking the live CSSOM.
		*
		* Two details make this work. The rule is nested (`@supports` → `@media` → rule), so
		* a flat scan of `sheet.cssRules` never reaches it and the walk has to recurse. And
		* the sheet is a plain same-origin `<style>` — the chat package tags it with
		* `data-plugin-css` — so `cssRules` is readable while a foreign sheet would throw
		* (those are skipped).
		* @returns the mask value (`url("…")`), or null.
		*/
		function officialWhaleMask() {
			// Only a POSITIVE result is cached: the chat package injects its stylesheet around
			// the same time this plugin runs, so a miss may just mean "not yet". The walk is
			// only reached when there is no whale node to copy, so re-trying costs little.
			if (whaleMaskValue !== void 0 && whaleMaskValue !== null) return whaleMaskValue;
			try {
				const sheets = (typeof document !== "undefined" && document.styleSheets) || [];
				for (const sheet of sheets) {
					let rules = null;
					try { rules = sheet.cssRules; } catch (_) { continue; }
					const found = deepMask(rules, 0);
					if (found !== null) { whaleMaskValue = found; return found; }
				}
			} catch (_) { /* no readable stylesheets: the caller degrades */ }
			whaleMaskValue = null;
			return null;
		}
		/**
		* Recursive part of {@link officialWhaleMask}. Grouping rules are entered (with a
		* depth cap so a pathological sheet cannot hang the pass), and only a rule that both
		* mentions `running` and carries an embedded PNG counts — a mask with a plain image
		* URL is somebody else's.
		* @param rules - a `CSSRuleList`.
		* @param depth - the current nesting depth.
		* @returns the mask value, or null.
		*/
		function deepMask(rules, depth) {
			if (!rules || depth > 6) return null;
			for (const rule of rules) {
				if (rule && rule.style && typeof rule.style.getPropertyValue === "function") {
					const raw = rule.style.getPropertyValue("mask-image") || rule.style.getPropertyValue("mask");
					if (typeof raw === "string" && raw.indexOf("data:image/png;base64,") !== -1 && /running/i.test(String(rule.selectorText || ""))) {
						const m = /url\((['"]?)(data:image\/png;base64,[^'")]+)\1\)/.exec(raw);
						if (m) return 'url("' + m[2] + '")';
					}
				}
				const nested = rule && rule.cssRules ? deepMask(rule.cssRules, depth + 1) : null;
				if (nested !== null) return nested;
			}
			return null;
		}
		/**
		* Where the `native` icon comes from, in preference order: DSH's live icon node
		* (cloned — byte-identical, and it carries both the animated mask span and the
		* static SVG fallback, so the official `@supports`/`prefers-reduced-motion` gating
		* keeps working for free) and, when no running line has ever mounted, the mask read
		* out of the official stylesheet.
		* @param host - the running wrapper.
		* @returns `{ kind: "node", node }`, `{ kind: "mask", mask }`, or null.
		*/
		function nativeWhaleSource(host) {
			const node = officialWhaleNode(host);
			if (node !== null && typeof node.cloneNode === "function") return { kind: "node", node };
			const mask = officialWhaleMask();
			if (mask !== null) return { kind: "mask", mask };
			return null;
		}
		/**
		* Draw DSH's whale in the plugin's own loader span.
		*
		* The clone keeps the official class tokens, so DSH's own stylesheet paints it and
		* keeps deciding between the 60-frame APNG mask and the still SVG. The original is
		* then hidden by {@link ICON_ATTR} + CSS: the whale is one of the selectable icons, so
		* it must not also sit next to whatever else was picked.
		* @param span - the `.tq-loader` element to fill.
		* @param source - the value of {@link nativeWhaleSource} (never null here).
		*/
		function ensureNative(span, source) {
			let mask = source.kind === "mask" ? source.mask : null;
			if (source.kind === "node") {
				let copy = null;
				try { copy = source.node.cloneNode(true); } catch (_) { copy = null; }
				if (copy !== null) {
					span.appendChild(copy);
					return;
				}
				// The node refused to clone (astronomically unlikely: resolveLoader only chose
				// `native` because it exists). Try the stylesheet before giving up.
				mask = officialWhaleMask();
			}
			if (mask === null) return;
			// No live node (or it refused to clone): paint our own span with the official
			// mask. The shorthand's tail (position/size/repeat/mode) is not repeated here —
			// only the image comes from the sheet.
			const style = span.style;
			if (!style || typeof style.setProperty !== "function") return;
			style.setProperty("background", "currentColor");
			style.setProperty("mask-image", mask);
			style.setProperty("mask-mode", "alpha");
			style.setProperty("mask-repeat", "no-repeat");
			style.setProperty("mask-position", "50%");
			style.setProperty("mask-size", "100% 100%");
			style.setProperty("-webkit-mask-image", mask);
		}
		/**
		* The icon actually drawn for a configured style.
		*
		* The three official options need a source an older shell may not have, and the
		* plugin must never go blank because of that (fail-soft is a hard rule). The
		* stand-ins are chosen to be the nearest thing the plugin already draws: the
		* official spinner falls back to the plugin's own spinner, and the official marks
		* fall back to the default orbit.
		* @param style - a value already validated against {@link LOADER_STYLES}.
		* @param host - the running line element (unused by the current fallbacks).
		* @param nativeSource - the already-acquired `native` source, or null.
		* @returns the style to draw.
		*/
		function resolveLoader(style, host, nativeSource) {
			void host;
			if (style === "stateDot") return officialStateDot() !== null && reactDom() !== null ? "stateDot" : "orbit";
			if (style === "fish") return officialFish() !== null ? "fish" : "orbit";
			if (style === "native") return nativeSource === null || nativeSource === void 0 ? "orbit" : "native";
			return style;
		}
		/**
		* The element the plugin's icon belongs immediately BEFORE.
		*
		* That is "whatever renders the status text": the plugin's own `.tq-line` when it owns the
		* text, and DSH's own label when the text was handed back (`indicatorOnly`). Appending the
		* icon instead only looked right while the plugin was the one writing the text — with DSH's
		* label visible, the appended icon landed after it, i.e. after the text.
		* @param el - the running wrapper.
		* @returns the anchor element, or null when there is nothing to anchor on.
		*/
		function iconAnchor(el) {
			try {
				const line = lineOf(el);
				if (line !== null) return line;
				return typeof el.querySelector === "function" ? el.querySelector('[class*="runningText"]') : null;
			} catch (_) { return null; }
		}
		/**
		* Inject the loading indicator as the first child of the status element, and
		* re-render it when the configured style or size changes.
		*
		* The size is tracked as a `data-scale` attribute as well as the CSS variable,
		* because comparing the style alone is not enough: a size-only change used to
		* hit the "already correct" return and never rescale, so picking a different
		* size in the settings did nothing until the style changed or a new turn
		* rebuilt the element. When only the size differs the icon is rescaled IN PLACE
		* so a running animation (the morph's frame loop in particular) survives.
		* @param el - the running-status element.
		* @param style - one of {@link LOADER_STYLES}.
		* @param size - `sm` | `md` | `lg`.
		*/
		/**
		* Round the equalizer's bar and gap lengths to WHOLE DEVICE PIXELS.
		*
		* WHY THIS EXISTS: that geometry is `em`-based, so at a 17px base (16px + a 1px font delta) a
		* bar is 3.1875px = 6.375 device pixels at 2x. Chromium rounds every box edge to the device
		* grid INDEPENDENTLY, so the three bars painted 6/8/6 device pixels wide and the middle one
		* read as "sits too far left" (reported from the settings preview; the 6/8/6 was reproducible
		* in an element screenshot). Rounding both lengths to a multiple of 1/DPR puts every edge back
		* on the device grid, leaving only a uniform shift of the whole group — which stays symmetric.
		*
		* Written back as custom properties; the stylesheet's `em` values are the no-JS fallback.
		* @param bars - the `.tq-loader-bars` element, or null.
		*/
		function snapBarsGeometry(bars) {
			try {
				if (bars === null || bars === void 0 || typeof getComputedStyle !== "function") return;
				if (typeof bars.style === "undefined" || typeof bars.style.setProperty !== "function") return;
				const base = parseFloat(getComputedStyle(bars).fontSize);
				if (!(base > 0)) return;
				const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1;
				// The size ladder is applied HERE rather than through the shared transform, and the style
				// opts out of that transform (:`transform:none`): a transform rounds the layout to device
				// pixels FIRST and scales afterwards, so pre-transform and post-transform edges cannot both
				// land on the grid unless DPR x scale is an integer (it is 1.6 for sm and 2.5 for lg at the
				// default sizes). Computing the scaled lengths here lets every edge be snapped to a whole
				// device pixel for all three sizes — same reasoning that makes `native` size its own box.
				const scale = parseFloat(bars.style.getPropertyValue("--tq-loader-scale")) || 1;
				const snap = (px) => Math.max(1 / dpr, Math.round(px * dpr) / dpr);
				const width = snap(base * 0.1875 * scale) + "px"; // 3/16em
				const gap = snap(base * 0.125 * scale) + "px";    // 2/16em
				const height = snap(base * 0.8125 * scale) + "px"; // 13/16em
				const set = (name, value) => { if (bars.style.getPropertyValue(name) !== value) bars.style.setProperty(name, value); };
				set("--tq-bar-w", width);
				set("--tq-bar-gap", gap);
				set("--tq-bar-h", height);
			} catch (_) { /* the stylesheet's em values still draw it */ }
		}
		function ensureLoader(el, style, size) {
			try {
				if (!el || typeof el.querySelector !== "function") return;
				// The plugin's icon goes into DSH's own flex row without touching DSH's node;
				// `ICON_ATTR` then tells the stylesheet to retire that node, so exactly one
				// indicator shows (the whale is one of the choices, not a permanent neighbour).
				const container = visibleContent(el);
				if (container === null || typeof container.insertBefore !== "function" || typeof container.appendChild !== "function") return;
				const requested = LOADER_STYLES.indexOf(style) !== -1 ? style : "orbit";
				// Acquired once, here, so the style that is decided is the style that can
				// actually be drawn (no half-decided `native`).
				const nativeSource = requested === "native" ? nativeWhaleSource(el) : null;
				const want = resolveLoader(requested, el, nativeSource);
				const scale = String(LOADER_SCALES[size] || 1);
				const existing = el.querySelector(".tq-loader");
				if (existing !== null) {
					// `data-style` is what the user picked and `data-effective` is what got
					// drawn: they differ while an official option is degraded, and both have to
					// match for the node on screen to be the right one.
					const sameStyle = existing.getAttribute("data-style") === requested && existing.getAttribute("data-effective") === want;
					if (sameStyle && existing.getAttribute("data-scale") === scale) {
						// Nothing to redraw, but the icon may still be in the wrong place (an older
						// version appended it, and a live line can be reordered by whatever owns it).
						// Repair only when it IS wrong: an unconditional insertBefore would queue a
						// mutation record on every pass, and the plugin's own body observer would turn
						// that into the microtask loop fixed in §9 of the handover.
						// `previousElementSibling`, not `previousSibling`: a whitespace text node
						// between the two would make the check read "misplaced" on every pass.
						const anchor = isModern(el) ? iconAnchor(el) : null;
						if (anchor !== null && anchor.parentNode === container && anchor.previousElementSibling !== existing) {
							container.insertBefore(existing, anchor);
						}
						// The line element may have been replaced (see adoptNodes): the icon came
						// along, but the mark that retires DSH's own indicator lives on the OLD
						// element. Re-write it — only when it is actually missing, so a settled line
						// stays untouched.
						try {
							if (typeof el.getAttribute === "function" && el.getAttribute(ICON_ATTR) !== want && typeof el.setAttribute === "function") {
								el.setAttribute(ICON_ATTR, want);
							}
						} catch (_) { /* the mark is an optimisation: the icon still shows */ }
						return; // already correct
					}
					if (sameStyle) {
						existing.setAttribute("data-scale", scale);
						existing.style.setProperty("--tq-loader-scale", scale);
						return;
					}
					if (typeof existing.remove === "function") existing.remove();
					unmountLoaderIcon(); // the span the official dot was rooted in is gone
				}
				const span = document.createElement("span");
				// Contributed sprites carry one extra marker class, so the shared box rules and the
				// reduced-motion freeze are written ONCE against `.tq-loader-sprites` / `.tq-sprite`
				// instead of once per icon (and a sprite added later inherits both).
				span.className = "tq-loader tq-loader-" + want + (LOADER_SPRITES[want] === void 0 ? "" : " tq-loader-sprites");
				span.setAttribute("data-style", requested);
				span.setAttribute("data-effective", want);
				span.setAttribute("data-scale", scale);
				span.style.setProperty("--tq-loader-scale", scale);
				if (want === "morph") {
					ensureMorph(span);
				} else if (want === "stateDot") {
					ensureStateDot(span);
				} else if (want === "fish") {
					ensureFish(span);
				} else if (LOADER_SPRITES[want] !== void 0) {
					ensureSprite(span, LOADER_SPRITES[want]);
				} else if (want === "native") {
					ensureNative(span, nativeSource);
				} else {
					for (const v of loaderCells(want)) {
						const cell = document.createElement("i");
						if (v === -1) cell.className = "blank";
						else cell.style.setProperty("--i", String(v));
						span.appendChild(cell);
					}
				}
				// 0.2: the icon belongs immediately BEFORE whatever renders the text — the plugin's
				// own line, or DSH's label once the text was handed back — in DSH's flex row (whose
				// own icon the stylesheet retires). Appending instead sent the icon to the END of
				// the line in `indicatorOnly` mode, and the moment the user picked a different style
				// mid-turn (the line already existed by then). Anchoring is also self-healing:
				// wherever the icon ended up before, the next pass puts it back.
				// 0.1.x: left of the label, exactly as before.
				if (isModern(el)) {
					const anchor = iconAnchor(el);
					if (anchor !== null && anchor.parentNode === container) container.insertBefore(span, anchor);
					else container.appendChild(span);
				} else {
					container.insertBefore(span, container.firstChild);
				}
				// Marked only once the icon is really on screen, so a failed injection never
				// leaves DSH without its own indicator.
				try {
					if (typeof el.setAttribute === "function") el.setAttribute(ICON_ATTR, want);
				} catch (_) { /* the mark is an optimisation: the icon still shows */ }
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

		// ── colour override ──────────────────────────────────────────────────
		const COLOR_STYLE_ID = "dsh-thinking-quips-color";
		/** The plugin's own colour, re-applied to every new running line. */
		const hostColor = { base: null, sweep: null };
		/**
		* Write the current colour onto a running wrapper.
		*
		* Inline variables are used rather than `:root` rules so only this line is tinted:
		* `--tq-base` feeds the plugin's own nodes (the line and the wave),
		* `--dsw-alias-label-deep-diving` is DSH's own running-text colour — writing it too is what
		* keeps the icon and a *handed-back* label (see `indicatorOnly`) the same colour instead of
		* one custom and one default — and `--dsw-alias-label-shimmer` is the official sweep's
		* highlight, i.e. the brightness control.
		*
		* `base` and `sweep` are tracked separately so the brightness can be adjusted **without**
		* recolouring the text: with the default colour there is no base override at all (DSH paints
		* its own text) and only the sweep is written.
		* @param host - the running wrapper, or null.
		*/
		function paintHost(host) {
			if (host === null || host === void 0) return;
			if (hostColor.base === null && hostColor.sweep === null) return;
			try {
				const style = host.style;
				if (!style || typeof style.setProperty !== "function") return;
				if (hostColor.sweep !== null) style.setProperty("--dsw-alias-label-shimmer", hostColor.sweep);
				if (hostColor.base !== null) {
					style.setProperty("--tq-base", hostColor.base);
					style.setProperty("--dsw-alias-label-deep-diving", hostColor.base);
				}
			} catch (_) { /* inline variables are best-effort */ }
		}
		/**
		* Remember the palette and apply it to the line that is on screen now.
		* @param base - the text colour to force, or null to leave DSH's own text alone.
		* @param sweep - the sweep's highlight colour, or null to leave DSH's own sweep alone.
		*/
		function tintHost(base, sweep) {
			hostColor.base = base;
			hostColor.sweep = sweep;
			paintHost(runningStatus());
		}
		/** Drop the overrides (the default brand-blue state: DSH paints everything itself). */
		function clearHostColor() {
			const host = runningStatus();
			hostColor.base = null;
			hostColor.sweep = null;
			try {
				if (host && host.style && typeof host.style.removeProperty === "function") {
					host.style.removeProperty("--tq-base");
					host.style.removeProperty("--dsw-alias-label-shimmer");
					host.style.removeProperty("--dsw-alias-label-deep-diving");
				}
			} catch (_) { /* nothing to clean */ }
		}
		/**
		* Apply the configured colour and sweep brightness.
		*
		* Three cases, and the difference between them is the point:
		* - **default colour at the default brightness** — nothing is written at all, so DSH's own
		*   shimmer (its bundled text/sweep token pair) keeps painting the line untouched;
		* - **default colour, another brightness** — only `--dsw-alias-label-shimmer` is written, so
		*   the text keeps DSH's colour and just the sweep gets brighter or dimmer;
		* - **a custom colour** — the text, the plugin's own nodes and the sweep all follow it, with
		*   the sweep mixed toward white by the brightness.
		*
		/**
		* The rainbow stylesheet.
		*
		* The line's colour is animated through the six fitted stops, and the icon cycles with it
		* (every icon shape paints with `currentColor`); a 0.1.x status element gets the same
		* animation. Reduced motion freezes the colour **at the leading stop** rather than dropping
		* the animation — `animation:none` alone would leave DSH's own colour, i.e. no rainbow at all
		* (measured: the line fell back to `rgb(43, 83, 199)`).
		*
		* WHY THE COLOUR IS ANIMATED INSTEAD OF PAINTING A CLIPPED GRADIENT (measured, and the first
		* version of this feature got it wrong): the shell renders its visible label through a
		* PSEUDO-ELEMENT — `<span class="text" data-shimmer-text="…"></span>` plus
		* `::after { content: attr(data-shimmer-text) }` — and a `background-clip: text` background on
		* the ancestor does not paint pseudo-element glyphs. With `-webkit-text-fill-color: transparent`
		* on the line the text vanished and only the icon was left (reported by the user). `color`
		* inherits into the pseudo-element, so this cannot hide anything, whatever the effect is.
		*
		* WHY IT ALSO DRIVES DSH'S OWN TOKENS (the second report: "with the rainbow the icon and the
		* text do not transition together"): the shell's visible text is painted by `TextShimmer` from
		* `--dsw-alias-label-deep-diving` / `--dsw-alias-label-shimmer`, NOT from `color`, so animating
		* `color` moved the icon while the text sat on whatever static value those tokens held — the
		* sweep token was a fixed `#f06666` from the leading stop (measured: the line cycled through
		* six hues while the sweep never changed). A keyframe cannot animate a custom property unless it
		* is registered, so `--tq-ink` is declared as a `<color>` through `@property` and the animation
		* writes it alongside `color`; the two tokens then read the same live value. An engine without
		* `@property` steps through the stops instead of interpolating, and one without `color-mix`
		* drops the highlight declaration and keeps the static sweep written by `paintHost`.
		* @param bg - the app background the stops are fitted against.
		* @param glow - the sweep brightness, 0-100 (the highlight stays a brighter version of the hue).
		* @returns the CSS text.
		*/
		function rainbowCSS(bg, glow) {
			const stops = rainbowStops(bg);
			const speed = "calc(6s / var(--tq-speed,1))";
			const at = (i) => Math.round((i / stops.length) * 100) + "%";
			const ink = stops.map((color, i) => at(i) + "{color:" + color + ";--tq-ink:" + color + "}").join("")
				+ "100%{color:" + stops[0] + ";--tq-ink:" + stops[0] + "}";
			const flow = "animation:tq-rainbow-ink " + speed + " linear infinite !important";
			const share = Math.max(0, Math.min(100, 100 - (Number.isFinite(glow) ? glow : 0)));
			return ""
				+ "@property --tq-ink{syntax:\"<color>\";inherits:true;initial-value:" + stops[0] + "}"
				+ ".tq-line,.tq-wave{--tq-ink:" + stops[0]
				+ ";--dsw-alias-label-deep-diving:var(--tq-ink)"
				+ ";--dsw-alias-label-shimmer:color-mix(in srgb, var(--tq-ink) " + share + "%, white)"
				+ ";" + flow + "}"
				+ ".tq-loader{" + flow + "}"
				// The shell's own base glyphs: `TextShimmer`'s `.text` carries an EXPLICIT colour
				// rather than a token (measured: it stayed `rgb(43, 83, 199)` while the sweep followed
				// the hue), so the token routing above cannot reach it. `data-shimmer-text` is the
				// stable attribute the plugin already reads for the elapsed clock, and the visible
				// glyphs are that element's `::after`, which inherits from it.
				+ ".tq-line [data-shimmer-text]{color:var(--tq-ink) !important}"
				+ "[role=\"status\"][class*=\"turnStatus\"]{" + flow + "}"
				+ "@keyframes tq-rainbow-ink{" + ink + "}"
				+ "@media (prefers-reduced-motion:reduce){.tq-line,.tq-wave,.tq-loader,[role=\"status\"][class*=\"turnStatus\"]"
				+ "{animation:none !important;color:" + stops[0] + " !important}.tq-line [data-shimmer-text]{color:" + stops[0] + " !important}}";
		}
		/**
		* Apply the configured colour and sweep brightness.
		*
		* Three cases, and the difference between them is the point:
		* - **default colour at the default brightness** — nothing is written at all, so DSH's own
		*   shimmer (its bundled text/sweep token pair) keeps painting the line untouched;
		* - **default colour, another brightness** — only `--dsw-alias-label-shimmer` is written, so
		*   the text keeps DSH's colour and just the sweep gets brighter or dimmer;
		* - **a custom colour** — the text, the plugin's own nodes and the sweep all follow it, with
		*   the sweep mixed toward white by the brightness.
		*
		* And a fourth: **the rainbow** — no single colour exists, so the text is painted by
		* {@link rainbowCSS} and nothing is written into `--tq-base`; the stops are re-fitted against
		* the background that is on screen, exactly like a preset's hex.
		*
		* The legacy 0.1.x `[class*="turnStatus"]` gradient is written whenever the default is left
		* behind: it is the only way to tint a 0.1.x shell, where the sweep is DSH's own CSS rule.
		* @param cfg - the config (reads `color`, `glow`).
		*/
		function applyColorCSS(cfg) {
			if (typeof document === "undefined") return;
			const rainbow = cfg.color === RAINBOW;
			const isDefault = !rainbow && (cfg.color === SHIMMER || !cfg.color);
			const glow = clamp(cfg.glow == null ? DEFAULT_GLOW : Number(cfg.glow) || 0, 0, 100);
			const bg = themeBackground(document.body);
			const base = rainbow ? rainbowStops(bg)[0] : isDefault ? DEFAULT_BLUE : cfg.color;
			// The sweep's highlight. Measured, not guessed: `.sweep { color: var(--dsw-alias-label-shimmer) }`
			// in TextShimmer.module.css, masked by a moving gradient — this token IS the brightness.
			const sweep = mixToWhite(base, glow / 100);
			let el = document.getElementById(COLOR_STYLE_ID);
			if (isDefault && glow === DEFAULT_GLOW) {
				// The authentic brand-blue shimmer, completely untouched.
				if (el) el.textContent = "";
				clearHostColor();
				return;
			}
			if (rainbow) {
				if (!el) {
					el = document.createElement("style");
					el.id = COLOR_STYLE_ID;
					document.head.appendChild(el);
				}
				// No flat colour to write: the gradient paints the text and the icon has its own
				// keyframes. The sweep token still answers the brightness control, keyed off the
				// rainbow's leading colour so the two controls do not fight.
				el.textContent = rainbowCSS(bg, glow);
				tintHost(null, sweep);
				return;
			}
			const legacy = "[role=\"status\"][class*=\"turnStatus\"]{background-image:linear-gradient(90deg, " + base + " 0%, " + base + " 40%, " + sweep + " 50%, " + base + " 60%, " + base + " 100%) !important}";
			// Only a custom colour recolours the plugin's own nodes; on the default colour the icon
			// keeps following DSH's running-text token (see `.tq-loader` in the stylesheet).
			const own = isDefault ? "" : ".tq-loader{color:" + base + " !important}.tq-wave{color:" + base + " !important}";
			if (!el) {
				el = document.createElement("style");
				el.id = COLOR_STYLE_ID;
				document.head.appendChild(el);
			}
			el.textContent = legacy + own;
			tintHost(isDefault ? null : base, sweep);
		}
		function effectiveHex(cfg) {
			return cfg.color === SHIMMER || !cfg.color ? DEFAULT_BLUE : cfg.color;
		}

		// ── animation speed ──────────────────────────────────────────────────
		const SPEED_STYLE_ID = "dsh-thinking-quips-speed";

		/**
		* The chosen speed multiplier: a level maps to its factor, a number (config from
		* 0.6.0/0.6.1, before this became three steps) is honoured as-is, and anything else
		* is "normal" — the pace the plugin ships, where nothing is overridden.
		* @param cfg - the config (reads `speed`).
		* @returns the multiplier (1 at "normal").
		*/
		function speedOf(cfg) {
			const level = cfg && cfg.speed;
			if (typeof level === "string" && SPEED_LEVELS[level] !== undefined) return SPEED_LEVELS[level];
			const raw = Number(level);
			if (Number.isFinite(raw) && raw > 0) return Math.min(4, Math.max(0.25, raw));
			return 1;
		}
		/** The level name for the settings control (unknown/numeric collapses to normal). */
		function speedLevel(cfg) {
			const level = cfg && cfg.speed;
			if (typeof level === "string" && SPEED_LEVELS[level] !== undefined) return level;
			const factor = speedOf(cfg);
			if (factor <= 0.75) return "slow";
			if (factor >= 1.5) return "fast";
			return "normal";
		}
		/**
		* Apply the speed.
		*
		* Only the animations the plugin owns are scaled — every one of them reads
		* `var(--tq-speed)` in the plugin stylesheet. DSH's own sweep is deliberately left
		* at the pace DSH ships: on 0.2 it lives on `.sweep` / `.highlight` **inside** the
		* primitives' `TextShimmer`, not on a status element, so restating its duration
		* would mean reaching into another plugin's component (and 0.6.1 already decided the
		* official sweep is the baseline the other effects are judged against).
		* @param cfg - the config (reads `speed`).
		*/
		function applySpeedCSS(cfg) {
			if (typeof document === "undefined") return;
			const speed = speedOf(cfg);
			const isNormal = Math.abs(speed - 1) < 1e-6;
			const root = document.documentElement;
			try {
				if (isNormal) {
					if (root && root.style) root.style.removeProperty(SPEED_VAR);
				} else if (root && root.style) {
					root.style.setProperty(SPEED_VAR, String(speed));
				}
			} catch (_) { /* no documentElement: the fallback in var() keeps 1 */ }
			// The ONE animation that cannot read `--tq-speed` from the shared stylesheet: the
			// `native` whale's own motion is a 60-frame APNG, i.e. frame delays inside the image
			// file, which no CSS property can retime. So the plugin adds its own swim cue — and
			// writes the rule only for a non-Normal level, because Normal is documented to
			// override nothing at all. The factor is folded into the duration here rather than
			// left as a var() so the rule stays readable in devtools.
			//
			// The tag has to be CREATED here: the element only ever existed on shells where some
			// other code path made it, so a plain `getElementById` + write was a no-op and the
			// cue never reached the DOM.
			let el = document.getElementById(SPEED_STYLE_ID);
			if (el === null && !isNormal) {
				el = document.createElement("style");
				el.id = SPEED_STYLE_ID;
				document.head.appendChild(el);
			}
			if (el) {
				el.textContent = isNormal
					? ""
					: ".tq-loader-native [class*=\"runningIcon\"]{animation:tq-swim " + (1.4 / speed).toFixed(3) + "s ease-in-out infinite}";
			}
		}

		// ── the plugin's own nav glyph ───────────────────────────────────────
		/**
		* The whale that marks the plugin's settings page in the nav rail.
		*
		* This is **DSH's own whale**, the same path the running line draws, copied verbatim from
		* `dsh-client-ui-chat@0.2.0-rc.2` (`REST_PATH`, MIT — Copyright (c) 2026 DeepSeek; the
		* package's LICENSE is kept in the workspace). It is vendored rather than looked up at
		* runtime because the only runtime sources are a live running line (`nativeWhaleSource`)
		* or the animated raster mask in the stylesheet — neither exists when the settings panel
		* is open between turns, and an icon that changes shape depending on whether a turn is
		* running would be worse than a snapshot.
		*
		* WHY NOT A DRAWN TAIL: a hand-drawn symmetric fluke was tried first (thirteen variants,
		* rendered at 16px beside DSH's own icons). Every one of them failed the same way — at
		* 14–16px a 1.3 outline closes the notch and the waist into a blob, and the filled
		* silhouettes read as a dart or a shield. A whole whale works where a lone fluke does not,
		* because its body leaves a large open interior for strokes 1px wide: that is exactly why
		* DSH's own glyph survives the downscale, and reusing it also keeps the plugin from
		* competing with the app's own drawing.
		*
		* `test-adapt-02.mjs` compares this string with the installed package's `REST_PATH` and
		* fails when DSH changes the whale — that assertion is what keeps a copied path honest.
		*/
		const NAV_ICON_WHALE_PATH = "M8.844 13.742C8.967 12.328 8.45 10.4 8.45 9.65C8.45 8.94 8.88 8.43 9.6 8.43C11.285 8.43 12.106 8.281 12.685 8.104C13.71 7.791 14.585 6.768 15.055 5.945C15.137 5.803 14.99 5.641 14.829 5.671C13.829 5.86 12.828 5.376 11.827 4.978C10.659 4.514 9.491 4.707 8.935 4.876C8.805 4.915 8.658 4.819 8.636 4.686C8.468 3.643 7.405 2.615 5.498 2.238C4.54 2.048 3.748 1.574 3.347 1.202C3.252 1.113 3.088 1.125 3.03 1.242C2.628 2.059 2.168 3.82 5.248 6.115C5.82 6.494 6.31 6.785 6.574 7.637C6.72 8.104 6.157 9.168 6.061 9.368C5.157 11.27 5.089 12.19 4.926 13.742";
		/**
		* How the whale is drawn: `viewBox 0 0 16 16` at `size 16`, `fill none`, `strokeWidth 1`.
		*
		* Measured from DSH's own whale (`runningWhaleStill` in dsh-client-ui-chat) — 1, not the
		* 1.3 the nav's outline icons pass — because the glyph IS that drawing; the nav rail shows
		* it at the same 16px box it uses for its own icons.
		*/
		const NAV_ICON_STROKE = "1";
		/**
		* The stroke weight DSH's "medium" outline nav icons pass (`ICON_MEDIUM_STROKE`).
		*
		* Not used by the glyph; the preview page needs it to render those icons next to ours.
		*/
		const ICON_MEDIUM_STROKE = "1.3";
		/** The attribute that marks the plugin's own nav row (see {@link markSettingsNav}). */
		const SECTION_ATTR = "data-tq-section";
		/** The active locale, mirrored out of `apply()` so the nav marker can read it. */
		let navLocale = "en";
		/**
		* The nav glyph as a CSS mask value (see {@link navIconDocument} for why a document).
		*
		* `encodeURIComponent` rather than hand-escaping: the glyph's own quotes and `#` would
		* otherwise end the CSS string or start a fragment.
		*/
		const NAV_ICON_MASK = "url(\"data:image/svg+xml," + encodeURIComponent(navIconDocument("#000")) + "\")";
		/**
		* The nav glyph as a standalone SVG *document*.
		*
		* Only the CSS mask needs a document: an SVG referenced from `url()` has no document to
		* inherit `currentColor` from, so the mask bakes in a colour and the row's own colour
		* shows through — exactly how DSH paints its own whale.
		* @param stroke - the stroke colour to bake in (a CSS mask only reads alpha).
		* @returns the SVG markup.
		*/
		function navIconDocument(stroke) {
			return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'>"
				+ "<path d='" + NAV_ICON_WHALE_PATH + "' stroke='" + stroke + "' stroke-width='" + NAV_ICON_STROKE + "'/>"
				+ "</svg>";
		}
		/**
		* Mark the plugin's own nav row so the stylesheet can paint {@link NAV_ICON_WHALE_PATH} there.
		*
		* WHY THIS IS NECESSARY: `settings.section` carries only `id`/`order`/`label`. DSH's nav
		* picks the glyph from a table keyed by section id inside dsh-client-ui-settings-general
		* (`navIcon`), and every id it does not know falls back to the settings gear — so without
		* this, our page would wear the same gear as General. There is no supported way for a
		* third-party section to supply an icon, so the plugin marks its row and lets CSS retire
		* the gear in that row and paint the tail. That depends on two facts about the panel
		* (recorded in the handover §9): a nav row is a `[class*="navCell"]` button, and its label
		* is a `[class*="navLabel"]` whose text is what we registered.
		*
		* Fail-soft by construction: if that markup ever changes, no row matches and DSH keeps
		* painting its own gear — the page, its label and its controls are unaffected. The mark is
		* an attribute React never wrote, so a re-render neither drops nor duplicates it.
		*/
		function markSettingsNav() {
			if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
			try {
				const wanted = effectiveLang(navLocale) === "zh" ? zh["quips.title"] : en["quips.title"];
				const rows = document.querySelectorAll('[class*="navCell"]');
				for (let i = 0; i < rows.length; i += 1) {
					const row = rows[i];
					if (row === null || row === void 0 || typeof row.getAttribute !== "function") continue;
					if (row.getAttribute(SECTION_ATTR) === "true") continue;
					if (typeof row.querySelector !== "function" || typeof row.setAttribute !== "function") continue;
					const label = row.querySelector('[class*="navLabel"]');
					if (label === null || label === void 0) continue;
					if (String(label.textContent).trim() !== wanted) continue;
					row.setAttribute(SECTION_ATTR, "true");
				}
			} catch (_) { /* the marker is decoration: it must never break the shell */ }
		}

		// ── plugin CSS (styles the settings page, modal, and preview) ────────
		const STYLE_NS = "dsh-thinking-quips-style";
		const CSS = [
			// The settings PAGE (it was one row under General): it owns the whole content column
			// now, so it is spaced rather than ruled, and it keeps a readable measure.
			".tq-page{flex-direction:column;align-items:stretch;gap:22px;padding:2px 0 28px;max-width:720px;display:flex}",
			// The nav rail row of our settings page (marked by `markSettingsNav`). DSH gives an
			// unknown section id the settings gear, so the marked row retires that gear and paints
			// the plugin's own tail as a mask: `currentColor` keeps the row's own colours — normal,
			// hover and active are three different ones — exactly like DSH's own glyphs.
			"[" + SECTION_ATTR + "]>svg:first-child{display:none!important}",
			"[" + SECTION_ATTR + "]::before{content:\"\";flex:none;width:16px;height:16px;background-color:currentColor;-webkit-mask:" + NAV_ICON_MASK + " center/16px 16px no-repeat;mask:" + NAV_ICON_MASK + " center/16px 16px no-repeat}",
			".tq-head{flex-direction:row;align-items:center;gap:8px;display:flex}",
			".tq-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}",
			".tq-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
			".tq-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".tq-colorRow{align-items:center;gap:12px;display:flex;flex-wrap:wrap}",
			".tq-colorBlock{flex-direction:column;gap:8px;display:flex}",
			".tq-themeNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;word-break:break-word}",
			".tq-swatch{width:46px;height:30px;border-radius:8px;flex:none;border:1px solid var(--dsw-alias-border-l2);background-color:#000;background-size:250% 100%;cursor:pointer}",
			// One-click colour presets: the same pill language as `.tq-btn`, plus a round chip
			// painted with the colour the click would actually write (see presetColor). The
			// selected chip uses the accent tokens `.tq-btnOn` already uses, so "selected" reads
			// the same here as it does on the Match-theme button.
			".tq-presets{align-items:center;gap:8px;display:flex;flex-wrap:wrap}",
			".tq-preset{align-items:center;gap:8px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);cursor:pointer;border:1px solid transparent;border-radius:18px;height:36px;padding:0 12px;font:inherit;font-size:13px;line-height:18px;display:inline-flex}",
			".tq-preset:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".tq-presetOn{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}",
			".tq-presetChip{width:16px;height:16px;flex:none;border-radius:50%;border:1px solid var(--dsw-alias-border-l2)}",
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
			// The icon follows DSH's own running-text token first, so it matches the plugin's own
			// line AND a handed-back DSH label by default; the brand blue is only the fallback for
			// a shell that does not define the token.
			".tq-loader{flex:none;align-self:center;margin-right:8px;color:var(--dsw-alias-label-deep-diving,var(--dsw-static-deepseek-500));transform:scale(var(--tq-loader-scale,1));transform-origin:center}",
			// The plugin's own icons used to be frozen at a 16px grid, which silently ignored the
			// ONE thing the user can change globally: the content font size. DSH publishes it as
			// --dsh-content-font-delta (= content font size - 14px) and sizes its own running icon
			// as `14px + delta`; ours are drawn in a 16x16 box, so the base is `16px + delta`.
			//
			// The base is declared ONCE here as the element's font-size and every geometry below is
			// expressed in `em`, so the icons grow with the text with no JS, no observer and no
			// recomputation when the setting changes (a CSS variable cannot be divided by a length,
			// which is why the base is not folded into the transform instead). The sm/md/lg ladder
			// still arrives as --tq-loader-scale on the shared transform.
			//
			// Scoped to the plugin's OWN styles deliberately: -stateDot and -native mount DSH's own
			// nodes, which size themselves (the native box already uses `14px + delta`) and must not
			// inherit a font-size the plugin invented for its own drawings.
			".tq-loader-orbit,.tq-loader-pulse,.tq-loader-dots,.tq-loader-bars,.tq-loader-morph,.tq-loader-fish,.tq-loader-sprites{font-size:calc(16px + var(--dsh-content-font-delta,0px))}",
			// orbit: 3x3, the 8 outer dots chase clockwise, center empty.
			".tq-loader-orbit{display:grid;grid-template-columns:repeat(3,.25em);grid-template-rows:repeat(3,.25em);gap:.125em;place-items:center}",
			".tq-loader-orbit i{width:.1875em;height:.1875em;border-radius:50%;background:currentColor;opacity:.15;animation:tq-orbit-chase calc(1.6s / var(--tq-speed,1)) linear infinite;animation-delay:calc(var(--i) * .2s / var(--tq-speed,1))}",
			".tq-loader-orbit i.blank{background:transparent!important;animation:none}",
			// morph: one SVG path, its outline rewritten every frame by ensureMorph().
			".tq-loader-morph{display:block;width:1em;height:1em}",
			".tq-loader-morph svg{display:block;width:1em;height:1em;overflow:visible}",
			".tq-loader-morph .tq-morphPath{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round}",
			// stateDot: the official StateDot in its `ongoing` state — DSH's own spinner svg,
			// mounted through a React root. The plugin only gives it a box, so the shared
			// --tq-loader-scale still sizes it together with the plugin-drawn icons.
			".tq-loader-stateDot{display:inline-flex;align-items:center}",
			".tq-loader-stateDot .tq-dotBox{display:inline-flex}",
			// fish: DSH's official logo path, assembled by the plugin into its own svg. A
			// still mark on purpose — DSH ships it static — and the box keeps the official
			// aspect ratio (FISH_LOGO_VIEWBOX is 23.16 x 17.04).
			".tq-loader-fish{display:block;width:1.25em;height:.92em}",
			".tq-loader-fish svg{display:block;width:100%;height:100%;overflow:visible}",
			".tq-loader-fish .tq-fishPath{fill:currentColor}",
			// native: DSH's own running-line whale, cloned into the plugin's span. The clone
			// carries the official class tokens, so the chat package's own stylesheet paints
			// it — the 60-frame APNG mask, or the still SVG when the mask branch is gated off
			// by reduced motion / forced colors. The plugin contributes only the box, which
			// also means the clone follows the configured colour (it paints with currentColor).
			// DSH's whale is a RASTER: a 28x28 APNG used as an alpha mask. The shared
			// `transform: scale()` on `.tq-loader` would rasterise it at 14px and then stretch
			// the bitmap, which is visibly soft at Large; sizing the box itself instead lets the
			// mask be rasterised at the final size (the source is 28px, so 11.2/14/17.5px are all
			// downscales and stay crisp). Vector icons keep using the transform, so `native`
			// opts out of it here.
			".tq-loader-native{display:inline-flex;align-items:center;position:relative;transform:none!important}",
			".tq-loader-native [class*=\"runningIcon\"]{width:calc((14px + var(--dsh-content-font-delta,0px)) * var(--tq-loader-scale,1));height:calc((14px + var(--dsh-content-font-delta,0px)) * var(--tq-loader-scale,1))}",
			// The mask branch paints the span itself, so that span needs the same box; the clone
			// branch has a child, so `:empty` keeps the wrapper out of the way there.
			".tq-loader-native:empty{width:calc((14px + var(--dsh-content-font-delta,0px)) * var(--tq-loader-scale,1));height:calc((14px + var(--dsh-content-font-delta,0px)) * var(--tq-loader-scale,1))}",
			// The APNG's 60 frame delays live inside the image file, so no CSS can retime them.
			// What the plugin CAN do is add its own cue on top, and only when the speed level is
			// not Normal (see applySpeedCSS): a small swim that follows the chosen pace, leaving
			// the official motion untouched at Normal.
			"@keyframes tq-swim{0%,100%{transform:translateX(-.75px)}50%{transform:translateX(.75px)}}",
			// DSH's whale is a *choice* — the `native` loader — not a permanent fixture, so
			// whenever the plugin has an icon of its own on the line, DSH's is retired. The
			// child combinator takes runningContent's own icon and leaves the `native` clone
			// alone (it sits one level deeper, inside the plugin's span), which is how the two
			// never appear together.
			"[data-tq-icon] [class*=\"runningContent\"]>[class*=\"runningIcon\"]{display:none!important}",
			// pulse: one dot breathing.
			".tq-loader-pulse i{display:block;width:.625em;height:.625em;border-radius:50%;background:currentColor;animation:tq-pulse calc(1.1s / var(--tq-speed,1)) ease-in-out infinite}",
			// dots: three dots typing in sequence.
			".tq-loader-dots{display:inline-flex;align-items:center;gap:.1875em;height:.75em}",
			".tq-loader-dots i{width:.25em;height:.25em;border-radius:50%;background:currentColor;opacity:.25;animation:tq-dots calc(1s / var(--tq-speed,1)) ease-in-out infinite;animation-delay:calc(var(--i) * .16s / var(--tq-speed,1))}",
			// bars: a three-bar equalizer. Its geometry arrives through two custom properties because
			// `em` alone cannot stay symmetric here: at a 17px base (16px + a 1px font delta) each bar
			// is 3.1875px = 6.375 device pixels, and Chromium rounds EVERY box edge on its own — the
			// middle bar painted 8 device pixels wide against the outer 6, which reads as "the middle
			// bar sits too far left" (reported from the settings preview, measured at 2x DPR).
			// snapBarsGeometry() rounds both lengths to whole DEVICE pixels, so the remaining rounding
			// is one uniform shift of the group and the symmetry survives. The `em` fallbacks keep the
			// loader drawing correctly when JS never runs.
			".tq-loader-bars{--tq-bar-w:.1875em;--tq-bar-gap:.125em;display:inline-flex;align-items:flex-end;justify-content:space-between;width:calc(3 * var(--tq-bar-w) + 2 * var(--tq-bar-gap));height:var(--tq-bar-h,.8125em);transform:none!important}",
			".tq-loader-bars i{width:var(--tq-bar-w);height:100%;border-radius:calc(var(--tq-bar-w) / 2);background:currentColor;opacity:.4;transform-origin:bottom;animation:tq-bars calc(1s / var(--tq-speed,1)) ease-in-out infinite;animation-delay:calc(var(--i) * .13s / var(--tq-speed,1))}",
			"@keyframes tq-orbit-chase{0%,100%{opacity:.15}8%{opacity:1}30%{opacity:.5}50%{opacity:.15}}",
			"@keyframes tq-pulse{0%,100%{transform:scale(.5);opacity:.3}50%{transform:scale(1);opacity:1}}",
			"@keyframes tq-dots{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-.125em)}}",
			"@keyframes tq-bars{0%,100%{transform:scaleY(.35);opacity:.35}50%{transform:scaleY(1);opacity:1}}",
			// ── text effect: a wave through the status line ──────────────────────
			// renderWave() wraps each CJK glyph / Latin word in a .tq-waveItem, so the
			// stagger is pure CSS (same trick as the orbit dots). The lift is a transform,
			// so it never changes the line's layout.
			//
			// The wave carries its OWN colour and text fill, deliberately: DSH paints the
			// label with `-webkit-text-fill-color:transparent` and a background clipped to
			// text, and a wrapped glyph does not reliably take part in the parent's clip —
			// it then inherits the transparent fill and vanishes. Setting the fill to
			// currentColor makes the wave independent of that entirely. The price is that
			// the wave is a solid colour rather than the shimmering gradient, which is fine:
			// the two effects are a choice, not a stack.
			".tq-wave{display:inline;color:var(--dsw-static-deepseek-500);-webkit-text-fill-color:currentColor}",
			".tq-waveItem{display:inline-block;animation:tq-wave 1.6s ease-in-out infinite;animation-duration:calc(1.6s / var(--tq-speed,1));animation-delay:calc(var(--i) * 70ms / var(--tq-speed,1))}",
			"@keyframes tq-wave{0%,55%,100%{transform:translateY(0)}22%{transform:translateY(-3px)}}",
			// While the wave owns the line, DSH's shimmer sweep has nothing to paint (the
			// label is blanked), so stop it rather than run a dead animation.
			"[role=\"status\"][class*=\"turnStatus\"].tq-waving{animation:none!important}",
			// ── the plugin's own line on DSH 0.2 ─────────────────────────────────
			// DSH hides its label by attribute rather than by blanking it: React rewrites
			// that label every second (it carries the live elapsed time) and the decoration
			// copy inside TextShimmer mirrors it through `data-shimmer-text`.
			"[data-tq-owned] [class*=\"runningText\"]{display:none!important}",
			".tq-line{color:var(--tq-base,var(--dsw-alias-label-deep-diving,var(--dsw-static-deepseek-500)));min-width:0;white-space:pre-wrap}",
			// The elapsed time beside the text (the 0.1.x look): tertiary grey, its own node,
			// and deliberately NOT part of the animated run.
			".tq-clock{color:var(--dsw-alias-label-tertiary);margin-left:6px;font-variant-numeric:tabular-nums}",
			// The official TextShimmer is a React component; the plugin only gives it a box.
			".tq-official{display:inline-flex;min-width:0}",
			// ── contributed sprites (the two delivered design families) ──────────
			// One box per sprite, `1em` like the plugin's own drawings, so the geometry in
			// LOADER_SPRITES scales with the content font size and nothing here names a pixel.
			// `--tq-loader-scale` still supplies the sm/md/lg ladder through the shared transform.
			".tq-loader-jelly,.tq-loader-tickTock,.tq-loader-bonk,.tq-loader-pinwheel,.tq-loader-ripple,.tq-loader-beadRun,.tq-loader-sparkleSwap,.tq-loader-bounceBall{display:block;width:1em;height:1em}",
			".tq-loader-sprites svg{display:block;width:1em;height:1em;overflow:visible}",
			// Every animated part below is anchored by the `<g transform="translate(…)">` around it
			// and rotates/squashes about `transform-origin:0 0` — i.e. about the point that translate
			// puts at the origin (a pivot, a bottom centre, a box centre). The delivered files used
			// that convention for most icons; tickTock's missing anchor is added here, because without
			// it the arm rotates about its own box centre instead of the axis.
			//
			// Every duration is `calc(1.6s / var(--tq-speed,1))`, the family's shared rhythm: the
			// multi-part icons (bonk, ripple, sparkleSwap, bounceBall) each carry the SAME expression
			// per part, so the speed level cannot drift them out of phase with each other.
			//
			// Translation lengths KEEP their `px` unit, and that is not a device pixel: in a CSS
			// `transform` on an SVG element a length is in the element's own user units, so
			// `translateY(4.6px)` moves 4.6 viewBox units and scales with the box. The first version
			// of this port dropped the unit ("a unitless length is a user unit") — true of the SVG
			// `transform` ATTRIBUTE, not of CSS, where `translateY(4.6)` is an invalid value and the
			// whole declaration is dropped. Measured afterwards in a browser: bonk's mallet, the bead
			// and the bouncing ball had 0px of travel on every part, i.e. no animation at all.
			".tq-jelly-body{transform-origin:0 0;animation:tq-jelly-squash calc(1.6s / var(--tq-speed,1)) cubic-bezier(.45,0,.55,1) infinite}",
			"@keyframes tq-jelly-squash{0%,54%,100%{transform:scale(1,1)}28%{transform:scale(1.08,.84)}42%{transform:scale(.95,1.05)}76%{transform:scale(1.02,.98)}}",
			".tq-tick-arm{transform-origin:0 0;animation:tq-tick-swing calc(1.6s / var(--tq-speed,1)) cubic-bezier(.45,0,.55,1) infinite}",
			"@keyframes tq-tick-swing{0%,100%{transform:rotate(-42deg)}50%{transform:rotate(42deg)}}",
			".tq-bonk-stick{animation:tq-bonk-strike calc(1.6s / var(--tq-speed,1)) cubic-bezier(.45,0,.55,1) infinite}",
			"@keyframes tq-bonk-strike{0%,30%,100%{transform:translateY(0)}10%{transform:translateY(2px)}20%{transform:translateY(.4px)}}",
			".tq-bonk-block{transform-origin:0 0;animation:tq-bonk-squash calc(1.6s / var(--tq-speed,1)) cubic-bezier(.45,0,.55,1) infinite}",
			"@keyframes tq-bonk-squash{0%,10%,36%,72%,100%{transform:scale(1,1)}16%{transform:scale(1.12,.84)}26%{transform:scale(.96,1.05)}84%{transform:scale(1.01,.99)}}",
			// The sparks ship with a static `opacity="0"`, so a stopped animation (reduced motion)
			// leaves them invisible — the design's still frame is "cocked, not struck".
			".tq-bonk-spark{animation:tq-bonk-spark calc(1.6s / var(--tq-speed,1)) linear infinite}",
			"@keyframes tq-bonk-spark{0%,9%{opacity:0}12%,20%{opacity:1}23%,100%{opacity:0}}",
			".tq-pinwheel-rot{transform-origin:0 0;animation:tq-pinwheel-spin calc(1.6s / var(--tq-speed,1)) linear infinite}",
			"@keyframes tq-pinwheel-spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}",
			".tq-ripple-wave1,.tq-ripple-wave2{transform-origin:0 0;animation:tq-ripple-wave calc(1.6s / var(--tq-speed,1)) linear infinite}",
			".tq-ripple-wave2{animation-delay:calc(-.8s / var(--tq-speed,1))}",
			"@keyframes tq-ripple-wave{0%{transform:scale(.32);opacity:1}100%{transform:scale(1);opacity:0}}",
			".tq-bead-run{animation:tq-bead-run calc(1.6s / var(--tq-speed,1)) linear infinite}",
			"@keyframes tq-bead-run{0%{transform:translateX(0);opacity:1}78%{transform:translateX(10.4px);opacity:1}84%{transform:translateX(10.4px);opacity:0}85%{transform:translateX(0);opacity:0}92%,100%{transform:translateX(0);opacity:1}}",
			// ONE bloom keyframe set: the small star is the same animation delayed half a cycle,
			// which is exactly what the delivered pair of keyframe blocks spelled out separately.
			".tq-sparkle-big,.tq-sparkle-small{transform-origin:0 0;animation:tq-sparkle-bloom calc(1.6s / var(--tq-speed,1)) linear infinite}",
			".tq-sparkle-small{animation-delay:calc(-.8s / var(--tq-speed,1))}",
			"@keyframes tq-sparkle-bloom{0%{opacity:0;transform:scale(.45)}22%{opacity:1;transform:scale(1)}44%,100%{opacity:0;transform:scale(.45)}}",
			".tq-bounce-ball{transform-origin:0 0;animation:tq-bounce-jump calc(1.6s / var(--tq-speed,1)) ease infinite}",
			"@keyframes tq-bounce-jump{0%{transform:translateY(0) scale(1,1)}34%{transform:translateY(4.6px) scale(1,1);animation-timing-function:ease-in}42%{transform:translateY(4.6px) scale(1.2,.76);animation-timing-function:ease-out}60%{transform:translateY(1.6px) scale(.9,1.1)}82%,100%{transform:translateY(0) scale(1,1)}}",
			".tq-bounce-shadow{transform-origin:0 0;animation:tq-bounce-shadow calc(1.6s / var(--tq-speed,1)) linear infinite}",
			"@keyframes tq-bounce-shadow{0%,100%{transform:scaleX(.68)}42%{transform:scaleX(1)}}",
			"@media (prefers-reduced-motion:reduce){.tq-loader i,.tq-loader svg,.tq-waveItem{animation:none!important}.tq-loader-stateDot svg *{animation:none!important}.tq-loader-native [class*=\"runningIcon\"]{animation:none!important}.tq-loader-sprites .tq-sprite{animation:none!important}.tq-loader-orbit i,.tq-loader-dots i,.tq-loader-pulse i,.tq-loader-bars i{opacity:.7}.tq-loader-bars i{transform:scaleY(.7)}.tq-loader-orbit i.blank{opacity:0}.tq-ripple-wave2{transform:scale(.32)}}"
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
			"quips.colorDesc": "默认使用 DeepSeek 品牌蓝色微光，也可自定义颜色；下面的「扫光亮度」决定那道流光比文字亮多少。",
			"quips.default": "恢复默认品牌蓝",
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
			"quips.glow": "扫光亮度",
			"quips.speed": "动画速度",
			"quips.speedDesc": "统一调节动画快慢；「正常」就是默认速度，这一档不会覆盖任何东西。",
			"quips.speed.slow": "慢",
			"quips.speed.normal": "正常",
			"quips.speed.fast": "快",
			"quips.textEffect": "文字特效",
			"quips.textEffectDesc": "状态行文字的动效：扫光就是 DSH 官方那道横向流光（由插件渲染官方 TextShimmer 组件）；波浪让每个字（中文）或每个词（英文）依次向上跳一下。",
			"quips.effect.shimmer": "扫光（官方）",
			"quips.effect.wave": "波浪",
			"quips.clock": "用时显示",
			"quips.clockDesc": "「随文」把用时并进俏皮话一起参与动画（DSH 0.2 的形式）；「旁注」用灰色小字单独显示、不参与文字动画（0.1 的形式）。",
			"quips.clock.off": "关闭",
			"quips.clock.inline": "随文",
			"quips.clock.separate": "旁注",
			"quips.matchTheme": "匹配主题色",
			"quips.matchThemeTitle": "读取当前主题的强调色，调整到与背景有足够对比度的颜色；开启后会跟随主题切换",
			"quips.matched": "已匹配主题色",
			"quips.matchFallback": "读不到主题色，已按品牌蓝适配",
			"quips.contrast": "对比度",
			"quips.presets": "颜色预设",
			"quips.presetsHint": "一键切换颜色；色板按当前背景实测调整到对比度不低于 4.5:1，选中后不再跟随主题。「彩虹」会让状态行的颜色流动起来（系统开启「减少动态效果」时保持静止）。",
			"quips.preset.blue": "品牌蓝",
			"quips.preset.violet": "紫罗兰",
			"quips.preset.teal": "青碧",
			"quips.preset.amber": "琥珀",
			"quips.preset.rainbow": "彩虹",
			"quips.following": "跟随主题中",
			"quips.stopFollow": "取消跟随",
			"quips.stopFollowTitle": "保留当前颜色，但不再随主题切换而变化",
			"quips.scheme.light": "浅色",
			"quips.scheme.dark": "深色",
			"quips.loader": "加载图标",
			"quips.loaderDesc": "状态行左侧动态图标的样式与尺寸。",
			"quips.loader.orbit": "点阵环游",
			"quips.loader.pulse": "呼吸脉冲",
			"quips.loader.dots": "三点跳动",
			"quips.loader.bars": "柱状律动",
			"quips.loader.morph": "形变环游",
			"quips.loader.stateDot": "官方状态点（旋转）",
			"quips.loader.fish": "官方鲸鱼标志（静态）",
			// The contributed sprites: the design's own name first, then what it does, so the
			// dropdown still reads like the motion-describing labels above it.
			"quips.loader.jelly": "果冻块（压扁回弹）",
			"quips.loader.tickTock": "节拍仔（左右摆动）",
			"quips.loader.bonk": "敲敲仔（敲打方块）",
			"quips.loader.pinwheel": "小风车（旋转）",
			"quips.loader.ripple": "电波仔（一圈圈扩散）",
			"quips.loader.beadRun": "进度珠（轨道往返）",
			"quips.loader.sparkleSwap": "星光眨眨（双星交替）",
			"quips.loader.bounceBall": "弹弹球（弹跳）",
			"quips.loader.native": "官方鲸鱼（动态）",
			"quips.loader.nativeNote": "官方鲸鱼的动画是图片自带的 60 帧 APNG，帧率写在图片里、CSS 改不了；速度档位会另加一个同步快慢的划水动作（「正常」不加任何东西）。",
			"quips.sizeLabel": "图标尺寸",
			"quips.size.sm": "小",
			"quips.size.md": "中",
			"quips.size.lg": "大",
			"quips.langDesc": "语言选择决定显示哪一段：混合→两段都显示；仅中文→中文段；仅英文→英文段；跟随界面→按当前界面语言取段。",
			"quips.indicatorOnly": "只显示加载图标",
			"quips.indicatorOnlyDesc": "开启后只注入加载图标，不替换状态文字——可与其他修改状态文字的插件共存。",
			"quips.surface": "运行环境",
			"quips.surface.web": "网页版",
			"quips.surface.desktop": "桌面端"
		};
		const en = {
			"quips.title": "Playful quips",
			"quips.desc": "Rotating status quips and font color while the agent is working.",
			"quips.color": "Font color",
			"quips.colorDesc": "Defaults to the DeepSeek brand-blue shimmer; pick any custom color. Sweep brightness below sets how much brighter the moving highlight is than the text.",
			"quips.default": "Back to brand blue",
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
			"quips.glow": "Sweep brightness",
			"quips.speed": "Animation speed",
			"quips.speedDesc": "One speed for the animations; Normal is the shipped pace and overrides nothing.",
			"quips.speed.slow": "Slow",
			"quips.speed.normal": "Normal",
			"quips.speed.fast": "Fast",
			"quips.textEffect": "Text effect",
			"quips.textEffectDesc": "What the status text does: Shimmer IS DSH's own sweep (the plugin renders the official TextShimmer component), and Wave lifts each character (CJK) or word (Latin) in turn.",
			"quips.effect.shimmer": "Shimmer (official)",
			"quips.effect.wave": "Wave",
			"quips.clock": "Elapsed time",
			"quips.clockDesc": "Inline folds the duration into the quip so it animates with the text (the DSH 0.2 shape); Beside shows it as a separate grey note that is not part of the animation (the 0.1 shape).",
			"quips.clock.off": "Off",
			"quips.clock.inline": "Inline",
			"quips.clock.separate": "Beside",
			"quips.matchTheme": "Match theme",
			"quips.matchThemeTitle": "Read the theme accent and fit it to a colour with enough contrast against the background; keeps following theme switches once used",
			"quips.matched": "Matched theme color",
			"quips.matchFallback": "No theme color found — fitted the brand blue instead",
			"quips.contrast": "contrast",
			"quips.presets": "Color presets",
			"quips.presetsHint": "One click per colour; each chip is fitted to the current background for at least 4.5:1 contrast and stops following the theme. Rainbow makes the line's colour flow (it holds still while the system asks for reduced motion).",
			"quips.preset.blue": "Brand blue",
			"quips.preset.violet": "Violet",
			"quips.preset.teal": "Teal",
			"quips.preset.amber": "Amber",
			"quips.preset.rainbow": "Rainbow",
			"quips.following": "Following theme",
			"quips.stopFollow": "Stop following",
			"quips.stopFollowTitle": "Keep the current color but stop tracking theme switches",
			"quips.scheme.light": "light",
			"quips.scheme.dark": "dark",
			"quips.loader": "Loader icon",
			"quips.loaderDesc": "Style and size of the animated icon left of the status line.",
			"quips.loader.orbit": "Dot orbit",
			"quips.loader.pulse": "Pulse",
			"quips.loader.dots": "Bouncing dots",
			"quips.loader.bars": "Equalizer bars",
			"quips.loader.morph": "Shape morph",
			"quips.loader.stateDot": "Official state dot (spinning)",
			"quips.loader.fish": "Official whale mark (still)",
			// See the zh dictionary: name first, motion in brackets, matching the labels above.
			"quips.loader.jelly": "Jelly block (squash & stretch)",
			"quips.loader.tickTock": "Tick-Tock (swings)",
			"quips.loader.bonk": "Bonk (hammer & sparks)",
			"quips.loader.pinwheel": "Pinwheel (spins)",
			"quips.loader.ripple": "Ripple (rings outwards)",
			"quips.loader.beadRun": "Bead-Run (along the track)",
			"quips.loader.sparkleSwap": "Sparkle-Swap (two stars)",
			"quips.loader.bounceBall": "Bounce-Ball (bounces)",
			"quips.loader.native": "Official whale (animated)",
			"quips.loader.nativeNote": "DSH's whale is a 60-frame APNG, so its frame rate lives inside the image and no CSS can retime it; a speed level adds the plugin's own swim cue around it (Normal adds nothing).",
			"quips.sizeLabel": "Icon size",
			"quips.size.sm": "Small",
			"quips.size.md": "Medium",
			"quips.size.lg": "Large",
			"quips.langDesc": "Which section shows: Mixed→both; Chinese only→Chinese section; English only→English section; Follow UI→the active UI language.",
			"quips.indicatorOnly": "Indicator only",
			"quips.indicatorOnlyDesc": "Inject only the loading icon and leave the status text alone, so another status-text plugin can coexist.",
			"quips.surface": "Running surface",
			"quips.surface.web": "Web UI",
			"quips.surface.desktop": "Desktop app"
		};

		// ── state setters (shared by row and modal) ──────────────────────────
		function patchConfig(patch) {
			const st = store();
			st.set({ ...st.get(), ...patch });
		}

		// ── React: official controls, with the pre-0.2 fallbacks ─────────────
		// These wrap DSH's own controls so the row looks and behaves like the rest of the
		// app on 0.2, while an older shell (which seeds no primitives) still gets the
		// plugin's hand-written equivalent. Each wrapper is a plain function of its props,
		// so the choice is made per render and cannot go stale.
		/**
		* A labelled switch. The official `Switch` hands back the NEXT value as a boolean
		* and requires `label` (it becomes the control's accessible name).
		*/
		function SwitchControl({ checked, label, title, onChange }) {
			const Switch = officialSwitch();
			const on = checked === true;
			if (Switch !== null) return jsx(Switch, { checked: on, label, title, onChange: (next) => onChange(next === true) });
			return jsx("button", {
				type: "button",
				role: "switch",
				"aria-checked": on,
				"aria-label": label,
				title,
				className: "tq-switch",
				onClick: () => onChange(!on),
				children: [jsx("span", { className: "tq-switchKnob" })]
			});
		}
		/**
		* A segmented choice. The official `SegmentedControl` needs a stable `id` (it builds
		* `${id}-${value}` tab/panel ids from it), the selected `value`, `{value,label}`
		* options, and `label` for the tablist's accessible name.
		*/
		function SegControl({ id, label, value, options, onChange }) {
			const Seg = officialSegmented();
			if (Seg !== null) return jsx(Seg, { id, label, value, options, onChange });
			return jsx("div", {
				className: "tq-seg",
				role: "group",
				"aria-label": label,
				children: options.map((option) => jsx("button", {
					type: "button",
					className: "tq-segItem" + (value === option.value ? " tq-segActive" : ""),
					"aria-pressed": value === option.value,
					onClick: () => onChange(option.value),
					children: option.label
				}, option.value))
			});
		}
		/**
		* A modal shell. The official `Modal` portals to `document.body` and brings its own
		* mask, close button, Escape/Tab handling and focus restore, so the plugin supplies
		* only content and a footer; `closeLabel` is required unless it is headless.
		*
		* `open` is always true here because the caller mounts this component on open —
		* that unmount is what resets the draft text, so the box must not stay mounted
		* while hidden (which is why this is not driven by an `open` prop from the row).
		*/
		function ModalBox({ title, closeLabel, onClose, footer, children }) {
			const Modal = officialModal();
			if (Modal !== null) return jsxs(Modal, { open: true, onClose, title, closeLabel, footer, children });
			return jsxs("div", { className: "tq-overlay", children: [
				jsx("div", { className: "tq-mask", onClick: onClose }),
				jsxs("div", { className: "tq-panel", role: "dialog", "aria-modal": "true", "aria-label": title, children: [
					jsxs("div", { className: "tq-panelHead", children: [
						jsx("div", { className: "tq-panelTitle", children: title }),
						jsx("button", { type: "button", className: "tq-panelClose", onClick: onClose, "aria-label": closeLabel, children: "\u00d7" })
					] }),
					jsx("div", { className: "tq-divider" }),
					children,
					footer
				] })
			] });
		}

		// ── React: color control (preview + hex/rgb + native wheel + theme match) ──
		function ColorControl({ value, onChange, onMatchTheme, onStopFollow, following, t }) {
			const isShimmer = value === SHIMMER || !value;
			// The rainbow is a sentinel too. The hex/RGB inputs and the wheel need a real colour to
			// stand on, so they take the gradient's leading stop (already fitted to this background);
			// editing any of them leaves the rainbow behind and writes that flat colour, which is
			// exactly what a manual edit means everywhere else in this row.
			const isRainbow = value === RAINBOW;
			const swatchBg = themeBackground(null);
			const base = isRainbow ? rainbowStops(swatchBg)[0] : isShimmer ? DEFAULT_BLUE : value;
			const rgb = hexToRgb(base) || [0, 0, 0];
			const [hexDraft, setHexDraft] = react.useState(base);
			const [rgbDraft, setRgbDraft] = react.useState(rgb);
			// The match report is keyed by the colour it produced, so any manual edit
			// (which changes `value`) drops it instead of leaving a stale claim.
			const [matched, setMatched] = react.useState(null);
			const blockRef = react.useRef(null);

			react.useEffect(() => {
				const isDefault = value === SHIMMER || !value;
				const next = value === RAINBOW ? rainbowStops(themeBackground(null))[0] : isDefault ? DEFAULT_BLUE : value;
				setHexDraft(next);
				setRgbDraft(hexToRgb(next) || [0, 0, 0]);
			}, [value]);

			const commit = (hex) => {
				const valid = hexToRgb(hex);
				if (valid) { onChange(hex); return true; }
				return false;
			};
			const swatchStyle = isRainbow
				? { backgroundImage: rainbowGradient(swatchBg) }
				: isShimmer
					? { backgroundImage: `linear-gradient(90deg, ${DEFAULT_BLUE} 0%, ${DEFAULT_BLUE} 40%, ${mixToWhite(DEFAULT_BLUE, 0.35)} 50%, ${DEFAULT_BLUE} 60%, ${DEFAULT_BLUE} 100%)` }
					: { backgroundColor: value };
			// While following, re-read the theme on every render: a theme switch makes
			// the follow observer patch the colour, which re-renders this block, so the
			// report underneath stays live instead of quoting the last click.
			let report = matched;
			if (following === true) {
				const live = matchThemeColor(blockRef.current);
				if (live.raw !== null) report = live;
			}
			const showMatch = report !== null && report !== void 0 && (following === true || report.color === value);

			return jsxs("div", { className: "tq-colorBlock", ref: blockRef, children: [
				jsxs("div", { className: "tq-colorRow", children: [
					jsx("button", { type: "button", className: "tq-swatch", style: swatchStyle, title: "preview", "aria-label": "color preview" }),
					jsx("input", { type: "color", className: "tq-colorPicker", value: base, onChange: (e) => { const hex = e.currentTarget.value; setHexDraft(hex); setRgbDraft(hexToRgb(hex) || [0, 0, 0]); onChange(hex); } }),
					jsx("input", { type: "text", className: "tq-input", value: hexDraft, placeholder: "#RRGGBB", onChange: (e) => { const v = e.currentTarget.value; setHexDraft(v); commit(v); },
						onBlur: () => { if (!hexToRgb(hexDraft)) { setHexDraft(base); } } }),
					jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[0], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [n, rgbDraft[1], rgbDraft[2]]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
					jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[1], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [rgbDraft[0], n, rgbDraft[2]]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
					jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[2], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [rgbDraft[0], rgbDraft[1], n]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
					jsx("button", {
						type: "button",
						className: "tq-btn tq-btnGhost tq-btnSmall" + (following === true ? " tq-btnOn" : ""),
						title: t("quips.matchThemeTitle"),
						"aria-pressed": following === true,
						onClick: (e) => {
							// Read the tokens from the button itself: it sits inside the app, so
							// it inherits the active theme's custom properties.
							const next = matchThemeColor(e.currentTarget);
							setMatched(next);
							onMatchTheme(next.color);
						},
						children: following === true ? t("quips.following") : t("quips.matchTheme")
					}),
					// Only while following: keep the colour, drop the follow flag.
					following === true
						? jsx("button", {
							type: "button",
							className: "tq-btn tq-btnGhost tq-btnSmall",
							title: t("quips.stopFollowTitle"),
							onClick: () => { setMatched(null); onStopFollow(); },
							children: t("quips.stopFollow")
						})
						: null
				] }),
				showMatch
					? jsx("div", { className: "tq-themeNote", children:
						(report.fallback ? t("quips.matchFallback") : t("quips.matched"))
						+ " " + (report.raw || DEFAULT_BLUE) + " → " + report.color
						+ " · " + t("quips.contrast") + " " + report.contrast.toFixed(1) + ":1"
						+ " · " + t("quips.scheme." + report.scheme) })
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

			return jsx(ModalBox, {
				title: t("quips.modalTitle"),
				closeLabel: t("quips.close"),
				onClose,
				footer: jsxs("div", { className: "tq-footer", children: [
					jsx("div", { className: "tq-spacer" }),
					jsx("button", { type: "button", className: "tq-btn", onClick: save, children: t("quips.save") })
				] }),
				// `data-modal-autofocus` is the official Modal's marker for what to focus when
				// it opens; the fallback ignores it (and the browser's own focus order applies).
				children: jsxs("div", { className: "tq-body", children: [
					jsx("textarea", { className: "tq-textarea", "data-modal-autofocus": true, value: text, placeholder: t("quips.textareaPlaceholder"), spellCheck: false, onChange: (e) => setText(e.currentTarget.value) }),
					jsx("div", { className: "tq-hint", children: t("quips.textareaHint") })
				] })
			});
		}

		// ── React: the `settings.section` page ───────────────────────────────
		/**
		* The plugin's own settings page.
		*
		* It used to be one row under General (`settings.general.item`), which was the right seat
		* for a single preference and the wrong one for twelve: the section slot exists for "a
		* whole page", and a page has room for the colour block, the timing, the effects and the
		* quip list without crowding the users of every other plugin that also adds a row there.
		* The shell owns the nav row, the page title and navigation; this component renders the
		* page BODY, and receives `t` (our dictionary, bound by the slot) plus `close`.
		*/
		function QuipsSettingsPanel({ t }) {
			const cfg = react.useSyncExternalStore(store().subscribe, store().get);
			// A runtime fact, so it is shown but never editable (and never saved).
			const runtime = react.useSyncExternalStore(runtimeStore().subscribe, runtimeStore().get);
			const [open, setOpen] = react.useState(false);

			const isShimmer = cfg.color === SHIMMER || !cfg.color;
			const langMode = cfg.langMode || "ui";
			const seconds = Math.max(1, Math.round((cfg.quipMs || 8000) / 1000));
			const glowValue = clamp(cfg.glow == null ? DEFAULT_GLOW : Number(cfg.glow) || 0, 0, 100);
			const textEffect = TEXT_EFFECTS.indexOf(cfg.textEffect) !== -1 ? cfg.textEffect : "shimmer";
			const clockMode = CLOCK_MODES.indexOf(cfg.clockMode) !== -1 ? cfg.clockMode : "inline";
			const surface = SURFACES.indexOf(runtime && runtime.surface) !== -1 ? runtime.surface : "web";
			const platform = (runtime && runtime.platform) || "unknown";
			// The background the preset chips are fitted to, read once per render. It has to be
			// re-read rather than remembered: a theme switch re-renders this page, and the chips
			// must then show the colours a click would write under the NEW background.
			const presetsBg = themeBackground(null);
			return jsxs("div", { className: "tq-page", children: [
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
				// The one-click colour presets. They sit above the wheel and the hex fields
				// because they are the short path and those are the long one; the row is skipped
				// entirely when the table is empty, so a trimmed build cannot render an empty box.
				COLOR_PRESETS.length === 0 ? null : jsxs("div", { className: "tq-colorBlock", children: [
					jsx("div", {
						className: "tq-presets",
						role: "group",
						"aria-label": t("quips.presets"),
						children: COLOR_PRESETS.map((preset) => {
							const active = presetActive(preset.id, cfg.color, presetsBg);
							const swatch = presetSwatch(preset.id, presetsBg);
							return jsx("button", {
								type: "button",
								className: "tq-preset" + (active ? " tq-presetOn" : ""),
								"aria-pressed": active,
								// The id on the element is what the self-check finds the chips by; a
								// class alone would also match the CSS rule's own name by accident.
								"data-tq-preset": preset.id,
								title: t(preset.key),
								// Read the tokens from the pressed button itself (it sits inside the
								// app), exactly like the Match-theme button does, so the fit uses the
								// background that is on screen at the moment of the click.
								onClick: (e) => patchConfig(presetPatch(preset.id, themeBackground(e.currentTarget))),
								children: [
									jsx("span", { className: "tq-presetChip", style: swatch === null ? {} : swatch }),
									jsx("span", { className: "tq-presetLabel", children: t(preset.key) })
								]
							}, preset.id);
						})
					}),
					jsx("div", { className: "tq-hint", children: t("quips.presetsHint") })
				] }),
				jsx(ColorControl, {
					value: cfg.color,
					following: cfg.colorTheme === true,
					t,
					// Any manual edit stops the theme follow; the match button restarts it.
					onChange: (color) => patchConfig({ color, colorTheme: false }),
					onMatchTheme: (color) => patchConfig({ color, colorTheme: true }),
					// Stopping keeps the colour that is on screen right now.
					onStopFollow: () => patchConfig({ colorTheme: false })
				}),
				// Only offered once there is something to undo: back to DSH's own
				// untouched shimmer (setting the sentinel clears the override entirely).
				isShimmer
					? null
					: jsx("button", { type: "button", className: "tq-btn tq-btnGhost", onClick: () => patchConfig({ color: SHIMMER, colorTheme: false }), children: t("quips.default") }),
				jsxs("div", { className: "tq-timeRow", children: [
					jsx("span", { className: "tq-timeLabel", children: t("quips.time") }),
					jsx("input", { type: "number", className: "tq-timeInput", min: 1, max: 120, value: seconds, onChange: (e) => { const s = clamp(Math.round(Number(e.currentTarget.value) || 8), 1, 120); patchConfig({ quipMs: s * 1000 }); } }),
					jsx("span", { className: "tq-timeUnit", children: t("quips.timeUnit") })
				] }),
				// The sweep's brightness. It is a percentage mixed toward white and it lands on
				// `--dsw-alias-label-shimmer` — the very token the official TextShimmer paints its
				// moving highlight with (measured in TextShimmer.module.css), which is why the
				// official sweep answers to it and no second implementation is involved.
				jsxs("div", { className: "tq-timeRow", children: [
					jsx("span", { className: "tq-timeLabel", children: t("quips.glow") }),
					jsx("input", { type: "number", className: "tq-timeInput", min: 0, max: 100, value: glowValue, onChange: (e) => { const g = clamp(Math.round(Number(e.currentTarget.value) || 0), 0, 100); patchConfig({ glow: g }); } }),
					jsx("span", { className: "tq-timeUnit", children: "%" })
				] }),
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.speed") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.speedDesc") })
					] }),
					jsx(SegControl, {
						id: "tq-speed",
						label: t("quips.speed"),
						value: speedLevel(cfg),
						options: SPEED_ORDER.map((level) => ({ value: level, label: t("quips.speed." + level) })),
						onChange: (level) => patchConfig({ speed: level })
					})
				] }),
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.textEffect") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.textEffectDesc") })
					] }),
					jsx("select", {
						className: "tq-select",
						title: t("quips.textEffect"),
						"aria-label": t("quips.textEffect"),
						value: textEffect,
						onChange: (e) => patchConfig({ textEffect: e.currentTarget.value }),
						children: TEXT_EFFECTS.map((v) => jsx("option", { value: v, children: t("quips.effect." + v) }, v))
					})
				] }),
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.clock") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.clockDesc") })
					] }),
					jsx(SegControl, {
						id: "tq-clock",
						label: t("quips.clock"),
						value: clockMode,
						options: CLOCK_MODES.map((mode) => ({ value: mode, label: t("quips.clock." + mode) })),
						onChange: (mode) => patchConfig({ clockMode: mode })
					})
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
				// Only worth saying when it applies: the official whale's own motion is inside the
				// image file, so the speed level can only add the plugin's swim cue around it.
				cfg.loader === "native"
					? jsx("div", { className: "tq-hint", children: t("quips.loader.nativeNote") })
					: null,
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.language") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.langDesc") })
					] }),
					jsx(SegControl, {
						id: "tq-lang",
						label: t("quips.language"),
						value: langMode,
						options: [
							{ value: "ui", label: t("quips.lang.ui") },
							{ value: "en", label: t("quips.mode.en") },
							{ value: "zh", label: t("quips.mode.zh") },
							{ value: "mix", label: t("quips.mode.mix") }
						],
						onChange: (mode) => patchConfig({ langMode: mode })
					})
				] }),
				jsxs("div", { className: "tq-langRow", children: [
					jsxs("div", { className: "tq-langText", children: [
						jsx("div", { className: "tq-langTitle", children: t("quips.indicatorOnly") }),
						jsx("div", { className: "tq-langDesc", children: t("quips.indicatorOnlyDesc") })
					] }),
					jsx(SwitchControl, {
						checked: cfg.indicatorOnly === true,
						label: t("quips.indicatorOnly"),
						onChange: (next) => patchConfig({ indicatorOnly: next })
					})
				] }),
				// Troubleshooting, not a preference: the surface this session runs on. Written
				// onto the DOM as well as shown, so a bug report can quote it verbatim.
				jsx("div", {
					className: "tq-hint",
					"data-tq-surface": surface,
					"data-tq-platform": platform,
					children: t("quips.surface") + ": " + t("quips.surface." + surface) + " · " + platform
				}),
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
			applySpeedCSS(store().get());
			store().subscribe(() => {
				applyColorCSS(store().get());
				applySpeedCSS(store().get());
			});

			// Locale awareness: pick the phrase list from the active UI language.
			const resolveLocale = () => {
				try {
					return (ctx.locale && ctx.locale.getLocale && ctx.locale.getLocale().active) || "en";
				} catch (_) { return "en"; }
			};
			let activeLocale = resolveLocale();
			navLocale = activeLocale;
			if (ctx.on) ctx.on("locale/change", (snap) => { activeLocale = (snap && snap.active) || activeLocale; navLocale = activeLocale; });

			// The rotation clock: when the currently showing quip started.
			//
			// Deliberately independent of the DOM. DSH re-creates the running line whenever the
			// turn re-renders — on every tool call, and once a second for the elapsed label — and
			// this plugin used to treat "there is no icon in this element yet" as a first paint and
			// restart the list at quip #1. That changed the text, which rebuilt the effect
			// container, which restarted its animation: the visible quip jumped and the animation
			// snapped back every time a tool ran. Nothing on screen should change just because the
			// shell re-rendered.
			const rotationStart = Date.now();
			/**
			* The quip the rotation opens on: ONE random index per page load.
			*
			* WHY THIS IS RANDOM (reported from real use): the origin above is this page load, so
			* `floor(elapsed / quipMs) % count` is 0 for the first interval, which meant a refresh
			* always opened on the SAME first quip ("正在思考…") no matter what had been showing.
			* The offset is an INDEX rather than a millisecond phase: it stays correct when the list
			* length or the per-quip time changes, the rotation still advances exactly one step per
			* interval, and a shell that re-renders still cannot move the quip (the origin is
			* untouched — that is what the paragraph above protects).
			*
			* Chosen lazily, on the first pass, because that is where the list length is known.
			*/
			let quipStart = null;
			/**
			* Which quip the rotation is on, from the clock alone.
			* @param now - `Date.now()`.
			* @param quipMs - the configured time per quip.
			* @param count - how many quips the list holds.
			* @returns the index to show.
			*/
			const quipIndex = (now, quipMs, count) => {
				if (quipStart === null) quipStart = Math.floor(Math.random() * count);
				return (Math.floor((now - rotationStart) / (quipMs || 8000)) + quipStart) % count;
			};
			/** The line the last pass worked on, so a new/removed turn can be told apart. */
			let lastHost = null;
			/**
			* Whether an element has left the document. The shell replacing the running line is
			* routine, and the plugin's nodes leave the document together with it.
			* @param node - the element to test.
			* @returns whether it is detached.
			*/
			const detached = (node) => {
				if (node === void 0 || node === null) return false;
				if (node.isConnected === false) return true;
				return node.isConnected === void 0 && typeof document.contains === "function" && document.contains(node) === false;
			};
			/**
			* Carry the plugin's own nodes from a line element DSH threw away into its replacement.
			*
			* Those containers hold state that cannot be re-created: the `data-text` guards, the CSS
			* animation phase, and the mounted `TextShimmer` React root (a root survives its container
			* being moved). Rebuilding them is what restarted the animation on every tool call. Only
			* the plugin's own two nodes are touched — never anything DSH owns.
			* @param from - the line element that left the document.
			* @param to - the line element that replaced it.
			* @returns the plugin's line element now inside `to`, or null when it could not come along.
			*/
			const adoptNodes = (from, to) => {
				try {
					if (!detached(from)) return null;
					const container = visibleContent(to);
					if (container === null || typeof container.appendChild !== "function") return null;
					const loader = to.querySelector(".tq-loader") === null ? from.querySelector(".tq-loader") : null;
					const line = to.querySelector("." + LINE_CLASS) === null ? lineOf(from) : null;
					// The icon first, so it still ends up immediately before the line.
					if (loader !== null) container.appendChild(loader);
					if (line !== null) container.appendChild(line);
					return line;
				} catch (_) { return null; }
			};
			/**
			* One reconciliation pass: resolve the running line, keep DSH's own indicator, and put
			* the configured text (+ optional elapsed time) on the plugin's line.
			*/
			const pass = () => {
				// Independent of the running line, and cheap while the settings panel is closed
				// (the query finds no rows at all): keep our nav row marked so the stylesheet can
				// paint the plugin's glyph there. Runs before the early returns below, because the
				// settings panel can be open with no turn in flight.
				markSettingsNav();
				const cfg = store().get();
				const host = runningStatus();
				if (host === null) {
					if (lastHost !== null) {
						// The line left the document, so this turn has no clock of its own any
						// more. Only the SELF-timer is dropped here: the official start is the
						// seat's to give and take (a refresh re-mounts the line but not the seat),
						// and the shell's own label outlives both — see `elapsedFrom`.
						unmountOfficial();
						unmountLoaderIcon();
						resetSelfClock();
						lastHost = null;
					}
					return;
				}
				if (host !== lastHost) {
					// DSH replaced the line (a tool call, an elapsed tick): take our nodes along
					// instead of rebuilding them. The official root lives in a box inside those
					// nodes, so it stays valid — re-point its bookkeeping (which tracks the LINE,
					// exactly as renderOfficial records it) rather than remounting the root.
					const adopted = adoptNodes(lastHost, host);
					if (adopted !== null && officialRoot !== null) officialHost = adopted;
					else unmountOfficial();
					lastHost = host;
				}
				paintHost(host);
				ensureLoader(host, cfg.loader, cfg.loaderSize);
				// The equalizer's geometry has to be re-snapped whenever the base font size changes —
				// a global setting — so it rides the same pass that paints the icon.
				if (typeof host.querySelector === "function") snapBarsGeometry(host.querySelector(".tq-loader-bars"));
				if (cfg.indicatorOnly === true) {
					// Indicator only: the visible text stays DSH's, so hand it back.
					releaseOwnership(host);
					return;
				}
				const quips = selectPhrases(cfg, activeLocale);
				if (!quips.length) { restoreStatusText(host); return; }
				const idx = quipIndex(Date.now(), cfg.quipMs, quips.length);
				const mode = CLOCK_MODES.indexOf(cfg.clockMode) !== -1 ? cfg.clockMode : "inline";
				const now = Date.now();
				const quip = quips[idx];
				// Same collapse as the quip sections use, so the duration's units always
				// match the language the quips themselves were chosen for.
				const locale = effectiveLang(activeLocale);
				if (mode === "inline") {
					clearClock(host);
					applyStatusText(host, withInlineClock(quip, elapsedFrom(host, now), locale), cfg);
					return;
				}
				applyStatusText(host, quip, cfg);
				if (mode === "separate") renderClock(host, elapsedFrom(host, now), locale);
				else clearClock(host);
			};
			const timer = setInterval(() => {
				try { pass(); } catch (_) { /* never break the shell */ }
			}, POLL_MS);
			// Publish the live pass for the preview page (see livePass above), and unpublish it on
			// teardown so a disposed plugin never answers for a running one.
			livePass = pass;
			// Immediate first pass.
			try { pass(); } catch (_) { /* noop */ }

			// Instant first-paint: catch the status element the moment it is
			// committed (before the browser paints), so "Deep diving…" never flashes.
			let observer = null;
			try {
				if (typeof MutationObserver !== "undefined" && document.body) {
					observer = new MutationObserver(() => {
						try { pass(); } catch (_) { /* noop */ }
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
							// The rainbow's stops are fitted to the background, so a theme switch must
							// re-fit them even though the rainbow itself never follows the theme.
							if (cfg.color === RAINBOW) { applyColorCSS(cfg); return; }
							if (cfg.colorTheme !== true) return;
							const report = matchThemeColor(document.body);
							if (report.color !== cfg.color) patchConfig({ color: report.color });
						} catch (_) { /* noop */ }
					});
					themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "style", "class"] });
				}
			} catch (_) { /* no theme follow; the button still matches on click */ }

			// Settings row + dictionaries + the official turn-clock bridge.
			try {
				const ctxEffect = ctx && typeof ctx.effect === "function" ? ctx.effect.bind(ctx) : null;
				if (ctxEffect) {
					ctxEffect(() => {
						return () => {
							try { if (observer) observer.disconnect(); } catch (_) { /* noop */ }
							try { if (themeObserver) themeObserver.disconnect(); } catch (_) { /* noop */ }
							try { if (morphStop !== null) cancelAnimationFrame(morphStop); } catch (_) { /* noop */ }
							try { unmountOfficial(); } catch (_) { /* noop */ }
							try { unmountLoaderIcon(); } catch (_) { /* noop */ }
							// Give DSH its own indicator back if the plugin was unloaded mid-turn.
							try { if (lastHost && typeof lastHost.removeAttribute === "function") lastHost.removeAttribute(ICON_ATTR); } catch (_) { /* noop */ }
							if (typeof clearInterval === "function") clearInterval(timer);
							if (livePass === pass) livePass = null;
						};
					});
				}
				ctx.effect(() => ctx.locale.register(DICT_NS, { zh, en }), "dsh-thinking-quips: dictionaries");
				// Runtime fact, not a preference: `<html data-platform>` may be written after
				// this plugin loads, so the surface is re-read on every change and the
				// watcher is torn down with the plugin.
				ctx.effect(() => {
					const refresh = () => runtimeStore().set(readRuntime());
					refresh();
					const stopWatching = watchSurface(refresh);
					return () => stopWatching();
				}, "dsh-thinking-quips: surface detection");
				// The plugin's own settings PAGE. `settings.section` is the seat for a whole page
				// ("a single setting that needs no page of its own" is `settings.general.item`,
				// which this plugin no longer uses): the nav row, the page title and navigation
				// belong to the shell, and our component renders the body.
				// `label` is a THUNK because the shell re-reads it on every projection, so the nav
				// row follows the active locale without re-registering — and it has to come from
				// our own dictionaries, since the shell asks before this component ever renders.
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "thinking-quips",
					order: 30,
					label: () => (effectiveLang(resolveLocale()) === "zh" ? zh["quips.title"] : en["quips.title"]),
					locale: DICT_NS,
					inject: () => ({})
				}, QuipsSettingsPanel));
				// DSH renders `conversation.chat.turnTail` once per turn tail in the transcript
				// — finished turns included, and their tails stay mounted — so this headless
				// occupant is mounted many times and must not treat its turn as the running
				// one. It hands every turn it sees to `recordTurnClock`, which keeps only an
				// open turn and never lets an older start win; the self-timer covers the gap
				// before the open turn's tail arrives, and an older shell (no seat) entirely.
				ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
					name: "conversation.chat.turnTail",
					id: "thinking-quips-clock",
					locale: DICT_NS,
					inject: () => ({})
				}, TurnClockBridge));
			} catch (_) { /* slot/registration must not break the shell */ }
		}

		exports.apply = apply;
		exports.inject = inject;
		/**
		* Test seam (also handy from devtools): the pure helpers the smoke tests need
		* to exercise directly. The runtime only ever reads `apply` / `inject`.
		*/
		/**
 * The live reconciliation entry of the running `apply()` pass, published for the preview page.
 *
 * `pass` is a LOCAL of apply() (it closes over the boot-time host lookup), so it cannot be
 * exported by name: doing that made the whole module throw `ReferenceError: pass is not defined`
 * for every consumer, preview page included. This holder is assigned inside apply() and only ever
 * read through {@link forcePass}.
 */
let livePass = null;
/**
 * Run the plugin's own reconciliation once, if a pass is live.
 * @returns true when a pass ran — the preview page uses it to apply a changed control at once
 * instead of waiting up to 600ms for the poll (which reads as a dead control).
 */
function forcePass() {
	if (livePass === null) return false;
	try { livePass(); return true; } catch (_) { return false; }
}

exports.__internal = {
			STORAGE_KEY,
			SHIMMER,
			DEFAULT_BLUE,
			DEFAULT_GLOW,
			mixToWhite,
			DEFAULTS,
			LOADER_STYLES,
			LOADER_SPRITES,
			SPRITE_BOX,
			ensureSprite,
			LOADER_SCALES,
			TEXT_EFFECTS,
			CLOCK_MODES,
			DURATION_UNITS,
			INLINE_CLOCK,
			formatDuration,
			withInlineClock,
			officialTurn,
			elapsedMs,
			recordTurnClock,
			releaseTurnClock,
			clearTurnClock,
			durationFromText,
			labelDuration,
			elapsedFrom,
			resetSelfClock,
			TurnClockBridge,
			SPEED_LEVELS,
			SPEED_ORDER,
			SURFACES,
			detectSurface,
			detectPlatform,
			watchSurface,
			readRuntime,
			runtimeStore,
			waveTokens,
			applyStatusText,
			restoreStatusText,
			speedOf,
			speedLevel,
			THEME_COLOR_TOKENS,
			THEME_BG_TOKENS,
			MIN_CONTRAST,
			parseCssColor,
			relativeLuminance,
			contrastRatio,
			rgbToHsl,
			hslToHex,
			fitToTheme,
			// The colour presets, exposed as the REAL table plus the REAL patch builder the
			// settings page calls — not as loose constants. The self-check enumerates this table
			// and drives this function, so changing a preset's colour or breaking the follow-off
			// wiring in the click handler turns the check red instead of being self-certified.
			COLOR_PRESETS,
			RAINBOW,
			rainbowStops,
			rainbowGradient,
			rainbowCSS,
			presetSwatch,
			colorPreset,
			presetColor,
			presetPatch,
			presetActive,
			readableOn,
			themeBackground,
			themeScheme,
			themeColor,
			matchThemeColor,
			loaderCells,
			ensureLoader,
			NAV_ICON_WHALE_PATH,
			NAV_ICON_STROKE,
			SECTION_ATTR,
			navIconDocument,
			markSettingsNav,
			injectPluginCss,
			resolveLoader,
			patchConfig,
			// The config store itself, so a self-check can assert a preset landed in the reactive
			// store the UI reads — not only in localStorage, which is written by the same call but
			// is not what renderers subscribe to.
			store,
			loadConfig,
			// The preview page drives one reconciliation pass itself so a control takes effect the
			// moment it is changed instead of on the next 600ms poll (see livePass/forcePass above).
			forcePass,
			// Exposed so a test can assert the device-pixel snap exists (the layout engine decides
			// whether it actually helps, which only a browser check can show).
			snapBarsGeometry,
			nativeWhaleSource,
			officialWhaleNode,
			officialWhaleMask,
			selectPhrases,
			parseQuips,
			morphProfile,
			morphPath,
			morphFrame,
			morphRotation,
			morphEase,
			morphSpinEase,
			MORPH_ORDER,
			MORPH_SAMPLES,
			MORPH_RADIUS,
			MORPH_CYCLE_MS,
			ColorControl,
			QuipsModal,
			SwitchControl,
			SegControl,
			ModalBox,
			QuipsSettingsPanel
		};
		return module.exports;
	}
});
