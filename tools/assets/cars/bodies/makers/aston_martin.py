from carkit import LEFT, bump, sweep
from kit import Coach, grow
from mathutils import Vector


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def strake(car, hull, material="chrome", width=0.045, proud=0.016):
    sides = [i for i, station in enumerate(hull.stations) if station[0] == "side"]
    first, last = sides[0], sides[-1] + 1
    path = [hull.position(1.0, first)]
    path += [hull.position(3.7, i) for i in range(first, last + 1)]
    path.append(hull.position(1.0, last))
    outs, ups = [], []
    for n, point in enumerate(path):
        before = path[max(0, n - 1)]
        after = path[min(len(path) - 1, n + 1)]
        tangent = (after - before).normalized()
        up = Vector((-tangent.z, 0, tangent.x))
        if up.z < 0:
            up = -up
        outs.append(LEFT)
        ups.append(up)
    profile = [(-0.01, -width / 2), (proud, -width / 2), (proud, width / 2), (-0.01, width / 2)]
    car.model.add(sweep(path, outs, ups, profile, material))


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


def seated_pipes(car, spots, z, radius, length=0.16, material="chrome", proud=0.012):
    for y in spots:
        x = car.tail(y, z)[0].x - proud
        car.pipes((y, -y), x, z, radius=radius, length=length, material=material)


def blade(car, caster, pieces, depth=0.02):
    for piece in pieces:
        car.hollow(caster, piece, depth, material="trim_black", mirror=piece[0][0] > 0)

    def build():
        for piece in pieces:
            mirror = piece[0][0] > 0
            car.patch(caster, piece, "lens_tail", lift=-depth + 0.005, group="Taillights", mirror=mirror)
            car.patch(caster, grow(piece, -0.008), "lens_ember", lift=-depth + 0.01, thickness=0.004, group="Taillights", mirror=mirror)
            car.patch(caster, piece, "cover", lift=0.001, mirror=mirror)

    return build


