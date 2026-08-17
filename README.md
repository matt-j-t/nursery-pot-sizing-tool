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

- 1.6mm walls (4 perimeters @ 0.4mm nozzle), 1.6mm minimum floor
- 5° default wall draft, auto-steepened if needed to clear a narrower container bottom, but
  hard-capped at 45° from vertical so walls always print without supports
- ~3mm total diametric clearance between nursery pot and container
- ~5mm height clearance — the nursery pot sits this much shorter than the container's inner
  depth so it doesn't jam at the bottom and is easy to lift back out
- 6–8 × 6mm drainage holes; adjacent holes are auto-spaced/shrunk to avoid overlapping on a
  small floor
- No feet — the pot sits flat on its own floor for reliable first-layer adhesion
- Warns on anything under-strength or unprintable (thin walls/floor, cramped drain holes, or a
  draft angle so capped that the pot won't reach the container's floor) before generating
  geometry

## Lift notches, air slots, and base grooves (website only)

Three optional features in the website's advanced options, all ported from a Blender-validated
reference design (see `docs/features-wip/nursery-pot-features-spec.md`):

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
- **Base grooves** — automatic whenever there are drain holes: one radial channel per drain
  hole, recessed into the floor's underside and running from a 15mm hub out to the pot's outer
  edge, so water reaches the drain holes and the pot doesn't seal flat against a surface. A
  radial (r, theta) height field — flush at the hub, a linear 45°-safe ramp up to a 1.2mm-raised
  plateau over the first 1.2mm of radius, then flat out to the edge — ported from the tested
  `docs/features-wip/pot-floor.mjs`. The floor is built as its own proper radial x angular grid
  (`geo.radialGrid`, structurally the same idea as the wall's ring loft), not a warped flat cap:
  an early version warped a flat ear-clip-triangulated disc's height, but ear-clipping only
  places vertices on the outer boundary and hole loops — nothing in the interior — so there was
  no real grid for the ramp to sit on, and the interior got filled with arbitrary long fan
  triangles instead of the intended channel shape. The radial grid has exactly one legitimate
  fan point (the hub center); everything else is proper quads between radial rings, and drain
  holes are cut out of it the same way air slots are cut out of the wall grid (open grid cells
  sealed by the generic boundary-loop stitcher).

  The groove's TANGENTIAL shape (its cross-section swept around each channel's center angle) is
  FACETED — a flat channel floor, a short linear transition, then a flat ridge — not a cosine
  curve, ported from `docs/features-wip/pot-floor-angular.mjs`. A physical print of an earlier
  cosine version came out paper-thin and failed right around the drain holes: holding wall
  thickness constant by offsetting a surface a fixed vertical amount only stays accurate where
  the surface is flat, and the true (perpendicular) thickness drifted thinnest exactly where the
  cosine curve was steepest. Two validity checks in `calculator.js`'s `resolvePot` now catch this
  class of problem before it can reach the mesh: a ridge-to-ridge width check (adjacent grooves
  can't crowd the solid ridge between them down to nothing) and a hole-to-transition-zone
  clearance check (a drain hole can't reach into a groove's transition zone with less than a wall
  thickness of margin — specifically where the physical print failed) — both throw with the
  actual measured clearance in mm rather than silently generating unsafe geometry.

- **mjt logo emboss** — a small raised `mjt.` mark on the interior (soil-facing) hub, whenever
  base grooves are active (the hub is a construct of that floor path only). Polygon data and a
  point-in-polygon test ported from `docs/features-wip/logo-data.mjs` /
  `docs/features-wip/logo-emboss.mjs`. Since the interior floor surface is a height field (not an
  independent mesh unioned onto the exterior), the emboss is wired in by raising that height
  field's z by a small fixed amount wherever `pointInLogo()` is true, instead of the normal flush
  offset — everywhere else, and the entire exterior surface, is untouched. Like the grooved
  floor, the hub's interior cap can't be a plain triangle fan once it needs to carry a compact
  interior bump (a fan has no vertices between the center point and its outer ring for a bump to
  sit on) — it's built as its own small radial grid instead, with only the true center point
  still a fan (the logo passes extremely close to — even through — the hub's exact center, so
  that fan evaluates the logo test at its own vertices too rather than assuming it's clear).

Both the lift notch and the base groove's radial ramp correct for a real bug found during
development: an internal grid-building function (`wallGrid`) was calling its radius callback with
the wrong argument order, so the notch's angle parameter silently received an integer column
index instead of a real angle — producing a repeating zigzag of small triangular dips around the
entire rim instead of one smooth, localized arc. Fixed by matching the call convention already
used elsewhere (`ringStack`).

Run `node docs/js/manifoldTest.mjs` to check a battery of pot configurations (features on and
off in combination, various sizes/resolutions) are watertight — every edge shared by exactly two
faces, no open or non-manifold edges — and that the groove ridge-width/hole-clearance checks
above correctly accept safe configurations and reject unsafe ones. This is the regression test
for both the multi-hole topology class of bug described in the spec above and the print-safety
checks described here.

## Notes on the STL-upload cavity detection

The "derive from STL" path slices the uploaded mesh with horizontal planes and reads where the
inner cavity wall sits at each height — a heuristic, not a full CAD analysis. It works well on
typical single-body round/tapered planters. Detected numbers are shown as editable fields so
you can sanity-check and correct them before generating.
