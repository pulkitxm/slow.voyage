import math

import bmesh
from mathutils import Vector

from carkit import LEFT, UP, box, bump, closed, slot, sweep
from kit import Coach, ellipse


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def shell(rings, materials, first=None, last=None):
    bm = bmesh.new()
    loops = [[bm.verts.new(Vector(point)) for point in ring] for ring in rings]
    count = len(loops[0])
    paints = materials if isinstance(materials, (list, tuple)) else [materials] * (len(loops) - 1)
    for paint, a, b in zip(paints, loops, loops[1:]):
        for i in range(count):
            j = (i + 1) % count
            bm.faces.new((a[i], a[j], b[j], b[i])).material_index = slot(paint)
    for ring, paint in ((loops[0], first), (loops[-1], last)):
        if paint:
            bm.faces.new(ring).material_index = slot(paint)
    return closed(bm)


def scoop(car, front, back, half, height, lip=0.014, throat=0.1, power=3.4, pinch=0.92, steps=7):
    def ring(x, wide, tall, count=22):
        points = []
        for i in range(count):
            angle = 2 * math.pi * i / count
            cosine, sine = math.cos(angle), math.sin(angle)
            a = abs(cosine) ** (2 / power) * (1 if cosine >= 0 else -1)
            b = abs(sine) ** (2 / power) * (1 if sine >= 0 else -1)
            y = a * wide
            points.append((x, y, car.top(x, y)[0].z - 0.003 + (b * tall if b > 0 else b * 0.012)))
        return points

    rings = [
        ring(front - throat, half - lip * 2.4, height * 0.6),
        ring(front - 0.014, half - lip, height - lip),
        ring(front, half - 0.004, height - 0.003),
        ring(front - 0.016, half, height),
    ]
    materials = ["grille", "body", "body"]
    for n in range(1, steps + 1):
        share = n / steps
        x = front - 0.016 + (back - front + 0.016) * share
        rings.append(ring(x, half * (1 - (1 - pinch) * share**2), height * (1 - share) ** 0.85 + 0.006))
        materials.append("body")
    car.model.absorb(shell(rings, materials, first="grille", last="body"))
    inner = half - lip * 1.6
    car.patch(car.top, rect(front - throat, front - 0.016, -inner, inner), "grille", lift=0.003, mirror=False)


def sti_wing(car, x, top, half, foot, chord=0.25, root=0.38, thick=0.036, post=0.028, radius=0.1, pitch=7.0, rake=0.12, arch=0.0, material="body", sink=0.03):
    low = car.top(x + rake, foot)[0].z - sink
    left = [(foot + (half - foot) * n / 3, low + (top - radius - low) * n / 3, n / 3, 0.0) for n in range(4)]
    for n in range(1, 5):
        angle = math.pi / 2 * n / 4
        left.append((half - radius + radius * math.cos(angle), top - radius + radius * math.sin(angle), 1.0, n / 4))
    reach = half - radius
    for n in range(1, 4):
        y = reach * (1 - n / 3)
        left.append((y, top + arch * (1 - (y / reach) ** 2), 1.0, 1.0))
    path = left + [(-y, z, rise, turn) for y, z, rise, turn in reversed(left[:-1])]
    rings = []
    samples = 6
    for n, (y, z, rise, turn) in enumerate(path):
        before = path[max(0, n - 1)]
        after = path[min(len(path) - 1, n + 1)]
        along = Vector((after[0] - before[0], after[1] - before[1])).normalized()
        out = Vector((along.y, -along.x))
        length = root + (chord - root) * rise**0.8
        deep = post + (thick - post) * turn
        lean = math.radians(pitch) * turn
        middle = x + rake * (1 - rise) ** 1.4
        profile = [(s / samples, deep * 0.5 * math.sin(math.pi * (s / samples) ** 0.6)) for s in range(samples + 1)]
        profile += [(s / samples, -deep * 0.42 * math.sin(math.pi * (s / samples) ** 0.7)) for s in range(samples - 1, 0, -1)]
        ring = []
        for share, height in profile:
            run = (0.5 - share) * length
            offset = height - run * math.sin(lean)
            ring.append((middle + run * math.cos(lean), y + out.x * offset, z + out.y * offset))
        rings.append(ring)
    car.model.absorb(shell(rings, material, first=material, last=material))


