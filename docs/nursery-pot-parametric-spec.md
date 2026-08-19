# MJT Nursery Pot - Parametric Spec (for implementation)

Reference pot used throughout design/testing: `bottomR=50mm, topR=75mm, height=120mm, wallT=2.5mm`.
All formulas below should scale from the user's actual input dimensions unless marked FIXED.

## Global print-safety rules (apply everywhere, no exceptions)
- **Max angle from vertical: 45 deg.** Any surface transition steeper than this needs support and is disallowed.
- **Wall thickness: constant wallT (default 2.5mm) everywhere**, including at the lift notch. Achieved via
  normal-offset (solidify-style) on the outer surface only - never build a feature by cutting into an
  already-thickened solid, or gap/height parameters silently eat into wall thickness (this caused a real bug
  during development: a channel gap equal to wallT left zero material).
- **Max unsupported bridging span: 20mm**, tested and holding at that value. Prefer designs with zero bridging
  over designs that rely on staying under this limit (see base design below).
- Any feature construction involving a **single-point vertex fan** (e.g. a hub tapering to one center point) is
  banned - it produces degenerate normals under thickness-offset and can push geometry to the wrong side of the
  surface. Use a flat NGON cap or a properly bounded polygon instead, even at a shape's center.

## Pot body
- Round, tapered only (no other shapes supported).
- bottomR, topR, height - free parametric inputs from user's sizing method (manual entry or derived from
  an uploaded decorative-pot model).
- wallT - default 2.5mm, user-adjustable, but propagates everywhere via the offset method above.

## Lift notch (finger grip)
- FIXED size (~20mm straight-line span at the rim), not user-adjustable in size.
- User selects **count: 0, 1, or 2** (if 2, positioned 180 deg apart).
- Shape: single smooth concave arc baked directly into the rim's outer radius profile (not a separate cut/patch
  piece) - a loft from the plain bottom profile to a top profile with the arc built into its outline.
- Recess depth 6mm (reference scale), fades to zero over 18mm of height below the rim via a cosine taper.
- Solid reshaped wall, constant wallT thickness - never a cavity or through-hole.

## Air-pruning slots (side wall)
- Simple **on/off toggle**.
- Fixed width, 2-4mm, **not scaled with pot size** (wider would let soil escape).
- Positioned **only in the bottom half** of the pot's height.
- Peaked top (45 deg, not flat) to avoid an unsupported horizontal bridging ceiling; flat bottom.
- Reference count: 8, evenly spaced - treat as parametric by circumference if useful, but never below the
  minimum width/spacing needed to keep each slot individually safe.

## Base / floor - FINAL design (dome), after multiple rejected approaches
Everything below replaces all earlier raised-channel / hub-and-spoke / diagonal-tunnel base concepts, which were
abandoned after repeated print failures (cantilevers, floating islands, base openings visible on both faces).
The dome design was chosen specifically because it is **one continuous surface that always touches the print
bed** - zero bridging, zero cantilevers, by construction, not by careful tuning.

- Floor is a **shallow dome**: flat circular plateau at the center, sloping down to a flat outer ring at the
  pot's normal wallT, then holes near the outer edge.
- flatTopR = 10mm (FIXED) - the plateau's radius, sized to frame the embossed logo (~12x5mm) with comfortable
  margin (20mm plateau diameter).
- domeRise = 8mm (reference) - how far the plateau sits above the outer flat zone.
- slopeRun = 10mm (reference) - radial distance over which the rise happens.
  - Resulting angle = atan(domeRise / slopeRun) - **must stay <=45 deg**. Reference values give 38.7 deg, confirmed
    with margin. If domeRise or slopeRun change, re-derive and re-check this angle; don't assume it stays safe.
  - domeOuterR = flatTopR + slopeRun (20mm reference) - where the slope meets the flat outer zone.
- Drain holes: **round, simple through-holes**, positioned in a ring at the low outer zone (reference:
  holeRPos = 42mm, 8 holes, 5mm diameter). Count/diameter can scale with pot size, but keep them clearly
  inboard of the dome's slope and the pot's outer wall.
- **No other openings anywhere on the base.** Both the interior (soil-facing) and exterior (ground-facing)
  surfaces must be fully solid except for these round holes. This was a hard-learned constraint - an earlier
  diagonal-channel design cut straight through the floor thickness and created unintended openings; the dome
  avoids this entirely since it has no embedded/hidden tunnels at all.
- Logo emboss sits on the flat plateau, interior (soil-facing) side, raised ~0.5mm. See logo section below for
  the recommended construction method - the flat plateau exists specifically to give it a clean, level base.

## Logo emboss
- Mark: "mjt", reference size ~12mm x 5mm, raised (not debossed), 0.5mm height.
- Position: centered on the base's flat plateau (interior/soil-facing surface only - never on the exterior).
- **Construction method: vector-based extrusion from the SVG source, not a rasterized heightfield.** A previous
  grid-sampled heightfield approach produced visibly fuzzy/jagged edges at print resolution. Use
  THREE.SVGLoader to parse the logo SVG into Shape objects, then THREE.ExtrudeGeometry to extrude them by
  the emboss height - both are already available since the tool uses Three.js, no new dependency needed. This
  gives mathematically exact edges regardless of print resolution. Because the logo sits on a flat plateau, it
  can simply be positioned as an additional mesh resting on that surface - no boolean/CSG union is needed (the
  tool has no CSG library), since two solids sharing a flat contact plane is already a valid, printable
  construction.

  **Implementation note (deviation from the above, agreed during implementation):** this codebase's
  manifoldTest.mjs regression suite runs under plain Node, which has no DOM/DOMParser and no browser
  three import map - so THREE.SVGLoader/THREE.ExtrudeGeometry aren't usable there. Instead, the logo is
  extruded directly from the exact vector polygon coordinates already captured in
  docs/features-wip/logo-data.mjs (originally parsed from docs/mjt-logo.svg, kept here as provenance/
  documentation), triangulated and extruded with the same plain-array ear-clip approach the rest of
  docs/js/geometry.js already uses (geo.polygonPrism). This achieves the same goal - exact vector edges,
  no heightfield fuzziness - without adding a browser-only dependency or breaking the Node-based test suite.

## Materials / print context
- Target printer: Bambu Lab P2S, primarily PETG.
- Nursery pot sits inside a decorative pot on the bottom (not hung by a lip/rim).
