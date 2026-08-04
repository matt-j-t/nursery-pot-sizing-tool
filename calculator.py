"""Sizing logic for round, tapered 3D-printed nursery pots.

Both entry points take your DECORATIVE pot's inner-cavity measurements and
shrink them down to a nursery-pot liner that fits inside:
  size_from_container_simple() -- inner top diameter + inner depth only.
                                   Quick mode for when you can't easily
                                   measure (or the pot doesn't really have)
                                   a distinctly different bottom diameter.
  size_from_container_inner()  -- full inner profile (top diameter, bottom
                                   diameter, depth), e.g. from calipers or
                                   an STL scan. Also auto-steepens the draft
                                   angle if needed so the pot still clears a
                                   narrower bottom opening.

Both funnel into resolve_pot() which does the shared draft/wall/floor math
and printability checks, and returns a plain dict ("spec") consumed by
build_pot() in pot_builder.py.

Defaults reflect the fixed design rules:
  wall 1.6mm, floor 1.6mm min, 5 deg draft (auto-steepened up to a hard cap
  of 45 deg so walls always print without supports), ~3mm total diametric
  clearance, 5mm height clearance, 6-8 x 6mm drain holes. No feet — the pot
  sits flat on its own floor for reliable first-layer adhesion. Printer:
  Bambu P2S, 0.4mm nozzle, PETG.
"""
import math

# ---- fixed design defaults (spec) -----------------------------------------
WALL_T_DEFAULT = 1.6
FLOOR_T_DEFAULT = 1.6
DRAFT_DEG_DEFAULT = 5.0
CLEARANCE_TOTAL_DEFAULT = 3.0   # total diametric clearance (both sides combined)
HEIGHT_CLEARANCE_DEFAULT = 5.0  # nursery pot sits this much shorter than the
                                # container's inner depth, so it doesn't jam
DRAIN_HOLE_COUNT_DEFAULT = 8
DRAIN_HOLE_DIAM_DEFAULT = 6.0
NOZZLE = 0.4

