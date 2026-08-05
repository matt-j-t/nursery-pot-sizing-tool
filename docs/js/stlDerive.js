// Derive a decorative pot's INNER cavity profile from an uploaded STL.
// Direct port of stl_derive.py — see that file for the full rationale.
// Best-effort heuristic: slices the mesh with horizontal planes and reads
// the min/max radius of intersection points at each height.

function edgesFromTriangles(triangles) {
  const edges = [];
  for (const [p0, p1, p2] of triangles) {
    edges.push([p0, p1]);
    edges.push([p1, p2]);
    edges.push([p2, p0]);
  }
  return edges;
}

function planeIntersectionPoints(edges, z, eps = 1e-9) {
  const pts = [];
  for (const [p1, p2] of edges) {
    const z1 = p1[2], z2 = p2[2];
    const crosses = (z1 - z) * (z2 - z) < 0;
    const denom = z2 - z1;
    if (!crosses || Math.abs(denom) <= eps) continue;
    const t = (z - z1) / denom;
    pts.push([
      p1[0] + t * (p2[0] - p1[0]),
      p1[1] + t * (p2[1] - p1[1]),
      z,
    ]);
  }
  return pts;
}

export function analyzeDecorativePot(triangles, { topOffset = 3.0, nScan = 80, spreadThreshold = 1.5, axisXY = null } = {}) {
  const ptsAll = triangles.flat();
  const bboxMin = [Infinity, Infinity, Infinity];
  const bboxMax = [-Infinity, -Infinity, -Infinity];
  for (const p of ptsAll) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < bboxMin[k]) bboxMin[k] = p[k];
      if (p[k] > bboxMax[k]) bboxMax[k] = p[k];
    }
  }
  const [zMin, zMax] = [bboxMin[2], bboxMax[2]];
  const [cx, cy] = axisXY || [(bboxMin[0] + bboxMax[0]) / 2, (bboxMin[1] + bboxMax[1]) / 2];

  const edges = edgesFromTriangles(triangles);
  const radiiAt = (z) => {
    const p = planeIntersectionPoints(edges, z);
    return p.map(([x, y]) => Math.hypot(x - cx, y - cy));
  };

  const heightTotal = zMax - zMin;
  const warnings = [];
  if (heightTotal <= 0) throw new Error("Mesh has zero height — check the file.");

  // 1) Top opening (inner rim)
  const topSliceZ = zMax - Math.min(topOffset, heightTotal * 0.05);
  const rTop = radiiAt(topSliceZ);
  let innerTopR, outerTopR;
  if (rTop.length < 6) {
    warnings.push("Very few intersection points near the rim — top diameter may be unreliable.");
    innerTopR = rTop.length ? Math.max(...rTop) : 0.0;
  } else {
    innerTopR = Math.min(...rTop);
  }
  outerTopR = rTop.length ? Math.max(...rTop) : 0.0;

  // 2) Scan downward to find where the hollow cavity collapses into the
  // pot's own solid floor (spread between min/max intersection radius
  // collapses toward ~0 once only the outer surface remains).
  const nSteps = nScan;
  const zStart = topSliceZ;
  const zEnd = zMin + heightTotal * 0.02;
  const scanZs = [];
  for (let i = 0; i < nSteps; i++) {
    scanZs.push(zStart + ((zEnd - zStart) * i) / (nSteps - 1));
  }

  let floorZ = null;
  let consecutiveCollapsed = 0;
  let collapseStartZ = null;
  const innerRProfile = [];
  for (const z of scanZs) {
    const r = radiiAt(z);
    if (r.length < 6) {
      innerRProfile.push([z, null, null]);
      continue;
    }
    const rmin = Math.min(...r);
    const rmax = Math.max(...r);
    const spread = rmax - rmin;
    innerRProfile.push([z, rmin, spread]);
    if (spread < spreadThreshold) {
      if (consecutiveCollapsed === 0) collapseStartZ = z;
      consecutiveCollapsed++;
      if (consecutiveCollapsed >= 2 && floorZ === null) floorZ = collapseStartZ;
    } else if (floorZ === null) {
      consecutiveCollapsed = 0;
      collapseStartZ = null;
    }
  }

  if (floorZ === null) {
    warnings.push(
      "Could not clearly detect the decorative pot's internal floor — falling back to the lowest " +
        "scanned slice. Depth/bottom-diameter numbers need a sanity check."
    );
    floorZ = zMin + heightTotal * 0.05;
  }

  // 3) Bottom-of-cavity inner diameter — just above the detected floor
  const bottomSliceZ = Math.min(floorZ + heightTotal * 0.03, topSliceZ - heightTotal * 0.02);
  const rBottom = radiiAt(bottomSliceZ);
  let innerBottomR;
  if (rBottom.length < 6) {
    warnings.push("Few intersection points just above the floor — bottom diameter may be unreliable.");
    innerBottomR = innerTopR * 0.7;
  } else {
    innerBottomR = Math.min(...rBottom);
  }

  const innerDepth = zMax - floorZ;

  return {
    containerTopInnerDiam: 2 * innerTopR,
    containerBottomInnerDiam: 2 * innerBottomR,
    containerInnerDepth: innerDepth,
    containerOuterTopDiam: 2 * outerTopR,
    axisXY: [cx, cy],
    zMin, zMax, floorZ, topSliceZ, bottomSliceZ,
    innerRProfile,
    warnings,
  };
}

export function formatAnalysisReport(result) {
  const lines = [];
  lines.push(`Detected inner top diameter:    ${result.containerTopInnerDiam.toFixed(1)} mm`);
  lines.push(`Detected inner bottom diameter: ${result.containerBottomInnerDiam.toFixed(1)} mm`);
  lines.push(`Detected inner depth:           ${result.containerInnerDepth.toFixed(1)} mm`);
  lines.push(`(outer top diameter for reference: ${result.containerOuterTopDiam.toFixed(1)} mm)`);
  return lines.join("\n");
}
