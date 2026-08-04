"""Pure-numpy mesh construction primitives for a round, tapered nursery pot.

No CAD/boolean library is available in this environment, so the model is
built as a single watertight solid via careful ring/cap construction
(equivalent to a lathe "revolve" profile) rather than boolean subtraction.
Drainage holes are built directly into the floor caps (ear-clipped polygon
with holes) rather than cut afterward. Feet are separate small watertight
solids that sit flush against the underside — standard practice for
script-generated printable parts (no true CSG union needed since the
faces only touch, they don't interpenetrate).

All angles in radians internally; degrees accepted at the public API edges.
"""
import numpy as np

TWO_PI = 2 * np.pi


# ---------------------------------------------------------------------------
# Basic point/ring helpers
# ---------------------------------------------------------------------------

def circle_xy(radius, n, cx=0.0, cy=0.0):
    """CCW ordered (n,2) points around a circle, angle 0 at +x axis."""
    ang = np.linspace(0, TWO_PI, n, endpoint=False)
    x = cx + radius * np.cos(ang)
    y = cy + radius * np.sin(ang)
    return np.stack([x, y], axis=1)


def ring3(radius, z, n, cx=0.0, cy=0.0):
    xy = circle_xy(radius, n, cx, cy)
    z_col = np.full((n, 1), z)
    return np.concatenate([xy, z_col], axis=1)


def quad_strip(ring_a, ring_b, outward=True):
    """Lateral (side) surface triangles connecting two same-length rings.
    outward=True => normals point away from the shared axis (e.g. outer
    pot wall); outward=False => normals point toward the axis (e.g. inner
    pot wall or a hole's own wall)."""
    n = len(ring_a)
    tris = []
    for i in range(n):
        j = (i + 1) % n
        a0, a1 = ring_a[i], ring_a[j]
        b0, b1 = ring_b[i], ring_b[j]
        if outward:
            tris.append([a0, a1, b1])
            tris.append([a0, b1, b0])
        else:
            tris.append([a0, b1, a1])
            tris.append([a0, b0, b1])
    return np.array(tris)


def flat_disc_fan(radius, z, n, cx=0.0, cy=0.0, facing_up=True):
    """Simple fan-triangulated flat disc (no holes)."""
    ring = ring3(radius, z, n, cx, cy)
    center = np.array([cx, cy, z])
    tris = []
    for i in range(n):
        j = (i + 1) % n
        if facing_up:
            tris.append([center, ring[i], ring[j]])
        else:
            tris.append([center, ring[j], ring[i]])
    return np.array(tris)


def annulus_cap(r_outer, r_inner, z, n, facing_up=True):
    """Flat washer-shaped cap (e.g. the pot's top rim edge). Note: for a
    flat ring at constant z with increasing radius, quad_strip's
    outward=True actually yields a -z (down) normal (its winding
    convention was derived for radius-vs-z lateral walls, not
    radius-vs-radius flats) — so this is intentionally inverted relative
    to quad_strip's usual meaning. Verified against signed_volume tests."""
    outer = ring3(r_outer, z, n)
    inner = ring3(r_inner, z, n)
    return quad_strip(inner, outer, outward=(not facing_up))


# ---------------------------------------------------------------------------
# Ear-clipping triangulation for a polygon with circular holes (2D)
# ---------------------------------------------------------------------------

