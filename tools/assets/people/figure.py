import math

from loft import Shell, Station, mirrored_name

authored_height = 1.78

man = {
    "height": 1.78,
    "torso": [
        (0.875, 0.11, 0.085, 0.09),
        (0.93, 0.17, 0.11, 0.12),
        (0.99, 0.175, 0.115, 0.125),
        (1.045, 0.166, 0.108, 0.114),
        (1.035, 0.181, 0.122, 0.127),
        (1.12, 0.166, 0.114, 0.114),
        (1.22, 0.177, 0.121, 0.118),
        (1.32, 0.192, 0.13, 0.125),
        (1.4, 0.2, 0.124, 0.125),
        (1.45, 0.188, 0.1, 0.105),
        (1.495, 0.076, 0.066, 0.07),
    ],
    "hem": 4,
    "shoulder": (0.2, 0.0, 1.39),
    "arm_spread": math.radians(16),
    "sleeve": 0.15,
    "arm_girth": 1.12,
    "hip": 0.092,
    "leg_girth": 1.0,
    "neck": 0.05,
    "head_girth": 1.1,
    "hair": "crop",
    "colors": {
        "Shirt": (0.19, 0.33, 0.52),
        "Pants": (0.1, 0.11, 0.16),
        "Skin": (0.72, 0.5, 0.37),
        "Hair": (0.09, 0.06, 0.04),
        "Shoes": (0.08, 0.08, 0.09),
        "Eyes": (0.03, 0.03, 0.035),
    },
}

woman = {
    **man,
    "height": 1.68,
    "torso": [
        (0.875, 0.11, 0.085, 0.095),
        (0.93, 0.176, 0.112, 0.128),
        (0.975, 0.18, 0.115, 0.13),
        (1.0, 0.174, 0.11, 0.122),
        (0.985, 0.192, 0.125, 0.137),
        (1.07, 0.152, 0.102, 0.106),
        (1.13, 0.14, 0.096, 0.098),
        (1.22, 0.15, 0.116, 0.104),
        (1.31, 0.164, 0.138, 0.11),
        (1.39, 0.172, 0.116, 0.11),
        (1.445, 0.162, 0.092, 0.097),
        (1.493, 0.068, 0.06, 0.064),
    ],
    "hem": 4,
    "shoulder": (0.172, 0.0, 1.385),
    "arm_spread": math.radians(15),
    "sleeve": 0.47,
    "arm_girth": 0.98,
    "hip": 0.097,
    "leg_girth": 0.93,
    "neck": 0.043,
    "head_girth": 1.07,
    "hair": "bob",
    "colors": {
        "Shirt": (0.7, 0.26, 0.2),
        "Pants": (0.2, 0.24, 0.3),
        "Skin": (0.76, 0.54, 0.42),
        "Hair": (0.2, 0.09, 0.04),
        "Shoes": (0.45, 0.3, 0.18),
        "Eyes": (0.03, 0.03, 0.035),
    },
}

profiles = {"man": man, "woman": woman}

joints = {
    "hips": 0.96,
    "spine": 1.06,
    "chest": 1.22,
    "neck": 1.47,
    "head": 1.57,
    "crown": 1.78,
    "thigh": 0.93,
    "knee": 0.5,
    "ankle": 0.085,
    "ball": (-0.11, 0.02),
    "toe": (-0.2, 0.02),
    "elbow": 0.29,
    "wrist": 0.55,
    "knuckle": 0.7,
}


def blend(first, second, amount):
    amount = min(1.0, max(0.0, amount))
    if amount <= 0:
        return {first: 1.0}
    if amount >= 1:
        return {second: 1.0}
    return {first: 1.0 - amount, second: amount}


def torso_weights(height):
    if height < 1.12:
        return blend("Hips", "Spine", (height - 1.0) / 0.12)
    return blend("Spine", "Chest", (height - 1.12) / 0.18)


def leg_weights(height):
    if height > 0.94:
        return {"Hips": 0.5, "UpperLegL": 0.5}
    if height > 0.88:
        return {"Hips": 0.2, "UpperLegL": 0.8}
    return blend("UpperLegL", "LowerLegL", (0.57 - height) / 0.14)


def arm_weights(distance):
    if distance < 0.0:
        return {"Chest": 0.45, "UpperArmL": 0.55}
    if distance < 0.05:
        return {"Chest": 0.2, "UpperArmL": 0.8}
    if distance < 0.45:
        return blend("UpperArmL", "LowerArmL", (distance - 0.23) / 0.12)
    return blend("LowerArmL", "HandL", (distance - 0.5) / 0.07)


