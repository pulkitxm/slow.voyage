import math

from mathutils import Matrix

from carkit import (
    Blend,
    Car,
    End,
    Hull,
    Line,
    bar,
    bar_profile,
    box,
    bump,
    curve,
    cylinder,
    lathe,
)

SILL = 2
WAIST = 4


def constant(value):
    return lambda x: value


def shell(car, spec, paint=None):
    half = spec["half"]
    flare = spec.get("flare", constant(0.0))
    inset = spec.get("inset", 0.035)
    shelf = spec.get("shelf", 0.05)
    rise = spec.get("rise", 0.012)
    crown = spec["crown"]
    shoulder = spec["shoulder"]
    clearance = spec["clearance"]
    keys = spec["keys"]

    def edge(x):
        return half(x) - inset - shelf

    def lid(x, y):
        return shoulder(x) + rise + crown(x) * (1 - min(1.0, abs(y) / edge(x)) ** 2) + spec.get("relief", lambda x, y: 0.0)(x, y)

    def ends(which, n):
        data = spec[which]
        pick = lambda value: value[n] if isinstance(value, (list, tuple)) else value
        return End(pick(data["tips"]), pick(data["bow"]), pick(data.get("flat", 0.72)), pick(data.get("power", 2.4)))

    def line(n, offset, flare_share, height, sharp):
        return Line(
            lambda x: half(x) - offset + flare(x) * flare_share,
            height,
            keys,
            ends("front", n),
            ends("rear", n),
            sharp,
        )

    floor = line(0, 0.1, 0.0, lambda x, y: clearance, False)
    skirt = line(1, 0.03, 0.3, lambda x, y: clearance + 0.035, True)
    sill = line(2, 0.006, 0.7, lambda x, y: spec["sill"](x), True)
    waist = line(3, 0.0, 1.0, lambda x, y: spec["waist"](x), spec.get("waist_sharp", True))
    high = line(4, inset, 0.45, lambda x, y: shoulder(x), True)
    top = line(5, inset + shelf, 0.0, lid, spec.get("top_sharp", False))
    lines = [
        floor,
        skirt,
        sill,
        Blend(sill, waist, 0.5, spec.get("belly", 0.006)),
        waist,
        Blend(waist, high, 0.55, spec.get("flank", 0.012)),
        high,
        top,
    ]
    hull = Hull(lines, lid, fascia=spec.get("fascia", 6), corner=spec.get("corner", 4), step=spec.get("step", 0.11), lid_rows=spec.get("lid_rows", 5))

    def default(band, station, point):
        if band == 0:
            return "underbody"
        return "body"

    car.body(hull, paint or default)
    car.lid = lid
    return hull


def cabin(car, spec, **options):
    base_width = spec["base_width"]
    rail_width = spec["rail_width"]
    centre = spec["roof"]
    drop = spec.get("drop", 0.05)
    body_lid = car.lid

    def roof(x, y):
        return centre(x) - drop * min(1.0, abs(y) / rail_width(x)) ** 2.4

    base = Line(base_width, lambda x, y: body_lid(x, y) - 0.012, spec["base_keys"], spec["base_front"], spec["base_rear"])
    rail = Line(rail_width, roof, spec["rail_keys"], spec["rail_front"], spec["rail_rear"])
    crest_front = spec["rail_front"]
    crest_rear = spec["rail_rear"]
    pull = spec.get("crest", 0.07)
    crest = Line(
        lambda x: rail_width(x) - pull,
        roof,
        spec["rail_keys"],
        End(crest_front.tip - pull * 0.8, crest_front.bow, crest_front.flat, crest_front.power),
        End(crest_rear.tip + pull * 0.8, crest_rear.bow, crest_rear.flat, crest_rear.power),
    )
    bulge = spec.get("bulge", 0.018)
    lines = [
        base,
        Blend(base, rail, spec.get("sill", 0.08), sharp=True),
        Blend(base, rail, 0.5, bulge),
        Blend(base, rail, spec.get("header", 0.93), sharp=True),
        rail,
        crest,
    ]
    hull = Hull(
        lines,
        roof,
        floor=lambda x, y: body_lid(x, y) + 0.004,
        fascia=spec.get("fascia", 5),
        corner=spec.get("corner", 3),
        step=spec.get("step", 0.16),
        lid_rows=4,
    )
    car.greenhouse(hull, spec["glass"], {1, 2}, **options)
    car.roof = roof
    return hull


def slats(car, pocket, count, material, a=(0.02, 0.98), b=(0.1, 0.9), height=(0.01, 0.03), thickness=0.3, group="Body", mirror=False):
    for n in range(count):
        centre = b[0] + (b[1] - b[0]) * (n + 0.5) / count
        size = (b[1] - b[0]) / count * thickness
        part = pocket.slab(a[0], a[1], centre - size / 2, centre + size / 2, height[0], height[1], material)
        if mirror:
            car.model.add(part, group)
        else:
            car.model.absorb(part, group)


