from carkit import box, bump, lathe
from kit import Coach, ellipse, loft


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def band(a0, a1, b0, b1, count=8):
    low = [(a0 + (a1 - a0) * n / count, b0) for n in range(count + 1)]
    high = [(a1 + (a0 - a1) * n / count, b1) for n in range(count + 1)]
    return low + high


def puck(car, caster, a, b, radius, material, sink, depth, group="Body", inner=0.0):
    hit, normal = caster(a, b)
    profile = [(inner, 0.0), (radius, 0.0), (radius, depth), (inner, depth)] if inner else [(0, 0.0), (radius, 0.0), (radius * 0.9, depth), (0, depth)]
    car.model.add(lathe(profile, material, origin=hit - normal * sink, axis=normal, segments=20), group)


def sunk_lamp(car, t, z, radius, depth=0.034, rings=((1.0, "lens_tail"), (0.62, "lens_ember"), (0.34, "lens_tail")), wall="trim_black"):
    car.hollow(car.back, ellipse((t, z), (radius + 0.008, radius + 0.008), 18), depth, material=wall)
    for n, (share, material) in enumerate(rings):
        puck(car, car.back, t, z, radius * share, material, depth, 0.008 + 0.006 * n, group="Taillights")


def stanchion(car, x, y, low, high, base, top, thick=0.03, material="body", lean=0.03):
    sections = []
    for side in (-thick / 2, thick / 2):
        sections.append([(x + base / 2, y + side, low), (x + top / 2 - lean, y + side, high), (x - top / 2 - lean, y + side, high), (x - base / 2, y + side, low)])
    car.model.add(loft(sections, material, smooth=False))


def handle(car, x, z, size=(0.13, 0.016, 0.034)):
    hit, normal = car.side(x, z)
    car.model.add(box(hit + normal * (size[1] / 2 - 0.002), size, "body", bevel=0.005))


def notch(car, y, z, half=0.1, tall=0.16, reach=0.3):
    car.carve(box((car.stern_x + reach / 2 - 0.1, y, z), (reach + 0.2, half * 2, tall), "underbody", bevel=0.02))


def blister(car, front, rear, reach=1.55):
    axle = car.axle
    front_reach = car.front_wheel["radius"] * reach
    rear_reach = car.rear_wheel["radius"] * reach
    return lambda x: front * bump(x, axle, front_reach) + rear * bump(x, -axle, rear_reach)


def stop_lamp(car, x, z, span=0.3):
    car.model.absorb(box((x, 0, z), (0.012, span, 0.014), "lens_tail"), "Taillights")


def marker(car, x, z):
    car.patch(car.side, rect(x - 0.035, x + 0.035, z - 0.014, z + 0.014), "lens_amber", lift=0.003, thickness=0.004)


def plate(car, caster, z, lift=0.006):
    car.patch(caster, rect(-0.155, 0.155, z, z + 0.16), "plate", lift=lift, mirror=False)


