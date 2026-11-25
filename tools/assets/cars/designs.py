import math

from carkit import Loft, Model, wheel_arches

COLUMNS = ("s", "half", "floor", "belt", "edge", "top", "crown", "bow")


def stations(rows):
    made = []
    for row in rows:
        station = dict(zip(COLUMNS, row[: len(COLUMNS)]))
        if len(row) > len(COLUMNS):
            station.update(row[len(COLUMNS)])
        made.append(station)
    return made


def rule(bands, start, end, material):
    return {"bands": bands, "from": start, "to": end, "material": material}


SCREEN = ("topwall", "top")


def seam(model, s, low, high, width=0.011):
    model.decal(
        "side",
        (s - width / 2, s + width / 2, low, high),
        "underbody",
        lift=0.0025,
        cells=(1, 10),
        skirt=False,
        mirror=True,
    )


def top_seam(model, rect, cells, mirror=False):
    model.decal("top", rect, "underbody", lift=0.0025, cells=cells, skirt=False, mirror=mirror)


def handle(model, s, z, material, length=0.11):
    x = model.project("side", s, z).x
    model.box((0.024, length, 0.026), (x + 0.006, s, z), material, bevel=0.006, mirror=True)


def mirror_pod(model, s, z, material, size=(0.07, 0.05, 0.1), stalk=0.07):
    x = model.project("side", s, z).x
    model.box((stalk + 0.02, 0.03, 0.03), (x + stalk / 2 - 0.01, s, z), "trim_black", mirror=True)
    model.box(size, (x + stalk + size[0] / 2 - 0.01, s, z + 0.035), material, bevel=0.012, mirror=True)


def wipers(model, base_s, tip_s, spans):
    for start_x, end_x in spans:
        start = model.project("top", start_x, base_s, 0.014)
        end = model.project("top", end_x, tip_s, 0.014)
        model.bar(start, end, 0.014, 0.008, "trim_black")


def exhaust(model, x, s, z, radius=0.028, length=0.2):
    model.cylinder(radius, length, (x, s, z), "chrome", rotation=(math.pi / 2, 0, 0), segments=12)
    model.cylinder(
        radius * 0.78, length + 0.004, (x, s, z), "underbody", rotation=(math.pi / 2, 0, 0), segments=12
    )


def slats(model, axis, rect, count, thickness, material, lift, cells=(6, 1), mirror=False):
    a0, a1, b0, b1 = rect
    for k in range(count):
        centre = b0 + (b1 - b0) * (k + 0.5) / count
        model.decal(
            axis,
            (a0, a1, centre - thickness / 2, centre + thickness / 2),
            material,
            lift=lift,
            cells=cells,
            mirror=mirror,
        )


