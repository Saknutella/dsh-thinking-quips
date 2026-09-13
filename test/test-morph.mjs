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
/** Profile → the points it draws, in the same frame morphPath() uses. */
const profilePoints = (prof) => prof.map((r, i) => {
	const a = (i / api.MORPH_SAMPLES) * Math.PI * 2 - Math.PI / 2;
	return [Math.cos(a) * r, Math.sin(a) * r];
});
ok("circle is a circle", spread(circle) < 1e-9, `spread ${spread(circle)}`);
for (const [name, prof, corners] of [["triangle", triangle, 3], ["square", square, 4]]) {
	ok(`${name}: normalised`, Math.abs(Math.max(...prof) - 1) < 1e-9);
	// The shapes are mirror-symmetric about 12 o'clock (a box-centred polygon is no
	// longer N-fold symmetric about the origin — the centring shift moves its centre
	// of mass off the pivot, which is exactly the point of the change).
	ok(`${name}: mirror-symmetric about 12 o'clock (${corners} corners)`, (() => {
		for (let i = 0; i < api.MORPH_SAMPLES; i++) {
			if (Math.abs(prof[i] - prof[(api.MORPH_SAMPLES - i) % api.MORPH_SAMPLES]) > 1e-9) return false;
		}
		return true;
	})());
	ok(`${name}: corners stick out enough to read at 16px`, Math.min(...prof) < 0.8, `min radius ${Math.min(...prof).toFixed(3)} of max`);
}
ok("triangle and square are visibly different shapes",
	spread(triangle.map((r, i) => Math.abs(r - square[i]))) > 0.05,
	`max profile difference ${Math.max(...triangle.map((r, i) => Math.abs(r - square[i]))).toFixed(3)}`);
ok("triangle points up (a corner at 12 o'clock)", (() => {
	const pts = profilePoints(triangle);
	return Math.abs(pts[0][1] - Math.min(...pts.map((p) => p[1]))) < 1e-9;
})(), `r(12h)=${triangle[0].toFixed(3)}`);

// The centre the user sees: every shape must sit on the SAME centre (its bounding
// box centre), otherwise the morph drifts upward as the triangle appears.
console.log("\n── shared centre (bounding box) ──");
for (const [name, prof] of [["circle", circle], ["triangle", triangle], ["square", square]]) {
	const pts = profilePoints(prof);
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	ok(`${name}: bounding box is centred on the origin`,
		Math.abs((Math.min(...xs) + Math.max(...xs)) / 2) < 1e-9 && Math.abs((Math.min(...ys) + Math.max(...ys)) / 2) < 1e-9,
		`x centre ${((Math.min(...xs) + Math.max(...xs)) / 2).toFixed(6)}, y centre ${((Math.min(...ys) + Math.max(...ys)) / 2).toFixed(6)}`);
}

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

console.log("\n── every frame keeps the shared centre ──");
// Strongest form of the requirement: at ANY point of the cycle the drawn outline's
// bounding box must be centred on (8, 8) — the rotation pivot — so the shape morphs
// and spins in place instead of wandering.
let worstCentre = 0;
let worstCentreAt = 0;
for (let seg = 0; seg < ORDER.length; seg++) {
	for (let i = 0; i <= 40; i++) {
		const pts = points(api.morphPath(seg, i / 40));
		const xs = pts.map((p) => p[0]);
		const ys = pts.map((p) => p[1]);
		const off = Math.max(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 8), Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 8));
		if (off > worstCentre) { worstCentre = off; worstCentreAt = seg + i / 40; }
	}
}
ok("outline stays centred on the pivot at every phase", worstCentre < 0.01, `worst offset ${worstCentre.toFixed(5)} units at cycle point ${worstCentreAt.toFixed(2)}`);

let worstPivotRadius = 0;
for (let seg = 0; seg < ORDER.length; seg++) {
	for (let i = 0; i <= 40; i++) {
		for (const p of points(api.morphPath(seg, i / 40))) {
			worstPivotRadius = Math.max(worstPivotRadius, Math.hypot(p[0] - 8, p[1] - 8));
		}
	}
}
ok("nothing outgrows the shared footprint", worstPivotRadius <= api.MORPH_RADIUS + 0.05, `max pivot radius ${worstPivotRadius.toFixed(3)} (${api.MORPH_RADIUS} allowed)`);

console.log("\n── frame derivation (the clock bug) ──");
// morphFrame() is the ONLY thing the rAF loops call, so it has to survive any clock
// value: the preview driver once subtracted a Date.now() origin from a
// requestAnimationFrame timestamp, got a huge negative elapsed, and froze on frame 0.
ok("frame 0 is the circle at 0°", (() => {
	const f = api.morphFrame(0);
	return f.segment === 0 && f.progress === 0 && f.rotation === "rotate(0.00 8 8)";
})(), JSON.stringify(api.morphFrame(0).segment));
let frameProblems = 0;
for (const ms of [-1e12, -3300, -1, 0, 1, 550, 1100, 2199, 3300, 3301, 1e9, NaN]) {
	const f = api.morphFrame(ms);
	if (typeof f.d !== "string" || f.d.indexOf("M") !== 0 || f.d.indexOf("NaN") !== -1) frameProblems++;
	if (!(f.segment >= 0 && f.segment < ORDER.length)) frameProblems++;
	if (!(f.progress >= 0 && f.progress < 1.0000001)) frameProblems++;
	if (f.rotation.indexOf("NaN") !== -1) frameProblems++;
}
ok("every elapsed value (negative, NaN, past a cycle) yields a sane frame", frameProblems === 0, `${frameProblems} bad frames`);
ok("elapsed wraps: 3300ms is the same frame as 0ms", api.morphFrame(3300).d === api.morphFrame(0).d);
ok("negative elapsed still animates (no freeze)", api.morphFrame(-1000).d !== api.morphFrame(-2000).d);
ok("the cycle visits all three segments", [0, 1, 2].every((s) => api.morphFrame(s * (api.MORPH_CYCLE_MS / 3) + 5).segment === s),
	[0, 1, 2].map((s) => api.morphFrame(s * (api.MORPH_CYCLE_MS / 3) + 5).segment).join(","));

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
