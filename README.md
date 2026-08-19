# Nursery Pot Sizing Tool

Generates a round, tapered 3D-printable nursery pot (plastic liner) sized to fit inside a
decorative pot — either from hand-measured dimensions or an uploaded STL of the decorative
pot. Tuned for a Bambu Lab P2S, 0.4mm nozzle, PETG, but the numbers are all adjustable.

Two versions of the same tool live in this repo:

- **`docs/`** — a static website (calculator, 3D preview, AR view, STL/GLB/USDZ export) that
  runs entirely in the browser. No install, no backend.
- **Python files in the repo root** (`nursery_pot.py` + `calculator.py`, `geometry.py`,
  `pot_builder.py`, `stl_derive.py`, `stl_io.py`) — the same logic as a command-line tool.

## Website

Open `docs/index.html` directly in a browser, or serve the folder locally:

```
cd docs
python3 -m http.server 8000
# then visit http://localhost:8000
```

**To publish on GitHub Pages:** push this repo to GitHub, then in the repo's
Settings → Pages, set the source to the `main` branch, `/docs` folder. GitHub will publish it
at `https://<username>.github.io/<repo>/`.

Flow: every mode takes measurements of your DECORATIVE pot's inside — you never enter the
nursery pot's own final size directly. Pick "Simple" (just the inner top diameter and depth —
good enough when the pot doesn't taper much) or "Full" (inner top diameter, bottom diameter,
and depth — type them in, or drop in an STL to auto-fill those fields). Advanced options (draft
angle, wall/floor thickness, diametric clearance, height clearance, drain holes) are collapsed
by default with sensible design-rule defaults. Generating a pot shows the computed numbers, any
printability warnings, a live 3D preview, and a download-STL button. On a phone, a "View in AR"
button appears; on desktop, a QR code appears that encodes the same pot's parameters in the
URL, so scanning it opens the identical pot on your phone for AR viewing.

Everything (geometry construction, STL/GLB/USDZ export, the STL-upload cavity analysis) runs
client-side — nothing is uploaded anywhere.

## Command-line tool

```
python3 nursery_pot.py --container-top-diam 150 --container-bottom-diam 110 \
    --container-depth 130 --out my_pot.stl
```

Run `python3 nursery_pot.py -h` for the full option list, including `--from-stl` (derive
dimensions from an uploaded decorative-pot STL) and `--top-diam`/`--depth` (simple mode — just
the decorative pot's inner top diameter and depth, no bottom diameter needed). Requires only
Python 3 + numpy.

## Design rules baked in

- 1.6mm walls (4 perimeters @ 0.4mm nozzle). Floor thickness now always follows wall thickness
  (see the dome floor below) — the separate floor-thickness field is still accepted for
  backward compatibility but no longer affects the generated geometry
- 5° default wall draft, auto-steepened if needed to clear a narrower container bottom, but
  hard-capped at 45° from vertical so walls always print without supports
- ~3mm total diametric clearance between nursery pot and container
- ~5mm height clearance — the nursery pot sits this much shorter than the container's inner
  depth so it doesn't jam at the bottom and is easy to lift back out
- 8 × 5mm round drainage holes on a flat ring near the floor's outer edge; auto-shrunk (and, on
  a very small floor, count-reduced) to keep clearance from both the dome's slope and the inner
  wall
- No feet — the pot sits flat on its own floor for reliable first-layer adhesion
- Warns on anything under-strength or unprintable (thin walls/floor, cramped drain holes, or a
  draft angle so capped that the pot won't reach the container's floor) before generating
  geometry

## Lift notches, air slots, and the dome floor (website only)

Lift notches and air slots are optional features in the website's advanced options, ported from
a Blender-validated reference design (see `docs/features-wip/nursery-pot-features-spec.md`). The
dome floor (below) is not optional — it's the pot's base on every generated pot.

- **Lift notches** (0/1/2, 180° apart if 2) — a fixed 20mm-wide, 6mm-deep finger recess baked
  into the rim, fading out over the top 18mm of wall. Fixed size regardless of pot size (sized
  to a finger, not the pot). The same recess is applied to both the outer and inner wall
  surfaces so wall thickness stays constant through the notch rather than breaching into the
  cavity.
