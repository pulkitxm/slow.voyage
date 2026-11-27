import math

from carkit import LEFT, box, prism, sweep
from kit import Coach, PolyPocket, core, grow, loft, superellipse
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def ease(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


def quad(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def band(t0, t1, z0, z1, count=6, swell=0.004):
    def arch(n):
        return swell * (1 - (2 * n / count - 1) ** 2)

    low = [(t0 + (t1 - t0) * n / count, z0 - arch(n)) for n in range(count + 1)]
    high = [(t1 + (t0 - t1) * n / count, z1 + arch(n)) for n in range(count + 1)]
    return low + high


def oval(centre, half_width, half_height, power=4.0, count=20, start=0.0, end=360.0):
    points = []
    closed = end - start >= 360
    for n in range(count):
        angle = math.radians(start + (end - start) * n / (count if closed else count - 1))
        cosine, sine = math.cos(angle), math.sin(angle)
        a = abs(cosine) ** (2 / power) * (1 if cosine >= 0 else -1)
        b = abs(sine) ** (2 / power) * (1 if sine >= 0 else -1)
        points.append((centre[0] + a * half_width, centre[1] + b * half_height))
    return points


def racetrack(centre, half_width, half_height, thick, power=4.0, count=12):
    halves = []
    for start in (0.0, 180.0):
        outer = oval(centre, half_width, half_height, power, count, start, start + 180.0)
        inner = oval(centre, half_width - thick, half_height - thick, power, count, start, start + 180.0)
        halves.append(outer + inner[::-1])
    return halves


def dome(x0, x1, half, height, fade=0.14, edge=0.1, taper=0.0):
    def at(x, y):
        if x <= x0 or x >= x1:
            return 0.0
        share = (x - x0) / (x1 - x0)
        reach = half * (1 - taper * share)
        along = ease(min((x - x0) / fade, (x1 - x) / fade))
        across = ease((reach - abs(y)) / edge)
        return height * along * across

    return at


def sculpt(car, shift):
    for vert in car.shell.verts:
        side = 1 if vert.co.y >= 0 else -1
        move = shift(vert.co.x, abs(vert.co.y), vert.co.z)
        if move:
            vert.co.x += move[0]
            vert.co.y += side * move[1] if abs(vert.co.y) > 1e-5 else 0.0
            vert.co.z += move[2]
    car.shell.normal_update()
    car.tree = BVHTree.FromBMesh(car.shell)


def ledge(car, front, level, depth, top, reach=0.5):
    edge = car.nose_x if front else car.stern_x
    sign = 1 if front else -1

    def shift(x, y, z):
        near = ease(1 - (edge - x) * sign / reach)
        if near <= 0 or z <= level:
            return None
        lean = min(1.0, (z - level) / (top - level))
        return (-sign * depth * (1 - lean) * near * ease((z - level) / 0.04), 0.0, 0.0)

    sculpt(car, shift)


def livery(car, rear=1, front=0, sides=0, reach=0.46, material="trim_black"):
    aft = -car.axle - reach
    fore = car.axle + reach

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band <= sides:
            return material
        if band <= rear and point.x < aft:
            return material
        if band <= front and point.x > fore:
            return material
        return "body"

    return paint


def sink(car, caster, outline, depth, build, material="grille", mirror=True):
    first = len(car.cutters)
    pocket = car.hollow(caster, outline, depth, material=material, mirror=mirror)
    car.lamp_jobs.append((range(first, len(car.cutters)), build))
    return pocket


def taillight(car, caster, outline, strips=(), clear=(), depth=0.03, mirror=True, cover=True, smoke=False):
    def build(sunk):
        floor = 0.005 - depth if sunk else 0.004
        inner = grow(outline, -0.003)
        dark = bool(strips) or smoke
        car.patch(caster, inner, "lens_smoke" if smoke else "lens_tail", lift=floor, thickness=0.0 if sunk else 0.01, group="Body" if dark else "Taillights", mirror=mirror)
        for strip in strips:
            car.patch(caster, strip, "lens_ember", lift=floor + 0.008, thickness=0.006, group="Taillights", mirror=mirror)
        if not dark:
            heart = core(inner)
            if heart:
                car.patch(caster, heart, "lens_ember", lift=floor + 0.008, group="Taillights", mirror=mirror)
        for piece in clear:
            car.patch(caster, piece, "lens_clear", lift=floor + 0.008, thickness=0.006, mirror=mirror)
        if cover:
            car.patch(caster, outline, "cover", lift=0.0015 if sunk else floor + 0.016, mirror=mirror)

    sink(car, caster, outline, depth, build, "lens_smoke", mirror)


def tailpipes(car, groups, z, radius=0.05, depth=0.1, pad=0.02, material="chrome", proud=0.012, length=0.15):
    spots = []
    for group in groups:
        low, high = min(group), max(group)
        centre = (low + high) / 2
        half = (high - low) / 2 + radius + pad
        tall = radius + pad
        face = max(car.tail(abs(y), z + tall)[0].x for y in (low, high, centre))
        rings = [superellipse((x, centre, z), half, tall, power=3.2, count=16) for x in (face - 0.5, face + depth)]
        car.carve(loft(rings, "underbody"))
        for y in group:
            spots.append((y, max(car.stern_x, car.tail(abs(y), z + tall)[0].x - proud)))

    def build(sunk):
        for y, x in spots:
            car.pipes((y,), x, z, radius=radius, length=length, material=material)

    car.lamp_jobs.append((range(0), build))


def tag(car, caster, low, recess=0.0, half=0.155, tall=0.16, lift=0.005):
    if recess:
        car.hollow(caster, [(-half - 0.03, low - 0.02), (half + 0.03, low - 0.02), (half + 0.045, low + tall + 0.02), (-half - 0.045, low + tall + 0.02)], recess, material="body", mirror=False)
        lift = 0.004 - recess
    car.patch(caster, quad(-half, half, low, low + tall), "plate", lift=lift, mirror=False)


def handles(car, positions, z=None, material="body", size=(0.17, 0.02, 0.032)):
    for x in positions:
        height = car.shoulder_at(x) - 0.1 if z is None else z
        hit, normal = car.side(x, height)
        car.model.add(box(hit + normal * 0.004, size, material, bevel=0.008))


def pillars(car, spans, low=0.035, high=0.1, material="trim_black"):
    for base, rail in spans:
        foot = [(x, car.shoulder_at(x) + low) for x in base]
        head = [(x, car.roof(x, 0.0) - high) for x in reversed(rail)]
        car.patch(car.side, foot + head, material, lift=0.003)


def mirror_pair(car, x, z=None, material="body", size=(0.1, 0.19, 0.11), reach=0.06, lift=0.07, stalk="trim_black"):
    mount = car.shoulder_at(x) + 0.01 if z is None else z
    hit = car.side(x, car.shoulder_at(x) - 0.03)[0]
    centre = Vector((x - 0.02, hit.y + reach + size[1] / 2, mount + lift))
    car.model.add(box(centre, size, material, bevel=0.028, taper=0.82))
    car.model.add(box(centre + Vector((-size[0] / 2 - 0.001, 0, 0)), (0.004, size[1] - 0.045, size[2] - 0.04), "mirror"))
    foot = Vector((x + 0.03, hit.y - 0.03, mount))
    car.model.add(box((foot + centre - Vector((0, size[1] / 2 - 0.02, 0.02))) / 2, (0.07, reach + 0.08, 0.035), stalk, bevel=0.01))


def spoiler(car, x, span, depth, rise, thickness, material="body", sweep=0.0, rows=7, blade=0.02):
    sections = []
    for n in range(rows):
        y = -span / 2 + span * n / (rows - 1)
        centre = x - sweep * (abs(y) / (span / 2)) ** 2
        deck = car.top(centre + depth / 2, abs(y))[0].z
        back = centre - depth / 2
        sections.append([(centre + depth / 2, y, deck - 0.012), (back + blade, y, deck + rise), (back, y, deck + rise), (back, y, deck + rise - thickness)])
    car.model.absorb(loft(sections, material, smooth=False))


def rounded_path(points, radius, steps=5):
    path = [points[0]]
    for i in range(1, len(points) - 1):
        here = Vector(points[i])
        before = Vector(points[i - 1]) - here
        after = Vector(points[i + 1]) - here
        start = here + before.normalized() * min(radius, before.length * 0.5)
        finish = here + after.normalized() * min(radius, after.length * 0.5)
        for s in range(steps + 1):
            t = s / steps
            spot = start * (1 - t) ** 2 + here * 2 * t * (1 - t) + finish * t * t
            path.append((spot.x, spot.y))
    path.append(points[-1])
    return path


def square_arches(car, gap=0.07, top=0.3, low=0.6, soft=0.2, inner=0.11, material="underbody", rear=None):
    car.arch_paths = []
    car.arch_list = []
    specs = ((1, car.front_wheel, car.tracks[0], (gap, top, low, soft)), (-1, car.rear_wheel, car.tracks[1], rear or (gap, top, low, soft)))
    for sign, spec, track, (clear, flat, foot, corner) in specs:
        centre = sign * car.axle
        hub = spec["radius"]
        peak = hub * 2 + clear
        path = rounded_path([(centre + foot, 0.0), (centre + flat, peak), (centre - flat, peak), (centre - foot, 0.0)], corner)
        outline = [(centre + foot, -0.3)] + path + [(centre - foot, -0.3)]
        near = track / 2 - spec["width"] / 2 - inner
        for flip in (1, -1):
            car.cutters.append(prism(outline, flip * near, flip * 3.0, material))
        car.arch_paths.append(path)
        car.arch_list.append((centre, hub, hub + clear))


def arch_trim(car, width=0.03, proud=0.012, material="body", floor=0.2):
    for path in car.arch_paths:
        spots = [(x, z) for x, z in path if z >= floor]
        points, outs, ups = [], [], []
        for n, (x, z) in enumerate(spots):
            before = spots[max(0, n - 1)]
            after = spots[min(len(spots) - 1, n + 1)]
            normal = Vector((after[1] - before[1], 0, before[0] - after[0]))
            if normal.length < 1e-9:
                continue
            normal.normalize()
            probe = Vector((x, 0, z)) + normal * 0.012
            try:
                hit = car.side(probe.x, probe.z)[0]
            except ValueError:
                continue
            points.append(Vector((x, hit.y, z)))
            outs.append(LEFT)
            ups.append(normal)
        profile = [(-0.03, -0.004), (proud, -0.004), (proud, width * 0.55), (0.0, width), (-0.03, width)]
        car.model.add(sweep(points, outs, ups, profile, material))


def breather(car, scoop_x, scoop_half, vent_x, vent_y, length=0.32, width=0.15):
    scoop = car.hollow(
        car.top,
        [(scoop_x + 0.07, -scoop_half), (scoop_x + 0.07, scoop_half), (scoop_x - 0.07, scoop_half + 0.03), (scoop_x - 0.07, -scoop_half - 0.03)],
        0.035,
        mirror=False,
    )
    scoop.mesh(8, 2, sink=0.5)
    half = length / 2
    vent = car.hollow(
        car.top,
        [(vent_x + half, vent_y - width / 2 - 0.02), (vent_x + half - 0.02, vent_y + width / 2 - 0.02), (vent_x - half, vent_y + width / 2 + 0.02), (vent_x - half + 0.02, vent_y - width / 2 + 0.02)],
        0.03,
    )
    vent.bars(4, axis=0, share=0.3)


def challenger():
    car = Coach("dodge-challenger-srt-hellcat", "split", metal="rim_dark", lip="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    bulge = dome(1.0, nose - 0.14, 0.44, 0.04, fade=0.24, edge=0.14, taper=0.2)
    car.skin(
        half=[(stern, 0.905), (-2.0, 0.96), (-axle, 0.975), (-0.6, 0.95), (0.6, 0.945), (axle, 0.955), (nose - 0.3, 0.945), (nose, 0.92)],
        shoulder=[(stern, 1.045), (-2.0, 1.075), (-axle, 1.085), (-0.75, 1.035), (-0.2, 1.01), (0.9, 0.995), (axle, 0.955), (nose - 0.3, 0.91), (nose, 0.885)],
        waist=[(stern, 0.9), (-axle, 0.93), (-0.8, 0.87), (0.0, 0.85), (axle, 0.83), (nose, 0.805)],
        sill=[(stern, 0.47), (-2.1, 0.47), (-1.93, 0.32), (1.9, 0.32), (nose, 0.36)],
        crown=[(stern, 0.015), (-1.8, 0.02), (0.9, 0.03), (axle, 0.035), (nose, 0.03)],
        flare=(0.028, 0.04),
        keys=[nose - 0.24, axle, 0.45, -0.45, -axle, stern + 0.26],
        front={"set": (0.17, 0.06, 0.03, 0.02, 0.0, 0.04), "bow": 0.045, "flat": 0.84, "power": 3.4},
        rear={"set": (0.13, 0.05, 0.02, 0.008, 0.008, 0.035), "bow": 0.04, "flat": 0.84, "power": 3.2},
        inset=0.045,
        shelf=0.05,
        flank=0.008,
        belly=0.004,
        sharp=(False, True, True, True, False),
        rear_lift=0.17,
        relief=bulge,
        paint=livery(car),
        lid_rows=6,
    )
    front, back = car.front, car.back

    car.hollow(front, band(-0.84, 0.84, 0.655, 0.805), 0.1, mirror=False)
    PolyPocket(car, front, band(-0.4, 0.4, 0.665, 0.795), 0.1, False).mesh(20, 4, share=0.1, sink=0.6)
    intake = car.hollow(front, [(-0.58, 0.3), (0.58, 0.3), (0.66, 0.39), (0.6, 0.465), (-0.6, 0.465), (-0.66, 0.39)], 0.07, mirror=False)
    intake.mesh(22, 4, share=0.1)
    car.hollow(front, [(0.72, 0.32), (0.9, 0.34), (0.9, 0.46), (0.72, 0.46)], 0.05)
    tag(car, front, 0.487)
    breather(car, nose - 0.6, 0.17, 1.45, 0.36)

    panel = band(-0.85, 0.85, 0.86, 0.995)

    def lamps(sunk):
        floor = -0.026 if sunk else 0.004
        if not sunk:
            car.patch(back, panel, "trim_black", lift=0.002, mirror=False)
        car.patch(back, oval((0.52, 0.9275), 0.29, 0.052), "lens_smoke", lift=floor, thickness=0.004)
        for half in racetrack((0.52, 0.9275), 0.29, 0.052, 0.016):
            car.patch(back, half, "lens_ember", lift=floor + 0.006, thickness=0.006, group="Taillights")
        car.patch(back, oval((0.52, 0.9275), 0.2, 0.014), "lens_tail", lift=floor + 0.006, thickness=0.004, group="Taillights")
        car.patch(back, quad(0.1, 0.2, 0.905, 0.95), "lens_clear", lift=floor + 0.004, thickness=0.004)

    sink(car, back, panel, 0.032, lamps, "trim_black", False)
    tag(car, back, 0.6, recess=0.012)
    tailpipes(car, [[-0.6], [0.6]], 0.388, radius=0.052, pad=0.018)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.022, proud=0.006)
    for t, radius in ((0.715, 0.068), (0.545, 0.058)):
        car.disc(front, t, 0.73, radius, "head", bezel="chrome", depth=0.03, sink=0.085)
    car.disc(front, 0.81, 0.39, 0.034, "drl", bezel="chrome", depth=0.02, sink=0.04)
    car.lip(nose - 0.1, 0.158, 1.6, depth=0.16, thickness=0.02, sweep_back=0.07)
    spoiler(car, stern + 0.09, 1.52, 0.12, 0.045, 0.08, material="trim_black", sweep=-0.03)

    car.seams([0.82, -0.42])
    car.bonnet(0.98, 0.8, front=nose - 0.1)
    car.stroke((-0.8, 0.84), (0.8, 0.84), car.tail, steps=12, mirror=False)
    handles(car, [-0.26])
    mirror_pair(car, 0.62)
    car.lamp(car.side, quad(nose - 0.34, nose - 0.2, 0.62, 0.65), "amber", thickness=0.004)
    car.lamp(car.side, quad(stern + 0.2, stern + 0.34, 0.76, 0.79), "red", thickness=0.004)

    glass = car.cabin(
        screen=(0.95, 0.33),
        back=(-1.08, -1.95),
        roof=[(-1.08, 1.39), (-0.6, 1.44), (-0.15, 1.449), (0.33, 1.408)],
        windows=[((0.66, 0.23), (-0.38, -0.36)), ((-0.44, -0.42), (-1.06, -0.84))],
        base_inset=0.1,
        tumble=0.16,
        drop=0.05,
        bow=(0.12, 0.06),
        header=0.88,
    )
    car.wipers(glass)
    pillars(car, [((-0.36, -0.46), (-0.34, -0.44))])
    car.patch(car.top, quad(-1.27, -1.24, -0.14, 0.14), "lens_tail", lift=0.004, group="Taillights", mirror=False)
    car.interior(seat=-0.15, rear_bench=-1.0)
    return car.finish("#cf1a20")


def charger():
    car = Coach("dodge-charger-srt-hellcat", "split", metal="rim_dark", lip="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    bulge = dome(1.16, nose - 0.3, 0.38, 0.035, fade=0.22, edge=0.12, taper=0.3)
    car.skin(
        half=[(stern, 0.88), (-2.0, 0.95), (-axle, 0.97), (-0.5, 0.945), (0.6, 0.94), (axle, 0.955), (nose - 0.35, 0.91), (nose, 0.82)],
        shoulder=[(stern, 1.085), (-2.0, 1.1), (-axle, 1.095), (-0.7, 1.05), (0.2, 1.015), (1.05, 0.99), (axle, 0.935), (nose - 0.3, 0.85), (nose, 0.805)],
        waist=[(stern, 0.87), (-axle, 0.87), (-0.6, 0.81), (0.6, 0.79), (axle, 0.77), (nose, 0.7)],
        sill=[(stern, 0.47), (-2.12, 0.47), (-1.96, 0.32), (1.95, 0.32), (nose, 0.36)],
        crown=[(stern, 0.012), (-2.0, 0.02), (1.0, 0.03), (axle, 0.04), (nose, 0.03)],
        flare=(0.026, 0.036),
        keys=[nose - 0.4, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.17, 0.06, 0.02, 0.0, 0.05, 0.15), "bow": 0.13, "flat": 0.68, "power": 2.5},
        rear={"set": (0.13, 0.05, 0.02, 0.01, 0.01, 0.04), "bow": 0.06, "flat": 0.8, "power": 2.8},
        inset=0.045,
        shelf=0.05,
        flank=0.01,
        sharp=(False, True, True, True, False),
        rear_lift=0.17,
        relief=bulge,
        paint=livery(car),
        lid_rows=6,
    )

    def scallop(x, y, z):
        if y < 0.6 or not -1.12 < x < 1.02:
            return None
        along = ease((1.02 - x) / 0.07) * ease((x + 1.12) / 0.9)
        up = ease((car.waist_at(x) - 0.012 - z) / 0.05) * ease((z - 0.4) / 0.2)
        return (0.0, -0.034 * along * up, 0.0)

    sculpt(car, scallop)
    front, back = car.front, car.back

    mask = car.hollow(front, band(-0.48, 0.48, 0.655, 0.745), 0.06, mirror=False)
    mask.mesh(24, 3, share=0.1)
    car.headlamp(
        front,
        [(0.52, 0.65), (0.82, 0.655), (1.05, 0.69), (1.09, 0.755), (0.82, 0.752), (0.52, 0.745)],
        projectors=[(0.64, 0.698, 0.034), (0.79, 0.702, 0.03)],
        strips=[[(0.54, 0.662), (0.82, 0.668), (1.03, 0.7), (1.06, 0.742), (1.035, 0.742), (1.01, 0.71), (0.82, 0.682), (0.54, 0.676)]],
    )
    intake = car.hollow(front, [(-0.54, 0.3), (0.54, 0.3), (0.64, 0.44), (0.6, 0.575), (-0.6, 0.575), (-0.64, 0.44)], 0.07, mirror=False)
    intake.mesh(22, 6, share=0.1)
    duct = car.hollow(front, [(0.74, 0.34), (0.93, 0.37), (0.93, 0.52), (0.74, 0.52)], 0.05)
    duct.bars(2, share=0.16)
    breather(car, nose - 0.78, 0.15, 1.52, 0.32, length=0.3, width=0.13)

    loop = oval((0.0, 0.962), 0.94, 0.07, power=6.0, count=36)

    def ring(sunk):
        floor = -0.022 if sunk else 0.004
        car.patch(back, grow(loop, -0.003), "lens_smoke", lift=floor, mirror=False)
        for half in racetrack((0.0, 0.962), 0.93, 0.062, 0.026, power=6.0, count=18):
            car.patch(back, half, "lens_ember", lift=-0.003 if sunk else floor + 0.006, thickness=0.02 if sunk else 0.006, group="Taillights", mirror=False)
        car.patch(back, quad(0.3, 0.42, 0.945, 0.98), "lens_clear", lift=floor + 0.004, thickness=0.004)
        car.patch(back, oval((0.0, 0.962), 0.9, 0.034, power=6.0, count=36), "cover", lift=-0.002 if sunk else floor + 0.014, mirror=False)

    sink(car, back, loop, 0.028, ring, "lens_smoke", False)
    tag(car, back, 0.6, recess=0.012)
    tailpipes(car, [[-0.6], [0.6]], 0.388, radius=0.052, pad=0.018)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.022, proud=0.006)
    tag(car, front, 0.37, lift=-0.012)
    car.lip(nose - 0.1, 0.158, 1.5, depth=0.14, thickness=0.02, sweep_back=0.14)
    spoiler(car, stern + 0.09, 1.46, 0.11, 0.04, 0.075, material="trim_black", sweep=-0.04)

    doors = [0.98, -0.18, -1.08]
    car.seams(doors)
    car.bonnet(1.14, 0.76, front=nose - 0.2)
    car.stroke((-0.76, 0.86), (0.76, 0.86), car.tail, steps=12, mirror=False)
    handles(car, [0.02, -0.88])
    mirror_pair(car, 0.74)
    car.lamp(car.side, quad(nose - 0.4, nose - 0.26, 0.6, 0.63), "amber", thickness=0.004)

    glass = car.cabin(
        screen=(1.13, 0.36),
        back=(-1.2, -2.02),
        roof=[(-1.2, 1.385), (-0.7, 1.445), (-0.15, 1.462), (0.36, 1.415)],
        windows=[((0.83, 0.26), (-0.14, -0.12)), ((-0.22, -0.2), (-1.0, -0.88)), ((-1.06, -0.94), (-1.42, -1.1))],
        base_inset=0.1,
        tumble=0.18,
        drop=0.06,
        bow=(0.14, 0.07),
        header=0.88,
    )
    car.wipers(glass)
    pillars(car, [((-0.12, -0.24), (-0.1, -0.22)), ((-0.98, -1.08), (-0.86, -0.96))])
    car.patch(car.top, quad(-1.345, -1.315, -0.14, 0.14), "lens_tail", lift=0.004, group="Taillights", mirror=False)
    car.interior(seat=0.05, rear_bench=-0.9)
    return car.finish("#4f2c82")


def durango():
    car = Coach("dodge-durango-srt-hellcat", "split", metal="rim_dark", lip="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    bulge = dome(1.32, nose - 0.26, 0.42, 0.04, fade=0.22, edge=0.12, taper=0.25)
    car.skin(
        half=[(stern, 0.91), (-axle, 0.965), (0.0, 0.95), (axle, 0.96), (nose - 0.35, 0.925), (nose, 0.84)],
        shoulder=[(stern, 1.3), (-axle, 1.3), (-0.4, 1.25), (1.2, 1.215), (axle, 1.17), (nose - 0.3, 1.1), (nose, 1.06)],
        waist=[(stern, 1.0), (-axle, 1.0), (0.0, 0.95), (axle, 0.94), (nose, 0.88)],
        sill=[(stern, 0.62), (-2.2, 0.62), (-2.02, 0.42), (1.98, 0.42), (nose, 0.46)],
        crown=[(stern, 0.0), (1.2, 0.02), (axle, 0.04), (nose, 0.03)],
        flare=(0.03, 0.034),
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.17, 0.06, 0.02, 0.0, 0.04, 0.13), "bow": 0.12, "flat": 0.7, "power": 2.6},
        rear={"set": (0.18, 0.05, 0.0, 0.035, 0.1, 0.15), "bow": 0.07, "flat": 0.78, "power": 2.7},
        inset=0.045,
        shelf=0.05,
        flank=0.01,
        sharp=(False, True, True, True, False),
        rear_lift=0.2,
        relief=bulge,
        paint=livery(car, sides=1),
        lid_rows=6,
    )
    front, back = car.front, car.back

    mask = car.hollow(front, band(-0.5, 0.5, 0.86, 1.0), 0.06, mirror=False)
    mask.mesh(24, 4, share=0.1)
    car.headlamp(
        front,
        [(0.54, 0.875), (0.84, 0.885), (1.05, 0.915), (1.09, 0.995), (0.82, 0.995), (0.54, 0.985)],
        projectors=[(0.66, 0.935, 0.036), (0.81, 0.94, 0.032)],
        strips=[[(0.56, 0.888), (0.84, 0.896), (1.04, 0.924), (1.045, 0.94), (0.84, 0.91), (0.56, 0.902)]],
    )
    intake = car.hollow(front, [(-0.56, 0.44), (0.56, 0.44), (0.66, 0.6), (0.62, 0.79), (-0.62, 0.79), (-0.66, 0.6)], 0.07, mirror=False)
    intake.mesh(22, 7, share=0.1)
    duct = car.hollow(front, [(0.76, 0.48), (0.95, 0.51), (0.95, 0.66), (0.76, 0.66)], 0.05)
    duct.bars(2, share=0.16)
    breather(car, nose - 0.72, 0.16, 1.68, 0.34, length=0.3, width=0.13)

    loop = oval((0.0, 1.14), 0.9, 0.075, power=6.0, count=36)

    def ring(sunk):
        floor = -0.022 if sunk else 0.004
        car.patch(back, grow(loop, -0.003), "lens_smoke", lift=floor, mirror=False)
        for half in racetrack((0.0, 1.14), 0.89, 0.067, 0.028, power=6.0, count=18):
            car.patch(back, half, "lens_ember", lift=-0.003 if sunk else floor + 0.006, thickness=0.02 if sunk else 0.006, group="Taillights", mirror=False)
        car.patch(back, quad(0.3, 0.42, 1.12, 1.16), "lens_clear", lift=floor + 0.004, thickness=0.004)
        car.patch(back, oval((0.0, 1.14), 0.858, 0.037, power=6.0, count=36), "cover", lift=-0.002 if sunk else floor + 0.014, mirror=False)

    sink(car, back, loop, 0.028, ring, "lens_smoke", False)
    tag(car, back, 0.82, recess=0.012)
    tailpipes(car, [[-0.6], [0.6]], 0.522, radius=0.056)

    car.arches(0.055)
    car.cut()
    car.arch_lips(width=0.03, proud=0.016)
    tag(car, front, 0.5, lift=-0.012)
    car.lip(nose - 0.09, 0.245, 1.5, depth=0.12, thickness=0.025, sweep_back=0.14)

    car.seams([1.0, -0.06, -1.06])
    car.bonnet(1.3, 0.78, front=nose - 0.2)
    car.stroke((-0.8, 0.76), (0.8, 0.76), car.tail, steps=12, mirror=False)
    handles(car, [0.12, -0.84])
    mirror_pair(car, 0.86, size=(0.11, 0.21, 0.14))
    car.lamp(car.side, quad(nose - 0.38, nose - 0.24, 0.8, 0.83), "amber", thickness=0.004)

    glass = car.cabin(
        screen=(1.3, 0.5),
        back=(-2.1, -2.46),
        roof=[(-2.1, 1.725), (-1.2, 1.78), (0.0, 1.8), (0.5, 1.755)],
        windows=[((1.0, 0.42), (-0.0, 0.02)), ((-0.08, -0.06), (-1.0, -0.98)), ((-1.08, -1.06), (-1.98, -1.7))],
        base_inset=0.1,
        tumble=0.16,
        drop=0.055,
        bow=(0.13, 0.06),
        header=0.9,
    )
    car.wipers(glass)
    pillars(car, [((0.02, -0.1), (0.04, -0.08)), ((-0.98, -1.1), (-0.96, -1.08))])
    spoiler(car, -2.12, 1.04, 0.13, 0.012, 0.028, sweep=-0.03)
    car.model.absorb(box((-2.188, 0, car.top(-2.06, 0)[0].z - 0.004), (0.008, 0.3, 0.014), "lens_tail"), "Taillights")
    for y in (0.54, -0.54):
        car.model.absorb(box((-0.8, y, car.top(-0.8, y)[0].z + 0.014), (2.0, 0.035, 0.022), "trim_black", bevel=0.008))
    car.interior(seat=0.2, rear_bench=-0.8)
    return car.finish("#1f3f93")


CARS = {
    "dodge-challenger-srt-hellcat": challenger,
    "dodge-charger-srt-hellcat": charger,
    "dodge-durango-srt-hellcat": durango,
}