def skyline_r34():
    car = Coach("nissan-skyline-gt-r-r34", "five", spokes=6, root=0.062, tip=0.05, hub=0.07, dish=0.05)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.84), (-axle, 0.875), (-0.3, 0.865), (0.5, 0.865), (axle, 0.875), (nose - 0.3, 0.86), (nose, 0.8)],
        shoulder=[(stern, 0.985), (-1.7, 0.99), (-axle, 0.965), (-0.5, 0.935), (0.86, 0.925), (axle, 0.88), (nose - 0.25, 0.8), (nose, 0.765)],
        waist=[(stern, 0.74), (-axle, 0.72), (0.0, 0.66), (axle, 0.63), (nose, 0.58)],
        sill=[(stern, 0.4), (-1.75, 0.24), (1.75, 0.24), (nose, 0.3)],
        crown=[(stern, 0.01), (-1.6, 0.01), (0.86, 0.03), (axle, 0.045), (nose, 0.03)],
        flare=blister(car, 0.05, 0.056),
        keys=[nose - 0.3, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.1, 0.02, 0.004, 0.004, 0.015, 0.075), "bow": 0.1, "flat": 0.7, "power": 3.0},
        rear={"set": (0.12, 0.03, 0.004, 0.004, 0.012, 0.045), "bow": 0.04, "flat": 0.84, "power": 3.4},
        inset=0.03,
        shelf=0.045,
        flank=0.008,
        belly=0.004,
        sharp=(True, True, False, True, False),
    )
    front, back, side = car.front, car.back, car.side

    grille = car.hollow(front, [(-0.37, 0.675), (0.37, 0.675), (0.35, 0.74), (-0.35, 0.74)], 0.05, mirror=False)
    grille.mesh(9, 2)
    car.headlamp(
        front,
        [(0.41, 0.665), (0.56, 0.62), (0.94, 0.62), (1.05, 0.65), (1.07, 0.765), (0.41, 0.75)],
        projectors=[(0.55, 0.7, 0.04), (0.74, 0.69, 0.052)],
        strips=[[(0.87, 0.635), (0.94, 0.635), (1.035, 0.66), (1.05, 0.75), (0.87, 0.745)]],
    )
    intake = car.hollow(front, [(-0.5, 0.3), (0.5, 0.3), (0.54, 0.52), (-0.54, 0.52)], 0.09, mirror=False)
    intake.fill("steel", sink=0.8, shrink=0.03)
    intake.bars(1, share=0.12, sink=0.15)
    duct = car.hollow(front, [(0.64, 0.3), (0.96, 0.33), (0.96, 0.46), (0.64, 0.46)], 0.07)
    duct.bars(2, share=0.14, sink=0.5)
    car.disc(front, 0.8, 0.535, 0.04, "amber", bezel=None, depth=0.012)
    plate(car, front, 0.335, lift=0.002)

    sunk_lamp(car, 0.665, 0.81, 0.096)
    sunk_lamp(car, 0.43, 0.81, 0.07, rings=((1.0, "lens_tail"), (0.55, "lens_ember")))
    car.hollow(back, rect(-0.19, 0.19, 0.715, 0.905), 0.014, material="body", mirror=False)
    plate(car, back, 0.73, lift=-0.01)
    notch(car, 0.6, 0.3, half=0.085, tall=0.2)
    car.patch(back, rect(0.5, 0.72, 0.52, 0.55), "lens_smoke", lift=0.004, thickness=0.004)
    car.hollow(side, rect(-0.38, -0.22, 0.815, 0.865), 0.012, material="body")

    car.arches(0.038)
    car.cut()
    car.arch_lips(width=0.03, proud=0.01)
    car.pipes((0.6,), stern + 0.015, 0.33, radius=0.058, length=0.2)
    car.lip(nose - 0.08, 0.165, 1.56, depth=0.13, thickness=0.028, material="body", sweep_back=0.2)

    car.seams([0.76, -0.56])
    car.bonnet(0.88, 0.74, front=nose - 0.12)
    car.stroke((-0.8, 0.945), (0.8, 0.945), car.tail, steps=12, mirror=False)
    car.stroke((0.0, 0.66), (1.12, 0.66), back, steps=14)
    car.stroke((0.0, 0.575), (1.1, 0.575), front, steps=14)
    handle(car, -0.3, 0.84)
    marker(car, axle - 0.52, 0.66)
    car.mirrors(0.62)
    car.patch(side, [(axle - 0.4, 0.27), (-axle + 0.4, 0.27), (-axle + 0.4, 0.17), (axle - 0.4, 0.17)], "body", lift=0.014, thickness=0.03)

    glass = car.cabin(
        screen=(0.86, 0.2),
        back=(-1.2, -1.68),
        roof=[(-1.2, 1.305), (-0.6, 1.352), (-0.15, 1.36), (0.2, 1.325)],
        windows=[((0.6, 0.1), (-0.52, -0.5)), ((-0.6, -0.57), (-1.14, -0.92))],
        base_inset=0.045,
        tumble=0.115,
        drop=0.035,
        bow=(0.12, 0.04),
        rail_bow=(0.05, 0.03),
        flat=(0.86, 0.86),
        power=(2.4, 3.4),
        bulge=0.012,
    )
    car.wipers(glass)

    deck = car.lid(stern + 0.2, 0)
    car.lip(stern + 0.1, deck + 0.016, 1.5, depth=0.16, thickness=0.036, material="body")
    stop_lamp(car, stern + 0.016, deck + 0.018)
    stanchion(car, stern + 0.13, 0.66, deck + 0.02, deck + 0.225, 0.24, 0.17)
    car.wing(stern + 0.1, deck + 0.235, 1.5, chord=0.19, thickness=0.03, angle=9)
    car.interior(seat=-0.12, rear_bench=-0.9)
    return car.finish("#1d4fa3")