def vane(car, x, half, chord=0.1, lift=0.032, thick=0.012, stays=(0.0, 0.24, 0.46), material="body"):
    rings = []
    for n in range(9):
        y = -half + 2 * half * n / 8
        z = car.top(x, y)[0].z + lift
        back = 0.02 * (y / half) ** 2
        rings.append(
            [
                (x + chord / 2 - back, y, z - 0.004),
                (x + chord * 0.2 - back, y, z + thick * 0.5),
                (x - chord / 2 - back, y, z + thick * 0.7),
                (x - chord / 2 - back, y, z + thick * 0.3),
                (x + chord * 0.2 - back, y, z - thick * 0.5),
            ]
        )
    car.model.absorb(shell(rings, material, first=material, last=material))
    for y in stays:
        for side in (1, -1) if y else (1,):
            foot = car.top(x, side * y)[0].z - 0.006
            car.model.absorb(box((x, side * y, foot + (lift + 0.006) / 2), (chord * 0.6, 0.014, lift + 0.01), material))


def skirts(car, front, back, drop=0.09, proud=0.012, material="body", count=14):
    points = []
    for n in range(count + 1):
        x = front + (back - front) * n / count
        z = car.sill_at(x)
        points.append(Vector((x, car.side(x, z + 0.015)[0].y, z)))
    profile = [(-0.07, 0.004), (proud, 0.004), (proud + 0.006, -0.014), (proud, -drop + 0.014), (proud - 0.014, -drop), (-0.07, -drop)]
    car.model.add(sweep(points, [LEFT] * len(points), [UP] * len(points), profile, material))


def chin(car, sample, z, reach, proud=0.0, depth=0.16, thick=0.022, material="trim_black", count=30):
    front = car.front
    points = []
    for n in range(count + 1):
        t = -reach + 2 * reach * n / count
        hit = front(t, sample)[0]
        points.append(Vector((hit.x, hit.y, z)))
    outs = []
    for n in range(len(points)):
        along = points[min(len(points) - 1, n + 1)] - points[max(0, n - 1)]
        outs.append(Vector((along.y, -along.x, 0)).normalized())
    profile = [(-depth, -thick / 2), (proud - 0.008, -thick / 2), (proud, 0.0), (proud - 0.008, thick / 2), (-depth, thick / 2)]
    car.model.absorb(sweep(points, outs, [UP] * len(points), profile, material))


def doors(car, front, middle, rear, gap):
    low = lambda x: car.sill_at(x) + 0.012
    high = lambda x: car.shoulder_at(x) - 0.012
    hub = car.rear_wheel["radius"]
    reach = hub + gap + 0.06
    turn = math.acos(min(1.0, (rear + car.axle) / reach))
    arc = [(-car.axle + reach * math.cos(turn * (1 - n / 8)), hub + reach * math.sin(turn * (1 - n / 8))) for n in range(9)]
    for x in (front, middle):
        car.stroke((x, low(x)), (x, high(x)), car.side)
    car.seam([(rear, high(rear))] + arc, car.side)
    car.stroke((front, low(front) + 0.002), (arc[-1][0], low(arc[-1][0]) + 0.002), car.side, steps=12)


def cluster(car, caster, outline, depth=0.03, lens="lens_tail", strips=(), clear=(), lining="lens_smoke", cover=False):
    car.hollow(caster, outline, depth, material=lining)
    floor = -depth * 0.7
    car.patch(caster, outline, lens, lift=floor, group="Taillights")
    for strip in strips:
        car.patch(caster, strip, "lens_ember", lift=floor + 0.008, thickness=0.006, group="Taillights")
    for piece in clear:
        car.patch(caster, piece, "lens_clear", lift=floor + 0.008, thickness=0.006)
    if cover:
        car.patch(caster, outline, "cover", lift=0.0015)


