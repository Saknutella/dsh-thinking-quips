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
// The official-control path is a second configuration: the shell seeds the primitives on
// 0.2, and an older shell seeds nothing. `official` decides which one a render sees, so
// both the fallback and the official markup get asserted (see the last two sections).
let official = null;
const writes = [];
/** The plugin instance of the most recent render, for the modal cases below. */
let lastPlugin = null;
function officialStub() {
	// The stubs RETURN a marker tree so the walker can inspect the props the plugin
	// passed to DSH's components without React being present.
	return {
		Switch: (props) => ({ t: "Switch", p: props }),
		SegmentedControl: (props) => ({ t: "SegmentedControl", p: props }),
		Modal: (props) => ({ t: "Modal", p: props }),
		TextShimmer: function TextShimmer() {}
	};
}
const requireStub = (name) => {
	if (name === "react") return reactStub;
	if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
	if (name === "@deepseek-ai/dsh-client-ui-primitives") {
		if (official === null) throw new Error("this shell seeds no primitives");
		return official;
	}
	throw new Error("unexpected require: " + name);
};

await import("../lib/client.js");
if (loaded === null) throw new Error("module did not register a factory");
const api = loaded.factory(requireStub).__internal;
if (!api || typeof api.QuipsSettingsPanel !== "function") throw new Error("the settings panel is not exposed via __internal");

let failures = 0;
function ok(name, cond, detail) {
	const pass = !!cond;
	if (!pass) failures++;
	console.log(`${pass ? "OK  " : "FAIL"} ${name}${detail === undefined ? "" : " -> " + detail}`);
}

