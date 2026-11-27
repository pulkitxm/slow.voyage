from carkit import bar, bump
from kit import Coach
from mathutils import Vector


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def kink(car, window, low, high, length=0.26, rise=0.5):
    base_x, rail_x = window[1]

    def edge(share, push=0.0):
        return (base_x + (rail_x - base_x) * share + push, low + (high - low) * share)

    curve = [(base_x + length, low - 0.03), (base_x + length * 0.5, low + (high - low) * rise * 0.14), edge(rise * 0.5, length * 0.14), edge(rise)]
    car.patch(car.side, curve[::-1] + [(x + 0.02, z + 0.016) for x, z in curve], "trim_black", lift=0.004)
    car.patch(car.side, [(base_x - 0.06, low - 0.03), edge(rise, -0.06)] + curve[::-1], "body", lift=0.006)


def deck_lip(car, x, span, depth=0.09, thickness=0.02, material="carbon", sweep_back=0.035, lift=-0.004):
    z = car.top(x, 0.0)[0].z
    car.lip(x, z + thickness / 2 + lift, span, depth=depth, thickness=thickness, material=material, sweep_back=-sweep_back)


def flat_plate(car, rear, low, depth=0.0, half=0.26, tall=0.11):
    hit = (car.tail if rear else car.nose)(0.0, low + tall / 2)[0]
    way = -1 if rear else 1
    x = hit.x - way * depth
    normal = Vector((way, 0, 0))
    caster = lambda y, z: (Vector((x, y, z)), normal)
    if depth > 0:
        car.hollow(caster, rect(-half - 0.025, half + 0.025, low - 0.02, low + tall + 0.02), 0.002, material="body", mirror=False)
    car.patch(caster, rect(-half, half, low, low + tall), "plate", lift=0.004, mirror=False)


def sunk_lamp(car, caster, outline, strips, depth=0.024, lens="lens_tail"):
    car.hollow(caster, outline, depth, material="trim_black")

    def build():
        car.patch(caster, outline, lens, lift=-depth * 0.5, group="Taillights" if lens == "lens_tail" else "Body")
        for strip in strips:
            car.patch(caster, strip, "lens_ember", lift=-depth * 0.5 + 0.005, thickness=0.004, group="Taillights")
        car.patch(caster, outline, "cover", lift=0.001)

    return build


def quad_pipes(car, z, inner=0.3, gap=0.14, radius=0.05, length=0.16, proud=0.01):
    for y in (inner, inner + gap):
        x = car.tail(y, z)[0].x - proud
        car.pipes((y, -y), x, z, radius=radius, length=length)


def diffuser(car, half, low, high, pipes=(0.3, 0.44), depth=0.11, fins=3):
    back = car.back
    centre = car.hollow(back, [(-pipes[0] + 0.08, low), (pipes[0] - 0.08, low), (pipes[0] - 0.1, high - 0.02), (-pipes[0] + 0.1, high - 0.02)], depth * 0.6, material="grille", mirror=False)
    centre.bars(fins, material="trim_black", axis=0, share=0.12, sink=0.2, thickness=0.03)
    car.hollow(back, [(pipes[0] - 0.075, low), (half, low), (half - 0.06, high), (pipes[0] - 0.075, high)], depth, material="grille")