def wing_mirror(car, x, drop=0.025, reach=0.03, wide=0.19, tall=0.12, deep=0.13, material="body", power=2.6):
    def ring(y, low, half_x, half_z, count=14):
        points = []
        for i in range(count):
            angle = 2 * math.pi * i / count
            cosine, sine = math.cos(angle), math.sin(angle)
            a = abs(cosine) ** (2 / power) * (1 if cosine >= 0 else -1)
            b = abs(sine) ** (2 / power) * (1 if sine >= 0 else -1)
            points.append((x + max(a, -0.4) * half_x, y, low + b * half_z))
        return points

    z = car.shoulder_at(x) - drop
    foot = car.side(x, z)[0].y - 0.02
    head = z + 0.045
    rings = [
        ring(foot, z, 0.045, 0.022),
        ring(foot + reach + 0.03, z + 0.008, 0.04, 0.02),
        ring(foot + reach, head, deep * 0.38, tall * 0.4),
        ring(foot + reach + 0.025, head, deep / 2, tall / 2),
        ring(foot + reach + wide - 0.035, head + 0.004, deep * 0.46, tall * 0.46),
        ring(foot + reach + wide, head + 0.006, deep * 0.26, tall * 0.32),
    ]
    car.model.add(shell(rings, ["trim_black", "trim_black", material, material, material], first="trim_black", last=material))
    car.model.add(box((x - deep * 0.2 - 0.002, foot + reach + wide / 2 - 0.006, head + 0.002), (0.004, wide - 0.075, tall - 0.045), "mirror"))


def offside(car):
    def caster(x, z):
        location, normal = car.side(x, z)
        return Vector((location.x, -location.y, location.z)), Vector((normal.x, -normal.y, normal.z))

    return caster


def filler(car, x, z, wide=0.17, tall=0.15, round=0.03):
    low, high, back, fore = z - tall / 2, z + tall / 2, x - wide / 2, x + wide / 2
    loop = [(back + round, low), (fore - round, low), (fore, low + round), (fore, high - round), (fore - round, high), (back + round, high), (back, high - round), (back, low + round), (back + round, low)]
    car.seam(loop, offside(car), mirror=False)


def pillar(car, base, rail, belt, roof, material="trim_black"):
    outline = [(base[0], belt[0]), (base[1], belt[1]), (rail[1], roof[1]), (rail[0], roof[0])]
    car.patch(car.side, outline, material, lift=0.003)


