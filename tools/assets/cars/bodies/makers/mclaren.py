import math

from carkit import bar, bump, box, cylinder, hexahedron
from ferrari import hips, round_tail, rounded, strakes, tips, valance
from kit import Coach, ellipse, loft, superellipse
from mathutils import Matrix, Vector


def seat(car, x, y, floor, height=0.14, width=0.4, material="seat"):
    tilt = Matrix.Rotation(math.radians(-12), 3, "Y")
    car.model.absorb(box((x, y, floor + height / 2 - 0.02), (0.11, width, height + 0.04), material, rotation=tilt, bevel=0.025, taper=0.88))
    car.model.absorb(box((x - 0.035, y, floor + height + 0.065), (0.085, width * 0.52, 0.11), material, rotation=tilt, bevel=0.025))


def upright(car, x, y, top, foot=0.26, head=0.14, thickness=0.016, lean=0.06, material="carbon"):
    base = car.top(x, y)[0].z - 0.015
    half = thickness / 2
    corners = []
    for z, length, shift in ((base, foot, 0.0), (top, head, -lean)):
        for dx, dy in ((-0.5, -1), (0.5, -1), (0.5, 1), (-0.5, 1)):
            corners.append(Vector((x + shift + dx * length, y + dy * half, z)))
    for side in (1, -1):
        car.model.absorb(hexahedron([Vector((c.x, side * c.y, c.z)) for c in corners], material))


