import math
from dataclasses import dataclass


@dataclass
class Station:
    center: tuple
    half_width: float = 0.0
    front: float = 0.0
    back: float = 0.0
    weights: dict = None
    material: str = ""
    sharp: bool = False
    reshape: object = None


def bent(value, squareness):
    return math.copysign(abs(value) ** squareness, value)


def mirrored_name(name):
    if name.endswith("L"):
        return name[:-1] + "R"
    if name.endswith("R"):
        return name[:-1] + "L"
    return name


class Shell:
    def __init__(self):
        self.points = []
        self.weights = []
        self.faces = []
        self.materials = []
        self.sharp = []

    def add_point(self, point, weights):
        self.points.append(tuple(point))
        self.weights.append(dict(weights))
        return len(self.points) - 1

    def loft(self, stations, sides, across=(1, 0, 0), depth=(0, 1, 0), squareness=1.0):
        rings = []
        for station in stations:
            if station.half_width <= 0:
                point = station.center
                if station.reshape:
                    point = station.reshape(0.0, point)
                rings.append([self.add_point(point, station.weights)])
                continue
            ring = []
            for side in range(sides):
                angle = -math.pi / 2 + 2 * math.pi * side / sides
                wide = bent(math.cos(angle), squareness)
                deep = bent(math.sin(angle), squareness)
                reach = station.front if deep < 0 else station.back
                point = tuple(
                    station.center[axis]
                    + across[axis] * station.half_width * wide
                    + depth[axis] * reach * deep
                    for axis in range(3)
                )
                if station.reshape:
                    point = station.reshape(angle, point)
                ring.append(self.add_point(point, station.weights))
            if station.sharp:
                for side in range(sides):
                    self.sharp.append((ring[side], ring[(side + 1) % sides]))
            rings.append(ring)
        for station, lower, upper in zip(stations, rings, rings[1:]):
            if len(lower) == 1 and len(upper) == 1:
                continue
            for side in range(sides):
                following = (side + 1) % sides
                if len(lower) == 1:
                    face = (lower[0], upper[side], upper[following])
                elif len(upper) == 1:
                    face = (lower[side], lower[following], upper[0])
                else:
                    face = (lower[side], lower[following], upper[following], upper[side])
                self.faces.append(face)
                self.materials.append(station.material)

    def absorb(self, other, place=None, mirrored=False):
        offset = len(self.points)
        for point, weights in zip(other.points, other.weights):
            if place:
                point = place(point)
            if mirrored:
                point = (-point[0], point[1], point[2])
                weights = {mirrored_name(name): value for name, value in weights.items()}
            self.add_point(point, weights)
        for face, material in zip(other.faces, other.materials):
            moved = tuple(index + offset for index in face)
            self.faces.append(moved[::-1] if mirrored else moved)
            self.materials.append(material)
        for first, second in other.sharp:
            self.sharp.append((first + offset, second + offset))

    def scale(self, factor):
        self.points = [tuple(value * factor for value in point) for point in self.points]
