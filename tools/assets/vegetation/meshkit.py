import math

import numpy as np

UP = np.array([0.0, 0.0, 1.0])


def unit(vector):
    vector = np.asarray(vector, dtype=np.float64)
    length = np.linalg.norm(vector)
    return vector / length if length > 1e-12 else np.array([0.0, 0.0, 1.0])


def perpendicular(vector):
    vector = unit(vector)
    helper = np.array([1.0, 0.0, 0.0]) if abs(vector[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    return unit(np.cross(vector, helper))


def rotate(vector, axis, angle):
    axis = unit(axis)
    vector = np.asarray(vector, dtype=np.float64)
    return (
        vector * math.cos(angle)
        + np.cross(axis, vector) * math.sin(angle)
        + axis * np.dot(axis, vector) * (1 - math.cos(angle))
    )


def random_perpendicular(rng, vector):
    return rotate(perpendicular(vector), vector, rng.uniform(0, math.tau))


def spherical(azimuth, elevation):
    return np.array(
        [
            math.cos(azimuth) * math.cos(elevation),
            math.sin(azimuth) * math.cos(elevation),
            math.sin(elevation),
        ]
    )


def grow(rng, start, direction, length, steps, pull=UP, pull_strength=0.0, wander=0.0):
    points = [np.asarray(start, dtype=np.float64)]
    heading = unit(direction)
    stride = length / steps
    for _ in range(steps):
        points.append(points[-1] + heading * stride)
        drift = rng.normal(size=3) * wander if wander else 0.0
        heading = unit(heading + np.asarray(pull) * pull_strength / steps + drift)
    return np.array(points)


def tangents(points):
    result = np.gradient(points, axis=0)
    return np.array([unit(row) for row in result])


def along(points, fraction):
    position = fraction * (len(points) - 1)
    index = min(int(position), len(points) - 2)
    blend = position - index
    return points[index] * (1 - blend) + points[index + 1] * blend


def inset(rect, margin):
    return (rect[0] + margin, rect[1] + margin, rect[2] - margin, rect[3] - margin)


class Mesh:
    def __init__(self, name, location=(0.0, 0.0, 0.0)):
        self.name = name
        self.location = location
        self.parts = {}

    def part(self, name):
        return self.parts.setdefault(name, {"points": [], "coords": [], "faces": []})

    def triangles(self):
        return sum(len(face) - 2 for part in self.parts.values() for face in part["faces"])

    def tube(self, name, points, radii, sides, band, closed_tip=True, wrap=(0.0, 1.0)):
        part = self.part(name)
        points = np.asarray(points, dtype=np.float64)
        headings = tangents(points)
        side = perpendicular(headings[0])
        first = len(part["points"])
        for index, (centre, heading, radius) in enumerate(zip(points, headings, radii)):
            side = unit(side - heading * np.dot(side, heading))
            other = np.cross(heading, side)
            for step in range(sides + 1):
                angle = math.tau * step / sides
                part["points"].append(centre + radius * (math.cos(angle) * side + math.sin(angle) * other))
                part["coords"].append((wrap[0] + (wrap[1] - wrap[0]) * step / sides, band[index % 2]))
        for index in range(len(points) - 1):
            for step in range(sides):
                a = first + index * (sides + 1) + step
                b = a + sides + 1
                part["faces"].append((a, a + 1, b + 1, b))
        if closed_tip:
            tip = len(part["points"])
            part["points"].append(points[-1] + headings[-1] * radii[-1] * 0.6)
            part["coords"].append(((wrap[0] + wrap[1]) / 2, band[len(points) % 2]))
            last = first + (len(points) - 1) * (sides + 1)
            for step in range(sides):
                part["faces"].append((last + step, last + step + 1, tip))

    def strip(self, name, spine, lateral, half_widths, rect, fold=0.0, columns=1):
        part = self.part(name)
        spine = np.asarray(spine, dtype=np.float64)
        headings = tangents(spine)
        first = len(part["points"])
        rows = len(spine)
        u0, v0, u1, v1 = rect
        for index in range(rows):
            heading = headings[index]
            across = unit(lateral - heading * np.dot(lateral, heading))
            normal = np.cross(across, heading)
            width = half_widths[index]
            v = v0 + (v1 - v0) * index / (rows - 1)
            for column in range(columns + 1):
                offset = column / columns * 2 - 1
                lift = fold * width * abs(offset)
                part["points"].append(spine[index] + across * width * offset + normal * lift)
                part["coords"].append((u0 + (u1 - u0) * column / columns, v))
        for index in range(rows - 1):
            for column in range(columns):
                a = first + index * (columns + 1) + column
                b = a + columns + 1
                part["faces"].append((a, a + 1, b + 1, b))

    def card(self, name, rng, base, direction, length, width, rect, roll=0.0, droop=0.3, rows=2, fold=0.0, columns=1):
        direction = unit(direction)
        spine = grow(rng, base, direction, length, rows, pull=-UP, pull_strength=droop)
        flat = np.cross(direction, UP)
        lateral = unit(flat) if np.linalg.norm(flat) > 0.05 else perpendicular(direction)
        lateral = rotate(lateral, direction, roll)
        self.strip(name, spine, lateral, [width / 2] * (rows + 1), rect, fold, columns)

    def fan(self, name, centre, normal, radius, rect, segments, droop, cup=0.0, spin=0.0):
        part = self.part(name)
        normal = unit(normal)
        side = rotate(perpendicular(normal), normal, spin)
        other = np.cross(normal, side)
        first = len(part["points"])
        middle_u = (rect[0] + rect[2]) / 2
        middle_v = (rect[1] + rect[3]) / 2
        half_u = (rect[2] - rect[0]) / 2
        half_v = (rect[3] - rect[1]) / 2
        part["points"].append(np.asarray(centre, dtype=np.float64))
        part["coords"].append((middle_u, middle_v))
        for ring, (reach, sag) in enumerate(((0.5, cup), (1.0, -droop))):
            for step in range(segments):
                angle = math.tau * step / segments
                spoke = math.cos(angle) * side + math.sin(angle) * other
                point = centre + spoke * radius * reach + normal * radius * sag - UP * radius * droop * 0.5 * ring
                part["points"].append(point)
                part["coords"].append((middle_u + half_u * reach * math.cos(angle), middle_v + half_v * reach * math.sin(angle)))
        for step in range(segments):
            following = (step + 1) % segments
            inner = first + 1
            outer = first + 1 + segments
            part["faces"].append((first, inner + step, inner + following))
            part["faces"].append((inner + step, outer + step, outer + following, inner + following))
