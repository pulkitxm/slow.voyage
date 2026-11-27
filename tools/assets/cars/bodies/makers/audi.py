from mathutils import Vector

from carkit import bar, box
from kit import Coach
from volkswagen import beltline, dome, doors, fin, handles, livery, ovals, pillar, plate, rails, rear_wiper, rearlamp, rim, slab, spoiler, tips, trims


def hexagon(half, low, high, waist=0.6, pinch=0.76, brow=0.9):
    middle = low + (high - low) * waist
    return [(-half * pinch, low), (half * pinch, low), (half, middle), (half * brow, high), (-half * brow, high), (-half, middle)]


def octagon(half, low, high, pinch=0.74, brow=0.82, knee=0.24, neck=0.76):
    tall = high - low
    return [
        (-half * pinch, low),
        (half * pinch, low),
        (half, low + tall * knee),
        (half, low + tall * neck),
        (half * brow, high),
        (-half * brow, high),
        (-half, low + tall * neck),
        (-half, low + tall * knee),
    ]


def ticks(start, step, count, low, high, width=0.02, lean=0.0):
    return [[(start + n * step, low), (start + n * step + width, low), (start + n * step + width + lean, high), (start + n * step + lean, high)] for n in range(count)]


def singleframe(car, outline, rows=0, columns=0, slats="chrome", frame=None, width=0.016, depth=0.055, share=0.26, tag=None, emblem="chrome"):
    pocket = car.hollow(car.front, outline, depth, mirror=False)
    if slats == "mesh":
        pocket.mesh(columns, rows, share=0.2)
    else:
        if rows:
            pocket.bars(rows, material=slats, share=share)
        if columns:
            pocket.bars(columns, material=slats, axis=0, share=share)
    if frame:
        rim(car, car.front, outline, width, frame)
    if tag is not None:
        plate(car, car.front, tag)
    if emblem:
        high = max(p[1] for p in outline)
        car.patch(car.front, slab(-0.1, 0.1, high - 0.072, high - 0.036), emblem, lift=0.006, thickness=0.004, mirror=False)
    return pocket


def emblem(car, height, material="chrome"):
    car.patch(car.back, slab(-0.11, 0.11, height, height + 0.038), material, lift=0.005, thickness=0.004, mirror=False)


