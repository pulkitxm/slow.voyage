from carkit import box, bump, lathe
from formula import grand_prix
from kit import Coach, ellipse, loft, superellipse


def stripe(car, caster, low, high, bands, step=0.09, lift=0.005):
    for inner, outer, material in bands:
        if inner <= 0:
            car.patch(caster, [(low, -outer), (low, outer), (high, outer), (high, -outer)], material, lift=lift, mirror=False, step=step)
        else:
            car.patch(caster, [(low, inner), (low, outer), (high, outer), (high, inner)], material, lift=lift, step=step)


def rounded(outline, rounds=2):
    for _ in range(rounds):
        result = []
        count = len(outline)
        for i in range(count):
            a = outline[i]
            b = outline[(i + 1) % count]
            result.append((a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25))
            result.append((a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75))
        outline = result
    return outline


def hips(car, front, rear, scallop=0.0, at=-0.2, reach=0.9, step=None):
    axle = car.axle
    fore = car.front_wheel["radius"] * 1.9
    aft = car.rear_wheel["radius"] * 2.1

    def flare(x):
        value = front * bump(x, axle, fore) + rear * bump(x, -axle, aft) - scallop * bump(x, at, reach)
        if step:
            start, deepest, finish, depth = step
            if finish < x < start:
                share = (start - x) / (start - deepest) if x > deepest else (x - finish) / (deepest - finish)
                value -= depth * share * share * (3 - 2 * share)
        return value

    return flare


def valance(car, reach=0.42, material="trim_black"):
    limit = -car.axle - reach

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band == 1 and point.x < limit:
            return material
        return "body"

    return paint


def tips(car, positions, z, radius, length=0.16, proud=0.015, material="chrome"):
    for y in positions:
        x = car.tail(abs(y), z)[0].x - proud
        car.pipes((y,), x, z, radius=radius, length=length, material=material)


def strakes(car, count, span, length=0.36, height=0.11, inset=0.12, material="trim_black"):
    x = car.stern_x + inset + length / 2
    z = car.tail_floor - height / 2 + 0.035
    car.fins(x, z, count, span, length=length, height=height, material=material)


def round_tail(car, spots, radius, depth=0.04, sunk=True):
    back = car.back
    for t, z in spots:
        if sunk:
            car.hollow(back, ellipse((t, z), (radius + 0.008, radius + 0.008), 16), depth, material="body")

    def build():
        for t, z in spots:
            hit, normal = back(t, z)
            origin = hit - normal * depth
            parts = [
                (lathe([(0, 0.0), (radius, 0.0), (radius, 0.012), (radius * 0.9, 0.02), (0, 0.02)], "lens_tail", origin=origin, axis=normal, segments=20), "Taillights"),
                (lathe([(radius * 0.56, 0.018), (radius * 0.84, 0.018), (radius * 0.84, 0.028), (radius * 0.56, 0.028)], "lens_ember", origin=origin, axis=normal, segments=20), "Taillights"),
                (lathe([(0, 0.018), (radius * 0.3, 0.018), (radius * 0.26, 0.03), (0, 0.032)], "lens_ember", origin=origin, axis=normal, segments=12), "Taillights"),
            ]
            for part, group in parts:
                car.model.add(part, group)

    return build


