#!/usr/bin/env python3
"""Dev tool: python3 tools/make_cube_glb.py [out.glb]   (needs numpy)

Generates assets/cube.glb: a 0.6 m weighted storage cube, centered on the origin, Y up, meters.
  * chamfered graphite body (so the edges catch the light)
  * a raised steel plate on each of the six faces (all faces identical, so the cube looks the same however it lands)
  * an orange ring + cross emblem on every plate
  * four dark bolts on every plate
Four materials (body, plate, emblem, bolts), flat shading, no textures. Replace the file with your own model any time: the game auto-fits
whatever is in assets/cube.glb (see CONFIG.models.cube).
"""
import json
import struct
import sys

import numpy as np

H = 0.30            # half size of the whole cube (plates top out here)
BODY_H = 0.29       # body half size (plates add 0.01)
BEVEL = 0.035
PLATE_HALF = 0.185  # plate half width
PLATE_T = 0.005     # plate half thickness
PLATE_BEVEL = 0.007


class Mesh:
    def __init__(self):
        self.pos, self.nrm, self.idx = [], [], []

    def tri(self, a, b, c, n):
        """Add a triangle with flat normal n; the winding is fixed so that it faces along n."""
        a, b, c = map(np.asarray, (a, b, c))
        if np.dot(np.cross(b - a, c - a), n) < 0:
            b, c = c, b
        base = len(self.pos)
        self.pos += [a, b, c]
        self.nrm += [n, n, n]
        self.idx += [base, base + 1, base + 2]

    def quad(self, a, b, c, d, n):
        self.tri(a, b, c, n)
        self.tri(a, c, d, n)

    def arrays(self):
        return (np.array(self.pos, dtype=np.float32), np.array(self.nrm, dtype=np.float32), np.array(self.idx, dtype=np.uint32))


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / np.linalg.norm(v)


def chamfer_box(m, hx, hy, hz, b, center=(0, 0, 0)):
    """Box with chamfered edges and corners, flat shaded, written into mesh m."""
    h = np.array([hx, hy, hz], dtype=np.float64)
    c0 = np.asarray(center, dtype=np.float64)
    E = np.eye(3)
    P = lambda v: c0 + v
    # 6 main faces
    for a in range(3):
        o1, o2 = (a + 1) % 3, (a + 2) % 3
        for s in (-1, 1):
            n = E[a] * s
            pts = []
            for s1, s2 in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                v = np.zeros(3)
                v[a] = s * h[a]
                v[o1] = s1 * (h[o1] - b)
                v[o2] = s2 * (h[o2] - b)
                pts.append(P(v))
            m.quad(*pts, n)
    # 12 edge bevels: between face (a, sa) and face (c, sc), running along the third axis t
    for a in range(3):
        for c in range(a + 1, 3):
            t = 3 - a - c
            for sa in (-1, 1):
                for sc in (-1, 1):
                    n = unit(E[a] * sa + E[c] * sc)
                    pts = []
                    for st in (-1, 1):
                        v1 = np.zeros(3); v1[a] = sa * h[a]; v1[c] = sc * (h[c] - b); v1[t] = st * (h[t] - b)
                        v2 = np.zeros(3); v2[a] = sa * (h[a] - b); v2[c] = sc * h[c]; v2[t] = st * (h[t] - b)
                        pts.append((P(v1), P(v2)))
                    m.quad(pts[0][0], pts[0][1], pts[1][1], pts[1][0], n)
    # 8 corner triangles
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                n = unit([sx, sy, sz])
                v = [np.array([sx * h[0], sy * (h[1] - b), sz * (h[2] - b)]),
                     np.array([sx * (h[0] - b), sy * h[1], sz * (h[2] - b)]),
                     np.array([sx * (h[0] - b), sy * (h[1] - b), sz * h[2]])]
                m.tri(P(v[0]), P(v[1]), P(v[2]), n)


def face_frame(a, s):
    """Right-handed frame (n, u, v) for the face on axis a, sign s: u x v = n."""
    n = np.zeros(3); n[a] = s
    u = np.zeros(3); u[(a + 1) % 3] = 1
    v = np.cross(n, u)
    return n, u, v


def disc_ring(m, n, u, v, center, r0, r1, seg=40):
    """Flat annulus facing n."""
    for i in range(seg):
        a0, a1 = 2 * np.pi * i / seg, 2 * np.pi * (i + 1) / seg
        p = lambda r, a: center + u * (r * np.cos(a)) + v * (r * np.sin(a))
        m.quad(p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1), n)


def disc(m, n, u, v, center, r, seg=14):
    for i in range(seg):
        a0, a1 = 2 * np.pi * i / seg, 2 * np.pi * (i + 1) / seg
        m.tri(center, center + u * (r * np.cos(a0)) + v * (r * np.sin(a0)), center + u * (r * np.cos(a1)) + v * (r * np.sin(a1)), n)


