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
	createElementNS: (_ns, tag) => makeEl(tag),
	createTreeWalker: () => { let called = false; return { nextNode: () => (called ? null : (called = true, statusEl.children[0])) }; },
	querySelectorAll: (sel) => (sel === '[role="status"]' ? [statusEl] : [])
};
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.setInterval = (fn) => { intervalFn = fn; return 123; };
globalThis.clearInterval = () => {};
// A controllable clock + a requestAnimationFrame that records the callback, so the
// morph's frame loop can be driven step by step without a browser.
let clock = 1_000_000;
const realNow = Date.now;
Date.now = () => clock;
let pendingFrames = [];
let rafCalls = 0;
globalThis.requestAnimationFrame = (cb) => { rafCalls++; pendingFrames.push(cb); return rafCalls; };
globalThis.cancelAnimationFrame = () => {};
const runFrame = (advanceMs) => {
	const next = pendingFrames;
	pendingFrames = [];
	clock += advanceMs === undefined ? 16 : advanceMs;
	for (const cb of next) cb();
	return next.length;
};

const reactStub = { useState: () => [0, () => {}], useEffect: () => {}, useSyncExternalStore: (_s, get) => get() };
const jsxStub = (t, p) => ({ t, p });
const requireStub = (name) => {
	if (name === "react") return reactStub;
	if (name === "react/jsx-runtime") return { jsx: jsxStub, jsxs: jsxStub };
	throw new Error("unexpected require: " + name);
};

await import("../lib/client.js");
if (loaded === null) throw new Error("module did not register a factory");
const api = loaded.factory(requireStub).__internal;
if (!api || !Array.isArray(api.LOADER_STYLES)) throw new Error("LOADER_STYLES is not exposed via __internal");

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
	{ loader: "ring", size: "md", cls: "tq-loader-ring", scale: "1", cells: 0, indices: [] },
	{ loader: "pulse", size: "sm", cls: "tq-loader-pulse", scale: "0.8", cells: 1, indices: ["0"] },
	{ loader: "dots", size: "lg", cls: "tq-loader-dots", scale: "1.25", cells: 3, indices: ["0", "1", "2"] },
	{ loader: "bars", size: "lg", cls: "tq-loader-bars", scale: "1.25", cells: 3, indices: ["0", "1", "2"] },
	{ loader: "morph", size: "lg", cls: "tq-loader-morph", scale: "1.25", cells: 0, indices: [] }
];

