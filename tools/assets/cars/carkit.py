import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

PALETTE = {
    "body": {"color": "#9a9c9e", "roughness": 0.32, "metallic": 0.1},
    "accent": {"color": "#e6e0cf", "roughness": 0.4, "metallic": 0.05},
    "glass": {"color": "#161c22", "roughness": 0.06, "metallic": 0.2, "alpha": 0.5},
    "cover": {"color": "#cfd6da", "roughness": 0.05, "metallic": 0.1, "alpha": 0.28},
    "trim_black": {"color": "#17191a", "roughness": 0.62, "metallic": 0.0},
    "seam": {"color": "#070808", "roughness": 0.9, "metallic": 0.0},
    "grille": {"color": "#0c0d0e", "roughness": 0.5, "metallic": 0.3},
    "chrome": {"color": "#e4e8e8", "roughness": 0.2, "metallic": 0.82},
    "steel": {"color": "#8a8f92", "roughness": 0.38, "metallic": 0.9},
    "underbody": {"color": "#0e1010", "roughness": 1.0, "metallic": 0.0},
    "interior": {"color": "#2b2723", "roughness": 0.92, "metallic": 0.0},
    "seat": {"color": "#6a5038", "roughness": 0.85, "metallic": 0.0},
    "tyre": {"color": "#161717", "roughness": 0.93, "metallic": 0.0},
    "rim": {"color": "#ccd1d3", "roughness": 0.3, "metallic": 0.8},
    "rim_dark": {"color": "#202325", "roughness": 0.55, "metallic": 0.5},
    "rim_white": {"color": "#e8e6dc", "roughness": 0.45, "metallic": 0.1},
    "lens_head": {"color": "#eef1ec", "roughness": 0.1, "metallic": 0.2},
    "lens_tail": {"color": "#a01410", "roughness": 0.18, "metallic": 0.0},
    "lens_amber": {"color": "#e08a18", "roughness": 0.2, "metallic": 0.0},
    "lens_clear": {"color": "#e3e7e4", "roughness": 0.15, "metallic": 0.1},
    "plate": {"color": "#efeddd", "roughness": 0.5, "metallic": 0.0},
    "mirror": {"color": "#aeb8bd", "roughness": 0.04, "metallic": 1.0},
}
SLOTS = list(PALETTE)
FLOOR = -1
LID = 1000
UP = Vector((0, 0, 1))
LEFT = Vector((0, 1, 0))
FORWARD = Vector((1, 0, 0))


def slot(material):
    return SLOTS.index(material)


def linear(hex_color):
    channels = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]


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
    material.use_backface_culling = True
    if alpha < 1:
        material.blend_method = "BLEND"
        material.surface_render_method = "BLENDED"
    return material


def curve(points):
    points = sorted(points)
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    count = len(xs)
    slopes = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(count - 1)]
    tangents = [slopes[0]]
    for i in range(1, count - 1):
        a, b = slopes[i - 1], slopes[i]
        tangents.append(0.0 if a * b <= 0 else 2 * a * b / (a + b))
    tangents.append(slopes[-1])

    def evaluate(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while x > xs[i + 1]:
            i += 1
        span = xs[i + 1] - xs[i]
        t = (x - xs[i]) / span
        t2, t3 = t * t, t * t * t
        return (
            (2 * t3 - 3 * t2 + 1) * ys[i]
            + (t3 - 2 * t2 + t) * span * tangents[i]
            + (-2 * t3 + 3 * t2) * ys[i + 1]
            + (t3 - t2) * span * tangents[i + 1]
        )

    return evaluate


def polyline(points):
    points = sorted(points)

    def evaluate(x):
        if x <= points[0][0]:
            return points[0][1]
        if x >= points[-1][0]:
            return points[-1][1]
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            if x <= x1:
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0)

    return evaluate


def bump(x, centre, radius):
    t = abs(x - centre) / radius
    return 0.0 if t >= 1 else 0.5 + 0.5 * math.cos(math.pi * t)


def outward(station):
    kind = station[0]
    if kind == "side":
        return Vector((0, 1, 0))
    if kind == "front":
        return Vector((1, 0, 0))
    if kind == "rear":
        return Vector((-1, 0, 0))
    sign = 1 if kind == "front_corner" else -1
    return Vector((sign * math.cos(station[1]), math.sin(station[1]), 0))


class End:
    def __init__(self, tip, bow=0.05, flat=0.7, power=2.4):
        self.tip = tip
        self.bow = bow
        self.flat = flat
        self.power = power


class Line:
    def __init__(self, width, height, keys, front, rear, sharp=False):
        self.width = width
        self.height = height
        self.keys = keys
        self.front = front
        self.rear = rear
        self.sharp = sharp

    def end_point(self, end, anchor, a, turn):
        width = self.width(anchor)
        flat = end.flat * width
        direction = 1 if end.tip > anchor else -1
        edge = end.tip - direction * end.bow
        if a is not None:
            return end.tip - direction * end.bow * a * a, a * flat
        power = 2 / end.power
        cosine = max(0.0, math.cos(turn)) ** power
        sine = max(0.0, math.sin(turn)) ** power
        return anchor + (edge - anchor) * cosine, flat + (width - flat) * sine

    def point(self, station):
        kind = station[0]
        if kind == "side":
            k, u = station[1], station[2]
            x = self.keys[k] + (self.keys[k + 1] - self.keys[k]) * u
            y = self.width(x)
        elif kind == "front":
            x, y = self.end_point(self.front, self.keys[0], station[1], None)
        elif kind == "front_corner":
            x, y = self.end_point(self.front, self.keys[0], None, station[1])
        elif kind == "rear_corner":
            x, y = self.end_point(self.rear, self.keys[-1], None, station[1])
        else:
            x, y = self.end_point(self.rear, self.keys[-1], station[1], None)
        return Vector((x, y, self.height(x, y)))


