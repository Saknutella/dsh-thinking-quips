// Throwaway smoke test for dsh-thinking-quips/lib/client.js (expanded version).
// Stubs window/document/NodeFilter/localStorage/react and a fake running-status
// element, then verifies:
//   - the factory returns { apply, inject: ["slots","locale"] }
//   - apply() runs without throwing and seeds a custom-color override
//   - the rotator swaps the status text and advances with the clock
//   - cleanup clears the interval

let loaded = null;
let intervalFn = null;
const clearCalls = [];

let clock = 1000000;
const realNow = Date.now;
Date.now = () => clock;

// Running-status element with a leading text node it owns.
const textNode = { parentNode: null, nodeValue: "Deep diving..." };
const fakeEl = {
	className: "Md3f7G_turnStatus",
	get textContent() { return String(textNode.nodeValue); }
};
textNode.parentNode = fakeEl;

// Fake DOM that tracks created style tags by id.
const stylesById = {};
function makeStyleEl() { return { id: "", textContent: "", dataset: {} }; }

globalThis.window = {
	__ModuleLoader__: { load: (x) => { loaded = x; } },
	__DSH_THINKING_QUIPS__: false
};
globalThis.document = {
	body: {},
	head: { appendChild: (el) => { if (el && el.id) stylesById[el.id] = el; } },
	getElementById: (id) => stylesById[id] || null,
	createElement: (tag) => makeStyleEl(),
	createTreeWalker: () => { let called = false; return { nextNode: () => (called ? null : (called = true, textNode)) }; },
	querySelectorAll: (sel) => sel === '[role="status"]' ? [fakeEl] : []
};
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.setInterval = (fn) => { intervalFn = fn; return 123; };
globalThis.clearInterval = (id) => { clearCalls.push(id); };

// Seed a custom color so we can verify the color override is applied.
globalThis.localStorage = { getItem: () => JSON.stringify({ color: "#ff0000", mode: "en", quips: [] }), setItem: () => {} };

// Minimal react / jsx-runtime stubs (components are defined but not mounted here).
globalThis.__reactStub = { useState: () => [0, () => {}], useEffect: () => {}, useSyncExternalStore: (_sub, get) => get() };
const jsxStub = (t, p) => ({ t, p });
const jsxsStub = (t, p) => ({ t, p });

const requireStub = (name) => {
	if (name === "react") return globalThis.__reactStub;
	if (name === "react/jsx-runtime") return { jsx: jsxStub, jsxs: jsxsStub };
	throw new Error("unexpected require: " + name);
};

await import("../lib/client.js");

if (loaded === null) throw new Error("module did not register a factory");
if (loaded.id !== "dsh-thinking-quips") throw new Error("wrong id: " + loaded.id);

const plugin = loaded.factory(requireStub);
if (typeof plugin?.apply !== "function") throw new Error("plugin missing apply");
if (!Array.isArray(plugin.inject) || plugin.inject.join(",") !== "slots,locale") throw new Error("wrong inject: " + plugin.inject);
console.log("OK: factory returns plugin {apply, inject:", JSON.stringify(plugin.inject), "}");

// ctx stub
const cleanups = [];
const ctx = {
	on: () => {},
	locale: { register: () => ({}), getLocale: () => ({ active: "en" }) },
	slots: { inject: (_name, cb) => { const d = cb(); return () => {}; }, register: (_opts, _comp) => () => {} },
	effect: (fn) => { const c = fn(); if (typeof c === "function") cleanups.push(c); return c; }
};

plugin.apply(ctx);
if (window.__DSH_THINKING_QUIPS__ !== true) throw new Error("apply did not set the once-guard");
if (intervalFn === null) throw new Error("apply did not schedule a poll");

// Custom color override should have created the color style element.
const colorStyle = document.getElementById("dsh-thinking-quips-color");
if (!colorStyle) throw new Error("color override style was not created for a custom color");
if (colorStyle.textContent.indexOf("ff0000") === -1) throw new Error("color override did not reference #ff0000: " + colorStyle.textContent);
console.log("OK: custom color override applied ->", colorStyle.textContent.slice(0, 60));

// Rotation: initial pass wrote phrases[0] ("Deep diving..."), advance the clock.
const first = textNode.nodeValue;
clock += 8000 + 50;
intervalFn();
const second = textNode.nodeValue;
console.log("phrase@0:", JSON.stringify(first), "phrase@1:", JSON.stringify(second));
if (second === first) throw new Error("status text did not rotate after one interval");

// Cleanup clears the interval.
for (const c of cleanups) c();
if (clearCalls.length < 1) throw new Error("cleanup did not clear the interval");
console.log("OK: cleanup cleared the interval");

Date.now = realNow;
console.log("ALL SMOKE CHECKS PASSED");
