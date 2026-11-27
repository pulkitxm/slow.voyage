from carkit import box, lathe
from dodge import band, dome, ease, handles, mirror_pair, oval, pillars, quad, sculpt, sink, spoiler, tag, taillight, tailpipes
from kit import Coach, grow


def centre_valance(car, half, reach=0.4):
    limit = -car.axle - reach

    def paint(band_index, station, point):
        if band_index == 0:
            return "underbody"
        if band_index == 1 and point.x < limit and abs(point.y) < half:
            return "trim_black"
        return "body"

    return paint


def round_lamp(car, caster, t, z, radius, depth=0.035):
    def build(sunk):
        hit, normal = caster(t, z)
        origin = hit - normal * (depth if sunk else -0.002)
        parts = [
            (lathe([(0, 0.0), (radius, 0.0), (radius, 0.01), (radius * 0.92, 0.018), (0, 0.02)], "lens_tail", origin=origin, axis=normal, segments=20), "Taillights"),
            (lathe([(radius * 0.5, 0.017), (radius * 0.8, 0.017), (radius * 0.8, 0.026), (radius * 0.5, 0.026)], "lens_ember", origin=origin, axis=normal, segments=20), "Taillights"),
            (lathe([(0, 0.017), (radius * 0.26, 0.017), (radius * 0.22, 0.028), (0, 0.03)], "lens_ember", origin=origin, axis=normal, segments=12), "Taillights"),
        ]
        for part, group in parts:
            car.model.add(part, group)

    sink(car, caster, oval((t, z), radius + 0.008, radius + 0.008, power=2.0, count=16), depth, build, "body")


def wrap_glass(car, hull, low=1.0, high=3.0, spread=0.018):
    spots = [i for i, station in enumerate(hull.stations) if station[0] == "rear_corner"]
    ring = [hull.position(low, i) for i in spots] + [hull.position(high, i) for i in reversed(spots)]
    outline = grow([(point.x, point.y) for point in ring], spread)
    car.patch(car.top, outline, "trim_black", lift=0.002)
    car.patch(car.top, outline, "glass", lift=0.005)


