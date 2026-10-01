/**
 * Build `preview/animations.html` — the offline animation gallery for this plugin.
 *
 * Why a build step at all: the gallery must not be a second implementation. So the page
 * ships the plugin's own `lib/client.js` **verbatim** and, in the browser, calls the
 * plugin's own functions on mock status lines:
 *
 *   __internal.injectPluginCss()          the shipped stylesheet (so the page uses the real CSS)
 *   __internal.ensureLoader(host, s, z)   the shipped loader painter, once per cell
 *   __internal.applyStatusText(line, …)   the shipped text-effect painter
 *   apply(ctx)                            the shipped reconciliation loop, on a mock running line
 *
 * The only things lifted are the two DSH assets that cannot be `require`d from Node: the
 * chat package's stylesheet (which carries the 60-frame whale APNG as a data URI) and the
 * seeded fish-logo path. Both are read out of the installed packages at build time, so the
 * page shows the real assets of the DSH actually installed — never a hand-drawn copy.
 *
 * Anti-drift: `test/test-preview.mjs` rebuilds in memory and fails when the committed page
 * differs, and checks that every declared loader style and text effect has a cell. A page
 * that has fallen behind the plugin is therefore a red self-check, not a silent rot.
 *
 * Zero dependencies, Node built-ins only.
 *
 * Usage:
 *   node tools/build-preview.mjs            write preview/animations.html
 *   node tools/build-preview.mjs --check    exit 1 when the committed page is stale
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = dirname(HERE);
const CLIENT_PATH = join(PLUGIN_DIR, "lib", "client.js");
export const OUTPUT_PATH = join(PLUGIN_DIR, "preview", "animations.html");

/**
 * Read the two official assets out of the installed DSH packages.
 *
 * The packages are found by following the profile's junctions to the DSH install and then
 * looking beside `dsh-client-ui-chat` — no absolute path is hardcoded, and nothing about
 * the locating is written into the page (only package names and versions are).
 * @returns `{ chatCss, restPath, chatVersion, fishPath, fishWidth, fishHeight, primVersion }`
 *   or null when the install cannot be found (the page is then built without them).
 */
export function officialAssets() {
	const home = process.env.DSH_HOME;
	if (!home) return null;
	try {
		const chatDir = realpathSync(join(home, "profiles", "node_modules", "@deepseek-ai", "dsh-client-ui-chat"));
		const primDir = join(dirname(chatDir), "dsh-client-ui-primitives");
		const chat = readFileSync(join(chatDir, "lib", "client.js"), "utf8");
		const prim = readFileSync(join(primDir, "lib", "index.js"), "utf8");

		// The chat package inlines its CSS module as one big JS string literal; the one that
		// mentions the whale is the one to lift. It is JSON-decoded so the page gets CSS,
		// not an escaped literal.
		let chatCss = null;
		const literal = /const (css\$\d+) = "((?:[^"\\]|\\.)*)"/g;
		let match;
		while ((match = literal.exec(chat)) !== null) {
			if (match[2].indexOf("runningWhaleAnimated") !== -1) { chatCss = JSON.parse('"' + match[2] + '"'); break; }
		}
		if (chatCss === null) return null;

		const rest = /const REST_PATH = "([^"]+)"/.exec(chat);
		const fishPath = /const FISH_LOGO_PATH = "([^"]+)"/.exec(prim);
		const fishBox = /const FISH_LOGO_VIEWBOX = \{\s*width: ([\d.]+),\s*height: ([\d.]+)\s*\}/.exec(prim);
		if (rest === null || fishPath === null || fishBox === null) return null;

		const readVersion = (dir) => {
			try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version || "?"; } catch (_) { return "?"; }
		};
		// The two house-style glyphs the plugin's own nav tail has to sit next to: the settings
		// gear (what an unknown section id gets) and the Plugins icon.
		const gearGlyph = navGlyph(prim, "IconSettingsOutlineArtwork");
		const pluginsGlyph = navGlyph(prim, "IconPersonalizationOutlineArtwork");
		// The official sweep's own stylesheet. The page renders a faithful copy of that component
		// so the brightness control can be SEEN changing the highlight — and this file is also the
		// proof of which token does it (`.sweep { color: var(--dsw-alias-label-shimmer) }`).
		let shimmerCss = null;
		try {
			shimmerCss = readFileSync(join(primDir, "lib", "TextShimmer.module.css"), "utf8");
		} catch (_) { shimmerCss = null; }
		return {
			chatCss,
			restPath: rest[1],
			chatVersion: readVersion(chatDir),
			fishPath: fishPath[1],
			fishWidth: Number(fishBox[1]),
			fishHeight: Number(fishBox[2]),
			primVersion: readVersion(primDir),
			gearGlyph,
			pluginsGlyph,
			shimmerCss
		};
	} catch (_) {
		return null;
	}
}

/** The plugin source, as the page will evaluate it. */
function clientSource() {
	return readFileSync(CLIENT_PATH, "utf8");
}

/**
* The icon this plugin declares for the settings plugin list, plus the one shipped row that
* declares an icon too (the style reference).
*
* Our own file is read from the package root; the reference is the only installed plugin whose
* `package.json` carries an `icon` (dsh-better-sidebar), found through the profile links so no
* machine path ends up in the page. A missing reference just leaves the section with ours.
* @returns `{ own, reference }` SVG markup, either of which may be null.
*/
function listIcons() {
	const read = (file) => {
		try { return readFileSync(file, "utf8"); } catch (_) { return null; }
	};
	let reference = null;
	const home = process.env.DSH_HOME;
	if (home) {
		for (const profile of ["web", "desktop"]) {
			reference = read(join(home, "profiles", profile, "node_modules", "dsh-better-sidebar", "icon.svg"));
			if (reference !== null) break;
		}
	}
	return { own: read(join(PLUGIN_DIR, "icon.svg")), reference };
}

