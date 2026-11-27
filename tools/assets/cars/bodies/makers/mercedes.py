from carkit import bump
from mathutils import Vector
from kit import Coach, ellipse, grow, loft


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def deck_lip(car, x, span, depth=0.08, thickness=0.018, material="body", sweep_back=0.03, lift=0.006):
    z = car.top(x, 0.0)[0].z
    car.lip(x, z + thickness / 2 + lift, span, depth=depth, thickness=thickness, material=material, sweep_back=-sweep_back)


def power_domes(spread, width, height, centre, reach):
    def relief(x, y):
        return height * bump(abs(y), spread, width) * bump(x, centre, reach)

    return relief


def badge(car, outline, radius):
    low = min(z for _, z in outline)
    high = max(z for _, z in outline)
    centre = (0.0, (low + high) / 2)
    ring(car, car.front, centre, radius, radius * 0.2)
    car.patch(car.front, ellipse(centre, (radius * 0.34, radius * 0.34), 10), "chrome", lift=0.005, thickness=0.004, mirror=False)


def slat_grille(car, outline, slats, depth=0.05, emblem=0.07):
    grille = car.hollow(car.front, outline, depth, mirror=False)
    grille.bars(slats, material="chrome", axis=0, share=0.22, sink=0.25, thickness=0.01)
    badge(car, outline, emblem)
    return grille


def blade_grille(car, outline, depth=0.05, emblem=0.075):
    grille = car.hollow(car.front, outline, depth, mirror=False)
    grille.bars(2, material="chrome", share=0.22, sink=0.25, thickness=0.012)
    badge(car, outline, emblem)
    return grille


def quad_pipes(car, z, inner=0.34, gap=0.14, radius=0.05, length=0.16, proud=0.01):
    for y in (inner, inner + gap):
        x = car.tail(y, z)[0].x - proud
        car.pipes((y, -y), x, z, radius=radius, length=length)


def diffuser(car, half, low, high, inner=0.34, depth=0.11, fins=4):
    centre = car.hollow(car.back, [(-inner + 0.08, low), (inner - 0.08, low), (inner - 0.1, high - 0.02), (-inner + 0.1, high - 0.02)], depth * 0.6, material="grille", mirror=False)
    centre.bars(fins, material="trim_black", axis=0, share=0.12, sink=0.2, thickness=0.03)
    car.hollow(car.back, [(inner - 0.075, low), (half, low), (half - 0.06, high), (inner - 0.075, high)], depth, material="grille")


def upright(car, x, y, top, foot=0.34, chord=0.17, thick=0.018, sweep=0.1, material="carbon"):
    base = car.top(x, y)[0].z - 0.03
    sections = []
    for share in (0.0, 0.35, 0.7, 1.0):
        z = base + (top - base) * share
        length = foot + (chord - foot) * share**0.7
        centre = x + sweep * (1 - share) ** 2
        half = thick / 2 * (1.0 if share < 1 else 0.8)
        sections.append([(centre + length / 2, y - half, z), (centre + length / 2, y + half, z), (centre - length / 2, y + half, z), (centre - length / 2, y - half, z)])
    car.model.add(loft(sections, material, smooth=False))


def hatch_glass(car, front, back, half_front, half_back, corner=0.09):
    count = 6
    left = [(front + (back - front) * n / count, half_front + (half_back - half_front) * n / count) for n in range(count + 1)]
    left[0] = (front - corner, half_front)
    left[-1] = (back + corner, half_back)
    outline = [(front, half_front - corner)] + left + [(back, half_back - corner)]
    outline += [(x, -y) for x, y in outline[::-1]]
    car.patch(car.top, grow(outline, 0.016), "trim_black", lift=0.003, mirror=False, step=0.08)
    car.patch(car.top, outline, "glass", lift=0.006, mirror=False, step=0.08)


def flat_plate(car, rear, low, depth=0.0, half=0.26, tall=0.11):
    hit = (car.tail if rear else car.nose)(0.0, low + tall / 2)[0]
    way = -1 if rear else 1
    x = hit.x - way * depth
    normal = Vector((way, 0, 0))
    caster = lambda y, z: (Vector((x, y, z)), normal)
    if depth > 0:
        car.hollow(caster, rect(-half - 0.025, half + 0.025, low - 0.02, low + tall + 0.02), 0.002, material="body", mirror=False)
    car.patch(caster, rect(-half, half, low, low + tall), "plate", lift=0.004, mirror=False)