def torso(shell, profile):
    rows = profile["torso"]
    stations = [Station((0, 0, 0.845), weights={"Hips": 1.0}, material="Pants")]
    for index, (height, half_width, front, back) in enumerate(rows):
        below_hem = index < profile["hem"]
        stations.append(
            Station(
                (0, 0, height),
                half_width,
                front,
                back,
                torso_weights(height),
                "Pants" if index < profile["hem"] - 1 else "Shirt",
                sharp=index == profile["hem"] or index == len(rows) - 1,
            )
        )
        if below_hem and index == profile["hem"] - 1:
            stations[-1].weights = torso_weights(rows[profile["hem"]][0])
    collar = rows[-1][0]
    stations.append(
        Station((0, 0, collar - 0.012), profile["neck"] * 0.9, profile["neck"] * 0.9, profile["neck"] * 0.9, {"Chest": 1.0}, "Shirt")
    )
    stations.append(Station((0, 0, collar - 0.03), weights={"Chest": 1.0}))
    shell.loft(stations, 12, squareness=0.86)
    girth = profile["neck"]
    shell.loft(
        [
            Station((0, 0.004, 1.45), weights={"Chest": 1.0}, material="Skin"),
            Station((0, 0.004, 1.47), girth, girth, girth, {"Chest": 1.0}, "Skin"),
            Station((0, 0.004, 1.51), girth * 0.96, girth * 0.96, girth, {"Chest": 0.5, "Neck": 0.5}, "Skin"),
            Station((0, 0.006, 1.555), girth * 0.94, girth * 0.96, girth, {"Neck": 0.5, "Head": 0.5}, "Skin"),
            Station((0, 0.008, 1.6), girth * 0.9, girth * 0.9, girth * 0.9, {"Head": 1.0}, "Skin"),
            Station((0, 0.008, 1.62), weights={"Head": 1.0}),
        ],
        8,
    )


def leg(profile):
    shell = Shell()
    side = profile["hip"]
    girth = profile["leg_girth"]
    rows = [
        (0.975, 0.07, 0.075, 0.08),
        (0.9, 0.087, 0.09, 0.094),
        (0.8, 0.08, 0.085, 0.086),
        (0.64, 0.067, 0.071, 0.071),
        (0.57, 0.061, 0.065, 0.064),
        (0.5, 0.058, 0.063, 0.06),
        (0.43, 0.056, 0.056, 0.063),
        (0.36, 0.055, 0.054, 0.065),
        (0.2, 0.047, 0.048, 0.05),
        (0.105, 0.052, 0.054, 0.054),
    ]
    stations = [Station((side, 0, 1.0), weights=leg_weights(1.0), material="Pants")]
    for index, (height, half_width, front, back) in enumerate(rows):
        stations.append(
            Station(
                (side, 0.004, height),
                half_width * girth,
                front * girth,
                back * girth,
                leg_weights(height),
                "Pants",
                sharp=index == len(rows) - 1,
            )
        )
    stations.append(Station((side, 0.004, 0.14), weights={"LowerLegL": 1.0}))
    shell.loft(stations, 8)

    def flat_sole(angle, point):
        return (point[0], point[1], max(0.0, point[2]))

    foot = {"FootL": 1.0}
    toes = {"ToesL": 1.0}
    shell.loft(
        [
            Station((side, 0.068, 0.04), weights=foot, material="Shoes"),
            Station((side, 0.052, 0.045), 0.034, 0.064, 0.05, foot, "Shoes", reshape=flat_sole),
            Station((side, 0.0, 0.045), 0.042, 0.064, 0.085, foot, "Shoes", reshape=flat_sole),
            Station((side, -0.06, 0.04), 0.047, 0.057, 0.05, foot, "Shoes", reshape=flat_sole),
            Station((side, -0.11, 0.033), 0.051, 0.047, 0.034, {"FootL": 0.5, "ToesL": 0.5}, "Shoes", reshape=flat_sole),
            Station((side, -0.17, 0.028), 0.046, 0.04, 0.024, toes, "Shoes", reshape=flat_sole),
            Station((side, -0.2, 0.018), 0.026, 0.026, 0.014, toes, "Shoes", reshape=flat_sole),
            Station((side, -0.208, 0.012), weights=toes),
        ],
        8,
        across=(1, 0, 0),
        depth=(0, 0, 1),
    )
    return shell