def wrx_sti():
    car = Coach("subaru-wrx-sti", "split", metal="rim_dark", lip="rim_dark", twin=0.27, root=0.03, tip=0.026)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    cowl, shelf = 0.98, -1.88
    brow, deck = 0.79, 1.05

    def bulge(x, y):
        if x < cowl + 0.1:
            return 0.0
        fade = min(1.0, (x - cowl - 0.1) / 0.25) * min(1.0, max(0.0, (nose - 0.14 - x) / 0.3))
        wide = 0.33 + 0.2 * (nose - x) / (nose - cowl)
        edge = max(0.0, min(1.0, (wide - abs(y)) / 0.1))
        return 0.018 * fade * edge * edge * (3 - 2 * edge)

    def flare(x):
        return 0.03 * bump(x, axle, 0.52) ** 0.7 + 0.034 * bump(x, -axle, 0.52) ** 0.7

    def livery(band, station, point):
        if band == 0:
            return "underbody"
        if band == 1 and station[0] == "rear":
            return "trim_black"
        return "body"

    car.skin(
        half=[(stern, 0.8), (-axle - 0.35, 0.862), (-axle, 0.875), (-0.3, 0.868), (0.6, 0.868), (axle, 0.875), (nose - 0.32, 0.845), (nose, 0.75)],
        shoulder=[(stern, deck), (-1.9, deck + 0.012), (-axle, 1.045), (-0.6, 1.0), (0.3, 0.965), (cowl, 0.95), (axle, 0.91), (nose - 0.25, 0.85), (nose, brow)],
        waist=[(stern, 0.8), (-axle, 0.8), (0.0, 0.75), (axle, 0.71), (nose - 0.3, 0.6), (nose, 0.53)],
        sill=[(stern, 0.47), (-axle - 0.42, 0.34), (-axle + 0.4, 0.29), (axle - 0.4, 0.29), (axle + 0.42, 0.28), (nose, 0.255)],
        crown=[(stern, 0.014), (shelf, 0.02), (cowl, 0.03), (axle, 0.045), (nose, 0.03)],
        flare=flare,
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.17, 0.07, 0.012, 0.0, 0.05, 0.11), "bow": 0.14, "flat": 0.62, "power": 2.7},
        rear={"set": (0.16, 0.05, 0.008, 0.0, 0.03, 0.075), "bow": 0.075, "flat": 0.74, "power": 2.9},
        inset=0.078,
        shelf=0.04,
        flank=-0.006,
        belly=0.0,
        relief=bulge,
        paint=livery,
        sharp=(True, True, True, True, True),
        margin=0.0,
        lid_rows=8,
    )
    front, back, side = car.front, car.back, car.side

    grille = car.hollow(front, [(-0.27, 0.602), (0.27, 0.602), (0.37, 0.692), (0.33, 0.766), (-0.33, 0.766), (-0.37, 0.692)], 0.055, mirror=False)
    grille.mesh(15, 6, share=0.12)
    car.patch(front, [(-0.355, 0.69), (0.355, 0.69), (0.34, 0.722), (-0.34, 0.722)], "trim_black", lift=-0.004, thickness=0.014, mirror=False)
    car.patch(front, ellipse((0.0, 0.706), (0.062, 0.034), 14), "chrome", lift=0.002, thickness=0.006, mirror=False)
    car.patch(front, ellipse((0.0, 0.706), (0.05, 0.025), 14), "livery_dark", lift=0.005, mirror=False)
    car.headlamp(
        front,
        [(0.405, 0.688), (0.6, 0.655), (0.82, 0.648), (0.98, 0.668), (1.1, 0.72), (1.2, 0.795), (1.0, 0.802), (0.78, 0.794), (0.58, 0.776), (0.415, 0.748)],
        projectors=[(0.63, 0.712, 0.04), (0.82, 0.72, 0.034)],
        strips=[
            [(0.435, 0.7), (0.46, 0.697), (0.468, 0.75), (0.443, 0.745)],
            [(0.46, 0.697), (0.72, 0.667), (0.72, 0.681), (0.462, 0.711)],
            [(0.466, 0.736), (0.72, 0.768), (0.72, 0.782), (0.468, 0.75)],
            [(0.96, 0.7), (1.07, 0.735), (1.14, 0.782), (1.0, 0.782)],
        ],
        depth=0.05,
    )
    intake = car.hollow(front, [(-0.4, 0.26), (0.4, 0.26), (0.34, 0.425), (-0.34, 0.425)], 0.07, mirror=False)
    intake.mesh(14, 5, share=0.12)
    fog = car.hollow(front, [(0.49, 0.32), (0.6, 0.264), (0.93, 0.3), (0.96, 0.5), (0.66, 0.52), (0.49, 0.45)], 0.05, material="trim_black")
    fog.bars(2, share=0.12, sink=0.5)
    car.disc(front, 0.72, 0.385, 0.046, "clear", bezel="chrome", sink=0.04)
    car.patch(front, rect(-0.155, 0.155, 0.436, 0.596), "plate", lift=0.006, mirror=False)
    vent = car.hollow(side, [(0.97, 0.6), (0.76, 0.632), (0.76, 0.705), (0.93, 0.705)], 0.03)
    vent.mesh(4, 3, share=0.16)

    cluster(
        car,
        back,
        [(0.36, 0.935), (0.6, 0.905), (0.8, 0.892), (1.0, 0.905), (1.12, 0.96), (1.14, 1.02), (0.95, 1.025), (0.7, 1.015), (0.36, 0.995)],
        strips=[
            [(0.42, 0.975), (0.72, 0.992), (1.06, 0.998), (1.08, 1.012), (0.72, 1.006), (0.42, 0.988)],
            [(1.02, 0.925), (1.06, 0.93), (1.1, 1.0), (1.06, 1.0)],
            [(0.5, 0.925), (0.8, 0.908), (1.03, 0.92), (1.03, 0.936), (0.8, 0.924), (0.5, 0.94)],
        ],
        clear=[rect(0.5, 0.74, 0.948, 0.968)],
    )
    car.patch(back, rect(-0.36, 0.36, 0.958, 0.99), "steel", lift=0.002, thickness=0.01, mirror=False)
    car.hollow(back, [(-0.2, 0.775), (0.2, 0.775), (0.24, 0.948), (-0.24, 0.948)], 0.016, material="body", mirror=False)
    car.patch(back, rect(-0.155, 0.155, 0.782, 0.942), "plate", lift=-0.011, mirror=False)
    car.hollow(back, [(0.36, 0.3), (0.66, 0.3), (0.68, 0.34), (0.66, 0.395), (0.36, 0.395), (0.34, 0.34)], 0.07)
    car.lamp(back, [(0.74, 0.5), (0.98, 0.51), (0.98, 0.535), (0.74, 0.525)], "red", thickness=0.004)

    car.arches(0.04)
    car.cut()
    car.arch_lips(width=0.03, proud=0.012)
    car.pipes((0.44, 0.58, -0.44, -0.58), stern + 0.015, 0.347, radius=0.043, length=0.16)
    car.fins(stern + 0.1, 0.33, 4, 0.5, length=0.16, height=0.07)
    chin(car, 0.3, 0.2, 0.98)
    skirts(car, axle - 0.42, -axle + 0.42, drop=0.12)
    doors(car, 0.72, -0.24, -0.98, 0.04)
    car.stroke((1.74, 0.69), (1.6, 0.575), side, steps=6)
    car.stroke((-1.93, 0.88), (-1.64, 0.57), side, steps=8)
    filler(car, -axle - 0.3, 0.9)
    car.bonnet(cowl + 0.03, 0.74, front=nose - 0.16)
    car.stroke((0.62, 0.9), (0.62, 1.06), back, steps=6)
    car.stroke((-0.62, 0.795), (0.62, 0.795), back, steps=14, mirror=False)
    car.stroke((0.62, 0.795), (0.62, 0.895), back, steps=4)
    car.grips([-0.08, -0.8])
    wing_mirror(car, 0.6)
    scoop(car, 1.56, 1.14, 0.3, 0.06)

    glass = car.cabin(
        screen=(cowl, 0.14),
        back=(-1.16, shelf),
        roof=[(-1.16, 1.39), (-0.7, 1.456), (-0.25, 1.475), (0.14, 1.436)],
        windows=[((0.7, 0.04), (-0.2, -0.2)), ((-0.28, -0.28), (-1.02, -0.92)), ((-1.08, -0.97), (-1.44, -1.07))],
        base_inset=0.1,
        tumble=0.14,
        drop=0.05,
        bow=(0.16, 0.07),
        rail_bow=(0.07, 0.04),
    )
    car.wipers(glass)
    pillar(car, (-0.205, -0.275), (-0.205, -0.275), (1.03, 1.035), (1.385, 1.385))
    car.stroke((0.08, 0.5), (-1.1, 0.5), car.top, steps=12, width=0.012)
    sti_wing(car, stern + 0.2, 1.42, 0.705, 0.655, chord=0.25, root=0.4, thick=0.04, post=0.044, radius=0.07, rake=0.15)
    car.model.absorb(box((-0.98, 0, car.top(-0.98, 0.0)[0].z + 0.018), (0.15, 0.03, 0.05), "body", bevel=0.012, taper=0.5))
    car.interior(seat=-0.08, rear_bench=-0.95, material="interior")
    return car.finish("#0c3c9c")


