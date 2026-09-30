// DSH 0.2 adaptation: the anchor, line ownership, the official sweep, and the clock.
//
// The 0.2 running line is a different shape from 0.1.x (see the plugin's
// docs/0.2适配与合并方案.md and the workspace's docs/05-DSH-0.2-运行状态行变更.md):
//
//   div[data-chat-running]
//     span.TTCZqG_visuallyHidden[role=status]   <- screen-reader announcement, NOT the line
//     span.EvIC1a_runningDivider
//     span.EvIC1a_runningContent
//       span.EvIC1a_runningIcon                 <- DSH's own whale, kept (they coexist)
//       span.EvIC1a_runningText[data-shimmer]   <- the visible label, rewritten every second
//         span.content > span.text                (real text)
//         span.decoration[inert] > span.sweep > span.highlight > span.text[data-shimmer-text]
//
// So this suite asserts: the announcement is never touched, DSH's icon survives, the
// plugin owns its own line, the official TextShimmer is rendered through the seeded
// primitive, and the elapsed time lands where the config says.

import { readFileSync } from "node:fs";

let caseId = 0;
let clock = 1_700_000_000_000;

// ── a fake DOM with the selectors this plugin actually uses ───────────────────
function makeTextNode(value) {
	return { nodeType: 3, nodeValue: value, parentNode: null, nextSibling: null, get textContent() { return String(this.nodeValue); } };
}
function matches(el, sel) {
	if (el.nodeType !== 1) return false;
	let m = /^\.([\w-]+)$/.exec(sel);
	if (m) return el._classes.indexOf(m[1]) !== -1;
	m = /^\[class\*="([^"]+)"\]$/.exec(sel);
	if (m) return el._classes.join(" ").indexOf(m[1]) !== -1;
	m = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
	if (m) return el._attrs[m[1]] === m[2];
	m = /^\[([\w-]+)\]$/.exec(sel);
	if (m) return Object.prototype.hasOwnProperty.call(el._attrs, m[1]);
	return false;
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
		removeAttribute(k) { delete el._attrs[k]; },
		querySelector(sel) { return el._find(sel); },
		querySelectorAll(sel) { const out = []; el._collect(sel, out); return out; },
		_find(sel) {
			for (const child of el.children) {
				if (matches(child, sel)) return child;
				const deeper = child.nodeType === 1 ? child._find(sel) : null;
				if (deeper) return deeper;
			}
			return null;
		},
		_collect(sel, out) {
			for (const child of el.children) {
				if (matches(child, sel)) out.push(child);
				if (child.nodeType === 1) child._collect(sel, out);
			}
		},
		_refresh() {
			el.children.forEach((c, i) => { c.nextSibling = el.children[i + 1] || null; });
			el.firstChild = el.children[0] || null;
		},
		get textContent() { return el.children.map((c) => c.textContent).join(""); },
		set textContent(v) { el.children = []; const t = makeTextNode(v); t.parentNode = el; el.children.push(t); el._refresh(); }
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

/** The running line exactly as dsh-client-ui-chat@0.2.0-rc.2 renders it. */
function buildLine() {
	const body = makeEl("body");
	const wrapper = makeEl("div");
	wrapper.className = "EvIC1a_running";
	wrapper.setAttribute("data-chat-running", "true");

	const announce = makeEl("span");
	announce.className = "TTCZqG_visuallyHidden";
	announce.setAttribute("role", "status");
	announce.setAttribute("aria-live", "polite");
	const announceText = makeTextNode("深度求索中");
	announce.appendChild(announceText);

	const divider = makeEl("span");
	divider.className = "EvIC1a_runningDivider";

	const content = makeEl("span");
	content.className = "EvIC1a_runningContent";
	const icon = makeEl("span");
	icon.className = "EvIC1a_runningIcon";
	const whale = makeEl("span");
	whale.className = "EvIC1a_runningWhaleAnimated";
	icon.appendChild(whale);

	const label = makeEl("span");
	label.className = "EvIC1a_runningText";
	label.setAttribute("data-shimmer", "true");
	const labelContent = makeEl("span");
	labelContent.className = "content";
	const labelTextEl = makeEl("span");
	labelTextEl.className = "text";
	const labelText = makeTextNode("深度求索中，用时 1秒 ···");
	labelTextEl.appendChild(labelText);
	labelContent.appendChild(labelTextEl);
	const decoration = makeEl("span");
	decoration.className = "decoration";
	decoration.setAttribute("aria-hidden", "true");
	decoration.setAttribute("inert", "");
	const sweep = makeEl("span");
	sweep.className = "sweep";
	const highlight = makeEl("span");
	highlight.className = "content highlight";
	const copy = makeEl("span");
	copy.className = "text";
	copy.setAttribute("data-shimmer-text", "深度求索中，用时 1秒 ···");
	highlight.appendChild(copy);
	sweep.appendChild(highlight);
	decoration.appendChild(sweep);
	label.appendChild(labelContent);
	label.appendChild(decoration);
	content.appendChild(icon);
	content.appendChild(label);
	wrapper.appendChild(announce);
	wrapper.appendChild(divider);
	wrapper.appendChild(content);
	body.appendChild(wrapper);

	return { body, wrapper, announce, announceText, content, icon, whale, label, labelText, copy };
}

