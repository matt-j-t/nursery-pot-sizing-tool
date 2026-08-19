// Dome floor — tested reference implementation, kept verbatim-in-spirit
// alongside the version wired into docs/js/geometry.js + potBuilder.js
// (same pattern as every other features-wip file in this project). Units
// here are METERS, matching this folder's convention; the wired-in
// version in docs/js/ works in mm.
//
// Replaces ALL earlier raised-channel / hub-and-spoke / diagonal-tunnel
// base designs (pot-floor.mjs, pot-floor-angular.mjs, logo-emboss.mjs —
// deleted). Those were abandoned after repeated print failures:
// cantilevers, floating islands, base openings visible on both faces,
// and (flagged separately, after Task 1's tangential fix) a floor that
// was still locally paper-thin at each channel because the radial
// gap/height was applied as a naive constant-height offset rather than a
// true wallT-thickness normal-offset.
//
// See docs/nursery-pot-parametric-spec.md for the full locked-in spec.
// Reference pot used throughout: bottomR=0.05, topR=0.075, height=0.12,
// wallT=0.0025 (all meters).

// ---------------------------------------------------------------------
// Dome height field — flat plateau, straight conical slope, flat outer
// ring. Radially symmetric (theta-independent), so it's ONE continuous
// surface that's always resting on material below it as printing
// proceeds outward from the flat outer ring's full bed contact — zero
// bridging, zero cantilevers, by construction, not by careful tuning.
// ---------------------------------------------------------------------

export const FLAT_TOP_R = 0.010; // FIXED — sized to frame the ~12x5mm logo with margin
export const DOME_RISE = 0.008; // reference — how far the plateau stands above the outer flat zone
export const SLOPE_RUN = 0.010; // reference — radial distance the rise happens over

export function domeHeight(r, flatTopR = FLAT_TOP_R, domeRise = DOME_RISE, slopeRun = SLOPE_RUN) {
  const domeOuterR = flatTopR + slopeRun;
  if (r <= flatTopR) return domeRise;
  if (r <= domeOuterR) return domeRise * (1 - (r - flatTopR) / slopeRun);
  return 0;
}

// atan(domeRise / slopeRun) — MUST stay <=45 deg (global print-safety
// rule, no exceptions). Reference values give 38.7 deg, confirmed with
// margin. If domeRise or slopeRun change, call this again — don't assume
// the angle is still safe.
export function domeSlopeAngleDeg(domeRise = DOME_RISE, slopeRun = SLOPE_RUN) {
  return (Math.atan2(domeRise, slopeRun) * 180) / Math.PI;
}
console.assert(domeSlopeAngleDeg() <= 45, "dome slope angle must stay <=45 deg from the global print-safety rule");

// ---------------------------------------------------------------------
// True per-facet normal offset (solidify-style) of an open piecewise-
// linear profile, moved INWARD by `thickness`. A naive offset that just
// shifts z by a constant is only exact where the profile is flat — this
// offsets each straight segment along its own true 2D normal, then
// re-intersects adjacent offset segments at each interior corner
// (standard mitered-polyline-offset construction). This is what keeps
// wall thickness genuinely constant through the dome's slope instead of
// a gap/height parameter silently eating into it (the exact bug that
// made the earlier channel design's floor paper-thin: a channel gap
// equal to wallT left zero material there).
//
// Verified numerically against the reference dimensions: the flat
// plateau shifts by exactly +wallT in z with unchanged radius, the flat
// outer ring likewise, and the perpendicular distance from the exterior
// slope segment to the offset interior slope segment is exactly wallT
// at every point sampled along it (not just at the ends).
export function offsetProfileInward(profile, thickness) {
  const segs = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i];
    const [r1, z1] = profile[i + 1];
    const tr = r1 - r0, tz = z1 - z0;
    const len = Math.hypot(tr, tz) || 1;
    const nr = tz / len, nz = -tr / len; // outward normal
    segs.push({ or0: r0 - thickness * nr, oz0: z0 - thickness * nz, tr, tz });
  }
  function lineIntersect(a, b) {
    const det = a.tr * b.tz - a.tz * b.tr;
    if (Math.abs(det) < 1e-12) return [a.or0, a.oz0]; // parallel — shouldn't happen here
    const dr = b.or0 - a.or0, dz = b.oz0 - a.oz0;
    const s = (dr * b.tz - dz * b.tr) / det;
    return [a.or0 + s * a.tr, a.oz0 + s * a.tz];
  }
  const out = [];
  for (let i = 0; i < profile.length; i++) {
    if (i === 0) out.push([segs[0].or0, segs[0].oz0]);
    else if (i === profile.length - 1) {
      const s = segs[segs.length - 1];
      out.push([s.or0 + s.tr, s.oz0 + s.tz]);
    } else out.push(lineIntersect(segs[i - 1], segs[i]));
  }
  return out;
}

// ---------------------------------------------------------------------
// Drain holes — round, simple through-holes in the flat outer ring, well
// outboard of the slope and inboard of the outer wall. Reference:
// holeRPos=0.042, 8 holes, 0.005 diameter. No other openings anywhere on
// the base (both faces fully solid except these holes) — this was a
// hard-learned constraint; the dome avoids the earlier diagonal-channel
// design's unintended base openings entirely, since it has no
// embedded/hidden tunnels at all.
// ---------------------------------------------------------------------

export const HOLE_R_POS = 0.042;
export const HOLE_COUNT = 8;
export const HOLE_DIAM = 0.005;

// ---------------------------------------------------------------------
// mjt logo emboss — extruded directly from the exact vector polygon data
// in logo-data.mjs (LOGO_POLYGONS: m, j, t, and the j's dot as separate
// simple closed rings — already exact, parsed once from mjt-logo.svg),
// NOT sampled onto a heightfield grid. The earlier grid-sampled approach
// (logo-emboss.mjs, deleted) produced visibly fuzzy/jagged letter edges
// at print resolution, because the mesh's fixed-resolution sample grid
// was poorly aligned to the actual glyph boundaries.
//
// Each polygon becomes its own small independent extruded solid resting
// on the floor's flat interior plateau (r<=flatTopR after the wallT
// offset) — bottom cap, top cap, and side walls, a fully closed and
// independently watertight mesh. No boolean/CSG union with the plateau
// underneath is needed: two solids that share a flat contact plane are
// already a valid, printable construction, and keeping each polygon's
// own bottom cap (rather than trying to weld into the plateau's own
// triangulation) is what lets each stay independently closed — verified
// directly: the combined mesh (pot body + all 5 logo solids) reports
// zero boundary edges and zero non-manifold edges under the project's
// manifoldCheck, exactly as this reasoning predicts.
//
// This is why the logo emboss doesn't appear in this file as geometry —
// it's built with the SAME generic earClip-based extrusion primitive the
// dome floor's own flat-NGON caps use (geo.polygonPrism in
// docs/js/geometry.js), applied per-polygon; there's no bespoke logo math
// left to keep as a separate reference beyond the polygon data itself.
export const LOGO_EMBOSS_HEIGHT = 0.0005;

// ---------------------------------------------------------------------
// Global print-safety rule this file leans on hardest: single-point
// vertex fans are banned everywhere, even at a shape's center (they
// produce degenerate normals under thickness-offset and can push
// geometry to the wrong side of a surface). The flat plateau (r<=
// flatTopR) is therefore capped as a flat NGON — earClip triangulated
// across its own boundary vertices — never a fan from a true center
// point. See geo.ngonCap in docs/js/geometry.js.
// ---------------------------------------------------------------------
