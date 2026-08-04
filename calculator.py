"""Sizing logic for round, tapered 3D-printed nursery pots.

Two entry points:
  size_from_container_inner()  -- given the decorative pot's INNER cavity
                                   profile (top/bottom diameter, depth),
                                   derive a nursery pot that fits inside it.
  size_from_direct_target()    -- given the nursery pot's own target outer
                                   dimensions directly.

Both funnel into resolve_pot() which does the shared draft/wall/floor math
and printability checks, and returns a plain dict ("spec") consumed by
build_pot() in pot_builder.py.

Defaults reflect the fixed design rules:
  wall 1.6mm, floor 1.6mm min, 5 deg draft, ~3mm total diametric clearance,
  6-8 x 6mm drain holes, 3-4 feet ~2-3mm tall. Printer: Bambu P2S, 0.4mm
  nozzle, PETG.
"""
import math

# ---- fixed design defaults (spec) -----------------------------------------
WALL_T_DEFAULT = 1.6
FLOOR_T_DEFAULT = 1.6
DRAFT_DEG_DEFAULT = 5.0
CLEARANCE_TOTAL_DEFAULT = 3.0  # total diametric clearance (both sides combined)
DRAIN_HOLE_COUNT_DEFAULT = 8
DRAIN_HOLE_DIAM_DEFAULT = 6.0
FEET_COUNT_DEFAULT = 4
FEET_HEIGHT_DEFAULT = 2.5
FEET_DIAM_DEFAULT = 8.0
NOZZLE = 0.4

MIN_PRINTABLE_WALL = 3 * NOZZLE      # 1.2mm — below this, flag as too thin
MIN_PRINTABLE_FLOOR = 3 * NOZZLE     # 1.2mm
MAX_SENSIBLE_DRAFT_DEG = 30.0        # beyond this, taper looks/prints odd
MIN_INNER_FLOOR_DIAM = 15.0          # below this, drainage/soil volume is impractical


def _deg2rad(d):
    return d * math.pi / 180.0


