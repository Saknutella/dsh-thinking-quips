// Elapsed-time clock: which turn the official seat is allowed to describe, and how the
// self-timer covers the rest.
//
// WHY THIS FILE EXISTS: the plugin's clock used to take whatever `conversation.chat.turnTail`
// handed over. On DSH 0.2.0-rc.2 that seat is rendered by `TurnTailNodeView`, i.e. once per turn
// tail in the transcript, and a *finished* turn's tail stays mounted. So the page-global slot kept
// the last finished turn's start, and a turn that had just begun reported the age of the previous
// one — the reported "used 3h 24m" (the previous turn's age) bug. DSH's own running clock reads
// the latest turn only while `turn.status === "open"`; these assertions pin the same two rules.
//
// Runs against the SHIPPED `lib/client.js` through `__internal`, like every other suite here.

let loaded = null;
globalThis.window = { __ModuleLoader__: { load: (x) => { loaded = x; } }, __DSH_THINKING_QUIPS__: false };
globalThis.document = {
	body: { style: { setProperty() {}, removeProperty() {} }, hasAttribute: () => false, getAttribute: () => null },
	documentElement: { style: { setProperty() {}, removeProperty() {} } },
	getElementById: () => null,
	createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
	querySelectorAll: () => [],
	createTreeWalker: () => ({ nextNode: () => null })
};

