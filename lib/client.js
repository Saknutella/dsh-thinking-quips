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
		const DEFAULTS = { enabled: true, color: SHIMMER, langMode: "ui", quips: DEFAULT_QUIPS, perLang: {}, quipMs: 8000, glow: 35 };

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

		// ── running-turn element hook ────────────────────────────────────────
		function runningStatus() {
			const nodes = document.querySelectorAll('[role="status"]');
			for (const el of nodes) {
				const cls = typeof el.className === "string" ? el.className : "";
				if (cls.indexOf("turnStatus") !== -1) return el;
			}
			for (const el of nodes) {
				if (/deep diving/i.test(el.textContent || "")) return el;
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
		/** Inject the 3x3 dot orbit (8 chasing dots, empty center) as the first child of the status element. */
		function ensureOrbit(el) {
			try {
				if (!el || typeof el.querySelector !== "function" || typeof el.insertBefore !== "function") return;
				if (el.querySelector(".tq-orbit")) return;
				const span = document.createElement("span");
				span.className = "tq-orbit";
				// Children are placed into grid cells row-major. Clockwise ring index
				// (center = -1 -> blank): top-left(0), top-mid(1), top-right(2), mid-right(3),
				// bottom-right(4), bottom-mid(5), bottom-left(6), mid-left(7).
				const order = [0, 1, 2, 7, -1, 3, 6, 5, 4];
				for (const v of order) {
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
			const css = `[role="status"][class*="turnStatus"]{background-image:linear-gradient(90deg, ${base} 0%, ${base} 40%, ${hi} 50%, ${base} 60%, ${base} 100%) !important}.tq-orbit{color:${base} !important}`;
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
			".tq-swatch{width:46px;height:30px;border-radius:8px;flex:none;border:1px solid var(--dsw-alias-border-l2);background-color:#000;background-size:250% 100%;cursor:pointer}",
			".tq-inputs{align-items:center;gap:8px;display:flex;flex-wrap:wrap}",
			".tq-input{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 8px;font:inherit;font-size:13px;line-height:18px}",
			".tq-input[type=number]{width:56px}",
			".tq-input[type=text]{width:92px}",
			".tq-colorPicker{width:42px;height:30px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;cursor:pointer;padding:0;overflow:hidden}",
			".tq-btn{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;height:36px;padding:0 14px;font:inherit;font-size:14px;line-height:22px;display:inline-flex;align-items:center;gap:8px}",
			".tq-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".tq-btnGhost{background:transparent;border:1px solid var(--dsw-alias-border-l2)}",
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
			".tq-seg{display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-interactive-bg-hover-solid);border:1px solid var(--dsw-alias-border-l2);border-radius:18px;padding:3px}",
			".tq-segItem{height:30px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:none;border-radius:14px;padding:0 12px;font:inherit;font-size:13px;line-height:18px;white-space:nowrap}",
			".tq-segItem:hover{color:var(--dsw-alias-label-primary)}",
			".tq-segActive{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.18)}",
			// 3x3 dot orbit: the 8 outer dots chase clockwise (light up then fade,
			// trailing effect); the center dot stays empty. Color follows the font color.
			".tq-orbit{display:grid;grid-template-columns:repeat(3,4px);grid-template-rows:repeat(3,4px);gap:2px;margin-right:8px;align-self:center;flex:none;color:var(--dsw-static-deepseek-500);place-items:center}",
			".tq-orbit i{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.15;animation:tq-orbit-chase 1.6s linear infinite;animation-delay:calc(var(--i)*.2s)}",
			".tq-orbit i.blank{background:transparent!important;animation:none}",
			"@keyframes tq-orbit-chase{0%,100%{opacity:.15}8%{opacity:1}30%{opacity:.5}50%{opacity:.15}}"
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
			"quips.langDesc": "语言选择决定显示哪一段：混合→两段都显示；仅中文→中文段；仅英文→英文段；跟随界面→按当前界面语言取段。"
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
			"quips.langDesc": "Which section shows: Mixed→both; Chinese only→Chinese section; English only→English section; Follow UI→the active UI language."
		};

		// ── state setters (shared by row and modal) ──────────────────────────
		function patchConfig(patch) {
			const st = store();
			st.set({ ...st.get(), ...patch });
		}

		// ── React: color control (preview + hex/rgb + native wheel) ──────────
		function ColorControl({ value, onChange }) {
			const isShimmer = value === SHIMMER || !value;
			const base = isShimmer ? DEFAULT_BLUE : value;
			const rgb = hexToRgb(base) || [0, 0, 0];
			const [hexDraft, setHexDraft] = react.useState(base);
			const [rgbDraft, setRgbDraft] = react.useState(rgb);

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

			return jsxs("div", { className: "tq-colorRow", children: [
				jsx("button", { type: "button", className: "tq-swatch", style: swatchStyle, title: "preview", "aria-label": "color preview" }),
				jsx("input", { type: "color", className: "tq-colorPicker", value: base, onChange: (e) => { const hex = e.currentTarget.value; setHexDraft(hex); setRgbDraft(hexToRgb(hex) || [0, 0, 0]); onChange(hex); } }),
				jsx("input", { type: "text", className: "tq-input", value: hexDraft, placeholder: "#RRGGBB", onChange: (e) => { const v = e.currentTarget.value; setHexDraft(v); commit(v); },
					onBlur: () => { if (!hexToRgb(hexDraft)) { setHexDraft(value === SHIMMER ? DEFAULT_BLUE : value); } } }),
				jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[0], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [n, rgbDraft[1], rgbDraft[2]]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
				jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[1], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [rgbDraft[0], n, rgbDraft[2]]; setRgbDraft(next); onChange(rgbToHex(...next)); } }),
				jsx("input", { type: "number", className: "tq-input", min: 0, max: 255, value: rgbDraft[2], onChange: (e) => { const n = clamp(Number(e.currentTarget.value) || 0, 0, 255); const next = [rgbDraft[0], rgbDraft[1], n]; setRgbDraft(next); onChange(rgbToHex(...next)); } })
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
						jsx("button", { type: "button", className: "tq-btn tq-btnGhost", onClick: () => patchConfig({ color: SHIMMER, langMode: "ui", quips: DEFAULT_QUIPS, quipMs: 8000 }), children: t("quips.reset") })
					] })
				] }),
				jsxs("div", { className: "tq-headText", children: [
					jsx("div", { className: "tq-title", children: t("quips.color") }),
					jsx("div", { className: "tq-desc", children: t("quips.colorDesc") })
				] }),
				jsx(ColorControl, { value: cfg.color, onChange: (color) => patchConfig({ color }) }),
				isShimmer
					? jsx("button", { type: "button", className: "tq-btn tq-btnGhost", onClick: () => patchConfig({ color: DEFAULT_BLUE }), children: t("quips.default") })
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
					ensureOrbit(el);
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
					ensureOrbit(el0);
					const quips0 = selectPhrases(cfg0, activeLocale);
					if (quips0.length) applyQuip(el0, quips0[0]);
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
							if (!el || el.querySelector(".tq-orbit")) return; // already initialized
							ensureOrbit(el);
							const cfg = store().get();
							const quips = selectPhrases(cfg, activeLocale);
							if (quips.length) applyQuip(el, quips[0]);
						} catch (_) { /* noop */ }
					});
					observer.observe(document.body, { childList: true, subtree: true });
				}
			} catch (_) { /* MutationObserver unavailable; the poll below still works */ }

			// Settings row + dictionaries.
			try {
				const ctxEffect = ctx && typeof ctx.effect === "function" ? ctx.effect.bind(ctx) : null;
				if (ctxEffect) {
					ctxEffect(() => {
						return () => {
							try { if (observer) observer.disconnect(); } catch (_) { /* noop */ }
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
		return module.exports;
	}
});