def touring():
    model = Model("touring")
    wheelbase, track, radius, tyre = 2.75, 1.36, 0.342665, 0.1836
    axles = (-wheelbase / 2, wheelbase / 2)
    loft = Loft(
        stations(
            [
                (-2.28, 0.775, 0.30, 0.72, 0.70, 0.755, 0.0, 0.05),
                (-2.24, 0.80, 0.24, 0.76, 0.72, 0.795, 0.005, 0.05),
                (-2.05, 0.80, 0.21, 0.775, 0.72, 0.81, 0.012, 0.02),
                (-1.2, 0.80, 0.20, 0.80, 0.72, 0.84, 0.02, 0.0),
                (-0.74, 0.80, 0.20, 0.82, 0.71, 0.865, 0.02, 0.0),
                (-0.70, 0.80, 0.20, 0.82, 0.70, 0.895, 0.02, 0.0),
                (-0.02, 0.80, 0.20, 0.83, 0.585, 1.325, 0.03, 0.0),
                (0.75, 0.80, 0.20, 0.83, 0.585, 1.34, 0.03, 0.0),
                (1.02, 0.80, 0.20, 0.83, 0.59, 1.325, 0.03, 0.0),
                (1.50, 0.80, 0.20, 0.84, 0.68, 0.93, 0.02, 0.0),
                (1.54, 0.80, 0.20, 0.84, 0.71, 0.90, 0.015, 0.0),
                (2.20, 0.80, 0.22, 0.84, 0.72, 0.875, 0.01, 0.0),
                (2.30, 0.80, 0.24, 0.84, 0.72, 0.87, 0.005, -0.03),
                (2.34, 0.775, 0.30, 0.80, 0.70, 0.835, 0.0, -0.05),
            ]
        ),
        {"roof_radius": 0.05, "tuck": 0.04},
    )
    rules = [
        rule(SCREEN, -0.655, -0.075, "glass"),
        rule(("upper",), -0.60, 0.42, "glass"),
        rule(("upper", "waistframe", "railframe"), 0.42, 0.50, "trim_black"),
        rule(("upper",), 0.50, 0.96, "glass"),
        rule(SCREEN, 1.075, 1.455, "glass"),
        rule(("waistframe",), -0.66, 1.0, "chrome"),
        rule(("railframe",), -0.60, 1.0, "chrome"),
    ]
    arches = wheel_arches(axles, track, radius, tyre, 0.68, 0.07, 0.06)
    model.build_shell(loft, rules, arches)
    model.arch_lips("chrome", width=0.022, lift=0.012)

    model.decal("front", (-0.37, 0.37, 0.545, 0.715), "trim_black", lift=0.004, cells=(6, 2))
    slats(model, "front", (-0.36, 0.36, 0.55, 0.71), 6, 0.011, "chrome", 0.013)
    model.decal("front", (-0.012, 0.012, 0.55, 0.71), "chrome", lift=0.016, cells=(1, 2))
    model.decal("front", (0.375, 0.74, 0.555, 0.705), "chrome", lift=0.005, cells=(4, 2), mirror=True)
    for inner, outer in ((0.39, 0.55), (0.57, 0.725)):
        model.decal(
            "front",
            (inner, outer, 0.572, 0.69),
            "lens_head",
            lift=0.014,
            cells=(3, 2),
            group="Headlights",
            mirror=True,
        )
    model.decal("front", (0.54, 0.72, 0.505, 0.545), "lens_amber", lift=0.01, cells=(3, 1), mirror=True)
    model.bumper(-1, 0.44, 0.44, 0.075, 0.105, "chrome")
    model.bumper(-1, 0.44, 0.44, 0.088, 0.034, "trim_black", bevel=0.006)
    nose = model.project("front", 0, 0.44).y
    model.box((0.36, 0.012, 0.1), (0, nose - 0.095, 0.44), "plate", bevel=0.003)
    for x in (0.5,):
        model.box((0.05, 0.05, 0.13), (x, nose - 0.085, 0.44), "trim_black", bevel=0.012, mirror=True)

    model.decal("rear", (0.19, 0.745, 0.585, 0.755), "chrome", lift=0.005, cells=(5, 2), mirror=True)
    model.decal(
        "rear",
        (0.31, 0.73, 0.60, 0.74),
        "lens_tail",
        lift=0.014,
        cells=(4, 2),
        group="Taillights",
        mirror=True,
    )
    model.decal("rear", (0.205, 0.295, 0.60, 0.74), "lens_clear", lift=0.012, cells=(1, 2), mirror=True)
    model.decal("rear", (-0.17, 0.17, 0.61, 0.725), "plate", lift=0.008, cells=(2, 1))
    model.decal("rear", (-0.74, 0.74, 0.775, 0.79), "chrome", lift=0.006, cells=(8, 1))
    model.bumper(1, 0.46, 0.44, 0.075, 0.105, "chrome")
    model.bumper(1, 0.46, 0.44, 0.088, 0.034, "trim_black", bevel=0.006)
    exhaust(model, -0.46, 2.27, 0.25)

    model.side_strip(-2.2, 2.26, 0.515, 0.54, "chrome", lift=0.008)
    model.side_strip(-0.95, 0.95, 0.225, 0.25, "chrome", lift=0.006)
    seam(model, -0.725, 0.27, 0.80)
    seam(model, 0.44, 0.27, 0.815)
    handle(model, 0.28, 0.745, "chrome")
    mirror_pod(model, -0.56, 0.87, "chrome")
    top_seam(model, (0.655, 0.663, -2.16, -0.78), (1, 12), mirror=True)
    top_seam(model, (-0.655, 0.655, -2.168, -2.16), (10, 1))
    top_seam(model, (0.665, 0.673, 1.60, 2.24), (1, 6), mirror=True)
    top_seam(model, (-0.665, 0.665, 1.592, 1.60), (10, 1))
    wipers(model, -0.665, -0.50, ((-0.50, -0.08), (0.06, 0.48)))
    model.bar((-0.7, 1.72, 0.86), (-0.7, 1.82, 1.36), 0.006, 0.006, "chrome")

    model.interior(
        {
            "front": -0.72,
            "tub_front": -0.42,
            "tub_rear": 0.9,
            "rear": 1.5,
            "shelf": 0.8,
            "width": 0.71,
            "floor": 0.28,
            "seats": [
                {"s": 0.02, "x": (-0.36, 0.36)},
                {"s": 0.6, "x": (0.0,), "width": 1.24, "headrest": False},
            ],
            "steering": (0.36, -0.3, 0.9),
        }
    )
    model.liner(-0.75, 1.52, 0.8)
    model.place_wheels(
        {
            "radius": radius,
            "width": tyre,
            "rim": 0.215,
            "holes": 14,
            "hole_radius": 0.013,
            "hole_ring": 0.8,
            "cap": 0.34,
            "dish": 0.025,
        },
        axles,
        track,
    )
    return model, "#6e1b1c"


