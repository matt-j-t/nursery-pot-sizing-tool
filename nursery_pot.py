#!/usr/bin/env python3
"""Parametric round, tapered nursery-pot generator.

Printer/material defaults: Bambu Lab P2S, 0.4mm nozzle, PETG.
Design rules baked in: 1.6mm walls (4 perimeters), 1.6mm min floor, 5 deg
default draft (auto-steepened up to a hard cap of 45 deg so walls always
print without supports), ~3mm total diametric clearance, drainage holes.
No feet — the pot sits flat on its own floor.

USAGE

  Fit inside a decorative pot you measured by hand:
    python3 nursery_pot.py --container-top-diam 150 --container-bottom-diam 110 \\
        --container-depth 130 --out my_pot.stl

  Fit inside a decorative pot you have an STL of (e.g. downloaded from
  Makerworld and already printed):
    python3 nursery_pot.py --from-stl decorative_pot.stl --out my_pot.stl

  Specify the nursery pot's own outer dimensions directly (no container):
    python3 nursery_pot.py --target-top-diam 100 --target-height 90 --out my_pot.stl

  Sanity-check the numbers before committing to an STL:
    python3 nursery_pot.py --container-top-diam 150 --container-bottom-diam 110 \\
        --container-depth 130 --dry-run
"""
import argparse
import sys

import calculator as calc
import pot_builder as pb


def build_arg_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)

    src = p.add_argument_group("dimension source (choose one)")
    src.add_argument("--from-stl", metavar="PATH", help="decorative pot STL to derive inner cavity dims from")
    src.add_argument("--container-top-diam", type=float, help="decorative pot INNER top diameter, mm (manual entry)")
    src.add_argument("--container-bottom-diam", type=float, help="decorative pot INNER bottom diameter, mm (manual entry)")
    src.add_argument("--container-depth", type=float, help="decorative pot INNER depth, mm (manual entry)")
    src.add_argument("--target-top-diam", type=float, help="nursery pot's own OUTER top diameter, mm (no container)")
    src.add_argument("--target-height", type=float, help="nursery pot's own height, mm (no container)")

    d = p.add_argument_group("design overrides (defaults match the fixed spec)")
    d.add_argument("--draft-deg", type=float, default=calc.DRAFT_DEG_DEFAULT)
    d.add_argument("--wall-t", type=float, default=calc.WALL_T_DEFAULT)
    d.add_argument("--floor-t", type=float, default=calc.FLOOR_T_DEFAULT)
    d.add_argument("--clearance", type=float, default=calc.CLEARANCE_TOTAL_DEFAULT, help="total diametric clearance, mm")
    d.add_argument("--drain-holes", type=int, default=calc.DRAIN_HOLE_COUNT_DEFAULT)
    d.add_argument("--drain-hole-diam", type=float, default=calc.DRAIN_HOLE_DIAM_DEFAULT)
    d.add_argument("--pot-height", type=float, default=None, help="override nursery pot body height (default: full container depth)")
    d.add_argument("--n-seg", type=int, default=96, help="circular resolution (triangles per ring)")

    p.add_argument("--out", default="nursery_pot.stl", help="output STL path")
    p.add_argument("--dry-run", action="store_true", help="print computed numbers only, skip STL generation")
    return p


def main(argv=None):
    args = build_arg_parser().parse_args(argv)

    kwargs = dict(
        draft_deg=args.draft_deg,
        wall_t=args.wall_t,
        floor_t=args.floor_t,
        clearance_total=args.clearance,
        drain_hole_count=args.drain_holes,
        drain_hole_diam=args.drain_hole_diam,
        n_seg=args.n_seg,
    )

    if args.from_stl:
        import stl_derive as sd
        result = sd.analyze_decorative_pot(args.from_stl)
        print("Analyzed decorative pot STL:")
        print(sd.format_analysis_report(result))
        print()
        spec = calc.size_from_container_inner(
            container_top_inner_diam=result["container_top_inner_diam"],
            container_bottom_inner_diam=result["container_bottom_inner_diam"],
            container_inner_depth=result["container_inner_depth"],
            height=args.pot_height,
            **kwargs,
        )
    elif args.container_top_diam is not None:
        if args.container_bottom_diam is None or args.container_depth is None:
            print("ERROR: --container-top-diam requires --container-bottom-diam and --container-depth too.", file=sys.stderr)
            return 2
        spec = calc.size_from_container_inner(
            container_top_inner_diam=args.container_top_diam,
            container_bottom_inner_diam=args.container_bottom_diam,
            container_inner_depth=args.container_depth,
            height=args.pot_height,
            **kwargs,
        )
    elif args.target_top_diam is not None:
        if args.target_height is None:
            print("ERROR: --target-top-diam requires --target-height too.", file=sys.stderr)
            return 2
        spec = calc.size_from_direct_target(
            outer_top_diam=args.target_top_diam,
            height=args.target_height,
            **kwargs,
        )
    else:
        print("ERROR: provide --from-stl, or --container-top-diam/--container-bottom-diam/--container-depth, "
              "or --target-top-diam/--target-height. Run with -h for examples.", file=sys.stderr)
        return 2

    print("=== Nursery pot — computed dimensions ===")
    print(calc.format_report(spec))

    if spec["warnings"]:
        print()
        print("Resolve the warnings above (or accept them knowingly) before printing.")

    if args.dry_run:
        print()
        print("(dry run — no STL written)")
        return 0

    print()
    stats, _ = pb.build_and_export(spec, args.out)
    print(f"Wrote {args.out}  ({stats['n_triangles']} triangles, "
          f"boundary edges: {stats['boundary_edges']}, non-manifold edges: {stats['nonmanifold_edges']})")
    if stats["boundary_edges"] != 0 or stats["nonmanifold_edges"] != 0:
        print("WARNING: mesh is not fully watertight — inspect before printing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
