import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, geometry
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import carkit
from carkit import (
    FLOOR,
    FORWARD,
    LEFT,
    LID,
    UP,
    Blend,
    Car,
    End,
    Hull,
    Line,
    bar,
    box,
    bump,
    closed,
    curve,
    cylinder,
    frame,
    hexahedron,
    lathe,
    mesh_object,
    recess,
    slot,
    sweep,
    tagged,
    wheel_meshes,
)
from sheets import Sheet

LENSES = {
    "head": ("lens_head", "Headlights"),
    "drl": ("lens_clear", "Headlights"),
    "tail": ("lens_tail", "Taillights"),
    "smoke": ("lens_smoke", "Taillights"),
    "amber": ("lens_amber", "Body"),
    "clear": ("lens_clear", "Body"),
    "red": ("lens_tail", "Body"),
}

WHEELS = {
    "five": {"spokes": 5, "root": 0.075, "tip": 0.06, "thick": 0.03, "lean": 0.018, "hub": 0.075},
    "star": {"spokes": 5, "twin": 0.2, "root": 0.03, "tip": 0.024, "thick": 0.03, "lean": 0.01, "hub": 0.065},
    "split": {"spokes": 5, "twin": 0.3, "root": 0.035, "tip": 0.03, "thick": 0.028, "lean": 0.012, "hub": 0.07},
    "six": {"spokes": 6, "twin": 0.16, "root": 0.03, "tip": 0.024, "thick": 0.028, "lean": 0.01, "hub": 0.065},
    "seven": {"spokes": 7, "root": 0.05, "tip": 0.04, "thick": 0.028, "lean": 0.012, "hub": 0.07},
    "ten": {"spokes": 10, "root": 0.03, "tip": 0.026, "thick": 0.026, "lean": 0.01, "hub": 0.07},
    "mesh": {"spokes": 10, "twin": 0.14, "root": 0.018, "tip": 0.016, "thick": 0.022, "lean": 0.008, "hub": 0.06},
    "blade": {"spokes": 8, "root": 0.035, "tip": 0.03, "thick": 0.024, "lean": 0.008, "hub": 0.06},
    "turbine": {"spokes": 14, "root": 0.022, "tip": 0.02, "thick": 0.022, "lean": 0.006, "hub": 0.075},
    "steel": {"style": "steel", "spokes": 8},
}


def fn(value):
    if callable(value):
        return value
    if isinstance(value, (int, float)):
        return lambda x: value
    return curve(value)


def inside(point, outline):
    x, y = point
    hit = False
    count = len(outline)
    for i in range(count):
        ax, ay = outline[i]
        bx, by = outline[(i + 1) % count]
        if (ay > y) != (by > y) and x < ax + (bx - ax) * (y - ay) / (by - ay):
            hit = not hit
    return hit


def clip(outline, axis, low, high):
    for bound, keep_above in ((low, True), (high, False)):
        result = []
        count = len(outline)
        for i in range(count):
            a = outline[i]
            b = outline[(i + 1) % count]
            a_in = a[axis] >= bound if keep_above else a[axis] <= bound
            b_in = b[axis] >= bound if keep_above else b[axis] <= bound
            if a_in:
                result.append(a)
            if a_in != b_in:
                t = (bound - a[axis]) / (b[axis] - a[axis])
                result.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        outline = result
        if len(outline) < 3:
            return []
    return outline


def grow(outline, amount):
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    result = []
    for x, y in outline:
        dx, dy = x - cx, y - cy
        length = math.hypot(dx, dy) or 1.0
        result.append((x + dx / length * amount, y + dy / length * amount))
    return result


def core(outline, share=0.3):
    low = (min(p[0] for p in outline), min(p[1] for p in outline))
    high = (max(p[0] for p in outline), max(p[1] for p in outline))
    wide, tall = high[0] - low[0], high[1] - low[1]
    inset = share * min(wide, tall)
    if wide < 1e-6 or tall < 1e-6 or inset < 0.004:
        return None
    cx = sum(p[0] for p in outline) / len(outline)
    cy = sum(p[1] for p in outline) / len(outline)
    fx = max(0.2, 1 - 2 * inset / wide)
    fy = max(0.2, 1 - 2 * inset / tall)
    return [(cx + (x - cx) * fx, cy + (y - cy) * fy) for x, y in outline]


def ellipse(centre, radii, count=14, start=0.0, end=360.0):
    points = []
    for i in range(count):
        angle = math.radians(start + (end - start) * i / (count if end - start >= 360 else count - 1))
        points.append((centre[0] + radii[0] * math.cos(angle), centre[1] + radii[1] * math.sin(angle)))
    return points


def loft(sections, material, caps=True, smooth=True):
    bm = bmesh.new()
    rings = [[bm.verts.new(Vector(p)) for p in section] for section in sections]
    count = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(count):
            j = (i + 1) % count
            try:
                bm.faces.new((a[i], a[j], b[j], b[i])).material_index = slot(material)
            except ValueError:
                pass
    if caps:
        for ring in (rings[0], rings[-1]):
            try:
                bm.faces.new(ring).material_index = slot(material)
            except ValueError:
                pass
    closed(bm)
    if not smooth:
        for face in bm.faces:
            face.smooth = False
    return bm