def resolve_pot(
    outer_top_diam,
    height,
    container_bottom_inner_diam=None,   # constraint to check/auto-adjust draft against
    draft_deg=DRAFT_DEG_DEFAULT,
    wall_t=WALL_T_DEFAULT,
    floor_t=FLOOR_T_DEFAULT,
    clearance_total=CLEARANCE_TOTAL_DEFAULT,
    drain_hole_count=DRAIN_HOLE_COUNT_DEFAULT,
    drain_hole_diam=DRAIN_HOLE_DIAM_DEFAULT,
    feet_count=FEET_COUNT_DEFAULT,
    feet_height=FEET_HEIGHT_DEFAULT,
    feet_diam=FEET_DIAM_DEFAULT,
    n_seg=96,
):
    warnings = []
    notes = []

    R_top_outer = outer_top_diam / 2.0
    draft_used_deg = draft_deg

    # If we know the container's inner bottom diameter, make sure the
    # default/requested draft angle actually clears it; if not, steepen
    # the taper just enough to fit (and say so).
    if container_bottom_inner_diam is not None:
        allowed_bottom_outer_diam = container_bottom_inner_diam - clearance_total
        R_bottom_outer_at_default = R_top_outer - height * math.tan(_deg2rad(draft_deg))
        bottom_outer_diam_at_default = 2 * R_bottom_outer_at_default
        if bottom_outer_diam_at_default > allowed_bottom_outer_diam:
            # need steeper taper: solve for draft angle that hits the limit exactly
            delta_r = R_top_outer - allowed_bottom_outer_diam / 2.0
            if delta_r <= 0 or height <= 0:
                required_deg = draft_deg
            else:
                required_deg = math.degrees(math.atan(delta_r / height))
            if required_deg > draft_deg:
                draft_used_deg = required_deg
                notes.append(
                    f"Draft angle increased from {draft_deg:.1f} deg to {draft_used_deg:.1f} deg "
                    f"so the pot clears the container's narrower bottom opening "
                    f"({container_bottom_inner_diam:.1f}mm inner diameter)."
                )
        if draft_used_deg > MAX_SENSIBLE_DRAFT_DEG:
            warnings.append(
                f"Required draft angle ({draft_used_deg:.1f} deg) is unusually steep — the "
                f"container tapers a lot more than the pot's top-diameter fit allows. "
                f"Consider reducing the nursery pot's target top diameter."
            )

    R_bottom_outer = R_top_outer - height * math.tan(_deg2rad(draft_used_deg))
    if R_bottom_outer <= 0:
        warnings.append(
            "Computed bottom outer radius is zero or negative — draft angle/height combination "
            "is not physically valid. Reduce height or draft angle, or increase top diameter."
        )
        R_bottom_outer = max(R_bottom_outer, 1.0)

    outer_bottom_diam = 2 * R_bottom_outer

    # wall thickness measured perpendicular to the slanted wall -> slightly
    # larger horizontal offset than the nominal 1.6mm
    wall_t_horizontal = wall_t / math.cos(_deg2rad(draft_used_deg))

    R_top_inner = R_top_outer - wall_t_horizontal
    # outer radius at z=floor_t (taper continues through the floor region too)
    R_outer_at_floor_top = R_bottom_outer + floor_t * math.tan(_deg2rad(draft_used_deg))
    R_bottom_inner_at_floor = R_outer_at_floor_top - wall_t_horizontal  # inner radius at z=floor_t (bottom of usable cavity)

    inner_top_diam = 2 * R_top_inner
    inner_bottom_diam = 2 * R_bottom_inner_at_floor
    usable_depth = height - floor_t

    if wall_t < MIN_PRINTABLE_WALL:
        warnings.append(f"Wall thickness {wall_t}mm is thinner than {MIN_PRINTABLE_WALL}mm — too thin to print reliably.")
    if floor_t < MIN_PRINTABLE_FLOOR:
        warnings.append(f"Floor thickness {floor_t}mm is thinner than {MIN_PRINTABLE_FLOOR}mm — too thin to print reliably.")
    if inner_bottom_diam < MIN_INNER_FLOOR_DIAM:
        warnings.append(
            f"Inner floor diameter is only {inner_bottom_diam:.1f}mm — very little room for soil/drainage. "
            f"Consider a larger top diameter or shallower draft angle."
        )
    if usable_depth <= 5:
        warnings.append(f"Usable soil depth is only {usable_depth:.1f}mm after floor thickness — check height input.")

    # --- drainage holes -----------------------------------------------------
    hole_r = drain_hole_diam / 2.0
    margin = 2.0  # keep holes >=2mm clear of the inner wall
    max_bolt_r = R_bottom_inner_at_floor - hole_r - margin
    n_holes = drain_hole_count
    d_hole = drain_hole_diam
    if max_bolt_r <= hole_r:
        # shrink holes/hole count until they fit, or flag if truly too small
        d_hole = max(3.0, 2 * max(max_bolt_r - 1.0, 1.5))
        hole_r = d_hole / 2.0
        max_bolt_r = R_bottom_inner_at_floor - hole_r - margin
        n_holes = max(4, min(n_holes, 6))
        warnings.append(
            f"Floor is small — drain hole diameter reduced to {d_hole:.1f}mm to fit "
            f"{n_holes} holes with clearance from the inner wall."
        )
    bolt_r_holes = max(max_bolt_r * 0.75, hole_r + margin) if max_bolt_r > hole_r else max(R_bottom_inner_at_floor * 0.4, hole_r + 0.5)
    bolt_r_holes = min(bolt_r_holes, max_bolt_r) if max_bolt_r > 0 else hole_r
    if bolt_r_holes <= 0 or R_bottom_inner_at_floor < hole_r + margin:
        warnings.append("Inner floor is too small to fit any drainage holes with safe clearance — design needs a larger pot or thinner walls.")
        n_holes = 0

    # --- feet ----------------------------------------------------------------
    foot_r = feet_diam / 2.0
    bolt_r_feet = R_bottom_outer * 0.78
    if bolt_r_feet - foot_r < 2.0:
        foot_r = max(1.5, bolt_r_feet - 2.0)
        warnings.append(f"Foot diameter reduced to {2*foot_r:.1f}mm to fit on the small pot base.")
    if bolt_r_feet <= foot_r:
        warnings.append("Base is too small to fit standoff feet with the given diameter — feet omitted.")
        feet_count = 0

    spec = {
        "height": height,
        "draft_deg": draft_used_deg,
        "draft_requested_deg": draft_deg,
        "wall_t": wall_t,
        "wall_t_horizontal": wall_t_horizontal,
        "floor_t": floor_t,
        "outer_top_diam": 2 * R_top_outer,
        "outer_bottom_diam": outer_bottom_diam,
        "outer_diam_at_floor_top": 2 * R_outer_at_floor_top,
        "inner_top_diam": inner_top_diam,
        "inner_bottom_diam": inner_bottom_diam,
        "usable_depth": usable_depth,
        "clearance_total": clearance_total,
        "drain_hole_count": n_holes,
        "drain_hole_diam": d_hole,
        "drain_hole_bolt_circle_diam": 2 * bolt_r_holes,
        "feet_count": feet_count,
        "feet_diam": 2 * foot_r,
        "feet_height": feet_height,
        "feet_bolt_circle_diam": 2 * bolt_r_feet,
        "n_seg": n_seg,
        "total_height_incl_feet": height + (feet_height if feet_count > 0 else 0.0),
        "warnings": warnings,
        "notes": notes,
    }
    return spec