def posts(car, pocket, count, material, a=(0.02, 0.98), b=(0.05, 0.95), height=(0.01, 0.03), thickness=0.3, mirror=False):
    for n in range(count):
        centre = a[0] + (a[1] - a[0]) * (n + 0.5) / count
        size = (a[1] - a[0]) / count * thickness
        part = pocket.slab(centre - size / 2, centre + size / 2, b[0], b[1], height[0], height[1], material)
        if mirror:
            car.model.add(part)
        else:
            car.model.absorb(part)


def round_lamp(car, pocket, a, b, radius, group, bezel="chrome", depth=0.045, mirror=True):
    lens = pocket.disc(
        a,
        b,
        [(0, 0.0), (radius * 0.86, 0.0), (radius * 0.86, depth * 0.62), (radius * 0.62, depth * 0.88), (radius * 0.3, depth), (0, depth * 1.03)],
        "lens_head" if group == "Headlights" else "lens_tail",
        segments=20,
    )
    ring = pocket.disc(
        a,
        b,
        [(radius * 0.84, 0.0), (radius, 0.0), (radius, depth * 0.8), (radius * 0.92, depth * 0.95), (radius * 0.84, depth * 0.8)],
        bezel,
        segments=20,
    )
    if mirror:
        car.model.add(lens, group)
        car.model.add(ring)
    else:
        car.model.absorb(lens, group)
        car.model.absorb(ring)


def block_lamp(car, pocket, a, b, lift, material, group="Body", frame=None, mirror=True, base=0.0):
    part = pocket.slab(a[0], a[1], b[0], b[1], base, lift, material)
    if mirror:
        car.model.add(part, group)
    else:
        car.model.absorb(part, group)
    if frame:
        pad_a = (a[1] - a[0]) * 0.06
        pad_b = (b[1] - b[0]) * 0.1
        surround = pocket.slab(a[0] - pad_a, a[1] + pad_a, b[0] - pad_b, b[1] + pad_b, base, lift * 0.7, frame)
        if mirror:
            car.model.add(surround)
        else:
            car.model.absorb(surround)


def door_seams(car, fronts, low, high, steps=10):
    for x in fronts:
        car.stroke((x, low(x)), (x, high(x)), car.side, steps=steps)


def exhaust(car, y, x, z, radius=0.032, length=0.2, material="chrome"):
    outer = lathe(
        [(radius * 0.78, 0), (radius, 0), (radius, length), (radius * 0.78, length)],
        material,
        origin=(x, y, z),
        axis=(1, 0, 0),
        segments=14,
    )
    car.model.add(outer)
    car.model.add(cylinder((x + 0.03, y, z), (x + length, y, z), radius * 0.8, "seam", segments=10))


def plate(car, x, z, facing, width=0.34, height=0.1):
    car.model.absorb(box((x + facing * 0.004, 0, z), (0.008, width, height), "plate"))
    car.model.absorb(box((x, 0, z), (0.008, width + 0.02, height + 0.02), "trim_black"))