MIN_PRINTABLE_WALL = 3 * NOZZLE      # 1.2mm — below this, flag as too thin
MIN_PRINTABLE_FLOOR = 3 * NOZZLE     # 1.2mm
MAX_PRINTABLE_DRAFT_DEG = 45.0       # hard cap — walls at or under this angle from
                                     # vertical print without supports on an FDM printer
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
    n_seg=96,
):
    warnings = []
    notes = []

    R_top_outer = outer_top_diam / 2.0
    draft_used_deg = draft_deg

    # If we know the container's inner bottom diameter, make sure the
    # default/requested draft angle actually clears it; if not, steepen
    # the taper just enough to fit — but never past MAX_PRINTABLE_DRAFT_DEG,
    # since anything steeper needs print supports.
    if container_bottom_inner_diam is not None:
        allowed_bottom_outer_diam = container_bottom_inner_diam - clearance_total
        R_bottom_outer_at_default = R_top_outer - height * math.tan(_deg2rad(draft_deg))
        bottom_outer_diam_at_default = 2 * R_bottom_outer_at_default
        if bottom_outer_diam_at_default > allowed_bottom_outer_diam:
            # solve for the draft angle that hits the limit exactly
            delta_r = R_top_outer - allowed_bottom_outer_diam / 2.0
            if delta_r <= 0 or height <= 0:
                required_deg = draft_deg
            else:
                required_deg = math.degrees(math.atan(delta_r / height))
            if required_deg > draft_deg:
                draft_used_deg = min(required_deg, MAX_PRINTABLE_DRAFT_DEG)
                if required_deg > MAX_PRINTABLE_DRAFT_DEG:
                    actual_bottom_outer_diam = 2 * (
                        R_top_outer - height * math.tan(_deg2rad(draft_used_deg))
                    )
                    actual_clearance = container_bottom_inner_diam - actual_bottom_outer_diam
                    if actual_clearance < 0:
                        warnings.append(
                            f"Draft angle capped at {MAX_PRINTABLE_DRAFT_DEG:.0f} deg (steeper walls would need "
                            f"print supports) — even so, the pot's bottom ({actual_bottom_outer_diam:.1f}mm) is "
                            f"still {abs(actual_clearance):.1f}mm WIDER than the container's bottom opening. It "
                            f"won't reach the floor of the container. Reduce the top diameter or height."
                        )
                    else:
                        warnings.append(
                            f"Draft angle capped at {MAX_PRINTABLE_DRAFT_DEG:.0f} deg (steeper walls would need "
                            f"print supports), so bottom clearance is only {actual_clearance:.1f}mm here instead "
                            f"of the usual {clearance_total:.1f}mm. Reduce the top diameter if you need the full "
                            f"clearance at the bottom too."
                        )
                else:
                    notes.append(
                        f"Draft angle increased from {draft_deg:.1f} deg to {draft_used_deg:.1f} deg "
                        f"so the pot clears the container's narrower bottom opening "
                        f"({container_bottom_inner_diam:.1f}mm inner diameter)."
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

    # Make sure adjacent holes don't overlap each other around the bolt
    # circle — the wall-clearance check above only guards against the
    # outer wall, not against holes crowding into one another.
    if n_holes > 0:
        gap = 1.0  # minimum clear gap between adjacent hole edges
        adjusted = False
        while n_holes > 4 and 2 * bolt_r_holes * math.sin(math.pi / n_holes) < 2 * hole_r + gap:
            n_holes -= 1
            adjusted = True
        chord = 2 * bolt_r_holes * math.sin(math.pi / n_holes)
        if chord < 2 * hole_r + gap:
            new_hole_r = max(1.5, (chord - gap) / 2.0) if chord > gap else 1.5
            if new_hole_r < hole_r:
                hole_r = new_hole_r
                d_hole = 2 * hole_r
                adjusted = True
        if adjusted:
            warnings.append(
                f"Drain hole layout adjusted to {n_holes} x {d_hole:.1f}mm so adjacent holes don't overlap "
                f"on this small a floor."
            )

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
        "n_seg": n_seg,
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
    """Derive nursery pot spec to fit inside a decorative pot's inner cavity.

    Diameter is shrunk by clearance_total (default 3mm total, both sides
    combined) and, unless an explicit height override is given, height is
    shrunk by height_clearance (default 5mm) below the container's inner
    depth so the finished pot doesn't jam at the bottom of the cavity.
    """
    clearance_total = kwargs.get("clearance_total", CLEARANCE_TOTAL_DEFAULT)
    height_clearance = kwargs.pop("height_clearance", HEIGHT_CLEARANCE_DEFAULT)
    outer_top_diam = container_top_inner_diam - clearance_total
    if outer_top_diam <= 0:
        raise ValueError("Container inner top diameter is too small once clearance is subtracted.")

    height_note = None
    if height is None:
        height = container_inner_depth - height_clearance
        if height <= 0:
            raise ValueError("Container inner depth is too shallow once height clearance is subtracted.")
        height_note = (
            f"Height set to {height:.1f}mm ({height_clearance:.1f}mm less than the decorative pot's "
            f"{container_inner_depth:.1f}mm inner depth) so it doesn't jam at the bottom of the cavity."
        )

    spec = resolve_pot(
        outer_top_diam=outer_top_diam,
        height=height,
        container_bottom_inner_diam=container_bottom_inner_diam,
        **kwargs,
    )
    if height_note:
        spec["notes"].insert(0, height_note)
    return spec


def size_from_container_simple(container_top_inner_diam, container_inner_depth, height=None, **kwargs):
    """Decorative pot's inner top diameter + inner depth only — no bottom
    diameter needed. A quicker alternative to size_from_container_inner for
    when you can't easily measure (or estimate) the container's bottom
    opening; the draft angle stays at its default/override value since
    there's no known bottom constraint to auto-steepen against.
    """
    return size_from_container_inner(
        container_top_inner_diam=container_top_inner_diam,
        container_bottom_inner_diam=None,
        container_inner_depth=container_inner_depth,
        height=height,
        **kwargs,
    )


def format_report(spec):
    lines = []
    lines.append(f"Outer top diameter:    {spec['outer_top_diam']:.1f} mm")
    lines.append(f"Outer bottom diameter: {spec['outer_bottom_diam']:.1f} mm")
    lines.append(f"Inner top diameter:    {spec['inner_top_diam']:.1f} mm")
    lines.append(f"Inner bottom diameter: {spec['inner_bottom_diam']:.1f} mm")
    lines.append(f"Height:                {spec['height']:.1f} mm")
    lines.append(f"Usable soil depth:     {spec['usable_depth']:.1f} mm")
    lines.append(f"Wall thickness:        {spec['wall_t']:.2f} mm")
    lines.append(f"Floor thickness:       {spec['floor_t']:.2f} mm")
    lines.append(f"Draft angle:           {spec['draft_deg']:.1f} deg")
    lines.append(f"Drain holes:           {spec['drain_hole_count']} x {spec['drain_hole_diam']:.1f} mm dia")
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
