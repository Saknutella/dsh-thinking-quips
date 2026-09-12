// Smoke test for the 0.3.0 loading indicators in dsh-thinking-quips/lib/client.js.
// Stubs a minimal DOM (elements, style tags, a running-status node) and, for each
// configured loader style, applies the plugin and inspects the injected icon:
//   - the span's modifier class matches the chosen style
//   - the cell count / order matches loaderCells()
//   - the orbit's centre cell is blank and its 8 dots carry the clockwise ring order
//   - --tq-loader-scale comes from LOADER_SCALES[size]
// The module is imported once; each scenario calls factory() again for fresh state.

let loaded = null;
let intervalFn = null;

globalThis.window = {
	__ModuleLoader__: { load: (x) => { loaded = x; } },
	__DSH_THINKING_QUIPS__: false
};

// ── tiny fake DOM ────────────────────────────────────────────────────────────
const stylesById = {};
function makeStyleEl() { return { id: "", textContent: "", dataset: {} }; }
function makeEl(tag) {
	const el = {
		tagName: tag,
		children: [],
		parentNode: null,
		style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
		_attrs: {},
		_classes: [],
		appendChild(child) { el.children.push(child); child.parentNode = el; return child; },
		get firstChild() { return el.children.length ? el.children[0] : null; },
		insertBefore(child, ref) {
			const at = ref ? el.children.indexOf(ref) : -1;
			if (at === -1) el.children.push(child); else el.children.splice(at, 0, child);
			child.parentNode = el;
			return child;
		},
		setAttribute(k, v) { el._attrs[k] = String(v); },
		getAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k) ? el._attrs[k] : null; },
		querySelector(sel) {
			if (sel !== ".tq-loader") return null;
			return el.children.find((c) => (c._classes || []).includes("tq-loader")) || null;
		},
		remove() {
			if (!el.parentNode) return;
			const at = el.parentNode.children.indexOf(el);
			if (at !== -1) el.parentNode.children.splice(at, 1);
			el.parentNode = null;
		}
	};
	Object.defineProperty(el, "className", {
		get: () => el._classes.join(" "),
		set: (v) => { el._classes = String(v).split(/\s+/).filter(Boolean); }
	});
	return el;
}
function makeStatusEl() {
	const textNode = { parentNode: null, nodeValue: "深度求索中..." };
	const el = makeEl("span");
	el.className = "EvIC1a_turnStatus";
	el.appendChild(textNode);
	Object.defineProperty(el, "textContent", { get: () => String(textNode.nodeValue) });
	return el;
}

let statusEl = makeStatusEl();
globalThis.document = {
	body: {},
	head: { appendChild: (el) => { if (el && el.id) stylesById[el.id] = el; } },
	getElementById: (id) => stylesById[id] || null,
	createElement: (tag) => (tag === "style" ? makeStyleEl() : makeEl(tag)),
	createTreeWalker: () => { let called = false; return { nextNode: () => (called ? null : (called = true, statusEl.children[0])) }; },
	querySelectorAll: (sel) => (sel === '[role="status"]' ? [statusEl] : [])
};
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.setInterval = (fn) => { intervalFn = fn; return 123; };
globalThis.clearInterval = () => {};

const reactStub = { useState: () => [0, () => {}], useEffect: () => {}, useSyncExternalStore: (_s, get) => get() };
const jsxStub = (t, p) => ({ t, p });
const requireStub = (name) => {
	if (name === "react") return reactStub;
	if (name === "react/jsx-runtime") return { jsx: jsxStub, jsxs: jsxStub };
	throw new Error("unexpected require: " + name);
};

await import("../lib/client.js");
if (loaded === null) throw new Error("module did not register a factory");

