import math

from carkit import LEFT, LID, box, bump, curve, cylinder, prism
from kit import Coach, airfoil, ellipse, loft
from mathutils import Vector


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def sculpted(centre, crest, core, ridge=0.7, droop=0.02, reach=0.12):
    centre, crest, core = curve(centre), curve(crest), curve(core)

    def height(x, y):
        a = abs(y)
        low, high, flat = centre(x), crest(x), core(x)
        if a >= ridge:
            return high - droop * min(1.0, (a - ridge) / reach) ** 2
        return low + (high - low) * ease((a - flat) / max(0.05, ridge - flat))

    return height


def beam(car, x, z, pitch):
    tilt = math.radians(pitch)
    direction = Vector((-math.cos(tilt), 0, -math.sin(tilt)))
    up = Vector((-math.sin(tilt), 0, math.cos(tilt)))
    origin = Vector((x, 0, z)) - direction * 4

    def caster(a, b):
        return car.cast(origin + LEFT * a + up * b, direction)

    return caster


def lined(front, back, half):
    reach = curve(half)

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band == LID and back < point.x < front and abs(point.y) < reach(point.x):
            return "interior"
        return "body"

    return paint


def streamliners(start, peak, finish, height, centre=0.34, reach=0.3):
    rise = curve([(finish, 0.0), ((peak + finish) / 2, height * 0.42), (peak - 0.25, height * 0.94), (peak, height), (start, 0.0)])
    return lambda x, y: rise(x) * bump(abs(y), centre, reach)


def handle(car, x, z, length=0.16):
    hit, normal = car.side(x, z)
    car.model.add(box(hit + normal * 0.004, (length, 0.016, 0.026), "body", bevel=0.006))


def blade(car, front, back, z=0.118):
    reach = min(car.half_at(front), car.half_at(back)) - 0.035
    car.model.add(box(((front + back) / 2, reach, z), (front - back, 0.07, 0.022), "trim_black", bevel=0.006))


def swan_wing(car, x, z, span, chord=0.3, thickness=0.045, angle=7, spread=0.34, material="body", plate=(0.16, 0.34), neck="trim_black"):
    stations = (-span / 2, -span / 4, 0, span / 4, span / 2)
    car.model.absorb(loft([airfoil(x, z, chord, thickness, angle, y, count=7) for y in stations], material))
    tall, long = plate
    for side in (1, -1):
        y = side * (span / 2 + 0.008)
        outline = [(x + long * 0.5, z + tall * 0.16), (x + long * 0.42, z + tall * 0.42), (x - long * 0.5, z + tall * 0.5), (x - long * 0.5, z - tall * 0.5), (x - long * 0.1, z - tall * 0.5), (x + long * 0.4, z - tall * 0.2)]
        car.model.absorb(prism(outline, y - 0.009, y + 0.009, material))
    foot_x = x + chord * 0.95
    foot = car.top(foot_x, spread)[0].z - 0.02
    rise = z - foot
    outline = [
        (foot_x + 0.07, foot),
        (foot_x + 0.055, foot + rise * 0.5),
        (foot_x + 0.005, foot + rise * 0.9),
        (x + chord * 0.44, z + thickness * 0.5 + 0.034),
        (x + chord * 0.16, z + thickness * 0.5 + 0.04),
        (x - chord * 0.06, z + thickness * 0.5 + 0.026),
        (x - chord * 0.1, z + thickness * 0.3),
        (x + chord * 0.18, z + thickness * 0.5 + 0.006),
        (x + chord * 0.42, z + thickness * 0.3),
        (foot_x - 0.035, foot + rise * 0.72),
        (foot_x - 0.012, foot + rise * 0.4),
        (foot_x - 0.03, foot),
    ]
    for side in (1, -1):
        car.model.absorb(prism(outline, side * spread - 0.008, side * spread + 0.008, neck))


