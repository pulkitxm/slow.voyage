import numpy as np

import growth

LEAF_CORNERS = len(growth.LEAF_OUTLINE)
CORNER_SHADE = np.array([0.74, 0.92, 1.06, 1.12, 1.0, 0.86])


def fit(parts, top, half_width):
    stacked = np.concatenate([part for part in parts if len(part)])
    spread = np.abs(stacked[:, 0]).max()
    height = stacked[:, 2].max()
    scale = np.array([half_width / spread, half_width / spread, top / height])
    return [part * scale for part in parts]


def dress(rng, corners, greens, depth_shade):
    count = len(corners) // LEAF_CORNERS
    middles = corners.reshape(count, LEAF_CORNERS, 3).mean(axis=1)
    low = middles.min(axis=0)
    high = middles.max(axis=0)
    centre = (low + high) / 2
    centre[2] = low[2] + (high[2] - low[2]) * 0.4
    relative = (middles - centre) / np.maximum((high - low) / 2, 1e-6)
    depth = np.clip(np.linalg.norm(relative, axis=1), 0, 1)
    patch = 0.5 + 0.5 * np.sin(middles[:, 0] * 23.0 + middles[:, 2] * 17.0) * np.cos(
        middles[:, 1] * 19.0 - middles[:, 2] * 11.0
    )
    blend = np.clip(patch * 0.6 + rng.random(count) * 0.6 - 0.1, 0, 1)[:, None]
    colour = np.asarray(greens[0]) * (1 - blend) + np.asarray(greens[1]) * blend
    canopy_light = 0.74 + 0.26 * np.clip(relative[:, 2] * 0.5 + 0.5, 0, 1)
    shade = (
        (depth_shade + (1 - depth_shade) * depth**1.6)
        * canopy_light
        * (0.8 + rng.random(count) * 0.4)
    )
    tint = colour[:, None, :] * shade[:, None, None] * CORNER_SHADE[None, :, None]
    facing = growth.unit(growth.unit(relative) + rng.normal(size=(count, 3)) * 0.35)
    return tint.reshape(-1, 3), np.repeat(facing, LEAF_CORNERS, axis=0)


