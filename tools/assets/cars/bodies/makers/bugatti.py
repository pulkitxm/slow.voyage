import math

from carkit import LID, bar, box, hexahedron
from kit import Coach, ellipse, loft, superellipse
from mathutils import Vector


def strip(a, b, width):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy) or 1.0
    ox, oy = -dy / length * width / 2, dx / length * width / 2
    return [(a[0] + ox, a[1] + oy), (b[0] + ox, b[1] + oy), (b[0] - ox, b[1] - oy), (a[0] - ox, a[1] - oy)]


def ribbon(points, width):
    left, right = [], []
    for n, point in enumerate(points):
        a = points[max(0, n - 1)]
        b = points[min(len(points) - 1, n + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy) or 1.0
        ox, oy = -dy / length * width / 2, dx / length * width / 2
        left.append((point[0] + ox, point[1] + oy))
        right.append((point[0] - ox, point[1] - oy))
    return left + right[::-1]


def lerp(a, b, share):
    return (a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share)


def shoe(low, high, top, foot):
    crest = high - top * 0.8
    return [(-foot, low), (foot, low)] + ellipse((0.0, crest), (top, high - crest), 9, 0.0, 180.0)


def horseshoe(car, low, high, top, foot, depth=0.08, columns=7, rows=7):
    outline = shoe(low, high, top, foot)
    pocket = car.hollow(car.front, outline, depth, mirror=False)
    pocket.mesh(columns, rows, share=0.14, sink=0.45)
    return outline


def shoe_rim(car, outline, material="chrome", width=0.02):
    count = len(outline)
    for n in range(count):
        car.patch(car.front, strip(outline[n], outline[(n + 1) % count], width), material, lift=0.003, thickness=0.012, mirror=False)


def scoop(car, front, back, y, half, height, material="body", mouth="grille"):
    for side in (1, -1) if y else (1,):
        sections = []
        for share in (0.0, 0.25, 0.6, 1.0):
            x = front + (back - front) * share
            base = car.top(x, side * y)[0].z
            rise = height * (1 - share) ** 0.8 + 0.012
            width = half * (1 - 0.5 * share)
            sections.append(superellipse((x, side * y, base + rise / 2 - 0.01), width, rise / 2 + 0.01, power=3.0, count=12))
        car.model.absorb(loft(sections, material))
        base = car.top(front, side * y)[0].z
        car.model.absorb(box((front + 0.004, side * y, base + height / 2), (0.012, half * 1.6, height * 0.68), mouth, bevel=0.01))


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


def two_tone(second, split):
    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band == 1:
            return "carbon"
        if second and (station[0] in ("rear", "rear_corner") or point.x < split):
            return second
        return "body"

    return paint


def bugatti(name, wheel, shape, carve, dress, glasshouse, crown, paint, seat=-0.05, haunch="body", **style):
    car = Coach(name, wheel, **style)
    car.skin(**shape(car))
    carve(car)
    car.arches(0.045, inner=0.09)
    car.cut()
    pair = car.arch_list
    for arch, material in zip(pair, ("body", haunch)):
        car.arch_list = [arch]
        car.arch_lips(width=0.022, proud=0.006, material=material)
    car.arch_list = pair
    dress(car)
    glass = car.cabin(**glasshouse(car))
    car.wipers(glass)
    crown(car)
    car.interior(seat=seat, spread=0.33, height=0.13, width=0.42, material="seat")
    return car.finish(paint)


SPLIT = -0.8


def chiron_shape(car, second="livery_dark", tail=(0.87, 0.93), brow=0.6, haunch=0.975, front=None, rear=None, back_key=0.36, sharp=(True, False, False, False, False), lift=0.13, sill_tail=0.46):
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    return dict(
        half=[(stern, tail[0]), (-axle, 1.0), (-0.45, 0.95), (0.5, 0.94), (axle, 1.0), (nose - 0.3, 0.9), (nose, 0.72)],
        shoulder=[(stern, tail[1]), (-axle, haunch), (-0.5, 0.93), (0.4, 0.885), (0.95, 0.86), (axle, 0.815), (nose - 0.35, 0.7), (nose, brow)],
        waist=[(stern, 0.7), (-axle, 0.68), (0.0, 0.58), (axle, 0.54), (nose, 0.44)],
        sill=[(stern, sill_tail), (-axle, 0.33), (-0.7, 0.34), (axle - 0.45, 0.34), (axle, 0.28), (nose, 0.25)],
        crown=[(stern, 0.01), (-axle, 0.0), (0.3, 0.0), (0.95, -0.01), (axle, -0.06), (nose - 0.3, -0.03), (nose, 0.0)],
        flare=(0.03, 0.035),
        keys=[nose - 0.5, axle, 0.45, SPLIT, -axle, stern + back_key],
        front=front or {"set": (0.16, 0.05, 0.01, 0.0, 0.06, 0.2), "bow": 0.2, "flat": 0.52, "power": 2.2},
        rear=rear or {"set": (0.24, 0.1, 0.04, 0.012, 0.02, 0.08), "bow": 0.09, "flat": 0.72, "power": 2.3},
        inset=0.1,
        shelf=0.06,
        rise=0.03,
        flank=0.02,
        belly=0.008,
        rear_lift=lift,
        front_lift=0.0,
        sharp=sharp,
        paint=two_tone(second, SPLIT + 0.01),
    )


def chiron_glass(car, pillar="body", roof="body", drop=0.0, tail=0.22, window=((0.72, 0.3), (-0.66, -0.42))):
    stern, peak = car.stern_x, car.height - drop
    return dict(
        screen=(1.0, 0.38),
        back=(-0.8, stern + tail),
        roof=[(-0.8, peak - 0.085), (-0.3, peak - 0.02), (0.05, peak), (0.38, peak - 0.03)],
        windows=[window],
        base=[(-0.66, 0.76), (0.0, 0.76), (0.72, 0.755), (1.0, 0.74)],
        rail=[(-0.8, 0.44), (-0.45, 0.52), (0.0, 0.57), (0.38, 0.54)],
        bow=(0.22, 0.1),
        rail_bow=(0.13, 0.06),
        flat=(0.9, 0.6),
        power=(2.8, 2.4),
        bulge=0.03,
        drop=0.05,
        pillar=pillar,
        roof_material=roof,
        fit=False,
    )


C_LINE = [(0.28, 1.1), (-0.15, 1.108), (-0.42, 1.085), (-0.58, 1.03), (-0.68, 0.97), (-0.76, 0.88), (-0.8, 0.76), (-0.8, 0.6), (-0.75, 0.48), (-0.62, 0.4), (-0.4, 0.365), (0.3, 0.36), (0.92, 0.36)]


def c_line(car, material="chrome", width=0.04, second=None):
    if second:
        car.patch(car.side, [(-0.81, 0.352), (-0.81, 0.6), (-0.75, 0.48), (-0.62, 0.4), (-0.4, 0.365), (-0.4, 0.352)], second, lift=0.003)
    car.patch(car.side, ribbon(C_LINE, width), material, lift=0.006, thickness=0.014)


def c_intake(car):
    pocket = car.hollow(car.side, [(-0.6, 0.5), (-0.74, 0.54), (-0.76, 0.84), (-0.66, 0.88)], 0.12)
    pocket.mesh(3, 6)


def quad_lamps(car, squares=4):
    low = ((0.28, 0.5), (0.92, 0.535))
    high = ((0.28, 0.585), (0.92, 0.62))
    cells = []
    for n in range(squares):
        start, end = (n + 0.14) / squares, (n + 0.86) / squares
        a, b = lerp(low[0], low[1], start), lerp(low[0], low[1], end)
        c, d = lerp(high[0], high[1], end), lerp(high[0], high[1], start)
        cells.append([(a[0], a[1] + 0.014), (b[0], b[1] + 0.014), (c[0], c[1] - 0.014), (d[0], d[1] - 0.014)])
    car.headlamp(car.front, [low[0], low[1], high[1], high[0]], strips=cells)


def light_bar(car, half, z, tall=0.04, sink=0.012):
    car.lamp(car.back, [(-half, z - tall / 2), (half, z - tall / 2), (half, z + tall / 2), (-half, z + tall / 2)], "tail", lift=-sink, thickness=0.01, mirror=False)


def spine(car, front, back, material, half=0.045):
    car.patch(car.top, [(front, -half), (front, half), (back, half * 0.7), (back, -half * 0.7)], material, lift=0.008, thickness=0.012, mirror=False)


def chiron(name, longtail=False):
    second = None if longtail else "livery_dark"

    def shape(car):
        if longtail:
            return chiron_shape(car, second=None, tail=(0.78, 0.85), rear={"set": (0.3, 0.12, 0.04, 0.012, 0.02, 0.09), "bow": 0.1, "flat": 0.7, "power": 2.3}, back_key=0.44, sill_tail=0.34)
        return chiron_shape(car, second=second)

    def carve(car):
        nose, axle = car.nose_x, car.axle
        front, back = car.front, car.back
        car.shoe = horseshoe(car, 0.31, 0.585, 0.205, 0.135)
        duct = car.hollow(front, [(0.29, 0.275), (0.96, 0.3), (0.96, 0.47), (0.31, 0.45)], 0.09)
        duct.mesh(8, 3)
        quad_lamps(car)
        c_intake(car)
        high = 0.79 if longtail else 0.86
        tall = 0.22 if longtail else 0.32
        panel = car.hollow(back, [(-0.78, high - tall), (0.78, high - tall), (0.82, high), (-0.82, high)], 0.07, mirror=False)
        panel.mesh(24, 4 if longtail else 5)
        if longtail:
            car.hollow(back, [(0.4, 0.3), (0.6, 0.3), (0.6, 0.53), (0.4, 0.53)], 0.08)
            for row, y in enumerate((0.74, 0.83)):
                for n in range(4):
                    car.hollow(car.top, ellipse((axle + 0.16 - n * 0.095 - row * 0.03, y), (0.03, 0.03), 8), 0.02)
        else:
            car.hollow(back, [(-0.3, 0.29), (0.3, 0.29), (0.25, 0.44), (-0.25, 0.44)], 0.09, mirror=False)

    def dress(car):
        nose, stern = car.nose_x, car.stern_x
        back, top, side = car.back, car.top, car.side
        shoe_rim(car, car.shoe)
        car.patch(car.front, ellipse((0.0, 0.62), (0.03, 0.02), 10), "caliper", lift=0.004, mirror=False)
        car.patch(car.front, [(-0.26, 0.18), (0.26, 0.18), (0.26, 0.29), (-0.26, 0.29)], "plate", lift=0.006, mirror=False)
        car.stroke((nose - 0.22, 0.2), (1.0, 0.6), top, steps=14)
        if longtail:
            light_bar(car, 0.76, 0.735)
            for z in (0.365, 0.47):
                car.pipes((0.5, -0.5), stern + 0.05, z, radius=0.046, length=0.12, material="steel")
            car.patch(back, [(-0.26, 0.4), (0.26, 0.4), (0.26, 0.51), (-0.26, 0.51)], "plate", lift=0.004, mirror=False)
            strakes(car, 4, 0.6, stern + 0.42, stern + 0.1, (0.26, 0.33), (0.2, 0.25))
            for y in (0.07, -0.07):
                car.patch(top, [(nose - 0.24, y - 0.016), (nose - 0.24, y + 0.016), (1.0, y + 0.016), (1.0, y - 0.016)], "livery_orange", lift=0.005, mirror=False)
            car.patch(side, [(0.9, 0.315), (0.9, 0.34), (-0.9, 0.36), (-0.9, 0.335)], "livery_orange", lift=0.005)
        else:
            light_bar(car, 0.76, 0.8)
            car.patch(back, [(-0.29, 0.3), (0.29, 0.3), (0.245, 0.435), (-0.245, 0.435)], "steel", lift=-0.035, thickness=0.03, mirror=False)
            car.patch(back, [(-0.255, 0.322), (0.255, 0.322), (0.22, 0.413), (-0.22, 0.413)], "seam", lift=-0.03, mirror=False)
            car.pipes((0.115, -0.115), stern + 0.05, 0.368, radius=0.042, length=0.12, material="steel")
            car.patch(back, [(-0.26, 0.6), (0.26, 0.6), (0.26, 0.71), (-0.26, 0.71)], "plate", lift=-0.012, mirror=False)
            strakes(car, 8, 1.3, stern + 0.36, stern + 0.08, (0.3, 0.42), (0.21, 0.27))
        car.lip(nose - 0.12, car.sheet.clearance + 0.012, 1.44, depth=0.16, thickness=0.02, material="carbon", sweep_back=0.22)
        car.stroke((0.74, 0.31), (0.74, 0.86), side, steps=10, lift=0.004)
        car.mirrors(0.66, size=(0.09, 0.17, 0.085), reach=0.07, lift=0.07, material="carbon" if longtail else "body")

    def glasshouse(car):
        return chiron_glass(car, pillar="body" if longtail else second, roof="body" if longtail else second, tail=0.3 if longtail else 0.22)

    def crown(car):
        stern = car.stern_x
        c_line(car, "livery_orange" if longtail else "chrome", width=0.026 if longtail else 0.04, second=second)
        if not longtail:
            deck = car.top(stern + 0.24, 0)[0].z
            car.lip(stern + 0.19, deck + 0.006, 1.36, depth=0.2, thickness=0.02, material=second, sweep_back=-0.1)
            spine(car, -0.82, stern + 0.4, second, half=0.05)
        else:
            for y in (0.07, -0.07):
                car.patch(car.top, [(0.34, y - 0.016), (0.34, y + 0.016), (-0.76, y + 0.016), (-0.76, y - 0.016)], "livery_orange", lift=0.003, mirror=False)
            spine(car, -0.82, stern + 0.4, "livery_orange", half=0.02)
        for n in range(4):
            x = -0.98 - n * 0.2
            car.patch(car.top, [(x, 0.07), (x, 0.3 + n * 0.02), (x - 0.12, 0.31 + n * 0.02), (x - 0.12, 0.07)], "carbon", lift=0.01, thickness=0.012)

    if longtail:
        return bugatti(name, "star", shape, carve, dress, glasshouse, crown, "#1b1c1f", metal="rim_dark", barrel="rim_dark")
    return bugatti(name, "split", shape, carve, dress, glasshouse, crown, "#1f58c7", haunch=second, barrel="rim_dark")


def veyron():
    second = "carbon"

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band == 1:
            return second
        if band == LID and point.x < 0.85:
            return second
        if band == 6 and -0.62 < point.x < 0.85:
            return second
        if band == 5 and -0.55 < point.x < 0.7:
            return second
        return "body"

    def shape(car):
        nose, stern, axle = car.nose_x, car.stern_x, car.axle
        return dict(
            half=[(stern, 0.84), (-axle, 1.0), (-0.45, 0.955), (0.5, 0.95), (axle, 1.0), (nose - 0.3, 0.9), (nose, 0.72)],
            shoulder=[(stern, 0.85), (-axle, 0.95), (-0.5, 0.92), (0.4, 0.885), (0.95, 0.865), (axle, 0.82), (nose - 0.35, 0.72), (nose, 0.6)],
            waist=[(stern, 0.66), (-axle, 0.66), (0.0, 0.58), (axle, 0.55), (nose, 0.45)],
            sill=[(stern, 0.44), (-axle, 0.3), (0.0, 0.26), (axle, 0.26), (nose, 0.27)],
            crown=[(stern, 0.02), (-axle, 0.02), (0.3, 0.0), (0.95, -0.01), (axle, -0.07), (nose - 0.3, -0.04), (nose, 0.0)],
            flare=(0.03, 0.035),
            keys=[nose - 0.5, axle, 0.45, -0.45, -axle, stern + 0.4],
            front={"set": (0.16, 0.05, 0.01, 0.0, 0.05, 0.18), "bow": 0.22, "flat": 0.5, "power": 2.0},
            rear={"set": (0.24, 0.1, 0.04, 0.012, 0.024, 0.1), "bow": 0.14, "flat": 0.62, "power": 2.0},
            inset=0.1,
            shelf=0.06,
            rise=0.03,
            flank=0.024,
            belly=0.01,
            rear_lift=0.13,
            front_lift=0.0,
            sharp=(True, False, False, False, False),
            paint=paint,
        )

    def carve(car):
        nose = car.nose_x
        front, back = car.front, car.back
        car.shoe = horseshoe(car, 0.32, 0.59, 0.195, 0.13)
        duct = car.hollow(front, [(0.3, 0.3), (0.94, 0.32), (0.94, 0.48), (0.32, 0.465)], 0.09)
        duct.mesh(8, 3)
        car.headlamp(
            car.top,
            [(nose - 0.2, 0.34), (nose - 0.3, 0.56), (nose - 0.5, 0.79), (nose - 0.66, 0.75), (nose - 0.42, 0.34)],
            projectors=[(nose - 0.33, 0.43, 0.042), (nose - 0.44, 0.6, 0.038)],
            strips=[strip((nose - 0.53, 0.7), (nose - 0.58, 0.745), 0.035)],
        )
        scoop_side = car.hollow(car.side, ellipse((-0.72, 0.6), (0.1, 0.19), 10), 0.12)
        scoop_side.mesh(3, 5)
        panel = car.hollow(back, [(-0.74, 0.6), (0.74, 0.6), (0.765, 0.8), (-0.765, 0.8)], 0.06, mirror=False)
        panel.mesh(22, 4)
        car.hollow(back, [(-0.28, 0.3), (0.28, 0.3), (0.26, 0.42), (-0.26, 0.42)], 0.09, mirror=False)
        lower = car.hollow(back, [(0.38, 0.3), (0.7, 0.32), (0.68, 0.43), (0.4, 0.43)], 0.06)
        lower.mesh(5, 2)

    def dress(car):
        nose, stern = car.nose_x, car.stern_x
        back, top, side = car.back, car.top, car.side
        car.patch(
            top,
            [(nose - 0.23, -0.2), (nose - 0.23, 0.2), (nose - 0.5, 0.27), (1.5, 0.4), (1.2, 0.56), (0.97, 0.69), (0.97, -0.69), (1.2, -0.56), (1.5, -0.4), (nose - 0.5, -0.27)],
            second,
            lift=0.003,
            mirror=False,
        )
        shoe_rim(car, car.shoe)
        car.patch(car.front, [(-0.26, 0.19), (0.26, 0.19), (0.26, 0.3), (-0.26, 0.3)], "plate", lift=0.006, mirror=False)
        axle = car.axle
        door = [(axle - 0.76 * math.cos(math.radians(a)), 0.34 + 0.76 * math.sin(math.radians(a))) for a in (-4, 10, 22, 34, 44)]
        door += [(-axle + 0.74 * math.cos(math.radians(a)), 0.36 + 0.74 * math.sin(math.radians(a))) for a in (50, 40, 28, 16, 4, -4)]
        car.patch(side, door, second, lift=0.003)
        for t, radius in ((0.61, 0.074), (0.43, 0.06)):
            car.disc(back, t, 0.7, radius, "tail", bezel="chrome", depth=0.03, sink=0.045)
        car.patch(back, [(-0.27, 0.305), (0.27, 0.305), (0.25, 0.415), (-0.25, 0.415)], "chrome", lift=-0.035, thickness=0.03, mirror=False)
        car.patch(back, [(-0.238, 0.326), (0.238, 0.326), (0.222, 0.394), (-0.222, 0.394)], "seam", lift=-0.03, mirror=False)
        car.patch(back, [(-0.26, 0.465), (0.26, 0.465), (0.26, 0.575), (-0.26, 0.575)], "plate", lift=0.004, mirror=False)
        strakes(car, 6, 1.2, stern + 0.4, stern + 0.12, (0.29, 0.4), (0.21, 0.27))
        car.lip(nose - 0.12, car.sheet.clearance + 0.012, 1.4, depth=0.14, thickness=0.02, material="carbon", sweep_back=0.22)
        car.stroke((0.72, 0.3), (0.72, 0.86), side, steps=10, lift=0.006)
        car.mirrors(0.64, size=(0.09, 0.17, 0.09), reach=0.07, lift=0.07)

    def glasshouse(car):
        stern, peak = car.stern_x, car.height
        return dict(
            screen=(0.96, 0.3),
            back=(-0.62, stern + 0.36),
            roof=[(-0.62, peak - 0.09), (-0.1, peak), (0.3, peak - 0.035)],
            windows=[((0.68, 0.22), (-0.46, -0.34))],
            base=[(-0.5, 0.76), (0.68, 0.755), (0.96, 0.74)],
            rail=[(-0.62, 0.44), (-0.1, 0.56), (0.3, 0.52)],
            bow=(0.24, 0.1),
            rail_bow=(0.14, 0.06),
            flat=(0.88, 0.6),
            power=(2.6, 2.2),
            bulge=0.035,
            drop=0.05,
            pillar=second,
            roof_material=second,
            fit=False,
        )

    def crown(car):
        stern = car.stern_x
        scoop(car, -0.62, -1.3, 0.3, 0.12, 0.08, material="chrome")
        deck = car.top(stern + 0.26, 0)[0].z
        car.lip(stern + 0.22, deck + 0.006, 1.2, depth=0.22, thickness=0.02, material=second, sweep_back=-0.14)

    return bugatti("bugatti-veyron", "ten", shape, carve, dress, glasshouse, crown, "#b8131f", barrel="rim_dark")


def divo():
    second = "carbon"

    def shape(car):
        return chiron_shape(car, second=second, brow=0.57, front={"set": (0.2, 0.05, 0.0, 0.0, 0.07, 0.22), "bow": 0.22, "flat": 0.54, "power": 1.9}, sharp=(True, True, True, False, False))

    def carve(car):
        nose = car.nose_x
        front, back, top = car.front, car.back, car.top
        car.shoe = horseshoe(car, 0.3, 0.555, 0.195, 0.135)
        duct = car.hollow(front, [(0.29, 0.25), (1.0, 0.27), (1.0, 0.48), (0.31, 0.455)], 0.1)
        duct.mesh(9, 4)
        a, b = (nose - 0.28, 0.33), (nose - 0.53, 0.78)
        car.headlamp(top, ribbon([a, lerp(a, b, 0.5), b], 0.07), strips=[ribbon([lerp(a, b, 0.05), lerp(a, b, 0.5), lerp(a, b, 0.95)], 0.024)], depth=0.03)
        vent = car.hollow(top, [(nose - 0.62, 0.2), (nose - 0.64, 0.4), (nose - 0.96, 0.46), (nose - 0.94, 0.24)], 0.05)
        vent.bars(2, axis=0, material="carbon", share=0.1)
        c_intake(car)
        panel = car.hollow(back, [(-0.78, 0.5), (0.78, 0.5), (0.82, 0.88), (-0.82, 0.88)], 0.08, mirror=False)
        panel.mesh(24, 6)
        car.hollow(back, [(-0.3, 0.33), (0.3, 0.33), (0.3, 0.46), (-0.3, 0.46)], 0.08, mirror=False)

    def dress(car):
        nose, stern = car.nose_x, car.stern_x
        front, back, top, side = car.front, car.back, car.top, car.side
        shoe_rim(car, car.shoe, material="carbon")
        car.patch(front, [(-0.26, 0.175), (0.26, 0.175), (0.26, 0.285), (-0.26, 0.285)], "plate", lift=0.006, mirror=False)
        car.patch(front, [(1.0, 0.3), (1.035, 0.3), (1.035, 0.53), (1.0, 0.53)], "lens_clear", lift=0.006, thickness=0.006, group="Headlights")
        for row, z in enumerate((0.81, 0.74, 0.67)):
            for n in range(6):
                t = 0.3 + n * 0.085
                tall = 0.013 + 0.003 * n
                car.patch(back, [(t, z - tall), (t + 0.05, z - tall), (t + 0.062, z + tall), (t + 0.012, z + tall)], "lens_ember", lift=-0.012, thickness=0.03, group="Taillights")
        car.pipes((0.2, 0.068, -0.068, -0.2), stern + 0.05, 0.395, radius=0.05, length=0.12, material="steel")
        car.patch(back, [(-0.26, 0.535), (0.26, 0.535), (0.26, 0.645), (-0.26, 0.645)], "plate", lift=-0.012, mirror=False)
        strakes(car, 8, 1.36, stern + 0.4, stern + 0.1, (0.3, 0.44), (0.2, 0.26), material="carbon")
        car.patch(side, [(0.92, 0.27), (0.92, 0.325), (-0.44, 0.325), (-0.44, 0.27)], "livery_dark", lift=0.012, thickness=0.02)
        car.lip(nose - 0.14, car.sheet.clearance + 0.012, 1.74, depth=0.24, thickness=0.02, material="carbon", sweep_back=0.26)
        start, lean = front(0.88, 0.27)
        end, turn = front(1.12, 0.27)
        car.model.add(bar(start + lean * 0.03, end + turn * 0.03, 0.012, 0.18, "carbon"))
        car.stroke((0.74, 0.31), (0.74, 0.86), side, steps=10, lift=0.004)
        car.mirrors(0.66, size=(0.09, 0.17, 0.085), reach=0.07, lift=0.07, material="carbon")

    def glasshouse(car):
        return chiron_glass(car, pillar=second, roof="body")

    def crown(car):
        stern = car.stern_x
        c_line(car, "livery_dark", width=0.035, second=second)
        scoop(car, -0.42, -0.8, 0.0, 0.13, 0.012, material="carbon")
        blade(car, -0.5, stern + 0.42, 0.012, 1.19, material="carbon")
        car.wing(stern + 0.2, 1.135, 1.83, chord=0.3, angle=7, material="carbon", plates=(0.13, 0.34), pylons=(0.32,), plate_material="carbon")

    return bugatti("bugatti-divo", "mesh", shape, carve, dress, glasshouse, crown, "#8e959b", haunch=second, metal="rim_dark", barrel="rim_dark")


def centodieci():
    def shape(car):
        return chiron_shape(car, second=None, brow=0.5, front={"set": (0.16, 0.04, 0.012, 0.008, 0.1, 0.28), "bow": 0.12, "flat": 0.64, "power": 2.6}, sharp=(True, True, True, True, False))

    def carve(car):
        nose = car.nose_x
        front, back, top = car.front, car.back, car.top
        car.shoe = horseshoe(car, 0.34, 0.47, 0.085, 0.06, columns=3, rows=3)
        duct = car.hollow(front, [(0.15, 0.345), (0.92, 0.36), (0.92, 0.455), (0.15, 0.445)], 0.07)
        duct.mesh(10, 2)
        mouth = car.hollow(front, [(-0.72, 0.2), (0.72, 0.2), (0.68, 0.29), (-0.68, 0.29)], 0.07, mirror=False)
        mouth.mesh(16, 2)
        a, b = (nose - 0.36, 0.3), (nose - 0.54, 0.8)
        car.headlamp(top, ribbon([a, lerp(a, b, 0.5), b], 0.08), strips=[ribbon([lerp(a, b, 0.04), lerp(a, b, 0.5), lerp(a, b, 0.96)], 0.03)], depth=0.03)
        for dx, dz in ((0.0, 0.0), (0.09, 0.0), (-0.09, 0.0), (0.0, 0.058), (0.0, -0.058)):
            car.hollow(car.side, ellipse((-0.7 + dx, 0.78 + dz), (0.03, 0.03), 8), 0.05)
        panel = car.hollow(back, [(-0.8, 0.5), (0.8, 0.5), (0.84, 0.88), (-0.84, 0.88)], 0.08, mirror=False)
        panel.mesh(24, 6)
        car.hollow(back, [(0.1, 0.29), (0.25, 0.29), (0.25, 0.46), (0.1, 0.46)], 0.08)

    def dress(car):
        nose, stern = car.nose_x, car.stern_x
        back, top, side = car.back, car.top, car.side
        shoe_rim(car, car.shoe, width=0.012)
        car.patch(car.front, [(-0.26, 0.2), (0.26, 0.2), (0.26, 0.3), (-0.26, 0.3)], "plate", lift=0.005, mirror=False)
        car.stroke((nose - 0.32, 0.26), (1.0, 0.6), top, steps=14)
        for n in range(4):
            t = 0.03 + n * 0.195
            car.lamp(back, [(t, 0.77), (t + 0.165, 0.77), (t + 0.165, 0.83), (t, 0.83)], "tail", lift=-0.014, thickness=0.02)
        for z in (0.335, 0.415):
            car.pipes((0.175, -0.175), stern + 0.05, z, radius=0.038, length=0.12, material="steel")
        car.patch(back, [(-0.26, 0.56), (0.26, 0.56), (0.26, 0.67), (-0.26, 0.67)], "plate", lift=-0.012, mirror=False)
        strakes(car, 6, 1.3, stern + 0.4, stern + 0.1, (0.3, 0.44), (0.2, 0.26))
        car.lip(nose - 0.1, car.sheet.clearance + 0.012, 1.62, depth=0.16, thickness=0.02, material="carbon", sweep_back=0.1)
        car.stroke((0.74, 0.31), (0.74, 0.86), side, steps=10)
        car.mirrors(0.66, size=(0.09, 0.17, 0.085), reach=0.07, lift=0.07)

    def glasshouse(car):
        return chiron_glass(car, window=((0.72, 0.3), (-0.5, -0.4)))

    def crown(car):
        stern = car.stern_x
        car.wing(stern + 0.18, 1.1, 1.62, chord=0.3, angle=5, material="body", plates=(0.26, 0.3), plate_material="body")
        for n in range(4):
            x = -0.98 - n * 0.2
            car.patch(car.top, [(x, 0.05), (x, 0.3 + n * 0.02), (x - 0.12, 0.31 + n * 0.02), (x - 0.12, 0.05)], "carbon", lift=0.01, thickness=0.012)

    return bugatti("bugatti-centodieci", "blade", shape, carve, dress, glasshouse, crown, "#f2f2ef", barrel="rim_dark")


def chiron_base():
    return chiron("bugatti-chiron")


def chiron_super_sport():
    return chiron("bugatti-chiron-super-sport-300", longtail=True)


CARS = {
    "bugatti-veyron": veyron,
    "bugatti-divo": divo,
    "bugatti-centodieci": centodieci,
    "bugatti-chiron": chiron_base,
    "bugatti-chiron-super-sport-300": chiron_super_sport,
}