def hatchback():
    model = Model("hatchback")
    wheelbase, track, radius, tyre = 2.3, 1.38, 0.3, 0.17
    axles = (-wheelbase / 2, wheelbase / 2)
    loft = Loft(
        stations(
            [
                (-1.88, 0.72, 0.27, 0.64, 0.64, 0.68, 0.01, 0.12),
                (-1.84, 0.775, 0.21, 0.69, 0.67, 0.735, 0.015, 0.11),
                (-1.70, 0.795, 0.18, 0.72, 0.68, 0.765, 0.03, 0.07),
                (-1.50, 0.80, 0.17, 0.76, 0.69, 0.81, 0.035, 0.02),
                (-1.15, 0.80, 0.17, 0.82, 0.69, 0.86, 0.04, 0.0),
                (-0.80, 0.80, 0.17, 0.86, 0.69, 0.895, 0.04, 0.0),
                (-0.76, 0.80, 0.17, 0.86, 0.68, 0.93, 0.04, 0.0),
                (-0.15, 0.80, 0.17, 0.89, 0.575, 1.40, 0.04, 0.0),
                (0.45, 0.80, 0.17, 0.90, 0.575, 1.445, 0.045, 0.0),
                (1.20, 0.80, 0.17, 0.92, 0.57, 1.425, 0.04, 0.0),
                (1.30, 0.80, 0.17, 0.92, 0.58, 1.385, 0.035, 0.0),
                (1.64, 0.80, 0.17, 0.92, 0.67, 0.99, 0.02, -0.02),
                (1.70, 0.795, 0.19, 0.90, 0.68, 0.95, 0.01, -0.04),
                (1.76, 0.78, 0.23, 0.86, 0.675, 0.90, 0.0, -0.07),
                (1.80, 0.74, 0.30, 0.78, 0.65, 0.82, 0.0, -0.10),
            ]
        ),
        {
            "roof_radius": 0.085,
            "shoulder": 0.04,
            "shoulder_radius": 0.05,
            "tuck": 0.055,
            "sill_radius": 0.07,
        },
    )
    rules = [
        rule(SCREEN, -0.71, -0.21, "glass"),
        rule(("upper",), -0.64, 0.28, "glass"),
        rule(("upper", "waistframe"), 0.28, 0.36, "trim_black"),
        rule(("upper",), 0.36, 1.08, "glass"),
        rule(SCREEN, 1.345, 1.60, "glass"),
        rule(("waistframe",), -0.68, 1.1, "trim_black"),
        rule(("sill",), -1.88, 1.80, "trim_black"),
    ]
    arches = wheel_arches(axles, track, radius, tyre, 0.72, 0.07, 0.06)
    model.build_shell(loft, rules, arches)
    model.arch_lips("body", width=0.03, lift=0.014)

    model.decal(
        "front",
        (0.37, 0.695, 0.555, 0.665),
        "lens_head",
        lift=0.012,
        cells=(5, 2),
        group="Headlights",
        mirror=True,
    )
    model.decal("front", (0.705, 0.765, 0.56, 0.66), "lens_amber", lift=0.012, cells=(2, 2), mirror=True)
    model.decal("front", (-0.34, 0.34, 0.585, 0.64), "trim_black", lift=0.004, cells=(6, 1))
    slats(model, "front", (-0.33, 0.33, 0.59, 0.635), 2, 0.008, "body", 0.01)
    model.decal("front", (-0.5, 0.5, 0.325, 0.42), "trim_black", lift=0.004, cells=(8, 1))
    slats(model, "front", (-0.48, 0.48, 0.335, 0.41), 3, 0.008, "underbody", 0.008, cells=(8, 1))
    model.decal("front", (0.56, 0.68, 0.34, 0.41), "lens_clear", lift=0.01, cells=(2, 1), mirror=True)
    model.bumper(-1, 0.485, 0.42, 0.014, 0.05, "trim_black", bevel=0.005)
    model.decal("front", (-0.19, 0.19, 0.445, 0.54), "plate", lift=0.022, cells=(3, 1))

    model.decal(
        "rear",
        (0.50, 0.755, 0.66, 0.86),
        "lens_tail",
        lift=0.012,
        cells=(4, 3),
        group="Taillights",
        mirror=True,
    )
    model.decal("rear", (0.50, 0.755, 0.59, 0.65), "lens_amber", lift=0.012, cells=(4, 1), mirror=True)
    model.decal("rear", (-0.27, 0.27, 0.635, 0.775), "trim_black", lift=0.004, cells=(4, 1))
    model.decal("rear", (-0.2, 0.2, 0.655, 0.755), "plate", lift=0.01, cells=(3, 1))
    model.decal("rear", (-0.44, 0.44, 0.835, 0.85), "trim_black", lift=0.008, cells=(6, 1))
    model.bumper(1, 0.5, 0.42, 0.014, 0.05, "trim_black", bevel=0.005)
    model.decal("rear", (-0.45, 0.45, 0.34, 0.42), "trim_black", lift=0.004, cells=(6, 1))
    exhaust(model, -0.42, 1.76, 0.24, radius=0.024, length=0.16)
    roof_end = model.project("top", 0, 1.3)
    model.box((1.04, 0.11, 0.02), (0, 1.3, roof_end.z + 0.016), "trim_black", rotation=(-0.12, 0, 0), bevel=0.006)
    wipers(model, 1.59, 1.47, ((0.05, 0.36),))

    model.side_strip(-1.75, 1.72, 0.50, 0.538, "trim_black", lift=0.009)
    seam(model, -0.745, 0.24, 0.84)
    seam(model, 0.30, 0.24, 0.875)
    handle(model, 0.18, 0.80, "trim_black")
    mirror_pod(model, -0.6, 0.93, "trim_black", size=(0.075, 0.055, 0.1), stalk=0.05)
    top_seam(model, (0.635, 0.643, -1.72, -0.84), (1, 10), mirror=True)
    top_seam(model, (-0.635, 0.635, -1.728, -1.72), (10, 1))
    wipers(model, -0.725, -0.57, ((-0.48, -0.1), (0.04, 0.42)))
    model.bar((0.0, 0.95, 1.46), (0.0, 1.2, 1.62), 0.006, 0.006, "trim_black")

    model.interior(
        {
            "front": -0.78,
            "tub_front": -0.45,
            "tub_rear": 0.78,
            "rear": 1.62,
            "shelf": 0.86,
            "rear_shelf": 0.9,
            "width": 0.7,
            "floor": 0.25,
            "seats": [
                {"s": 0.0, "x": (-0.35, 0.35), "back": 0.6},
                {"s": 0.5, "x": (0.0,), "width": 1.2, "headrest": False, "back": 0.6},
            ],
            "steering": (0.35, -0.33, 0.98),
        }
    )
    model.liner(-0.8, 1.66, 0.86)
    model.place_wheels(
        {
            "radius": radius,
            "width": tyre,
            "rim": 0.19,
            "spokes": 7,
            "spoke_inner": 0.035,
            "spoke_outer": 0.05,
            "cap": 0.3,
            "cap_material": "rim",
            "dish": 0.02,
        },
        axles,
        track,
    )
    return model, "#1f5f73"


