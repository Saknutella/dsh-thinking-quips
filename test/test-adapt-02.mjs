import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

/**
 * The whale `d` string the plugin vendored, read back from the INSTALLED DSH.
 *
 * `NAV_ICON_WHALE_PATH` is DSH's own `REST_PATH` (MIT) copied into the plugin so the settings-nav
 * glyph is the app's real whale — verified at 16px to be far more legible than any hand-drawn
 * fluke. A copied constant rots silently, so this comparison is the tripwire: when DSH redraws
 * the whale, the self-check says so instead of the nav quietly drifting from the app.
 * @returns the installed path, or null when this machine has no DSH install to compare with.
 */
function installedWhalePath() {
	const home = process.env.DSH_HOME;
	if (!home) return null;
	try {
		const chatDir = realpathSync(join(home, "profiles", "node_modules", "@deepseek-ai", "dsh-client-ui-chat"));
		const src = readFileSync(join(chatDir, "lib", "client.js"), "utf8");
		const match = /const REST_PATH = "([^"]+)"/.exec(src);
		return match === null ? null : match[1];
	} catch (_) {
		return null;
	}
}

// DSH 0.2 adaptation: the anchor, line ownership, the official sweep, and the clock.
//
// The 0.2 running line is a different shape from 0.1.x (see the plugin's
// docs/0.2适配与合并方案.md and the workspace's docs/05-DSH-0.2-运行状态行变更.md):
//
//   div[data-chat-running]
//     span.TTCZqG_visuallyHidden[role=status]   <- screen-reader announcement, NOT the line
//     span.EvIC1a_runningDivider
//     span.EvIC1a_runningContent
//       span.EvIC1a_runningIcon                 <- DSH's own whale, kept (they coexist)
//       span.EvIC1a_runningText[data-shimmer]   <- the visible label, rewritten every second
//         span.content > span.text                (real text)
//         span.decoration[inert] > span.sweep > span.highlight > span.text[data-shimmer-text]
//
// So this suite asserts: the announcement is never touched, DSH's icon survives, the
// plugin owns its own line, the official TextShimmer is rendered through the seeded
// primitive, and the elapsed time lands where the config says.

let caseId = 0;
let clock = 1_700_000_000_000;

// ── a fake DOM with the selectors this plugin actually uses ───────────────────
function makeTextNode(value) {
	return { nodeType: 3, nodeValue: value, parentNode: null, nextSibling: null, get textContent() { return String(this.nodeValue); } };
}
function matches(el, sel) {
	if (el.nodeType !== 1) return false;
	let m = /^\.([\w-]+)$/.exec(sel);
	if (m) return el._classes.indexOf(m[1]) !== -1;
	m = /^\[class\*="([^"]+)"\]$/.exec(sel);
	if (m) return el._classes.join(" ").indexOf(m[1]) !== -1;
	m = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
	if (m) return el._attrs[m[1]] === m[2];
	m = /^\[([\w-]+)\]$/.exec(sel);
	if (m) return Object.prototype.hasOwnProperty.call(el._attrs, m[1]);
	return false;
}
function makeEl(tag) {
	const el = {
		tagName: tag,
		nodeType: 1,
		children: [],
		parentNode: null,
		_attrs: {},
		_classes: [],
		style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } },
		appendChild(child) {
			if (child.parentNode) child.parentNode.removeChild(child);
			el.children.push(child);
			child.parentNode = el;
			el._refresh();
			return child;
		},
		insertBefore(child, ref) {
			// Real DOM order: detach the node FIRST, then resolve the reference position. Removing
			// a node that sat before `ref` shifts `ref` one slot left, so computing the index
			// before the detach silently inserts one position too late — which is exactly how this
			// stub hid a mis-placement after the plugin started moving the icon in place.
			if (child.parentNode && child.parentNode !== el) child.parentNode.removeChild(child);
			const from = el.children.indexOf(child);
			if (from !== -1) el.children.splice(from, 1);
			const at = ref ? el.children.indexOf(ref) : -1;
			if (at === -1) el.children.push(child); else el.children.splice(at, 0, child);
			child.parentNode = el;
			el._refresh();
			return child;
		},
		removeChild(child) {
			const at = el.children.indexOf(child);
			if (at !== -1) el.children.splice(at, 1);
			child.parentNode = null;
			el._refresh();
			return child;
		},
		remove() { if (el.parentNode) el.parentNode.removeChild(el); },
		/** Deep copy. `native` clones DSH's whale, so the stub has to support it. */
		cloneNode(deep) {
			const copy = makeEl(el.tagName);
			copy._attrs = Object.assign({}, el._attrs);
			copy._classes = el._classes.slice();
			copy.style.props = Object.assign({}, el.style.props);
			if (deep === true) {
				for (const child of el.children) {
					copy.appendChild(child.nodeType === 3 ? makeTextNode(child.nodeValue) : child.cloneNode(true));
				}
			}
			return copy; // detached until it is appended, like a real clone
		},
		setAttribute(k, v) { el._attrs[k] = String(v); },
		getAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k) ? el._attrs[k] : null; },
		hasAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k); },
		removeAttribute(k) { delete el._attrs[k]; },
		querySelector(sel) { return el._find(sel); },
		querySelectorAll(sel) { const out = []; el._collect(sel, out); return out; },
		_find(sel) {
			for (const child of el.children) {
				if (matches(child, sel)) return child;
				const deeper = child.nodeType === 1 ? child._find(sel) : null;
				if (deeper) return deeper;
			}
			return null;
		},
		_collect(sel, out) {
			for (const child of el.children) {
				if (matches(child, sel)) out.push(child);
				if (child.nodeType === 1) child._collect(sel, out);
			}
		},
		_refresh() {
			const elements = el.children.filter((n) => n.nodeType === 1);
			el.children.forEach((c, i) => {
				c.nextSibling = el.children[i + 1] || null;
				c.previousSibling = el.children[i - 1] || null;
				// `ensureLoader` places the icon with `line.previousElementSibling`, so the stub
				// has to model these two the way a browser does (element-only siblings).
				const at = elements.indexOf(c);
				c.nextElementSibling = at === -1 ? null : elements[at + 1] || null;
				c.previousElementSibling = at === -1 ? null : elements[at - 1] || null;
			});
			el.firstChild = el.children[0] || null;
		},
		get textContent() { return el.children.map((c) => c.textContent).join(""); },
		set textContent(v) { el.children = []; const t = makeTextNode(v); t.parentNode = el; el.children.push(t); el._refresh(); }
	};
	Object.defineProperty(el, "className", {
		get: () => el._classes.join(" "),
		set: (v) => { el._classes = String(v).split(/\s+/).filter(Boolean); }
	});
	el.classList = {
		add: (c) => { if (el._classes.indexOf(c) === -1) el._classes.push(c); },
		remove: (c) => { const i = el._classes.indexOf(c); if (i !== -1) el._classes.splice(i, 1); },
		contains: (c) => el._classes.indexOf(c) !== -1
	};
	el._refresh();
	return el;
}

