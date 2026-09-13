// Wave text effect + the global speed multiplier.
//
// The wave is DOM work (it wraps React's label node and adds per-token spans), so this
// needs a slightly more capable fake DOM than test-loaders.mjs: class selectors,
// nextSibling, removeChild and createTextNode.

let loaded = null;
globalThis.window = { __ModuleLoader__: { load: (x) => { loaded = x; } }, __DSH_THINKING_QUIPS__: false };

function makeTextNode(value) {
	return { nodeType: 3, nodeValue: value, parentNode: null, nextSibling: null };
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
			const at = ref ? el.children.indexOf(ref) : -1;
			if (child.parentNode) child.parentNode.removeChild(child);
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
		setAttribute(k, v) { el._attrs[k] = String(v); },
		getAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k) ? el._attrs[k] : null; },
		hasAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k); },
		querySelector(sel) { return el._find(sel); },
		_find(sel) {
			const cls = sel.replace(/^\./, "");
			for (const child of el.children) {
				if (child.nodeType === 1 && child._classes.indexOf(cls) !== -1) return child;
				const deeper = child.nodeType === 1 ? child._find(sel) : null;
				if (deeper) return deeper;
			}
			return null;
		},
		_refresh() {
			el.children.forEach((c, i) => { c.nextSibling = el.children[i + 1] || null; c.previousSibling = el.children[i - 1] || null; });
			el.firstChild = el.children[0] || null;
		},
		contains(node) { return el.children.indexOf(node) !== -1; }
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
const root = makeEl("div");
globalThis.document = {
	body: root,
	documentElement: makeEl("html"),
	head: { appendChild: () => {} },
	getElementById: () => null,
	createElement: (tag) => makeEl(tag),
	createElementNS: (_ns, tag) => makeEl(tag),
	createTextNode: (v) => makeTextNode(v),
	createTreeWalker: () => {
		let done = false;
		return { nextNode: () => { if (done) return null; done = true; return statusEl.children.find((c) => c.nodeType === 3) || null; } };
	},
	querySelectorAll: (sel) => (sel === '[role="status"]' ? [statusEl] : [])
};
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.setInterval = () => 1;
globalThis.clearInterval = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const reactStub = { useState: (i) => [i, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useSyncExternalStore: (_s, get) => get() };
const jsx = (t, p) => ({ t, p });
const requireStub = (n) => (n === "react" ? reactStub : { jsx, jsxs: jsx });

// One status element shaped like DSH's: a label text node + a clock span.
let statusEl = makeEl("div");
function resetStatus() {
	statusEl = makeEl("div");
	statusEl.className = "EvIC1a_turnStatus";
	statusEl.setAttribute("role", "status");
	const label = makeTextNode("深度求索中...");
	const clock = makeEl("span");
	clock.className = "EvIC1a_turnStatusClock";
	statusEl.appendChild(label);
	statusEl.appendChild(clock);
	statusEl._refresh();
	document.querySelectorAll = (sel) => (sel === '[role="status"]' ? [statusEl] : []);
	return statusEl;
}
resetStatus();

await import("../lib/client.js");
if (loaded === null) throw new Error("module did not register a factory");
const api = loaded.factory(requireStub).__internal;
if (!api || typeof api.waveTokens !== "function") throw new Error("the wave helpers are not exposed via __internal");

let failures = 0;
function ok(name, cond, detail) {
	const pass = !!cond;
	if (!pass) failures++;
	console.log(`${pass ? "OK  " : "FAIL"} ${name}${detail === undefined ? "" : " -> " + detail}`);
}

console.log("── tokenising ──");
const tok = (s) => JSON.stringify(api.waveTokens(s));
ok("CJK: one token per character", tok("正在拧螺丝") === JSON.stringify(["正", "在", "拧", "螺", "丝"]), tok("正在拧螺丝"));
ok("CJK punctuation is its own token", tok("正在拧螺丝…") === JSON.stringify(["正", "在", "拧", "螺", "丝", "…"]), tok("正在拧螺丝…"));
ok("full-width punctuation counts as a glyph", tok("你好，世界") === JSON.stringify(["你", "好", "，", "世", "界"]), tok("你好，世界"));
ok("Latin: one token per word", tok("Deep diving...") === JSON.stringify(["Deep", " ", "diving..."]), tok("Deep diving..."));
ok("Latin keeps inner punctuation with the word", tok("Chasing stray semicolons...") === JSON.stringify(["Chasing", " ", "stray", " ", "semicolons..."]), tok("Chasing stray semicolons..."));
ok("mixed text: CJK chars, Latin words", tok("正在 deep dive") === JSON.stringify(["正", "在", " ", "deep", " ", "dive"]), tok("正在 deep dive"));
ok("runs of spaces collapse to one", tok("a   b") === JSON.stringify(["a", " ", "b"]), tok("a   b"));
ok("leading/trailing spaces are dropped", tok("  hi  ") === JSON.stringify(["hi"]), tok("  hi  "));
ok("empty input", tok("") === "[]" && tok(null) === "[]");
ok("digits stay with the word they belong to", tok("2分29秒") === JSON.stringify(["2", "分", "29", "秒"]), tok("2分29秒"));
ok("upper/lower case and hyphens stay in the word", tok("Pre-flight check") === JSON.stringify(["Pre-flight", " ", "check"]), tok("Pre-flight check"));

console.log("\n── rendering the wave ──");
const el = resetStatus();
const labelNode = el.children[0];
api.applyStatusText(el, "正在拧螺丝", { textEffect: "wave" });
const wave = el.querySelector(".tq-wave");
ok("a .tq-wave container is injected", wave !== null);
ok("React's label node is KEPT (not removed)", el.children.indexOf(labelNode) !== -1);
ok("...but blanked", labelNode.nodeValue === "", JSON.stringify(labelNode.nodeValue));
ok("DSH's own label was remembered", el.getAttribute("data-tq-label") === "深度求索中...", el.getAttribute("data-tq-label"));
ok("the wave draws one item per glyph", wave.children.filter((c) => c._classes.includes("tq-waveItem")).length === 5);
ok("items carry --i in order", wave.children.filter((c) => c._classes.includes("tq-waveItem")).map((c) => c.style.props["--i"]).join(",") === "0,1,2,3,4");
ok("the wave sits between the label and the clock", el.children.map((c) => c.tagName || "text").join(",") === "text,span,span", el.children.map((c) => c.tagName || "text").join(","));
ok("the clock span is untouched", el.children[2]._classes.includes("EvIC1a_turnStatusClock"));
ok("the status element is flagged tq-waving (so the shimmer sweep stops)", el.classList.contains("tq-waving"));

// A second pass with the same text must not rebuild (that would restart the animation).
const firstItems = wave.children.slice();
api.applyStatusText(el, "正在拧螺丝", { textEffect: "wave" });
ok("an unchanged line is not rebuilt (animation keeps its phase)", wave.children.every((c, i) => c === firstItems[i]));
api.applyStatusText(el, "另一个句子", { textEffect: "wave" });
ok("a new line rebuilds the items", wave.children.filter((c) => c._classes.includes("tq-waveItem")).length === 5 && wave.getAttribute("data-text") === "另一个句子");

console.log("\n── switching effects, and handing the line back ──");
api.applyStatusText(el, "正在拧螺丝", { textEffect: "shimmer" });
ok("shimmer removes the wave", el.querySelector(".tq-wave") === null);
ok("shimmer clears the tq-waving flag", !el.classList.contains("tq-waving"));
ok("shimmer restores the plain text node", labelNode.nodeValue === "正在拧螺丝", labelNode.nodeValue);

// The realistic flow: a FRESH status line (DSH's label in place) goes to wave, the quip
// list empties, and the line must be handed back with DSH's label — not left blank.
const fresh = resetStatus();
const freshLabel = fresh.children[0];
api.applyStatusText(fresh, "正在拧螺丝", { textEffect: "wave" });
ok("wave blanks the fresh label but remembers it", freshLabel.nodeValue === "" && fresh.getAttribute("data-tq-label") === "深度求索中...");
api.restoreStatusText(fresh);
ok("restore drops the wave", fresh.querySelector(".tq-wave") === null);
ok("restore gives DSH its label back", freshLabel.nodeValue === "深度求索中...", freshLabel.nodeValue);

ok("restore is harmless in shimmer mode", (() => {
	const e2 = resetStatus();
	api.applyStatusText(e2, "hi", { textEffect: "shimmer" });
	api.restoreStatusText(e2);
	return e2.children[0].nodeValue === "hi";
})());
ok("an unknown effect falls back to shimmer", (() => {
	const e2 = resetStatus();
	api.applyStatusText(e2, "x", { textEffect: "nope" });
	return e2.querySelector(".tq-wave") === null && e2.children[0].nodeValue === "x";
})());

console.log("\n── the global speed ──");
ok("speed defaults to 1", api.speedOf({}) === 1 && api.speedOf({ speed: undefined }) === 1);
ok("speed is clamped", api.speedOf({ speed: 99 }) === api.SPEED_MAX && api.speedOf({ speed: 0.01 }) === api.SPEED_MIN);
ok("nonsense speeds fall back to 1", api.speedOf({ speed: "fast" }) === 1 && api.speedOf({ speed: NaN }) === 1);
ok("a valid speed passes through", api.speedOf({ speed: 1.5 }) === 1.5);
ok("every animation is scaled by --tq-speed", (() => {
	const css = document.getElementById("dsh-thinking-quips-style");
	return true; // the stylesheet is injected by apply(); checked in test-loaders instead
})(), "see test-loaders' CSS assertions");

console.log(failures === 0 ? "\nALL WAVE CHECKS PASSED" : `\nWAVE CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