def sunk_lamp(car, caster, outline, strips, depth=0.024):
    car.hollow(caster, outline, depth, material="trim_black")

    def build():
        car.patch(caster, outline, "lens_tail", lift=-depth * 0.5, group="Taillights")
        for strip in strips:
            car.patch(caster, strip, "lens_ember", lift=-depth * 0.5 + 0.005, thickness=0.004, group="Taillights")
        car.patch(caster, outline, "cover", lift=0.001)

    return build


def ring(car, caster, centre, radius, width, material="chrome", lift=0.005):
    for start in (0, 180):
        outer = ellipse(centre, (radius, radius), 9, start, start + 180)
        inner = ellipse(centre, (radius - width, radius - width), 9, start, start + 180)
        car.patch(caster, outer + inner[::-1], material, lift=lift, thickness=0.004, mirror=False)


def seated_pipe(car, y, z, radius, length=0.16, material="chrome", proud=0.012):
    spots = (y,) if abs(y) < 1e-6 else (y, -y)
    x = car.tail(abs(y), z)[0].x - proud
    car.pipes(spots, x, z, radius=radius, length=length, material=material)


def amg_gt(name, track, paint):
    wheel = dict(metal="rim_dark", lip="rim", cap="rim_dark", twin=0.17) if track else dict(metal="rim", barrel="rim_dark", cap="rim_dark")
    car = Coach(name, "star" if track else "ten", **wheel)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    flare = (0.045, 0.055) if track else (0.036, 0.046)
    hips = 0.95 if track else 0.925
    brow = (0.95 if track else 0.935) - (0.008 if track else 0.0)
    door = 0.925 if track else 0.9

    def bonnet(x, y):
        dome = 0.02 * bump(abs(y), 0.27, 0.12) * bump(x, 1.15, 1.0)
        wing = 0.022 * bump(abs(y), 0.82, 0.22) * bump(x, axle + 0.05, 0.8)
        return dome + wing

    car.skin(
        half=[(stern, 0.8), (-1.95, 0.9), (-axle, hips), (-0.45, door), (0.45, door), (axle, brow), (nose - 0.5, 0.925 if track else 0.905), (nose, 0.8)],
        shoulder=[(stern, 0.875), (-2.0, 0.935), (-axle, 0.995), (-0.8, 0.975), (0.1, 0.93), (0.5, 0.91), (axle, 0.84), (nose - 0.4, 0.765), (nose, 0.675)],
        waist=[(stern, 0.6), (-axle, 0.8), (-0.6, 0.66), (0.4, 0.64), (axle, 0.755), (nose - 0.4, 0.6), (nose, 0.5)],
        sill=[(stern, 0.4), (-axle, 0.27), (0.0, 0.23), (axle, 0.23), (nose, 0.24)],
        crown=[(stern, 0.0), (-1.9, -0.012), (-1.3, -0.02), (-0.7, 0.0), (0.3, 0.03), (axle, 0.04), (nose, 0.022)],
        flare=flare,
        keys=[nose - 0.5, axle, 0.45, -0.45, -axle, stern + 0.5],
        front={"set": (0.1, 0.035, 0.0, 0.0, 0.035, 0.12), "bow": 0.13, "flat": 0.56, "power": 2.3},
        rear={"set": (0.2, 0.1, 0.02, 0.0, 0.07, 0.2), "bow": 0.13, "flat": 0.5, "power": 2.1},
        inset=0.06,
        shelf=0.075,
        flank=0.022,
        belly=0.01,
        relief=bonnet,
        margin=0.0,
        rear_lift=0.13,
        front_lift=0.03,
        cladding=1 if track else 0,
        cladding_material="carbon",
        sharp=(True, True, False, False, False),
    )
    front, back = car.front, car.back

    slat_grille(car, [(-0.42, 0.3), (0.42, 0.3), (0.455, 0.34), (0.36, 0.535), (0.32, 0.558), (-0.32, 0.558), (-0.36, 0.535), (-0.455, 0.34)], 15, depth=0.07)
    if track:
        duct = car.hollow(front, [(0.57, 0.22), (0.98, 0.25), (1.0, 0.45), (0.6, 0.47)], 0.09)
        duct.bars(3, material="trim_black", axis=0, share=0.1, sink=0.1)
        chin = car.hollow(front, [(-0.44, 0.19), (0.44, 0.19), (0.44, 0.255), (-0.44, 0.255)], 0.05, mirror=False)
        chin.bars(1, material="trim_black", share=0.2, sink=0.2)
    else:
        duct = car.hollow(front, [(0.58, 0.25), (0.96, 0.28), (0.95, 0.42), (0.6, 0.44)], 0.08)
        duct.bars(1, material="chrome", share=0.12, sink=0.2)
    car.headlamp(
        front,
        [(0.5, 0.57), (0.62, 0.548), (0.8, 0.565), (1.0, 0.63), (1.22, 0.745), (1.02, 0.742), (0.78, 0.71), (0.56, 0.665), (0.49, 0.62)],
        projectors=[(0.64, 0.608, 0.036), (0.8, 0.638, 0.03)],
        strips=[[(0.56, 0.648), (0.78, 0.692), (1.02, 0.726), (1.16, 0.735), (1.02, 0.706), (0.78, 0.67), (0.57, 0.63)]],
        depth=0.05,
    )
    vent = car.hollow(car.side, [(0.9, 0.6), (0.5, 0.63), (0.5, 0.735), (0.86, 0.745)], 0.04)
    vent.bars(1 if not track else 2, material="chrome" if not track else "body", share=0.16, sink=0.1)

    lamps = sunk_lamp(
        car,
        back,
        [(0.2, 0.79), (0.6, 0.78), (0.95, 0.79), (1.16, 0.832), (0.95, 0.856), (0.6, 0.853), (0.2, 0.84)],
        [[(0.22, 0.802), (0.6, 0.792), (0.95, 0.803), (1.13, 0.833), (0.95, 0.846), (0.6, 0.842), (0.22, 0.83)]],
    )
    flat_plate(car, True, 0.615, depth=0.03)
    flat_plate(car, False, 0.31, depth=-0.012)
    if track:
        car.hollow(back, [(-0.2, 0.25), (0.2, 0.25), (0.16, 0.44), (-0.16, 0.44)], 0.14, material="grille", mirror=False)
        outlet = car.hollow(back, [(0.28, 0.25), (0.7, 0.25), (0.62, 0.41), (0.28, 0.41)], 0.1, material="grille")
        outlet.bars(4, material="trim_black", axis=0, share=0.1, sink=0.3, thickness=0.03)
        car.hollow(back, [(0.86, 0.34), (0.92, 0.34), (0.95, 0.58), (0.89, 0.58)], 0.04)
    else:
        outlet = car.hollow(back, [(0.36, 0.25), (0.72, 0.25), (0.66, 0.41), (0.36, 0.41)], 0.1, material="grille")
        centre = car.hollow(back, [(-0.3, 0.25), (0.3, 0.25), (0.3, 0.38), (-0.3, 0.38)], 0.06, material="grille", mirror=False)
        centre.bars(5, material="trim_black", axis=0, share=0.1, sink=0.2, thickness=0.03)

    car.arches(0.045, inner=0.09)
    car.cut()
    car.arch_lips(width=0.026, proud=0.012)
    lamps()
    ring(car, back, (0.0, 0.815), 0.05, 0.012)
    if track:
        seated_pipe(car, 0.0, 0.34, 0.08, length=0.2)
        seated_pipe(car, 0.46, 0.325, 0.04, length=0.14, material="trim_black")
        car.lip(nose - 0.1, 0.136, 1.7, depth=0.16, thickness=0.02, material="carbon", sweep_back=0.16)
        car.wing(stern + 0.3, 1.125, 1.6, chord=0.3, thickness=0.05, angle=6, material="carbon", plates=(0.13, 0.34), plate_material="carbon", gurney=0.012)
        upright(car, stern + 0.3, 0.44, 1.115, foot=0.22, chord=0.13, sweep=0.06)
    else:
        seated_pipe(car, 0.54, 0.33, 0.058, length=0.16)
        car.lip(nose - 0.09, 0.136, 1.5, depth=0.1, thickness=0.018, sweep_back=0.16)

    car.seams([0.42, -0.82])
    car.grips([-0.62])
    car.bonnet(0.34, 0.72, front=nose - 0.2)
    car.mirrors(0.02, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.06)

    glass = car.cabin(
        screen=(0.32, -0.36),
        back=(-1.5, -2.03),
        roof=[(-1.5, 1.09), (-1.25, 1.18), (-0.95, 1.25), (-0.62, 1.288), (-0.36, 1.25)],
        windows=[((0.06, -0.44), (-1.0, -0.62))],
        base=[(-2.05, 0.54), (-1.3, 0.72), (-0.5, 0.79), (0.32, 0.76)],
        rail=[(-1.5, 0.46), (-0.95, 0.54), (-0.5, 0.565), (-0.36, 0.54)],
        bow=(0.2, 0.08),
        rail_bow=(0.07, 0.04),
        flat=(0.8, 0.75),
        bulge=0.03,
        drop=0.04,
        glass_rear=False,
        roof_material="carbon" if track else "body",
    )
    hatch_glass(car, -1.02, -1.92, 0.44, 0.36)
    car.lip(-2.03, car.lid(-2.03, 0.0) + 0.016, 0.86, depth=0.13, thickness=0.024, material="body", sweep_back=0.03)
    car.wipers(glass)
    car.interior(seat=-0.6, spread=0.31, height=0.13, width=0.4, material="interior" if track else "seat")
    return car.finish(paint)


