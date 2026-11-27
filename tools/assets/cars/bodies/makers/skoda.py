from kit import Coach, ellipse
from volkswagen import badge, dome, doors, fin, handles, livery, pillar, plate, rearlamp, rim, slab, trims


def octavia_rs():
    car = Coach("skoda-octavia-rs", "split", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.83), (-axle, 0.895), (0.0, 0.9), (axle, 0.895), (nose - 0.36, 0.87), (nose, 0.8)],
        shoulder=[(stern, 1.03), (-2.05, 1.045), (-1.1, 1.0), (0.0, 0.955), (0.8, 0.935), (1.06, 0.922), (axle, 0.88), (nose - 0.4, 0.845), (nose - 0.12, 0.805), (nose, 0.785)],
        waist=[(stern, 0.93), (-axle, 0.92), (0.0, 0.885), (axle, 0.86), (nose - 0.38, 0.76), (nose - 0.15, 0.6), (nose, 0.52)],
        sill=[(stern, 0.44), (-1.8, 0.3), (1.8, 0.3), (nose, 0.38)],
        crown=[(stern, 0.02), (-2.05, 0.03), (1.0, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.016, 0.018),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.12, 0.04, 0.0, 0.0, 0.045, 0.13), "bow": 0.11, "flat": 0.66, "power": 2.5},
        rear={"set": (0.13, 0.045, 0.0, 0.015, 0.04, 0.075), "bow": 0.05, "flat": 0.82, "power": 2.8},
        inset=0.03,
        shelf=0.035,
        flank=0.002,
        belly=0.008,
        tuck=0.08,
        sharp=(False, True, True, False, False),
        front_lift=0.03,
        paint=livery(rear=0.74),
        relief=lambda x, y: 0.016 * dome(x, y, 1.08, nose - 0.08, 0.6, 0.42) + 0.014 * dome(x, y, 1.08, nose - 0.04, 0.2, 0.09, soft=0.05),
    )
    front, back = car.front, car.back

    mask = [(-0.38, 0.605), (0.38, 0.605), (0.46, 0.705), (0.42, 0.768), (-0.42, 0.768), (-0.46, 0.705)]
    grille = car.hollow(front, mask, 0.045, mirror=False)
    grille.bars(19, axis=0, share=0.34)
    car.headlamp(
        front,
        [(0.5, 0.672), (0.9, 0.66), (1.06, 0.7), (1.12, 0.812), (0.76, 0.795), (0.48, 0.765)],
        projectors=[(0.64, 0.72, 0.04), (0.85, 0.73, 0.042)],
        strips=[[(0.52, 0.678), (0.9, 0.668), (1.04, 0.704), (1.085, 0.79), (1.065, 0.787), (1.02, 0.716), (0.9, 0.686), (0.52, 0.694)]],
    )
    intake = car.hollow(front, [(-0.66, 0.235), (0.66, 0.235), (0.6, 0.44), (-0.6, 0.44)], 0.07, mirror=False)
    intake.mesh(22, 5, share=0.18)
    car.hollow(front, [(0.72, 0.3), (0.99, 0.34), (1.0, 0.47), (0.72, 0.45)], 0.04)
    plate(car, front, 0.475)

    rearlamp(
        car,
        back,
        [(0.5, 0.88), (0.98, 0.872), (1.08, 0.9), (1.1, 1.016), (0.5, 1.016)],
        strips=[
            [(0.54, 0.982), (1.07, 0.982), (1.07, 1.002), (0.54, 1.002)],
            [(1.02, 0.9), (1.065, 0.908), (1.07, 0.982), (1.025, 0.982)],
            [(0.54, 0.89), (1.0, 0.886), (1.02, 0.906), (0.54, 0.91)],
        ],
        clear=[[(0.58, 0.928), (0.96, 0.928), (0.96, 0.962), (0.58, 0.962)]],
    )
    plate(car, back, 0.725, recess=0.02)
    left = trims(car, 0.36, 0.66, 0.31, 0.385)
    handles(car, [-0.02, -1.0], z=0.86)

    car.arches(0.034)
    car.cut()
    car.arch_lips(width=0.028, proud=0.008)
    rim(car, back, left, 0.012, "chrome", mirror=True)
    car.patch(car.top, ellipse((nose - 0.115, 0.0), (0.04, 0.045), 14), "chrome", lift=0.004, thickness=0.003, mirror=False)
    car.patch(front, [(0.73, 0.43), (0.98, 0.452), (0.98, 0.468), (0.73, 0.446)], "lens_clear", lift=-0.02, thickness=0.004, group="Headlights")
    badge(car, back, 0.945, radius=0.05)
    car.patch(back, slab(-0.86, 0.86, 0.405, 0.425), "lens_tail", lift=0.004, thickness=0.004, mirror=False)

    doors(car, 0.88, -0.24, -1.12, gap=0.034)
    car.bonnet(1.06, 0.74, front=nose - 0.15)
    car.stroke((-0.48, 0.6), (0.48, 0.6), back, steps=12, mirror=False)
    car.stroke((0.48, 0.6), (0.48, 1.02), back, steps=8)
    car.mirrors(0.84, material="trim_black")

    glass = car.cabin(
        screen=(1.08, 0.35),
        back=(-1.25, -2.05),
        roof=[(-1.25, 1.36), (-0.75, 1.43), (-0.2, 1.449), (0.35, 1.39)],
        windows=[((0.8, 0.24), (-0.2, -0.21)), ((-0.28, -0.29), (-1.1, -0.96)), ((-1.17, -1.02), (-1.64, -1.16))],
        base_inset=0.065,
        tumble=0.19,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.1),
        rail_bow=(0.08, 0.05),
        flat=(0.86, 0.8),
        power=(2.2, 2.4),
        sill=0.05,
        header=0.9,
    )
    pillar(car, (-0.2, -0.28), (-0.21, -0.29), high=0.11)
    pillar(car, (-1.1, -1.17), (-0.96, -1.02), high=0.11)
    car.wipers(glass)
    car.lip(stern + 0.11, car.lid(stern + 0.11, 0.0) + 0.008, 1.2, depth=0.1, thickness=0.024, material="body", sweep_back=0.04)
    fin(car, -1.0)
    car.interior(seat=0.05, rear_bench=-0.9)
    return car.finish("#1765b5")


CARS = {"skoda-octavia-rs": octavia_rs}