function applyWith(loader, loaderSize, reuse) {
	globalThis.window.__DSH_THINKING_QUIPS__ = false; // the once-guard is per-apply
	globalThis.localStorage = {
		getItem: () => JSON.stringify({ color: "shimmer", glow: 35, quips: [], loader, loaderSize }),
		setItem: () => {}
	};
	if (reuse !== true) statusEl = makeStatusEl();
	document.querySelectorAll = (sel) => (sel === '[role="status"]' ? [statusEl] : []);
	intervalFn = null;
	const plugin = loaded.factory(requireStub);
	const ctx = {
		on: () => {},
		locale: { register: () => ({}), getLocale: () => ({ active: "en" }) },
		slots: { inject: (_n, cb) => { cb(); return () => {}; }, register: () => () => {} },
		effect: (fn) => fn()
	};
	plugin.apply(ctx);
	if (intervalFn === null) throw new Error("apply did not schedule a poll");
	const span = statusEl.children.find((c) => (c._classes || []).includes("tq-loader"));
	if (!span) throw new Error(`no .tq-loader injected for ${loader}`);
	if (statusEl.children[0] !== span) throw new Error("the loader is not the first child");
	return span;
}

const iValue = (cell) => cell.style.props["--i"];

// orbit: the 8-dot clockwise ring, empty centre (grid slot 4).
const ORBIT_ORDER = ["0", "1", "2", "7", null, "3", "6", "5", "4"];
const CASES = [
	{ loader: "orbit", size: "md", cls: "tq-loader-orbit", scale: "1", cells: 9, indices: ORBIT_ORDER },
	{ loader: "ring", size: "md", cls: "tq-loader-ring", scale: "1", cells: 1, indices: ["0"] },
	{ loader: "pulse", size: "sm", cls: "tq-loader-pulse", scale: "0.8", cells: 1, indices: ["0"] },
	{ loader: "dots", size: "lg", cls: "tq-loader-dots", scale: "1.25", cells: 3, indices: ["0", "1", "2"] },
	{ loader: "bars", size: "lg", cls: "tq-loader-bars", scale: "1.25", cells: 3, indices: ["0", "1", "2"] }
];

for (const c of CASES) {
	const span = applyWith(c.loader, c.size);
	if (!span._classes.includes(c.cls)) throw new Error(`${c.loader}: expected class ${c.cls}, got "${span.className}"`);
	if (span.getAttribute("data-style") !== c.loader) throw new Error(`${c.loader}: data-style=${span.getAttribute("data-style")}`);
	if (span.children.length !== c.cells) throw new Error(`${c.loader}: expected ${c.cells} cells, got ${span.children.length}`);
	c.indices.forEach((want, i) => {
		const got = iValue(span.children[i]) ?? null;
		if (got !== want) throw new Error(`${c.loader}: cell ${i} --i expected ${want}, got ${got}`);
	});
	const scale = span.style.props["--tq-loader-scale"];
	if (scale !== c.scale) throw new Error(`${c.loader}: scale expected ${c.scale}, got ${scale}`);
	console.log(`OK   ${c.loader.padEnd(5)} size=${c.size} cells=${c.cells} scale=${scale} :: ${span.className}`);
}

// The orbit's blank centre must be transparent and unanimated.
const orbit = applyWith("orbit", "md");
if (orbit.children[4]._classes.includes("blank") !== true) throw new Error("orbit centre is not blank");
if (iValue(orbit.children[4]) !== undefined) throw new Error("the blank centre should have no --i");
console.log("OK   orbit centre blank, no --i");

// An unknown style falls back to orbit, and an unknown size to 1.
const fallback = applyWith("nope", "nope");
if (!fallback._classes.includes("tq-loader-orbit")) throw new Error("unknown style did not fall back to orbit");
if (fallback.style.props["--tq-loader-scale"] !== "1") throw new Error("unknown size did not fall back to 1");
console.log("OK   unknown style/size fall back to orbit/1");

