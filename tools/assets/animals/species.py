import math

from quadruped import leg_joints, linear

WALK_PHASES = {"Back.L": 0.0, "Front.L": 0.25, "Back.R": 0.5, "Front.R": 0.75}
GALLOP_PHASES = {"Back.L": 0.0, "Back.R": 0.12, "Front.L": 0.5, "Front.R": 0.62}
BOUND_PHASES = {"Back.L": 0.0, "Back.R": 0.06, "Front.L": 0.5, "Front.R": 0.56}

BACK_RATIOS = (0.78, 0.475, 0.136, 0.0)
FRONT_RATIOS = (0.77, 0.44, 0.13, 0.0)


def back_leg(hip, zig=1.0):
    return leg_joints(hip, BACK_RATIOS, (0.136 * zig, -0.153 * zig, -0.12 * zig, -0.05 * zig))


def front_leg(shoulder, zig=1.0):
    return leg_joints(shoulder, FRONT_RATIOS, (-0.14 * zig, -0.05 * zig, -0.06 * zig, 0.0))


def walk_gait(period, stride, lift=0.07, **more):
    gait = {
        "period": period,
        "duty": 0.62,
        "stride": stride,
        "lift": lift,
        "drop": 0.03,
        "bob": 0.008,
        "fold_front": 0.7,
        "fold_back": 0.25,
        "phases": WALK_PHASES,
    }
    gait.update(more)
    return gait


def run_gait(period, stride, lift=0.16, **more):
    gait = {
        "period": period,
        "duty": 0.32,
        "stride": stride,
        "lift": lift,
        "drop": 0.05,
        "bounce": 0.035,
        "rock": 0.07,
        "flex": 0.12,
        "fold_front": 1.0,
        "fold_back": 0.5,
        "toe": 0.8,
        "phases": GALLOP_PHASES,
    }
    gait.update(more)
    return gait


def torso(shape, rings, blend, colour="coat", sides=12, ruffle=None, steps=2):
    start, end = blend
    keys = []
    for ring in rings:
        f, z, radius = ring[:3]
        tint = ring[3] if len(ring) > 3 else colour
        share = min(1, max(0, (f - start) / (end - start)))
        keys.append(((0, f, z), radius, tint, {"Pelvis": 1 - share, "Chest": share}))
    shape.loft(keys, sides=sides, steps=steps, ruffle=ruffle)


def chain(shape, rings, sides=10, steps=2, **more):
    shape.loft(
        [((ring[0], ring[1], ring[2]), ring[3], ring[4], ring[5]) for ring in rings],
        sides=sides,
        steps=steps,
        **more,
    )


def spine_bones(middle, rump, breast, neck, crown, snout):
    bones = [
        ("Root", (0, 0, 0), (0, 0, 0.2 * middle[2]), None),
        ("Body", middle, (middle[0], middle[1], middle[2] * 1.2), "Root"),
        ("Pelvis", middle, rump, "Body"),
        ("Chest", middle, breast, "Body"),
        ("Neck1", neck[0], neck[1], "Chest"),
        ("Neck2", neck[1], crown, "Neck1"),
        ("Head", crown, snout, "Neck2"),
    ]
    return bones


def tail_bones(points):
    bones = []
    for index in range(len(points) - 1):
        bones.append(
            (
                f"Tail{index + 1}",
                points[index],
                points[index + 1],
                f"Tail{index}" if index else "Pelvis",
            )
        )
    return bones


def ear_bone(base, tip):
    return ("Ear.L", base, tip, "Head")


def speckle(seed):
    def noise(ring, corner):
        value = math.sin(ring * 12.9898 + corner * 78.233 + seed) * 43758.5453
        return value - math.floor(value)

    return noise


def near(tint, target):
    return sum(abs(a - b) for a, b in zip(tint, target)) < 0.004


def ears(shape, base, tip, width, colour, inner=None, ref=(1, 0, 0), sides=6):
    middle = tuple(a + (b - a) * 0.55 for a, b in zip(base, tip))
    shape.loft(
        [
            (base, (width * 0.7, width * 0.4), colour, "Head"),
            (middle, (width, width * 0.3), inner or colour, "Ear.L"),
            (tip, (width * 0.15, width * 0.1), colour, "Ear.L"),
        ],
        sides=sides,
        steps=2,
        ref=ref,
        mirror=True,
    )


def horn(shape, points, radius, colour="horn", bind="Head", sides=6, steps=3, tip="horn"):
    keys = []
    for index, point in enumerate(points):
        share = index / (len(points) - 1)
        keys.append((point, radius * (1 - 0.88 * share**1.3), tip if share > 0.7 else colour, bind))
    shape.loft(keys, sides=sides, steps=steps, ref=(0, 1, 0), mirror=True)


