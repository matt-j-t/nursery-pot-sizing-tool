// Replacement for pot-floor.mjs's smooth cosine groove shape — FACETED
// (angular) by construction instead. The wall-thickness technique
// (offsetting a surface along its normal) is only exact on FLAT facets; on
// a smooth curve the true printed thickness drifts from the intended
// value. That's why a physical print of the cosine version came out
// paper-thin and failed right around the drain holes, where the curve was
// steepest. This version fixes both the look and the thickness problem
// together by making the tangential groove profile a flat floor + a short
// linear transition + a flat ridge, never a curve.
//
// Saved verbatim as supplied — ported into geometry.js/calculator.js
// without re-deriving the math. See geometry.js's grooveAngularProfile /
// grooveOffsetAt and calculator.js's ridge-width + hole-clearance checks
// for where this was wired in.

export function buildFloorAngular({ hubR, edgeR, wallT, grooveCount = 8, minRidgeWidth = 0.004 }) {
  const gap = 0.0012;
  const rampRun = gap;
  const anglePerGroove = (2*Math.PI) / grooveCount;
  const grooveFlatHalfAngle = 0.20;
  const transitionAngle = 0.05;
  const grooveFullHalfAngle = grooveFlatHalfAngle + transitionAngle;
  const ridgeAngle = anglePerGroove - 2*grooveFullHalfAngle;
  const ridgeWidthAtHub = ridgeAngle * (hubR + rampRun);
  const ridgeWidthAtEdge = ridgeAngle * edgeR;
  if (ridgeAngle <= 0 || ridgeWidthAtHub < minRidgeWidth) {
    throw new Error(`Ridge too thin (${(ridgeWidthAtHub*1000).toFixed(2)}mm) -- reduce grooveCount or grooveFullHalfAngle`);
  }
  function angularProfile(d) {
    const ad = Math.abs(d);
    if (ad <= grooveFlatHalfAngle) return 1.0;
    if (ad >= grooveFullHalfAngle) return 0.0;
    return 1.0 - (ad - grooveFlatHalfAngle) / transitionAngle;
  }
  function radialTaper(r) {
    if (r <= hubR) return 0.0;
    if (r >= hubR + rampRun) return 1.0;
    return (r - hubR) / rampRun;
  }
  function grooveBottomZ(r, theta) {
    const radial = radialTaper(r);
    if (radial <= 0) return 0.0;
    let best = 0;
    for (let i = 0; i < grooveCount; i++) {
      const center = i * anglePerGroove;
      let d = theta - center; d = Math.atan2(Math.sin(d), Math.cos(d));
      const t = angularProfile(d);
      if (t > best) best = t;
    }
    return gap * radial * best;
  }
  const rRings = [hubR, hubR + rampRun, edgeR];
  const nTheta = 288;
  const verts = [];
  for (const r of rRings) {
    const ring = [];
    for (let k = 0; k < nTheta; k++) {
      const theta = (2*Math.PI*k)/nTheta;
      ring.push([r*Math.cos(theta), r*Math.sin(theta), grooveBottomZ(r, theta)]);
    }
    verts.push(ring);
  }
  const nRings = rRings.length;
  const flat = []; const idxOf = {}; let counter = 0;
  for (let r = 0; r < nRings; r++) for (let k = 0; k < nTheta; k++) { flat.push(verts[r][k]); idxOf[`${r}_${k}`] = counter++; }
  const hubIdx = counter; flat.push([0,0,0]); counter++;
  const faces = [];
  for (let k = 0; k < nTheta; k++) faces.push([hubIdx, idxOf[`0_${k}`], idxOf[`0_${(k+1)%nTheta}`]]);
  for (let r = 0; r < nRings-1; r++) for (let k = 0; k < nTheta; k++)
    faces.push([idxOf[`${r}_${k}`], idxOf[`${r}_${(k+1)%nTheta}`], idxOf[`${r+1}_${(k+1)%nTheta}`], idxOf[`${r+1}_${k}`]]);
  return { verts: flat, faces, outerRingIdx: (k) => idxOf[`${nRings-1}_${k}`], nTheta, ridgeWidthAtHub, ridgeWidthAtEdge };
}