def three_series(name, coupe, paint, wheel):
    car = Coach(name, wheel, metal="rim_dark", lip="rim", cap="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    deck = 1.065 if not coupe else 1.045
    cowl = 0.84 if not coupe else 0.82

    def relief(x, y):
        dome = 0.018 * bump(y, 0.0, 0.4) * bump(x, 1.45, 0.66)
        groove = -0.012 * bump(abs(y), 0.38, 0.09) * bump(x, 1.5, 0.6)
        return dome + groove

    car.skin(
        half=[(stern, 0.85), (-axle, 0.9), (-0.45, 0.9), (0.45, 0.9), (axle, 0.908), (nose - 0.4, 0.895), (nose, 0.82)],
        shoulder=[(stern, deck - 0.02), (-1.95, deck), (-axle, 1.035), (-0.4, 0.995), (cowl, 0.975), (axle, 0.92), (nose - 0.3, 0.858), (nose, 0.808)],
        waist=[(stern, 0.8), (-axle, 0.83), (-0.4, 0.8), (0.6, 0.78), (axle, 0.775), (nose - 0.35, 0.7), (nose, 0.56)],
        sill=[(stern, 0.42), (-1.85, 0.3), (1.85, 0.3), (nose, 0.3)],
        crown=[(stern, 0.012), (-1.95, 0.02), (cowl, 0.03), (axle, 0.045), (nose, 0.03)],
        flare=(0.042, 0.05),
        keys=[nose - 0.4, axle, 0.45, -0.45, -axle, stern + 0.32],
        front={"set": (0.12, 0.04, 0.0, 0.0, 0.02, 0.085), "bow": 0.11, "flat": 0.64, "power": 2.6},
        rear={"set": (0.17, 0.06, 0.0, 0.0, 0.03, 0.08), "bow": 0.08, "flat": 0.7, "power": 2.6},
        inset=0.04,
        shelf=0.05,
        flank=0.014,
        relief=relief,
        cladding=1,
        margin=0.0,
        rear_lift=0.15,
        front_lift=0.03,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    kidney = car.hollow(front, [(0.018, 0.3), (0.2, 0.3), (0.255, 0.36), (0.335, 0.7), (0.3, 0.772), (0.018, 0.782)], 0.07)
    kidney.bars(8, share=0.34, sink=0.3, thickness=0.02)
    flat_plate(car, False, 0.37, depth=-0.012)
    car.headlamp(
        front,
        [(0.4, 0.682), (0.72, 0.664), (1.0, 0.704), (1.1, 0.787), (0.76, 0.802), (0.4, 0.784)],
        projectors=[(0.55, 0.738, 0.034), (0.8, 0.744, 0.034)],
        strips=[
            [(0.44, 0.694), (0.64, 0.688), (0.68, 0.737), (0.658, 0.737), (0.628, 0.704), (0.44, 0.71)],
            [(0.7, 0.692), (0.9, 0.704), (0.96, 0.754), (0.938, 0.754), (0.89, 0.719), (0.7, 0.708)],
        ],
        depth=0.05,
    )
    duct = car.hollow(front, [(0.45, 0.25), (0.92, 0.28), (0.97, 0.52), (0.56, 0.6), (0.4, 0.44)], 0.08)
    duct.mesh(5, 4)
    chin = car.hollow(front, [(-0.3, 0.2), (0.3, 0.2), (0.26, 0.265), (-0.26, 0.265)], 0.05, mirror=False)
    chin.bars(1, share=0.2, sink=0.2)

    lamps = sunk_lamp(
        car,
        back,
        [(0.34, 0.905), (0.78, 0.892), (1.08, 0.925), (1.15, 1.01), (0.74, 1.028), (0.34, 1.0)],
        [
            [(0.38, 0.968), (1.07, 0.976), (1.11, 1.002), (0.38, 0.99)],
            [(0.38, 0.968), (0.38, 0.922), (0.64, 0.914), (0.64, 0.932), (0.41, 0.938), (0.41, 0.968)],
        ],
    )
    flat_plate(car, True, 0.72, depth=0.02)
    diffuser(car, 0.66, 0.26, 0.45)
    car.hollow(back, [(0.84, 0.4), (0.9, 0.4), (0.93, 0.64), (0.87, 0.64)], 0.035)
    gill = car.hollow(car.side, [(0.98, 0.66), (0.6, 0.68), (0.6, 0.745), (0.92, 0.755)], 0.03)
    gill.bars(1, material="body", share=0.14, sink=0.1)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.034, proud=0.014, floor=0.31)
    lamps()
    quad_pipes(car, 0.35)
    car.lip(nose - 0.08, 0.138, 1.5, depth=0.12, thickness=0.02, sweep_back=0.12)
    deck_lip(car, stern + 0.14, 1.1)
    car.stroke((-0.8, 0.88), (0.8, 0.88), car.tail, steps=12, mirror=False)
    car.stroke((0.8, 0.88), (0.74, 0.66), car.tail, steps=6)

    if coupe:
        car.seams([0.6, -0.62])
        car.grips([-0.46])
    else:
        car.seams([0.62, -0.4])
        car.stroke((-1.22, 1.01), (-1.22, 0.88), car.side, steps=6)
        car.stroke((-1.22, 0.88), (-1.02, 0.72), car.side, steps=6)
        car.grips([-0.24, -1.06])
    car.bonnet(cowl + 0.04, 0.76, front=nose - 0.12)
    car.mirrors(cowl - 0.24)

    if coupe:
        windows = [((0.54, -0.14), (-0.58, -0.62)), ((-0.64, -0.68), (-1.34, -0.96))]
        glass = car.cabin(
            screen=(cowl, -0.02),
            back=(-1.06, -2.02),
            roof=[(-1.06, 1.3), (-0.75, 1.365), (-0.4, 1.393), (-0.02, 1.35)],
            windows=windows,
            base_inset=0.075,
            tumble=0.17,
            drop=0.045,
            bow=(0.16, 0.07),
            rail_bow=(0.07, 0.04),
            flat=(0.86, 0.88),
            power=(2.2, 3.2),
            bulge=0.024,
            roof_material="carbon",
        )
        kink(car, windows[-1], car.shoulder_at(windows[-1][1][0]), 1.3)
        car.interior(seat=-0.2, rear_bench=-1.0)
    else:
        windows = [((0.56, -0.04), (-0.36, -0.4)), ((-0.44, -0.48), (-1.5, -1.08))]
        glass = car.cabin(
            screen=(cowl, 0.08),
            back=(-1.22, -2.02),
            roof=[(-1.22, 1.345), (-0.8, 1.412), (-0.3, 1.433), (0.08, 1.388)],
            windows=windows,
            base_inset=0.075,
            tumble=0.16,
            drop=0.045,
            bow=(0.16, 0.06),
            rail_bow=(0.07, 0.04),
            flat=(0.86, 0.88),
            power=(2.2, 3.2),
            bulge=0.024,
            roof_material="carbon",
        )
        kink(car, windows[-1], car.shoulder_at(windows[-1][1][0]), 1.37)
        car.interior(seat=-0.12, rear_bench=-1.0)
    car.wipers(glass)
    return car.finish(paint)


def m2():
    car = Coach("bmw-m2", "star", metal="rim_dark", lip="rim", cap="rim_dark", twin=0.24)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle

    def relief(x, y):
        return 0.02 * bump(y, 0.0, 0.5) * bump(x, 1.4, 0.66)

    car.skin(
        half=[(stern, 0.86), (-axle, 0.885), (-0.45, 0.885), (0.45, 0.885), (axle, 0.89), (nose - 0.34, 0.885), (nose, 0.84)],
        shoulder=[(stern, 1.045), (-1.85, 1.065), (-axle, 1.045), (-0.4, 1.0), (0.8, 0.98), (axle, 0.935), (nose - 0.28, 0.87), (nose, 0.822)],
        waist=[(stern, 0.82), (-axle, 0.83), (-0.4, 0.8), (0.6, 0.78), (axle, 0.78), (nose - 0.3, 0.7), (nose, 0.57)],
        sill=[(stern, 0.42), (-1.8, 0.3), (1.8, 0.3), (nose, 0.31)],
        crown=[(stern, 0.012), (-1.85, 0.02), (0.8, 0.03), (axle, 0.045), (nose, 0.025)],
        flare=(0.056, 0.062),
        keys=[nose - 0.34, axle, 0.45, -0.45, -axle, stern + 0.28],
        front={"set": (0.1, 0.03, 0.0, 0.0, 0.02, 0.08), "bow": 0.08, "flat": 0.72, "power": 3.2},
        rear={"set": (0.14, 0.04, 0.0, 0.0, 0.025, 0.075), "bow": 0.06, "flat": 0.78, "power": 3.2},
        inset=0.04,
        shelf=0.05,
        flank=0.014,
        relief=relief,
        cladding=1,
        margin=0.0,
        rear_lift=0.15,
        front_lift=0.03,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    kidney = car.hollow(front, [(0.025, 0.61), (0.4, 0.61), (0.47, 0.67), (0.43, 0.765), (0.025, 0.78)], 0.06)
    kidney.bars(4, share=0.3, sink=0.3, thickness=0.02)
    car.headlamp(
        front,
        [(0.53, 0.675), (0.84, 0.672), (1.04, 0.71), (1.12, 0.79), (0.8, 0.81), (0.51, 0.795)],
        projectors=[(0.66, 0.74, 0.036)],
        strips=[
            [(0.58, 0.712), (0.6, 0.694), (0.72, 0.694), (0.74, 0.712), (0.74, 0.754), (0.722, 0.754), (0.722, 0.718), (0.71, 0.708), (0.61, 0.708), (0.598, 0.718), (0.598, 0.754), (0.58, 0.754)],
            [(0.82, 0.702), (0.98, 0.717), (1.04, 0.764), (1.02, 0.768), (0.965, 0.732), (0.82, 0.718)],
        ],
        depth=0.05,
    )
    mouth = car.hollow(front, rect(-0.4, 0.4, 0.24, 0.53), 0.08, mirror=False)
    mouth.mesh(9, 4)
    duct = car.hollow(front, [(0.5, 0.24), (0.92, 0.24), (0.96, 0.57), (0.5, 0.57)], 0.09)
    duct.bars(1, material="body", axis=0, share=0.07, sink=0.15)
    flat_plate(car, False, 0.4, depth=-0.012)

    lamps = sunk_lamp(
        car,
        back,
        [(0.38, 0.915), (0.8, 0.905), (1.06, 0.935), (1.11, 1.01), (0.76, 1.028), (0.38, 1.0)],
        [
            [(0.42, 0.968), (1.04, 0.976), (1.075, 1.0), (0.42, 0.99)],
            [(0.42, 0.968), (0.42, 0.93), (0.66, 0.922), (0.66, 0.94), (0.45, 0.944), (0.45, 0.968)],
        ],
    )
    flat_plate(car, True, 0.7, depth=0.02)
    pod = car.hollow(back, [(0.74, 0.34), (0.95, 0.34), (0.95, 0.68), (0.74, 0.68)], 0.05)
    pod.bars(1, material="lens_tail", axis=0, share=0.22, sink=0.3, thickness=0.01)
    diffuser(car, 0.56, 0.26, 0.46, pipes=(0.17, 0.31), fins=2)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.04, proud=0.018, floor=0.31)
    lamps()
    quad_pipes(car, 0.355, inner=0.17, gap=0.14)
    car.lip(nose - 0.075, 0.14, 1.56, depth=0.12, thickness=0.02, sweep_back=0.07)
    deck_lip(car, stern + 0.12, 1.16)
    car.stroke((-0.8, 0.89), (0.8, 0.89), car.tail, steps=12, mirror=False)
    car.stroke((0.8, 0.89), (0.72, 0.68), car.tail, steps=6)
    car.seams([0.58, -0.6])
    car.grips([-0.44])
    car.bonnet(0.84, 0.76, front=nose - 0.11)
    car.mirrors(0.56)

    windows = [((0.5, -0.16), (-0.54, -0.58)), ((-0.6, -0.64), (-1.28, -0.98))]
    glass = car.cabin(
        screen=(0.78, -0.04),
        back=(-1.1, -1.92),
        roof=[(-1.1, 1.32), (-0.8, 1.375), (-0.42, 1.403), (-0.04, 1.362)],
        windows=windows,
        base_inset=0.085,
        tumble=0.16,
        drop=0.045,
        bow=(0.15, 0.06),
        rail_bow=(0.07, 0.04),
        flat=(0.86, 0.88),
        power=(2.2, 3.2),
        bulge=0.024,
    )
    kink(car, windows[-1], car.shoulder_at(windows[-1][1][0]), 1.31)
    car.wipers(glass)
    car.interior(seat=-0.22, rear_bench=-0.98)
    return car.finish("#5b9bd1")


def roof_rails(car, front, back, y, steps=6):
    points = []
    for n in range(steps + 1):
        x = front + (back - front) * n / steps
        hit = car.top(x, y)[0]
        points.append((x, y, hit.z + 0.03))
    for a, b in zip(points, points[1:]):
        car.model.add(bar(a, b, 0.03, 0.025, "trim_black"))
    for point in (points[0], points[len(points) // 2], points[-1]):
        car.model.add(bar((point[0], y, point[2] - 0.035), point, 0.05, 0.02, "trim_black", up=(1, 0, 0)))


def sport_utility(name, coupe, paint):
    car = Coach(name, "star", metal="rim_dark", lip="rim", cap="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    tail = 1.22 if coupe else 1.17

    def relief(x, y):
        return 0.02 * bump(y, 0.0, 0.5) * bump(x, 1.6, 0.8)

    car.skin(
        half=[(stern, 0.86), (-axle, 0.905), (-0.45, 0.905), (0.45, 0.905), (axle, 0.91), (nose - 0.38, 0.895), (nose, 0.83)],
        shoulder=[(stern, tail), (-axle, 1.185), (-0.4, 1.14), (0.98, 1.115), (axle, 1.075), (nose - 0.3, 1.015), (nose, 0.975)],
        waist=[(stern, 0.93), (-axle, 0.94), (-0.4, 0.91), (0.6, 0.89), (axle, 0.9), (nose - 0.3, 0.85), (nose, 0.72)],
        sill=[(stern, 0.52), (-1.85, 0.4), (1.85, 0.4), (nose, 0.42)],
        crown=[(stern, 0.01), (0.98, 0.03), (axle, 0.05), (nose, 0.03)],
        flare=(0.036, 0.04),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.13, 0.045, 0.0, 0.0, 0.02, 0.075), "bow": 0.11, "flat": 0.66, "power": 2.6},
        rear={"set": (0.15, 0.05, 0.0, 0.0, 0.05, 0.14) if coupe else (0.15, 0.05, 0.0, 0.0, 0.03, 0.08), "bow": 0.08, "flat": 0.74, "power": 2.6},
        inset=0.04,
        shelf=0.05,
        flank=0.014,
        relief=relief,
        cladding=1,
        margin=0.0,
        rear_lift=0.17,
        front_lift=0.05,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    kidney = car.hollow(front, [(0.02, 0.71), (0.3, 0.71), (0.41, 0.81), (0.41, 0.915), (0.34, 0.96), (0.02, 0.966)], 0.06)
    kidney.bars(7, axis=0, share=0.3, sink=0.3, thickness=0.02)
    car.headlamp(
        front,
        [(0.47, 0.855), (0.76, 0.845), (1.0, 0.875), (1.1, 0.955), (0.78, 0.982), (0.47, 0.968)],
        projectors=[(0.6, 0.915, 0.036), (0.82, 0.92, 0.036)],
        strips=[
            [(0.5, 0.868), (0.68, 0.864), (0.715, 0.908), (0.695, 0.908), (0.668, 0.88), (0.5, 0.884)],
            [(0.74, 0.868), (0.92, 0.878), (0.975, 0.926), (0.955, 0.928), (0.91, 0.894), (0.74, 0.884)],
        ],
        depth=0.05,
    )
    mouth = car.hollow(front, [(-0.46, 0.34), (0.46, 0.34), (0.4, 0.5), (-0.4, 0.5)], 0.08, mirror=False)
    mouth.mesh(9, 3)
    duct = car.hollow(front, [(0.56, 0.36), (0.95, 0.39), (0.99, 0.66), (0.6, 0.72), (0.5, 0.6)], 0.09)
    duct.mesh(4, 4)
    flat_plate(car, False, 0.56, depth=-0.012)

    if coupe:
        lamps = sunk_lamp(
            car,
            back,
            [(0.3, 1.045), (0.8, 1.04), (1.12, 1.07), (1.17, 1.14), (0.78, 1.146), (0.3, 1.12)],
            [[(0.34, 1.08), (1.1, 1.096), (1.13, 1.122), (0.34, 1.104)]],
        )
        flat_plate(car, True, 0.62, depth=0.02)
    else:
        lamps = sunk_lamp(
            car,
            back,
            [(0.4, 0.975), (0.8, 0.965), (1.1, 0.995), (1.17, 1.12), (0.8, 1.14), (0.4, 1.11)],
            [
                [(0.44, 1.07), (1.1, 1.08), (1.13, 1.107), (0.44, 1.095)],
                [(0.44, 1.07), (0.44, 0.997), (0.72, 0.987), (0.72, 1.007), (0.47, 1.015), (0.47, 1.07)],
            ],
        )
        flat_plate(car, True, 0.86, depth=0.02)
    diffuser(car, 0.68, 0.32, 0.52, pipes=(0.32, 0.46))
    car.patch(back, rect(0.5, 0.92, 0.6, 0.632), "lens_tail", lift=0.005, thickness=0.004)
    gill = car.hollow(car.side, [(1.0, 0.86), (0.66, 0.88), (0.66, 0.94), (0.95, 0.95)], 0.03)
    gill.bars(1, material="body", share=0.14, sink=0.1)

    car.arches(0.055)
    car.cut()
    car.arch_lips(width=0.036, proud=0.014, floor=0.41)
    lamps()
    quad_pipes(car, 0.42, inner=0.32, gap=0.14, radius=0.048)
    car.lip(nose - 0.08, 0.225, 1.46, depth=0.1, thickness=0.02, sweep_back=0.1)
    if coupe:
        deck_lip(car, stern + 0.17, 1.3, depth=0.1, material="body")
    car.stroke((-0.82, 0.8), (0.82, 0.8), car.tail, steps=12, mirror=False)
    car.stroke((0.82, 0.8), (0.86, 1.0), car.tail, steps=6)
    car.seams([0.7, -0.38])
    car.stroke((-1.22, tail - 0.05), (-1.22, 1.02), car.side, steps=6)
    car.stroke((-1.22, 1.02), (-1.02, 0.86), car.side, steps=6)
    car.grips([-0.2, -1.04])
    car.bonnet(1.02, 0.76, front=nose - 0.11)
    car.mirrors(0.74)

    if coupe:
        windows = [((0.7, 0.1), (-0.34, -0.38)), ((-0.42, -0.46), (-1.26, -0.98)), ((-1.34, -1.06), (-1.84, -1.2))]
        glass = car.cabin(
            screen=(1.0, 0.22),
            back=(-1.3, -2.24),
            roof=[(-1.3, 1.47), (-0.9, 1.565), (-0.4, 1.612), (0.0, 1.62), (0.22, 1.585)],
            windows=windows,
            base_inset=0.08,
            tumble=0.17,
            drop=0.05,
            bow=(0.15, 0.06),
            rail_bow=(0.07, 0.04),
            flat=(0.86, 0.88),
            power=(2.2, 3.0),
            bulge=0.024,
        )
        kink(car, windows[-1], car.shoulder_at(windows[-1][1][0]), 1.44, length=0.3, rise=0.62)
    else:
        windows = [((0.7, 0.14), (-0.34, -0.38)), ((-0.42, -0.46), (-1.3, -1.18)), ((-1.38, -1.26), (-2.0, -1.62))]
        glass = car.cabin(
            screen=(1.0, 0.26),
            back=(-1.8, -2.28),
            roof=[(-1.8, 1.585), (-1.2, 1.645), (-0.3, 1.669), (0.26, 1.63)],
            windows=windows,
            base_inset=0.08,
            tumble=0.16,
            drop=0.05,
            bow=(0.15, 0.05),
            rail_bow=(0.07, 0.04),
            flat=(0.86, 0.9),
            power=(2.2, 3.4),
            bulge=0.024,
        )
        kink(car, windows[-1], car.shoulder_at(windows[-1][1][0]), 1.55, length=0.22, rise=0.55)
        roof_rails(car, 0.0, -1.55, 0.56)
        car.lip(-1.86, car.roof(-1.8, 0.0) - 0.012, 1.1, depth=0.2, thickness=0.024, material="body", sweep_back=0.02)
    car.wipers(glass)
    car.interior(seat=0.0, rear_bench=-0.95)
    return car.finish(paint)


def m3():
    return three_series("bmw-m3", False, "#0f4a36", "star")


def m4():
    return three_series("bmw-m4", True, "#d4c81c", "split")


def x3_m():
    return sport_utility("bmw-x3-m", False, "#a3201c")


def x4_m():
    return sport_utility("bmw-x4-m", True, "#0e6aa8")


CARS = {"bmw-m3": m3, "bmw-m4": m4, "bmw-m2": m2, "bmw-x3-m": x3_m, "bmw-x4-m": x4_m}