// ── mount one fresh module instance against that DOM ─────────────────────────
async function mount(config, options = {}) {
	caseId += 1;
	const dom = buildLine();
	const timers = [];
	const cleanups = [];
	const intervalsCleared = [];
	const renders = [];
	const unmounts = { count: 0 };
	const slotsInjected = [];
	const styles = {};
	const withPrimitives = options.withPrimitives !== false;

	globalThis.window = { __ModuleLoader__: { load: (x) => { globalThis.__loaded = x; } }, __DSH_THINKING_QUIPS__: false };
	globalThis.localStorage = { getItem: () => JSON.stringify(config || {}), setItem: () => {}, removeItem: () => {} };
	globalThis.NodeFilter = { SHOW_TEXT: 4 };
	globalThis.setInterval = (fn) => { timers.push(fn); return timers.length; };
	globalThis.clearInterval = (id) => { intervalsCleared.push(id); };
	globalThis.requestAnimationFrame = () => 0;
	globalThis.cancelAnimationFrame = () => {};
	globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
	globalThis.MutationObserver = class { observe() {} disconnect() {} };
	globalThis.Date.now = () => clock;

	const documentStub = {
		body: dom.body,
		documentElement: makeEl("html"),
		head: { appendChild: (el) => { if (el.id) styles[el.id] = el; } },
		getElementById: (id) => styles[id] || null,
		createElement: (tag) => makeEl(tag),
		createElementNS: (_ns, tag) => makeEl(tag),
		createTextNode: (v) => makeTextNode(v),
		querySelector: (sel) => dom.body._find(sel),
		querySelectorAll: (sel) => dom.body._queryAll(sel),
		createTreeWalker: (rootEl) => {
			const nodes = [];
			const walk = (node) => {
				for (const child of node.children) {
					if (child.nodeType === 3) nodes.push(child);
					else walk(child);
				}
			};
			walk(rootEl);
			let i = 0;
			return { nextNode: () => (i < nodes.length ? nodes[i++] : null) };
		}
	};
	dom.body._queryAll = (sel) => { const out = []; dom.body._collect(sel, out); return out; };
	globalThis.document = documentStub;

	const TextShimmerStub = function TextShimmer() {};
	const reactStub = {
		useState: (i) => [i, () => {}],
		useEffect: () => {},
		useRef: () => ({ current: null }),
		useSyncExternalStore: (_s, get) => get(),
		memo: (c) => c,
		createElement: (type, props, ...children) => ({ type, props, children })
	};
	const jsx = (t, p) => ({ t, p });
	const requireStub = (name) => {
		if (name === "react") return reactStub;
		if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
		if (name === "react-dom/client") return {
			createRoot: (container) => ({
				render: (element) => { renders.push({ container, element }); },
				unmount: () => { unmounts.count += 1; }
			})
		};
		if (name === "@deepseek-ai/dsh-client-ui-primitives") {
			if (!withPrimitives) throw new Error("seed unavailable in this case");
			return { TextShimmer: TextShimmerStub };
		}
		throw new Error("unexpected require: " + name);
	};

	await import(new URL(`../lib/client.js?case=${caseId}`, import.meta.url).href);
	const plugin = globalThis.__loaded.factory(requireStub);
	const ctx = {
		on: () => {},
		locale: { register: () => ({}), getLocale: () => ({ active: "zh" }) },
		slots: { inject: (name, cb) => { slotsInjected.push(name); cb(); return () => {}; }, register: () => () => {} },
		effect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") cleanups.push(cleanup); return cleanup; }
	};
	return { dom, plugin, ctx, timers, cleanups, intervalsCleared, renders, unmounts, slotsInjected, styles, TextShimmerStub };
}