def superellipse(centre, half_width, half_height, power=2.6, count=16, squash=1.0):
    x, y, z = centre
    points = []
    for i in range(count):
        angle = 2 * math.pi * i / count
        cosine, sine = math.cos(angle), math.sin(angle)
        a = abs(cosine) ** (2 / power) * (1 if cosine >= 0 else -1)
        b = abs(sine) ** (2 / power) * (1 if sine >= 0 else -1)
        points.append((x, y + a * half_width, z + b * half_height * (squash if b < 0 else 1.0)))
    return points


def airfoil(x, z, chord, thickness, angle, y, count=5):
    points = []
    lean = math.radians(angle)
    upper = [(t, thickness * 0.5 * math.sin(math.pi * t**0.6)) for t in [i / count for i in range(count + 1)]]
    lower = [(t, -thickness * 0.35 * math.sin(math.pi * t**0.7)) for t in [i / count for i in range(count - 1, 0, -1)]]
    for t, h in upper + lower:
        along = (0.5 - t) * chord
        points.append((x + along * math.cos(lean) + h * math.sin(lean), y, z + along * -math.sin(lean) + h * math.cos(lean)))
    return points


def extent(bm):
    low = Vector((1e9, 1e9, 1e9))
    high = -low
    for vert in bm.verts:
        low = Vector(map(min, low, vert.co))
        high = Vector(map(max, high, vert.co))
    return low, high


