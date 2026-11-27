from mathutils import Vector

from carkit import bar, box, bump, curve, cylinder, lathe, slot
from kit import Coach, ellipse, loft

SECOND = "livery_dark"


def rect(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def band(a0, a1, b0, b1, count=8, pinch=0.0):
    low = [(a0 + (a1 - a0) * n / count, b0) for n in range(count + 1)]
    high = [(a1 + (a0 - a1) * n / count, b1) for n in range(count + 1)]
    if pinch:
        low = [(a * (1 - pinch), b) for a, b in low]
    return low + high


def puck(car, caster, a, b, radius, material, sink, depth, group="Body", inner=0.0):
    hit, normal = caster(a, b)
    profile = [(inner, 0.0), (radius, 0.0), (radius, depth), (inner, depth)] if inner else [(0, 0.0), (radius, 0.0), (radius * 0.9, depth), (0, depth)]
    car.model.add(lathe(profile, material, origin=hit - normal * sink, axis=normal, segments=20), group)


def handle(car, x, z, size=(0.13, 0.016, 0.034)):
    hit, normal = car.side(x, z)
    car.model.add(box(hit + normal * (size[1] / 2 - 0.002), size, "body", bevel=0.005))


def rx_8():
    car = Coach("mazda-rx-8", "five", root=0.09, tip=0.05, hub=0.07, dish=0.045)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    front_reach = car.front_wheel["radius"] * 1.75
    rear_reach = car.rear_wheel["radius"] * 1.9

    def flare(x):
        return 0.055 * bump(x, axle, front_reach) + 0.04 * bump(x, -axle, rear_reach)

    def relief(x, y):
        return 0.02 * bump(x, axle - 0.1, 0.75) * bump(abs(y), 0.0, 0.3)

    car.skin(
        half=[(stern, 0.8), (-axle, 0.875), (-0.3, 0.85), (0.5, 0.845), (axle, 0.86), (nose - 0.3, 0.8), (nose, 0.68)],
        shoulder=[(stern, 0.975), (stern + 0.35, 0.99), (-axle, 0.975), (-0.4, 0.93), (0.86, 0.905), (axle - 0.3, 0.86), (axle, 0.835), (axle + 0.3, 0.79), (nose - 0.25, 0.7), (nose, 0.6)],
        waist=[(stern, 0.72), (-axle, 0.7), (0.0, 0.62), (axle, 0.6), (nose, 0.48)],
        sill=[(stern, 0.4), (-1.75, 0.26), (1.75, 0.26), (nose, 0.28)],
        crown=[(stern, 0.02), (-1.6, 0.02), (0.86, 0.02), (axle - 0.3, -0.03), (axle, -0.06), (axle + 0.35, -0.045), (nose - 0.2, -0.01), (nose, 0.0)],
        flare=flare,
        keys=[nose - 0.44, axle, 0.45, -0.45, -axle, stern + 0.28],
        front={"set": (0.1, 0.03, 0.01, 0.01, 0.07, 0.2), "bow": (0.2, 0.2, 0.2, 0.2, 0.18, 0.13), "flat": 0.52, "power": 2.2},
        rear={"set": (0.13, 0.05, 0.01, 0.01, 0.02, 0.07), "bow": 0.1, "flat": 0.72, "power": 2.3},
        inset=0.04,
        shelf=0.06,
        flank=0.016,
        belly=0.01,
        relief=relief,
        sharp=(True, True, False, False, False),
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    car.headlamp(
        top,
        [(nose - 0.22, 0.44), (nose - 0.28, 0.64), (nose - 0.5, 0.74), (nose - 0.86, 0.755), (nose - 0.6, 0.57), (nose - 0.42, 0.44)],
        projectors=[(nose - 0.35, 0.55, 0.046), (nose - 0.5, 0.65, 0.04)],
        strips=[[(nose - 0.62, 0.68), (nose - 0.8, 0.745), (nose - 0.68, 0.66)]],
    )
    mouth = car.hollow(front, band(-0.52, 0.52, 0.19, 0.47, 10, pinch=0.3), 0.09, mirror=False)
    mouth.mesh(11, 5, share=0.12)
    car.patch(front, rect(-0.155, 0.155, 0.27, 0.43), "plate", lift=0.002, mirror=False)
    fog = car.hollow(front, ellipse((0.76, 0.3), (0.11, 0.07), 12), 0.05)
    car.disc(front, 0.76, 0.3, 0.045, "clear", bezel="chrome", depth=0.016, sink=0.045)
    vent = car.hollow(side, [(axle - 0.46, 0.5), (axle - 0.62, 0.56), (axle - 0.62, 0.62), (axle - 0.46, 0.68)], 0.035)
    vent.fill("steel", sink=0.4, shrink=0.012)

    cluster = car.hollow(back, ellipse((0.7, 0.86), (0.25, 0.092), 16), 0.03, material="chrome")
    cluster.fill("lens_clear", sink=0.9)
    for t in (0.58, 0.8):
        puck(car, back, t, 0.86, 0.068, "lens_tail", 0.03, 0.012, group="Taillights")
        puck(car, back, t, 0.86, 0.04, "lens_ember", 0.03, 0.018, group="Taillights")
    car.hollow(back, rect(-0.2, 0.2, 0.7, 0.89), 0.016, material="body", mirror=False)
    car.patch(back, rect(-0.155, 0.155, 0.715, 0.875), "plate", lift=-0.012, mirror=False)
    car.patch(back, [(-0.07, 0.33), (0.07, 0.33), (0.0, 0.43)], "lens_tail", lift=0.004, thickness=0.006, group="Taillights", mirror=False)
    for y in (0.56, -0.56):
        car.carve(box((stern + 0.05, y, 0.29), (0.5, 0.2, 0.2), "underbody", bevel=0.02))
    car.hollow(side, rect(-0.26, -0.1, 0.8, 0.85), 0.012, material="body")

    car.arches(0.04)
    car.cut()
    car.arch_lips(width=0.034, proud=0.012)
    car.pipes((0.56, -0.56), stern + 0.02, 0.315, radius=0.052, length=0.2)

    car.seams([0.76, -0.34, -0.9])
    car.stroke((0.86, 0.36), (nose - 0.4, 0.1), top, steps=10)
    car.stroke((nose - 0.4, -0.1), (nose - 0.4, 0.1), top, steps=4, mirror=False)
    car.stroke((-0.78, 0.95), (0.78, 0.95), car.tail, steps=12, mirror=False)
    car.stroke((0.0, 0.64), (1.05, 0.64), back, steps=14)
    handle(car, -0.18, 0.825)
    car.mirrors(0.6)
    car.patch(side, [(axle - 0.41, 0.28), (-axle + 0.41, 0.28), (-axle + 0.41, 0.2), (axle - 0.41, 0.2)], "body", lift=0.012, thickness=0.022)

    glass = car.cabin(
        screen=(0.88, 0.1),
        back=(-1.14, stern + 0.4),
        roof=[(-1.14, 1.25), (-0.65, 1.325), (-0.25, 1.34), (0.1, 1.3)],
        windows=[((0.6, 0.0), (-0.34, -0.36)), ((-0.39, -0.41), (-0.9, -0.78))],
        base_inset=0.07,
        tumble=0.15,
        drop=0.05,
        bow=(0.18, 0.09),
        rail_bow=(0.06, 0.05),
        bulge=0.026,
    )
    car.wipers(glass)
    car.lip(stern + 0.07, car.lid(stern + 0.07, 0) + 0.012, 1.24, depth=0.1, thickness=0.024, material="body", sweep_back=-0.05)
    car.model.absorb(box((stern + 0.022, 0, car.lid(stern + 0.07, 0) + 0.012), (0.012, 0.32, 0.016), "lens_tail"), "Taillights")
    car.interior(seat=-0.1, rear_bench=-0.86)
    return car.finish("#a8141d")


def ramp(value, low, high):
    return max(0.0, min(1.0, (value - low) / (high - low)))


def argyle(car, split, lean):
    mesh = dict(car.model.extra)["Coachwork"]
    first, second = slot("body"), slot(SECOND)
    for polygon in mesh.polygons:
        if polygon.material_index != first:
            continue
        x, y, _ = polygon.center
        edge = split + lean * y
        if (y > 0 and x > edge) or (y < 0 and x < edge):
            polygon.material_index = second


def group_c(name, paint, late=True):
    global SECOND
    SECOND = "livery_green" if late else "livery_dark"
    if late:
        car = Coach(name, "ten", root=0.04, tip=0.034, metal="rim_white", lip="rim_white", barrel="rim_white", cap="chrome", nuts=0, grooves=0, dish=0.05)
    else:
        car = Coach(name, "blade", metal="rim", cap="chrome", nuts=0, grooves=0, dish=0.05)
    nose, stern, axle, roof = car.nose_x, car.stern_x, car.axle, car.height
    fender = car.front_wheel["radius"] * 2 + 0.075
    haunch = car.rear_wheel["radius"] * 2 + 0.075
    valley = curve([(nose, 0.0), (nose - 0.24, 0.17), (axle, 0.25), (0.95, 0.15), (0.55, 0.0)])
    trough = curve([(-0.75, 0.0), (-axle, 0.07), (stern, 0.1)])

    def relief(x, y):
        return -valley(x) * ramp(abs(y), 0.68, 0.52) - trough(x) * ramp(abs(y), 0.72, 0.56)

    def stripes(band, station, point):
        if band == 0:
            return "underbody"
        if not late and band in (1, 2):
            return SECOND
        return "body"

    car.skin(
        half=[(stern, 0.985), (-axle, 0.997), (0.0, 0.99), (axle, 0.997), (nose - 0.3, 0.98), (nose, 0.93)],
        shoulder=[(stern, 0.6), (-axle - 0.5, haunch - 0.06), (-axle, haunch), (-axle + 0.6, haunch - 0.07), (0.3, fender - 0.04), (axle - 0.35, fender - 0.01), (axle, fender), (axle + 0.3, fender - 0.03), (nose - 0.25, 0.5), (nose, 0.33)],
        waist=[(stern, 0.36), (-axle, 0.4), (0.0, 0.34), (axle, 0.34), (nose - 0.2, 0.27), (nose, 0.2)],
        sill=[(stern, 0.16), (0.0, 0.14), (nose, 0.13)],
        crown=0.0,
        flare=(0.0, 0.0),
        keys=[nose - 0.46, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.0, 0.0, 0.004, 0.004, 0.05, 0.22), "bow": 0.16 if late else 0.1, "flat": 0.6 if late else 0.7, "power": 2.5 if late else 3.0},
        rear={"set": (0.04, 0.0, 0.004, 0.004, 0.0, 0.03), "bow": 0.02, "flat": 0.9, "power": 4.0},
        inset=0.03,
        shelf=0.04,
        flank=0.006,
        belly=0.004,
        tuck=0.05,
        relief=relief,
        paint=stripes,
        lid_rows=7,
    )
    front, back, top, side = car.front, car.back, car.top, car.side

    if late:
        car.hollow(front, [(-0.46, 0.1), (0.46, 0.1), (0.42, 0.19), (-0.42, 0.19)], 0.08, mirror=False)
    else:
        car.hollow(front, [(0.1, 0.1), (0.44, 0.1), (0.4, 0.19), (0.1, 0.19)], 0.08)
    car.hollow(front, rect(0.62, 0.84, 0.12, 0.2), 0.06)
    exit_front = axle + 0.04 if late else axle + 0.2
    outlet = car.hollow(top, [(exit_front, -0.36), (exit_front, 0.36), (0.98, 0.42), (0.98, -0.42)], 0.05, mirror=False)
    outlet.bars(4 if late else 2, axis=0, share=0.2, sink=0.2)
    if late:
        car.hollow(side, [(-0.34, 0.3), (-0.76, 0.3), (-0.76, 0.62), (-0.46, 0.62)], 0.1).bars(4, axis=0, share=0.12, sink=0.5)
    else:
        car.hollow(side, [(0.25, 0.44), (-0.35, 0.44), (-0.35, 0.6), (0.12, 0.6)], 0.1).bars(5, axis=0, share=0.1, sink=0.5)
        car.hollow(side, [(-0.62, 0.3), (-0.9, 0.3), (-0.9, 0.5), (-0.7, 0.5)], 0.08).bars(3, axis=0, share=0.12, sink=0.5)
    car.hollow(top, [(0.0, 0.72), (0.0, 0.8), (-0.36, 0.88), (-0.36, 0.64)], 0.04)
    grate = car.hollow(back, band(-0.78, 0.78, 0.25, 0.5, 10), 0.12, mirror=False)
    grate.mesh(15, 4, share=0.1)
    car.hollow(back, band(-0.8, 0.8, 0.095, 0.2, 10), 0.2, material="underbody", mirror=False)
    car.hollow(back, [(0.84, 0.36), (0.95, 0.36), (0.95, 0.54), (0.84, 0.54)], 0.03, material="trim_black")
    for z in (0.5, 0.41):
        puck(car, back, 0.895, z, 0.038, "lens_tail", 0.03, 0.01, group="Taillights")
        puck(car, back, 0.895, z, 0.022, "lens_ember", 0.03, 0.016, group="Taillights")

    if late:
        for n in range(4):
            x = axle + 0.2 - n * 0.11
            car.hollow(top, [(x, 0.72), (x, 0.9), (x - 0.05, 0.9), (x - 0.05, 0.72)], 0.03)
    car.headlamp(
        top,
        [(nose - 0.3, 0.6), (nose - 0.38, 0.88), (nose - 0.62, 0.9), (nose - 0.56, 0.6)],
        projectors=[(nose - 0.44, 0.68, 0.04), (nose - 0.47, 0.8, 0.04)],
        depth=0.05,
    )
    car.arches(0.03, inner=0.09)
    car.cut()
    car.lip(nose - 0.12, 0.07, 1.8, depth=0.2, thickness=0.02, material="trim_black", sweep_back=0.24)
    if late:
        split, lean = -0.1, 0.8
        argyle(car, split, lean)
        right = lambda x, z: tuple(v * Vector((1, -1, 1)) for v in side(x, z))
        for sign in (1, -1):
            near, far = split + lean * sign * 0.56, split + lean * sign * 0.975
            car.patch(top, [(near - 0.06, sign * 0.56), (far - 0.06, sign * 0.975), (far + 0.06, sign * 0.975), (near + 0.06, sign * 0.56)], "livery", lift=0.005, mirror=False)
            car.patch(side if sign > 0 else right, rect(far - 0.06, far + 0.06, 0.1, 0.72), "livery", lift=0.005, mirror=False)
        car.patch(top, rect(axle + 0.1, nose - 0.04, -0.025, 0.025), "livery", lift=0.005, mirror=False)
        car.patch(top, rect(stern + 0.03, -1.64, -0.025, 0.025), "livery", lift=0.005, mirror=False)
        car.patch(top, rect(axle + 0.14, axle + 0.5, -0.2, 0.2), "livery", lift=0.007, mirror=False)
        car.patch(side, rect(0.04, 0.44, 0.34, 0.62), "livery", lift=0.006)
    else:
        for low, high in ((axle + 0.26, nose - 0.05), (stern + 0.03, -1.66)):
            car.patch(top, rect(low, high, 0.13, 0.27), SECOND, lift=0.005)
    car.fins(stern + 0.16, 0.14, 6, 1.36, length=0.3, height=0.11)

    car.seams([0.58, -0.2], low=lambda x: 0.3)
    car.mirrors(0.78, size=(0.06, 0.12, 0.07), reach=-0.16, lift=0.1)

    glass = car.cabin(
        screen=(0.86, 0.3),
        back=(-0.45, -1.55),
        roof=[(-0.45, roof - 0.1), (-0.15, roof - 0.02), (0.1, roof), (0.3, roof - 0.035)],
        windows=[((0.56, 0.17), (-0.15, -0.22))],
        base=[(-1.55, 0.3), (-0.3, 0.52), (0.86, 0.5)],
        rail=[(-0.45, 0.3), (0.0, 0.36), (0.3, 0.34)],
        drop=0.03,
        bow=(0.2, 0.06),
        rail_bow=(0.06, 0.04),
        flat=(0.8, 0.45),
        power=(2.2, 1.7),
        crest=0.05,
        bulge=0.03,
        glass_rear=False,
        sill=0.1,
        frame_width=0.014,
        corner=5,
    )

    car.wing(stern + 0.27, roof - 0.085, 1.8, chord=0.42, thickness=0.045, angle=7, material="body", pylons=(0.22,), gurney=0.012)
    sections = []
    for y in (0.9, 0.916):
        sections.append([(stern + 0.62, y, 0.66), (stern + 0.5, y, roof - 0.004), (stern + 0.04, y, roof - 0.004), (stern + 0.02, y, 0.56)])
    car.model.add(loft(sections, SECOND, smooth=False))
    lift = Vector((0.012, 0, 0.014))
    car.model.absorb(bar(glass.position(1.15, 0) + lift, glass.position(2.7, 2) + lift, 0.02, 0.012, "trim_black", up=Vector((0.5, 0, 1))))
    for x in (-0.8, -0.87):
        car.model.absorb(cylinder((x, 0.9, 0.2), (x, 0.992, 0.2), 0.028, "steel", segments=10))
    car.interior(seat=0.02, spread=0.17, height=0.1, width=0.28, material="interior")
    return car.finish(paint)


def proto_787b():
    return group_c("mazda-787b", "#f26a1c")


def proto_787():
    return group_c("mazda-787", "#eef0ec", late=False)


CARS = {"mazda-rx-8": rx_8, "mazda-787b": proto_787b, "mazda-787": proto_787}