def touring():
    front_wheel = {"radius": 0.342665, "width": 0.2, "rim": 0.205, "dish": 0.05, "spokes": 5, "root": 0.075, "tip": 0.06, "thick": 0.03, "lean": 0.018, "hub": 0.075, "lip": "chrome", "cap": "chrome"}
    car = Car("touring", 2.75, 1.36, front_wheel)
    axle = car.axle
    nose, stern = 2.3, -2.38
    spec = {
        "half": curve([(stern, 0.735), (-1.9, 0.795), (-axle, 0.82), (0.0, 0.825), (axle, 0.815), (1.95, 0.79), (nose, 0.74)]),
        "flare": lambda x: 0.022 * bump(x, axle, 0.62) + 0.03 * bump(x, -axle, 0.66),
        "clearance": 0.175,
        "sill": curve([(stern, 0.36), (-1.9, 0.31), (0, 0.3), (1.9, 0.31), (nose, 0.34)]),
        "waist": curve([(stern, 0.63), (-axle, 0.62), (0, 0.585), (axle, 0.575), (nose, 0.535)]),
        "shoulder": curve([(stern, 0.885), (-1.9, 0.915), (-1.1, 0.925), (-0.2, 0.9), (0.55, 0.89), (axle, 0.81), (nose, 0.705)]),
        "crown": curve([(stern, 0.02), (-1.9, 0.03), (0.55, 0.035), (axle, 0.05), (nose, 0.035)]),
        "keys": [2.02, axle, 0.5, -0.5, -axle, -2.08],
        "front": {"tips": (nose - 0.16, nose - 0.07, nose - 0.02, nose, nose - 0.035, nose - 0.085), "bow": (0.05, 0.06, 0.07, 0.07, 0.07, 0.07), "flat": 0.76, "power": 2.6},
        "rear": {"tips": (stern + 0.14, stern + 0.06, stern + 0.015, stern, stern + 0.03, stern + 0.075), "bow": 0.06, "flat": 0.76, "power": 2.6},
        "flank": 0.014,
    }
    hull = shell(car, spec)
    shoulder = spec["shoulder"]
    sill = spec["sill"]
    waist = spec["waist"]

    grille = car.pocket(car.nose, (-0.63, 0.63), (0.565, 0.69), 0.07, "grille", mirror=False)
    slats(car, grille, 6, "chrome", a=(0.215, 0.785), b=(0.06, 0.94), height=(0.02, 0.042), thickness=0.22)
    car.model.absorb(grille.slab(0.488, 0.512, 0.04, 0.96, 0.02, 0.05, "chrome"))
    for a in (0.062, 0.158):
        round_lamp(car, grille, a, 0.5, 0.058, "Headlights", mirror=False)
        round_lamp(car, grille, 1 - a, 0.5, 0.058, "Headlights", mirror=False)
    lower = car.pocket(car.nose, (-0.4, 0.4), (0.375, 0.445), 0.05, "grille", mirror=False)
    slats(car, lower, 3, "trim_black", height=(0.01, 0.03))
    car.decal(car.nose, (0.5, 0.63), (0.385, 0.435), "lens_amber", lift=0.003, thickness=0.012)

    tail = car.pocket(car.tail, (0.6, -0.6), (0.69, 0.82), 0.04, "trim_black", mirror=False)
    for a0, a1 in ((0.03, 0.13), (0.14, 0.24), (0.25, 0.35)):
        block_lamp(car, tail, (a0, a1), (0.12, 0.88), 0.03, "lens_tail", "Taillights", mirror=False)
        block_lamp(car, tail, (1 - a1, 1 - a0), (0.12, 0.88), 0.03, "lens_tail", "Taillights", mirror=False)
    for a in (0.135, 0.245, 0.355, 0.02):
        for position in (a, 1 - a):
            car.model.absorb(tail.slab(position - 0.006, position + 0.006, 0.06, 0.94, 0.0, 0.036, "chrome"))
    car.model.absorb(tail.slab(0.02, 0.98, 0.02, 0.07, 0.0, 0.036, "chrome"))
    car.model.absorb(tail.slab(0.02, 0.98, 0.93, 0.98, 0.0, 0.036, "chrome"))
    car.model.absorb(tail.slab(0.37, 0.63, 0.12, 0.88, 0.0, 0.006, "plate"))

    for hole in (car.vent((1.22, 0.98), (0.32, 0.5)),):
        slats(car, hole, 5, "trim_black", a=(0.05, 0.95), b=(0.05, 0.95), height=(0.012, 0.03), thickness=0.35, mirror=True)
    car.arches(0.058)
    front_bumper = hull.front_indices(axle + 0.47)
    rear_bumper = hull.rear_indices(-axle - 0.47)
    car.cut()
    car.arch_lips(width=0.028, proud=0.01)
    car.rail(3.25, front_bumper, bar_profile(0.06, 0.085, 0.022), "chrome")
    car.rail(3.25, rear_bumper, bar_profile(0.06, 0.085, 0.022), "chrome")
    for y in (0.3, -0.3):
        car.model.absorb(box((nose + 0.07, y, 0.5), (0.04, 0.05, 0.14), "chrome", bevel=0.012))
        car.model.absorb(box((stern - 0.065, y, 0.57), (0.04, 0.05, 0.14), "chrome", bevel=0.012))
    middle = hull.indices(lambda station, point: station[0] == "side" and -axle + 0.44 <= point.x <= axle - 0.44)
    car.rail(SILL, middle, [(-0.01, -0.016), (0.008, -0.016), (0.008, 0.016), (-0.01, 0.016)], "chrome", mirrored=False)

    top_edge = lambda x: shoulder(x) - 0.012
    door_seams(car, (0.5, -0.62), lambda x: sill(x) + 0.01, top_edge)
    car.stroke((0.5, sill(0) + 0.012), (-0.62, sill(0) + 0.012), car.side, steps=12)
    car.stroke((0.62, 0.71), (2.12, 0.71), car.top, steps=16)
    car.stroke((0.62, -0.71), (0.62, 0.71), car.top, steps=14, mirror=False)
    car.stroke((-2.02, 0.66), (-2.3, 0.66), car.top, steps=4)
    car.stroke((-2.02, -0.66), (-2.02, 0.66), car.top, steps=12, mirror=False)
    car.handles(-0.48, 0.83)
    car.mirrors(0.3, 0.87, material="chrome", size=(0.06, 0.13, 0.085), reach=0.06, stalk="chrome")
    exhaust(car, 0.36, stern - 0.03, 0.29, radius=0.03, length=0.16)
    exhaust(car, 0.28, stern - 0.03, 0.29, radius=0.03, length=0.16)

    cabin_spec = {
        "base_width": lambda x: spec["half"](x) - 0.1,
        "rail_width": curve([(-1.2, 0.5), (-0.5, 0.575), (0.0, 0.565)]),
        "roof": curve([(-1.2, 1.185), (-0.75, 1.262), (-0.4, 1.275), (-0.02, 1.235)]),
        "drop": 0.05,
        "base_keys": [0.35, -0.56, -0.63, -1.5],
        "rail_keys": [-0.13, -0.58, -0.65, -1.06],
        "base_front": End(0.57, 0.12, 0.86, 2.2),
        "base_rear": End(-2.0, 0.08, 0.72, 2.2),
        "rail_front": End(-0.02, 0.08, 0.84, 2.2),
        "rail_rear": End(-1.2, 0.05, 0.8, 2.2),
        "glass": {0, 2},
    }
    glass = cabin(car, cabin_spec)
    car.wipers(glass)
    side_glass = glass.indices(lambda station, point: station[0] == "side")
    trim = [(-0.004, -0.009), (0.006, -0.009), (0.006, 0.009), (-0.004, 0.009)]
    car.rail(1.0, side_glass, trim, "chrome", hull=glass, mirrored=False)
    car.rail(3.0, side_glass, trim, "chrome", hull=glass, mirrored=False)
    floor = car.lid(-0.3, 0) + 0.004
    car.seats(-0.42, floor, 0.33, rear_bench=-1.12)
    car.dashboard(0.12, floor, 1.1, 0.33)
    car.place_wheels()
    return car, "#8f1d1a"