def carrera_shell(car, hump=None, cover=True, paint=None, front_half=0.9):
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    belt = [(-0.9, 0.895), (-0.4, 0.868), (0.0, 0.855), (0.85, 0.842)]
    tip = [(nose - 0.03, 0.57), (nose, 0.55)]
    crest = [(stern, 0.81), (-2.1, 0.845), (-1.9, 0.872), (-1.6, 0.905), (-axle, 0.925), *belt, (1.05, 0.836), (axle, 0.828), (nose - 0.7, 0.805), (nose - 0.45, 0.782), (nose - 0.36, 0.772), (nose - 0.23, 0.7), (nose - 0.1, 0.61), *tip]
    lid = [(-2.17, 0.868), (-2.05, 0.895), (-1.85, 0.942), (-1.6, 1.012), (-1.25, 0.97), (-1.0, 0.925)] if cover else [(-2.17, 0.86), (-1.9, 0.895), (-1.5, 0.925), (-1.0, 0.915)]
    centre = [(stern, 0.81), *lid, *belt, (1.06, 0.885), (axle, 0.805), (nose - 0.5, 0.735), (nose - 0.14, 0.648), *tip]
    core = [(stern, 0.62), (-2.17, 0.6), (-2.0, 0.54), (-1.6, 0.53), (-1.0, 0.52), (0.9, 0.42), (nose - 0.3, 0.36), (nose, 0.3)]
    edge = curve([(stern, 0.845), (-2.1, 0.845), (-1.9, 0.855), (-1.6, 0.875), (-axle, 0.888), (-0.9, 0.866), (-0.4, 0.84), (0.0, 0.828), (0.85, 0.815), (1.05, 0.806), (axle, 0.795), (nose - 0.7, 0.768), (nose - 0.45, 0.742), (nose - 0.36, 0.73), (nose - 0.23, 0.672), (nose - 0.1, 0.61), (nose - 0.03, 0.578), (nose, 0.56)])
    height = sculpted(centre, crest, core, ridge=0.73)

    def relief(x, y):
        return height(x, y) - edge(x) + (hump(x, y) if hump else 0.0)

    car.skin(
        half=[(stern, 0.8), (-1.94, 0.852), (-axle, 0.886), (-0.5, 0.868), (0.3, 0.862), (axle, front_half), (nose - 0.4, front_half - 0.025), (nose, 0.76)],
        shoulder=edge,
        waist=[(stern, 0.6), (-axle, 0.69), (-0.3, 0.6), (axle, 0.58), (nose - 0.4, 0.5), (nose, 0.47)],
        sill=[(stern, 0.44), (-1.9, 0.36), (-axle, 0.25), (0.0, 0.235), (axle, 0.235), (nose, 0.24)],
        crown=0.0,
        rise=0.0,
        flare=(0.026, 0.04),
        keys=[nose - 0.4, axle, 0.45, -0.45, -axle, stern + 0.36],
        front={"set": (0.08, 0.03, 0.005, 0.0, 0.03, 0.14), "bow": (0.07, 0.07, 0.07, 0.07, 0.09, 0.1), "flat": 0.56, "power": 2.4},
        rear={"set": (0.24, 0.1, 0.03, 0.0, 0.02, 0.12), "bow": 0.07, "flat": 0.68, "power": 2.4},
        inset=0.045,
        shelf=0.055,
        flank=0.014,
        belly=0.006,
        tuck=0.13,
        relief=relief,
        rear_lift=0.22,
        margin=0.0,
        lid_rows=8,
        corner=5,
        paint=paint,
        sharp=(True, True, False, False, False),
    )


def carrera_nose(car, nostrils):
    front, top, nose = car.front, car.top, car.nose_x
    mouth = car.hollow(front, [(-0.48, 0.2), (0.48, 0.2), (0.52, 0.39), (-0.52, 0.39)], 0.08, mirror=False)
    mouth.mesh(12, 4)
    duct = car.hollow(front, [(0.58, 0.215), (0.88, 0.25), (0.9, 0.4), (0.58, 0.39)], 0.08)
    duct.bars(2, share=0.14)
    car.patch(front, [(0.6, 0.374), (0.88, 0.38), (0.88, 0.392), (0.6, 0.386)], "lens_clear", lift=-0.012, thickness=0.004, group="Headlights")
    if nostrils:
        vent = car.hollow(top, [(nose - 0.25, 0.05), (nose - 0.26, 0.28), (nose - 0.36, 0.31), (nose - 0.37, 0.05)], 0.04)
        vent.bars(3, axis=0, share=0.16, sink=0.3)
    else:
        slot = car.hollow(front, [(-0.38, 0.425), (0.38, 0.425), (0.38, 0.452), (-0.38, 0.452)], 0.03, mirror=False)
        slot.bars(1, share=0.2)
    lamp = beam(car, nose - 0.23, 0.7, 54)
    car.headlamp(
        lamp,
        ellipse((0.69, 0.0), (0.12, 0.178), 18),
        projectors=[(0.69, 0.0, 0.05)],
        strips=[rect(0.69 + a - 0.026, 0.69 + a + 0.026, b - 0.009, b + 0.009) for a in (0.054, -0.054) for b in (0.095, -0.095)],
        depth=0.06,
    )
    car.patch(front, rect(-0.26, 0.26, 0.3, 0.41), "plate", lift=0.008, mirror=False)