def a3():
    car = Coach("audi-a3-2-0-tfsi", "five")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.855), (-axle, 0.895), (0.0, 0.9), (axle, 0.895), (nose - 0.36, 0.87), (nose, 0.8)],
        shoulder=[(stern, 0.985), (-1.5, 1.0), (0.0, 0.955), (0.78, 0.935), (1.06, 0.92), (axle, 0.878), (nose - 0.4, 0.84), (nose - 0.12, 0.8), (nose, 0.78)],
        waist=[(stern, 0.91), (-axle, 0.915), (0.0, 0.885), (axle, 0.858), (nose - 0.38, 0.76), (nose - 0.15, 0.6), (nose, 0.52)],
        sill=[(stern, 0.44), (-1.75, 0.335), (1.75, 0.3), (nose, 0.38)],
        crown=[(stern, 0.0), (1.0, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.016, 0.018),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.22],
        front={"set": (0.12, 0.04, 0.0, 0.0, 0.045, 0.13), "bow": 0.11, "flat": 0.66, "power": 2.5},
        rear={"set": (0.12, 0.04, 0.0, 0.02, 0.06, 0.1), "bow": 0.05, "flat": 0.8, "power": 2.7},
        inset=0.03,
        shelf=0.035,
        flank=0.002,
        belly=0.008,
        tuck=0.08,
        sharp=(False, True, True, False, False),
        front_lift=0.03,
        paint=livery(rear=0.7),
        relief=lambda x, y: 0.02 * dome(x, y, 1.06, nose - 0.08, 0.6, 0.38),
    )
    front, back = car.front, car.back

    singleframe(car, hexagon(0.4, 0.33, 0.745, waist=0.7, pinch=0.78, brow=0.86), rows=7, slats="trim_black", frame="chrome", share=0.34, tag=0.39)
    car.headlamp(
        front,
        [(0.44, 0.685), (0.76, 0.655), (1.04, 0.69), (1.11, 0.8), (0.76, 0.788), (0.44, 0.755)],
        projectors=[(0.6, 0.72, 0.038), (0.8, 0.728, 0.04)],
        strips=[[(0.46, 0.742), (0.76, 0.772), (1.07, 0.785), (1.02, 0.705), (0.99, 0.71), (1.035, 0.768), (0.76, 0.756), (0.46, 0.728)]],
    )
    duct = car.hollow(front, [(0.52, 0.3), (0.96, 0.35), (0.98, 0.52), (0.52, 0.5)], 0.05)
    duct.bars(3, share=0.2, sink=0.15)

    rearlamp(
        car,
        back,
        [(0.36, 0.862), (0.7, 0.842), (1.0, 0.862), (1.09, 0.968), (0.72, 0.978), (0.36, 0.958)],
        strips=[
            [(0.39, 0.928), (0.72, 0.95), (1.05, 0.946), (1.0, 0.878), (0.96, 0.882), (1.0, 0.926), (0.72, 0.93), (0.39, 0.91)],
            [(0.62, 0.856), (0.9, 0.868), (0.93, 0.892), (0.62, 0.878)],
        ],
        clear=[[(0.4, 0.874), (0.58, 0.86), (0.58, 0.888), (0.4, 0.896)]],
    )
    plate(car, back, 0.68, recess=0.02)
    tips(car, (0.58, 0.46), 0.335, radius=0.04, mirror=False)
    handles(car, [-0.04, -1.0], z=0.855)

    car.arches(0.034)
    car.cut()
    car.arch_lips(width=0.026, proud=0.007)
    car.disc(front, 0.8, 0.42, 0.03, "drl", bezel="chrome", sink=0.035)
    emblem(car, 0.885)
    car.patch(back, slab(0.6, 0.92, 0.47, 0.492), "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.86, -0.26, -1.12, gap=0.034)
    car.bonnet(1.04, 0.74, front=nose - 0.15)
    car.stroke((-0.6, 0.62), (0.6, 0.62), back, steps=14, mirror=False)
    car.stroke((0.6, 0.62), (0.6, 0.97), back, steps=8)
    car.mirrors(0.82)

    glass = car.cabin(
        screen=(1.06, 0.33),
        back=(-1.66, -2.03),
        roof=[(-1.66, 1.345), (-1.0, 1.405), (-0.2, 1.426), (0.33, 1.37)],
        windows=[((0.78, 0.22), (-0.22, -0.23)), ((-0.3, -0.31), (-1.1, -1.02)), ((-1.17, -1.08), (-1.66, -1.3))],
        base_inset=0.065,
        tumble=0.19,
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
    pillar(car, (-1.1, -1.17), (-1.02, -1.08), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -1.99)
    beltline(car, 0.76, -1.66)
    spoiler(car, -1.66, 0.17, 1.02)
    fin(car, -1.45)
    car.interior(seat=0.05, rear_bench=-0.88)
    return car.finish("#223f6b")


def rs3():
    car = Coach("audi-rs-3", "split", metal="rim_dark", lip="rim")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.85), (-axle, 0.885), (0.0, 0.88), (axle, 0.9), (nose - 0.36, 0.88), (nose, 0.82)],
        shoulder=[(stern, 1.0), (-1.5, 1.03), (0.0, 0.97), (0.78, 0.945), (1.04, 0.93), (axle, 0.885), (nose - 0.4, 0.84), (nose - 0.12, 0.79), (nose, 0.768)],
        waist=[(stern, 0.9), (-axle, 0.92), (-0.5, 0.82), (0.5, 0.8), (axle, 0.86), (nose - 0.38, 0.74), (nose - 0.15, 0.58), (nose, 0.5)],
        sill=[(stern, 0.44), (-1.75, 0.3), (1.75, 0.3), (nose, 0.36)],
        crown=[(stern, 0.0), (1.0, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.04, 0.026),
        keys=[nose - 0.38, axle, 0.45, -0.45, -axle, stern + 0.22],
        front={"set": (0.11, 0.035, 0.0, 0.0, 0.05, 0.14), "bow": 0.11, "flat": 0.68, "power": 2.6},
        rear={"set": (0.12, 0.04, 0.0, 0.02, 0.06, 0.1), "bow": 0.05, "flat": 0.82, "power": 2.8},
        inset=0.03,
        shelf=0.035,
        flank=0.004,
        belly=0.01,
        tuck=0.08,
        sharp=(False, True, True, False, False),
        front_lift=0.02,
        margin=0.002,
        paint=livery(sides=1),
        relief=lambda x, y: 0.022 * dome(x, y, 1.04, nose - 0.08, 0.6, 0.4),
    )
    front, back = car.front, car.back

    mask = [(-0.4, 0.24), (0.4, 0.24), (0.54, 0.4), (0.54, 0.6), (0.46, 0.7), (-0.46, 0.7), (-0.54, 0.6), (-0.54, 0.4)]
    singleframe(car, mask, rows=9, columns=22, slats="mesh", depth=0.07, tag=0.37, emblem="trim_black")
    for left, right in ((-0.36, -0.14), (-0.11, 0.11), (0.14, 0.36)):
        car.hollow(front, slab(left, right, 0.716, 0.738), 0.03, mirror=False)
    car.headlamp(
        front,
        [(0.57, 0.705), (0.94, 0.675), (1.1, 0.712), (1.11, 0.812), (0.82, 0.794), (0.57, 0.757)],
        projectors=[(0.66, 0.732, 0.026), (0.76, 0.737, 0.026)],
        strips=[slab(0.86 + column * 0.058, 0.9 + column * 0.058, 0.69 + row * 0.034 + column * 0.008, 0.714 + row * 0.034 + column * 0.008) for column in range(4) for row in range(3)],
    )
    duct = car.hollow(front, [(0.62, 0.26), (0.95, 0.3), (1.0, 0.62), (0.66, 0.6)], 0.06)
    duct.bars(1, material="body", axis=0, share=0.1, sink=0.05)
    duct.mesh(5, 6, share=0.2, sink=0.5)
    car.hollow(car.side, [(axle - 0.4, 0.34), (axle - 0.47, 0.34), (axle - 0.45, 0.66), (axle - 0.4, 0.68)], 0.03)

    rearlamp(
        car,
        back,
        [(0.36, 0.875), (0.7, 0.855), (1.0, 0.875), (1.09, 0.982), (0.72, 0.992), (0.36, 0.968)],
        strips=[
            [(0.39, 0.94), (0.72, 0.964), (1.05, 0.96), (1.0, 0.892), (0.96, 0.896), (1.0, 0.94), (0.72, 0.944), (0.39, 0.922)],
            [(0.4, 0.884), (0.5, 0.878), (0.52, 0.9), (0.42, 0.906)],
            [(0.55, 0.875), (0.65, 0.869), (0.67, 0.893), (0.57, 0.898)],
            [(0.7, 0.868), (0.8, 0.868), (0.82, 0.892), (0.72, 0.891)],
        ],
        smoke=True,
    )
    plate(car, back, 0.69, recess=0.02)
    lower = car.hollow(back, [(-0.36, 0.24), (0.36, 0.24), (0.36, 0.42), (-0.36, 0.42)], 0.05, mirror=False)
    lower.mesh(10, 4, share=0.2)
    ovals(car, (0.54,), 0.32, half=(0.105, 0.062))
    handles(car, [-0.06, -1.0], z=0.875)

    car.arches(0.03)
    car.cut()
    car.arch_lips(width=0.03, proud=0.012)
    emblem(car, 0.9, material="trim_black")
    car.patch(back, [(0.84, 0.48), (0.9, 0.48), (0.9, 0.6), (0.84, 0.58)], "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.8, -0.28, -1.12, gap=0.03)
    car.bonnet(1.02, 0.74, front=nose - 0.16)
    car.stroke((-0.6, 0.63), (0.6, 0.63), back, steps=14, mirror=False)
    car.stroke((0.6, 0.63), (0.6, 0.985), back, steps=8)
    car.mirrors(0.8, material="trim_black")

    glass = car.cabin(
        screen=(1.04, 0.3),
        back=(-1.62, -2.04),
        roof=[(-1.62, 1.345), (-1.0, 1.41), (-0.2, 1.436), (0.3, 1.38)],
        windows=[((0.76, 0.19), (-0.24, -0.25)), ((-0.32, -0.33), (-1.1, -1.0)), ((-1.17, -1.06), (-1.64, -1.26))],
        base_inset=0.07,
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
    pillar(car, (-0.24, -0.32), (-0.25, -0.33), high=0.11)
    pillar(car, (-1.1, -1.17), (-1.0, -1.06), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -2.0)
    spoiler(car, -1.62, 0.22, 1.04, fins=0.07)
    fin(car, -1.42)
    car.interior(seat=0.03, rear_bench=-0.88)
    return car.finish("#5fa038")


def tt_rs():
    car = Coach("audi-tt-rs", "seven")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.8), (-axle, 0.9), (-0.2, 0.875), (axle, 0.895), (nose - 0.34, 0.86), (nose, 0.78)],
        shoulder=[(stern, 0.878), (-1.75, 0.915), (-axle, 0.95), (-0.4, 0.92), (0.5, 0.89), (0.92, 0.875), (axle, 0.84), (nose - 0.4, 0.8), (nose - 0.12, 0.755), (nose, 0.735)],
        waist=[(stern, 0.83), (-axle, 0.865), (0.0, 0.82), (axle, 0.795), (nose - 0.36, 0.7), (nose - 0.14, 0.56), (nose, 0.5)],
        sill=[(stern, 0.42), (-1.65, 0.27), (1.65, 0.27), (nose, 0.34)],
        crown=[(stern, 0.055), (-1.75, 0.095), (-1.4, 0.09), (-1.0, 0.06), (0.8, 0.045), (axle, 0.065), (nose, 0.05)],
        flare=(0.045, 0.05),
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.3],
        front={"set": (0.11, 0.035, 0.0, 0.0, 0.04, 0.115), "bow": 0.13, "flat": 0.6, "power": 2.3},
        rear={"set": (0.18, 0.07, 0.015, 0.0, 0.04, 0.12), "bow": 0.14, "flat": 0.62, "power": 2.2},
        inset=0.045,
        shelf=0.05,
        flank=0.006,
        belly=0.012,
        tuck=0.09,
        sharp=(False, True, True, False, False),
        front_lift=0.02,
        paint=livery(rear=0.66),
        relief=lambda x, y: 0.02 * dome(x, y, 0.95, nose - 0.08, 0.56, 0.4),
    )
    front, back = car.front, car.back

    mask = [(-0.38, 0.27), (0.38, 0.27), (0.52, 0.42), (0.52, 0.6), (0.44, 0.69), (-0.44, 0.69), (-0.52, 0.6), (-0.52, 0.42)]
    singleframe(car, mask, rows=8, columns=20, slats="mesh", depth=0.07, tag=0.345, emblem="chrome")
    car.headlamp(
        front,
        [(0.56, 0.688), (0.92, 0.668), (1.07, 0.712), (1.08, 0.8), (0.8, 0.782), (0.57, 0.738)],
        projectors=[(0.68, 0.714, 0.026), (0.79, 0.722, 0.028)],
        strips=ticks(0.87, 0.045, 4, 0.688, 0.765, width=0.022, lean=0.012) + [[(0.58, 0.692), (0.84, 0.678), (0.84, 0.69), (0.58, 0.704)]],
    )
    duct = car.hollow(front, [(0.62, 0.26), (0.93, 0.3), (0.97, 0.57), (0.64, 0.56)], 0.06)
    duct.mesh(5, 5, share=0.2, sink=0.5)
    duct.bars(1, material="steel", axis=0, share=0.1, sink=0.05)

    rearlamp(
        car,
        back,
        [(0.38, 0.75), (0.78, 0.745), (0.99, 0.77), (1.01, 0.847), (0.78, 0.853), (0.38, 0.833)],
        strips=[[(0.41, 0.807), (0.78, 0.823), (0.98, 0.821), (0.98, 0.837), (0.78, 0.841), (0.41, 0.823)]] + ticks(0.46, 0.085, 6, 0.757, 0.797, width=0.022),
        smoke=True,
    )
    plate(car, back, 0.54, recess=0.018)
    lower = car.hollow(back, [(-0.34, 0.22), (0.34, 0.22), (0.34, 0.4), (-0.34, 0.4)], 0.05, mirror=False)
    lower.mesh(10, 4, share=0.2)
    ovals(car, (0.52,), 0.31, half=(0.1, 0.06))
    handles(car, [-0.1], z=0.81)

    car.arches(0.03)
    car.cut()
    car.arch_lips(width=0.05, proud=0.018)
    car.patch(back, slab(-0.36, 0.36, 0.85, 0.86), "lens_ember", lift=0.004, thickness=0.004, group="Taillights", mirror=False)
    emblem(car, 0.762)
    cap = car.side(-1.05, 0.86)
    car.model.absorb(box((cap[0].x, -cap[0].y - 0.002, cap[0].z), (0.13, 0.012, 0.13), "steel", bevel=0.045))

    car.seams([0.68, -0.4])
    car.bonnet(0.93, 0.7, front=nose - 0.17)
    car.mirrors(0.62, material="steel")
    car.wing(stern + 0.17, car.lid(stern + 0.17, 0.0) + 0.115, 1.22, chord=0.2, thickness=0.032, angle=5, plates=(0.07, 0.2), pylons=(0.38,), plate_material="body")

    glass = car.cabin(
        screen=(0.95, 0.2),
        back=(-0.72, -1.68),
        roof=[(-0.72, 1.272), (-0.42, 1.324), (-0.12, 1.344), (0.2, 1.3)],
        windows=[((0.66, 0.1), (-0.34, -0.32)), ((-0.41, -0.38), (-1.05, -0.58))],
        base_inset=0.085,
        tumble=0.2,
        drop=0.045,
        crest=0.1,
        bow=(0.16, 0.12),
        rail_bow=(0.08, 0.07),
        flat=(0.86, 0.76),
        power=(2.2, 2.2),
        bulge=0.022,
        sill=0.06,
        header=0.88,
    )
    pillar(car, (-0.34, -0.41), (-0.32, -0.38), high=0.1)
    car.wipers(glass)
    car.interior(seat=-0.14, spread=0.33, height=0.14)
    return car.finish("#1c78c8")