/** The running line exactly as dsh-client-ui-chat@0.2.0-rc.2 renders it. */
function buildLine() {
	const body = makeEl("body");
	const wrapper = makeEl("div");
	wrapper.className = "EvIC1a_running";
	wrapper.setAttribute("data-chat-running", "true");

	const announce = makeEl("span");
	announce.className = "TTCZqG_visuallyHidden";
	announce.setAttribute("role", "status");
	announce.setAttribute("aria-live", "polite");
	const announceText = makeTextNode("深度求索中");
	announce.appendChild(announceText);

	const divider = makeEl("span");
	divider.className = "EvIC1a_runningDivider";

	const content = makeEl("span");
	content.className = "EvIC1a_runningContent";
	const icon = makeEl("span");
	icon.className = "EvIC1a_runningIcon";
	const whale = makeEl("span");
	whale.className = "EvIC1a_runningWhaleAnimated";
	icon.appendChild(whale);
	// DSH's icon holds BOTH variants: the mask-painted span above and this static SVG,
	// which the official stylesheet shows when the mask branch is gated off (reduced
	// motion, forced colors, no @supports). Cloning the icon therefore carries both.
	const still = makeEl("svg");
	still.className = "EvIC1a_runningWhaleStill";
	still.setAttribute("viewBox", "0 0 16 16");
	const stillPath = makeEl("path");
	stillPath.setAttribute("d", "M8.844 13.742C8.967 12.328 8.45 10.4 8.45 9.65");
	stillPath.setAttribute("stroke", "currentColor");
	still.appendChild(stillPath);
	icon.appendChild(still);

	const label = makeEl("span");
	label.className = "EvIC1a_runningText";
	label.setAttribute("data-shimmer", "true");
	const labelContent = makeEl("span");
	labelContent.className = "content";
	const labelTextEl = makeEl("span");
	labelTextEl.className = "text";
	const labelText = makeTextNode("深度求索中，用时 1秒 ···");
	labelTextEl.appendChild(labelText);
	labelContent.appendChild(labelTextEl);
	const decoration = makeEl("span");
	decoration.className = "decoration";
	decoration.setAttribute("aria-hidden", "true");
	decoration.setAttribute("inert", "");
	const sweep = makeEl("span");
	sweep.className = "sweep";
	const highlight = makeEl("span");
	highlight.className = "content highlight";
	const copy = makeEl("span");
	copy.className = "text";
	copy.setAttribute("data-shimmer-text", "深度求索中，用时 1秒 ···");
	highlight.appendChild(copy);
	sweep.appendChild(highlight);
	decoration.appendChild(sweep);
	label.appendChild(labelContent);
	label.appendChild(decoration);
	content.appendChild(icon);
	content.appendChild(label);
	wrapper.appendChild(announce);
	wrapper.appendChild(divider);
	wrapper.appendChild(content);
	body.appendChild(wrapper);

	return { body, wrapper, announce, announceText, content, icon, whale, label, labelText, copy };
}

// ── mount one fresh module instance against that DOM ─────────────────────────
async function mount(config, options = {}) {
	caseId += 1;
	const dom = buildLine();
	const timers = [];
	const cleanups = [];
	const intervalsCleared = [];
	const renders = [];
	const unmounts = { count: 0 };
	const slotsInjected = [];
	/** Every `slots.register(options, Component)` call, so the nav identity can be asserted. */
	const registrations = [];
	let activeLocale = "zh";
	const styles = {};
	const withPrimitives = options.withPrimitives !== false;

	globalThis.window = { __ModuleLoader__: { load: (x) => { globalThis.__loaded = x; } }, __DSH_THINKING_QUIPS__: false };
	globalThis.localStorage = { getItem: () => JSON.stringify(config || {}), setItem: () => {}, removeItem: () => {} };
	globalThis.NodeFilter = { SHOW_TEXT: 4 };
	globalThis.setInterval = (fn) => { timers.push(fn); return timers.length; };
	globalThis.clearInterval = (id) => { intervalsCleared.push(id); };
	globalThis.requestAnimationFrame = () => 0;
	globalThis.cancelAnimationFrame = () => {};
	globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
	globalThis.MutationObserver = class { observe() {} disconnect() {} };
	globalThis.Date.now = () => clock;

	const documentStub = {
		body: dom.body,
		documentElement: makeEl("html"),
		head: { appendChild: (el) => { if (el.id) styles[el.id] = el; } },
		getElementById: (id) => styles[id] || null,
		createElement: (tag) => makeEl(tag),
		createElementNS: (_ns, tag) => makeEl(tag),
		createTextNode: (v) => makeTextNode(v),
		querySelector: (sel) => dom.body._find(sel),
		querySelectorAll: (sel) => dom.body._queryAll(sel),
		// `adoptNodes` asks whether the old line element left the document; a browser answers
		// with `isConnected`, and this stub has no such flag, so it needs `document.contains`.
		contains: (node) => {
			const walk = (parent) => {
				for (const child of parent.children) {
					if (child === node) return true;
					if (child.nodeType === 1 && walk(child)) return true;
				}
				return false;
			};
			return walk(dom.body);
		},
		createTreeWalker: (rootEl) => {
			const nodes = [];
			const walk = (node) => {
				for (const child of node.children) {
					if (child.nodeType === 3) nodes.push(child);
					else walk(child);
				}
			};
			walk(rootEl);
			let i = 0;
			return { nextNode: () => (i < nodes.length ? nodes[i++] : null) };
		}
	};
	dom.body._queryAll = (sel) => { const out = []; dom.body._collect(sel, out); return out; };
	globalThis.document = documentStub;

	const TextShimmerStub = function TextShimmer() {};
	const reactStub = {
		useState: (i) => [i, () => {}],
		useEffect: () => {},
		useRef: () => ({ current: null }),
		useSyncExternalStore: (_s, get) => get(),
		memo: (c) => c,
		createElement: (type, props, ...children) => ({ type, props, children })
	};
	const jsx = (t, p) => ({ t, p });
	const requireStub = (name) => {
		if (name === "react") return reactStub;
		if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
		if (name === "react-dom/client") return {
			createRoot: (container) => ({
				render: (element) => { renders.push({ container, element }); },
				unmount: () => { unmounts.count += 1; }
			})
		};
		if (name === "@deepseek-ai/dsh-client-ui-primitives") {
			if (!withPrimitives) throw new Error("seed unavailable in this case");
			return { TextShimmer: TextShimmerStub };
		}
		throw new Error("unexpected require: " + name);
	};

	await import(new URL(`../lib/client.js?case=${caseId}`, import.meta.url).href);
	const plugin = globalThis.__loaded.factory(requireStub);
	const ctx = {
		on: () => {},
		locale: { register: () => ({}), getLocale: () => ({ active: activeLocale }) },
		slots: {
			inject: (name, cb) => { slotsInjected.push(name); cb(); return () => {}; },
			register: (options) => { registrations.push(options); return () => {}; }
		},
		effect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") cleanups.push(cleanup); return cleanup; }
	};
	return {
		dom, plugin, ctx, timers, cleanups, intervalsCleared, renders, unmounts, slotsInjected, registrations, styles,
		TextShimmerStub, setLocale: (next) => { activeLocale = next; }
	};
}

