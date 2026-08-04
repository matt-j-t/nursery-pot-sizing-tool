// Sizing logic for round, tapered 3D-printed nursery pots.
// Direct port of calculator.py — see that file for the fuller design-rule
// commentary. Printer/material assumptions: Bambu Lab P2S, 0.4mm nozzle, PETG.

export const DEFAULTS = {
  wallT: 1.6,
  floorT: 1.6,
  draftDeg: 5.0,
  clearanceTotal: 3.0,
  drainHoleCount: 8,
  drainHoleDiam: 6.0,
  feetCount: 4,
  feetHeight: 2.5,
  feetDiam: 8.0,
  nSeg: 96,
};

const NOZZLE = 0.4;
const MIN_PRINTABLE_WALL = 3 * NOZZLE;
const MIN_PRINTABLE_FLOOR = 3 * NOZZLE;
const MAX_SENSIBLE_DRAFT_DEG = 30.0;
const MIN_INNER_FLOOR_DIAM = 15.0;

const deg2rad = (d) => (d * Math.PI) / 180.0;

export function resolvePot({
  outerTopDiam,
  height,
  containerBottomInnerDiam = null,
  draftDeg = DEFAULTS.draftDeg,
  wallT = DEFAULTS.wallT,
  floorT = DEFAULTS.floorT,
  clearanceTotal = DEFAULTS.clearanceTotal,
  drainHoleCount = DEFAULTS.drainHoleCount,
  drainHoleDiam = DEFAULTS.drainHoleDiam,
  feetCount = DEFAULTS.feetCount,
  feetHeight = DEFAULTS.feetHeight,
  feetDiam = DEFAULTS.feetDiam,
  nSeg = DEFAULTS.nSeg,
}) {
  const warnings = [];
  const notes = [];

  let RTopOuter = outerTopDiam / 2.0;
  let draftUsedDeg = draftDeg;

  if (containerBottomInnerDiam !== null && containerBottomInnerDiam !== undefined) {
    const allowedBottomOuterDiam = containerBottomInnerDiam - clearanceTotal;
    const RBottomOuterAtDefault = RTopOuter - height * Math.tan(deg2rad(draftDeg));
    const bottomOuterDiamAtDefault = 2 * RBottomOuterAtDefault;
    if (bottomOuterDiamAtDefault > allowedBottomOuterDiam) {
      const deltaR = RTopOuter - allowedBottomOuterDiam / 2.0;
      let requiredDeg = draftDeg;
      if (deltaR > 0 && height > 0) {
        requiredDeg = (Math.atan(deltaR / height) * 180) / Math.PI;
      }
      if (requiredDeg > draftDeg) {
        draftUsedDeg = requiredDeg;
        notes.push(
          `Draft angle increased from ${draftDeg.toFixed(1)} deg to ${draftUsedDeg.toFixed(1)} deg ` +
            `so the pot clears the container's narrower bottom opening ` +
            `(${containerBottomInnerDiam.toFixed(1)}mm inner diameter).`
        );
      }
    }
    if (draftUsedDeg > MAX_SENSIBLE_DRAFT_DEG) {
      warnings.push(
        `Required draft angle (${draftUsedDeg.toFixed(1)} deg) is unusually steep — the container ` +
          `tapers a lot more than the pot's top-diameter fit allows. Consider reducing the nursery ` +
          `pot's target top diameter.`
      );
    }
  }

  let RBottomOuter = RTopOuter - height * Math.tan(deg2rad(draftUsedDeg));
  if (RBottomOuter <= 0) {
    warnings.push(
      "Computed bottom outer radius is zero or negative — draft angle/height combination is not " +
        "physically valid. Reduce height or draft angle, or increase top diameter."
    );
    RBottomOuter = Math.max(RBottomOuter, 1.0);
  }
  const outerBottomDiam = 2 * RBottomOuter;

  const wallTHorizontal = wallT / Math.cos(deg2rad(draftUsedDeg));
  const RTopInner = RTopOuter - wallTHorizontal;
  const ROuterAtFloorTop = RBottomOuter + floorT * Math.tan(deg2rad(draftUsedDeg));
  const RBottomInnerAtFloor = ROuterAtFloorTop - wallTHorizontal;

  const innerTopDiam = 2 * RTopInner;
  const innerBottomDiam = 2 * RBottomInnerAtFloor;
  const usableDepth = height - floorT;

  if (wallT < MIN_PRINTABLE_WALL) {
    warnings.push(`Wall thickness ${wallT}mm is thinner than ${MIN_PRINTABLE_WALL}mm — too thin to print reliably.`);
  }
  if (floorT < MIN_PRINTABLE_FLOOR) {
    warnings.push(`Floor thickness ${floorT}mm is thinner than ${MIN_PRINTABLE_FLOOR}mm — too thin to print reliably.`);
  }
  if (innerBottomDiam < MIN_INNER_FLOOR_DIAM) {
    warnings.push(
      `Inner floor diameter is only ${innerBottomDiam.toFixed(1)}mm — very little room for soil/drainage. ` +
        `Consider a larger top diameter or shallower draft angle.`
    );
  }
  if (usableDepth <= 5) {
    warnings.push(`Usable soil depth is only ${usableDepth.toFixed(1)}mm after floor thickness — check height input.`);
  }

  // --- drainage holes ---
  let holeR = drainHoleDiam / 2.0;
  const margin = 2.0;
  let maxBoltR = RBottomInnerAtFloor - holeR - margin;
  let nHoles = drainHoleCount;
  let dHole = drainHoleDiam;
  if (maxBoltR <= holeR) {
    dHole = Math.max(3.0, 2 * Math.max(maxBoltR - 1.0, 1.5));
    holeR = dHole / 2.0;
    maxBoltR = RBottomInnerAtFloor - holeR - margin;
    nHoles = Math.max(4, Math.min(nHoles, 6));
    warnings.push(
      `Floor is small — drain hole diameter reduced to ${dHole.toFixed(1)}mm to fit ${nHoles} holes ` +
        `with clearance from the inner wall.`
    );
  }
  let boltRHoles =
    maxBoltR > holeR ? Math.max(maxBoltR * 0.75, holeR + margin) : Math.max(RBottomInnerAtFloor * 0.4, holeR + 0.5);
  boltRHoles = maxBoltR > 0 ? Math.min(boltRHoles, maxBoltR) : holeR;
  if (boltRHoles <= 0 || RBottomInnerAtFloor < holeR + margin) {
    warnings.push("Inner floor is too small to fit any drainage holes with safe clearance — design needs a larger pot or thinner walls.");
    nHoles = 0;
  }

  // --- feet ---
  let footR = feetDiam / 2.0;
  let boltRFeet = RBottomOuter * 0.78;
  let nFeet = feetCount;
  if (boltRFeet - footR < 2.0) {
    footR = Math.max(1.5, boltRFeet - 2.0);
    warnings.push(`Foot diameter reduced to ${(2 * footR).toFixed(1)}mm to fit on the small pot base.`);
  }
  if (boltRFeet <= footR) {
    warnings.push("Base is too small to fit standoff feet with the given diameter — feet omitted.");
    nFeet = 0;
  }

  return {
    height,
    draftDeg: draftUsedDeg,
    draftRequestedDeg: draftDeg,
    wallT,
    wallTHorizontal,
    floorT,
    outerTopDiam: 2 * RTopOuter,
    outerBottomDiam,
    outerDiamAtFloorTop: 2 * ROuterAtFloorTop,
    innerTopDiam,
    innerBottomDiam,
    usableDepth,
    clearanceTotal,
    drainHoleCount: nHoles,
    drainHoleDiam: dHole,
    drainHoleBoltCircleDiam: 2 * boltRHoles,
    feetCount: nFeet,
    feetDiam: 2 * footR,
    feetHeight,
    feetBoltCircleDiam: 2 * boltRFeet,
    nSeg,
    totalHeightInclFeet: height + (nFeet > 0 ? feetHeight : 0.0),
    warnings,
    notes,
  };
}