def size_from_container_inner(
    container_top_inner_diam,
    container_bottom_inner_diam,
    container_inner_depth,
    height=None,
    **kwargs,
):
    """Derive nursery pot spec to fit inside a decorative pot's inner cavity."""
    clearance_total = kwargs.get("clearance_total", CLEARANCE_TOTAL_DEFAULT)
    outer_top_diam = container_top_inner_diam - clearance_total
    if outer_top_diam <= 0:
        raise ValueError("Container inner top diameter is too small once clearance is subtracted.")
    if height is None:
        height = container_inner_depth  # sits flush to full depth by default
    return resolve_pot(
        outer_top_diam=outer_top_diam,
        height=height,
        container_bottom_inner_diam=container_bottom_inner_diam,
        **kwargs,
    )


def size_from_direct_target(outer_top_diam, height, **kwargs):
    """Nursery pot's own target outer dimensions, no container constraint."""
    return resolve_pot(outer_top_diam=outer_top_diam, height=height, container_bottom_inner_diam=None, **kwargs)


def format_report(spec):
    lines = []
    lines.append(f"Outer top diameter:    {spec['outer_top_diam']:.1f} mm")
    lines.append(f"Outer bottom diameter: {spec['outer_bottom_diam']:.1f} mm")
    lines.append(f"Inner top diameter:    {spec['inner_top_diam']:.1f} mm")
    lines.append(f"Inner bottom diameter: {spec['inner_bottom_diam']:.1f} mm")
    lines.append(f"Height (pot body):     {spec['height']:.1f} mm")
    lines.append(f"Usable soil depth:     {spec['usable_depth']:.1f} mm")
    lines.append(f"Wall thickness:        {spec['wall_t']:.2f} mm")
    lines.append(f"Floor thickness:       {spec['floor_t']:.2f} mm")
    lines.append(f"Draft angle:           {spec['draft_deg']:.1f} deg")
    lines.append(f"Drain holes:           {spec['drain_hole_count']} x {spec['drain_hole_diam']:.1f} mm dia")
    lines.append(f"Feet:                  {spec['feet_count']} x {spec['feet_diam']:.1f} mm dia x {spec['feet_height']:.1f} mm tall")
    lines.append(f"Total height w/ feet:  {spec['total_height_incl_feet']:.1f} mm")
    if spec["notes"]:
        lines.append("")
        lines.append("Notes:")
        for n in spec["notes"]:
            lines.append(f"  - {n}")
    if spec["warnings"]:
        lines.append("")
        lines.append("WARNINGS:")
        for w in spec["warnings"]:
            lines.append(f"  ! {w}")
    return "\n".join(lines)
