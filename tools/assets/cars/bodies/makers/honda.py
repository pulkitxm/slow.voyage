from carkit import box, lathe
from kit import Coach


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def puck(car, caster, a, b, radius, material, sink, depth, group="Body", inner=0.0):
    hit, normal = caster(a, b)
    profile = [(inner, 0.0), (radius, 0.0), (radius, depth), (inner, depth)] if inner else [(0, 0.0), (radius, 0.0), (radius * 0.9, depth), (0, depth)]
    car.model.add(lathe(profile, material, origin=hit - normal * sink, axis=normal, segments=20), group)


def handle(car, x, z, size=(0.13, 0.016, 0.034)):
    hit, normal = car.side(x, z)
    car.model.add(box(hit + normal * (size[1] / 2 - 0.002), size, "body", bevel=0.005))


def s2000():
    car = Coach("honda-s2000", "five", root=0.07, tip=0.05, hub=0.07, dish=0.045)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.8), (-axle, 0.872), (-0.3, 0.85), (0.4, 0.845), (axle, 0.86), (nose - 0.3, 0.82), (nose, 0.72)],
        shoulder=[(stern, 0.875), (-axle, 0.895), (-0.4, 0.872), (0.58, 0.862), (axle, 0.795), (nose - 0.25, 0.69), (nose, 0.615)],
        waist=[(stern, 0.69), (-axle, 0.67), (0.0, 0.61), (axle, 0.58), (nose, 0.5)],
        sill=[(stern, 0.38), (-1.6, 0.25), (1.6, 0.25), (nose, 0.29)],
        crown=[(stern, 0.02), (-1.0, 0.02), (0.58, 0.03), (axle, 0.045), (nose, 0.03)],
        flare=(0.03, 0.036),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.13, 0.04, 0.006, 0.006, 0.06, 0.17), "bow": 0.16, "flat": 0.6, "power": 2.3},
        rear={"set": (0.13, 0.04, 0.006, 0.006, 0.02, 0.06), "bow": 0.08, "flat": 0.76, "power": 2.6},
        inset=0.035,
        shelf=0.05,
        flank=0.01,
        margin=0.0,
        sharp=(True, True, False, True, False),
    )
    front, back, side = car.front, car.back, car.side

    car.headlamp(
        front,
        [(0.42, 0.565), (0.72, 0.545), (1.02, 0.585), (1.14, 0.655), (1.08, 0.69), (0.76, 0.665), (0.44, 0.625)],
        projectors=[(0.6, 0.59, 0.034), (0.78, 0.6, 0.03)],
        strips=[[(0.9, 0.59), (1.02, 0.605), (1.1, 0.655), (1.06, 0.672), (0.9, 0.648)]],
    )
    mouth = car.hollow(front, [(-0.4, 0.27), (0.4, 0.27), (0.46, 0.42), (-0.46, 0.42)], 0.08, mirror=False)
    mouth.bars(2, share=0.12, sink=0.4)
    slot = car.hollow(front, [(0.58, 0.3), (0.86, 0.33), (0.86, 0.41), (0.58, 0.41)], 0.05)
    slot.bars(1, share=0.2, sink=0.4)
    car.patch(front, rect(-0.155, 0.155, 0.3, 0.46), "plate", lift=0.004, mirror=False)

    cluster = car.hollow(back, [(0.36, 0.695), (0.76, 0.685), (0.95, 0.735), (0.96, 0.81), (0.86, 0.852), (0.36, 0.842), (0.33, 0.77)], 0.024, material="lens_smoke")
    cluster.fill("lens_tail", sink=0.85, group="Taillights")
    for t, radius, core in ((0.79, 0.064, "lens_ember"), (0.62, 0.054, "lens_amber"), (0.46, 0.054, "lens_clear")):
        puck(car, back, t, 0.77, radius, "chrome", 0.024, 0.008)
        puck(car, back, t, 0.77, radius * 0.84, core, 0.024, 0.014, group="Taillights" if core == "lens_ember" else "Body")
    car.hollow(back, rect(-0.2, 0.2, 0.54, 0.73), 0.016, material="body", mirror=False)
    car.patch(back, rect(-0.155, 0.155, 0.555, 0.715), "plate", lift=-0.012, mirror=False)
    for y in (0.52, -0.52):
        car.carve(box((stern + 0.05, y, 0.3), (0.5, 0.16, 0.2), "underbody", bevel=0.02))
    car.hollow(side, rect(-0.42, -0.26, 0.76, 0.81), 0.012, material="body")
    car.tub(0.34, -0.96, 0.63)

    car.arches(0.04)
    car.cut()
    car.arch_lips(width=0.024, proud=0.008)
    car.pipes((0.52, -0.52), stern + 0.015, 0.325, radius=0.046, length=0.2)
    car.seams([0.5, -0.52])
    car.bonnet(0.62, 0.7, front=nose - 0.2)
    car.stroke((-0.74, 0.86), (0.74, 0.86), car.tail, steps=12, mirror=False)
    car.stroke((0.0, 0.5), (1.06, 0.5), back, steps=14)
    handle(car, -0.34, 0.785)
    car.mirrors(0.36, size=(0.07, 0.15, 0.09))
    car.model.absorb(box((stern + 0.075, 0, car.lid(stern + 0.075, 0) + 0.004), (0.02, 0.3, 0.012), "lens_tail"), "Taillights")
    car.windscreen(0.6, 0.0, car.height - 0.02, 0.68, 0.56, bow=0.14, material="body", side_glass=0.28)
    lid = car.lid(-1.1, 0)
    car.model.absorb(box((-1.1, 0, lid + 0.012), (0.3, 1.26, 0.06), "trim_black", bevel=0.025))
    for y in (0.33, -0.33):
        car.hoop(-0.9, y, 0.2, width=0.3, material="trim_black", tube=0.024)
    floor = car.cabin_floor
    car.seats(-0.52, floor, 0.33, height=0.42, width=0.44, material="seat")
    car.dashboard(0.16, floor + 0.2, 1.2, 0.33, height=0.1)
    return car.finish("#d8d8d6")


CARS = {"honda-s2000": s2000}