def horse():
    hip, shoulder = (0.19, -0.52, 1.14), (0.19, 0.52, 1.1)

    def sculpt(shape, spec):
        torso(
            shape,
            [
                (-0.84, 1.22, (0.05, 0.06, 0.07)),
                (-0.76, 1.2, (0.22, 0.22, 0.27)),
                (-0.5, 1.15, (0.31, 0.3, 0.33)),
                (-0.1, 1.1, (0.33, 0.27, 0.35)),
                (0.25, 1.1, (0.32, 0.28, 0.37)),
                (0.5, 1.13, (0.28, 0.33, 0.36)),
                (0.7, 1.16, (0.2, 0.25, 0.28)),
                (0.8, 1.18, (0.05, 0.08, 0.08)),
            ],
            (-0.35, 0.2),
        )
        chain(
            shape,
            [
                (0, 0.44, 1.14, (0.2, 0.27, 0.3), "coat", "Chest"),
                (0, 0.6, 1.32, (0.155, 0.22, 0.25), "coat", {"Chest": 0.5, "Neck1": 0.5}),
                (0, 0.74, 1.5, (0.115, 0.17, 0.19), "coat", {"Neck1": 0.5, "Neck2": 0.5}),
                (0, 0.86, 1.66, (0.095, 0.135, 0.14), "coat", {"Neck2": 0.6, "Head": 0.4}),
                (0, 0.94, 1.76, (0.08, 0.1, 0.11), "coat", "Head"),
            ],
        )
        chain(
            shape,
            [
                (0, 0.85, 1.8, (0.07, 0.06, 0.08), "coat", "Head"),
                (0, 0.95, 1.78, (0.115, 0.11, 0.14), "coat", "Head"),
                (0, 1.09, 1.68, (0.11, 0.1, 0.145), "coat", "Head"),
                (0, 1.23, 1.56, (0.082, 0.08, 0.1), "coat", "Head"),
                (0, 1.34, 1.47, (0.08, 0.075, 0.085), "muzzle", "Head"),
                (0, 1.4, 1.42, (0.05, 0.045, 0.05), "muzzle", "Head"),
            ],
        )
        chain(
            shape,
            [
                (0, 1.04, 1.83, (0.035, 0.05, 0.02), "hair", "Head"),
                (0, 0.92, 1.87, (0.045, 0.07, 0.02), "hair", "Head"),
                (0, 0.8, 1.74, (0.05, 0.1, 0.02), "hair", "Neck2"),
                (0, 0.66, 1.56, (0.05, 0.11, 0.02), "hair", "Neck1"),
                (0, 0.53, 1.42, (0.045, 0.09, 0.02), "hair", "Chest"),
                (0, 0.42, 1.4, (0.02, 0.03, 0.01), "hair", "Chest"),
            ],
            sides=6,
        )
        chain(
            shape,
            [
                (0, -0.78, 1.33, 0.04, "hair", "Pelvis"),
                (0, -0.9, 1.3, (0.065, 0.06, 0.06), "hair", "Tail1"),
                (0, -1.02, 1.08, (0.09, 0.085, 0.085), "hair", "Tail2"),
                (0, -1.05, 0.78, (0.1, 0.09, 0.09), "hair", "Tail3"),
                (0, -1.02, 0.45, (0.06, 0.05, 0.05), "hair", "Tail3"),
                (0, -1.0, 0.34, 0.01, "hair", "Tail3"),
            ],
            sides=7,
        )
        ears(shape, (0.06, 0.9, 1.84), (0.09, 0.9, 2.0), 0.04, "coat")
        shape.ball((0.1, 1.07, 1.73), 0.025, "eye", "Head")

    return {
        "name": "horse",
        "palette": {
            "coat": "#96603a",
            "sock": "#3b2a22",
            "hair": "#2b1f1a",
            "muzzle": "#4a3830",
            "hoof": "#26201d",
            "eye": "#0e0c0b",
        },
        "sculpt": sculpt,
        "joints": {"Back": back_leg(hip), "Front": front_leg(shoulder)},
        "legs": {
            "sock": "sock",
            "Back": {
                "thigh": (0.13, 0.25, 0.25),
                "knee": (0.062, 0.072, 0.08),
                "cannon": (0.045, 0.05, 0.052),
                "fetlock": (0.054, 0.058, 0.058),
                "hoof": (0.068, 0.085, 0.066),
            },
            "Front": {
                "thigh": (0.11, 0.19, 0.19),
                "knee": (0.058, 0.064, 0.064),
                "cannon": (0.044, 0.047, 0.05),
                "fetlock": (0.054, 0.058, 0.058),
                "hoof": (0.068, 0.085, 0.066),
            },
        },
        "bones": spine_bones(
            (0, -0.05, 1.13),
            (0, -0.62, 1.18),
            (0, 0.5, 1.18),
            ((0, 0.5, 1.24), (0, 0.72, 1.5)),
            (0, 0.9, 1.72),
            (0, 1.36, 1.44),
        )
        + tail_bones([(0, -0.8, 1.31), (0, -0.94, 1.2), (0, -1.03, 0.95), (0, -1.04, 0.6)])
        + [ear_bone((0.06, 0.9, 1.84), (0.09, 0.9, 2.0))],
        "tail_bones": 3,
        "muzzle": (0, 1.4, 1.4),
        "graze": {"Chest": -0.12, "Neck1": -2.0, "Neck2": -0.8, "Head": 1.2},
        "girth": 0.32,
        "belly": 0.75,
        "walk": walk_gait(1.1, 0.62),
        "run": run_gait(0.55, 1.0),
    }


