// Running-surface detection (webui vs desktop) — the workspace requires every client
// plugin to know which surface it is on (AGENTS §6, docs/06-运行模式.md).
//
// The interesting half is NOT the initial read: `dshDesktop` and `<html data-platform>`
// are two first-party signals, and the mark can arrive as late as DOMContentLoaded. So
// this suite drives a *recording* MutationObserver and flips the mark after `apply()`,
// which is what proves the watcher delivered it to the plugin's store.
//
// It reads the STORE (`__internal.runtimeStore().get()`) rather than calling the
// detector again: re-detecting would tell us about the DOM, not about what the plugin
// believes. One assertion also pins the other hard requirement — a runtime fact must
// never be written into the saved preference config.

let loaded = null;
let caseId = 0;
/** Every observer the plugin created on the current page, in creation order. */
let observers = [];
/** Every `localStorage.setItem` the plugin performed on the current page. */
let storageWrites = [];

// ── the fake page ────────────────────────────────────────────────────────────
function makeDocEl() {
	const attrs = {};
	const el = {
		_attrs: attrs,
		style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } },
		setAttribute(k, v) { attrs[k] = String(v); },
		getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
		hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
		removeAttribute(k) { delete attrs[k]; }
	};
	// `dataset.platform` is what the plugin reads, so the stub has to model the
	// attribute→dataset camelCase bridge the browser performs.
	Object.defineProperty(el, "dataset", {
		get() {
			const out = {};
			for (const key of Object.keys(attrs)) {
				const m = /^data-(.+)$/.exec(key);
				if (m) out[m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attrs[key];
			}
			return out;
		}
	});
	return el;
}

function makeStyleEl() { return { id: "", textContent: "", dataset: {} }; }

/** Records target + options + connection state; `disconnect` is observable. */
class RecordingObserver {
	constructor(callback) {
		this.callback = callback;
		this.target = null;
		this.options = null;
		this.connected = false;
		observers.push(this);
	}
	observe(target, options) { this.target = target; this.options = options || null; this.connected = true; }
	disconnect() { this.connected = false; }
}

/**
 * Build a page and mount the plugin into it.
 * @param options.desktopBridge - install the Electron preload bridge before apply().
 * @param options.platformMark - the value of `<html data-platform>` at apply() time.
 * @param options.observers - false removes MutationObserver entirely (the degrade path).
 */
async function mountPage(options = {}) {
	caseId += 1;
	observers = [];
	storageWrites = [];
	const documentElement = makeDocEl();
	if (options.platformMark !== undefined) documentElement.setAttribute("data-platform", options.platformMark);
	const styles = {};

	globalThis.window = { __ModuleLoader__: { load: (x) => { loaded = x; } }, __DSH_THINKING_QUIPS__: false };
	globalThis.localStorage = {
		getItem: () => null, // no saved config: the shipped defaults
		setItem: (key, value) => { storageWrites.push([key, value]); },
		removeItem: () => {}
	};
	if (options.desktopBridge === true) globalThis.dshDesktop = { keyboard: {} };
	else delete globalThis.dshDesktop;
	// Pin the host OS: Node reports the *real* one (`navigator.platform` is "Win32" on a
	// Windows box), which would make the platform assertions depend on where the suite
	// runs. The mark still wins over this when a case sets one.
	Object.defineProperty(globalThis, "navigator", {
		value: options.navigator || { platform: "Linux x86_64" },
		configurable: true,
		writable: true
	});
	if (options.observers === false) delete globalThis.MutationObserver;
	else globalThis.MutationObserver = RecordingObserver;
	globalThis.setInterval = () => 1;
	globalThis.clearInterval = () => {};
	globalThis.document = {
		body: { style: {} },
		documentElement,
		head: { appendChild: (el) => { if (el && el.id) styles[el.id] = el; } },
		getElementById: (id) => styles[id] || null,
		createElement: (tag) => (tag === "style" ? makeStyleEl() : { style: {}, setAttribute() {}, appendChild() {} }),
		createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
		createTextNode: (v) => ({ nodeType: 3, nodeValue: v }),
		querySelector: () => null, // no running line: this suite is about the surface only
		querySelectorAll: () => []
	};

	const reactStub = {
		useState: (init) => [init, () => {}],
		useEffect: () => {},
		useRef: () => ({ current: null }),
		useSyncExternalStore: (_sub, get) => get()
	};
	const jsx = (t, p) => ({ t, p });
	const requireStub = (name) => {
		if (name === "react") return reactStub;
		if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
		if (name === "react-dom/client") return { createRoot: () => ({ render() {}, unmount() {} }) };
		if (name === "@deepseek-ai/dsh-client-ui-primitives") return { TextShimmer: function TextShimmer() {} };
		throw new Error("unexpected require: " + name);
	};

	await import(new URL(`../lib/client.js?surface=${caseId}`, import.meta.url).href);
	const plugin = loaded.factory(requireStub);

	const effects = [];
	const slots = [];
	const ctx = {
		on: () => {},
		locale: { register: () => () => {}, getLocale: () => ({ active: "en" }) },
		slots: { inject: (name, cb) => { slots.push(name); cb(); return () => {}; }, register: () => () => {} },
		effect: (fn, label) => {
			const disposer = fn();
			effects.push({ label, disposer, returnedDisposer: typeof disposer === "function" });
			return disposer;
		}
	};
	let applyError;
	try { plugin.apply(ctx); } catch (error) { applyError = error; }

	const page = {
		documentElement,
		effects,
		slots: slots,
		applyError,
		internals: plugin.__internal,
		storageWrites: () => storageWrites.slice(),
		observers: () => observers.slice(),
		/** What the plugin believes right now. */
		runtime: () => plugin.__internal.runtimeStore().get(),
		/** The surface observers only (the plugin also watches body for children/theme). */
		surfaceObservers: () => observers.filter((o) => o.target === documentElement
			&& o.options && Array.isArray(o.options.attributeFilter) && o.options.attributeFilter.indexOf("data-platform") !== -1),
		dispose: () => { for (const effect of effects) if (typeof effect.disposer === "function") effect.disposer(); },
		/** Write `<html data-platform>` the way the shell does, and notify the watchers. */
		setPlatformMark: (value) => {
			if (value === undefined) documentElement.removeAttribute("data-platform");
			else documentElement.setAttribute("data-platform", value);
			for (const observer of observers) {
				if (observer.connected && observer.target === documentElement) observer.callback([{ type: "attributes", attributeName: "data-platform" }]);
			}
		}
	};
	return page;
}