def broadleaf(spec):
    rng = np.random.default_rng(spec["seed"])
    skeleton = growth.Skeleton()
    step = spec["step"]
    for base, direction, length in spec["stems"]:
        growth.stem(skeleton, rng, base, direction, length, step, spec.get("wander", 0.05))
    trunk_nodes = len(skeleton.points)
    attractors = growth.crown_attractors(rng, spec["attractors"], spec["lobes"])
    growth.colonise(
        skeleton,
        rng,
        attractors,
        step,
        spec["influence"],
        spec["kill"],
        spec.get("lift", 0.08),
        spec.get("rounds", 220),
    )
    origin = spec["lobes"][0]["centre"]
    growth.twigs(skeleton, rng, spec["twigs"], spec["twig_length"], step * 0.6, 0.55, origin)
    points, parents = skeleton.arrays()
    points = growth.relax(points, parents, 3, trunk_nodes // 2)
    radii, children = growth.thickness(
        parents, spec["tip"], spec.get("exponent", 2.4), spec.get("taper", 1.012), spec["girth"]
    )
    chain_list = growth.chains(parents, children, radii)
    ends = np.array([not kids for kids in children])
    bark, faces = growth.tube_mesh(
        points, np.where(ends, radii * 0.45, radii), chain_list, np.asarray(spec["flare"])
    )
    anchors, along = growth.foliage_sites(
        rng, points, parents, radii, spec["leaf_limit"], spec["leaves"], spec["scatter"]
    )
    outward = growth.unit(anchors - np.asarray(origin))
    headings = growth.unit(
        along * 0.5 + outward * 0.45 + growth.random_units(rng, len(anchors)) * 0.8
    )
    lengths = spec["leaf"] * (0.7 + rng.random(len(anchors)) * 0.6)
    corners = growth.leaf_blades(rng, anchors, headings, lengths, spec["slim"], spec["droop"])
    bark, corners = fit([bark, corners], spec["top"], spec["half_width"])
    tint, facing = dress(rng, corners, spec["greens"], spec.get("depth_shade", 0.5))
    return {"bark": bark, "faces": faces, "leaves": corners, "tint": tint, "facing": facing}


def conifer(spec):
    rng = np.random.default_rng(spec["seed"])
    skeleton = growth.Skeleton()
    growth.stem(
        skeleton, rng, (0.0, 0.0, -0.03), (0.0, 0.0, 1.0), 1.03, spec["step"], 0.012
    )
    trunk = np.array(skeleton.points)
    trunk_nodes = len(trunk)
    levels = spec["whorls"]
    for whorl in range(levels):
        rise = (whorl + rng.random() * 0.5) / levels
        height = spec["skirt"] + (0.985 - spec["skirt"]) * rise**0.9
        reach = spec["reach"] * (1 - rise) ** 0.85 * (0.9 + rng.random() * 0.2) + 0.012
        boughs = max(3, int(round(spec["boughs"] * (1 - rise * 0.5))))
        turn = rng.random() * np.pi * 2
        for bough in range(boughs):
            angle = turn + bough * np.pi * 2 / boughs + rng.normal() * 0.18
            node = int(np.argmin(np.abs(trunk[:, 2] - height - rng.normal() * 0.012)))
            outward = np.array([np.cos(angle), np.sin(angle), 0.0])
            sideways = np.array([-np.sin(angle), np.cos(angle), 0.0])
            length = reach * (0.78 + rng.random() * 0.34)
            segments = max(3, int(round(length / spec["step"])))
            position = trunk[node].copy()
            previous = node
            sag = spec["sag"] * (1 - rise * 0.7)
            for segment in range(segments):
                along = (segment + 1) / segments
                slope = 0.45 * rise - sag * (0.2 + along * 0.9) + 0.7 * along**5
                heading = growth.unit(outward + np.array([0.0, 0.0, slope]))
                position = position + heading * (length / segments)
                previous = skeleton.add(position, previous)
                spray = length * 0.42 * (1 - along) ** 0.7 + 0.012
                for side in (-1, 1):
                    if along < 0.12:
                        continue
                    twig_heading = growth.unit(
                        sideways * side * 0.8 + outward * 0.75 + np.array([0.0, 0.0, -0.18])
                    )
                    growth.stem(
                        skeleton,
                        rng,
                        position,
                        twig_heading,
                        spray * (0.7 + rng.random() * 0.5),
                        spec["step"] * 0.7,
                        0.1,
                        parent=previous,
                    )
    points, parents = skeleton.arrays()
    radii, children = growth.thickness(parents, spec["tip"], 2.6, 1.004, spec["girth"])
    radii[:trunk_nodes] = np.maximum(
        radii[:trunk_nodes], spec["girth"] * (1.02 - np.clip(trunk[:, 2], 0, 1)) ** 1.1
    )
    chain_list = growth.chains(parents, children, radii)
    bark, faces = growth.tube_mesh(points, radii, chain_list, np.asarray(spec["flare"]))
    anchors, along = growth.foliage_sites(
        rng, points, parents, radii, spec["leaf_limit"], spec["leaves"], spec["scatter"]
    )
    headings = growth.unit(along * 0.9 + growth.random_units(rng, len(anchors)) * 0.75)
    lengths = spec["leaf"] * (0.7 + rng.random(len(anchors)) * 0.6)
    corners = growth.leaf_blades(rng, anchors, headings, lengths, spec["slim"], spec["droop"])
    bark, corners = fit([bark, corners], spec["top"], spec["half_width"])
    tint, facing = dress(rng, corners, spec["greens"], spec.get("depth_shade", 0.45))
    return {"bark": bark, "faces": faces, "leaves": corners, "tint": tint, "facing": facing}