def hatchback():
    front_wheel = {"radius": 0.3, "width": 0.185, "rim": 0.185, "dish": 0.03, "spokes": 8, "root": 0.035, "tip": 0.03, "thick": 0.024, "lean": 0.008, "hub": 0.06}
    car = Car("hatchback", 2.3, 1.38, front_wheel)
    axle = car.axle
    nose, stern = 1.88, -1.74
    spec = {
        "half": curve([(stern, 0.775), (-axle, 0.815), (0.0, 0.82), (axle, 0.812), (nose, 0.765)]),
        "flare": lambda x: 0.02 * bump(x, axle, 0.55) + 0.02 * bump(x, -axle, 0.55),
        "clearance": 0.17,
        "sill": constant(0.3),
        "waist": curve([(stern, 0.63), (0, 0.6), (axle, 0.585), (nose, 0.565)]),
        "shoulder": curve([(stern, 0.925), (-0.4, 0.915), (0.6, 0.9), (axle, 0.815), (nose, 0.725)]),
        "crown": curve([(stern, 0.0), (0.6, 0.03), (axle, 0.04), (nose, 0.03)]),
        "keys": [1.66, axle, 0.5, -0.5, -axle, -1.6],
        "front": {"tips": (nose - 0.15, nose - 0.06, nose - 0.012, nose, nose - 0.03, nose - 0.075), "bow": 0.05, "flat": 0.8, "power": 2.8},
        "rear": {"tips": (stern + 0.12, stern + 0.04, stern + 0.008, stern, stern + 0.012, stern + 0.06), "bow": 0.035, "flat": 0.82, "power": 2.8},
        "flank": 0.01,
    }
    hull = shell(car, spec)
    shoulder = spec["shoulder"]

    lamps = car.pocket(car.nose, (0.37, 0.74), (0.6, 0.705), 0.035, "trim_black")
    block_lamp(car, lamps, (0.05, 0.72), (0.1, 0.9), 0.024, "lens_head", "Headlights", frame="chrome")
    block_lamp(car, lamps, (0.78, 0.96), (0.1, 0.9), 0.024, "lens_amber")
    grille = car.pocket(car.nose, (-0.34, 0.34), (0.605, 0.7), 0.05, "grille", mirror=False)
    slats(car, grille, 4, "trim_black", height=(0.012, 0.036), thickness=0.4)
    intake = car.pocket(car.nose, (-0.5, 0.5), (0.335, 0.4), 0.05, "grille", mirror=False)
    slats(car, intake, 2, "trim_black", height=(0.012, 0.03), thickness=0.25)
    for a in (0.08, 0.92):
        round_lamp(car, intake, a, 0.5, 0.028, "Body", bezel="trim_black", depth=0.03, mirror=False)

    rear = car.pocket(car.tail, (0.44, 0.76), (0.67, 0.86), 0.03, "trim_black")
    block_lamp(car, rear, (0.06, 0.94), (0.42, 0.92), 0.022, "lens_tail", "Taillights")
    block_lamp(car, rear, (0.06, 0.6), (0.08, 0.36), 0.022, "lens_amber")
    block_lamp(car, rear, (0.66, 0.94), (0.08, 0.36), 0.022, "lens_clear")

    car.arches(0.055)
    front_bumper = hull.front_indices(axle + 0.42)
    rear_bumper = hull.rear_indices(-axle - 0.42)
    car.cut()
    car.arch_lips(width=0.03, proud=0.012, material="trim_black")
    car.rail(3.15, front_bumper, bar_profile(0.07, 0.15, 0.03), "trim_black")
    car.rail(3.15, rear_bumper, bar_profile(0.07, 0.15, 0.03), "trim_black")
    middle = hull.indices(lambda station, point: station[0] == "side" and -axle + 0.4 <= point.x <= axle - 0.4)
    car.rail(WAIST, middle, [(-0.01, -0.025), (0.012, -0.025), (0.012, 0.025), (-0.01, 0.025)], "trim_black", mirrored=False)
    car.rail(1.5, middle, [(-0.01, -0.04), (0.01, -0.04), (0.01, 0.04), (-0.01, 0.04)], "trim_black", mirrored=False)
    plate(car, nose + 0.072, 0.47, 1)
    car.decal(car.tail, (0.19, -0.19), (0.7, 0.81), "plate", lift=0.004, mirror=False, steps=(2, 1))

    top_edge = lambda x: shoulder(x) - 0.012
    door_seams(car, (0.52, -0.55), constant(0.31), top_edge)
    car.stroke((0.52, 0.312), (-0.55, 0.312), car.side, steps=10)
    car.stroke((0.68, 0.7), (1.72, 0.7), car.top, steps=12)
    car.stroke((0.68, -0.7), (0.68, 0.7), car.top, steps=12, mirror=False)
    car.stroke((-0.74, 0.64), (0.74, 0.64), car.tail, steps=12, mirror=False)
    car.stroke((0.74, 0.64), (0.74, 0.9), car.tail, steps=4)
    car.handles(-0.42, 0.83, material="trim_black")
    car.mirrors(0.4, 0.91, material="trim_black", size=(0.07, 0.15, 0.1), reach=0.05)
    exhaust(car, 0.42, stern - 0.02, 0.275, radius=0.028, length=0.16)

    cabin_spec = {
        "base_width": lambda x: spec["half"](x) - 0.1,
        "rail_width": curve([(-1.3, 0.585), (-0.4, 0.61), (0.15, 0.59)]),
        "roof": curve([(-1.34, 1.36), (-1.0, 1.39), (-0.35, 1.4), (0.13, 1.355)]),
        "drop": 0.045,
        "base_keys": [0.43, -0.5, -0.58, -1.3],
        "rail_keys": [0.02, -0.52, -0.6, -1.16],
        "base_front": End(0.64, 0.1, 0.87, 2.3),
        "base_rear": End(-1.66, 0.04, 0.86, 2.6),
        "rail_front": End(0.13, 0.07, 0.86, 2.3),
        "rail_rear": End(-1.34, 0.03, 0.86, 2.6),
        "glass": {0, 2},
    }
    car.wipers(cabin(car, cabin_spec))
    roof = car.roof
    car.model.absorb(bar((-1.5, 0.08, 1.16), (-1.56, 0.42, 1.03), 0.02, 0.012, "trim_black"))
    floor = car.lid(-0.3, 0) + 0.004
    car.seats(-0.38, floor, 0.34, rear_bench=-1.05, material="interior")
    car.dashboard(0.2, floor, 1.1, 0.34)
    car.place_wheels()
    return car, "#c9331f"


