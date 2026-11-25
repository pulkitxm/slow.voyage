import numpy as np


def unit(vectors):
    lengths = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.maximum(lengths, 1e-9)


def random_units(rng, count):
    return unit(rng.normal(size=(count, 3)))


class Skeleton:
    def __init__(self):
        self.points = []
        self.parents = []

    def add(self, point, parent):
        self.points.append(np.asarray(point, dtype=np.float64))
        self.parents.append(parent)
        return len(self.points) - 1

    def arrays(self):
        return np.array(self.points), np.array(self.parents, dtype=np.int64)


def stem(skeleton, rng, start, direction, length, step, wander, parent=-1):
    heading = unit(np.asarray(direction, dtype=np.float64))
    position = np.asarray(start, dtype=np.float64)
    node = skeleton.add(position, parent) if parent < 0 else parent
    for _ in range(max(1, int(round(length / step)))):
        heading = unit(heading + rng.normal(size=3) * wander)
        position = position + heading * step
        node = skeleton.add(position, node)
    return node


def crown_attractors(rng, count, lobes):
    weights = np.array([lobe["weight"] for lobe in lobes], dtype=np.float64)
    picks = rng.choice(len(lobes), size=count, p=weights / weights.sum())
    points = np.empty((count, 3))
    for index, lobe in enumerate(lobes):
        chosen = np.where(picks == index)[0]
        directions = random_units(rng, len(chosen))
        radius = rng.random(len(chosen)) ** lobe.get("shell", 0.45)
        local = directions * radius[:, None]
        floor = lobe.get("floor", -1.0)
        low = local[:, 2] < floor
        local[low, 2] = floor + (floor - local[low, 2]) * 0.3
        points[chosen] = np.asarray(lobe["centre"]) + local * np.asarray(lobe["radii"])
    return points


def colonise(skeleton, rng, attractors, step, influence, kill, lift, rounds):
    remaining = attractors.copy()
    taken = set()
    for _ in range(rounds):
        if len(remaining) == 0:
            break
        points = np.array(skeleton.points)
        offsets = remaining[:, None, :] - points[None, :, :]
        distances = np.linalg.norm(offsets, axis=2)
        nearest = distances.argmin(axis=1)
        reach = distances[np.arange(len(remaining)), nearest]
        active = reach < influence
        if not active.any():
            break
        pulls = unit(offsets[np.arange(len(remaining)), nearest])
        grown = False
        for node in np.unique(nearest[active]):
            heading = pulls[active & (nearest == node)].sum(axis=0)
            heading = unit(unit(heading) + np.array([0.0, 0.0, lift]) + rng.normal(size=3) * 0.12)
            sprout = points[node] + heading * step
            key = (int(node), tuple(np.round(sprout / (step * 0.5)).astype(int)))
            if key in taken:
                continue
            taken.add(key)
            skeleton.add(sprout, int(node))
            grown = True
        points = np.array(skeleton.points)
        closest = np.linalg.norm(remaining[:, None, :] - points[None, :, :], axis=2).min(axis=1)
        remaining = remaining[closest > kill]
        if not grown:
            break


def child_lists(parents):
    children = [[] for _ in parents]
    for node, parent in enumerate(parents):
        if parent >= 0:
            children[parent].append(node)
    return children


def twigs(skeleton, rng, count_range, length, step, spread, origin):
    points, parents = skeleton.arrays()
    children = child_lists(parents)
    tips = [node for node, kids in enumerate(children) if not kids and parents[node] >= 0]
    for node in tips:
        along = unit(points[node] - points[parents[node]])
        outward = unit(points[node] - np.asarray(origin))
        for _ in range(int(rng.integers(count_range[0], count_range[1] + 1))):
            heading = unit(along * 0.6 + outward * 0.5 + rng.normal(size=3) * spread)
            stem(
                skeleton,
                rng,
                points[node],
                heading,
                length * (0.6 + rng.random() * 0.8),
                step,
                0.22,
                parent=node,
            )


