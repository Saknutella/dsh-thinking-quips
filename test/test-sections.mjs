// Standalone verification of the sectioned quips parse + language selection.
//
// WHY THIS FILE IMPORTS lib/client.js INSTEAD OF COPYING THE FUNCTIONS:
// an earlier revision of this test carried a hand-written "mirror" of
// effectiveLang/parseQuips/selectPhrases, so it could only ever prove that the
// copy agreed with itself. A mutation in the SHIPPED code (e.g. making the
// segment-header test never match) left that file green — exactly the failure
// mode AGENTS.md §3 forbids. Everything below now runs against the functions the
// module actually exposes through `__internal`, so breaking real section logic
// turns this file red.
//
// The module is imported once with the same minimal stubs test-theme.mjs uses:
// `window.__ModuleLoader__.load` captures the factory, and `require()` only ever
// sees the two react entry points the bundle asks for. `effectiveLang` is NOT
// part of the __internal seam, so its behaviour is pinned indirectly through
// selectPhrases (see the "ui" cases).

let loaded = null;
globalThis.window = {
	__ModuleLoader__: { load: (x) => { loaded = x; } },
	__DSH_THINKING_QUIPS__: false
};
globalThis.document = {
	body: { style: { setProperty() {}, removeProperty() {} }, hasAttribute: () => false, getAttribute: () => null },
	documentElement: {},
	getElementById: () => null,
	createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
	querySelectorAll: () => [],
	createTreeWalker: () => ({ nextNode: () => null })
};

