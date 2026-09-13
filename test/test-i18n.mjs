// Dictionary guard: every key the UI asks for must exist in BOTH locales, and the
// two dictionaries must have exactly the same key set (no zh-only / en-only drift).
// Dynamic keys are derived from the source's own LOADER_STYLES / LOADER_SCALES, so
// adding a loader style only requires adding its label here-compatible key.

import { readFileSync } from "node:fs";

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
for (const scheme of ["light", "dark"]) used.add(`quips.scheme.${scheme}`);

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