def skyline_r33():
    car = Coach("nissan-skyline-gt-r-r33", "split", twin=0.2, root=0.042, tip=0.034, dish=0.045)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.8), (-axle, 0.875), (-0.3, 0.868), (0.5, 0.868), (axle, 0.875), (nose - 0.3, 0.845), (nose, 0.74)],
        shoulder=[(stern, 0.95), (-1.75, 0.965), (-axle, 0.95), (-0.5, 0.92), (0.9, 0.905), (axle, 0.855), (nose - 0.25, 0.755), (nose, 0.705)],
        waist=[(stern, 0.72), (-axle, 0.7), (0.0, 0.64), (axle, 0.61), (nose, 0.55)],
        sill=[(stern, 0.4), (-1.75, 0.25), (1.75, 0.25), (nose, 0.3)],
        crown=[(stern, 0.022), (-1.6, 0.022), (0.9, 0.035), (axle, 0.055), (nose, 0.04)],
        flare=(0.034, 0.04),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.11, 0.03, 0.012, 0.012, 0.04, 0.13), "bow": 0.17, "flat": 0.6, "power": 2.25},
        rear={"set": (0.14, 0.05, 0.012, 0.012, 0.03, 0.09), "bow": 0.09, "flat": 0.74, "power": 2.3},
        inset=0.045,
        shelf=0.06,
        flank=0.018,
        belly=0.012,
        sharp=(True, True, False, False, False),
    )
    front, back, side = car.front, car.back, car.side

    grille = car.hollow(front, [(-0.32, 0.615), (0.32, 0.615), (0.3, 0.665), (-0.3, 0.665)], 0.05, mirror=False)
    grille.mesh(8, 2)
    car.headlamp(
        front,
        [(0.37, 0.605), (0.7, 0.59), (0.98, 0.6), (1.07, 0.645), (1.05, 0.7), (0.7, 0.7), (0.37, 0.685)],
        projectors=[(0.5, 0.645, 0.034), (0.67, 0.645, 0.04)],
        strips=[[(0.8, 0.605), (0.98, 0.612), (1.045, 0.648), (1.03, 0.688), (0.8, 0.688)]],
    )
    intake = car.hollow(front, [(-0.36, 0.27), (0.36, 0.27), (0.46, 0.33), (0.46, 0.48), (-0.46, 0.48), (-0.46, 0.33)], 0.09, mirror=False)
    intake.fill("steel", sink=0.8, shrink=0.03)
    intake.bars(1, share=0.12, sink=0.15)
    duct = car.hollow(front, ellipse((0.74, 0.36), (0.15, 0.075), 14), 0.07)
    duct.bars(1, share=0.16, sink=0.5)
    car.patch(front, [(0.6, 0.495), (0.96, 0.495), (0.99, 0.535), (0.6, 0.535)], "lens_amber", lift=0.004, thickness=0.006)
    plate(car, front, 0.3, lift=0.002)

    car.hollow(back, [(0.37, 0.71), (0.74, 0.7), (0.83, 0.74), (0.83, 0.85), (0.74, 0.885), (0.37, 0.88), (0.33, 0.795)], 0.022, material="trim_black")
    for t in (0.69, 0.48):
        for n, (share, material) in enumerate(((1.0, "lens_tail"), (0.6, "lens_ember"), (0.3, "lens_tail"))):
            puck(car, back, t, 0.795, 0.082 * share, material, 0.022, 0.012 + 0.006 * n, group="Taillights")
    car.hollow(back, rect(-0.19, 0.19, 0.7, 0.89), 0.014, material="body", mirror=False)
    plate(car, back, 0.715, lift=-0.01)
    notch(car, 0.58, 0.3, half=0.085, tall=0.2)
    car.hollow(side, rect(-0.38, -0.22, 0.8, 0.85), 0.012, material="body")

    car.arches(0.04)
    car.cut()
    car.arch_lips(width=0.028, proud=0.008)
    car.pipes((0.58,), stern + 0.02, 0.325, radius=0.056, length=0.2)
    car.lip(nose - 0.1, 0.165, 1.44, depth=0.12, thickness=0.026, material="body", sweep_back=0.24)

    car.seams([0.78, -0.56])
    car.bonnet(0.92, 0.72, front=nose - 0.17)
    car.stroke((-0.78, 0.91), (0.78, 0.91), car.tail, steps=12, mirror=False)
    car.stroke((0.0, 0.64), (1.12, 0.64), back, steps=14)
    car.stroke((0.0, 0.565), (1.1, 0.565), front, steps=14)
    handle(car, -0.3, 0.825)
    marker(car, axle - 0.52, 0.64)
    car.mirrors(0.66)
    car.patch(side, [(axle - 0.41, 0.28), (-axle + 0.41, 0.28), (-axle + 0.41, 0.19), (axle - 0.41, 0.19)], "body", lift=0.012, thickness=0.024)

    glass = car.cabin(
        screen=(0.9, 0.16),
        back=(-0.94, -1.66),
        roof=[(-0.94, 1.272), (-0.55, 1.342), (-0.15, 1.36), (0.16, 1.318)],
        windows=[((0.63, 0.06), (-0.5, -0.5)), ((-0.58, -0.57), (-1.16, -0.76))],
        base_inset=0.05,
        tumble=0.135,
        drop=0.05,
        bow=(0.16, 0.08),
        rail_bow=(0.06, 0.05),
        flat=(0.86, 0.84),
        power=(2.2, 2.6),
        bulge=0.022,
    )
    car.wipers(glass)

    deck = car.lid(stern + 0.24, 0)
    stanchion(car, stern + 0.2, 0.6, deck - 0.01, deck + 0.15, 0.26, 0.2, thick=0.05)
    car.wing(stern + 0.17, deck + 0.16, 1.3, chord=0.2, thickness=0.032, angle=8)
    stop_lamp(car, stern + 0.066, deck + 0.172)
    car.interior(seat=-0.1, rear_bench=-0.9)
    return car.finish("#3a2a5c")


