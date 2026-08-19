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
  drainHoleDiam: 5.0,
  nSeg: 144,
  liftNotchCount: 0,
  airSlotsEnabled: false,
};

const NOZZLE = 0.4;
const MIN_PRINTABLE_WALL = 3 * NOZZLE;
const MIN_PRINTABLE_FLOOR = 3 * NOZZLE;
const MAX_PRINTABLE_DRAFT_DEG = 45.0; // hard cap — walls at/under this angle from
                                      // vertical print without supports on an FDM printer
const MIN_INNER_FLOOR_DIAM = 15.0;

// Lift notch — fixed physical size regardless of pot size (Blender-
// validated design, see docs/features-wip/nursery-pot-features-spec.md):
// a 20mm-wide, 6mm-deep finger recess baked into the rim, fading out over
// the top 18mm of wall going down.
const NOTCH_HALF_WIDTH_MM = 10.0;
const NOTCH_RECESS_MM = 6.0;
const NOTCH_FADE_SPAN_MM = 18.0;
// Below this usable wall span (height - wallT), a notch can't fade in
// cleanly above the floor-top cap — disable rather than distort it.
const NOTCH_MIN_WALL_SPAN_MM = 8.0;

// Air slots — vertical side slots for root air-pruning, bottom half of
// the pot only. Constant-width rectangular through-slots (no taper) —
// width is fixed regardless of pot size (soil retention depends on
// particle size, not pot size), clamped to 2-4mm, and held constant top
// to bottom of the slot's own band so it prints as a clean rectangle
// rather than a pointed/tapered opening.
const AIR_SLOT_WIDTH_MM = 3.0; // within the fixed 2-4mm range
const AIR_SLOT_HEIGHT_SPAN_MM = 30.0;
const AIR_SLOT_ZLO_FRAC = 0.12; // band starts at 12% of pot height
const AIR_SLOT_MAX_ZHI_FRAC = 0.5; // band must stay in the bottom half
const AIR_SLOT_MIN_COUNT = 2;
const AIR_SLOT_MAX_COUNT = 12; // sanity cap even on a very large pot
const AIR_SLOT_TARGET_GAP_MM = 18.0; // comfortable solid-wall spacing used to size the count
const AIR_SLOT_MIN_GAP_MM = 1.5; // hard structural minimum — only used as a crowding safety net
const AIR_SLOT_N_RINGS = 2; // just enough rings to bound the band; no taper to resolve
const AIR_SLOT_MIN_BAND_MM = 10.0;

