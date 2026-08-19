// Assembles the full nursery-pot triangle list from a calculator spec.
// Direct port of pot_builder.py.
import * as geo from "./geometry.js";
// mjt logo — vector polygon data (already exact, parsed from the source
// SVG once), extruded directly via geo.polygonPrism rather than sampled
// onto a heightfield grid (the earlier approach produced visibly
// fuzzy/jagged letter edges at print resolution — see
// docs/features-wip/pot-floor-dome.mjs).
import { LOGO_POLYGONS } from "../features-wip/logo-data.mjs";

export function buildPotMesh(spec) {
  const n = spec.nSeg;

  const RTopOuter = spec.outerTopDiam / 2.0;
  const RBottomOuter = spec.outerBottomDiam / 2.0;
  const RInnerFloorTop = spec.innerBottomDiam / 2.0;
  const RTopInner = spec.innerTopDiam / 2.0;
  const H = spec.height;
  // The dome floor's flat outer ring — and so the wall's own floor-skin
  // z-height where the inner wall begins — is the pot's normal wallT
  // (see docs/nursery-pot-parametric-spec.md); floorT no longer drives
  // any geometry here (calculator.js notes this if it differs from wallT).
  const wallT = spec.wallT;

  const pieces = [];

  // Lift notch(es) — baked into the outer AND inner wall radius formulas
  // (same offset applied to both, so the wall thickness stays constant
  // through the notch instead of the outer dimple breaching into the
  // cavity). See geo.notchOffsetAt / docs/features-wip/pot-body.mjs.
  const notchCenters = spec.notchCenters || [];
  const notchOpts = {
    halfWidthMM: spec.notchHalfWidthMM,
    recessMM: spec.notchRecessMM,
    fadeSpanMM: spec.notchFadeSpanMM,
  };
  const hasNotch = notchCenters.length > 0;

  // Air slots — genuine through-holes, built as omitted cells in the wall
  // grid (a shrinking open-column-per-ring tapering "pyramid", so the
  // hole self-caps with small stepped faces instead of needing a bridged
  // roof) and closed with the generic boundary-loop stitcher. See
  // docs/features-wip/pot-slots-wip.mjs / nursery-pot-features-spec.md.
  const slotCenters = spec.airSlotsEnabled ? spec.slotCenters || [] : [];
  const hasSlots = slotCenters.length > 0;
  const slotZLo = spec.slotZLo, slotZHi = spec.slotZHi;

  // Constant-width rectangular through-slot: the open-column set is
  // computed ONCE (from the taper radius at the band's vertical midpoint)
  // and reused unchanged at every ring inside [slotZLo, slotZHi]. Earlier
  // this shrank column-by-column from full width to a near-zero "sliver"
  // as z rose through the band (a self-capping taper) — but with a
  // discrete column grid, each ring where the column count dropped by one
  // produced a small stair-step ledge, which is what rendered as a
  // pointed/triangular, toothed-looking edge instead of a clean slot. A
  // slot only 2-4mm wide is well within safe unsupported-bridge distance
  // for FDM, so there's no need to taper it shut at all — a flat
  // rectangular opening prints fine and is far simpler.
  const slotColCount = (() => {
    if (!hasSlots) return 0;
    const zMid = (slotZLo + slotZHi) / 2;
    const radiusAtMid = RBottomOuter + (RTopOuter - RBottomOuter) * (zMid / H);
    const colWidthMM = radiusAtMid * (2 * Math.PI / n);
    return Math.max(1, Math.round(spec.slotWidthMM / colWidthMM));
  })();
  const slotColHalfSpan = Math.floor((slotColCount - 1) / 2);
  const slotCenterKs = slotCenters.map((centerTheta) => Math.round((centerTheta / (2 * Math.PI)) * n));

  function slotOpenColumnsAt(z) {
    const cols = new Set();
    if (!hasSlots) return cols;
    if (z < slotZLo - 1e-6 || z > slotZHi + 1e-6) return cols;
    for (const centerK of slotCenterKs) {
      for (let dk = -slotColHalfSpan; dk <= slotColHalfSpan; dk++) {
        cols.add(((centerK + dk) % n + n) % n);
      }
    }
    return cols;
  }

  let ringBottomOuter, ringTopOuter, ringBottomInner, ringTopInner;

  if (hasNotch || hasSlots) {
    // wallT..H is shared, ring-for-ring, between the outer and inner
    // grids — required so the generic stitcher can connect a hole's
    // outer-surface boundary loop directly to the matching inner-surface
    // vertices by (ring, column) index, with no spatial search needed.
    const sharedZs = geo.mergeZLevels(
      geo.notchZLevels(wallT, H, notchOpts.fadeSpanMM),
      hasSlots ? geo.slotZLevels(slotZLo, slotZHi, spec.slotNRings) : []
    );
    const outerRadiusFn = (z, theta) => {
      const base = RBottomOuter + (RTopOuter - RBottomOuter) * (z / H);
      return base + geo.notchOffsetAt(theta, z, notchCenters, RTopOuter, H, notchOpts);
    };
    const innerRadiusFn = (z, theta) => {
      const base = RInnerFloorTop + (RTopInner - RInnerFloorTop) * ((z - wallT) / (H - wallT));
      return base + geo.notchOffsetAt(theta, z, notchCenters, RTopOuter, H, notchOpts);
    };

    const outerGrid = geo.wallGrid(outerRadiusFn, sharedZs, n, slotOpenColumnsAt);
    const innerGrid = geo.wallGrid(innerRadiusFn, sharedZs, n, slotOpenColumnsAt);
    pieces.push(...geo.wallGridFaces(outerGrid, true));
    pieces.push(...geo.wallGridFaces(innerGrid, false));
    // Seals every genuine hole loop (air slots) found inside this grid —
    // the grid's own top/bottom rim boundaries are excluded automatically
    // (see excludeEdgeRings in geo.findGridHoleLoops) since those are
    // capped separately below, not holes.
    pieces.push(...geo.stitchWallGridHoles(outerGrid, innerGrid));

    // Outer wall below wallT (floor skin, unaffected by notch/slots —
    // both are validated in calculator.js to stay above this z) as a
    // plain, un-notched taper, joined seamlessly to the grid above since
    // both use the identical base-taper formula at z=wallT. The dome
    // itself never reaches this radius (RBottomOuter is always outboard
    // of domeOuterR — see calculator.js), so this ring needs no warp.
    const radiusAtWallT = RBottomOuter + (RTopOuter - RBottomOuter) * (wallT / H);
    ringBottomOuter = geo.ring3(RBottomOuter, 0.0, n);
    const ringWallTOuter = geo.ring3(radiusAtWallT, wallT, n);
    pieces.push(...geo.quadStrip(ringBottomOuter, ringWallTOuter, true));

    ringTopOuter = outerGrid.rings[outerGrid.rings.length - 1];
    ringBottomInner = innerGrid.rings[0];
    ringTopInner = innerGrid.rings[innerGrid.rings.length - 1];

    // Top rim cap — built from the actual (possibly notched) top rings so
    // it shares vertices with the walls exactly, with no seam.
    pieces.push(...geo.annulusCapFromRings(ringTopOuter, ringTopInner, true));
  } else {
    // 1) Outer wall, full height (continuous taper, covers floor skin + cavity wall)
    ringBottomOuter = geo.ring3(RBottomOuter, 0.0, n);
    ringTopOuter = geo.ring3(RTopOuter, H, n);
    pieces.push(...geo.quadStrip(ringBottomOuter, ringTopOuter, true));

    // 2) Inner wall, wallT..H
    ringBottomInner = geo.ring3(RInnerFloorTop, wallT, n);
    ringTopInner = geo.ring3(RTopInner, H, n);
    pieces.push(...geo.quadStrip(ringBottomInner, ringTopInner, false));

    // 3) Top rim cap
    pieces.push(...geo.annulusCap(RTopOuter, RTopInner, H, n, true));
  }

  // 4) Drainage holes — round through-holes in the dome's flat outer
  // ring, well outboard of the slope (see calculator.js's minBoltR check).
  const nHoles = spec.drainHoleCount;
  const holeCenters = [];
  let holeR = spec.drainHoleDiam / 2.0;
  if (nHoles > 0) {
    const boltR = spec.holeBoltCircleRMM;
    for (let i = 0; i < nHoles; i++) {
      const a = (2 * Math.PI * i) / nHoles;
      holeCenters.push([boltR * Math.cos(a), boltR * Math.sin(a)]);
    }
  }

  // 5) Dome floor — see docs/nursery-pot-parametric-spec.md and
  // docs/features-wip/pot-floor-dome.mjs. A single continuous,
  // theta-independent (radially symmetric) surface: flat plateau, a
  // straight conical slope, then a flat outer ring — self-supporting by
  // construction (every new printed layer sits on solid material below
  // it, starting from the outer ring's full bed contact).
  const flatTopR = spec.domeFlatTopRMM;
  const domeRise = spec.domeRiseMM;
  const slopeRun = spec.domeSlopeRunMM;
  const domeOuterR = spec.domeOuterRMM;

  // Exterior z(r) is geo.domeHeight directly. Interior z(r) is the TRUE
  // per-facet wallT normal-offset of the plateau+slope portion (see
  // geo.offsetProfileInward — this is what keeps wall thickness genuinely
  // constant through the slope, not a naive vertical shift), then the
  // flat outer ring continues out to RInnerFloorTop at that offset's own
  // height — exactly how the floor already met the inner wall before the
  // dome existed.
  // The 4th point (domeOuterR+1, 0) is a dummy — just far enough along
  // the flat outer line to give the domeOuterR corner a real neighboring
  // segment to miter against. Without it, offsetProfileInward would treat
  // that corner as an open ENDPOINT (using only the slope's own normal,
  // not the true mitered corner), which silently undershoots wallT there.
  const intDomeOnly = geo.offsetProfileInward(
    [[0, domeRise], [flatTopR, domeRise], [domeOuterR, 0], [domeOuterR + 1, 0]],
    wallT
  );
  const flatTopRInt = intDomeOnly[1][0];
  const intFlatZ = intDomeOnly[1][1]; // domeRise + wallT
  const domeOuterRInt = intDomeOnly[2][0];
  const intOuterZ = intDomeOnly[2][1]; // wallT
  const intSlopeSlope = (intOuterZ - intFlatZ) / (domeOuterRInt - flatTopRInt);

  function extFloorZ(r) {
    return geo.domeHeight(r, flatTopR, domeRise, slopeRun);
  }
  function intFloorZ(r) {
    if (r <= flatTopRInt) return intFlatZ;
    if (r <= domeOuterRInt) return intFlatZ + intSlopeSlope * (r - flatTopRInt);
    return intOuterZ;
  }

  // A grid cell (ring at radius r, column k) is "open" if that cell's
  // actual (x,y) position falls within a drain hole's radius — same
  // technique used for air slots above, just a direct 2D circle test
  // since holes are localized in both r and theta.
  function holeOpenColumnsAtR(r) {
    const cols = new Set();
    for (let k = 0; k < n; k++) {
      const theta = (2 * Math.PI * k) / n;
      const x = r * Math.cos(theta), y = r * Math.sin(theta);
      for (const [hx, hy] of holeCenters) {
        if (Math.hypot(x - hx, y - hy) < holeR) {
          cols.add(k);
          break;
        }
      }
    }
    return cols;
  }

  // r-levels bracketing each drain hole's radial footprint, shared by
  // both surfaces (a straight vertical hole has the same x,y footprint
  // top to bottom). A ring EXACTLY at rc +/- holeR only touches the
  // hole's circle at a single point (distance == holeR, not < holeR), so
  // it always computes an EMPTY open-column set — the brackets sit just
  // outside the circle (kept fully closed) with interior rings strictly
  // inside it (rc +/- up to ~0.9*holeR) so the cut actually tapers in
  // toward rc across several rings, like facets on a polygon
  // approximating a circle.
  const holeBracketLevels = [];
  const nHoleRings = 5;
  for (const [hx, hy] of holeCenters) {
    const rc = Math.hypot(hx, hy);
    holeBracketLevels.push(rc - holeR * 1.15, rc + holeR * 1.15);
    for (let i = 0; i <= nHoleRings; i++) {
      holeBracketLevels.push(rc - holeR * 0.9 + holeR * 1.8 * (i / nHoleRings));
    }
  }
  const rLevelsExt = geo
    .mergeZLevels([flatTopR, domeOuterR, RBottomOuter], holeBracketLevels)
    .filter((r) => r >= flatTopR - 1e-6 && r <= RBottomOuter + 1e-6);
  const rLevelsInt = geo
    .mergeZLevels([flatTopRInt, domeOuterRInt, RInnerFloorTop], holeBracketLevels)
    .filter((r) => r >= flatTopRInt - 1e-6 && r <= RInnerFloorTop + 1e-6);

  const extFloorGrid = geo.radialGrid(extFloorZ, rLevelsExt, n, holeOpenColumnsAtR);
  const intFloorGrid = geo.radialGrid(intFloorZ, rLevelsInt, n, holeOpenColumnsAtR);

  pieces.push(...geo.wallGridFaces(extFloorGrid, false));
  pieces.push(...geo.wallGridFaces(intFloorGrid, true));
  // Seals every drain hole loop found inside this grid (the grid's own
  // inner/outer edge rings — the plateau boundary and RBottomOuter /
  // RInnerFloorTop — are excluded automatically, same as the wall's slot
  // stitching above).
  pieces.push(...geo.stitchWallGridHoles(extFloorGrid, intFloorGrid));

  // Plateau caps — flat NGON caps (earClip across their own boundary,
  // never a single-point fan — a banned construction everywhere in this
  // spec, not just here) sharing vertices exactly with the ring-lofts
  // above (both built from circleXY(radius, n) at the same theta
  // sampling, so there's no seam).
  pieces.push(...geo.ngonCap(flatTopR, domeRise, n, false));
  pieces.push(...geo.ngonCap(flatTopRInt, intFlatZ, n, true));

  // 6) mjt logo — extruded directly from its exact vector polygon data
  // (geo.polygonPrism), resting on the interior plateau (r<=flatTopRInt,
  // comfortably larger than the logo's ~12x5mm footprint at any
  // reasonable pot size). Each polygon (m, j, t, the j's dot) becomes its
  // own small independent solid — no boolean/CSG union needed, since two
  // solids sharing a flat contact plane already print correctly, and
  // each stays its own fully closed, individually watertight mesh rather
  // than trying to weld into the plateau cap's own triangulation.
  const LOGO_EMBOSS_HEIGHT_MM = 0.5;
  for (const poly of LOGO_POLYGONS) {
    const polyMM = poly.map(([x, y]) => [x * 1000, y * 1000]);
    pieces.push(...geo.polygonPrism(polyMM, intFlatZ, LOGO_EMBOSS_HEIGHT_MM));
  }

  // No feet: the pot sits flat on its own floor (z=0) for reliable
  // first-layer adhesion.

  return pieces; // array of [p0,p1,p2] triangles
}

// Flat Float32Array of vertex positions (3 verts * 3 comps per triangle),
// suitable for a non-indexed THREE.BufferGeometry.
export function trianglesToFloat32(triangles) {
  const arr = new Float32Array(triangles.length * 9);
  let o = 0;
  for (const [p0, p1, p2] of triangles) {
    arr[o++] = p0[0]; arr[o++] = p0[1]; arr[o++] = p0[2];
    arr[o++] = p1[0]; arr[o++] = p1[1]; arr[o++] = p1[2];
    arr[o++] = p2[0]; arr[o++] = p2[1]; arr[o++] = p2[2];
  }
  return arr;
}
