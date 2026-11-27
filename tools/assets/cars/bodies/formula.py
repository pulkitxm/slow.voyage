import math

from mathutils import Matrix, Vector

from carkit import LEFT, Model, bar, box, cylinder, lathe, subtract, wheel_meshes
from kit import airfoil, loft, superellipse
from sheets import Sheet


class Formula:
    def __init__(self, name, **look):
        sheet = Sheet(name)
        self.sheet = sheet
        self.model = Model(name)
        self.axle = sheet.axle
        self.nose_x = sheet.nose
        self.stern_x = sheet.stern
        self.tracks = (sheet.track_front, sheet.track_rear)
        style = {"spokes": 7, "root": 0.03, "tip": 0.026, "thick": 0.022, "lean": 0.004, "hub": 0.05, "dish": 0.06, "metal": "rim_dark", "barrel": "rim_dark", "lip": "rim_dark", "cap": "chrome", "nuts": 0, "grooves": 4, "groove_depth": 0.006}
        style.update(look)
        self.front_wheel = dict(style, radius=sheet.tyre_front["radius"], width=sheet.tyre_front["width"], rim=sheet.tyre_front["rim"] + 0.012)
        self.rear_wheel = dict(style, radius=sheet.tyre_rear["radius"], width=sheet.tyre_rear["width"], rim=sheet.tyre_rear["rim"] + 0.012)

    def add(self, part, group="Body", both=False):
        self.model.absorb(part, group, both=both)

    def skin(self, sections, material="body", power=2.6, count=18, offset=0.0, both=False, caps=True):
        rings = [superellipse((x, offset, z), half, tall, power=power, count=count) for x, z, half, tall in sections]
        self.add(loft(rings, material, caps=caps), both=both)

    def tub(self, sections, cockpit, material="body", power=2.8):
        rings = [superellipse((x, 0, z), half, tall, power=power, count=20) for x, z, half, tall in sections]
        front, back, half, floor, top = cockpit
        cutter = box(((front + back) / 2, 0, (floor + top) / 2), (front - back, half * 2, top - floor), "interior", bevel=0.05)
        self.add(subtract(loft(rings, material), [cutter]))

    def plane(self, x, z, span, chord, angle, thickness=0.03, material="body", inner=0.0, gurney=0.0):
        if inner:
            stations = [(inner, span / 2)]
        else:
            stations = [(-span / 2, span / 2)]
        for low, high in stations:
            cuts = [low + (high - low) * i / 4 for i in range(5)]
            part = loft([airfoil(x, z, chord, thickness, angle, y) for y in cuts], material)
            self.add(part, both=bool(inner))
        if gurney:
            lean = math.radians(angle)
            self.add(box((x - chord / 2 * math.cos(lean), 0, z + chord / 2 * math.sin(lean) + gurney / 2), (0.006, span, gurney), "carbon"))

    def plate(self, x, y, z, length, height, material="body", thickness=0.012, yaw=0.0, both=True):
        rotation = Matrix.Rotation(math.radians(yaw), 3, "Z") if yaw else None
        self.add(box((x, y, z), (length, thickness, height), material, rotation=rotation, bevel=0.003), both=both)

    def arm(self, start, end, width=0.045, thickness=0.012, material="carbon"):
        self.add(bar(Vector(start), Vector(end), width, thickness, material, up=Vector((0, 0, 1))), both=True)

    def wishbones(self, front, inner_y, inner_z, spread=0.24, reach=0.06):
        sign = 1 if front else -1
        spec = self.front_wheel if front else self.rear_wheel
        x = sign * self.axle
        track = self.tracks[0] if front else self.tracks[1]
        hub_y = track / 2 - spec["width"] / 2 - 0.01
        hub = spec["radius"]
        for level, height in ((inner_z[1], hub + 0.11), (inner_z[0], hub - 0.13)):
            for shift in (spread, -spread * 0.9):
                self.arm((x + shift, inner_y, level), (x + shift * 0.08, hub_y, height))
        self.arm((x + spread * 0.2, inner_y * 0.9, inner_z[1] + 0.02), (x, hub_y - reach, hub - 0.1), width=0.03)
        self.add(cylinder((x, hub_y - 0.1, hub), (x, track / 2, hub), 0.03, "steel", segments=8), both=True)

    def helmet(self, x, z, radius=0.125, material="livery", visor="trim_black"):
        profile = [(radius * math.sin(math.pi * i / 8), -radius * math.cos(math.pi * i / 8)) for i in range(9)]
        self.add(lathe(profile, material, origin=(x, 0, z), axis=(0, 0, 1), segments=14, loop=False))
        self.add(box((x + radius * 0.72, 0, z + radius * 0.12), (radius * 0.6, radius * 1.5, radius * 0.42), visor, bevel=radius * 0.15))

    def mirrors(self, x, y, z, material="body"):
        self.add(box((x, y, z), (0.05, 0.11, 0.06), material, bevel=0.012), both=True)
        self.add(box((x - 0.027, y, z), (0.004, 0.09, 0.045), "mirror"), both=True)
        self.add(bar(Vector((x, y - 0.1, z - 0.06)), Vector((x, y - 0.03, z - 0.01)), 0.02, 0.012, "carbon", up=Vector((1, 0, 0))), both=True)

    def finish(self, paint):
        front_left, front_right = wheel_meshes(self.front_wheel, "front_wheel")
        rear_left, rear_right = wheel_meshes(self.rear_wheel, "rear_wheel")
        front, rear = self.tracks[0] / 2, self.tracks[1] / 2
        self.model.wheels = [
            ("Wheel_FL", (self.axle, front, self.front_wheel["radius"]), front_left),
            ("Wheel_FR", (self.axle, -front, self.front_wheel["radius"]), front_right),
            ("Wheel_RL", (-self.axle, rear, self.rear_wheel["radius"]), rear_left),
            ("Wheel_RR", (-self.axle, -rear, self.rear_wheel["radius"]), rear_right),
        ]
        return self, paint


