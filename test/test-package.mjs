// The package metadata DSH reads WITHOUT loading the plugin.
//
// Settings → 内置插件 builds its rows from the manifest alone (see `packageMeta` in
// dsh-app-boot): a top-level `icon` — a relative path inside the manifest directory, one of
// SVG/PNG/JPEG/WebP, at most 256 KiB, handed to the page as a data URI — and `locale/<lang>.json`
// files whose `meta.title` / `meta.description` are resolved THROUGH the package's `exports` map.
//
// Every rule has a silent failure mode, which is why this suite exists instead of trusting the
// UI: a bad icon path falls back to the panel's default artwork, and a locale file that `exports`
// does not expose falls back to the raw package name — the row used to read "dsh-thinking-quips"
// with a placeholder glyph for exactly that reason. The icon is also checked against the style
// recipe of the one shipped row that declares one (dsh-better-sidebar: 36x36 box, transparent
// background, soft gradients), because a wrong-sized icon ships unnoticed.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MAX_ICON_BYTES = 256 * 1024;
const ICON_EXTENSIONS = [".svg", ".png", ".jpg", ".jpeg", ".webp"];

let failures = 0;
function ok(label, condition, detail) {
	if (!condition) failures += 1;
	console.log(`${condition ? "OK  " : "FAIL"} ${label}${detail === undefined ? "" : " -> " + detail}`);
}

const manifestPath = join(PLUGIN_DIR, "package.json");
const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
ok("the manifest is readable JSON", typeof pkg.name === "string" && pkg.name === "dsh-thinking-quips", pkg.name);

// ── the icon ─────────────────────────────────────────────────────────────────
console.log("\n── the icon the inventory reads ──");
{
	const icon = pkg.icon;
	ok("declares a top-level icon", typeof icon === "string" && icon !== "", String(icon));
	ok("as a relative path", !isAbsolute(icon) && !/^[A-Za-z][A-Za-z\d+.-]*:/u.test(icon), String(icon));
	ok("with an accepted extension", ICON_EXTENSIONS.indexOf(extname(icon).toLowerCase()) !== -1, extname(icon));
	const file = resolve(PLUGIN_DIR, icon);
	const local = relative(PLUGIN_DIR, file);
	ok("that stays inside the manifest directory", local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local), local);
	ok("and is a regular file", existsSync(file) && statSync(file).isFile(), local);
	// DSH rejects a symlink that leaves the directory; this plugin has no symlinks at all.
	ok("resolving to itself (no escaping symlink)", realpathSync(dirname(file)) === realpathSync(PLUGIN_DIR));
	ok("within the 256 KiB cap", statSync(file).size <= MAX_ICON_BYTES, `${statSync(file).size} bytes`);

	// The house recipe, measured from the shipped row that declares an icon.
	const svg = readFileSync(file, "utf8");
	ok("drawn in the same 36x36 box as the shipped icon", svg.indexOf('viewBox="0 0 36 36"') !== -1 && svg.indexOf('width="36"') !== -1);
	ok("with a transparent background (the row paints its own tile)",
		!/<rect[^>]*width="36"[^>]*height="36"/u.test(svg) && svg.indexOf('fill="none"') !== -1);
	ok("using the house's soft gradients", (svg.match(/<linearGradient/gu) ?? []).length >= 2);
	ok("and no script or event handler", !/<script|on[a-z]+\s*=/iu.test(svg));
}

// ── the locale metadata ──────────────────────────────────────────────────────
console.log("\n── the locale files the inventory reads ──");
{
	const base = join(PLUGIN_DIR, "locale", "en.json");
	ok("an English locale file exists (the resolver's base)", existsSync(base));
	// The Host resolves `./locale/<lang>.json` through the exports map; without the pattern the
	// metadata silently degrades to the package name and description.
	ok("the exports map exposes the locale files", pkg.exports && pkg.exports["./locale/*.json"] === "./locale/*.json",
		pkg.exports && String(pkg.exports["./locale/*.json"]));
	ok("and a published tarball would carry them plus the icon",
		Array.isArray(pkg.files) && pkg.files.indexOf("locale/*.json") !== -1 && pkg.files.indexOf("icon.svg") !== -1,
		(pkg.files ?? []).join(", "));

	// The runtime dictionary, read from the source: the row's title must agree with the settings
	// page's title, or the same feature is called two different things.
	const src = readFileSync(join(PLUGIN_DIR, "lib", "client.js"), "utf8");
	const runtimeTitle = (lang) => {
		const block = src.slice(src.indexOf(`const ${lang} = {`), src.indexOf("\n\t\t};", src.indexOf(`const ${lang} = {`)));
		const match = /"quips\.title":\s*"([^"]+)"/u.exec(block);
		return match === null ? null : match[1];
	};
	for (const [language, lang] of [["en", "en"], ["zh", "zh"]]) {
		const file = join(PLUGIN_DIR, "locale", `${language}.json`);
		ok(`locale/${language}.json exists`, existsSync(file));
		if (!existsSync(file)) continue;
		const parsed = JSON.parse(readFileSync(file, "utf8"));
		const meta = parsed.meta ?? {};
		ok(`locale/${language}.json has a title and a description`,
			typeof meta.title === "string" && meta.title.trim() !== "" && typeof meta.description === "string" && meta.description.trim() !== "",
			JSON.stringify(meta.title));
		ok(`locale/${language}.json names the feature the way the page does`, meta.title === runtimeTitle(lang),
			`${JSON.stringify(meta.title)} vs ${JSON.stringify(runtimeTitle(lang))}`);
	}
	const zhTitle = JSON.parse(readFileSync(join(PLUGIN_DIR, "locale", "zh.json"), "utf8")).meta.title;
	const enTitle = JSON.parse(readFileSync(join(PLUGIN_DIR, "locale", "en.json"), "utf8")).meta.title;
	ok("the two languages really differ", zhTitle !== enTitle, `${zhTitle} / ${enTitle}`);
}

// ── what the installed profile actually sees ─────────────────────────────────
console.log("\n── the installed copy ──");
{
	const home = process.env.DSH_HOME;
	let linked = null;
	if (home) {
		// Each profile links the bundle in its OWN node_modules (`profiles/<profile>/node_modules`).
		try {
			for (const profile of readdirSync(join(home, "profiles"), { withFileTypes: true })) {
				if (!profile.isDirectory()) continue;
				const candidate = join(home, "profiles", profile.name, "node_modules", "dsh-thinking-quips");
				try {
					linked = realpathSync(candidate);
					break;
				} catch (_) { /* this profile does not have the plugin */ }
			}
		} catch (_) { linked = null; }
	}
	if (linked === null) {
		console.log("SKIP the profile link (no DSH install found)");
	} else {
		// The profile links this workspace directory, so the metadata DSH reads is this manifest —
		// and the icon is therefore live without reinstalling.
		ok("the profile link points at this directory", linked === realpathSync(PLUGIN_DIR), linked);
		ok("so the linked copy carries the icon", existsSync(join(linked, "icon.svg")));
	}
}

if (failures > 0) {
	console.log(`\nPACKAGE CHECKS FAILED: ${failures}`);
	process.exit(1);
}
console.log("\nALL PACKAGE CHECKS PASSED");