def carrera_tail(car, bar):
    back = car.back
    if bar:
        car.taillamp(
            back,
            [(-1.0, 0.79), (-0.6, 0.796), (0.6, 0.796), (1.0, 0.79), (1.02, 0.832), (0.6, 0.836), (-0.6, 0.836), (-1.02, 0.832)],
            strips=[[(-0.99, 0.804), (-0.6, 0.809), (0.6, 0.809), (0.99, 0.804), (1.0, 0.82), (0.6, 0.824), (-0.6, 0.824), (-1.0, 0.82)]],
            mirror=False,
        )
    else:
        car.taillamp(
            back,
            [(0.4, 0.796), (1.0, 0.786), (1.04, 0.836), (0.4, 0.836)],
            strips=[[(0.43, 0.802), (1.0, 0.794), (1.005, 0.808), (0.43, 0.812)], [(0.43, 0.818), (1.01, 0.816), (1.015, 0.83), (0.43, 0.828)]],
        )
        car.patch(back, [(-0.4, 0.806), (0.4, 0.806), (0.4, 0.826), (-0.4, 0.826)], "lens_smoke", lift=0.004, thickness=0.004, mirror=False)
    diffuser = car.hollow(back, [(-0.64, 0.325), (0.64, 0.325), (0.56, 0.5), (-0.56, 0.5)], 0.08, material="trim_black", mirror=False)
    diffuser.bars(7, axis=0, share=0.07, sink=0.0, thickness=0.03)
    outlet = car.hollow(back, [(0.8, 0.46), (0.95, 0.47), (0.95, 0.64), (0.8, 0.62)], 0.05)
    outlet.bars(4, share=0.2)
    car.patch(back, rect(-0.26, 0.26, 0.57, 0.68), "plate", lift=0.006, mirror=False)
    car.lamp(back, [(0.6, 0.39), (0.86, 0.4), (0.86, 0.42), (0.6, 0.41)], "red", thickness=0.004)


def carrera_trim(car):
    nose, stern = car.nose_x, car.stern_x
    car.arch_lips(width=0.02, proud=0.008)
    car.pipes((0.075, -0.075), stern + 0.005, 0.41, radius=0.048, length=0.12, material="steel")
    car.lip(nose - 0.07, 0.135, 1.5, depth=0.14, thickness=0.02, sweep_back=0.2)
    car.seams([0.75, -0.4])
    car.bonnet(1.03, 0.5, front=nose - 0.22)
    handle(car, -0.22, 0.73)
    car.mirrors(0.62, size=(0.09, 0.17, 0.09), reach=0.06, lift=0.07)
    blade(car, 0.82, -0.78)