def midship(car, scoop=False, lip=0.028, deck=0.885, rear_lift=0.13):
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.tail_floor = car.sheet.clearance + rear_lift
    step = (0.35, -0.72, -0.98, 0.05) if scoop else None
    bow = (0.12, 0.18, 0.2, 0.2, 0.18, 0.15) if scoop else (0.1, 0.14, 0.16, 0.16, 0.14, 0.12)
    flat = (0.56, 0.56, 0.54, 0.5, 0.42, 0.36) if scoop else (0.6, 0.6, 0.58, 0.55, 0.45, 0.4)
    car.skin(
        half=[(stern, 0.9), (-axle, 0.985), (-0.5, 0.93), (0.4, 0.92), (axle, 0.965), (nose - 0.85, 0.945), (nose, 0.9)],
        shoulder=[
            (stern, deck),
            (-1.8, deck + 0.03),
            (-axle, 0.935),
            (-0.9, 0.91),
            (-0.4, 0.855),
            (0.4, 0.82),
            (1.0, 0.8),
            (axle, 0.77),
            (axle + 0.2, 0.742),
            (nose - 0.6, 0.668),
            (nose - 0.3, 0.575),
            (nose - 0.1, 0.495),
            (nose, 0.445),
        ],
        waist=[(stern, 0.7), (-axle, 0.66), (-0.4, 0.53), (axle, 0.5), (nose - 0.5, 0.42), (nose, 0.39)],
        sill=[(stern, 0.42), (-axle, 0.28), (0.0, 0.21), (axle, 0.21), (nose, 0.2)],
        crown=[(stern, -0.015), (-axle, -0.05), (-0.6, -0.02), (0.3, 0.0), (1.2, -0.02), (axle, -0.07), (nose - 0.6, -0.08), (nose - 0.25, -0.03), (nose, 0.005)],
        flare=hips(car, 0.03, 0.055, scallop=0.045, step=step),
        keys=[nose - 0.85, axle, 0.45, -0.45, -axle, stern + 0.35],
        front={"set": (0.1, 0.02, 0.006, 0.006, 0.06, 0.17), "bow": bow, "flat": flat, "power": 1.9 if scoop else 2.1},
        rear={"set": (0.32, 0.2, 0.1, 0.04, 0.012, 0.05), "bow": 0.06, "flat": 0.8, "power": 2.6},
        inset=0.07,
        shelf=0.09,
        flank=0.025,
        belly=0.004,
        tuck=0.12,
        rear_lift=rear_lift,
        sharp=(True, True, True, False, False),
        relief=lambda x, y: lip * bump(x, stern, 0.3) + 0.03 * bump(x, stern + 0.1, 0.34) * bump(abs(y), 0.72, 0.2),
        paint=valance(car),
    )


def canopy(car, engine="caliper"):
    glass = car.cabin(
        screen=(1.2, 0.28),
        back=(-0.64, -1.72),
        roof=[(-0.64, 1.158), (-0.42, 1.196), (-0.15, 1.213), (0.1, 1.203), (0.28, 1.172)],
        windows=[((0.8, 0.2), (-0.36, -0.34)), ((-0.42, -0.4), (-0.95, -0.58))],
        base=[(-0.95, 0.74), (-0.3, 0.775), (0.8, 0.75), (1.2, 0.72)],
        rail=[(-0.64, 0.52), (-0.15, 0.58), (0.28, 0.54)],
        bow=(0.26, 0.05),
        rail_bow=(0.12, 0.04),
        flat=(0.84, 0.8),
        power=(2.2, 2.6),
        bulge=0.025,
    )
    if engine:
        for y in (0.2, -0.2):
            car.model.absorb(box((-1.05, y, car.lid(-1.05, y) + 0.02), (0.38, 0.2, 0.05), engine, bevel=0.015))
    car.wipers(glass)
    return glass