def relax(points, parents, passes, keep):
    children = child_lists(parents)
    smooth = points.copy()
    for _ in range(passes):
        target = smooth.copy()
        for node, kids in enumerate(children):
            if parents[node] < 0 or not kids or node < keep:
                continue
            around = smooth[kids].mean(axis=0)
            target[node] = smooth[node] * 0.5 + (smooth[parents[node]] + around) * 0.25
        smooth = target
    return smooth


def thickness(parents, tip, exponent, taper, base):
    children = child_lists(parents)
    radii = np.zeros(len(parents))
    for node in range(len(parents) - 1, -1, -1):
        kids = children[node]
        if not kids:
            radii[node] = tip
        else:
            radii[node] = (np.sum(radii[kids] ** exponent)) ** (1.0 / exponent) * taper
    roots = np.where(parents < 0)[0]
    widest = radii[roots].max()
    shaped = tip + (radii - tip) * ((base - tip) / max(widest - tip, 1e-9))
    return np.maximum(shaped, tip), children


def chains(parents, children, radii):
    order = []
    starts = [(int(root), -1) for root in np.where(parents < 0)[0]]
    while starts:
        node, anchor = starts.pop()
        path = [anchor] if anchor >= 0 else []
        while True:
            path.append(node)
            kids = children[node]
            if not kids:
                break
            main = max(kids, key=lambda kid: radii[kid])
            for kid in kids:
                if kid != main:
                    starts.append((kid, node))
            node = main
        if len(path) > 1:
            order.append((path, anchor >= 0))
    return order


def tube_mesh(points, radii, chain_list, flare):
    vertices = []
    faces = []
    offset = 0
    for path, branched in chain_list:
        centres = points[path]
        widths = radii[path].copy()
        if branched:
            widths[0] = widths[1]
        else:
            widths[: len(flare)] *= flare[: len(widths)]
        sides = 10 if widths.max() > 0.012 else 6 if widths.max() > 0.004 else 4
        tangents = np.gradient(centres, axis=0)
        tangents = unit(tangents)
        reference = np.where(
            np.abs(tangents[:, 2:3]) > 0.9, np.array([[1.0, 0.0, 0.0]]), np.array([[0.0, 0.0, 1.0]])
        )
        first = unit(np.cross(tangents, reference))
        second = np.cross(tangents, first)
        angles = np.linspace(0, np.pi * 2, sides, endpoint=False)
        ring = (
            centres[:, None, :]
            + first[:, None, :] * (np.cos(angles)[None, :, None] * widths[:, None, None])
            + second[:, None, :] * (np.sin(angles)[None, :, None] * widths[:, None, None])
        )
        vertices.append(ring.reshape(-1, 3))
        for level in range(len(path) - 1):
            for side in range(sides):
                following = (side + 1) % sides
                faces.append(
                    (
                        offset + level * sides + side,
                        offset + level * sides + following,
                        offset + (level + 1) * sides + following,
                        offset + (level + 1) * sides + side,
                    )
                )
        tip = offset + (len(path) - 1) * sides
        faces.append(tuple(range(tip, tip + sides)))
        offset += len(path) * sides
    return np.concatenate(vertices), faces


LEAF_OUTLINE = np.array(
    [[0.0, 0.0], [0.28, 0.5], [0.68, 0.4], [1.0, 0.0], [0.68, -0.4], [0.28, -0.5]]
)


def leaf_blades(rng, anchors, headings, lengths, slimness, droop):
    count = len(anchors)
    along = unit(headings + np.array([0.0, 0.0, -droop]))
    across = unit(np.cross(along, random_units(rng, count)))
    outline = LEAF_OUTLINE[None, :, :] * lengths[:, None, None]
    corners = (
        anchors[:, None, :]
        + along[:, None, :] * outline[:, :, 0:1]
        + across[:, None, :] * outline[:, :, 1:2] * slimness
    )
    return corners.reshape(-1, 3)


def foliage_sites(rng, points, parents, radii, limit, per_node, scatter):
    bearing = np.where((radii <= limit) & (parents >= 0))[0]
    nodes = np.repeat(bearing, per_node)
    back = points[parents[nodes]]
    blend = rng.random(len(nodes))[:, None]
    anchors = points[nodes] * blend + back * (1 - blend)
    anchors = anchors + rng.normal(size=anchors.shape) * scatter
    along = unit(points[nodes] - back)
    return anchors, along