def impreza_sti():
    car = Coach("subaru-impreza-wrx-sti", "ten", metal="rim_gold", barrel="rim_gold", lip="rim_gold", root=0.028, tip=0.024)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    cowl, shelf = 0.88, -1.62
    brow, deck = 0.775, 0.985

    def blister(x):
        return 0.036 * (bump(x, axle, 0.5) ** 0.6 + bump(x, -axle, 0.5) ** 0.6)

    def bulge(x, y):
        if x < cowl + 0.1:
            return 0.0
        fade = min(1.0, (x - cowl - 0.1) / 0.25) * min(1.0, max(0.0, (nose - 0.1 - x) / 0.25))
        wide = 0.2 + 0.26 * (nose - x) / (nose - cowl)
        edge = max(0.0, min(1.0, (wide - abs(y)) / 0.1))
        return 0.02 * fade * edge * edge * (3 - 2 * edge)

    car.skin(
        half=[(stern, 0.78), (-axle, 0.82), (0.0, 0.815), (axle, 0.82), (nose - 0.3, 0.8), (nose, 0.72)],
        shoulder=[(stern, deck), (-1.8, deck + 0.012), (-axle, 0.985), (-0.6, 0.935), (0.3, 0.91), (cowl, 0.91), (axle, 0.875), (nose - 0.25, 0.83), (nose, brow)],
        waist=[(stern, 0.71), (-axle, 0.72), (0.0, 0.7), (axle, 0.7), (nose - 0.3, 0.6), (nose, 0.5)],
        sill=[(stern, 0.43), (-axle - 0.42, 0.34), (-axle + 0.4, 0.3), (axle - 0.4, 0.3), (axle + 0.42, 0.29), (nose, 0.27)],
        crown=[(stern, 0.014), (shelf, 0.02), (cowl, 0.028), (axle, 0.04), (nose, 0.03)],
        flare=blister,
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.22],
        front={"set": (0.17, 0.07, 0.012, 0.0, 0.06, 0.13), "bow": 0.19, "flat": 0.55, "power": 2.4},
        rear={"set": (0.15, 0.05, 0.008, 0.0, 0.025, 0.065), "bow": 0.05, "flat": 0.8, "power": 3.0},
        inset=0.045,
        shelf=0.055,
        flank=0.02,
        belly=0.008,
        relief=bulge,
        sharp=(True, True, False, True, False),
        margin=0.0,
        lid_rows=8,
    )
    front, back, side = car.front, car.back, car.side

    nostril = car.hollow(front, [(-0.105, 0.578), (0.105, 0.578), (0.15, 0.755), (-0.15, 0.755)], 0.06, mirror=False)
    nostril.mesh(5, 7, share=0.12)
    wings = car.hollow(front, [(0.185, 0.672), (0.43, 0.698), (0.415, 0.752), (0.185, 0.756)], 0.045)
    wings.mesh(8, 3, share=0.12)
    car.headlamp(
        front,
        [(0.47, 0.7), (0.6, 0.64), (0.82, 0.622), (0.98, 0.64), (1.08, 0.69), (1.15, 0.778), (0.96, 0.795), (0.76, 0.785), (0.58, 0.757)],
        projectors=[(0.7, 0.7, 0.042), (0.89, 0.705, 0.05)],
        strips=[[(1.02, 0.672), (1.08, 0.708), (1.115, 0.768), (1.03, 0.772)]],
        depth=0.05,
    )
    intake = car.hollow(front, [(-0.4, 0.28), (0.4, 0.28), (0.38, 0.4), (-0.38, 0.4)], 0.07, mirror=False)
    intake.mesh(13, 4, share=0.12)
    car.hollow(front, ellipse((0.72, 0.365), (0.105, 0.085), 14), 0.05, material="trim_black")
    car.disc(front, 0.72, 0.365, 0.048, "clear", bezel="chrome", sink=0.04)
    car.patch(front, rect(-0.155, 0.155, 0.41, 0.57), "plate", lift=0.006, mirror=False)

    cluster(
        car,
        back,
        [(0.4, 0.812), (0.74, 0.806), (0.92, 0.82), (0.99, 0.875), (0.99, 0.952), (0.74, 0.95), (0.4, 0.944)],
        depth=0.036,
        clear=[[(0.415, 0.826), (0.585, 0.823), (0.585, 0.935), (0.415, 0.931)]],
    )
    car.disc(back, 0.71, 0.884, 0.052, "tail", bezel="chrome", depth=0.016, sink=0.02)
    car.disc(back, 0.5, 0.879, 0.04, "clear", bezel="chrome", depth=0.016, sink=0.02)
    car.hollow(back, [(-0.2, 0.775), (0.2, 0.775), (0.23, 0.95), (-0.23, 0.95)], 0.016, material="body", mirror=False)
    car.patch(back, rect(-0.155, 0.155, 0.782, 0.942), "plate", lift=-0.011, mirror=False)
    car.hollow(back, [(0.36, 0.27), (0.62, 0.27), (0.62, 0.36), (0.58, 0.4), (0.4, 0.4), (0.36, 0.36)], 0.08, mirror=False)
    car.lamp(back, [(0.68, 0.5), (0.94, 0.51), (0.94, 0.535), (0.68, 0.525)], "red", thickness=0.004)

    car.arches(0.04)
    car.cut()
    car.arch_lips(width=0.045, proud=0.016)
    car.pipes((0.49,), stern + 0.015, 0.335, radius=0.058, length=0.18)
    car.lip(nose - 0.085, 0.205, 1.5, depth=0.13, thickness=0.022, material="body", sweep_back=0.2)
    skirts(car, axle - 0.42, -axle + 0.42, drop=0.11)
    doors(car, 0.66, -0.26, -0.92, 0.04)
    car.stroke((1.68, 0.68), (1.55, 0.565), side, steps=6)
    car.stroke((-1.9, 0.8), (-1.59, 0.545), side, steps=8)
    filler(car, -axle - 0.28, 0.84)
    car.lamp(side, rect(0.76, 0.83, 0.7, 0.722), "amber", thickness=0.004)
    car.bonnet(cowl + 0.03, 0.7, front=nose - 0.17)
    car.stroke((0.385, 0.72), (0.385, 0.98), back, steps=8)
    car.stroke((-0.385, 0.72), (0.385, 0.72), back, steps=12, mirror=False)
    car.grips([-0.1, -0.76])
    wing_mirror(car, 0.54, tall=0.11)
    scoop(car, 1.48, 1.02, 0.31, 0.085, power=3.0)

    glass = car.cabin(
        screen=(cowl, 0.16),
        back=(-1.08, shelf),
        roof=[(-1.08, 1.375), (-0.6, 1.415), (-0.25, 1.425), (0.16, 1.39)],
        windows=[((0.62, 0.04), (-0.22, -0.22)), ((-0.29, -0.29), (-0.98, -0.9)), ((-1.03, -0.94), (-1.3, -1.02))],
        base_inset=0.085,
        tumble=0.12,
        drop=0.045,
        bow=(0.15, 0.06),
        rail_bow=(0.07, 0.04),
    )
    car.wipers(glass)
    pillar(car, (-0.225, -0.285), (-0.225, -0.285), (0.975, 0.978), (1.335, 1.335))
    car.stroke((0.1, 0.52), (-1.0, 0.52), car.top, steps=12, width=0.012)
    vane(car, -1.1, 0.5)
    sti_wing(car, stern + 0.18, 1.315, 0.69, 0.645, chord=0.21, root=0.42, thick=0.036, post=0.045, radius=0.055, pitch=6.0, rake=0.14, arch=0.012)
    car.interior(seat=-0.12, rear_bench=-0.92, material="interior")
    return car.finish("#143d99")


CARS = {"subaru-wrx-sti": wrx_sti, "subaru-impreza-wrx-sti": impreza_sti}
