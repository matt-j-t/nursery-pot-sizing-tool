"""Assembles a full nursery-pot triangle mesh from a calculator spec dict."""
import math
import numpy as np

import geometry as geo
from stl_io import write_binary_stl, mesh_stats


def build_pot_mesh(spec):
    n = spec["n_seg"]
    n_hole = 16

    R_top_outer = spec["outer_top_diam"] / 2.0
    R_bottom_outer = spec["outer_bottom_diam"] / 2.0
    R_outer_floor_top = spec["outer_diam_at_floor_top"] / 2.0
    R_top_inner = spec["inner_top_diam"] / 2.0
    R_inner_floor_top = spec["inner_bottom_diam"] / 2.0
    H = spec["height"]
    floor_t = spec["floor_t"]

    pieces = []

    # 1) Outer wall lateral surface, full height z=0..H (continuous taper,
    #    covers both the floor's outer skin and the cavity wall above it)
    ring_bottom_outer = geo.ring3(R_bottom_outer, 0.0, n)
    ring_top_outer = geo.ring3(R_top_outer, H, n)
    pieces.append(geo.quad_strip(ring_bottom_outer, ring_top_outer, outward=True))

    # 2) Inner wall lateral surface, z=floor_t..H (cavity wall only)
    ring_bottom_inner = geo.ring3(R_inner_floor_top, floor_t, n)
    ring_top_inner = geo.ring3(R_top_inner, H, n)
    pieces.append(geo.quad_strip(ring_bottom_inner, ring_top_inner, outward=False))

    # 3) Top rim cap (flat washer between outer-top and inner-top rings)
    pieces.append(geo.annulus_cap(R_top_outer, R_top_inner, H, n, facing_up=True))

    # 4) Drainage holes: hole centers on a bolt circle
    n_holes = spec["drain_hole_count"]
    hole_centers = []
    if n_holes > 0:
        bolt_r = spec["drain_hole_bolt_circle_diam"] / 2.0
        for i in range(n_holes):
            a = 2 * math.pi * i / n_holes
            hole_centers.append((bolt_r * math.cos(a), bolt_r * math.sin(a)))
        hole_r = spec["drain_hole_diam"] / 2.0

    # 5) Bottom cap (z=0, outer radius R_bottom_outer, holes cut in, facing down)
    if n_holes > 0:
        pieces.append(geo.disc_with_holes_3d(R_bottom_outer, hole_centers, hole_r, 0.0, n_outer=n, n_hole=n_hole, facing_up=False))
    else:
        pieces.append(geo.flat_disc_fan(R_bottom_outer, 0.0, n, facing_up=False))

    # 6) Floor-top cap (z=floor_t, outer radius R_inner_floor_top, holes cut in, facing up)
    if n_holes > 0:
        pieces.append(geo.disc_with_holes_3d(R_inner_floor_top, hole_centers, hole_r, floor_t, n_outer=n, n_hole=n_hole, facing_up=True))
    else:
        pieces.append(geo.flat_disc_fan(R_inner_floor_top, floor_t, n, facing_up=True))

    # 7) Hole tunnel walls connecting the two caps
    if n_holes > 0:
        pieces.append(geo.hole_tunnel_walls(hole_centers, hole_r, 0.0, floor_t, n_hole=n_hole))

    # 8) Feet (separate watertight standoffs below z=0)
    n_feet = spec["feet_count"]
    if n_feet > 0:
        foot_r = spec["feet_diam"] / 2.0
        foot_h = spec["feet_height"]
        bolt_r_feet = spec["feet_bolt_circle_diam"] / 2.0
        for i in range(n_feet):
            a = 2 * math.pi * i / n_feet
            cx, cy = bolt_r_feet * math.cos(a), bolt_r_feet * math.sin(a)
            pieces.append(geo.cylinder_solid(foot_r, -foot_h, 0.0, n=20, cx=cx, cy=cy))

    all_tris = np.concatenate(pieces, axis=0)
    return all_tris


def build_and_export(spec, path):
    tris = build_pot_mesh(spec)
    write_binary_stl(path, tris)
    return mesh_stats(tris), tris