function ok(label, condition, detail) {
	if (!condition) throw new Error(`${label}${detail ? " — " + detail : ""}`);
	console.log("OK   " + label);
}

// ── 1. the anchor and DSH's own indicator ────────────────────────────────────
console.log("── the 0.2 anchor ──");
{
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	m.plugin.__internal.officialTurn.startTime = clock - 12_000;
	m.plugin.apply(m.ctx);

	const line = m.dom.wrapper.querySelector(".tq-line");
	ok("the wrapper is marked owned", m.dom.wrapper.getAttribute("data-tq-owned") !== null);
	ok("the plugin owns its own line inside runningContent", line !== null && line.parentNode === m.dom.content);
	ok("the screen-reader announcement is never written to", m.dom.announceText.nodeValue === "深度求索中", m.dom.announceText.nodeValue);
	ok("no loader lands inside the announcement", m.dom.announce.querySelector(".tq-loader") === null);
	ok("the loader is injected next to DSH's icon", m.dom.content.querySelector(".tq-loader") !== null);
	ok("DSH's own icon is kept (they coexist)", m.dom.content.querySelector(".EvIC1a_runningIcon") !== null && m.dom.content.querySelector(".EvIC1a_runningWhaleAnimated") !== null);
	ok("the injected CSS hides DSH's label by ownership, not by blanking", m.styles["dsh-thinking-quips-style"].textContent.indexOf('[data-tq-owned] [class*="runningText"]{display:none!important}') !== -1);
	ok("the turn-clock bridge registers on the official turnTail seat", m.slotsInjected.indexOf("conversation.chat.turnTail") !== -1);
	ok("the settings row still registers", m.slotsInjected.indexOf("settings.general.item") !== -1);
}

// ── 2. the official sweep is DSH's own component ─────────────────────────────
console.log("\n── official sweep (shimmer / official) ──");
{
	const m = await mount({ textEffect: "shimmer", clockMode: "off" });
	m.plugin.apply(m.ctx);
	ok("the seeded primitive is rendered", m.renders.length > 0 && m.renders[0].element.type === m.TextShimmerStub);
	ok("it is rendered active", m.renders[0].element.props.active === true);
	ok("into the plugin's own box", m.dom.wrapper.querySelector(".tq-official") !== null);
}
{
	// The same shape with the primitive missing must fall back to the plugin's glow.
	const m = await mount({ textEffect: "shimmer", clockMode: "off" }, { withPrimitives: false });
	m.plugin.apply(m.ctx);
	ok("a shell without the seed falls back instead of throwing", m.dom.wrapper.querySelector(".tq-glow") !== null);
}

// ── 3. glow recreates the pre-0.2 look on the plugin's node ──────────────────
console.log("\n── glow (legacy look) ──");
{
	const m = await mount({ textEffect: "glow", clockMode: "off" });
	m.plugin.apply(m.ctx);
	const glow = m.dom.wrapper.querySelector(".tq-glow");
	ok("glow renders into the plugin's line", glow !== null && glow.parentNode.classList.contains("tq-line"));
	ok("glow carries the quip", glow.textContent.length > 0);
	ok("glow's CSS is the painted gradient", m.styles["dsh-thinking-quips-style"].textContent.indexOf("background-clip:text") !== -1);
}

// ── 4. wave on the plugin's own line ────────────────────────────────────────
console.log("\n── wave ──");
{
	const m = await mount({ textEffect: "wave", clockMode: "off" });
	m.plugin.apply(m.ctx);
	const wave = m.dom.wrapper.querySelector(".tq-wave");
	ok("the wave container lives in the plugin's line", wave !== null && wave.parentNode.classList.contains("tq-line"));
	ok("the wave draws per-token items", wave.querySelectorAll(".tq-waveItem").length > 0);
}