def grand_prix(
    name,
    paint,
    nose_tip=0.3,
    nose_droop=0.0,
    nose_width=0.055,
    wing="body",
    plates="livery",
    cover="body",
    pods="body",
    accent="livery",
    airbox=(0.09, 0.16),
    pod_inlet=0.56,
    pod_height=0.22,
    chimney=True,
    flicks=True,
    helmet="livery",
    wheels=None,
    horns=False,
    cover_stripe=None,
):
    car = Formula(name, **(wheels or {}))
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    height = car.sheet.height
    tip = nose - 0.09
    car.tub(
        [
            (tip, nose_tip, nose_width, 0.035),
            (tip - 0.3, nose_tip + 0.035 + nose_droop, 0.1, 0.07),
            (axle + 0.4, 0.395 + nose_droop * 0.6, 0.15, 0.115),
            (axle, 0.43, 0.2, 0.15),
            (axle - 0.42, 0.4, 0.26, 0.2),
            (axle - 0.72, 0.34, 0.3, 0.28),
            (0.3, 0.34, 0.31, 0.29),
            (-0.1, 0.35, 0.3, 0.3),
            (-0.6, 0.3, 0.29, 0.26),
            (-axle + 0.42, 0.27, 0.21, 0.21),
            (-axle - 0.05, 0.25, 0.12, 0.15),
            (-axle - 0.25, 0.25, 0.07, 0.1),
        ],
        (axle - 0.72, 0.0, 0.2, 0.36, 0.9),
    )
    car.skin(
        [
            (0.0, height - 0.17, airbox[0], airbox[1]),
            (-0.3, height - 0.24, 0.12, 0.235),
            (-0.8, 0.56, 0.13, 0.25),
            (-axle + 0.25, 0.41, 0.1, 0.18),
            (-axle - 0.12, 0.33, 0.055, 0.1),
        ],
        cover,
        power=2.2,
    )
    car.add(box((0.012, 0, height - 0.17), (0.02, airbox[0] * 1.5, airbox[1] * 1.5), "grille", bevel=0.02))
    if horns:
        car.add(loft([airfoil(-0.16, height - 0.3 + 0.07 * n, 0.14, 0.012, 4, 0.1 + 0.11 * n) for n in range(3)], accent), both=True)
    if cover_stripe:
        car.add(box((-0.8, 0, 0.64), (0.95, 0.02, 0.2), cover_stripe, rotation=Matrix.Rotation(math.radians(-17), 3, "Y")))
    car.skin(
        [
            (pod_inlet, 0.34, 0.19, pod_height - 0.02),
            (pod_inlet - 0.45, 0.33, 0.21, pod_height),
            (-0.5, 0.28, 0.2, 0.2),
            (-1.0, 0.22, 0.14, 0.14),
            (-axle + 0.17, 0.17, 0.08, 0.08),
        ],
        pods,
        power=4.0,
        offset=0.5,
        both=True,
    )
    car.add(box((pod_inlet + 0.006, 0.5, 0.34), (0.02, 0.3, pod_height * 1.5), "grille", bevel=0.03), both=True)
    if chimney:
        car.add(box((-0.72, 0.53, 0.56), (0.2, 0.07, 0.16), pods, bevel=0.025, taper=0.8), both=True)
    if flicks:
        car.add(loft([airfoil(-1.02, 0.5, 0.2, 0.012, 16, y) for y in (0.42, 0.55, 0.68)], accent), both=True)
        car.plate(-1.02, 0.685, 0.5, 0.22, 0.12, accent)
    car.add(box((-0.3, 0, 0.045), (axle * 2 - 0.5, 1.38, 0.03), "carbon"))
    car.add(box((0.0, 0, 0.022), (axle * 2 - 0.3, 0.3, 0.02), "interior"))
    for n in range(5):
        car.add(box((-axle - 0.15, -0.44 + 0.22 * n, 0.14), (0.42, 0.01, 0.2), "carbon"))
    car.add(box((-axle - 0.14, 0, 0.24), (0.4, 0.92, 0.012), "carbon", rotation=Matrix.Rotation(math.radians(-14), 3, "Y")))

    front_x = nose - 0.2
    car.plane(front_x, 0.14, 1.36, 0.36, 5, thickness=0.035, material=wing)
    car.plane(front_x - 0.16, 0.215, 1.36, 0.2, 20, thickness=0.02, material=wing, inner=0.14)
    car.plate(front_x - 0.03, 0.686, 0.2, 0.5, 0.22, plates)
    car.add(box((front_x - 0.03, 0.686, 0.085), (0.5, 0.06, 0.012), plates), both=True)
    for side in (1, -1):
        car.add(bar(Vector((front_x + 0.02, side * 0.09, 0.16)), Vector((tip - 0.2, side * 0.06, nose_tip + nose_droop)), 0.16, 0.012, wing, up=LEFT))

    rear_x = stern + 0.19
    car.plane(rear_x + 0.02, height - 0.115, 0.98, 0.3, 12, thickness=0.035, material=wing)
    car.plane(rear_x - 0.11, height - 0.045, 0.98, 0.15, 30, thickness=0.02, material=wing, gurney=0.012)
    car.plane(rear_x + 0.06, 0.37, 0.98, 0.2, 8, thickness=0.025, material="carbon")
    car.plate(rear_x + 0.04, 0.496, 0.62, 0.46, 0.68, plates)
    car.add(box((stern + 0.03, 0, 0.3), (0.03, 0.07, 0.12), "lens_tail"), "Taillights")
    car.add(box((rear_x + 0.02, 0, 0.6), (0.1, 0.02, 0.5), "carbon"))

    car.plate(axle - 0.5, 0.36, 0.2, 0.5, 0.3, "carbon", yaw=6)
    car.plate(axle - 0.3, 0.24, 0.16, 0.3, 0.22, "carbon", yaw=4)
    car.wishbones(True, 0.19, (0.3, 0.52))
    car.wishbones(False, 0.12, (0.17, 0.4), spread=0.2)
    car.helmet(0.3, 0.7, material=helmet)
    car.mirrors(axle - 0.74, 0.38, 0.69)
    car.add(box((0.52, 0, 0.6), (0.06, 0.26, 0.02), "interior"))
    car.add(bar(Vector((0.3, 0, 0.86)), Vector((0.02, 0, height - 0.02)), 0.03, 0.02, "carbon", up=LEFT))
    return car.finish(paint)
