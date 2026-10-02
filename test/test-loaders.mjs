// Smoke test for the 0.3.0 loading indicators in dsh-thinking-quips/lib/client.js.
// Stubs a minimal DOM (elements, style tags, a running-status node) and, for each
// configured loader style, applies the plugin and inspects the injected icon:
//   - the span's modifier class matches the chosen style
//   - the cell count / order matches loaderCells()
//   - the orbit's centre cell is blank and its 8 dots carry the clockwise ring order
//   - --tq-loader-scale comes from LOADER_SCALES[size]
// The module is imported once; each scenario calls factory() again for fresh state.

// The contributed sprites are compared against the SVG files they were ported from, so the test
// reads those files (Node's fs; the library is committed next to the plugin).
import { readFileSync } from "node:fs";

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
		style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } },
		_attrs: {},
		_classes: [],
		appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); el.children.push(child); child.parentNode = el; return child; },
		get firstChild() { return el.children.length ? el.children[0] : null; },
		insertBefore(child, ref) {
			// Detach first, then resolve the reference position — real DOM order (see the same
			// note in test-adapt-02: computing the index before the detach inserts too late).
			if (child.parentNode) child.parentNode.removeChild(child);
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
	documentElement: makeEl("html"),
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
let cancelCalls = 0;
globalThis.requestAnimationFrame = (cb) => { rafCalls++; pendingFrames.push(cb); return rafCalls; };
globalThis.cancelAnimationFrame = () => { cancelCalls += 1; };
const runFrame = (advanceMs) => {
	const next = pendingFrames;
	pendingFrames = [];
	clock += advanceMs === undefined ? 16 : advanceMs;
	for (const cb of next) cb();
	return next.length;
};

const reactStub = {
	useState: () => [0, () => {}],
	useEffect: () => {},
	useSyncExternalStore: (_s, get) => get(),
	createElement: (type, props, ...children) => ({ type, props, children })
};
const jsxStub = (t, p) => ({ t, p });
// The official icon options read the seeded primitives and mount a React root, so both
// stubs are switchable: `withPrimitives = false` is an older shell that seeds neither.
const StateDotStub = function StateDot() {};
const FISH_PATH = "M22.9168 1.43018C22.6713 1.31018 22.4223 1.65519Z";
let withPrimitives = true;
const official = { renders: [], unmounts: 0, roots: 0 };
/** The disposers this instance's `ctx.effect` calls returned (reset per apply). */
let effectDisposers = [];
const requireStub = (name) => {
	if (name === "react") return reactStub;
	if (name === "react/jsx-runtime") return { jsx: jsxStub, jsxs: jsxStub };
	if (name === "react-dom/client") {
		return {
			createRoot: (container) => {
				official.roots++;
				return {
					render: (element) => { official.renders.push({ container, element }); },
					unmount: () => { official.unmounts++; }
				};
			}
		};
	}
	if (name === "@deepseek-ai/dsh-client-ui-primitives") {
		if (!withPrimitives) throw new Error("seed unavailable on this shell");
		return { StateDot: StateDotStub, FISH_LOGO_PATH: FISH_PATH, FISH_LOGO_VIEWBOX: { width: 23.16, height: 17.04 } };
	}
	throw new Error("unexpected require: " + name);
};

await import("../lib/client.js");
if (loaded === null) throw new Error("module did not register a factory");
const api = loaded.factory(requireStub).__internal;
if (!api || !Array.isArray(api.LOADER_STYLES)) throw new Error("LOADER_STYLES is not exposed via __internal");

function applyWith(loader, loaderSize, reuse, extra, opts) {
	globalThis.window.__DSH_THINKING_QUIPS__ = false; // the once-guard is per-apply
	withPrimitives = !(opts && opts.withPrimitives === false);
	official.renders = [];
	official.unmounts = 0;
	official.roots = 0;
	effectDisposers = [];
	globalThis.localStorage = {
		getItem: () => JSON.stringify(Object.assign({ color: "shimmer", quips: [], loader, loaderSize }, extra || {})),
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
		effect: (fn) => {
			const disposer = fn();
			if (typeof disposer === "function") effectDisposers.push(disposer);
			return disposer;
		}
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
// 1em = the loader's own base (16px + --dsh-content-font-delta), so the box tracks the
// user's content font size instead of freezing at 16px (see the block at the end).
if (!/width:1em/.test(ringBox) || !/height:1em/.test(ringBox)) throw new Error(`ring box is not 1em square: ${ringBox}`);
if (!/display:block/.test(ringBox)) throw new Error("ring box is not block-level (width/height would not apply if it stops being a flex item)");
if (!/width:1em/.test(ringSvgCss) || !/height:1em/.test(ringSvgCss)) throw new Error(`ring svg is not 1em square: ${ringSvgCss}`);
if (!/overflow:visible/.test(ringSvgCss)) throw new Error("ring svg would clip its own stroke");
if (!/animation:tq-spin/.test(ringSvgCss)) throw new Error("ring svg does not spin");
if (!/fill:none/.test(ringTrack) || !/stroke:currentColor/.test(ringTrack)) throw new Error(`ring track is not a stroked circle: ${ringTrack}`);
if (!/stroke-width:2/.test(ringTrack)) throw new Error("ring track has the wrong stroke width");
if (!/opacity:\.2/.test(ringTrack)) throw new Error("ring track is not faint");
if (!/fill:none/.test(ringArc) || !/stroke:currentColor/.test(ringArc)) throw new Error(`ring arc is not a stroked circle: ${ringArc}`);
if (!/stroke-linecap:round/.test(ringArc)) throw new Error("ring arc ends are not rounded");
if (!/stroke-dasharray:[\d.]+ [\d.]+/.test(ringArc)) throw new Error(`ring arc is not a dash arc: ${ringArc}`);
const reduced = rule("@media (prefers-reduced-motion:reduce)");
for (const stopped of [".tq-loader i", ".tq-loader svg", ".tq-waveItem"]) {
	if (reduced.indexOf(stopped) === -1) throw new Error(`reduced motion does not stop ${stopped}`);
}
if (reduced.indexOf("animation:none!important") === -1) throw new Error("the reduced-motion block does not disable animations");
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

// The global speed multiplier must reach every animation the plugin owns, and the
// wave must carry its own colour and text fill (a wrapped glyph does not reliably
// take part in DSH's background-clip:text, and would otherwise inherit the
// transparent fill and vanish).
console.log("\n── text effect + global speed CSS ──");
const waveSpanCss = rule(".tq-wave");
if (!/-webkit-text-fill-color:currentColor/.test(waveSpanCss)) throw new Error(`the wave does not set its own text fill: ${waveSpanCss}`);
if (!/color:var\(--dsw-static-deepseek-500\)/.test(waveSpanCss)) throw new Error(`the wave has no default colour: ${waveSpanCss}`);
const waveItemCss = rule(".tq-waveItem");
if (!/display:inline-block/.test(waveItemCss)) throw new Error(`wave items are not transformable: ${waveItemCss}`);
if (!/animation:tq-wave/.test(waveItemCss) || !/var\(--tq-speed/.test(waveItemCss)) throw new Error(`the wave animation is not scaled: ${waveItemCss}`);
if (!/animation-delay:calc\(var\(--i\)[^)]*var\(--tq-speed/.test(waveItemCss)) throw new Error(`the wave stagger is not scaled: ${waveItemCss}`);
if (!/@keyframes tq-wave\{/.test(css)) throw new Error("the wave keyframes are missing");
if (css.indexOf('[class*="turnStatus"].tq-waving{animation:none') === -1) throw new Error("nothing stops DSH's sweep while the wave owns the line");
const scaledRules = [".tq-loader-orbit i", ".tq-loader-ring svg", ".tq-loader-pulse i", ".tq-loader-dots i", ".tq-loader-bars i", ".tq-waveItem"];
for (const selector of scaledRules) {
	const body = rule(selector);
	if (!/var\(--tq-speed/.test(body)) throw new Error(`${selector} ignores the global speed: ${body}`);
}
console.log(`OK   wave carries its own colour + fill; ${scaledRules.length} animations honour --tq-speed`);

// The colour override has to reach the wave too, or a custom colour would leave the
// waving text on the default blue. (Needs a custom colour: at the default shimmer the
// plugin deliberately injects no override at all.)
applyWith("orbit", "md", false, { color: "#ff0000" });
const overrideCss = document.getElementById("dsh-thinking-quips-color");
if (!overrideCss) throw new Error("no colour override style was injected for a custom colour");
if (overrideCss.textContent.indexOf(".tq-wave{color:") === -1) throw new Error(`the colour override skips the wave: ${overrideCss.textContent}`);
console.log("OK   the colour override covers .tq-wave");

// The speed is three steps (slow / normal / fast) and "normal" must leave no trace.
// Everything the plugin animates reads the variable. DSH's own sweep is deliberately
// NOT scaled any more: on 0.2 it animates inside the primitives' TextShimmer, so the
// speed sheet may only ever carry the plugin's OWN `native` cue (see the last block) —
// never a rule that reaches into DSH's sweep.
applyWith("orbit", "md", false, { speed: "fast" });
if (document.documentElement.style.props["--tq-speed"] !== "2") throw new Error(`--tq-speed was not set for fast: ${JSON.stringify(document.documentElement.style.props)}`);
const speedStyle = document.getElementById("dsh-thinking-quips-speed");
if (speedStyle !== null && speedStyle.textContent !== ""
	&& (speedStyle.textContent.indexOf("tq-swim") === -1 || /sweep|highlight|shimmer|runningText/.test(speedStyle.textContent))) {
	throw new Error(`the speed sheet must touch nothing but the plugin's own cue: ${speedStyle.textContent}`);
}
applyWith("orbit", "md", false, { speed: "slow" });
if (document.documentElement.style.props["--tq-speed"] !== "0.5") throw new Error("--tq-speed was not set for slow");
applyWith("orbit", "md", false, { speed: "normal" });
if (document.documentElement.style.props["--tq-speed"] !== undefined) throw new Error("--tq-speed should be removed again at normal");
const normalStyle = document.getElementById("dsh-thinking-quips-speed");
if (normalStyle && normalStyle.textContent !== "") throw new Error("the speed override should be cleared at normal");
console.log("OK   slow/normal/fast drive --tq-speed only (DSH's own sweep keeps its pace)");

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

// Changing ONLY the size used to be swallowed by the "style already matches" early
// return, so the settings size had no effect until the style changed.
console.log("\n── a size-only change rescales the live icon ──");
applyWith("orbit", "sm");
const beforeResize = statusEl.children.find((c) => (c._classes || []).includes("tq-loader"));
if (beforeResize.style.props["--tq-loader-scale"] !== "0.8") throw new Error(`expected the sm scale first, got ${beforeResize.style.props["--tq-loader-scale"]}`);
const afterResize = applyWith("orbit", "lg", true); // same status element, same style, bigger size
if (afterResize !== beforeResize) throw new Error("a size-only change rebuilt the icon instead of rescaling it");
if (afterResize.style.props["--tq-loader-scale"] !== "1.25") {
	throw new Error(`the size change did not rescale the icon: --tq-loader-scale=${afterResize.style.props["--tq-loader-scale"]}`);
}
if (afterResize.getAttribute("data-scale") !== "1.25") throw new Error("data-scale was not updated with the size");
console.log("OK   size-only change rescales in place (sm 0.8 → lg 1.25, same element)");

// ...and a style change still rebuilds, carrying the new size with it.
const swappedBoth = applyWith("dots", "lg", true);
if (swappedBoth === afterResize) throw new Error("a style change did not rebuild the icon");
if (!swappedBoth._classes.includes("tq-loader-dots")) throw new Error("the rebuilt icon has the wrong style");
if (swappedBoth.style.props["--tq-loader-scale"] !== "1.25") throw new Error("the rebuilt icon lost the size");
console.log("OK   style change rebuilds and keeps the size");

// The official icon options: DSH's own StateDot and logo path, reused rather than
// redrawn. Both need the seeded primitives, so both must also degrade to a plugin-drawn
// icon — and keep reporting what the user actually picked — on a shell that seeds none.
console.log("\n── the official icon options ──");
const effectiveOf = (span) => span.getAttribute("data-effective");
const requestedOf = (span) => span.getAttribute("data-style");
{
	const dot = applyWith("stateDot", "md");
	if (effectiveOf(dot) !== "stateDot") throw new Error(`stateDot did not render itself: ${effectiveOf(dot)}`);
	if (requestedOf(dot) !== "stateDot") throw new Error("data-style lost the requested value");
	const box = dot.children[0];
	if (!box || !(box._classes || []).includes("tq-dotBox")) throw new Error("the official dot has no box to mount in");
	if (official.renders.length !== 1) throw new Error(`expected one render of the dot, got ${official.renders.length}`);
	if (official.renders[0].element.type !== StateDotStub) throw new Error("the official StateDot was not the rendered component");
	if (official.renders[0].element.props.state !== "ongoing") {
		throw new Error(`StateDot state is ${official.renders[0].element.props.state}, want ongoing`);
	}
	if (official.renders[0].container !== box) throw new Error("the dot was rendered outside its own box");
	console.log("OK   stateDot mounts the official StateDot in its ongoing state");
	// A React root left mounted on a detached node is a leak, so teardown has to unmount
	// it. Observed through the effect disposers: the root lives in module state, so only
	// the same instance can prove this (a fresh instance starts with no root at all).
	for (const dispose of effectDisposers) dispose();
	if (official.unmounts === 0) throw new Error("teardown left the official dot's React root mounted");
	console.log("OK   teardown unmounts the official dot's React root");
	// A style switch still rebuilds even though the previous node was an official one.
	const other = applyWith("orbit", "md", true);
	if (effectiveOf(other) !== "orbit") throw new Error("the switch back did not rebuild the plugin icon");
	console.log("OK   an official icon is replaced when the style changes");
}
{
	const fish = applyWith("fish", "md");
	if (effectiveOf(fish) !== "fish") throw new Error(`fish did not render: ${effectiveOf(fish)}`);
	const svg = fish.children[0];
	if (!svg || svg.tagName !== "svg") throw new Error("fish did not build an <svg>");
	if (svg.getAttribute("viewBox") !== "0 0 23.16 17.04") throw new Error(`fish viewBox is ${svg.getAttribute("viewBox")}`);
	const shape = svg.children[0];
	if (!shape || shape.getAttribute("d") !== FISH_PATH) throw new Error("fish did not use the seeded logo path");
	if (shape.getAttribute("fill") !== "currentColor") throw new Error("fish does not inherit the configured colour");
	console.log("OK   fish draws the seeded logo path in the official viewBox");
}
{
	const dot = applyWith("stateDot", "md", false, null, { withPrimitives: false });
	if (effectiveOf(dot) !== "ring") throw new Error(`stateDot should degrade to the plugin spinner, got ${effectiveOf(dot)}`);
	if (requestedOf(dot) !== "stateDot") throw new Error("the degraded icon forgot what the user picked");
	if (!dot.children.some((c) => c.tagName === "svg")) throw new Error("the fallback ring is not an svg");
	console.log("OK   without the seed stateDot degrades to the plugin's own ring");
}
{
	const fish = applyWith("fish", "md", false, null, { withPrimitives: false });
	if (effectiveOf(fish) !== "orbit") throw new Error(`fish should degrade to orbit, got ${effectiveOf(fish)}`);
	if (requestedOf(fish) !== "fish") throw new Error("the degraded icon forgot what the user picked");
	if (fish.children.length === 0) throw new Error("the fallback orbit drew no cells");
	console.log("OK   without the seed fish degrades to the default orbit");
}
{
	const plain = applyWith("orbit", "md");
	if (effectiveOf(plain) !== "orbit" || requestedOf(plain) !== "orbit") {
		throw new Error(`a plugin-drawn style reports ${requestedOf(plain)}/${effectiveOf(plain)}`);
	}
	console.log("OK   plugin-drawn styles report the same requested and effective style");
}

// The 0.1.x status element has no whale, so `native` must paint the mask the official
// stylesheet uses. That declaration sits two levels deep (@supports → @media → rule), so
// this also pins the recursion and both guards: only a rule that mentions `running` AND
// carries an embedded PNG counts, and only its URL is taken (the shorthand's
// `50%/100% 100% no-repeat alpha` tail is not a value `mask-image` accepts).
console.log("\n── native without a whale to copy ──");
const B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
const WHALE_URL = 'url("' + B64 + '")';
{
	const decoy = { selectorText: ".somethingElse", style: { getPropertyValue: () => "url(data:image/png;base64,AAAA)" } };
	const inner = {
		selectorText: ".EvIC1a_runningWhaleAnimated",
		style: { getPropertyValue: (name) => (name === "mask" ? WHALE_URL + " 50%/100% 100% no-repeat alpha" : "") }
	};
	// The middle node carries no `style` at all: the walk must still descend through it.
	const sheet = {
		ownerNode: { dataset: { pluginCss: "@deepseek-ai/dsh-client-ui-chat/ChatView.module.css" } },
		cssRules: [{ style: { getPropertyValue: () => "" }, cssRules: [{ cssRules: [inner] }] }]
	};
	document.styleSheets = [{ ownerNode: { dataset: {} }, cssRules: [decoy] }, sheet];
	const span = applyWith("native", "md");
	if (effectiveOf(span) !== "native") throw new Error(`native should paint the official mask, got ${effectiveOf(span)}`);
	if (requestedOf(span) !== "native") throw new Error("the requested style was lost");
	if (span.style.props["mask-image"] !== WHALE_URL) throw new Error(`mask-image is ${span.style.props["mask-image"]}`);
	if (span.style.props["mask-size"] !== "100% 100%") throw new Error("the mask was not sized");
	if (span.style.props["background"] !== "currentColor") throw new Error("the whale would not follow the configured colour");
	if (statusEl.getAttribute("data-tq-icon") !== "native") throw new Error("the drawn icon was not recorded on the line");
	if (span.children.length !== 0) throw new Error("the mask branch should not draw children");
	console.log("OK   native reads the official mask out of the nested CSSOM rules");
	delete document.styleSheets;
}
{
	const span = applyWith("native", "md");
	if (effectiveOf(span) !== "orbit") throw new Error(`native should degrade to orbit, got ${effectiveOf(span)}`);
	if (requestedOf(span) !== "native") throw new Error("the degraded icon forgot what the user picked");
	if (statusEl.getAttribute("data-tq-icon") !== "orbit") throw new Error("the icon marker must follow what was actually drawn");
	console.log("OK   without a whale or a stylesheet native degrades to orbit");
}

// Two morphs in one module instance: the loop's requestAnimationFrame HANDLE used to be
// called as if it were a function, and the throw was swallowed by ensureLoader — so the
// second morph icon was never even appended. (Found by rendering the gallery page in the
// workspace's headless Chromium: 2 of its 3 morph cells were empty.)
console.log("\n── a second morphing indicator ──");
{
	const hostA = makeEl("span");
	const hostB = makeEl("span");
	cancelCalls = 0;
	api.ensureLoader(hostA, "morph", "md");
	const first = hostA.children.find((c) => (c._classes || []).includes("tq-loader"));
	if (!first || !first.children.some((c) => c.tagName === "svg")) throw new Error("the first morph drew no svg");
	if (cancelCalls !== 0) throw new Error(`nothing to cancel yet, but cancelAnimationFrame ran ${cancelCalls} time(s)`);
	api.ensureLoader(hostB, "morph", "md");
	const second = hostB.children.find((c) => (c._classes || []).includes("tq-loader"));
	if (!second || !second.children.some((c) => c.tagName === "svg")) throw new Error("the second morph drew no svg");
	if (cancelCalls !== 1) throw new Error(`the previous loop should be cancelled once, got ${cancelCalls}`);
	console.log("OK   a second morphing indicator is built and cancels the previous loop");
}

// The whale is a 28x28 APNG used as an alpha mask, i.e. a RASTER: `transform: scale()`
// would rasterise it at 14px and then stretch the bitmap (visibly soft at Large), so
// `native` is sized in real pixels instead. And its frame delays live inside the image, so
// no CSS can retime them: the speed level can only add the plugin's own cue, and only off
// Normal — which is also why the always-on stylesheet must never reference the keyframes.
console.log("\n── the native icon's sizing and its speed cue ──");
{
	const nativeBox = rule(".tq-loader-native");
	if (nativeBox.indexOf("transform:none!important") === -1) throw new Error(`native still uses the shared transform: ${nativeBox}`);
	// The icon follows DSH's own running-text token, so in `indicatorOnly` mode — where the text
	// stays DSH's — the icon is not the single custom-coloured thing on the line.
	const loaderBase = rule(".tq-loader");
	if (loaderBase.indexOf("var(--dsw-alias-label-deep-diving") === -1) {
		throw new Error(`the icon ignores DSH's running-text colour: ${loaderBase}`);
	}
	const nativeIcon = rule('.tq-loader-native [class*="runningIcon"]');
	if (nativeIcon.indexOf("var(--tq-loader-scale,1)") === -1) throw new Error(`native is not sized by --tq-loader-scale: ${nativeIcon}`);
	const nativeEmpty = rule(".tq-loader-native:empty");
	if (nativeEmpty.indexOf("var(--tq-loader-scale,1)") === -1) throw new Error(`the mask branch is not sized either: ${nativeEmpty}`);
	if (css.indexOf("@keyframes tq-swim") === -1) throw new Error("CSS missing the swim keyframes");
	if (css.indexOf("animation:tq-swim") !== -1) throw new Error("the cue must not be in the always-on stylesheet");
	if (css.indexOf('.tq-loader-native [class*="runningIcon"]{animation:none!important}') === -1) {
		throw new Error("reduced motion does not stop the swim cue");
	}
	console.log("OK   native is sized in real pixels, and the cue is never on by default");

	const cue = (speed) => {
		applyWith("orbit", "md", false, { speed });
		const el = stylesById["dsh-thinking-quips-speed"];
		return el ? el.textContent : null;
	};
	const normal = cue("normal");
	if (normal !== null && normal !== "") throw new Error(`Normal must write no cue rule, got ${JSON.stringify(normal)}`);
	const fast = cue("fast");
	if (fast !== '.tq-loader-native [class*="runningIcon"]{animation:tq-swim 0.700s ease-in-out infinite}') {
		throw new Error(`the fast cue is ${JSON.stringify(fast)}`);
	}
	const slow = cue("slow");
	if (slow !== '.tq-loader-native [class*="runningIcon"]{animation:tq-swim 2.800s ease-in-out infinite}') {
		throw new Error(`the slow cue is ${JSON.stringify(slow)}`);
	}
	console.log("OK   the cue is written only off Normal, at 1.4s / speed (fast 0.7s, slow 2.8s)");
}

// The plugin's own icons are drawn on a 16px grid, but the content font size is a GLOBAL
// user setting and DSH publishes it as --dsh-content-font-delta (= content font size - 14px);
// DSH's own running icon is `14px + delta` wide. The plugin's icons were frozen at 16px and
// silently ignored that, so at a 15px setting the official whale was 15px while ours stayed
// 16px, and the gap grew with the setting. The base is now declared once as the loader's
// font-size and every geometry is `em`: changing the setting re-sizes the icons with no JS,
// no observer and no re-render. Mounted official nodes (stateDot / native) are deliberately
// excluded — they size themselves and must not inherit a font-size the plugin invented.
console.log("\n── the icons follow the content font size ──");
{
	const base = ".tq-loader-orbit,.tq-loader-ring,.tq-loader-pulse,.tq-loader-dots,.tq-loader-bars,.tq-loader-morph,.tq-loader-fish,.tq-loader-sprites"
		+ "{font-size:calc(16px + var(--dsh-content-font-delta,0px))}";
	if (css.indexOf(base) === -1) {
		throw new Error("the plugin's own icons do not follow --dsh-content-font-delta");
	}
	for (const mounted of ["stateDot", "native"]) {
		if (base.indexOf(mounted) !== -1) throw new Error(`${mounted} must not inherit the plugin's font-size base`);
	}
	if (rule(".tq-loader-native:empty").indexOf("var(--dsh-content-font-delta,0px)") === -1) {
		throw new Error("the mask branch of native still ignores the font delta");
	}
	// Every geometry in the plugin's own drawings has to be relative, or it silently freezes at
	// the 16px base again the moment the user changes the setting.
	const RELATIVE = [
		".tq-loader-orbit", ".tq-loader-orbit i",
		".tq-loader-ring", ".tq-loader-ring svg",
		".tq-loader-morph", ".tq-loader-morph svg",
		".tq-loader-fish", ".tq-loader-pulse i",
		".tq-loader-dots", ".tq-loader-dots i",
		".tq-loader-bars", ".tq-loader-bars i",
		// The contributed sprites: their box is 1em too, and the geometry table behind it is
		// checked for pixel values separately (see the sprite section below).
		".tq-loader-sprites svg"
	];
	// Anchored to a rule boundary: the base rule's selector LIST ends with `.tq-loader-fish{`,
	// so the unanchored `rule()` helper would hand back the base rule instead of the geometry.
	const relBody = (selector) => {
		const m = new RegExp("(?:^|\\})" + selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}").exec(css);
		if (!m) throw new Error(`CSS rule not found: ${selector}`);
		return m[1];
	};
	for (const selector of RELATIVE) {
		const body = relBody(selector);
		if (/[0-9]px/.test(body)) throw new Error(`${selector} still uses a fixed px size: ${body}`);
	}
	if (css.indexOf("@keyframes tq-dots{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-.125em)}}") === -1) {
		throw new Error("the dots' lift is still in px, so it will not scale with the text");
	}
	// The equalizer's three bars: the gap and the bar width are rounded to WHOLE DEVICE PIXELS at
	// runtime (snapBarsGeometry), because `em` geometry is 6.375 device pixels wide at a 17px base
	// and Chromium rounds each box edge on its own — the middle bar painted 8 device pixels against
	// the outer 6 and read as "too far left". The `em` values must stay as the no-JS fallback.
	const barsBox = relBody(".tq-loader-bars");
	if (barsBox.indexOf("justify-content:space-between") === -1
		|| barsBox.indexOf("--tq-bar-w:.1875em") === -1
		|| barsBox.indexOf("--tq-bar-gap:.125em") === -1
		|| barsBox.indexOf("calc(3 * var(--tq-bar-w) + 2 * var(--tq-bar-gap))") === -1) {
		throw new Error(`the equalizer lost its device-pixel-snapped geometry: ${barsBox}`);
	}
	if (/(^|;)gap:/.test(barsBox)) throw new Error(`the equalizer went back to an independently rounded gap: ${barsBox}`);
	if (relBody(".tq-loader-bars i").indexOf("var(--tq-bar-w)") === -1) throw new Error("the bars ignore the snapped width");
	if (typeof api.snapBarsGeometry !== "function") throw new Error("the device-pixel snap is not exposed for the preview");
	console.log("OK   the equalizer snaps its bars to whole device pixels (em fallback kept)");
	console.log("OK   the icons scale with --dsh-content-font-delta (em geometry, official nodes untouched)");
}

// The preview page applies a changed control AT ONCE through this seam instead of waiting for the
// 600ms poll (waiting made every control look dead for up to a second). It has to exist, be safe to
// call, and report whether a pass actually ran: exporting the inner `pass` by name instead made the
// whole module throw `ReferenceError: pass is not defined` at load, for every consumer.
console.log("\n── the preview seam ──");
{
	if (typeof api.forcePass !== "function") throw new Error("the preview seam forcePass is missing");
	const ran = api.forcePass();
	if (typeof ran !== "boolean") throw new Error(`forcePass must report whether it ran, got ${typeof ran}`);
	console.log("OK   forcePass exists and is safe to call from the preview page");
}

// ── the contributed sprites (0.11.0) ─────────────────────────────────────────
// The design brief's acceptance list, asserted instead of promised: geometry with no pixel value
// anywhere, one 24-unit viewBox, currentColor paint, the family's shared 1.6s rhythm scaled by
// --tq-speed, a readable still frame under reduced motion, and a transient part (bonk's sparks)
// that disappears the moment the animation stops. Everything below drives the SHIPPED table and
// the SHIPPED ensureLoader — no coordinate is re-declared here.
console.log("\n── the contributed sprites ──");
{
	const SPRITES = api.LOADER_SPRITES;
	if (SPRITES === null || typeof SPRITES !== "object") throw new Error("LOADER_SPRITES is not exposed");
	const ids = Object.keys(SPRITES);
	if (ids.length !== 8) throw new Error(`expected 8 contributed sprites, got ${ids.length}`);
	for (const id of ids) {
		if (api.LOADER_STYLES.indexOf(id) === -1) throw new Error(`${id} is a sprite but not a loader style`);
	}
	if (api.SPRITE_BOX !== 24) throw new Error(`the delivered viewBox is 24x24, got ${api.SPRITE_BOX}`);

	// 1. Geometry is in viewBox units only. A `px` in the table would freeze the icon at one size
	// whatever the font size does — the delivery spec calls that an automatic rejection.
	const scan = (value, path) => {
		if (typeof value === "number") {
			if (!Number.isFinite(value)) throw new Error(`${path} is not a finite number`);
			return;
		}
		if (typeof value === "string") {
			if (value.indexOf("px") !== -1) throw new Error(`${path} carries a pixel value: ${value}`);
			return;
		}
		if (Array.isArray(value)) { value.forEach((v, i) => scan(v, `${path}[${i}]`)); return; }
		if (value && typeof value === "object") for (const key of Object.keys(value)) scan(value[key], `${path}.${key}`);
	};
	scan(SPRITES, "LOADER_SPRITES");

	const walk = (node, out = []) => { out.push(node); for (const child of node.children || []) walk(child, out); return out; };
	const classesOf = (node) => String(node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
	const inherited = (node, attr) => {
		let up = node;
		while (up) {
			const value = up.getAttribute(attr);
			if (value !== null) return value;
			up = up.parentNode;
		}
		return null;
	};
	for (const id of ids) {
		const span = applyWith(id, "md");
		const svg = span.children[0];
		if (!svg || svg.tagName !== "svg") throw new Error(`${id} does not build an <svg>`);
		if (svg.getAttribute("viewBox") !== `0 0 ${api.SPRITE_BOX} ${api.SPRITE_BOX}`) {
			throw new Error(`${id} viewBox is ${svg.getAttribute("viewBox")}`);
		}
		if (span.className.indexOf("tq-loader-sprites") === -1) throw new Error(`${id} is missing the sprite marker class`);
		const nodes = walk(svg);
		// Only the ROOT may not carry a size: a `<rect width="9.4">` is geometry, an
		// `<svg width="24">` is the frozen size the delivery spec rejects.
		if (svg.getAttribute("width") !== null || svg.getAttribute("height") !== null) {
			throw new Error(`${id} writes a size onto the root svg; the box has to come from CSS`);
		}
		for (const node of nodes) {
			// The delivery's own `<style>`/`<title>` are NOT ported: the animation lives in the
			// plugin stylesheet, where --tq-speed and the shared reduced-motion rule can reach it.
			if (node.tagName === "style" || node.tagName === "title") throw new Error(`${id} ported a <${node.tagName}> from the delivery`);
		}
		const leaves = nodes.filter((n) => (n.children || []).length === 0);
		if (leaves.length === 0) throw new Error(`${id} draws nothing`);
		for (const leaf of leaves) {
			// One colour, always through currentColor: what makes the icon follow the theme and the
			// user's colour setting. Group paint counts, so a stroked shape inside a painted group passes.
			if (inherited(leaf, "fill") !== "currentColor" && inherited(leaf, "stroke") !== "currentColor") {
				throw new Error(`${id} has an unpainted leaf: ${JSON.stringify(leaf._attrs)}`);
			}
			if (inherited(leaf, "stroke") === "currentColor") {
				// The spec's floor: a stroke thinner than 1/16 of the box disappears at 14px.
				const width = Number(inherited(leaf, "stroke-width"));
				if (!(width >= 1.5)) throw new Error(`${id} strokes thinner than 1.5 viewBox units: ${width}`);
			}
		}
		if (nodes.filter((n) => classesOf(n).indexOf("tq-sprite") !== -1).length === 0) {
			throw new Error(`${id} has no tq-sprite part, so reduced motion could not freeze it`);
		}
	}
	console.log(`OK   ${ids.length} sprites: 24-unit boxes, currentColor paint, no size in the markup`);

	// 2. Every sprite animation reads the shared speed variable. The family ships ONE 1.6s rhythm;
	// a part left at a fixed duration would drift out of phase with its siblings (bonk's strike,
	// squash and sparks are a single gesture, and the ripple/sparkle pairs are half a cycle apart).
	// The box of all eight is one selector list (which `rule()` cannot read, because its first
	// selector is followed by a comma rather than a brace), so it is sliced out by hand.
	const spriteBox = css.slice(css.indexOf(".tq-loader-jelly,"), css.indexOf(".tq-loader-sprites svg{"));
	if (!/width:1em/.test(spriteBox) || !/height:1em/.test(spriteBox)) {
		throw new Error(`the sprite boxes are not 1em square: ${spriteBox}`);
	}
	const slice = css.slice(css.indexOf(".tq-loader-jelly,"), css.indexOf("@media (prefers-reduced-motion:reduce)"));
	const animations = [...slice.matchAll(/animation:[^;}]+/g)].map((m) => m[0]);
	// Eleven declarations cover the twelve animated parts (the ripple's two rings and the two
	// sparkle stars each share one rule); the exact count is pinned so a dropped one is caught.
	if (animations.length !== 11) throw new Error(`expected 11 sprite animation declarations, found ${animations.length}`);
	for (const decl of animations) {
		if (decl.indexOf("calc(1.6s / var(--tq-speed,1))") === -1) throw new Error(`a sprite animation ignores the speed control: ${decl}`);
	}
	const KEYFRAMES = ["tq-jelly-squash", "tq-tick-swing", "tq-bonk-strike", "tq-bonk-squash", "tq-bonk-spark", "tq-pinwheel-spin", "tq-ripple-wave", "tq-bead-run", "tq-sparkle-bloom", "tq-bounce-jump", "tq-bounce-shadow"];
	for (const name of KEYFRAMES) {
		if (css.indexOf(`@keyframes ${name}{`) === -1) throw new Error(`missing @keyframes ${name}`);
	}
	for (const delay of [".tq-ripple-wave2{animation-delay:calc(-.8s / var(--tq-speed,1))}", ".tq-sparkle-small{animation-delay:calc(-.8s / var(--tq-speed,1))}"]) {
		if (css.indexOf(delay) === -1) throw new Error(`missing the speed-scaled half-cycle delay: ${delay}`);
	}
	// The invariant that makes ONE reduced-motion rule sufficient: every class the sprite stylesheet
	// animates must exist in the markup AND carry the tq-sprite marker. A part animated without the
	// marker would keep moving with reduced motion on — which is the whole failure mode.
	const marked = new Set();
	for (const id of ids) {
		for (const node of walk(applyWith(id, "md").children[0])) {
			const names = classesOf(node);
			if (names.indexOf("tq-sprite") !== -1) for (const name of names) marked.add(name);
		}
	}
	const animatedClasses = [...slice.matchAll(/\.(tq-[A-Za-z0-9-]+)[^{},;]*\{[^}]*animation:/g)].map((m) => m[1]);
	if (animatedClasses.length !== 11) throw new Error(`expected 11 animated class selectors, found ${animatedClasses.length}`);
	for (const name of animatedClasses) {
		if (!marked.has(name)) throw new Error(`.${name} is animated but is not a marked sprite part`);
	}
	console.log(`OK   11 sprite animations on the shared 1.6s clock, ${KEYFRAMES.length} keyframe sets`);

	// 3. Reduced motion. One marker-class rule stops every sprite (including ones added later), and
	// the two icons whose stopped state would otherwise be unreadable are pinned to a frame that
	// reads: the ripple's rings must stay a concentric pair, and bonk's sparks vanish because their
	// keyframes are their only visibility (a stopped animation leaves the static opacity="0").
	// (`rule()` cannot read this block — its body holds nested braces, so its regex stops at the
	// first `}`. Both declarations below name selectors that appear nowhere else in the sheet.)
	if (css.indexOf(".tq-loader-sprites .tq-sprite{animation:none!important}") === -1) {
		throw new Error("reduced motion does not stop the sprites");
	}
	if (css.indexOf(".tq-ripple-wave2{transform:scale(.32)}") === -1) {
		throw new Error("the ripple's still frame collapses both rings onto each other");
	}
	const sparks = walk(applyWith("bonk", "md").children[0]).filter((n) => classesOf(n).indexOf("tq-bonk-spark") !== -1);
	if (sparks.length !== 1 || sparks[0].tagName !== "g") throw new Error(`bonk should ship its sparks as one marked group, got ${sparks.length}`);
	if (sparks[0].getAttribute("opacity") !== "0") throw new Error("bonk's sparks would stay visible in the still frame");
	if ((sparks[0].children || []).length !== 2) throw new Error("the spark group should hold both lines");
	console.log("OK   reduced motion freezes every sprite; the ripple keeps its pair, bonk's sparks vanish");

	// 4. The delivered SVGs are the SPEC OF RECORD, so the table is compared against those FILES
	// rather than against a transcription of them. Everything above checks an invariant (no px,
	// marked parts, the speed variable, the still frame); none of it reads the delivery, so a
	// silently rounded or mistyped coordinate used to pass the whole suite — found by an independent
	// verification that changed one delivered value and watched every assertion stay green.
	const DELIVERED = {
		jelly: "02-jelly.svg",
		tickTock: "03-tick-tock.svg",
		bonk: "05-bonk.svg",
		pinwheel: "06-pinwheel.svg",
		ripple: "07-ripple.svg",
		beadRun: "08-bead-run.svg",
		sparkleSwap: "02-sparkle-swap.svg",
		bounceBall: "03-bounce-ball.svg"
	};
	const SHAPES = {
		rect: ["x", "y", "width", "height", "rx"],
		circle: ["cx", "cy", "r"],
		ellipse: ["cx", "cy", "rx", "ry"],
		line: ["x1", "y1", "x2", "y2"],
		path: ["d"]
	};
	// Numbers compare as numbers (`-4.70` = `-4.7`), path data has its whitespace and numbers
	// normalised, and an absent attribute counts as the SVG default (0 for geometry, 1 for opacity).
	const num = (value) => {
		const text = String(value).trim();
		return Number.isFinite(Number(text)) ? String(Number(text)) : text;
	};
	const pathData = (d) => String(d).replace(/[0-9]*\.?[0-9]+/g, num).replace(/\s+/g, " ").trim();
	const chainOf = (list) => list.map((t) => String(t).replace(/\s+/g, " ").trim()).join("|").replace(/(-?[0-9]*\.?[0-9]+)/g, num);
	const geoOf = (shape, attrs) => SHAPES[shape].map((key) => (key === "d" ? pathData(attrs[key]) : num(attrs[key] === undefined ? 0 : attrs[key]))).join(",");
	// Opacity is INHERITED in SVG, so a group's `opacity="0"` reaches its leaves: the signature
	// multiplies down the chain (the delivery hides its sparks that way, on the `<g>`).
	const signature = (shape, attrs, chain, opacity) => [shape, geoOf(shape, attrs), chainOf(chain), num(opacity)].join(" ");
	/** Leaf signatures from one delivered file: a tiny tag-stack parse, transforms accumulated. */
	const deliveredSignatures = (text) => {
		const root = { tag: "#root", attrs: {}, children: [] };
		const stack = [root];
		const tagRe = /<(\/?)([a-zA-Z][-a-zA-Z0-9]*)((?:\s+[^<>]*?)?)(\/?)>/g;
		let m;
		while ((m = tagRe.exec(text)) !== null) {
			if (m[1] === "/") { stack.pop(); continue; }
			const attrs = {};
			for (const a of m[3].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
			const node = { tag: m[2], attrs, children: [] };
			stack[stack.length - 1].children.push(node);
			if (m[4] !== "/") stack.push(node);
		}
		const out = [];
		const visit = (node, chain, opacity) => {
			const next = node.attrs.transform === undefined ? chain : chain.concat(node.attrs.transform);
			const alpha = node.attrs.opacity === undefined ? opacity : opacity * Number(node.attrs.opacity);
			if (SHAPES[node.tag] !== undefined) out.push(signature(node.tag, node.attrs, next, alpha));
			for (const child of node.children) visit(child, next, alpha);
		};
		visit(root, [], 1);
		return out;
	};
	/** The same signatures from the shipped table (geometry stored as numbers). */
	const tableSignatures = (spec) => {
		const out = [];
		const visit = (parts, chain, opacity) => {
			for (const part of parts) {
				const attrs = part.attrs || {};
				const next = attrs.transform === undefined ? chain : chain.concat(attrs.transform);
				const alpha = attrs.opacity === undefined ? opacity : opacity * Number(attrs.opacity);
				if (SHAPES[part.tag] !== undefined) out.push(signature(part.tag, attrs, next, alpha));
				visit(part.parts || [], next, alpha);
			}
		};
		visit(spec.parts || [], [], 1);
		return out;
	};
	for (const id of ids) {
		const file = DELIVERED[id];
		if (file === undefined) throw new Error(`${id} has no delivered file mapped`);
		const text = readFileSync(new URL(`../.sprites/loading-icons/svg-final/${file}`, import.meta.url), "utf8");
		const want = deliveredSignatures(text).slice().sort();
		const got = tableSignatures(SPRITES[id]).slice().sort();
		if (want.join("\n") !== got.join("\n")) {
			const missing = want.filter((s) => got.indexOf(s) === -1);
			const extra = got.filter((s) => want.indexOf(s) === -1);
			throw new Error(`${id} does not match its delivered ${file}\n    delivered only: ${missing.join(" ; ")}\n    table only:     ${extra.join(" ; ")}`);
		}
	}
	console.log(`OK   all ${ids.length} sprites still match their delivered SVG geometry field by field`);
}

console.log("ALL LOADER CHECKS PASSED");
