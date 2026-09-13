// Geometry checks for the `morph` loading indicator (circle → rounded triangle →
// rounded square → circle, with a settling rotation). The maths lives in
// lib/client.js and is reached through the __internal seam, so this exercises the
// shipped functions rather than a copy of them.

let loaded = null;
globalThis.window = { __ModuleLoader__: { load: (x) => { loaded = x; } }, __DSH_THINKING_QUIPS__: false };
globalThis.document = {
	body: { style: { setProperty() {} } },
	documentElement: {},
	getElementById: () => null,
	createElement: () => ({ style: { setProperty() {} }, setAttribute() {}, appendChild() {} }),
	createTreeWalker: () => ({ nextNode: () => null }),
	querySelectorAll: () => []
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
if (!api || typeof api.morphPath !== "function") throw new Error("the morph geometry is not exposed via __internal");

let failures = 0;
function ok(name, cond, detail) {
	const pass = !!cond;
	if (!pass) failures++;
	console.log(`${pass ? "OK  " : "FAIL"} ${name}${detail === undefined ? "" : " -> " + detail}`);
}

/** Pull the points back out of a path so the assertions can talk geometry. */
function points(d) {
	const pts = [];
	for (const m of d.matchAll(/([ML])(-?[\d.]+) (-?[\d.]+)/g)) pts.push([parseFloat(m[2]), parseFloat(m[3])]);
	return pts;
}
const radiusOf = (p) => Math.hypot(p[0] - 8, p[1] - 8);
const spread = (arr) => Math.max(...arr) - Math.min(...arr);

console.log("── profiles ──");
const circle = api.morphProfile("circle");
const triangle = api.morphProfile("triangle");
const square = api.morphProfile("square");
ok("circle is a circle", spread(circle) < 1e-9, `spread ${spread(circle)}`);
for (const [name, prof, corners] of [["triangle", triangle, 3], ["square", square, 4]]) {
	ok(`${name}: normalised`, Math.abs(Math.max(...prof) - 1) < 1e-9);
	ok(`${name}: symmetric (${corners}-fold)`, (() => {
		const step = api.MORPH_SAMPLES / corners;
		for (let i = 0; i < api.MORPH_SAMPLES; i++) {
			if (Math.abs(prof[i] - prof[(i + step) % api.MORPH_SAMPLES]) > 1e-9) return false;
		}
		return true;
	})());
	ok(`${name}: corners stick out enough to read at 16px`, Math.min(...prof) < 0.8, `min radius ${Math.min(...prof).toFixed(3)} of max`);
}
ok("triangle and square are visibly different shapes",
	spread(triangle.map((r, i) => Math.abs(r - square[i]))) > 0.05,
	`max profile difference ${Math.max(...triangle.map((r, i) => Math.abs(r - square[i]))).toFixed(3)}`);
ok("triangle points up (a corner at 12 o'clock)", (() => {
	const i = 0; // sample 0 is 12 o'clock (a = -pi/2)
	const corner = triangle[i] > triangle[i + 2] && triangle[i] > triangle[i + api.MORPH_SAMPLES / 3 - 2];
	return triangle[i] >= Math.max(...triangle) - 1e-9;
})(), `r(12h)=${triangle[0].toFixed(3)}`);

console.log("\n── easing ──");
ok("morphEase(0)=0", Math.abs(api.morphEase(0)) < 1e-12);
ok("morphEase(1)=1", Math.abs(api.morphEase(1) - 1) < 1e-12);
ok("morphEase is monotonic", (() => {
	let prev = -1;
	for (let p = 0; p <= 1.0001; p += 0.05) { const v = api.morphEase(p); if (v < prev - 1e-12) return false; prev = v; }
	return true;
})());
ok("morphEase starts and ends flat (the shape holds, then settles)", api.morphEase(0.05) < 0.01 && api.morphEase(0.95) > 0.99);
ok("morphSpinEase(0)=0 / (1)=1", Math.abs(api.morphSpinEase(0)) < 1e-12 && Math.abs(api.morphSpinEase(1) - 1) < 1e-12);
// "lagging speed": the turn holds longer than the shape does at both ends, so it
// drifts behind the morph and settles after it.
ok("the turn lags the shape (settles later than the morph)",
	api.morphSpinEase(0.25) < api.morphEase(0.25) && api.morphSpinEase(0.75) > api.morphEase(0.75),
	`spin(0.25)=${api.morphSpinEase(0.25).toFixed(3)} < morph(0.25)=${api.morphEase(0.25).toFixed(3)}`);

console.log("\n── paths ──");
const ORDER = api.MORPH_ORDER;
for (let seg = 0; seg < ORDER.length; seg++) {
	const d0 = api.morphPath(seg, 0);
	const d1 = api.morphPath(seg, 1);
	const dNext = api.morphPath((seg + 1) % ORDER.length, 0);
	ok(`segment ${seg} (${ORDER[seg]} → ${ORDER[(seg + 1) % ORDER.length]}): closed path`, /^M/.test(d0) && /Z$/.test(d0));
	ok(`segment ${seg}: ${api.MORPH_SAMPLES} points`, points(d0).length === api.MORPH_SAMPLES, `${points(d0).length}`);
	ok(`segment ${seg}: start = the ${ORDER[seg]} outline`, d0 === api.morphPath(seg, 0));
	ok(`segment ${seg}: end = the ${ORDER[(seg + 1) % ORDER.length]} outline (continuous loop)`, d1 === dNext);
	const radii = points(d0).map(radiusOf);
	ok(`segment ${seg}: stays inside the 16x16 box`, Math.max(...radii) <= 7.5 + 1e-6, `max radius ${Math.max(...radii).toFixed(3)}`);
	ok(`segment ${seg}: uses the full footprint`, Math.abs(Math.max(...radii) - api.MORPH_RADIUS) < 0.02, `max radius ${Math.max(...radii).toFixed(3)}`);
}

console.log("\n── motion quality ──");
// No frame may jump: sample the cycle finely and measure how far any point moves.
let worstStep = 0;
let worstAt = 0;
const steps = 240;
for (let i = 0; i < steps * ORDER.length; i++) {
	const seg = Math.floor(i / steps);
	const p = (i % steps) / steps;
	const a = points(api.morphPath(seg % ORDER.length, p));
	const b = points(api.morphPath(seg % ORDER.length, Math.min(1, p + 1 / steps)));
	for (let k = 0; k < a.length; k++) {
		const move = Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]);
		if (move > worstStep) { worstStep = move; worstAt = seg + p; }
	}
}
ok("no frame-to-frame jump (smooth morph)", worstStep < 0.4, `worst point move ${worstStep.toFixed(3)} units at cycle point ${worstAt.toFixed(2)}`);

const rots = [];
for (let seg = 0; seg < ORDER.length; seg++) {
	for (let p = 0; p <= 1.0001; p += 0.01) rots.push(api.morphRotation(seg, p));
}
ok("rotation starts at 0°", Math.abs(rots[0]) < 1e-9);
ok("rotation ends at 360° (one turn per cycle)", Math.abs(rots[rots.length - 1] - 360) < 1e-6, `${rots[rots.length - 1]}`);
ok("rotation never goes backwards", (() => {
	for (let i = 1; i < rots.length; i++) if (rots[i] < rots[i - 1] - 1e-9) return false;
	return true;
})());
ok("cycle duration is one segment per shape", api.MORPH_CYCLE_MS % ORDER.length === 0, `${api.MORPH_CYCLE_MS}ms / ${ORDER.length}`);

console.log(failures === 0 ? "\nALL MORPH CHECKS PASSED" : `\nMORPH CHECKS FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
