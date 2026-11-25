import math

import numpy as np

from meshkit import UP, Mesh, along, grow, inset, perpendicular, random_perpendicular, rotate, spherical, unit
from noise import tile_fbm
from paint import Canvas, colour

TEXTURE_SIZE = 512
EDGE = 3.0 / TEXTURE_SIZE


def vary(rng, tint, spread=0.16):
    shifted = tint * rng.uniform(1 - spread, 1 + spread)
    return np.clip(shifted + np.array([rng.uniform(-0.03, 0.05), rng.uniform(-0.02, 0.03), rng.uniform(-0.02, 0.02)]), 0, 1)


def paint_bark(canvas, rect, light, dark, cells=(3, 26), cracks=0.0):
    def painter(grid_u, grid_v, grain):
        rows, columns = grid_u.shape
        streaks = tile_fbm(rows, columns, cells[0], cells[1], 3, canvas.rng)
        blend = np.clip((streaks - 0.3) / 0.4, 0, 1)[..., None]
        tint = dark * (1 - blend) + light * blend
        if cracks:
            lines = 1 - np.abs(2 * tile_fbm(rows, columns, cells[0], cells[1], 2, canvas.rng) - 1)
            tint = tint * (1 - cracks * np.clip((lines - 0.86) / 0.1, 0, 1))[..., None]
        return tint * (0.85 + 0.3 * grain)[..., None]

    canvas.clip = rect
    canvas.fill(rect, painter)


def turned(direction, angle):
    return np.array(
        [
            direction[0] * math.cos(angle) - direction[1] * math.sin(angle),
            direction[0] * math.sin(angle) + direction[1] * math.cos(angle),
        ]
    )