def saloon(name, paint, long):
    car = Coach(name, "split" if long else "mesh", metal="rim_dark", lip="rim", cap="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    cowl = 0.82 if long else 0.78
    deck = -2.14 if long else -1.98

    car.skin(
        half=[(stern, 0.83), (-axle, 0.875), (-0.45, 0.885), (0.45, 0.885), (axle, 0.888), (nose - 0.4, 0.875), (nose, 0.78)],
        shoulder=[(stern, 0.965), (deck, 1.035), (-axle, 1.035), (-0.4, 0.985), (cowl, 0.96), (axle, 0.905), (nose - 0.28, 0.82), (nose, 0.75)],
        waist=[(stern, 0.72), (-axle, 0.765), (-0.6, 0.7), (0.3, 0.73), (axle, 0.745), (nose - 0.35, 0.66), (nose, 0.52)],
        sill=[(stern, 0.42), (-1.85, 0.29), (1.85, 0.29), (nose, 0.3)],
        crown=[(stern, 0.012), (deck, 0.02), (cowl, 0.03), (axle, 0.045), (nose, 0.03)],
        flare=(0.036, 0.034),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.36],
        front={"set": (0.14, 0.05, 0.0, 0.0, 0.035, 0.12), "bow": 0.15, "flat": 0.58, "power": 2.3},
        rear={"set": (0.18, 0.07, 0.012, 0.0, 0.05, 0.13), "bow": 0.12, "flat": 0.64, "power": 2.3},
        inset=0.045,
        shelf=0.055,
        flank=0.016,
        relief=power_domes(0.2, 0.11, 0.022, 1.45, 0.75),
        margin=0.0,
        rear_lift=0.15,
        front_lift=0.03,
        sharp=(True, True, False, True, False),
    )
    front, back = car.front, car.back

    if long:
        blade_grille(car, [(-0.3, 0.5), (0.3, 0.5), (0.37, 0.54), (0.42, 0.7), (0.36, 0.737), (-0.36, 0.737), (-0.42, 0.7), (-0.37, 0.54)], depth=0.06)
        car.headlamp(
            front,
            [(0.47, 0.645), (0.8, 0.62), (1.05, 0.66), (1.15, 0.762), (0.8, 0.782), (0.5, 0.755)],
            projectors=[(0.62, 0.685, 0.036), (0.84, 0.685, 0.036)],
            strips=[
                [(0.52, 0.73), (0.8, 0.75), (1.06, 0.733), (1.07, 0.75), (0.8, 0.767), (0.52, 0.745)],
                [(0.56, 0.71), (0.8, 0.727), (1.0, 0.713), (1.01, 0.725), (0.8, 0.74), (0.56, 0.722)],
            ],
            depth=0.05,
        )
    else:
        slat_grille(car, [(-0.36, 0.45), (0.36, 0.45), (0.43, 0.49), (0.37, 0.68), (0.31, 0.712), (-0.31, 0.712), (-0.37, 0.68), (-0.43, 0.49)], 13, depth=0.06, emblem=0.065)
        car.headlamp(
            front,
            [(0.46, 0.625), (0.78, 0.602), (1.04, 0.645), (1.14, 0.75), (0.78, 0.766), (0.52, 0.735)],
            projectors=[(0.62, 0.67, 0.036), (0.83, 0.677, 0.036)],
            strips=[[(0.54, 0.713), (0.78, 0.737), (1.05, 0.725), (1.06, 0.742), (0.78, 0.753), (0.54, 0.727)]],
            depth=0.05,
        )
    mouth = car.hollow(front, [(-0.4, 0.2), (0.4, 0.2), (0.36, 0.38), (-0.36, 0.38)], 0.07, mirror=False)
    mouth.mesh(9, 3)
    duct = car.hollow(front, [(0.5, 0.23), (0.93, 0.26), (0.96, 0.5), (0.56, 0.52), (0.45, 0.42)], 0.09)
    duct.bars(2, material="trim_black", share=0.14, sink=0.15)
    flat_plate(car, False, 0.385 if long else 0.34, depth=-0.012)

    if long:
        lamps = sunk_lamp(
            car,
            back,
            [(0.3, 0.875), (0.78, 0.85), (1.06, 0.875), (1.13, 0.96), (0.78, 0.98), (0.3, 0.953)],
            [
                [(0.34, 0.92), (0.78, 0.93), (1.06, 0.922), (1.08, 0.948), (0.78, 0.96), (0.34, 0.94)],
                [(0.34, 0.887), (0.78, 0.868), (1.04, 0.89), (1.05, 0.908), (0.78, 0.893), (0.34, 0.906)],
            ],
        )
    else:
        lamps = sunk_lamp(
            car,
            back,
            [(0.26, 0.872), (0.74, 0.83), (1.02, 0.852), (1.11, 0.942), (0.78, 0.967), (0.3, 0.915)],
            [
                [(0.3, 0.888), (0.74, 0.9), (1.04, 0.905), (1.07, 0.934), (0.78, 0.952), (0.33, 0.906)],
                [(0.44, 0.868), (0.74, 0.845), (1.0, 0.865), (1.01, 0.884), (0.74, 0.866), (0.46, 0.88)],
            ],
        )
    flat_plate(car, True, 0.69, depth=0.02)
    diffuser(car, 0.68, 0.26, 0.44)
    car.patch(back, rect(0.5, 0.92, 0.5, 0.526), "lens_tail", lift=0.005, thickness=0.004)
    car.patch(car.side, rect(0.72, 0.9, 0.705, 0.73), "chrome", lift=0.004, thickness=0.004)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.028, proud=0.012)
    lamps()
    ring(car, back, (0.0, 0.9), 0.05, 0.012)
    quad_pipes(car, 0.345)
    car.lip(nose - 0.09, 0.136, 1.44, depth=0.1, thickness=0.018, sweep_back=0.15)
    deck_lip(car, stern + 0.17, 1.0, lift=-0.004)
    car.stroke((-0.78, 0.86), (0.78, 0.86), car.tail, steps=12, mirror=False)
    car.stroke((0.78, 0.86), (0.72, 0.64), car.tail, steps=6)
    door = cowl - 0.2
    car.seams([door, -0.42])
    rear = -1.26 if long else -1.2
    car.stroke((rear, 1.0), (rear, 0.86), car.side, steps=6)
    car.stroke((rear, 0.86), (rear + 0.2, 0.7), car.side, steps=6)
    car.grips([-0.26, rear + 0.16], material="chrome")
    car.bonnet(cowl + 0.04, 0.74, front=nose - 0.18)
    car.mirrors(cowl - 0.22)

    if long:
        windows = [((0.54, -0.08), (-0.4, -0.44)), ((-0.48, -0.52), (-1.22, -1.08)), ((-1.29, -1.15), (-1.66, -1.3))]
        glass = car.cabin(
            screen=(cowl, 0.04),
            back=(-1.36, deck),
            roof=[(-1.36, 1.365), (-0.85, 1.44), (-0.3, 1.458), (0.04, 1.412)],
            windows=windows,
            base_inset=0.08,
            tumble=0.16,
            drop=0.045,
            bow=(0.16, 0.06),
            rail_bow=(0.07, 0.04),
            flat=(0.86, 0.86),
            power=(2.2, 3.0),
            bulge=0.024,
        )
        car.interior(seat=-0.14, rear_bench=-1.05)
    else:
        windows = [((0.5, -0.12), (-0.4, -0.44)), ((-0.48, -0.52), (-1.44, -1.06))]
        glass = car.cabin(
            screen=(cowl, 0.0),
            back=(-1.2, deck),
            roof=[(-1.2, 1.33), (-0.8, 1.405), (-0.35, 1.426), (0.0, 1.38)],
            windows=windows,
            base_inset=0.08,
            tumble=0.16,
            drop=0.045,
            bow=(0.16, 0.06),
            rail_bow=(0.07, 0.04),
            flat=(0.86, 0.86),
            power=(2.2, 3.0),
            bulge=0.024,
        )
        car.interior(seat=-0.16, rear_bench=-1.0)
    car.wipers(glass)
    return car.finish(paint)


def gt_r():
    return amg_gt("mercedes-amg-gt-r", True, "#3f8128")


def gt():
    return amg_gt("mercedes-amg-gt", False, "#f0c010")


def c_63():
    return saloon("mercedes-amg-c-63", "#62676b", False)


def e_63():
    return saloon("mercedes-amg-e-63", "#1a3a80", True)


CARS = {
    "mercedes-amg-gt-r": gt_r,
    "mercedes-amg-gt": gt,
    "mercedes-amg-c-63": c_63,
    "mercedes-amg-e-63": e_63,
}