for (const c of CASES) {
	const span = applyWith(c.loader, c.size);
	if (!span._classes.includes(c.cls)) throw new Error(`${c.loader}: expected class ${c.cls}, got "${span.className}"`);
	if (span.getAttribute("data-style") !== c.loader) throw new Error(`${c.loader}: data-style=${span.getAttribute("data-style")}`);
	// Only `<i>` cells count: the ring's `<svg>` is checked separately below.
	const cells = span.children.filter((child) => child.tagName === "i");
	if (cells.length !== c.cells) throw new Error(`${c.loader}: expected ${c.cells} cells, got ${cells.length}`);
	c.indices.forEach((want, i) => {
		const got = iValue(cells[i]) ?? null;
		if (got !== want) throw new Error(`${c.loader}: cell ${i} --i expected ${want}, got ${got}`);
	});
	const scale = span.style.props["--tq-loader-scale"];
	if (scale !== c.scale) throw new Error(`${c.loader}: scale expected ${c.scale}, got ${scale}`);
	console.log(`OK   ${c.loader.padEnd(5)} size=${c.size} cells=${cells.length} scale=${scale} :: ${span.className}`);
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

// Every declared style must have a rule; the CSS-driven ones also need keyframes.
// (`morph` is driven by requestAnimationFrame, so it must NOT have a CSS animation.)
const cssEl = document.getElementById("dsh-thinking-quips-style");
if (!cssEl) throw new Error("plugin CSS was not injected");
const css = cssEl.textContent;
const KEYFRAMES = { orbit: "tq-orbit-chase", ring: "tq-spin", pulse: "tq-pulse", dots: "tq-dots", bars: "tq-bars" };
for (const style of api.LOADER_STYLES) {
	if (css.indexOf(`.tq-loader-${style}`) === -1) throw new Error(`CSS missing .tq-loader-${style}`);
}
for (const [style, anim] of Object.entries(KEYFRAMES)) {
	if (css.indexOf(`@keyframes ${anim}`) === -1) throw new Error(`CSS missing @keyframes ${anim}`);
	if (css.indexOf(`animation:${anim}`) === -1) throw new Error(`.tq-loader-${style} does not use ${anim}`);
}
if (css.indexOf("prefers-reduced-motion") === -1) throw new Error("CSS does not respect prefers-reduced-motion");
if (css.indexOf(".tq-loader{") === -1) throw new Error("CSS missing the shared .tq-loader base rule");
console.log(`OK   CSS covers ${api.LOADER_STYLES.length} styles + keyframes + reduced motion (${css.length} bytes)`);

// The ring must be REAL SVG geometry, not CSS borders: `border-radius:50%` with
// per-side colours meets at mitred corners, which read as a rounded square at 16px
// (shipped that way in 0.4.0-0.4.2), and a two-border arc alone reads as a "C".
function rule(selector) {
	const m = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}").exec(css);
	if (!m) throw new Error(`CSS rule not found: ${selector}`);
	return m[1];
}
const ringSpan = applyWith("ring", "md");
const ringSvg = ringSpan.children[0];
if (!ringSvg || ringSvg.tagName !== "svg") throw new Error("the ring does not build an <svg>");
if (ringSpan.children.length !== 1) throw new Error(`the ring should hold exactly one svg, got ${ringSpan.children.length}`);
if (ringSvg.getAttribute("viewBox") !== "0 0 16 16") throw new Error(`ring viewBox is ${ringSvg.getAttribute("viewBox")}`);
const circles = ringSvg.children.filter((c) => c.tagName === "circle");
if (circles.length !== 2) throw new Error(`the ring needs a track and an arc, got ${circles.length} circles`);
// SVG className is not a string, so the plugin sets the class ATTRIBUTE — read it back the same way.
const classes = circles.map((c) => c.getAttribute("class"));
if (classes.join(",") !== "tq-ringTrack,tq-ringArc") throw new Error(`unexpected ring circles: ${classes.join(",")}`);
for (const c of circles) {
	if (c.getAttribute("r") !== "6.5" || c.getAttribute("cx") !== "8" || c.getAttribute("cy") !== "8") {
		throw new Error(`ring circle is off-centre: ${JSON.stringify(c._attrs)}`);
	}
}
console.log("OK   ring = <svg viewBox=0 0 16 16> with a centre-8 r-6.5 track + arc");

const ringBox = rule(".tq-loader-ring");
const ringSvgCss = rule(".tq-loader-ring svg");
const ringTrack = rule(".tq-loader-ring .tq-ringTrack");
const ringArc = rule(".tq-loader-ring .tq-ringArc");
if (!/width:16px/.test(ringBox) || !/height:16px/.test(ringBox)) throw new Error(`ring box is not 16x16: ${ringBox}`);
if (!/display:block/.test(ringBox)) throw new Error("ring box is not block-level (width/height would not apply if it stops being a flex item)");
if (!/width:16px/.test(ringSvgCss) || !/height:16px/.test(ringSvgCss)) throw new Error(`ring svg is not 16x16: ${ringSvgCss}`);
if (!/overflow:visible/.test(ringSvgCss)) throw new Error("ring svg would clip its own stroke");
if (!/animation:tq-spin/.test(ringSvgCss)) throw new Error("ring svg does not spin");
if (!/fill:none/.test(ringTrack) || !/stroke:currentColor/.test(ringTrack)) throw new Error(`ring track is not a stroked circle: ${ringTrack}`);
if (!/stroke-width:2/.test(ringTrack)) throw new Error("ring track has the wrong stroke width");
if (!/opacity:\.2/.test(ringTrack)) throw new Error("ring track is not faint");
if (!/fill:none/.test(ringArc) || !/stroke:currentColor/.test(ringArc)) throw new Error(`ring arc is not a stroked circle: ${ringArc}`);
if (!/stroke-linecap:round/.test(ringArc)) throw new Error("ring arc ends are not rounded");
if (!/stroke-dasharray:[\d.]+ [\d.]+/.test(ringArc)) throw new Error(`ring arc is not a dash arc: ${ringArc}`);
if (rule("@media (prefers-reduced-motion:reduce)").indexOf(".tq-loader svg{animation:none") === -1) {
	throw new Error("reduced motion does not stop the ring");
}
console.log("OK   ring CSS = stroked track (20%) + round-capped dash arc + reduced-motion stop");