def f1(name, paint, wheel="five", lm=False, gtr=False, **look):
    car = Coach(name, wheel, **look)
    tip, tail = car.nose_x, car.stern_x
    track = lm or gtr
    if track:
        car.nose_x -= 0.03
        car.stern_x += 0.048 if lm else 0.08
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    ground = car.sheet.clearance
    rear_lift = 0.13
    car.tail_floor = ground + rear_lift
    drop = 0.03 if gtr else (0.012 if lm else 0.0)
    car.skin(
        half=[(stern, 0.92), (-axle, 0.985), (-0.4, 0.97), (0.4, 0.965), (axle, 0.98), (nose - 0.75, 0.95), (nose, 0.85)],
        shoulder=[
            (stern, 0.875 - drop),
            (-axle, 0.87 - drop),
            (-0.5, 0.815 - drop),
            (0.3, 0.76 - drop),
            (0.9, 0.73 - drop),
            (axle, 0.7 - drop),
            (axle + 0.25, 0.672 - drop),
            (nose - 0.5, 0.625 - drop),
            (nose - 0.25, 0.56 - drop),
            (nose - 0.08, 0.495 - drop),
            (nose, 0.46 - drop),
        ],
        waist=[(stern, 0.62), (-axle, 0.6), (-0.3, 0.5), (axle, 0.46), (nose, 0.37)],
        sill=[(stern, ground + 0.28), (-axle, ground + 0.15), (0.0, ground + 0.1), (axle, ground + 0.1), (nose, ground + 0.09)],
        crown=[(stern, 0.0), (-axle, -0.01), (0.3, 0.0), (1.1, -0.015), (axle, -0.045), (nose - 0.5, -0.05), (nose - 0.2, -0.015), (nose, 0.0)],
        flare=hips(car, 0.02, 0.028, step=(axle - 0.34, axle - 0.52, -0.7, 0.055)),
        keys=[nose - 0.75, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.1, 0.02, 0.006, 0.006, 0.06, 0.17), "bow": (0.1, 0.14, 0.16, 0.16, 0.14, 0.12), "flat": (0.62, 0.62, 0.6, 0.58, 0.5, 0.46), "power": 2.1},
        rear={"set": (0.2, 0.1, 0.05, 0.035, 0.012, 0.03), "bow": 0.05, "flat": 0.82, "power": 2.8},
        inset=0.06,
        shelf=0.08,
        flank=0.02,
        belly=0.004,
        tuck=0.11,
        rear_lift=rear_lift,
        sharp=(True, True, True, False, False),
        relief=lambda x, y: 0.02 * bump(x, stern, 0.25),
        paint=valance(car, reach=0.4),
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    intake = car.hollow(front, [(0.1, ground + 0.075), (0.58, ground + 0.085), (0.56, 0.34), (0.12, 0.33)], 0.08)
    intake.mesh(6, 3)
    if not gtr:
        car.disc(front, 0.84, 0.34, 0.034, "amber", bezel="trim_black", depth=0.014)
    pod = rounded([(nose - 0.3, 0.36), (nose - 0.36, 0.58), (nose - 0.48, 0.72), (nose - 0.68, 0.74), (nose - 0.64, 0.52), (nose - 0.54, 0.36)])
    car.headlamp(top, pod, projectors=[(nose - 0.44, 0.47, 0.046), (nose - 0.53, 0.63, 0.042)])
    reach = nose - 0.86 if track else nose - 0.8
    outlet = car.hollow(top, [(nose - 0.62, 0.1), (nose - 0.64, 0.38), (reach, 0.4), (reach, 0.1)], 0.05)
    outlet.bars(3 if track else 2, axis=0, share=0.14, material="carbon" if track else "trim_black")
    if track:
        louvre = car.hollow(top, [(axle + 0.2, 0.56), (axle + 0.2, 0.71), (axle - 0.14, 0.73), (axle - 0.14, 0.56)], 0.03)
        louvre.bars(4, axis=0, share=0.3, material="carbon", sink=0.0)
    if not gtr:
        car.patch(front, [(-0.26, 0.35 - drop), (0.26, 0.35 - drop), (0.26, 0.46 - drop), (-0.26, 0.46 - drop)], "plate", lift=0.004, mirror=False)

    vent = car.hollow(side, [(axle - 0.41, 0.3), (axle - 0.5, 0.3), (axle - 0.52, 0.6), (axle - 0.43, 0.62)], 0.07, material="body")
    vent.fill("grille", sink=0.92)
    duct = car.hollow(side, [(-0.3, 0.33), (-0.9, 0.29), (-0.93, 0.5), (-0.66, 0.47)], 0.08, material="body")
    car.patch(side, [(-0.7, 0.31), (-0.9, 0.3), (-0.92, 0.49), (-0.74, 0.47)], "grille", lift=-0.075)

    panel = car.hollow(back, [(-0.78, 0.6), (0.78, 0.6), (0.8, 0.8), (-0.8, 0.8)], 0.035, mirror=False)
    panel.mesh(26, 5, sink=0.6)
    lamps = round_tail(car, [(0.64, 0.7), (0.46, 0.7)], 0.066, depth=0.03, sunk=False)
    if not gtr:
        car.patch(back, [(-0.26, 0.645), (0.26, 0.645), (0.26, 0.755), (-0.26, 0.755)], "plate", lift=-0.02, mirror=False)
    car.hollow(back, rounded([(-0.25, 0.36), (0.25, 0.36), (0.25, 0.52), (-0.25, 0.52)], 1), 0.1, material="trim_black", mirror=False)

    car.arches(0.036, inner=0.09)
    car.cut()
    car.arch_lips(width=0.018, proud=0.005)
    lamps()
    tips(car, (0.15, 0.05, -0.05, -0.15), 0.44, 0.038)
    strakes(car, 6, 1.1, height=0.11)
    if track:
        car.lip(tip - 0.14, ground + 0.012, 1.62, depth=0.26, thickness=0.02, material="carbon", sweep_back=0.26)

    car.seams([0.86, -0.1])
    car.stroke((axle - 0.52, 0.375), (-axle + 0.44, 0.415), side, steps=14)
    car.bonnet(1.14, 0.5, front=nose - 0.3)
    car.mirrors(0.84, size=(0.08, 0.14, 0.08), reach=0.06, lift=0.08)

    peak = car.height - 0.05
    lid = car.lid
    car.lid = lambda x, y: lid(x, y) - 0.03 * min(1.0, max(0.0, (-0.8 - x) / 0.4))
    glass = car.cabin(
        screen=(1.22, 0.5),
        back=(-0.75, stern + 0.22),
        roof=[(-0.75, peak - 0.075), (-0.3, peak - 0.025), (0.0, peak - 0.004), (0.2, peak), (0.38, peak - 0.012), (0.5, peak - 0.04)],
        windows=[((0.86, 0.42), (-0.06, -0.1)), ((-0.13, -0.16), (-0.6, -0.46))],
        base=[(-0.6, 0.67), (0.3, 0.74), (1.22, 0.7)],
        rail=[(-0.75, 0.42), (0.1, 0.52), (0.5, 0.49)],
        bow=(0.28, 0.05),
        rail_bow=(0.12, 0.04),
        flat=(0.84, 0.66),
        power=(2.2, 2.4),
        bulge=0.025,
        glass_rear=False,
        fit=False,
    )
    car.lid = lid
    rest = Vector((0.012, 0, 0.014))
    pivot = glass.position(1.1, 0) + rest
    car.model.absorb(bar(pivot, glass.position(1.36, 3) + rest, 0.022, 0.012, "trim_black", up=Vector((0.5, 0, 1))))
    car.model.absorb(cylinder(pivot - rest * 1.5, pivot + rest, 0.016, "trim_black", segments=8))
    rings = []
    for x, half, tall in ((0.46, 0.11, 0.05), (0.26, 0.12, 0.055), (-0.2, 0.115, 0.045), (-0.8, 0.1, 0.035), (-1.4, 0.08, 0.022), (stern + 0.3, 0.06, 0.01)):
        rings.append(superellipse((x, 0, top(x, 0)[0].z - 0.004), half, tall, power=2.6, count=14, squash=0.3))
    car.model.absorb(loft(rings, "body"))
    car.model.absorb(box((0.462, 0, top(0.47, 0)[0].z + 0.02), (0.012, 0.17, 0.045), "grille", bevel=0.01))
    for n in range(5):
        x = -0.86 - n * 0.15
        span = 0.4 - n * 0.02
        car.patch(top, [(x, 0.15), (x, span), (x - 0.075, span), (x - 0.075, 0.15)], "grille", lift=0.003)
        car.patch(top, [(x + 0.012, 0.14), (x + 0.012, span + 0.01), (x - 0.04, span + 0.01), (x - 0.04, 0.14)], "body", lift=0.016, thickness=0.014)
    if lm:
        car.wing(tail + 0.16, peak - 0.06, 1.62, chord=0.3, thickness=0.034, angle=8, material="carbon", plates=(0.2, 0.32))
        upright(car, tail + 0.24, 0.56, peak - 0.07)
    if gtr:
        car.wing(tail + 0.19, car.height - 0.09, 1.66, chord=0.34, thickness=0.036, angle=10, material="carbon", plates=(0.2, 0.38), gurney=0.016)
        upright(car, tail + 0.3, 0.36, car.height - 0.1, foot=0.3)
        car.patch(side, ellipse((0.36, 0.5), (0.17, 0.17), 16), "livery", lift=0.005)
        car.patch(top, ellipse((nose - 0.34, 0.0), (0.13, 0.15), 16), "livery", lift=0.005, mirror=False)
    floor = car.lid(0.3, 0) + 0.004
    seat(car, 0.3, 0.0, floor)
    if not gtr:
        for y in (0.36, -0.36):
            seat(car, -0.02, y, floor, height=0.11, width=0.32)
    car.dashboard(0.82, floor, 1.2, 0.0, height=0.05)
    return car.finish(paint)


def road():
    return f1("mclaren-f1", "#8f9396")


def le_mans():
    return f1("mclaren-f1-lm", "#f27a14", lm=True, metal="rim_dark", barrel="rim_dark")


def racer():
    return f1("mclaren-f1-gtr", "#33363a", wheel="split", gtr=True, metal="rim_dark", barrel="rim_dark", nuts=0, cap="chrome", dish=0.05)


CARS = {"mclaren-f1": road, "mclaren-f1-lm": le_mans, "mclaren-f1-gtr": racer}