def rs_q3():
    car = Coach("audi-rs-q3", "split", metal="rim_dark", lip="rim")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.86), (-axle, 0.915), (0.0, 0.895), (axle, 0.915), (nose - 0.36, 0.885), (nose, 0.82)],
        shoulder=[(stern, 1.13), (-1.7, 1.15), (-1.1, 1.12), (0.0, 1.07), (0.78, 1.045), (1.08, 1.03), (axle, 0.995), (nose - 0.4, 0.96), (nose - 0.12, 0.93), (nose, 0.915)],
        waist=[(stern, 1.0), (-axle, 1.03), (-0.5, 0.92), (0.5, 0.91), (axle, 0.96), (nose - 0.36, 0.86), (nose - 0.14, 0.68), (nose, 0.6)],
        sill=[(stern, 0.54), (-1.8, 0.37), (1.8, 0.37), (nose, 0.44)],
        crown=[(stern, 0.0), (1.05, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.03, 0.036),
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.11, 0.035, 0.0, 0.0, 0.035, 0.1), "bow": 0.11, "flat": 0.68, "power": 2.6},
        rear={"set": (0.13, 0.045, 0.0, 0.02, 0.07, 0.12), "bow": 0.06, "flat": 0.8, "power": 2.7},
        inset=0.035,
        shelf=0.04,
        flank=0.004,
        belly=0.01,
        tuck=0.08,
        cladding=1,
        sharp=(False, True, True, False, False),
        margin=0.003,
        relief=lambda x, y: 0.022 * dome(x, y, 1.08, nose - 0.08, 0.62, 0.44),
    )
    front, back = car.front, car.back

    singleframe(car, octagon(0.5, 0.4, 0.88), rows=10, columns=20, slats="mesh", depth=0.07, tag=0.5, emblem="trim_black")
    car.headlamp(
        front,
        [(0.55, 0.815), (0.9, 0.815), (1.08, 0.86), (1.1, 0.955), (0.8, 0.935), (0.54, 0.892)],
        projectors=[(0.68, 0.85, 0.03), (0.82, 0.862, 0.03)],
        strips=[[(0.57, 0.822), (0.9, 0.823), (1.06, 0.864), (1.075, 0.935), (1.055, 0.932), (1.04, 0.874), (0.9, 0.839), (0.57, 0.837)]] + ticks(0.6, 0.06, 4, 0.868, 0.9, width=0.02),
    )
    duct = car.hollow(front, [(0.64, 0.4), (0.96, 0.44), (1.0, 0.74), (0.66, 0.72)], 0.06)
    duct.mesh(5, 6, share=0.2, sink=0.5)
    duct.bars(1, material="body", axis=0, share=0.1, sink=0.05)

    rearlamp(
        car,
        back,
        [(0.4, 0.99), (0.8, 0.98), (1.06, 1.005), (1.09, 1.112), (0.8, 1.124), (0.4, 1.1)],
        strips=[[(0.43, 1.07), (0.8, 1.092), (1.06, 1.086), (1.04, 1.022), (1.0, 1.02), (1.015, 1.064), (0.8, 1.07), (0.43, 1.05)]] + ticks(0.45, 0.085, 5, 0.998, 1.03, width=0.03),
        smoke=True,
    )
    plate(car, back, 0.8, recess=0.02)
    lower = car.hollow(back, [(-0.4, 0.3), (0.4, 0.3), (0.4, 0.48), (-0.4, 0.48)], 0.05, mirror=False)
    lower.mesh(10, 4, share=0.2)
    ovals(car, (0.58,), 0.38, half=(0.105, 0.064))
    handles(car, [-0.04, -1.0], z=0.985)

    car.arches(0.05)
    car.cut()
    car.arch_lips(width=0.04, proud=0.014, material="trim_black")
    emblem(car, 1.02, material="trim_black")
    car.patch(back, slab(0.64, 0.94, 0.62, 0.644), "lens_tail", lift=0.004, thickness=0.004)

    doors(car, 0.88, -0.28, -1.12, gap=0.05)
    car.bonnet(1.06, 0.76, front=nose - 0.13)
    car.stroke((-0.84, 0.72), (0.84, 0.72), back, steps=14, mirror=False)
    car.stroke((0.84, 0.72), (0.84, 0.98), back, steps=8)
    car.mirrors(0.82, material="trim_black")

    glass = car.cabin(
        screen=(1.08, 0.36),
        back=(-1.7, -2.08),
        roof=[(-1.7, 1.515), (-1.0, 1.583), (-0.2, 1.602), (0.36, 1.55)],
        windows=[((0.8, 0.25), (-0.24, -0.25)), ((-0.32, -0.33), (-1.1, -1.04)), ((-1.17, -1.11), (-1.74, -1.42))],
        base_inset=0.07,
        tumble=0.19,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.06),
        rail_bow=(0.08, 0.04),
        flat=(0.86, 0.84),
        power=(2.2, 2.6),
        sill=0.05,
        header=0.89,
    )
    pillar(car, (-0.24, -0.32), (-0.25, -0.33), high=0.11)
    pillar(car, (-1.1, -1.17), (-1.04, -1.11), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -2.04)
    rails(car, 0.15, -1.45, 0.53, lift=0.02, material="trim_black")
    spoiler(car, -1.7, 0.26, 1.02, fins=0.07)
    fin(car, -1.45)
    car.interior(seat=0.06, rear_bench=-0.9)
    return car.finish("#787b7d")