def cylinder(m, n, u, v, center, r, height, seg=12):
    """Short cylinder standing on the face (axis n): cap + side."""
    top = center + n * height
    disc(m, n, u, v, top, r, seg)
    for i in range(seg):
        a0, a1 = 2 * np.pi * i / seg, 2 * np.pi * (i + 1) / seg
        d0 = u * np.cos(a0) + v * np.sin(a0)
        d1 = u * np.cos(a1) + v * np.sin(a1)
        nn = unit(d0 + d1)
        m.quad(center + d0 * r, center + d1 * r, top + d1 * r, top + d0 * r, nn)


def build():
    body, plate, emblem, bolts = Mesh(), Mesh(), Mesh(), Mesh()
    chamfer_box(body, BODY_H, BODY_H, BODY_H, BEVEL)
    for a in range(3):
        for s in (-1, 1):
            n, u, v = face_frame(a, s)
            # plate: a thin chamfered slab sitting on the face
            hx = [PLATE_HALF if i != a else PLATE_T for i in range(3)]
            center = n * (BODY_H + PLATE_T)
            chamfer_box(plate, hx[0], hx[1], hx[2], PLATE_BEVEL, center=center)
            top = n * (BODY_H + 2 * PLATE_T) + n * 0.0005
            # emblem: ring + cross
            disc_ring(emblem, n, u, v, top, 0.085, 0.108)
            w = 0.011                                   # cross bars inside the ring
            for ax_u, ax_v in ((u, v), (v, u)):
                p = lambda du, dv: top + ax_u * du + ax_v * dv
                emblem.quad(p(-0.07, -w), p(0.07, -w), p(0.07, w), p(-0.07, w), n)
            # bolts
            for su in (-1, 1):
                for sv in (-1, 1):
                    cylinder(bolts, n, u, v, n * (BODY_H + 2 * PLATE_T) + u * su * 0.145 + v * sv * 0.145, 0.014, 0.006)
    return body, plate, emblem, bolts


def write_glb(path, meshes, materials):
    blob = bytearray()
    views, accessors, prims = [], [], []

    def add_view(data, target):
        while len(blob) % 4:
            blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data), 'target': target})
        blob.extend(data)
        return len(views) - 1

    for mesh, mat in zip(meshes, range(len(meshes))):
        pos, nrm, idx = mesh.arrays()
        assert idx.max() < len(pos) and len(idx) % 3 == 0
        pa = len(accessors); accessors.append({'bufferView': add_view(pos.tobytes(), 34962), 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()})
        na = len(accessors); accessors.append({'bufferView': add_view(nrm.tobytes(), 34962), 'componentType': 5126, 'count': len(nrm), 'type': 'VEC3'})
        small = len(pos) < 65535
        ia = len(accessors); accessors.append({'bufferView': add_view(idx.astype(np.uint16 if small else np.uint32).tobytes(), 34963), 'componentType': 5123 if small else 5125, 'count': len(idx), 'type': 'SCALAR'})
        prims.append({'attributes': {'POSITION': pa, 'NORMAL': na}, 'indices': ia, 'material': mat, 'mode': 4})
    while len(blob) % 4:
        blob.append(0)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'PortalLab tools/make_cube_glb.py'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': 'cube', 'mesh': 0}],
        'meshes': [{'name': 'weighted_cube', 'primitives': prims}],
        'materials': materials,
        'accessors': accessors, 'bufferViews': views,
        'buffers': [{'byteLength': len(blob)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(blob)
    return total


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'assets/cube.glb'
    body, plate, emblem, bolts = build()
    mats = [
        {'name': 'cube_body', 'pbrMetallicRoughness': {'baseColorFactor': [0.30, 0.32, 0.35, 1], 'metallicFactor': 0.55, 'roughnessFactor': 0.50}},
        {'name': 'cube_plate', 'pbrMetallicRoughness': {'baseColorFactor': [0.62, 0.65, 0.69, 1], 'metallicFactor': 0.60, 'roughnessFactor': 0.38}},
        {'name': 'cube_emblem', 'pbrMetallicRoughness': {'baseColorFactor': [1.0, 0.45, 0.07, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.55}, 'emissiveFactor': [0.55, 0.20, 0.02]},
        {'name': 'cube_bolts', 'pbrMetallicRoughness': {'baseColorFactor': [0.07, 0.075, 0.08, 1], 'metallicFactor': 0.8, 'roughnessFactor': 0.45}},
    ]
    size = write_glb(out, [body, plate, emblem, bolts], mats)
    tri = sum(len(m.idx) // 3 for m in (body, plate, emblem, bolts))
    print(f'wrote {out}: {size} bytes, {tri} triangles')


if __name__ == '__main__':
    main()
