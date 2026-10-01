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

console.log("ALL LOADER CHECKS PASSED");