let failures = 0;
function ok(label, condition, detail) {
	const pass = !!condition;
	if (!pass) failures++;
	console.log(`${pass ? "OK  " : "FAIL"} ${label}${detail === undefined ? "" : " -> " + detail}`);
}

/** Expand a rendered jsx tree (function components called, children walked). */
function tree(node, out = []) {
	if (node === null || node === undefined || typeof node !== "object") return out;
	if (Array.isArray(node)) { for (const n of node) tree(n, out); return out; }
	if (typeof node.t === "function") return tree(node.t(node.p), out);
	out.push(node);
	if (node.p) tree(node.p.children, out);
	return out;
}
/** The live settings row, as a flat node list. */
function rowNodes(page) {
	const row = page.internals.QuipsSettingsPanel({ t: (key) => key });
	return tree(row);
}

// ── 1. the pure contract ─────────────────────────────────────────────────────
console.log("── the two signals ──");
{
	const m = await mountPage();
	const { detectSurface, detectPlatform, SURFACES } = m.internals;
	ok("SURFACES lists exactly web + desktop", SURFACES.join(",") === "web,desktop", SURFACES.join(","));
	ok("plain web is detected as web", detectSurface({ document: { documentElement: { dataset: {} } } }) === "web",
		detectSurface({ document: { documentElement: { dataset: {} } } }));
	ok("the dshDesktop bridge is detected as desktop", detectSurface({ dshDesktop: {}, document: { documentElement: { dataset: {} } } }) === "desktop");
	ok("the document mark alone is detected as desktop", detectSurface({ document: { documentElement: { dataset: { platform: "darwin" } } } }) === "desktop");
	ok("an empty mark is not a signal", detectSurface({ document: { documentElement: { dataset: { platform: "" } } } }) === "web");
	ok("a missing documentElement does not throw", detectSurface({}) === "web");
	ok("the bridge wins over the mark", detectSurface({ dshDesktop: {}, document: { documentElement: { dataset: { platform: "darwin" } } } }) === "desktop");
	ok("a darwin mark maps to macos", detectPlatform({ document: { documentElement: { dataset: { platform: "darwin" } } } }) === "macos");
	ok("a win32 mark maps to windows", detectPlatform({ document: { documentElement: { dataset: { platform: "win32" } } } }) === "windows");
	ok("navigator.platform is the fallback", detectPlatform({ navigator: { platform: "Win32" } }) === "windows");
	ok("navigator.userAgent is the last fallback", detectPlatform({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } }) === "macos");
	ok("nothing at all maps to linux", detectPlatform({}) === "linux");
	ok("a linux mark maps to linux", detectPlatform({ document: { documentElement: { dataset: { platform: "linux" } } } }) === "linux");
}

// ── 2. plain web ─────────────────────────────────────────────────────────────
console.log("\n── plain web ──");
{
	const m = await mountPage();
	ok("no apply error", m.applyError === undefined, m.applyError && m.applyError.message);
	ok("the store says web", m.runtime().surface === "web", JSON.stringify(m.runtime()));
	ok("a surface effect is registered and labelled", m.effects.some((e) => e.label === "dsh-thinking-quips: surface detection"),
		m.effects.map((e) => e.label).join(", "));
	ok("an observer watches <html data-platform>", m.surfaceObservers().length === 1 && m.surfaceObservers()[0].connected,
		`${m.surfaceObservers().length} surface observer(s)`);
	ok("the watcher asks for attributes only", m.surfaceObservers()[0].options.attributes === true);
	ok("the runtime fact is NOT written to localStorage", m.storageWrites().length === 0,
		JSON.stringify(m.storageWrites()));
	const nodes = rowNodes(m);
	const hint = nodes.filter((n) => n.p && n.p["data-tq-surface"] !== undefined)[0];
	ok("the settings row records the surface", hint !== undefined && hint.p["data-tq-surface"] === "web", hint && hint.p["data-tq-surface"]);
	ok("the settings row records the platform", hint !== undefined && hint.p["data-tq-platform"] === "linux", hint && hint.p["data-tq-platform"]);
	ok("the row shows the localized surface label", hint !== undefined && String(hint.p.children).indexOf("quips.surface.web") !== -1, hint && hint.p.children);
}