// Dome floor — replaces the earlier raised-channel/hub-and-spoke base
// entirely (see docs/nursery-pot-parametric-spec.md). A flat plateau at
// the center, a straight conical slope down to a flat outer ring at the
// pot's normal wallT, then round drain holes near the outer edge — one
// continuous, radially-symmetric surface that's always self-supported
// (each new printed layer sits on solid material below it, starting from
// the flat outer ring's full bed contact and rising smoothly to the
// plateau), by construction rather than by careful tuning. See
// geo.domeHeight / geo.offsetProfileInward / docs/features-wip/pot-floor-dome.mjs.
const DOME_FLAT_TOP_R_MM = 10.0; // FIXED — sized to frame the ~12x5mm logo with margin
const DOME_RISE_MM = 8.0; // reference — how far the plateau stands above the outer flat zone
const DOME_SLOPE_RUN_MM = 10.0; // reference — radial distance the rise happens over
const DOME_MAX_SLOPE_ANGLE_DEG = 45.0; // global print-safety rule — no exceptions
const DOME_HOLE_MARGIN_MM = 2.0; // min clearance kept between drain holes and the dome slope / outer wall

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
  liftNotchCount = DEFAULTS.liftNotchCount,
  airSlotsEnabled = DEFAULTS.airSlotsEnabled,
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

  // The dome floor's flat outer ring sits at z=wallT (its thickness is the
  // pot's normal wallT, same as the walls — see docs/nursery-pot-parametric-spec.md).
  // floorT is still accepted as a parameter (so the existing UI field keeps
  // working) but no longer drives any geometry; noted below rather than
  // silently ignored.
  const wallTHorizontal = wallT / Math.cos(deg2rad(draftUsedDeg));
  const RTopInner = RTopOuter - wallTHorizontal;
  const ROuterAtFloorTop = RBottomOuter + wallT * Math.tan(deg2rad(draftUsedDeg));
  const RBottomInnerAtFloor = ROuterAtFloorTop - wallTHorizontal;

  const innerTopDiam = 2 * RTopInner;
  const innerBottomDiam = 2 * RBottomInnerAtFloor;
  const usableDepth = height - wallT;

  if (Math.abs(floorT - wallT) > 1e-6) {
    notes.push(
      `Floor thickness now follows wall thickness (${wallT.toFixed(2)}mm) for the dome base design — the ` +
        `separate floor-thickness value (${floorT.toFixed(2)}mm) is no longer used.`
    );
  }

  if (wallT < MIN_PRINTABLE_WALL) {
    warnings.push(`Wall thickness ${wallT}mm is thinner than ${MIN_PRINTABLE_WALL}mm — too thin to print reliably.`);
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

  // --- dome floor ---
  // Angle re-derived from the actual flatTopR/domeRise/slopeRun in use
  // (all three are currently fixed constants, but this is what the spec
  // means by "don't change them without re-deriving and re-checking this
  // stays <=45 deg" — computed here, every time, rather than trusted from
  // memory) and hard-checked against the global 45 deg print-safety rule.
  const domeOuterR = DOME_FLAT_TOP_R_MM + DOME_SLOPE_RUN_MM;
  const domeAngleDeg = Math.atan2(DOME_RISE_MM, DOME_SLOPE_RUN_MM) * (180 / Math.PI);
  if (domeAngleDeg > DOME_MAX_SLOPE_ANGLE_DEG) {
    throw new Error(
      `Dome floor: the slope from the plateau to the outer flat ring is ${domeAngleDeg.toFixed(1)} deg from ` +
        `horizontal (domeRise=${DOME_RISE_MM}mm over slopeRun=${DOME_SLOPE_RUN_MM}mm), which exceeds the ` +
        `${DOME_MAX_SLOPE_ANGLE_DEG.toFixed(0)} deg print-safety limit — reduce domeRise or increase slopeRun.`
    );
  }
  if (RBottomOuter - domeOuterR < DOME_HOLE_MARGIN_MM) {
    warnings.push(
      `Pot's bottom (outer radius ${RBottomOuter.toFixed(1)}mm) barely clears the dome's outer edge ` +
        `(${domeOuterR.toFixed(1)}mm) — there may be little to no room left for drain holes.`
    );
  }

  // --- drainage holes ---
  // Holes sit in the dome's flat outer ring: outboard of the slope
  // (domeOuterR, plus a safety margin — the interior surface's own
  // corresponding corner sits slightly further out than domeOuterR under
  // a true wallT offset, see geo.offsetProfileInward, so this margin is
  // deliberately conservative rather than exact) and inboard of the pot's
  // outer wall.
  let holeR = drainHoleDiam / 2.0;
  const margin = DOME_HOLE_MARGIN_MM;
  const minBoltR = domeOuterR + wallT + margin;
  let maxBoltR = RBottomInnerAtFloor - holeR - margin;
  let nHoles = drainHoleCount;
  let dHole = drainHoleDiam;
  if (maxBoltR <= holeR || maxBoltR <= minBoltR) {
    dHole = Math.max(3.0, 2 * Math.max(maxBoltR - minBoltR - 1.0, 1.5));
    holeR = dHole / 2.0;
    maxBoltR = RBottomInnerAtFloor - holeR - margin;
    nHoles = Math.max(4, Math.min(nHoles, 6));
    warnings.push(
      `Floor is small — drain hole diameter reduced to ${dHole.toFixed(1)}mm to fit ${nHoles} holes ` +
        `between the dome slope and the inner wall.`
    );
  }
  // Push the ring as close to the outer wall as the margin allows (real
  // pots keep drainage near the rim) rather than centering it in the
  // available band.
  let boltRHoles = maxBoltR > minBoltR ? maxBoltR : minBoltR;
  if (boltRHoles <= minBoltR || maxBoltR < minBoltR) {
    warnings.push(
      "Floor is too small to fit any drainage holes between the dome's slope and the inner wall with safe " +
        "clearance — design needs a larger pot or thinner walls."
    );
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

  // --- lift notch ---
  let notchCount = liftNotchCount;
  if (![0, 1, 2].includes(notchCount)) {
    warnings.push(`Lift notch count ${notchCount} is invalid (must be 0, 1, or 2) — disabled.`);
    notchCount = 0;
  }
  const wallSpan = height - wallT; // usable vertical span the notch can fade into, above the floor cap
  let notchFadeSpanMM = Math.min(NOTCH_FADE_SPAN_MM, wallSpan * 0.95);
  if (notchCount > 0 && wallSpan < NOTCH_MIN_WALL_SPAN_MM) {
    warnings.push(
      `Pot is too short (usable wall span ${wallSpan.toFixed(1)}mm) to fit a lift notch cleanly — disabled. ` +
        `Increase height to use lift notches.`
    );
    notchCount = 0;
  }
  const notchCenters = notchCount === 2 ? [0, Math.PI] : notchCount === 1 ? [0] : [];

  // --- air slots ---
  let slotsOn = !!airSlotsEnabled;
  let slotCount = 0;
  let slotZLo = 0;
  let slotZHi = 0;
  if (slotsOn) {
    slotZLo = height * AIR_SLOT_ZLO_FRAC;
    slotZHi = Math.min(slotZLo + AIR_SLOT_HEIGHT_SPAN_MM, height * AIR_SLOT_MAX_ZHI_FRAC);
    const band = slotZHi - slotZLo;
    if (band < AIR_SLOT_MIN_BAND_MM || slotZLo <= wallT + 1.0) {
      warnings.push(
        `Pot is too short for air slots (usable band ${Math.max(band, 0).toFixed(1)}mm) — disabled. ` +
          `Increase height to use air slots.`
      );
      slotsOn = false;
    }
  }
  if (slotsOn) {
    // Slot WIDTH is always fixed (2-4mm, see AIR_SLOT_WIDTH_MM) — but the
    // COUNT is derived from the pot's circumference at the slot band, not a
    // fixed default, the same way drain hole count/spacing is already
    // derived from the floor's area above. Using the band's narrowest
    // radius (its bottom, since the pot tapers wider going up) is the
    // worst case for crowding.
    const radiusAtZLo = RBottomOuter + (RTopOuter - RBottomOuter) * (slotZLo / height);
    const circumferenceAtZLo = 2 * Math.PI * radiusAtZLo;
    const period = AIR_SLOT_WIDTH_MM + AIR_SLOT_TARGET_GAP_MM; // one slot + a comfortable gap to the next
    slotCount = Math.max(AIR_SLOT_MIN_COUNT, Math.min(AIR_SLOT_MAX_COUNT, Math.floor(circumferenceAtZLo / period)));
    // Safety-net check (floor() above should already guarantee this, but
    // verify with the same chord-length test used for drain holes in case
    // of an unusual bottleneck elsewhere in the taper).
    while (
      slotCount > AIR_SLOT_MIN_COUNT &&
      2 * radiusAtZLo * Math.sin(Math.PI / slotCount) < AIR_SLOT_WIDTH_MM + AIR_SLOT_MIN_GAP_MM
    ) {
      slotCount -= 1;
    }
    if (2 * radiusAtZLo * Math.sin(Math.PI / slotCount) < AIR_SLOT_WIDTH_MM) {
      warnings.push("Pot is too narrow to fit air slots with safe spacing between them — disabled.");
      slotsOn = false;
      slotCount = 0;
    } else {
      notes.push(
        `Air slot count set to ${slotCount}, based on the pot's circumference at the slot band ` +
          `(keeps slots evenly spaced with at least ${AIR_SLOT_MIN_GAP_MM.toFixed(1)}mm between them).`
      );
    }
  }
  const slotCenters = slotsOn ? Array.from({ length: slotCount }, (_, i) => (2 * Math.PI * i) / slotCount) : [];

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
    liftNotchCount: notchCount,
    notchCenters,
    notchHalfWidthMM: NOTCH_HALF_WIDTH_MM,
    notchRecessMM: NOTCH_RECESS_MM,
    notchFadeSpanMM,
    airSlotsEnabled: slotsOn,
    slotCenters,
    slotWidthMM: AIR_SLOT_WIDTH_MM,
    slotZLo,
    slotZHi,
    slotNRings: AIR_SLOT_N_RINGS,
    domeFlatTopRMM: DOME_FLAT_TOP_R_MM,
    domeRiseMM: DOME_RISE_MM,
    domeSlopeRunMM: DOME_SLOPE_RUN_MM,
    domeOuterRMM: domeOuterR,
    domeSlopeAngleDeg: domeAngleDeg,
    holeBoltCircleRMM: boltRHoles,
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
  lines.push(`Draft angle:           ${spec.draftDeg.toFixed(1)} deg`);
  lines.push(`Drain holes:           ${spec.drainHoleCount} x ${spec.drainHoleDiam.toFixed(1)} mm dia`);
  lines.push(
    `Dome floor:            plateau r=${spec.domeFlatTopRMM.toFixed(1)}mm, rise=${spec.domeRiseMM.toFixed(1)}mm, ` +
      `slope=${spec.domeSlopeAngleDeg.toFixed(1)} deg`
  );
  if (spec.liftNotchCount) {
    lines.push(`Lift notches:          ${spec.liftNotchCount}`);
  }
  if (spec.airSlotsEnabled) {
    lines.push(`Air slots:             ${spec.slotCenters.length} x ${spec.slotWidthMM.toFixed(1)}mm`);
  }
  return lines.join("\n");
}
