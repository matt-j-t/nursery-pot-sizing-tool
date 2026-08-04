"""Derive a decorative pot's INNER cavity profile (top diameter, bottom
diameter, depth) from an uploaded STL, so the nursery-pot calculator can
work from real geometry instead of hand-measured numbers.

Approach (no mesh-boolean/CAD library available): slice the mesh with
horizontal planes and look at the radii (from the pot's central axis) of
all triangle-edge/plane intersection points at each height. For a round
shell with a hollow interior, a slice through the wall region produces
intersection points clustering at two radii — an inner ring (the cavity
wall) and an outer ring (the outside surface). Taking min(r) / max(r) at
each height recovers the inner/outer profile without needing full
polygon-loop reconstruction.

This is a best-effort heuristic tuned for typical single-body, roughly
axisymmetric planter/pot meshes (round or slightly faceted, no handles).
Verify results against the model with a tape measure/calipers on a real
part when in doubt.
"""
import numpy as np
from stl_io import read_stl


def _edges_from_triangles(triangles):
    e1 = triangles[:, [0, 1], :]
    e2 = triangles[:, [1, 2], :]
    e3 = triangles[:, [2, 0], :]
    return np.concatenate([e1, e2, e3], axis=0)  # (3T, 2, 3)


def plane_intersection_points(edges, z, eps=1e-9):
    z1 = edges[:, 0, 2]
    z2 = edges[:, 1, 2]
    crosses = ((z1 - z) * (z2 - z)) < 0
    denom = z2 - z1
    denom_ok = np.abs(denom) > eps
    mask = crosses & denom_ok
    if not np.any(mask):
        return np.zeros((0, 3))
    p1 = edges[mask, 0, :]
    p2 = edges[mask, 1, :]
    t = (z - p1[:, 2]) / (p2[:, 2] - p1[:, 2])
    pts = p1 + t[:, None] * (p2 - p1)
    return pts


def analyze_decorative_pot(path_or_triangles, top_offset=3.0, n_scan=80,
                            spread_threshold=1.5, axis_xy=None):
    """Returns dict with derived inner cavity dimensions + diagnostics."""
    if isinstance(path_or_triangles, str):
        tris = read_stl(path_or_triangles)
    else:
        tris = path_or_triangles

    pts_all = tris.reshape(-1, 3)
    bbox_min = pts_all.min(axis=0)
    bbox_max = pts_all.max(axis=0)
    z_min, z_max = bbox_min[2], bbox_max[2]

    if axis_xy is None:
        cx = (bbox_min[0] + bbox_max[0]) / 2.0
        cy = (bbox_min[1] + bbox_max[1]) / 2.0
    else:
        cx, cy = axis_xy

    edges = _edges_from_triangles(tris)

    def radii_at(z):
        p = plane_intersection_points(edges, z)
        if len(p) == 0:
            return np.zeros((0,))
        return np.sqrt((p[:, 0] - cx) ** 2 + (p[:, 1] - cy) ** 2)

    height_total = z_max - z_min
    warnings = []
    if height_total <= 0:
        raise ValueError("Mesh has zero height — check the file.")

    # 1) Top opening (inner rim) — sample a touch below the very top edge
    top_slice_z = z_max - min(top_offset, height_total * 0.05)
    r_top = radii_at(top_slice_z)
    if len(r_top) < 6:
        warnings.append("Very few intersection points near the rim — top diameter may be unreliable.")
        inner_top_r = float(np.max(r_top)) if len(r_top) else 0.0
    else:
        inner_top_r = float(np.min(r_top))
    outer_top_r = float(np.max(r_top)) if len(r_top) else 0.0

    # 2) Scan downward to find where the hollow cavity ends (the pot's own
    # floor). In the hollow wall region a slice crosses BOTH the inner and
    # outer surfaces, so intersection radii form two clusters spread apart
    # by roughly the container's wall thickness. Once the floor is reached
    # only the outer surface remains, so min/max radius collapse together
    # (spread ~0, just polygon-approximation noise). We detect the height
    # where that spread collapses, scanning from the rim down.
    scan_zs = np.linspace(top_slice_z, z_min + height_total * 0.02, n_scan)
    floor_z = None
    inner_r_profile = []
    consecutive_collapsed = 0
    collapse_start_z = None
    for z in scan_zs:
        r = radii_at(z)
        if len(r) < 6:
            inner_r_profile.append((z, None, None))
            continue
        rmin = float(np.min(r))
        rmax = float(np.max(r))
        spread = rmax - rmin
        inner_r_profile.append((z, rmin, spread))
        if spread < spread_threshold:
            if consecutive_collapsed == 0:
                collapse_start_z = z
            consecutive_collapsed += 1
            if consecutive_collapsed >= 2 and floor_z is None:
                floor_z = collapse_start_z
        else:
            if floor_z is None:
                consecutive_collapsed = 0
                collapse_start_z = None

    if floor_z is None:
        warnings.append(
            "Could not clearly detect the decorative pot's internal floor — "
            "falling back to the lowest scanned slice. Depth/bottom-diameter numbers need a sanity check."
        )
        floor_z = z_min + height_total * 0.05

    # 3) Bottom-of-cavity inner diameter — sample just above the detected floor
    bottom_slice_z = min(floor_z + height_total * 0.03, top_slice_z - height_total * 0.02)
    r_bottom = radii_at(bottom_slice_z)
    if len(r_bottom) < 6:
        warnings.append("Few intersection points just above the floor — bottom diameter may be unreliable.")
        inner_bottom_r = inner_top_r * 0.7  # crude fallback
    else:
        inner_bottom_r = float(np.min(r_bottom))

    inner_depth = z_max - floor_z

    result = {
        "container_top_inner_diam": 2 * inner_top_r,
        "container_bottom_inner_diam": 2 * inner_bottom_r,
        "container_inner_depth": float(inner_depth),
        "container_outer_top_diam": 2 * outer_top_r,
        "axis_xy": (cx, cy),
        "z_min": float(z_min),
        "z_max": float(z_max),
        "floor_z": float(floor_z),
        "top_slice_z": float(top_slice_z),
        "bottom_slice_z": float(bottom_slice_z),
        "inner_r_profile": inner_r_profile,
        "warnings": warnings,
    }
    return result


def format_analysis_report(result):
    lines = []
    lines.append(f"Detected inner top diameter:    {result['container_top_inner_diam']:.1f} mm")
    lines.append(f"Detected inner bottom diameter: {result['container_bottom_inner_diam']:.1f} mm")
    lines.append(f"Detected inner depth:           {result['container_inner_depth']:.1f} mm")
    lines.append(f"(outer top diameter for reference: {result['container_outer_top_diam']:.1f} mm)")
    if result["warnings"]:
        lines.append("")
        lines.append("WARNINGS:")
        for w in result["warnings"]:
            lines.append(f"  ! {w}")
    return "\n".join(lines)