def supercar():
    front_wheel = {"radius": 0.345, "width": 0.245, "rim": 0.25, "dish": 0.022, "spokes": 5, "twin": 0.2, "root": 0.03, "tip": 0.024, "thick": 0.03, "lean": 0.01, "hub": 0.065, "barrel": "rim_dark", "groove_depth": 0.006}
    rear_wheel = dict(front_wheel, width=0.3, grooves=4)
    car = Car("supercar", 2.6, 1.62, front_wheel, rear_wheel)
    axle = car.axle
    nose, stern = 2.3, -2.12
    spec = {
        "half": curve([(stern, 0.93), (-axle, 0.985), (-0.45, 0.955), (0.3, 0.935), (axle, 0.955), (nose, 0.87)]),
        "flare": lambda x: 0.02 * bump(x, axle, 0.6) + 0.025 * bump(x, -axle, 0.7),
        "clearance": 0.115,
        "sill": curve([(stern, 0.36), (-axle, 0.25), (0, 0.22), (axle, 0.22), (nose, 0.21)]),
        "waist": curve([(stern, 0.64), (-axle, 0.6), (-0.3, 0.47), (axle, 0.45), (nose, 0.365)]),
        "shoulder": curve([(stern, 0.885), (-1.85, 0.862), (-axle, 0.87), (-0.6, 0.81), (0.1, 0.78), (0.8, 0.775), (axle, 0.775), (1.9, 0.67), (nose, 0.485)]),
        "crown": curve([(stern, 0.015), (-axle, 0.03), (0.3, 0.0), (0.9, -0.03), (axle, -0.06), (1.9, -0.03), (nose, 0.01)]),
        "keys": [2.0, axle, 0.45, -0.45, -axle, -1.86],
        "front": {"tips": (nose - 0.1, nose - 0.02, nose, nose - 0.015, nose - 0.13, nose - 0.2), "bow": (0.1, 0.14, 0.15, 0.15, 0.15, 0.15), "flat": 0.74, "power": 2.5},
        "rear": {"tips": (stern + 0.24, stern + 0.07, stern + 0.01, stern, stern + 0.03, stern + 0.07), "bow": 0.05, "flat": 0.8, "power": 2.6},
        "inset": 0.05,
        "shelf": 0.06,
        "flank": 0.02,
        "belly": 0.0,
    }

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        return "body"

    hull = shell(car, spec, paint)
    shoulder = spec["shoulder"]
    sill = spec["sill"]

    lamps = car.pocket(car.nose, (0.4, 0.8), (0.38, 0.46), 0.03, "trim_black")
    block_lamp(car, lamps, (0.04, 0.96), (0.62, 0.9), 0.016, "lens_head", "Headlights")
    for a in (0.2, 0.45):
        round_lamp(car, lamps, a, 0.3, 0.02, "Headlights", bezel="chrome", depth=0.02)
    block_lamp(car, lamps, (0.62, 0.96), (0.12, 0.46), 0.014, "lens_amber")
    mouth = car.pocket(car.nose, (-0.3, 0.3), (0.232, 0.335), 0.08, "grille", mirror=False)
    slats(car, mouth, 3, "trim_black", height=(0.02, 0.05), thickness=0.18)
    ducts = car.pocket(car.nose, (0.4, 0.78), (0.232, 0.335), 0.08, "grille")
    slats(car, ducts, 2, "trim_black", height=(0.02, 0.05), thickness=0.2, mirror=True)

    panel = car.pocket(car.tail, (0.82, -0.82), (0.67, 0.81), 0.035, "grille", mirror=False)
    block_lamp(car, panel, (0.03, 0.4), (0.52, 0.8), 0.022, "lens_tail", "Taillights", mirror=False)
    block_lamp(car, panel, (0.6, 0.97), (0.52, 0.8), 0.022, "lens_tail", "Taillights", mirror=False)
    block_lamp(car, panel, (0.41, 0.59), (0.6, 0.72), 0.018, "lens_tail", "Taillights", mirror=False)
    slats(car, panel, 3, "trim_black", a=(0.03, 0.97), b=(0.08, 0.44), height=(0.008, 0.024), thickness=0.3)
    outlet = car.pocket(car.tail, (0.36, -0.36), (0.42, 0.57), 0.06, "grille", mirror=False)
    for a in (0.2, 0.4, 0.6, 0.8):
        ring = outlet.disc(a, 0.5, [(0.03, 0.0), (0.04, 0.0), (0.04, 0.085), (0.03, 0.085)], "chrome", segments=14)
        car.model.absorb(ring)
    diffuser = car.pocket(car.tail, (0.62, -0.62), (0.165, 0.33), 0.05, "grille", mirror=False)
    posts(car, diffuser, 7, "trim_black", a=(0.04, 0.96), b=(0.0, 1.0), height=(0.0, 0.07), thickness=0.1)

    scoop = car.pocket(car.side, (-0.3, -0.84), (0.5, 0.72), 0.13, "grille")
    for b in (0.36, 0.68):
        car.model.add(scoop.slab(0.0, 1.0, b - 0.03, b + 0.03, 0.05, 0.135, "body"))

    hood = car.vent((1.75, 1.45), (0.2, 0.52))
    slats(car, hood, 3, "trim_black", a=(0.05, 0.95), b=(0.05, 0.95), height=(0.012, 0.03), thickness=0.3, mirror=True)
    car.arches(0.045, inner=0.09)
    front_lip = hull.front_indices(axle + 0.42)
    car.cut()
    car.arch_lips(width=0.022, proud=0.006)
    car.rail(0.6, front_lip, [(-0.04, -0.012), (0.07, -0.012), (0.075, 0.0), (0.02, 0.012), (-0.04, 0.012)], "trim_black")
    middle = hull.indices(lambda station, point: station[0] == "side" and -axle + 0.42 <= point.x <= axle - 0.42)
    car.rail(1.0, middle, [(-0.04, -0.03), (0.03, -0.03), (0.035, -0.015), (0.0, 0.02), (-0.04, 0.02)], "trim_black", mirrored=False)

    top_edge = lambda x: shoulder(x) - 0.015
    door_seams(car, (0.62, -0.3), lambda x: sill(x) + 0.012, top_edge)
    car.stroke((0.62, sill(0) + 0.014), (-0.3, sill(0) + 0.014), car.side, steps=10)
    car.stroke((1.08, 0.6), (2.0, 0.52), car.top, steps=12)
    car.stroke((1.08, -0.6), (1.08, 0.6), car.top, steps=12, mirror=False)
    car.decal(car.top, (-0.86, -1.82), (-0.5, 0.5), "grille", lift=0.004, steps=(6, 4), mirror=False)
    for n in range(7):
        x = -0.95 - n * 0.125
        height = car.top(x, 0)[0].z
        car.model.absorb(box((x, 0, height + 0.016), (0.085, 0.94, 0.012), "trim_black", rotation=Matrix.Rotation(math.radians(-16), 3, "Y")))
    car.mirrors(0.52, 0.76, material="body", size=(0.08, 0.15, 0.085), reach=0.05)

    cabin_spec = {
        "base_width": curve([(-1.6, 0.6), (-0.4, 0.74), (1.0, 0.72)]),
        "rail_width": curve([(-0.8, 0.47), (-0.2, 0.53), (0.25, 0.5)]),
        "roof": curve([(-0.82, 1.045), (-0.5, 1.105), (-0.15, 1.125), (0.24, 1.09)]),
        "drop": 0.05,
        "base_keys": [0.76, -0.36, -0.44, -1.0],
        "rail_keys": [0.1, -0.38, -0.46, -0.66],
        "base_front": End(1.04, 0.16, 0.84, 2.2),
        "base_rear": End(-1.6, 0.05, 0.75, 2.2),
        "rail_front": End(0.24, 0.1, 0.82, 2.2),
        "rail_rear": End(-0.82, 0.04, 0.8, 2.2),
        "glass": {0, 2},
        "bulge": 0.025,
    }
    car.wipers(cabin(car, cabin_spec))
    floor = car.lid(-0.1, 0) + 0.004
    car.seats(-0.2, floor, 0.3, height=0.13, width=0.4, material="interior")
    car.dashboard(0.45, floor, 0.95, 0.3, height=0.04)
    car.place_wheels()
    return car, "#c81e1e"


