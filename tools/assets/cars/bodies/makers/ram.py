from carkit import box
from dodge import arch_trim, band, dome, ease, handles, ledge, mirror_pair, pillars, quad, square_arches, tag, taillight, tailpipes
from kit import Coach


def trx():
    car = Coach("ram-1500-trx", "six", metal="rim_dark", lip="rim_dark", lugs=18, groove_depth=0.014, dish=0.05)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    scoop = dome(1.5, nose - 0.24, 0.36, 0.07, fade=0.3, edge=0.12, taper=0.2)

    def flare(x):
        fore = ease((x - 1.2) / 0.3) * (0.35 + 0.65 * ease((nose - 0.1 - x) / 0.5))
        aft = ease((-1.28 - x) / 0.25) * (0.7 + 0.3 * ease((x - stern - 0.05) / 0.4))
        return 0.09 * max(fore, aft)

    def paint(band_index, station, point):
        if band_index == 0:
            return "underbody"
        if band_index == 1:
            return "trim_black"
        if band_index <= 3 and (point.x > nose - 0.44 or point.x < stern + 0.3):
            return "trim_black"
        return "body"

    car.skin(
        half=[(stern, 0.945), (-axle, 0.95), (0.0, 0.95), (axle, 0.95), (nose - 0.3, 0.945), (nose, 0.92)],
        shoulder=[(stern, 1.47), (-1.32, 1.47), (-1.2, 1.5), (1.3, 1.5), (axle, 1.465), (nose - 0.25, 1.405), (nose, 1.375)],
        waist=[(stern, 0.9), (stern + 0.3, 0.9), (stern + 0.6, 1.02), (nose - 0.75, 1.02), (nose - 0.44, 0.93), (nose, 0.93)],
        sill=[(stern, 0.62), (stern + 0.3, 0.62), (stern + 0.6, 0.56), (nose - 0.75, 0.56), (nose - 0.44, 0.66), (nose, 0.66)],
        crown=[(stern, 0.0), (1.3, 0.0), (axle, 0.03), (nose, 0.03)],
        flare=flare,
        keys=[nose - 0.26, axle, 0.6, -0.6, -axle, stern + 0.24],
        front={"set": (0.14, 0.04, 0.004, 0.004, 0.07, 0.13), "bow": 0.06, "flat": 0.8, "power": 3.2},
        rear={"set": (0.12, 0.04, 0.004, 0.004, 0.08, 0.1), "bow": 0.02, "flat": 0.86, "power": 3.4},
        inset=0.03,
        shelf=0.04,
        flank=0.008,
        belly=0.004,
        clearance=0.47,
        front_lift=0.1,
        rear_lift=0.07,
        relief=scoop,
        paint=paint,
        sharp=(False, True, True, True, False),
        step=0.125,
        lid_rows=6,
    )
    ledge(car, True, 0.94, 0.066, 1.375)
    ledge(car, False, 0.91, 0.076, 1.47, reach=0.4)
    front, back = car.front, car.back

    grille = car.hollow(front, band(-0.62, 0.62, 0.99, 1.33), 0.08, mirror=False)
    grille.mesh(18, 7, share=0.12)
    car.headlamp(
        front,
        [(0.66, 1.17), (1.0, 1.18), (1.09, 1.235), (1.07, 1.338), (0.66, 1.33)],
        projectors=[(0.77, 1.256, 0.04), (0.9, 1.262, 0.034)],
        strips=[[(0.68, 1.18), (0.99, 1.19), (1.065, 1.238), (1.05, 1.246), (0.98, 1.204), (0.68, 1.194)]],
    )
    opening = car.hollow(front, band(-0.46, 0.46, 0.655, 0.745), 0.06, mirror=False)
    opening.mesh(14, 2, share=0.12)
    car.hollow(front, quad(0.72, 0.9, 0.72, 0.8), 0.04)
    mouth = car.hollow(car.top, [(nose - 0.3, -0.26), (nose - 0.3, 0.26), (nose - 0.44, 0.3), (nose - 0.44, -0.3)], 0.04, mirror=False)
    mouth.bars(1, material="trim_black", axis=0, share=0.1)
    louvre = car.hollow(car.top, [(2.2, 0.56), (2.18, 0.72), (1.8, 0.74), (1.82, 0.58)], 0.03)
    louvre.bars(4, axis=0, share=0.3)

    taillight(
        car,
        back,
        [(0.86, 1.04), (1.05, 1.04), (1.06, 1.42), (0.86, 1.42)],
        strips=[quad(0.885, 1.035, 1.15, 1.2), quad(0.885, 1.035, 1.25, 1.3), quad(0.885, 1.035, 1.35, 1.395)],
        clear=[quad(0.885, 1.035, 1.06, 1.11)],
    )
    tag(car, back, 0.69, recess=0.012)
    car.hollow(back, band(-0.7, 0.7, 1.09, 1.33), 0.014, material="body", mirror=False)
    tailpipes(car, [[-0.76], [0.76]], 0.675, radius=0.062, material="trim_black")

    bed_front, bed_back, bed_floor, bed_half = -1.31, stern + 0.13, 0.92, 0.85
    car.carve(box(((bed_front + bed_back) / 2, 0, bed_floor + 0.6), (bed_front - bed_back, bed_half * 2, 1.2), "body"))
    car.carve(box((-1.262, 0, 1.2), (0.026, 3.0, 1.2), "underbody"))
    square_arches(car, gap=0.16, top=0.36, low=0.66, soft=0.3)
    car.cut()
    arch_trim(car, width=0.075, proud=0.022, material="trim_black", floor=0.5)
    for t in (0.81,):
        car.disc(front, t, 0.76, 0.03, "drl", bezel="chrome", depth=0.02, sink=0.035)
    car.patch(front, band(-0.44, 0.44, 0.585, 0.65), "steel", lift=0.012, thickness=0.02, mirror=False)
    tag(car, front, 0.762)
    for y in (-0.12, 0.0, 0.12):
        car.patch(car.top, [(nose - 0.34, y - 0.03), (nose - 0.34, y + 0.03), (nose - 0.38, y + 0.03), (nose - 0.38, y - 0.03)], "lens_amber", lift=-0.024, thickness=0.004, mirror=False)

    middle = (bed_front + bed_back) / 2
    car.model.add(box((-axle, bed_half - 0.1, bed_floor + 0.11), (1.05, 0.2, 0.22), "body", bevel=0.04))
    for n in range(7):
        car.model.absorb(box((middle, (n - 3) * 0.2, bed_floor + 0.006), (bed_front - bed_back - 0.04, 0.07, 0.012), "body"))
    car.model.add(box((middle, bed_half + 0.065, 1.478), (bed_front - bed_back + 0.1, 0.15, 0.022), "trim_black", bevel=0.008))
    car.model.absorb(box((bed_back - 0.04, 0, 1.478), (0.08, bed_half * 2 + 0.2, 0.022), "trim_black", bevel=0.008))

    car.seams([1.28, 0.02, -1.08], low=lambda x: 0.58)
    car.bonnet(1.4, 0.86, front=nose - 0.16)
    tail = car.tail
    car.stroke((0.84, 0.94), (0.84, 1.45), tail, steps=8)
    car.patch(tail, quad(-0.13, 0.13, 1.37, 1.43), "trim_black", lift=0.004, thickness=0.012, mirror=False)
    handles(car, [0.16, -0.94], z=1.38, material="trim_black", size=(0.18, 0.024, 0.04))
    mirror_pair(car, 1.08, material="trim_black", size=(0.13, 0.22, 0.27), reach=0.1, lift=0.15)
    car.lamp(car.side, quad(axle - 0.06, axle + 0.06, 1.22, 1.245), "amber", thickness=0.004)
    car.lamp(car.side, quad(-axle - 0.06, -axle + 0.06, 1.22, 1.245), "red", thickness=0.004)
    step_y = car.side(0.0, 0.62)[0].y
    car.model.add(box((0.05, step_y + 0.04, 0.5), (2.3, 0.16, 0.05), "trim_black", bevel=0.014))

    glass = car.cabin(
        screen=(1.4, 0.8),
        back=(-1.1, -1.2),
        roof=[(-1.1, 2.03), (-0.2, 2.055), (0.8, 1.995)],
        windows=[((1.1, 0.7), (0.06, 0.08)), ((-0.02, 0.0), (-0.92, -0.9))],
        base_inset=0.08,
        tumble=0.12,
        drop=0.045,
        bow=(0.11, 0.02),
        rail_bow=(0.07, 0.015),
        flat=(0.86, 0.9),
        power=(2.4, 3.6),
        header=0.9,
    )
    car.wipers(glass)
    pillars(car, [((0.08, -0.04), (0.1, -0.02))])
    car.model.absorb(box((-1.108, 0, car.top(-1.0, 0)[0].z - 0.03), (0.012, 0.3, 0.018), "lens_tail"), "Taillights")
    car.interior(seat=0.3, rear_bench=-0.62)
    return car.finish("#70777d")


CARS = {"ram-1500-trx": trx}
