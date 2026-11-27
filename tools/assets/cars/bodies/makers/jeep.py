from carkit import box
from dodge import arch_trim, band, dome, handles, livery, mirror_pair, oval, pillars, quad, spoiler, square_arches, tag, taillight, tailpipes
from kit import Coach


def trackhawk():
    car = Coach("jeep-grand-cherokee-trackhawk", "star", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    bulge = dome(1.28, nose - 0.22, 0.46, 0.035, fade=0.22, edge=0.14, taper=0.2)
    car.skin(
        half=[(stern, 0.9), (-axle, 0.96), (0.0, 0.95), (axle, 0.96), (nose - 0.32, 0.935), (nose, 0.87)],
        shoulder=[(stern, 1.21), (-axle, 1.215), (-0.3, 1.17), (1.14, 1.15), (axle, 1.125), (nose - 0.25, 1.085), (nose, 1.055)],
        waist=[(stern, 0.99), (-axle, 0.99), (0.0, 0.94), (axle, 0.93), (nose, 0.86)],
        sill=[(stern, 0.6), (-2.08, 0.6), (-1.92, 0.42), (1.9, 0.42), (nose, 0.48)],
        crown=[(stern, 0.0), (1.14, 0.02), (axle, 0.035), (nose, 0.03)],
        flare=(0.034, 0.036),
        keys=[nose - 0.32, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.15, 0.05, 0.0, 0.012, 0.04, 0.11), "bow": 0.09, "flat": 0.76, "power": 2.9},
        rear={"set": (0.18, 0.05, 0.0, 0.03, 0.09, 0.14), "bow": 0.07, "flat": 0.78, "power": 2.8},
        inset=0.045,
        shelf=0.05,
        flank=0.01,
        sharp=(False, True, True, True, False),
        rear_lift=0.2,
        relief=bulge,
        paint=livery(car),
        lid_rows=6,
    )
    front, back = car.front, car.back

    for n in range(7):
        t = (n - 3) * 0.105
        slot = car.hollow(front, oval((t, 0.95), 0.037, 0.058, power=5.0, count=10), 0.05, mirror=False)
        slot.mesh(2, 5, share=0.12, sink=0.6)
    car.headlamp(
        front,
        [(0.43, 0.9), (0.9, 0.915), (0.99, 0.955), (0.97, 1.015), (0.43, 1.008)],
        projectors=[(0.56, 0.957, 0.04), (0.72, 0.963, 0.034)],
        strips=[[(0.45, 0.908), (0.89, 0.923), (0.965, 0.958), (0.95, 0.966), (0.88, 0.937), (0.45, 0.922)]],
    )
    intake = car.hollow(front, [(-0.56, 0.52), (0.56, 0.52), (0.62, 0.63), (0.58, 0.75), (-0.58, 0.75), (-0.62, 0.63)], 0.07, mirror=False)
    intake.mesh(22, 6, share=0.1)
    duct = car.hollow(front, [(0.7, 0.55), (0.94, 0.58), (0.94, 0.75), (0.7, 0.75)], 0.05)
    duct.bars(3, share=0.16)
    low = car.hollow(front, band(-0.5, 0.5, 0.33, 0.44), 0.05, mirror=False)
    low.bars(2, share=0.16)
    vent = car.hollow(car.top, [(1.92, 0.16), (1.9, 0.36), (1.58, 0.4), (1.62, 0.18)], 0.03)
    vent.bars(4, axis=0, share=0.3)

    taillight(
        car,
        back,
        [(0.36, 1.05), (0.8, 1.04), (1.0, 1.065), (1.03, 1.15), (0.8, 1.165), (0.36, 1.15)],
        strips=[
            [(0.38, 1.128), (0.8, 1.142), (1.01, 1.13), (1.0, 1.112), (0.8, 1.124), (0.38, 1.112)],
            [(0.38, 1.068), (0.8, 1.058), (0.99, 1.08), (0.985, 1.096), (0.8, 1.076), (0.38, 1.084)],
        ],
        clear=[quad(0.4, 0.6, 1.09, 1.106)],
    )
    tag(car, back, 0.86, recess=0.014)
    tailpipes(car, [[-0.68, -0.55], [0.55, 0.68]], 0.52, radius=0.048)

    square_arches(car, gap=0.07, top=0.27, low=0.58, soft=0.22)
    car.cut()
    arch_trim(car, width=0.04, proud=0.014, floor=0.44)
    tag(car, front, 0.555, lift=-0.012)
    car.lip(nose - 0.09, 0.245, 1.5, depth=0.12, thickness=0.025, sweep_back=0.1)
    car.patch(back, band(-0.32, 0.32, 1.09, 1.122), "chrome", lift=0.004, thickness=0.006, mirror=False)

    car.seams([0.96, -0.06, -1.02])
    car.bonnet(1.25, 0.8, front=nose - 0.12)
    car.stroke((-0.82, 0.78), (0.82, 0.78), car.tail, steps=12, mirror=False)
    handles(car, [0.1, -0.84])
    mirror_pair(car, 0.8, size=(0.11, 0.21, 0.14))
    car.lamp(car.side, quad(nose - 0.36, nose - 0.22, 0.82, 0.85), "amber", thickness=0.004)

    glass = car.cabin(
        screen=(1.25, 0.46),
        back=(-1.82, -2.3),
        roof=[(-1.82, 1.65), (-1.0, 1.71), (-0.2, 1.724), (0.46, 1.682)],
        windows=[((0.95, 0.38), (-0.0, 0.02)), ((-0.08, -0.06), (-0.96, -0.94)), ((-1.04, -1.02), (-1.84, -1.46))],
        base_inset=0.1,
        tumble=0.17,
        drop=0.055,
        bow=(0.13, 0.06),
        header=0.9,
    )
    car.wipers(glass)
    pillars(car, [((0.02, -0.1), (0.04, -0.08)), ((-0.94, -1.06), (-0.92, -1.04))])
    spoiler(car, -1.85, 1.02, 0.13, 0.012, 0.028, sweep=-0.03)
    car.model.absorb(box((-1.918, 0, car.top(-1.79, 0)[0].z - 0.004), (0.008, 0.3, 0.014), "lens_tail"), "Taillights")
    for y in (0.53, -0.53):
        car.model.absorb(box((-0.75, y, car.top(-0.75, y)[0].z + 0.012), (1.9, 0.035, 0.02), "trim_black", bevel=0.006))
    car.interior(seat=0.15, rear_bench=-0.8)
    return car.finish("#a8171c")


CARS = {"jeep-grand-cherokee-trackhawk": trackhawk}
