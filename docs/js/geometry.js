// Pure-JS mesh construction primitives for a round, tapered nursery pot.
// Direct port of geometry.py. Triangles are represented as arrays of
// three [x,y,z] points; winding conventions were empirically verified in
// the Python version via signed-volume tests against analytical frustum
// volumes — see geometry.py comments for the derivations.

const TWO_PI = 2 * Math.PI;

export function circleXY(radius, n, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (TWO_PI * i) / n;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
}

export function ring3(radius, z, n, cx = 0, cy = 0) {
  return circleXY(radius, n, cx, cy).map(([x, y]) => [x, y, z]);
}

// outward=true => normal points away from the shared axis (e.g. outer pot
// wall); outward=false => normal points toward the axis (inner wall / hole
// wall). Valid for rings that differ in z (lateral/wall surfaces).
export function quadStrip(ringA, ringB, outward = true) {
  const n = ringA.length;
  const tris = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = ringA[i], a1 = ringA[j];
    const b0 = ringB[i], b1 = ringB[j];
    if (outward) {
      tris.push([a0, a1, b1]);
      tris.push([a0, b1, b0]);
    } else {
      tris.push([a0, b1, a1]);
      tris.push([a0, b0, b1]);
    }
  }
  return tris;
}

export function flatDiscFan(radius, z, n, cx = 0, cy = 0, facingUp = true) {
  const ring = ring3(radius, z, n, cx, cy);
  const center = [cx, cy, z];
  const tris = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (facingUp) tris.push([center, ring[i], ring[j]]);
    else tris.push([center, ring[j], ring[i]]);
  }
  return tris;
}

// Flat washer cap (e.g. pot's top rim). Note: for a flat ring at constant z
// with increasing radius, quadStrip's outward=true actually yields a -z
// (down) normal — its convention was derived for radius-vs-z lateral
// walls, not radius-vs-radius flats — so this intentionally inverts.
export function annulusCap(rOuter, rInner, z, n, facingUp = true) {
  const outer = ring3(rOuter, z, n);
  const inner = ring3(rInner, z, n);
  return quadStrip(inner, outer, !facingUp);
}

// ---------------------------------------------------------------------
// Ear-clipping triangulation for a polygon with circular holes (2D)
// ---------------------------------------------------------------------

function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    s += x0 * y1 - x1 * y0;
  }
  return 0.5 * s;
}