class Blend:
    def __init__(self, low, high, amount, bulge=0.0, sharp=False):
        self.low = low
        self.high = high
        self.amount = amount
        self.bulge = bulge
        self.sharp = sharp

    def point(self, station):
        a = self.low.point(station)
        b = self.high.point(station)
        return a.lerp(b, self.amount) + outward(station) * self.bulge


class Hull:
    def __init__(self, lines, lid, floor=None, fascia=6, corner=4, step=0.12, lid_rows=5, floor_rows=2):
        self.lines = lines
        self.lid = lid
        self.floor = floor
        self.lid_rows = lid_rows
        self.floor_rows = floor_rows
        keys = next(line.keys for line in lines if isinstance(line, Line))
        stations = [("front", i / fascia) for i in range(fascia)]
        stations += [("front_corner", math.pi / 2 * i / corner) for i in range(corner)]
        for k in range(len(keys) - 1):
            pieces = max(1, math.ceil(abs(keys[k] - keys[k + 1]) / step - 1e-6))
            stations += [("side", k, i / pieces) for i in range(pieces)]
        stations += [("rear_corner", math.pi / 2 * (1 - i / corner)) for i in range(corner + 1)]
        stations += [("rear", 1 - i / fascia) for i in range(1, fascia + 1)]
        self.stations = stations
        self.grid = [[line.point(station) for station in stations] for line in lines]

    def indices(self, test):
        return [i for i, station in enumerate(self.stations) if test(station, self.grid[-1][i])]

    def front_indices(self, back):
        return self.indices(lambda station, point: station[0] in ("front", "front_corner") or (station[0] == "side" and point.x >= back))

    def rear_indices(self, ahead):
        return self.indices(lambda station, point: station[0] in ("rear", "rear_corner") or (station[0] == "side" and point.x <= ahead))

    def position(self, level, index):
        low = min(int(level), len(self.lines) - 2)
        return self.grid[low][index].lerp(self.grid[low + 1][index], level - low)

    def path(self, level, indices, offset=0.0, lift=0.0, mirrored=True):
        points = [self.position(level, i) for i in indices]
        normals = []
        for n, index in enumerate(indices):
            before = points[max(0, n - 1)]
            after = points[min(len(points) - 1, n + 1)]
            tangent = after - before
            normal = Vector((tangent.y, -tangent.x, 0))
            if points[n].y < 1e-6 or normal.length < 1e-9:
                normal = outward(self.stations[index])
            normals.append(normal.normalized())
        points = [p + n * offset + UP * lift for p, n in zip(points, normals)]
        if not mirrored:
            return points, normals
        flip = Vector((1, -1, 1))
        if points[0].y < 1e-6:
            left_points, left_normals = points[::-1], normals[::-1]
            right_points = [p * flip for p in points[1:]]
            right_normals = [n * flip for n in normals[1:]]
        else:
            left_points, left_normals = points, normals
            right_points = [p * flip for p in points[-2::-1]]
            right_normals = [n * flip for n in normals[-2::-1]]
        return left_points + right_points, left_normals + right_normals

    def build(self, paint, floor_material="underbody"):
        bm = bmesh.new()
        band_layer = bm.faces.layers.int.new("band")
        station_layer = bm.faces.layers.int.new("station")
        rows = []
        labels = []
        bottom = self.grid[0]
        for r in range(self.floor_rows):
            f = r / self.floor_rows
            row = []
            for p in bottom:
                z = self.floor(p.x, p.y * f) if self.floor else p.z
                row.append(Vector((p.x, p.y * f, z)))
            rows.append(row)
            labels.append(FLOOR)
        for j, line_points in enumerate(self.grid):
            rows.append(line_points)
            labels.append(j)
        labels[-1] = LID
        top = self.grid[-1]
        for r in range(1, self.lid_rows + 1):
            f = 1 - r / self.lid_rows
            rows.append([Vector((p.x, p.y * f, self.lid(p.x, p.y * f))) for p in top])
            labels.append(LID)
        verts = [[bm.verts.new(p) for p in row] for row in rows]
        for r in range(len(rows) - 1):
            label = labels[r]
            for i in range(len(self.stations) - 1):
                loop = (verts[r][i], verts[r][i + 1], verts[r + 1][i + 1], verts[r + 1][i])
                face = bm.faces.new(loop)
                face[band_layer] = label
                face[station_layer] = i
                if label == FLOOR:
                    material = floor_material
                else:
                    material = paint(label, self.stations[i], (rows[r][i] + rows[r + 1][i + 1]) / 2)
                face.material_index = slot(material)
                face.smooth = True
        bm.edges.ensure_lookup_table()
        for j, line in enumerate(self.lines):
            if not line.sharp:
                continue
            row = verts[self.floor_rows + j]
            for i in range(len(row) - 1):
                edge = bm.edges.get((row[i], row[i + 1]))
                if edge:
                    edge.smooth = False
        geometry = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.mirror(bm, geom=geometry, axis="Y", merge_dist=-1)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        if sum(face.calc_center_median().dot(face.normal) * face.calc_area() for face in bm.faces) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        return bm


