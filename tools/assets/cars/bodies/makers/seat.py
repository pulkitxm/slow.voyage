from kit import Coach
from volkswagen import dome, doors, fin, handles, livery, ovals, pillar, plate, rear_wiper, rearlamp, rim, slab, spoiler


def leon_cupra():
    car = Coach("seat-leon-cupra", "star", metal="rim", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.85), (-axle, 0.9), (0.0, 0.895), (axle, 0.895), (nose - 0.36, 0.87), (nose, 0.8)],
        shoulder=[(stern, 0.995), (-1.3, 1.02), (0.0, 0.955), (0.8, 0.93), (1.06, 0.915), (axle, 0.875), (nose - 0.4, 0.835), (nose - 0.12, 0.79), (nose, 0.77)],
        waist=[(stern, 0.88), (-axle, 0.9), (-0.55, 0.75), (0.5, 0.79), (axle, 0.84), (nose - 0.38, 0.74), (nose - 0.15, 0.58), (nose, 0.5)],
        sill=[(stern, 0.43), (-1.75, 0.3), (1.75, 0.3), (nose, 0.38)],
        crown=[(stern, 0.0), (1.0, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.02, 0.024),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.22],
        front={"set": (0.12, 0.04, 0.0, 0.0, 0.05, 0.14), "bow": 0.13, "flat": 0.62, "power": 2.4},
        rear={"set": (0.12, 0.04, 0.0, 0.025, 0.06, 0.1), "bow": 0.05, "flat": 0.8, "power": 2.7},
        inset=0.03,
        shelf=0.035,
        flank=0.004,
        belly=0.008,
        tuck=0.08,
        sharp=(False, True, True, False, False),
        front_lift=0.03,
        paint=livery(rear=0.7),
        relief=lambda x, y: 0.022 * dome(x, y, 1.06, nose - 0.08, 0.6, 0.3),
    )
    front, back = car.front, car.back

    mask = [(-0.3, 0.6), (0.3, 0.6), (0.4, 0.74), (-0.4, 0.74)]
    grille = car.hollow(front, mask, 0.045, mirror=False)
    grille.mesh(16, 4, share=0.2)
    car.headlamp(
        front,
        [(0.43, 0.69), (0.78, 0.632), (0.92, 0.648), (1.13, 0.8), (1.11, 0.825), (0.76, 0.79), (0.45, 0.75)],
        projectors=[(0.62, 0.708, 0.036), (0.8, 0.715, 0.038)],
        strips=[[(0.46, 0.694), (0.78, 0.641), (0.91, 0.656), (1.1, 0.798), (1.09, 0.814), (0.89, 0.678), (0.78, 0.662), (0.47, 0.712)]],
    )
    intake = car.hollow(front, [(-0.52, 0.225), (0.52, 0.225), (0.46, 0.44), (-0.46, 0.44)], 0.07, mirror=False)
    intake.mesh(18, 5, share=0.18)
    duct = car.hollow(front, [(0.6, 0.25), (0.95, 0.31), (0.99, 0.53), (0.62, 0.47)], 0.05)
    duct.bars(3, share=0.2, sink=0.15)
    plate(car, front, 0.465)

    rearlamp(
        car,
        back,
        [(0.34, 0.875), (0.66, 0.845), (0.98, 0.868), (1.09, 0.972), (0.76, 0.985), (0.34, 0.962)],
        strips=[
            [(0.37, 0.925), (0.76, 0.952), (1.05, 0.948), (0.98, 0.882), (0.94, 0.886), (0.99, 0.928), (0.76, 0.93), (0.37, 0.904)],
            [(0.62, 0.862), (0.9, 0.876), (0.93, 0.9), (0.62, 0.884)],
        ],
        clear=[[(0.38, 0.878), (0.58, 0.862), (0.58, 0.888), (0.38, 0.9)]],
    )
    plate(car, back, 0.685, recess=0.02)
    ovals(car, (0.52,), 0.335, half=(0.085, 0.048))
    handles(car, [-0.04, -1.04], z=0.86)

    car.arches(0.034)
    car.cut()
    car.arch_lips(width=0.028, proud=0.008)
    rim(car, front, mask, 0.01, "chrome")
    car.patch(front, [(-0.06, 0.648), (0.06, 0.648), (0.06, 0.7), (-0.06, 0.7)], "chrome", lift=0.006, thickness=0.004, mirror=False)
    car.patch(front, [(0.66, 0.49), (0.95, 0.535), (0.95, 0.553), (0.66, 0.508)], "lens_clear", lift=0.004, thickness=0.004, group="Headlights")
    car.patch(back, [(-0.055, 0.885), (0.055, 0.885), (0.055, 0.94), (-0.055, 0.94)], "chrome", lift=0.005, thickness=0.004, mirror=False)
    car.patch(back, slab(0.6, 0.92, 0.47, 0.492), "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.87, -0.26, -1.12, gap=0.034)
    car.bonnet(1.04, 0.74, front=nose - 0.16)
    car.stroke((-0.6, 0.62), (0.6, 0.62), back, steps=14, mirror=False)
    car.stroke((0.6, 0.62), (0.6, 0.975), back, steps=8)
    car.mirrors(0.82, material="trim_black")

    glass = car.cabin(
        screen=(1.06, 0.3),
        back=(-1.58, -1.98),
        roof=[(-1.58, 1.35), (-1.0, 1.415), (-0.2, 1.435), (0.3, 1.378)],
        windows=[((0.78, 0.19), (-0.22, -0.23)), ((-0.3, -0.31), (-1.34, -0.92))],
        base_inset=0.065,
        tumble=0.2,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.05),
        rail_bow=(0.08, 0.035),
        flat=(0.86, 0.84),
        power=(2.2, 2.6),
        sill=0.05,
        header=0.9,
    )
    pillar(car, (-0.22, -0.3), (-0.23, -0.31), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -1.94)
    spoiler(car, -1.58, 0.2, 1.06, fins=0.06)
    fin(car, -1.4)
    car.interior(seat=0.05, rear_bench=-0.88)
    return car.finish("#a81a1e")


CARS = {"seat-leon-cupra": leon_cupra}