/**
* Lift one of DSH's own nav glyphs out of the primitives bundle as static SVG markup.
*
* WHY: the settings nav picks a glyph per section id from a table inside
* dsh-client-ui-settings-general, and those glyphs are React components — so this page, which
* has no React, gets their markup by reading the artwork's own child elements out of the
* installed bundle. They are on the page as the house-style reference the plugin's own tail has
* to sit next to (16x16 viewBox, fill none, currentColor, stroke-width 1.3).
* @param prim - the primitives bundle source.
* @param name - the artwork constant's name.
* @returns SVG child markup, or null when it cannot be found.
*/
function navGlyph(prim, name) {
	const start = prim.indexOf("const " + name + " = ");
	if (start < 0) return null;
	const open = prim.indexOf("children: [", start);
	if (open < 0) return null;
	let depth = 0;
	let end = -1;
	for (let i = prim.indexOf("[", open); i < prim.length; i += 1) {
		if (prim[i] === "[") depth += 1;
		else if (prim[i] === "]") { depth -= 1; if (depth === 0) { end = i; break; } }
	}
	if (end < 0) return null;
	const children = prim.slice(prim.indexOf("[", open), end + 1);
	const out = [];
	const shape = /jsxs?\("(svg|path|circle|rect|line|polyline|polygon|g)",\s*\{([\s\S]*?)\}\s*(?:,\s*"|\))/g;
	let match;
	while ((match = shape.exec(children)) !== null) {
		const attrs = match[2];
		const parts = [];
		for (const key of ["d", "cx", "cy", "r", "x", "y", "width", "height", "rx", "points"]) {
			const found = new RegExp(key + ':\\s*"([^"]*)"').exec(attrs);
			if (found !== null) parts.push(key + '="' + found[1] + '"');
		}
		parts.push(attrs.indexOf('fill: "currentColor"') !== -1 ? 'fill="currentColor"' : 'fill="none"');
		if (attrs.indexOf('stroke: "currentColor"') !== -1) parts.push('stroke="currentColor"');
		out.push("<" + match[1] + " " + parts.join(" ") + "/>");
	}
	return out.length === 0 ? null : out.join("");
}

/** One `<script>` body must not contain its own closing tag. */
function assertEmbeddable(label, text) {
	if (/<\/script/i.test(text)) throw new Error(`${label} contains "</script" and cannot be inlined`);
	if (/<\/style/i.test(text)) throw new Error(`${label} contains "</style" and cannot be inlined`);
}

// The page is one big template literal, so NOTHING inside it may contain a backtick: one
// stray one ends the literal and turns the whole builder into a syntax error (hit twice
// while writing this). Use plain quotes in the page's comments and code.
const PAGE_CSS = `
/* Page chrome only. Everything that styles the plugin's own elements comes from the
   shipped lib/client.js (injected by injectPluginCss) and, for the whale, from the chat
   package's own stylesheet below. The --dsw-* values here are APPROXIMATIONS of DSH's
   theme tokens, enough to render outside the app; the page says so where it matters. */
:root{
  --dsw-static-deepseek-500:#4d6bfe; --dsw-static-neutral-bluish-50:#fbfcff;
  --dsw-alias-bg-base:#ffffff; --dsw-alias-bg-layer-1:#ffffff; --dsw-alias-bg-layer-2:#f7f8fa;
  --dsw-alias-bg-module-platform:#f2f3f7; --dsw-alias-bg-mask-1:rgba(0,0,0,.35);
  --dsw-alias-label-primary:#1a1c22; --dsw-alias-label-secondary:#4a4f5c;
  --dsw-alias-label-tertiary:#7b8190; --dsw-alias-label-caption:#8f95a3;
  --dsw-alias-label-deep-diving:#2b53c7; --dsw-alias-label-shimmer:rgba(26,28,34,.3);
  --dsw-alias-border-l2:#e3e5ec; --dsw-alias-interactive-bg-hover:#eceef4;
  --dsw-alias-interactive-bg-hover-solid:#f2f3f7; --dsw-alias-interactive-bg-hover-accent:#e8ecfb;
  --dsw-alias-state-business-primary:#4d6bfe; --dsw-alias-state-error-primary:#d93025;
  --dsw-shadow-lv3:0 8px 32px rgba(0,0,0,.16); --dsw-mask-blur:blur(2px);
}
html[data-scheme=dark],body[data-scheme=dark]{
  --dsw-static-neutral-bluish-50:#1b1d24; --dsw-alias-bg-base:#17181d; --dsw-alias-bg-layer-1:#1e2027;
  --dsw-alias-bg-layer-2:#23262e; --dsw-alias-bg-module-platform:#2a2d36; --dsw-alias-bg-mask-1:rgba(0,0,0,.55);
  --dsw-alias-label-primary:#eceef4; --dsw-alias-label-secondary:#b9bfcc; --dsw-alias-label-tertiary:#8b91a1;
  --dsw-alias-label-caption:#7c8291; --dsw-alias-label-deep-diving:#8fa9ff; --dsw-alias-label-shimmer:rgba(255,255,255,.45);
  --dsw-alias-border-l2:#343843; --dsw-alias-interactive-bg-hover:#2c303a; --dsw-alias-interactive-bg-hover-solid:#2a2d36;
  --dsw-alias-interactive-bg-hover-accent:#2b3350; --dsw-alias-state-business-primary:#7d97ff;
}
*{box-sizing:border-box}
body{margin:0;padding:28px 32px 64px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
  font:14px/22px -apple-system,"Segoe UI",system-ui,"Microsoft YaHei",sans-serif}
h1{font-size:20px;line-height:30px;margin:0 0 6px}
h2{font-size:15px;line-height:24px;margin:32px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--dsw-alias-border-l2)}
p.note{margin:0 0 10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:19px}
code{background:var(--dsw-alias-bg-module-platform);border-radius:4px;padding:1px 5px;font-size:12px}
.bar{display:flex;flex-wrap:wrap;gap:14px;align-items:center;padding:12px 14px;margin:14px 0;
  background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px}
.bar label{display:inline-flex;gap:6px;align-items:center;color:var(--dsw-alias-label-secondary);font-size:13px}
.bar select,.bar input[type=number],.bar input[type=text]{background:var(--dsw-alias-bg-module-platform);
  color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  padding:4px 8px;font:inherit;font-size:13px}
.bar input[type=number]{width:74px}
.grid{display:grid;grid-template-columns:150px repeat(3,1fr);gap:10px 16px;align-items:start}
.grid .head{color:var(--dsw-alias-label-tertiary);font-size:12px}
.grid .name{color:var(--dsw-alias-label-secondary);font-size:13px;padding-top:6px}
.cell{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-height:34px}
/* A mock running line, shaped exactly like the one dsh-client-ui-chat renders, so the
   plugin finds it with the same anchor it uses in the app. The colour comes from the same
   token DSH's own wrapper uses — measured in the chat package's stylesheet:
   ".…_running{color:var(--dsw-alias-label-deep-diving)}" — which is also the token the
   plugin writes inline when it tints a line whose text it does not own (indicator-only). */
.mock{display:inline-flex;align-items:center;gap:6px;min-height:26px;white-space:nowrap;color:var(--dsw-alias-label-deep-diving,#2b53c7)}
.mockText{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-deep-diving)}
.facts{font-family:Consolas,Menlo,monospace;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);
  margin-top:2px;word-break:break-all}
.section{max-width:1080px}
/* The nav-glyph comparison: DSH's own icons next to the plugin's tail, both at the size the
   nav rail actually uses (16px) and magnified 8x so the stroke and the joins are visible. */
.naviconCard{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px;margin:10px 0;background:var(--dsw-alias-bg-layer-1)}
.naviconCard > .name{font-size:12px;color:var(--dsw-alias-label-secondary);margin-bottom:8px}
.naviconRow{display:flex;align-items:flex-end;gap:20px;color:var(--dsw-alias-label-primary)}
.naviconBox{display:flex;flex-direction:column;align-items:center;gap:6px}
.naviconBox > svg{display:block;flex:none}
.naviconSize{font-size:10px;color:var(--dsw-alias-label-tertiary)}
/* The plugin-list artwork, in the inventory's own tile (a pale rounded square), and the copy of
   the official running line section 5 reproduces. */
.iconTile{border-radius:12px;background:var(--dsw-alias-bg-module-platform);display:flex;align-items:center;justify-content:center}
.iconTile svg{display:block;flex:none}
.shimRow{margin:10px 0;font-size:var(--dsh-content-font-size,14px);line-height:22px}
`;

/**
 * Build the whole page.
 * @returns the HTML document as a string.
 */
export function buildPreview() {
	const source = clientSource();
	const assets = officialAssets();
	assertEmbeddable("lib/client.js", source);
	if (assets !== null) {
		assertEmbeddable("the chat stylesheet", assets.chatCss);
	}

	const fishSeed = assets === null ? null : {
		FISH_LOGO_PATH: assets.fishPath,
		FISH_LOGO_VIEWBOX: { width: assets.fishWidth, height: assets.fishHeight }
	};
	const origin = assets === null
		? "（未在本机找到 DSH 安装：官方鲸鱼与官方 logo 的素材缺失，相关格子会显示回退图标。）"
		: `官方素材取自本机安装的 <code>@deepseek-ai/dsh-client-ui-chat@${assets.chatVersion}</code> 与 <code>@deepseek-ai/dsh-client-ui-primitives@${assets.primVersion}</code>（构建时提取，非手工抄写）。`;

	const chatStyle = assets === null ? "" : `<style data-plugin="@deepseek-ai/dsh-client-ui-chat" data-plugin-css="@deepseek-ai/dsh-client-ui-chat/ChatView.module.css">${assets.chatCss}</style>`;

	// The official TextShimmer stylesheet, scoped to this page's copy of that component. `@scope`
	// rather than rewriting selectors: the file is inlined EXACTLY as shipped (its class names are
	// plain here — the app's bundler is what hashes them), so nothing about it is reinterpreted.
	const shimmerStyle = assets === null || assets.shimmerCss === null ? ""
		: `<style data-plugin="@deepseek-ai/dsh-client-ui-primitives" data-plugin-css="@deepseek-ai/dsh-client-ui-primitives/TextShimmer.module.css">@scope (.tq-shim){${assets.shimmerCss}}</style>`;

	// The reference set for the plugin's nav glyph: DSH's own nav icons (house style) and the
	// official running whale the glyph is taken from. Omitted (rather than faked) when the
	// install cannot be read, and the section says so.
	const navSpecimens = assets === null || assets.gearGlyph === null || assets.pluginsGlyph === null ? null : {
		gear: assets.gearGlyph,
		plugins: assets.pluginsGlyph,
		whale: assets.restPath
	};

	// NOTE, EVERYTHING FROM HERE TO THE END OF THIS FUNCTION IS ONE TEMPLATE LITERAL: the page
	// markup AND its script. Nothing inside may contain a backtick — one stray one ends the
	// literal and turns the whole builder into a syntax error (hit three times while writing
	// this). Use plain quotes in the page's comments and code, and never write a template
	// literal in the page's JavaScript.
	return `<!DOCTYPE html>
<html lang="zh" data-tq-preview="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dsh-thinking-quips — 动画总览</title>
<style>${PAGE_CSS}</style>
${chatStyle}
${shimmerStyle}
</head>
<body data-scheme="light">
<div class="section">
<h1>dsh-thinking-quips — 全部动画与图标总览</h1>
<p class="note">本页不是插件的复刻：它<b>原样运行 <code>lib/client.js</code></b>，并直接调用插件自己的
<code>injectPluginCss()</code> / <code>ensureLoader()</code> / <code>applyStatusText()</code> / <code>apply()</code>，
画在下面这些<b>仿造的运行行</b>上（标记形状与 DSH 一致，所以插件用的锚点是同一套）。
${origin}<br>
页面的 <code>--dsw-*</code> 颜色是<b>近似值</b>，只为脱离 app 也能出效果；真实观感以 DSH 界面为准。
设置行（React 组件）不在本页范围内，它需要 DSH 运行时。</p>

<div class="bar">
	<label>主题 <select id="scheme"><option value="light">浅色</option><option value="dark">深色</option></select></label>
	<label>动画速度 <select id="speed"><option value="slow">慢</option><option value="normal" selected>正常</option><option value="fast">快</option></select></label>
	<label>字体颜色 <input type="text" id="color" value="shimmer" size="10" title="shimmer 或 #rrggbb"></label>
	<label>扫光亮度 <input type="number" id="glow" value="35" min="0" max="100"></label>
	<label><input type="checkbox" id="reduced"> 模拟 reduced-motion（仅插件的 JS 判断；CSS 那半请改系统设置后刷新）</label>
</div>

<h2>1. 完整状态行（真实轮播）</h2>
<p class="note">这一行调用的是插件的 <code>apply()</code>：真的轮播俏皮话、真的用时、真的 600ms 重断言循环。
下面的控件改的是插件的<b>真实配置</b>（<code>patchConfig</code>），改动会在下一轮扫描时生效。
<b>这一段必须排在所有仿造行之前</b>：插件用 <code>document.querySelector("[data-chat-running]")</code> 找自己的行，
也就是文档里的<b>第一个</b>匹配。</p>
<div id="live" style="margin:12px 0 6px"></div>
<div class="facts" id="liveFacts"></div>
<div class="bar">
	<label>加载图标 <select id="loader"></select></label>
	<label>尺寸 <select id="loaderSize"><option value="sm">小</option><option value="md" selected>中</option><option value="lg">大</option></select></label>
	<label>文字特效 <select id="textEffect"></select></label>
	<label>用时 <select id="clockMode"></select></label>
	<label>语言 <select id="locale"><option value="zh">中文</option><option value="en">English</option></select></label>
	<label>每条 <input type="number" id="quipMs" value="3000" min="1000" max="120000"></label>
	<label>只显示图标 <input type="checkbox" id="indicatorOnly"></label>
</div>

<h2>2. 加载图标：9 种样式 × 3 种尺寸</h2>
<p class="note">每格都是对同一个仿造运行行调用一次 <code>ensureLoader()</code>。
<b>DSH 自己的鲸鱼是"可选项之一"</b>：只要插件画了自己的图标，就会给运行行打上
<code>data-tq-icon</code>，样式表据此把 DSH 那只收起来——所以屏幕上永远只有一个指示图标；
想要官方那只，就选 <code>native</code>。
<code>native</code> 走 <b>cloneNode</b>（格子里预置了 DSH 的鲸鱼节点）；最下面一行是
<code>native</code> 在<b>没有鲸鱼节点</b>时的 <b>CSSOM mask</b> 回退。<code>stateDot</code> 需要 DSH 的 React 组件，
本页提供不了种子，因此它会显示插件的兜底图标（圆环）——这正是老外壳上会发生的事。</p>
<div class="grid" id="matrix"></div>

<h2>3. 文字特效</h2>
<p class="note">每行调用一次 <code>applyStatusText()</code>。两种特效：<code>wave</code> 完全由插件自己画；
<code>shimmer</code> 渲染 DSH 官方的 <code>TextShimmer</code> 组件，本页没有 React 运行时，
所以走插件的<b>降级路径</b>（纯文本，不动画）——这也正是缺种子时的真实行为。</p>
<div id="effects"></div>
<p class="note">开发者工具里 <code>window.__tqPreview</code> 就是插件的 <code>__internal</code> 接缝，可以直接调它的函数。<br>可用开发者工具检查这些行上的 <code>data-tq-owned</code> / <code>data-tq-icon</code> /
<code>data-style</code> / <code>data-effective</code> / <code>data-scale</code>，它们就是插件在真实界面里写下的标记。
若浏览器禁止 <code>file://</code> 页面使用 localStorage，控件改动不会生效——插件会退回出厂默认（轮播与图标仍然工作）。</p>

<h2>4. 图标：设置分栏 + 插件列表</h2>
<p class="note"><b>设置分栏图标</b>是 DSH <b>按分栏 id 硬编码</b>的（<code>navIcon()</code>，未知 id 一律回落到
<b>齿轮</b>），第三方分栏没有图标入口 —— 所以插件给自己的导航行打标记、再用 CSS mask 画上官方那只鲸鱼；
下面把<b>官方齿轮</b>、<b>官方「内置插件」图标</b>与<b>插件导航图标</b>并排（16px + 8× 放大，都是它在这页上的真实观感）。</p>
<p class="note" id="navicons-source"></p>
<div id="navicons"></div>
<p class="note"><b>插件列表图标</b>（设置 → 内置插件里每一行的图标）走的是另一条路：<code>package.json</code> 的顶层
<code>icon</code> 字段，Host 读成 data URI 喂给页面，尺寸不限但周边样式由清单提供 —— 所以图标自己要是
<b>36×36、透明底、圆角、柔和渐变</b>。<code>locale/&lt;语言&gt;.json</code> 提供那一行的标题与描述
（必须被 <code>exports</code> 暴露，否则会回落成包名 —— 这行以前就是那样）。</p>
<div id="listicons"></div>

<h2>5. 官方扫光的亮度</h2>
<p class="note">这一节是 DSH 官方 <code>TextShimmer</code> 的<b>真实 DOM 结构与真实样式表</b>
（<code>TextShimmer.module.css</code> 在构建时从 primitives 原样内联，用 <code>@scope</code> 限定在本节内，没有改写任何选择器）。
它的高光就是 <code>.sweep{ color: var(--dsw-alias-label-shimmer) }</code> 加上一道移动的渐变遮罩 ——
所以设置里的「<b>扫光亮度</b>」改的正是这个 token（把文字色往白里混）：0% 时高光与文字同色（看不出扫光），
100% 时纯白。拖动上面的亮度框，下面的高光会跟着变。</p>
<p class="note" id="shimmer-facts"></p>
<div id="shimmer"></div>
</div>

<script type="text/plain" id="tq-source">${source}</script>
<script>
(function () {
	"use strict";
	var SRC = document.getElementById("tq-source").textContent;
	var FISH = ${JSON.stringify(fishSeed)};
	var NAVICONS = ${JSON.stringify(navSpecimens)};
	var LIST_ICONS = ${JSON.stringify(listIcons())};
	var SHIMMER_CSS = ${JSON.stringify(assets === null || assets.shimmerCss === null ? null : true)};
	var disposers = [];
	var api = null;
	/* The plugin's own reduced-motion check is a matchMedia call, and this page can patch
	   that. The CSS half of reduced motion is a real media query and stays out of reach —
	   set the OS preference to see that one (the page says so). */
	var forceReduced = false;
	var realMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
	function mediaStub(matches, query) {
		return { matches: matches, media: query, onchange: null, addEventListener: noop,
			removeEventListener: noop, addListener: noop, removeListener: noop, dispatchEvent: function () { return false; } };
	}
	window.matchMedia = function (query) {
		if (forceReduced && /prefers-reduced-motion/.test(String(query))) return mediaStub(true, query);
		return realMatchMedia ? realMatchMedia(query) : mediaStub(false, query);
	};

	/* The module shim. react/react-dom are stubbed because the page has no React: that is
	   exactly the "older shell" situation the plugin is required to survive. The fish seed
	   carries the two constants the builder extracted from the installed primitives, so the
	   official logo is the real one. */
	function requireShim(name) {
		if (name === "react") return { createElement: function () { throw new Error("no React in the preview page"); } };
		if (name === "react/jsx-runtime") return { jsx: noop, jsxs: noop };
		if (name === "react-dom/client") throw new Error("no react-dom in the preview page");
		if (name === "@deepseek-ai/dsh-client-ui-primitives") {
			if (FISH === null) throw new Error("no seeded primitives in the preview page");
			return { FISH_LOGO_PATH: FISH.FISH_LOGO_PATH, FISH_LOGO_VIEWBOX: FISH.FISH_LOGO_VIEWBOX };
		}
		throw new Error("unexpected require in the preview page: " + name);
	}
	function noop() {}

	/** Fresh module state, so every boot reads the config again. */
	function boot() {
		var captured = null;
		window.__ModuleLoader__ = { load: function (def) { captured = def; } };
		window.__DSH_THINKING_QUIPS__ = false;
		new Function(SRC)();
		if (captured === null) throw new Error("the plugin did not register itself");
		return captured.factory(requireShim);
	}

	function el(tag, className, text) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}
	function html(markup) {
		var box = el("span");
		box.innerHTML = markup;
		return box.firstElementChild;
	}
	function whaleMarkup() {
		var rest = ${JSON.stringify(assets === null ? "" : assets.restPath)};
		return '<span class="EvIC1a_runningIcon" aria-hidden="true"><span class="EvIC1a_runningWhaleAnimated"></span>' +
			'<svg class="EvIC1a_runningWhaleStill" width="100%" height="100%" viewBox="0 0 16 16" fill="none">' +
			'<path d="' + rest + '" stroke="currentColor" stroke-width="1"></path></svg></span>';
	}
	/** A mock running line with an optional whale, i.e. exactly what DSH renders during a turn. */
	/* Every mock line carries data-chat-running, like the real one. The plugin finds its
	   line with document.querySelector, i.e. the FIRST match in DOCUMENT ORDER, which is why
	   the live section is the first section on the page: that is the line the plugin drives,
	   and the gallery rows are painted by calling its painters directly. */
	function mockLine(withWhale) {
		return html('<span class="mock" data-chat-running="true"><span class="EvIC1a_runningContent">' +
			(withWhale ? whaleMarkup() : "") +
			'<span class="EvIC1a_runningText" data-shimmer="true"><span class="content"><span class="text">深度求索中</span></span></span>' +
			"</span></span>");
	}

	/* ── the loader matrix ─────────────────────────────────────────────────── */
	function buildMatrix() {
		var host = document.getElementById("matrix");
		host.innerHTML = "";
		var head = el("div", "head");
		head.textContent = "样式";
		host.appendChild(head);
		["sm", "md", "lg"].forEach(function (size) {
			var h = el("div", "head");
			h.textContent = "尺寸 " + size;
			host.appendChild(h);
		});
		api.LOADER_STYLES.forEach(function (style) {
			var name = el("div", "name", style);
			host.appendChild(name);
			["sm", "md", "lg"].forEach(function (size) {
				var cell = el("div", "cell");
				// native clones the whale out of the line, so only its cells carry one.
				var line = mockLine(style === "native");
				cell.appendChild(line);
				host.appendChild(cell);
				api.ensureLoader(line, style, size);
				var facts = el("span", "facts");
				var span = line.querySelector(".tq-loader");
				facts.textContent = span === null ? "（无图标）"
					: "data-style=" + span.getAttribute("data-style") + " data-effective=" + span.getAttribute("data-effective");
				cell.appendChild(facts);
			});
		});
		// The CSSOM fallback: native with no whale node to copy, reading the mask out of
		// the chat package's stylesheet (which this page inlines with its plugin-css marker).
		var name = el("div", "name", "native（无鲸鱼节点）");
		host.appendChild(name);
		var cell = el("div", "cell");
		var line = mockLine(false);
		cell.appendChild(line);
		host.appendChild(cell);
		api.ensureLoader(line, "native", "md");
		var span = line.querySelector(".tq-loader");
		var facts = el("span", "facts");
		facts.textContent = span === null ? "（无图标）"
			: "data-effective=" + span.getAttribute("data-effective") + " mask=" + (span.style.maskImage || span.style.webkitMaskImage || "none").slice(0, 28) + "…";
		cell.appendChild(facts);
	}

	/* ── the text effects ──────────────────────────────────────────────────── */
	function buildEffects() {
		var host = document.getElementById("effects");
		host.innerHTML = "";
		api.TEXT_EFFECTS.forEach(function (effect) {
			var row = el("div");
			row.style.margin = "10px 0";
			var label = el("div", "name", effect);
			// No whale on these rows: in the app the plugin has already retired DSH's icon,
			// and these rows are about what the TEXT does.
			var line = mockLine(false);
			row.appendChild(label);
			row.appendChild(line);
			host.appendChild(row);
			api.applyStatusText(line, effect === "wave" ? "正在梳理脉络…" : "正在思考，用时 3秒 ···", {
				textEffect: effect, color: "shimmer"
			});
			var target = line.querySelector(".tq-line") || line;
			var facts = el("div", "facts");
			facts.textContent = "textEffect=" + effect + " → " + (target.querySelector(".tq-wave") ? "wave" : target.querySelector(".tq-official") ? "official sweep" : "plain text (no primitives here)");
			row.appendChild(facts);
		});
	}

	/* ── the settings-nav glyph, beside DSH's own ──────────────────────────── */
	function buildNavIcons() {
		var host = document.getElementById("navicons");
		var note = document.getElementById("navicons-source");
		host.innerHTML = "";
		if (note) {
			note.textContent = NAVICONS === null
				? "（未在本机找到 DSH 安装：官方对照图标缺失，本节只显示插件用来做导航图标的那枚鲸鱼。）"
				: "官方对照图标自本机 primitives 提取（构建时读取，非手工抄写）。";
		}
		var specimens = [];
		if (NAVICONS !== null) {
			specimens.push({ title: "DSH 通用设置（未知 id 的回落）", inner: NAVICONS.gear });
			specimens.push({ title: "DSH 内置插件", inner: NAVICONS.plugins });
			// The official running whale, extracted from the installed chat package: the plugin's
			// nav icon IS this drawing, and test-adapt-02 asserts the two are still identical.
			// It arrives as a bare path-data string, so it is rendered as a path element.
			specimens.push({ title: "DSH 官方鲸鱼（运行行那只）", path: NAVICONS.whale, whale: true });
		}
		// The plugin's nav glyph is rendered from the SAME source the CSS mask uses, so this
		// column cannot drift from what the nav rail paints.
		specimens.push({ title: "插件导航图标（俏皮话）", inner: null, own: true });
		specimens.forEach(function (specimen) {
			var card = el("div", "naviconCard");
			card.appendChild(el("div", "name", specimen.title));
			var row = el("div", "naviconRow");
			// The whale is drawn at its own weight (1); the outline icons at the nav's 1.3.
			var weight = specimen.whale ? api.NAV_ICON_STROKE : api.ICON_MEDIUM_STROKE;
			[16, 128].forEach(function (size) {
				var box = el("div", "naviconBox");
				box.style.width = size + "px";
				box.style.height = size + "px";
				var svg = specimen.own
					? html(api.navIconDocument("currentColor"))
					: html('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" ' +
						'stroke-width="' + weight + '">' +
						(specimen.path ? '<path d="' + specimen.path + '" stroke="currentColor"/>' : specimen.inner) +
						"</svg>");
				if (svg !== null) {
					svg.setAttribute("width", String(size));
					svg.setAttribute("height", String(size));
					box.appendChild(svg);
				}
				box.appendChild(el("div", "naviconSize", size + "px"));
				row.appendChild(box);
			});
			card.appendChild(row);
			host.appendChild(card);
		});
	}

	/* ── the official sweep, reproduced so the brightness control can be seen ─ */
	/**
	 * A faithful copy of what TextShimmer renders, with the plugin's colour + brightness applied
	 * the same way applyColorCSS/paintHost do it on a running line.
	 *
	 * WHY A COPY: the page has no React, and the component is the only place the official sweep
	 * exists. The stylesheet below is the real one, inlined inside an @scope rule, and the markup
	 * mirrors the component's own structure (root / content / decoration > sweep > highlight, with
	 * the data-shimmer-text attribute that .text[data-shimmer-text]::after draws).
	 */
	function buildShimmer() {
		var host = document.getElementById("shimmer");
		var facts = document.getElementById("shimmer-facts");
		host.innerHTML = "";
		if (SHIMMER_CSS === null) {
			if (facts) facts.textContent = "（未在本机找到 DSH 安装：官方 TextStyle 样式表缺失，本节留空。）";
			return;
		}
		var controls = readControls();
		var base = controls.color === "shimmer" || !controls.color ? api.DEFAULT_BLUE : controls.color;
		var glow = Math.max(0, Math.min(100, Number(controls.glow) || 0));
		var sweep = api.mixToWhite(base, glow / 100);
		var text = "深度求索中，用时 27秒 ···";
		var row = el("div", "shimRow");
		var box = el("div", "tq-shim");
		// Exactly what the plugin writes onto a running wrapper: the text colour and the sweep's
		// highlight token. --dsw-alias-label-shimmer is the one the component's .sweep reads.
		box.style.color = base;
		box.style.setProperty("--dsw-alias-label-shimmer", sweep);
		box.innerHTML = '<span class="root" data-shimmer=""><span class="content">' +
			'<span class="text" data-shimmer-text="' + text + '"></span></span>' +
			'<span class="decoration" aria-hidden="true"><span class="sweep">' +
			'<span class="content highlight"><span class="text">' + text + '</span></span>' +
			"</span></span></span>";
		row.appendChild(box);
		host.appendChild(row);
		if (facts) {
			facts.textContent = "color=" + controls.color + "  glow=" + glow + "%  →  " +
				"--dsw-alias-label-shimmer: " + sweep + "  (文字色 " + base + ")";
		}
	}

	/* ── the plugin-list icon, beside the one shipped row that declares one ─── */
	/**
	 * The inventory's leading artwork: our own icon.svg in the row's own tile, next to
	 * dsh-better-sidebar's icon for scale/style comparison. Both are 36x36 documents with a
	 * transparent background, so the tile here is the page's copy of the inventory's tile.
	 */
	function buildListIcons() {
		var host = document.getElementById("listicons");
		host.innerHTML = "";
		var entries = [{ title: "插件列表图标（dsh-thinking-quips）", svg: LIST_ICONS.own }];
		if (LIST_ICONS.reference !== null) entries.push({ title: "参考：dsh-better-sidebar（本机提取）", svg: LIST_ICONS.reference });
		entries.forEach(function (entry) {
			var card = el("div", "naviconCard");
			card.appendChild(el("div", "name", entry.title));
			var row = el("div", "naviconRow");
			[40, 96].forEach(function (size) {
				var tile = el("div", "iconTile");
				tile.style.width = (size * 1.4) + "px";
				tile.style.height = (size * 1.4) + "px";
				var box = el("div", "naviconBox");
				var holder = el("span");
				holder.innerHTML = entry.svg === null ? "" : entry.svg;
				var svg = holder.querySelector("svg");
				if (svg !== null) {
					svg.setAttribute("width", String(size));
					svg.setAttribute("height", String(size));
					box.appendChild(svg);
				}
				tile.appendChild(box);
				row.appendChild(tile);
			});
			card.appendChild(row);
			host.appendChild(card);
		});
	}

	/* ── the live line: the real apply() loop ──────────────────────────────── */
	function config(extra) {
		var base = { enabled: true, color: "shimmer", colorTheme: false, langMode: "ui", quipMs: 8000, glow: 35,
			indicatorOnly: false, loader: "orbit", loaderSize: "md",
			textEffect: "shimmer", speed: "normal", clockMode: "inline" };
		for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) base[key] = extra[key];
		return base;
	}
	/** One source of truth for the controls, so no handler can drift from another. */
	function readControls() {
		return config({
			quipMs: Number(document.getElementById("quipMs").value) || 3000,
			loader: document.getElementById("loader").value,
			loaderSize: document.getElementById("loaderSize").value,
			textEffect: document.getElementById("textEffect").value,
			clockMode: document.getElementById("clockMode").value,
			indicatorOnly: document.getElementById("indicatorOnly").checked,
			speed: document.getElementById("speed").value,
			color: document.getElementById("color").value || "shimmer",
			glow: Number(document.getElementById("glow").value) || 0
		});
	}

	var liveLine = null;
	var livePlugin = null;
	/* A locked-down browser can refuse localStorage on a file:// page; the plugin already
	   falls back to its defaults for reading, so writing is guarded here too (otherwise the
	   whole page would stop at the first control). */
	function storeConfig(cfg) {
		try { window.localStorage.setItem("dsh-thinking-quips.config", JSON.stringify(cfg)); }
		catch (e) { /* the plugin falls back to its shipped defaults */ }
	}
	function bootLive() {
		disposers.forEach(function (dispose) { try { dispose(); } catch (e) {} });
		disposers = [];
		var target = document.getElementById("live");
		target.innerHTML = "";
		liveLine = mockLine(true);
		target.appendChild(liveLine);
		// A fresh module per boot, so the config is read again (the store is module state).
		livePlugin = boot();
		api = livePlugin.__internal;
		// ...and THIS is the instance to poke from the console: it is the one that was applied
		// and is polling. (Each boot is a fresh module, so a probe instance has its own state —
		// its locale, its rotation clock — and would answer for a plugin that is not running.)
		window.__tqPreview = api;
		api.injectPluginCss();
		storeConfig(readControls());
		var locale = document.getElementById("locale").value;
		livePlugin.apply({
			on: function () {},
			locale: { register: function () { return function () {}; }, getLocale: function () { return { active: locale }; } },
			slots: { inject: function (name, cb) { cb(); return function () {}; }, register: function () { return function () {}; } },
			effect: function (fn) { var dispose = fn(); if (typeof dispose === "function") disposers.push(dispose); return dispose; }
		});
	}

	/** Live updates go through the plugin's own config writer; its poll re-asserts them. */
	function pushConfig() {
		if (livePlugin === null) return;
		livePlugin.__internal.patchConfig(readControls());
	}

	function fillSelect(id, values, selected, label) {
		var select = document.getElementById(id);
		select.innerHTML = "";
		values.forEach(function (value) {
			var option = document.createElement("option");
			option.value = value;
			option.textContent = label ? label(value) : value;
			if (value === selected) option.selected = true;
			select.appendChild(option);
		});
	}

	function start() {
		var probe = boot();
		api = probe.__internal;
		// The plugin's own test seam, on the page, so the devtools console can call exactly what
		// the tests call (and so a harness can drive the page). Same object the self-checks use.
		window.__tqPreview = api;
		api.injectPluginCss();
		// The plugin's own tables drive the page's controls, so a new style appears here by
		// itself (and the freshness check fails if the page was not rebuilt).
		fillSelect("loader", api.LOADER_STYLES, "orbit");
		fillSelect("textEffect", api.TEXT_EFFECTS, "shimmer");
		fillSelect("clockMode", api.CLOCK_MODES, "inline");
		buildMatrix();
		buildEffects();
		buildNavIcons();
		buildShimmer();
		buildListIcons();
		bootLive();
		document.getElementById("scheme").addEventListener("change", function (e) {
			document.documentElement.setAttribute("data-scheme", e.target.value);
			document.body.setAttribute("data-scheme", e.target.value);
		});
		["loader", "loaderSize", "textEffect", "clockMode", "quipMs", "indicatorOnly", "locale"].forEach(function (id) {
			document.getElementById(id).addEventListener("change", function () {
				pushConfig();
				if (id === "locale") bootLive(); // the locale is read once per apply()
			});
		});
		["speed", "color", "glow"].forEach(function (id) {
			document.getElementById(id).addEventListener("change", function () {
				pushConfig();      // the plugin repaints --tq-speed / the colour for the whole document
				buildMatrix();     // ...and the cells are rebuilt so the morph picks the new speed up
				buildShimmer();    // the sweep's highlight follows the brightness control
			});
		});
		document.getElementById("reduced").addEventListener("change", function (e) {
			forceReduced = e.target.checked;
			buildMatrix(); // the morph decides at build time whether to animate
		});
	}

	// Show the live line's DOM facts once a second, so the markers are inspectable at a glance.
	setInterval(function () {
		var box = document.getElementById("liveFacts");
		var line = liveLine && liveLine.querySelector(".tq-line");
		if (!line) { box.textContent = ""; return; }
		box.textContent = "line.class=" + line.className
			+ " | wrapper: data-tq-owned=" + liveLine.getAttribute("data-tq-owned")
			+ " data-tq-icon=" + liveLine.getAttribute("data-tq-icon")
			+ " | " + (line.querySelector(".tq-clock") ? "clock=separate" : "clock=inline/off")
			+ " | text=" + JSON.stringify(line.textContent.slice(0, 28));
	}, 1000);

	start();
})();
</script>
</body>
</html>
`;
}

/** `--check` support and the default write path. */
function main() {
	const html = buildPreview();
	const check = process.argv.includes("--check");
	if (check) {
		const existing = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, "utf8") : null;
		if (existing !== html) {
			console.error("preview/animations.html is stale — run: node tools/build-preview.mjs");
			process.exit(1);
		}
		console.log("preview/animations.html is up to date");
		return;
	}
	mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
	writeFileSync(OUTPUT_PATH, html, "utf8");
	console.log(`wrote ${OUTPUT_PATH} (${html.length} bytes)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