def refine(bm, levels=1, crease=0.72, keep=(True, True, False)):
    if levels < 1:
        return bm
    before = extent(bm)
    layer = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    for edge in bm.edges:
        edge[layer] = 0.0 if edge.smooth else crease
    mesh = bpy.data.meshes.new("refine")
    bm.to_mesh(mesh)
    item = bpy.data.objects.new("refine", mesh)
    bpy.context.scene.collection.objects.link(item)
    modifier = item.modifiers.new("refine", "SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = levels
    modifier.render_levels = levels
    modifier.use_limit_surface = False
    graph = bpy.context.evaluated_depsgraph_get()
    graph.update()
    result = bmesh.new()
    result.from_object(item, graph)
    bpy.data.objects.remove(item)
    bpy.data.meshes.remove(mesh)
    bm.free()
    after = extent(result)
    for axis in range(3):
        if not keep[axis]:
            continue
        span = after[1][axis] - after[0][axis]
        if span < 1e-6:
            continue
        scale = (before[1][axis] - before[0][axis]) / span
        for vert in result.verts:
            vert.co[axis] = before[0][axis] + (vert.co[axis] - after[0][axis]) * scale
    for face in result.faces:
        face.smooth = True
    for edge in result.edges:
        edge.smooth = True
    result.normal_update()
    return result


def sealed(bm):
    return all(len(edge.link_faces) == 2 for edge in bm.edges)


def difference(target, cutter, solver, split):
    if split:
        target = target.copy()
        bmesh.ops.triangulate(target, faces=[face for face in target.faces if len(face.verts) > 4])
    body = mesh_object(target, "carve_target")
    tool = mesh_object(cutter, "carve_tool")
    modifier = body.modifiers.new("carve", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = solver
    if solver == "EXACT":
        modifier.material_mode = "INDEX"
    modifier.object = tool
    graph = bpy.context.evaluated_depsgraph_get()
    graph.update()
    result = bmesh.new()
    result.from_object(body, graph)
    for item in (body, tool):
        mesh = item.data
        bpy.data.objects.remove(item)
        bpy.data.meshes.remove(mesh)
    if split:
        target.free()
    bmesh.ops.remove_doubles(result, verts=result.verts, dist=1e-6)
    bmesh.ops.dissolve_degenerate(result, edges=result.edges, dist=1e-7)
    return result


def carve(target, cutters, missed=None):
    for index, cutter in enumerate(cutters):
        bmesh.ops.triangulate(cutter, faces=cutter.faces[:])
        before = target.calc_volume(signed=True)
        for solver, split in (("EXACT", False), ("EXACT", True), ("FAST", True)):
            result = difference(target, cutter, solver, split)
            volume = result.calc_volume(signed=True)
            if before * 0.4 < volume < before - 1e-7 and sealed(result):
                target.free()
                target = result
                break
            result.free()
        else:
            if missed is not None:
                missed.add(index)
            print(f"left out cutter {index}: the cut did not settle")
        cutter.free()
    return target


class PolyPocket:
    def __init__(self, car, caster, outline, depth, mirror):
        self.car = car
        self.caster = caster
        self.outline = outline
        self.depth = depth
        self.mirror = mirror

    def bounds(self, axis):
        values = [p[axis] for p in self.outline]
        return min(values), max(values)

    def bars(self, count, material="trim_black", axis=1, share=0.3, sink=0.35, thickness=0.012, margin=0.0, group="Body"):
        low, high = self.bounds(axis)
        low += margin
        high -= margin
        for n in range(count):
            centre = low + (high - low) * (n + 0.5) / count
            size = (high - low) / count * share
            piece = clip(self.outline, axis, centre - size / 2, centre + size / 2)
            if len(piece) >= 3:
                self.car.patch(self.caster, piece, material, lift=-self.depth * sink, thickness=thickness, mirror=self.mirror, group=group, step=0.08)

    def mesh(self, columns, rows, material="trim_black", share=0.16, sink=0.3, thickness=0.008):
        self.bars(rows, material, axis=1, share=share, sink=sink, thickness=thickness)
        self.bars(columns, material, axis=0, share=share * 0.8, sink=sink, thickness=thickness)

    def fill(self, material, sink=0.5, shrink=0.0, group="Body", thickness=0.0):
        outline = grow(self.outline, -shrink) if shrink else self.outline
        self.car.patch(self.caster, outline, material, lift=-self.depth * sink, thickness=thickness, mirror=self.mirror, group=group)


class Coach(Car):
    def __init__(self, name, wheel="five", rear_wheel=None, sheet=None, **style):
        sheet = Sheet(name, sheet)
        self.sheet = sheet
        look = dict(WHEELS[wheel] if isinstance(wheel, str) else wheel)
        look.update(style)
        back = dict(look)
        if rear_wheel:
            back.update(WHEELS[rear_wheel] if isinstance(rear_wheel, str) else rear_wheel)
        front = dict(look, radius=sheet.tyre_front["radius"], width=sheet.tyre_front["width"], rim=sheet.tyre_front["rim"] + 0.012)
        rear = dict(back, radius=sheet.tyre_rear["radius"], width=sheet.tyre_rear["width"], rim=sheet.tyre_rear["rim"] + 0.012)
        super().__init__(name, sheet.wheelbase, sheet.track_front, front, rear)
        self.tracks = (sheet.track_front, sheet.track_rear)
        self.nose_x = sheet.nose
        self.stern_x = sheet.stern
        self.width = sheet.width
        self.height = sheet.height
        self.cabin_tree = None
        self.paint = "#8a8d90"
        self.open_top = False
        self.carved = False
        self.lamp_jobs = []

    smoothing = 1

    def body(self, hull, paint):
        self.hull = hull
        self.shell = refine(hull.build(paint), self.smoothing)
        self.tree = BVHTree.FromBMesh(self.shell)

    def cut(self, angle=34):
        stock = carkit.subtract
        missed = set()
        carkit.subtract = lambda target, cutters: carve(target, cutters, missed)
        try:
            super().cut(angle)
        finally:
            carkit.subtract = stock
        self.carved = True
        for indices, build in self.lamp_jobs:
            build(not (set(indices) & missed))
        self.lamp_jobs = []

    def cast(self, origin, direction):
        best = None
        for tree in (self.tree, self.cabin_tree):
            if tree is None:
                continue
            location, normal, _, distance = tree.ray_cast(Vector(origin), Vector(direction))
            if location is not None and (best is None or distance < best[2]):
                best = (location, normal, distance)
        if best is None:
            raise ValueError(f"{self.model.name}: ray from {tuple(origin)} missed the body")
        return best[0], best[1]

    def outline_at(self, rear):
        row = self.hull.grid[4]
        points = [Vector((p.x, p.y, 0)) for p in row]
        if rear:
            points = points[::-1]
        lengths = [0.0]
        for a, b in zip(points, points[1:]):
            lengths.append(lengths[-1] + (b - a).length)
        return points, lengths

    def wrap(self, rear=False):
        points, lengths = self.outline_at(rear)

        def caster(t, z):
            if t < 0:
                location, normal = caster(-t, z)
                return Vector((location.x, -location.y, location.z)), Vector((normal.x, -normal.y, normal.z))
            t = min(lengths[-1] - 1e-6, t)
            index = 0
            while lengths[index + 1] < t:
                index += 1
            span = lengths[index + 1] - lengths[index]
            share = (t - lengths[index]) / span if span > 1e-9 else 0.0
            here = points[index].lerp(points[index + 1], share)
            before = points[max(0, index - 1)]
            after = points[min(len(points) - 1, index + 2)]
            tangent = (after - before).normalized()
            normal = Vector((tangent.y, -tangent.x, 0))
            if rear:
                normal = -normal
            if here.y < 1e-6:
                normal = Vector((-1 if rear else 1, 0, 0))
            if normal.y < 0:
                normal = Vector((normal.x, 0, 0)).normalized()
            for step in range(14):
                try:
                    return self.cast(Vector((here.x, here.y, z + 0.02 * step)) + normal * 3, -normal)
                except ValueError:
                    continue
            raise ValueError(f"{self.model.name}: wrap ray at {t:.2f}, {z:.2f} missed the body")

        return caster

    def nose(self, y, z):
        for step in range(14):
            try:
                return self.cast((8, y, z + 0.02 * step), (-1, 0, 0))
            except ValueError:
                continue
        raise ValueError(f"{self.model.name}: nose ray at {y:.2f}, {z:.2f} missed the body")

    def tail(self, y, z):
        for step in range(14):
            try:
                return self.cast((-8, y, z + 0.02 * step), (1, 0, 0))
            except ValueError:
                continue
        raise ValueError(f"{self.model.name}: tail ray at {y:.2f}, {z:.2f} missed the body")

    @property
    def front(self):
        return self.wrap(False)

    @property
    def back(self):
        return self.wrap(True)

    def skin(
        self,
        half,
        shoulder,
        waist,
        sill,
        crown=0.03,
        flare=(0.02, 0.025),
        keys=None,
        front=None,
        rear=None,
        inset=0.04,
        shelf=0.05,
        rise=0.012,
        flank=0.012,
        belly=0.006,
        tuck=0.1,
        relief=None,
        rear_lift=None,
        front_lift=None,
        paint=None,
        cladding=0,
        cladding_material="trim_black",
        sharp=(True, True, True, True, False),
        clearance=None,
        fit=True,
        margin=0.008,
        fascia=6,
        corner=4,
        step=0.11,
        lid_rows=5,
    ):
        nose, stern, axle = self.nose_x, self.stern_x, self.axle
        half_raw = fn(half)
        shoulder = fn(shoulder)
        waist = fn(waist)
        sill = fn(sill)
        crown = fn(crown)
        clearance = self.sheet.clearance if clearance is None else clearance
        if callable(flare):
            flare_at = flare
        else:
            front_reach = self.front_wheel["radius"] * 1.9
            rear_reach = self.rear_wheel["radius"] * 1.9
            flare_at = lambda x: flare[0] * bump(x, axle, front_reach) + flare[1] * bump(x, -axle, rear_reach)
        scale = 1.0
        if fit:
            samples = [stern + (nose - stern) * i / 240 for i in range(241)]
            for _ in range(4):
                widest = max(samples, key=lambda x: half_raw(x) * scale + flare_at(x))
                scale = (self.width / 2 - margin - flare_at(widest)) / half_raw(widest)
        half_at = lambda x: half_raw(x) * scale
        front = dict({"set": (0.16, 0.07, 0.02, 0.0, 0.035, 0.085), "bow": 0.06, "flat": 0.76, "power": 2.6}, **(front or {}))
        rear = dict({"set": (0.14, 0.06, 0.015, 0.0, 0.03, 0.075), "bow": 0.05, "flat": 0.78, "power": 2.6}, **(rear or {}))
        keys = keys or [nose - 0.3, axle, 0.45, -0.45, -axle, stern + 0.28]
        relief = relief or (lambda x, y: 0.0)
        front_radius = self.front_wheel["radius"]
        rear_radius = self.rear_wheel["radius"]
        tail_floor = clearance + rear_lift if rear_lift is not None else max(clearance, min(sill(stern) - 0.08, rear_radius * 0.85))
        nose_floor = clearance + front_lift if front_lift is not None else max(clearance, min(sill(nose) - 0.07, clearance + 0.05))

        def ease(t):
            t = max(0.0, min(1.0, t))
            return t * t * (3 - 2 * t)

        def under(x):
            back = ease((-axle - rear_radius * 0.95 - x) / 0.28)
            fore = ease((x - axle - front_radius * 0.95) / 0.28)
            return clearance + (tail_floor - clearance) * back + (nose_floor - clearance) * fore

        def edge(x):
            return max(0.05, half_at(x) - inset - shelf)

        def lid(x, y):
            return shoulder(x) + rise + crown(x) * (1 - min(1.0, abs(y) / edge(x)) ** 2) + relief(x, y)

        def end(data, n, toward):
            pick = lambda value: value[n] if isinstance(value, (list, tuple)) else value
            return End(toward(pick(data["set"])), pick(data["bow"]), pick(data["flat"]), pick(data["power"]))

        def line(n, offset, share, height, is_sharp):
            return Line(
                lambda x: half_at(x) - offset + flare_at(x) * share,
                height,
                keys,
                end(front, n, lambda back: nose - back),
                end(rear, n, lambda back: stern + back),
                is_sharp,
            )

        floor = line(0, tuck, 0.0, lambda x, y: min(under(x), sill(x) - 0.055), False)
        skirt = line(1, 0.03, 0.3, lambda x, y: min(under(x) + 0.035, sill(x) - 0.02), sharp[0])
        low = line(2, 0.006, 0.7, lambda x, y: sill(x), sharp[1])
        middle = line(3, 0.0, 1.0, lambda x, y: waist(x), sharp[2])
        high = line(4, inset, 0.45, lambda x, y: shoulder(x), sharp[3])
        top = line(5, inset + shelf, 0.0, lid, sharp[4])
        lines = [floor, skirt, low, Blend(low, middle, 0.5, belly), middle, Blend(middle, high, 0.55, flank), high, top]
        hull = Hull(lines, lid, fascia=fascia, corner=corner, step=step, lid_rows=lid_rows)

        def default(band, station, point):
            if band == 0:
                return "underbody"
            if band <= cladding:
                return cladding_material
            return "body"

        self.body(hull, paint or default)
        self.lid = lid
        self.half_at = half_at
        self.shoulder_at = shoulder
        self.waist_at = waist
        self.sill_at = sill
        self.inset = inset
        self.shelf = shelf
        return hull

    def arches(self, gap, inner=0.11, material="underbody", rear_gap=None):
        from carkit import prism

        self.arch_list = []
        for sign, spec, clearance, track in ((1, self.front_wheel, gap, self.tracks[0]), (-1, self.rear_wheel, rear_gap or gap, self.tracks[1])):
            centre = sign * self.axle
            hub = spec["radius"]
            reach = hub + clearance
            outline = [(centre + reach, -0.3)]
            for s in range(25):
                angle = math.pi * s / 24
                outline.append((centre + reach * math.cos(angle), hub + reach * math.sin(angle)))
            outline.append((centre - reach, -0.3))
            near = track / 2 - spec["width"] / 2 - inner
            for flip in (1, -1):
                self.cutters.append(prism(outline, flip * near, flip * 3.0, material))
            self.arch_list.append((centre, hub, reach))

    def place_wheels(self):
        front_left, front_right = wheel_meshes(self.front_wheel, "front_wheel")
        rear_left, rear_right = wheel_meshes(self.rear_wheel, "rear_wheel")
        front, rear = self.tracks[0] / 2, self.tracks[1] / 2
        self.model.wheels = [
            ("Wheel_FL", (self.axle, front, self.front_wheel["radius"]), front_left),
            ("Wheel_FR", (self.axle, -front, self.front_wheel["radius"]), front_right),
            ("Wheel_RL", (-self.axle, rear, self.rear_wheel["radius"]), rear_left),
            ("Wheel_RR", (-self.axle, -rear, self.rear_wheel["radius"]), rear_right),
        ]

    def cabin(
        self,
        screen,
        back,
        roof,
        windows,
        rail=None,
        base=None,
        base_inset=0.1,
        tumble=0.14,
        drop=0.05,
        bow=(0.12, 0.06),
        rail_bow=(0.08, 0.04),
        flat=(0.86, 0.8),
        power=(2.2, 2.2),
        crest=0.07,
        bulge=0.018,
        pillar="body",
        roof_material="body",
        glass_front=True,
        glass_rear=True,
        sill=0.08,
        header=0.93,
        fit=True,
        frame_width=0.02,
        step=0.16,
        fascia=5,
        corner=3,
    ):
        body_lid = self.lid
        base_at = fn(base) if base is not None else (lambda x: self.half_at(x) - base_inset)
        points = sorted(roof)
        if fit:
            lift = self.height - max(z for _, z in points)
            points = [(x, z + lift) for x, z in points]
        centre = curve(points)
        if rail is None:
            widest = min(base_at(x) for x in (screen[0], (screen[0] + back[1]) / 2, back[1]))
            reach = widest - tumble
            rail_at = curve(sorted([(back[0], reach * 0.94), ((screen[1] + back[0]) / 2, reach), (screen[1], reach * 0.96)]))
        else:
            rail_at = fn(rail)

        def roof_at(x, y):
            return centre(x) - drop * min(1.0, abs(y) / rail_at(x)) ** 2.4

        base_keys = []
        rail_keys = []
        for start, finish in windows:
            base_keys += [start[0], finish[0]]
            rail_keys += [start[1], finish[1]]
        glass_keys = set(range(0, len(base_keys) - 1, 2))
        base_front = End(screen[0], bow[0], flat[0], power[0])
        base_rear = End(back[1], bow[1], flat[1], power[1])
        rail_front = End(screen[1], rail_bow[0], flat[0] - 0.02, power[0])
        rail_rear = End(back[0], rail_bow[1], flat[1], power[1])
        base_line = Line(base_at, lambda x, y: body_lid(x, y) - 0.012, base_keys, base_front, base_rear)
        rail_line = Line(rail_at, roof_at, rail_keys, rail_front, rail_rear)
        crest_line = Line(
            lambda x: rail_at(x) - crest,
            roof_at,
            rail_keys,
            End(rail_front.tip - crest * 0.8, rail_front.bow, rail_front.flat, rail_front.power),
            End(rail_rear.tip + crest * 0.8, rail_rear.bow, rail_rear.flat, rail_rear.power),
        )
        lines = [
            base_line,
            Blend(base_line, rail_line, sill, sharp=True),
            Blend(base_line, rail_line, 0.5, bulge),
            Blend(base_line, rail_line, header, sharp=True),
            rail_line,
            crest_line,
        ]
        hull = Hull(lines, roof_at, floor=lambda x, y: body_lid(x, y) + 0.004, fascia=fascia, corner=corner, step=step, lid_rows=4)

        def paint(band, station, point):
            return roof_material if band == LID else pillar

        bm = refine(hull.build(paint, floor_material="interior"), self.smoothing, keep=(True, True, True))
        bm.normal_update()
        self.cabin_tree = BVHTree.FromBMesh(bm)
        band_layer = bm.faces.layers.int["band"]
        for face in bm.faces:
            if face[band_layer] == FLOOR:
                face.normal_flip()

        def is_glass(station):
            if station[0] == "front":
                return glass_front
            if station[0] == "rear":
                return glass_rear
            return station[0] == "side" and station[1] in glass_keys

        panes = tagged(bm, {1, 2}, is_glass, hull)
        pane_set = set(panes)
        outer = [f for f in bm.faces if f not in pane_set and f[band_layer] != FLOOR]
        lining = bmesh.ops.duplicate(bm, geom=outer)
        liner_faces = [item for item in lining["geom"] if isinstance(item, bmesh.types.BMFace)]
        for face in liner_faces:
            face.material_index = slot("interior")
        for vert in {v for face in liner_faces for v in face.verts}:
            vert.co -= vert.normal * 0.008
        bmesh.ops.reverse_faces(bm, faces=liner_faces)
        recess(bm, panes, frame_width, 0.012, "trim_black", "glass")
        self.cabin_hull = hull
        self.model.absorb(bm, "Body")
        self.roof = roof_at
        self.screen = screen
        self.cabin_floor = body_lid((screen[0] + back[1]) / 2, 0) + 0.004
        return hull

    def interior(self, seat=None, spread=0.34, rear_bench=None, dash=None, height=0.16, width=0.46, material="seat", wheel_side=1):
        seat = self.screen[0] - 0.95 if seat is None else seat
        dash = self.screen[0] - 0.42 if dash is None else dash
        floor = self.lid(seat, 0) + 0.004
        self.seats(seat, floor, spread, height=height, width=width, rear_bench=rear_bench, material=material)
        self.dashboard(dash, floor, spread * 2 + 0.44, wheel_side * spread, height=0.05)

    def patch(self, caster, outline, material, lift=0.004, thickness=0.0, group="Body", mirror=True, step=0.05, strict=False):
        boundary = []
        count = len(outline)
        for i in range(count):
            a = outline[i]
            b = outline[(i + 1) % count]
            pieces = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
            for n in range(pieces):
                boundary.append((a[0] + (b[0] - a[0]) * n / pieces, a[1] + (b[1] - a[1]) * n / pieces))
        low = (min(p[0] for p in outline), min(p[1] for p in outline))
        high = (max(p[0] for p in outline), max(p[1] for p in outline))
        columns = max(1, math.ceil((high[0] - low[0]) / step))
        rows = max(1, math.ceil((high[1] - low[1]) / step))
        points = list(boundary)
        for i in range(1, columns):
            for j in range(1, rows):
                point = (low[0] + (high[0] - low[0]) * i / columns, low[1] + (high[1] - low[1]) * j / rows)
                if not inside(point, outline):
                    continue
                if min(math.hypot(point[0] - b[0], point[1] - b[1]) for b in boundary) < step * 0.3:
                    continue
                points.append(point)
        edges = [(i, (i + 1) % len(boundary)) for i in range(len(boundary))]
        result = geometry.delaunay_2d_cdt([Vector(p) for p in points], edges, [list(range(len(boundary)))], 1, 1e-7)
        flat_points, triangles = result[0], result[2]
        bm = bmesh.new()
        verts = []
        spots = {}
        normal_sum = Vector()
        plate = material == "plate"
        if plate:
            group = "Plate"
            thickness = 0.0
        for point in flat_points:
            try:
                location, normal = caster(point.x, point.y)
            except ValueError:
                if strict:
                    raise
                verts.append(None)
                continue
            normal_sum += normal
            made = bm.verts.new(location + normal * lift)
            spots[made] = ((point.x - low[0]) / max(1e-6, high[0] - low[0]), (point.y - low[1]) / max(1e-6, high[1] - low[1]))
            verts.append(made)
        for triangle in triangles:
            corners = [verts[i] for i in triangle]
            if any(v is None for v in corners) or len(set(corners)) < 3:
                continue
            try:
                bm.faces.new(corners).material_index = slot(material)
            except ValueError:
                pass
        if not bm.faces:
            bm.free()
            print(f"{self.model.name}: a {material} patch missed the body")
            return
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if sum((face.normal.dot(normal_sum) * face.calc_area() for face in bm.faces), 0.0) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        if plate:
            layer = bm.loops.layers.uv.verify()
            flip = normal_sum.x < 0
            for face in bm.faces:
                for loop in face.loops:
                    u, v = spots[loop.vert]
                    loop[layer].uv = (1 - u if flip else u, v)
        if thickness > 0:
            rim = [e for e in bm.edges if len(e.link_faces) == 1]
            made = bmesh.ops.extrude_edge_only(bm, edges=rim)
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
        for face in bm.faces:
            face.smooth = True
        if mirror:
            self.model.add(bm, group)
        else:
            self.model.absorb(bm, group)

    def lamp(self, caster, outline, kind="head", bezel=None, lift=0.005, thickness=0.012, mirror=True, margin=0.005):
        material, group = LENSES[kind]
        if bezel:
            self.patch(caster, grow(outline, margin), bezel, lift=lift * 0.5, thickness=thickness, mirror=mirror)
        self.patch(caster, outline, material, lift=lift + (0.004 if bezel else 0.0), thickness=thickness, group=group, mirror=mirror)
        if kind == "tail":
            self.glow(caster, outline, lift + 0.008, mirror)

    def glow(self, caster, outline, lift, mirror):
        inner = core(outline)
        if inner:
            self.patch(caster, inner, "lens_ember", lift=lift, group="Taillights", mirror=mirror)
        self.patch(caster, outline, "cover", lift=lift + 0.006, thickness=0.006, mirror=mirror)

    def headlamp(self, caster, outline, projectors=(), strips=(), housing="grille", cover=True, mirror=True, lift=0.004, depth=0.04):
        def build(sunk):
            if not sunk:
                self.patch(caster, outline, housing, lift=lift, thickness=0.012, mirror=mirror)
            floor = -(depth - 0.004) if sunk else lift
            for a, b, radius in projectors:
                self.disc(caster, a, b, radius, "head", bezel="chrome", depth=0.02 if sunk else 0.014, mirror=mirror, sink=-floor)
            for strip in strips:
                self.patch(caster, strip, "lens_clear", lift=-depth * 0.45 if sunk else lift + 0.006, thickness=0.006, group="Headlights", mirror=mirror)
            if cover:
                self.patch(caster, outline, "cover", lift=0.0015 if sunk else lift + 0.02, thickness=0.0 if sunk else 0.016, mirror=mirror)

        if self.carved or depth <= 0:
            build(False)
            return
        first = len(self.cutters)
        try:
            self.hollow(caster, outline, depth, material=housing, mirror=mirror)
        except ValueError:
            build(False)
            return
        self.lamp_jobs.append((range(first, len(self.cutters)), build))

    def taillamp(self, caster, outline, strips=(), dark=(), clear=(), housing=None, mirror=True, lift=0.005):
        if housing:
            self.patch(caster, grow(outline, 0.005), housing, lift=lift * 0.5, thickness=0.01, mirror=mirror)
        self.patch(caster, outline, "lens_smoke" if strips else "lens_tail", lift=lift, thickness=0.012, group="Body" if strips else "Taillights", mirror=mirror)
        for strip in strips:
            self.patch(caster, strip, "lens_ember", lift=lift + 0.006, thickness=0.004, group="Taillights", mirror=mirror)
        if not strips and not dark:
            self.glow(caster, outline, lift + 0.004, mirror)
        for piece in dark:
            self.patch(caster, piece, "trim_black", lift=lift + 0.006, thickness=0.004, mirror=mirror)
        for piece in clear:
            self.patch(caster, piece, "lens_clear", lift=lift + 0.006, thickness=0.004, mirror=mirror)

    def mirrors(self, x, z=None, material="body", size=(0.08, 0.17, 0.1), reach=0.05, stalk="trim_black", lift=0.05):
        mount = self.shoulder_at(x) - 0.03 if z is None else z
        hit = self.side(x, mount)[0]
        centre = Vector((x, hit.y + reach + size[1] / 2, mount + lift))
        self.model.add(box(centre, size, material, bevel=0.02))
        self.model.add(box(centre + Vector((-size[0] / 2 - 0.001, 0, 0)), (0.004, size[1] - 0.03, size[2] - 0.03), "mirror"))
        self.model.add(bar(Vector((x, hit.y - 0.02, mount)), centre - Vector((0, size[1] / 2, 0)), 0.04, 0.025, stalk, up=FORWARD))

    def grips(self, positions, z=None, material="body", size=(0.14, 0.022, 0.03)):
        for x in positions:
            height = self.shoulder_at(x) - 0.09 if z is None else z
            hit, normal = self.side(x, height)
            self.model.add(box(hit + normal * 0.004, (size[0] + 0.03, 0.006, size[2] + 0.024), "seam"))
            self.model.add(box(hit + normal * (size[1] / 2 + 0.002), size, material, bevel=0.007))

    def disc(self, caster, a, b, radius, kind="head", bezel="chrome", depth=0.03, mirror=True, sink=0.0):
        material, group = LENSES[kind]
        hit, normal = caster(a, b)
        origin = hit - normal * sink
        lens = lathe(
            [(0, 0.0), (radius * 0.86, 0.0), (radius * 0.86, depth * 0.62), (radius * 0.62, depth * 0.88), (radius * 0.3, depth), (0, depth * 1.03)],
            material,
            origin=origin,
            axis=normal,
            segments=18,
        )
        parts = [(lens, group)]
        if bezel:
            ring = lathe(
                [(radius * 0.84, 0.0), (radius, 0.0), (radius, depth * 0.8), (radius * 0.92, depth * 0.95), (radius * 0.84, depth * 0.8)],
                bezel,
                origin=origin,
                axis=normal,
                segments=18,
            )
            parts.append((ring, "Body"))
        for part, target in parts:
            if mirror:
                self.model.add(part, target)
            else:
                self.model.absorb(part, target)

    def hollow(self, caster, outline, depth, material="grille", mirror=True, proud=0.3):
        hits = []
        normal_sum = Vector()
        for a, b in outline:
            location, normal = caster(a, b)
            hits.append(location)
            normal_sum += normal
        normal = normal_sum.normalized()
        floor = [h - normal * depth for h in hits]
        roof = [h + normal * proud for h in hits]
        for flip in (1, -1) if mirror else (1,):
            scale = Vector((1, flip, 1))
            bm = bmesh.new()
            low = [bm.verts.new(p * scale) for p in floor]
            high = [bm.verts.new(p * scale) for p in roof]
            count = len(low)
            for i in range(count):
                j = (i + 1) % count
                bm.faces.new((low[i], low[j], high[j], high[i])).material_index = slot(material)
            bm.faces.new(low).material_index = slot(material)
            bm.faces.new(high).material_index = slot(material)
            self.cutters.append(closed(bm))
        return PolyPocket(self, caster, outline, depth, mirror)

    def wing(self, x, z, span, chord=0.26, thickness=0.03, angle=8, material="body", plates=None, pylons=None, swan=False, plate_material=None, gurney=0.0):
        sections = [airfoil(x, z, chord, thickness, angle, y) for y in (-span / 2, -span / 4, 0, span / 4, span / 2)]
        self.model.absorb(loft(sections, material))
        if gurney:
            lean = math.radians(angle)
            back = x - chord / 2 * math.cos(lean)
            top = z + chord / 2 * math.sin(lean)
            self.model.absorb(box((back, 0, top + gurney / 2), (0.006, span, gurney), "trim_black"))
        if plates:
            height, length = plates
            for side in (1, -1):
                self.model.absorb(box((x - 0.01, side * (span / 2 + 0.006), z - height * 0.2), (length, 0.012, height), plate_material or material, bevel=0.004))
        for y in pylons or ():
            base = self.top(x + 0.02, y)[0]
            for side in (1, -1):
                foot = Vector((base.x, side * y, base.z - 0.01))
                if swan:
                    head = Vector((x + chord * 0.1, side * y, z + thickness))
                    knee = Vector((x + chord * 0.55, side * y, z + thickness * 0.4))
                    self.model.absorb(bar(foot, knee, 0.012, 0.05, "trim_black", up=LEFT))
                    self.model.absorb(bar(knee, head, 0.012, 0.04, "trim_black", up=LEFT))
                else:
                    head = Vector((x, side * y, z - thickness * 0.3))
                    self.model.absorb(bar(foot, head, 0.014, 0.07, plate_material or "trim_black", up=LEFT))

    def lip(self, x, z, span, depth=0.08, thickness=0.02, material="trim_black", sweep_back=0.0):
        centre = Vector((x, 0, z))
        sections = []
        for y in (-span / 2, -span / 4, 0, span / 4, span / 2):
            back = sweep_back * (abs(y) / (span / 2)) ** 2
            sections.append(
                [
                    (centre.x - back + depth / 2, y, z - thickness / 2),
                    (centre.x - back + depth / 2, y, z + thickness / 2),
                    (centre.x - back - depth / 2, y, z + thickness / 2),
                    (centre.x - back - depth / 2, y, z - thickness / 2),
                ]
            )
        self.model.absorb(loft(sections, material, smooth=False))

    def fins(self, x, z, count, span, length=0.3, height=0.1, material="trim_black"):
        for n in range(count):
            y = -span / 2 + span * n / (count - 1)
            self.model.absorb(box((x, y, z), (length, 0.012, height), material))

    def pipes(self, positions, x, z, radius=0.04, length=0.16, material="chrome"):
        for y in positions:
            outer = lathe([(radius * 0.78, 0), (radius, 0), (radius, length), (radius * 0.78, length)], material, origin=(x, y, z), axis=(1, 0, 0), segments=14)
            self.model.absorb(outer)
            self.model.absorb(cylinder((x + 0.03, y, z), (x + length, y, z), radius * 0.8, "seam", segments=10))

    def seams(self, fronts, low=None, high=None, steps=10):
        low = low or (lambda x: self.sill_at(x) + 0.012)
        high = high or (lambda x: self.shoulder_at(x) - 0.012)
        for x in fronts:
            self.stroke((x, low(x)), (x, high(x)), self.side, steps=steps)
        if len(fronts) > 1:
            first, last = max(fronts), min(fronts)
            self.stroke((first, low(first) + 0.002), (last, low(last) + 0.002), self.side, steps=12)

    def bonnet(self, back, half, front=None, steps=12):
        front = self.nose_x - 0.12 if front is None else front
        self.stroke((back, half), (front, half * 0.9), self.top, steps=steps)
        self.stroke((back, -half), (back, half), self.top, steps=steps, mirror=False)

    def tub(self, front, back, half, depth=0.34, material="interior"):
        top = max(self.lid(front, 0), self.lid(back, 0)) + 0.3
        floor = min(self.lid(front, 0), self.lid(back, 0)) - depth
        centre = ((front + back) / 2, 0, (top + floor) / 2)
        self.carve(box(centre, (front - back, half * 2, top - floor), material, bevel=0.05))
        self.open_top = True
        self.cabin_floor = floor
        return floor

    def windscreen(self, base, top, height, half_base, half_top, bow=0.14, material="trim_black", side_glass=0.0, thickness=0.028):
        columns = 9
        rows = []
        for level in (0.0, 1.0):
            x = base + (top - base) * level
            half = half_base + (half_top - half_base) * level
            z = self.lid(base, 0) - 0.01 + (height - self.lid(base, 0) + 0.01) * level
            row = []
            for n in range(columns):
                a = -1 + 2 * n / (columns - 1)
                row.append(Vector((x - bow * a * a * (1 - 0.25 * level), a * half, z - 0.02 * a * a * level)))
            rows.append(row)
        bm = bmesh.new()
        grid = [[bm.verts.new(p) for p in row] for row in rows]
        for n in range(columns - 1):
            for flip in (False, True):
                loop = [grid[0][n], grid[0][n + 1], grid[1][n + 1], grid[1][n]]
                if flip:
                    loop = [bm.verts.new(v.co) for v in loop][::-1]
                bm.faces.new(loop).material_index = slot("glass")
        self.model.absorb(bm)
        top_row = rows[1]
        for a, b in zip(top_row, top_row[1:]):
            self.model.absorb(bar(a, b, thickness, thickness * 0.8, material, up=Vector((1, 0, 0.6))))
        for side in (0, -1):
            self.model.absorb(bar(rows[0][side], rows[1][side], thickness * 1.2, thickness, material, up=LEFT))
        if side_glass:
            for side in (1, -1):
                low = rows[0][0 if side < 0 else -1]
                high = rows[1][0 if side < 0 else -1]
                tail = Vector((low.x - side_glass, low.y * 1.02, low.z))
                part = bmesh.new()
                loop = [part.verts.new(p) for p in (low, high, tail)]
                part.faces.new(loop).material_index = slot("glass")
                part.faces.new([part.verts.new(v.co) for v in loop][::-1]).material_index = slot("glass")
                self.model.absorb(part)
                self.model.absorb(bar(high, tail, thickness * 0.7, thickness * 0.6, material, up=LEFT))
        self.screen = (base, top)

    def hoop(self, x, y, height, width=0.3, material="chrome", tube=0.02):
        base = self.lid(x, y)
        points = []
        for n in range(9):
            angle = math.pi * n / 8
            points.append(Vector((x, y + math.cos(angle) * width / 2, base - 0.02 + math.sin(angle) * height)))
        for side in (1, -1):
            for a, b in zip(points, points[1:]):
                flip = Vector((1, side, 1))
                self.model.absorb(cylinder(a * flip, b * flip, tube, material, segments=8))

    def finish(self, paint=None, seat=None, **interior):
        if paint:
            self.paint = paint
        for _, build in self.lamp_jobs:
            build(False)
        self.lamp_jobs = []
        self.place_wheels()
        return self, self.paint
