// Standalone verification of the sectioned quips parse + language selection.
// Mirrors parseQuips/selectPhrases exactly (single source: no built-in fallback).

function effectiveLang(locale) { return locale === "zh" ? "zh" : "en"; }
function parseQuips(text) {
	const out = { zh: [], en: [], other: [] };
	if (typeof text !== "string" || text.trim() === "") return out;
	let section = "other";
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "") continue;
		const m = /^#\s*(.+)$/.exec(line);
		if (m) {
			const h = m[1].trim().toLowerCase();
			section = (h.indexOf("中文") !== -1 || h === "chinese" || h.indexOf("zh") !== -1) ? "zh"
				: (h.indexOf("英文") !== -1 || h === "english" || h.indexOf("en") !== -1) ? "en"
				: "other";
			continue;
		}
		for (const part of line.split(";")) {
			const item = part.trim();
			if (item) out[section].push(item);
		}
	}
	return out;
}
function selectPhrases(cfg, locale) {
	const lang = effectiveLang(locale);
	const mode = cfg.langMode || "ui";
	const sections = parseQuips(cfg.quips);
	let list;
	if (mode === "mix") list = sections.zh.concat(sections.en);
	else if (mode === "zh") list = sections.zh.slice();
	else if (mode === "en") list = sections.en.slice();
	else list = (lang === "zh" ? sections.zh : sections.en).slice();
	if (sections.other.length) list = list.concat(sections.other);
	return list; // single source: empty -> no quips
}

const text = "# Chinese\naaa\nbbb\n# English\nccc\nddd\n通用行\n";
function check(name, cfg, locale, expected) {
	const got = selectPhrases(cfg, locale);
	const ok = JSON.stringify(got) === JSON.stringify(expected);
	console.log((ok ? "OK  " : "FAIL") + " " + name + " -> " + JSON.stringify(got));
	if (!ok) { console.log("     expected " + JSON.stringify(expected)); process.exitCode = 1; }
}

check("mix", { langMode: "mix", quips: text }, "zh", ["aaa", "bbb", "ccc", "ddd", "通用行"]);
check("zh-only", { langMode: "zh", quips: text }, "zh", ["aaa", "bbb"]);
check("en-only", { langMode: "en", quips: text }, "zh", ["ccc", "ddd", "通用行"]);
check("follow-zh(ui=zh)", { langMode: "ui", quips: text }, "zh", ["aaa", "bbb"]);
check("follow-en(ui=en)", { langMode: "ui", quips: text }, "en", ["ccc", "ddd", "通用行"]);
// "other" = lines before the first # header, always shown
check("other-before-header(zh)", { langMode: "zh", quips: "前导行\n# Chinese\nzzz\n" }, "zh", ["zzz", "前导行"]);
// empty chosen section -> empty (no built-in fallback)
check("empty-zh-section", { langMode: "zh", quips: "# English\nccc\nddd\n" }, "zh", []);
check("empty-en-section", { langMode: "en", quips: "# Chinese\naaa\nbbb\n" }, "zh", []);
// no sections -> other (always shown)
check("unsectioned-other", { langMode: "mix", quips: "x1\nx2\n" }, "zh", ["x1", "x2"]);
// empty quips -> empty
check("no-quips", { langMode: "ui", quips: "" }, "zh", []);
// legacy flat string (no sections) -> other
check("flat-string", { langMode: "mix", quips: "a1;a2" }, "zh", ["a1", "a2"]);

console.log(process.exitCode ? "SECTION LOGIC HAS FAILURES" : "ALL SECTION CHECKS PASSED");
