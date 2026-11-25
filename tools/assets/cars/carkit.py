import math

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

PALETTE = {
    "body": {"color": "#9a9c9e", "roughness": 0.45, "metallic": 0.08},
    "accent": {"color": "#e4dfcf", "roughness": 0.5, "metallic": 0.05},
    "glass": {"color": "#1a2026", "roughness": 0.08, "metallic": 0.2, "alpha": 0.5},
    "window_dark": {"color": "#12161a", "roughness": 0.1, "metallic": 0.2},
    "trim_black": {"color": "#1c1f1e", "roughness": 0.68, "metallic": 0.0},
    "chrome": {"color": "#c4cac6", "roughness": 0.28, "metallic": 0.85},
    "underbody": {"color": "#121615", "roughness": 1.0, "metallic": 0.0},
    "interior": {"color": "#3b342c", "roughness": 0.92, "metallic": 0.0, "double": True},
    "seat": {"color": "#5a4a3a", "roughness": 0.88, "metallic": 0.0},
    "tyre": {"color": "#1d1e1d", "roughness": 0.95, "metallic": 0.0},
    "rim": {"color": "#b9bfc2", "roughness": 0.34, "metallic": 0.8},
    "rim_white": {"color": "#e6e4da", "roughness": 0.5, "metallic": 0.1},
    "rim_dark": {"color": "#2a2d2e", "roughness": 0.6, "metallic": 0.3},
    "lens_head": {"color": "#e9ece6", "roughness": 0.16, "metallic": 0.1},
    "lens_tail": {"color": "#8f1612", "roughness": 0.22, "metallic": 0.0},
    "lens_amber": {"color": "#d8861c", "roughness": 0.25, "metallic": 0.0},
    "lens_clear": {"color": "#dfe3e0", "roughness": 0.2, "metallic": 0.1},
    "plate": {"color": "#edebdb", "roughness": 0.5, "metallic": 0.0},
}

BAND_LAYOUT = (
    ("floor", 2),
    ("sill", 3),
    ("side", 5),
    ("shoulder", 3),
    ("waistframe", 1),
    ("upper", 3),
    ("railframe", 1),
    ("rail", 3),
    ("topframe", 1),
    ("topwall", 1),
    ("top", 3),
)

STATION_DEFAULTS = {
    "tuck": 0.045,
    "shoulder": 0.03,
    "sill_radius": 0.06,
    "shoulder_radius": 0.035,
    "roof_radius": 0.06,
    "frame": 0.04,
    "top_frame": 0.045,
    "barrel": 0.012,
    "drop": 0.0,
    "bow": 0.0,
    "crown": 0.0,
}


def linear(hex_color):
    channels = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]


def monotone_curve(xs, ys):
    xs = np.asarray(xs, dtype=float)
    ys = np.asarray(ys, dtype=float)
    steps = np.diff(xs)
    slopes = np.diff(ys) / steps
    tangents = np.zeros_like(ys)
    tangents[0] = slopes[0]
    tangents[-1] = slopes[-1]
    for i in range(1, len(xs) - 1):
        if slopes[i - 1] * slopes[i] > 0:
            first = 2 * steps[i] + steps[i - 1]
            second = steps[i] + 2 * steps[i - 1]
            tangents[i] = (first + second) / (first / slopes[i - 1] + second / slopes[i])

    def evaluate(x):
        x = min(max(x, xs[0]), xs[-1])
        i = int(min(max(np.searchsorted(xs, x) - 1, 0), len(xs) - 2))
        h = steps[i]
        t = (x - xs[i]) / h
        return float(
            (2 * t**3 - 3 * t**2 + 1) * ys[i]
            + (t**3 - 2 * t**2 + t) * h * tangents[i]
            + (-2 * t**3 + 3 * t**2) * ys[i + 1]
            + (t**3 - t**2) * h * tangents[i + 1]
        )

    return evaluate