// The bridge is a component whose whole job happens in an effect, so the stub has to RUN the
// effect (every other suite stubs useEffect as a no-op, which would make this file vacuous).
const cleanups = [];
const reactStub = {
	useState: () => [0, () => {}],
	useEffect: (fn) => { const cleanup = fn(); if (typeof cleanup === "function") cleanups.push(cleanup); },
	useRef: () => ({ current: null }),
	useSyncExternalStore: (_s, get) => get()
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
for (const name of ["recordTurnClock", "releaseTurnClock", "clearTurnClock", "resetSelfClock", "elapsedMs", "elapsedFrom", "labelDuration", "durationFromText", "officialTurn", "TurnClockBridge"]) {
	if (api[name] === undefined) throw new Error(`__internal does not expose ${name}`);
}

let failures = 0;
function ok(name, cond, detail) {
	const pass = !!cond;
	if (!pass) failures++;
	console.log(`${pass ? "OK  " : "FAIL"} ${name}${detail === undefined ? "" : " -> " + detail}`);
}
const eq = (name, got, want) => ok(name, got === want, `${JSON.stringify(got)}${got === want ? "" : " (want " + JSON.stringify(want) + ")"}`);
const slot = () => ({ turn: api.officialTurn.turn, start: api.officialTurn.startTime });
const reset = () => { api.clearTurnClock(); api.resetSelfClock(); };
const turn = (n, status, time) => ({ turn: n, status, start: { time } });

console.log("── the seat may only describe an OPEN turn ──");

// The regression this file exists for: a finished turn's tail stays mounted and re-offers its
// start. Accepting it is what showed "used 3h 24m" on a turn that had just begun.
reset();
ok("a closed turn is refused", api.recordTurnClock(turn(9, "closed", 1_000_000)) === false);
eq("the slot stays empty after a closed turn", JSON.stringify(slot()), JSON.stringify({ turn: undefined, start: undefined }));

// Order matters: a closed turn must be refused even when it is NEWER, or "newest wins" would
// quietly re-admit it through the back door.
reset();
api.recordTurnClock(turn(1, "open", 5_000_000));
ok("a newer CLOSED turn is still refused", api.recordTurnClock(turn(2, "closed", 9_000_000)) === false);
eq("the open turn keeps the slot", JSON.stringify(slot()), JSON.stringify({ turn: 1, start: 5_000_000 }));

reset();
ok("an open turn is accepted", api.recordTurnClock(turn(7, "open", 1_700_000_000_000)) === true);
eq("the slot describes the open turn", JSON.stringify(slot()), JSON.stringify({ turn: 7, start: 1_700_000_000_000 }));

reset();
ok("a turn with no finite start is refused", api.recordTurnClock({ turn: 3, status: "open", start: undefined }) === false);
ok("a turn whose start is not a number is refused", api.recordTurnClock({ turn: 3, status: "open", start: { time: "1700000000000" } }) === false);
ok("a missing turn is refused", api.recordTurnClock(undefined) === false);

console.log("\n── an older tail must not move the clock backwards ──");

// Virtualisation or a session switch can re-mount an older turn's tail AFTER the running one.
reset();
api.recordTurnClock(turn(4, "open", 2_000_000));
ok("an older open turn cannot overwrite a newer one", api.recordTurnClock(turn(2, "open", 1_000_000)) === false);
eq("the newer open turn still owns the slot", JSON.stringify(slot()), JSON.stringify({ turn: 4, start: 2_000_000 }));
ok("a newer open turn does overwrite", api.recordTurnClock(turn(5, "open", 3_000_000)) === true);
eq("the newest open turn owns the slot", JSON.stringify(slot()), JSON.stringify({ turn: 5, start: 3_000_000 }));

console.log("\n── releasing the slot ──");

reset();
api.recordTurnClock(turn(11, "open", 7_000_000));
api.releaseTurnClock(12);
eq("releasing someone else's turn keeps it", JSON.stringify(slot()), JSON.stringify({ turn: 11, start: 7_000_000 }));
api.releaseTurnClock(11);
eq("releasing its own turn clears it", JSON.stringify(slot()), JSON.stringify({ turn: undefined, start: undefined }));

console.log("\n── a turn that stops being open hands the slot back ──");

// turn/end re-renders that turn's tail, which is the seat's only chance to say "this clock is
// over". Without it the finished turn's start would sit in the slot until something else
// overwrote it — the very inheritance that produced the wrong reading.
reset();
api.recordTurnClock(turn(40, "open", 8_000_000));
ok("the open turn is in the slot", JSON.stringify(slot()) === JSON.stringify({ turn: 40, start: 8_000_000 }));
ok("the same turn arriving closed is refused", api.recordTurnClock({ turn: 40, status: "closed", start: { time: 8_000_000 } }) === false);
eq("and it takes its start out of the slot", JSON.stringify(slot()), JSON.stringify({ turn: undefined, start: undefined }));

// But a DIFFERENT finished turn must not disturb the open one that is running.
reset();
api.recordTurnClock(turn(41, "open", 9_000_000));
ok("another turn's closed tail is refused", api.recordTurnClock({ turn: 42, status: "closed", start: { time: 9_500_000 } }) === false);
eq("the open turn keeps the slot", JSON.stringify(slot()), JSON.stringify({ turn: 41, start: 9_000_000 }));

console.log("\n── elapsedMs: the seat, then the self-timer ──");

reset();
api.recordTurnClock(turn(20, "open", 1_000_000));
eq("the official start wins", api.elapsedMs(1_030_000), 30_000);
eq("and it stays monotone", api.elapsedMs(1_060_000), 60_000);

// Dropping the clocks is what a turn end looks like. Both helpers exist separately because the
// departure path resets only the self-timer, while the seat owns the official one.
api.resetSelfClock();
api.clearTurnClock();
eq("clearTurnClock drops the official slot", JSON.stringify(slot()), JSON.stringify({ turn: undefined, start: undefined }));
eq("the self-timer starts at zero on its first sighting", api.elapsedMs(2_000_000), 0);
eq("and then measures from that sighting", api.elapsedMs(2_012_000), 12_000);

console.log("\n── reading the shell's own duration ──");

// The shell's label is the authoritative clock (it survives a refresh; the plugin's own clocks
// cannot promise that), so the plugin reads it instead of deriving one. These are the exact
// shapes DSH's own `formatRunDuration` produces in the two locales it ships.
const durations = [
	["深度求索中，用时 1秒 ···", 1_000],
	["深度求索中，用时 45秒 ···", 45_000],
	["深度求索中，用时 1分5秒 ···", 65_000],
	["深度求索中，用时 10分46秒 ···", 646_000],
	["深度求索中，用时 3小时24分32秒 ···", 12_272_000],
	["Deep diving for 1s ···", 1_000],
	["Deep diving for 1m 5s ···", 65_000],
	["Deep diving for 3h 24m 32s ···", 12_272_000]
];
for (const [text, ms] of durations) eq(`parses ${JSON.stringify(text)}`, api.durationFromText(text), ms);

// No duration in the label (the shell shows `chat.deepDiving` with no clock yet) must read as
// "unknown", not as zero: zero would freeze the plugin's own clock at 0秒 for a whole turn.
for (const text of ["深度求索中", "Deep diving", "", "Deep diving for the win", "用时 ?"]) {
	eq(`no duration in ${JSON.stringify(text)}`, api.durationFromText(text), undefined);
}

console.log("\n── which clock wins ──");

const hostWith = (shown) => ({
	querySelector: (sel) => (sel === '[class*="runningText"]'
		? { textContent: shown, getAttribute: () => null, querySelector: () => null }
		: null)
});
reset();
// The shell is showing 10m46s while the seat says 8m27s: the shell's own value must win, because
// that is the number the user reads on the very same line (the mismatch they reported).
api.recordTurnClock(turn(50, "open", 3_000_000));
eq("the shell's own label beats the seat", api.elapsedFrom(hostWith("深度求索中，用时 10分46秒 ···"), 3_500_000), 646_000);
eq("and on a line with no duration the seat is used", api.elapsedFrom(hostWith("深度求索中"), 3_500_000), 500_000);
reset();
eq("with neither the seat nor a duration, the self-timer covers it", api.elapsedFrom(hostWith("深度求索中"), 4_000_000), 0);
eq("and it measures from its own first sighting", api.elapsedFrom(hostWith("深度求索中"), 4_007_000), 7_000);
reset();
eq("a host with no label at all falls back", api.elapsedFrom({ querySelector: () => null }, 9_000_000), 0);
eq("and so does a missing host", api.elapsedFrom(null, 9_000_000), 0);

// The decoration copy is what the shell's `::after` paints; a shell that renders the label only
// through it must still be readable.
const hostCopyOnly = {
	querySelector: (sel) => (sel === '[class*="runningText"]'
		? { textContent: "", getAttribute: () => null, querySelector: () => ({ getAttribute: () => "深度求索中，用时 2分3秒 ···" }) }
		: null)
};
eq("the data-shimmer-text copy is a usable fallback", api.labelDuration(hostCopyOnly), 123_000);

// A stale official start must not come back through the self-timer's pocket: once the slot is
// empty, a closed turn offered later cannot resurrect it.
reset();
ok("a closed turn offered after the turn ended stays refused", api.recordTurnClock(turn(20, "closed", 1_000_000)) === false);
eq("so a new turn is timed from its own first sighting", api.elapsedMs(2_000_000), 0);
eq("and measured from there", api.elapsedMs(2_030_000), 30_000);

console.log("\n── the bridge component wires those rules to the seat ──");

reset();
cleanups.length = 0;
api.TurnClockBridge({ turn: turn(30, "open", 9_000_000) });
const openCleanup = cleanups[0];
eq("mounting the bridge records an open turn", JSON.stringify(slot()), JSON.stringify({ turn: 30, start: 9_000_000 }));
ok("and it registered a cleanup", typeof openCleanup === "function", typeof openCleanup);

// The same component is mounted for a finished turn; that mount must not touch the slot.
cleanups.length = 0;
api.TurnClockBridge({ turn: turn(31, "closed", 9_500_000) });
eq("mounting a closed turn's bridge changes nothing", JSON.stringify(slot()), JSON.stringify({ turn: 30, start: 9_000_000 }));

openCleanup();
eq("unmounting the open turn's bridge releases it", JSON.stringify(slot()), JSON.stringify({ turn: undefined, start: undefined }));

// An undefined turn (a shell that hands over nothing) must not throw.
const before = failures;
api.TurnClockBridge({});
api.TurnClockBridge({ turn: undefined });
ok("a bridge with no turn does not throw", failures === before);

console.log(failures === 0 ? "\nALL CLOCK CHECKS PASSED" : `\nCLOCK CHECKS FAILED (${failures})`);
process.exitCode = failures === 0 ? 0 : 1;