def tagged(bm, bands, test, hull):
    band_layer = bm.faces.layers.int["band"]
    station_layer = bm.faces.layers.int["station"]
    return [
        face
        for face in bm.faces
        if face[band_layer] in bands and test(hull.stations[face[station_layer]])
    ]


def recess(bm, faces, thickness, depth, rim, floor):
    result = bmesh.ops.inset_region(
        bm, faces=faces, thickness=thickness, depth=-depth, use_even_offset=True, use_boundary=True
    )
    for face in result["faces"]:
        face.material_index = slot(rim)
    for face in faces:
        if face.is_valid:
            face.material_index = slot(floor)
    for face in faces:
        if not face.is_valid:
            continue
        for edge in face.edges:
            if any(other.material_index != face.material_index for other in edge.link_faces):
                edge.smooth = False


def oriented(bm, hint):
    for face in bm.faces:
        if face.normal.dot(hint) < 0:
            face.normal_flip()
    return bm


def closed(bm):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for face in bm.faces:
        face.smooth = True
    return bm


def hexahedron(corners, material):
    bm = bmesh.new()
    verts = [bm.verts.new(c) for c in corners]
    for loop in ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([verts[i] for i in loop]).material_index = slot(material)
    return closed(bm)


def box(centre, size, material, rotation=None, bevel=0.0, taper=1.0):
    half = Vector(size) / 2
    corners = []
    for z in (-1, 1):
        scale = taper if z > 0 else 1.0
        for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            corner = Vector((x * half.x * scale, y * half.y * scale, z * half.z))
            if rotation is not None:
                corner = rotation @ corner
            corners.append(Vector(centre) + corner)
    bm = hexahedron(corners, material)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1, affect="EDGES", profile=0.5)
        for face in bm.faces:
            face.material_index = slot(material)
            face.smooth = True
    return bm


def bar(start, end, width, thickness, material, up=UP, bevel=0.0):
    start = Vector(start)
    end = Vector(end)
    along = end - start
    side = along.cross(up).normalized()
    normal = side.cross(along).normalized()
    rotation = Matrix((along.normalized(), side, normal)).transposed()
    return box((start + end) / 2, (along.length, width, thickness), material, rotation=rotation, bevel=bevel)


def frame(axis):
    axis = Vector(axis).normalized()
    helper = UP if abs(axis.z) < 0.9 else FORWARD
    u = axis.cross(helper).normalized()
    v = axis.cross(u).normalized()
    return axis, u, v


def lathe(profile, material, origin=(0, 0, 0), axis=(0, 1, 0), segments=24, loop=True):
    axis, u, v = frame(axis)
    origin = Vector(origin)
    bm = bmesh.new()
    materials = material if isinstance(material, (list, tuple)) else [material] * len(profile)
    rings = []
    for radius, along in profile:
        centre = origin + axis * along
        if radius < 1e-7:
            rings.append([bm.verts.new(centre)] * segments)
            continue
        ring = []
        for s in range(segments):
            angle = 2 * math.pi * s / segments
            ring.append(bm.verts.new(centre + (u * math.cos(angle) + v * math.sin(angle)) * radius))
        rings.append(ring)
    count = len(profile) if loop else len(profile) - 1
    for p in range(count):
        a = rings[p]
        b = rings[(p + 1) % len(profile)]
        for s in range(segments):
            t = (s + 1) % segments
            loop_verts = []
            for vert in (a[s], a[t], b[t], b[s]):
                if vert not in loop_verts:
                    loop_verts.append(vert)
            if len(loop_verts) < 3:
                continue
            try:
                bm.faces.new(loop_verts).material_index = slot(materials[p])
            except ValueError:
                pass
    return closed(bm)


def cylinder(start, end, radius, material, segments=14, end_radius=None):
    start = Vector(start)
    end = Vector(end)
    length = (end - start).length
    tip = radius if end_radius is None else end_radius
    return lathe(
        [(0, 0), (radius, 0), (tip, length), (0, length)],
        material,
        origin=start,
        axis=end - start,
        segments=segments,
    )


def sweep(points, outs, ups, profile, material, caps=True):
    bm = bmesh.new()
    rings = []
    for p, out, up in zip(points, outs, ups):
        rings.append([bm.verts.new(p + out * a + up * b) for a, b in profile])
    count = len(profile)
    for r in range(len(rings) - 1):
        for s in range(count):
            t = (s + 1) % count
            bm.faces.new((rings[r][s], rings[r][t], rings[r + 1][t], rings[r + 1][s])).material_index = slot(material)
    if caps:
        bm.faces.new(rings[0]).material_index = slot(material)
        bm.faces.new(rings[-1]).material_index = slot(material)
    return closed(bm)