// It is a settings PAGE now, not a row under General: `settings.section` renders its component
// into the panel's content column, so the root must be the page container.
{
	const page = api.QuipsSettingsPanel({ t: (key) => key });
	// This suite's JSX stub keeps props on `.p` (see `render`); accept the real shape too.
	const props = page && (page.p || page.props);
	if (!props || props.className !== "tq-page") {
		throw new Error(`the panel root is not the page container: ${props && props.className}`);
	}
	console.log("OK   the settings panel renders as a page (settings.section)");
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
function nodes(cfg, opts) {
	factoryCount++;
	official = opts && opts.official === true ? officialStub() : null;
	globalThis.localStorage = {
		getItem: () => JSON.stringify(Object.assign({}, api.DEFAULTS, cfg)),
		setItem: (key, value) => { writes.push([key, value]); }
	};
	globalThis.window.__DSH_THINKING_QUIPS__ = false;
	const plugin = loaded.factory(requireStub);
	lastPlugin = plugin;
	const row = plugin.__internal.QuipsSettingsPanel({ t: (key) => key });
	return render(row);
}
/** All buttons in the row, in tree order, as {cls, text}. */
function buttons(cfg, opts) {
	return nodes(cfg, opts)
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

console.log("\n── the sweep-brightness control ──");
{
	// The control was retired with the `glow` effect and asked back by the user, so it has to be
	// ON THE PAGE (behaviour is asserted in test-adapt-02, which checks the token it writes).
	const all = nodes({ glow: 50, color: "#204080" });
	const inputs = all.filter((node) => node.t === "input" && String(node.p.className || "").indexOf("tq-timeInput") !== -1);
	ok("the page offers the sweep brightness", inputs.length === 2, String(inputs.length));
	ok("seeded with the configured percentage", inputs.some((node) => node.p.value === 50), JSON.stringify(inputs.map((node) => node.p.value)));
	ok("and labelled from the dictionary", JSON.stringify(all).indexOf("quips.glow") !== -1);
}

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
	ok(`offers the "${effect}" effect`, options({ textEffect: "shimmer" }, "quips.textEffect").indexOf(label) !== -1,
		options({ textEffect: "shimmer" }, "quips.textEffect").join(", "));
}
// `glow` and `official` were retired as separate choices: both were the official sweep (the
// hand-painted copy was indistinguishable), so a saved value must fall back to it.
ok("a saved legacy effect still selects the sweep",
	options({ textEffect: "glow" }, "quips.textEffect").join(",") === "quips.effect.shimmer,quips.effect.wave",
	options({ textEffect: "glow" }, "quips.textEffect").join(","));
ok("the dropdown offers exactly two effects", options({}, "quips.textEffect").length === 2,
	options({}, "quips.textEffect").join(","));

console.log("\n── the row on a shell that seeds the official controls ──");
{
	writes.length = 0;
	const all = nodes({}, { official: true });
	const switches = all.filter((node) => node.t === "Switch");
	ok("the official Switch replaces the hand-written one", switches.length === 1, String(switches.length));
	ok("it gets a boolean checked + the required label",
		switches[0].p.checked === false && switches[0].p.label === "quips.indicatorOnly",
		JSON.stringify({ checked: switches[0].p.checked, label: switches[0].p.label }));
	ok("no hand-written switch is left behind", all.filter((node) => (node.p || {}).className === "tq-switch").length === 0);
	switches[0].p.onChange(true);
	ok("its onChange writes the boolean straight to the config",
		writes.length > 0 && JSON.parse(writes[writes.length - 1][1]).indicatorOnly === true,
		writes.length > 0 ? writes[writes.length - 1][1] : "no write");

	const segments = all.filter((node) => node.t === "SegmentedControl");
	ok("all three segmented controls use the official component", segments.length === 3, String(segments.length));
	const ids = segments.map((node) => node.p.id);
	ok("each gets its own stable id", ids.join(",") === "tq-speed,tq-clock,tq-lang", ids.join(","));
	ok("each carries a label for its tablist", segments.every((node) => typeof node.p.label === "string" && node.p.label !== ""));
	ok("options are {value,label} pairs",
		segments.every((node) => node.p.options.every((o) => typeof o.value === "string" && typeof o.label === "string")));
	ok("no hand-written segmented control is left behind", all.filter((node) => (node.p || {}).className === "tq-seg").length === 0);
	const clock = segments.filter((node) => node.p.id === "tq-clock")[0];
	ok("the clock segment carries the configured value", clock.p.value === "inline", clock.p.value);
	ok("its options are the whole mode list",
		clock.p.options.map((o) => o.value).join(",") === api.CLOCK_MODES.join(","));
	clock.p.onChange("separate");
	ok("choosing a segment writes the config", JSON.parse(writes[writes.length - 1][1]).clockMode === "separate");
	const lang = segments.filter((node) => node.p.id === "tq-lang")[0];
	ok("the language segment carries the configured value", lang.p.value === "ui", lang.p.value);
	ok("the surface note survives the official controls",
		all.some((node) => node.p && node.p["data-tq-surface"] !== undefined));
}

console.log("\n── the native-only note ──");
{
	// The official whale's frame rate lives inside the APNG, so the speed level can only add
	// the plugin's swim cue — said out loud, but only where it applies.
	const noteIn = (cfg) => nodes(cfg).filter((node) => (node.p || {}).className === "tq-hint"
		&& (node.p || {})["data-tq-surface"] === undefined
		&& String((node.p || {}).children).indexOf("quips.loader.nativeNote") !== -1).length;
	ok("the note appears for the official whale", noteIn({ loader: "native" }) === 1, String(noteIn({ loader: "native" })));
	ok("and not for the plugin's own icons", noteIn({ loader: "orbit" }) === 0, String(noteIn({ loader: "orbit" })));
}

console.log("\n── the modal (official) ──");
{
	writes.length = 0;
	nodes({}, { official: true });
	let closed = 0;
	const modalNodes = render(lastPlugin.__internal.QuipsModal({
		cfg: Object.assign({}, api.DEFAULTS, { quips: "# Chinese\n甲;\n# English\nalpha;" }),
		t: (key) => key,
		onClose: () => { closed++; }
	}));
	const modal = modalNodes.filter((node) => node.t === "Modal")[0];
	ok("the official Modal is used", modal !== undefined);
	ok("it is open, titled and closable by name",
		modal !== undefined && modal.p.open === true && modal.p.title === "quips.modalTitle" && modal.p.closeLabel === "quips.close",
		modal === undefined ? "no Modal" : JSON.stringify({ open: modal.p.open, title: modal.p.title, closeLabel: modal.p.closeLabel }));
	ok("it gets a footer", modal !== undefined && modal.p.footer !== undefined);
	ok("no hand-written overlay is left behind", modalNodes.filter((node) => (node.p || {}).className === "tq-overlay").length === 0);
	const textarea = modalNodes.filter((node) => node.t === "textarea")[0];
	ok("the textarea asks for the modal's initial focus", textarea.p["data-modal-autofocus"] === true);
	ok("the textarea is seeded from the saved config", textarea.p.value.indexOf("甲") !== -1, textarea.p.value);
	// The footer travels as a prop, not as a child, so it is walked on its own.
	const save = render(modal.p.footer).filter((node) => node.t === "button")[0];
	ok("the footer offers Save", save !== undefined);
	ok("the footer is not part of the body", save !== undefined && save.p.className === "tq-btn");
	save.p.onClick();
	ok("Save writes the quips", JSON.parse(writes[writes.length - 1][1]).quips.indexOf("甲") !== -1, writes[writes.length - 1][1]);
	ok("Save closes the modal", closed === 1, String(closed));
}

console.log("\n── the modal (pre-0.2 fallback) ──");
{
	nodes({});
	const modalNodes = render(lastPlugin.__internal.QuipsModal({ cfg: api.DEFAULTS, t: (key) => key, onClose: () => {} }));
	const overlay = modalNodes.filter((node) => (node.p || {}).className === "tq-overlay")[0];
	ok("the hand-written overlay stands in", overlay !== undefined);
	ok("with its own mask", modalNodes.some((node) => (node.p || {}).className === "tq-mask"));
	ok("and its own close button", modalNodes.some((node) => (node.p || {})["aria-label"] === "quips.close"));
	ok("no official Modal is attempted", modalNodes.filter((node) => node.t === "Modal").length === 0);
}

console.log(failures === 0 ? `\nALL SETTINGS-UI CHECKS PASSED (${factoryCount} renders)` : `\nSETTINGS-UI CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
