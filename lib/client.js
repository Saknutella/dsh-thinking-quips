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
		const LOADER_STYLES = ["orbit", "ring", "pulse", "dots", "bars", "morph"];
		/** Visual scale per size token (applied as a CSS variable on the loader). */
		const LOADER_SCALES = { sm: 0.8, md: 1, lg: 1.25 };
		/** SVG namespace for the SVG-drawn indicators (see {@link ensureRing}). */
		const SVG_NS = "http://www.w3.org/2000/svg";
		/** Ring geometry in SVG user units inside a {@link RING_BOX} square. */
		const RING_BOX = 16;
		const RING_RADIUS = 6.5;
		/** ~30% of the 2*pi*RING_RADIUS circumference is drawn, the rest is the gap. */
		const RING_DASH = "12.3 28.6";

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
			const half = RING_BOX / 2;
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
		const DEFAULTS = { enabled: true, color: SHIMMER, colorTheme: false, langMode: "ui", quips: DEFAULT_QUIPS, perLang: {}, quipMs: 8000, glow: 35, indicatorOnly: false, loader: "orbit", loaderSize: "md", textEffect: "shimmer", speed: "normal", clockMode: "inline" };
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
		function applyQuip(el, text) {
			const node = quipNode(el);
			if (node !== null) node.nodeValue = text;
		}

		// ── line ownership (0.2) ─────────────────────────────────────────────
		/** Marks a wrapper whose visible label the plugin has taken over (hides it by CSS). */
		const OWNED_ATTR = "data-tq-owned";
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
		* That seat is mounted while the turn is still open and receives the turn's
		* `TurnLocation`, which is where the authoritative `start.time` (the very field
		* DSH's own clock uses) comes from — so the plugin does not have to derive it, and
		* does not need to know which session it is looking at.
		*/
		const officialTurn = { turn: undefined, startTime: undefined };
		/** Self-timed fallback: when the running line appeared, if no official time is known. */
		let selfStart = 0;
		/** Forget the self-timer (called when the running line leaves the document). */
		function resetSelfClock() { selfStart = 0; }
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
		* Headless occupant of `conversation.chat.turnTail`. The shell mounts it while the
		* turn is open and hands over that turn's location; it publishes the official start
		* time and renders nothing.
		* @param props.turn - official `TurnLocation` for the open turn.
		* @returns null (renders nothing).
		*/
		function TurnClockBridge({ turn }) {
			const number = turn === void 0 ? undefined : turn.turn;
			const start = turn === void 0 || turn.start === void 0 ? undefined : turn.start.time;
			react.useEffect(() => {
				officialTurn.turn = number;
				officialTurn.startTime = typeof start === "number" ? start : undefined;
				selfStart = 0; // the official start supersedes the self-timer
				return () => {
					if (officialTurn.turn === number) {
						officialTurn.turn = undefined;
						officialTurn.startTime = undefined;
					}
				};
			}, [number, start]);
			return null;
		}

		// ── text effects: the official sweep, a wave, or the legacy glow ─────
		/**
		* Selectable status-text effects.
		*
		* `shimmer` and `official` are the same rendering on DSH 0.2: the visible label
		* now lives inside DSH's `TextShimmer` and is re-rendered every second (the label
		* carries the elapsed time), so a plugin that owns the line can only reproduce
		* "DSH's own sweep" by rendering that same component itself. `shimmer` is kept as
		* the name saved in existing configs; `official` is the honest alias.
		* `glow` recreates the pre-0.2 DSH look (a `background-clip:text` gradient sliding
		* through the glyphs) on a node the plugin owns, so it needs no DSH internals.
		*/
		const TEXT_EFFECTS = ["shimmer", "official", "wave", "glow"];
		/** The 0.2 half of {@link TEXT_EFFECTS}: both render the official sweep. */
		const OFFICIAL_EFFECTS = ["shimmer", "official"];
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
		/** The 0.1.x-look gradient container inside a line element. */
		function glowSpan(el) {
			return el && typeof el.querySelector === "function" ? el.querySelector(".tq-glow") : null;
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
		* @param keep - `"wave"`, `"glow"`, `"official"`, or undefined for none.
		*/
		function clearEffects(el, keep) {
			if (keep !== "wave") {
				dropSpan(waveSpan(el));
				try {
					if (el && el.classList && typeof el.classList.remove === "function") el.classList.remove("tq-waving");
				} catch (_) { /* no classList: the rule simply keeps applying */ }
			}
			if (keep !== "glow") dropSpan(glowSpan(el));
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
		* so DSH's own `TextShimmer` can be reused instead of reimplemented. Looked up
		* lazily and cached: a shell without the seed must not break the plugin.
		* @returns the official `TextShimmer` component, or null.
		*/
		function officialShimmer() {
			if (primitivesModule === void 0) {
				try {
					const mod = require("@deepseek-ai/dsh-client-ui-primitives");
					primitivesModule = mod !== null && mod !== void 0 && typeof mod.TextShimmer === "function" ? mod : null;
				} catch (_) { primitivesModule = null; }
			}
			return primitivesModule === null ? null : primitivesModule.TextShimmer;
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
		* Render `text` as the pre-0.2 gradient sweep the plugin owns (the `glow` effect).
		* @param el - the effect target.
		* @param text - the line to show.
		*/
		function renderGlow(el, text) {
			if (typeof document === "undefined" || typeof document.createElement !== "function") return;
			let span = glowSpan(el);
			if (span === null) {
				span = document.createElement("span");
				span.className = "tq-glow";
				if (typeof el.appendChild !== "function") return;
				el.appendChild(span);
			}
			if (typeof span.getAttribute === "function" && span.getAttribute("data-text") === text) return;
			if (typeof span.setAttribute === "function") span.setAttribute("data-text", text);
			while (span.firstChild) span.removeChild(span.firstChild);
			span.appendChild(document.createTextNode(text));
		}

		// ── text effects: the official sweep, a wave, or the legacy glow ─────
		/**
		* Draw the line as per-token spans so CSS can stagger them.
		*
		* On 0.1.x the label node DSH/React owns is KEPT and merely blanked: deleting a node
		* React still holds is how a plugin breaks the shell. On 0.2 the target is the
		* plugin's own line, which has no label node at all.
		* The rebuild is skipped when the text is unchanged, otherwise the animation would
		* restart on every 600ms poll.
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
			span.setAttribute("data-text", text);
			while (span.firstChild) span.removeChild(span.firstChild);
			let index = 0;
			for (const token of waveTokens(text)) {
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
		* `glow` and `wave` paint the plugin's own nodes; `shimmer`/`official` render DSH's
		* own `TextShimmer` component, because on 0.2 the official sweep lives inside that
		* component and its label is rewritten every second — see the effect list comment.
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
			if (effect === "glow") { clearEffects(el, "glow"); renderGlow(el, text); return; }
			if (OFFICIAL_EFFECTS.indexOf(effect) !== -1) {
				// 0.1.x `shimmer` is left to DSH: there the sweep really is a rule on the
				// status element, and writing the label is all that is needed.
				if (!target.modern && effect === "shimmer" && glowSpan(el) === null && officialSpan(el) === null) {
					if (quickLabelWrite(el, text)) return;
				}
				nodeBlanked(el); // 0.1.x: hide DSH's plain label before rendering our own copy
				clearEffects(el, "official");
				if (renderOfficial(el, text)) return;
				clearEffects(el, "glow");
				renderGlow(el, text);
				return;
			}
			clearEffects(el, void 0);
			applyQuip(el, text);
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
		* plugin renders its own copy (0.1.x, `official`/`glow`).
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
		* @param host - the running line element.
		*/
		function releaseOwnership(host) {
			if (host === null || host === void 0) return;
			const target = textTarget(host);
			clearEffects(target.el, void 0);
			dropSpan(clockSpan(target.el));
			if (target.modern) {
				try {
					if (typeof host.removeAttribute === "function") host.removeAttribute(OWNED_ATTR);
				} catch (_) { /* the marker is an optimisation */ }
				return;
			}
			const node = quipNode(host);
			const saved = typeof host.getAttribute === "function" ? host.getAttribute("data-tq-label") : null;
			if (node !== null && node.nodeValue === "" && saved) node.nodeValue = saved;
		}
		/**
		* Child cells for one loader style. Each cell gets `--i` (its step index) unless
		* it is a `blank` (the orbit's empty center). The ring is NOT built from cells —
		* it is real SVG geometry, see {@link ensureRing} — so it returns none.
		*/
		function loaderCells(style) {
			if (style === "orbit") {
				// Placed row-major into a 3x3 grid; the value is the clockwise ring index
				// (top-left(0), top-mid(1), top-right(2), mid-right(3), bottom-right(4),
				// bottom-mid(5), bottom-left(6), mid-left(7)); -1 is the empty center.
				return [0, 1, 2, 7, -1, 3, 6, 5, 4];
			}
			if (style === "dots" || style === "bars") return [0, 1, 2];
			if (style === "ring" || style === "morph") return []; // drawn as SVG
			return [0]; // pulse: a single element
		}
		/**
		* Build the ring indicator: two SVG circles in a 16x16 viewBox — a faint full
		* track and a bright round-capped arc spinning over it.
		*
		* CSS borders cannot draw this properly: `border-radius:50%` on a box whose
		* sides have different colours meets at four mitred corners, so at 16px the
		* "ring" reads as a rounded square with two diagonal stubs. A real circle has
		* no such failure mode, and `stroke-linecap:round` gives the usual spinner ends.
		* @param span - the `.tq-loader-ring` element to fill.
		*/
		function ensureRing(span) {
			if (typeof document.createElementNS !== "function") return;
			const svg = document.createElementNS(SVG_NS, "svg");
			svg.setAttribute("viewBox", "0 0 " + RING_BOX + " " + RING_BOX);
			svg.setAttribute("aria-hidden", "true");
			svg.setAttribute("focusable", "false");
			const centre = String(RING_BOX / 2);
			for (const cls of ["tq-ringTrack", "tq-ringArc"]) {
				const circle = document.createElementNS(SVG_NS, "circle");
				circle.setAttribute("class", cls);
				circle.setAttribute("cx", centre);
				circle.setAttribute("cy", centre);
				circle.setAttribute("r", String(RING_RADIUS));
				svg.appendChild(circle);
			}
			span.appendChild(svg);
		}
		/** cancelAnimationFrame handle of the running morph loop (at most one). */
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
			svg.setAttribute("viewBox", "0 0 " + RING_BOX + " " + RING_BOX);
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
			if (morphStop !== null) morphStop();
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
		function ensureLoader(el, style, size) {
			try {
				if (!el || typeof el.querySelector !== "function") return;
				// 0.2 keeps DSH's own whale icon on purpose — the two indicators coexist — so
				// the plugin's icon is added inside the same flex row, without touching it.
				const container = visibleContent(el);
				if (container === null || typeof container.insertBefore !== "function" || typeof container.appendChild !== "function") return;
				const want = LOADER_STYLES.indexOf(style) !== -1 ? style : "orbit";
				const scale = String(LOADER_SCALES[size] || 1);
				const existing = el.querySelector(".tq-loader");
				if (existing !== null) {
					const sameStyle = existing.getAttribute("data-style") === want;
					if (sameStyle && existing.getAttribute("data-scale") === scale) return; // already correct
					if (sameStyle) {
						existing.setAttribute("data-scale", scale);
						existing.style.setProperty("--tq-loader-scale", scale);
						return;
					}
					if (typeof existing.remove === "function") existing.remove();
				}
				const span = document.createElement("span");
				span.className = "tq-loader tq-loader-" + want;
				span.setAttribute("data-style", want);
				span.setAttribute("data-scale", scale);
				span.style.setProperty("--tq-loader-scale", scale);
				if (want === "ring") {
					ensureRing(span);
				} else if (want === "morph") {
					ensureMorph(span);
				} else {
					for (const v of loaderCells(want)) {
						const cell = document.createElement("i");
						if (v === -1) cell.className = "blank";
						else cell.style.setProperty("--i", String(v));
						span.appendChild(cell);
					}
				}
				// 0.2: after DSH's icon (which stays), before the plugin's own line. 0.1.x:
				// left of the label, exactly as before.
				if (isModern(el)) container.appendChild(span);
				else container.insertBefore(span, container.firstChild);
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
		const hostColor = { base: null, hi: null };
		/**
		* Write the current colour onto a running wrapper.
		*
		* Inline variables are used rather than `:root` rules so only this line is tinted:
		* `--tq-base`/`--tq-hi` feed the plugin's own nodes, and `--dsw-alias-label-shimmer`
		* tints DSH 0.2's sweep — the official `.running` rule re-maps that token to its own
		* deep-diving tint, which is the supported knob (the pre-0.2 `background-image`
		* surgery no longer has anything to paint on).
		* @param host - the running wrapper, or null.
		*/
		function paintHost(host) {
			if (host === null || host === void 0 || hostColor.base === null) return;
			try {
				const style = host.style;
				if (!style || typeof style.setProperty !== "function") return;
				style.setProperty("--tq-base", hostColor.base);
				style.setProperty("--tq-hi", hostColor.hi);
				style.setProperty("--dsw-alias-label-shimmer", hostColor.base);
			} catch (_) { /* inline variables are best-effort */ }
		}
		/** Remember a colour and apply it to the line that is on screen now. */
		function tintHost(base, hi) {
			hostColor.base = base;
			hostColor.hi = hi;
			paintHost(runningStatus());
		}
		/** Drop the override (the default brand-blue state). */
		function clearHostColor() {
			const host = runningStatus();
			hostColor.base = null;
			hostColor.hi = null;
			try {
				if (host && host.style && typeof host.style.removeProperty === "function") {
					host.style.removeProperty("--tq-base");
					host.style.removeProperty("--tq-hi");
					host.style.removeProperty("--dsw-alias-label-shimmer");
				}
			} catch (_) { /* nothing to clean */ }
		}
		/**
		* Apply the configured colour: the plugin's variables always, plus the legacy
		* `[class*="turnStatus"]` gradient rule for a 0.1.x shell.
		* @param cfg - the config (reads `color`, `glow`).
		*/
		function applyColorCSS(cfg) {
			if (typeof document === "undefined") return;
			const isDefault = cfg.color === SHIMMER || !cfg.color;
			const glow = clamp(cfg.glow == null ? 35 : Number(cfg.glow) || 35, 0, 100);
			const base = isDefault ? DEFAULT_BLUE : cfg.color;
			const hi = mixToWhite(base, glow / 100);
			let el = document.getElementById(COLOR_STYLE_ID);
			// Leave the authentic brand-blue shimmer completely untouched at its default glow.
			if (isDefault && glow === 35) {
				if (el) el.textContent = "";
				clearHostColor();
				return;
			}
			const css = `[role="status"][class*="turnStatus"]{background-image:linear-gradient(90deg, ${base} 0%, ${base} 40%, ${hi} 50%, ${base} 60%, ${base} 100%) !important}.tq-loader{color:${base} !important}.tq-wave{color:${base} !important}`;
			if (!el) {
				el = document.createElement("style");
				el.id = COLOR_STYLE_ID;
				document.head.appendChild(el);
			}
			el.textContent = css;
			tintHost(base, hi);
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
			const el = document.getElementById(SPEED_STYLE_ID);
			if (el) el.textContent = "";
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
			".tq-loader-orbit i{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.15;animation:tq-orbit-chase calc(1.6s / var(--tq-speed,1)) linear infinite;animation-delay:calc(var(--i) * .2s / var(--tq-speed,1))}",
			".tq-loader-orbit i.blank{background:transparent!important;animation:none}",
			// ring: a true circle — a faint full track (stroke on a full circle) under a
			// bright round-capped arc, both real SVG geometry. CSS borders meet at mitred
			// corners, which at 16px makes the "ring" look like a rounded square.
			".tq-loader-ring{display:block;width:16px;height:16px}",
			".tq-loader-ring svg{display:block;width:16px;height:16px;overflow:visible;animation:tq-spin calc(.9s / var(--tq-speed,1)) linear infinite}",
			".tq-loader-ring .tq-ringTrack{fill:none;stroke:currentColor;stroke-width:2;opacity:.2}",
			".tq-loader-ring .tq-ringArc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-dasharray:12.3 28.6}",
			// morph: one SVG path, its outline rewritten every frame by ensureMorph().
			".tq-loader-morph{display:block;width:16px;height:16px}",
			".tq-loader-morph svg{display:block;width:16px;height:16px;overflow:visible}",
			".tq-loader-morph .tq-morphPath{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round}",
			// pulse: one dot breathing.
			".tq-loader-pulse i{display:block;width:10px;height:10px;border-radius:50%;background:currentColor;animation:tq-pulse calc(1.1s / var(--tq-speed,1)) ease-in-out infinite}",
			// dots: three dots typing in sequence.
			".tq-loader-dots{display:inline-flex;align-items:center;gap:3px;height:12px}",
			".tq-loader-dots i{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.25;animation:tq-dots calc(1s / var(--tq-speed,1)) ease-in-out infinite;animation-delay:calc(var(--i) * .16s / var(--tq-speed,1))}",
			// bars: a three-bar equalizer.
			".tq-loader-bars{display:inline-flex;align-items:flex-end;gap:2px;height:13px}",
			".tq-loader-bars i{width:3px;height:100%;border-radius:1.5px;background:currentColor;opacity:.4;transform-origin:bottom;animation:tq-bars calc(1s / var(--tq-speed,1)) ease-in-out infinite;animation-delay:calc(var(--i) * .13s / var(--tq-speed,1))}",
			"@keyframes tq-orbit-chase{0%,100%{opacity:.15}8%{opacity:1}30%{opacity:.5}50%{opacity:.15}}",
			"@keyframes tq-spin{to{transform:rotate(360deg)}}",
			"@keyframes tq-pulse{0%,100%{transform:scale(.5);opacity:.3}50%{transform:scale(1);opacity:1}}",
			"@keyframes tq-dots{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}",
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
			// The `glow` effect: the pre-0.2 painted-gradient sweep, on a node the plugin
			// owns, so it depends on nothing DSH may rename.
			".tq-glow{background-image:linear-gradient(90deg, var(--tq-base,var(--dsw-static-deepseek-500)) 0%, var(--tq-base,var(--dsw-static-deepseek-500)) 40%, var(--tq-hi,#9db6f4) 50%, var(--tq-base,var(--dsw-static-deepseek-500)) 60%, var(--tq-base,var(--dsw-static-deepseek-500)) 100%);background-size:250% 100%;background-position:100% center;background-repeat:no-repeat;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:tq-glow 1.8s cubic-bezier(.33,0,.67,1) infinite;animation-duration:calc(1.8s / var(--tq-speed,1))}",
			"@keyframes tq-glow{66.6667%,100%{background-position:0% center}}",
			// The official TextShimmer is a React component; the plugin only gives it a box.
			".tq-official{display:inline-flex;min-width:0}",
			"@media (prefers-reduced-motion:reduce){.tq-loader i,.tq-loader svg,.tq-waveItem{animation:none!important}.tq-loader-orbit i,.tq-loader-dots i,.tq-loader-pulse i,.tq-loader-bars i{opacity:.7}.tq-loader-bars i{transform:scaleY(.7)}.tq-loader-orbit i.blank{opacity:0}.tq-glow{animation:none;background-image:none;-webkit-text-fill-color:currentColor}}"
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
			"quips.glow": "发光强度",
			"quips.speed": "动画速度",
			"quips.speedDesc": "统一调节动画快慢；「正常」就是默认速度，这一档不会覆盖任何东西。",
			"quips.speed.slow": "慢",
			"quips.speed.normal": "正常",
			"quips.speed.fast": "快",			"quips.textEffect": "文字特效",
			"quips.textEffectDesc": "状态行文字的动效：扫光由插件渲染 DSH 官方组件，就是官方那道横向流光；波浪让每个字（中文）或每个词（英文）依次向上跳一下；流光（旧版）复刻 0.2 之前的观感——文字自身被渐变照亮。",
			"quips.effect.shimmer": "扫光（默认）",
			"quips.effect.official": "官方扫光",
			"quips.effect.wave": "波浪",
			"quips.effect.glow": "流光（旧版）",
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
			"quips.following": "跟随主题中",
			"quips.stopFollow": "取消跟随",
			"quips.stopFollowTitle": "保留当前颜色，但不再随主题切换而变化",
			"quips.scheme.light": "浅色",
			"quips.scheme.dark": "深色",
			"quips.loader": "加载图标",
			"quips.loaderDesc": "状态行左侧动态图标的样式与尺寸。",
			"quips.loader.orbit": "点阵环游",
			"quips.loader.ring": "圆环旋转",
			"quips.loader.pulse": "呼吸脉冲",
			"quips.loader.dots": "三点跳动",
			"quips.loader.bars": "柱状律动",
			"quips.loader.morph": "形变环游",
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
			"quips.glow": "Glow strength",
			"quips.speed": "Animation speed",
			"quips.speedDesc": "One speed for the animations; Normal is the shipped pace and overrides nothing.",
			"quips.speed.slow": "Slow",
			"quips.speed.normal": "Normal",
			"quips.speed.fast": "Fast",
			"quips.textEffect": "Text effect",
			"quips.textEffectDesc": "What the status text does: Shimmer renders DSH's own sweep component (the official sideways highlight), Wave lifts each character (CJK) or word (Latin) in turn, and Glow (legacy) recreates the pre-0.2 look where the glyphs themselves are lit by a sliding gradient.",
			"quips.effect.shimmer": "Shimmer (default)",
			"quips.effect.official": "Official shimmer",
			"quips.effect.wave": "Wave",
			"quips.effect.glow": "Glow (legacy)",
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
			"quips.following": "Following theme",
			"quips.stopFollow": "Stop following",
			"quips.stopFollowTitle": "Keep the current color but stop tracking theme switches",
			"quips.scheme.light": "light",
			"quips.scheme.dark": "dark",
			"quips.loader": "Loader icon",
			"quips.loaderDesc": "Style and size of the animated icon left of the status line.",
			"quips.loader.orbit": "Dot orbit",
			"quips.loader.ring": "Spinner ring",
			"quips.loader.pulse": "Pulse",
			"quips.loader.dots": "Bouncing dots",
			"quips.loader.bars": "Equalizer bars",
			"quips.loader.morph": "Shape morph",
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
		function ColorControl({ value, onChange, onMatchTheme, onStopFollow, following, t }) {
			const isShimmer = value === SHIMMER || !value;
			const base = isShimmer ? DEFAULT_BLUE : value;
			const rgb = hexToRgb(base) || [0, 0, 0];
			const [hexDraft, setHexDraft] = react.useState(base);
			const [rgbDraft, setRgbDraft] = react.useState(rgb);
			// The match report is keyed by the colour it produced, so any manual edit
			// (which changes `value`) drops it instead of leaving a stale claim.
			const [matched, setMatched] = react.useState(null);
			const blockRef = react.useRef(null);

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
						onBlur: () => { if (!hexToRgb(hexDraft)) { setHexDraft(value === SHIMMER ? DEFAULT_BLUE : value); } } }),
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
			const textEffect = TEXT_EFFECTS.indexOf(cfg.textEffect) !== -1 ? cfg.textEffect : "shimmer";
			const clockMode = CLOCK_MODES.indexOf(cfg.clockMode) !== -1 ? cfg.clockMode : "inline";
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
					jsx("div", { className: "tq-seg", children: SPEED_ORDER.map((level) => jsx("button", {
						type: "button",
						className: "tq-segItem" + (speedLevel(cfg) === level ? " tq-segActive" : ""),
						"aria-pressed": speedLevel(cfg) === level,
						onClick: () => patchConfig({ speed: level }),
						children: t("quips.speed." + level)
					}, level)) })
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
					jsx("div", { className: "tq-seg", children: CLOCK_MODES.map((mode) => jsx("button", {
						type: "button",
						className: "tq-segItem" + (clockMode === mode ? " tq-segActive" : ""),
						"aria-pressed": clockMode === mode,
						onClick: () => patchConfig({ clockMode: mode }),
						children: t("quips.clock." + mode)
					}, mode)) })
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
			if (ctx.on) ctx.on("locale/change", (snap) => { activeLocale = (snap && snap.active) || activeLocale; });

			const start = Date.now();
			/** The line the last pass worked on, so a new/removed turn can be told apart. */
			let lastHost = null;
			/**
			* One reconciliation pass: resolve the running line, keep DSH's own indicator,
			* and put the configured text (+ optional elapsed time) on the plugin's line.
			* @param seed - whether this is a first paint (seed the first quip immediately).
			*/
			const pass = (seed) => {
				const cfg = store().get();
				const host = runningStatus();
				if (host === null) {
					if (lastHost !== null) {
						// The turn ended: drop the React root and let the next turn re-time itself.
						unmountOfficial();
						resetSelfClock();
						lastHost = null;
					}
					return;
				}
				if (host !== lastHost) {
					unmountOfficial(); // the old line element is gone; its root must not linger
					lastHost = host;
				}
				paintHost(host);
				ensureLoader(host, cfg.loader, cfg.loaderSize);
				if (cfg.indicatorOnly === true) {
					// Indicator only: the visible text stays DSH's, so hand it back.
					releaseOwnership(host);
					return;
				}
				const quips = selectPhrases(cfg, activeLocale);
				if (!quips.length) { restoreStatusText(host); return; }
				const idx = seed ? 0 : Math.floor((Date.now() - start) / (cfg.quipMs || 8000)) % quips.length;
				const mode = CLOCK_MODES.indexOf(cfg.clockMode) !== -1 ? cfg.clockMode : "inline";
				const now = Date.now();
				const quip = quips[idx];
				// Same collapse as the quip sections use, so the duration's units always
				// match the language the quips themselves were chosen for.
				const locale = effectiveLang(activeLocale);
				if (mode === "inline") {
					clearClock(host);
					applyStatusText(host, withInlineClock(quip, elapsedMs(now), locale), cfg);
					return;
				}
				applyStatusText(host, quip, cfg);
				if (mode === "separate") renderClock(host, elapsedMs(now), locale);
				else clearClock(host);
			};
			const timer = setInterval(() => {
				try { pass(false); } catch (_) { /* never break the shell */ }
			}, POLL_MS);
			// Immediate first pass.
			try { pass(true); } catch (_) { /* noop */ }

			// Instant first-paint: catch the status element the moment it is
			// committed (before the browser paints), so "Deep diving…" never flashes.
			let observer = null;
			try {
				if (typeof MutationObserver !== "undefined" && document.body) {
					observer = new MutationObserver(() => {
						try {
							const el = runningStatus();
							if (el === null) { pass(false); return; }
							const fresh = el.querySelector(".tq-loader") === null;
							pass(fresh); // seed the text on first paint only
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

			// Settings row + dictionaries + the official turn-clock bridge.
			try {
				const ctxEffect = ctx && typeof ctx.effect === "function" ? ctx.effect.bind(ctx) : null;
				if (ctxEffect) {
					ctxEffect(() => {
						return () => {
							try { if (observer) observer.disconnect(); } catch (_) { /* noop */ }
							try { if (themeObserver) themeObserver.disconnect(); } catch (_) { /* noop */ }
							try { if (morphStop !== null) morphStop(); } catch (_) { /* noop */ }
							try { unmountOfficial(); } catch (_) { /* noop */ }
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
				// DSH mounts `conversation.chat.turnTail` while a turn is open and hands over
				// that turn's location, so this headless occupant is how the plugin learns the
				// official start time (`turn.start.time`) without knowing which session is
				// on screen. Absent seat on an older shell: the self-timer covers it.
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
		exports.__internal = {
			STORAGE_KEY,
			SHIMMER,
			DEFAULT_BLUE,
			DEFAULTS,
			LOADER_STYLES,
			LOADER_SCALES,
			TEXT_EFFECTS,
			OFFICIAL_EFFECTS,
			CLOCK_MODES,
			DURATION_UNITS,
			INLINE_CLOCK,
			formatDuration,
			withInlineClock,
			officialTurn,
			SPEED_LEVELS,
			SPEED_ORDER,
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
			themeBackground,
			themeScheme,
			themeColor,
			matchThemeColor,
			loaderCells,
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
			QuipsSettingsRow
		};
		return module.exports;
	}
});