const reactStub = { useState: () => [0, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useSyncExternalStore: (_s, get) => get() };
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
// Fail loudly rather than silently skipping: a missing seam must never look like a pass.
if (typeof api.selectPhrases !== "function" || typeof api.parseQuips !== "function") {
	throw new Error("__internal does not expose selectPhrases/parseQuips (test seam missing)");
}
const selectPhrases = api.selectPhrases;
const parseQuips = api.parseQuips;

const text = "# Chinese\naaa\nbbb\n# English\nccc\nddd\n通用行\n";
function check(name, cfg, locale, expected) {
	const got = selectPhrases(cfg, locale);
	const ok = JSON.stringify(got) === JSON.stringify(expected);
	console.log((ok ? "OK  " : "FAIL") + " " + name + " -> " + JSON.stringify(got));
	if (!ok) { console.log("     expected " + JSON.stringify(expected)); process.exitCode = 1; }
}
/** Same OK/FAIL shape, but for the parseQuips buckets themselves. */
function checkSections(name, quips, expected) {
	const got = parseQuips(quips);
	const ok = JSON.stringify(got) === JSON.stringify(expected);
	console.log((ok ? "OK  " : "FAIL") + " " + name + " -> " + JSON.stringify(got));
	if (!ok) { console.log("     expected " + JSON.stringify(expected)); process.exitCode = 1; }
}
const empty = () => ({ zh: [], en: [], other: [] });

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

console.log("\n── boundaries pinned against the real implementation ──");

// WHY check the buckets: selectPhrases only ever returns the slices it selected,
// so a header-matching bug that mis-files lines into "other" can still satisfy
// some of the cases above. Inspecting the three buckets pins where each line
// actually landed, including CRLF input (the settings textarea round-trips
// through localStorage on Windows) and an unknown `#` header ending the section.
checkSections("buckets: CRLF + unknown header ends section",
	"# Chinese\r\n中文行\r\n# English\r\nen line\r\n# Notes\r\nnote\r\nstray\r\n",
	{ zh: ["中文行"], en: ["en line"], other: ["note", "stray"] });

// WHY no-space / upper-case markers: the parser accepts `#` with no space and
// lower-cases the header, so `#zh` and `#EN` are real inputs a user can type. A
// refactor tightening the header regex to `^#\s+(.+)$` would silently drop them
// while every case above stayed green.
checkSections("buckets: #zh / #EN without a space",
	"#zh\n中文一\n#EN\ne one\n",
	{ zh: ["中文一"], en: ["e one"], other: [] });

// WHY the Chinese markers specifically: the code's own doc comment promises
// "# Chinese"/"# 中文" -> zh and "# English"/"# 英文" -> en, yet every case above
// only uses the English spellings. Without this a locale-blind rewrite could drop
// the 中文/英文 branches and nothing would notice.
checkSections("buckets: 中文/英文 markers", "# 中文\nz\n# 英文\ne\n", { zh: ["z"], en: ["e"], other: [] });
check("ui(zh) reads the 中文 section", { langMode: "ui", quips: "# 中文\nz\n# 英文\ne\n" }, "zh", ["z"]);

// WHY free-form whitespace: the textarea is hand-edited, so indentation, blank
// lines and `;;` are normal. An empty quip would render as an empty status line,
// which is why trimmed-away segments must not be pushed.
checkSections("buckets: trims + drops empty segments",
	"  a1 ; a2 ;; \n\n# 中文\n 中文一 ;中文二\n",
	{ zh: ["中文一", "中文二"], en: [], other: ["a1", "a2"] });

// WHY last-header-wins / interleaving: sections are append buckets, not runs, so
// a second `# Chinese` must add to the same zh bucket rather than reset it.
checkSections("buckets: interleaved headers accumulate",
	"# Chinese\nz1\n# English\ne1\n# Chinese\nz2\n",
	{ zh: ["z1", "z2"], en: ["e1"], other: [] });

// WHY non-string input: cfg.quips is read back from localStorage/config JSON and
// can be any type (or missing). It must degrade to "no quips", never throw —
// a throw here would break the whole settings panel.
checkSections("non-string quips does not throw", undefined, empty());
checkSections("null quips does not throw", null, empty());
checkSections("numeric quips does not throw", 42, empty());
checkSections("whitespace-only quips", "   \n\t\n", empty());
check("missing quips key", { langMode: "mix" }, "zh", []);

// WHY the unknown-mode fallback: langMode comes from persisted config, so a value
// written by a different version ("both", typo, corrupted storage) must fall into
// the follow-UI branch. A rewrite using if/else-if chains without this else would
// select nothing and silently mute the status line.
check("unknown langMode falls back to follow-UI(zh)", { langMode: "bogus", quips: text }, "zh", ["aaa", "bbb"]);
check("unknown langMode falls back to follow-UI(en)", { langMode: "bogus", quips: text }, "en", ["ccc", "ddd", "通用行"]);

// WHY exact locale matching: effectiveLang() is `locale === "zh" ? "zh" : "en"`
// and is not exported through __internal, so this is the only place its strict
// comparison can be pinned. A "helpful" refactor to startsWith("zh") would change
// the visible language for regional locales, so the current behaviour is asserted
// deliberately (regional tags follow English) rather than assumed.
check("ui: regional zh-CN is not the zh bucket", { langMode: "ui", quips: text }, "zh-CN", ["ccc", "ddd", "通用行"]);
check("ui: uppercase ZH is not the zh bucket", { langMode: "ui", quips: text }, "ZH", ["ccc", "ddd", "通用行"]);
check("ui: undefined locale follows English", { langMode: "ui", quips: text }, undefined, ["ccc", "ddd", "通用行"]);

// WHY ordering is asserted: "other" is collected during the single pass but always
// appended AFTER the language lists, so a quip written in the middle of the file
// rotates last. Ordering is user-visible in the rotation, and a refactor keeping
// textual order would change it silently.
check("mix appends other last, not in file order",
	{ langMode: "mix", quips: "# Chinese\na1\n# Notes\nn1\n# English\ne1\n" }, "zh", ["a1", "e1", "n1"]);

// WHY no dedupe: the rotator indexes into this list by position, so mix must stay
// a plain concatenation of the two buckets. "Deduplicating" identical strings
// would shorten the rotation and change the timing the user sees.
check("mix does not dedupe across sections",
	{ langMode: "mix", quips: "# Chinese\ndup\n# English\ndup\n" }, "zh", ["dup", "dup"]);

console.log(process.exitCode ? "SECTION LOGIC HAS FAILURES" : "ALL SECTION CHECKS PASSED");