def supercar():
    model = Model("supercar")
    wheelbase, track, radius, tyre = 2.6, 1.62, 0.345, 0.27
    axles = (-wheelbase / 2, wheelbase / 2)
    loft = Loft(
        stations(
            [
                (-2.23, 0.64, 0.15, 0.27, 0.54, 0.305, 0.0, 0.24),
                (-2.16, 0.80, 0.12, 0.34, 0.66, 0.39, 0.0, 0.22),
                (-1.95, 0.92, 0.11, 0.50, 0.76, 0.55, -0.02, 0.12),
                (-1.71, 0.96, 0.11, 0.70, 0.80, 0.74, -0.06, 0.0),
                (-1.3, 0.97, 0.11, 0.80, 0.82, 0.84, -0.11, 0.0),
                (-0.9, 0.96, 0.11, 0.80, 0.78, 0.835, -0.06, 0.0),
                (-0.72, 0.95, 0.11, 0.80, 0.74, 0.83, -0.02, 0.0),
                (-0.69, 0.95, 0.11, 0.80, 0.735, 0.86, 0.0, 0.0),
                (0.05, 0.93, 0.11, 0.82, 0.50, 1.12, 0.025, 0.0),
                (0.45, 0.93, 0.11, 0.84, 0.50, 1.125, 0.025, 0.0),
                (0.9, 0.96, 0.11, 0.88, 0.62, 1.02, 0.0, 0.0),
                (1.3, 0.97, 0.11, 0.90, 0.74, 0.955, -0.01, 0.0),
                (1.7, 0.97, 0.12, 0.88, 0.80, 0.92, -0.02, 0.0),
                (2.0, 0.95, 0.18, 0.84, 0.80, 0.885, -0.02, -0.03),
                (2.12, 0.90, 0.28, 0.74, 0.78, 0.80, 0.0, -0.08),
                (2.16, 0.80, 0.36, 0.60, 0.70, 0.70, 0.0, -0.12),
            ]
        ),
        {"roof_radius": 0.05, "shoulder": 0.05, "shoulder_radius": 0.04, "tuck": 0.05, "sill_radius": 0.05},
    )
    rules = [
        rule(SCREEN, -0.63, -0.02, "glass"),
        rule(("upper",), -0.58, 0.40, "glass"),
        rule(SCREEN, 0.52, 0.86, "glass"),
        rule(("sill",), -2.23, 2.16, "trim_black"),
    ]
    arches = wheel_arches(axles, track, radius, tyre, 0.6, 0.05, 0.055)
    model.build_shell(loft, rules, arches)
    model.arch_lips("body", width=0.03, lift=0.012)

    for rect, cells in (
        ((0.40, 0.68, -1.90, -1.892), (3, 1)),
        ((0.40, 0.68, -1.70, -1.692), (3, 1)),
        ((0.40, 0.408, -1.90, -1.692), (1, 3)),
        ((0.672, 0.68, -1.90, -1.692), (1, 3)),
    ):
        top_seam(model, rect, cells, mirror=True)
    model.decal("front", (-0.25, 0.25, 0.18, 0.265), "trim_black", lift=0.004, cells=(5, 1))
    model.decal(
        "front",
        (0.29, 0.57, 0.195, 0.262),
        "lens_head",
        lift=0.01,
        cells=(4, 1),
        group="Headlights",
        mirror=True,
    )
    model.decal("front", (0.59, 0.70, 0.2, 0.26), "lens_amber", lift=0.01, cells=(2, 1), mirror=True)
    top_seam(model, (-0.42, 0.42, -1.78, -1.772), (8, 1))
    top_seam(model, (0.42, 0.428, -1.78, -0.8), (1, 10), mirror=True)

    model.decal("rear", (-0.8, 0.8, 0.52, 0.72), "trim_black", lift=0.004, cells=(10, 2))
    model.decal(
        "rear",
        (0.3, 0.78, 0.555, 0.685),
        "lens_tail",
        lift=0.01,
        cells=(5, 2),
        group="Taillights",
        mirror=True,
    )
    slats(model, "rear", (-0.8, 0.8, 0.53, 0.71), 5, 0.012, "trim_black", 0.02, cells=(10, 1))
    model.decal("rear", (-0.17, 0.17, 0.57, 0.67), "plate", lift=0.012, cells=(2, 1))
    model.decal("rear", (-0.62, 0.62, 0.34, 0.46), "trim_black", lift=0.006, cells=(8, 3))
    for x in (0.3, 0.4):
        model.cylinder(0.034, 0.16, (x, 2.1, 0.39), "chrome", rotation=(math.pi / 2, 0, 0), segments=12, mirror=True)
        model.cylinder(0.026, 0.164, (x, 2.1, 0.39), "underbody", rotation=(math.pi / 2, 0, 0), segments=12, mirror=True)
    wing_z = 1.08
    model.box((1.78, 0.26, 0.03), (0, 2.0, wing_z), "body", rotation=(0.09, 0, 0), bevel=0.01)
    for x in (0.62,):
        base = model.project("top", x, 1.98)
        model.bar((x, 1.98, base.z - 0.02), (x, 2.0, wing_z), 0.03, 0.16, "body", mirror=True)
    model.box((0.03, 0.3, 0.1), (0.89, 2.0, wing_z + 0.01), "body", bevel=0.008, mirror=True)
    for k in range(6):
        s = 1.0 + k * 0.12
        model.decal("top", (-0.5, 0.5, s, s + 0.065), "trim_black", lift=0.012, cells=(6, 1))

    model.decal("side", (0.42, 0.9, 0.34, 0.68), "underbody", lift=0.004, cells=(4, 3), mirror=True)
    slats(model, "side", (0.40, 0.92, 0.35, 0.67), 4, 0.022, "body", 0.016, cells=(4, 1), mirror=True)
    seam(model, -0.665, 0.18, 0.78)
    seam(model, 0.405, 0.18, 0.80)
    top_seam(model, (0.2, 0.208, 1.0, 1.7), (1, 6), mirror=True)
    mirror_pod(model, -0.42, 0.85, "body", size=(0.08, 0.05, 0.085), stalk=0.07)
    wipers(model, -0.6, -0.42, ((-0.05, 0.42),))

    model.interior(
        {
            "front": -0.69,
            "tub_front": -0.36,
            "tub_rear": 0.5,
            "rear": 0.9,
            "shelf": 0.8,
            "rear_shelf": 0.84,
            "width": 0.74,
            "floor": 0.16,
            "seat_height": 0.12,
            "seats": [{"s": 0.08, "x": (-0.37, 0.37), "back": 0.5, "width": 0.5}],
            "steering": (0.37, -0.22, 0.82),
        }
    )
    model.liner(-0.7, 0.9, 0.8)
    model.place_wheels(
        {
            "radius": radius,
            "width": tyre,
            "rim": 0.245,
            "spokes": 5,
            "spoke_inner": 0.06,
            "spoke_outer": 0.09,
            "cap": 0.24,
            "cap_material": "rim",
            "dish": 0.04,
            "face": 0.7,
        },
        axles,
        track,
    )
    return model, "#b3121a"