function ok(label, condition, detail) {
	if (!condition) throw new Error(`${label}${detail ? " — " + detail : ""}`);
	console.log("OK   " + label);
}

// ── 1. the anchor and DSH's own indicator ────────────────────────────────────
console.log("── the 0.2 anchor ──");
{
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	m.plugin.__internal.officialTurn.startTime = clock - 12_000;
	m.plugin.apply(m.ctx);

	const line = m.dom.wrapper.querySelector(".tq-line");
	ok("the wrapper is marked owned", m.dom.wrapper.getAttribute("data-tq-owned") !== null);
	ok("the plugin owns its own line inside runningContent", line !== null && line.parentNode === m.dom.content);
	ok("the screen-reader announcement is never written to", m.dom.announceText.nodeValue === "深度求索中", m.dom.announceText.nodeValue);
	ok("no loader lands inside the announcement", m.dom.announce.querySelector(".tq-loader") === null);
	ok("the loader is injected next to DSH's icon", m.dom.content.querySelector(".tq-loader") !== null);
	ok("DSH's own icon node is left untouched", m.dom.content.querySelector(".EvIC1a_runningIcon") !== null && m.dom.content.querySelector(".EvIC1a_runningWhaleAnimated") !== null);
	// The whale is a CHOICE (the `native` loader), not a permanent second indicator: the
	// wrapper records which icon the plugin drew, and the stylesheet retires DSH's node.
	ok("the wrapper records the drawn icon", m.dom.wrapper.getAttribute("data-tq-icon") === "orbit", m.dom.wrapper.getAttribute("data-tq-icon"));
	ok("and the CSS retires DSH's own icon only while that mark is there", m.styles["dsh-thinking-quips-style"].textContent
		.indexOf('[data-tq-icon] [class*="runningContent"]>[class*="runningIcon"]{display:none!important}') !== -1);
	ok("the injected CSS hides DSH's label by ownership, not by blanking", m.styles["dsh-thinking-quips-style"].textContent.indexOf('[data-tq-owned] [class*="runningText"]{display:none!important}') !== -1);
	ok("the turn-clock bridge registers on the official turnTail seat", m.slotsInjected.indexOf("conversation.chat.turnTail") !== -1);
	ok("the settings PAGE registers on the section seat", m.slotsInjected.indexOf("settings.section") !== -1);
	// It moved off General's row seat: twelve controls are a page, not a preference row, and
	// every other plugin that adds a row there shares the same space.
	ok("and no longer on General's own row seat", m.slotsInjected.indexOf("settings.general.item") === -1);
	// The nav identity lives in the registration: id (our own cell), order (nav position) and a
	// label THUNK, which the shell re-reads on every projection so the row follows the locale.
	const section = m.registrations.find((r) => r.name === "settings.section");
	ok("it registers its own nav id", section !== undefined && section.id === "thinking-quips", section && section.id);
	ok("with a nav order of its own", section !== undefined && section.order === 30, section && String(section.order));
	ok("and a label thunk, not a frozen string", section !== undefined && typeof section.label === "function");
	ok("which follows the locale when the shell re-reads it", section !== undefined
		&& section.label() === "俏皮话", section && String(section.label()));
	m.setLocale("en");
	ok("...and switches language without re-registering", section !== undefined && section.label() === "Playful quips",
		section && String(section.label()));
}

// ── 2. the official sweep is DSH's own component ─────────────────────────────
console.log("\n── official sweep (shimmer / official) ──");
{
	const m = await mount({ textEffect: "shimmer", clockMode: "off" });
	m.plugin.apply(m.ctx);
	ok("the seeded primitive is rendered", m.renders.length > 0 && m.renders[0].element.type === m.TextShimmerStub);
	ok("it is rendered active", m.renders[0].element.props.active === true);
	ok("into the plugin's own box", m.dom.wrapper.querySelector(".tq-official") !== null);
}
{
	// No primitives to render the official sweep: the quip goes in as plain text, and the
	// write must be guarded. An unconditional write mutates the DOM on every pass, and the
	// plugin's own body observer (childList, for instant first paint) turns each mutation into
	// another pass as a microtask — the endless chain that used to freeze the page (measured
	// with the workspace's headless Chromium: `DOMContentLoaded` never fired).
	const m = await mount({ textEffect: "shimmer", clockMode: "off" }, { withPrimitives: false });
	m.plugin.apply(m.ctx);
	const line = m.dom.wrapper.querySelector(".tq-line");
	ok("a shell without the seed falls back instead of throwing", line !== null);
	ok("and the quip is still shown, as plain text", line.textContent.length > 0, line.textContent);
	const node = line.firstChild;
	m.timers[0]();
	m.timers[0]();
	ok("the fallback reuses its text node across passes", line.firstChild === node);
	ok("with exactly one text node in the line", line.children.length === 1 && line.firstChild.nodeType === 3);
	ok("and no leftover effect container", m.dom.wrapper.querySelector(".tq-official") === null
		&& m.dom.wrapper.querySelector(".tq-wave") === null && m.renders.length === 0);
}