def arm(profile):
    shell = Shell()
    girth = profile["arm_girth"]
    sleeve = profile["sleeve"]
    rows = [
        (-0.012, 0.04),
        (0.02, 0.054),
        (0.08, 0.052),
        (0.15, 0.048),
        (0.23, 0.041),
        (0.29, 0.038),
        (0.35, 0.039),
        (0.47, 0.031),
        (0.53, 0.027),
    ]
    stations = [Station((0, 0, 0.032), weights=arm_weights(-0.05), material="Shirt")]
    bare = False
    for distance, radius in rows:
        if distance > sleeve + 0.001 and not bare:
            bare = True
            cuff = radius * girth + 0.009
            stations.append(Station((0, 0, -sleeve), cuff, cuff, cuff, arm_weights(sleeve), "Shirt", sharp=True))
            stations.append(
                Station((0, 0, -sleeve + 0.004), radius * girth, radius * girth, radius * girth, arm_weights(sleeve), "Skin")
            )
        clothed = distance <= sleeve + 0.001
        size = radius * girth + (0.006 if clothed and distance > 0.1 else 0.0)
        if abs(distance - sleeve) < 0.001:
            continue
        stations.append(Station((0, 0, -distance), size, size, size, arm_weights(distance), "Shirt" if clothed else "Skin"))
    hand = {"HandL": 1.0}
    stations.extend(
        [
            Station((0, -0.004, -0.575), 0.02 * girth, 0.04 * girth, 0.034 * girth, hand, "Skin"),
            Station((0, -0.006, -0.635), 0.022 * girth, 0.047 * girth, 0.04 * girth, hand, "Skin"),
            Station((0, -0.008, -0.695), 0.018 * girth, 0.038 * girth, 0.034 * girth, hand, "Skin"),
            Station((0, -0.008, -0.722), weights=hand),
        ]
    )
    shell.loft(stations, 8)
    return shell


head_rows = [
    (1.768, 0.046, 0.05, 0.056, 0.012),
    (1.74, 0.07, 0.08, 0.088, 0.01),
    (1.695, 0.081, 0.094, 0.1, 0.008),
    (1.65, 0.082, 0.098, 0.099, 0.006),
    (1.605, 0.077, 0.096, 0.088, 0.004),
    (1.568, 0.069, 0.09, 0.072, 0.0),
    (1.538, 0.054, 0.079, 0.05, -0.004),
    (1.52, 0.032, 0.058, 0.03, -0.008),
]
head_center = (0.0, 0.006, 1.66)


def about_head(point, factor, lift=None):
    return (
        head_center[0] + (point[0] - head_center[0]) * factor,
        head_center[1] + (point[1] - head_center[1]) * factor,
        head_center[2] + (point[2] - head_center[2]) * (factor if lift is None else lift),
    )


