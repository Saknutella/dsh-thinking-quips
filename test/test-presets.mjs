// Colour presets (ROADMAP 0.4.0) — verified against the SHIPPED lib/client.js.
//
// WHY THIS FILE IMPORTS THE MODULE INSTEAD OF LISTING THE FOUR COLOURS HERE: a check that
// carries its own copy of the preset table only proves the copy agrees with itself. Mutating
// the shipped table (say, teal becoming an unreadable yellow) would leave such a check green.
// So every step below runs through the real module:
//
//   __internal.COLOR_PRESETS     the shipped table, enumerated (never re-declared)
//   __internal.presetColor       the shipped colour for an id + background
//   __internal.contrastRatio     the shipped WCAG maths
//   __internal.QuipsSettingsPanel + the button's own onClick
//                                the shipped click handler, so breaking the wiring between
//                                a chip and patchConfig turns this red
//   __internal.store / loadConfig
//                                the shipped reactive store, so "it landed in the store" is
//                                asserted separately from "it landed in localStorage"
//
// The stubs are the same minimal shape test-theme.mjs / test-settings-ui.mjs use: a factory
// loader, a react shim, a controllable theme, and a localStorage that records writes.

let loaded = null;
globalThis.window = {
	__ModuleLoader__: { load: (x) => { loaded = x; } },
	__DSH_THINKING_QUIPS__: false
};

// ── controllable theme + storage ─────────────────────────────────────────────
let TOKENS = {};
let BG = "#ffffff";
const bodyEl = {
	hasAttribute: () => false,
	getAttribute: () => null,
	style: { setProperty() {}, removeProperty() {} }
};
globalThis.document = {
	body: bodyEl,
	documentElement: {},
	createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
	getElementById: () => null,
	querySelectorAll: () => [],
	createTreeWalker: () => ({ nextNode: () => null })
};
globalThis.getComputedStyle = () => ({
	getPropertyValue: (name) => (Object.prototype.hasOwnProperty.call(TOKENS, name) ? TOKENS[name] : ""),
	colorScheme: "",
	backgroundColor: BG
});
/** Point the fake theme at one background (token first, computed colour second). */
function setTheme(bg) {
	BG = bg;
	TOKENS = { "--dsw-alias-bg-base": bg };
}

let storage = new Map();
let writes = 0;
globalThis.localStorage = {
	getItem: (key) => (storage.has(key) ? storage.get(key) : null),
	setItem: (key, value) => { storage.set(key, value); writes++; },
	removeItem: (key) => { storage.delete(key); }
};

const reactStub = {
	useState: (init) => [init, () => {}],
	useEffect: () => {},
	useRef: () => ({ current: null }),
	useSyncExternalStore: (_sub, get) => get()
};
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
if (!Array.isArray(api.COLOR_PRESETS)) throw new Error("__internal does not expose COLOR_PRESETS");
if (typeof api.presetPatch !== "function") throw new Error("__internal does not expose presetPatch");
if (typeof api.QuipsSettingsPanel !== "function") throw new Error("__internal does not expose QuipsSettingsPanel");
if (typeof api.store !== "function") throw new Error("__internal does not expose store");

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

/** Expand a rendered tree: call function components, recurse into children. */
function render(node, out = []) {
	if (node === null || node === undefined || node === false || node === true) return out;
	if (Array.isArray(node)) { for (const n of node) render(n, out); return out; }
	if (typeof node !== "object") return out;
	if (typeof node.t === "function") return render(node.t(node.p), out);
	out.push(node);
	if (node.p) render(node.p.children, out);
	return out;
}

/**
 * Plant a config into the fake storage, then build a FRESH plugin instance.
 *
 * A fresh factory call is what gives a fresh store (both `_store` and `_runtime` are locals
 * of the factory), which is what makes the round-trip assertion below meaningful: the second
 * instance reads nothing but what the first one wrote.
 */