class Loft:
    def __init__(self, stations, defaults=None):
        base = dict(STATION_DEFAULTS)
        base.update(defaults or {})
        resolved = []
        for station in stations:
            row = dict(base)
            row.update(station)
            if "inner" not in row:
                radius = self.roof_radius(row)
                row["inner"] = row["edge"] - radius - row["top_frame"]
            resolved.append(row)
        self.stations = resolved
        self.front = resolved[0]["s"]
        self.rear = resolved[-1]["s"]
        positions = [row["s"] for row in resolved]
        self.curves = {
            key: monotone_curve(positions, [row[key] for row in resolved])
            for key in resolved[0]
            if key != "s"
        }

    @staticmethod
    def roof_radius(row):
        return max(0.004, min(row["roof_radius"], (row["top"] - row["belt"]) * 0.45))

    def params(self, s):
        return {key: curve(s) for key, curve in self.curves.items()}

    def warp(self, x, s):
        p = self.params(s)
        return s + p["bow"] * (x / p["half"]) ** 2

    def ring(self, s):
        p = self.params(s)
        half, floor, belt, edge, top = p["half"], p["floor"], p["belt"], p["edge"], p["top"]
        points = []
        sill_radius = min(p["sill_radius"], (belt - floor) * 0.4)
        sill_x = half - p["tuck"]
        for t in (0.0, 0.5, 1.0):
            points.append((t * (sill_x - sill_radius), floor))
        for k in (1, 2, 3):
            angle = k / 3 * math.pi / 2
            points.append(
                (
                    sill_x - sill_radius + sill_radius * math.sin(angle),
                    floor + sill_radius - sill_radius * math.cos(angle),
                )
            )
        shoulder_radius = min(p["shoulder_radius"], (belt - floor) * 0.3)
        low = floor + sill_radius
        high = belt - shoulder_radius
        for k in range(1, 6):
            t = k / 5
            points.append((sill_x + p["tuck"] * (1 - (1 - t) ** 2.2), low + (high - low) * t))
        inset = p["shoulder"]
        for k in (1, 2, 3):
            angle = k / 3 * math.pi / 2
            points.append(
                (half - inset + inset * math.cos(angle), high + shoulder_radius * math.sin(angle))
            )
        roof_radius = self.roof_radius(p)
        base = np.array([half - inset, belt])
        peak = np.array([edge, top - roof_radius])
        length = float(np.linalg.norm(peak - base))
        frame = min(p["frame"], length * 0.25) / max(length, 1e-6)
        bulge = p["barrel"] * min(1.0, length / 0.3)
        for t in (frame, frame + (1 - 2 * frame) / 3, frame + 2 * (1 - 2 * frame) / 3, 1 - frame, 1.0):
            spot = base + (peak - base) * t
            points.append((float(spot[0]) + bulge * 4 * t * (1 - t), float(spot[1])))
        for k in (1, 2, 3):
            angle = k / 3 * math.pi / 2
            points.append(
                (
                    edge - roof_radius + roof_radius * math.cos(angle),
                    top - roof_radius + roof_radius * math.sin(angle),
                )
            )
        span = max(edge - roof_radius, 1e-4)
        drop = p["drop"]
        dropping = min(1.0, drop / 0.05)
        crown = p["crown"]

        def roof(x):
            return top + crown * (1 - (x / span) ** 2)

        first = min(p["inner"], span - 0.005)
        second = first * (1 - 0.25 * (1 - dropping))
        points.append((first, roof(first)))
        for x in (second, second * 2 / 3, second / 3, 0.0):
            points.append((x, top + crown * (1 - dropping) * (1 - (x / span) ** 2) - drop))
        return points


def band_names():
    names = []
    for name, count in BAND_LAYOUT:
        names.extend([name] * count)
    return names


def sample_positions(loft, rules, extra, max_step):
    marks = {round(row["s"], 5) for row in loft.stations}
    for rule in rules:
        marks.add(round(rule["from"], 5))
        marks.add(round(rule["to"], 5))
    for value in extra:
        marks.add(round(value, 5))
    marks = sorted(mark for mark in marks if loft.front <= mark <= loft.rear)
    positions = []
    for start, end in zip(marks, marks[1:]):
        count = max(1, math.ceil((end - start) / max_step - 1e-6))
        for k in range(count):
            positions.append(start + (end - start) * k / count)
    positions.append(marks[-1])
    return positions


