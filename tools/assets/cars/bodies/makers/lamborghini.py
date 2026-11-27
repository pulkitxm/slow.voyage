import math

from carkit import LEFT, bar, box, bump, hexahedron, prism, sweep
from kit import Coach, grow, loft, refine, superellipse
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def strip(a, b, width):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy) or 1.0
    ox, oy = -dy / length * width / 2, dx / length * width / 2
    return [(a[0] + ox, a[1] + oy), (b[0] + ox, b[1] + oy), (b[0] - ox, b[1] - oy), (a[0] - ox, a[1] - oy)]


def fork(stem, joint, upper, lower, width):
    return [strip(stem, joint, width), strip(joint, upper, width), strip(joint, lower, width)]


def slats(car, start, count, pitch, half, depth=0.05, taper=0.0, material="trim_black", lift=0.008):
    for n in range(count):
        x = start - n * pitch
        reach = half - taper * n
        car.patch(car.top, [(x, -reach), (x, reach), (x - depth, reach), (x - depth, -reach)], material, lift=lift, thickness=0.01, mirror=False)


def scoop(car, front, back, half, height, material="body"):
    sections = []
    for share in (0.0, 0.25, 0.6, 1.0):
        x = front + (back - front) * share
        base = car.top(x, 0)[0].z
        rise = height * (1 - share) ** 0.8 + 0.012
        width = half * (1 - 0.55 * share)
        sections.append(superellipse((x, 0, base + rise / 2 - 0.01), width, rise / 2 + 0.01, power=3.0, count=12))
    car.model.absorb(loft(sections, material))
    base = car.top(front, 0)[0].z
    car.model.absorb(box((front + 0.004, 0, base + height / 2), (0.012, half * 1.6, height * 0.68), "grille", bevel=0.01))


def blade(car, front, back, rise, crest, material="body", thickness=0.014):
    low_front = car.top(front, 0)[0].z - 0.02
    low_back = car.top(back, 0)[0].z - 0.02
    half = thickness / 2
    corners = [
        (back, -half, low_back),
        (front, -half, low_front),
        (front, half, low_front),
        (back, half, low_back),
        (back, -half, crest),
        (front, -half, low_front + 0.02 + rise),
        (front, half, low_front + 0.02 + rise),
        (back, half, crest),
    ]
    car.model.absorb(hexahedron([Vector(c) for c in corners], material))


def canard(car, inner, outer, z, height, material="carbon"):
    start, lean = car.front(inner, z)
    end, turn = car.front(outer, z)
    car.model.add(bar(start + lean * 0.03, end + turn * 0.03, 0.012, height, material))


def strakes(car, count, span, front, back, top, low, material="trim_black", thickness=0.014):
    half = thickness / 2
    for n in range(count):
        y = -span / 2 + span * n / (count - 1)
        corners = [
            (back, y - half, low[1]),
            (front, y - half, low[0]),
            (front, y + half, low[0]),
            (back, y + half, low[1]),
            (back, y - half, top[1]),
            (front, y - half, top[0]),
            (front, y + half, top[0]),
            (back, y + half, top[1]),
        ]
        car.model.absorb(hexahedron([Vector(c) for c in corners], material))


class Wedge(Coach):
    def body(self, hull, paint):
        self.hull = hull
        cage = hull.build(paint)
        for edge in cage.edges:
            edge.seam = not edge.smooth
        self.shell = refine(cage, self.smoothing, crease=1.0)
        for edge in self.shell.edges:
            if edge.seam:
                edge.smooth = False
                edge.seam = False
        self.tree = BVHTree.FromBMesh(self.shell)

    def arches(self, gap, inner=0.11, material="underbody", rear_gap=None, cant=(None, None)):
        self.arch_list = []
        self.arch_paths = []
        ends = ((1, self.front_wheel, gap, self.tracks[0], cant[0]), (-1, self.rear_wheel, rear_gap or gap, self.tracks[1], cant[1]))
        for sign, spec, clearance, track, shape in ends:
            centre = sign * self.axle
            hub = spec["radius"]
            reach = hub + clearance
            if shape:
                crest = hub + reach
                knee = hub + reach * shape[1]
                flat = reach * shape[0]
                outline = [(centre + reach, -0.3), (centre + reach, knee), (centre + flat, crest), (centre - flat, crest), (centre - reach, knee), (centre - reach, -0.3)]
                self.arch_paths.append(outline)
            else:
                outline = [(centre + reach, -0.3)]
                for s in range(25):
                    angle = math.pi * s / 24
                    outline.append((centre + reach * math.cos(angle), hub + reach * math.sin(angle)))
                outline.append((centre - reach, -0.3))
                self.arch_list.append((centre, hub, reach))
            near = track / 2 - spec["width"] / 2 - inner
            for flip in (1, -1):
                self.cutters.append(prism(outline, flip * near, flip * 3.0, material))

    def facet_lips(self, width=0.03, proud=0.008, material="body", floor=0.2):
        for outline in self.arch_paths:
            corners = [(outline[0][0], floor)] + outline[1:-1] + [(outline[-1][0], floor)]
            normals = []
            for a, b in zip(corners, corners[1:]):
                along = Vector((b[0] - a[0], 0, b[1] - a[1])).normalized()
                normals.append(Vector((along.z, 0, -along.x)))
            path = []
            for n, corner in enumerate(corners):
                before = normals[max(0, n - 1)]
                after = normals[min(len(normals) - 1, n)]
                path.append((corner, (before + after).normalized()))
                if n < len(normals):
                    target = corners[n + 1]
                    for share in (0.33, 0.66):
                        path.append(((corner[0] + (target[0] - corner[0]) * share, corner[1] + (target[1] - corner[1]) * share), normals[n]))
            points, outs, ups = [], [], []
            for (x, z), radial in path:
                probe = Vector((x, 0, z)) + radial * 0.014
                try:
                    hit = self.side(probe.x, probe.z)[0]
                except ValueError:
                    continue
                points.append(Vector((x, hit.y, z)))
                outs.append(LEFT)
                ups.append(radial)
            profile = [(-0.03, -0.004), (proud, -0.004), (proud, width * 0.55), (0.0, width), (-0.03, width)]
            self.model.add(sweep(points, outs, ups, profile, material))

    def lips(self, width=0.02, proud=0.005):
        if self.arch_list:
            self.arch_lips(width=width, proud=proud)
        self.facet_lips(width=width + 0.006, proud=proud + 0.003)