def pickup():
    model = Model("pickup")
    wheelbase, track, radius, tyre = 3.2, 1.62, 0.42, 0.27
    axles = (-wheelbase / 2, wheelbase / 2)
    bed = {"inner": 0.87, "drop": 0.525}
    loft = Loft(
        stations(
            [
                (-2.6, 0.88, 0.56, 1.04, 0.80, 1.10, 0.0, 0.06),
                (-2.56, 0.94, 0.46, 1.10, 0.84, 1.17, 0.015, 0.06),
                (-2.42, 0.97, 0.36, 1.15, 0.86, 1.22, 0.03, 0.04),
                (-2.12, 0.975, 0.33, 1.17, 0.86, 1.235, 0.035, 0.0),
                (-1.6, 0.975, 0.33, 1.19, 0.86, 1.25, 0.04, 0.0),
                (-1.02, 0.975, 0.33, 1.20, 0.86, 1.26, 0.04, 0.0),
                (-0.99, 0.975, 0.33, 1.20, 0.855, 1.29, 0.04, 0.0),
                (-0.5, 0.975, 0.33, 1.21, 0.74, 1.80, 0.04, 0.0),
                (0.0, 0.975, 0.33, 1.21, 0.74, 1.835, 0.045, 0.0),
                (0.50, 0.975, 0.33, 1.21, 0.74, 1.815, 0.04, 0.0),
                (0.525, 0.975, 0.33, 1.21, 0.745, 1.74, 0.0, 0.0),
                (0.55, 0.975, 0.33, 1.21, 0.80, 1.30, 0.0, 0.0),
                (0.57, 0.975, 0.33, 1.20, 0.935, 1.245, 0.0, 0.0, bed),
                (2.56, 0.975, 0.33, 1.20, 0.935, 1.245, 0.0, 0.0, bed),
                (2.58, 0.975, 0.34, 1.20, 0.935, 1.245, 0.0, 0.0, {"inner": 0.87}),
                (2.68, 0.97, 0.40, 1.18, 0.92, 1.235, 0.0, -0.02, {"inner": 0.87}),
                (2.72, 0.90, 0.52, 1.06, 0.85, 1.12, 0.0, -0.05),
            ]
        ),
        {"roof_radius": 0.07, "tuck": 0.04, "sill_radius": 0.05},
    )
    rules = [
        rule(SCREEN, -0.93, -0.56, "glass"),
        rule(("upper",), -0.88, 0.44, "glass"),
        rule(("waistframe",), -0.92, 0.5, "chrome"),
        rule(("sill",), -2.6, 2.72, "trim_black"),
        rule(("topwall", "top"), 0.57, 2.58, "trim_black"),
    ]
    arches = wheel_arches(axles, track, radius, tyre, 0.62, 0.16, 0.09)
    model.build_shell(loft, rules, arches)
    model.arch_lips("trim_black", width=0.05, lift=0.03)

    model.side_strip(-2.5, 2.62, 0.69, 0.91, "accent", lift=0.004, step=0.16, margin=0.065)
    model.side_strip(-2.5, 2.62, 0.905, 0.925, "chrome", lift=0.009, step=0.16, margin=0.065)
    model.side_strip(-2.5, 2.62, 0.675, 0.695, "chrome", lift=0.009, step=0.16, margin=0.065)

    model.decal("front", (-0.63, 0.63, 0.735, 1.03), "chrome", lift=0.006, cells=(8, 2))
    model.decal("front", (-0.59, 0.59, 0.77, 0.995), "trim_black", lift=0.012, cells=(8, 2))
    slats(model, "front", (-0.59, 0.59, 0.77, 0.995), 3, 0.014, "chrome", 0.02, cells=(8, 1))
    for k in range(-2, 3):
        x = k * 0.2
        model.decal("front", (x - 0.007, x + 0.007, 0.77, 0.995), "chrome", lift=0.02, cells=(1, 2))
    model.decal("front", (0.645, 0.875, 0.735, 1.03), "chrome", lift=0.005, cells=(3, 2), mirror=True)
    model.decal(
        "front",
        (0.66, 0.86, 0.85, 1.015),
        "lens_head",
        lift=0.014,
        cells=(3, 2),
        group="Headlights",
        mirror=True,
    )
    model.decal("front", (0.66, 0.86, 0.75, 0.83), "lens_amber", lift=0.012, cells=(3, 1), mirror=True)
    model.bumper(-1, 0.62, 0.45, 0.13, 0.17, "chrome", bevel=0.02)
    nose = model.project("front", 0, 0.62).y
    model.box((0.36, 0.012, 0.11), (0, nose - 0.136, 0.62), "plate", bevel=0.003)
    model.box((0.06, 0.06, 0.2), (0.42, nose - 0.14, 0.63), "trim_black", bevel=0.015, mirror=True)
    top_seam(model, (0.80, 0.81, -2.5, -1.06), (1, 12), mirror=True)

    model.decal(
        "rear",
        (0.795, 0.93, 0.80, 1.12),
        "lens_tail",
        lift=0.012,
        cells=(2, 4),
        group="Taillights",
        mirror=True,
    )
    model.decal("rear", (0.795, 0.93, 0.70, 0.79), "lens_clear", lift=0.012, cells=(2, 1), mirror=True)
    for x in (0.765,):
        model.decal("rear", (x - 0.006, x + 0.006, 0.6, 1.2), "underbody", lift=0.003, cells=(1, 6), skirt=False, mirror=True)
    model.decal("rear", (-0.76, 0.76, 0.6, 0.612), "underbody", lift=0.003, cells=(8, 1), skirt=False)
    model.decal("rear", (-0.11, 0.11, 1.07, 1.12), "chrome", lift=0.012, cells=(2, 1))
    model.decal("rear", (-0.72, 0.72, 0.80, 0.96), "accent", lift=0.004, cells=(8, 1))
    model.bumper(1, 0.60, 0.45, 0.15, 0.15, "chrome", bevel=0.02)
    tail = model.project("rear", 0, 0.60).y
    model.box((0.36, 0.012, 0.11), (0, tail + 0.156, 0.60), "plate", bevel=0.003)
    model.decal("rear", (-0.56, 0.56, 1.37, 1.70), "window_dark", lift=0.006, cells=(4, 2))
    exhaust(model, -0.6, 2.6, 0.4, radius=0.032, length=0.3)

    seam(model, -1.0, 0.40, 1.18, width=0.012)
    seam(model, 0.46, 0.40, 1.19, width=0.012)
    seam(model, 0.56, 0.40, 1.22, width=0.014)
    handle(model, 0.3, 1.1, "chrome", length=0.13)
    mirror_pod(model, -0.8, 1.3, "chrome", size=(0.05, 0.06, 0.2), stalk=0.13)
    wipers(model, -0.95, -0.82, ((-0.55, -0.1), (0.05, 0.5)))
    for x in (-0.3, 0.0, 0.3):
        top = model.project("top", x, -0.36)
        model.box((0.08, 0.05, 0.03), (x, -0.36, top.z + 0.008), "lens_amber", bevel=0.008)
    for s in axles:
        model.box((0.3, 0.016, 0.34), (0.82, s + 0.57, 0.36), "trim_black", mirror=True)
    model.bar((0.74, -1.12, 1.22), (0.74, -1.04, 1.95), 0.006, 0.006, "chrome")
    model.box((0.46, 1.1, 0.32), (0.648, axles[1], 0.86), "trim_black", bevel=0.03, mirror=True)

    model.interior(
        {
            "front": -0.99,
            "tub_front": -0.62,
            "tub_rear": 0.44,
            "rear": 0.5,
            "shelf": 1.17,
            "width": 0.86,
            "floor": 0.5,
            "seat_height": 0.3,
            "seats": [{"s": 0.02, "x": (0.0,), "width": 1.5, "back": 0.58, "headrest": False}],
            "steering": (0.42, -0.42, 1.3),
            "dash_depth": 0.34,
        }
    )
    model.liner(-1.0, 0.56, 1.17)
    model.place_wheels(
        {
            "radius": radius,
            "width": tyre,
            "rim": 0.245,
            "rim_material": "rim_white",
            "holes": 8,
            "hole_radius": 0.03,
            "hole_ring": 0.68,
            "cap": 0.3,
            "dish": 0.05,
            "face": 0.6,
        },
        axles,
        track,
    )
    return model, "#27496b"


DESIGNS = {"touring": touring, "hatchback": hatchback, "supercar": supercar, "pickup": pickup}
