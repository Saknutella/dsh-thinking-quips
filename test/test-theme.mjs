// Verification of the 0.4.0 "match theme colour" helpers in lib/client.js:
//   parseCssColor / rgbToHsl / hslToHex / relativeLuminance / contrastRatio
//   fitToTheme / themeBackground / themeScheme / themeColor / matchThemeColor
// The module is imported once; the pure helpers come from `plugin.__internal`,
// so these assertions run against the SHIPPED code, not a copy of it.

let loaded = null;
globalThis.window = {
	__ModuleLoader__: { load: (x) => { loaded = x; } },
	__DSH_THINKING_QUIPS__: false
};

// ── controllable fake theme environment ──────────────────────────────────────
let TOKENS = {};
let BG = "#ffffff";
let SCHEME = "";
let DARK_ATTR = false;

function makeBody() {
	return {
		hasAttribute: (name) => name === "data-ds-dark-theme" && DARK_ATTR === true,
		getAttribute: (name) => (name === "data-ds-dark-theme" && DARK_ATTR === true ? "" : null),
		style: { setProperty() {}, removeProperty() {} }
	};
}
globalThis.document = {
	body: makeBody(),
	documentElement: {},
	createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
	getElementById: () => null,
	querySelectorAll: () => [],
	createTreeWalker: () => ({ nextNode: () => null })
};
globalThis.getComputedStyle = () => ({
	getPropertyValue: (name) => (Object.prototype.hasOwnProperty.call(TOKENS, name) ? TOKENS[name] : ""),
	colorScheme: SCHEME,
	backgroundColor: BG
});

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
if (!api) throw new Error("plugin does not expose __internal (test seam missing)");

let failures = 0;
function eq(name, got, want) {
	const pass = got === want;
	if (!pass) failures++;
	console.log(`${pass ? "OK  " : "FAIL"} ${name}: ${JSON.stringify(got)}${pass ? "" : " (want " + JSON.stringify(want) + ")"}`);
}
function ok(name, cond, detail) {
	const pass = !!cond;
	if (!pass) failures++;
	console.log(`${pass ? "OK  " : "FAIL"} ${name}${detail === undefined ? "" : " -> " + detail}`);
}

/** Install a fake theme and return the extracted/fitted result. */
function theme(tokens, opts) {
	TOKENS = tokens || {};
	BG = (opts && opts.bg) || "#ffffff";
	SCHEME = (opts && opts.scheme) || "";
	DARK_ATTR = !!(opts && opts.dark);
	return { get: () => api.matchThemeColor(document.body) };
}
const hue = (hex) => api.rgbToHsl(hex).h;

console.log("── parseCssColor ──");
eq("#rrggbb", api.parseCssColor("#4176e6"), "#4176e6");
eq("#rrggbb upper + spaces", api.parseCssColor("  #4176E6  "), "#4176e6");
eq("#rgb", api.parseCssColor("#abc"), "#aabbcc");
eq("#rgba drops alpha", api.parseCssColor("#aabbccdd"), "#aabbcc");
eq("rgb()", api.parseCssColor("rgb(65, 118, 230)"), "#4176e6");
eq("rgba()", api.parseCssColor("rgba(65,118,230,0.5)"), "#4176e6");
eq("rgb() percent", api.parseCssColor("rgb(25.5%, 46.3%, 90.2%)"), "#4176e6");
eq("rgb() out of range clamps", api.parseCssColor("rgb(300, -20, 0)"), "#ff0000");
eq("var() unresolved", api.parseCssColor("var(--dsw-static-deepseek-500)"), null);
eq("gradient", api.parseCssColor("linear-gradient(90deg, #fff 0%, #000 100%)"), null);
eq("keyword", api.parseCssColor("transparent"), null);
eq("empty", api.parseCssColor(""), null);
eq("non-string", api.parseCssColor(undefined), null);

