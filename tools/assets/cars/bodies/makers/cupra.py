from kit import Coach
from volkswagen import dome, doors, fin, handles, pillar, plate, rails, rear_wiper, rearlamp, slab, spoiler, tips


def formentor_vz5():
    car = Coach("cupra-formentor-vz5", "split", metal="rim_dark", lip="rim", cap="rim_gold")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.84), (-axle, 0.92), (0.0, 0.89), (axle, 0.915), (nose - 0.36, 0.875), (nose, 0.8)],
        shoulder=[(stern, 1.08), (-1.5, 1.11), (-0.4, 1.04), (0.7, 1.0), (0.98, 0.985), (axle, 0.94), (nose - 0.4, 0.89), (nose - 0.12, 0.84), (nose, 0.815)],
        waist=[(stern, 0.95), (-axle, 0.98), (-0.5, 0.82), (0.5, 0.83), (axle, 0.89), (nose - 0.38, 0.78), (nose - 0.15, 0.62), (nose, 0.54)],
        sill=[(stern, 0.5), (-1.8, 0.35), (1.8, 0.35), (nose, 0.42)],
        crown=[(stern, 0.0), (0.9, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.03, 0.04),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.25],
        front={"set": (0.12, 0.04, 0.0, 0.0, 0.05, 0.14), "bow": 0.13, "flat": 0.62, "power": 2.4},
        rear={"set": (0.13, 0.04, 0.0, 0.02, 0.07, 0.12), "bow": 0.06, "flat": 0.8, "power": 2.6},
        inset=0.035,
        shelf=0.04,
        flank=0.004,
        belly=0.01,
        tuck=0.08,
        cladding=1,
        sharp=(False, True, True, False, False),
        front_lift=0.02,
        margin=0.003,
        relief=lambda x, y: 0.024 * dome(x, y, 0.98, nose - 0.08, 0.6, 0.34),
    )
    front, back = car.front, car.back

    mask = [(-0.36, 0.46), (0.36, 0.46), (0.52, 0.68), (0.47, 0.795), (-0.47, 0.795), (-0.52, 0.68)]
    grille = car.hollow(front, mask, 0.06, mirror=False)
    grille.mesh(18, 7, share=0.2)
    car.headlamp(
        front,
        [(0.55, 0.725), (0.95, 0.74), (1.1, 0.81), (1.08, 0.872), (0.78, 0.848), (0.53, 0.805)],
        projectors=[(0.66, 0.768, 0.03), (0.8, 0.782, 0.03)],
        strips=[[(0.92, 0.75), (1.06, 0.81), (0.94, 0.802)], [(0.76, 0.738), (0.9, 0.748), (0.82, 0.782)], [(0.58, 0.732), (0.74, 0.738), (0.66, 0.762)]],
    )
    intake = car.hollow(front, [(-0.46, 0.25), (0.46, 0.25), (0.4, 0.4), (-0.4, 0.4)], 0.06, mirror=False)
    intake.bars(3, share=0.16)
    duct = car.hollow(front, [(0.64, 0.32), (0.92, 0.38), (0.97, 0.66), (0.66, 0.62)], 0.06)
    duct.bars(4, share=0.18, sink=0.15)
    plate(car, front, 0.5)

    rearlamp(
        car,
        back,
        [(0.44, 1.0), (0.9, 0.99), (1.07, 1.012), (1.08, 1.076), (0.9, 1.078), (0.44, 1.064)],
        strips=[[(0.44, 1.024), (0.9, 1.02), (1.05, 1.03), (1.05, 1.054), (0.9, 1.048), (0.44, 1.046)], [(0.72, 0.998), (0.86, 0.996), (0.79, 1.014)], [(0.56, 1.002), (0.7, 0.999), (0.63, 1.016)]],
        smoke=True,
    )
    rearlamp(car, back, slab(-0.44, 0.44, 1.012, 1.058), strips=[slab(-0.44, 0.44, 1.026, 1.044)], smoke=True, mirror=False)
    plate(car, back, 0.8, recess=0.02)
    tips(car, (0.66,), 0.42, radius=0.044, material="rim_gold")
    tips(car, (0.52,), 0.335, radius=0.044, material="rim_gold")
    handles(car, [-0.14, -1.04], z=0.9)

    car.arches(0.05)
    car.cut()
    car.arch_lips(width=0.045, proud=0.012, material="trim_black")
    car.patch(front, [(-0.055, 0.7), (0.055, 0.7), (0.0, 0.762)], "rim_gold", lift=0.008, thickness=0.004, mirror=False)
    car.patch(back, [(-0.05, 0.94), (0.05, 0.94), (0.0, 0.995)], "rim_gold", lift=0.005, thickness=0.004, mirror=False)
    car.patch(back, slab(0.68, 0.96, 0.58, 0.604), "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.8, -0.38, -1.14, gap=0.05)
    car.bonnet(0.96, 0.74, front=nose - 0.16)
    car.stroke((-0.82, 0.7), (0.82, 0.7), back, steps=14, mirror=False)
    car.stroke((0.82, 0.7), (0.82, 0.985), back, steps=8)
    car.mirrors(0.72, material="trim_black")

    glass = car.cabin(
        screen=(0.98, 0.2),
        back=(-1.5, -2.06),
        roof=[(-1.5, 1.38), (-0.95, 1.472), (-0.25, 1.505), (0.2, 1.452)],
        windows=[((0.7, 0.09), (-0.34, -0.35)), ((-0.42, -0.43), (-1.14, -0.98)), ((-1.21, -1.04), (-1.68, -1.2))],
        base_inset=0.07,
        tumble=0.2,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.07),
        rail_bow=(0.08, 0.04),
        flat=(0.86, 0.82),
        power=(2.2, 2.5),
        sill=0.05,
        header=0.9,
    )
    pillar(car, (-0.34, -0.42), (-0.35, -0.43), high=0.11)
    pillar(car, (-1.14, -1.21), (-0.98, -1.04), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -2.0)
    rails(car, 0.0, -1.25, 0.5, lift=0.018, material="trim_black")
    spoiler(car, -1.5, 0.24, 1.04, fins=0.06)
    fin(car, -1.3)
    car.interior(seat=-0.05, rear_bench=-0.96)
    return car.finish("#34505c")


CARS = {"cupra-formentor-vz5": formentor_vz5}