def italia(name, paint, wheel="star", spider=False, speciale=False, **look):
    car = Coach(name, wheel, **dict({"barrel": "rim_dark"}, **look))
    nose, stern = car.nose_x, car.stern_x
    midship(car, lip=0.06 if speciale else 0.028)
    front, back, top = car.front, car.back, car.top

    mouth = car.hollow(front, rounded([(-0.42, 0.2), (0.42, 0.2), (0.54, 0.33), (0.36, 0.385), (-0.36, 0.385), (-0.54, 0.33)], 1), 0.09, mirror=False)
    mouth.mesh(18, 4)
    intake = car.hollow(front, rounded([(0.62, 0.215), (0.88, 0.25), (0.96, 0.43), (0.84, 0.47), (0.64, 0.37)], 1), 0.08)
    intake.mesh(6, 5)
    car.hollow(top, [(nose - 0.56, 0.44), (nose - 0.6, 0.5), (nose - 0.86, 0.6), (nose - 0.84, 0.54)], 0.04)
    if speciale:
        vent = car.hollow(top, [(nose - 0.56, 0.14), (nose - 0.56, 0.4), (nose - 0.84, 0.46), (nose - 0.84, 0.14)], 0.05)
        vent.bars(2, axis=0, share=0.12)
    lamp = rounded([(nose - 0.34, 0.5), (nose - 0.4, 0.66), (nose - 0.62, 0.76), (nose - 1.12, 0.835), (nose - 1.1, 0.79), (nose - 0.72, 0.66), (nose - 0.5, 0.5)], 1)
    car.headlamp(
        top,
        lamp,
        projectors=[(nose - 0.455, 0.58, 0.036), (nose - 0.545, 0.65, 0.032), (nose - 0.64, 0.705, 0.026)],
        strips=[[(nose - 0.72, 0.725), (nose - 0.735, 0.76), (nose - 1.06, 0.817), (nose - 1.07, 0.797)]],
    )
    car.patch(top, [(nose - 0.3, -0.028), (nose - 0.3, 0.028), (nose - 0.37, 0.024), (nose - 0.37, -0.024)], "accent", lift=0.004, thickness=0.003, mirror=False)
    car.patch(front, [(-0.26, 0.23), (0.26, 0.23), (0.26, 0.34), (-0.26, 0.34)], "plate", lift=0.006, mirror=False)

    car.hollow(top, [(-0.5, 0.765), (-0.5, 0.81), (-0.95, 0.8), (-0.95, 0.775)], 0.05)

    grille = car.hollow(back, [(0.2, 0.7), (0.56, 0.7), (0.57, 0.785), (0.2, 0.795)], 0.05)
    grille.mesh(8, 3)
    lamps = round_tail(car, [(0.72, 0.795)], 0.1)
    car.hollow(back, [(-0.3, 0.535), (0.3, 0.535), (0.3, 0.685), (-0.3, 0.685)], 0.02, material="body", mirror=False)
    car.patch(back, [(-0.26, 0.555), (0.26, 0.555), (0.26, 0.665), (-0.26, 0.665)], "plate", lift=-0.016, mirror=False)
    if speciale:
        for side in (1, -1):
            car.hollow(back, ellipse((side * 0.3, 0.37), (0.085, 0.07), 12), 0.1, material="trim_black", mirror=False)
    else:
        car.hollow(back, rounded([(-0.2, 0.31), (0.2, 0.31), (0.2, 0.44), (-0.2, 0.44)], 1), 0.1, material="trim_black", mirror=False)
    car.patch(back, [(0.62, 0.46), (0.82, 0.47), (0.82, 0.5), (0.62, 0.49)], "lens_tail", lift=0.004, thickness=0.004)
    if spider:
        deck = car.hollow(top, [(-1.0, -0.3), (-1.0, 0.3), (-1.66, 0.36), (-1.66, -0.36)], 0.04, mirror=False)
        deck.bars(6, axis=0, material="body", share=0.5, sink=0.0)

    car.arches(0.036, inner=0.09)
    car.cut()
    car.arch_lips(width=0.02, proud=0.006)
    lamps()
    if speciale:
        tips(car, (0.3, -0.3), 0.37, 0.06)
        strakes(car, 8, 1.3, height=0.13)
        car.lip(nose - 0.1, 0.118, 1.56, depth=0.2, thickness=0.018, material="carbon", sweep_back=0.26)
        car.model.add(box((-0.75, car.side(-0.75, 0.2)[0].y + 0.01, 0.2), (0.5, 0.012, 0.09), "carbon"))
    else:
        tips(car, (0.105, 0.0, -0.105), 0.375, 0.046)
        strakes(car, 6, 1.2)
        car.lip(nose - 0.09, 0.122, 1.5, depth=0.15, thickness=0.02, sweep_back=0.26)

    car.seams([0.8, -0.36])
    car.bonnet(1.2, 0.5, front=nose - 0.3)
    car.mirrors(0.84, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.07)

    if spider:
        glass = car.cabin(
            screen=(1.2, 0.28),
            back=(-0.42, -0.62),
            roof=[(-0.42, 1.186), (-0.15, 1.211), (0.1, 1.203), (0.28, 1.172)],
            windows=[((0.8, 0.2), (-0.34, -0.3))],
            base=[(-0.62, 0.72), (-0.3, 0.745), (0.8, 0.73), (1.2, 0.7)],
            rail=[(-0.42, 0.5), (-0.1, 0.54), (0.28, 0.5)],
            bow=(0.26, 0.03),
            rail_bow=(0.12, 0.02),
            flat=(0.84, 0.4),
            power=(2.2, 3.0),
            bulge=0.025,
        )
        rings = []
        for x, y, half, tall in [(-0.36, 0.44, 0.25, 0.29), (-0.7, 0.46, 0.23, 0.21), (-1.1, 0.48, 0.19, 0.115), (-1.45, 0.5, 0.14, 0.045), (-1.74, 0.51, 0.1, 0.012)]:
            rings.append(superellipse((x, y, car.lid(x, y) - 0.02), half, tall, power=2.9, count=14, squash=0.1))
        car.model.add(loft(rings, "body"))
        car.wipers(glass)
    else:
        canopy(car)
    if speciale:
        bands = [(0.0, 0.07, "livery"), (0.07, 0.13, "livery_dark")]
        stripe(car, top, 1.24, nose - 0.3, bands)
        stripe(car, top, -0.48, 0.24, bands)
        stripe(car, top, stern + 0.05, -1.74, bands)
    car.interior(seat=0.0, spread=0.31, height=0.13, width=0.4)
    return car.finish(paint)


