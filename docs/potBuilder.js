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

  // 1) Outer wall, full height (continuous taper, covers floor skin + cavity wall)
  const ringBottomOuter = geo.ring3(RBottomOuter, 0.0, n);
  const ringTopOuter = geo.ring3(RTopOuter, H, n);
  pieces.push(...geo.quadStrip(ringBottomOuter, ringTopOuter, true));

  // 2) Inner wall, floorT..H
  const ringBottomInner = geo.ring3(RInnerFloorTop, floorT, n);
  const ringTopInner = geo.ring3(RTopInner, H, n);
  pieces.push(...geo.quadStrip(ringBottomInner, ringTopInner, false));

  // 3) Top rim cap
  pieces.push(...geo.annulusCap(RTopOuter, RTopInner, H, n, true));

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