def _signed_area(pts):
    x = pts[:, 0]
    y = pts[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def _cross_z(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _point_in_tri(p, a, b, c, eps):
    d1 = _cross_z(a, b, p)
    d2 = _cross_z(b, c, p)
    d3 = _cross_z(c, a, p)
    has_neg = (d1 < -eps) or (d2 < -eps) or (d3 < -eps)
    has_pos = (d1 > eps) or (d2 > eps) or (d3 > eps)
    return not (has_neg and has_pos)


def ear_clip(poly_pts):
    """poly_pts: (n,2) array, any orientation. Returns list of index
    triples (into poly_pts) forming a triangulation. Tolerant of the
    coincident duplicate vertices produced by hole-bridging."""
    pts = np.asarray(poly_pts, dtype=np.float64)
    idx = list(range(len(pts)))
    if _signed_area(pts) < 0:
        idx = idx[::-1]

    span = max(np.ptp(pts[:, 0]), np.ptp(pts[:, 1]), 1.0)
    eps_area = span * span * 1e-9
    eps_dup = span * 1e-7

    triangles = []
    guard = 0
    max_guard = len(idx) ** 2 + 100
    while len(idx) > 3 and guard < max_guard:
        guard += 1
        n = len(idx)
        found = False
        for k in range(n):
            i0, i1, i2 = idx[(k - 1) % n], idx[k], idx[(k + 1) % n]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if _cross_z(a, b, c) <= eps_area:
                continue  # reflex or degenerate
            ok = True
            for m in idx:
                if m in (i0, i1, i2):
                    continue
                pm = pts[m]
                # skip points coincident with a triangle vertex (bridge dupes)
                if (np.linalg.norm(pm - a) < eps_dup or
                        np.linalg.norm(pm - b) < eps_dup or
                        np.linalg.norm(pm - c) < eps_dup):
                    continue
                if _point_in_tri(pm, a, b, c, eps_area):
                    ok = False
                    break
            if ok:
                triangles.append((i0, i1, i2))
                idx.pop(k)
                found = True
                break
        if not found:
            break  # numerical fallback: leave remainder untriangulated
    if len(idx) == 3:
        a, b, c = pts[idx[0]], pts[idx[1]], pts[idx[2]]
        if _cross_z(a, b, c) > 0:
            triangles.append((idx[0], idx[1], idx[2]))
    return triangles, pts


def _bridge_hole(boundary, hole):
    """Merge one hole polygon into the boundary polygon via nearest-vertex
    bridge (standard technique for turning polygon-with-hole into a
    simple polygon before ear clipping)."""
    b = np.asarray(boundary)
    h = np.asarray(hole)
    d = np.linalg.norm(b[:, None, :] - h[None, :, :], axis=2)
    i, j = np.unravel_index(np.argmin(d), d.shape)
    new_boundary = (
        list(boundary[: i + 1])
        + list(hole[j:])
        + list(hole[: j + 1])
        + list(boundary[i:])
    )
    return new_boundary


def disc_with_holes_2d(outer_radius, hole_centers, hole_radius, n_outer=48, n_hole=14):
    """Returns (triangles_idx, pts) for a disc of outer_radius centered at
    origin, minus circular holes at hole_centers (list of (x,y)) with
    hole_radius. Triangulation only — caller lifts to 3D + orients."""
    outer = list(map(tuple, circle_xy(outer_radius, n_outer)))
    boundary = outer
    for (hx, hy) in hole_centers:
        hole = list(map(tuple, circle_xy(hole_radius, n_hole, hx, hy)))
        hole = hole[::-1]  # CW so it reads as a hole against CCW boundary
        boundary = _bridge_hole(boundary, hole)
    tri_idx, pts = ear_clip(np.array(boundary))
    return tri_idx, pts


def disc_with_holes_3d(outer_radius, hole_centers, hole_radius, z, n_outer=48, n_hole=14, facing_up=True):
    tri_idx, pts = disc_with_holes_2d(outer_radius, hole_centers, hole_radius, n_outer, n_hole)
    tris = []
    for (i0, i1, i2) in tri_idx:
        p0 = np.array([pts[i0][0], pts[i0][1], z])
        p1 = np.array([pts[i1][0], pts[i1][1], z])
        p2 = np.array([pts[i2][0], pts[i2][1], z])
        if facing_up:
            tris.append([p0, p1, p2])
        else:
            tris.append([p0, p2, p1])
    return np.array(tris)


def hole_tunnel_walls(hole_centers, hole_radius, z0, z1, n_hole=14):
    """Vertical tube wall for each drainage hole, normal pointing inward
    (into the void), connecting the bottom cap opening to the top-of-floor
    cap opening."""
    all_tris = []
    for (hx, hy) in hole_centers:
        ring_a = ring3(hole_radius, z0, n_hole, hx, hy)
        ring_b = ring3(hole_radius, z1, n_hole, hx, hy)
        all_tris.append(quad_strip(ring_a, ring_b, outward=False))
    return np.concatenate(all_tris, axis=0)


def cylinder_solid(radius, z0, z1, n=24, cx=0.0, cy=0.0, top_radius=None):
    """Standalone watertight cylinder (or frustum if top_radius given) —
    used for feet. z1 > z0."""
    r0 = radius
    r1 = radius if top_radius is None else top_radius
    ring_a = ring3(r0, z0, n, cx, cy)
    ring_b = ring3(r1, z1, n, cx, cy)
    side = quad_strip(ring_a, ring_b, outward=True)
    bottom = flat_disc_fan(r0, z0, n, cx, cy, facing_up=False)
    top = flat_disc_fan(r1, z1, n, cx, cy, facing_up=True)
    return np.concatenate([side, bottom, top], axis=0)


def signed_volume(triangles):
    """Sum of signed tetrahedron volumes (divergence theorem). Positive
    for a closed mesh with consistent outward-facing normals."""
    v0 = triangles[:, 0, :]
    v1 = triangles[:, 1, :]
    v2 = triangles[:, 2, :]
    return np.sum(np.einsum("ij,ij->i", v0, np.cross(v1, v2))) / 6.0
