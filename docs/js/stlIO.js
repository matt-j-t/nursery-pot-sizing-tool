// Minimal binary STL reader/writer — no external mesh libraries.
// Triangles: array of [p0,p1,p2] where each p is [x,y,z].

function computeNormal(p0, p1, p2) {
  const v0 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v1 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const n = [
    v0[1] * v1[2] - v0[2] * v1[1],
    v0[2] * v1[0] - v0[0] * v1[2],
    v0[0] * v1[1] - v0[1] * v1[0],
  ];
  const len = Math.hypot(...n) || 1.0;
  return [n[0] / len, n[1] / len, n[2] / len];
}

export function writeBinarySTL(triangles, headerText = "nursery pot generator") {
  const nTri = triangles.length;
  const buf = new ArrayBuffer(80 + 4 + nTri * 50);
  const dv = new DataView(buf);
  const enc = new TextEncoder();
  const headerBytes = enc.encode(headerText.slice(0, 80));
  new Uint8Array(buf, 0, headerBytes.length).set(headerBytes);
  dv.setUint32(80, nTri, true);

  let offset = 84;
  for (const [p0, p1, p2] of triangles) {
    const n = computeNormal(p0, p1, p2);
    dv.setFloat32(offset, n[0], true); offset += 4;
    dv.setFloat32(offset, n[1], true); offset += 4;
    dv.setFloat32(offset, n[2], true); offset += 4;
    for (const p of [p0, p1, p2]) {
      dv.setFloat32(offset, p[0], true); offset += 4;
      dv.setFloat32(offset, p[1], true); offset += 4;
      dv.setFloat32(offset, p[2], true); offset += 4;
    }
    dv.setUint16(offset, 0, true); offset += 2;
  }
  return buf;
}

export function readBinarySTL(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const nTri = dv.getUint32(80, true);
  const triangles = [];
  let offset = 84;
  for (let i = 0; i < nTri; i++) {
    offset += 12; // skip normal
    const pts = [];
    for (let v = 0; v < 3; v++) {
      const x = dv.getFloat32(offset, true); offset += 4;
      const y = dv.getFloat32(offset, true); offset += 4;
      const z = dv.getFloat32(offset, true); offset += 4;
      pts.push([x, y, z]);
    }
    offset += 2; // attribute byte count
    triangles.push(pts);
  }
  return triangles;
}

export function readAsciiSTL(text) {
  const triangles = [];
  let tri = [];
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("vertex")) {
      const parts = line.split(/\s+/);
      tri.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
      if (tri.length === 3) {
        triangles.push(tri);
        tri = [];
      }
    }
  }
  return triangles;
}

export function readSTL(arrayBuffer) {
  const head = new TextDecoder().decode(arrayBuffer.slice(0, 5));
  if (head === "solid") {
    // Could still be binary (some exporters mislabel); try ASCII first,
    // fall back to binary if it doesn't look right.
    try {
      const text = new TextDecoder().decode(arrayBuffer);
      const tris = readAsciiSTL(text);
      if (tris.length > 0) return tris;
    } catch (e) {
      /* fall through */
    }
  }
  return readBinarySTL(arrayBuffer);
}

export function meshStats(triangles) {
  let bboxMin = [Infinity, Infinity, Infinity];
  let bboxMax = [-Infinity, -Infinity, -Infinity];
  const edgeCount = new Map();
  const keyOf = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)},${p[2].toFixed(4)}`;

  for (const tri of triangles) {
    for (const p of tri) {
      for (let k = 0; k < 3; k++) {
        if (p[k] < bboxMin[k]) bboxMin[k] = p[k];
        if (p[k] > bboxMax[k]) bboxMax[k] = p[k];
      }
    }
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const ka = keyOf(tri[a]);
      const kb = keyOf(tri[b]);
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }
  let boundaryEdges = 0, nonmanifoldEdges = 0;
  for (const v of edgeCount.values()) {
    if (v === 1) boundaryEdges++;
    if (v > 2) nonmanifoldEdges++;
  }
  return {
    nTriangles: triangles.length,
    bboxMin,
    bboxMax,
    size: bboxMax.map((v, i) => v - bboxMin[i]),
    boundaryEdges,
    nonmanifoldEdges,
  };
}
