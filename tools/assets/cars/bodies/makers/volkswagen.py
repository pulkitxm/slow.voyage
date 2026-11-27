import math

from mathutils import Vector

from carkit import bar, box
from kit import Coach, ellipse, grow, loft, superellipse


def slab(left, right, low, high):
    return [(left, low), (right, low), (right, high), (left, high)]


def rim(car, caster, outline, width, material="chrome", lift=0.007, mirror=False):
    inner = grow(outline, -width)
    count = len(outline)
    for i in range(count):
        j = (i + 1) % count
        car.patch(caster, [outline[i], outline[j], inner[j], inner[i]], material, lift=lift, thickness=0.006, mirror=mirror)


def plate(car, caster, low, half=0.26, tall=0.11, lift=0.005, recess=0.0, pad=(0.05, 0.025)):
    if recess:
        car.hollow(caster, [(-half - pad[0] + 0.03, low - pad[1]), (half + pad[0] - 0.03, low - pad[1]), (half + pad[0], low + tall + pad[1]), (-half - pad[0], low + tall + pad[1])], recess, material="body", mirror=False)
        lift = 0.004 - recess
    car.patch(caster, slab(-half, half, low, low + tall), "plate", lift=lift, mirror=False)


def badge(car, caster, height, radius=0.055, material="chrome", lift=0.005):
    car.patch(caster, ellipse((0.0, height), (radius, radius), 18), material, lift=lift, thickness=0.004, mirror=False)
    car.patch(caster, ellipse((0.0, height), (radius * 0.8, radius * 0.8), 18), "trim_black", lift=lift + 0.002, mirror=False)
    car.patch(caster, ellipse((0.0, height), (radius * 0.5, radius * 0.5), 12), material, lift=lift + 0.004, mirror=False)


def tips(car, positions, z, radius=0.042, length=0.16, material="chrome", pad=1.45, mirror=True):
    for y in positions:
        car.hollow(car.tail, ellipse((y, z), (radius * pad, radius * pad), 12), 0.08, material="underbody", mirror=mirror)
        hit = car.tail(y, z)[0]
        x = max(car.stern_x, hit.x - 0.012)
        car.pipes((y, -y) if mirror else (y,), x, z, radius=radius, length=length, material=material)


def ovals(car, positions, z, half=(0.075, 0.045), length=0.16, material="chrome", pad=1.3):
    for y in positions:
        car.hollow(car.tail, ellipse((y, z), (half[0] * pad, half[1] * pad), 14), 0.08, material="underbody")
        x = max(car.stern_x, car.tail(y, z)[0].x - 0.012)
        for side in (y, -y):
            car.model.absorb(loft([superellipse((x + d, side, z), half[0], half[1], power=2.2, count=16) for d in (0.0, length)], material))
            car.model.absorb(loft([superellipse((x + d, side, z), half[0] * 0.84, half[1] * 0.78, power=2.2, count=16) for d in (-0.002, 0.06)], "seam"))


def handles(car, positions, z=None, material="body", size=(0.19, 0.022, 0.03), dish=0.014):
    for x in positions:
        height = car.waist_at(x) + 0.03 if z is None else z
        if dish:
            car.hollow(car.side, ellipse((x - 0.012, height - 0.006), (size[0] * 0.5, size[2] * 0.95), 12), dish, material="body")
        hit, normal = car.side(x, height)
        car.model.add(box(hit + normal * 0.005, size, material, bevel=0.009))