def deer():
    hip, shoulder = (0.115, -0.36, 0.9), (0.115, 0.34, 0.86)

    def sculpt(shape, spec):
        torso(
            shape,
            [
                (-0.6, 0.98, (0.04, 0.05, 0.05), "rump"),
                (-0.53, 0.95, (0.15, 0.16, 0.19), "rump"),
                (-0.34, 0.92, (0.2, 0.19, 0.22)),
                (-0.02, 0.88, (0.21, 0.17, 0.22)),
                (0.24, 0.89, (0.2, 0.19, 0.24)),
                (0.42, 0.92, (0.17, 0.2, 0.22)),
                (0.52, 0.94, (0.05, 0.07, 0.07)),
            ],
            (-0.25, 0.15),
        )
        chain(
            shape,
            [
                (0, 0.3, 0.92, (0.14, 0.18, 0.2), "coat", "Chest"),
                (0, 0.42, 1.06, (0.105, 0.14, 0.16), "coat", {"Chest": 0.5, "Neck1": 0.5}),
                (0, 0.5, 1.22, (0.08, 0.1, 0.12), "coat", {"Neck1": 0.5, "Neck2": 0.5}),
                (0, 0.56, 1.36, (0.07, 0.085, 0.09), "coat", {"Neck2": 0.6, "Head": 0.4}),
                (0, 0.6, 1.44, (0.06, 0.07, 0.07), "coat", "Head"),
            ],
        )
        chain(
            shape,
            [
                (0, 0.52, 1.47, (0.05, 0.045, 0.06), "coat", "Head"),
                (0, 0.6, 1.46, (0.085, 0.08, 0.095), "coat", "Head"),
                (0, 0.71, 1.4, (0.08, 0.07, 0.09), "coat", "Head"),
                (0, 0.82, 1.33, (0.052, 0.05, 0.06), "coat", "Head"),
                (0, 0.9, 1.28, (0.044, 0.04, 0.045), "belly", "Head"),
                (0, 0.94, 1.26, (0.028, 0.026, 0.028), "nose", "Head"),
            ],
        )
        chain(
            shape,
            [
                (0, -0.55, 1.04, (0.04, 0.03), "coat", "Pelvis"),
                (0, -0.63, 1.02, (0.05, 0.03), "rump", "Tail1"),
                (0, -0.7, 0.93, (0.045, 0.028), "rump", "Tail2"),
                (0, -0.72, 0.84, (0.012, 0.01), "rump", "Tail2"),
            ],
            sides=6,
        )
        ears(shape, (0.07, 0.57, 1.5), (0.2, 0.53, 1.6), 0.045, "coat", "belly", ref=(0, 1, 0))
        shape.ball((0.075, 0.7, 1.44), 0.02, "eye", "Head")
        horn(
            shape,
            [(0.045, 0.6, 1.5), (0.1, 0.57, 1.66), (0.2, 0.5, 1.82), (0.26, 0.42, 1.98), (0.24, 0.36, 2.1)],
            0.026,
            "antler",
            tip="antler",
        )
        horn(shape, [(0.07, 0.6, 1.56), (0.1, 0.72, 1.62), (0.12, 0.78, 1.72)], 0.018, "antler", tip="antler", steps=2)
        horn(shape, [(0.19, 0.5, 1.8), (0.26, 0.6, 1.88), (0.3, 0.63, 1.98)], 0.017, "antler", tip="antler", steps=2)
        horn(shape, [(0.25, 0.43, 1.96), (0.33, 0.47, 2.03), (0.37, 0.47, 2.12)], 0.015, "antler", tip="antler", steps=2)

    palette = {
        "coat": "#a8703f",
        "limb": "#a56d3d",
        "belly": "#e6d8bd",
        "rump": "#efe6d2",
        "sock": "#6f4a2e",
        "antler": "#d2bc94",
        "nose": "#1c1614",
        "hoof": "#221c19",
        "eye": "#0e0c0b",
    }
    coat, belly = linear(palette["coat"]), linear(palette["belly"])

    def repaint(centre, normal, tint):
        if near(tint, coat) and normal.z < -0.3 and 0.6 < centre.z < 0.85:
            return belly
        return tint

    return {
        "name": "deer",
        "palette": palette,
        "sculpt": sculpt,
        "repaint": repaint,
        "joints": {"Back": back_leg(hip), "Front": front_leg(shoulder)},
        "legs": {
            "coat": "limb",
            "sock": "sock",
            "Back": {
                "thigh": (0.085, 0.17, 0.17),
                "knee": (0.036, 0.042, 0.046),
                "cannon": (0.024, 0.027, 0.028),
                "fetlock": (0.029, 0.031, 0.031),
                "hoof": (0.036, 0.046, 0.036),
            },
            "Front": {
                "thigh": (0.07, 0.12, 0.12),
                "knee": (0.034, 0.038, 0.038),
                "cannon": (0.023, 0.025, 0.026),
                "fetlock": (0.029, 0.031, 0.031),
                "hoof": (0.036, 0.046, 0.036),
            },
        },
        "bones": spine_bones(
            (0, -0.03, 0.9),
            (0, -0.44, 0.95),
            (0, 0.34, 0.95),
            ((0, 0.34, 0.98), (0, 0.48, 1.2)),
            (0, 0.57, 1.4),
            (0, 0.92, 1.26),
        )
        + tail_bones([(0, -0.56, 1.03), (0, -0.65, 0.99), (0, -0.72, 0.86)])
        + [ear_bone((0.07, 0.57, 1.5), (0.2, 0.53, 1.6))],
        "tail_bones": 2,
        "muzzle": (0, 0.94, 1.24),
        "graze": {"Chest": -0.12, "Neck1": -2.1, "Neck2": -0.9, "Head": 1.3},
        "girth": 0.2,
        "belly": 0.62,
        "swish": 0.6,
        "view_span": 1.25,
        "view_shift": 0.0,
        "walk": walk_gait(1.0, 0.6, lift=0.09),
        "run": run_gait(0.5, 1.05, lift=0.2, phases=BOUND_PHASES, bounce=0.06, rock=0.09, flex=0.16),
    }