// ── 5. the elapsed time: inline (0.2 shape) vs beside (0.1 shape) ────────────
console.log("\n── elapsed time ──");
{
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	m.plugin.__internal.officialTurn.startTime = clock - 65_000;
	m.plugin.apply(m.ctx);
	const text = m.renders[m.renders.length - 1].element.children[0];
	ok("inline folds the official duration into the animated text", text.indexOf("用时 1分5秒") !== -1, text);
	ok("inline leaves no separate clock node", m.dom.wrapper.querySelector(".tq-clock") === null);
}
{
	const m = await mount({ textEffect: "official", clockMode: "separate" });
	m.plugin.__internal.officialTurn.startTime = clock - 65_000;
	m.plugin.apply(m.ctx);
	const clockSpan = m.dom.wrapper.querySelector(".tq-clock");
	ok("beside renders a separate grey clock node", clockSpan !== null && clockSpan.parentNode.classList.contains("tq-line"));
	ok("the separate clock shows the official duration", clockSpan.textContent === "1分5秒", clockSpan.textContent);
	const text = m.renders[m.renders.length - 1].element.children[0];
	ok("the separate clock is NOT part of the animated text", text.indexOf("用时") === -1 && text.indexOf("1分5秒") === -1, text);
	ok("its CSS uses the tertiary grey", m.styles["dsh-thinking-quips-style"].textContent.indexOf(".tq-clock{color:var(--dsw-alias-label-tertiary)") !== -1);
}
{
	const m = await mount({ textEffect: "official", clockMode: "off" });
	m.plugin.apply(m.ctx);
	ok("off shows no clock at all", m.dom.wrapper.querySelector(".tq-clock") === null);
	const text = m.renders[m.renders.length - 1].element.children[0];
	ok("off leaves the plain quip", text.indexOf("用时") === -1, text);
}
{
	// No official time known: the plugin times the line itself.
	const m = await mount({ textEffect: "official", clockMode: "separate" });
	m.plugin.apply(m.ctx);
	clock += 2_000;
	m.plugin.apply(m.ctx);
	m.timers[0]();
	const clockSpan = m.dom.wrapper.querySelector(".tq-clock");
	ok("without the official seat the self-timer covers it", clockSpan !== null && clockSpan.textContent === "2秒", clockSpan && clockSpan.textContent);
	clock -= 2_000;
}

// ── 6. indicatorOnly hands the line back, keeping the icon ───────────────────
console.log("\n── indicatorOnly ──");
{
	const m = await mount({ textEffect: "official", clockMode: "inline", indicatorOnly: true });
	m.plugin.apply(m.ctx);
	ok("the loader is still injected", m.dom.content.querySelector(".tq-loader") !== null);
	ok("ownership is released so DSH's own text shows", m.dom.wrapper.getAttribute("data-tq-owned") === null);
	ok("nothing was rendered into the plugin's line", m.renders.length === 0);
}

// ── 7. the duration format matches DSH's own ─────────────────────────────────
console.log("\n── duration format (parity with DSH) ──");
{
	const m = await mount({});
	const { formatDuration } = m.plugin.__internal;
	const cases = [
		[0, "zh", "0秒"], [999, "zh", "0秒"], [1000, "zh", "1秒"], [59_000, "zh", "59秒"],
		[60_000, "zh", "1分0秒"], [149_000, "zh", "2分29秒"], [3_600_000, "zh", "1小时0分0秒"],
		[3_723_000, "zh", "1小时2分3秒"], [-5000, "zh", "0秒"],
		[1000, "en", "1s"], [60_000, "en", "1m 0s"], [149_000, "en", "2m 29s"], [3_600_000, "en", "1h 0m 0s"]
	];
	for (const [ms, locale, want] of cases) {
		const got = formatDuration(ms, locale);
		if (got !== want) throw new Error(`formatDuration(${ms}, ${locale}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
	}
	ok(`${cases.length} duration cases match DSH's formatRunDuration`, true);
}

// ── 8. teardown ─────────────────────────────────────────────────────────────
console.log("\n── teardown ──");
{
	const m = await mount({ textEffect: "official", clockMode: "inline" });
	m.plugin.apply(m.ctx);
	for (const cleanup of m.cleanups) cleanup();
	ok("the poll interval is cleared", m.intervalsCleared.length > 0);
	ok("the official React root is unmounted", m.unmounts.count > 0);
}

console.log("\nALL 0.2 ADAPTATION CHECKS PASSED");