console.log("\n── rgbToHsl / hslToHex round-trip ──");
const acc = api.rgbToHsl("#4176e6");
ok("accent hue ≈ 222°", Math.abs(acc.h - 221.8) < 1.5, acc.h.toFixed(2));
ok("accent saturation ≈ 77%", Math.abs(acc.s - 76.7) < 1, acc.s.toFixed(2));
eq("hsl→hex round-trip", api.hslToHex(acc.h, acc.s, acc.l), "#4176e6");
ok("hue wraps negatives", Math.abs(api.rgbToHsl(api.hslToHex(-138, 76, 58)).h - 222) < 1.5);

console.log("\n── contrast maths ──");
ok("white/black = 21", Math.abs(api.contrastRatio("#ffffff", "#000000") - 21) < 0.01, api.contrastRatio("#ffffff", "#000000").toFixed(3));
ok("white/white = 1", Math.abs(api.contrastRatio("#ffffff", "#ffffff") - 1) < 1e-9);
ok("luminance(white) = 1", Math.abs(api.relativeLuminance("#ffffff") - 1) < 1e-9);
ok("luminance(black) = 0", Math.abs(api.relativeLuminance("#000000")) < 1e-9);
ok("contrast is symmetric", api.contrastRatio("#4176e6", "#fff") === api.contrastRatio("#fff", "#4176e6"));

console.log("\n── fitToTheme ──");
const MIN = api.MIN_CONTRAST;
const fits = [
	["light: brand accent", "#4176e6", "#ffffff"],
	["dark: brand accent", "#679efe", "#16181d"],
	["light: pale pastel", "#a5c8ff", "#ffffff"],
	["dark: near-black accent", "#101d3a", "#16181d"],
	["light: mid grey accent", "#808080", "#f9fafb"],
	["dark: near-white accent", "#f2f2f2", "#16181d"]
];
for (const [name, accent, bg] of fits) {
	const out = api.fitToTheme(accent, bg);
	const cr = api.contrastRatio(out, bg);
	const hs = api.rgbToHsl(accent);
	const ho = api.rgbToHsl(out);
	ok(`${name}: ${accent} → ${out}`, cr >= MIN - 0.02, `contrast ${cr.toFixed(2)}:1 (need ${MIN})`);
	if (hs.s >= 12) ok(`${name}: hue kept`, Math.abs(ho.h - hs.h) < 2.5, `${hs.h.toFixed(1)}° → ${ho.h.toFixed(1)}°`);
}
ok("achromatic accent stays achromatic", (() => {
	const out = api.fitToTheme("#808080", "#ffffff");
	const rgb = [out.slice(1, 3), out.slice(3, 5), out.slice(5, 7)];
	return rgb[0] === rgb[1] && rgb[1] === rgb[2];
})(), api.fitToTheme("#808080", "#ffffff"));
ok("bad bg falls back to white", api.contrastRatio(api.fitToTheme("#4176e6", "nope"), "#ffffff") >= MIN - 0.02);
// An unparsable accent falls through to the plugin's own brand blue, verbatim.
eq("unparsable accent → brand blue", api.fitToTheme("not-a-color", "#ffffff"), "#2E5BE8");
eq("brand blue is itself parseable", api.parseCssColor("#2E5BE8"), "#2e5be8");
// The band bounds are inclusive of 8-bit rounding, hence the small slack.
ok("fitted light colour stays inside the band", api.rgbToHsl(api.fitToTheme("#4176e6", "#ffffff")).l <= 57.5, api.rgbToHsl(api.fitToTheme("#4176e6", "#ffffff")).l.toFixed(2));
ok("fitted dark colour stays inside the band", api.rgbToHsl(api.fitToTheme("#679efe", "#16181d")).l >= 61, api.rgbToHsl(api.fitToTheme("#679efe", "#16181d")).l.toFixed(2));