def a6():
    car = Coach("audi-a6-3-0-tdi", "ten")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.83), (-axle, 0.9), (0.0, 0.9), (axle, 0.9), (nose - 0.4, 0.875), (nose, 0.8)],
        shoulder=[(stern, 1.035), (-2.04, 1.05), (-1.36, 1.02), (0.0, 0.965), (0.74, 0.94), (1.05, 0.925), (axle, 0.885), (nose - 0.42, 0.845), (nose - 0.12, 0.8), (nose, 0.778)],
        waist=[(stern, 0.93), (-axle, 0.935), (-0.7, 0.82), (0.7, 0.8), (axle, 0.858), (nose - 0.4, 0.74), (nose - 0.15, 0.58), (nose, 0.5)],
        sill=[(stern, 0.45), (-2.0, 0.3), (2.0, 0.3), (nose, 0.38)],
        crown=[(stern, 0.02), (-2.04, 0.035), (1.0, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.024, 0.026),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.28],
        front={"set": (0.13, 0.04, 0.0, 0.0, 0.05, 0.14), "bow": 0.12, "flat": 0.66, "power": 2.5},
        rear={"set": (0.14, 0.05, 0.0, 0.01, 0.035, 0.07), "bow": 0.06, "flat": 0.8, "power": 2.7},
        inset=0.03,
        shelf=0.035,
        flank=0.004,
        belly=0.01,
        tuck=0.08,
        sharp=(False, True, True, False, False),
        front_lift=0.03,
        margin=0.003,
        paint=livery(rear=0.72),
        relief=lambda x, y: 0.02 * dome(x, y, 1.05, nose - 0.08, 0.62, 0.48),
    )
    front, back = car.front, car.back

    singleframe(car, hexagon(0.56, 0.33, 0.752, waist=0.46, pinch=0.74, brow=0.9), rows=6, slats="chrome", frame="chrome", width=0.018, share=0.3, tag=0.4)
    car.headlamp(
        front,
        [(0.6, 0.71), (0.95, 0.692), (1.1, 0.728), (1.12, 0.808), (0.82, 0.79), (0.58, 0.758)],
        projectors=[(0.7, 0.732, 0.024), (0.8, 0.737, 0.024), (0.9, 0.743, 0.024)],
        strips=ticks(0.64, 0.066, 6, 0.762, 0.782, width=0.04, lean=0.006) + [[(0.98, 0.705), (1.08, 0.732), (1.1, 0.795), (1.075, 0.792), (1.06, 0.742), (0.98, 0.722)]],
    )
    duct = car.hollow(front, [(0.66, 0.3), (0.98, 0.34), (1.0, 0.54), (0.68, 0.52)], 0.05)
    duct.bars(3, share=0.2, sink=0.15)

    rearlamp(
        car,
        back,
        [(0.42, 0.915), (0.84, 0.905), (1.07, 0.925), (1.1, 1.0), (0.84, 1.016), (0.42, 1.006)],
        strips=[[(0.45, 0.975), (0.84, 0.986), (1.07, 0.978), (1.07, 0.994), (0.84, 1.003), (0.45, 0.992)]] + ticks(0.47, 0.075, 8, 0.922, 0.962, width=0.024),
        smoke=True,
    )
    plate(car, back, 0.735, recess=0.02)
    left = trims(car, 0.42, 0.76, 0.31, 0.385)
    handles(car, [-0.2, -1.12], z=0.85, material="chrome")

    car.arches(0.036)
    car.cut()
    car.arch_lips(width=0.026, proud=0.008)
    rim(car, back, left, 0.012, "chrome", mirror=True)
    car.patch(front, [(0.66, 0.3), (0.98, 0.34), (0.98, 0.356), (0.66, 0.316)], "chrome", lift=0.006, thickness=0.004)
    car.patch(back, slab(-0.42, 0.42, 0.955, 0.97), "chrome", lift=0.005, thickness=0.004, mirror=False)
    emblem(car, 0.89)
    car.patch(back, slab(-0.82, 0.82, 0.455, 0.47), "chrome", lift=0.005, thickness=0.004, mirror=False)
    car.patch(back, slab(0.64, 0.96, 0.5, 0.522), "lens_tail", lift=0.004, thickness=0.004)
    car.patch(car.side, [(0.9, 0.33), (-1.05, 0.33), (-1.05, 0.346), (0.9, 0.346)], "chrome", lift=0.004, thickness=0.004)

    doors(car, 0.9, -0.4, -1.24, gap=0.036)
    car.bonnet(1.03, 0.76, front=nose - 0.15)
    car.stroke((-0.84, 0.62), (0.84, 0.62), back, steps=14, mirror=False)
    car.stroke((0.84, 0.62), (0.84, 0.9), back, steps=6)
    car.stroke((-2.06, 0.74), (stern + 0.08, 0.76), car.top, steps=8)
    car.mirrors(0.78)

    glass = car.cabin(
        screen=(1.05, 0.25),
        back=(-1.36, -2.04),
        roof=[(-1.36, 1.365), (-0.85, 1.44), (-0.3, 1.457), (0.25, 1.4)],
        windows=[((0.76, 0.13), (-0.36, -0.37)), ((-0.44, -0.45), (-1.3, -1.05)), ((-1.37, -1.11), (-1.86, -1.27))],
        base_inset=0.07,
        tumble=0.2,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.1),
        rail_bow=(0.08, 0.05),
        flat=(0.86, 0.8),
        power=(2.2, 2.4),
        sill=0.05,
        header=0.9,
    )
    pillar(car, (-0.36, -0.44), (-0.37, -0.45), high=0.11)
    pillar(car, (-1.3, -1.37), (-1.05, -1.11), high=0.11)
    beltline(car, 0.74, -1.86)
    car.wipers(glass)
    car.lip(stern + 0.07, car.lid(stern + 0.07, 0.0) + 0.006, 1.3, depth=0.06, thickness=0.018, material="body", sweep_back=0.03)
    fin(car, -1.1)
    car.interior(seat=0.0, rear_bench=-0.98)
    return car.finish("#25344d")