def pickup():
    front_wheel = {"radius": 0.42, "width": 0.27, "rim": 0.215, "dish": 0.06, "style": "steel", "metal": "rim_white", "lip": "rim_white", "spokes": 8, "lugs": 22, "grooves": 3, "groove_depth": 0.014}
    car = Car("pickup", 3.2, 1.62, front_wheel)
    axle = car.axle
    nose, stern = 2.56, -2.76
    spec = {
        "half": curve([(stern, 0.95), (-axle, 0.965), (0.0, 0.965), (axle, 0.965), (nose, 0.935)]),
        "flare": lambda x: 0.03 * bump(x, axle, 0.75) + 0.03 * bump(x, -axle, 0.75),
        "clearance": 0.35,
        "sill": curve([(stern, 0.6), (-2.2, 0.52), (0, 0.5), (2.1, 0.52), (nose, 0.58)]),
        "waist": curve([(stern, 0.84), (0, 0.82), (nose, 0.8)]),
        "shoulder": curve([(stern, 1.19), (0.9, 1.19), (axle, 1.15), (nose, 1.1)]),
        "crown": curve([(stern, 0.0), (0.7, 0.0), (0.95, 0.03), (nose, 0.035)]),
        "keys": [2.34, axle, 0.6, -0.66, -axle, -2.56],
        "front": {"tips": (nose - 0.16, nose - 0.06, nose - 0.01, nose, nose - 0.015, nose - 0.06), "bow": 0.04, "flat": 0.84, "power": 3.4},
        "rear": {"tips": (stern + 0.14, stern + 0.05, stern + 0.008, stern, stern + 0.005, stern + 0.05), "bow": 0.015, "flat": 0.86, "power": 3.6},
        "inset": 0.03,
        "shelf": 0.04,
        "flank": 0.008,
        "belly": 0.004,
    }

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band in (2, 3) and station[0] in ("side", "front_corner", "rear_corner"):
            return "accent"
        return "body"

    hull = shell(car, spec, paint)
    shoulder = spec["shoulder"]
    sill = spec["sill"]

    grille = car.pocket(car.nose, (-0.82, 0.82), (0.83, 1.07), 0.06, "grille", mirror=False)
    slats(car, grille, 4, "chrome", a=(0.2, 0.8), b=(0.08, 0.92), height=(0.015, 0.04), thickness=0.16)
    posts(car, grille, 9, "chrome", a=(0.2, 0.8), b=(0.08, 0.92), height=(0.015, 0.036), thickness=0.1)
    for a0, a1, b0, b1 in ((0.0, 1.0, 0.0, 0.07), (0.0, 1.0, 0.93, 1.0), (0.0, 0.015, 0.0, 1.0), (0.985, 1.0, 0.0, 1.0), (0.19, 0.205, 0.0, 1.0), (0.795, 0.81, 0.0, 1.0)):
        car.model.absorb(grille.slab(a0, a1, b0, b1, 0.0, 0.068, "chrome"))
    for a0, a1 in ((0.035, 0.175), (0.825, 0.965)):
        block_lamp(car, grille, (a0, a1), (0.44, 0.88), 0.04, "lens_head", "Headlights", frame="chrome", mirror=False)
        block_lamp(car, grille, (a0, a1), (0.12, 0.36), 0.035, "lens_amber", mirror=False)

    rear = car.pocket(car.tail, (0.76, 0.9), (0.86, 1.14), 0.03, "trim_black")
    block_lamp(car, rear, (0.1, 0.9), (0.36, 0.95), 0.024, "lens_tail", "Taillights", frame="chrome")
    block_lamp(car, rear, (0.1, 0.9), (0.05, 0.3), 0.024, "lens_clear", frame="chrome")

    car.carve(box((-1.69, 0, 1.6), (1.94, 1.66, 1.2), "body"))
    car.carve(box((-0.86, 0, 0.9), (0.28, 1.66, 0.22), "body"))
    car.carve(box((-2.42, 0, 0.9), (0.48, 1.66, 0.22), "body"))
    car.carve(box((-1.6, 0, 0.9), (1.3, 1.02, 0.22), "body"))
    car.arches(0.12, inner=0.1)
    front_bumper = hull.front_indices(axle + 0.6)
    rear_bumper = hull.rear_indices(-axle - 0.6)
    car.cut()
    car.arch_lips(width=0.04, proud=0.016)
    car.rail(3.0, front_bumper, bar_profile(0.11, 0.17, 0.035), "chrome")
    car.rail(3.0, rear_bumper, bar_profile(0.1, 0.17, 0.035), "chrome")
    plate(car, nose + 0.112, 0.69, 1)
    plate(car, stern - 0.102, 0.69, -1)
    whole = hull.indices(lambda station, point: station[0] == "side")
    strip = [(-0.008, -0.014), (0.008, -0.014), (0.008, 0.014), (-0.008, 0.014)]
    for first, last in ((axle + 0.6, 9), (-axle + 0.6, axle - 0.6), (-9, -axle - 0.6)):
        part = [i for i in whole if first <= hull.grid[0][i].x <= last] if first < last else []
        if len(part) > 1:
            car.rail(WAIST, part, strip, "chrome", mirrored=False)
    car.model.absorb(box((-1.69, 0, 0.803), (1.9, 1.0, 0.004), "trim_black"))

    top_edge = lambda x: shoulder(x) - 0.01
    door_seams(car, (0.72, -0.5, -0.69), lambda x: sill(x) + 0.01, top_edge)
    car.stroke((0.72, sill(0) + 0.012), (-0.5, sill(0) + 0.012), car.side, steps=10)
    car.stroke((1.02, 0.84), (2.4, 0.84), car.top, steps=12)
    car.stroke((1.02, -0.84), (1.02, 0.84), car.top, steps=12, mirror=False)
    car.stroke((-0.72, 0.87), (0.72, 0.87), car.tail, steps=10, mirror=False)
    car.stroke((0.72, 0.87), (0.72, 1.16), car.tail, steps=4)
    car.model.absorb(box((stern - 0.012, 0, 1.08), (0.02, 0.2, 0.03), "chrome", bevel=0.006))
    car.handles(-0.36, 1.06)
    car.mirrors(0.62, 1.2, material="chrome", size=(0.05, 0.16, 0.22), reach=0.12, stalk="chrome")

    cabin_spec = {
        "base_width": lambda x: spec["half"](x) - 0.085,
        "rail_width": constant(0.76),
        "roof": curve([(-0.6, 1.8), (-0.1, 1.83), (0.52, 1.79)]),
        "drop": 0.04,
        "base_keys": [0.78, -0.5],
        "rail_keys": [0.42, -0.5],
        "base_front": End(0.96, 0.08, 0.88, 2.4),
        "base_rear": End(-0.62, 0.015, 0.9, 3.0),
        "rail_front": End(0.54, 0.06, 0.88, 2.4),
        "rail_rear": End(-0.6, 0.015, 0.9, 3.0),
        "glass": {0},
        "sill": 0.06,
        "bulge": 0.01,
    }
    glass = cabin(car, cabin_spec)
    car.wipers(glass)
    side_glass = glass.indices(lambda station, point: station[0] == "side")
    trim = [(-0.004, -0.009), (0.006, -0.009), (0.006, 0.009), (-0.004, 0.009)]
    car.rail(1.0, side_glass, trim, "chrome", hull=glass, mirrored=False)
    floor = car.lid(0.0, 0) + 0.004
    car.seats(-0.28, floor, 0.36, height=0.2, width=0.6)
    car.dashboard(0.52, floor, 1.4, 0.4)
    car.place_wheels()
    return car, "#b5271c"


DESIGNS = {"touring": touring, "hatchback": hatchback, "supercar": supercar, "pickup": pickup}