console.log("\n── the matched colour clears AA even where the bare fit cannot (F1) ──");
// WHY these inputs: each pair is one where fitToTheme's lightness band stops short, so the
// bare fit returns a colour BELOW the ratio the settings page prints next to it. Before the
// fix those were handed straight to the status line, and the theme-follow observer wrote them
// into the saved config. Every number below is measured here, both halves in one place.
const shortfalls = [
	["light: teal accent", "#0e9c8e", "#ffffff"],
	["light: teal accent on the near-white bg", "#0e9c8e", "#f9fafb"],
	["mid grey: amber accent", "#c47a00", "#808080"],
	["mid grey: deep blue accent", "#2e5be8", "#808080"]
];
for (const [name, accent, bg] of shortfalls) {
	const bare = api.fitToTheme(accent, bg);
	const bareCr = api.contrastRatio(bare, bg);
	// The bug, pinned: the bare fit is exactly what the matcher used to return, and it misses AA.
	ok(`${name}: bare fit is short — ${bare} is ${bareCr.toFixed(2)}:1`, bareCr < MIN, `fitToTheme(${accent}, ${bg})`);
	const r = theme({ "--dsw-alias-link": accent }, { bg }).get();
	ok(`${name}: matchThemeColor returns ${r.color} — ${r.contrast.toFixed(2)}:1`, r.contrast >= MIN - 0.02,
		`raw ${r.raw} on ${r.bg} → ${r.color}`);
	// One promise, not two: the matcher is the preset path's floor applied to the fit.
	eq(`${name}: identical to readableOn(fitToTheme(...))`, r.color, api.readableOn(bare, bg));
}
// The fix belongs in the matcher, NOT in the fit: if someone "fixes" it by widening the band
// (or by making the fit lenient), this exact banded value changes and says so.
eq("fitToTheme itself is unchanged for teal on white (band not widened)", api.fitToTheme("#0e9c8e", "#ffffff"), "#0e978a");
// ...and it is a colour-only fix: the follow flag is decided by the caller's patch, never here,
// so "Match theme" still leaves `colorTheme: true` (asserted for the panel by test-settings-ui).
ok("the matcher report carries no follow flag the fix could flip",
	theme({ "--dsw-alias-link": "#0e9c8e" }, { bg: "#ffffff" }).get().colorTheme === undefined);

console.log("\n── dead-zone sweep: every matcher result clears AA ──");
// WHY this band: 0.18333 is the luminance where black and white are equally readable (4.58:1),
// and 0.4 is fitToTheme's own dark/light threshold. Between them the fit classifies the
// background as dark and LIGHTENS the accent — but lightening cannot reach AA there (pure white
// is only 3.95:1 at 0.18333) while darkening clears it. Verifier measured 100% failure
// (3456/3456) on #808080 before the fix. The grid below is the standing guard, and it walks
// every grey plus the real app backgrounds so the fix cannot trade one band for another.
{
	const backgrounds = [];
	for (let level = 0x00; level <= 0xff; level += 4) {
		backgrounds.push("#" + [level, level, level].map((n) => n.toString(16).padStart(2, "0")).join(""));
	}
	const dead = backgrounds.filter((bg) => api.relativeLuminance(bg) > 0.18333 && api.relativeLuminance(bg) < 0.4);
	backgrounds.push("#f9fafb", "#ffffff", "#16181d", "#0f1115");
	const accents = [];
	for (let hue = 0; hue < 360; hue += 10) accents.push(api.hslToHex(hue, 70, 50));
	let checked = 0;
	let worst = null;
	let deadChecked = 0;
	let deadWorst = null;
	for (const bg of backgrounds) {
		const inDead = dead.indexOf(bg) !== -1;
		for (const accent of accents) {
			const report = theme({ "--dsw-alias-link": accent }, { bg }).get();
			checked++;
			if (worst === null || report.contrast < worst.contrast) worst = { bg, accent, color: report.color, contrast: report.contrast };
			if (inDead) {
				deadChecked++;
				if (deadWorst === null || report.contrast < deadWorst.contrast) deadWorst = { bg, accent, color: report.color, contrast: report.contrast };
			}
		}
	}
	ok("the dead-zone subset is non-empty and really inside the band", dead.length >= 10, `${dead.length} backgrounds`);
	ok(`all ${checked} matcher results clear ${MIN}:1`, worst !== null && worst.contrast >= MIN - 0.02,
		worst === null ? "no samples" : `worst ${worst.contrast.toFixed(2)}:1 (${worst.accent} on ${worst.bg} → ${worst.color})`);
	ok(`dead zone alone: all ${deadChecked} clear ${MIN}:1`, deadWorst !== null && deadWorst.contrast >= MIN - 0.02,
		deadWorst === null ? "no samples" : `worst ${deadWorst.contrast.toFixed(2)}:1 (${deadWorst.accent} on ${deadWorst.bg} → ${deadWorst.color})`);
	console.log(`     sweep: ${backgrounds.length} backgrounds × ${accents.length} accents = ${checked} results`
		+ `, worst ${worst.contrast.toFixed(2)}:1; dead zone ${dead.length} × ${accents.length} = ${deadChecked}, worst ${deadWorst.contrast.toFixed(2)}:1`);
}