def sheep():
    hip, shoulder = (0.11, -0.25, 0.5), (0.11, 0.25, 0.48)
    fleece = speckle(3.7)
    collar = speckle(9.1)

    def wool(ring, corner):
        return 0.16 * (fleece(ring, corner) - 0.35)

    def sculpt(shape, spec):
        torso(
            shape,
            [
                (-0.5, 0.62, (0.06, 0.06, 0.06)),
                (-0.43, 0.61, (0.2, 0.19, 0.19)),
                (-0.25, 0.6, (0.27, 0.24, 0.25)),
                (0.0, 0.59, (0.29, 0.25, 0.26)),
                (0.24, 0.6, (0.27, 0.25, 0.25)),
                (0.4, 0.63, (0.2, 0.2, 0.2)),
                (0.47, 0.65, (0.06, 0.07, 0.07)),
            ],
            (-0.2, 0.15),
            colour="wool",
            sides=11,
            ruffle=wool,
            steps=3,
        )
        chain(
            shape,
            [
                (0, 0.3, 0.66, (0.17, 0.18, 0.18), "wool", "Chest"),
                (0, 0.42, 0.76, (0.14, 0.14, 0.15), "wool", {"Chest": 0.5, "Neck1": 0.5}),
                (0, 0.5, 0.86, (0.115, 0.11, 0.12), "wool", {"Neck1": 0.4, "Neck2": 0.6}),
                (0, 0.52, 0.94, (0.06, 0.06, 0.06), "wool", "Head"),
            ],
            sides=9,
            ruffle=lambda ring, corner: 0.14 * (collar(ring, corner) - 0.4),
            steps=3,
        )
        chain(
            shape,
            [
                (0, 0.47, 0.87, (0.05, 0.05, 0.06), "face", "Head"),
                (0, 0.55, 0.86, (0.085, 0.075, 0.09), "face", "Head"),
                (0, 0.66, 0.8, (0.075, 0.065, 0.08), "face", "Head"),
                (0, 0.76, 0.73, (0.055, 0.05, 0.055), "face", "Head"),
                (0, 0.81, 0.7, (0.034, 0.03, 0.03), "face", "Head"),
            ],
            sides=8,
        )
        shape.ball((0, 0.5, 0.91), 0.1, "wool", "Head", mirror=False, sides=7)
        chain(
            shape,
            [
                (0, -0.46, 0.68, 0.04, "wool", "Pelvis"),
                (0, -0.53, 0.64, 0.06, "wool", "Tail1"),
                (0, -0.56, 0.54, 0.05, "wool", "Tail2"),
                (0, -0.56, 0.47, 0.015, "wool", "Tail2"),
            ],
            sides=6,
        )
        ears(shape, (0.07, 0.53, 0.88), (0.2, 0.5, 0.84), 0.04, "face", ref=(0, 1, 0))
        shape.ball((0.07, 0.67, 0.83), 0.016, "eye", "Head")

    return {
        "name": "sheep",
        "palette": {
            "wool": "#ebe4d3",
            "coat": "#ebe4d3",
            "face": "#3a322d",
            "hoof": "#1f1a18",
            "eye": "#0b0a09",
        },
        "sculpt": sculpt,
        "crease": 24,
        "joints": {"Back": back_leg(hip, 0.8), "Front": front_leg(shoulder, 0.8)},
        "legs": {
            "coat": "wool",
            "sock": "face",
            "Back": {
                "thigh": (0.085, 0.13, 0.13),
                "knee": (0.034, 0.038, 0.04),
                "cannon": (0.026, 0.028, 0.028),
                "fetlock": (0.03, 0.032, 0.032),
                "hoof": (0.036, 0.044, 0.036),
            },
            "Front": {
                "thigh": (0.075, 0.1, 0.1),
                "knee": (0.033, 0.036, 0.036),
                "cannon": (0.026, 0.028, 0.028),
                "fetlock": (0.03, 0.032, 0.032),
                "hoof": (0.036, 0.044, 0.036),
            },
        },
        "bones": spine_bones(
            (0, 0.0, 0.58),
            (0, -0.36, 0.6),
            (0, 0.3, 0.62),
            ((0, 0.3, 0.66), (0, 0.42, 0.78)),
            (0, 0.5, 0.86),
            (0, 0.8, 0.7),
        )
        + tail_bones([(0, -0.47, 0.67), (0, -0.54, 0.6), (0, -0.56, 0.48)])
        + [ear_bone((0.07, 0.53, 0.88), (0.2, 0.5, 0.84))],
        "tail_bones": 2,
        "muzzle": (0, 0.81, 0.68),
        "graze": {"Chest": -0.08, "Neck1": -1.3, "Neck2": -0.7, "Head": 0.6},
        "girth": 0.28,
        "belly": 0.34,
        "swish": 0.5,
        "view_span": 1.3,
        "view_shift": 0.0,
        "walk": walk_gait(0.9, 0.6, lift=0.1),
        "run": run_gait(0.45, 0.95, lift=0.2, phases=BOUND_PHASES, bounce=0.07, rock=0.08, flex=0.1),
    }