def rearlamp(car, caster, outline, strips=(), clear=(), amber=(), depth=0.014, smoke=False, cover=False, mirror=True):
    lens = "lens_smoke" if smoke else "lens_tail"
    first = len(car.cutters)
    car.hollow(caster, outline, depth, material=lens, mirror=mirror)

    def build(sunk):
        floor = 0.003 - depth if sunk else 0.004
        car.patch(caster, outline, lens, lift=floor, thickness=0.0 if sunk else 0.01, group="Body" if smoke else "Taillights", mirror=mirror)
        for strip in strips:
            car.patch(caster, strip, "lens_ember", lift=floor + 0.007, thickness=0.006, group="Taillights", mirror=mirror)
        for piece in clear:
            car.patch(caster, piece, "lens_clear", lift=floor + 0.007, thickness=0.006, mirror=mirror)
        for piece in amber:
            car.patch(caster, piece, "lens_amber", lift=floor + 0.007, thickness=0.006, mirror=mirror)
        if cover:
            car.patch(caster, outline, "cover", lift=0.0015 if sunk else 0.018, mirror=mirror)

    car.lamp_jobs.append((range(first, len(car.cutters)), build))


def doors(car, first, middle, last, gap=0.05):
    low = lambda x: car.sill_at(x) + 0.012
    high = lambda x: car.shoulder_at(x) - 0.012
    hub = car.rear_wheel["radius"]
    reach = hub + gap + 0.07
    turn = math.acos(max(-1.0, min(1.0, (last + car.axle) / reach)))
    arc = [(-car.axle + reach * math.cos(turn * (1 - n / 8)), hub + reach * math.sin(turn * (1 - n / 8))) for n in range(9)]
    for x in [first] + ([middle] if middle is not None else []):
        car.stroke((x, low(x)), (x, high(x)), car.side)
    car.seam([(last, high(last))] + arc, car.side)
    car.stroke((first, low(first) + 0.002), (arc[-1][0], arc[-1][1]), car.side, steps=12)


def pillar(car, base, rail, material="trim_black", low=0.03, high=0.075):
    foot = [(x, car.shoulder_at(x) + low) for x in base]
    head = [(x, car.roof(x, 0.0) - high) for x in rail]
    car.patch(car.side, [foot[0], foot[1], head[1], head[0]], material, lift=0.003)


def rails(car, front, back, y, lift=0.03, material="chrome"):
    points = []
    for n in range(11):
        x = back + (front - back) * n / 10
        points.append(Vector((x, y, car.top(x, y)[0].z + (0.0 if n in (0, 10) else lift))))
    for a, b in zip(points, points[1:]):
        car.model.add(bar(a, b, 0.032, 0.022, material))


def spoiler(car, x, depth, span, thickness=0.03, material="body", droop=0.015, fins=None):
    sections = []
    for n in range(9):
        y = -span / 2 + span * n / 8
        z = car.roof(x, y) + 0.004
        tuck = depth * (1 - 0.18 * (abs(y) / (span / 2)) ** 2)
        sections.append([(x + 0.07, y, z - thickness), (x + 0.07, y, z), (x - tuck, y, z - droop), (x - tuck, y, z - droop - 0.016)])
    car.model.absorb(loft(sections, material, smooth=False))
    if fins:
        for side in (1, -1):
            y = side * (span / 2 + 0.004)
            z = car.roof(x, y)
            car.model.absorb(box((x - depth * 0.3, y, z - fins / 2 - 0.01), (depth * 1.1, 0.014, fins), "trim_black", bevel=0.004))


def beltline(car, front, back, material="chrome", low=0.012, high=0.03):
    xs = [front + (back - front) * n / 12 for n in range(13)]
    outline = [(x, car.shoulder_at(x) + low) for x in xs] + [(x, car.shoulder_at(x) + high) for x in reversed(xs)]
    car.patch(car.side, outline, material, lift=0.004, thickness=0.004)


def rear_wiper(car, x, reach=0.3, drop=0.07):
    start = car.top(x, 0.0)[0] + Vector((-0.012, 0, 0.012))
    end = car.top(x + drop, reach)[0] + Vector((-0.012, 0, 0.012))
    car.model.absorb(bar(start, end, 0.02, 0.012, "trim_black", up=Vector((-0.6, 0, 1))))
    car.model.absorb(box(start, (0.05, 0.05, 0.03), "trim_black", bevel=0.01))