def italia_coupe():
    return italia("ferrari-458-italia", "#c1121c")


def italia_spider():
    return italia("ferrari-458-spider", "#f4c20d", spider=True)


def italia_speciale():
    return italia("ferrari-458-speciale", "#c1121c", wheel="ten", speciale=True, metal="rim_dark", root=0.026, tip=0.02)


def gtb(name, paint, wheel="star", pista=False, tributo=False, **look):
    car = Coach(name, wheel, **dict({"barrel": "rim_dark"}, **look))
    nose, stern = car.nose_x, car.stern_x
    duct = pista or tributo
    midship(car, scoop=True, deck=0.895, lip=0.075 if pista else 0.035)
    front, back, top, side = car.front, car.back, car.top, car.side

    if duct:
        mouth = car.hollow(front, rounded([(-0.4, 0.2), (0.4, 0.2), (0.52, 0.31), (0.34, 0.355), (-0.34, 0.355), (-0.52, 0.31)], 1), 0.09, mirror=False)
        mouth.mesh(16, 3)
        car.hollow(top, [(nose - 0.5, -0.33), (nose - 0.5, 0.33), (nose - 0.86, 0.4), (nose - 0.86, -0.4)], 0.07, mirror=False)
        car.patch(top, [(nose - 0.53, -0.29), (nose - 0.53, 0.29), (nose - 0.66, 0.31), (nose - 0.66, -0.31)], "body", lift=-0.035, thickness=0.01, mirror=False)
    else:
        mouth = car.hollow(front, rounded([(0.08, 0.2), (0.42, 0.2), (0.55, 0.33), (0.38, 0.385), (0.08, 0.385)], 1), 0.09)
        mouth.mesh(8, 4)
        car.hollow(top, [(nose - 0.5, 0.2), (nose - 0.52, 0.3), (nose - 0.98, 0.42), (nose - 1.0, 0.32)], 0.045)
    intake = car.hollow(front, rounded([(0.62, 0.215), (0.88, 0.25), (0.96, 0.43), (0.84, 0.47), (0.64, 0.37)], 1), 0.08)
    intake.mesh(6, 5)
    if tributo:
        lamp = rounded([(nose - 0.36, 0.5), (nose - 0.42, 0.7), (nose - 0.62, 0.8), (nose - 0.8, 0.83), (nose - 0.8, 0.78), (nose - 0.62, 0.72), (nose - 0.52, 0.62), (nose - 0.5, 0.5)], 1)
        car.headlamp(
            top,
            lamp,
            projectors=[(nose - 0.45, 0.57, 0.03), (nose - 0.48, 0.65, 0.028)],
            strips=[[(nose - 0.56, 0.735), (nose - 0.62, 0.775), (nose - 0.77, 0.81), (nose - 0.775, 0.795), (nose - 0.63, 0.755), (nose - 0.575, 0.715)]],
        )
        car.hollow(top, [(nose - 0.6, 0.52), (nose - 0.62, 0.62), (nose - 0.78, 0.71), (nose - 0.84, 0.7), (nose - 0.74, 0.56)], 0.05)
    else:
        lamp = rounded([(nose - 0.34, 0.5), (nose - 0.4, 0.68), (nose - 0.62, 0.78), (nose - 0.98, 0.835), (nose - 0.98, 0.79), (nose - 0.68, 0.68), (nose - 0.52, 0.5)], 1)
        car.headlamp(
            top,
            lamp,
            projectors=[(nose - 0.46, 0.59, 0.036), (nose - 0.56, 0.67, 0.03)],
            strips=[[(nose - 0.4, 0.52), (nose - 0.44, 0.67), (nose - 0.63, 0.765), (nose - 0.94, 0.815), (nose - 0.945, 0.8), (nose - 0.64, 0.745), (nose - 0.46, 0.655), (nose - 0.425, 0.52)]],
        )
    car.patch(top, [(nose - 0.3, -0.028), (nose - 0.3, 0.028), (nose - 0.37, 0.024), (nose - 0.37, -0.024)], "accent", lift=0.004, thickness=0.003, mirror=False)
    car.patch(front, [(-0.26, 0.222), (0.26, 0.222), (0.26, 0.332), (-0.26, 0.332)], "plate", lift=0.006, mirror=False)

    scoop = car.hollow(side, [(-0.3, 0.6), (-0.84, 0.44), (-0.97, 0.52), (-0.97, 0.8), (-0.62, 0.79)], 0.16, material="body")
    scoop.fill("grille", sink=0.94)
    scoop.bars(1, material="body", share=0.12, sink=0.25, thickness=0.02)

    if tributo:
        lamps = round_tail(car, [(0.75, 0.79), (0.57, 0.79)], 0.07)
    else:
        lamps = round_tail(car, [(0.72, 0.775)], 0.098)
        grille = car.hollow(back, [(0.36, 0.62), (0.8, 0.62), (0.82, 0.68), (0.36, 0.69)], 0.05)
        grille.mesh(9, 2)
    car.hollow(back, [(-0.5, 0.835), (0.5, 0.835), (0.5, 0.868), (-0.5, 0.868)], 0.06, mirror=False)
    car.hollow(back, [(-0.3, 0.45), (0.3, 0.45), (0.3, 0.6), (-0.3, 0.6)], 0.02, material="body", mirror=False)
    car.patch(back, [(-0.26, 0.47), (0.26, 0.47), (0.26, 0.58), (-0.26, 0.58)], "plate", lift=-0.016, mirror=False)
    for flip in (1, -1):
        car.hollow(back, ellipse((flip * 0.44, 0.5), (0.09, 0.08), 12), 0.1, material="trim_black", mirror=False)
    car.patch(back, [(0.66, 0.43), (0.86, 0.44), (0.86, 0.47), (0.66, 0.46)], "lens_tail", lift=0.004, thickness=0.004)

    car.arches(0.036, inner=0.09)
    car.cut()
    car.arch_lips(width=0.02, proud=0.006)
    lamps()
    tips(car, (0.44, -0.44), 0.5, 0.06)
    strakes(car, 9 if pista else 7, 1.36, height=0.14 if pista else 0.12)
    if pista:
        car.lip(nose - 0.1, 0.118, 1.6, depth=0.22, thickness=0.018, material="carbon", sweep_back=0.28)
        car.model.add(box((-0.75, car.side(-0.75, 0.2)[0].y + 0.01, 0.2), (0.5, 0.012, 0.09), "carbon"))
    else:
        car.lip(nose - 0.09, 0.122, 1.5, depth=0.15, thickness=0.02, sweep_back=0.26)

    car.seams([0.8, -0.3])
    car.bonnet(1.2, 0.5, front=nose - 0.3)
    car.mirrors(0.84, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.07)
    canopy(car, engine=None if tributo else "caliper")
    if tributo:
        for n in range(4):
            x = -0.86 - n * 0.2
            half = 0.4 + n * 0.03
            car.patch(top, [(x, -half), (x, half), (x - 0.09, half + 0.01), (x - 0.09, -half - 0.01)], "carbon", lift=0.008, thickness=0.012, mirror=False)
    if pista:
        bands = [(0.035, 0.15, "livery")]
        stripe(car, top, 1.24, nose - 0.86, bands)
        stripe(car, top, nose - 0.5, nose - 0.22, bands, step=0.05)
        stripe(car, top, -0.48, 0.24, bands)
        stripe(car, top, stern + 0.05, -1.74, bands)
    car.interior(seat=0.0, spread=0.31, height=0.13, width=0.4)
    return car.finish(paint)