def skyline_r32():
    car = Coach("nissan-skyline-gt-r-r32", "five", root=0.078, tip=0.058, hub=0.075, dish=0.04)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.815), (-axle, 0.865), (-0.3, 0.852), (0.5, 0.852), (axle, 0.865), (nose - 0.3, 0.845), (nose, 0.78)],
        shoulder=[(stern, 0.925), (-1.6, 0.93), (-axle, 0.915), (-0.5, 0.89), (0.84, 0.88), (axle, 0.825), (nose - 0.25, 0.73), (nose, 0.695)],
        waist=[(stern, 0.68), (-axle, 0.66), (0.0, 0.62), (axle, 0.6), (nose, 0.55)],
        sill=[(stern, 0.38), (-1.7, 0.24), (1.7, 0.24), (nose, 0.29)],
        crown=[(stern, 0.01), (-1.5, 0.01), (0.84, 0.026), (axle, 0.036), (nose, 0.026)],
        flare=blister(car, 0.05, 0.056),
        keys=[nose - 0.3, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.09, 0.02, 0.004, 0.004, 0.025, 0.1), "bow": 0.1, "flat": 0.7, "power": 2.9},
        rear={"set": (0.12, 0.035, 0.004, 0.004, 0.015, 0.05), "bow": 0.045, "flat": 0.82, "power": 3.2},
        inset=0.03,
        shelf=0.045,
        flank=0.008,
        belly=0.004,
        sharp=(True, True, False, True, False),
    )
    front, back, side = car.front, car.back, car.side

    grille = car.hollow(front, rect(-0.31, 0.31, 0.6, 0.655), 0.05, mirror=False)
    grille.bars(2, material="body", share=0.3, sink=0.1)
    car.headlamp(
        front,
        [(0.35, 0.585), (0.98, 0.58), (1.04, 0.6), (1.04, 0.67), (0.35, 0.67)],
        projectors=[(0.47, 0.626, 0.034), (0.62, 0.626, 0.034)],
        strips=[[(0.74, 0.595), (1.0, 0.595), (1.02, 0.66), (0.74, 0.66)]],
    )
    intake = car.hollow(front, rect(-0.33, 0.33, 0.27, 0.43), 0.09, mirror=False)
    intake.fill("steel", sink=0.8, shrink=0.02)
    duct = car.hollow(front, rect(0.42, 0.88, 0.27, 0.43), 0.07)
    duct.bars(1, share=0.14, sink=0.5)
    car.patch(front, rect(0.42, 0.9, 0.475, 0.515), "lens_amber", lift=0.004, thickness=0.006)
    plate(car, front, 0.3, lift=0.002)

    car.hollow(back, band(-0.86, 0.86, 0.695, 0.855, 12), 0.02, material="trim_black", mirror=False)
    for t in (0.72, 0.53):
        for n, (share, material) in enumerate(((1.0, "lens_tail"), (0.62, "lens_ember"), (0.3, "lens_tail"))):
            puck(car, back, t, 0.775, 0.07 * share, material, 0.02, 0.012 + 0.006 * n, group="Taillights")
    plate(car, back, 0.698, lift=-0.016)
    notch(car, 0.56, 0.29, half=0.08, tall=0.2)
    car.hollow(side, rect(-0.36, -0.2, 0.775, 0.825), 0.012, material="body")

    car.arches(0.04)
    car.cut()
    car.arch_lips(width=0.03, proud=0.01)
    car.pipes((0.56,), stern + 0.02, 0.31, radius=0.052, length=0.2)
    car.lip(nose - 0.085, 0.165, 1.48, depth=0.12, thickness=0.024, material="body", sweep_back=0.18)

    car.seams([0.74, -0.52])
    car.bonnet(0.86, 0.72, front=nose - 0.14)
    car.stroke((-0.82, 0.885), (0.82, 0.885), car.tail, steps=12, mirror=False)
    car.stroke((0.0, 0.62), (1.1, 0.62), back, steps=14)
    car.stroke((0.0, 0.555), (1.08, 0.555), front, steps=14)
    handle(car, -0.28, 0.8)
    marker(car, axle - 0.5, 0.62)
    car.mirrors(0.6)
    car.patch(side, [(axle - 0.4, 0.27), (-axle + 0.4, 0.27), (-axle + 0.4, 0.18), (axle - 0.4, 0.18)], "body", lift=0.012, thickness=0.024)

    glass = car.cabin(
        screen=(0.84, 0.2),
        back=(-0.98, -1.6),
        roof=[(-0.98, 1.29), (-0.5, 1.334), (-0.1, 1.34), (0.2, 1.305)],
        windows=[((0.6, 0.12), (-0.5, -0.47)), ((-0.56, -0.53), (-1.1, -0.8))],
        base_inset=0.045,
        tumble=0.115,
        drop=0.035,
        bow=(0.12, 0.04),
        rail_bow=(0.05, 0.03),
        flat=(0.86, 0.86),
        power=(2.4, 3.2),
        bulge=0.012,
        frame_width=0.016,
    )
    car.wipers(glass)

    deck = car.lid(stern + 0.18, 0)
    stanchion(car, stern + 0.17, 0.6, deck - 0.01, deck + 0.085, 0.24, 0.2, thick=0.05, lean=0.02)
    car.wing(stern + 0.15, deck + 0.095, 1.3, chord=0.2, thickness=0.03, angle=6)
    car.interior(seat=-0.1, rear_bench=-0.84)
    return car.finish("#565a5f")