def bar_profile(depth, height, chamfer):
    half = height / 2
    return [
        (-0.03, -half),
        (depth - chamfer, -half),
        (depth, -half + chamfer),
        (depth, half - chamfer),
        (depth - chamfer, half),
        (-0.03, half),
    ]


class Pocket:
    def __init__(self, corners, normal):
        self.corners = corners
        self.normal = normal

    def point(self, a, b, lift=0.0):
        p00, p10, p11, p01 = self.corners
        low = p00.lerp(p10, a)
        high = p01.lerp(p11, a)
        return low.lerp(high, b) + self.normal * lift

    def size(self):
        p00, p10, p11, p01 = self.corners
        return (p10 - p00).length, (p01 - p00).length

    def slab(self, a0, a1, b0, b1, h0, h1, material):
        corners = [self.point(a, b, h) for h in (h0, h1) for a, b in ((a0, b0), (a1, b0), (a1, b1), (a0, b1))]
        return hexahedron(corners, material)

    def disc(self, a, b, profile, material, segments=20):
        return lathe(profile, material, origin=self.point(a, b), axis=self.normal, segments=segments)

    def panel(self, a0, a1, b0, b1, lift, material):
        bm = bmesh.new()
        loop = [bm.verts.new(self.point(a, b, lift)) for a, b in ((a0, b0), (a1, b0), (a1, b1), (a0, b1))]
        bm.faces.new(loop).material_index = slot(material)
        return oriented(bm, self.normal)


class Model:
    def __init__(self, name):
        self.name = name
        self.parts = {}
        self.wheels = []
        self.extra = []

    def part(self, group):
        if group not in self.parts:
            self.parts[group] = bmesh.new()
        return self.parts[group]

    def absorb(self, source, group="Body", mirror=False, both=False):
        target = self.part(group)
        passes = [False, True] if both else [mirror]
        for flipped in passes:
            mapping = {}
            for vert in source.verts:
                co = vert.co.copy()
                if flipped:
                    co.y = -co.y
                mapping[vert] = target.verts.new(co)
            for face in source.faces:
                loop = [mapping[v] for v in face.verts]
                if flipped:
                    loop.reverse()
                try:
                    created = target.faces.new(loop)
                except ValueError:
                    continue
                created.material_index = face.material_index
                created.smooth = True
            for edge in source.edges:
                if not edge.smooth:
                    made = target.edges.get((mapping[edge.verts[0]], mapping[edge.verts[1]]))
                    if made:
                        made.smooth = False
        source.free()

    def add(self, source, group="Body"):
        self.absorb(source, group, both=True)

    def finish(self, angle=34):
        objects = []
        threshold = math.radians(angle)
        for group, bm in self.parts.items():
            for edge in bm.edges:
                if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > threshold:
                    edge.smooth = False
            bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
            mesh = bpy.data.meshes.new(group)
            bm.to_mesh(mesh)
            bm.free()
            for name in SLOTS:
                mesh.materials.append(material_named(name))
            item = bpy.data.objects.new(group, mesh)
            bpy.context.scene.collection.objects.link(item)
            objects.append(item)
        for name, mesh in self.extra:
            item = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(item)
            objects.append(item)
        for name, location, mesh in self.wheels:
            item = bpy.data.objects.new(name, mesh)
            item.location = location
            bpy.context.scene.collection.objects.link(item)
            objects.append(item)
        return objects


def mesh_object(bm, name):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    for material in SLOTS:
        mesh.materials.append(material_named(material))
    item = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(item)
    return item