def fin(car, x, material="body"):
    z = car.top(x, 0.0)[0].z
    car.model.absorb(loft([[(x + 0.07, y, z - 0.01), (x - 0.06, y, z - 0.01), (x - 0.062, y * 0.3, z + 0.028), (x - 0.03, y * 0.3, z + 0.026)] for y in (-0.018, 0.018)], material))


def dome(x, y, back, front, wide, narrow, soft=0.07):
    if x >= front or x <= back - soft:
        return 0.0
    share = (x - back) / (front - back)
    edge = wide + (narrow - wide) * max(0.0, share)
    across = max(0.0, min(1.0, (edge - abs(y)) / soft))
    along = max(0.0, min(1.0, (x - back + soft) / soft)) * max(0.0, min(1.0, (front - x) / (soft * 2)))
    return across * across * (3 - 2 * across) * along


def livery(sides=0, rear=0.0, front=0.0, material="trim_black"):
    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band <= sides:
            return material
        if band == 1 and station[0] in ("rear", "rear_corner") and abs(point.y) < rear:
            return material
        if band == 1 and station[0] in ("front", "front_corner") and abs(point.y) < front:
            return material
        return "body"

    return paint


def golf_gti():
    car = Coach("volkswagen-golf-gti", "split", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.865), (-axle, 0.895), (0.0, 0.9), (axle, 0.895), (nose - 0.36, 0.875), (nose, 0.83)],
        shoulder=[(stern, 0.972), (-1.27, 0.985), (0.0, 0.95), (0.8, 0.935), (1.02, 0.922), (axle, 0.88), (nose - 0.4, 0.845), (nose - 0.12, 0.805), (nose, 0.785)],
        waist=[(stern, 0.83), (-axle, 0.855), (0.0, 0.825), (axle, 0.8), (nose - 0.36, 0.7), (nose - 0.15, 0.56), (nose, 0.5)],
        sill=[(stern, 0.43), (-1.75, 0.3), (1.75, 0.3), (nose, 0.38)],
        crown=[(stern, 0.0), (1.0, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.014, 0.016),
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.11, 0.035, 0.0, 0.0, 0.04, 0.12), "bow": 0.1, "flat": 0.68, "power": 2.6},
        rear={"set": (0.12, 0.04, 0.0, 0.03, 0.055, 0.085), "bow": 0.04, "flat": 0.84, "power": 3.0},
        inset=0.03,
        shelf=0.035,
        flank=0.004,
        belly=0.008,
        tuck=0.08,
        sharp=(False, True, True, False, False),
        front_lift=0.03,
        paint=livery(rear=0.7),
        relief=lambda x, y: 0.02 * dome(x, y, 1.08, nose - 0.1, 0.6, 0.4),
    )
    front, back = car.front, car.back

    grille = car.hollow(front, slab(-0.42, 0.42, 0.695, 0.752), 0.045, mirror=False)
    grille.mesh(22, 3, share=0.2)
    car.headlamp(
        front,
        [(0.44, 0.655), (0.74, 0.632), (0.98, 0.645), (1.09, 0.7), (1.2, 0.79), (1.19, 0.822), (0.9, 0.8), (0.62, 0.772), (0.44, 0.755)],
        projectors=[(0.6, 0.705, 0.04), (0.84, 0.714, 0.052)],
        strips=[[(0.7, 0.647), (0.97, 0.66), (1.07, 0.71), (1.16, 0.785), (1.15, 0.805), (1.04, 0.728), (0.955, 0.68), (0.7, 0.666)]],
    )
    intake = car.hollow(front, [(-0.56, 0.225), (0.56, 0.225), (0.6, 0.455), (-0.6, 0.455)], 0.07, mirror=False)
    intake.mesh(20, 5, share=0.18)
    fog = car.hollow(front, [(0.66, 0.25), (0.98, 0.3), (1.0, 0.49), (0.66, 0.47)], 0.05)
    fog.bars(3, share=0.3, sink=0.15)
    plate(car, front, 0.495)

    rearlamp(
        car,
        back,
        [(0.34, 0.822), (0.62, 0.8), (0.95, 0.808), (1.06, 0.86), (1.08, 0.958), (0.62, 0.964), (0.34, 0.94)],
        strips=[
            [(0.37, 0.905), (0.62, 0.928), (1.04, 0.925), (1.03, 0.868), (0.985, 0.86), (0.995, 0.895), (0.62, 0.9), (0.37, 0.88)],
            [(0.66, 0.824), (0.92, 0.83), (0.955, 0.86), (0.66, 0.852)],
        ],
        clear=[[(0.38, 0.838), (0.58, 0.824), (0.58, 0.858), (0.38, 0.864)]],
    )
    plate(car, back, 0.655, recess=0.02)
    tips(car, (0.5,), 0.335, radius=0.042)
    handles(car, [-0.02, -1.02])

    car.arches(0.034)
    car.cut()
    car.arch_lips(width=0.03, proud=0.008)
    car.patch(front, slab(-0.42, 0.42, 0.682, 0.696), "caliper", lift=0.004, thickness=0.004, mirror=False)
    car.patch(front, [(0.445, 0.66), (0.74, 0.637), (0.69, 0.656), (0.445, 0.676)], "caliper", lift=-0.012, thickness=0.004)
    badge(car, front, 0.724, radius=0.05)
    car.disc(front, 0.83, 0.375, 0.03, "drl", bezel="chrome", sink=0.035)
    badge(car, back, 0.885, radius=0.055)
    car.patch(back, slab(0.6, 0.92, 0.47, 0.492), "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.87, -0.24, -1.1, gap=0.034)
    car.bonnet(1.06, 0.76, front=nose - 0.14)
    car.stroke((-0.62, 0.62), (0.62, 0.62), back, steps=14, mirror=False)
    car.stroke((0.62, 0.62), (0.62, 0.965), back, steps=8)
    car.mirrors(0.84)
    car.patch(car.side, slab(0.98, 1.08, 0.74, 0.762), "caliper", lift=0.004)

    glass = car.cabin(
        screen=(1.08, 0.33),
        back=(-1.68, -1.99),
        roof=[(-1.68, 1.375), (-1.1, 1.425), (-0.2, 1.442), (0.33, 1.385)],
        windows=[((0.8, 0.22), (-0.2, -0.21)), ((-0.28, -0.29), (-1.27, -0.98))],
        base_inset=0.06,
        tumble=0.19,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.035),
        rail_bow=(0.08, 0.03),
        flat=(0.86, 0.88),
        power=(2.2, 3.0),
        sill=0.05,
        header=0.9,
    )
    pillar(car, (-0.2, -0.28), (-0.21, -0.29), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -1.95)
    spoiler(car, -1.68, 0.16, 1.1, fins=0.07)
    fin(car, -1.5)
    car.interior(seat=0.05, rear_bench=-0.88)
    return car.finish("#b3141d")