function pluginWith(cfg) {
	storage = new Map();
	writes = 0;
	if (cfg !== null) storage.set(api.STORAGE_KEY, JSON.stringify(Object.assign({}, api.DEFAULTS, cfg || {})));
	globalThis.window.__DSH_THINKING_QUIPS__ = false;
	return loaded.factory(requireStub);
}
/** Render the real settings page and return { nodes, keys } (keys = every t() key asked for). */
function panelOf(plugin) {
	const keys = [];
	const t = (key) => { keys.push(key); return key; };
	return { nodes: render(plugin.__internal.QuipsSettingsPanel({ t })), keys };
}
/** The preset chips, found by the marker the shipped markup puts on them. */
const chipsOf = (nodes) => nodes.filter((n) => n.t === "button" && n.p && n.p["data-tq-preset"] !== undefined);
const chipFor = (nodes, id) => chipsOf(nodes).filter((n) => n.p["data-tq-preset"] === id)[0] || null;
/** Press a chip exactly the way a browser does: through the shipped onClick, with a target. */
const press = (chip) => chip.p.onClick({ currentTarget: globalThis.document.body });
const readStored = () => JSON.parse(storage.get(api.STORAGE_KEY));

// ── the table itself ─────────────────────────────────────────────────────────
console.log("── the shipped preset table ──");
const presets = api.COLOR_PRESETS;
const ids = presets.map((p) => p.id);
eq("the four presets, in order", ids.join(","), "blue,violet,teal,amber");
ok("ids are unique", new Set(ids).size === ids.length, `${ids.length} ids`);
ok("every preset carries a parseable base colour",
	presets.every((p) => api.parseCssColor(p.base) !== null),
	presets.map((p) => `${p.id}=${p.base}`).join(" "));
ok("every preset carries its own label key (id and key cannot drift)",
	presets.every((p) => typeof p.key === "string" && p.key === "quips.preset." + p.id),
	presets.map((p) => `${p.id}→${p.key}`).join(" "));
eq("the brand-blue preset IS the shipped brand blue", presets.filter((p) => p.id === "blue")[0].base, api.DEFAULT_BLUE);
ok("unknown ids are rejected, not thrown",
	api.colorPreset("nope") === null && api.presetColor("nope", "#ffffff") === null
	&& api.presetPatch("nope", "#ffffff") === null && api.presetActive("nope", "#ffffff", "#ffffff") === false,
	"colorPreset/presetColor/presetPatch/presetActive all degrade on an unknown id");

// ── contrast, measured on light AND dark backgrounds ─────────────────────────
console.log("\n── measured preset contrast (every value below is computed, not quoted) ──");
const BACKGROUNDS = [
	["light white", "#ffffff"],
	["light DSH neutral-bluish-50", "#f9fafb"],
	["dark DSH bg-base", "#16181d"],
	["dark near-black", "#0f1115"],
	// A mid-tone background is neither light nor dark, and that is exactly where the fit's
	// band picks the wrong direction; it is what an unstyled or third-party theme can give.
	["mid grey", "#808080"]
];
const measured = {};
for (const [label, bg] of BACKGROUNDS) {
	for (const preset of presets) {
		const color = api.presetColor(preset.id, bg);
		const cr = api.contrastRatio(color, bg);
		(measured[preset.id] = measured[preset.id] || {})[label] = `${color} ${cr.toFixed(2)}:1`;
		ok(`${label} / ${preset.id}: ${color}`, cr >= api.MIN_CONTRAST - 0.02, `contrast ${cr.toFixed(2)}:1 (need ${api.MIN_CONTRAST})`);
		const hs = api.rgbToHsl(preset.base);
		const ho = api.rgbToHsl(color);
		ok(`${label} / ${preset.id}: hue kept`, Math.abs(ho.h - hs.h) < 3, `${hs.h.toFixed(1)}° → ${ho.h.toFixed(1)}°`);
	}
}
for (const preset of presets) console.log(`     ${preset.id}: ` + Object.entries(measured[preset.id]).map(([k, v]) => `${k} → ${v}`).join(" | "));