def gt_r(name, paint, nismo=False):
    if nismo:
        car = Coach(name, "six", twin=0.17, root=0.032, tip=0.028, metal="rim_dark", lip="rim_dark", barrel="rim_dark", cap="caliper", dish=0.05)
    else:
        car = Coach(name, "turbine", spokes=15, root=0.026, tip=0.022, barrel="rim_dark", dish=0.045)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    dark = "carbon" if nismo else "trim_black"

    def relief(x, y):
        return 0.02 * bump(x, axle + 0.05, 0.7) * bump(abs(y), 0.0, 0.42)

    def tone(band, station, point):
        if band == 0:
            return "underbody"
        if band == 1 and point.x < -axle - 0.44:
            return dark
        if nismo and band == 1 and abs(point.x) < axle - 0.4:
            return dark
        return "body"

    car.skin(
        half=[(stern, 0.885), (-axle, 0.945), (-0.4, 0.905), (0.5, 0.905), (axle, 0.94), (nose - 0.3, 0.915), (nose, 0.83)],
        shoulder=[(stern, 1.05), (stern + 0.45, 1.062), (-axle, 1.045), (-0.4, 1.0), (0.94, 0.98), (axle, 0.94), (nose - 0.3, 0.865), (nose, 0.795)],
        waist=[(stern, 0.8), (-axle, 0.78), (0.0, 0.7), (axle, 0.67), (nose, 0.6)],
        sill=[(stern, 0.45), (-axle - 0.5, 0.42), (-axle - 0.3, 0.24), (1.75, 0.24), (nose, 0.28)],
        crown=[(stern, 0.03), (-1.7, 0.03), (0.94, 0.028), (axle, 0.04), (nose, 0.03)],
        flare=(0.03, 0.04),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.22],
        front={"set": (0.08, 0.02, 0.004, 0.004, 0.04, 0.14), "bow": 0.14, "flat": 0.66, "power": 2.6},
        rear={"set": (0.13, 0.03, 0.004, 0.004, 0.012, 0.04), "bow": 0.05, "flat": 0.84, "power": 3.2},
        inset=0.035,
        shelf=0.05,
        flank=0.006,
        belly=0.004,
        relief=relief,
        rear_lift=0.1,
        margin=0.002,
        paint=tone,
        sharp=(True, True, True, True, False),
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    mouth = car.hollow(front, [(-0.42, 0.23), (0.42, 0.23), (0.56, 0.47), (0.47, 0.735), (-0.47, 0.735), (-0.56, 0.47)], 0.1, mirror=False)
    mouth.mesh(13, 7, share=0.12)
    car.patch(front, [(-0.53, 0.415), (0.53, 0.415), (0.56, 0.5), (-0.56, 0.5)], "body", lift=-0.004, thickness=0.05, mirror=False)
    plate(car, front, 0.378, lift=0.004)
    car.patch(front, [(0.0, 0.66), (0.3, 0.685), (0.46, 0.72), (0.46, 0.745), (0.0, 0.745)], "chrome", lift=0.004, thickness=0.02)
    duct = car.hollow(front, [(0.64, 0.23), (0.99, 0.27), (0.99, 0.43), (0.68, 0.4)], 0.07)
    duct.bars(2, share=0.14, sink=0.5)
    car.patch(front, [(0.69, 0.43), (1.01, 0.465), (1.01, 0.492), (0.69, 0.457)], "lens_clear", lift=0.004, thickness=0.006, group="Headlights")
    car.headlamp(
        top,
        [(nose - 0.2, 0.53), (nose - 0.25, 0.76), (nose - 0.5, 0.855), (nose - 0.98, 0.875), (nose - 0.95, 0.8), (nose - 0.6, 0.7), (nose - 0.43, 0.53)],
        projectors=[(nose - 0.33, 0.63, 0.044), (nose - 0.47, 0.75, 0.04)],
        strips=[[(nose - 0.6, 0.745), (nose - 0.92, 0.815), (nose - 0.94, 0.86), (nose - 0.58, 0.8)], [(nose - 0.235, 0.55), (nose - 0.27, 0.72), (nose - 0.3, 0.72), (nose - 0.265, 0.55)]],
    )
    for y in (0.3, -0.3):
        car.hollow(top, [(axle + 0.1, y - 0.03), (axle + 0.1, y + 0.03), (axle - 0.16, y + 0.085), (axle - 0.16, y - 0.085)], 0.03, mirror=False)
    vent = car.hollow(side, [(axle - 0.47, 0.56), (axle - 0.6, 0.6), (axle - 0.6, 0.8), (axle - 0.47, 0.84)], 0.04)
    vent.fill("carbon" if nismo else "steel", sink=0.4, shrink=0.014)

    for t, radius in ((0.7, 0.108), (0.44, 0.094)):
        car.hollow(back, ellipse((t, 0.94), (radius + 0.008, radius + 0.008), 18), 0.03, material="trim_black")
        puck(car, back, t, 0.94, radius, "lens_smoke", 0.03, 0.008)
        puck(car, back, t, 0.94, radius * 0.94, "lens_ember", 0.03, 0.016, group="Taillights", inner=radius * 0.62)
        puck(car, back, t, 0.94, radius * 0.3, "lens_tail", 0.03, 0.02, group="Taillights")
    car.hollow(back, rect(-0.19, 0.19, 0.71, 0.9), 0.014, material="body", mirror=False)
    plate(car, back, 0.725, lift=-0.01)
    car.hollow(back, ellipse((0.44, 0.335), (0.19, 0.085), 14), 0.1, material="grille")
    outlet = car.hollow(back, [(0.99, 0.5), (1.09, 0.52), (1.09, 0.72), (0.99, 0.69)], 0.04)
    outlet.bars(3, share=0.2, sink=0.4)
    car.hollow(side, rect(-0.34, -0.16, 0.89, 0.935), 0.012, material="body")
    if nismo:
        for n in range(3):
            x = axle + 0.16 - n * 0.12
            car.hollow(top, [(x, 0.68), (x, 0.8), (x - 0.05, 0.8), (x - 0.05, 0.68)], 0.025, material="carbon")

    car.arches(0.036)
    car.cut()
    car.arch_lips(width=0.026, proud=0.008)
    car.pipes((0.355, 0.525, -0.355, -0.525), stern + 0.012, 0.335, radius=0.064, length=0.16, material="steel" if nismo else "chrome")
    car.fins(stern + 0.13, 0.225, 4, 0.36, length=0.22, height=0.09, material=dark)

    car.seams([0.8, -0.44])
    car.bonnet(0.96, 0.66, front=nose - 0.42)
    car.stroke((-0.86, 1.045), (0.86, 1.045), car.tail, steps=12, mirror=False)
    car.stroke((0.0, 0.66), (1.14, 0.66), back, steps=14)
    car.stroke((axle - 0.47, 0.82), (-0.3, 0.9), side, steps=10)
    handle(car, -0.25, 0.912, size=(0.15, 0.012, 0.03))
    car.mirrors(0.72, size=(0.09, 0.18, 0.11), reach=0.06, lift=0.06)

    if nismo:
        car.lip(nose - 0.1, 0.12, 1.7, depth=0.2, thickness=0.02, material="carbon", sweep_back=0.22)
        car.lip(nose - 0.1, 0.136, 1.7, depth=0.2, thickness=0.01, material="caliper", sweep_back=0.22)
        car.patch(side, [(axle - 0.42, 0.25), (-axle + 0.42, 0.25), (-axle + 0.42, 0.15), (axle - 0.42, 0.15)], "carbon", lift=0.02, thickness=0.03)
        car.patch(side, [(axle - 0.42, 0.262), (-axle + 0.42, 0.262), (-axle + 0.42, 0.244), (axle - 0.42, 0.244)], "caliper", lift=0.024, thickness=0.004)
        car.patch(back, band(-0.84, 0.84, 0.452, 0.472, 10), "caliper", lift=0.005, thickness=0.004, mirror=False)
        for z in (0.36, 0.5):
            car.patch(front, [(1.02, z), (1.2, z + 0.055), (1.2, z + 0.07), (1.02, z + 0.015)], "carbon", lift=0.02, thickness=0.03)
    else:
        car.lip(nose - 0.08, 0.125, 1.6, depth=0.14, thickness=0.02, material="trim_black", sweep_back=0.2)
        car.patch(side, [(axle - 0.42, 0.26), (-axle + 0.42, 0.26), (-axle + 0.42, 0.17), (axle - 0.42, 0.17)], "body", lift=0.012, thickness=0.024)

    glass = car.cabin(
        screen=(0.94, 0.26),
        back=(-1.12, stern + 0.64),
        roof=[(-1.12, 1.272), (-1.02, 1.288), (-0.4, 1.34), (0.04, 1.37), (0.26, 1.348)],
        windows=[((0.68, 0.12), (-0.4, -0.4)), ((-0.46, -0.44), (-1.0, -1.03))],
        base=[(stern + 0.64, 0.75), (-1.0, 0.83), (0.0, 0.845), (0.94, 0.82)],
        rail=[(-1.12, 0.64), (-0.3, 0.71), (0.26, 0.67)],
        drop=0.035,
        bow=(0.14, 0.05),
        rail_bow=(0.07, 0.03),
        power=(2.3, 2.8),
        bulge=0.01,
        roof_material="carbon" if nismo else "body",
    )
    car.wipers(glass)

    deck = car.lid(stern + 0.22, 0)
    if nismo:
        stanchion(car, stern + 0.2, 0.52, deck - 0.01, deck + 0.21, 0.2, 0.1, thick=0.016, material="carbon", lean=-0.02)
        car.wing(stern + 0.17, deck + 0.225, 1.6, chord=0.28, thickness=0.036, angle=8, material="carbon", plates=(0.15, 0.32), gurney=0.014)
    else:
        stanchion(car, stern + 0.22, 0.5, deck - 0.01, deck + 0.11, 0.2, 0.12, thick=0.03, lean=0.01)
        car.wing(stern + 0.2, deck + 0.125, 1.44, chord=0.22, thickness=0.032, angle=5, material="body")
        stop_lamp(car, stern + 0.088, deck + 0.136)
    car.interior(seat=-0.02, rear_bench=-0.8)
    return car.finish(paint)


def gt_r_r35():
    return gt_r("nissan-gt-r-r35", "#c9571e")


def gt_r_nismo():
    return gt_r("nissan-gt-r-nismo", "#e8e8e4", nismo=True)


CARS = {
    "nissan-skyline-gt-r-r34": skyline_r34,
    "nissan-skyline-gt-r-r33": skyline_r33,
    "nissan-skyline-gt-r-r32": skyline_r32,
    "nissan-gt-r-r35": gt_r_r35,
    "nissan-gt-r-nismo": gt_r_nismo,
}