def gtb_coupe():
    return gtb("ferrari-488-gtb", "#a80f1a")


def gtb_pista():
    return gtb("ferrari-488-pista", "#c1121c", wheel="ten", pista=True)


def f8_tributo():
    return gtb("ferrari-f8-tributo", "#c1121c", tributo=True, twin=0.24)


def tourer(car, shoulder, front_set, deck_lip=0.02, rear_lift=0.14, dome=0.02):
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.tail_floor = car.sheet.clearance + rear_lift
    car.skin(
        half=[(stern, 0.84), (-axle, 0.985), (-0.3, 0.93), (0.6, 0.925), (axle, 0.96), (nose - 0.7, 0.93), (nose, 0.85)],
        shoulder=shoulder,
        waist=[(stern, 0.72), (-axle, 0.68), (0.0, 0.56), (axle, 0.56), (nose, 0.52)],
        sill=[(stern, 0.42), (-axle, 0.28), (0.0, 0.23), (axle, 0.23), (nose, 0.3)],
        crown=[(stern, 0.0), (-axle, -0.025), (-0.6, 0.0), (0.6, 0.0), (axle, -0.015), (nose - 0.4, 0.0), (nose, 0.0)],
        flare=hips(car, 0.028, 0.05, scallop=0.035, at=-0.1),
        keys=[nose - 0.7, axle, 0.45, -0.45, -axle, stern + 0.45],
        front={"set": front_set, "bow": (0.12, 0.16, 0.2, 0.22, 0.22, 0.2), "flat": 0.5, "power": 2.1},
        rear={"set": (0.3, 0.16, 0.07, 0.04, 0.012, 0.07), "bow": 0.1, "flat": 0.72, "power": 2.3},
        inset=0.07,
        shelf=0.09,
        flank=0.022,
        belly=0.004,
        tuck=0.12,
        rear_lift=rear_lift,
        sharp=(True, True, False, True, False),
        relief=lambda x, y: dome * bump(y, 0, 0.46) * bump(x, axle + 0.1, 1.0) + deck_lip * bump(x, stern, 0.25),
        paint=valance(car, reach=0.44),
    )