def subtract(target, cutters):
    if not cutters:
        return target
    body = mesh_object(target, "carve_target")
    helpers = []
    for index, cutter in enumerate(cutters):
        bmesh.ops.triangulate(cutter, faces=cutter.faces[:])
        tool = mesh_object(cutter, f"carve_tool_{index}")
        cutter.free()
        helpers.append(tool)
        modifier = body.modifiers.new(f"carve_{index}", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.material_mode = "INDEX"
        modifier.object = tool
    graph = bpy.context.evaluated_depsgraph_get()
    graph.update()
    result = bmesh.new()
    result.from_object(body, graph)
    for item in [body, *helpers]:
        mesh = item.data
        bpy.data.objects.remove(item)
        bpy.data.meshes.remove(mesh)
    target.free()
    return result


def prism(outline, y0, y1, material):
    bm = bmesh.new()
    near = [bm.verts.new((x, y0, z)) for x, z in outline]
    far = [bm.verts.new((x, y1, z)) for x, z in outline]
    count = len(outline)
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((near[i], near[j], far[j], far[i])).material_index = slot(material)
    bm.faces.new(near).material_index = slot(material)
    bm.faces.new(far).material_index = slot(material)
    return closed(bm)


def tyre_profile(radius, rim, half, grooves, groove_depth):
    wall = radius - rim
    tread = half - 0.032
    points = [
        (rim - 0.008, -(half - 0.03)),
        (rim + 0.006, -(half - 0.01)),
        (rim + 0.32 * wall, -half),
        (rim + 0.68 * wall, -half),
        (radius - 0.022, -(half - 0.012)),
        (radius - 0.004, -tread),
    ]
    for g in range(grooves):
        centre = -tread + 2 * tread * (g + 1) / (grooves + 1)
        gap = min(0.011, tread / (grooves + 1) * 0.35)
        points += [
            (radius, centre - gap - 0.003),
            (radius - groove_depth, centre - gap),
            (radius - groove_depth, centre + gap),
            (radius, centre + gap + 0.003),
        ]
    points += [(r, -y) for r, y in points[5::-1]]
    return points


def wheel(spec):
    radius = spec["radius"]
    half = spec["width"] / 2
    rim = spec["rim"]
    dish = spec.get("dish", 0.035)
    style = spec.get("style", "spoke")
    face_metal = spec.get("metal", "rim")
    segments = spec.get("segments", 36)
    bm = bmesh.new()

    def include(part):
        offset = len(bm.verts)
        mapping = {}
        for vert in part.verts:
            mapping[vert] = bm.verts.new(vert.co)
        for face in part.faces:
            try:
                made = bm.faces.new([mapping[v] for v in face.verts])
            except ValueError:
                continue
            made.material_index = face.material_index
            made.smooth = True
        part.free()
        return offset

    include(lathe(tyre_profile(radius, rim, half, spec.get("grooves", 3), spec.get("groove_depth", 0.009)), "tyre", segments=segments))
    back = -(half - 0.015)
    barrel = rim - 0.028
    face = half - dish
    include(
        lathe(
            [
                (0, back + 0.03),
                (barrel, back + 0.03),
                (barrel, face - 0.02),
                (rim - 0.02, half - 0.02),
                (rim - 0.012, half - 0.006),
                (rim + 0.008, half - 0.006),
                (rim + 0.008, half - 0.024),
                (rim, back),
                (0, back),
            ],
            ["rim_dark", spec.get("barrel", face_metal), face_metal, spec.get("lip", face_metal), spec.get("lip", face_metal), "rim_dark", "rim_dark", "rim_dark", "rim_dark"],
            segments=segments,
        )
    )
    include(lathe([(0, back + 0.05), (rim * 0.62, back + 0.05), (rim * 0.62, back + 0.075), (0, back + 0.075)], "steel", segments=24))
    if style == "steel":
        outer = barrel + 0.004
        include(
            lathe(
                [
                    (0, face - 0.03),
                    (outer, face - 0.03),
                    (outer, face - 0.012),
                    (outer * 0.8, face + 0.004),
                    (outer * 0.5, face + 0.004),
                    (outer * 0.4, face + 0.02),
                    (0, face + 0.02),
                ],
                face_metal,
                segments=segments,
            )
        )
        holes = spec.get("spokes", 8)
        for n in range(holes):
            angle = 2 * math.pi * n / holes
            centre = Vector((math.cos(angle) * outer * 0.66, face - 0.004, math.sin(angle) * outer * 0.66))
            include(lathe([(0, 0), (outer * 0.11, 0), (outer * 0.11, 0.0135), (0, 0.0135)], "rim_dark", origin=centre, segments=10))
        include(lathe([(0, face + 0.01), (outer * 0.3, face + 0.01), (outer * 0.27, face + 0.035), (outer * 0.14, face + 0.048), (0, face + 0.05)], "chrome", segments=18))
        for n in range(6):
            angle = 2 * math.pi * (n + 0.5) / 6
            centre = Vector((math.cos(angle) * outer * 0.36, face + 0.018, math.sin(angle) * outer * 0.36))
            include(lathe([(0, 0), (0.012, 0), (0.012, 0.014), (0, 0.014)], "chrome", origin=centre, segments=6))
    else:
        count = spec.get("spokes", 5)
        twin = spec.get("twin", 0.0)
        root = spec.get("root", 0.05)
        tip = spec.get("tip", 0.035)
        thick = spec.get("thick", 0.028)
        lean = spec.get("lean", 0.012)
        hub = spec.get("hub", 0.07)
        reach = barrel + 0.006
        for n in range(count):
            for side in ((-1, 1) if twin else (0,)):
                angle = 2 * math.pi * n / count
                inner_angle = angle + side * twin * 0.35
                outer_angle = angle + side * twin
                corners = []
                for depth in (-thick, 0.0):
                    for r, a, w, y in (
                        (hub * 0.6, inner_angle, root, face),
                        (reach, outer_angle, tip, face + lean),
                    ):
                        radial = Vector((math.cos(a), 0, math.sin(a)))
                        tangent = Vector((-math.sin(a), 0, math.cos(a)))
                        squeeze = 0.7 if depth < 0 else 1.0
                        for sign in (-1, 1):
                            corners.append(radial * r + tangent * sign * w / 2 * squeeze + LEFT * (y + depth))
                order = [corners[i] for i in (0, 1, 3, 2, 4, 5, 7, 6)]
                include(hexahedron(order, face_metal))
        include(lathe([(0, face - 0.035), (hub, face - 0.035), (hub, face + 0.004), (hub * 0.7, face + 0.014), (0, face + 0.014)], face_metal, segments=18))
        include(lathe([(0, face + 0.012), (hub * 0.45, face + 0.012), (hub * 0.4, face + 0.02), (0, face + 0.02)], spec.get("cap", "rim_dark"), segments=12))
        nuts = spec.get("nuts", 5)
        for n in range(nuts):
            angle = 2 * math.pi * (n + 0.5) / nuts
            centre = Vector((math.cos(angle) * hub * 0.72, face + 0.004, math.sin(angle) * hub * 0.72))
            include(lathe([(0, 0), (0.009, 0), (0.009, 0.012), (0, 0.012)], "steel", origin=centre, segments=6))
    lugs = spec.get("lugs", 0)
    for n in range(lugs):
        angle = 2 * math.pi * n / lugs
        for side in (-1, 1):
            shift = angle + (0.5 * math.pi / lugs if side > 0 else 0)
            rotation = Matrix.Rotation(-shift, 4, "Y")
            centre = rotation @ Vector((radius - 0.02, side * (half - 0.03), 0))
            include(box(centre, (0.034, 0.05, 0.05), "tyre", rotation=rotation.to_3x3()))
    threshold = math.radians(30)
    for edge in bm.edges:
        if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > threshold:
            edge.smooth = False
    return bm


def wheel_meshes(spec, name):
    left = wheel(spec)
    left_mesh = bpy.data.meshes.new(f"{name}_left")
    left.to_mesh(left_mesh)
    for vert in left.verts:
        vert.co.y = -vert.co.y
    bmesh.ops.reverse_faces(left, faces=left.faces[:])
    right_mesh = bpy.data.meshes.new(f"{name}_right")
    left.to_mesh(right_mesh)
    left.free()
    for mesh in (left_mesh, right_mesh):
        for material in SLOTS:
            mesh.materials.append(material_named(material))
    return left_mesh, right_mesh


class Car:
    def __init__(self, name, wheelbase, track, front_wheel, rear_wheel=None):
        self.model = Model(name)
        self.axle = wheelbase / 2
        self.track = track
        self.front_wheel = front_wheel
        self.rear_wheel = rear_wheel or front_wheel
        self.cutters = []
        self.hull = None
        self.shell = None
        self.tree = None

    def body(self, hull, paint):
        self.hull = hull
        self.shell = hull.build(paint)
        self.tree = BVHTree.FromBMesh(self.shell)

    def cast(self, origin, direction):
        location, normal, _, _ = self.tree.ray_cast(Vector(origin), Vector(direction))
        if location is None:
            raise ValueError(f"{self.model.name}: ray from {tuple(origin)} missed the body")
        return location, normal

    def side(self, x, z):
        return self.cast((x, 4, z), (0, -1, 0))

    def nose(self, y, z):
        return self.cast((8, y, z), (-1, 0, 0))

    def tail(self, y, z):
        return self.cast((-8, y, z), (1, 0, 0))

    def top(self, x, y):
        return self.cast((x, y, 5), (0, 0, -1))

    def pocket(self, caster, u, v, depth, material, mirror=True, proud=0.5):
        hits = [caster(a, b)[0] for a, b in ((u[0], v[0]), (u[1], v[0]), (u[1], v[1]), (u[0], v[1]))]
        normal = (hits[1] - hits[0]).cross(hits[3] - hits[0]).normalized()
        centre_normal = caster((u[0] + u[1]) / 2, (v[0] + v[1]) / 2)[1]
        if normal.dot(centre_normal) < 0:
            normal = -normal
        floor = [h - normal * depth for h in hits]
        roof = [h + normal * proud for h in hits]
        cutter = hexahedron(floor + roof, material)
        self.cutters.append(cutter)
        if mirror:
            flip = Vector((1, -1, 1))
            self.cutters.append(hexahedron([p * flip for p in floor + roof], material))
        return Pocket(floor, normal)

    def carve(self, cutter):
        self.cutters.append(cutter)

    def arches(self, gap, inner=0.11, material="underbody", rear_gap=None):
        self.arch_list = []
        for sign, spec, clearance in ((1, self.front_wheel, gap), (-1, self.rear_wheel, rear_gap or gap)):
            centre = sign * self.axle
            hub = spec["radius"]
            reach = hub + clearance
            outline = [(centre + reach, -0.3)]
            steps = 24
            for s in range(steps + 1):
                angle = math.pi * s / steps
                outline.append((centre + reach * math.cos(angle), hub + reach * math.sin(angle)))
            outline.append((centre - reach, -0.3))
            near = self.track / 2 - spec["width"] / 2 - inner
            for flip in (1, -1):
                self.cutters.append(prism(outline, flip * near, flip * 3.0, material))
            self.arch_list.append((centre, hub, reach))

    def arch_lips(self, width=0.03, proud=0.012, material="body", floor=0.2, widths=None):
        for n, (centre, hub, reach) in enumerate(self.arch_list):
            lip_width = widths[n] if widths else width
            path = []
            steps = 26
            low = floor
            drop = max(1, int((hub - low) / 0.06))
            for s in range(drop):
                path.append((centre + reach, low + (hub - low) * s / drop, FORWARD))
            for s in range(steps + 1):
                angle = math.pi * s / steps
                radial = Vector((math.cos(angle), 0, math.sin(angle)))
                path.append((centre + reach * math.cos(angle), hub + reach * math.sin(angle), radial))
            for s in range(drop - 1, -1, -1):
                path.append((centre - reach, low + (hub - low) * s / drop, -FORWARD))
            points, outs, ups = [], [], []
            for x, z, radial in path:
                probe = Vector((x, 0, z)) + radial * 0.012
                try:
                    hit = self.side(probe.x, probe.z)[0]
                except ValueError:
                    continue
                points.append(Vector((x, hit.y, z)))
                outs.append(LEFT)
                ups.append(radial)
            profile = [(-0.03, -0.004), (proud, -0.004), (proud, lip_width * 0.55), (0.0, lip_width), (-0.03, lip_width)]
            self.model.add(sweep(points, outs, ups, profile, material))

    def cut(self, angle=34):
        reference = bpy.data.meshes.new("reference")
        self.shell.to_mesh(reference)
        corners = [Vector(item.vector) for item in reference.corner_normals]
        panels = []
        for polygon in reference.polygons:
            loops = list(polygon.loop_indices)
            panels.append(([reference.vertices[reference.loops[i].vertex_index].co.copy() for i in loops], [corners[i] for i in loops]))
        bpy.data.meshes.remove(reference)
        carved = subtract(self.shell, self.cutters)
        self.cutters = []
        threshold = math.radians(angle)
        for edge in carved.edges:
            if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > threshold:
                edge.smooth = False
        for face in carved.faces:
            face.smooth = True
        mesh = bpy.data.meshes.new("Coachwork")
        carved.to_mesh(mesh)
        carved.free()
        normals = [(0.0, 0.0, 0.0)] * len(mesh.loops)
        for polygon in mesh.polygons:
            _, normal, index, distance = self.tree.find_nearest(polygon.center)
            if index is None or distance > 2e-4 or polygon.normal.dot(normal) < 0.9:
                continue
            coords, shading = panels[index]
            for loop_index in polygon.loop_indices:
                point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                weights = poly_3d_calc(coords, point)
                blended = Vector()
                for weight, direction in zip(weights, shading):
                    blended += direction * weight
                if blended.length > 1e-6:
                    normals[loop_index] = tuple(blended.normalized())
        mesh.normals_split_custom_set(normals)
        for name in SLOTS:
            mesh.materials.append(material_named(name))
        self.model.extra.append(("Coachwork", mesh))

    def rail(self, level, indices, profile, material, offset=0.0, lift=0.0, hull=None, mirrored=True):
        hull = hull or self.hull
        points, normals = hull.path(level, indices, offset, lift, mirrored)
        part = sweep(points, normals, [UP] * len(points), profile, material)
        if mirrored:
            self.model.absorb(part)
        else:
            self.model.add(part)

    def seam(self, points, caster, width=0.008, lift=0.0025, material="seam", mirror=True):
        bm = bmesh.new()
        hits = []
        for point in points:
            try:
                hits.append(caster(*point))
            except ValueError:
                continue
        if len(hits) < 2:
            return
        rows = []
        for n, (location, normal) in enumerate(hits):
            before = hits[max(0, n - 1)][0]
            after = hits[min(len(hits) - 1, n + 1)][0]
            across = (after - before).cross(normal).normalized() * width / 2
            base = location + normal * lift
            rows.append((bm.verts.new(base - across), bm.verts.new(base + across)))
        for a, b in zip(rows, rows[1:]):
            face = bm.faces.new((a[0], a[1], b[1], b[0]))
            face.material_index = slot(material)
            if face.normal.dot(hits[0][1]) < 0:
                face.normal_flip()
        if mirror:
            self.model.add(bm)
        else:
            self.model.absorb(bm)

    def stroke(self, start, end, caster, steps=10, **options):
        points = [tuple(start[i] + (end[i] - start[i]) * s / steps for i in range(2)) for s in range(steps + 1)]
        self.seam(points, caster, **options)

    def decal(self, caster, u, v, material, lift=0.004, steps=(4, 2), group="Body", mirror=True, thickness=0.0):
        bm = bmesh.new()
        grid = []
        normal_sum = Vector()
        for i in range(steps[0] + 1):
            row = []
            for j in range(steps[1] + 1):
                a = u[0] + (u[1] - u[0]) * i / steps[0]
                b = v[0] + (v[1] - v[0]) * j / steps[1]
                location, normal = caster(a, b)
                normal_sum += normal
                row.append(bm.verts.new(location + normal * lift))
            grid.append(row)
        for i in range(steps[0]):
            for j in range(steps[1]):
                bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])).material_index = slot(material)
        oriented(bm, normal_sum)
        if thickness > 0:
            boundary = [e for e in bm.edges if len(e.link_faces) == 1]
            made = bmesh.ops.extrude_edge_only(bm, edges=boundary)
            shift = normal_sum.normalized() * -thickness
            for item in made["geom"]:
                if isinstance(item, bmesh.types.BMVert):
                    item.co += shift
            for face in bm.faces:
                face.material_index = slot(material)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            probe = max(bm.faces, key=lambda f: f.calc_area())
            if probe.normal.dot(normal_sum) < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        if mirror:
            self.model.add(bm, group)
        else:
            self.model.absorb(bm, group)

    def greenhouse(self, hull, glass_keys, glass_bands, pillar="body", roof="body", frame=0.02, depth=0.012, fixed=()):
        def paint(band, station, point):
            return roof if band == LID else pillar

        bm = hull.build(paint, floor_material="interior")
        bm.normal_update()
        band_layer = bm.faces.layers.int["band"]
        for face in bm.faces:
            if face[band_layer] == FLOOR:
                face.normal_flip()

        def is_glass(station):
            if station[0] in ("front", "rear"):
                return True
            return station[0] == "side" and station[1] in glass_keys

        panes = tagged(bm, glass_bands, is_glass, hull)
        pane_set = set(panes)
        shell = [f for f in bm.faces if f not in pane_set and f[band_layer] != FLOOR]
        lining = bmesh.ops.duplicate(bm, geom=shell)
        liner_faces = [item for item in lining["geom"] if isinstance(item, bmesh.types.BMFace)]
        for face in liner_faces:
            face.material_index = slot("interior")
        for vert in {v for face in liner_faces for v in face.verts}:
            vert.co -= vert.normal * 0.008
        bmesh.ops.reverse_faces(bm, faces=liner_faces)
        recess(bm, panes, frame, depth, "trim_black", "glass")
        self.cabin = hull
        self.model.absorb(bm, "Body")

    def place_wheels(self):
        half = self.track / 2
        front_left, front_right = wheel_meshes(self.front_wheel, "front_wheel")
        if self.rear_wheel is self.front_wheel:
            rear_left, rear_right = front_left, front_right
        else:
            rear_left, rear_right = wheel_meshes(self.rear_wheel, "rear_wheel")
        self.model.wheels = [
            ("Wheel_FL", (self.axle, half, self.front_wheel["radius"]), front_left),
            ("Wheel_FR", (self.axle, -half, self.front_wheel["radius"]), front_right),
            ("Wheel_RL", (-self.axle, half, self.rear_wheel["radius"]), rear_left),
            ("Wheel_RR", (-self.axle, -half, self.rear_wheel["radius"]), rear_right),
        ]

    def seats(self, x, floor, spread, height=0.16, width=0.46, rear_bench=None, material="seat"):
        tilt = Matrix.Rotation(math.radians(-12), 3, "Y")
        for sign in (1, -1):
            y = sign * spread
            self.model.absorb(box((x, y, floor + height / 2 - 0.02), (0.11, width, height + 0.04), material, rotation=tilt, bevel=0.025, taper=0.88))
            self.model.absorb(box((x - 0.035, y, floor + height + 0.065), (0.085, width * 0.52, 0.11), material, rotation=tilt, bevel=0.025))
        if rear_bench is not None:
            self.model.absorb(box((rear_bench, 0, floor + height * 0.35), (0.11, spread * 2 + width, height * 0.8), material, rotation=tilt, bevel=0.025))

    def dashboard(self, x, floor, width, wheel_y, height=0.06, depth=0.24):
        self.model.absorb(box((x, 0, floor + height / 2), (depth, width, height), "interior", bevel=0.02))
        self.model.absorb(box((x - 0.04, wheel_y, floor + height + 0.015), (0.16, 0.3, 0.04), "interior", bevel=0.012))
        column = Vector((x - depth / 2 - 0.16, wheel_y, floor + height * 0.75))
        axis = Vector((-1, 0, 0.42)).normalized()
        self.model.absorb(cylinder(column + axis * -0.2, column, 0.022, "trim_black", segments=8))
        ring = [(0.165 + 0.014 * math.cos(a), 0.014 * math.sin(a)) for a in [2 * math.pi * k / 6 for k in range(6)]]
        self.model.absorb(lathe(ring, "trim_black", origin=column, axis=axis, segments=18))
        _, u, v = frame(axis)
        for spoke in (u, -u, v):
            self.model.absorb(cylinder(column, column + spoke * 0.16, 0.011, "trim_black", segments=6))

    def mirrors(self, x, z, material="body", size=(0.07, 0.17, 0.105), reach=0.07, stalk="trim_black"):
        hit = self.side(x, z)[0]
        centre = Vector((x, hit.y + reach + size[1] / 2, z + 0.03))
        self.model.add(box(centre, size, material, bevel=0.018))
        self.model.add(box(centre + Vector((-size[0] / 2 - 0.001, 0, 0)), (0.004, size[1] - 0.03, size[2] - 0.03), "mirror"))
        self.model.add(box((x, hit.y + reach / 2, z + 0.005), (0.045, reach + 0.04, 0.03), stalk, bevel=0.008))

    def handles(self, x, z, material="chrome", size=(0.12, 0.02, 0.026)):
        hit, normal = self.side(x, z)
        self.model.add(box(hit + normal * 0.006, (size[0] + 0.03, 0.006, size[2] + 0.024), "seam"))
        self.model.add(box(hit + normal * (size[1] / 2 + 0.002), size, material, bevel=0.006))

    def wipers(self, hull, inner=1, outer=4, low=1.12, high=1.3):
        lift = Vector((0.012, 0, 0.014))
        start = hull.position(low, outer) + lift
        end = hull.position(high, inner) + lift
        self.model.add(bar(start, end, 0.022, 0.012, "trim_black", up=Vector((0.5, 0, 1))))
        self.model.add(cylinder(start - lift * 1.5, start + lift, 0.016, "trim_black", segments=8))

    def vent(self, x, y, depth=0.03):
        return self.pocket(self.top, x, y, depth, "grille")