// The morph: one SVG path (rewritten per frame by JS, so no CSS animation may
// fight its transform attribute).
const morphSpan = applyWith("morph", "md");
const morphSvg = morphSpan.children[0];
if (!morphSvg || morphSvg.tagName !== "svg") throw new Error("the morph does not build an <svg>");
if (morphSvg.getAttribute("viewBox") !== "0 0 16 16") throw new Error(`morph viewBox is ${morphSvg.getAttribute("viewBox")}`);
const morphPathEl = morphSvg.children[0];
if (!morphPathEl || morphPathEl.tagName !== "path") throw new Error("the morph has no <path>");
if (morphPathEl.getAttribute("class") !== "tq-morphPath") throw new Error(`unexpected morph path class: ${morphPathEl.getAttribute("class")}`);
const stillD = morphPathEl.getAttribute("d");
if (!/^M/.test(stillD) || !/Z$/.test(stillD)) throw new Error("the still frame is not a closed path");
if (stillD.indexOf("L") === -1) throw new Error("the still frame has no line segments");
const morphSvgCss = rule(".tq-loader-morph svg");
const morphPathCss = rule(".tq-loader-morph .tq-morphPath");
if (/animation:/.test(morphSvgCss) || /animation:/.test(morphPathCss)) {
	throw new Error("the morph must not have a CSS animation — it would fight the JS transform");
}
if (!/overflow:visible/.test(morphSvgCss)) throw new Error("morph svg would clip its own stroke");
if (!/fill:none/.test(morphPathCss) || !/stroke:currentColor/.test(morphPathCss)) throw new Error(`morph path is not stroked: ${morphPathCss}`);
if (!/stroke-width:2/.test(morphPathCss) || !/stroke-linejoin:round/.test(morphPathCss)) throw new Error("morph path stroke is not the ring's 2px round-joined stroke");
console.log("OK   morph = one stroked <path> in a 16x16 svg, no CSS animation");

// The morph is driven by requestAnimationFrame, so nothing above would notice a
// loop that never runs — which is exactly how the offline preview shipped twice with
// a frozen circle. Drive the plugin's own loop here.
console.log("\n── the morph's frame loop actually runs ──");
pendingFrames = [];
rafCalls = 0;
const liveSpan = applyWith("morph", "md");
const livePath = liveSpan.children[0].children[0];
if (rafCalls < 1 || pendingFrames.length < 1) throw new Error("ensureMorph did not schedule a frame");
const firstD = livePath.getAttribute("d");
if (!/^M/.test(firstD)) throw new Error("the morph path has no d before the first frame");
const seen = new Set([firstD]);
for (let i = 0; i < 40; i++) {
	runFrame(100); // 100ms per frame: a few segments' worth over the loop
	seen.add(livePath.getAttribute("d"));
}
if (seen.size < 10) throw new Error(`the loop drew only ${seen.size} distinct outlines in 40 frames — it is frozen`);
if (livePath.getAttribute("d") === null) throw new Error("the morph path lost its d");
// Frame 0 must be the still circle the markup ships with, and later frames must not be.
const circleD = api.morphPath(0, 0);
if (!seen.has(circleD)) throw new Error("the loop never drew the initial circle");
console.log(`OK   40 frames drew ${seen.size} distinct outlines`);
if (pendingFrames.length < 1) throw new Error("the loop did not re-arm");
console.log(`OK   the loop re-arms every frame (${pendingFrames.length} pending)`);

// A frame that errors must not end the animation, and a detached span must stop it.
pendingFrames = [];
runFrame(100);
const midD = livePath.getAttribute("d");
if (midD === circleD || midD === firstD) throw new Error(`the shape is not morphing: ${midD}`);
console.log(`OK   the shape is mid-morph after the frames (${midD.slice(0, 22)}…)`);
pendingFrames = [];
liveSpan.isConnected = false;
runFrame(100);
if (pendingFrames.length !== 0) throw new Error("a detached indicator kept the loop alive");
console.log("OK   a detached indicator stops the loop");
Date.now = realNow;

console.log("ALL LOADER CHECKS PASSED");
