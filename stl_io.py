"""Minimal binary STL writer/reader — no external mesh libraries required.

Triangles are represented as an (N, 3, 3) float64 numpy array:
    triangles[i] = [[x0,y0,z0], [x1,y1,z1], [x2,y2,z2]]
Winding order (right-hand rule) determines the outward normal — callers
are responsible for consistent CCW winding as seen from outside the solid.
"""
import struct
import numpy as np


def compute_normals(triangles):
    v0 = triangles[:, 1, :] - triangles[:, 0, :]
    v1 = triangles[:, 2, :] - triangles[:, 0, :]
    n = np.cross(v0, v1)
    lengths = np.linalg.norm(n, axis=1)
    lengths[lengths == 0] = 1.0
    return n / lengths[:, None]


def write_binary_stl(path, triangles, header=b"nursery pot generator"):
    """triangles: (N,3,3) float64 array."""
    triangles = np.asarray(triangles, dtype=np.float64)
    n_tri = triangles.shape[0]
    normals = compute_normals(triangles)
    with open(path, "wb") as f:
        hdr = header[:80]
        hdr = hdr + b" " * (80 - len(hdr))
        f.write(hdr)
        f.write(struct.pack("<I", n_tri))
        for i in range(n_tri):
            f.write(struct.pack("<3f", *normals[i]))
            for j in range(3):
                f.write(struct.pack("<3f", *triangles[i, j]))
            f.write(struct.pack("<H", 0))


def read_binary_stl(path):
    with open(path, "rb") as f:
        header = f.read(80)
        n_tri = struct.unpack("<I", f.read(4))[0]
        tris = np.zeros((n_tri, 3, 3), dtype=np.float64)
        for i in range(n_tri):
            f.read(12)  # normal, recompute ourselves
            for j in range(3):
                tris[i, j] = struct.unpack("<3f", f.read(12))
            f.read(2)
    return tris


def read_ascii_stl(path):
    verts = []
    tri = []
    with open(path, "r", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith("vertex"):
                parts = line.split()
                tri.append([float(parts[1]), float(parts[2]), float(parts[3])])
                if len(tri) == 3:
                    verts.append(tri)
                    tri = []
    return np.array(verts, dtype=np.float64)


def read_stl(path):
    """Auto-detect binary vs ASCII and return (N,3,3) triangle array."""
    with open(path, "rb") as f:
        head = f.read(5)
    if head == b"solid":
        # could still be binary (some exporters wrongly prefix "solid"); check file size
        try:
            tris = read_ascii_stl(path)
            if len(tris) > 0:
                return tris
        except Exception:
            pass
    return read_binary_stl(path)


def mesh_stats(triangles):
    """Rough sanity stats: bounding box, and boundary-edge count (edges used
    by exactly one triangle => open boundary, e.g. an intentional open rim)."""
    triangles = np.asarray(triangles)
    pts = triangles.reshape(-1, 3)
    bbox_min = pts.min(axis=0)
    bbox_max = pts.max(axis=0)

    edge_count = {}
    for tri in triangles:
        for a, b in [(0, 1), (1, 2), (2, 0)]:
            p1 = tuple(np.round(tri[a], 4))
            p2 = tuple(np.round(tri[b], 4))
            key = tuple(sorted([p1, p2]))
            edge_count[key] = edge_count.get(key, 0) + 1
    boundary_edges = sum(1 for v in edge_count.values() if v == 1)
    nonmanifold_edges = sum(1 for v in edge_count.values() if v > 2)
    return {
        "n_triangles": len(triangles),
        "bbox_min": bbox_min,
        "bbox_max": bbox_max,
        "size": bbox_max - bbox_min,
        "boundary_edges": boundary_edges,
        "nonmanifold_edges": nonmanifold_edges,
    }