def hexagon(centre, radius, squash=1.0):
    return [(centre[0] + radius * math.cos(math.radians(60 * n)), centre[1] + radius * squash * math.sin(math.radians(60 * n))) for n in range(6)]


def sunk(car, caster, outline, depth=0.025, material="trim_black", mirror=True):
    return car.hollow(caster, grow(outline, 0.005), depth, material=material, mirror=mirror)


def ypsilon(car, caster, outline, strips, depth=0.025, mirror=True):
    sunk(car, caster, outline, depth, mirror=mirror)
    car.patch(caster, outline, "lens_smoke", lift=-depth * 0.7, thickness=0.004, mirror=mirror)
    for piece in strips:
        car.patch(caster, piece, "lens_ember", lift=-depth * 0.35, thickness=0.008, group="Taillights", mirror=mirror)


def huracan(name, sto=False):
    car = Wedge(name, "mesh" if sto else "star", metal="rim_dark" if sto else "rim", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.91), (-axle, 1.0), (-0.45, 0.965), (0.45, 0.96), (axle, 1.0), (nose - 0.45, 0.93), (nose, 0.75)],
        shoulder=[(stern, 0.865), (-axle, 0.9), (-0.5, 0.865), (0.4, 0.83), (1.0, 0.8), (axle, 0.755), (nose - 0.5, 0.575), (nose - 0.12, 0.45), (nose, 0.425)],
        waist=[(stern, 0.7), (-axle, 0.68), (-0.3, 0.56), (axle, 0.48), (nose, 0.39)],
        sill=[(stern, 0.36), (-axle, 0.28), (-0.6, 0.22), (axle, 0.2), (nose, 0.2)],
        crown=[(stern, 0.0), (-axle, 0.0), (0.3, 0.0), (1.1, 0.0), (axle, -0.05), (nose - 0.4, -0.02), (nose, 0.0)],
        flare=(0.035, 0.035),
        keys=[nose - 0.6, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.14, 0.03, 0.05, 0.0, 0.05, 0.38), "bow": 0.2, "flat": 0.72, "power": 2.4},
        rear={"set": (0.26, 0.11, 0.05, 0.03, 0.0, 0.04), "bow": 0.05, "flat": 0.9, "power": 2.8},
        inset=0.09,
        shelf=0.02,
        flank=0.0,
        belly=-0.02,
        rear_lift=0.14,
        front_lift=0.0,
        relief=lambda x, y: 0.02 * bump(x, stern, 0.22),
        sharp=(True, True, True, True, True),
        cladding=1,
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    mouth = car.hollow(front, [(-0.34, 0.215), (0.34, 0.215), (0.3, 0.33), (-0.3, 0.33)], 0.08, mirror=False)
    mouth.mesh(12, 3)
    duct = car.hollow(front, [(0.4, 0.215), (0.98, 0.24), (1.0, 0.42), (0.54, 0.41), (0.4, 0.32)], 0.1)
    duct.mesh(9, 4)
    car.patch(front, strip((0.52, 0.22), (0.76, 0.41), 0.045), "body", lift=-0.012, thickness=0.02)
    car.patch(front, [(-0.26, 0.225), (0.26, 0.225), (0.26, 0.325), (-0.26, 0.325)], "plate", lift=0.004, mirror=False)
    if sto:
        vent = car.hollow(top, [(nose - 0.6, 0.1), (nose - 0.6, 0.46), (nose - 0.94, 0.52), (nose - 0.94, 0.14)], 0.06)
        vent.bars(2, axis=0, material="carbon", share=0.1)
        gill = car.hollow(top, [(axle + 0.24, 0.68), (axle + 0.24, 0.86), (axle - 0.2, 0.88), (axle - 0.2, 0.7)], 0.025)
        gill.bars(5, axis=0, material="body", share=0.5, sink=0.0)

    car.headlamp(
        top,
        [(nose - 0.24, 0.3), (nose - 0.31, 0.58), (nose - 0.5, 0.8), (nose - 0.62, 0.77), (nose - 0.42, 0.3)],
        projectors=[(nose - 0.36, 0.4, 0.028), (nose - 0.42, 0.53, 0.028)],
        strips=fork((nose - 0.275, 0.34), (nose - 0.335, 0.57), (nose - 0.47, 0.765), (nose - 0.56, 0.745), 0.024),
    )

    intake = car.hollow(side, [(-0.36, 0.27), (-0.84, 0.3), (-0.86, 0.56), (-0.6, 0.5)], 0.16)
    intake.mesh(5, 3)
    gulp = car.hollow(side, [(-0.5, 0.75), (-0.96, 0.78), (-0.98, 0.86), (-0.62, 0.845)], 0.1)
    gulp.bars(2, share=0.12)

    panel = car.hollow(back, [(-0.72, 0.55), (0.72, 0.55), (0.74, 0.735), (-0.74, 0.735)], 0.05, mirror=False)
    panel.mesh(20, 3)
    ypsilon(car, back, [(0.28, 0.755), (0.88, 0.75), (0.96, 0.8), (0.88, 0.845), (0.28, 0.83)], fork((0.32, 0.792), (0.58, 0.792), (0.88, 0.83), (0.88, 0.764), 0.034))
    car.patch(back, [(-0.26, 0.4), (0.26, 0.4), (0.26, 0.51), (-0.26, 0.51)], "plate", lift=0.004, mirror=False)

    car.arches(0.04, inner=0.09)
    car.cut()
    car.lips(width=0.02, proud=0.005)
    if sto:
        car.pipes((0.12, -0.12), stern + 0.02, 0.645, radius=0.058, length=0.14, material="steel")
    else:
        car.pipes((0.2, -0.2), stern + 0.02, 0.645, radius=0.056, length=0.14)
    strakes(car, 8 if sto else 6, 1.1, stern + 0.3, stern + 0.07, (0.3, 0.38), (0.21, 0.27), material="carbon" if sto else "trim_black")
    car.lip(nose - 0.12, car.sheet.clearance + 0.012, 1.56, depth=0.22 if sto else 0.16, thickness=0.02, material="carbon" if sto else "trim_black", sweep_back=0.2)
    car.seams([0.82, -0.3])
    car.bonnet(1.0, 0.6, front=nose - 0.3)
    car.mirrors(0.84, size=(0.09, 0.17, 0.08), reach=0.08, lift=0.08)
    if sto:
        car.patch(side, [(0.62, 0.3), (0.66, 0.36), (-0.3, 0.44), (-0.34, 0.38)], "livery_orange", lift=0.004)
        car.patch(top, [(nose - 0.36, -0.2), (nose - 0.36, 0.2), (nose - 0.44, 0.24), (nose - 0.44, -0.24)], "livery_orange", lift=0.005, mirror=False)

    peak = 1.165
    glass = car.cabin(
        screen=(1.2, 0.34),
        back=(-0.5, stern + 0.24),
        roof=[(-0.5, peak - 0.05), (0.05, peak), (0.34, peak - 0.03)],
        windows=[((0.92, 0.26), (-0.3, -0.14)), ((-0.36, -0.19), (-0.98, -0.44))],
        base=[(-1.0, 0.8), (-0.3, 0.8), (0.92, 0.79), (1.2, 0.78)],
        rail=[(-0.5, 0.5), (0.0, 0.56), (0.34, 0.54)],
        bow=(0.24, 0.05),
        rail_bow=(0.12, 0.03),
        flat=(0.93, 0.86),
        power=(3.0, 4.0),
        corner=5,
        bulge=0.02,
        drop=0.04,
        fit=False,
    )
    car.wipers(glass)
    slats(car, -0.74, 5, 0.22, 0.34, depth=0.12, taper=-0.04, material="carbon" if sto else "body", lift=0.012)
    if sto:
        scoop(car, -0.1, -0.74, 0.16, 0.05)
        blade(car, -0.7, stern + 0.42, 0.05, 1.16, material="livery_orange")
        car.wing(stern + 0.17, 1.142, 1.72, chord=0.28, angle=10, material="carbon", plates=(0.16, 0.32), pylons=(0.36,), plate_material="livery_orange")
    car.interior(seat=-0.02, spread=0.32, height=0.13, width=0.4, material="interior")
    return car.finish("#3f8fd6" if sto else "#f2741c")