class Model:
    def __init__(self, name):
        self.name = name
        self.groups = {}
        self.materials = list(PALETTE)
        self.loft = None
        self.tree = None
        self.arches = []
        self.wheels = []

    def group(self, name):
        return self.groups.setdefault(name, {"verts": [], "faces": [], "materials": []})

    def absorb(self, bm, material, group="Body", mirror=False):
        target = self.group(group)
        for flip in (False, True) if mirror else (False,):
            offset = len(target["verts"])
            for vert in bm.verts:
                co = vert.co
                target["verts"].append((-co.x if flip else co.x, co.y, co.z))
            bm.verts.index_update()
            for face in bm.faces:
                indices = [offset + vert.index for vert in face.verts]
                target["faces"].append(indices[::-1] if flip else indices)
                target["materials"].append(
                    material if isinstance(material, str) else material[face.material_index]
                )
        bm.free()

    def absorb_raw(self, verts, faces, material, group="Body", mirror=False):
        target = self.group(group)
        for flip in (False, True) if mirror else (False,):
            offset = len(target["verts"])
            for x, y, z in verts:
                target["verts"].append((-x if flip else x, y, z))
            for face in faces:
                indices = [offset + i for i in face]
                target["faces"].append(indices[::-1] if flip else indices)
                target["materials"].append(material)

    def build_shell(self, loft, rules, arches, max_step=0.075, cap_rings=(0.74, 0.48, 0.22), extra=()):
        self.loft = loft
        self.arches = arches
        names = band_names()
        full_bands = names + names[::-1]
        positions = sample_positions(loft, rules, extra, max_step)
        bm = bmesh.new()
        rings = []
        for s in positions:
            half = loft.ring(s)
            full = half + [(-x, z) for x, z in half[-2:0:-1]]
            rings.append([bm.verts.new((x, s, z)) for x, z in full])
        count = len(rings[0])

        def material_for(band, s):
            for rule in rules:
                if band in rule["bands"] and rule["from"] - 1e-6 <= s <= rule["to"] + 1e-6:
                    return rule["material"]
            return "underbody" if band == "floor" else "body"

        for j in range(len(rings) - 1):
            middle = (positions[j] + positions[j + 1]) / 2
            for k in range(count):
                corners = [
                    rings[j][k],
                    rings[j][(k + 1) % count],
                    rings[j + 1][(k + 1) % count],
                    rings[j + 1][k],
                ]
                if len({tuple(round(c, 6) for c in vert.co) for vert in corners}) < 4:
                    continue
                face = bm.faces.new(corners)
                face.material_index = self.materials.index(material_for(full_bands[k], middle))
        body_index = self.materials.index("body")
        for ring, end in ((rings[0], positions[0]), (rings[-1], positions[-1])):
            heights = [vert.co.z for vert in ring]
            middle = (min(heights) + max(heights)) / 2
            outer = ring
            for shrink in cap_rings:
                inner = [
                    bm.verts.new((vert.co.x * shrink, end, middle + (vert.co.z - middle) * shrink))
                    for vert in ring
                ]
                for k in range(count):
                    following = (k + 1) % count
                    face = bm.faces.new([outer[k], outer[following], inner[following], inner[k]])
                    face.material_index = body_index
                outer = inner
            centre = bm.verts.new((0, end, middle))
            for k in range(count):
                face = bm.faces.new([outer[k], outer[(k + 1) % count], centre])
                face.material_index = body_index
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        for vert in bm.verts:
            vert.co.y = loft.warp(vert.co.x, vert.co.y)
        bm.normal_update()
        self.shell_copy = bm.copy()
        self.tree = BVHTree.FromBMesh(self.shell_copy)
        carved = self.carve(bm, arches)
        self.absorb(carved, self.materials, "Body")

    def carve(self, bm, arches):
        if not arches:
            return bm
        cutter = bmesh.new()
        for arch in arches:
            for side in (-1, 1):
                made = bmesh.ops.create_cone(
                    cutter,
                    cap_ends=True,
                    segments=40,
                    radius1=arch["radius"],
                    radius2=arch["radius"],
                    depth=arch["depth"],
                )
                turn = Matrix.Rotation(math.pi / 2, 4, "Y")
                move = Matrix.Translation(
                    (side * (arch["inset"] + arch["depth"] / 2), arch["s"], arch["height"])
                )
                bmesh.ops.transform(cutter, matrix=move @ turn, verts=made["verts"])
        for face in cutter.faces:
            face.material_index = self.materials.index("underbody")
        body = self.temporary_object(bm, "shell")
        tool = self.temporary_object(cutter, "cutter")
        modifier = body.modifiers.new("arches", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = tool
        graph = bpy.context.evaluated_depsgraph_get()
        result = bmesh.new()
        result.from_object(body, graph)
        for helper in (body, tool):
            data = helper.data
            bpy.data.objects.remove(helper)
            bpy.data.meshes.remove(data)
        return result

    def temporary_object(self, bm, name):
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        for material in self.materials:
            mesh.materials.append(material_named(material))
        made = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(made)
        return made

    def cast(self, axis, a, b):
        far = 20.0
        if axis == "front":
            origin, direction = Vector((a, -far, b)), Vector((0, 1, 0))
        elif axis == "rear":
            origin, direction = Vector((a, far, b)), Vector((0, -1, 0))
        elif axis == "side":
            origin, direction = Vector((far, a, b)), Vector((-1, 0, 0))
        else:
            origin, direction = Vector((a, b, far)), Vector((0, 0, -1))
        hit = self.tree.ray_cast(origin, direction)[0]
        return hit, direction

    def project(self, axis, a, b, lift=0.0):
        hit, direction = self.cast(axis, a, b)
        if hit is None:
            raise ValueError(f"{self.name}: no surface on {axis} at {a:.3f}, {b:.3f}")
        return hit - direction * lift

    def decal(
        self,
        axis,
        rect,
        material,
        lift=0.005,
        cells=(4, 4),
        shape="rect",
        skirt=True,
        group="Body",
        mirror=False,
        sink=0.004,
    ):
        a0, a1, b0, b1 = rect
        columns, rows = cells
        outer = []
        inner = []
        for i in range(columns + 1):
            for j in range(rows + 1):
                u = 2 * i / columns - 1
                v = 2 * j / rows - 1
                if shape == "round":
                    u, v = u * math.sqrt(1 - v * v / 2), v * math.sqrt(1 - u * u / 2)
                a = (a0 + a1) / 2 + u * (a1 - a0) / 2
                b = (b0 + b1) / 2 + v * (b1 - b0) / 2
                outer.append(tuple(self.project(axis, a, b, lift)))
                if skirt:
                    inner.append(tuple(self.project(axis, a, b, -sink)))

        def index(i, j):
            return i * (rows + 1) + j

        reverse = axis in ("front", "top")
        faces = []
        for i in range(columns):
            for j in range(rows):
                quad = [index(i, j), index(i + 1, j), index(i + 1, j + 1), index(i, j + 1)]
                faces.append(quad[::-1] if reverse else quad)
        verts = list(outer)
        if skirt:
            base = len(outer)
            verts.extend(inner)
            loop = (
                [index(i, 0) for i in range(columns)]
                + [index(columns, j) for j in range(rows)]
                + [index(i, rows) for i in range(columns, 0, -1)]
                + [index(0, j) for j in range(rows, 0, -1)]
            )
            for k, start in enumerate(loop):
                end = loop[(k + 1) % len(loop)]
                quad = [end, start, start + base, end + base]
                faces.append(quad[::-1] if reverse else quad)
        self.absorb_raw(verts, faces, material, group, mirror)

    def side_spans(self, s0, s1, z0, z1, margin=0.03):
        spans = [(s0, s1)]
        for arch in self.arches:
            nearest = min(max(arch["height"], z0), z1)
            reach = arch["radius"] + margin
            gap = reach**2 - (nearest - arch["height"]) ** 2
            if gap <= 0:
                continue
            width = math.sqrt(gap)
            cut = (arch["s"] - width, arch["s"] + width)
            trimmed = []
            for start, end in spans:
                if cut[1] <= start or cut[0] >= end:
                    trimmed.append((start, end))
                    continue
                if cut[0] > start:
                    trimmed.append((start, cut[0]))
                if cut[1] < end:
                    trimmed.append((cut[1], end))
            spans = trimmed
        return [span for span in spans if span[1] - span[0] > 0.02]

    def side_strip(self, s0, s1, z0, z1, material, lift=0.006, step=0.12, margin=0.03, group="Body"):
        for start, end in self.side_spans(s0, s1, z0, z1, margin):
            cells = max(1, math.ceil((end - start) / step))
            self.decal(
                "side", (start, end, z0, z1), material, lift, (cells, 1), group=group, mirror=True
            )

    def arch_lips(self, material="body", width=0.035, lift=0.016, edge_lift=0.003, steps=28):
        for arch in self.arches:
            verts = []
            usable = []
            for k in range(steps + 1):
                angle = math.pi * k / steps * 1.5 - math.pi * 0.25
                row = []
                for radius, raise_by in (
                    (arch["radius"] + 0.004, lift),
                    (arch["radius"] + width, edge_lift),
                ):
                    s = arch["s"] + radius * math.cos(angle)
                    z = arch["height"] + radius * math.sin(angle)
                    hit, direction = self.cast("side", s, z)
                    if hit is None or hit.x < arch["inset"] + 0.1:
                        row = None
                        break
                    row.append(tuple(hit - direction * raise_by))
                usable.append(row is not None)
                verts.append(row)
            packed = []
            faces = []
            lookup = {}
            for k in range(steps):
                if not (usable[k] and usable[k + 1]):
                    continue
                for n in (k, k + 1):
                    if n not in lookup:
                        lookup[n] = len(packed)
                        packed.extend(verts[n])
                a, b = lookup[k], lookup[k + 1]
                faces.append([a, a + 1, b + 1, b])
                faces.append([a, b, (b, "in"), (a, "in")])
            inner_lookup = {}
            final_faces = []
            for face in faces:
                resolved = []
                for item in face:
                    if isinstance(item, tuple):
                        source = item[0]
                        if source not in inner_lookup:
                            x, y, z = packed[source]
                            inner_lookup[source] = len(packed)
                            packed.append((x - lift - 0.02, y, z))
                        resolved.append(inner_lookup[source])
                    else:
                        resolved.append(item)
                final_faces.append(resolved)
            self.absorb_raw(packed, final_faces, material, "Body", mirror=True)

    def box(
        self,
        size,
        at,
        material,
        rotation=(0, 0, 0),
        bevel=0.0,
        group="Body",
        mirror=False,
        taper=None,
    ):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for vert in bm.verts:
            vert.co.x *= size[0]
            vert.co.y *= size[1]
            vert.co.z *= size[2]
            if taper:
                amount = 1 - (1 - taper[1]) * (vert.co[taper[0]] / size[taper[0]] + 0.5)
                for axis in range(3):
                    if axis != taper[0] and axis in taper[2]:
                        vert.co[axis] *= amount
        if bevel:
            bmesh.ops.bevel(
                bm, geom=bm.edges[:], offset=bevel, segments=1, profile=0.5, affect="EDGES"
            )
        matrix = Matrix.Translation(at) @ Euler(rotation, "XYZ").to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.absorb(bm, material, group, mirror)

    def bar(self, start, end, width, thickness, material, group="Body", mirror=False, bevel=0.0):
        start = Vector(start)
        end = Vector(end)
        axis = end - start
        length = axis.length
        forward = axis.normalized()
        up = Vector((0, 0, 1))
        if abs(forward.dot(up)) > 0.95:
            up = Vector((0, 1, 0))
        side = forward.cross(up).normalized()
        lift = side.cross(forward).normalized()
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        for vert in bm.verts:
            vert.co.x *= width
            vert.co.y *= length
            vert.co.z *= thickness
        if bevel:
            bmesh.ops.bevel(
                bm, geom=bm.edges[:], offset=bevel, segments=1, profile=0.5, affect="EDGES"
            )
        frame = Matrix((side, forward, lift)).transposed().to_4x4()
        frame.translation = (start + end) / 2
        bmesh.ops.transform(bm, matrix=frame, verts=bm.verts[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.absorb(bm, material, group, mirror)

    def cylinder(
        self,
        radius,
        depth,
        at,
        material,
        rotation=(0, 0, 0),
        segments=16,
        radius_end=None,
        group="Body",
        mirror=False,
    ):
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm,
            cap_ends=True,
            segments=segments,
            radius1=radius,
            radius2=radius if radius_end is None else radius_end,
            depth=depth,
        )
        matrix = Matrix.Translation(at) @ Euler(rotation, "XYZ").to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.absorb(bm, material, group, mirror)

    def torus(self, major, minor, at, material, rotation=(0, 0, 0), segments=20, ring=6, group="Body"):
        verts = []
        faces = []
        for i in range(segments):
            around = 2 * math.pi * i / segments
            for j in range(ring):
                tube = 2 * math.pi * j / ring
                reach = major + minor * math.cos(tube)
                verts.append(
                    (reach * math.cos(around), reach * math.sin(around), minor * math.sin(tube))
                )
        for i in range(segments):
            for j in range(ring):
                a = i * ring + j
                b = ((i + 1) % segments) * ring + j
                c = ((i + 1) % segments) * ring + (j + 1) % ring
                d = i * ring + (j + 1) % ring
                faces.append([a, b, c, d])
        matrix = Matrix.Translation(at) @ Euler(rotation, "XYZ").to_matrix().to_4x4()
        moved = [tuple(matrix @ Vector(v)) for v in verts]
        self.absorb_raw(moved, faces, material, group)

    def sweep(self, path, section, material, group="Body", up=(0, 0, 1)):
        up = Vector(up)
        path = [Vector(point) for point in path]
        bm = bmesh.new()
        rings = []
        for i, point in enumerate(path):
            before = path[max(i - 1, 0)]
            after = path[min(i + 1, len(path) - 1)]
            incoming = (point - before).normalized() if i > 0 else (after - point).normalized()
            outgoing = (after - point).normalized() if i < len(path) - 1 else incoming
            tangent = (incoming + outgoing).normalized()
            outward = up.cross(tangent).normalized()
            stretch = 1 / max(0.5, tangent.dot(outgoing))
            rings.append(
                [bm.verts.new(point + outward * u * stretch + up * v) for u, v in section]
            )
        count = len(section)
        for i in range(len(rings) - 1):
            for k in range(count):
                bm.faces.new(
                    [
                        rings[i][k],
                        rings[i][(k + 1) % count],
                        rings[i + 1][(k + 1) % count],
                        rings[i + 1][k],
                    ]
                )
        bm.faces.new(rings[0])
        bm.faces.new(rings[-1][::-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.absorb(bm, material, group)

    def wrap_path(self, end, z, reach, inset=0.07, offset=0.0, steps=14, side_step=0.12):
        axis = "front" if end < 0 else "rear"
        probe = self.project(axis, 0, z)
        nose = probe.y
        direction = 1 if end < 0 else -1
        limit = None
        s = nose + direction * 0.02
        while limit is None and abs(s - nose) < 1.0:
            hit, _ = self.cast("side", s, z)
            if hit is not None:
                limit = hit.x
            s += direction * 0.02
        span = limit - inset
        across = []
        for k in range(steps + 1):
            x = span * (1 - 2 * k / steps)
            point = self.project(axis, x, z)
            across.append(Vector((x, point.y - direction * offset, z)))
        corner_s = across[0].y + direction * (inset + 0.02)
        returns = []
        count = max(1, round((reach - inset) / side_step))
        for k in range(count + 1):
            s = nose + direction * (reach - (reach - inset - 0.04) * k / count)
            if (s - corner_s) * direction <= 0:
                continue
            hit, _ = self.cast("side", s, z)
            if hit is None:
                continue
            returns.append(Vector((hit.x + offset, s, z)))
        mirrored = [Vector((-p.x, p.y, p.z)) for p in returns[::-1]]
        path = returns + across + mirrored
        return path if end < 0 else path[::-1]

    def bumper(self, end, z, reach, depth, height, material, embed=0.03, bevel=0.012, **path_options):
        path = self.wrap_path(end, z, reach, **path_options)
        low = -height / 2
        high = height / 2
        section = [
            (-embed, low),
            (depth - bevel, low),
            (depth, low + bevel),
            (depth, high - bevel),
            (depth - bevel, high),
            (-embed, high),
        ]
        self.sweep(path, section, material)

    def lathe(self, profile, materials, segments=24):
        verts = []
        faces = []
        face_materials = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            for radius, along in profile:
                verts.append((along, radius * math.cos(angle), radius * math.sin(angle)))
        count = len(profile)
        for i in range(segments):
            following = (i + 1) % segments
            for k in range(count - 1):
                if profile[k][0] < 1e-6 and profile[k + 1][0] < 1e-6:
                    continue
                faces.append(
                    [i * count + k, following * count + k, following * count + k + 1, i * count + k + 1]
                )
                face_materials.append(materials[k])
        return verts, faces, face_materials

    def build_wheel(self, spec):
        radius = spec["radius"]
        width = spec["width"]
        rim = spec.get("rim", radius * 0.64)
        half = width / 2
        shoulder = min(width * 0.22, radius - rim - 0.01)
        tyre = [
            (rim, -half * 0.86),
            (rim + (radius - rim) * 0.55, -half),
            (radius - shoulder * 0.45, -half * 0.94),
            (radius, -half * 0.62),
            (radius, half * 0.62),
            (radius - shoulder * 0.45, half * 0.94),
            (rim + (radius - rim) * 0.55, half),
            (rim, half * 0.86),
        ]
        face = half * spec.get("face", 0.55)
        dish = spec.get("dish", 0.03)
        barrel = [
            (rim, half * 0.86),
            (rim * 0.93, half * 0.8),
            (rim * 0.88, face - dish * 0.2),
            (rim * 0.3, face - dish),
            (0.0, face - dish),
        ]
        back = [(rim, -half * 0.86), (rim * 0.9, -half * 0.5), (0.0, -half * 0.5)]
        wheel = bmesh.new()
        names = ["tyre", spec.get("rim_material", "rim"), "rim_dark", "chrome"]

        def include(verts, faces, face_materials, reverse=False):
            made = [wheel.verts.new(v) for v in verts]
            for indices, material in zip(faces, face_materials):
                corners = [made[i] for i in indices]
                if len(set(corners)) < 3:
                    continue
                unique = []
                for corner in corners:
                    if corner not in unique:
                        unique.append(corner)
                try:
                    created = wheel.faces.new(unique[::-1] if reverse else unique)
                except ValueError:
                    continue
                created.material_index = names.index(material)

        include(*self.lathe(tyre, ["tyre"] * 7, spec.get("segments", 28)))
        disc = "rim_dark" if spec.get("spokes") else names[1]
        include(*self.lathe(barrel, [names[1], names[1], disc, disc], spec.get("segments", 28)))
        include(*self.lathe(back, ["rim_dark", "rim_dark"], 16), reverse=True)
        bmesh.ops.remove_doubles(wheel, verts=wheel.verts[:], dist=1e-5)
        bmesh.ops.recalc_face_normals(wheel, faces=wheel.faces[:])

        def attach(part, material):
            offset_faces = len(wheel.faces)
            made = {}
            for vert in part.verts:
                made[vert] = wheel.verts.new(vert.co)
            for source in part.faces:
                created = wheel.faces.new([made[v] for v in source.verts])
                created.material_index = names.index(material)
            part.free()
            return offset_faces

        spokes = spec.get("spokes", 0)
        for k in range(spokes):
            angle = 2 * math.pi * k / spokes
            part = bmesh.new()
            bmesh.ops.create_cube(part, size=1)
            inner_width = spec.get("spoke_inner", 0.05)
            outer_width = spec.get("spoke_outer", 0.07)
            reach = rim * 0.9
            for vert in part.verts:
                t = vert.co.z + 0.5
                vert.co.y *= inner_width + (outer_width - inner_width) * t
                vert.co.z = rim * 0.12 + (reach - rim * 0.12) * t
                vert.co.x = vert.co.x * 0.022 + face - dish * (1 - t * 0.8) + 0.006
            bmesh.ops.transform(part, matrix=Matrix.Rotation(angle, 4, "X"), verts=part.verts[:])
            bmesh.ops.recalc_face_normals(part, faces=part.faces[:])
            attach(part, names[1])
        holes = spec.get("holes", 0)
        for k in range(holes):
            angle = 2 * math.pi * (k + 0.5) / holes
            part = bmesh.new()
            bmesh.ops.create_cone(
                part,
                cap_ends=True,
                segments=8,
                radius1=spec.get("hole_radius", 0.022),
                radius2=spec.get("hole_radius", 0.022),
                depth=0.012,
            )
            ring = rim * spec.get("hole_ring", 0.62)
            t = (ring - rim * 0.3) / (rim * 0.58)
            along = face - dish + dish * 0.8 * t
            matrix = (
                Matrix.Rotation(angle, 4, "X")
                @ Matrix.Translation((along, 0, ring))
                @ Matrix.Rotation(math.pi / 2, 4, "Y")
            )
            bmesh.ops.transform(part, matrix=matrix, verts=part.verts[:])
            bmesh.ops.recalc_face_normals(part, faces=part.faces[:])
            attach(part, "rim_dark")
        cap = bmesh.new()
        bmesh.ops.create_cone(
            cap,
            cap_ends=True,
            segments=12,
            radius1=rim * spec.get("cap", 0.26),
            radius2=rim * spec.get("cap", 0.26) * 0.7,
            depth=0.03,
        )
        matrix = Matrix.Translation((face - dish + 0.014, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        bmesh.ops.transform(cap, matrix=matrix, verts=cap.verts[:])
        bmesh.ops.recalc_face_normals(cap, faces=cap.faces[:])
        attach(cap, spec.get("cap_material", "chrome"))
        return wheel, names

    def interior(self, cabin):
        front, rear = cabin["front"], cabin["rear"]
        tub_front, tub_rear = cabin["tub_front"], cabin["tub_rear"]
        shelf = cabin["shelf"]
        width = cabin["width"]
        floor = cabin["floor"]
        rear_shelf = cabin.get("rear_shelf", shelf)
        verts = [
            (-width, front, shelf),
            (width, front, shelf),
            (width, tub_front, shelf),
            (-width, tub_front, shelf),
            (-width, tub_front, floor),
            (width, tub_front, floor),
            (width, tub_rear, floor),
            (-width, tub_rear, floor),
            (-width, tub_rear, rear_shelf),
            (width, tub_rear, rear_shelf),
            (width, rear, rear_shelf),
            (-width, rear, rear_shelf),
            (-width, tub_front, shelf),
            (-width, tub_rear, shelf),
            (width, tub_front, shelf),
            (width, tub_rear, shelf),
        ]
        faces = [
            [0, 1, 2, 3],
            [3, 2, 5, 4],
            [4, 5, 6, 7],
            [7, 6, 9, 8],
            [8, 9, 10, 11],
            [12, 4, 7, 13],
            [15, 6, 5, 14],
        ]
        self.absorb_raw(verts, faces, "interior")
        dash_depth = cabin.get("dash_depth", 0.3)
        self.box(
            (width * 2 - 0.02, dash_depth, 0.2),
            (0, tub_front + dash_depth / 2 - 0.04, shelf - 0.06),
            "interior",
            bevel=0.03,
        )
        seat_z = floor + cabin.get("seat_height", 0.2)
        for row in cabin["seats"]:
            for x in row["x"]:
                wide = row.get("width", 0.46)
                self.box((wide, 0.48, 0.14), (x, row["s"], seat_z), "seat", bevel=0.035)
                self.box(
                    (wide, 0.13, row.get("back", 0.56)),
                    (x, row["s"] + 0.27, seat_z + row.get("back", 0.56) / 2),
                    "seat",
                    rotation=(-0.2, 0, 0),
                    bevel=0.035,
                )
                if row.get("headrest", True):
                    self.box(
                        (wide * 0.5, 0.09, 0.16),
                        (x, row["s"] + 0.35, seat_z + row.get("back", 0.56) + 0.1),
                        "seat",
                        rotation=(-0.2, 0, 0),
                        bevel=0.03,
                    )
        wheel_at = cabin["steering"]
        self.torus(0.17, 0.016, wheel_at, "trim_black", rotation=(-1.15, 0, 0), segments=18, ring=5)
        self.bar(
            wheel_at,
            (wheel_at[0], wheel_at[1] - 0.25, wheel_at[2] - 0.1),
            0.035,
            0.035,
            "trim_black",
        )
        self.bar(
            (wheel_at[0] - 0.16, wheel_at[1], wheel_at[2] + 0.01),
            (wheel_at[0] + 0.16, wheel_at[1], wheel_at[2] + 0.01),
            0.03,
            0.012,
            "trim_black",
        )

    def liner(self, front, rear, above, offset=0.008):
        body = self.groups["Body"]
        added_verts = []
        added_faces = []
        lookup = {}
        blocked = {"glass", "underbody"}
        for face, material in zip(list(body["faces"]), list(body["materials"])):
            if material in blocked:
                continue
            corners = [body["verts"][i] for i in face]
            if not all(front <= y <= rear and z >= above for _, y, z in corners):
                continue
            centre = Vector(np.mean(corners, axis=0))
            normal = Vector((0, 0, 0))
            for a, b in zip(corners, corners[1:] + corners[:1]):
                normal += Vector(a).cross(Vector(b))
            if normal.length < 1e-9:
                continue
            normal.normalize()
            indices = []
            for i in face:
                if i not in lookup:
                    lookup[i] = len(added_verts)
                    added_verts.append([Vector(body["verts"][i]), Vector((0, 0, 0))])
                added_verts[lookup[i]][1] += normal
                indices.append(lookup[i])
            added_faces.append(indices[::-1])
            del centre
        moved = []
        for position, normal in added_verts:
            direction = normal.normalized() if normal.length > 1e-9 else normal
            moved.append(tuple(position - direction * offset))
        self.absorb_raw(moved, added_faces, "interior")

    def place_wheels(self, spec, axles, track):
        wheel, names = self.build_wheel(spec)
        mesh = bpy.data.meshes.new(f"{self.name}_wheel")
        bmesh.ops.triangulate(wheel, faces=wheel.faces[:])
        wheel.to_mesh(mesh)
        wheel.free()
        for name in names:
            mesh.materials.append(material_named(name))
        finish_mesh(mesh)
        made = []
        for label, s in (("F", axles[0]), ("R", axles[1])):
            for side, x in (("L", -track / 2), ("R", track / 2)):
                item = bpy.data.objects.new(f"Wheel_{label}{side}", mesh)
                item.location = (x, s, spec["radius"])
                if x < 0:
                    item.rotation_euler = (0, 0, math.pi)
                bpy.context.scene.collection.objects.link(item)
                made.append(item)
        self.wheels = made
        return made

    def finish(self):
        made = []
        for name, group in self.groups.items():
            used = []
            for material in group["materials"]:
                if material not in used:
                    used.append(material)
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(group["verts"], [], group["faces"])
            for material in used:
                mesh.materials.append(material_named(material))
            mesh.polygons.foreach_set(
                "material_index", [used.index(material) for material in group["materials"]]
            )
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
            bm.to_mesh(mesh)
            bm.free()
            finish_mesh(mesh)
            item = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(item)
            made.append(item)
        return made + self.wheels


def finish_mesh(mesh, angle=38):
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    mesh.set_sharp_from_angle(angle=math.radians(angle))
    mesh.update()


def material_named(name):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    recipe = PALETTE[name]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    red, green, blue = linear(recipe["color"])
    alpha = recipe.get("alpha", 1.0)
    shader.inputs["Base Color"].default_value = (red, green, blue, 1)
    shader.inputs["Roughness"].default_value = recipe["roughness"]
    shader.inputs["Metallic"].default_value = recipe["metallic"]
    shader.inputs["Alpha"].default_value = alpha
    material.use_backface_culling = not recipe.get("double", False)
    if alpha < 1:
        material.blend_method = "BLEND"
        material.surface_render_method = "BLENDED"
    return material


def wheel_arches(axles, track, radius, tyre_width, steering, travel, clearance, reach=0.5):
    sweep = radius * math.sin(steering) + tyre_width * 0.5 * math.cos(steering)
    inset = track * 0.5 - sweep - 0.02
    return [
        {
            "s": s,
            "height": radius + travel * 0.35,
            "radius": radius + clearance,
            "inset": inset,
            "depth": track * 0.5 + reach - inset,
        }
        for s in axles
    ]