// WHY the extra floor exists at all, pinned with measurements rather than asserted as taste.
// If either premise ever stops being true these fail loudly: either the fit got better (then
// readableOn is redundant and should be deleted) or a preset is being shipped unreadable.
{
	// Premise 1, the common case: on a light app the fit's band stops just short for teal.
	const teal = presets.filter((p) => p.id === "teal")[0];
	const fitLight = api.fitToTheme(teal.base, "#ffffff");
	const fitLightCr = api.contrastRatio(fitLight, "#ffffff");
	ok("fitToTheme alone still falls short for teal on white (why readableOn exists)",
		fitLightCr < api.MIN_CONTRAST, `fitToTheme(${teal.base}, #ffffff) = ${fitLight} (${fitLightCr.toFixed(2)}:1)`);
	const flooredLight = api.presetColor("teal", "#ffffff");
	ok("the floor closes the gap on white without losing the hue",
		api.contrastRatio(flooredLight, "#ffffff") >= api.MIN_CONTRAST
		&& Math.abs(api.rgbToHsl(flooredLight).h - api.rgbToHsl(teal.base).h) < 3,
		`presetColor(teal, #ffffff) = ${flooredLight} (${api.contrastRatio(flooredLight, "#ffffff").toFixed(2)}:1)`);

	// Premise 2, the direction case: a mid-tone background fits into the dark-app band, which
	// is the wrong way to move, so the floor has to try the other direction to save the hue.
	const amber = presets.filter((p) => p.id === "amber")[0];
	const fitGrey = api.fitToTheme(amber.base, "#808080");
	const fitGreyCr = api.contrastRatio(fitGrey, "#808080");
	ok("fitToTheme alone picks the wrong direction for amber on #808080",
		fitGreyCr < api.MIN_CONTRAST, `fitToTheme(${amber.base}, #808080) = ${fitGrey} (${fitGreyCr.toFixed(2)}:1)`);
	const flooredGrey = api.presetColor("amber", "#808080");
	ok("readableOn tries the other direction and keeps the hue",
		api.contrastRatio(flooredGrey, "#808080") >= api.MIN_CONTRAST
		&& Math.abs(api.rgbToHsl(flooredGrey).h - api.rgbToHsl(amber.base).h) < 3,
		`presetColor(amber, #808080) = ${flooredGrey} (${api.contrastRatio(flooredGrey, "#808080").toFixed(2)}:1)`);
}

// ── the patch each preset applies, before any UI is involved ─────────────────
// The click handler below is `patchConfig(presetPatch(...))`; asserting the return value here
// pins the two fields the click must write (colour AND follow-off) independently of the UI,
// so a mutation in either place is caught rather than masked by the other.
console.log("\n── the patch each preset applies (return value) ──");
for (const preset of presets) {
	for (const bg of ["#ffffff", "#16181d"]) {
		const patch = api.presetPatch(preset.id, bg);
		ok(`${preset.id} @ ${bg}: the patch turns the follow off`,
			patch !== null && patch.colorTheme === false, JSON.stringify(patch));
		if (preset.id === "blue") {
			eq(`blue @ ${bg}: writes the shimmer sentinel`, patch.color, api.SHIMMER);
		} else {
			eq(`${preset.id} @ ${bg}: writes the fitted hex`, patch.color, api.presetColor(preset.id, bg));
		}
	}
}

// ── one click, through the shipped handler ───────────────────────────────────
console.log("\n── one click per preset writes config + store ──");
for (const preset of presets) {
	setTheme("#ffffff");
	const plugin = pluginWith({ color: api.SHIMMER, colorTheme: false });
	const { nodes, keys } = panelOf(plugin);
	const chip = chipFor(nodes, preset.id);
	ok(`${preset.id}: the page renders a chip for it`, chip !== null);
	ok(`${preset.id}: the chip asks the dictionary for its label`, keys.indexOf(preset.key) !== -1,
		keys.filter((k) => k.indexOf("quips.preset.") === 0).join(", "));
	ok(`${preset.id}: the chip carries a painted preview`, chip !== null && typeof (chip.p.children[0].p.style || {}).backgroundColor === "string",
		chip === null ? "no chip" : JSON.stringify(chip.p.children[0].p.style));
	press(chip);
	const want = preset.id === "blue" ? api.SHIMMER : api.presetColor(preset.id, "#ffffff");
	const stored = plugin.__internal.store().get();
	eq(`${preset.id}: store color`, stored.color, want);
	eq(`${preset.id}: store colorTheme (follow OFF)`, stored.colorTheme, false);
	eq(`${preset.id}: localStorage color`, readStored().color, want);
	eq(`${preset.id}: localStorage colorTheme (follow OFF)`, readStored().colorTheme, false);
	ok(`${preset.id}: storage was written`, writes > 0, `${writes} write(s)`);
}

