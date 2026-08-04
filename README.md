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

Flow: pick "fit inside a decorative pot" (type in its inner top/bottom diameter and depth, or
drop in an STL to auto-fill those fields) or "direct pot dimensions" for the nursery pot's own
size. Advanced options (draft angle, wall/floor thickness, clearance, drain holes, feet) are
collapsed by default with sensible design-rule defaults. Generating a pot shows the computed
numbers, any printability warnings, a live 3D preview, and a download-STL button. On a phone,
a "View in AR" button appears; on desktop, a QR code appears that encodes the same pot's
parameters in the URL, so scanning it opens the identical pot on your phone for AR viewing.

Everything (geometry construction, STL/GLB/USDZ export, the STL-upload cavity analysis) runs
client-side — nothing is uploaded anywhere.

## Command-line tool

```
python3 nursery_pot.py --container-top-diam 150 --container-bottom-diam 110 \
    --container-depth 130 --out my_pot.stl
```

Run `python3 nursery_pot.py -h` for the full option list, including `--from-stl` (derive
dimensions from an uploaded decorative-pot STL) and `--target-top-diam`/`--target-height`
(size the nursery pot directly, no container). Requires only Python 3 + numpy.

## Design rules baked in

- 1.6mm walls (4 perimeters @ 0.4mm nozzle), 1.6mm minimum floor
- 5° default wall draft (auto-steepened if needed to clear a narrower container bottom)
- ~3mm total diametric clearance between nursery pot and container
- 6–8 × 6mm drainage holes, 3–4 standoff feet (~2.5mm tall)
- Warns on anything under-strength or unprintable (thin walls/floor, cramped drain holes,
  a base too small for feet) before generating geometry

## Notes on the STL-upload cavity detection

The "derive from STL" path slices the uploaded mesh with horizontal planes and reads where the
inner cavity wall sits at each height — a heuristic, not a full CAD analysis. It works well on
typical single-body round/tapered planters. Detected numbers are shown as editable fields so
you can sanity-check and correct them before generating.