def a8():
    car = Coach("audi-a8-3-0-tdi", "ten")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.84), (-axle, 0.9), (0.0, 0.905), (axle, 0.9), (nose - 0.42, 0.88), (nose, 0.82)],
        shoulder=[(stern, 1.06), (-2.12, 1.075), (-1.45, 1.05), (0.0, 1.0), (0.78, 0.98), (1.08, 0.965), (axle, 0.93), (nose - 0.42, 0.895), (nose - 0.12, 0.86), (nose, 0.84)],
        waist=[(stern, 0.9), (-axle, 0.9), (0.0, 0.875), (axle, 0.86), (nose - 0.42, 0.79), (nose - 0.15, 0.62), (nose, 0.54)],
        sill=[(stern, 0.46), (-2.05, 0.31), (2.05, 0.31), (nose, 0.4)],
        crown=[(stern, 0.02), (-2.12, 0.035), (1.05, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.02, 0.022),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.28],
        front={"set": (0.12, 0.04, 0.0, 0.0, 0.035, 0.1), "bow": 0.1, "flat": 0.7, "power": 2.7},
        rear={"set": (0.14, 0.05, 0.0, 0.01, 0.03, 0.06), "bow": 0.06, "flat": 0.82, "power": 2.8},
        inset=0.03,
        shelf=0.035,
        flank=0.004,
        belly=0.008,
        tuck=0.08,
        sharp=(False, True, True, False, False),
        front_lift=0.03,
        margin=0.003,
        paint=livery(rear=0.72),
        relief=lambda x, y: 0.02 * dome(x, y, 1.08, nose - 0.08, 0.64, 0.52),
    )
    front, back = car.front, car.back

    singleframe(car, hexagon(0.62, 0.36, 0.815, waist=0.44, pinch=0.8, brow=0.9), rows=8, slats="chrome", frame="chrome", width=0.024, share=0.4, tag=0.44)
    car.headlamp(
        front,
        [(0.66, 0.755), (1.0, 0.75), (1.13, 0.784), (1.14, 0.866), (0.86, 0.852), (0.64, 0.824)],
        projectors=[(0.74, 0.788, 0.024), (0.84, 0.794, 0.024), (0.94, 0.8, 0.024)],
        strips=[[(0.68, 0.761), (1.0, 0.757), (1.11, 0.788), (1.11, 0.803), (1.0, 0.772), (0.68, 0.775)], [(0.68, 0.818), (0.86, 0.836), (1.1, 0.848), (1.1, 0.86), (0.86, 0.848), (0.68, 0.83)]],
    )
    duct = car.hollow(front, [(0.72, 0.32), (1.02, 0.36), (1.03, 0.5), (0.74, 0.48)], 0.05)
    duct.bars(2, material="chrome", share=0.16, sink=0.15)

    rearlamp(
        car,
        back,
        [(0.34, 0.958), (0.88, 0.948), (1.1, 0.964), (1.13, 1.03), (0.88, 1.042), (0.34, 1.036)],
        strips=[[(0.36, 1.004), (0.88, 1.01), (1.1, 1.004), (1.1, 1.02), (0.88, 1.027), (0.36, 1.02)]] + ticks(0.4, 0.07, 10, 0.964, 0.994, width=0.02),
        smoke=True,
    )
    rearlamp(car, back, slab(-0.34, 0.34, 0.966, 1.034), strips=[slab(-0.34, 0.34, 1.004, 1.02)], smoke=True, mirror=False)
    plate(car, back, 0.77, recess=0.02)
    left = trims(car, 0.44, 0.8, 0.31, 0.38)
    handles(car, [-0.16, -1.2], z=0.89, material="chrome")

    car.arches(0.036)
    car.cut()
    car.arch_lips(width=0.024, proud=0.007)
    rim(car, back, left, 0.012, "chrome", mirror=True)
    car.patch(front, slab(-0.66, 0.66, 0.29, 0.305), "chrome", lift=0.006, thickness=0.004, mirror=False)
    car.patch(back, slab(-1.04, 1.04, 0.925, 0.94), "chrome", lift=0.005, thickness=0.004, mirror=False)
    emblem(car, 0.885)
    car.patch(back, slab(-0.86, 0.86, 0.455, 0.47), "chrome", lift=0.005, thickness=0.004, mirror=False)
    car.patch(back, slab(0.66, 0.98, 0.5, 0.522), "lens_tail", lift=0.004, thickness=0.004)
    car.patch(car.side, [(0.94, 0.34), (-1.1, 0.34), (-1.1, 0.358), (0.94, 0.358)], "chrome", lift=0.004, thickness=0.004)

    doors(car, 0.92, -0.38, -1.3, gap=0.036)
    car.bonnet(1.06, 0.78, front=nose - 0.13)
    car.stroke((-0.86, 0.64), (0.86, 0.64), back, steps=14, mirror=False)
    car.stroke((0.86, 0.64), (0.86, 0.92), back, steps=6)
    car.stroke((-2.14, 0.76), (stern + 0.07, 0.78), car.top, steps=8)
    car.mirrors(0.8)

    glass = car.cabin(
        screen=(1.08, 0.28),
        back=(-1.5, -2.12),
        roof=[(-1.5, 1.39), (-0.95, 1.458), (-0.4, 1.473), (0.28, 1.415)],
        windows=[((0.78, 0.16), (-0.34, -0.35)), ((-0.42, -0.43), (-1.38, -1.16)), ((-1.45, -1.22), (-1.94, -1.4))],
        base_inset=0.07,
        tumble=0.19,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.09),
        rail_bow=(0.08, 0.05),
        flat=(0.86, 0.82),
        power=(2.2, 2.5),
        sill=0.05,
        header=0.9,
    )
    pillar(car, (-0.34, -0.42), (-0.35, -0.43), high=0.11)
    pillar(car, (-1.38, -1.45), (-1.16, -1.22), high=0.11)
    beltline(car, 0.76, -1.94)
    car.wipers(glass)
    fin(car, -1.25)
    car.interior(seat=0.0, rear_bench=-1.05)
    return car.finish("#6e6a63")