// ── 2b. the sweep's brightness ───────────────────────────────────────────────
console.log("\n── the sweep's brightness ──");
{
	// The official sweep paints itself with `color: var(--dsw-alias-label-shimmer)` and a moving
	// mask — measured in the installed TextShimmer.module.css — so THAT token is the brightness.
	// The assertions below are semantic rather than a copy of the plugin's mix formula: brighter
	// than the text, equal at 0, pure white at 100, and no text recolour on the default colour.
	const lum = (hex) => {
		const n = parseInt(hex.slice(1), 16);
		const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
			const c = v / 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const tokens = (m) => m.dom.wrapper.style.props;
	const custom = await mount({ color: "#204080", glow: 50, clockMode: "off" });
	custom.plugin.apply(custom.ctx);
	const customTokens = tokens(custom);
	ok("a custom colour also sets the sweep token", typeof customTokens["--dsw-alias-label-shimmer"] === "string",
		String(customTokens["--dsw-alias-label-shimmer"]));
	ok("and the sweep is brighter than the text", lum(customTokens["--dsw-alias-label-shimmer"]) > lum(customTokens["--tq-base"]),
		`${customTokens["--tq-base"]} -> ${customTokens["--dsw-alias-label-shimmer"]}`);
	ok("while the text itself keeps the chosen colour", customTokens["--tq-base"] === "#204080");

	const none = await mount({ color: "#204080", glow: 0, clockMode: "off" });
	none.plugin.apply(none.ctx);
	ok("brightness 0 makes the sweep the text colour (an invisible sweep)",
		tokens(none)["--dsw-alias-label-shimmer"] === tokens(none)["--tq-base"], String(tokens(none)["--dsw-alias-label-shimmer"]));

	const full = await mount({ color: "#204080", glow: 100, clockMode: "off" });
	full.plugin.apply(full.ctx);
	ok("brightness 100 makes it pure white", tokens(full)["--dsw-alias-label-shimmer"] === "#ffffff",
		String(tokens(full)["--dsw-alias-label-shimmer"]));

	// The default colour belongs to DSH: the brightness may dim or brighten the sweep, but it must
	// not touch the text colour (that would silently repaint every default-configuration user).
	const dflt = await mount({ color: "shimmer", glow: 50, clockMode: "off" });
	dflt.plugin.apply(dflt.ctx);
	ok("the default colour with another brightness still sets the sweep token",
		typeof tokens(dflt)["--dsw-alias-label-shimmer"] === "string", String(tokens(dflt)["--dsw-alias-label-shimmer"]));
	ok("but leaves the text colour to DSH", tokens(dflt)["--tq-base"] === undefined
		&& tokens(dflt)["--dsw-alias-label-deep-diving"] === undefined);
	ok("and writes no colour rules for the plugin's own nodes",
		dflt.styles["dsh-thinking-quips-color"].textContent.indexOf(".tq-loader{") === -1,
		dflt.styles["dsh-thinking-quips-color"].textContent.slice(0, 60));
	ok("the legacy 0.1.x gradient does carry the sweep colour",
		dflt.styles["dsh-thinking-quips-color"].textContent.indexOf(tokens(dflt)["--dsw-alias-label-shimmer"]) !== -1);

	// The shipped default: DSH's own look, untouched.
	const shipped = await mount({ color: "shimmer", glow: custom.plugin.__internal.DEFAULT_GLOW, clockMode: "off" });
	shipped.plugin.apply(shipped.ctx);
	const shippedCss = shipped.styles["dsh-thinking-quips-color"];
	ok("the shipped default leaves every token alone",
		tokens(shipped)["--dsw-alias-label-shimmer"] === undefined
		&& (shippedCss === undefined || shippedCss.textContent === ""));
}

// ── 3. one sweep, one name ───────────────────────────────────────────────────
console.log("\n── one sweep, one name ──");
{
	const probe = await mount({});
	ok("only the official sweep and the wave remain", probe.plugin.__internal.TEXT_EFFECTS.join(",") === "shimmer,wave",
		probe.plugin.__internal.TEXT_EFFECTS.join(","));
	// A config saved by an older version still names `official` or `glow`: both map onto the
	// sweep, which is what they rendered anyway (and what the retired `glow` looked like).
	const legacy = await mount({ textEffect: "glow", clockMode: "off" });
	legacy.plugin.apply(legacy.ctx);
	ok("a saved `glow` renders the official sweep", legacy.renders.length > 0 && legacy.dom.wrapper.querySelector(".tq-official") !== null);
	const alias = await mount({ textEffect: "official", clockMode: "off" });
	alias.plugin.apply(alias.ctx);
	ok("a saved `official` renders the official sweep", alias.renders.length > 0 && alias.dom.wrapper.querySelector(".tq-official") !== null);
	const css = legacy.styles["dsh-thinking-quips-style"].textContent;
	ok("the retired gradient container is gone from the stylesheet", css.indexOf("tq-glow") === -1);
	ok("...and so is its painted-clip gradient", css.indexOf("background-clip") === -1);
}

// ── 4. wave on the plugin's own line ────────────────────────────────────────
console.log("\n── wave ──");
{
	const m = await mount({ textEffect: "wave", clockMode: "off" });
	m.plugin.apply(m.ctx);
	const wave = m.dom.wrapper.querySelector(".tq-wave");
	ok("the wave container lives in the plugin's line", wave !== null && wave.parentNode.classList.contains("tq-line"));
	ok("the wave draws per-token items", wave.querySelectorAll(".tq-waveItem").length > 0);
}

// ── 5. the elapsed time: inline (0.2 shape) vs beside (0.1 shape) ────────────
console.log("\n── elapsed time ──");
/** Set the duration the shell's own label shows (both the text and the decoration copy). */
const shownLabel = (m, text) => {
	m.dom.labelText.nodeValue = text;
	m.dom.copy.setAttribute("data-shimmer-text", text);
};
{
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	m.plugin.__internal.officialTurn.startTime = clock - 65_000;
	shownLabel(m, "深度求索中，用时 1分5秒 ···");
	m.plugin.apply(m.ctx);
	const text = m.renders[m.renders.length - 1].element.children[0];
	ok("inline folds the duration into the animated text", text.indexOf("用时 1分5秒") !== -1, text);
	ok("inline leaves no separate clock node", m.dom.wrapper.querySelector(".tq-clock") === null);
}
{
	// The shell's own label IS the clock: the shell reads the running turn's start from its own
	// store and rewrites that label every second, so it survives a refresh that re-mounts the
	// plugin. When the two disagree, the shell's line is the number the user reads — so it wins.
	// (Reported as a mismatch: the plugin said 8m 27s while the shell's own line said 10m 46s.)
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	m.plugin.__internal.officialTurn.startTime = clock - 507_000; // 8m27s
	shownLabel(m, "深度求索中，用时 10分46秒 ···");
	m.plugin.apply(m.ctx);
	const text = m.renders[m.renders.length - 1].element.children[0];
	ok("the shell's own duration wins over the seat's start",
		text.indexOf("10分46秒") !== -1 && text.indexOf("8分27秒") === -1, text);
}
{
	const m = await mount({ textEffect: "official", clockMode: "separate" });
	m.plugin.__internal.officialTurn.startTime = clock - 65_000;
	shownLabel(m, "深度求索中，用时 1分5秒 ···");
	m.plugin.apply(m.ctx);
	const clockSpan = m.dom.wrapper.querySelector(".tq-clock");
	ok("beside renders a separate grey clock node", clockSpan !== null && clockSpan.parentNode.classList.contains("tq-line"));
	ok("the separate clock shows the official duration", clockSpan.textContent === "1分5秒", clockSpan.textContent);
	const text = m.renders[m.renders.length - 1].element.children[0];
	ok("the separate clock is NOT part of the animated text", text.indexOf("用时") === -1 && text.indexOf("1分5秒") === -1, text);
	ok("its CSS uses the tertiary grey", m.styles["dsh-thinking-quips-style"].textContent.indexOf(".tq-clock{color:var(--dsw-alias-label-tertiary)") !== -1);
}
{
	const m = await mount({ textEffect: "official", clockMode: "off" });
	m.plugin.apply(m.ctx);
	ok("off shows no clock at all", m.dom.wrapper.querySelector(".tq-clock") === null);
	const text = m.renders[m.renders.length - 1].element.children[0];
	ok("off leaves the plain quip", text.indexOf("用时") === -1, text);
}
{
	// No duration anywhere: neither the shell's label nor the seat knows one, so the plugin times
	// the line itself.
	const m = await mount({ textEffect: "official", clockMode: "separate" });
	shownLabel(m, "深度求索中");
	m.plugin.apply(m.ctx);
	clock += 2_000;
	m.plugin.apply(m.ctx);
	m.timers[0]();
	const clockSpan = m.dom.wrapper.querySelector(".tq-clock");
	ok("without a duration anywhere the self-timer covers it", clockSpan !== null && clockSpan.textContent === "2秒", clockSpan && clockSpan.textContent);
	clock -= 2_000;
}
{
	// The DOM must not touch the official clock.
	//
	// WHY: the first version of this fix dropped the official start on the first pass that missed
	// the running line. The shell replaces that line as it re-renders and a refresh re-mounts the
	// whole tree, so a miss is routine — and the seat does not re-run for a DOM-only change, so
	// the start never came back and a mid-turn refresh restarted the clock at zero (the user's
	// follow-up). Leaving the line only resets the SELF-timer; the seat owns the official clock,
	// and the shell's own label is the primary source anyway (see `elapsedFrom`).
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	shownLabel(m, "深度求索中"); // no duration in the shell's own label
	const start = clock - 3_600_000;
	m.plugin.__internal.recordTurnClock({ turn: "A", status: "open", start: { time: start } });
	m.plugin.apply(m.ctx);
	ok("an open turn from the seat owns the clock slot", m.plugin.__internal.officialTurn.startTime === start);
	m.dom.body.removeChild(m.dom.wrapper);
	m.plugin.__internal.forcePass();
	clock += 60_000; // gone for a minute: far beyond any debounce a fix might grow
	m.plugin.__internal.forcePass();
	ok("a line that leaves never drops the official clock", m.plugin.__internal.officialTurn.startTime === start,
		JSON.stringify(m.plugin.__internal.officialTurn));

	// The seat still can, and does: its turn stopped being open.
	m.plugin.__internal.recordTurnClock({ turn: "A", status: "closed", start: { time: start } });
	ok("the seat hands the slot back when its turn closes",
		m.plugin.__internal.officialTurn.turn === undefined && m.plugin.__internal.officialTurn.startTime === undefined,
		JSON.stringify(m.plugin.__internal.officialTurn));
}

// ── 5b. the native loader clones DSH's own whale ─────────────────────────────
console.log("\n── the native loader ──");
{
	// The whale is painted by DSH's own stylesheet through a mask on an empty span, with a
	// static SVG beside it as the fallback. Cloning the node therefore carries BOTH
	// variants (and the whole @supports / prefers-reduced-motion gating) for free, which
	// is why the plugin clones rather than redrawing — so this asserts a real copy that is
	// not DSH's node, and that DSH's node is left untouched in the DOM (hidden by CSS).
	const m = await mount({ loader: "native", textEffect: "shimmer", clockMode: "off" });
	m.plugin.apply(m.ctx);
	const loader = m.dom.content.querySelector(".tq-loader");
	ok("the native style is what got drawn", loader !== null && loader.getAttribute("data-effective") === "native");
	const copy = loader.querySelector('[class*="runningIcon"]');
	ok("it holds a copy of DSH's icon", copy !== null && copy !== m.dom.icon);
	ok("the copy lives in the plugin's own span", copy !== null && copy.parentNode === loader);
	ok("the copy carries the animated mask span", copy.querySelector('[class*="runningWhaleAnimated"]') !== null);
	ok("the copy carries DSH's still-svg fallback", copy.querySelector('[class*="runningWhaleStill"]') !== null);
	ok("DSH's own icon stays in the DOM (only hidden)", m.dom.content.querySelector(".EvIC1a_runningIcon") !== null);
	ok("the wrapper records the native icon", m.dom.wrapper.getAttribute("data-tq-icon") === "native", m.dom.wrapper.getAttribute("data-tq-icon"));
	ok("the hide rule spares the copy", m.styles["dsh-thinking-quips-style"].textContent
		.indexOf('[data-tq-icon] [class*="runningContent"]>[class*="runningIcon"]{display:none!important}') !== -1);
	m.plugin.__internal.patchConfig({ loader: "orbit" });
	m.timers[0]();
	// DSH's whale stays retired: the user picked a plugin-drawn icon, so exactly one
	// indicator shows. The mark follows the icon that is actually drawn.
	ok("switching style keeps exactly one indicator", m.dom.wrapper.getAttribute("data-tq-icon") === "orbit", m.dom.wrapper.getAttribute("data-tq-icon"));
	ok("and the plugin draws its own icon again", m.dom.content.querySelector(".tq-loader").getAttribute("data-effective") === "orbit");
}
{
	// The defensive half of the chain: the icon node exists but refuses to clone, so the
	// plugin must fall through to the stylesheet mask rather than paint an empty span.
	const m = await mount({ loader: "native", textEffect: "shimmer", clockMode: "off" });
	m.dom.icon.cloneNode = () => { throw new Error("this stub cannot clone"); };
	const B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
	const maskRule = {
		selectorText: ".EvIC1a_runningWhaleAnimated",
		style: { getPropertyValue: (name) => (name === "mask" ? 'url("' + B64 + '") 50%/100% 100% no-repeat alpha' : "") }
	};
	globalThis.document.styleSheets = [{ cssRules: [{ style: { getPropertyValue: () => "" }, cssRules: [{ cssRules: [maskRule] }] }] }];
	m.plugin.apply(m.ctx);
	const loader = m.dom.content.querySelector(".tq-loader");
	ok("a whale that cannot be cloned falls back to the stylesheet mask", loader.getAttribute("data-effective") === "native");
	ok("and nothing was copied into the span", loader.querySelector('[class*="runningIcon"]') === null);
	ok("the mask came off the official rule", loader.style.props["mask-image"] === 'url("' + B64 + '")', loader.style.props["mask-image"]);
	ok("the fallback still sizes the span itself", loader.style.props["background"] === "currentColor");
	ok("and the hide mark is still set", m.dom.wrapper.getAttribute("data-tq-icon") === "native");
}

// ── 5c. the icon keeps its place when the style changes mid-turn ─────────────
console.log("\n── the icon keeps its place ──");
{
	// Reported from the real GUI: switching the icon while a turn was running moved it to the
	// END of the line. The rebuild appended it, and by then the plugin's own `.tq-line` was
	// already in the flex row — so the new icon landed after the text.
	const m = await mount({ loader: "orbit", textEffect: "shimmer", clockMode: "off" });
	m.plugin.apply(m.ctx);
	const at = (node) => m.dom.content.children.indexOf(node);
	const line = m.dom.content.querySelector(".tq-line");
	const first = m.dom.content.querySelector(".tq-loader");
	ok("the icon starts left of the plugin's line", line !== null && first !== null && at(first) < at(line),
		`loader@${at(first)} line@${at(line)}`);
	m.plugin.__internal.patchConfig({ loader: "bars" });
	m.timers[0]();
	const swapped = m.dom.content.querySelector(".tq-loader");
	ok("switching the style rebuilds it in place, still left of the line",
		swapped.getAttribute("data-effective") === "bars" && swapped !== first && at(swapped) < at(line),
		`effective=${swapped.getAttribute("data-effective")} loader@${at(swapped)} line@${at(line)}`);
	// ...and a pass repairs an icon an earlier version had already parked at the end.
	m.dom.content.appendChild(swapped);
	ok("the buggy placement really is after the text", at(swapped) > at(line));
	m.timers[0]();
	ok("the next pass puts it back before the line", at(m.dom.content.querySelector(".tq-loader")) < at(line));
}

// ── 6. indicatorOnly hands the line back, keeping the icon ───────────────────
console.log("\n── indicatorOnly ──");
{
	const m = await mount({ textEffect: "official", clockMode: "inline", indicatorOnly: true, color: "#ff0000" });
	m.plugin.apply(m.ctx);
	const at = (node) => m.dom.content.children.indexOf(node);
	const loader = m.dom.content.querySelector(".tq-loader");
	const label = m.dom.content.querySelector(".EvIC1a_runningText");
	ok("the loader is still injected", loader !== null);
	ok("ownership is released so DSH's own text shows", m.dom.wrapper.getAttribute("data-tq-owned") === null);
	ok("nothing was rendered into the plugin's line", m.renders.length === 0);
	// Reported from the real GUI: with the text handed back, the appended icon landed AFTER
	// DSH's own label, and it was the single custom-coloured thing on a line whose text kept
	// DSH's default colour.
	ok("the icon sits LEFT of DSH's own label", loader !== null && label !== null && at(loader) < at(label),
		`loader@${at(loader)} label@${at(label)}`);
	ok("and no empty plugin line is left behind", m.dom.content.querySelector(".tq-line") === null);
	ok("the indicator mark is still set", m.dom.wrapper.getAttribute("data-tq-icon") === "orbit");
	ok("a custom colour is written to DSH's own running-text token too",
		m.dom.wrapper.style.props["--dsw-alias-label-deep-diving"] === "#ff0000",
		m.dom.wrapper.style.props["--dsw-alias-label-deep-diving"]);
	// Turning it off hands the text to the plugin again; the icon must stay on the left.
	m.plugin.__internal.patchConfig({ indicatorOnly: false });
	m.timers[0]();
	m.timers[0]();
	const line = m.dom.content.querySelector(".tq-line");
	ok("turning it off gives the plugin its own line back", line !== null);
	ok("with the icon still left of it",
		at(m.dom.content.querySelector(".tq-loader")) < at(line),
		`loader@${at(m.dom.content.querySelector(".tq-loader"))} line@${at(line)} order=${m.dom.content.children.map((c) => c.className || c.tagName).join("|")}`);
}

// ── 6b. a re-rendered line must not move the quip or restart the animation ───
console.log("\n── DSH replaces the running line (a tool call) ──");
{
	// Reported from real use: every tool call advanced the quip immediately and snapped the
	// animation back. Both came from one cause — the shell re-creating the line, the plugin
	// reading "no icon in this element yet" as a first paint, and therefore seeding quip #1,
	// which changed the text and rebuilt the (animating) effect container.
	const m = await mount({ textEffect: "official", clockMode: "off", quipMs: 8000 });
	m.plugin.apply(m.ctx);
	const quipNow = () => m.renders[m.renders.length - 1].element.children[0];
	const firstQuip = quipNow();
	// Move into a later quip window, so "back to #1" is distinguishable from "unchanged".
	clock += 17_000;
	m.timers[0]();
	const line = m.dom.wrapper.querySelector(".tq-line");
	const shown = quipNow();
	ok("the rotation has moved on from the first quip", shown !== firstQuip, `${firstQuip} -> ${shown}`);
	const rendersBefore = m.renders.length;
	const unmountsBefore = m.unmounts.count;

	// The shell re-renders: a brand-new wrapper takes the old one's place.
	const replacement = buildLine();
	m.dom.body.appendChild(replacement.wrapper);
	m.dom.body.removeChild(m.dom.wrapper);
	m.timers[0]();

	const after = replacement.wrapper.querySelector(".tq-line");
	ok("the plugin's own line was carried over, not rebuilt", after === line);
	ok("so the quip did not jump back to the first one", quipNow() === shown, `${shown} -> ${quipNow()}`);
	ok("the official root was not remounted, so its animation keeps running",
		m.unmounts.count === unmountsBefore && m.renders.length === rendersBefore,
		`unmounts ${unmountsBefore}->${m.unmounts.count}, renders ${rendersBefore}->${m.renders.length}`);
	ok("the new wrapper is marked owned", replacement.wrapper.getAttribute("data-tq-owned") !== null);
	ok("and the icon mark was re-written on it", replacement.wrapper.getAttribute("data-tq-icon") === "orbit",
		replacement.wrapper.getAttribute("data-tq-icon"));
	ok("the icon sits before the carried-over line",
		replacement.content.children.indexOf(replacement.content.querySelector(".tq-loader")) < replacement.content.children.indexOf(after));
	// A different quip window still advances normally.
	clock += 8000;
	m.timers[0]();
	ok("the rotation still moves on its own clock", quipNow() !== shown, `${shown} -> ${quipNow()}`);
}

// ── 6f. a reload opens on a RANDOM quip, not always the first one ────────────
console.log("\n── the opening quip is random per page load ──");
{
	// Reported from real use: whatever quip was showing, a refresh always came back to the same
	// first one ("正在思考…"). The rotation origin IS the page load, so without an offset the index
	// is 0 for the first interval — every time, on every reload.
	const realRandom = Math.random;
	const config = {
		textEffect: "official",
		clockMode: "off",
		quipMs: 8000,
		quips: "# Chinese\n甲\n乙\n丙\n丁"
	};
	/** A scripted draw sequence: the last value repeats, so an extra draw is visible. */
	const draws = (values) => {
		let at = 0;
		return () => values[Math.min(at++, values.length - 1)];
	};
	/** Mount with a scripted draw, and report what opened along with the shipped list. */
	const opened = async (...values) => {
		Math.random = draws(values);
		const m = await mount(config);
		m.plugin.apply(m.ctx);
		return {
			shown: m.renders[m.renders.length - 1].element.children[0],
			list: m.plugin.__internal.selectPhrases(m.plugin.__internal.loadConfig(), "zh"),
			m
		};
	};
	const zero = await opened(0);
	ok("a zero draw opens on the first quip (the shape the bug always produced)",
		zero.shown === zero.list[0], `${zero.shown} vs ${zero.list[0]} (${zero.list.length} quips)`);
	// The SECOND value is the trap: the offset must be drawn exactly once, so 0.25 must never be
	// used. A constant stub cannot tell "drawn once" from "drawn on every pass" — this can.
	const high = await opened(0.75, 0.25);
	ok("another draw opens on the index it names",
		high.shown === high.list[Math.floor(0.75 * high.list.length)],
		`${high.shown} (want ${high.list[Math.floor(0.75 * high.list.length)]})`);
	ok("so the opening quip follows the draw instead of the list order",
		high.shown !== zero.shown, `${zero.shown} vs ${high.shown}`);
	// The rotation still advances one step per interval from wherever it opened, and it does NOT
	// re-draw: a second draw of 0.25 would jump the quip to another slot entirely.
	clock += 8_000;
	high.m.timers[0]();
	const next = high.m.renders[high.m.renders.length - 1].element.children[0];
	ok("the rotation advances one step from the random start, without re-drawing",
		next === high.list[(Math.floor(0.75 * high.list.length) + 1) % high.list.length],
		`${high.shown} -> ${next} (a re-draw would show ${high.list[Math.floor(0.25 * high.list.length)]})`);
	clock -= 8_000;
	Math.random = realRandom;
}

// ── 6c. the wave must survive the once-a-second elapsed tick ─────────────────
console.log("\n── the wave across the elapsed tick ──");
{
	// The inline clock rewrites the line every second (it carries the duration). Rebuilding the
	// wave items then restarted the wave every second — the same stutter class as the tool-call
	// bug above — so an unchanged token SHAPE is now updated in place. The duration comes from
	// the shell's own label, so the tick is simulated the way the shell does it: rewrite the label.
	const m = await mount({ textEffect: "wave", clockMode: "inline" });
	m.plugin.apply(m.ctx);
	const line = m.dom.wrapper.querySelector(".tq-line");
	const before = line.querySelectorAll(".tq-waveItem");
	const textBefore = line.textContent;
	ok("the wave drew its per-token items", before.length > 0, String(before.length));
	clock += 1000;
	shownLabel(m, "深度求索中，用时 2秒 ···");
	m.timers[0]();
	const after = line.querySelectorAll(".tq-waveItem");
	ok("the elapsed tick did not rebuild them", after.length === before.length && after.every((node, i) => node === before[i]),
		`${before.length} -> ${after.length}`);
	ok("but the duration inside them did advance", line.textContent !== textBefore, `${textBefore} -> ${line.textContent}`);
	// A quip change that alters the token shape still rebuilds (the stagger has to be redone).
	clock += 60_000;
	m.timers[0]();
	ok("a new quip still redraws the wave", line.querySelectorAll(".tq-waveItem").length > 0);
}

// ── 6d. the settings-nav glyph ───────────────────────────────────────────────
console.log("\n── the settings-nav glyph ──");
{
	/** A nav row exactly as dsh-client-ui-settings-general renders it: a button per section
	 *  carrying the hashed `navCell` class, with `[glyph, labelSpan]` as its children. */
	const navRow = (dom, label) => {
		const row = makeEl("button");
		row.className = "VOzbGW_navCell";
		const glyph = makeEl("svg");
		const text = makeEl("span");
		text.className = "VOzbGW_navLabel";
		text.textContent = label;
		row.appendChild(glyph);
		row.appendChild(text);
		dom.body.appendChild(row);
		return row;
	};
	const m = await mount({});
	const zhRow = navRow(m.dom, "俏皮话");
	const enRow = navRow(m.dom, "Playful quips");
	const otherRow = navRow(m.dom, "通用设置");
	m.plugin.apply(m.ctx);
	// The marker runs off the plugin's own poll (the settings panel can be open with no turn in
	// flight), so no call is needed here — that wiring is part of the assertion.
	ok("the row whose label is ours gets marked", zhRow.getAttribute("data-tq-section") === "true");
	ok("a neighbour row is left alone", otherRow.getAttribute("data-tq-section") === null);
	ok("and the other language's label is not mistaken for ours", enRow.getAttribute("data-tq-section") === null);
	m.plugin.__internal.markSettingsNav();
	ok("marking twice does not double up",
		m.dom.body._queryAll('[class*="navCell"]').filter((r) => r.getAttribute("data-tq-section") === "true").length === 1);
	const css = m.styles["dsh-thinking-quips-style"].textContent;
	ok("the stylesheet retires DSH's gear in that row", css.indexOf("[data-tq-section]>svg:first-child{display:none!important}") !== -1);
	ok("and paints the plugin's tail there as a mask",
		css.indexOf("[data-tq-section]::before") !== -1 && css.indexOf("data:image/svg+xml") !== -1);
	ok("in the same 16px box the nav uses", css.indexOf("center/16px 16px no-repeat") !== -1);
	ok("with the glyph itself, not a placeholder", m.plugin.__internal.NAV_ICON_WHALE_PATH.indexOf("C") !== -1
		&& m.plugin.__internal.navIconDocument("currentColor").indexOf("viewBox='0 0 16 16'") !== -1);
	// `navIconDocument` is what both the mask and the preview page render, so the two cannot drift.
	ok("the mask document is the same glyph at the same scale",
		m.plugin.__internal.navIconDocument("#000").indexOf(m.plugin.__internal.NAV_ICON_WHALE_PATH) !== -1);
	// The nav glyph is DSH's own whale, copied verbatim (MIT, see the comment at the constant).
	// Skipped only when there is no install to compare with — and it says so when it skips.
	const installedWhale = installedWhalePath();
	if (installedWhale === null) {
		console.log("SKIP the vendored whale path (no DSH install found to compare with)");
	} else {
		ok("the vendored whale is still the installed one", m.plugin.__internal.NAV_ICON_WHALE_PATH === installedWhale,
			`vendored ${m.plugin.__internal.NAV_ICON_WHALE_PATH.length} chars, installed ${installedWhale.length}`);
		ok("and it is drawn the way DSH draws it (stroke 1, no fill)",
			m.plugin.__internal.navIconDocument("#000").indexOf("stroke-width='1'") !== -1
			&& m.plugin.__internal.navIconDocument("#000").indexOf("fill='none'") !== -1);
	}

	const en = await mount({});
	const enOurRow = navRow(en.dom, "Playful quips");
	const enZhRow = navRow(en.dom, "俏皮话");
	en.setLocale("en");
	en.plugin.apply(en.ctx);
	ok("the marker follows the active locale", enOurRow.getAttribute("data-tq-section") === "true"
		&& enZhRow.getAttribute("data-tq-section") === null);
}

// ── 7. the duration format matches DSH's own ─────────────────────────────────
console.log("\n── duration format (parity with DSH) ──");
{
	const m = await mount({});
	const { formatDuration } = m.plugin.__internal;
	const cases = [
		[0, "zh", "0秒"], [999, "zh", "0秒"], [1000, "zh", "1秒"], [59_000, "zh", "59秒"],
		[60_000, "zh", "1分0秒"], [149_000, "zh", "2分29秒"], [3_600_000, "zh", "1小时0分0秒"],
		[3_723_000, "zh", "1小时2分3秒"], [-5000, "zh", "0秒"],
		[1000, "en", "1s"], [60_000, "en", "1m 0s"], [149_000, "en", "2m 29s"], [3_600_000, "en", "1h 0m 0s"]
	];
	for (const [ms, locale, want] of cases) {
		const got = formatDuration(ms, locale);
		if (got !== want) throw new Error(`formatDuration(${ms}, ${locale}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
	}
	ok(`${cases.length} duration cases match DSH's formatRunDuration`, true);
}

// ── 8. teardown ─────────────────────────────────────────────────────────────
console.log("\n── teardown ──");
{
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	m.plugin.apply(m.ctx);
	for (const cleanup of m.cleanups) cleanup();
	ok("the poll interval is cleared", m.intervalsCleared.length > 0);
	ok("the official React root is unmounted", m.unmounts.count > 0);
}

console.log("\nALL 0.2 ADAPTATION CHECKS PASSED");