def trims(car, inner, outer, low, high, lean=0.03):
    outline = [(inner, low), (outer, low), (outer - lean, high), (inner + lean, high)]
    car.hollow(car.back, outline, 0.05, material="grille")
    return outline


def trims(car, inner, outer, low, high, lean=0.03):
    outline = [(inner, low), (outer, low), (outer - lean, high), (inner + lean, high)]
    car.hollow(car.back, outline, 0.05, material="grille")
    return outline


def trims(car, inner, outer, low, high, lean=0.03):
    outline = [(inner, low), (outer, low), (outer - lean, high), (inner + lean, high)]
    car.hollow(car.back, outline, 0.05, material="grille")
    return outline


def tiguan():
    car = Coach("volkswagen-tiguan-2-0-tsi", "split", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.875), (-axle, 0.915), (0.0, 0.915), (axle, 0.915), (nose - 0.34, 0.895), (nose, 0.85)],
        shoulder=[(stern, 1.14), (-1.75, 1.165), (-1.1, 1.145), (0.0, 1.115), (0.82, 1.095), (1.1, 1.085), (axle, 1.055), (nose - 0.4, 1.03), (nose - 0.12, 1.01), (nose, 1.0)],
        waist=[(stern, 1.02), (-axle, 1.025), (0.0, 1.005), (axle, 0.995), (nose - 0.34, 0.91), (nose - 0.14, 0.7), (nose, 0.62)],
        sill=[(stern, 0.56), (-1.85, 0.4), (1.85, 0.4), (nose, 0.47)],
        crown=[(stern, 0.0), (1.1, 0.04), (axle, 0.06), (nose, 0.05)],
        flare=(0.018, 0.02),
        keys=[nose - 0.34, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.1, 0.03, 0.0, 0.0, 0.025, 0.08), "bow": 0.09, "flat": 0.7, "power": 2.8},
        rear={"set": (0.12, 0.04, 0.0, 0.02, 0.04, 0.07), "bow": 0.04, "flat": 0.84, "power": 3.0},
        inset=0.03,
        shelf=0.035,
        flank=0.004,
        belly=0.008,
        tuck=0.08,
        cladding=1,
        sharp=(False, True, True, False, False),
        relief=lambda x, y: 0.02 * dome(x, y, 1.12, nose - 0.1, 0.62, 0.46),
    )
    front, back = car.front, car.back

    grille = car.hollow(front, slab(-0.5, 0.5, 0.875, 0.98), 0.045, mirror=False)
    grille.bars(3, material="chrome", share=0.32)
    car.headlamp(
        front,
        [(0.52, 0.875), (0.95, 0.875), (1.1, 0.905), (1.13, 1.0), (0.8, 0.992), (0.52, 0.98)],
        projectors=[(0.68, 0.932, 0.04), (0.87, 0.94, 0.04)],
        strips=[[(0.54, 0.881), (0.95, 0.882), (1.08, 0.91), (1.1, 0.98), (1.08, 0.977), (1.06, 0.92), (0.95, 0.897), (0.54, 0.896)]],
    )
    intake = car.hollow(front, [(-0.62, 0.38), (0.62, 0.38), (0.58, 0.6), (-0.58, 0.6)], 0.07, mirror=False)
    intake.bars(4, share=0.16)
    fog = car.hollow(front, [(0.72, 0.43), (1.0, 0.46), (1.0, 0.62), (0.72, 0.6)], 0.05)
    fog.bars(2, share=0.2, sink=0.15)
    plate(car, front, 0.68)

    rearlamp(
        car,
        back,
        [(0.42, 0.985), (0.8, 0.972), (1.08, 0.995), (1.1, 1.125), (0.8, 1.132), (0.42, 1.112)],
        strips=[
            [(0.45, 1.07), (0.8, 1.086), (1.07, 1.082), (1.07, 1.015), (1.03, 1.01), (1.035, 1.055), (0.8, 1.06), (0.45, 1.046)],
            [(0.45, 0.998), (0.8, 0.988), (0.98, 1.0), (0.98, 1.026), (0.8, 1.016), (0.45, 1.024)],
        ],
    )
    plate(car, back, 0.78, recess=0.02)
    left = trims(car, 0.4, 0.74, 0.36, 0.435)
    handles(car, [-0.02, -0.98], z=0.96)

    car.arches(0.055)
    car.cut()
    car.arch_lips(width=0.05, proud=0.012, material="trim_black")
    rim(car, back, left, 0.014, "chrome", mirror=True)
    car.patch(front, slab(-0.4, 0.4, 0.29, 0.345), "steel", lift=0.006, thickness=0.006, mirror=False)
    car.patch(back, slab(-0.32, 0.32, 0.33, 0.4), "steel", lift=0.006, thickness=0.006, mirror=False)
    badge(car, front, 0.928, radius=0.06)
    car.disc(front, 0.86, 0.525, 0.032, "drl", bezel="chrome", sink=0.035)
    badge(car, back, 1.05, radius=0.06)
    car.patch(back, slab(0.62, 0.94, 0.61, 0.635), "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.92, -0.24, -1.12, gap=0.055)
    car.bonnet(1.1, 0.78, front=nose - 0.12)
    car.stroke((-0.8, 0.72), (0.8, 0.72), back, steps=14, mirror=False)
    car.stroke((0.8, 0.72), (0.8, 0.97), back, steps=8)
    car.mirrors(0.86)

    glass = car.cabin(
        screen=(1.12, 0.42),
        back=(-1.93, -2.2),
        roof=[(-1.93, 1.575), (-1.0, 1.622), (-0.2, 1.632), (0.42, 1.58)],
        windows=[((0.84, 0.31), (-0.2, -0.21)), ((-0.28, -0.29), (-1.1, -1.06)), ((-1.17, -1.13), (-1.8, -1.6))],
        base_inset=0.06,
        tumble=0.17,
        drop=0.045,
        crest=0.09,
        bow=(0.15, 0.04),
        rail_bow=(0.08, 0.03),
        flat=(0.86, 0.88),
        power=(2.2, 3.0),
        sill=0.05,
        header=0.88,
    )
    pillar(car, (-0.2, -0.28), (-0.21, -0.29), high=0.11)
    pillar(car, (-1.1, -1.17), (-1.06, -1.13), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -2.16)
    rails(car, 0.25, -1.75, 0.57, lift=0.028, material="steel")
    beltline(car, 0.82, -1.8)
    spoiler(car, -1.93, 0.17, 1.06)
    fin(car, -1.6)
    car.interior(seat=0.1, rear_bench=-0.86)
    return car.finish("#b4541e")


def touareg():
    car = Coach("volkswagen-touareg-v6-tdi", "split", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.86), (-axle, 0.925), (0.0, 0.915), (axle, 0.92), (nose - 0.36, 0.895), (nose, 0.84)],
        shoulder=[(stern, 1.19), (-2.0, 1.235), (-1.24, 1.215), (0.0, 1.18), (0.78, 1.155), (1.04, 1.14), (axle, 1.095), (nose - 0.4, 1.055), (nose - 0.12, 1.03), (nose, 1.015)],
        waist=[(stern, 1.07), (-axle, 1.1), (-0.6, 1.03), (0.6, 1.02), (axle, 1.05), (nose - 0.36, 0.95), (nose - 0.14, 0.72), (nose, 0.64)],
        sill=[(stern, 0.56), (-2.0, 0.41), (2.0, 0.41), (nose, 0.46)],
        crown=[(stern, 0.0), (1.05, 0.04), (axle, 0.06), (nose, 0.05)],
        flare=(0.02, 0.03),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.26],
        front={"set": (0.11, 0.035, 0.0, 0.0, 0.03, 0.09), "bow": 0.11, "flat": 0.7, "power": 2.6},
        rear={"set": (0.14, 0.05, 0.0, 0.02, 0.06, 0.11), "bow": 0.06, "flat": 0.8, "power": 2.7},
        inset=0.035,
        shelf=0.04,
        flank=0.006,
        belly=0.008,
        tuck=0.08,
        cladding=1,
        sharp=(False, True, True, False, False),
        relief=lambda x, y: 0.02 * dome(x, y, 1.04, nose - 0.1, 0.64, 0.5),
    )
    front, back = car.front, car.back

    mask = [(-0.56, 0.79), (0.56, 0.79), (0.64, 0.875), (0.64, 1.0), (-0.64, 1.0), (-0.64, 0.875)]
    grille = car.hollow(front, mask, 0.05, mirror=False)
    grille.bars(4, material="chrome", share=0.46)
    car.headlamp(
        front,
        [(0.66, 0.89), (0.98, 0.895), (1.12, 0.935), (1.14, 1.025), (0.88, 1.015), (0.66, 1.005)],
        projectors=[(0.93, 0.955, 0.034), (1.03, 0.968, 0.03)],
        strips=[[(0.68, 0.897), (0.98, 0.902), (1.1, 0.938), (1.12, 1.008), (1.1, 1.006), (1.085, 0.948), (0.98, 0.918), (0.68, 0.913)], slab(0.68, 0.84, 0.95, 0.968)],
    )
    intake = car.hollow(front, [(-0.62, 0.36), (0.62, 0.36), (0.56, 0.6), (-0.56, 0.6)], 0.07, mirror=False)
    intake.bars(3, share=0.16)
    fog = car.hollow(front, [(0.7, 0.4), (1.02, 0.44), (1.03, 0.62), (0.7, 0.6)], 0.05)
    fog.bars(3, share=0.2, sink=0.15)
    plate(car, front, 0.635)

    rearlamp(
        car,
        back,
        [(0.36, 1.065), (0.85, 1.05), (1.1, 1.07), (1.12, 1.16), (0.85, 1.175), (0.36, 1.158)],
        strips=[
            [(0.39, 1.128), (0.85, 1.142), (1.09, 1.134), (1.09, 1.082), (1.05, 1.078), (1.055, 1.112), (0.85, 1.118), (0.39, 1.108)],
            [(0.39, 1.076), (0.82, 1.064), (1.0, 1.076), (1.0, 1.094), (0.82, 1.082), (0.39, 1.092)],
        ],
    )
    plate(car, back, 0.86, recess=0.02)
    left = trims(car, 0.38, 0.76, 0.34, 0.42)
    handles(car, [-0.06, -1.1], z=0.985)

    car.arches(0.055)
    car.cut()
    car.arch_lips(width=0.045, proud=0.01, material="trim_black")
    rim(car, front, mask, 0.016, "chrome")
    rim(car, back, left, 0.014, "chrome", mirror=True)
    car.patch(front, slab(-0.54, 0.54, 0.47, 0.488), "chrome", lift=-0.02, thickness=0.006, mirror=False)
    car.patch(back, slab(-0.36, 0.36, 1.104, 1.12), "chrome", lift=0.005, thickness=0.004, mirror=False)
    badge(car, front, 0.9, radius=0.065)
    badge(car, back, 1.03, radius=0.06)
    car.patch(back, slab(-0.9, 0.9, 0.585, 0.6), "chrome", lift=0.005, thickness=0.004, mirror=False)
    car.patch(back, slab(0.68, 1.0, 0.625, 0.65), "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.96, -0.36, -1.26, gap=0.055)
    car.bonnet(1.02, 0.8, front=nose - 0.13)
    car.stroke((-0.84, 0.74), (0.84, 0.74), back, steps=14, mirror=False)
    car.stroke((0.84, 0.74), (0.84, 1.05), back, steps=8)
    car.mirrors(0.8)
    car.patch(car.side, [(0.9, 0.5), (-1.05, 0.5), (-1.05, 0.518), (0.9, 0.518)], "chrome", lift=0.004, thickness=0.004)

    glass = car.cabin(
        screen=(1.04, 0.3),
        back=(-1.92, -2.42),
        roof=[(-1.92, 1.59), (-1.1, 1.672), (-0.3, 1.692), (0.3, 1.64)],
        windows=[((0.78, 0.19), (-0.32, -0.33)), ((-0.4, -0.41), (-1.24, -1.18)), ((-1.31, -1.25), (-2.04, -1.7))],
        base_inset=0.07,
        tumble=0.2,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.06),
        rail_bow=(0.08, 0.04),
        flat=(0.86, 0.84),
        power=(2.2, 2.6),
        sill=0.05,
        header=0.88,
    )
    pillar(car, (-0.32, -0.4), (-0.33, -0.41), high=0.11)
    pillar(car, (-1.24, -1.31), (-1.18, -1.25), high=0.11)
    car.wipers(glass)
    rails(car, 0.1, -1.72, 0.57, lift=0.022, material="steel")
    beltline(car, 0.76, -2.04)
    spoiler(car, -1.92, 0.2, 1.0)
    fin(car, -1.6)
    car.interior(seat=0.02, rear_bench=-1.0)
    return car.finish("#a7aaac")


CARS = {"volkswagen-golf-gti": golf_gti, "volkswagen-tiguan-2-0-tsi": tiguan, "volkswagen-touareg-v6-tdi": touareg}