def q7():
    car = Coach("audi-q7-3-0-tdi", "star")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.87), (-axle, 0.92), (0.0, 0.915), (axle, 0.92), (nose - 0.4, 0.895), (nose, 0.83)],
        shoulder=[(stern, 1.21), (-2.1, 1.235), (-1.3, 1.215), (0.0, 1.185), (0.8, 1.165), (1.08, 1.15), (axle, 1.11), (nose - 0.42, 1.075), (nose - 0.12, 1.045), (nose, 1.03)],
        waist=[(stern, 1.08), (-axle, 1.1), (-0.6, 1.04), (0.6, 1.03), (axle, 1.06), (nose - 0.4, 0.97), (nose - 0.15, 0.74), (nose, 0.66)],
        sill=[(stern, 0.56), (-2.05, 0.42), (2.05, 0.42), (nose, 0.48)],
        crown=[(stern, 0.0), (1.05, 0.04), (axle, 0.06), (nose, 0.045)],
        flare=(0.022, 0.026),
        keys=[nose - 0.4, axle, 0.45, -0.45, -axle, stern + 0.26],
        front={"set": (0.12, 0.04, 0.0, 0.0, 0.03, 0.09), "bow": 0.1, "flat": 0.7, "power": 2.7},
        rear={"set": (0.13, 0.045, 0.0, 0.015, 0.05, 0.09), "bow": 0.05, "flat": 0.82, "power": 2.8},
        inset=0.035,
        shelf=0.04,
        flank=0.004,
        belly=0.008,
        tuck=0.08,
        cladding=1,
        sharp=(False, True, True, False, False),
        relief=lambda x, y: 0.02 * dome(x, y, 1.08, nose - 0.08, 0.64, 0.5),
    )
    front, back = car.front, car.back

    singleframe(car, octagon(0.52, 0.52, 1.0, pinch=0.76, brow=0.84), rows=0, columns=6, slats="chrome", frame="steel", width=0.028, share=0.16, tag=0.6, emblem=None)
    car.headlamp(
        front,
        [(0.58, 0.905), (0.96, 0.905), (1.12, 0.945), (1.13, 1.028), (0.86, 1.018), (0.58, 1.0)],
        projectors=[(0.7, 0.955, 0.03), (0.83, 0.96, 0.03), (0.96, 0.968, 0.028)],
        strips=[[(0.6, 0.912), (0.96, 0.913), (1.1, 0.95), (1.1, 0.966), (0.96, 0.93), (0.6, 0.927)], [(0.6, 0.98), (0.9, 0.994), (0.9, 1.006), (0.6, 0.992)]],
    )
    duct = car.hollow(front, [(0.66, 0.5), (1.02, 0.53), (1.04, 0.74), (0.68, 0.72)], 0.05)
    duct.bars(2, material="steel", share=0.16, sink=0.15)

    rearlamp(
        car,
        back,
        [(0.42, 1.06), (0.86, 1.055), (1.1, 1.075), (1.13, 1.168), (0.86, 1.178), (0.42, 1.162)],
        strips=[[(0.45, 1.13), (0.86, 1.14), (1.1, 1.134), (1.1, 1.152), (0.86, 1.16), (0.45, 1.148)]] + ticks(0.48, 0.085, 7, 1.07, 1.112, width=0.026),
        smoke=True,
    )
    plate(car, back, 0.85, recess=0.02)
    left = trims(car, 0.4, 0.76, 0.36, 0.44)
    handles(car, [-0.14, -1.14], z=1.0)

    car.arches(0.055)
    car.cut()
    car.arch_lips(width=0.04, proud=0.01, material="trim_black")
    rim(car, back, left, 0.014, "chrome", mirror=True)
    car.patch(front, slab(-0.1, 0.1, 0.935, 0.972), "chrome", lift=0.006, thickness=0.004, mirror=False)
    car.patch(front, [(-0.5, 0.29), (0.5, 0.29), (0.46, 0.38), (-0.46, 0.38)], "steel", lift=0.006, thickness=0.006, mirror=False)
    car.patch(back, slab(-0.42, 0.42, 1.108, 1.124), "chrome", lift=0.005, thickness=0.004, mirror=False)
    emblem(car, 1.02)
    car.patch(back, slab(0.68, 1.0, 0.62, 0.644), "lens_tail", lift=0.004, thickness=0.004)
    car.patch(back, slab(-0.3, 0.3, 0.33, 0.4), "steel", lift=0.006, thickness=0.006, mirror=False)
    car.patch(car.side, [(0.94, 0.5), (-1.1, 0.5), (-1.1, 0.52), (0.94, 0.52)], "steel", lift=0.004, thickness=0.004)

    doors(car, 0.98, -0.34, -1.3, gap=0.055)
    car.bonnet(1.06, 0.8, front=nose - 0.12)
    car.stroke((-0.88, 0.74), (0.88, 0.74), back, steps=14, mirror=False)
    car.stroke((0.88, 0.74), (0.88, 1.05), back, steps=8)
    car.mirrors(0.84)

    glass = car.cabin(
        screen=(1.08, 0.3),
        back=(-2.05, -2.48),
        roof=[(-2.05, 1.645), (-1.1, 1.722), (-0.3, 1.741), (0.3, 1.69)],
        windows=[((0.8, 0.19), (-0.32, -0.33)), ((-0.4, -0.41), (-1.28, -1.22)), ((-1.35, -1.29), (-2.14, -1.82))],
        base_inset=0.07,
        tumble=0.2,
        drop=0.05,
        crest=0.1,
        bow=(0.16, 0.06),
        rail_bow=(0.08, 0.04),
        flat=(0.86, 0.84),
        power=(2.2, 2.6),
        sill=0.05,
        header=0.89,
    )
    pillar(car, (-0.32, -0.4), (-0.33, -0.41), high=0.11)
    pillar(car, (-1.28, -1.35), (-1.22, -1.29), high=0.11)
    car.wipers(glass)
    rear_wiper(car, -2.44)
    rails(car, 0.12, -1.85, 0.57, lift=0.022, material="steel")
    beltline(car, 0.78, -2.14)
    spoiler(car, -2.05, 0.18, 1.04)
    fin(car, -1.7)
    car.interior(seat=0.04, rear_bench=-1.0)
    return car.finish("#2a3c5c")