def bovine(name, bull):
    hip, shoulder = (0.21, -0.54, 1.0), (0.21, 0.5, 0.96)
    heft = 1.2 if bull else 1.0
    hump = 0.06 if bull else 0.0

    def sculpt(shape, spec):
        torso(
            shape,
            [
                (-0.86, 1.14, (0.06, 0.07, 0.08)),
                (-0.78, 1.1, (0.27, 0.25, 0.3)),
                (-0.52, 1.04, (0.36, 0.31, 0.36)),
                (-0.12, 1.0, (0.39, 0.33, 0.4)),
                (0.22, 1.0, (0.37 * heft, 0.34 * heft + hump * 0.6, 0.41)),
                (0.5, 1.02, (0.32 * heft, 0.37 * heft + hump * 0.5, 0.42)),
                (0.72, 1.04, (0.24 * heft, 0.24 * heft, 0.36)),
                (0.84, 1.06, (0.06, 0.1, 0.1)),
            ],
            (-0.35, 0.2),
            sides=16,
            steps=3,
        )
        chain(
            shape,
            [
                (0, 0.5, 1.04, (0.24 * heft, 0.34 * heft + hump, 0.36), "coat", "Chest"),
                (0, 0.7, 1.14, (0.19 * heft, 0.26 * heft + hump, 0.31), "coat", {"Chest": 0.5, "Neck1": 0.5}),
                (0, 0.88, 1.26, (0.15 * heft, 0.2 * heft + hump * 0.5, 0.24), "coat", {"Neck1": 0.5, "Neck2": 0.5}),
                (0, 1.02, 1.36, (0.13 * heft, 0.14, 0.17), "coat", {"Neck2": 0.5, "Head": 0.5}),
                (0, 1.1, 1.4, (0.1, 0.1, 0.12), "coat", "Head"),
            ],
        )
        chain(
            shape,
            [
                (0, 0.98, 1.46, (0.09, 0.07, 0.09), "coat", "Head"),
                (0, 1.08, 1.44, (0.15 * heft, 0.11, 0.15), "coat", "Head"),
                (0, 1.22, 1.33, (0.14 * heft, 0.1, 0.15), "coat", "Head"),
                (0, 1.32, 1.22, (0.115, 0.09, 0.12), "coat", "Head"),
                (0, 1.4, 1.14, (0.115, 0.085, 0.1), "muzzle", "Head"),
                (0, 1.45, 1.09, (0.08, 0.055, 0.06), "muzzle", "Head"),
            ],
        )
        chain(
            shape,
            [
                (0, -0.82, 1.32, 0.04, "coat", "Pelvis"),
                (0, -0.9, 1.26, 0.035, "coat", "Tail1"),
                (0, -0.94, 1.0, 0.026, "coat", "Tail2"),
                (0, -0.95, 0.7, 0.022, "coat", "Tail3"),
                (0, -0.95, 0.55, 0.05, "tuft", "Tail3"),
                (0, -0.95, 0.4, 0.045, "tuft", "Tail3"),
                (0, -0.95, 0.32, 0.01, "tuft", "Tail3"),
            ],
            sides=6,
        )
        ears(shape, (0.12, 1.06, 1.44), (0.33, 1.0, 1.43), 0.06, "coat", "muzzle", ref=(0, 1, 0))
        shape.ball((0.125 * heft, 1.2, 1.4), 0.026, "eye", "Head")
        if bull:
            horn(
                shape,
                [(0.1, 1.06, 1.5), (0.26, 1.07, 1.56), (0.4, 1.12, 1.66), (0.44, 1.2, 1.8), (0.4, 1.26, 1.9)],
                0.05,
                tip="tuft",
            )
        else:
            horn(
                shape,
                [(0.09, 1.06, 1.5), (0.2, 1.07, 1.56), (0.27, 1.11, 1.66), (0.26, 1.15, 1.76)],
                0.036,
            )
            shape.ball((0, -0.42, 0.66), 0.15, "muzzle", "Pelvis", mirror=False, sides=8)
            for teat in ((0.06, -0.36), (0.06, -0.48)):
                shape.loft(
                    [
                        ((teat[0], teat[1], 0.56), 0.022, "muzzle", "Pelvis"),
                        ((teat[0], teat[1], 0.47), 0.012, "muzzle", "Pelvis"),
                    ],
                    sides=5,
                    steps=1,
                    mirror=True,
                )

    if bull:
        palette = {
            "coat": "#3d2c24",
            "sock": "#2a1f1a",
            "tuft": "#17110f",
            "muzzle": "#8a6f66",
            "horn": "#ded4bd",
            "hoof": "#16110f",
            "eye": "#060505",
        }
    else:
        palette = {
            "coat": "#f1ece2",
            "sock": "#f1ece2",
            "patch": "#231d1b",
            "tuft": "#231d1b",
            "muzzle": "#d7a39a",
            "horn": "#ddd3bb",
            "hoof": "#2a2320",
            "eye": "#0b0a09",
        }
    coat = linear(palette["coat"])
    patch = linear(palette.get("patch", palette["coat"]))
    back = linear("#5a4132")

    def repaint(centre, normal, tint):
        if not near(tint, coat):
            return tint
        x, f, z = centre.x, -centre.y, centre.z
        if bull:
            lift = min(1, max(0, (z - 1.0) / 0.4))
            return tuple(a + (b - a) * lift * 0.55 for a, b in zip(coat, back))
        blotch = (
            math.sin(f * 3.3 + 0.9) * math.sin(z * 4.1 + x * 2.3 + 0.4)
            + 0.55 * math.sin(f * 7.1 + z * 2.9 + x * 4.7 + 1.7)
        )
        return patch if blotch > 0.22 and z > 0.5 else tint

    return {
        "name": name,
        "palette": palette,
        "sculpt": sculpt,
        "repaint": repaint,
        "joints": {"Back": back_leg(hip, 0.85), "Front": front_leg(shoulder, 0.85)},
        "legs": {
            "sock": "sock",
            "Back": {
                "thigh": (0.15, 0.27, 0.27),
                "knee": (0.075, 0.085, 0.09),
                "cannon": (0.055, 0.06, 0.062),
                "fetlock": (0.064, 0.068, 0.068),
                "hoof": (0.078, 0.095, 0.078),
            },
            "Front": {
                "thigh": (0.13 * heft, 0.21 * heft, 0.21 * heft),
                "knee": (0.072, 0.078, 0.078),
                "cannon": (0.055, 0.058, 0.06),
                "fetlock": (0.064, 0.068, 0.068),
                "hoof": (0.078, 0.095, 0.078),
            },
        },
        "bones": spine_bones(
            (0, -0.05, 1.02),
            (0, -0.66, 1.08),
            (0, 0.52, 1.06),
            ((0, 0.56, 1.1), (0, 0.84, 1.26)),
            (0, 1.04, 1.38),
            (0, 1.44, 1.1),
        )
        + tail_bones([(0, -0.84, 1.31), (0, -0.92, 1.1), (0, -0.95, 0.78), (0, -0.95, 0.4)])
        + [ear_bone((0.12, 1.06, 1.44), (0.33, 1.0, 1.43))],
        "tail_bones": 3,
        "muzzle": (0, 1.45, 1.06),
        "graze": {"Chest": -0.1, "Neck1": -1.6, "Neck2": -0.8, "Head": 0.9},
        "girth": 0.39,
        "belly": 0.6,
        "look": 0.12,
        "walk": walk_gait(1.3, 0.58, lift=0.06),
        "run": run_gait(0.62, 0.85, lift=0.13, rock=0.05, flex=0.07, bounce=0.03, tail_lift=0.3),
    }


