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
// Some configs are intentionally print-unsafe (crowded grooves, an
// oversized drain hole) and are expected to be REJECTED by calculator.js's
// validity checks (ridge-to-ridge width, hole-to-transition-zone
// clearance — see the "base grooves" section of resolvePot) rather than
// silently produce a watertight-but-paper-thin mesh. Mark those
// `expectReject: true`; any config that throws WITHOUT that flag set is a
// real failure, same as a non-watertight mesh.
//
// Exits with a non-zero code (and prints every failure) if any
// configuration is not watertight (or rejected/accepted unexpectedly), so
// it can be wired into CI later.

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
  // drainHoleCount: 0 here — this config exists to stress the notch's recess
  // clamping against a thick wall, not base grooves; leaving drain holes on
  // would also exercise (and, at wallT=8mm, correctly trip) the groove
  // hole-clearance check below, which isn't what this case is testing for.
  { label: "thick wall (notch recess less clamped)", opts: { wallT: 8.0, liftNotchCount: 2, airSlotsEnabled: true, drainHoleCount: 0 } },
  { label: "base grooves + notch + slots", opts: { liftNotchCount: 2, airSlotsEnabled: true, drainHoleCount: 8 } },
  { label: "base grooves, few drain holes", opts: { drainHoleCount: 4 } },
  { label: "base grooves, small pot (grooves should auto-disable)", opts: { outerTopDiam: 35, height: 60, drainHoleCount: 6 } },
  // 12 grooves at the faceted profile's fixed 0.25 rad full half-angle
  // leaves less than a full angle's worth of ridge per groove — the
  // ridge-to-ridge width check should reject this rather than silently
  // build a knife-edge (or overlapping) ridge.
  { label: "base grooves, many drain holes on a large pot (ridge too thin)", opts: { outerTopDiam: 300, height: 250, drainHoleCount: 12 }, expectReject: true },
  { label: "base grooves, low circular resolution", opts: { nSeg: 24, drainHoleCount: 8 } },
  // Dedicated regression cases for the Task 1 fix itself — prove both new
  // checks actually fire on known-bad geometry, not just that they compile.
  { label: "[regression] ridge-width check rejects an overcrowded groove count", opts: { drainHoleCount: 16 }, expectReject: true },
  { label: "[regression] hole-clearance check rejects an oversized drain hole", opts: { drainHoleCount: 6, drainHoleDiam: 16 }, expectReject: true },
];

let failures = 0;

for (const { label, opts, expectReject } of configs) {
  let status, detail;
  try {
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
    if (expectReject) {
      status = "FAIL"; // expected a validity error but generation succeeded
      detail = `expected rejection, but got a mesh (watertight=${mc.watertight})`;
    } else if (mc.watertight) {
      status = "PASS";
      detail = `verts=${mc.nVerts} faces=${mc.nFaces} euler=${mc.euler} boundaryEdges=${mc.boundaryEdges} nonmanifoldEdges=${mc.nonmanifoldEdges}`;
    } else {
      status = "FAIL";
      detail = `NOT watertight — verts=${mc.nVerts} faces=${mc.nFaces} euler=${mc.euler} boundaryEdges=${mc.boundaryEdges} nonmanifoldEdges=${mc.nonmanifoldEdges}`;
    }
  } catch (err) {
    if (expectReject) {
      status = "REJECTED (expected)";
      detail = err.message;
    } else {
      status = "FAIL";
      detail = `unexpected error: ${err.message}`;
    }
  }
  if (status === "FAIL") failures++;
  console.log(`[${status}] ${label} — ${detail}`);
}

if (failures > 0) {
  console.error(`\n${failures} of ${configs.length} configuration(s) FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${configs.length} configurations behaved as expected.`);
}
