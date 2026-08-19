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
// Some configs are intentionally print-unsafe (e.g. a dome slope over the
// 45deg print-safety limit) and are expected to be REJECTED by
// calculator.js's validity checks rather than silently produce a
// watertight-but-unsafe mesh. Mark those `expectReject: true`; any config
// that throws WITHOUT that flag set is a real failure, same as a
// non-watertight mesh.
//
// The base is now a dome (flat plateau + conical slope + flat outer ring,
// see docs/nursery-pot-parametric-spec.md and
// docs/features-wip/pot-floor-dome.mjs) — this replaced the earlier
// raised-channel/hub-and-spoke groove design entirely, so the groove-only
// regression cases that used to live here (ridge-width crowding check,
// groove auto-disable on a small pot) no longer apply and have been
// removed. A dedicated config at the exact reference pot size
// (bottomR=50mm, topR=75mm, height=120mm, wallT=2.5mm) is included below.
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
  // KNOWN FAILING as of the dome floor rewrite: domeOuterR (flatTopR +
  // slopeRun = 20mm) is a fixed absolute size, not scaled to pot size, so
  // on a pot this small the dome's own outer flat ring no longer fits
  // inside the floor at all (RBottomOuter < domeOuterR) and the mesh comes
  // out non-watertight. This is explicitly out of scope for the current
  // dome/logo rewrite (reference pot size only — see
  // docs/nursery-pot-parametric-spec.md) and is left failing here on
  // purpose so it isn't silently lost; scaling the dome to pot size is
  // tracked as follow-up work, not fixed in this pass.
  { label: "small pot (forces drain-hole/slot-count reduction)", opts: { outerTopDiam: 40, height: 100, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "short pot (notch/slots should auto-disable)", opts: { height: 20, liftNotchCount: 2, airSlotsEnabled: true } },
  { label: "large pot", opts: { outerTopDiam: 400, height: 350, liftNotchCount: 2, airSlotsEnabled: true } },
  // drainHoleCount: 0 here — this config exists to stress the notch's recess
  // clamping against a thick wall; leaving drain holes on would also
  // exercise the dome's hole-placement/auto-shrink logic at wallT=8mm,
  // which isn't what this case is testing for.
  { label: "thick wall (notch recess less clamped)", opts: { wallT: 8.0, liftNotchCount: 2, airSlotsEnabled: true, drainHoleCount: 0 } },
  { label: "dome floor + notch + slots", opts: { liftNotchCount: 2, airSlotsEnabled: true, drainHoleCount: 8 } },
  { label: "dome floor, few drain holes", opts: { drainHoleCount: 4 } },
  // Small floor forces the drain-hole placement logic to shrink hole
  // diameter/count to keep clearance from the dome slope and inner wall
  // (see calculator.js's dome drainage-hole block) — should still resolve
  // to a valid, watertight mesh, not reject.
  // KNOWN FAILING for the same reason as the small-pot case above — same
  // fixed-size-dome-doesn't-fit issue, not the hole-shrink logic itself.
  { label: "dome floor, small pot (holes should auto-shrink)", opts: { outerTopDiam: 35, height: 60, drainHoleCount: 6 } },
  { label: "dome floor, large pot, many drain holes", opts: { outerTopDiam: 300, height: 250, drainHoleCount: 12 } },
  { label: "dome floor, low circular resolution", opts: { nSeg: 24, drainHoleCount: 8 } },
  // Exact reference pot size from the dome/logo spec: bottomR=50mm,
  // topR=75mm, height=120mm, wallT=2.5mm. draftDeg is derived since
  // resolvePot takes outerTopDiam/draftDeg rather than bottomR directly:
  // atan((topR-bottomR)/height) = atan(25/120) ≈ 11.768deg.
  {
    label: "[reference pot] bottomR=50 topR=75 height=120 wallT=2.5",
    opts: {
      outerTopDiam: 150,
      height: 120,
      wallT: 2.5,
      floorT: 2.5,
      draftDeg: (Math.atan((75 - 50) / 120) * 180) / Math.PI,
      drainHoleCount: 8,
      drainHoleDiam: 5.0,
    },
  },
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
      drainHoleDiam: 5.0,
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