def cattle():
    return bovine("cattle", False)


def bull():
    return bovine("bull", True)


def elephant():
    hip, shoulder = (0.5, -0.95, 1.85), (0.5, 0.95, 1.95)
    trunk = [(0, 2.12, 2.2), (0, 2.34, 1.78), (0, 2.42, 1.32), (0, 2.42, 0.88), (0, 2.4, 0.5), (0, 2.46, 0.2)]

    def sculpt(shape, spec):
        torso(
            shape,
            [
                (-1.56, 2.2, (0.1, 0.12, 0.14)),
                (-1.42, 2.12, (0.6, 0.6, 0.7)),
                (-0.95, 2.1, (0.84, 0.86, 0.82)),
                (-0.2, 2.12, (0.92, 0.94, 0.86)),
                (0.5, 2.14, (0.88, 0.9, 0.84)),
                (1.05, 2.2, (0.74, 0.78, 0.76)),
                (1.4, 2.26, (0.5, 0.55, 0.55)),
                (1.52, 2.28, (0.12, 0.15, 0.15)),
            ],
            (-0.6, 0.4),
            sides=14,
        )
        chain(
            shape,
            [
                (0, 1.2, 2.3, (0.56, 0.6, 0.62), "coat", "Chest"),
                (0, 1.5, 2.45, (0.5, 0.52, 0.55), "coat", {"Neck1": 0.6, "Head": 0.4}),
                (0, 1.75, 2.55, (0.45, 0.45, 0.5), "coat", "Head"),
            ],
            sides=12,
        )
        chain(
            shape,
            [
                (0, 1.42, 2.72, (0.25, 0.2, 0.25), "coat", "Head"),
                (0, 1.6, 2.72, (0.5, 0.52, 0.55), "coat", "Head"),
                (0, 1.88, 2.62, (0.5, 0.54, 0.58), "coat", "Head"),
                (0, 2.1, 2.38, (0.4, 0.36, 0.42), "coat", "Head"),
                (0, 2.2, 2.14, (0.3, 0.28, 0.3), "coat", {"Head": 0.6, "Trunk1": 0.4}),
                (0, 2.34, 1.78, (0.24, 0.23, 0.23), "coat", {"Trunk1": 0.5, "Trunk2": 0.5}),
                (0, 2.42, 1.32, (0.19, 0.185, 0.185), "coat", {"Trunk2": 0.5, "Trunk3": 0.5}),
                (0, 2.42, 0.88, (0.15, 0.15, 0.15), "coat", {"Trunk3": 0.5, "Trunk4": 0.5}),
                (0, 2.4, 0.5, (0.12, 0.12, 0.12), "coat", {"Trunk4": 0.5, "Trunk5": 0.5}),
                (0, 2.46, 0.22, (0.1, 0.1, 0.1), "sock", "Trunk5"),
                (0, 2.5, 0.16, (0.07, 0.07, 0.07), "sock", "Trunk5"),
            ],
            sides=12,
            steps=3,
        )
        shape.loft(
            [
                ((0.42, 1.72, 2.62), (0.3, 0.07), "coat", "Head"),
                ((0.78, 1.56, 2.6), (0.62, 0.05), "coat", {"Head": 0.3, "Ear.L": 0.7}),
                ((1.12, 1.4, 2.5), (0.66, 0.04), "ear", "Ear.L"),
                ((1.38, 1.3, 2.38), (0.46, 0.035), "ear", "Ear.L"),
                ((1.5, 1.26, 2.3), (0.14, 0.03), "ear", "Ear.L"),
            ],
            sides=10,
            steps=3,
            ref=(0, 0, 1),
            mirror=True,
        )
        shape.loft(
            [
                ((0.26, 2.02, 2.1), 0.085, "tusk", "Head"),
                ((0.33, 2.3, 1.84), 0.08, "tusk", "Head"),
                ((0.4, 2.62, 1.7), 0.065, "tusk", "Head"),
                ((0.42, 2.92, 1.78), 0.04, "tusk", "Head"),
                ((0.4, 3.06, 1.9), 0.012, "tusk", "Head"),
            ],
            sides=7,
            steps=3,
            mirror=True,
        )
        chain(
            shape,
            [
                (0, -1.5, 2.36, 0.07, "coat", "Pelvis"),
                (0, -1.62, 2.22, 0.06, "coat", "Tail1"),
                (0, -1.68, 1.8, 0.045, "coat", "Tail2"),
                (0, -1.7, 1.36, 0.035, "coat", "Tail3"),
                (0, -1.7, 1.18, 0.07, "tuft", "Tail3"),
                (0, -1.7, 1.02, 0.02, "tuft", "Tail3"),
            ],
            sides=6,
        )
        shape.ball((0.42, 2.02, 2.56), 0.045, "eye", "Head")

    return {
        "name": "elephant",
        "palette": {
            "coat": "#84807c",
            "sock": "#6f6b68",
            "ear": "#8d8884",
            "tusk": "#f0e9d6",
            "tuft": "#2e2b29",
            "hoof": "#a39d95",
            "eye": "#0b0a09",
        },
        "sculpt": sculpt,
        "joints": {"Back": back_leg(hip, 0.4), "Front": front_leg(shoulder, 0.4)},
        "legs": {
            "sock": "sock",
            "sides": 10,
            "Back": {
                "thigh": (0.36, 0.46, 0.46),
                "knee": (0.27, 0.29, 0.29),
                "cannon": (0.24, 0.25, 0.25),
                "fetlock": (0.25, 0.26, 0.26),
                "hoof": (0.27, 0.29, 0.27),
                "hoof_height": 0.3,
            },
            "Front": {
                "thigh": (0.34, 0.42, 0.42),
                "knee": (0.27, 0.29, 0.29),
                "cannon": (0.25, 0.26, 0.26),
                "fetlock": (0.26, 0.27, 0.27),
                "hoof": (0.28, 0.3, 0.28),
                "hoof_height": 0.3,
            },
        },
        "bones": spine_bones(
            (0, -0.1, 2.15),
            (0, -1.2, 2.2),
            (0, 1.0, 2.25),
            ((0, 1.1, 2.35), (0, 1.4, 2.5)),
            (0, 1.6, 2.55),
            (0, 2.12, 2.2),
        )
        + tail_bones([(0, -1.52, 2.34), (0, -1.64, 2.1), (0, -1.69, 1.6), (0, -1.7, 1.05)])
        + [("Ear.L", (0.45, 1.7, 2.62), (1.3, 1.32, 2.4), "Head")]
        + [
            (f"Trunk{index + 1}", trunk[index], trunk[index + 1], f"Trunk{index}" if index else "Head")
            for index in range(5)
        ],
        "tail_bones": 3,
        "trunk_bones": 5,
        "ear_flap": True,
        "muzzle": (0, 2.46, 0.2),
        "girth": 0.9,
        "belly": 1.3,
        "look": 0.06,
        "slump": 0.25,
        "swish": 0.25,
        "view_span": 1.0,
        "walk": walk_gait(1.9, 0.5, lift=0.05, fold_front=0.3, fold_back=0.12, toe=0.2, nod=0.02, bob=0.005),
        "run": run_gait(
            1.1,
            0.62,
            lift=0.08,
            duty=0.5,
            phases=WALK_PHASES,
            bounce=0.01,
            rock=0.008,
            flex=0.0,
            drop=0.035,
            fold_front=0.45,
            fold_back=0.2,
            toe=0.3,
            stretch=0.0,
            lift_head=0.0,
            tail_lift=0.1,
        ),
    }


SPECIES = {
    "sheep": sheep,
    "horse": horse,
    "deer": deer,
    "cattle": cattle,
    "bull": bull,
    "elephant": elephant,
}
GLOW = {"cattle": 1.3, "bull": 3.6, "elephant": 1.35}