def head(shell, profile):
    girth = profile["head_girth"]
    skull = {"Head": 1.0}

    def face(angle, point):
        frontness = -math.sin(angle)
        if frontness > 0.99 and abs(point[2] - 1.605) < 0.001:
            return (point[0], point[1] - 0.024, point[2] - 0.006)
        if frontness > 0.99 and abs(point[2] - 1.65) < 0.001:
            return (point[0], point[1] - 0.004, point[2])
        return point

    def skull_stations(material, reshape):
        stations = [Station((0, 0.012, 1.782), weights=skull, material=material, reshape=reshape)]
        for height, half_width, front, back, offset in head_rows:
            stations.append(
                Station((0, offset, height), half_width * girth, front * girth, back * girth, skull, material, reshape=reshape)
            )
        stations.append(Station((0, -0.012, 1.512), weights=skull, reshape=reshape))
        return stations

    shell.loft(skull_stations("Skin", face), 12)

    if profile["hair"] == "crop":

        def crop(angle, point):
            frontness = -math.sin(angle)
            if frontness >= 0:
                hairline = 1.628 + (1.712 - 1.628) * frontness**1.5
            else:
                hairline = 1.628 + (1.628 - 1.548) * frontness
            if point[2] > hairline:
                return about_head(point, 1.085, 1.075)
            return about_head(point, 0.84)

        shell.loft(skull_stations("Hair", crop), 12)
    else:

        def bob(angle, point):
            frontness = -math.sin(angle)
            if frontness > 0.6 and point[2] < 1.72:
                tuck = 0.3 if point[2] < 1.54 else 0.55
                return (point[0] * tuck, 0.01 + (point[1] - 0.01) * tuck, point[2])
            return point

        rows = [
            (1.778, 0.05, 0.056, 0.062, 0.014),
            (1.75, 0.08, 0.09, 0.098, 0.012),
            (1.7, 0.094, 0.105, 0.112, 0.01),
            (1.65, 0.098, 0.104, 0.116, 0.01),
            (1.6, 0.099, 0.098, 0.116, 0.012),
            (1.55, 0.098, 0.088, 0.112, 0.014),
            (1.505, 0.092, 0.078, 0.102, 0.016),
            (1.478, 0.07, 0.06, 0.08, 0.018),
        ]
        stations = [Station((0, 0.014, 1.795), weights=skull, material="Hair")]
        for height, half_width, front, back, offset in rows:
            stations.append(
                Station((0, offset, height), half_width * girth, front * girth, back * girth, skull, "Hair", reshape=bob)
            )
        stations.append(Station((0, 0.02, 1.47), weights=skull, reshape=bob))
        shell.loft(stations, 12)

    for side in (1, -1):
        center = (0.034 * girth * side, -0.0835 * girth + 0.006 * (1 - girth), 1.652)
        shell.loft(
            [
                Station((center[0], center[1], center[2] + 0.014), weights=skull, material="Eyes"),
                Station(center, 0.0095, 0.008, 0.008, skull, "Eyes"),
                Station((center[0], center[1], center[2] - 0.014), weights=skull),
            ],
            6,
        )


def spread(profile):
    angle = profile["arm_spread"]
    shoulder = profile["shoulder"]
    sine = math.sin(angle)
    cosine = math.cos(angle)

    def place(point):
        return (
            shoulder[0] + point[0] * cosine - point[2] * sine,
            shoulder[1] + point[1],
            shoulder[2] + point[0] * sine + point[2] * cosine,
        )

    return place


def skeleton(profile):
    side = profile["hip"]
    place = spread(profile)
    ball = joints["ball"]
    toe = joints["toe"]
    bones = {
        "Hips": ((0, 0, joints["hips"]), (0, 0, joints["spine"]), None),
        "Spine": ((0, 0, joints["spine"]), (0, 0, joints["chest"]), "Hips"),
        "Chest": ((0, 0, joints["chest"]), (0, 0, joints["neck"]), "Spine"),
        "Neck": ((0, 0, joints["neck"]), (0, 0, joints["head"]), "Chest"),
        "Head": ((0, 0, joints["head"]), (0, 0, joints["crown"]), "Neck"),
    }
    left = {
        "UpperLegL": ((side, 0, joints["thigh"]), (side, 0, joints["knee"]), "Hips"),
        "LowerLegL": ((side, 0, joints["knee"]), (side, 0, joints["ankle"]), "UpperLegL"),
        "FootL": ((side, 0, joints["ankle"]), (side, ball[0], ball[1]), "LowerLegL"),
        "ToesL": ((side, ball[0], ball[1]), (side, toe[0], toe[1]), "FootL"),
        "UpperArmL": (place((0, 0, 0)), place((0, 0, -joints["elbow"])), "Chest"),
        "LowerArmL": (place((0, 0, -joints["elbow"])), place((0, 0, -joints["wrist"])), "UpperArmL"),
        "HandL": (place((0, 0, -joints["wrist"])), place((0, 0, -joints["knuckle"])), "LowerArmL"),
    }
    for name, (start, end, parent) in left.items():
        bones[name] = (start, end, parent)
    for name, (start, end, parent) in left.items():
        bones[mirrored_name(name)] = (
            (-start[0], start[1], start[2]),
            (-end[0], end[1], end[2]),
            mirrored_name(parent),
        )
    return bones


def build(profile):
    shell = Shell()
    torso(shell, profile)
    head(shell, profile)
    for mirrored in (False, True):
        shell.absorb(leg(profile), mirrored=mirrored)
        shell.absorb(arm(profile), place=spread(profile), mirrored=mirrored)
    factor = profile["height"] / authored_height
    shell.scale(factor)
    bones = {
        name: (tuple(v * factor for v in start), tuple(v * factor for v in end), parent)
        for name, (start, end, parent) in skeleton(profile).items()
    }
    return shell, bones, factor