def quad(car, z=0.33, radius=0.05):
    back = car.back
    for t in (0.5, -0.5):
        car.hollow(back, rounded([(t - 0.15, z - 0.07), (t + 0.15, z - 0.07), (t + 0.15, z + 0.07), (t - 0.15, z + 0.07)], 1), 0.09, material="trim_black", mirror=False)
    return lambda: tips(car, (0.57, 0.43, -0.43, -0.57), z, radius)


def roma():
    car = Coach("ferrari-roma", "star", barrel="rim_dark", twin=0.24)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    tourer(
        car,
        shoulder=[(stern, 0.865), (-2.0, 0.925), (-axle, 0.955), (-1.0, 0.94), (-0.3, 0.9), (0.5, 0.875), (0.8, 0.85), (axle, 0.8), (nose - 0.45, 0.735), (nose - 0.15, 0.66), (nose, 0.605)],
        front_set=(0.2, 0.1, 0.075, 0.035, 0.012, 0.1),
    )
    front, back, top = car.front, car.back, car.top

    grille = car.hollow(front, rounded([(-0.5, 0.335), (0.5, 0.335), (0.56, 0.525), (-0.56, 0.525)], 1), 0.035, mirror=False)
    grille.bars(5, material="body", share=0.55, sink=0.2, thickness=0.006)
    grille.bars(20, material="body", axis=0, share=0.5, sink=0.2, thickness=0.006)
    low = car.hollow(front, [(-0.46, 0.2), (0.46, 0.2), (0.48, 0.275), (-0.48, 0.275)], 0.06, mirror=False)
    low.mesh(12, 2)
    corner = car.hollow(front, [(0.62, 0.25), (0.88, 0.3), (0.88, 0.42), (0.64, 0.4)], 0.06)
    corner.mesh(4, 3)
    car.headlamp(
        front,
        [(0.5, 0.6), (0.74, 0.625), (0.98, 0.67), (1.0, 0.715), (0.74, 0.675), (0.5, 0.655)],
        projectors=[(0.6, 0.633, 0.02), (0.82, 0.667, 0.02)],
        strips=[[(0.5, 0.622), (0.74, 0.645), (0.99, 0.688), (0.99, 0.698), (0.74, 0.655), (0.5, 0.632)]],
        depth=0.035,
    )
    car.patch(front, [(-0.26, 0.345), (0.26, 0.345), (0.26, 0.455), (-0.26, 0.455)], "plate", lift=0.004, mirror=False)
    car.patch(top, [(nose - 0.14, -0.026), (nose - 0.14, 0.026), (nose - 0.2, 0.022), (nose - 0.2, -0.022)], "accent", lift=0.004, thickness=0.003, mirror=False)

    for low_t, high_t in ((0.27, 0.53), (0.57, 0.85)):
        gem = [(low_t, 0.765), (high_t, 0.765), (high_t, 0.83), (low_t, 0.83)]
        car.hollow(back, gem, 0.022, material="body")
        car.patch(back, [(low_t + 0.006, 0.771), (high_t - 0.006, 0.771), (high_t - 0.006, 0.824), (low_t + 0.006, 0.824)], "lens_tail", lift=-0.02, thickness=0.004, group="Taillights")
        car.patch(back, [(low_t + 0.02, 0.784), (high_t - 0.02, 0.784), (high_t - 0.02, 0.811), (low_t + 0.02, 0.811)], "lens_ember", lift=-0.014, thickness=0.004, group="Taillights")
    car.hollow(back, [(-0.3, 0.5), (0.3, 0.5), (0.3, 0.65), (-0.3, 0.65)], 0.02, material="body", mirror=False)
    car.patch(back, [(-0.26, 0.52), (0.26, 0.52), (0.26, 0.63), (-0.26, 0.63)], "plate", lift=-0.016, mirror=False)
    pipes = quad(car)

    car.arches(0.036, inner=0.09)
    car.cut()
    car.arch_lips(width=0.02, proud=0.006)
    pipes()
    strakes(car, 5, 0.62, height=0.12)
    car.lip(nose - 0.2, 0.135, 1.4, depth=0.12, thickness=0.02, sweep_back=0.14)
    car.stroke((-0.84, 0.845), (0.84, 0.845), car.tail, steps=14, mirror=False)

    car.seams([0.44, -0.62])
    car.bonnet(0.6, 0.6, front=nose - 0.2)
    car.mirrors(0.34, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.07)

    glass = car.cabin(
        screen=(0.64, -0.18),
        back=(-1.16, -2.06),
        roof=[(-1.16, 1.19), (-0.95, 1.255), (-0.7, 1.292), (-0.45, 1.301), (-0.28, 1.289), (-0.18, 1.266)],
        windows=[((0.36, -0.25), (-0.62, -0.7)), ((-0.68, -0.76), (-1.34, -1.08))],
        base=[(-1.34, 0.74), (-0.4, 0.775), (0.64, 0.75)],
        rail=[(-1.16, 0.52), (-0.5, 0.58), (-0.18, 0.55)],
        bow=(0.2, 0.06),
        rail_bow=(0.1, 0.04),
        flat=(0.84, 0.78),
        power=(2.2, 2.5),
        bulge=0.025,
    )
    car.wipers(glass)
    car.interior(seat=-0.4, spread=0.34, rear_bench=-1.0, height=0.14, width=0.42)
    return car.finish("#3f4b5e")


