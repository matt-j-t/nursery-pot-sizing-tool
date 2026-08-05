// Automated manifold regression test — run with `node docs/js/manifoldTest.mjs`.
//
// Builds a battery of pot configurations (varying lift notches, air slots,
// pot size, and circular resolution) and checks each one with
// geometry.js's manifoldCheck(): every edge must be shared by exactly 2
// faces (no boundary/open edges, no non-manifold/bowtie edges). This is
// exactly the class of bug flagged in docs/features-wip/nursery-pot-features-spec.md
// (the "bowtie" multi-hole topology failure) — this test exists so it's
// caught automatically here, rather than only by visual inspection in the
// live preview.
//
// Exits with a non-zero code (and prints every failure) if any
// configuration is not watertight, so it can be wired into CI later.

import * as calc from "./calculator.js";
import * as pb from "./potBuilder.js";
import * as geo from "./geometry.js";

const configs = [
  { label: "baseline, no features", opts: {} },
  { label: "1 lift notch", opts: { liftNotchCount: 1 } },
  { label: "2 lift notches", opts: { liftNotchCount: 2 } },
  { label: "air slots only", opts: { airSlotsEnabled: true } },
  { label: "1 notch + air slots", opts: { liftNotchCount: 1, airSlotsEnabled: true } },
  { label: "2 notches + air slots", opts: { liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "no drain holes", opts: { drainHoleCount: 0, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "low circular resolution (nSeg=24)", opts: { nSeg: 24, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "high circular resolution (nSeg=180)", opts: { nSeg: 180, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "small pot (forces drain-hole/slot-count reduction)", opts: { outerTopDiam: 40, height: 100, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "short pot (notch/slots should auto-disable)", opts: { height: 20, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "large pot", opts: { outerTopDiam: 400, height: 350, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "thick wall (notch recess less clamped)", opts: { wallT: 8.0, liftNotchCount: 2, airSlotsEnabled: true } },
];

let failures = 0;

for (const { label, opts } of configs) {
  const spec = calc.resolvePot({
    outerTopDiam: 150,
    height: 120,
    wallT: 1.6,
    floorT: 1.6,
    drainHoleCount: 8,
    drainHoleDiam: 6.0,
    nSeg: 96,
    ...opts,
  });
  const triangles = pb.buildPotMesh(spec);
  const mc = geo.manifoldCheck(triangles);
  const status = mc.watertight ? "PASS" : "FAIL";
  if (!mc.watertight) failures++;
  console.log(
    `[${status}] ${label} — verts=${mc.nVerts} faces=${mc.nFaces} euler=${mc.euler} ` +
      `boundaryEdges=${mc.boundaryEdges} nonmanifoldEdges=${mc.nonmanifoldEdges}`
  );
}

if (failures > 0) {
  console.error(`\n${failures} of ${configs.length} configuration(s) FAILED the manifold check.`);
  process.exit(1);
} else {
  console.log(`\nAll ${configs.length} configurations are watertight.`);
}