def aventador(name, svj=False):
    car = Wedge(name, "mesh" if svj else "split", metal="rim_dark", barrel="rim_dark", lip="rim_dark" if svj else "rim")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.9), (-axle, 1.0), (-0.45, 0.955), (0.5, 0.94), (axle, 0.985), (nose - 0.5, 0.9), (nose, 0.66)],
        shoulder=[(stern, 0.86), (-axle, 0.9), (-0.5, 0.86), (0.4, 0.82), (1.1, 0.79), (axle, 0.765), (nose - 0.6, 0.59), (nose - 0.15, 0.42), (nose, 0.385)],
        waist=[(stern, 0.7), (-axle, 0.68), (-0.3, 0.54), (axle, 0.47), (nose, 0.35)],
        sill=[(stern, 0.36), (-axle, 0.28), (-0.6, 0.21), (axle, 0.2), (nose, 0.19)],
        crown=[(stern, 0.0), (0.3, 0.0), (1.2, 0.0), (axle + 0.2, -0.045), (nose - 0.4, -0.02), (nose, 0.0)],
        flare=(0.035, 0.04),
        keys=[nose - 0.62, axle, 0.45, -0.45, -axle, stern + 0.28],
        front={"set": (0.16, 0.03, 0.05, 0.0, 0.05, 0.42), "bow": (0.3, 0.3, 0.3, 0.3, 0.3, 0.18), "flat": 0.5, "power": 1.3},
        rear={"set": (0.3, 0.13, 0.05, 0.03, 0.0, 0.04), "bow": 0.06, "flat": 0.88, "power": 2.6},
        inset=0.09,
        shelf=0.02,
        flank=-0.012,
        belly=-0.02,
        rear_lift=0.13,
        front_lift=0.0,
        margin=0.008 if svj else -0.008,
        corner=6,
        fascia=8,
        relief=lambda x, y: 0.018 * bump(x, stern, 0.22),
        sharp=(True, True, True, True, True),
        cladding=1,
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    duct = car.hollow(front, [(0.3, 0.205), (1.0, 0.23), (1.04, 0.42), (0.46, 0.38), (0.3, 0.3)], 0.1)
    duct.mesh(9, 4)
    car.patch(front, strip((0.56, 0.21), (0.7, 0.4), 0.045), "body", lift=-0.012, thickness=0.02)
    car.patch(front, strip((0.9, 0.22), (0.82, 0.41), 0.035), "body", lift=-0.012, thickness=0.02)
    car.patch(front, [(-0.26, 0.2), (0.26, 0.2), (0.26, 0.305), (-0.26, 0.305)], "plate", lift=0.004, mirror=False)
    if svj:
        nostril = car.hollow(top, [(nose - 0.62, 0.12), (nose - 0.62, 0.36), (nose - 0.9, 0.43), (nose - 0.9, 0.16)], 0.05)
        nostril.bars(1, axis=0, material="carbon", share=0.1)

    car.headlamp(
        top,
        [(nose - 0.26, 0.3), (nose - 0.36, 0.56), (nose - 0.58, 0.79), (nose - 0.7, 0.76), (nose - 0.46, 0.3)],
        projectors=[(nose - 0.4, 0.4, 0.026), (nose - 0.46, 0.52, 0.026)],
        strips=fork((nose - 0.3, 0.33), (nose - 0.4, 0.56), (nose - 0.57, 0.765), (nose - 0.65, 0.745), 0.022),
    )

    intake = car.hollow(side, [(-0.22, 0.32), (-0.9, 0.34), (-0.92, 0.76), (-0.62, 0.74)], 0.2)
    intake.mesh(5, 4)
    gulp = car.hollow(side, [(-0.5, 0.79), (-0.98, 0.8), (-1.0, 0.865), (-0.64, 0.85)], 0.1)
    gulp.bars(2, share=0.12)

    band_low = 0.715 if svj else 0.745
    band = car.hollow(back, [(-0.34, band_low), (0.34, band_low), (0.34, 0.84), (-0.34, 0.84)], 0.05, mirror=False)
    band.mesh(10, 2)
    strips = []
    for t in (0.42, 0.62, 0.82):
        strips += fork((t, 0.79), (t + 0.06, 0.79), (t + 0.15, 0.83), (t + 0.15, 0.75), 0.028)
    ypsilon(car, back, [(0.38, 0.745), (0.98, 0.74), (1.05, 0.79), (0.98, 0.84), (0.38, 0.835)], strips)
    lower = car.hollow(back, [(-0.8, 0.385), (0.8, 0.385), (0.72, 0.65), (-0.72, 0.65)], 0.07, mirror=False)
    lower.mesh(22, 4)

    car.arches(0.04, inner=0.09, cant=(None, (0.62, 0.56)))
    car.cut()
    car.lips(width=0.02, proud=0.005)

    if svj:
        car.pipes((0.13, -0.13), stern + 0.01, 0.775, radius=0.058, length=0.14, material="steel")
        car.patch(back, [(-0.26, 0.46), (0.26, 0.46), (0.26, 0.57), (-0.26, 0.57)], "plate", lift=-0.012, mirror=False)
    else:
        car.patch(back, hexagon((0.0, 0.47), 0.26, 0.42), "steel", lift=-0.03, thickness=0.03, mirror=False)
        car.patch(back, hexagon((0.0, 0.47), 0.225, 0.38), "seam", lift=-0.022, mirror=False)
        car.pipes((0.11, 0.0, -0.11), stern + 0.045, 0.47, radius=0.045, length=0.1)
        car.patch(back, [(-0.26, 0.6), (0.26, 0.6), (0.26, 0.71), (-0.26, 0.71)], "plate", lift=-0.012, mirror=False)
    strakes(car, 10 if svj else 6, 1.3 if svj else 1.16, stern + 0.34, stern + 0.07, (0.29, 0.38), (0.2, 0.27), material="carbon" if svj else "trim_black")
    car.lip(nose - 0.14, car.sheet.clearance + 0.012, 1.7 if svj else 1.56, depth=0.26 if svj else 0.18, thickness=0.02, material="carbon" if svj else "trim_black", sweep_back=0.26)
    if svj:
        canard(car, 0.86, 1.12, 0.3, 0.2)
        car.patch(side, [(0.9, 0.2), (0.9, 0.27), (-0.9, 0.3), (-0.9, 0.2)], "carbon", lift=0.02, thickness=0.02)
    car.seams([0.84, -0.26])
    car.bonnet(1.14, 0.56, front=nose - 0.4)
    car.mirrors(0.9, size=(0.09, 0.17, 0.08), reach=0.09, lift=0.08)

    peak = car.height
    glass = car.cabin(
        screen=(1.34, 0.44),
        back=(-0.42, stern + 0.26),
        roof=[(-0.42, peak - 0.045), (0.1, peak), (0.44, peak - 0.03)],
        windows=[((1.04, 0.36), (-0.24, -0.1)), ((-0.3, -0.15), (-0.92, -0.36))],
        base=[(-0.95, 0.82), (-0.3, 0.81), (1.04, 0.8), (1.34, 0.78)],
        rail=[(-0.42, 0.5), (0.05, 0.56), (0.44, 0.53)],
        bow=(0.3, 0.05),
        rail_bow=(0.13, 0.03),
        flat=(0.93, 0.86),
        power=(3.0, 4.0),
        corner=5,
        bulge=0.02,
        drop=0.04,
        fit=False,
    )
    car.wipers(glass)
    slats(car, -0.66, 6, 0.21, 0.3, depth=0.11, taper=-0.035, material="carbon" if svj else "body", lift=0.012)
    car.patch(top, [(-0.52, -0.045), (-0.52, 0.045), (stern + 0.36, 0.045), (stern + 0.36, -0.045)], "carbon" if svj else "body", lift=0.02, thickness=0.02, mirror=False)
    if svj:
        car.wing(stern + 0.2, 1.08, 1.84, chord=0.3, angle=8, material="carbon", plates=(0.1, 0.32), pylons=(0.34,), plate_material="carbon")
        car.model.absorb(bar((stern + 0.26, 0, top(stern + 0.5, 0)[0].z), (stern + 0.2, 0, 1.07), 0.03, 0.12, "carbon", up=Vector((0, 1, 0))))
    car.interior(seat=0.06, spread=0.33, height=0.13, width=0.4, material="interior")
    return car.finish("#6f8f2c" if svj else "#f4c20d")