def r8():
    car = Coach("audi-r8-v10", "star", barrel="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.9), (-axle, 0.97), (-0.3, 0.93), (0.5, 0.92), (axle, 0.945), (nose - 0.36, 0.9), (nose, 0.8)],
        shoulder=[(stern, 0.9), (-axle, 0.935), (-0.6, 0.9), (0.3, 0.845), (1.1, 0.805), (axle, 0.795), (nose - 0.42, 0.73), (nose - 0.12, 0.655), (nose, 0.62)],
        waist=[(stern, 0.68), (-axle, 0.7), (-0.3, 0.58), (axle, 0.58), (nose - 0.36, 0.52), (nose, 0.44)],
        sill=[(stern, 0.38), (-axle, 0.27), (0.0, 0.24), (axle, 0.25), (nose, 0.3)],
        crown=[(stern, 0.01), (-axle, 0.0), (0.4, 0.0), (1.1, -0.03), (axle, -0.05), (nose - 0.3, -0.02), (nose, 0.01)],
        flare=(0.025, 0.035),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.1, 0.03, 0.0, 0.01, 0.08, 0.17), "bow": 0.13, "flat": 0.66, "power": 2.4},
        rear={"set": (0.18, 0.06, 0.01, 0.0, 0.03, 0.07), "bow": 0.05, "flat": 0.84, "power": 3.0},
        inset=0.05,
        shelf=0.06,
        flank=0.012,
        belly=0.0,
        tuck=0.09,
        sharp=(False, True, False, True, False),
        rear_lift=0.1,
        front_lift=0.0,
    )
    front, back = car.front, car.back

    mask = [(-0.44, 0.2), (0.44, 0.2), (0.58, 0.36), (0.54, 0.5), (-0.54, 0.5), (-0.58, 0.36)]
    singleframe(car, mask, rows=6, columns=24, slats="mesh", depth=0.07, tag=0.25, emblem=None)
    for left, right in ((-0.34, -0.13), (-0.105, 0.105), (0.13, 0.34)):
        car.hollow(front, slab(left, right, 0.522, 0.546), 0.03, mirror=False)
    duct = car.hollow(front, [(0.68, 0.2), (1.0, 0.25), (1.02, 0.46), (0.7, 0.45)], 0.07)
    duct.mesh(5, 4, share=0.2, sink=0.5)
    duct.bars(1, material="body", axis=0, share=0.1, sink=0.05)
    car.headlamp(
        front,
        [(0.62, 0.518), (0.98, 0.502), (1.12, 0.572), (1.14, 0.7), (0.92, 0.662), (0.64, 0.598)],
        projectors=[(0.74, 0.55, 0.028), (0.86, 0.572, 0.028), (0.98, 0.61, 0.026)],
        strips=[[(0.64, 0.523), (0.975, 0.509), (1.105, 0.576), (1.12, 0.685), (1.1, 0.68), (1.085, 0.586), (0.965, 0.526), (0.65, 0.538)]] + ticks(0.68, 0.06, 4, 0.588, 0.612, width=0.03, lean=0.02),
    )
    car.hollow(car.side, [(-0.34, 0.33), (-0.5, 0.33), (-0.58, 0.72), (-0.44, 0.74)], 0.12)

    mesh = car.hollow(back, slab(-0.94, 0.94, 0.5, 0.73), 0.05, mirror=False)
    mesh.mesh(30, 6, share=0.18)
    rearlamp(
        car,
        back,
        [(0.38, 0.772), (0.94, 0.772), (1.08, 0.8), (1.09, 0.872), (0.38, 0.856)],
        strips=[[(0.4, 0.822), (0.94, 0.83), (1.06, 0.838), (1.06, 0.856), (0.4, 0.84)], [(0.4, 0.782), (0.92, 0.782), (1.02, 0.802), (0.4, 0.798)]],
        smoke=True,
    )
    plate(car, back, 0.56)
    lower = car.hollow(back, [(-0.44, 0.24), (0.44, 0.24), (0.4, 0.42), (-0.4, 0.42)], 0.06, mirror=False)
    lower.bars(6, axis=0, share=0.12, sink=0.0)
    ovals(car, (0.7,), 0.36, half=(0.115, 0.066))

    car.arches(0.034, inner=0.09)
    car.cut()
    car.arch_lips(width=0.024, proud=0.006)
    car.patch(car.side, [(-0.52, 0.3), (-0.9, 0.3), (-0.93, 0.7), (-0.6, 0.76)], "carbon", lift=0.018, thickness=0.024)
    car.patch(back, slab(-0.3, 0.3, 0.878, 0.888), "lens_ember", lift=0.004, thickness=0.004, group="Taillights", mirror=False)

    car.seams([0.76, -0.3])
    car.bonnet(1.2, 0.68, front=nose - 0.26)
    handles(car, [-0.12], z=0.76, dish=0.0)
    car.mirrors(0.74, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.07)

    glass = car.cabin(
        screen=(1.2, 0.42),
        back=(-0.42, -1.55),
        roof=[(-0.42, 1.172), (-0.1, 1.226), (0.08, 1.236), (0.42, 1.19)],
        windows=[((0.9, 0.3), (-0.22, -0.3))],
        base=[(-1.7, 0.6), (-0.4, 0.78), (1.2, 0.76)],
        rail=[(-0.42, 0.5), (0.0, 0.56), (0.42, 0.53)],
        drop=0.045,
        crest=0.09,
        bow=(0.18, 0.05),
        rail_bow=(0.1, 0.04),
        flat=(0.84, 0.76),
        bulge=0.025,
        sill=0.06,
        header=0.9,
    )
    car.patch(car.side, [(-0.3, 0.9), (-0.84, 0.925), (-0.72, 1.04), (-0.4, 1.11)], "carbon", lift=0.012, thickness=0.016)
    car.wipers(glass)
    floor = car.lid(-1.05, 0.0)
    car.model.absorb(box((-1.05, 0, floor + 0.03), (0.5, 0.52, 0.06), "steel", bevel=0.015))
    for side in (1, -1):
        car.model.absorb(box((-1.05, side * 0.15, floor + 0.07), (0.42, 0.14, 0.03), "carbon", bevel=0.01))
        car.model.absorb(bar(Vector((-0.72, side * 0.34, floor + 0.045)), Vector((-1.4, -side * 0.34, floor + 0.045)), 0.03, 0.02, "carbon"))
    car.interior(seat=0.12, spread=0.31, height=0.13, width=0.4, material="interior")
    return car.finish("#e3bd12")


CARS = {
    "audi-a3-2-0-tfsi": a3,
    "audi-rs-3": rs3,
    "audi-tt-rs": tt_rs,
    "audi-rs-q3": rs_q3,
    "audi-a6-3-0-tdi": a6,
    "audi-a8-3-0-tdi": a8,
    "audi-q7-3-0-tdi": q7,
    "audi-r8-v10": r8,
}