// ── 3. the desktop bridge ────────────────────────────────────────────────────
console.log("\n── the dshDesktop bridge ──");
{
	const m = await mountPage({ desktopBridge: true });
	const nodes = rowNodes(m);
	const hint = nodes.filter((n) => n.p && n.p["data-tq-surface"] !== undefined)[0];
	ok("the store says desktop", m.runtime().surface === "desktop", JSON.stringify(m.runtime()));
	ok("the bridge also reports a platform", ["macos", "windows", "linux"].indexOf(m.runtime().platform) !== -1, m.runtime().platform);
	ok("the row follows the bridge", hint !== undefined && hint.p["data-tq-surface"] === "desktop", hint && hint.p["data-tq-surface"]);
}

// ── 4. the mark alone ────────────────────────────────────────────────────────
console.log("\n── the document mark alone ──");
{
	const m = await mountPage({ platformMark: "darwin" });
	ok("the mark alone is enough for desktop", m.runtime().surface === "desktop", JSON.stringify(m.runtime()));
	ok("the mark also carries the platform", m.runtime().platform === "macos", m.runtime().platform);
}

// ── 4b. the platform fallback when no mark is present ───────────────────────
console.log("\n── the platform fallback ──");
{
	const m = await mountPage({ navigator: { platform: "Win32" } });
	ok("without a mark the navigator reports the host OS", m.runtime().platform === "windows", m.runtime().platform);
	ok("and the surface stays web", m.runtime().surface === "web", m.runtime().surface);
	const marked = await mountPage({ navigator: { platform: "Win32" }, platformMark: "darwin" });
	ok("the mark beats the navigator", marked.runtime().platform === "macos", marked.runtime().platform);
}

// ── 5. the late mark (the reason the watcher exists) ─────────────────────────
console.log("\n── a late <html data-platform> ──");
{
	const m = await mountPage();
	ok("starts as web before the mark", m.runtime().surface === "web", JSON.stringify(m.runtime()));
	let notifies = 0;
	m.internals.runtimeStore().subscribe(() => { notifies++; });
	m.setPlatformMark("win32");
	ok("the late mark flips the surface to desktop", m.runtime().surface === "desktop", JSON.stringify(m.runtime()));
	ok("the late mark also flips the platform", m.runtime().platform === "windows", m.runtime().platform);
	ok("the flip notified the store's subscribers", notifies === 1, String(notifies));
	m.setPlatformMark("win32"); // same value again: the shell may rewrite the attribute
	ok("an unchanged refresh does not notify", notifies === 1, String(notifies));
	const nodes = rowNodes(m);
	const hint = nodes.filter((n) => n.p && n.p["data-tq-surface"] !== undefined)[0];
	ok("the row re-rendered with the new surface", hint !== undefined && hint.p["data-tq-surface"] === "desktop", hint && hint.p["data-tq-surface"]);
	m.setPlatformMark(undefined);
	ok("removing the mark falls back to web", m.runtime().surface === "web", JSON.stringify(m.runtime()));
}

// ── 6. the degrade path ──────────────────────────────────────────────────────
console.log("\n── without MutationObserver ──");
{
	const m = await mountPage({ observers: false });
	ok("apply does not throw", m.applyError === undefined, m.applyError && m.applyError.message);
	ok("the surface is still read once", m.runtime().surface === "web", JSON.stringify(m.runtime()));
	const effect = m.effects.filter((e) => e.label === "dsh-thinking-quips: surface detection")[0];
	ok("the effect still returns a disposer", effect !== undefined && effect.returnedDisposer === true);
	ok("nothing is left watching", m.surfaceObservers().length === 0, String(m.surfaceObservers().length));
}

// ── 7. teardown ──────────────────────────────────────────────────────────────
console.log("\n── teardown ──");
{
	const m = await mountPage();
	ok("every effect returned a disposer", m.effects.every((e) => e.returnedDisposer === true),
		m.effects.filter((e) => !e.returnedDisposer).map((e) => e.label).join(", "));
	const before = m.runtime().surface;
	m.dispose();
	ok("disposal disconnects the surface observer", m.surfaceObservers().every((o) => o.connected === false),
		`${m.surfaceObservers().filter((o) => o.connected).length} still connected`);
	m.setPlatformMark("win32");
	ok("a late mark after disposal is ignored", m.runtime().surface === before, `${before} -> ${m.runtime().surface}`);
}

console.log(failures === 0 ? "\nALL SURFACE CHECKS PASSED" : `\nSURFACE CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
