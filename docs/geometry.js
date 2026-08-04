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
