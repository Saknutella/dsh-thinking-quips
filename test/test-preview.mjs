// The animation preview page: does `preview/animations.html` still match the plugin?
//
// The page is a build artifact, and a stale preview is worse than none — it shows an old
// plugin and looks authoritative. So the anti-drift rule is enforced here rather than in
// the README: this suite rebuilds the page in memory and fails when the committed file
// differs, which makes "I added a loader and forgot to rebuild" a red self-check. The
// rebuilt page also has to still be driven by the plugin's own tables (a hand-written list
// of styles in the page would rot silently), and both embedded scripts have to parse.
//
// On a machine without a DSH install the official assets cannot be extracted; the page is
// then legitimately different, so the freshness check is skipped and only the structural
// assertions run.

import { existsSync, readFileSync } from "node:fs";

// The builder's page is ONE template literal (markup + script), so a single backtick anywhere
// inside it ends the literal and the builder stops parsing — a syntax error whose message points
// at the page's text, not at the real mistake. It is an easy slip to make (three times so far),
// so scan the region as TEXT before importing the builder: a clear message beats a wall of
// "Unexpected identifier".
const builderPath = new URL("../tools/build-preview.mjs", import.meta.url);
const builderText = readFileSync(builderPath, "utf8");
const templateStart = builderText.indexOf("return `<!DOCTYPE html>");
if (templateStart === -1) {
	console.log("FAIL the builder's page template could not be located");
	process.exit(1);
}
const templateEnd = builderText.indexOf("\n}\n", templateStart);
const template = builderText.slice(templateStart, templateEnd === -1 ? builderText.length : templateEnd);
// The template's own closing backtick is the last one in the region; anything before it is a
// stray that would end the literal early.
const closing = template.lastIndexOf("`");
const stray = template.indexOf("`", "return `".length);
if (stray !== -1 && stray < closing) {
	const line = builderText.slice(0, templateStart + stray).split("\n").length;
	const text = builderText.split("\n")[line - 1].trim();
	console.log(`FAIL a backtick inside the page template ends the literal (line ${line}): ${text}`);
	process.exit(1);
}
console.log("OK   the page template holds no stray backtick");

const { buildPreview, officialAssets, OUTPUT_PATH } = await import("../tools/build-preview.mjs");

const failures = [];
function ok(label, condition, detail) {
	if (!condition) failures.push(label + (detail === undefined ? "" : " -> " + detail));
	console.log(`${condition ? "OK  " : "FAIL"} ${label}${detail === undefined ? "" : " -> " + detail}`);
}

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const built = buildPreview();
const assets = officialAssets();
const committed = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, "utf8") : null;

console.log("── the committed page ──");
if (assets === null) {
	console.log("SKIP no DSH install found (DSH_HOME unset or incomplete): the official assets cannot be");
	console.log("     extracted, so the committed page may differ legitimately. Structural checks only.");
} else {
	ok("the page is committed", committed !== null, OUTPUT_PATH);
	ok("the committed page matches a fresh build", committed === built,
		committed === null ? "missing" : "run: node tools/build-preview.mjs");
}

console.log("\n── the page drives the plugin, not a copy ──");
const page = committed === null ? built : committed;
ok("the plugin source is embedded verbatim", page.indexOf(source) !== -1);
ok("the matrix is driven by the plugin's own loader table", page.indexOf("api.LOADER_STYLES.forEach") !== -1);
ok("the effect rows are driven by the plugin's own effect table", page.indexOf("api.TEXT_EFFECTS.forEach") !== -1);
ok("the loaders are painted by the plugin's own painter", page.indexOf("api.ensureLoader(") !== -1);
ok("the effects are painted by the plugin's own painter", page.indexOf("api.applyStatusText(") !== -1);
ok("live updates go through the plugin's own config writer", page.indexOf("patchConfig(readControls())") !== -1);
ok("the mock line carries the anchor the plugin looks for", page.indexOf('data-chat-running="true"') !== -1);
// The plugin finds its line with document.querySelector, i.e. the FIRST match in document
// order: with the matrix first, the plugin painted a gallery cell instead of the live line
// and the live demo sat empty (found by rendering the page, liveText came back null).
ok("the live line comes before the gallery rows",
	page.indexOf('id="live"') !== -1 && page.indexOf('id="live"') < page.indexOf('id="matrix"'));

console.log("\n── the official assets ──");
if (assets === null) {
	console.log("SKIP no DSH install: the whale and logo assets are absent from the page by design");
} else {
	ok("the whale's APNG mask is inlined", page.indexOf("data:image/png;base64,") !== -1);
	ok("the whale markup carries DSH's own class tokens", page.indexOf("EvIC1a_runningWhaleAnimated") !== -1);
	ok("the static whale fallback path is inlined", page.indexOf(assets.restPath.slice(0, 40)) !== -1);
	ok("the fish logo path is inlined", page.indexOf(assets.fishPath.slice(0, 40)) !== -1);
	ok("the page names the DSH version it extracted from", page.indexOf(assets.chatVersion) !== -1, assets.chatVersion);
	ok("the chat stylesheet keeps its plugin-css marker", page.indexOf('data-plugin-css="@deepseek-ai/dsh-client-ui-chat/ChatView.module.css"') !== -1);
}

console.log("\n── both embedded scripts parse ──");
try {
	new Function(source); // compile only: the module body needs a browser
	ok("the embedded plugin source is valid JavaScript", true);
} catch (error) {
	ok("the embedded plugin source is valid JavaScript", false, error.message);
}
{
	// The page's own script is the last <script> block. Compiling it catches a typo that
	// would otherwise only show up by opening the page and noticing nothing happens.
	const blocks = page.match(/<script>([\s\S]*?)<\/script>/g) || [];
	ok("the page has exactly one behaviour script", blocks.length === 1, String(blocks.length));
	const body = blocks.length === 1 ? blocks[0].replace(/^<script>/, "").replace(/<\/script>$/, "") : "";
	try {
		new Function(body); // compile only: it needs a browser to run
		ok("the page script is valid JavaScript", true);
	} catch (error) {
		ok("the page script is valid JavaScript", false, error.message);
	}
	ok("the page script was fully interpolated at build time", body.indexOf("${") === -1);
	ok("the plugin source block is a raw-text script", page.indexOf('<script type="text/plain" id="tq-source">') !== -1);
}

console.log("\n── the page explains what it cannot show ──");
ok("the stateDot limitation is stated", page.indexOf("stateDot") !== -1 && page.indexOf("React") !== -1);
ok("the approximateness of the theme tokens is stated", page.indexOf("近似值") !== -1);
ok("the shimmer/official limitation is stated", page.indexOf("TextShimmer") !== -1);

if (failures.length > 0) {
	console.error(`\nPREVIEW CHECKS FAILED: ${failures.length}`);
	for (const failure of failures) console.error("  - " + failure);
	process.exit(1);
}
console.log("\nALL PREVIEW CHECKS PASSED");