def gt3(name, paint, touring=False):
    car = Coach(name, "ten", rear_wheel={"dish": 0.075}, metal="rim" if touring else "rim_dark", nuts=0, cap="steel", root=0.034, tip=0.026, hub=0.085, dish=0.03)
    stern, top = car.stern_x, car.top
    carrera_shell(car, paint=lined(0.84, -1.52, [(-1.6, 0.42), (-1.2, 0.58), (-0.4, 0.68), (0.9, 0.68)]))
    carrera_nose(car, True)
    carrera_tail(car, True)
    grille = car.hollow(top, [(-1.69, -0.3), (-1.69, 0.3), (-2.0, 0.35), (-2.0, -0.35)], 0.035, mirror=False)
    grille.bars(11, axis=1, share=0.3, sink=0.15)
    car.arches(0.035, inner=0.09)
    car.cut()
    car.lamp(top, [(-1.645, -0.2), (-1.645, 0.2), (-1.67, 0.2), (-1.67, -0.2)], "tail", thickness=0.004, mirror=False)
    carrera_trim(car)
    glass = car.cabin(
        screen=(1.06, 0.44),
        back=(-0.96, -1.6),
        roof=[(-0.96, 1.16), (-0.45, 1.256), (-0.02, 1.279), (0.44, 1.243)],
        windows=[((0.8, 0.32), (-0.36, -0.3)), ((-0.42, -0.36), (-1.22, -0.84))],
        base=[(-1.6, 0.56), (-1.22, 0.68), (-0.4, 0.755), (1.06, 0.74)],
        rail=[(-0.96, 0.47), (-0.02, 0.575), (0.44, 0.5)],
        bow=(0.2, 0.1),
        rail_bow=(0.12, 0.03),
        flat=(0.9, 0.76),
        power=(2.6, 2.0),
        drop=0.045,
        bulge=0.028,
        sill=0.04,
    )
    car.wipers(glass)
    if touring:
        car.lip(stern + 0.15, top(stern + 0.15, 0)[0].z + 0.012, 1.2, depth=0.1, thickness=0.016, material="body", sweep_back=-0.03)
        car.stroke((0.72, 0.86), (-0.4, 0.88), car.side, steps=8, material="chrome", width=0.012, lift=0.004)
        car.stroke((-0.4, 0.88), (-1.18, 0.926), car.side, steps=8, material="chrome", width=0.012, lift=0.004)
    else:
        car.lip(stern + 0.15, top(stern + 0.15, 0)[0].z + 0.02, 1.3, depth=0.12, thickness=0.03, material="body", sweep_back=-0.03)
        swan_wing(car, stern + 0.18, 1.175, 1.56)
    car.interior(seat=-0.12, spread=0.33, height=0.14, width=0.42, material="interior")
    return car.finish(paint)


def gt3_wing():
    return gt3("porsche-911-gt3", "#2274b8")


def gt3_touring():
    return gt3("porsche-911-gt3-touring", "#5a5e62", touring=True)


def speedster():
    car = Coach("porsche-911-speedster", "ten", rear_wheel={"dish": 0.075}, metal="rim_dark", nuts=0, cap="steel", root=0.034, tip=0.026, hub=0.085, dish=0.03)
    top = car.top
    carrera_shell(car, streamliners(-0.5, -0.72, -1.95, 0.2, reach=0.27), cover=False, front_half=0.885)
    carrera_nose(car, False)
    carrera_tail(car, False)
    lid = car.hollow(top, [(-1.72, -0.3), (-1.72, 0.3), (-1.94, 0.28), (-1.94, -0.28)], 0.03, mirror=False)
    lid.bars(7, share=0.3, sink=0.2)
    car.tub(0.6, -0.7, 0.62)
    car.arches(0.035, inner=0.09)
    car.cut()
    carrera_trim(car)
    car.windscreen(1.04, 0.52, car.height - 0.018, 0.71, 0.6, bow=0.18, side_glass=0.36)
    floor = car.cabin_floor
    car.seats(-0.3, floor, 0.33, height=0.4, width=0.44, material="seat")
    car.dashboard(0.44, floor + 0.2, 1.2, 0.33, height=0.1)
    return car.finish("#a4a9ad")