function crossZ(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTri(p, a, b, c, eps) {
  const d1 = crossZ(a, b, p);
  const d2 = crossZ(b, c, p);
  const d3 = crossZ(c, a, p);
  const hasNeg = d1 < -eps || d2 < -eps || d3 < -eps;
  const hasPos = d1 > eps || d2 > eps || d3 > eps;
  return !(hasNeg && hasPos);
}

function dist2d(p, q) {
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

export function earClip(polyPtsIn) {
  const pts = polyPtsIn.slice();
  let idx = pts.map((_, i) => i);
  if (signedArea(pts) < 0) idx = idx.reverse();

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1.0);
  const epsArea = span * span * 1e-9;
  const epsDup = span * 1e-7;

  const triangles = [];
  const maxGuard = idx.length * idx.length + 100;
  let guard = 0;
  while (idx.length > 3 && guard < maxGuard) {
    guard++;
    const n = idx.length;
    let found = false;
    for (let k = 0; k < n; k++) {
      const i0 = idx[(k - 1 + n) % n];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % n];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      if (crossZ(a, b, c) <= epsArea) continue;
      let ok = true;
      for (const m of idx) {
        if (m === i0 || m === i1 || m === i2) continue;
        const pm = pts[m];
        if (dist2d(pm, a) < epsDup || dist2d(pm, b) < epsDup || dist2d(pm, c) < epsDup) continue;
        if (pointInTri(pm, a, b, c, epsArea)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        triangles.push([i0, i1, i2]);
        idx.splice(k, 1);
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  if (idx.length === 3) {
    const [i0, i1, i2] = idx;
    if (crossZ(pts[i0], pts[i1], pts[i2]) > 0) triangles.push([i0, i1, i2]);
  }
  return { triangles, pts };
}

function bridgeHole(boundary, hole) {
  let best = Infinity, bi = 0, bj = 0;
  for (let i = 0; i < boundary.length; i++) {
    for (let j = 0; j < hole.length; j++) {
      const d = dist2d(boundary[i], hole[j]);
      if (d < best) {
        best = d;
        bi = i;
        bj = j;
      }
    }
  }
  return [
    ...boundary.slice(0, bi + 1),
    ...hole.slice(bj),
    ...hole.slice(0, bj + 1),
    ...boundary.slice(bi),
  ];
}

export function discWithHoles2D(outerRadius, holeCenters, holeRadius, nOuter = 48, nHole = 14) {
  let boundary = circleXY(outerRadius, nOuter);
  for (const [hx, hy] of holeCenters) {
    const hole = circleXY(holeRadius, nHole, hx, hy).reverse(); // CW hole
    boundary = bridgeHole(boundary, hole);
  }
  return earClip(boundary);
}

export function discWithHoles3D(outerRadius, holeCenters, holeRadius, z, nOuter = 48, nHole = 14, facingUp = true) {
  const { triangles, pts } = discWithHoles2D(outerRadius, holeCenters, holeRadius, nOuter, nHole);
  const out = [];
  for (const [i0, i1, i2] of triangles) {
    const p0 = [pts[i0][0], pts[i0][1], z];
    const p1 = [pts[i1][0], pts[i1][1], z];
    const p2 = [pts[i2][0], pts[i2][1], z];
    out.push(facingUp ? [p0, p1, p2] : [p0, p2, p1]);
  }
  return out;
}

export function holeTunnelWalls(holeCenters, holeRadius, z0, z1, nHole = 14) {
  const out = [];
  for (const [hx, hy] of holeCenters) {
    const ringA = ring3(holeRadius, z0, nHole, hx, hy);
    const ringB = ring3(holeRadius, z1, nHole, hx, hy);
    out.push(...quadStrip(ringA, ringB, false));
  }
  return out;
}

export function cylinderSolid(radius, z0, z1, n = 24, cx = 0, cy = 0, topRadius = null) {
  const r0 = radius;
  const r1 = topRadius === null ? radius : topRadius;
  const ringA = ring3(r0, z0, n, cx, cy);
  const ringB = ring3(r1, z1, n, cx, cy);
  const side = quadStrip(ringA, ringB, true);
  const bottom = flatDiscFan(r0, z0, n, cx, cy, false);
  const top = flatDiscFan(r1, z1, n, cx, cy, true);
  return [...side, ...bottom, ...top];
}

// ---------------------------------------------------------------------
// Lift notch — ported from the Blender-validated docs/features-wip/pot-body.mjs.
// The notch is baked directly into the wall's radius formula (a small
// inward dimple, strongest at the rim, fading to zero over the top
// `fadeSpanMM` of wall going down) rather than built as a hole, so it
// needs no boundary-stitching at all. Units here are mm (the reference
// file used meters — this is the converted, direct equivalent).
//
// Applying the SAME offset (same notch centers, same reference radius,
// same fade) to both the outer wall ring formula AND the inner wall ring
// formula keeps the radial wall thickness constant through the notch
// band, so the dimple reads as a bump pressed into the wall (visible on
// both faces, like a thumbprint in rubber) rather than a breach through
// to the cavity — see potBuilder.js for how both walls share the offset.
// ---------------------------------------------------------------------

export function cosTaper(d, halfAngle) {
  if (Math.abs(d) >= halfAngle) return 0.0;
  return Math.cos((Math.PI / 2) * d / halfAngle);
}

// One notch's angular radius offset (mm, negative = recessed inward),
// centered at `centerTheta`. Fixed physical size regardless of pot size:
// `halfWidthMM` half-width (10mm default -> 20mm total span) computed
// against `refRadiusMM` (the rim/top outer radius, matching the
// reference's "computed from actual rim radius" convention), and
// `recessMM` max inward depth (6mm default).
export function notchAngularProfile(theta, centerTheta, refRadiusMM, halfWidthMM = 10, recessMM = 6) {
  const halfWidthAngle = halfWidthMM / refRadiusMM;
  let d = theta - centerTheta;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-pi, pi]
  return -recessMM * cosTaper(d, halfWidthAngle);
}

// 0 at/below (topZ - fadeSpanMM), ramping linearly to 1 at topZ.
export function heightFade(z, topZ, fadeSpanMM = 18) {
  const zLo = topZ - fadeSpanMM;
  if (z <= zLo) return 0.0;
  if (z >= topZ) return 1.0;
  return (z - zLo) / (topZ - zLo);
}

// Combined radius offset (mm) at a given (theta, z) from every notch in
// `notchCenters` (array of theta values in radians — [] for none, [0] for
// one, [0, Math.PI] for two 180deg apart).
export function notchOffsetAt(theta, z, notchCenters, refRadiusMM, topZ, opts = {}) {
  if (!notchCenters || notchCenters.length === 0) return 0;
  const { halfWidthMM = 10, recessMM = 6, fadeSpanMM = 18 } = opts;
  const fade = heightFade(z, topZ, fadeSpanMM);
  if (fade === 0) return 0;
  let offset = 0;
  for (const c of notchCenters) offset += notchAngularProfile(theta, c, refRadiusMM, halfWidthMM, recessMM);
  return fade * offset;
}

// z-levels for a ring stack spanning [z0, z1] with extra resolution
// packed into the top `fadeSpanMM` (where the notch's cosine fade needs
// enough rings to render smoothly) and coarser rings below (harmless —
// the radius is linear there, so extra rings don't change the shape,
// only the triangle count).
export function notchZLevels(z0, z1, fadeSpanMM = 18, nFadeRings = 6, nBodyRings = 4) {
  const zs = new Set([z0, z1]);
  const fadeStart = Math.max(z0, z1 - fadeSpanMM);
  if (fadeStart > z0) {
    for (let i = 0; i <= nBodyRings; i++) zs.add(z0 + (fadeStart - z0) * (i / nBodyRings));
  }
  for (let i = 0; i <= nFadeRings; i++) zs.add(fadeStart + (z1 - fadeStart) * (i / nFadeRings));
  return Array.from(zs).sort((a, b) => a - b);
}

// Evenly spaced z-levels across a hole/slot's vertical band — used to give
// a tapering hole enough rings to render its stepped profile smoothly.
export function slotZLevels(zLo, zHi, nRings = 6) {
  const zs = [];
  for (let i = 0; i <= nRings; i++) zs.push(zLo + (zHi - zLo) * (i / nRings));
  return zs;
}

// Merges any number of z-level arrays into one sorted, de-duplicated list
// (dedup within 1e-6mm) — used to combine e.g. the notch's fade rings and
// an air-slot band's rings into a single shared ring stack.
export function mergeZLevels(...arrays) {
  const all = [].concat(...arrays);
  all.sort((a, b) => a - b);
  const out = [];
  for (const z of all) {
    if (out.length === 0 || Math.abs(z - out[out.length - 1]) > 1e-6) out.push(z);
  }
  return out;
}

// A stack of rings, one per z-level, with radius given by radiusFn(z, theta).
export function ringStack(radiusFn, zLevels, n) {
  return zLevels.map((z) => {
    const ring = [];
    for (let k = 0; k < n; k++) {
      const theta = (TWO_PI * k) / n;
      const r = radiusFn(z, theta);
      ring.push([r * Math.cos(theta), r * Math.sin(theta), z]);
    }
    return ring;
  });
}

export function ringStackFaces(rings, outward = true) {
  const faces = [];
  for (let i = 0; i < rings.length - 1; i++) {
    faces.push(...quadStrip(rings[i], rings[i + 1], outward));
  }
  return faces;
}

// Same flat-washer-cap convention as annulusCap, but built directly from
// two pre-computed ring arrays (e.g. the top rings of a notched ring
// stack) instead of fresh plain circles — so the cap shares the exact
// same vertices as the wall it's capping, including any notch offset,
// with no seam.
export function annulusCapFromRings(outerRing, innerRing, facingUp = true) {
  return quadStrip(innerRing, outerRing, !facingUp);
}

// ---------------------------------------------------------------------
// Wall grid with holes — a stack of rings where some columns are "open"
// (part of a through-hole footprint) at some ring heights. Used for both
// the lift notch (no holes, just a displaced radius — see notchOffset in
// potBuilder.js) and air slots (genuine holes, built as omitted faces in
// this grid). Two grids sharing the same z-levels/n/open-columns — one at
// the outer radius, one at the inner radius — can be stitched together
// with stitchWallGridHoles() below to seal the hole through the wall
// thickness, without needing bespoke per-hole-shape tunnel geometry.
// ---------------------------------------------------------------------

export function wallGrid(radiusFn, zLevels, n, openColumnsFn = null) {
  const rings = [];
  const openSets = [];
  for (const z of zLevels) {
    const ring = [];
    for (let k = 0; k < n; k++) {
      const theta = (TWO_PI * k) / n;
      // radiusFn(z, theta) — same 2-arg convention as ringStack(). (Previously
      // called as radiusFn(z, k, theta): outerRadiusFn/innerRadiusFn in
      // potBuilder.js only declare (z, theta), so JS silently bound their
      // `theta` parameter to the integer column index `k` instead of the
      // real angle. Since notchOffsetAt wraps theta mod 2*PI, the notch's
      // cosine bump replayed every ~6.28 columns — a repeating zigzag of
      // small dips around the whole rim instead of one smooth arc at the
      // real notch center. This is the root cause of the "triangular
      // notches all around the rim" bug.)
      const r = radiusFn(z, theta);
      ring.push([r * Math.cos(theta), r * Math.sin(theta), z]);
    }
    rings.push(ring);
    openSets.push(openColumnsFn ? openColumnsFn(z) : new Set());
  }
  return { rings, openSets, zLevels, n };
}

// outward: true for an outer-facing wall surface, false for inner-facing
// (same convention as quadStrip). A quad starting at column k (columns k,
// k+1) is omitted if k is "open" (part of a hole) at BOTH the ring below
// and the ring above — i.e. only where the hole is fully open along that
// whole vertical step, leaving the taper/step edges of a shrinking hole
// as real faces (which is what makes a tapering hole self-supporting: the
// "roof" is built from many small stepped faces, not one big bridge).
export function wallGridFaces(grid, outward = true) {
  const { rings, openSets, n } = grid;
  const faces = [];
  for (let r = 0; r < rings.length - 1; r++) {
    const open0 = openSets[r];
    const open1 = openSets[r + 1];
    for (let k = 0; k < n; k++) {
      if (open0.has(k) && open1.has(k)) continue;
      const j = (k + 1) % n;
      const a0 = rings[r][k], a1 = rings[r][j];
      const b0 = rings[r + 1][k], b1 = rings[r + 1][j];
      if (outward) {
        faces.push([a0, a1, b1], [a0, b1, b0]);
      } else {
        faces.push([a0, b1, a1], [a0, b0, b1]);
      }
    }
  }
  return faces;
}

// Finds every open boundary loop in a set of quad faces built by
// wallGridFaces, expressed as (ring, k) grid coordinates rather than raw
// vertex indices — walked in vertex order (not edge-by-edge independently)
// so concave/stepped hole outlines are traced correctly. Multiple
// simultaneous holes stay distinct loops as long as their footprints
// never share a grid column at any ring (enforced by the caller before
// building the grid — see side-slot layout in potBuilder.js) — that
// shared-vertex case is exactly the "bowtie" failure mode: two different
// loops both trying to claim the same vertex as their own "next" hop,
// silently clobbering each other in the adjacency map.
// excludeEdgeRings: drop any loop that touches the grid's own first or
// last ring — those are the ring-stack's own open top/bottom boundary
// (e.g. the rim, or wherever this grid piece was deliberately left open
// to be capped/joined elsewhere), not a genuine hole. Genuine holes (air
// slots, drain holes) are built well inside a grid's z-span, so they
// never touch ring 0 or the last ring and are unaffected by this filter.
export function findGridHoleLoops(grid, opts = {}) {
  const { excludeEdgeRings = true } = opts;
  const { rings, openSets, n } = grid;
  const key = (r, k) => r * n + k;
  const edgeCount = new Map();
  const boundaryNext = new Map();
  const boundaryOwner = new Map();

  function addEdge(r0, k0, r1, k1) {
    const a = key(r0, k0), b = key(r1, k1);
    const ek = a < b ? `${a}_${b}` : `${b}_${a}`;
    edgeCount.set(ek, (edgeCount.get(ek) || 0) + 1);
    return ek;
  }

  // Re-walk the same face generation as wallGridFaces, but only to
  // collect edges (grid-coordinate based) rather than triangles.
  const quadEdges = []; // each: [[r0,k0],[r0,k1],[r1,k1],[r1,k0]] for a kept quad
  for (let r = 0; r < rings.length - 1; r++) {
    const open0 = openSets[r], open1 = openSets[r + 1];
    for (let k = 0; k < n; k++) {
      if (open0.has(k) && open1.has(k)) continue;
      const j = (k + 1) % n;
      quadEdges.push([[r, k], [r, j], [r + 1, j], [r + 1, k]]);
    }
  }
  for (const quad of quadEdges) {
    for (let i = 0; i < 4; i++) {
      const [r0, k0] = quad[i];
      const [r1, k1] = quad[(i + 1) % 4];
      addEdge(r0, k0, r1, k1);
    }
  }
  for (const quad of quadEdges) {
    for (let i = 0; i < 4; i++) {
      const [r0, k0] = quad[i];
      const [r1, k1] = quad[(i + 1) % 4];
      const a = key(r0, k0), b = key(r1, k1);
      const ek = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (edgeCount.get(ek) === 1) {
        if (boundaryNext.has(a)) {
          throw new Error(
            `findGridHoleLoops: vertex (ring ${r0}, col ${k0}) is on two different boundary loops ` +
            `at once — two holes are touching (bowtie). Increase spacing between them before calling this.`
          );
        }
        boundaryNext.set(a, b);
        boundaryOwner.set(a, [r0, k0]);
        boundaryOwner.set(b, [r1, k1]);
      }
    }
  }

  const visited = new Set();
  const loops = [];
  for (const start of boundaryNext.keys()) {
    if (visited.has(start)) continue;
    const loop = [];
    let cur = start;
    let guard = 0;
    while (!visited.has(cur) && guard < n * rings.length + 10) {
      visited.add(cur);
      loop.push(boundaryOwner.get(cur));
      cur = boundaryNext.get(cur);
      guard++;
      if (cur === undefined) break;
    }
    if (loop.length > 2) loops.push(loop);
  }
  const nRings = rings.length;
  return excludeEdgeRings
    ? loops.filter((loop) => !loop.some(([r]) => r === 0 || r === nRings - 1))
    : loops; // array of loops; each loop is an array of [ring, k] pairs
}

// Seals every hole boundary loop found on the outer grid by connecting it
// to the SAME (ring, k) vertices on the inner grid (which must share the
// exact same z-levels/n/open-columns, so the loops line up 1:1 — no
// nearest-vertex search needed, which is what makes this robust to
// touching-but-not-identical geometry). This is the general-purpose
// version of hole_tunnel_walls — works for any hole shape (round,
// rectangular, tapering), not just circles.
export function stitchWallGridHoles(outerGrid, innerGrid, opts = {}) {
  const loops = findGridHoleLoops(outerGrid, opts);
  const faces = [];
  for (const loop of loops) {
    const m = loop.length;
    for (let i = 0; i < m; i++) {
      const [r0, k0] = loop[i];
      const [r1, k1] = loop[(i + 1) % m];
      const oa = outerGrid.rings[r0][k0];
      const ob = outerGrid.rings[r1][k1];
      const ia = innerGrid.rings[r0][k0];
      const ib = innerGrid.rings[r1][k1];
      // normal should point into the void (inward through the tunnel) —
      // match the existing holeTunnelWalls convention (outward=false style)
      faces.push([oa, ib, ia]);
      faces.push([oa, ob, ib]);
    }
  }
  return faces;
}

// ---------------------------------------------------------------------
// Manifold sanity check — Euler characteristic (V - E + F === 2 for a
// closed genus-0 solid) plus an edge-multiplicity check (every edge must
// be shared by EXACTLY 2 faces; 1 means an open hole, 3+ means a bowtie/
// non-manifold seam). Run this on every generated configuration so this
// whole class of topology bug gets caught automatically.
// ---------------------------------------------------------------------

export function manifoldCheck(triangles, eps = 1e-6) {
  const vertKey = (p) => `${Math.round(p[0] / eps)}_${Math.round(p[1] / eps)}_${Math.round(p[2] / eps)}`;
  const vertIndex = new Map();
  const verts = [];
  function idxOf(p) {
    const k = vertKey(p);
    let i = vertIndex.get(k);
    if (i === undefined) {
      i = verts.length;
      vertIndex.set(k, i);
      verts.push(p);
    }
    return i;
  }

  const edgeCount = new Map();
  const faceIdx = [];
  for (const [p0, p1, p2] of triangles) {
    const a = idxOf(p0), b = idxOf(p1), c = idxOf(p2);
    faceIdx.push([a, b, c]);
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const ek = x < y ? `${x}_${y}` : `${y}_${x}`;
      edgeCount.set(ek, (edgeCount.get(ek) || 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonmanifoldEdges = 0;
  for (const count of edgeCount.values()) {
    if (count === 1) boundaryEdges++;
    else if (count !== 2) nonmanifoldEdges++;
  }

  const V = verts.length;
  const E = edgeCount.size;
  const F = faceIdx.length;
  const euler = V - E + F;

  return {
    nVerts: V,
    nEdges: E,
    nFaces: F,
    euler,
    boundaryEdges,
    nonmanifoldEdges,
    watertight: boundaryEdges === 0 && nonmanifoldEdges === 0,
    isGenus0Closed: euler === 2 && boundaryEdges === 0 && nonmanifoldEdges === 0,
  };
}

// ---------------------------------------------------------------------
// Base grooves — radial drainage/venting channels recessed into the
// underside of the floor. Radial (r) shape ported verbatim from the
// tested reference docs/features-wip/pot-floor.mjs (mm-converted; the
// reference uses meters) — do not re-derive this: a first attempt warped
// a flat ear-clip-triangulated cap's z by an (r,theta) height field, but
// ear-clipping only places vertices on the outer boundary and hole loops,
// nothing in the interior, so there was no real grid for the ramp to sit
// on — the interior got filled by arbitrary long fan triangles, which is
// what produced the spiky/chaotic pattern instead of clean channels.
// pot-floor.mjs fixes this by giving the floor its own proper radial x
// angular GRID (same idea as the wall's ring loft in ringStack above) —
// see radialGrid() below, which reuses that exact same grid shape so it
// can plug into the already-proven wallGridFaces/findGridHoleLoops/
// stitchWallGridHoles hole-cutting pipeline for the drain holes.
//
// Tangential (theta) shape ported verbatim from docs/features-wip/
// pot-floor-angular.mjs — a physical print of the original smooth cosine
// taper came out paper-thin and failed right around the drain holes,
// where the curve was steepest: offsetting a surface along its normal to
// hold wall thickness constant is only exact on FLAT facets, so on a
// smooth curve the true printed thickness drifts from the intended
// value. pot-floor-angular.mjs fixes this by making the tangential
// profile FACETED (a flat groove floor + a short linear transition + a
// flat ridge), never a curve — see grooveAngularProfile() below, do not
// re-derive this back into a cosine.
// ---------------------------------------------------------------------

// 0 at r <= hubRadius (flush with the hub/bed), a LINEAR ramp to 1 over
// the next `rampMM` of radius (rise==run over rampMM, exactly 45 degrees
// by construction — matches pot-floor.mjs's/pot-floor-angular.mjs's
// radialTaper() exactly), then 1.0 the rest of the way to the pot's edge.
export function grooveRadialTaper(r, hubRadius, rampMM = 1.2) {
  if (r <= hubRadius) return 0.0;
  if (r >= hubRadius + rampMM) return 1.0;
  return (r - hubRadius) / rampMM;
}

// 1.0 within +/-flatHalfAngle of a groove center (flat channel floor),
// linearly down to 0.0 over the next `transitionAngle` (the only place
// the surface isn't flat — a short straight ramp, not a curve), 0.0
// beyond that (flat ridge). Matches pot-floor-angular.mjs's
// angularProfile() exactly.
export function grooveAngularProfile(d, flatHalfAngle, transitionAngle) {
  const ad = Math.abs(d);
  if (ad <= flatHalfAngle) return 1.0;
  const fullHalfAngle = flatHalfAngle + transitionAngle;
  if (ad >= fullHalfAngle) return 0.0;
  return 1.0 - (ad - flatHalfAngle) / transitionAngle;
}

// Combined channel height (mm, positive = lifted off the bed) at (r,
// theta) from every groove in `grooveCenters` (array of theta values in
// radians, one per drain hole). Matches pot-floor-angular.mjs's
// grooveBottomZ() exactly: multiple grooves combine via MAX (not sum),
// so overlapping tapers can never double up past the intended depth.
export function grooveOffsetAt(r, theta, grooveCenters, hubRadius, opts = {}) {
  if (!grooveCenters || grooveCenters.length === 0) return 0;
  const { gapMM = 1.2, rampMM = 1.2, flatHalfAngle = 0.2, transitionAngle = 0.05 } = opts;
  const radial = grooveRadialTaper(r, hubRadius, rampMM);
  if (radial <= 0) return 0;
  let best = 0;
  for (const c of grooveCenters) {
    let d = theta - c;
    d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-pi, pi]
    const t = grooveAngularProfile(d, flatHalfAngle, transitionAngle);
    if (t > best) best = t;
  }
  return gapMM * radial * best;
}

// A stack of rings swept over RADIUS instead of z (mirrors wallGrid
// exactly, just with the loop variable feeding (x,y) instead of z, and
// zFn(r,theta) giving the height instead of radiusFn(z,theta) giving the
// radius) — used for the grooved floor. Structurally identical to
// wallGrid's { rings, openSets, n } shape, so wallGridFaces,
// findGridHoleLoops, and stitchWallGridHoles all work on it unchanged.
export function radialGrid(zFn, rLevels, n, openColumnsFn = null) {
  const rings = [];
  const openSets = [];
  for (const r of rLevels) {
    const ring = [];
    for (let k = 0; k < n; k++) {
      const theta = (TWO_PI * k) / n;
      const z = zFn(r, theta);
      ring.push([r * Math.cos(theta), r * Math.sin(theta), z]);
    }
    rings.push(ring);
    openSets.push(openColumnsFn ? openColumnsFn(r) : new Set());
  }
  return { rings, openSets, n };
}

export function signedVolume(triangles) {
  let v = 0;
  for (const [p0, p1, p2] of triangles) {
    const cx = p1[1] * p2[2] - p1[2] * p2[1];
    const cy = p1[2] * p2[0] - p1[0] * p2[2];
    const cz = p1[0] * p2[1] - p1[1] * p2[0];
    v += p0[0] * cx + p0[1] * cy + p0[2] * cz;
  }
  return v / 6.0;
}