export function sizeFromContainerInner({
  containerTopInnerDiam,
  containerBottomInnerDiam,
  containerInnerDepth,
  height = null,
  ...rest
}) {
  const clearanceTotal = rest.clearanceTotal ?? DEFAULTS.clearanceTotal;
  const outerTopDiam = containerTopInnerDiam - clearanceTotal;
  if (outerTopDiam <= 0) {
    throw new Error("Container inner top diameter is too small once clearance is subtracted.");
  }
  const h = height === null || height === undefined ? containerInnerDepth : height;
  return resolvePot({
    outerTopDiam,
    height: h,
    containerBottomInnerDiam,
    ...rest,
  });
}

export function sizeFromDirectTarget({ outerTopDiam, height, ...rest }) {
  return resolvePot({ outerTopDiam, height, containerBottomInnerDiam: null, ...rest });
}

export function formatReport(spec) {
  const lines = [];
  lines.push(`Outer top diameter:    ${spec.outerTopDiam.toFixed(1)} mm`);
  lines.push(`Outer bottom diameter: ${spec.outerBottomDiam.toFixed(1)} mm`);
  lines.push(`Inner top diameter:    ${spec.innerTopDiam.toFixed(1)} mm`);
  lines.push(`Inner bottom diameter: ${spec.innerBottomDiam.toFixed(1)} mm`);
  lines.push(`Height (pot body):     ${spec.height.toFixed(1)} mm`);
  lines.push(`Usable soil depth:     ${spec.usableDepth.toFixed(1)} mm`);
  lines.push(`Wall thickness:        ${spec.wallT.toFixed(2)} mm`);
  lines.push(`Floor thickness:       ${spec.floorT.toFixed(2)} mm`);
  lines.push(`Draft angle:           ${spec.draftDeg.toFixed(1)} deg`);
  lines.push(`Drain holes:           ${spec.drainHoleCount} x ${spec.drainHoleDiam.toFixed(1)} mm dia`);
  lines.push(`Feet:                  ${spec.feetCount} x ${spec.feetDiam.toFixed(1)} mm dia x ${spec.feetHeight.toFixed(1)} mm tall`);
  lines.push(`Total height w/ feet:  ${spec.totalHeightInclFeet.toFixed(1)} mm`);
  return lines.join("\n");
}