def paint_sprig(canvas, rect, rng, tone, wood, leaves, leaf_length, slender, belly=0.42, point=1.0, veins=6, shoots=2):
    canvas.clip = rect
    u0, v0, u1, v1 = rect
    width, height = u1 - u0, v1 - v0

    def shoot(origin, angle, rise, count, girth):
        bend = rng.uniform(-0.3, 0.3)

        def stem(fraction):
            lean = angle + bend * fraction / 2
            return origin + rise * fraction * np.array([math.sin(lean), math.cos(lean)])

        marks = 6
        for mark in range(marks):
            thickness = girth * (1 - 0.6 * mark / marks)
            canvas.stroke(stem(mark / marks), stem((mark + 1) / marks), thickness, thickness * 0.9, wood)
        for index in range(count):
            fraction = (index + 0.8) / (count + 0.6)
            heading = unit2(stem(min(1, fraction + 0.05)) - stem(fraction - 0.05))
            side = 1 if index % 2 else -1
            direction = turned(heading, side * rng.uniform(0.6, 1.2) * (1 - 0.4 * fraction))
            length = leaf_length * (1 - 0.22 * fraction) * rng.uniform(0.7, 1.12)
            spot = stem(fraction)
            canvas.leaf(spot, spot + direction * length, length * slender, vary(rng, tone), belly=belly, point=point, veins=veins)
        tip = stem(1.0)
        heading = unit2(tip - stem(0.9))
        canvas.leaf(tip - heading * leaf_length * 0.05, tip + heading * leaf_length * 0.95, leaf_length * slender, vary(rng, tone * 1.08), belly=belly, point=point, veins=veins)
        return stem

    base = np.array([u0 + width * 0.5, v0 + height * 0.01])
    rise = height * 0.96 - leaf_length
    lean = rng.uniform(-0.1, 0.1)
    for index in range(shoots):
        fraction = rng.uniform(0.2, 0.5)
        side = 1 if index % 2 else -1
        origin = base + rise * fraction * np.array([math.sin(lean), math.cos(lean)])
        shoot(origin, lean + side * rng.uniform(0.4, 0.65), rise * (1 - fraction) * 0.68, max(3, leaves // 2), width * 0.011)
    shoot(base, lean, rise, leaves, width * 0.016)


def unit2(vector):
    return vector / (np.hypot(vector[0], vector[1]) + 1e-12)


def paint_twigs(canvas, rect, rng, wood, tones):
    canvas.clip = rect
    u0, v0, u1, v1 = rect
    width, height = u1 - u0, v1 - v0

    def twig(start, angle, length, girth, level):
        end = start + length * np.array([math.sin(angle), math.cos(angle)])
        canvas.stroke(start, end, girth, girth * 0.65, vary(rng, wood, 0.12))
        if level >= 1:
            for _ in range(5 if level == 3 else 3):
                origin = start + (end - start) * rng.uniform(0.2, 1.0)
                lean = angle + rng.choice([-1, 1]) * rng.uniform(0.4, 0.9)
                reach = width * rng.uniform(0.07, 0.11)
                tip = origin + reach * np.array([math.sin(lean), math.cos(lean)])
                canvas.leaf(origin, tip, reach * 0.2, vary(rng, tones[rng.integers(len(tones))]), belly=0.5, point=0.8, veins=0, vein_strength=0)
        if level < 3:
            for _ in range(int(rng.integers(2, 4))):
                origin = start + (end - start) * rng.uniform(0.4, 1.0)
                twig(origin, angle + rng.uniform(-0.65, 0.65), length * rng.uniform(0.55, 0.7), girth * 0.62, level + 1)

    twig(np.array([u0 + width * 0.5, v0 + height * 0.01]), rng.uniform(-0.08, 0.08), height * 0.4, width * 0.022, 0)


def paint_frond(canvas, rect, rng, tone, stalk):
    canvas.clip = rect
    u0, v0, u1, v1 = rect
    width, height = u1 - u0, v1 - v0
    sway = rng.uniform(-0.03, 0.03) * width

    def rachis(fraction):
        return np.array([u0 + width * 0.5 + sway * math.sin(fraction * 3.0), v0 + height * (0.01 + 0.95 * fraction)])

    pairs = 19
    for index in range(pairs):
        fraction = 0.1 + 0.88 * index / (pairs - 1)
        origin = rachis(fraction)
        shape = math.sin(math.pi * ((fraction - 0.06) / 0.94) ** 0.58) ** 0.85
        length = width * 0.47 * max(shape, 0.06)
        angle = 1.3 - 0.55 * fraction
        girth = height * 0.88 / pairs * 0.5
        for side in (-1, 1):
            direction = turned(np.array([0.0, 1.0]), side * angle * rng.uniform(0.94, 1.06))
            canvas.leaf(
                origin,
                origin + direction * length * rng.uniform(0.92, 1.05),
                girth,
                vary(rng, tone * (0.9 + 0.25 * fraction), 0.1),
                belly=0.24,
                point=0.9,
                veins=0,
                vein_strength=0,
                serration=0.3,
                teeth=max(3, int(length / girth * 1.3)),
            )
    marks = 14
    for mark in range(marks):
        girth = width * 0.014 * (1 - 0.75 * mark / marks)
        canvas.stroke(rachis(mark / marks), rachis((mark + 1) / marks), girth, girth, stalk)


def paint_palmate(canvas, rect, rng, tone, leaflets):
    canvas.clip = rect
    u0, v0, u1, v1 = rect
    width = u1 - u0
    centre = np.array([(u0 + u1) / 2, (v0 + v1) / 2])
    start = rng.uniform(0, math.tau)
    for index in range(leaflets):
        angle = start + math.tau * (index + rng.uniform(-0.12, 0.12)) / leaflets
        direction = np.array([math.cos(angle), math.sin(angle)])
        length = width * 0.455 * rng.uniform(0.84, 1.0)
        canvas.leaf(centre + direction * width * 0.02, centre + direction * length, length * 0.21, vary(rng, tone, 0.1), belly=0.6, point=1.15, veins=9, vein_strength=0.1)


def plan(meshes, atlas, glow, masked):
    return {"meshes": meshes, "atlas": atlas, "glow": glow, "masked": set(masked)}


def sprite_grid(columns, rows, floor):
    cells = []
    for row in range(rows):
        for column in range(columns):
            cells.append(
                (
                    column / columns,
                    floor + (1 - floor) * row / rows,
                    (column + 1) / columns,
                    floor + (1 - floor) * (row + 1) / rows,
                )
            )
    return cells


WOOD_BAND = (EDGE, 0.125 - EDGE)


def woody_atlas(seed, glow, wood_light, wood_dark, painter):
    canvas = Canvas(TEXTURE_SIZE, seed)
    paint_bark(canvas, (0.0, 0.0, 1.0, 0.125), wood_light, wood_dark)
    cells = sprite_grid(3, 2, 0.125)
    rng = np.random.default_rng(seed + 1)
    for index, cell in enumerate(cells):
        painter(canvas, inset(cell, EDGE), rng, index)
    return canvas, [inset(cell, EDGE / 2) for cell in cells]


def woody(name, seed, shape, sprites):
    rng = np.random.default_rng(seed)
    mesh = Mesh(name)

    def sprig(base, direction):
        rect = sprites[int(rng.integers(len(sprites)))]
        size = shape["sprig"] * rng.uniform(0.8, 1.2)
        mesh.card("leaves", rng, base, direction, size, size * 0.76, rect, roll=rng.uniform(-1.3, 1.3), droop=rng.uniform(0.1, 0.5), rows=2)

    def branch(start, direction, length, radius, level):
        steps = 3 if level < 2 else 2
        points = grow(rng, start, direction, length, steps, pull=UP, pull_strength=shape["lift"], wander=shape["wander"])
        sides = max(3, shape["sides"] - level)
        mesh.tube("wood", points, np.linspace(radius, radius * 0.62, steps + 1), sides, WOOD_BAND)
        heading = unit(points[-1] - points[-2])
        if level < shape["depth"]:
            for _ in range(int(rng.integers(shape["forks"][0], shape["forks"][1] + 1))):
                origin = along(points, rng.uniform(0.45, 1.0))
                turn = rotate(heading, random_perpendicular(rng, heading), rng.uniform(*shape["fork_angle"]))
                branch(origin, turn, length * rng.uniform(0.62, 0.82), radius * 0.62, level + 1)
        if level >= shape["leaf_level"]:
            for _ in range(shape["along"]):
                origin = along(points, rng.uniform(0.25, 1.0))
                turn = rotate(heading, random_perpendicular(rng, heading), rng.uniform(0.5, 1.2))
                sprig(origin, turn)
        if level == shape["depth"]:
            for _ in range(shape["tips"]):
                turn = rotate(heading, random_perpendicular(rng, heading), rng.uniform(0.0, 0.8))
                sprig(points[-1], turn)

    for stem in range(shape["stems"]):
        azimuth = math.tau * (stem + rng.uniform(-0.3, 0.3)) / shape["stems"]
        lean = rng.uniform(*shape["lean"])
        direction = spherical(azimuth, math.pi / 2 - lean)
        start = np.array([direction[0], direction[1], 0.0]) * 0.05
        branch(start, direction, shape["reach"] * rng.uniform(0.85, 1.1), shape["radius"], 0)
    return mesh


def shrub_atlas():
    tones = [colour(86, 134, 52), colour(106, 148, 58), colour(72, 120, 50)]

    def painter(canvas, cell, rng, index):
        paint_sprig(canvas, cell, rng, tones[index % 3], colour(96, 78, 58), int(rng.integers(7, 10)), 0.115, 0.36, belly=0.45, point=0.75)

    return woody_atlas(101, 1.9, colour(122, 100, 76), colour(62, 50, 40), painter)


def bush_atlas():
    tones = [colour(54, 102, 46), colour(70, 116, 50), colour(46, 90, 48)]

    def painter(canvas, cell, rng, index):
        paint_sprig(canvas, cell, rng, tones[index % 3], colour(84, 66, 48), int(rng.integers(11, 15)), 0.09, 0.26, belly=0.5, point=0.8, veins=0)

    return woody_atlas(131, 1.9, colour(108, 88, 66), colour(54, 44, 36), painter)


def scrub_atlas():
    tones = [colour(134, 140, 84), colour(156, 150, 92), colour(118, 130, 88)]

    def painter(canvas, cell, rng, index):
        paint_twigs(canvas, cell, rng, colour(150, 128, 100), tones)

    return woody_atlas(151, 1.8, colour(160, 138, 108), colour(100, 84, 66), painter)


def shrub():
    canvas, sprites = shrub_atlas()
    shape = {
        "stems": 6, "lean": (0.15, 0.6), "reach": 0.62, "radius": 0.022, "sides": 5, "depth": 2,
        "forks": (2, 3), "fork_angle": (0.35, 0.8), "lift": 0.45, "wander": 0.09,
        "leaf_level": 1, "along": 2, "tips": 3, "sprig": 0.42,
    }
    return plan([woody("shrub", 5, shape, sprites)], canvas, 1.9, {"leaves"})


def shrub_wide():
    canvas, sprites = shrub_atlas()
    shape = {
        "stems": 8, "lean": (0.7, 1.25), "reach": 0.6, "radius": 0.022, "sides": 5, "depth": 2,
        "forks": (2, 3), "fork_angle": (0.35, 0.8), "lift": 0.75, "wander": 0.09,
        "leaf_level": 1, "along": 2, "tips": 3, "sprig": 0.4,
    }
    return plan([woody("shrub-wide", 9, shape, sprites)], canvas, 1.9, {"leaves"})


def bush():
    canvas, sprites = bush_atlas()
    shape = {
        "stems": 9, "lean": (0.1, 1.15), "reach": 0.26, "radius": 0.014, "sides": 4, "depth": 2,
        "forks": (2, 3), "fork_angle": (0.4, 0.9), "lift": 0.35, "wander": 0.08,
        "leaf_level": 1, "along": 3, "tips": 4, "sprig": 0.24,
    }
    return plan([woody("bush", 17, shape, sprites)], canvas, 1.9, {"leaves"})


def bush_small():
    canvas, sprites = bush_atlas()
    shape = {
        "stems": 6, "lean": (0.1, 0.95), "reach": 0.2, "radius": 0.011, "sides": 4, "depth": 2,
        "forks": (2, 2), "fork_angle": (0.4, 0.9), "lift": 0.5, "wander": 0.08,
        "leaf_level": 1, "along": 3, "tips": 4, "sprig": 0.2,
    }
    return plan([woody("bush-small", 21, shape, sprites)], canvas, 1.9, {"leaves"})


def scrub():
    canvas, sprites = scrub_atlas()
    shape = {
        "stems": 9, "lean": (0.3, 1.3), "reach": 0.2, "radius": 0.012, "sides": 4, "depth": 2,
        "forks": (2, 3), "fork_angle": (0.4, 0.9), "lift": 0.3, "wander": 0.1,
        "leaf_level": 1, "along": 2, "tips": 3, "sprig": 0.24,
    }
    return plan([woody("scrub", 29, shape, sprites)], canvas, 1.8, {"leaves"})


def fern():
    canvas = Canvas(TEXTURE_SIZE, 201)
    rects = [(0.0, 0.0, 0.5, 1.0), (0.5, 0.0, 1.0, 1.0)]
    painter = np.random.default_rng(202)
    paint_frond(canvas, inset(rects[0], EDGE), painter, colour(70, 128, 46), colour(112, 104, 58))
    paint_frond(canvas, inset(rects[1], EDGE), painter, colour(90, 144, 54), colour(120, 112, 60))
    sprites = [inset(rect, EDGE / 2) for rect in rects]
    meshes = []
    for name, seed, fronds, reach, location in (
        ("fern_tall", 31, 22, 0.6, (0.0, 0.0, 0.0)),
        ("fern_wide", 33, 18, 0.52, (1.2, 0.0, 0.0)),
        ("fern_small", 35, 11, 0.36, (0.0, 1.0, 0.0)),
    ):
        rng = np.random.default_rng(seed)
        mesh = Mesh(name, location)
        for index in range(fronds):
            ring = (index + 0.5) / fronds
            azimuth = index * 2.399963 + rng.uniform(-0.25, 0.25)
            elevation = math.radians(82 - 42 * ring + rng.uniform(-6, 6))
            length = reach * (0.5 + 0.55 * ring) * rng.uniform(0.88, 1.12)
            mesh.card(
                "frond",
                rng,
                (0.0, 0.0, 0.0),
                spherical(azimuth, elevation),
                length,
                length * 0.44,
                sprites[int(rng.integers(2))],
                roll=rng.uniform(-0.25, 0.25),
                droop=rng.uniform(0.6, 1.05),
                rows=6,
                fold=0.16,
                columns=2,
            )
        meshes.append(mesh)
    return plan(meshes, canvas, 2.6, {"frond"})


def calathea():
    canvas = Canvas(TEXTURE_SIZE, 301)
    painter = np.random.default_rng(302)
    cells = [(0.0, 0.5, 0.5, 1.0), (0.5, 0.5, 1.0, 1.0), (0.0, 0.0, 0.5, 0.5)]
    darks = [colour(36, 94, 52), colour(44, 104, 54), colour(32, 84, 56)]
    pales = [colour(138, 178, 130), colour(150, 186, 132), colour(128, 170, 132)]
    for cell, dark, pale in zip(cells, darks, pales):
        box = inset(cell, EDGE)
        canvas.clip = box
        middle = (box[0] + box[2]) / 2
        canvas.leaf(
            (middle, box[1] + 0.002),
            (middle + painter.uniform(-0.01, 0.01), box[3] - 0.002),
            (box[2] - box[0]) * 0.46,
            dark,
            belly=0.48,
            point=0.52,
            veins=10,
            vein_strength=0.05,
            stripe=pale,
            stripe_count=int(painter.integers(7, 10)),
            rib=colour(196, 216, 160),
        )
    stem_cell = (0.5, 0.0, 1.0, 0.5)
    paint_bark(canvas, stem_cell, colour(104, 136, 68), colour(72, 104, 54), cells=(2, 8))
    sprites = [inset(cell, EDGE / 2) for cell in cells]
    rng = np.random.default_rng(41)
    mesh = Mesh("calathea")
    leaves = 17
    for index in range(leaves):
        ring = (index + 0.5) / leaves
        azimuth = index * 2.399963 + rng.uniform(-0.3, 0.3)
        elevation = math.radians(82 - 45 * ring + rng.uniform(-6, 6))
        stalk_length = (0.16 + 0.2 * ring) * rng.uniform(0.85, 1.15)
        direction = spherical(azimuth, elevation)
        base = np.array([direction[0], direction[1], 0.0]) * 0.03
        stalk = grow(rng, base, direction, stalk_length, 4, pull=-UP, pull_strength=0.35)
        mesh.tube("plant", stalk, np.linspace(0.008, 0.005, 5), 3, (0.06, 0.44), closed_tip=False, wrap=(0.56, 0.94))
        heading = unit(stalk[-1] - stalk[-2])
        outward = unit(np.array([math.cos(azimuth), math.sin(azimuth), 0.0]))
        blade = unit(heading * 0.45 + outward * 0.8 + UP * rng.uniform(0.0, 0.5))
        size = (0.2 + 0.1 * ring) * rng.uniform(0.85, 1.15)
        mesh.card(
            "plant",
            rng,
            stalk[-1],
            blade,
            size,
            size * 0.92,
            sprites[int(rng.integers(3))],
            roll=rng.uniform(-0.35, 0.35),
            droop=rng.uniform(0.5, 1.1),
            rows=4,
            fold=0.14,
            columns=2,
        )
    return plan([mesh], canvas, 1.8, {"plant"})


def pachira():
    canvas = Canvas(TEXTURE_SIZE, 401)
    painter = np.random.default_rng(402)
    paint_bark(canvas, (0.0, 0.0, 1.0, 0.19), colour(124, 116, 92), colour(78, 74, 58), cells=(6, 10))
    paint_bark(canvas, (0.0, 0.19, 1.0, 0.25), colour(96, 128, 62), colour(70, 100, 50), cells=(1, 12))
    large = [(0.0, 0.25, 0.5, 0.75), (0.5, 0.25, 1.0, 0.75)]
    small = [(index * 0.25, 0.75, (index + 1) * 0.25, 1.0) for index in range(4)]
    tones = [colour(50, 104, 50), colour(62, 116, 54), colour(56, 110, 48), colour(80, 130, 58), colour(54, 106, 54), colour(72, 124, 54)]
    for cell, tone in zip(large + small, tones):
        paint_palmate(canvas, inset(cell, EDGE), painter, tone, int(painter.integers(6, 8)))
    trunk_band = (EDGE, 0.19 - EDGE)
    stalk_band = (0.19 + EDGE, 0.25 - EDGE)
    rng = np.random.default_rng(43)
    mesh = Mesh("pachira")
    trunk = grow(rng, (0.0, 0.0, 0.0), UP, 0.82, 7, wander=0.035)
    mesh.tube("bark", trunk, [0.066, 0.074, 0.06, 0.05, 0.044, 0.04, 0.035, 0.03], 8, trunk_band)

    def leaf(origin, direction, scale):
        length = rng.uniform(0.1, 0.18) * scale
        stalk = grow(rng, origin, direction, length, 2, pull=-UP, pull_strength=0.25)
        mesh.tube("bark", stalk, [0.0045, 0.004, 0.0035], 3, stalk_band, closed_tip=False)
        heading = unit(stalk[-1] - stalk[-2])
        radius = rng.uniform(0.14, 0.2) * scale
        rect = large[int(rng.integers(2))] if scale > 0.8 else small[int(rng.integers(4))]
        mesh.fan("leaves", stalk[-1], unit(UP * 0.9 + heading * 0.55), radius, inset(rect, EDGE / 2), 10, droop=rng.uniform(0.15, 0.4), cup=0.08, spin=rng.uniform(0, math.tau))

    def limb(origin, direction, length):
        points = grow(rng, origin, direction, length, 4, pull=UP, pull_strength=0.5, wander=0.06)
        mesh.tube("bark", points, np.linspace(0.02, 0.01, 5), 5, trunk_band)
        heading = unit(points[-1] - points[-2])
        for _ in range(5):
            spot = along(points, rng.uniform(0.45, 1.0))
            turn = unit(rotate(heading, random_perpendicular(rng, heading), rng.uniform(0.5, 1.2)) + UP * 0.35)
            leaf(spot, turn, 1.0)
        leaf(points[-1], unit(heading + UP * 0.4), 1.0)
        for _ in range(2):
            leaf(points[-1], unit(heading + rng.normal(size=3) * 0.5 + UP * 0.6), 0.6)

    crown = 5
    for index in range(crown):
        azimuth = math.tau * (index + rng.uniform(-0.25, 0.25)) / crown
        limb(trunk[-1], spherical(azimuth, math.radians(rng.uniform(25, 60))), rng.uniform(0.28, 0.42))
    for index in range(2):
        azimuth = rng.uniform(0, math.tau)
        limb(along(trunk, rng.uniform(0.6, 0.85)), spherical(azimuth, math.radians(rng.uniform(25, 45))), rng.uniform(0.22, 0.32))
    for _ in range(4):
        leaf(trunk[-1], unit(UP + rng.normal(size=3) * 0.5), 1.0)
    return plan([mesh], canvas, 1.4, {"leaves"})


def quiver():
    canvas = Canvas(TEXTURE_SIZE, 501)
    paint_bark(canvas, (0.0, 0.0, 1.0, 0.4), colour(204, 168, 102), colour(140, 102, 60), cells=(4, 10), cracks=0.32)
    paint_bark(canvas, (0.0, 0.4, 1.0, 0.6), colour(212, 202, 178), colour(176, 164, 142), cells=(3, 8))
    base_tone = colour(96, 134, 112)
    tip_tone = colour(158, 154, 92)

    def blades(grid_u, grid_v, grain):
        rise = np.clip((grid_v - 0.6) / 0.4, 0, 1)[..., None]
        strip = (grid_u * 4) % 1.0
        channel = (0.86 + 0.2 * np.abs(strip * 2 - 1))[..., None]
        edge = np.clip((np.abs(strip * 2 - 1) - 0.86) * 6, 0, 1)[..., None]
        tint = base_tone * (1 - rise**1.6) + tip_tone * rise**1.6
        tint = tint * channel * (0.9 + 0.2 * grain)[..., None]
        return tint * (1 - edge) + colour(186, 176, 110) * edge

    canvas.clip = (0.0, 0.6, 1.0, 1.0)
    canvas.fill((0.0, 0.6, 1.0, 1.0), blades)
    trunk_band = (EDGE, 0.4 - EDGE)
    limb_band = (0.4 + EDGE, 0.6 - EDGE)
    blade_rects = [(index * 0.25 + EDGE, 0.6 + EDGE, (index + 1) * 0.25 - EDGE, 1.0 - EDGE) for index in range(4)]
    rng = np.random.default_rng(47)
    mesh = Mesh("quiver")

    def rosette(tip, axis):
        count = 13
        for index in range(count):
            share = (index + 0.5) / count
            spoke = rotate(perpendicular(axis), axis, index * 2.399963 + rng.uniform(-0.2, 0.2))
            direction = rotate(axis, spoke, 0.2 + 1.15 * share)
            length = (0.2 - 0.05 * share) * rng.uniform(0.85, 1.15)
            spine = grow(rng, tip + direction * 0.008, direction, length, 2, pull=axis, pull_strength=0.4)
            width = 0.02 * rng.uniform(0.85, 1.15)
            mesh.strip("tree", spine, unit(np.cross(direction, axis)), [width, width * 0.8, width * 0.06], blade_rects[int(rng.integers(4))], fold=0.4, columns=2)

    def limb(origin, direction, length, radius, level):
        points = grow(rng, origin, direction, length, 3, pull=UP, pull_strength=0.4, wander=0.05)
        mesh.tube("tree", points, np.linspace(radius, radius * 0.74, 4), 7 if level < 3 else 6, limb_band)
        heading = unit(points[-1] - points[-2])
        if level == 4:
            rosette(points[-1], heading)
            return
        hinge = random_perpendicular(rng, heading)
        spread = rng.uniform(0.45, 0.68)
        children = 3 if level == 1 and rng.random() < 0.5 else 2
        for child in range(children):
            turn = rotate(rotate(heading, hinge, spread), heading, math.tau * child / children)
            limb(points[-1], turn, length * rng.uniform(0.74, 0.9), radius * 0.74, level + 1)

    trunk = grow(rng, (0.0, 0.0, 0.0), UP, 0.85, 6, wander=0.025)
    mesh.tube("tree", trunk, [0.125, 0.112, 0.102, 0.096, 0.09, 0.086, 0.084], 10, trunk_band)
    top = unit(trunk[-1] - trunk[-2])
    hinge = random_perpendicular(rng, top)
    for child in range(3):
        turn = rotate(rotate(top, hinge, 0.6), top, math.tau * child / 3 + rng.uniform(-0.2, 0.2))
        limb(trunk[-1] - top * 0.03, turn, 0.3, 0.06, 1)
    return plan([mesh], canvas, 2.1, set())


BUILDERS = {
    "shrub": shrub,
    "shrub-wide": shrub_wide,
    "bush": bush,
    "bush-small": bush_small,
    "scrub": scrub,
    "fern": fern,
    "calathea": calathea,
    "pachira": pachira,
    "quiver": quiver,
}
