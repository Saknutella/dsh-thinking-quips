// Dictionary guard: every key the UI asks for must exist in BOTH locales, and the
// two dictionaries must have exactly the same key set (no zh-only / en-only drift).
// Dynamic keys are derived from the source's own LOADER_STYLES / LOADER_SCALES, and
// the colour-preset chip labels from the REAL module's __internal COLOR_PRESETS, so
// adding a loader style or a preset only requires adding its label key.

import { readFileSync } from "node:fs";

// ── the shipped module, loaded for real ──────────────────────────────────────
// WHY import it instead of only regex-scanning the source: the preset chips are
// labelled with `t(preset.key)`, a DYNAMIC key the literal `t("...")` scan below
// cannot see. That scan used to list quips.preset.* as "not referenced by t()"
// notes and still exit 0 — deleting quips.preset.teal from BOTH dictionaries was
// invisible, while DSH's locale lookup is `dict[key] ?? key`, so the settings panel
// would show the raw string "quips.preset.teal" to the user. Enumerating
// COLOR_PRESETS off the shipped __internal keeps this list in lock-step with the
// implementation (no second copy of the four keys here to drift out of date).
let loaded = null;
globalThis.window = {
	__ModuleLoader__: { load: (x) => { loaded = x; } },
	__DSH_THINKING_QUIPS__: false
};
globalThis.document = {
	body: { style: { setProperty() {}, removeProperty() {} }, hasAttribute: () => false, getAttribute: () => null },
	documentElement: {},
	getElementById: () => null,
	createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
	querySelectorAll: () => [],
	createTreeWalker: () => ({ nextNode: () => null })
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "", colorScheme: "", backgroundColor: "" });

const reactStub = { useState: () => [0, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useSyncExternalStore: (_s, get) => get() };
const jsxStub = (t, p) => ({ t, p });
const requireStub = (name) => {
	if (name === "react") return reactStub;
	if (name === "react/jsx-runtime") return { jsx: jsxStub, jsxs: jsxStub };
	throw new Error("unexpected require: " + name);
};

await import("../lib/client.js");
if (loaded === null) throw new Error("module did not register a factory");
const api = loaded.factory(requireStub).__internal;
if (!api) throw new Error("plugin does not expose __internal (test seam missing)");
if (!Array.isArray(api.COLOR_PRESETS)) throw new Error("COLOR_PRESETS is not exposed via __internal");

const src = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

function dictOf(name) {
	const marker = `const ${name} = {`;
	const start = src.indexOf(marker);
	if (start === -1) throw new Error(`dictionary ${name} not found in lib/client.js`);
	const end = src.indexOf("\n\t\t};", start);
	if (end === -1) throw new Error(`dictionary ${name} has no terminator`);
	const body = src.slice(start, end);
	const keys = new Set();
	for (const m of body.matchAll(/"([^"]+)":/g)) keys.add(m[1]);
	return keys;
}
function listOf(name) {
	const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
	if (!m) throw new Error(`${name} not found`);
	return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}
function keysOf(name) {
	const m = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(src);
	if (!m) throw new Error(`${name} not found`);
	return [...m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((x) => x[1]);
}

const zh = dictOf("zh");
const en = dictOf("en");

const used = new Set();
for (const m of src.matchAll(/\bt\("([^"]+)"/g)) {
	if (m[1].endsWith(".")) continue; // dynamic prefix, enumerated below
	used.add(m[1]);
}
for (const style of listOf("LOADER_STYLES")) used.add(`quips.loader.${style}`);
for (const size of keysOf("LOADER_SCALES")) used.add(`quips.size.${size}`);
for (const effect of listOf("TEXT_EFFECTS")) used.add(`quips.effect.${effect}`);
for (const speed of listOf("SPEED_ORDER")) used.add(`quips.speed.${speed}`);
for (const scheme of ["light", "dark"]) used.add(`quips.scheme.${scheme}`);
// Colour-preset chip labels are dynamic (`t(preset.key)`), so they are enumerated
// off the shipped COLOR_PRESETS rather than a hand-maintained list of four strings.
// A missing label is shown to the user verbatim (DSH: `dict[key] ?? key`), so these
// keys belong in `used`: the parity loop below then FAILS on them instead of merely
// printing them as informational notes, which is exactly how the teal label could
// be deleted from both dictionaries and still leave this file green.
for (const preset of api.COLOR_PRESETS) {
	if (!preset || typeof preset.key !== "string" || preset.key === "") {
		throw new Error(`COLOR_PRESETS entry without a display-name key: ${JSON.stringify(preset)}`);
	}
	used.add(preset.key);
}

let bad = 0;
const report = (line) => { console.log(line); bad++; };
for (const key of used) {
	if (!zh.has(key)) report(`MISSING zh: ${key}`);
	if (!en.has(key)) report(`MISSING en: ${key}`);
}
for (const key of zh) if (!en.has(key)) report(`zh-only key (add to en): ${key}`);
for (const key of en) if (!zh.has(key)) report(`en-only key (add to zh): ${key}`);
const unused = [...zh].filter((k) => !used.has(k) && k !== "quips.modalTitle" && k !== "quips.timeUnit");
for (const key of unused) console.log(`note: dictionary key not referenced by t(): ${key}`);

console.log(`used=${used.size} zh=${zh.size} en=${en.size}`);
console.log(bad === 0 ? "I18N PARITY OK" : `I18N FAILURES: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
