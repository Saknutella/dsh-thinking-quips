// Settings-row wiring test: which buttons the "Playful quips" row shows in which
// state. This is the check the shipped 0.4.0 build lacked — the row is never
// rendered by the other suites, so "the restore button shows in the wrong state"
// and "there is no way to stop following" both slipped through.
//
// It renders the real components with a tiny hook shim: `jsx`/`jsxs` are stubbed
// into plain `{t, p}` objects, so calling a component function and walking the
// returned tree exercises the shipped conditionals without React.

let loaded = null;
let factoryCount = 0;

globalThis.window = {
	__ModuleLoader__: { load: (x) => { loaded = x; } },
	__DSH_THINKING_QUIPS__: false
};
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
	getPropertyValue: (name) => ({ "--dsw-alias-link": "#4176e6", "--dsw-alias-bg-base": "#ffffff" })[name] || "",
	colorScheme: "light",
	backgroundColor: "rgb(255, 255, 255)"
});

// Hook shim: initial state is honoured, effects run once, refs are empty objects.
const reactStub = {
	useState: (init) => [init, () => {}],
	useEffect: () => {},
	useRef: () => ({ current: null }),
	useSyncExternalStore: (_sub, get) => get()
};
let jsx = (t, p) => ({ t, p });
const requireStub = (name) => {
	if (name === "react") return reactStub;
	if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
	throw new Error("unexpected require: " + name);
};

await import("../lib/client.js");
if (loaded === null) throw new Error("module did not register a factory");
const api = loaded.factory(requireStub).__internal;
if (!api || typeof api.QuipsSettingsRow !== "function") throw new Error("the settings row is not exposed via __internal");

let failures = 0;
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
/** Every element in the rendered row, in tree order. */
function nodes(cfg) {
	factoryCount++;
	globalThis.localStorage = {
		getItem: () => JSON.stringify(Object.assign({}, api.DEFAULTS, cfg)),
		setItem: () => {}
	};
	globalThis.window.__DSH_THINKING_QUIPS__ = false;
	const plugin = loaded.factory(requireStub);
	const row = plugin.__internal.QuipsSettingsRow({ t: (key) => key });
	return render(row);
}
/** All buttons in the row, in tree order, as {cls, text}. */
function buttons(cfg) {
	return nodes(cfg)
		.filter((node) => node.t === "button")
		.map((node) => {
			const props = node.p || {};
			return { cls: String(props.className || ""), text: typeof props.children === "string" ? props.children : "" };
		});
}
/** The labels of a <select>'s options, in tree order. */
function options(cfg, selectLabel) {
	const all = nodes(cfg);
	const select = all.filter((node) => node.t === "select" && (node.p || {})["aria-label"] === selectLabel)[0];
	if (select === undefined) return [];
	return render(select.p.children).map((node) => (typeof (node.p || {}).children === "string" ? node.p.children : ""));
}
const texts = (list) => list.map((b) => b.text).filter((t) => t !== "");
const has = (list, label) => texts(list).indexOf(label) !== -1;
const find = (list, label) => list.filter((b) => b.text === label)[0] || null;

console.log("── default state (no custom colour) ──");
let row = buttons({ color: api.SHIMMER, colorTheme: false });
ok("no restore button on the untouched shimmer", !has(row, "quips.default"), texts(row).join(", "));
ok("no stop-follow button", !has(row, "quips.stopFollow"));
ok("offers Match theme", has(row, "quips.matchTheme"));
ok("match button is not in the active state", find(row, "quips.matchTheme").cls.indexOf("tq-btnOn") === -1);
ok("head buttons intact", has(row, "quips.manage") && has(row, "quips.reset"));

console.log("\n── custom colour set by hand ──");
row = buttons({ color: "#ff00aa", colorTheme: false });
ok("restore button appears", has(row, "quips.default"), texts(row).join(", "));
ok("still offers Match theme", has(row, "quips.matchTheme"));
ok("no stop-follow button", !has(row, "quips.stopFollow"));

console.log("\n── custom colour, following the theme ──");
row = buttons({ color: "#3970e5", colorTheme: true });
ok("follow button is labelled", has(row, "quips.following"));
ok("follow button is in the active state", find(row, "quips.following").cls.indexOf("tq-btnOn") !== -1, find(row, "quips.following").cls);
ok("stop-follow button appears", has(row, "quips.stopFollow"), texts(row).join(", "));
ok("restore button still available", has(row, "quips.default"));
ok("Match theme label is replaced by Following", !has(row, "quips.matchTheme"));

console.log("\n── following, but the colour happens to be the sentinel ──");
row = buttons({ color: api.SHIMMER, colorTheme: true });
ok("shimmer wins: no restore button", !has(row, "quips.default"));
ok("stop-follow still offered", has(row, "quips.stopFollow"), texts(row).join(", "));

console.log("\n── the row always renders something ──");
row = buttons({});
ok("unknown config falls back to defaults", has(row, "quips.manage") && has(row, "quips.matchTheme"));

console.log("\n── the elapsed-time control ──");
row = buttons({ clockMode: "inline" });
for (const mode of api.CLOCK_MODES) {
	ok(`offers the "${mode}" clock mode`, find(row, "quips.clock." + mode) !== null, texts(row).join(", "));
}
ok("the configured mode is the active one", find(row, "quips.clock.inline").cls.indexOf("tq-segActive") !== -1);
row = buttons({ clockMode: "separate" });
ok("switching the mode moves the active state", find(row, "quips.clock.separate").cls.indexOf("tq-segActive") !== -1
	&& find(row, "quips.clock.inline").cls.indexOf("tq-segActive") === -1);
row = buttons({ clockMode: "nonsense" });
ok("an unknown mode falls back to inline", find(row, "quips.clock.inline").cls.indexOf("tq-segActive") !== -1);

console.log("\n── the text-effect control ──");
for (const effect of api.TEXT_EFFECTS) {
	const label = "quips.effect." + effect;
	ok(`offers the "${effect}" effect`, options({ textEffect: "glow" }, "quips.textEffect").indexOf(label) !== -1,
		options({ textEffect: "glow" }, "quips.textEffect").join(", "));
}
ok("shimmer and official are distinct labels", api.TEXT_EFFECTS.indexOf("shimmer") !== api.TEXT_EFFECTS.indexOf("official"));

console.log(failures === 0 ? `\nALL SETTINGS-UI CHECKS PASSED (${factoryCount} renders)` : `\nSETTINGS-UI CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