console.log("\n── token extraction + priority ──");
let r = theme({ "--dsw-alias-link": "#4176e6" }).get();
eq("raw = accent token", r.raw, "#4176e6");
eq("token name reported", r.token, "--dsw-alias-link");
eq("fallback flag off", r.fallback, false);
ok("contrast reported ≥ 4.5", r.contrast >= MIN - 0.02, r.contrast.toFixed(2));
eq("bg from --dsw-alias-bg-base", theme({ "--dsw-alias-link": "#4176e6", "--dsw-alias-bg-base": "#16181d" }).get().bg, "#16181d");

r = theme({
	"--dsw-alias-link": "linear-gradient(90deg, #fff, #000)",   // not a colour → skipped
	"--dsw-alias-state-business-primary": "#679efe"
}).get();
eq("gradient token skipped", r.token, "--dsw-alias-state-business-primary");
eq("second candidate used", r.raw, "#679efe");

r = theme({ "--dsw-static-deepseek-500": "#4176e6" }).get();
eq("static ramp is the last resort", r.token, "--dsw-static-deepseek-500");

r = theme({}).get();
eq("nothing resolvable → raw null", r.raw, null);
eq("nothing resolvable → fallback", r.fallback, true);
ok("fallback still yields a readable colour", r.contrast >= MIN - 0.02, r.contrast.toFixed(2));

console.log("\n── scheme detection ──");
eq("body attribute wins", theme({ "--dsw-alias-link": "#679efe" }, { dark: true, bg: "#ffffff" }).get().scheme, "dark");
eq("computed color-scheme", theme({ "--dsw-alias-link": "#679efe" }, { scheme: "dark", bg: "#ffffff" }).get().scheme, "dark");
eq("color-scheme: light", theme({}, { scheme: "light", bg: "#0f1115" }).get().scheme, "light");
eq("bg luminance fallback → dark", theme({}, { bg: "#0f1115" }).get().scheme, "dark");
eq("bg luminance fallback → light", theme({}, { bg: "#ffffff" }).get().scheme, "light");
eq("themeBackground from token", api.themeBackground(document.body), "#ffffff");

console.log("\n── dark theme end-to-end ──");
const dark = theme({ "--dsw-alias-link": "#679efe", "--dsw-alias-bg-base": "#16181d" }, { dark: true }).get();
eq("dark: extracted accent", dark.raw, "#679efe");
eq("dark: scheme", dark.scheme, "dark");
ok("dark: readable on the dark background", dark.contrast >= MIN - 0.02, `${dark.color} (${dark.contrast.toFixed(2)}:1)`);

console.log(failures === 0 ? "\nALL THEME CHECKS PASSED" : `\nTHEME CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