// Switching the style re-renders in place instead of stacking icons. The second
// apply targets the SAME status element, so its first pass has to notice the stale
// data-style, remove the old icon and insert the new one.
applyWith("orbit", "md");
const textChild = statusEl.children[1];
const swapped = applyWith("bars", "md", true);
const icons = statusEl.children.filter((c) => (c._classes || []).includes("tq-loader"));
if (icons.length !== 1) throw new Error(`expected exactly 1 icon after the switch, got ${icons.length}`);
if (!swapped._classes.includes("tq-loader-bars")) throw new Error("the switch did not swap in the new style");
if (swapped.children.length !== 3) throw new Error("the switched icon did not re-render its cells");
if (statusEl.children[0] !== swapped) throw new Error("the switched icon is not the first child");
if (statusEl.children.indexOf(textChild) === -1) throw new Error("the status text child was lost during the switch");
console.log(`OK   style switch swaps in place (1 icon, ${swapped.children.length} cells, text kept)`);

// Every declared style must have both a rule and its keyframes in the injected CSS.
const cssEl = document.getElementById("dsh-thinking-quips-style");
if (!cssEl) throw new Error("plugin CSS was not injected");
const css = cssEl.textContent;
const KEYFRAMES = { orbit: "tq-orbit-chase", ring: "tq-spin", pulse: "tq-pulse", dots: "tq-dots", bars: "tq-bars" };
for (const [style, anim] of Object.entries(KEYFRAMES)) {
	if (css.indexOf(`.tq-loader-${style}`) === -1) throw new Error(`CSS missing .tq-loader-${style}`);
	if (css.indexOf(`@keyframes ${anim}`) === -1) throw new Error(`CSS missing @keyframes ${anim}`);
	if (css.indexOf(`animation:${anim}`) === -1) throw new Error(`.tq-loader-${style} does not use ${anim}`);
}
if (css.indexOf("prefers-reduced-motion") === -1) throw new Error("CSS does not respect prefers-reduced-motion");
if (css.indexOf(".tq-loader{") === -1) throw new Error("CSS missing the shared .tq-loader base rule");
console.log(`OK   CSS covers 5 styles + keyframes + reduced motion (${css.length} bytes)`);

// The ring must be a real ring: a faint full track under a bright half-arc. A
// two-border-only arc reads as a "C" in a still frame, which is what shipped in
// 0.4.0/0.4.1.
function rule(selector) {
	const m = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}").exec(css);
	if (!m) throw new Error(`CSS rule not found: ${selector}`);
	return m[1];
}
const ringBox = rule(".tq-loader-ring");
const ringTrack = rule(".tq-loader-ring::before");
const ringArc = rule(".tq-loader-ring i");
if (!/width:16px/.test(ringBox) || !/height:16px/.test(ringBox)) throw new Error(`ring box is not 16x16: ${ringBox}`);
if (!/display:block/.test(ringBox)) throw new Error("ring box is not block-level (width/height would not apply if it stops being a flex item)");
if (!/position:relative/.test(ringBox)) throw new Error("ring container is not a positioning context");
if (!/border-radius:50%/.test(ringTrack) || !/border:2px solid currentColor/.test(ringTrack)) throw new Error(`ring track is not a full ring: ${ringTrack}`);
if (!/opacity:\.2/.test(ringTrack)) throw new Error("ring track is not faint");
if (!/position:absolute/.test(ringTrack) || !/inset:0/.test(ringTrack)) throw new Error("ring track does not fill the box");
if (!/border-radius:50%/.test(ringArc)) throw new Error("ring arc is not round");
if (!/border:2px solid transparent/.test(ringArc)) throw new Error(`ring arc has no transparent borders: ${ringArc}`);
if (!/border-top-color:currentColor/.test(ringArc) || !/border-right-color:currentColor/.test(ringArc)) throw new Error("ring arc is not a half arc");
if (!/position:absolute/.test(ringArc) || !/inset:0/.test(ringArc)) throw new Error("ring arc does not overlay the track");
if (!/animation:tq-spin/.test(ringArc)) throw new Error("ring arc does not spin");
console.log("OK   ring = 16px box + faint full track + bright half-arc on top");

console.log("ALL LOADER CHECKS PASSED");