def sian():
    car = Wedge("lamborghini-sian", "split", metal="rim_gold", barrel="rim_dark", lip="rim_gold")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.9), (-axle, 1.0), (-0.45, 0.945), (0.5, 0.93), (axle, 0.97), (nose - 0.5, 0.88), (nose, 0.62)],
        shoulder=[(stern, 0.9), (-axle, 0.915), (-0.5, 0.86), (0.4, 0.82), (1.1, 0.79), (axle, 0.765), (nose - 0.6, 0.6), (nose - 0.15, 0.42), (nose, 0.38)],
        waist=[(stern, 0.76), (-axle, 0.69), (-0.3, 0.54), (axle, 0.47), (nose, 0.34)],
        sill=[(stern, 0.52), (-axle, 0.29), (-0.6, 0.21), (axle, 0.2), (nose, 0.19)],
        crown=[(stern, 0.0), (0.3, 0.0), (1.2, 0.0), (axle + 0.2, -0.02), (nose - 0.4, 0.0), (nose, 0.0)],
        flare=(0.035, 0.045),
        keys=[nose - 0.7, axle, 0.45, -0.45, -axle, stern + 0.44],
        front={"set": (0.2, 0.04, 0.06, 0.0, 0.05, 0.44), "bow": (0.36, 0.36, 0.36, 0.36, 0.36, 0.22), "flat": 0.46, "power": 1.5},
        rear={"set": (0.42, 0.24, 0.12, 0.04, 0.0, 0.04), "bow": 0.07, "flat": 0.84, "power": 2.4},
        inset=0.09,
        shelf=0.02,
        flank=-0.012,
        belly=-0.02,
        rear_lift=0.16,
        front_lift=0.0,
        relief=lambda x, y: 0.03 * bump(x, stern, 0.3) * (0.4 + 0.6 * bump(abs(y), 0.85, 0.4)) + 0.022 * bump(y, 0.0, 0.3) * bump(x, nose - 0.75, 0.7),
        sharp=(True, True, True, True, True),
        cladding=1,
        cladding_material="carbon",
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    duct = car.hollow(front, [(0.28, 0.205), (1.04, 0.23), (1.08, 0.4), (0.44, 0.37), (0.28, 0.29)], 0.1)
    duct.mesh(9, 3, material="carbon")
    car.patch(front, strip((0.56, 0.21), (0.72, 0.385), 0.045), "body", lift=-0.012, thickness=0.02)
    car.patch(front, [(-0.26, 0.195), (0.26, 0.195), (0.26, 0.3), (-0.26, 0.3)], "plate", lift=0.004, mirror=False)
    slot = car.hollow(top, [(nose - 0.7, 0.14), (nose - 0.68, 0.3), (nose - 1.0, 0.38), (nose - 1.02, 0.18)], 0.05)
    slot.bars(1, axis=0, material="carbon", share=0.12)

    stem, joint = (nose - 0.36, 0.3), (nose - 0.6, 0.58)
    upper, lower = (nose - 1.0, 0.7), (nose - 0.76, 0.86)
    for a, b in ((stem, joint), (joint, upper), (joint, lower)):
        car.headlamp(top, strip(a, b, 0.075), strips=[strip(a, b, 0.03)], depth=0.03)

    intake = car.hollow(side, [(-0.2, 0.33), (-0.9, 0.35), (-0.92, 0.78), (-0.66, 0.76)], 0.2)
    intake.bars(2, material="carbon", share=0.1)
    naca = car.hollow(side, [(0.5, 0.6), (-0.2, 0.5), (-0.26, 0.62), (-0.2, 0.68)], 0.05, material="body")

    panel = car.hollow(back, [(-0.36, 0.66), (0.36, 0.66), (0.36, 0.875), (-0.36, 0.875)], 0.07, mirror=False)
    panel.mesh(12, 3, material="carbon")
    car.hollow(back, [(0.4, 0.66), (1.0, 0.66), (1.02, 0.875), (0.4, 0.875)], 0.07)
    lower = car.hollow(back, [(-0.8, 0.52), (0.8, 0.52), (0.84, 0.62), (-0.84, 0.62)], 0.06, mirror=False)
    lower.mesh(20, 2, material="carbon")

    car.arches(0.04, inner=0.09, cant=(None, (0.6, 0.55)))
    car.cut()
    car.lips(width=0.02, proud=0.005)

    for t in (0.5, 0.7, 0.9):
        car.patch(back, hexagon((t, 0.768), 0.095), "lens_smoke", lift=-0.05, thickness=0.01)
        car.patch(back, hexagon((t, 0.768), 0.088), "lens_ember", lift=-0.044, thickness=0.006, group="Taillights")
        car.patch(back, hexagon((t, 0.768), 0.058), "seam", lift=-0.04)
    for t in (0.17, -0.17):
        car.patch(back, hexagon((t, 0.765), 0.09), "steel", lift=-0.014, thickness=0.04, mirror=False)
        car.patch(back, hexagon((t, 0.765), 0.066), "seam", lift=-0.008, mirror=False)
    car.patch(back, [(-0.26, 0.525), (0.26, 0.525), (0.26, 0.615), (-0.26, 0.615)], "plate", lift=-0.012, mirror=False)
    strakes(car, 8, 1.4, stern + 0.46, stern + 0.14, (0.32, 0.5), (0.22, 0.3), material="carbon")
    car.lip(nose - 0.16, car.sheet.clearance + 0.012, 1.62, depth=0.26, thickness=0.02, material="carbon", sweep_back=0.3)
    car.patch(side, [(0.92, 0.2), (0.92, 0.27), (-0.9, 0.3), (-0.9, 0.2)], "carbon", lift=0.02, thickness=0.02)
    for flip in (1, -1):
        car.model.absorb(box((stern + 0.2, flip * 0.76, 0.99), (0.4, 0.014, 0.13), "carbon", bevel=0.004))
    car.lip(stern + 0.12, 0.965, 1.5, depth=0.2, thickness=0.018, material="body", sweep_back=0.02)
    car.seams([0.84, -0.24])
    car.bonnet(1.14, 0.54, front=nose - 0.46)
    car.mirrors(0.9, size=(0.09, 0.17, 0.08), reach=0.09, lift=0.08, material="carbon")

    peak = car.height - 0.01
    glass = car.cabin(
        screen=(1.34, 0.44),
        back=(-0.42, stern + 0.5),
        roof=[(-0.42, peak - 0.045), (0.1, peak), (0.44, peak - 0.03)],
        windows=[((1.04, 0.36), (-0.22, -0.1)), ((-0.28, -0.15), (-0.9, -0.36))],
        base=[(-0.95, 0.82), (-0.3, 0.81), (1.04, 0.8), (1.34, 0.78)],
        rail=[(-0.42, 0.5), (0.05, 0.56), (0.44, 0.53)],
        bow=(0.3, 0.05),
        rail_bow=(0.13, 0.03),
        flat=(0.93, 0.8),
        power=(3.0, 3.4),
        corner=5,
        bulge=0.02,
        drop=0.04,
        roof_material="carbon",
        fit=False,
    )
    car.wipers(glass)
    for n in range(3):
        x = -0.7 - n * 0.34
        reach = 0.3 + 0.05 * n
        car.patch(top, [(x, 0.08), (x - 0.07, reach), (x - 0.24, reach), (x - 0.31, 0.08)], "body", lift=0.012, thickness=0.012)
    car.patch(top, [(0.3, -0.055), (0.3, 0.055), (stern + 0.6, 0.055), (stern + 0.6, -0.055)], "glass", lift=0.01, thickness=0.01, mirror=False)
    car.interior(seat=0.06, spread=0.33, height=0.13, width=0.4, material="interior")
    return car.finish("#2f5a39")