def vantage():
    car = Coach("aston-martin-vantage", "split", metal="rim_dark", lip="rim", cap="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle

    car.skin(
        half=[(stern, 0.82), (-1.9, 0.9), (-axle, 0.925), (-0.45, 0.905), (0.45, 0.905), (axle, 0.918), (nose - 0.5, 0.9), (nose, 0.78)],
        shoulder=[(stern, 0.985), (-1.9, 0.99), (-axle, 0.99), (-0.8, 0.955), (0.2, 0.915), (0.55, 0.895), (axle, 0.82), (nose - 0.4, 0.73), (nose, 0.63)],
        waist=[(stern, 0.74), (-axle, 0.81), (-0.6, 0.66), (0.4, 0.64), (axle, 0.77), (nose - 0.4, 0.6), (nose, 0.49)],
        sill=[(stern, 0.44), (-axle, 0.27), (0.0, 0.24), (axle, 0.24), (nose, 0.23)],
        crown=[(stern, 0.0), (-1.8, -0.01), (-1.2, -0.016), (-0.6, 0.0), (0.45, 0.03), (axle, 0.045), (nose, 0.025)],
        flare=(0.04, 0.046),
        keys=[nose - 0.5, axle, 0.45, -0.45, -axle, stern + 0.5],
        front={"set": (0.1, 0.035, 0.0, 0.0, 0.07, 0.2), "bow": 0.15, "flat": 0.56, "power": 2.2},
        rear={"set": (0.3, 0.14, 0.06, 0.03, 0.0, 0.03), "bow": 0.12, "flat": 0.6, "power": 2.3},
        inset=0.06,
        shelf=0.075,
        flank=0.022,
        belly=0.01,
        relief=lambda x, y: 0.014 * bump(y, 0.0, 0.45) * bump(x, 1.3, 0.9),
        margin=0.0,
        rear_lift=0.12,
        front_lift=0.03,
        sharp=(True, True, False, False, False),
    )
    front, back = car.front, car.back

    mouth = car.hollow(front, [(-0.44, 0.18), (0.44, 0.18), (0.57, 0.26), (0.6, 0.4), (0.5, 0.465), (-0.5, 0.465), (-0.6, 0.4), (-0.57, 0.26)], 0.1, mirror=False)
    mouth.bars(6, share=0.16, sink=0.3, thickness=0.02)
    flat_plate(car, False, 0.27, depth=-0.012)
    car.hollow(front, [(0.74, 0.22), (0.96, 0.25), (0.94, 0.37), (0.76, 0.35)], 0.05)
    car.headlamp(
        front,
        [(0.6, 0.566), (0.8, 0.558), (1.0, 0.598), (1.16, 0.672), (0.98, 0.668), (0.78, 0.635), (0.61, 0.612)],
        projectors=[(0.72, 0.59, 0.026), (0.86, 0.612, 0.022)],
        strips=[[(0.64, 0.6), (0.78, 0.622), (0.98, 0.655), (1.1, 0.665), (0.98, 0.64), (0.78, 0.606), (0.65, 0.588)]],
    )
    vent = car.hollow(car.top, [(1.4, 0.23), (1.4, 0.37), (1.1, 0.4), (1.1, 0.26)], 0.03)
    vent.bars(3, axis=0, share=0.18, sink=0.2)
    gill = car.hollow(car.side, [(0.93, 0.47), (0.68, 0.43), (0.58, 0.55), (0.64, 0.68), (0.9, 0.72)], 0.05)
    gill.bars(1, material="body", share=0.1, sink=0.1)

    pieces = [[(-0.24, 0.915), (0.24, 0.915), (0.24, 0.95), (-0.24, 0.95)]]
    edge = lambda t: 0.932 - 0.14 * (max(0.0, t - 0.2) / 0.95) ** 2.2
    marks = [0.236, 0.5, 0.74, 0.95, 1.15]
    for a, b in zip(marks, marks[1:]):
        pieces.append([(a, edge(a) - 0.017), (b + 0.004, edge(b) - 0.017), (b + 0.004, edge(b) + 0.018), (a, edge(a) + 0.018)])
    lamps = blade(car, back, pieces)
    flat_plate(car, True, 0.58, depth=0.02)
    outlet = car.hollow(back, [(-0.72, 0.22), (0.72, 0.22), (0.62, 0.5), (-0.62, 0.5)], 0.1, material="grille", mirror=False)
    outlet.bars(8, material="trim_black", axis=0, share=0.07, sink=0.1, thickness=0.05)
    car.hollow(back, [(0.86, 0.38), (0.92, 0.38), (0.96, 0.62), (0.9, 0.62)], 0.04)

    car.arches(0.045, inner=0.09)
    car.cut()
    car.arch_lips(width=0.026, proud=0.012)
    lamps()
    seated_pipes(car, (0.36, 0.5), 0.36, 0.048)
    car.lip(nose - 0.09, 0.136, 1.56, depth=0.11, thickness=0.018, sweep_back=0.18)
    car.seams([0.5, -0.74])
    car.grips([-0.56])
    car.bonnet(0.5, 0.72, front=nose - 0.3)
    car.mirrors(0.16, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.06)

    glass = car.cabin(
        screen=(0.44, -0.24),
        back=(-1.35, -1.82),
        roof=[(-1.35, 1.09), (-1.12, 1.17), (-0.85, 1.235), (-0.48, 1.273), (-0.24, 1.238)],
        windows=[((0.18, -0.32), (-0.86, -0.52))],
        base=[(-1.85, 0.52), (-1.2, 0.7), (-0.4, 0.775), (0.44, 0.745)],
        rail=[(-1.35, 0.44), (-0.85, 0.525), (-0.4, 0.555), (-0.24, 0.53)],
        bow=(0.2, 0.08),
        rail_bow=(0.07, 0.04),
        flat=(0.8, 0.75),
        bulge=0.03,
        drop=0.04,
        glass_rear=False,
    )
    hatch_glass(car, -0.9, -1.7, 0.43, 0.35)
    car.wipers(glass)
    car.interior(seat=-0.5, spread=0.31, height=0.13, width=0.4)
    return car.finish("#b5cf1a")


def db11():
    car = Coach("aston-martin-db11-v8", "ten", metal="rim", barrel="rim_dark", cap="rim_dark")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle

    car.skin(
        half=[(stern, 0.8), (-2.0, 0.9), (-axle, 0.925), (-0.45, 0.905), (0.45, 0.905), (axle, 0.918), (nose - 0.5, 0.9), (nose, 0.78)],
        shoulder=[(stern, 0.905), (-2.0, 0.95), (-axle, 0.995), (-0.8, 0.96), (0.3, 0.925), (0.6, 0.91), (axle, 0.845), (nose - 0.4, 0.765), (nose, 0.675)],
        waist=[(stern, 0.66), (-axle, 0.81), (-0.6, 0.66), (0.4, 0.64), (axle, 0.77), (nose - 0.4, 0.62), (nose, 0.5)],
        sill=[(stern, 0.4), (-axle, 0.27), (0.0, 0.24), (axle, 0.24), (nose, 0.24)],
        crown=[(stern, 0.0), (-1.9, -0.01), (-1.3, -0.016), (-0.7, 0.0), (0.6, 0.03), (axle, 0.045), (nose, 0.025)],
        flare=(0.04, 0.046),
        keys=[nose - 0.5, axle, 0.45, -0.45, -axle, stern + 0.5],
        front={"set": (0.11, 0.04, 0.0, 0.0, 0.05, 0.16), "bow": 0.15, "flat": 0.56, "power": 2.2},
        rear={"set": (0.22, 0.1, 0.03, 0.0, 0.04, 0.13), "bow": 0.13, "flat": 0.56, "power": 2.2},
        inset=0.06,
        shelf=0.075,
        flank=0.022,
        belly=0.01,
        margin=0.0,
        rear_lift=0.14,
        front_lift=0.03,
        sharp=(True, True, False, False, False),
    )
    front, back = car.front, car.back

    grille = car.hollow(front, [(-0.34, 0.29), (0.34, 0.29), (0.46, 0.4), (0.52, 0.53), (0.4, 0.59), (0.0, 0.605), (-0.4, 0.59), (-0.52, 0.53), (-0.46, 0.4)], 0.08, mirror=False)
    grille.bars(6, material="chrome", share=0.2, sink=0.3, thickness=0.012)
    flat_plate(car, False, 0.31, depth=-0.012)
    car.hollow(front, [(0.68, 0.24), (0.96, 0.27), (0.94, 0.37), (0.7, 0.35)], 0.05)
    car.headlamp(
        front,
        [(0.58, 0.6), (0.76, 0.586), (0.98, 0.63), (1.22, 0.742), (1.0, 0.732), (0.78, 0.69), (0.59, 0.652)],
        projectors=[(0.7, 0.628, 0.03), (0.86, 0.656, 0.026)],
        strips=[[(0.62, 0.64), (0.78, 0.676), (1.0, 0.718), (1.16, 0.732), (1.0, 0.702), (0.78, 0.658), (0.63, 0.626)]],
    )
    vent = car.hollow(car.top, [(1.66, 0.2), (1.62, 0.5), (1.26, 0.46), (1.26, 0.24)], 0.03)
    vent.bars(5, axis=0, share=0.2, sink=0.2)
    car.hollow(car.side, [(1.0, 0.73), (0.56, 0.61), (0.5, 0.65), (0.6, 0.73), (0.92, 0.8)], 0.04)
    car.patch(car.side, [(1.0, 0.715), (0.5, 0.585), (0.5, 0.61), (1.0, 0.738)], "chrome", lift=0.006, thickness=0.006)

    pieces = []
    for z in (0.868, 0.772):
        pieces.append([(0.36, z), (1.04, z - 0.012), (1.04, z + 0.022), (0.36, z + 0.03)])
    pieces.append([(1.036, 0.76), (1.1, 0.782), (1.1, 0.872), (1.036, 0.89)])
    lamps = blade(car, back, pieces)
    flat_plate(car, True, 0.6, depth=0.02)
    outlet = car.hollow(back, [(-0.7, 0.24), (0.7, 0.24), (0.62, 0.44), (-0.62, 0.44)], 0.1, material="grille", mirror=False)
    outlet.bars(6, material="trim_black", axis=0, share=0.07, sink=0.1, thickness=0.04)
    car.hollow(car.top, rect(stern + 0.2, stern + 0.25, -0.5, 0.5), 0.03, mirror=False)

    car.arches(0.045, inner=0.09)
    car.cut()
    car.arch_lips(width=0.026, proud=0.012)
    lamps()
    seated_pipes(car, (0.5,), 0.34, 0.06)
    car.lip(nose - 0.09, 0.136, 1.46, depth=0.1, thickness=0.018, sweep_back=0.18)
    car.seams([0.54, -0.66])
    car.grips([-0.5])
    car.stroke((0.6, 0.74), (1.5, 0.8), car.top, steps=10)
    car.stroke((1.5, 0.8), (nose - 0.26, 0.6), car.top, steps=8)
    car.stroke((0.6, -0.74), (0.6, 0.74), car.top, steps=12, mirror=False)
    car.mirrors(0.28, size=(0.09, 0.16, 0.085), reach=0.07, lift=0.06)

    glass = car.cabin(
        screen=(0.56, -0.16),
        back=(-1.5, -2.0),
        roof=[(-1.5, 1.085), (-1.25, 1.17), (-0.9, 1.248), (-0.45, 1.279), (-0.16, 1.24)],
        windows=[((0.3, -0.26), (-0.62, -0.66)), ((-0.68, -0.72), (-1.18, -0.86))],
        base=[(-2.02, 0.54), (-1.3, 0.71), (-0.4, 0.775), (0.56, 0.745)],
        rail=[(-1.5, 0.45), (-0.9, 0.53), (-0.4, 0.555), (-0.16, 0.53)],
        bow=(0.2, 0.08),
        rail_bow=(0.07, 0.04),
        flat=(0.8, 0.75),
        bulge=0.03,
        drop=0.04,
        glass_rear=False,
        roof_material="carbon",
    )
    hatch_glass(car, -1.05, -1.88, 0.43, 0.36)
    strake(car, glass)
    car.wipers(glass)
    car.interior(seat=-0.44, spread=0.31, height=0.13, width=0.4, rear_bench=-1.0)
    return car.finish("#8fa6b2")


CARS = {"aston-martin-vantage": vantage, "aston-martin-db11-v8": db11}