// ── the selected chip is visible, and pins the sentinel semantics ─────────────
console.log("\n── current selection is visible ──");
{
	setTheme("#ffffff");
	const plugin = pluginWith({ color: api.SHIMMER, colorTheme: false });
	const nodes = panelOf(plugin).nodes;
	const pressed = chipsOf(nodes).filter((n) => n.p["aria-pressed"] === true).map((n) => n.p["data-tq-preset"]);
	eq("the untouched default selects the brand-blue chip", pressed.join(","), "blue");
	ok("the selected chip carries the active class",
		chipFor(nodes, "blue").p.className.indexOf("tq-presetOn") !== -1, chipFor(nodes, "blue").p.className);
	ok("unselected chips do not", chipFor(nodes, "teal").p.className.indexOf("tq-presetOn") === -1);
}
{
	// Press violet, then re-render with the SAME instance: the store is what the page reads,
	// so this is the "click → UI shows it" path with no test-side state in between.
	setTheme("#ffffff");
	const plugin = pluginWith({ color: api.SHIMMER, colorTheme: false });
	press(chipFor(panelOf(plugin).nodes, "violet"));
	const after = panelOf(plugin).nodes;
	const pressed = chipsOf(after).filter((n) => n.p["aria-pressed"] === true).map((n) => n.p["data-tq-preset"]);
	eq("after clicking violet only violet reads as selected", pressed.join(","), "violet");
	ok("and it is the active class, not just the attribute", chipFor(after, "violet").p.className.indexOf("tq-presetOn") !== -1);
}
{
	// A colour saved under the dark theme must still light up its chip when the app is dark,
	// even though its hex is the dark-theme fit — that is what "not following the theme" means.
	setTheme("#16181d");
	const darkTeal = api.presetColor("teal", "#16181d");
	const plugin = pluginWith({ color: darkTeal, colorTheme: false });
	const pressed = chipsOf(panelOf(plugin).nodes).filter((n) => n.p["aria-pressed"] === true).map((n) => n.p["data-tq-preset"]);
	eq(`a dark-theme teal (${darkTeal}) selects the teal chip`, pressed.join(","), "teal");
}

// ── a preset is an explicit colour choice: it stops the follow ────────────────
console.log("\n── picking a preset turns the Match-theme follow off ──");
for (const preset of presets) {
	setTheme("#16181d");
	// Following, with a colour that is NOT this preset: the click must replace both fields.
	const plugin = pluginWith({ color: "#3970e5", colorTheme: true });
	press(chipFor(panelOf(plugin).nodes, preset.id));
	const stored = plugin.__internal.store().get();
	eq(`${preset.id}: follow is off`, stored.colorTheme, false);
	eq(`${preset.id}: colour replaced`, stored.color, preset.id === "blue" ? api.SHIMMER : api.presetColor(preset.id, "#16181d"));
	ok(`${preset.id}: the follow state is gone from the page too`,
		panelOf(plugin).keys.indexOf("quips.following") === -1,
		"no follow label left");
}

// ── round trip through storage ───────────────────────────────────────────────
console.log("\n── localStorage round trip ──");
{
	setTheme("#16181d");
	const first = pluginWith({ color: api.SHIMMER, colorTheme: false });
	press(chipFor(panelOf(first).nodes, "amber"));
	const saved = readStored();
	// A brand-new module instance, reading the SAME storage: only what the click persisted
	// (plus the shipped defaults) can be visible to it.
	const fresh = loaded.factory(requireStub);
	const reloaded = fresh.__internal.loadConfig();
	eq("reloaded colour", reloaded.color, saved.color);
	eq("reloaded follow flag", reloaded.colorTheme, false);
	eq("reloaded colour is the dark-theme amber fit", saved.color, api.presetColor("amber", "#16181d"));
	const pressed = chipsOf(panelOf(fresh).nodes).filter((n) => n.p["aria-pressed"] === true).map((n) => n.p["data-tq-preset"]);
	eq("the reloaded config selects the same chip", pressed.join(","), "amber");
	ok("the two instances are different objects (the reload really was fresh)", first !== fresh);
}

console.log(failures === 0 ? "\nALL PRESET CHECKS PASSED" : `\nPRESET CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
