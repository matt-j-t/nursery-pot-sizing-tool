// Assembles the full nursery-pot triangle list from a calculator spec.
// Direct port of pot_builder.py.
import * as geo from "./geometry.js";

export function buildPotMesh(spec) {
  const n = spec.nSeg;
  const nHole = 16;

  const RTopOuter = spec.outerTopDiam / 2.0;
  const RBottomOuter = spec.outerBottomDiam / 2.0;
  const RInnerFloorTop = spec.innerBottomDiam / 2.0;
  const RTopInner = spec.innerTopDiam / 2.0;
  const H = spec.height;
  const floorT = spec.floorT;

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

  // Base grooves — radial channels recessed into the floor's underside,
  // built as their own radial x angular grid (see geo.radialGrid, ported
  // from docs/features-wip/pot-floor.mjs) rather than warping a flat cap.
  // One channel per drain hole, at the same angles as the drain holes
  // below. grooveZAt is also needed up here to warp the outer wall's own
  // bottom ring (ringBottomOuter, both branches below) so it stays
  // seamless with the grooved floor — same "apply the same offset
  // everywhere the two surfaces must stay seamless" pattern the lift
  // notch already uses for its outer+inner walls.
  const groovesOn = !!spec.groovesEnabled && (spec.grooveCenters || []).length > 0;
  const grooveOpts = {
    gapMM: spec.grooveGapMM,
    rampMM: spec.grooveRampMM,
    halfWidthAngle: spec.grooveHalfWidthMM / spec.hubRadiusMM,
  };
  const grooveZAt = (r, theta) => geo.grooveOffsetAt(r, theta, spec.grooveCenters, spec.hubRadiusMM, grooveOpts);
  const warpRingZ = (ring) =>
    groovesOn ? ring.map(([x, y, z]) => [x, y, z + grooveZAt(Math.hypot(x, y), Math.atan2(y, x))]) : ring;

  let ringBottomOuter, ringTopOuter, ringBottomInner, ringTopInner;

  if (hasNotch || hasSlots) {
    // floorT..H is shared, ring-for-ring, between the outer and inner
    // grids — required so the generic stitcher can connect a hole's
    // outer-surface boundary loop directly to the matching inner-surface
    // vertices by (ring, column) index, with no spatial search needed.
    const sharedZs = geo.mergeZLevels(
      geo.notchZLevels(floorT, H, notchOpts.fadeSpanMM),
      hasSlots ? geo.slotZLevels(slotZLo, slotZHi, spec.slotNRings) : []
    );
    const outerRadiusFn = (z, theta) => {
      const base = RBottomOuter + (RTopOuter - RBottomOuter) * (z / H);
      return base + geo.notchOffsetAt(theta, z, notchCenters, RTopOuter, H, notchOpts);
    };
    const innerRadiusFn = (z, theta) => {
      const base = RInnerFloorTop + (RTopInner - RInnerFloorTop) * ((z - floorT) / (H - floorT));
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

    // Outer wall below floorT (floor skin, unaffected by notch/slots —
    // both are validated in calculator.js to stay above this z) as a
    // plain, un-notched taper, joined seamlessly to the grid above since
    // both use the identical base-taper formula at z=floorT.
    const radiusAtFloorT = RBottomOuter + (RTopOuter - RBottomOuter) * (floorT / H);
    ringBottomOuter = warpRingZ(geo.ring3(RBottomOuter, 0.0, n));
    const ringFloorTOuter = geo.ring3(radiusAtFloorT, floorT, n);
    pieces.push(...geo.quadStrip(ringBottomOuter, ringFloorTOuter, true));

    ringTopOuter = outerGrid.rings[outerGrid.rings.length - 1];
    ringBottomInner = innerGrid.rings[0];
    ringTopInner = innerGrid.rings[innerGrid.rings.length - 1];

    // Top rim cap — built from the actual (possibly notched) top rings so
    // it shares vertices with the walls exactly, with no seam.
    pieces.push(...geo.annulusCapFromRings(ringTopOuter, ringTopInner, true));
  } else {
    // 1) Outer wall, full height (continuous taper, covers floor skin + cavity wall)
    ringBottomOuter = warpRingZ(geo.ring3(RBottomOuter, 0.0, n));
    ringTopOuter = geo.ring3(RTopOuter, H, n);
    pieces.push(...geo.quadStrip(ringBottomOuter, ringTopOuter, true));

    // 2) Inner wall, floorT..H
    ringBottomInner = geo.ring3(RInnerFloorTop, floorT, n);
    ringTopInner = geo.ring3(RTopInner, H, n);
    pieces.push(...geo.quadStrip(ringBottomInner, ringTopInner, false));

    // 3) Top rim cap
    pieces.push(...geo.annulusCap(RTopOuter, RTopInner, H, n, true));
  }

  // 4) Drainage holes
  const nHoles = spec.drainHoleCount;
  const holeCenters = [];
  let holeR = spec.drainHoleDiam / 2.0;
  if (nHoles > 0) {
    const boltR = spec.drainHoleBoltCircleDiam / 2.0;
    for (let i = 0; i < nHoles; i++) {
      const a = (2 * Math.PI * i) / nHoles;
      holeCenters.push([boltR * Math.cos(a), boltR * Math.sin(a)]);
    }
  }

  if (groovesOn) {
    // Floor built as its own radial x angular grid (ported from
    // docs/features-wip/pot-floor.mjs) instead of warping a flat
    // ear-clip-triangulated cap — see the comment above geo.radialGrid
    // for why the flat-cap approach produced chaotic fan triangulation.
    const hubR = spec.hubRadiusMM;
    const rampMM = spec.grooveRampMM;

    // A grid cell (ring at radius r, column k) is "open" if that cell's
    // actual (x,y) position falls within a drain hole's radius — a direct
    // 2D circle test on the grid (holes are localized in both r and
    // theta, unlike the air slots' full-band angular test).
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

    // r-levels: hub, end of ramp, and RInnerFloorTop (where the top
    // surface stops — matching where the original flat floor-top cap
    // ended and the inner wall begins), plus extra rings bracketing each
    // drain hole's radial footprint so the hole has an actual
    // ring-to-ring step to be cut out of (a hole positioned mid-span
    // inside one long quad strip could never be marked "open").
    const holeBracketLevels = [];
    for (const [hx, hy] of holeCenters) {
      const rc = Math.hypot(hx, hy);
      holeBracketLevels.push(Math.max(hubR, rc - holeR * 1.3), rc + holeR * 1.3);
    }
    const rLevelsShared = geo
      .mergeZLevels([hubR, hubR + rampMM, RInnerFloorTop], holeBracketLevels)
      .filter((r) => r <= RInnerFloorTop + 1e-6);
    const rLevelsOuter = geo.mergeZLevels(rLevelsShared, [RBottomOuter]);

    const outerFloorGrid = geo.radialGrid(grooveZAt, rLevelsOuter, n, holeOpenColumnsAtR);
    const innerFloorGrid = geo.radialGrid(() => floorT, rLevelsShared, n, holeOpenColumnsAtR);

    pieces.push(...geo.wallGridFaces(outerFloorGrid, false));
    pieces.push(...geo.wallGridFaces(innerFloorGrid, true));
    // Seals every drain hole loop found inside this grid (the grid's own
    // inner/outer edge rings — hub and RBottomOuter/RInnerFloorTop — are
    // excluded automatically, same as the wall's slot stitching above).
    pieces.push(...geo.stitchWallGridHoles(outerFloorGrid, innerFloorGrid));

    // Hub fans — the single legitimate fan point in this construction
    // (see pot-floor.mjs comment): bottom flush with the bed, top flush
    // with the floor's soil-facing surface.
    pieces.push(...geo.flatDiscFan(hubR, 0.0, n, 0, 0, false));
    pieces.push(...geo.flatDiscFan(hubR, floorT, n, 0, 0, true));
  } else {
    // 5) Bottom cap
    if (nHoles > 0) {
      pieces.push(...geo.discWithHoles3D(RBottomOuter, holeCenters, holeR, 0.0, n, nHole, false));
    } else {
      pieces.push(...geo.flatDiscFan(RBottomOuter, 0.0, n, 0, 0, false));
    }

    // 6) Floor-top cap
    if (nHoles > 0) {
      pieces.push(...geo.discWithHoles3D(RInnerFloorTop, holeCenters, holeR, floorT, n, nHole, true));
    } else {
      pieces.push(...geo.flatDiscFan(RInnerFloorTop, floorT, n, 0, 0, true));
    }

    // 7) Hole tunnel walls
    if (nHoles > 0) {
      pieces.push(...geo.holeTunnelWalls(holeCenters, holeR, 0.0, floorT, nHole));
    }
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