def cayman(name, paint, spyder=False):
    car = Coach(name, "split", rear_wheel={"dish": 0.065}, metal="rim_dark", nuts=0, cap="steel", twin=0.24, hub=0.085, dish=0.03)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    belt = [(-0.8, 0.905), (-0.4, 0.875), (0.0, 0.86), (0.8, 0.846)]
    tip = [(nose - 0.03, 0.565), (nose, 0.545)]
    crest = [(stern, 0.9), (stern + 0.14, 0.925), (-1.9, 0.935), (-1.6, 0.945), (-axle, 0.945), *belt, (1.05, 0.834), (axle, 0.815), (nose - 0.7, 0.782), (nose - 0.45, 0.756), (nose - 0.34, 0.74), (nose - 0.22, 0.688), (nose - 0.1, 0.612), *tip]
    if spyder:
        lid = [(stern + 0.1, 0.972), (stern + 0.24, 0.955), (-1.5, 0.95), (-1.0, 0.925)]
    else:
        lid = [(stern + 0.1, 0.972), (stern + 0.24, 0.955), (-1.7, 0.972), (-1.4, 1.014), (-1.15, 0.975), (-0.95, 0.925)]
    centre = [(stern, 0.9), *lid, *belt, (1.02, 0.885), (axle, 0.792), (nose - 0.5, 0.722), (nose - 0.14, 0.645), *tip]
    core = [(stern, 0.6), (-1.75, 0.58), (-1.4, 0.5), (-1.0, 0.5), (0.9, 0.42), (nose - 0.3, 0.36), (nose, 0.3)]
    edge = curve([(stern, 0.905), (-1.9, 0.905), (-1.6, 0.912), (-axle, 0.91), (-0.8, 0.876), (-0.4, 0.847), (0.0, 0.832), (0.8, 0.818), (1.05, 0.805), (axle, 0.78), (nose - 0.7, 0.746), (nose - 0.45, 0.718), (nose - 0.34, 0.7), (nose - 0.22, 0.655), (nose - 0.1, 0.6), (nose - 0.03, 0.572), (nose, 0.555)])
    height = sculpted(centre, crest, core, ridge=0.7)
    humps = streamliners(-0.42, -0.64, -1.92, 0.16, reach=0.27) if spyder else None

    def relief(x, y):
        return height(x, y) - edge(x) + (humps(x, y) if humps else 0.0)

    car.skin(
        half=[(stern, 0.8), (-1.87, 0.848), (-axle, 0.875), (-0.5, 0.848), (0.3, 0.848), (axle, 0.869), (nose - 0.4, 0.845), (nose, 0.75)],
        shoulder=edge,
        waist=[(stern, 0.66), (-axle, 0.7), (-0.3, 0.6), (axle, 0.58), (nose - 0.4, 0.5), (nose, 0.47)],
        sill=[(stern, 0.46), (-1.85, 0.38), (-axle, 0.25), (0.0, 0.235), (axle, 0.235), (nose, 0.24)],
        crown=0.0,
        rise=0.0,
        flare=(0.022, 0.036),
        keys=[nose - 0.4, axle, 0.45, -0.45, -axle, stern + 0.32],
        front={"set": (0.08, 0.03, 0.005, 0.0, 0.03, 0.14), "bow": (0.07, 0.07, 0.07, 0.07, 0.09, 0.1), "flat": 0.56, "power": 2.4},
        rear={"set": (0.22, 0.09, 0.03, 0.0, 0.015, 0.1), "bow": 0.05, "flat": 0.72, "power": 2.5},
        inset=0.045,
        shelf=0.055,
        flank=0.014,
        belly=0.006,
        tuck=0.13,
        relief=relief,
        rear_lift=0.22,
        margin=0.0,
        lid_rows=8,
        corner=5,
        paint=None if spyder else lined(0.8, -1.32, [(-1.4, 0.38), (-1.0, 0.56), (-0.4, 0.66), (0.9, 0.66)]),
        sharp=(True, True, False, False, False),
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    mouth = car.hollow(front, [(-0.3, 0.19), (0.3, 0.19), (0.36, 0.37), (-0.36, 0.37)], 0.08, mirror=False)
    mouth.mesh(8, 4)
    duct = car.hollow(front, [(0.44, 0.2), (0.86, 0.24), (0.9, 0.45), (0.46, 0.42)], 0.08)
    duct.mesh(5, 3)
    car.patch(front, [(0.5, 0.4), (0.88, 0.424), (0.88, 0.437), (0.5, 0.413)], "lens_clear", lift=-0.012, thickness=0.004, group="Headlights")
    slot = car.hollow(top, [(nose - 0.17, -0.3), (nose - 0.17, 0.3), (nose - 0.23, 0.32), (nose - 0.23, -0.32)], 0.035, mirror=False)
    slot.bars(1, axis=0, share=0.3, sink=0.3)
    naca = car.hollow(top, [(nose - 0.42, 0.25), (nose - 0.6, 0.2), (nose - 0.6, 0.32), (nose - 0.42, 0.29)], 0.035)
    naca.fill("trim_black", sink=0.8)
    for n in range(3):
        x = axle + 0.12 - n * 0.09
        louvre = car.hollow(top, [(x, 0.62), (x, 0.77), (x - 0.045, 0.77), (x - 0.045, 0.62)], 0.03)
        louvre.fill("trim_black", sink=0.8)
    lamp = beam(car, nose - 0.24, 0.7, 54)
    car.headlamp(
        lamp,
        [(0.52, -0.17), (0.62, -0.19), (0.74, -0.12), (0.82, 0.02), (0.83, 0.14), (0.77, 0.19), (0.66, 0.15), (0.56, 0.02)],
        projectors=[(0.69, 0.01, 0.046)],
        strips=[rect(a - 0.024, a + 0.024, b - 0.008, b + 0.008) for a, b in ((0.61, -0.1), (0.75, -0.03), (0.65, 0.08), (0.77, 0.11))],
        depth=0.06,
    )
    car.patch(front, rect(-0.26, 0.26, 0.385, 0.495), "plate", lift=0.006, mirror=False)
    scoop = car.hollow(side, [(-0.44, 0.5), (-0.84, 0.46), (-0.86, 0.74), (-0.56, 0.72)], 0.12)
    scoop.bars(2, material="body", share=0.08, sink=0.12)

    car.taillamp(
        back,
        [(0.4, 0.836), (0.98, 0.826), (1.03, 0.886), (0.4, 0.882)],
        strips=[[(0.43, 0.844), (0.98, 0.836), (0.985, 0.85), (0.43, 0.856)], [(0.43, 0.864), (0.995, 0.862), (1.0, 0.876), (0.43, 0.874)]],
    )
    car.patch(back, [(-0.4, 0.848), (0.4, 0.848), (0.4, 0.872), (-0.4, 0.872)], "lens_smoke", lift=0.004, thickness=0.004, mirror=False)
    diffuser = car.hollow(back, [(-0.56, 0.325), (0.56, 0.325), (0.5, 0.48), (-0.5, 0.48)], 0.08, material="trim_black", mirror=False)
    diffuser.bars(7, axis=0, share=0.07, sink=0.0, thickness=0.03)
    outlet = car.hollow(back, [(0.78, 0.46), (0.94, 0.47), (0.94, 0.66), (0.78, 0.64)], 0.05)
    outlet.bars(4, share=0.2)
    car.patch(back, rect(-0.26, 0.26, 0.58, 0.69), "plate", lift=0.006, mirror=False)
    car.lamp(back, [(0.6, 0.4), (0.86, 0.41), (0.86, 0.43), (0.6, 0.42)], "red", thickness=0.004)
    if spyder:
        car.tub(0.58, -0.62, 0.61)
        mesh = car.hollow(top, [(-1.5, -0.14), (-1.5, 0.14), (-1.86, 0.14), (-1.86, -0.14)], 0.03, mirror=False)
        mesh.mesh(8, 4)
    else:
        mesh = car.hollow(top, [(-1.52, -0.36), (-1.52, 0.36), (-1.8, 0.4), (-1.8, -0.4)], 0.03, mirror=False)
        mesh.bars(9, axis=1, share=0.3, sink=0.15)

    car.arches(0.035, inner=0.09)
    car.cut()
    car.arch_lips(width=0.02, proud=0.008)
    car.pipes((0.25, -0.25), stern + 0.005, 0.415, radius=0.052, length=0.12, material="steel")
    car.lip(nose - 0.07, 0.135, 1.48, depth=0.14, thickness=0.02, sweep_back=0.2)
    car.seams([0.72, -0.38])
    car.bonnet(0.99, 0.5, front=nose - 0.26)
    handle(car, -0.2, 0.74)
    car.mirrors(0.58, size=(0.09, 0.17, 0.09), reach=0.06, lift=0.07)
    blade(car, 0.82, -0.78)
    car.lip(stern + 0.07, top(stern + 0.11, 0)[0].z + 0.02, 1.36, depth=0.12, thickness=0.028, material="body", sweep_back=-0.03)
    if spyder:
        car.windscreen(1.0, 0.5, car.height - 0.018, 0.7, 0.59, bow=0.18, side_glass=0.36)
        for flip in (1, -1):
            ear = car.lid(-0.88, 0.7) + 0.03
            car.model.absorb(box((-0.88, flip * 0.68, ear), (0.34, 0.11, 0.07), "carbon", bevel=0.02, taper=0.8))
        floor = car.cabin_floor
        car.seats(-0.3, floor, 0.33, height=0.4, width=0.44, material="seat")
        car.dashboard(0.42, floor + 0.2, 1.2, 0.33, height=0.1)
    else:
        glass = car.cabin(
            screen=(1.02, 0.42),
            back=(-0.74, -1.4),
            roof=[(-0.74, 1.178), (-0.42, 1.245), (-0.02, 1.267), (0.42, 1.232)],
            windows=[((0.76, 0.3), (-0.36, -0.3)), ((-0.42, -0.36), (-1.02, -0.64))],
            base=[(-1.4, 0.5), (-1.02, 0.66), (-0.4, 0.745), (1.02, 0.73)],
            rail=[(-0.74, 0.43), (-0.02, 0.56), (0.42, 0.5)],
            bow=(0.2, 0.1),
            rail_bow=(0.12, 0.03),
            flat=(0.9, 0.68),
            power=(2.6, 2.0),
            drop=0.055,
            bulge=0.028,
            sill=0.04,
        )
        car.wipers(glass)
        car.patch(side, [(-0.385, 0.91), (-1.07, 0.935), (-0.66, 1.165), (-0.33, 1.2)], "carbon", lift=0.014, thickness=0.014)
        hit = side(-0.62, 1.03)[0]
        car.model.add(box((-0.68, hit.y + 0.012, 1.03), (0.32, 0.07, 0.12), "carbon", bevel=0.02, taper=0.8))
        swan_wing(car, stern + 0.18, 1.185, 1.5, material="carbon", spread=0.33)
        car.interior(seat=-0.12, spread=0.33, height=0.14, width=0.42, material="interior")
    return car.finish(paint)


def cayman_gt4_rs():
    return cayman("porsche-718-cayman-gt4-rs", "#eec20f")


def spyder_rs():
    return cayman("porsche-718-spyder-rs", "#8d979d", spyder=True)


def cayenne():
    car = Coach("porsche-cayenne-diesel", "star", metal="rim", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    belt = [(-2.05, 1.215), (-1.3, 1.165), (-0.5, 1.118), (0.0, 1.098), (0.86, 1.078)]
    tip = [(nose - 0.06, 0.885), (nose, 0.85)]
    wing = [(stern, 1.19), (-2.38, 1.215), *belt, (1.15, 1.065), (axle, 1.048), (nose - 0.65, 1.02), (nose - 0.45, 0.992), (nose - 0.3, 0.962), (nose - 0.16, 0.925)]
    centre = [(stern, 1.19), (-2.38, 1.215), *belt, (1.1, 1.145), (1.25, 1.085), (axle, 1.045), (nose - 0.5, 0.985), (nose - 0.2, 0.93), *tip]
    core = [(stern, 0.5), (0.9, 0.5), (nose - 0.3, 0.45), (nose, 0.4)]
    edge = curve([(x, z - 0.035) for x, z in wing] + [(nose - 0.06, 0.88), (nose, 0.85)])
    height = sculpted(centre, wing + tip, core, ridge=0.76)
    car.skin(
        half=[(stern, 0.86), (-2.0, 0.94), (-axle, 0.944), (0.0, 0.94), (axle, 0.944), (nose - 0.4, 0.92), (nose, 0.8)],
        shoulder=edge,
        waist=[(stern, 0.72), (-axle, 0.86), (0.0, 0.8), (axle, 0.78), (nose - 0.4, 0.68), (nose, 0.62)],
        sill=[(stern, 0.5), (-1.95, 0.36), (1.95, 0.36), (nose, 0.42)],
        crown=0.0,
        rise=0.0,
        flare=(0.025, 0.025),
        keys=[nose - 0.5, axle, 0.45, -0.45, -axle, stern + 0.34],
        front={"set": (0.14, 0.06, 0.015, 0.0, 0.06, 0.2), "bow": 0.12, "flat": 0.58, "power": 2.4},
        rear={"set": (0.16, 0.06, 0.01, 0.0, 0.1, 0.17), "bow": 0.07, "flat": 0.72, "power": 2.5},
        inset=0.05,
        shelf=0.06,
        flank=0.014,
        belly=0.006,
        relief=lambda x, y: height(x, y) - edge(x),
        margin=0.0,
        lid_rows=8,
        corner=5,
        sharp=(True, True, False, True, False),
    )
    front, back, side = car.front, car.back, car.side

    grille = car.hollow(front, [(-0.4, 0.53), (0.4, 0.53), (0.48, 0.76), (-0.48, 0.76)], 0.07, mirror=False)
    grille.bars(5, share=0.16)
    duct = car.hollow(front, [(0.6, 0.53), (0.98, 0.57), (1.0, 0.75), (0.6, 0.76)], 0.07)
    duct.bars(2, share=0.16)
    car.patch(front, [(0.63, 0.715), (0.98, 0.712), (0.98, 0.728), (0.63, 0.731)], "lens_clear", lift=-0.012, thickness=0.004, group="Headlights")
    low = car.hollow(front, [(-0.62, 0.33), (0.62, 0.33), (0.6, 0.4), (-0.6, 0.4)], 0.05, mirror=False)
    low.bars(1, share=0.2)
    lamp = beam(car, nose - 0.3, 0.93, 42)
    car.headlamp(
        lamp,
        [(0.44, -0.07), (0.6, -0.11), (0.8, -0.09), (0.9, 0.01), (0.89, 0.11), (0.74, 0.14), (0.52, 0.06)],
        projectors=[(0.64, 0.0, 0.046), (0.78, 0.02, 0.036)],
        strips=[rect(0.64 + a - 0.02, 0.64 + a + 0.02, b - 0.008, b + 0.008) for a in (0.075, -0.075) for b in (0.055, -0.055)],
        depth=0.06,
    )
    car.patch(front, rect(-0.26, 0.26, 0.41, 0.52), "plate", lift=0.006, mirror=False)

    car.taillamp(
        back,
        [(0.32, 1.05), (0.8, 1.035), (1.1, 1.05), (1.17, 1.15), (0.8, 1.16), (0.32, 1.125)],
        strips=[[(0.36, 1.064), (0.8, 1.05), (1.08, 1.064), (1.09, 1.082), (0.8, 1.07), (0.36, 1.082)], [(0.36, 1.1), (0.8, 1.112), (1.11, 1.122), (1.12, 1.142), (0.8, 1.14), (0.36, 1.116)]],
    )
    car.patch(back, rect(-0.26, 0.26, 0.84, 0.95), "plate", lift=0.006, mirror=False)
    valance = car.hollow(back, [(-0.8, 0.34), (0.8, 0.34), (0.84, 0.5), (-0.84, 0.5)], 0.03, material="trim_black", mirror=False)
    valance.bars(1, share=0.12, sink=0.0)
    car.lamp(back, [(0.66, 0.6), (0.98, 0.61), (0.98, 0.635), (0.66, 0.625)], "red", thickness=0.004)

    car.arches(0.05)
    car.cut()
    car.arch_lips(width=0.03, proud=0.01)
    car.pipes((0.48, 0.6, -0.48, -0.6), stern + 0.005, 0.42, radius=0.048, length=0.14)
    car.seams([0.98, -0.34, -1.02])
    car.bonnet(1.12, 0.66, front=nose - 0.26)
    car.stroke((-0.84, 0.76), (0.84, 0.76), car.tail, steps=12, mirror=False)
    for x in (-0.16, -0.84):
        handle(car, x, 1.0, length=0.18)
    car.mirrors(0.9, size=(0.1, 0.21, 0.13))

    glass = car.cabin(
        screen=(1.1, 0.3),
        back=(-1.82, -2.32),
        roof=[(-1.82, 1.59), (-0.9, 1.682), (-0.1, 1.705), (0.3, 1.652)],
        windows=[((0.8, 0.18), (-0.3, -0.3)), ((-0.38, -0.38), (-1.26, -1.16)), ((-1.34, -1.24), (-2.04, -1.68))],
        base_inset=0.125,
        tumble=0.17,
        drop=0.06,
        bow=(0.18, 0.08),
        rail_bow=(0.1, 0.05),
        flat=(0.86, 0.78),
        power=(2.3, 2.3),
        bulge=0.024,
    )
    car.wipers(glass)
    for x, top in ((-0.34, -0.3), (-1.3, -1.2)):
        car.patch(side, [(x + 0.045, 1.2), (x - 0.045, 1.2), (top - 0.04, 1.6), (top + 0.04, 1.6)], "trim_black", lift=0.003)
    for flip in (1, -1):
        points = [(x, flip * 0.56, car.roof(x, 0.56) + 0.03) for x in (0.15, -0.4, -1.0, -1.6)]
        for a, b in zip(points, points[1:]):
            car.model.absorb(cylinder(a, b, 0.016, "chrome", segments=8))
        for x, y, z in (points[0], points[-1]):
            car.model.absorb(box((x, y, z - 0.016), (0.08, 0.03, 0.03), "trim_black"))
    car.lip(-1.86, car.roof(-1.8, 0) + 0.002, 1.06, depth=0.2, thickness=0.022, material="body", sweep_back=-0.04)
    car.interior(seat=0.0, rear_bench=-0.95)
    return car.finish("#8e8b84")


CARS = {
    "porsche-911-gt3": gt3_wing,
    "porsche-911-gt3-touring": gt3_touring,
    "porsche-911-speedster": speedster,
    "porsche-718-cayman-gt4-rs": cayman_gt4_rs,
    "porsche-718-spyder-rs": spyder_rs,
    "porsche-cayenne-diesel": cayenne,
}