- **Air slots** — vertical root air-pruning slots, fixed constant width (2–4mm, held the same
  top to bottom of the slot — no taper), positioned only in the bottom half of the pot. Count is
  derived from the pot's circumference at the slot band (more slots on a bigger pot), not a
  fixed number. Built as a rectangular open-column region through the wall grid and sealed by a
  generic boundary-loop stitcher (`docs/js/geometry.js`: `wallGrid`, `findGridHoleLoops`,
  `stitchWallGridHoles`) that explicitly detects and throws on any "bowtie" (two holes sharing a
  vertex) rather than silently producing broken geometry.
- **Dome floor** — the pot's base is a single radially-symmetric dome: a flat plateau at the
  center, a straight conical slope down to a flat outer ring, then round drain holes near the
  outer edge. See `docs/nursery-pot-parametric-spec.md` for the full locked-in spec and
  `docs/features-wip/pot-floor-dome.mjs` for a tested standalone reference implementation
  (`geo.domeHeight`/`geo.offsetProfileInward`/`geo.ngonCap` in `docs/js/geometry.js` are the
  wired-in version). This replaced an earlier raised-channel/hub-and-spoke groove design
  entirely, after a physical print of that design came out paper-thin and failed right around
  the drain holes: holding wall thickness constant by offsetting the interior surface a fixed
  vertical amount only stays accurate where the surface is flat, and the true (perpendicular)
  thickness drifted thinnest exactly where the groove's cross-section was steepest.

  The dome fixes this at the source: the exterior surface is built from `domeHeight(r)` baked
  directly into a ring loft (concentric rings from the plateau's radius out to the pot's outer
  radius, innermost ring capped as a flat NGON — ear-clip triangulated across its own boundary,
  never a single-point fan, even at the center), and the interior surface is a true per-facet
  normal offset of that profile (`offsetProfileInward` — each straight segment offset along its
  own 2D normal, then re-mitered at each corner), not a naive vertical shift. That keeps wall
  thickness genuinely constant through the slope, independent of the dome's rise/run, closing
  off the exact class of bug that made the earlier design's floor thin out. The slope's angle
  from horizontal is checked against a hard 45° print-safety cap (reference dimensions land at
  ≈38.7°) so the dome always prints self-supported — one continuous surface rising smoothly from
  full bed contact at the outer ring to the plateau, like printing a cone. Drain holes are cut
  out of the ring loft the same way air slots are cut out of the wall grid (open grid cells
  sealed by the generic boundary-loop stitcher).

- **mjt logo emboss** — a small raised `mjt.` mark on the interior (soil-facing) plateau, on every
  pot. Extruded directly from the exact vector polygon data in `docs/features-wip/logo-data.mjs`
  (parsed once from `docs/mjt-logo.svg`) using the same ear-clip-based prism extrusion the
  plateau's own flat cap uses (`geo.polygonPrism`) — each of the 5 disjoint letter/dot shapes
  becomes its own small, independently watertight extruded solid resting on (but not boolean-
  unioned with) the plateau's cap; two solids sharing a flat contact plane is already a valid,
  printable construction, so no CSG union is needed. This replaced an earlier heightfield/grid-
  sampled emboss that produced visibly fuzzy, jagged letter edges at print resolution — extruding
  the exact polygon boundary instead gives mathematically clean edges regardless of resolution.

The lift notch corrects for a real bug found during development: an internal grid-building
function (`wallGrid`) was calling its radius callback with the wrong argument order, so the
notch's angle parameter silently received an integer column index instead of a real angle —
producing a repeating zigzag of small triangular dips around the entire rim instead of one
smooth, localized arc. Fixed by matching the call convention already used elsewhere (`ringStack`).

Run `node docs/js/manifoldTest.mjs` to check a battery of pot configurations (features on and off
in combination, various sizes/resolutions, plus the exact reference pot size from the dome spec)
are watertight — every edge shared by exactly two faces, no open or non-manifold edges. This is
the regression test for the multi-hole topology class of bug described in the spec above. Note:
two small-pot configs are currently left failing on purpose (commented in the test file) — the
dome's plateau/slope size is a fixed absolute value, not yet scaled to pot size, so it no longer
fits inside a very small floor. Tracked as follow-up work; the reference pot size and all other
configs pass.

## Notes on the STL-upload cavity detection

The "derive from STL" path slices the uploaded mesh with horizontal planes and reads where the
inner cavity wall sits at each height — a heuristic, not a full CAD analysis. It works well on
typical single-body round/tapered planters. Detected numbers are shown as editable fields so
you can sanity-check and correct them before generating.