def portofino():
    car = Coach("ferrari-portofino", "star", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    tourer(
        car,
        shoulder=[(stern, 0.935), (-1.95, 0.975), (-axle, 0.985), (-1.0, 0.965), (-0.3, 0.915), (0.5, 0.885), (0.8, 0.86), (axle, 0.815), (nose - 0.45, 0.735), (nose - 0.15, 0.65), (nose, 0.585)],
        front_set=(0.14, 0.04, 0.012, 0.006, 0.03, 0.15),
        deck_lip=0.025,
    )
    front, back, top = car.front, car.back, car.top

    grille = car.hollow(front, rounded([(-0.52, 0.29), (0.52, 0.29), (0.64, 0.5), (-0.64, 0.5)], 1), 0.08, mirror=False)
    grille.bars(6, share=0.26, sink=0.3)
    corner = car.hollow(front, [(0.72, 0.25), (0.94, 0.3), (0.94, 0.44), (0.74, 0.42)], 0.06)
    corner.mesh(4, 3)
    lamp = rounded([(nose - 0.36, 0.48), (nose - 0.4, 0.7), (nose - 0.52, 0.8), (nose - 0.96, 0.865), (nose - 0.96, 0.82), (nose - 0.64, 0.74), (nose - 0.54, 0.64), (nose - 0.52, 0.48)], 1)
    car.headlamp(
        top,
        lamp,
        projectors=[(nose - 0.445, 0.56, 0.03), (nose - 0.475, 0.67, 0.028)],
        strips=[[(nose - 0.6, 0.765), (nose - 0.62, 0.79), (nose - 0.92, 0.848), (nose - 0.92, 0.828)]],
    )
    car.patch(front, [(-0.26, 0.3), (0.26, 0.3), (0.26, 0.41), (-0.26, 0.41)], "plate", lift=0.004, mirror=False)
    car.patch(top, [(nose - 0.2, -0.026), (nose - 0.2, 0.026), (nose - 0.26, 0.022), (nose - 0.26, -0.022)], "accent", lift=0.004, thickness=0.003, mirror=False)
    vent = car.hollow(top, [(nose - 0.75, 0.2), (nose - 0.75, 0.32), (nose - 1.1, 0.36), (nose - 1.1, 0.24)], 0.04)
    vent.bars(3, axis=0, share=0.18)
    gill = car.hollow(car.side, [(0.92, 0.6), (0.92, 0.76), (0.62, 0.7), (0.66, 0.62)], 0.06, material="body")
    gill.fill("grille", sink=0.9)

    lamps = round_tail(car, [(0.72, 0.84)], 0.095)
    car.hollow(back, [(-0.3, 0.56), (0.3, 0.56), (0.3, 0.71), (-0.3, 0.71)], 0.02, material="body", mirror=False)
    car.patch(back, [(-0.26, 0.58), (0.26, 0.58), (0.26, 0.69), (-0.26, 0.69)], "plate", lift=-0.016, mirror=False)
    pipes = quad(car)

    car.arches(0.036, inner=0.09)
    car.cut()
    car.arch_lips(width=0.02, proud=0.006)
    lamps()
    pipes()
    strakes(car, 5, 0.62, height=0.12)
    car.lip(nose - 0.16, 0.135, 1.4, depth=0.12, thickness=0.02, sweep_back=0.14)
    car.stroke((0.6, 0.68), (-0.5, 0.76), car.side, steps=10)

    car.seams([0.44, -0.6])
    car.bonnet(0.6, 0.6, front=nose - 0.26)
    car.stroke((-1.9, 0.6), (stern + 0.16, 0.58), top, steps=6)
    car.stroke((-1.9, -0.6), (-1.9, 0.6), top, steps=10, mirror=False)
    car.grips([-0.42])
    car.mirrors(0.34, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.07)

    glass = car.cabin(
        screen=(0.64, -0.16),
        back=(-1.1, -1.86),
        roof=[(-1.1, 1.22), (-0.88, 1.278), (-0.64, 1.31), (-0.42, 1.318), (-0.26, 1.306), (-0.16, 1.284)],
        windows=[((0.36, -0.23), (-0.54, -0.62)), ((-0.6, -0.68), (-1.2, -1.02))],
        base=[(-1.2, 0.75), (-0.4, 0.78), (0.64, 0.76)],
        rail=[(-1.1, 0.52), (-0.5, 0.58), (-0.16, 0.55)],
        bow=(0.2, 0.06),
        rail_bow=(0.1, 0.04),
        flat=(0.84, 0.76),
        power=(2.2, 2.4),
        bulge=0.025,
    )
    car.wipers(glass)
    car.stroke((-0.55, -0.5), (-0.55, 0.5), top, steps=10, mirror=False)
    car.interior(seat=-0.4, spread=0.34, rear_bench=-0.95, height=0.14, width=0.42)
    return car.finish("#9e1b22")


def f2004():
    return grand_prix("ferrari-f2004", "#c8141c", nose_tip=0.3, plates="livery", accent="livery", helmet="caliper")


CARS = {
    "ferrari-458-italia": italia_coupe,
    "ferrari-458-spider": italia_spider,
    "ferrari-458-speciale": italia_speciale,
    "ferrari-488-gtb": gtb_coupe,
    "ferrari-488-pista": gtb_pista,
    "ferrari-f8-tributo": f8_tributo,
    "ferrari-roma": roma,
    "ferrari-portofino": portofino,
    "ferrari-f2004": f2004,
}