def countach():
    car = Wedge("lamborghini-countach-lpi-800-4", "five", root=0.11, tip=0.1, hub=0.08, metal="rim", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.94), (-axle, 1.0), (-0.45, 0.95), (0.5, 0.93), (axle, 0.975), (nose - 0.35, 0.93), (nose, 0.86)],
        shoulder=[(stern, 0.87), (-axle, 0.905), (-0.5, 0.86), (0.4, 0.825), (1.1, 0.79), (axle, 0.765), (nose - 0.6, 0.585), (nose - 0.1, 0.42), (nose, 0.4)],
        waist=[(stern, 0.7), (-axle, 0.67), (-0.3, 0.54), (axle, 0.47), (nose, 0.305)],
        sill=[(stern, 0.36), (-axle, 0.28), (-0.6, 0.22), (axle, 0.21), (nose, 0.2)],
        crown=[(stern, 0.0), (0.3, 0.0), (1.0, 0.0), (axle, 0.0), (nose, 0.0)],
        flare=(0.04, 0.045),
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.26],
        front={"set": (0.14, 0.03, 0.04, 0.0, 0.03, 0.2), "bow": 0.06, "flat": 0.86, "power": 3.4},
        rear={"set": (0.28, 0.12, 0.05, 0.02, 0.0, 0.04), "bow": 0.03, "flat": 0.9, "power": 3.2},
        inset=0.09,
        shelf=0.02,
        flank=0.0,
        belly=-0.012,
        rear_lift=0.13,
        front_lift=0.0,
        sharp=(True, True, True, True, True),
        cladding=1,
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    mouth = car.hollow(front, [(-0.86, 0.2), (0.86, 0.2), (0.86, 0.285), (-0.86, 0.285)], 0.08, mirror=False)
    mouth.bars(8, axis=0, material="body", share=0.07, sink=0.1)
    slot = car.hollow(front, [(-0.36, 0.325), (0.36, 0.325), (0.36, 0.375), (-0.36, 0.375)], 0.05, mirror=False)
    slot.bars(1, share=0.2)
    car.headlamp(
        front,
        [(0.4, 0.322), (0.94, 0.322), (0.94, 0.385), (0.4, 0.385)],
        strips=[[(0.42, 0.366), (0.92, 0.366), (0.92, 0.38), (0.42, 0.38)]],
        projectors=[(0.5, 0.344, 0.016), (0.62, 0.344, 0.016), (0.74, 0.344, 0.016)],
        depth=0.035,
    )
    car.patch(front, [(-0.26, 0.2), (0.26, 0.2), (0.26, 0.3), (-0.26, 0.3)], "plate", lift=0.004, mirror=False)

    car.hollow(side, [(0.36, 0.57), (-0.74, 0.4), (-0.86, 0.42), (-0.86, 0.74), (-0.7, 0.74)], 0.1, material="body")
    throat = car.hollow(side, [(-0.66, 0.43), (-0.85, 0.43), (-0.85, 0.73), (-0.7, 0.73)], 0.2)
    throat.bars(3, share=0.1)
    panel = car.hollow(back, [(-0.3, 0.66), (0.3, 0.66), (0.3, 0.85), (-0.3, 0.85)], 0.05, mirror=False)
    panel.bars(4, share=0.14)
    car.hollow(back, [(0.34, 0.66), (0.96, 0.66), (0.9, 0.85), (0.34, 0.85)], 0.05)
    lower = car.hollow(back, [(-0.62, 0.385), (0.62, 0.385), (0.56, 0.56), (-0.56, 0.56)], 0.07, mirror=False)
    lower.mesh(14, 3)

    car.arches(0.045, inner=0.09, cant=((0.52, 0.5), (0.52, 0.5)))
    car.cut()
    car.lips(width=0.024, proud=0.009)

    for n in range(3):
        t = 0.42 + n * 0.16
        cell = [(t, 0.7), (t + 0.13, 0.7), (t + 0.11, 0.81), (t - 0.02, 0.81)]
        car.patch(back, cell, "lens_smoke", lift=-0.03, thickness=0.006)
        for piece in fork((t + 0.01, 0.755), (t + 0.05, 0.755), (t + 0.1, 0.795), (t + 0.11, 0.715), 0.02):
            car.patch(back, piece, "lens_ember", lift=-0.024, thickness=0.004, group="Taillights")
    car.pipes((0.24, 0.08, -0.08, -0.24), stern + 0.04, 0.47, radius=0.05, length=0.12, material="steel")
    car.patch(back, [(-0.26, 0.7), (0.26, 0.7), (0.26, 0.81), (-0.26, 0.81)], "plate", lift=-0.012, mirror=False)
    strakes(car, 6, 1.1, stern + 0.32, stern + 0.07, (0.29, 0.38), (0.2, 0.27), material="carbon")
    car.lip(nose - 0.1, car.sheet.clearance + 0.012, 1.72, depth=0.16, thickness=0.02, material="carbon", sweep_back=0.04)
    car.seams([0.86, -0.24])
    car.stroke((1.3, 0.52), (nose - 0.24, 0.46), top, steps=12)
    car.stroke((1.3, -0.52), (1.3, 0.52), top, steps=10, mirror=False)
    car.stroke((1.3, 0.3), (nose - 0.34, 0.26), top, steps=12)
    car.stroke((nose - 0.34, -0.26), (nose - 0.34, 0.26), top, steps=8, mirror=False)
    car.mirrors(0.9, size=(0.09, 0.17, 0.08), reach=0.09, lift=0.08)

    peak = car.height - 0.008
    glass = car.cabin(
        screen=(1.36, 0.5),
        back=(-0.46, stern + 0.3),
        roof=[(-0.46, peak - 0.03), (0.0, peak), (0.5, peak - 0.025)],
        windows=[((1.08, 0.42), (-0.22, -0.1)), ((-0.28, -0.15), (-0.82, -0.36))],
        base=[(-0.9, 0.8), (-0.3, 0.8), (1.08, 0.8), (1.36, 0.78)],
        rail=[(-0.46, 0.5), (0.0, 0.54), (0.5, 0.52)],
        bow=(0.14, 0.03),
        rail_bow=(0.06, 0.02),
        flat=(0.9, 0.84),
        power=(2.6, 4.0),
        corner=5,
        bulge=0.012,
        drop=0.03,
        fit=False,
    )
    car.wipers(glass)
    for flip in (1, -1):
        centre = Vector((-1.02, flip * 0.76, top(-1.02, 0.76)[0].z + 0.045))
        car.model.absorb(box(centre, (0.7, 0.2, 0.13), "body", bevel=0.02, taper=0.8))
        for n in range(4):
            car.model.absorb(box(centre + Vector((0.22 - n * 0.15, flip * 0.088, 0.0)), (0.045, 0.04, 0.09), "grille"))
    slats(car, -0.72, 6, 0.2, 0.28, depth=0.1, taper=-0.03, material="body", lift=0.012)
    car.patch(top, [(0.42, -0.07), (0.42, 0.07), (-0.44, 0.07), (-0.44, -0.07)], "glass", lift=0.008, thickness=0.008, mirror=False)
    car.interior(seat=0.06, spread=0.33, height=0.13, width=0.4, material="interior")
    return car.finish("#f0f0ec")


def huracan_evo():
    return huracan("lamborghini-huracan")


def huracan_sto():
    return huracan("lamborghini-huracan-sto", sto=True)


def aventador_s():
    return aventador("lamborghini-aventador-s")


def aventador_svj():
    return aventador("lamborghini-aventador-svj", svj=True)


CARS = {
    "lamborghini-huracan": huracan_evo,
    "lamborghini-huracan-sto": huracan_sto,
    "lamborghini-aventador-s": aventador_s,
    "lamborghini-aventador-svj": aventador_svj,
    "lamborghini-sian": sian,
    "lamborghini-countach-lpi-800-4": countach,
}