def corvette_z06():
    car = Coach("chevrolet-corvette-z06-c6", "ten", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    bulge = dome(0.76, nose - 0.2, 0.36, 0.055, fade=0.34, edge=0.2, taper=0.5)
    car.skin(
        half=[(stern, 0.9), (-axle, 0.99), (-0.5, 0.925), (0.4, 0.92), (axle, 0.965), (nose - 0.45, 0.88), (nose, 0.7)],
        shoulder=[(stern, 0.9), (-1.9, 0.94), (-axle, 0.955), (-0.7, 0.9), (0.0, 0.865), (0.74, 0.845), (axle, 0.745), (nose - 0.4, 0.61), (nose, 0.48)],
        waist=[(stern, 0.7), (-axle, 0.68), (0.0, 0.57), (axle, 0.53), (nose, 0.4)],
        sill=[(stern, 0.435), (-1.88, 0.435), (-1.72, 0.25), (1.6, 0.24), (nose, 0.26)],
        crown=[(stern, 0.012), (-axle, 0.004), (0.6, 0.012), (axle, -0.04), (nose - 0.35, -0.015), (nose, 0.0)],
        flare=(0.03, 0.045),
        keys=[nose - 0.55, axle, 0.45, -0.45, -axle, stern + 0.32],
        front={"set": (0.12, 0.04, 0.01, 0.0, 0.16, 0.3), "bow": (0.14, 0.18, 0.2, 0.2, 0.2, 0.2), "flat": 0.56, "power": 2.3},
        rear={"set": (0.1, 0.04, 0.02, 0.016, 0.016, 0.055), "bow": 0.07, "flat": 0.8, "power": 2.6},
        inset=0.05,
        shelf=0.06,
        flank=0.016,
        sharp=(False, True, True, False, False),
        rear_lift=0.13,
        relief=bulge,
        paint=centre_valance(car, 0.5),
        lid_rows=6,
    )

    def cove(x, y, z):
        if y < 0.6 or not -0.7 < x < 0.98:
            return None
        along = ease((0.98 - x) / 0.1) * ease((x + 0.7) / 1.1)
        up = ease((car.waist_at(x) + 0.1 - z) / 0.08) * ease((z - 0.3) / 0.14)
        return (0.0, -0.03 * along * up, 0.0)

    sculpt(car, cove)
    front, back = car.front, car.back

    mouth = car.hollow(front, band(-0.5, 0.5, 0.19, 0.33), 0.07, mirror=False)
    mouth.mesh(18, 4, share=0.1)
    car.hollow(front, [(0.62, 0.2), (0.86, 0.24), (0.86, 0.34), (0.62, 0.33)], 0.06)
    car.headlamp(
        car.top,
        [(nose - 0.28, 0.42), (nose - 0.34, 0.6), (nose - 0.58, 0.74), (nose - 0.88, 0.77), (nose - 0.8, 0.63), (nose - 0.5, 0.46)],
        projectors=[(nose - 0.43, 0.54, 0.04), (nose - 0.58, 0.63, 0.036)],
        strips=[[(nose - 0.7, 0.67), (nose - 0.84, 0.75), (nose - 0.76, 0.75), (nose - 0.66, 0.7)]],
    )
    car.hollow(car.top, [(nose - 0.16, -0.16), (nose - 0.16, 0.16), (nose - 0.24, 0.19), (nose - 0.24, -0.19)], 0.03, mirror=False)
    gill = car.hollow(car.side, [(0.9, 0.45), (0.92, 0.64), (0.7, 0.655), (0.63, 0.51)], 0.06)
    gill.bars(1, material="body", share=0.16, sink=0.1)
    car.hollow(car.side, [(-0.81, 0.36), (-0.8, 0.52), (-0.91, 0.55), (-0.91, 0.36)], 0.06)

    for t in (0.35, 0.63):
        round_lamp(car, back, t, 0.745, 0.08)
    tag(car, back, 0.655, recess=0.02)
    tailpipes(car, [[-0.2, -0.067, 0.067, 0.2]], 0.35, radius=0.047, pad=0.018, proud=0.004)

    car.arches(0.04, inner=0.09)
    car.cut()
    car.arch_lips(width=0.02, proud=0.005)
    car.disc(front, 0.74, 0.285, 0.03, "drl", bezel="chrome", depth=0.02, sink=0.05)
    tag(car, front, 0.185)
    car.lip(nose - 0.1, 0.135, 1.36, depth=0.14, thickness=0.02, sweep_back=0.24)
    spoiler(car, stern + 0.085, 1.46, 0.1, 0.028, 0.06, sweep=-0.05)
    car.model.absorb(box((stern + 0.022, 0, car.top(stern + 0.12, 0)[0].z + 0.012), (0.01, 0.3, 0.014), "lens_tail"), "Taillights")
    car.lamp(back, [(0.56, 0.47), (0.84, 0.485), (0.84, 0.52), (0.56, 0.51)], "red", thickness=0.004)
    car.lamp(car.side, quad(stern + 0.16, stern + 0.3, 0.62, 0.65), "red", thickness=0.004)
    car.lamp(car.side, [(nose - 0.52, 0.44), (nose - 0.38, 0.46), (nose - 0.38, 0.49), (nose - 0.52, 0.47)], "amber", thickness=0.004)

    car.seams([0.5, -0.52])
    car.bonnet(0.78, 0.62, front=nose - 0.3)
    handles(car, [-0.38], z=0.8, size=(0.13, 0.016, 0.028))
    mirror_pair(car, 0.42, size=(0.09, 0.16, 0.09), reach=0.05, lift=0.05)

    glass = car.cabin(
        screen=(0.76, -0.05),
        back=(-0.64, -1.86),
        roof=[(-0.64, 1.195), (-0.34, 1.244), (-0.05, 1.212)],
        windows=[((0.48, -0.13), (-0.52, -0.5)), ((-0.64, -0.56), (-1.52, -0.6))],
        base=[(-1.9, 0.72), (-0.6, 0.77), (0.76, 0.7)],
        rail=[(-0.64, 0.56), (-0.3, 0.57), (-0.05, 0.52)],
        bow=(0.2, 0.1),
        rail_bow=(0.12, 0.06),
        flat=(0.82, 0.9),
        power=(2.2, 3.4),
        drop=0.05,
        bulge=0.03,
        header=0.9,
    )
    car.wipers(glass)
    wrap_glass(car, glass)
    car.interior(seat=-0.32, spread=0.33, height=0.13, width=0.42, material="interior")
    return car.finish("#f0c319")


def camaro_z28():
    car = Coach("chevrolet-camaro-z-28", "ten", metal="rim_dark", lip="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    bulge = dome(0.96, nose - 0.2, 0.36, 0.035, fade=0.24, edge=0.12, taper=0.2)
    car.skin(
        half=[(stern, 0.9), (-axle, 0.985), (-0.5, 0.93), (0.5, 0.93), (axle, 0.975), (nose - 0.3, 0.93), (nose, 0.86)],
        shoulder=[(stern, 1.005), (-2.0, 1.05), (-axle, 1.07), (-0.7, 1.01), (0.0, 0.985), (0.85, 0.97), (axle, 0.93), (nose - 0.3, 0.87), (nose, 0.835)],
        waist=[(stern, 0.86), (-axle, 0.9), (-0.7, 0.8), (0.3, 0.78), (axle, 0.77), (nose, 0.745)],
        sill=[(stern, 0.46), (-2.02, 0.46), (-1.86, 0.3), (1.82, 0.3), (nose, 0.36)],
        crown=[(stern, 0.012), (-1.7, 0.02), (0.85, 0.028), (axle, 0.035), (nose, 0.025)],
        flare=(0.048, 0.05),
        keys=[nose - 0.4, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.2, 0.08, 0.035, 0.02, 0.004, 0.07), "bow": 0.13, "flat": 0.7, "power": 2.7},
        rear={"set": (0.13, 0.05, 0.02, 0.012, 0.012, 0.05), "bow": 0.05, "flat": 0.82, "power": 3.0},
        inset=0.05,
        shelf=0.055,
        flank=0.012,
        sharp=(False, True, True, True, False),
        rear_lift=0.17,
        relief=bulge,
        paint=centre_valance(car, 2.0),
        lid_rows=6,
    )
    front, back = car.front, car.back

    slot = car.hollow(front, band(-0.5, 0.5, 0.7, 0.768), 0.06, mirror=False)
    slot.mesh(20, 2, share=0.1)
    car.headlamp(
        front,
        [(0.54, 0.692), (0.88, 0.702), (0.99, 0.737), (0.97, 0.782), (0.54, 0.777)],
        projectors=[(0.7, 0.737, 0.034)],
        strips=[[(0.8, 0.708), (0.955, 0.74), (0.945, 0.772), (0.8, 0.768), (0.8, 0.754), (0.92, 0.758), (0.925, 0.744), (0.8, 0.722)]],
    )
    intake = car.hollow(front, [(-0.62, 0.27), (0.62, 0.27), (0.68, 0.42), (0.6, 0.6), (-0.6, 0.6), (-0.68, 0.42)], 0.07, mirror=False)
    intake.mesh(22, 6, share=0.1)
    car.hollow(front, [(0.78, 0.3), (0.95, 0.34), (0.95, 0.54), (0.78, 0.54)], 0.05)
    vent = car.hollow(car.top, [(1.86, -0.28), (1.86, 0.28), (1.5, 0.34), (1.5, -0.34)], 0.035, mirror=False)
    vent.bars(5, material="carbon", axis=0, share=0.4)
    for x in (-0.99, -1.06):
        car.hollow(car.side, [(x, 0.64), (x + 0.03, 0.64), (x + 0.005, 0.84), (x - 0.025, 0.84)], 0.014, material="body")

    taillight(car, back, [(0.3, 0.79), (0.82, 0.79), (0.89, 0.83), (0.87, 0.905), (0.3, 0.905)], clear=[quad(0.33, 0.43, 0.83, 0.865)])
    tag(car, back, 0.57, recess=0.014)
    car.hollow(back, band(-0.24, 0.24, 0.8, 0.895), 0.012, material="body", mirror=False)
    tailpipes(car, [[-0.56], [0.56]], 0.39, radius=0.052, pad=0.018)

    car.arches(0.045, inner=0.09)
    car.cut()
    car.arch_lips(width=0.04, proud=0.024, material="trim_black")
    tag(car, front, 0.35, lift=-0.012)
    car.lip(nose - 0.12, 0.15, 1.66, depth=0.2, thickness=0.02, sweep_back=0.18)
    spoiler(car, stern + 0.1, 1.52, 0.12, 0.065, 0.1, sweep=-0.04)
    spoiler(car, stern + 0.052, 1.52, 0.016, 0.095, 0.04, material="trim_black", sweep=-0.04, blade=0.016)
    car.fins(stern + 0.17, 0.31, 4, 0.66, length=0.24, height=0.07)
    skirt = car.side(0.0, 0.3)[0].y
    car.model.add(box((0.0, skirt + 0.01, 0.17), (1.9, 0.07, 0.03), "trim_black", bevel=0.008))
    car.seams([0.74, -0.46])
    car.bonnet(0.94, 0.76, front=nose - 0.14)
    car.stroke((-0.8, 0.76), (0.8, 0.76), car.tail, steps=12, mirror=False)
    handles(car, [-0.3])
    mirror_pair(car, 0.54)
    car.lamp(car.side, quad(nose - 0.4, nose - 0.26, 0.6, 0.63), "amber", thickness=0.004)
    car.lamp(car.side, quad(stern + 0.2, stern + 0.34, 0.72, 0.75), "red", thickness=0.004)

    glass = car.cabin(
        screen=(0.93, 0.15),
        back=(-1.05, -1.95),
        roof=[(-1.05, 1.275), (-0.6, 1.325), (-0.2, 1.33), (0.15, 1.295)],
        windows=[((0.63, 0.05), (-0.4, -0.38)), ((-0.46, -0.44), (-1.06, -0.8))],
        base_inset=0.13,
        tumble=0.15,
        drop=0.05,
        bow=(0.14, 0.06),
        header=0.86,
    )
    car.wipers(glass)
    pillars(car, [((-0.38, -0.48), (-0.36, -0.46))])
    car.patch(car.top, quad(-1.225, -1.195, -0.14, 0.14), "lens_tail", lift=0.004, group="Taillights", mirror=False)
    car.interior(seat=-0.15, rear_bench=-0.95)
    return car.finish("#e8e8e3")


CARS = {
    "chevrolet-corvette-z06-c6": corvette_z06,
    "chevrolet-camaro-z-28": camaro_z28,
}
