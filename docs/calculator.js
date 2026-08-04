// Sizing logic for round, tapered 3D-printed nursery pots.
// Direct port of calculator.py — see that file for the fuller design-rule
// commentary. Printer/material assumptions: Bambu Lab P2S, 0.4mm nozzle, PETG.

export const DEFAULTS = {
  wallT: 1.6,
  floorT: 1.6,
  draftDeg: 5.0,
  clearanceTotal: 3.0,
  heightClearance: 5.0,
  drainHoleCount: 8,
  drainHoleDiam: 6.0,
  nSeg: 96,
};

const NOZZLE = 0.4;
const MIN_PRINTABLE_WALL = 3 * NOZZLE;
const MIN_PRINTABLE_FLOOR = 3 * NOZZLE;
const MAX_PRINTABLE_DRAFT_DEG = 45.0; // hard cap — walls at/under this angle from
                                      // vertical print without supports on an FDM printer
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
        draftUsedDeg = Math.min(requiredDeg, MAX_PRINTABLE_DRAFT_DEG);
        if (requiredDeg > MAX_PRINTABLE_DRAFT_DEG) {
          const actualBottomOuterDiam = 2 * (RTopOuter - height * Math.tan(deg2rad(draftUsedDeg)));
          const actualClearance = containerBottomInnerDiam - actualBottomOuterDiam;
          if (actualClearance < 0) {
            warnings.push(
              `Draft angle capped at ${MAX_PRINTABLE_DRAFT_DEG.toFixed(0)} deg (steeper walls would need ` +
                `print supports) — even so, the pot's bottom (${actualBottomOuterDiam.toFixed(1)}mm) is still ` +
                `${Math.abs(actualClearance).toFixed(1)}mm WIDER than the container's bottom opening. It won't ` +
                `reach the floor of the container. Reduce the top diameter or height.`
            );
          } else {
            warnings.push(
              `Draft angle capped at ${MAX_PRINTABLE_DRAFT_DEG.toFixed(0)} deg (steeper walls would need print ` +
                `supports), so bottom clearance is only ${actualClearance.toFixed(1)}mm here instead of the ` +
                `usual ${clearanceTotal.toFixed(1)}mm. Reduce the top diameter if you need the full clearance ` +
                `at the bottom too.`
            );
          }
        } else {
          notes.push(
            `Draft angle increased from ${draftDeg.toFixed(1)} deg to ${draftUsedDeg.toFixed(1)} deg ` +
              `so the pot clears the container's narrower bottom opening ` +
              `(${containerBottomInnerDiam.toFixed(1)}mm inner diameter).`
          );
        }
      }
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

  // Make sure adjacent holes don't overlap each other around the bolt
  // circle — the wall-clearance check above only guards against the
  // outer wall, not against holes crowding into one another.
  if (nHoles > 0) {
    const gap = 1.0; // minimum clear gap between adjacent hole edges
    let adjusted = false;
    while (nHoles > 4 && 2 * boltRHoles * Math.sin(Math.PI / nHoles) < 2 * holeR + gap) {
      nHoles -= 1;
      adjusted = true;
    }
    let chord = 2 * boltRHoles * Math.sin(Math.PI / nHoles);
    if (chord < 2 * holeR + gap) {
      const newHoleR = chord > gap ? Math.max(1.5, (chord - gap) / 2.0) : 1.5;
      if (newHoleR < holeR) {
        holeR = newHoleR;
        dHole = 2 * holeR;
        adjusted = true;
      }
    }
    if (adjusted) {
      warnings.push(
        `Drain hole layout adjusted to ${nHoles} x ${dHole.toFixed(1)}mm so adjacent holes don't overlap ` +
          `on this small a floor.`
      );
    }
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
    nSeg,
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
  const heightClearance = rest.heightClearance ?? DEFAULTS.heightClearance;
  delete rest.heightClearance; // not a resolvePot param

  const outerTopDiam = containerTopInnerDiam - clearanceTotal;
  if (outerTopDiam <= 0) {
    throw new Error("Container inner top diameter is too small once clearance is subtracted.");
  }

  let h = height;
  let heightNote = null;
  if (h === null || h === undefined) {
    h = containerInnerDepth - heightClearance;
    if (h <= 0) {
      throw new Error("Container inner depth is too shallow once height clearance is subtracted.");
    }
    heightNote =
      `Height set to ${h.toFixed(1)}mm (${heightClearance.toFixed(1)}mm less than the decorative pot's ` +
      `${containerInnerDepth.toFixed(1)}mm inner depth) so it doesn't jam at the bottom of the cavity.`;
  }

  const spec = resolvePot({
    outerTopDiam,
    height: h,
    containerBottomInnerDiam,
    ...rest,
  });
  if (heightNote) spec.notes = [heightNote, ...spec.notes];
  return spec;
}

// Decorative pot's inner top diameter + inner depth only — no bottom
// diameter needed. Quicker alternative to sizeFromContainerInner for when
// you can't easily measure the container's bottom opening; draft angle
// stays at its default/override since there's no bottom constraint to
// auto-steepen against.
export function sizeFromContainerSimple({ containerTopInnerDiam, containerInnerDepth, height = null, ...rest }) {
  return sizeFromContainerInner({
    containerTopInnerDiam,
    containerBottomInnerDiam: null,
    containerInnerDepth,
    height,
    ...rest,
  });
}

export function formatReport(spec) {
  const lines = [];
  lines.push(`Outer top diameter:    ${spec.outerTopDiam.toFixed(1)} mm`);
  lines.push(`Outer bottom diameter: ${spec.outerBottomDiam.toFixed(1)} mm`);
  lines.push(`Inner top diameter:    ${spec.innerTopDiam.toFixed(1)} mm`);
  lines.push(`Inner bottom diameter: ${spec.innerBottomDiam.toFixed(1)} mm`);
  lines.push(`Height:                ${spec.height.toFixed(1)} mm`);
  lines.push(`Usable soil depth:     ${spec.usableDepth.toFixed(1)} mm`);
  lines.push(`Wall thickness:        ${spec.wallT.toFixed(2)} mm`);
  lines.push(`Floor thickness:       ${spec.floorT.toFixed(2)} mm`);
  lines.push(`Draft angle:           ${spec.draftDeg.toFixed(1)} deg`);
  lines.push(`Drain holes:           ${spec.drainHoleCount} x ${spec.drainHoleDiam.toFixed(1)} mm dia`);
  return lines.join("\n");
}
