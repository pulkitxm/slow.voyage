import math

import kit
from carkit import LEFT, bar, box, cylinder, lathe, prism, sweep
from kit import Coach, clip, ellipse, grow, loft
from mathutils import Vector


def quad(a0, a1, b0, b1):
    return [(a0, b0), (a1, b0), (a1, b1), (a0, b1)]


def span(half_low, half_high, low, high):
    return [(-half_low, low), (half_low, low), (half_high, high), (-half_high, high)]


def oval(car, caster, a, b, size=0.065, lift=0.006, upright=True):
    radii = (size, size * 0.42) if upright else (size * 0.42, size)
    car.patch(caster, ellipse((a, b), (radii[0] + 0.008, radii[1] + 0.008), 14), "chrome", lift=lift, thickness=0.004, mirror=False)
    car.patch(caster, ellipse((a, b), radii, 14), "livery_dark", lift=lift + 0.004, thickness=0.003, mirror=False)


def beam(car, anchor, pitch=0.0, yaw=0.0, rear=True):
    tilt, turn = math.radians(pitch), math.radians(yaw)
    heading = 1 if rear else -1
    direction = Vector((heading * math.cos(tilt) * math.cos(turn), -math.cos(tilt) * math.sin(turn), -math.sin(tilt)))
    right = Vector((-direction.y, direction.x, 0)).normalized()
    if right.y < 0:
        right = -right
    up = direction.cross(right)
    if up.z < 0:
        up = -up
    origin = Vector(anchor)

    def caster(a, b):
        return car.cast(origin + right * a + up * b - direction * 4, direction)

    return caster


def ring(car, caster, outline, width, material="chrome", lift=0.006, thickness=0.008, mirror=False):
    outer = grow(outline, width)
    count = len(outline)
    for i in range(count):
        j = (i + 1) % count
        car.patch(caster, [outline[i], outline[j], outer[j], outer[i]], material, lift=lift, thickness=thickness, mirror=mirror)


def rails(car, front, back, y, lift=0.045, material="steel"):
    count = 6
    feet = [car.top(front + (back - front) * n / count, y)[0] for n in range(count + 1)]
    path = [Vector((foot.x, y, foot.z + lift)) for foot in feet]
    path[0] = Vector((feet[0].x, y, feet[0].z - 0.005))
    path[-1] = Vector((feet[-1].x, y, feet[-1].z - 0.005))
    for a, b in zip(path, path[1:]):
        car.model.add(bar(a, b, 0.03, 0.022, material, up=Vector((0, 1, 0))))
    middle = count // 2
    car.model.add(bar(Vector((feet[middle].x, y, feet[middle].z - 0.005)), path[middle], 0.03, 0.03, material, up=Vector((0, 1, 0))))


def well(car, caster, low, half=0.26, tall=0.11, pad=0.035, depth=0.016):
    car.hollow(caster, quad(-half - pad, half + pad, low - pad * 0.7, low + tall + pad * 0.7), depth, material="body", mirror=False)
    car.patch(caster, quad(-half, half, low, low + tall), "plate", lift=-depth + 0.004, mirror=False)


def shuts(car, first, middle, last, gap=0.05, swing=0.07):
    low = lambda x: car.sill_at(x) + 0.012
    high = lambda x: car.shoulder_at(x) - 0.012
    hub = car.rear_wheel["radius"]
    reach = hub + gap + swing
    turn = math.acos(max(-1.0, min(1.0, (last + car.axle) / reach)))
    arc = [(-car.axle + reach * math.cos(turn * (1 - n / 8)), hub + reach * math.sin(turn * (1 - n / 8))) for n in range(9)]
    for x in [first] + ([middle] if middle is not None else []):
        car.stroke((x, low(x)), (x, high(x)), car.side)
    car.seam([(last, high(last))] + arc, car.side)
    car.stroke((first, low(first) + 0.002), (arc[-1][0], max(arc[-1][1], low(arc[-1][0]) + 0.002)), car.side, steps=12)


def post(car, base, rail, material="trim_black"):
    low = [(x, car.shoulder_at(x) + 0.04) for x in base]
    high = [(x, car.roof(x, 0.0) - 0.09) for x in rail]
    car.patch(car.side, [low[0], low[1], high[1], high[0]], material, lift=0.003)


def gate(car, half, low, high, top_half=None, caster=None):
    caster = caster or car.back
    top_half = half if top_half is None else top_half
    car.stroke((-half, low), (half, low), caster, steps=14, mirror=False)
    car.stroke((half, low), (top_half, high), caster, steps=8)


def crest(car, x, depth, reach, thickness=0.028, material="body", droop=0.012):
    sections = []
    for n in range(9):
        y = -reach / 2 + reach * n / 8
        z = car.roof(x, y) + 0.004
        sections.append([(x + 0.07, y, z - thickness), (x + 0.07, y, z), (x - depth, y, z - droop), (x - depth, y, z - droop - 0.014)])
    car.model.absorb(loft(sections, material, smooth=False))
    car.model.absorb(box((x - depth - 0.002, 0, car.roof(x, 0.0) - droop - 0.003), (0.008, 0.32, 0.012), "lens_tail"), "Taillights")


def wiper(car, z, length=0.3):
    hit, normal = car.tail(0.0, z)
    end = car.tail(length, z + 0.025)[0]
    lift = normal * 0.014
    car.model.absorb(bar(hit + lift, end + lift, 0.022, 0.012, "trim_black", up=normal))
    car.model.absorb(cylinder(hit, hit + normal * 0.02, 0.018, "trim_black", segments=8))


def focus_ecoboost():
    car = Coach("ford-focus-ecoboost", "star", twin=0.16)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.8), (-axle, 0.9), (-0.3, 0.912), (0.6, 0.905), (axle, 0.885), (nose - 0.28, 0.84), (nose, 0.72)],
        shoulder=[(stern, 1.02), (-1.6, 1.075), (-0.5, 1.005), (0.6, 0.955), (1.08, 0.935), (axle, 0.895), (nose - 0.3, 0.83), (nose - 0.1, 0.785), (nose, 0.755)],
        waist=[(stern, 0.62), (stern + 0.22, 0.9), (-axle, 0.875), (0.0, 0.8), (axle, 0.74), (nose - 0.3, 0.6), (nose, 0.52)],
        sill=[(stern, 0.42), (-1.72, 0.33), (1.72, 0.3), (nose, 0.36)],
        crown=[(stern, 0.0), (1.05, 0.03), (axle, 0.05), (nose, 0.03)],
        flare=(0.014, 0.016),
        keys=[nose - 0.44, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.15, 0.05, 0.015, 0.0, 0.04, 0.12), "bow": 0.16, "flat": 0.58, "power": 2.2},
        rear={"set": (0.1, 0.02, 0.0, 0.0, 0.09, 0.13), "bow": 0.085, "flat": 0.74, "power": 2.4},
        inset=0.05,
        shelf=0.035,
        flank=0.016,
        belly=0.008,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    opening = [(-0.33, 0.455), (0.33, 0.455), (0.47, 0.61), (0.44, 0.69), (-0.44, 0.69), (-0.47, 0.61)]
    grille = car.hollow(front, opening, 0.05, mirror=False)
    grille.bars(5, material="chrome", share=0.3, sink=0.3)
    low = car.hollow(front, span(0.46, 0.4, 0.225, 0.31), 0.04, mirror=False)
    low.bars(2, share=0.16)
    car.hollow(front, [(0.58, 0.29), (0.88, 0.33), (0.9, 0.43), (0.66, 0.44)], 0.04)
    car.disc(front, 0.75, 0.375, 0.032, "head", sink=0.035)
    car.headlamp(
        front,
        [(0.5, 0.6), (0.76, 0.585), (1.02, 0.63), (1.23, 0.755), (1.2, 0.795), (0.86, 0.752), (0.5, 0.708)],
        projectors=[(0.66, 0.652, 0.036), (0.83, 0.682, 0.032)],
        strips=[[(0.52, 0.607), (0.76, 0.593), (1.0, 0.636), (1.19, 0.75), (1.175, 0.758), (0.99, 0.652), (0.76, 0.609), (0.52, 0.622)]],
    )
    car.patch(front, quad(-0.26, 0.26, 0.335, 0.445), "plate", lift=0.006, mirror=False)

    well(car, back, 0.69)
    valance = car.hollow(back, span(0.6, 0.66, 0.3, 0.4), 0.03, mirror=False)
    valance.bars(2, share=0.14, sink=0.3)
    car.lamp(back, quad(0.72, 0.92, 0.45, 0.485), "red", lift=0.005, thickness=0.004)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.024, proud=0.007)
    ring(car, front, opening, 0.012, thickness=0.008)
    oval(car, car.nose, 0.0, 0.752, 0.05)

    car.taillamp(
        back,
        [(0.44, 0.915), (0.82, 0.9), (1.06, 0.9), (1.34, 0.95), (1.4, 1.02), (1.3, 1.035), (0.9, 1.005), (0.44, 1.0)],
        strips=[[(0.46, 0.957), (0.88, 0.96), (1.28, 0.985), (1.36, 1.015), (1.3, 1.022), (0.88, 0.99), (0.46, 0.985)]],
        clear=[[(0.48, 0.925), (0.76, 0.915), (0.76, 0.945), (0.48, 0.95)]],
    )
    oval(car, back, 0.0, 0.92, 0.055)
    shuts(car, 0.84, -0.34, -1.14, gap=0.045)
    car.bonnet(1.05, 0.72, front=nose - 0.2)
    gate(car, 0.74, 0.625, 0.89, top_half=0.72)
    pulls(car, [-0.2, -1.04])
    car.mirrors(0.74)

    glass = car.cabin(
        screen=(1.1, 0.2),
        back=(-1.72, -2.03),
        roof=[(-1.72, 1.4), (-1.3, 1.44), (-0.8, 1.471), (-0.3, 1.484), (0.0, 1.473), (0.2, 1.444)],
        windows=[((0.8, 0.1), (-0.32, -0.34)), ((-0.4, -0.42), (-1.16, -1.04)), ((-1.21, -1.09), (-1.58, -1.24))],
        base_inset=0.07,
        tumble=0.13,
        drop=0.05,
        bow=(0.15, 0.07),
        flat=(0.86, 0.8),
    )
    car.wipers(glass)
    post(car, (-0.32, -0.4), (-0.34, -0.42))
    crest(car, -1.7, 0.16, 1.02)
    wiper(car, 1.1)
    car.interior(seat=-0.02, rear_bench=-0.92)
    return car.finish("#4a4e53")


def focus_tdci():
    car = Coach("ford-focus-tdci", "seven")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.83), (-axle, 0.9), (-0.3, 0.92), (0.6, 0.915), (axle, 0.89), (nose - 0.28, 0.85), (nose, 0.75)],
        shoulder=[(stern, 1.005), (-1.5, 1.02), (-0.4, 0.985), (0.7, 0.955), (1.06, 0.94), (axle, 0.905), (nose - 0.3, 0.835), (nose - 0.1, 0.795), (nose, 0.77)],
        waist=[(stern, 0.6), (stern + 0.2, 0.8), (-axle, 0.8), (0.0, 0.76), (axle, 0.73), (nose - 0.3, 0.63), (nose, 0.53)],
        sill=[(stern, 0.43), (-1.72, 0.32), (1.72, 0.31), (nose, 0.37)],
        crown=[(stern, 0.0), (1.0, 0.03), (axle, 0.05), (nose, 0.035)],
        flare=(0.03, 0.03),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.22],
        front={"set": (0.15, 0.05, 0.012, 0.0, 0.045, 0.12), "bow": 0.15, "flat": 0.6, "power": 2.3},
        rear={"set": (0.1, 0.02, 0.0, 0.0, 0.06, 0.09), "bow": 0.06, "flat": 0.78, "power": 2.6},
        inset=0.045,
        shelf=0.035,
        flank=0.014,
        belly=0.008,
        sharp=(True, True, False, True, False),
    )
    front, back = car.front, car.back

    slot_shape = [(-0.34, 0.655), (0.34, 0.655), (0.38, 0.72), (-0.38, 0.72)]
    upper = car.hollow(front, slot_shape, 0.04, mirror=False)
    upper.bars(2, material="chrome", share=0.2, sink=0.3)
    mouth_shape = [(-0.38, 0.27), (0.38, 0.27), (0.52, 0.455), (-0.52, 0.455)]
    intake = car.hollow(front, mouth_shape, 0.05, mirror=False)
    intake.bars(3, share=0.18)
    car.hollow(front, ellipse((0.78, 0.37), (0.085, 0.065), 12), 0.035)
    car.disc(front, 0.78, 0.37, 0.048, "head", sink=0.03)
    car.headlamp(
        front,
        [(0.43, 0.625), (0.72, 0.605), (0.98, 0.635), (1.2, 0.745), (1.18, 0.805), (0.84, 0.782), (0.43, 0.74)],
        projectors=[(0.6, 0.68, 0.045), (0.79, 0.7, 0.038)],
        strips=[[(0.92, 0.66), (1.14, 0.745), (1.13, 0.785), (0.92, 0.75)]],
    )
    car.patch(front, quad(-0.26, 0.26, 0.485, 0.595), "plate", lift=0.006, mirror=False)

    well(car, back, 0.7)
    valance = car.hollow(back, span(0.58, 0.64, 0.3, 0.39), 0.03, mirror=False)
    valance.bars(1, share=0.2, sink=0.3)
    car.lamp(back, quad(0.68, 0.88, 0.44, 0.475), "red", lift=0.005, thickness=0.004)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.04, proud=0.012)
    ring(car, front, slot_shape, 0.012, thickness=0.008)
    oval(car, car.nose, 0.0, 0.775, 0.055)

    shuts(car, 0.8, -0.4, -1.2, gap=0.045)
    car.bonnet(1.04, 0.74, front=nose - 0.17)
    gate(car, 0.76, 0.605, 0.99, top_half=0.74)
    pulls(car, [-0.24, -1.1])
    car.mirrors(0.7)
    car.patch(car.side, quad(-1.02, 0.66, 0.5, 0.53), "trim_black", lift=0.004, thickness=0.01)

    glass = car.cabin(
        screen=(1.06, 0.26),
        back=(-1.52, -2.02),
        roof=[(-1.52, 1.44), (-1.0, 1.484), (-0.3, 1.497), (0.0, 1.488), (0.26, 1.452)],
        windows=[((0.78, 0.16), (-0.36, -0.38)), ((-0.44, -0.46), (-1.16, -1.1)), ((-1.24, -1.18), (-1.56, -1.36))],
        base_inset=0.07,
        tumble=0.13,
        drop=0.05,
        bow=(0.14, 0.06),
        flat=(0.86, 0.8),
    )
    car.wipers(glass)
    post(car, (-0.36, -0.44), (-0.38, -0.46))
    pillar = beam(car, (-1.88, 0.72, 1.2), pitch=24, yaw=42)
    car.taillamp(
        pillar,
        [(-0.1, -0.18), (0.09, -0.18), (0.11, 0.04), (0.07, 0.22), (-0.03, 0.22), (-0.1, 0.02)],
        clear=[[(-0.07, -0.16), (0.07, -0.16), (0.07, -0.09), (-0.07, -0.09)]],
    )
    oval(car, back, 0.0, 0.9, 0.055)
    crest(car, -1.5, 0.14, 1.04)
    wiper(car, 1.09)
    car.interior(seat=-0.05, rear_bench=-0.95)
    return car.finish("#6c757c")


def fiesta():
    car = Coach("ford-fiesta-ecoboost", "star")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle

    def creases(x, y):
        along = max(0.0, min(1.0, (x - 1.0) / 0.2)) * max(0.0, min(1.0, (nose - 0.2 - x) / 0.25))
        return 0.016 * along * max(0.0, min(1.0, (0.4 - abs(y)) / 0.07))

    car.skin(
        half=[(stern, 0.76), (-axle, 0.85), (-0.3, 0.861), (0.5, 0.855), (axle, 0.835), (nose - 0.26, 0.79), (nose, 0.68)],
        shoulder=[(stern, 1.04), (-1.4, 1.1), (-0.4, 1.0), (0.6, 0.93), (1.04, 0.905), (axle, 0.88), (nose - 0.28, 0.815), (nose - 0.1, 0.77), (nose, 0.74)],
        waist=[(stern, 0.6), (stern + 0.2, 0.93), (-axle, 0.9), (0.0, 0.79), (axle, 0.72), (nose - 0.28, 0.6), (nose, 0.5)],
        sill=[(stern, 0.42), (-1.6, 0.35), (1.6, 0.29), (nose, 0.34)],
        crown=[(stern, 0.0), (1.0, 0.03), (axle, 0.05), (nose, 0.03)],
        flare=(0.014, 0.016),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.14, 0.045, 0.012, 0.0, 0.045, 0.13), "bow": 0.18, "flat": 0.56, "power": 2.15},
        rear={"set": (0.1, 0.02, 0.0, 0.0, 0.08, 0.11), "bow": 0.075, "flat": 0.76, "power": 2.5},
        inset=0.045,
        shelf=0.035,
        flank=0.016,
        belly=0.008,
        relief=creases,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    opening = [(-0.27, 0.375), (0.27, 0.375), (0.41, 0.54), (0.39, 0.635), (-0.39, 0.635), (-0.41, 0.54)]
    grille = car.hollow(front, opening, 0.05, mirror=False)
    grille.bars(5, material="chrome", share=0.3, sink=0.3)
    low = car.hollow(front, span(0.3, 0.28, 0.215, 0.3), 0.04, mirror=False)
    low.bars(1, share=0.2)
    car.hollow(front, [(0.52, 0.3), (0.8, 0.335), (0.82, 0.46), (0.58, 0.45)], 0.04)
    car.disc(front, 0.69, 0.385, 0.04, "head", sink=0.035)
    car.headlamp(
        front,
        [(0.5, 0.63), (0.74, 0.625), (0.98, 0.675), (1.3, 0.84), (1.26, 0.862), (0.9, 0.778), (0.5, 0.7)],
        projectors=[(0.66, 0.668, 0.032), (0.82, 0.704, 0.028)],
        strips=[[(0.96, 0.69), (1.24, 0.835), (1.23, 0.85), (0.93, 0.725)]],
    )
    car.patch(front, quad(-0.26, 0.26, 0.255, 0.365), "plate", lift=0.012, mirror=False)

    well(car, back, 0.7, depth=0.014)
    valance = car.hollow(back, span(0.52, 0.58, 0.3, 0.39), 0.03, mirror=False)
    valance.bars(1, share=0.2, sink=0.3)
    car.lamp(back, quad(0.6, 0.8, 0.44, 0.475), "red", lift=0.005, thickness=0.004)

    car.arches(0.042)
    car.cut()
    car.arch_lips(width=0.022, proud=0.007)
    ring(car, front, opening, 0.012, thickness=0.008)
    oval(car, car.nose, 0.0, 0.745, 0.048)

    shuts(car, 0.78, -0.32, -1.0, gap=0.042)
    car.bonnet(1.0, 0.68, front=nose - 0.2)
    gate(car, 0.68, 0.605, 1.02, top_half=0.64)
    pulls(car, [-0.2, -0.88])
    car.mirrors(0.72)

    glass = car.cabin(
        screen=(1.06, 0.14),
        back=(-1.46, -1.78),
        roof=[(-1.46, 1.432), (-0.9, 1.478), (-0.2, 1.495), (0.14, 1.458)],
        windows=[((0.78, 0.04), (-0.3, -0.33)), ((-0.38, -0.41), (-0.98, -0.9)), ((-1.03, -0.95), (-1.36, -1.06))],
        base_inset=0.065,
        tumble=0.12,
        drop=0.05,
        bow=(0.16, 0.06),
        flat=(0.86, 0.78),
    )
    car.wipers(glass)
    post(car, (-0.3, -0.38), (-0.33, -0.41))
    pillar = beam(car, (-1.7, 0.69, 1.17), pitch=14, yaw=44)
    car.taillamp(
        pillar,
        [(-0.1, -0.15), (0.1, -0.16), (0.13, 0.0), (0.1, 0.17), (0.03, 0.24), (-0.09, 0.06)],
        clear=[[(-0.07, -0.13), (0.08, -0.14), (0.08, -0.07), (-0.07, -0.06)]],
    )
    oval(car, back, 0.0, 0.9, 0.05)
    crest(car, -1.44, 0.18, 0.98)
    wiper(car, 1.13)
    car.interior(seat=-0.05, rear_bench=-0.85, spread=0.32)
    return car.finish("#1f77b8")


def mondeo():
    car = Coach("ford-mondeo-tdci", "ten")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.82), (-axle, 0.93), (-0.3, 0.943), (0.6, 0.94), (axle, 0.92), (nose - 0.3, 0.87), (nose, 0.75)],
        shoulder=[(stern, 1.085), (-1.7, 1.11), (-0.4, 1.02), (0.7, 0.975), (1.18, 0.96), (axle, 0.925), (nose - 0.3, 0.845), (nose - 0.1, 0.8), (nose, 0.775)],
        waist=[(stern, 0.64), (stern + 0.25, 0.92), (-axle, 0.89), (0.0, 0.8), (axle, 0.75), (nose - 0.3, 0.63), (nose, 0.53)],
        sill=[(stern, 0.44), (-1.8, 0.33), (1.8, 0.3), (nose, 0.36)],
        crown=[(stern, 0.0), (1.18, 0.03), (axle, 0.055), (nose, 0.035)],
        flare=(0.03, 0.03),
        keys=[nose - 0.46, axle, 0.45, -0.45, -axle, stern + 0.27],
        front={"set": (0.16, 0.05, 0.012, 0.0, 0.045, 0.13), "bow": 0.18, "flat": 0.57, "power": 2.2},
        rear={"set": (0.12, 0.03, 0.0, 0.0, 0.05, 0.075), "bow": 0.09, "flat": 0.74, "power": 2.4},
        inset=0.05,
        shelf=0.035,
        flank=0.018,
        belly=0.008,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    slot_shape = [(-0.36, 0.655), (0.36, 0.655), (0.42, 0.69), (0.4, 0.725), (-0.4, 0.725), (-0.42, 0.69)]
    upper = car.hollow(front, slot_shape, 0.04, mirror=False)
    upper.bars(2, material="chrome", share=0.26, sink=0.3)
    mouth_shape = [(-0.42, 0.26), (0.42, 0.26), (0.62, 0.48), (-0.62, 0.48)]
    intake = car.hollow(front, mouth_shape, 0.055, mirror=False)
    intake.bars(4, share=0.16)
    car.hollow(front, [(0.72, 0.3), (0.92, 0.34), (0.9, 0.5), (0.74, 0.47)], 0.04)
    car.disc(front, 0.82, 0.4, 0.04, "head", sink=0.035)
    car.headlamp(
        front,
        [(0.47, 0.625), (0.76, 0.61), (1.04, 0.65), (1.3, 0.79), (1.27, 0.84), (0.88, 0.795), (0.46, 0.74)],
        projectors=[(0.64, 0.68, 0.044), (0.84, 0.705, 0.038)],
        strips=[[(0.98, 0.675), (1.24, 0.795), (1.23, 0.82), (0.96, 0.72)]],
    )
    car.patch(front, quad(-0.26, 0.26, 0.515, 0.625), "plate", lift=0.006, mirror=False)

    well(car, back, 0.74)
    valance = car.hollow(back, span(0.64, 0.7, 0.3, 0.4), 0.03, mirror=False)
    valance.bars(1, share=0.2, sink=0.3)
    car.lamp(back, quad(0.76, 0.98, 0.46, 0.495), "red", lift=0.005, thickness=0.004)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.034, proud=0.011)
    ring(car, front, mouth_shape, 0.012, thickness=0.008)
    oval(car, car.nose, 0.0, 0.775, 0.058)

    car.taillamp(
        back,
        [(0.5, 0.92), (0.84, 0.9), (1.12, 0.915), (1.3, 1.0), (1.28, 1.07), (0.9, 1.06), (0.5, 1.04)],
        strips=[[(0.86, 0.93), (1.1, 0.94), (1.25, 1.0), (1.24, 1.045), (0.88, 1.035)]],
        clear=[[(0.53, 0.94), (0.8, 0.925), (0.8, 0.985), (0.53, 0.995)]],
    )
    car.patch(back, quad(-0.46, 0.46, 0.975, 1.005), "chrome", lift=0.006, thickness=0.008, mirror=False)
    oval(car, back, 0.0, 0.925, 0.055)
    shuts(car, 0.88, -0.34, -1.22, gap=0.045)
    car.bonnet(1.16, 0.76, front=nose - 0.2)
    gate(car, 0.78, 0.645, 1.06, top_half=0.74)
    pulls(car, [-0.18, -1.06])
    car.mirrors(0.8)

    glass = car.cabin(
        screen=(1.18, 0.3),
        back=(-1.32, -2.1),
        roof=[(-1.32, 1.415), (-0.8, 1.475), (-0.25, 1.5), (0.05, 1.49), (0.3, 1.455)],
        windows=[((0.9, 0.2), (-0.3, -0.32)), ((-0.38, -0.4), (-1.16, -0.98)), ((-1.24, -1.05), (-1.8, -1.24))],
        base_inset=0.075,
        tumble=0.14,
        drop=0.05,
        bow=(0.15, 0.08),
        flat=(0.86, 0.8),
    )
    car.wipers(glass)
    post(car, (-0.3, -0.38), (-0.32, -0.4))
    wiper(car, 1.18)
    car.interior(seat=0.0, rear_bench=-0.95)
    return car.finish("#33506f")


def c_max():
    car = Coach("ford-c-max-tdci", "seven")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.83), (-axle, 0.895), (-0.3, 0.9125), (0.6, 0.908), (axle, 0.885), (nose - 0.28, 0.845), (nose, 0.75)],
        shoulder=[(stern, 1.05), (-1.5, 1.065), (-0.3, 1.03), (0.9, 1.0), (1.22, 0.985), (axle + 0.06, 0.955), (nose - 0.3, 0.86), (nose - 0.1, 0.805), (nose, 0.775)],
        waist=[(stern, 0.6), (stern + 0.2, 0.83), (-axle, 0.83), (0.0, 0.79), (axle, 0.76), (nose - 0.3, 0.65), (nose, 0.54)],
        sill=[(stern, 0.43), (-1.72, 0.33), (1.72, 0.32), (nose, 0.38)],
        crown=[(stern, 0.0), (1.22, 0.025), (axle + 0.06, 0.045), (nose, 0.035)],
        flare=(0.028, 0.028),
        keys=[nose - 0.42, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.15, 0.05, 0.012, 0.0, 0.04, 0.11), "bow": 0.15, "flat": 0.6, "power": 2.3},
        rear={"set": (0.1, 0.02, 0.0, 0.0, 0.045, 0.07), "bow": 0.055, "flat": 0.8, "power": 2.7},
        inset=0.045,
        shelf=0.035,
        flank=0.014,
        belly=0.008,
        sharp=(True, True, False, True, False),
    )
    front, back = car.front, car.back

    slot_shape = [(-0.36, 0.66), (0.36, 0.66), (0.42, 0.755), (-0.42, 0.755)]
    upper = car.hollow(front, slot_shape, 0.04, mirror=False)
    upper.mesh(10, 3, share=0.16, sink=0.5)
    mouth_shape = [(-0.38, 0.28), (0.38, 0.28), (0.52, 0.47), (-0.52, 0.47)]
    intake = car.hollow(front, mouth_shape, 0.05, mirror=False)
    intake.bars(3, share=0.18)
    car.hollow(front, ellipse((0.78, 0.39), (0.085, 0.065), 12), 0.035)
    car.disc(front, 0.78, 0.39, 0.048, "head", sink=0.03)
    car.headlamp(
        front,
        [(0.45, 0.645), (0.74, 0.63), (0.99, 0.66), (1.2, 0.78), (1.18, 0.85), (0.84, 0.82), (0.45, 0.765)],
        projectors=[(0.62, 0.705, 0.046), (0.81, 0.73, 0.038)],
        strips=[[(0.93, 0.69), (1.14, 0.785), (1.13, 0.83), (0.93, 0.79)]],
    )
    car.patch(front, quad(-0.26, 0.26, 0.5, 0.61), "plate", lift=0.006, mirror=False)

    well(car, back, 0.72)
    valance = car.hollow(back, span(0.58, 0.64, 0.3, 0.39), 0.03, mirror=False)
    valance.bars(1, share=0.2, sink=0.3)
    car.lamp(back, quad(0.68, 0.88, 0.45, 0.485), "red", lift=0.005, thickness=0.004)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.038, proud=0.011)
    ring(car, front, slot_shape, 0.012, thickness=0.008)
    oval(car, front, 0.0, 0.708, 0.06, lift=0.012)

    shuts(car, 0.84, -0.32, -1.16, gap=0.045)
    car.bonnet(1.2, 0.74, front=nose - 0.16)
    gate(car, 0.76, 0.605, 1.035, top_half=0.75)
    pulls(car, [-0.16, -1.04])
    car.mirrors(0.88)
    car.patch(car.side, quad(-1.0, 0.66, 0.52, 0.55), "trim_black", lift=0.004, thickness=0.01)

    glass = car.cabin(
        screen=(1.24, 0.42),
        back=(-1.72, -2.0),
        roof=[(-1.72, 1.55), (-1.0, 1.588), (-0.2, 1.595), (0.42, 1.535)],
        windows=[((1.0, 0.36), (0.8, 0.3)), ((0.72, 0.26), (-0.28, -0.3)), ((-0.36, -0.38), (-1.12, -1.08)), ((-1.2, -1.16), (-1.66, -1.5))],
        base_inset=0.068,
        tumble=0.12,
        drop=0.05,
        bow=(0.17, 0.05),
        flat=(0.86, 0.84),
        power=(2.2, 2.6),
    )
    car.wipers(glass)
    post(car, (-0.28, -0.36), (-0.3, -0.38))
    pillar = beam(car, (-1.93, 0.73, 1.29), pitch=10, yaw=42)
    car.taillamp(
        pillar,
        [(-0.09, -0.21), (0.1, -0.21), (0.12, 0.04), (0.08, 0.27), (-0.01, 0.27), (-0.09, 0.04)],
        clear=[[(-0.06, -0.19), (0.08, -0.19), (0.08, -0.11), (-0.06, -0.11)]],
    )
    oval(car, back, 0.0, 0.93, 0.055)
    crest(car, -1.7, 0.13, 1.04)
    wiper(car, 1.14)
    car.interior(seat=0.2, rear_bench=-0.8)
    return car.finish("#7f9382")


def galaxy():
    car = Coach("ford-galaxy-tdci", "seven", twin=0.12, root=0.03, tip=0.026)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    car.skin(
        half=[(stern, 0.84), (-axle, 0.915), (-0.3, 0.927), (0.6, 0.922), (axle, 0.9), (nose - 0.3, 0.86), (nose, 0.75)],
        shoulder=[(stern, 1.11), (-1.8, 1.14), (-0.3, 1.085), (1.0, 1.055), (1.38, 1.04), (axle + 0.1, 1.0), (nose - 0.3, 0.875), (nose - 0.1, 0.815), (nose, 0.785)],
        waist=[(stern, 0.63), (stern + 0.2, 0.9), (-axle, 0.89), (0.0, 0.83), (axle, 0.79), (nose - 0.3, 0.66), (nose, 0.55)],
        sill=[(stern, 0.45), (-1.82, 0.35), (1.82, 0.33), (nose, 0.38)],
        crown=[(stern, 0.0), (1.38, 0.02), (axle + 0.1, 0.045), (nose, 0.035)],
        flare=(0.03, 0.03),
        keys=[nose - 0.46, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.16, 0.05, 0.012, 0.0, 0.05, 0.14), "bow": 0.18, "flat": 0.58, "power": 2.2},
        rear={"set": (0.1, 0.02, 0.0, 0.0, 0.035, 0.055), "bow": 0.05, "flat": 0.8, "power": 2.8},
        inset=0.045,
        shelf=0.035,
        flank=0.016,
        belly=0.008,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    slot_shape = [(-0.36, 0.665), (0.36, 0.665), (0.44, 0.715), (0.4, 0.768), (-0.4, 0.768), (-0.44, 0.715)]
    upper = car.hollow(front, slot_shape, 0.04, mirror=False)
    upper.bars(3, material="chrome", share=0.26, sink=0.3)
    mouth_shape = [(-0.42, 0.27), (0.42, 0.27), (0.62, 0.5), (-0.62, 0.5)]
    intake = car.hollow(front, mouth_shape, 0.055, mirror=False)
    intake.bars(4, share=0.16)
    car.hollow(front, [(0.68, 0.31), (0.96, 0.35), (0.96, 0.45), (0.68, 0.43)], 0.04)
    car.disc(front, 0.82, 0.385, 0.036, "head", sink=0.035)
    car.headlamp(
        front,
        [(0.47, 0.645), (0.76, 0.63), (1.04, 0.67), (1.28, 0.815), (1.25, 0.88), (0.88, 0.83), (0.46, 0.765)],
        projectors=[(0.64, 0.705, 0.046), (0.84, 0.73, 0.04)],
        strips=[[(0.98, 0.7), (1.22, 0.82), (1.21, 0.855), (0.96, 0.75)]],
    )
    car.patch(front, quad(-0.26, 0.26, 0.535, 0.645), "plate", lift=0.006, mirror=False)

    well(car, back, 0.75)
    valance = car.hollow(back, span(0.64, 0.7, 0.31, 0.41), 0.03, mirror=False)
    valance.bars(1, share=0.2, sink=0.3)
    car.lamp(back, quad(0.72, 0.94, 0.47, 0.505), "red", lift=0.005, thickness=0.004)

    car.arches(0.045)
    car.cut()
    car.arch_lips(width=0.034, proud=0.011)
    ring(car, front, mouth_shape, 0.012, thickness=0.008)
    oval(car, front, 0.0, 0.716, 0.06, lift=0.012)

    shuts(car, 0.92, -0.3, -1.28, gap=0.045)
    car.bonnet(1.36, 0.76, front=nose - 0.18)
    gate(car, 0.8, 0.635, 1.09, top_half=0.79)
    pulls(car, [-0.12, -1.12])
    car.mirrors(0.96)
    car.patch(back, quad(-0.44, 0.44, 0.93, 0.96), "chrome", lift=0.006, thickness=0.008, mirror=False)

    top = car.height
    glass = car.cabin(
        screen=(1.4, 0.5),
        back=(-2.08, -2.33),
        roof=[(-2.08, top - 0.07), (-1.2, top - 0.015), (-0.2, top), (0.5, top - 0.075)],
        windows=[((1.14, 0.44), (0.9, 0.38)), ((0.82, 0.34), (-0.26, -0.28)), ((-0.34, -0.36), (-1.26, -1.24)), ((-1.34, -1.32), (-2.02, -1.84))],
        base_inset=0.068,
        tumble=0.12,
        drop=0.05,
        bow=(0.18, 0.05),
        flat=(0.86, 0.84),
        power=(2.2, 2.8),
        fit=False,
    )
    car.wipers(glass)
    post(car, (-0.26, -0.34), (-0.28, -0.36))
    post(car, (-1.26, -1.34), (-1.24, -1.32))
    rails(car, 0.1, -1.9, 0.64)
    pillar = beam(car, (-2.26, 0.76, 1.32), pitch=8, yaw=42)
    car.taillamp(
        pillar,
        [(-0.1, -0.32), (0.1, -0.32), (0.12, 0.0), (0.09, 0.3), (0.0, 0.3), (-0.1, 0.0)],
        clear=[[(-0.07, -0.3), (0.08, -0.3), (0.08, -0.21), (-0.07, -0.21)]],
    )
    oval(car, back, 0.0, 1.02, 0.058)
    crest(car, -2.06, 0.13, 1.06)
    wiper(car, 1.21)
    car.interior(seat=0.3, rear_bench=-0.75)
    return car.finish("#b3ae9f")


def ecosport():
    car = Coach("ford-ecosport", "five", root=0.06, tip=0.05)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band == 1 or (band == 2 and (point.x > axle + 0.42 or point.x < -axle - 0.42)):
            return "trim_black"
        return "body"

    car.skin(
        half=[(stern, 0.82), (-axle, 0.872), (-0.3, 0.8825), (0.5, 0.88), (axle, 0.865), (nose - 0.24, 0.835), (nose, 0.75)],
        shoulder=[(stern, 1.13), (-1.3, 1.165), (-0.3, 1.105), (0.7, 1.065), (1.1, 1.05), (axle, 1.025), (nose - 0.25, 0.965), (nose - 0.08, 0.93), (nose, 0.9)],
        waist=[(stern, 0.7), (stern + 0.2, 0.97), (-axle, 0.96), (0.0, 0.89), (axle, 0.85), (nose - 0.25, 0.77), (nose, 0.66)],
        sill=[(stern, 0.52), (-1.55, 0.43), (1.55, 0.42), (nose, 0.47)],
        crown=[(stern, 0.0), (1.1, 0.025), (axle, 0.045), (nose, 0.035)],
        flare=(0.022, 0.024),
        keys=[nose - 0.36, axle, 0.45, -0.45, -axle, stern + 0.2],
        front={"set": (0.18, 0.06, 0.012, 0.0, 0.035, 0.1), "bow": 0.13, "flat": 0.64, "power": 2.4},
        rear={"set": (0.11, 0.03, 0.0, 0.0, 0.035, 0.055), "bow": 0.05, "flat": 0.8, "power": 2.8},
        inset=0.04,
        shelf=0.035,
        flank=0.014,
        belly=0.008,
        paint=paint,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    opening = [(-0.36, 0.6), (0.36, 0.6), (0.5, 0.74), (0.46, 0.865), (-0.46, 0.865), (-0.5, 0.74)]
    grille = car.hollow(front, opening, 0.05, mirror=False)
    grille.bars(4, material="chrome", share=0.26, sink=0.3)
    car.headlamp(
        front,
        [(0.55, 0.775), (0.82, 0.765), (1.04, 0.825), (1.16, 0.945), (1.1, 0.965), (0.82, 0.915), (0.53, 0.88)],
        projectors=[(0.69, 0.825, 0.04), (0.86, 0.85, 0.034)],
        strips=[[(0.56, 0.782), (0.82, 0.772), (1.02, 0.83), (1.015, 0.846), (0.82, 0.79), (0.56, 0.8)]],
    )
    low = car.hollow(front, span(0.4, 0.44, 0.4, 0.52), 0.04, mirror=False)
    low.bars(2, share=0.18)
    car.hollow(front, [(0.56, 0.42), (0.88, 0.44), (0.9, 0.62), (0.74, 0.62), (0.56, 0.56)], 0.04, material="trim_black")
    car.disc(front, 0.72, 0.5, 0.045, "head", sink=0.035)
    car.patch(front, quad(0.6, 0.86, 0.575, 0.595), "lens_clear", lift=-0.025, thickness=0.004, group="Headlights")
    car.patch(front, span(0.38, 0.44, 0.27, 0.36), "steel", lift=0.008, thickness=0.01, mirror=False)
    car.patch(front, quad(-0.26, 0.26, 0.44, 0.55), "plate", lift=0.01, mirror=False)

    well(car, back, 0.8)
    car.patch(back, span(0.38, 0.44, 0.33, 0.42), "steel", lift=0.008, thickness=0.01, mirror=False)
    car.lamp(back, quad(0.56, 0.76, 0.46, 0.495), "red", lift=0.008, thickness=0.004)

    car.arches(0.055)
    car.cut()
    car.arch_lips(width=0.05, proud=0.012, material="trim_black", floor=0.3)
    oval(car, front, 0.0, 0.735, 0.065, lift=0.016)

    car.taillamp(
        back,
        [(0.66, 0.955), (0.92, 0.94), (1.14, 0.975), (1.22, 1.085), (1.14, 1.115), (0.66, 1.105)],
        strips=[[(0.9, 0.965), (1.1, 0.99), (1.17, 1.075), (1.12, 1.095), (0.9, 1.085)]],
        clear=[[(0.68, 0.97), (0.86, 0.96), (0.86, 1.02), (0.68, 1.025)]],
    )
    oval(car, back, 0.0, 1.03, 0.058)
    shuts(car, 0.82, -0.26, -1.0, gap=0.055)
    car.bonnet(1.1, 0.7, front=nose - 0.14)
    gate(car, 0.64, 0.56, 1.12)
    car.patch(car.tail, quad(0.5, 0.6, 0.92, 0.95), "chrome", lift=0.008, thickness=0.01, mirror=False)
    pulls(car, [-0.1, -0.88])
    car.mirrors(0.82, material="trim_black")

    top = car.height - 0.012
    glass = car.cabin(
        screen=(1.12, 0.34),
        back=(-1.6, -1.86),
        roof=[(-1.6, top - 0.045), (-0.9, top - 0.01), (-0.2, top), (0.34, top - 0.06)],
        windows=[((0.84, 0.26), (-0.22, -0.25)), ((-0.3, -0.33), (-0.98, -0.94)), ((-1.05, -1.01), (-1.44, -1.26))],
        base_inset=0.062,
        tumble=0.11,
        drop=0.05,
        bow=(0.15, 0.05),
        flat=(0.86, 0.84),
        power=(2.2, 2.8),
        fit=False,
    )
    car.wipers(glass)
    post(car, (-0.22, -0.3), (-0.25, -0.33))
    rails(car, 0.12, -1.46, 0.6)
    crest(car, -1.58, 0.15, 0.98)
    wiper(car, 1.22)
    car.interior(seat=0.05, rear_bench=-0.8, spread=0.33)
    return car.finish("#a8612f")


def puma():
    car = Coach("ford-puma", "split")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle

    def wings(x, y):
        along = max(0.0, min(1.0, (x - 1.0) / 0.25)) * max(0.0, min(1.0, (nose - 0.12 - x) / 0.2))
        return 0.03 * along * max(0.0, min(1.0, (abs(y) - 0.42) / 0.16))

    car.skin(
        half=[(stern, 0.81), (-axle, 0.895), (-0.3, 0.9025), (0.5, 0.895), (axle, 0.88), (nose - 0.28, 0.84), (nose, 0.72)],
        shoulder=[(stern, 1.08), (-1.4, 1.135), (-0.4, 1.045), (0.6, 1.0), (1.04, 0.985), (axle, 0.96), (nose - 0.3, 0.89), (nose - 0.1, 0.835), (nose, 0.8)],
        waist=[(stern, 0.64), (stern + 0.2, 0.95), (-axle, 0.93), (0.0, 0.82), (axle, 0.78), (nose - 0.3, 0.68), (nose, 0.56)],
        sill=[(stern, 0.46), (-1.62, 0.39), (1.62, 0.36), (nose, 0.4)],
        crown=[(stern, 0.0), (1.04, 0.02), (axle, 0.03), (nose, 0.03)],
        flare=(0.03, 0.034),
        keys=[nose - 0.44, axle, 0.45, -0.45, -axle, stern + 0.24],
        front={"set": (0.15, 0.045, 0.01, 0.0, 0.07, 0.2), "bow": 0.19, "flat": 0.58, "power": 2.15},
        rear={"set": (0.11, 0.03, 0.0, 0.0, 0.07, 0.1), "bow": 0.08, "flat": 0.75, "power": 2.4},
        inset=0.05,
        shelf=0.035,
        flank=0.02,
        belly=0.008,
        cladding=1,
        relief=wings,
        sharp=(True, True, True, True, False),
        lid_rows=6,
    )
    front, back = car.front, car.back

    opening = [(-0.38, 0.41), (0.38, 0.41), (0.47, 0.53), (0.4, 0.665), (-0.4, 0.665), (-0.47, 0.53)]
    grille = car.hollow(front, opening, 0.05, mirror=False)
    grille.mesh(12, 5, share=0.16, sink=0.5)
    low = car.hollow(front, span(0.48, 0.42, 0.26, 0.345), 0.04, mirror=False)
    low.bars(2, share=0.16)
    car.hollow(front, [(0.66, 0.35), (0.9, 0.39), (0.92, 0.6), (0.72, 0.57)], 0.04, material="trim_black")
    car.disc(front, 0.8, 0.45, 0.036, "head", sink=0.035)
    car.headlamp(
        car.top,
        [(nose - 0.2, 0.47), (nose - 0.3, 0.63), (nose - 0.46, 0.74), (nose - 0.7, 0.78), (nose - 0.68, 0.65), (nose - 0.52, 0.53), (nose - 0.34, 0.44)],
        projectors=[(nose - 0.43, 0.6, 0.05), (nose - 0.57, 0.69, 0.038)],
        strips=[[(nose - 0.22, 0.48), (nose - 0.31, 0.62), (nose - 0.46, 0.725), (nose - 0.68, 0.765), (nose - 0.68, 0.745), (nose - 0.47, 0.7), (nose - 0.335, 0.61), (nose - 0.25, 0.48)]],
        depth=0.035,
    )
    car.patch(front, quad(-0.26, 0.26, 0.425, 0.535), "plate", lift=0.01, mirror=False)

    well(car, back, 0.76)
    valance = car.hollow(back, span(0.52, 0.6, 0.31, 0.42), 0.03, mirror=False)
    valance.bars(4, axis=0, share=0.1, sink=0.1)
    car.lamp(back, quad(0.64, 0.84, 0.5, 0.535), "red", lift=0.005, thickness=0.004)

    car.arches(0.05)
    car.cut()
    car.arch_lips(width=0.04, proud=0.01, material="trim_black", floor=0.25)
    oval(car, car.nose, 0.0, 0.76, 0.05)
    car.pipes((0.44,), stern + 0.004, 0.365, radius=0.032, length=0.12)

    car.taillamp(
        back,
        [(0.44, 0.955), (0.84, 0.945), (1.1, 0.96), (1.3, 1.035), (1.28, 1.07), (0.88, 1.065), (0.44, 1.045)],
        strips=[
            [(0.46, 1.02), (0.88, 1.03), (1.24, 1.045), (1.235, 1.058), (0.88, 1.046), (0.46, 1.035)],
            [(0.46, 0.975), (0.88, 0.972), (1.14, 0.985), (1.14, 0.998), (0.88, 0.986), (0.46, 0.989)],
        ],
    )
    oval(car, back, 0.0, 0.965, 0.052)
    shuts(car, 0.8, -0.34, -1.06, gap=0.05)
    car.bonnet(1.02, 0.7, front=nose - 0.26)
    gate(car, 0.74, 0.645, 0.94, top_half=0.72)
    pulls(car, [-0.2, -0.92])
    car.mirrors(0.74, material="trim_black")

    glass = car.cabin(
        screen=(1.06, 0.2),
        back=(-1.52, -1.93),
        roof=[(-1.52, 1.445), (-0.9, 1.51), (-0.25, 1.537), (0.2, 1.49)],
        windows=[((0.78, 0.1), (-0.3, -0.33)), ((-0.38, -0.41), (-1.02, -0.94)), ((-1.08, -1.0), (-1.42, -1.14))],
        base_inset=0.07,
        tumble=0.13,
        drop=0.05,
        bow=(0.15, 0.07),
        flat=(0.86, 0.8),
    )
    car.wipers(glass)
    post(car, (-0.3, -0.38), (-0.33, -0.41))
    crest(car, -1.5, 0.18, 1.0)
    wiper(car, 1.17)
    car.interior(seat=0.0, rear_bench=-0.9, spread=0.33)
    return car.finish("#5aa0b5")


def blind(car, keep, **options):
    stock = kit.tagged

    def chosen(bm, bands, test, hull):
        return stock(bm, bands, lambda station: test(station) and (station[0] != "side" or station[1] in keep), hull)

    kit.tagged = chosen
    try:
        return car.cabin(**options)
    finally:
        kit.tagged = stock


def transit_connect():
    car = Coach("ford-transit-connect", "steel")
    nose, stern, axle = car.nose_x, car.stern_x, car.axle

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if band in (1, 2, 3) and (point.x > axle + 0.4 or point.x < -axle - 0.42):
            return "trim_black"
        return "body"

    car.skin(
        half=[(stern, 0.865), (-axle, 0.89), (0.0, 0.8975), (axle, 0.885), (nose - 0.22, 0.85), (nose, 0.78)],
        shoulder=[(stern, 1.12), (0.1, 1.12), (0.45, 1.045), (1.0, 1.035), (1.3, 1.055), (axle + 0.3, 0.99), (nose - 0.15, 0.915), (nose, 0.875)],
        waist=[(stern, 0.58), (-1.88, 0.6), (-1.62, 0.74), (1.62, 0.74), (1.86, 0.66), (nose, 0.64)],
        sill=[(stern, 0.42), (-1.75, 0.35), (1.75, 0.35), (nose, 0.42)],
        crown=[(stern, 0.0), (1.2, 0.0), (1.5, 0.03), (nose, 0.03)],
        flare=(0.022, 0.022),
        keys=[nose - 0.3, axle, 0.45, -0.45, -axle, stern + 0.14],
        front={"set": (0.16, 0.05, 0.0, 0.0, 0.07, 0.15), "bow": 0.12, "flat": 0.66, "power": 2.4},
        rear={"set": (0.09, 0.02, 0.0, 0.0, 0.04, 0.05), "bow": 0.02, "flat": 0.87, "power": 3.6},
        inset=0.028,
        shelf=0.025,
        flank=0.008,
        paint=paint,
        sharp=(True, True, True, True, False),
    )
    front, back = car.front, car.back

    slot_shape = span(0.4, 0.43, 0.705, 0.825)
    grille = car.hollow(front, slot_shape, 0.04, mirror=False)
    grille.bars(3, share=0.3)
    intake = car.hollow(front, span(0.5, 0.56, 0.36, 0.48), 0.04, mirror=False)
    intake.bars(3, share=0.2)
    car.headlamp(
        front,
        [(0.47, 0.675), (0.86, 0.685), (1.0, 0.76), (1.03, 0.865), (0.88, 0.885), (0.47, 0.84)],
        projectors=[(0.64, 0.765, 0.058)],
        strips=[[(0.84, 0.705), (0.97, 0.775), (0.99, 0.85), (0.88, 0.865), (0.84, 0.81)]],
    )
    car.hollow(front, ellipse((0.74, 0.5), (0.07, 0.055), 12), 0.03, material="trim_black")
    car.disc(front, 0.74, 0.5, 0.04, "head", sink=0.026)
    car.patch(front, quad(-0.26, 0.26, 0.52, 0.63), "plate", lift=0.006, mirror=False)
    car.hollow(back, quad(-0.47, 0.07, 0.63, 0.8), 0.014, material="body", mirror=False)
    car.patch(back, quad(-0.46, 0.06, 0.66, 0.77), "plate", lift=-0.01, mirror=False)
    car.hollow(back, quad(0.0, 0.12, 0.98, 1.05), 0.02, material="trim_black", mirror=False)

    car.arches(0.055)
    car.cut()
    car.arch_lips(width=0.034, proud=0.01)
    oval(car, front, 0.0, 0.765, 0.075, lift=0.012)

    car.taillamp(
        back,
        [(0.8, 0.7), (0.96, 0.7), (0.96, 1.09), (0.8, 1.09)],
        clear=[quad(0.82, 0.94, 0.72, 0.8)],
        dark=[quad(0.82, 0.94, 0.89, 0.9)],
    )
    car.seams([0.94, -0.02])
    car.stroke((-0.12, 0.37), (-0.12, 1.1), car.side, steps=8)
    car.stroke((-1.06, 0.76), (-1.06, 1.1), car.side, steps=6)
    car.stroke((-1.06, 0.76), (-0.86, 0.37), car.side, steps=6)
    car.patch(car.side, quad(-1.0, 0.84, 0.6, 0.67), "trim_black", lift=0.006, thickness=0.012)
    car.patch(car.side, quad(-1.95, -1.7, 0.61, 0.68), "trim_black", lift=0.006, thickness=0.012)
    car.bonnet(1.3, 0.72, front=nose - 0.17)
    pulls(car, [0.1, -0.24], material="trim_black", z=0.95)
    car.mirrors(0.98, material="trim_black", size=(0.09, 0.16, 0.2), reach=0.08, lift=0.1)
    tail = car.tail
    car.stroke((0.14, 0.6), (0.14, 1.1), tail, steps=8, mirror=False)

    glass = blind(
        car,
        {0},
        screen=(1.3, 0.62),
        back=(-1.99, -2.06),
        roof=[(-1.99, 1.8), (-0.6, 1.814), (0.2, 1.8), (0.62, 1.74)],
        windows=[((1.0, 0.56), (0.08, 0.06)), ((-0.04, -0.06), (-1.84, -1.82))],
        base_inset=0.032,
        tumble=0.075,
        drop=0.04,
        bow=(0.14, 0.02),
        rail_bow=(0.1, 0.02),
        flat=(0.84, 0.9),
        power=(2.3, 3.6),
        glass_rear=False,
        crest=0.06,
        bulge=0.006,
    )
    car.wipers(glass)
    car.stroke((-0.12, 1.14), (-0.12, 1.72), car.side, steps=6)
    car.stroke((-1.06, 1.14), (-1.06, 1.72), car.side, steps=6)
    car.stroke((-1.06, 1.72), (-0.12, 1.72), car.side, steps=6)
    car.stroke((0.14, 1.14), (0.14, 1.74), tail, steps=8, mirror=False)
    car.stroke((-0.72, 1.74), (0.72, 1.74), tail, steps=8, mirror=False)
    car.stroke((0.72, 0.6), (0.72, 1.74), tail, steps=12)
    car.interior(seat=0.25, spread=0.36)
    return car.finish("#eef0ee")


def flat(x, facing=-1):
    def caster(a, b):
        return Vector((x, a, b)), Vector((facing, 0, 0))

    return caster


def pulls(car, positions, z=None, material="body", size=(0.15, 0.02, 0.028)):
    for x in positions:
        height = car.shoulder_at(x) - 0.09 if z is None else z
        hit, normal = car.side(x, height)
        car.model.add(box(hit + normal * (size[1] / 2 - 0.002), size, material, bevel=0.007))


def arch_outline(centre, hub, reach, rise, power, splay=0.0, steps=28):
    outline = [(centre + reach + splay * 1.7, -0.3)]
    for s in range(steps + 1):
        angle = math.pi * s / steps
        cosine, sine = math.cos(angle), math.sin(angle)
        a = abs(cosine) ** (2 / power) * (1 if cosine >= 0 else -1)
        outline.append((centre + reach * a, hub + rise * sine ** (2 / power)))
    outline.append((centre - reach - splay * 1.7, -0.3))
    return outline


def square_arches(car, gap, crown, power=3.0, splay=0.03, inner=0.1, material="underbody"):
    car.arch_shapes = []
    car.arch_list = []
    for sign, spec, track in ((1, car.front_wheel, car.tracks[0]), (-1, car.rear_wheel, car.tracks[1])):
        centre = sign * car.axle
        hub = spec["radius"]
        outline = arch_outline(centre, hub, hub + gap, hub + crown, power, splay)
        near = track / 2 - spec["width"] / 2 - inner
        for flip in (1, -1):
            car.cutters.append(prism(outline, flip * near, flip * 3.0, material))
        car.arch_shapes.append(outline)
        car.arch_list.append((centre, hub, hub + gap))


def flares(car, width=0.06, proud=0.016, material="body", floor=0.45):
    for outline in car.arch_shapes:
        dense = []
        for a, b in zip(outline, outline[1:]):
            pieces = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / 0.07))
            dense += [(a[0] + (b[0] - a[0]) * n / pieces, a[1] + (b[1] - a[1]) * n / pieces) for n in range(pieces)]
        dense.append(outline[-1])
        dense = [p for p in dense if p[1] >= floor]
        middle = sum(p[0] for p in dense) / len(dense)
        points, outs, ups = [], [], []
        for n, (x, z) in enumerate(dense):
            before = dense[max(0, n - 1)]
            after = dense[min(len(dense) - 1, n + 1)]
            radial = Vector((after[1] - before[1], 0, before[0] - after[0])).normalized()
            if radial.dot(Vector((x - middle, 0, z - 0.2))) < 0:
                radial = -radial
            probe = Vector((x, 0, z)) + radial * 0.014
            try:
                hit = car.side(probe.x, probe.z)[0]
            except ValueError:
                continue
            points.append(Vector((x, hit.y, z)))
            outs.append(LEFT)
            ups.append(radial)
        profile = [(-0.03, -0.004), (proud, -0.004), (proud, width * 0.6), (0.0, width), (-0.03, width)]
        car.model.add(sweep(points, outs, ups, profile, material))


def girder(car, path, profile, material):
    points = [Vector((x, y, z)) for x, y, z in path]
    outs = []
    for n in range(len(points)):
        before = points[max(0, n - 1)]
        after = points[min(len(points) - 1, n + 1)]
        tangent = after - before
        out = Vector((tangent.y, -tangent.x, 0))
        if out.length < 1e-9:
            out = Vector((-1, 0, 0))
        outs.append(out.normalized())
    car.model.add(sweep(points, outs, [Vector((0, 0, 1))] * len(points), profile, material))


def f150():
    wheel = {"spokes": 6, "root": 0.075, "tip": 0.058, "thick": 0.036, "lean": 0.014, "hub": 0.09}
    car = Coach("ford-f-150-5-0", wheel, dish=0.055, grooves=5, groove_depth=0.014, lip="chrome", nuts=6)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    tail = stern + 0.11

    def paint(band, station, point):
        if band == 0:
            return "underbody"
        if point.x > nose - 0.42:
            if band == 1:
                return "trim_black"
            if band in (2, 3):
                return "chrome"
        return "body"

    def dome(x, y):
        along = max(0.0, min(1.0, (x - 1.36) / 0.16)) * max(0.0, min(1.0, (nose - 0.07 - x) / 0.1))
        across = max(0.0, min(1.0, (0.56 - abs(y)) / 0.09))
        return 0.034 * along * across

    car.skin(
        half=[(stern, 0.985), (-axle, 1.0), (0.0, 0.995), (axle, 1.0), (nose - 0.25, 0.99), (nose, 0.965)],
        shoulder=[(stern, 1.39), (-1.2, 1.39), (-1.12, 1.35), (0.3, 1.35), (0.46, 1.285), (0.98, 1.285), (1.2, 1.35), (1.34, 1.35), (axle, 1.338), (nose - 0.3, 1.322), (nose, 1.305)],
        waist=[(stern, 1.0), (2.1, 1.0), (2.36, 0.78), (nose, 0.77)],
        sill=[(stern, 0.72), (-2.64, 0.7), (-2.3, 0.5), (2.3, 0.5), (2.5, 0.585), (nose, 0.585)],
        crown=[(stern, 0.0), (1.3, 0.0), (1.5, 0.028), (nose, 0.028)],
        flare=(0.0, 0.0),
        keys=[nose - 0.22, axle, 0.45, -0.45, -axle, tail + 0.15],
        front={"set": (0.3, 0.1, 0.0, 0.0, 0.04, 0.085), "bow": 0.045, "flat": 0.84, "power": 3.4},
        rear={"set": (0.2, 0.125, 0.115, 0.11, 0.11, 0.125), "bow": 0.012, "flat": 0.9, "power": 3.8},
        inset=0.028,
        shelf=0.04,
        flank=0.008,
        belly=0.004,
        tuck=0.12,
        clearance=0.36,
        front_lift=0.07,
        rear_lift=0.27,
        paint=paint,
        relief=dome,
        sharp=(True, True, True, True, False),
        lid_rows=7,
    )
    front, back = car.front, car.back

    opening = [(-0.62, 0.81), (0.62, 0.81), (0.64, 0.93), (0.8, 0.93), (0.8, 1.07), (0.64, 1.07), (0.64, 1.245), (-0.64, 1.245), (-0.64, 1.07), (-0.8, 1.07), (-0.8, 0.93), (-0.64, 0.93)]
    grille = car.hollow(front, opening, 0.07, mirror=False)
    grille.mesh(14, 7, share=0.15, sink=0.75)
    lamp = [(0.66, 0.81), (1.03, 0.81), (1.05, 1.245), (0.66, 1.245), (0.66, 1.09), (0.8, 1.09), (0.8, 0.91), (0.66, 0.91)]
    car.headlamp(
        front,
        lamp,
        projectors=[(0.945, 1.12, 0.05), (0.945, 0.93, 0.05)],
        strips=[[(0.675, 0.85), (0.86, 0.85), (0.86, 1.15), (0.675, 1.15), (0.675, 1.105), (0.815, 1.105), (0.815, 0.895), (0.675, 0.895)]],
        depth=0.05,
    )
    low = car.hollow(front, [(-0.5, 0.485), (0.5, 0.485), (0.52, 0.565), (-0.52, 0.565)], 0.05, mirror=False)
    low.bars(2, share=0.18)
    car.hollow(front, quad(0.7, 0.93, 0.635, 0.735), 0.04)
    car.hollow(front, quad(0.56, 0.63, 0.5, 0.56), 0.05)

    car.hollow(back, quad(-0.68, 0.68, 1.0, 1.27), 0.014, material="body", mirror=False)
    car.hollow(back, quad(-0.12, 0.12, 1.295, 1.355), 0.03, material="trim_black", mirror=False)

    bed_front, bed_back, bed_floor, bed_half = -1.2, tail + 0.065, 0.86, 0.83
    car.carve(box((-1.152, 0, 1.2), (0.026, 3.0, 1.34), "body"))
    car.carve(box(((bed_front + bed_back) / 2, 0, bed_floor + 0.6), (bed_front - bed_back, bed_half * 2, 1.2), "body"))
    square_arches(car, 0.14, 0.17, power=4.2, splay=0.04)
    car.cut()
    flares(car, width=0.075, proud=0.028, floor=0.5)

    for bar_low, bar_high in ((0.945, 0.995), (1.02, 1.07)):
        car.patch(front, clip(opening, 1, bar_low, bar_high), "chrome", lift=-0.012, thickness=0.035, mirror=False)
    ring(car, front, [(-0.62, 0.81), (0.62, 0.81), (0.64, 0.93), (0.64, 1.245), (-0.64, 1.245), (-0.64, 0.93)], -0.022, lift=0.002, thickness=0.02)
    oval(car, front, 0.0, 1.008, 0.105, lift=0.03)
    car.disc(front, 0.815, 0.685, 0.045, "head", sink=0.03)
    car.lamp(front, quad(0.9, 1.02, 1.005, 1.045), "amber", lift=-0.03, thickness=0.004)
    car.patch(front, quad(-0.155, 0.155, 0.6, 0.76), "plate", lift=0.008, mirror=False)

    rail = car.lid(-2.0, 0.9)
    length = bed_front - bed_back
    middle = (bed_front + bed_back) / 2
    car.model.add(box((-axle, bed_half - 0.085, bed_floor + 0.12), (1.02, 0.17, 0.24), "body", bevel=0.045))
    for n in range(-3, 4):
        car.model.absorb(box((middle, n * 0.17, bed_floor + 0.006), (length - 0.08, 0.05, 0.012), "body"))
    car.model.add(box((middle, bed_half + 0.06, rail + 0.003), (length + 0.06, 0.14, 0.014), "trim_black", bevel=0.005))
    car.model.absorb(box((bed_back - 0.03, 0, rail + 0.003), (0.08, bed_half * 2, 0.014), "trim_black", bevel=0.005))
    car.model.absorb(box((bed_front + 0.02, 0, rail + 0.003), (0.07, bed_half * 2, 0.014), "trim_black", bevel=0.005))

    section = [(-0.11, -0.1), (-0.02, -0.1), (0.0, -0.07), (0.0, 0.065), (-0.03, 0.1), (-0.11, 0.1)]
    track = [(stern + 0.5, 0.995, 0.63), (stern + 0.3, 0.995, 0.63), (stern + 0.15, 0.985, 0.63), (stern + 0.07, 0.95, 0.63), (stern + 0.025, 0.87, 0.63), (stern + 0.005, 0.7, 0.63), (stern, 0.45, 0.63), (stern, 0.17, 0.63)]
    girder(car, track, section, "chrome")
    car.model.add(box((stern + 0.065, 0.55, 0.733), (0.1, 0.6, 0.012), "trim_black", bevel=0.004))
    car.model.absorb(box((stern + 0.085, 0, 0.63), (0.09, 0.36, 0.2), "chrome"))
    car.patch(flat(stern + 0.038), quad(-0.155, 0.155, 0.555, 0.715), "plate", lift=0.0, mirror=False)
    car.model.absorb(box((stern + 0.1, 0, 0.49), (0.14, 0.09, 0.09), "trim_black", bevel=0.01))
    car.model.absorb(cylinder((-axle, -0.74, 0.4), (-axle, 0.74, 0.4), 0.048, "trim_black", segments=10))
    car.model.absorb(lathe([(0.0, -0.15), (0.1, -0.11), (0.14, 0.0), (0.1, 0.11), (0.0, 0.15)], "trim_black", origin=(-axle, 0.0, 0.4), axis=(1, 0, 0), segments=12, loop=False))
    car.model.add(box((-2.3, 0.46, 0.55), (1.3, 0.07, 0.11), "trim_black"))
    car.model.absorb(cylinder((-2.56, 0, 0.44), (-2.56, 0, 0.62), 0.37, "tyre", segments=20))
    car.pipes((-0.72,), stern + 0.16, 0.47, radius=0.045, length=0.22)

    car.seams([1.14, -0.1, -1.08], low=lambda x: 0.52)
    car.bonnet(1.36, 0.88, front=nose - 0.14)
    pulls(car, [0.02, -0.98], material="chrome", size=(0.17, 0.024, 0.036))
    car.mirrors(1.04, material="trim_black", size=(0.12, 0.17, 0.26), reach=0.06, lift=0.12)
    car.model.add(box((0.05, 0.99, 0.37), (2.3, 0.15, 0.04), "trim_black", bevel=0.012))
    for x in (0.75, -0.65):
        car.model.add(box((x, 0.95, 0.4), (0.05, 0.08, 0.07), "trim_black"))
    car.patch(car.side, quad(1.22, 1.42, 1.1, 1.15), "chrome", lift=0.004, thickness=0.006)

    car.taillamp(
        back,
        [(0.83, 0.99), (1.05, 0.99), (1.05, 1.375), (0.83, 1.375)],
        strips=[[(0.86, 1.02), (1.02, 1.02), (1.02, 1.345), (0.86, 1.345), (0.86, 1.3), (0.975, 1.3), (0.975, 1.065), (0.86, 1.065)]],
        clear=[[(0.87, 1.13), (0.94, 1.13), (0.94, 1.235), (0.87, 1.235)]],
    )
    car.stroke((-0.8, 0.765), (0.8, 0.765), back, steps=10, mirror=False)
    car.stroke((0.8, 0.765), (0.8, 1.385), back, steps=6)
    oval(car, back, 0.0, 1.135, 0.12, lift=-0.008)

    glass = car.cabin(
        screen=(1.33, 0.64),
        back=(-0.99, -1.09),
        roof=[(-0.99, 1.928), (-0.4, 1.957), (0.15, 1.961), (0.64, 1.905)],
        windows=[((1.04, 0.54), (-0.04, -0.06)), ((-0.16, -0.16), (-0.95, -0.89))],
        base_inset=0.072,
        tumble=0.1,
        drop=0.04,
        bow=(0.1, 0.02),
        rail_bow=(0.07, 0.02),
        flat=(0.86, 0.92),
        power=(2.3, 3.6),
    )
    car.wipers(glass)
    car.patch(car.tail, quad(-0.14, 0.14, 1.885, 1.91), "lens_tail", lift=0.006, thickness=0.006, mirror=False, group="Taillights")
    car.interior(seat=0.2, rear_bench=-0.75, spread=0.42)
    return car.finish("#1f4f9a")


def mustang(name, paint, wheel, trim):
    car = Coach(name, **wheel)
    nose, stern, axle = car.nose_x, car.stern_x, car.axle
    mach = trim == "mach"
    bullitt = trim == "bullitt"

    def dome(x, y):
        along = max(0.0, min(1.0, (x - 0.74) / 0.2)) * max(0.0, min(1.0, (nose - 0.16 - x) / 0.3))
        reach = 0.44 - 0.1 * max(0.0, min(1.0, (x - 0.74) / 1.4))
        return 0.024 * along * max(0.0, min(1.0, (reach - abs(y)) / 0.07))

    car.skin(
        half=[(stern, 0.83), (-2.05, 0.925), (-axle, 0.965), (-0.55, 0.92), (0.5, 0.915), (axle, 0.94), (nose - 0.3, 0.9), (nose, 0.75)],
        shoulder=[(stern, 1.02), (-1.9, 1.05), (-1.15, 1.045), (-0.62, 0.99), (0.0, 0.96), (0.72, 0.95), (axle, 0.89), (nose - 0.3, 0.8), (nose, 0.715)],
        waist=[(stern, 0.66), (stern + 0.25, 0.8), (-axle, 0.87), (-0.7, 0.79), (0.0, 0.765), (axle, 0.74), (nose - 0.3, 0.64), (nose, 0.52)],
        sill=[(stern, 0.42), (-1.75, 0.27), (1.72, 0.26), (nose, 0.3)],
        crown=[(stern, 0.008), (-1.9, 0.01), (0.72, 0.03), (axle, 0.05), (nose, 0.03)],
        flare=(0.02, 0.045),
        keys=[nose - 0.46, axle, 0.45, -0.45, -axle, stern + 0.26],
        front={"set": (0.17, 0.075, 0.05, 0.02, 0.0, 0.1), "bow": (0.14, 0.17, 0.2, 0.21, 0.21, 0.2), "flat": 0.58, "power": 2.25},
        rear={"set": (0.12, 0.03, 0.01, 0.0, 0.025, 0.05), "bow": 0.075, "flat": 0.78, "power": 2.7},
        inset=0.07,
        shelf=0.05,
        flank=0.02,
        belly=0.008,
        margin=-0.006,
        cladding=1,
        rear_lift=0.12,
        relief=dome,
        sharp=(True, True, True, True, False),
        lid_rows=6,
    )
    front, back = car.front, car.back

    if mach:
        opening = [(-0.5, 0.455), (0.5, 0.455), (0.6, 0.6), (0.54, 0.69), (-0.54, 0.69), (-0.6, 0.6)]
    else:
        opening = [(-0.4, 0.455), (0.4, 0.455), (0.57, 0.63), (0.53, 0.69), (-0.53, 0.69), (-0.57, 0.63)]
    grille = car.hollow(front, opening, 0.07, mirror=False)
    grille.mesh(14, 5, share=0.14, sink=0.7)
    lower = car.hollow(front, span(0.52, 0.58, 0.215, 0.37) if mach else span(0.44, 0.52, 0.225, 0.36), 0.06, mirror=False)
    lower.bars(3 if mach else 2, share=0.14)
    if mach:
        duct = car.hollow(front, [(0.68, 0.25), (0.94, 0.3), (0.94, 0.47), (0.68, 0.45)], 0.06)
        duct.bars(3, share=0.16)
    else:
        duct = car.hollow(front, [(0.64, 0.3), (0.93, 0.35), (0.95, 0.47), (0.66, 0.445)], 0.05)
        duct.bars(1, share=0.16, sink=0.5)
    car.headlamp(
        front,
        [(0.63, 0.585), (0.88, 0.58), (1.06, 0.645), (1.17, 0.775), (0.94, 0.755), (0.6, 0.7)],
        projectors=[(0.83, 0.655, 0.036), (0.965, 0.69, 0.03)],
        strips=[[(0.635 + n * 0.055, 0.6), (0.662 + n * 0.055, 0.6), (0.644 + n * 0.055, 0.69), (0.617 + n * 0.055, 0.686)] for n in range(3)],
    )
    for sign in (1, -1):
        vent = car.hollow(car.top, [(1.56, sign * 0.25), (1.56, sign * 0.38), (1.24, sign * 0.35), (1.24, sign * 0.27)], 0.03, mirror=False)
        vent.bars(4, axis=0, share=0.3, sink=0.2)

    panel = [(-0.9, 0.69), (0.9, 0.69), (0.95, 0.82), (0.92, 0.95), (-0.92, 0.95), (-0.95, 0.82)]
    car.hollow(back, panel, 0.03, material="trim_black", mirror=False)
    car.hollow(back, quad(-0.19, 0.19, 0.44, 0.63), 0.016, material="body", mirror=False)
    diffuser = car.hollow(back, span(0.84, 0.88, 0.235, 0.42) if mach else span(0.78, 0.84, 0.235, 0.4), 0.05, mirror=False)
    diffuser.bars(7 if mach else 3, axis=0, share=0.09, sink=0.05)

    car.arches(0.04, inner=0.1)
    car.cut()
    car.arch_lips(width=0.024, proud=0.007)
    pipe = 0.056 if mach else 0.046
    car.pipes((0.5, 0.5 + pipe * 2.4, -0.5, -0.5 - pipe * 2.4), stern + 0.005, 0.33, radius=pipe, length=0.16, material="rim_dark" if bullitt else "chrome")
    car.patch(back, quad(-0.155, 0.155, 0.455, 0.615), "plate", lift=-0.012, mirror=False)
    car.patch(front, quad(-0.155, 0.155, 0.225, 0.385), "plate", lift=0.016, mirror=False)
    car.lamp(back, quad(0.86, 1.04, 0.5, 0.535), "red", lift=0.005, thickness=0.004)

    for n in range(3):
        a = 0.4 + n * 0.17
        bar_shape = [(a, 0.705), (a + 0.13, 0.705), (a + 0.155, 0.935), (a + 0.03, 0.935)]
        car.taillamp(back, bar_shape, strips=[grow(bar_shape, -0.024)], lift=-0.02)
    if bullitt:
        car.patch(back, ellipse((0.0, 0.82), (0.075, 0.075), 16), "chrome", lift=-0.024, thickness=0.004, mirror=False)
        car.patch(back, ellipse((0.0, 0.82), (0.056, 0.056), 14), "trim_black", lift=-0.02, thickness=0.004, mirror=False)
        ring(car, front, opening, 0.012, thickness=0.01)
    else:
        car.patch(back, quad(-0.1, 0.1, 0.795, 0.845), "chrome", lift=-0.024, thickness=0.004, mirror=False)
        car.patch(front, quad(-0.085, 0.085, 0.585, 0.625), "chrome", lift=-0.035, thickness=0.004, mirror=False)
    if mach:
        for t in (0.34, -0.34):
            car.patch(front, ellipse((t, 0.585), (0.064, 0.064), 14), "rim_dark", lift=-0.04, thickness=0.02, mirror=False)
            car.patch(front, ellipse((t, 0.585), (0.042, 0.042), 12), "grille", lift=-0.032, thickness=0.004, mirror=False)
        car.lip(nose - 0.12, 0.155, 1.58, depth=0.18, thickness=0.02, sweep_back=0.22)
        car.patch(car.top, quad(0.76, nose - 0.16, -0.22, 0.22), "trim_black", lift=0.004, mirror=False, step=0.12)
        for y in (0.24, -0.24):
            car.patch(car.top, quad(0.76, nose - 0.18, y - 0.01, y + 0.01), "livery", lift=0.004, mirror=False, step=0.12)
        car.patch(car.side, quad(-0.72, 0.84, 0.35, 0.42), "trim_black", lift=0.004)
        car.patch(car.side, quad(-0.72, 0.84, 0.432, 0.448), "livery", lift=0.004)
        car.lip(stern + 0.09, 1.055, 1.42, depth=0.15, thickness=0.04, material="trim_black", sweep_back=-0.03)
    elif bullitt:
        car.lip(nose - 0.1, 0.16, 1.4, depth=0.12, thickness=0.018, sweep_back=0.18)
    else:
        car.lip(nose - 0.1, 0.16, 1.46, depth=0.14, thickness=0.018, sweep_back=0.18)
        car.lip(stern + 0.08, 1.043, 1.34, depth=0.12, thickness=0.026, material="body", sweep_back=-0.03)

    car.seams([0.5, -0.66])
    car.bonnet(0.74, 0.76, front=nose - 0.2)
    pulls(car, [-0.5])
    car.mirrors(0.36, size=(0.08, 0.17, 0.09), reach=0.06, lift=0.06)
    car.stroke((0.76, 0.96), (0.7, 1.025), car.tail, steps=4)

    glass = car.cabin(
        screen=(0.73, -0.13),
        back=(-0.95, -2.12),
        roof=[(-0.95, 1.322), (-0.7, 1.36), (-0.42, 1.379), (-0.13, 1.346)],
        windows=[((0.44, -0.2), (-0.6, -0.6)), ((-0.68, -0.68), (-1.5, -0.94))],
        base=[(-2.12, 0.74), (-1.3, 0.79), (-0.5, 0.8), (0.73, 0.79)],
        rail=[(-0.95, 0.56), (-0.5, 0.59), (-0.13, 0.56)],
        drop=0.045,
        bow=(0.15, 0.07),
        rail_bow=(0.1, 0.04),
        flat=(0.84, 0.76),
        power=(2.2, 2.0),
        bulge=0.02,
    )
    car.wipers(glass)
    if bullitt:
        car.stroke((0.4, 0.985), (-1.44, 1.07), car.side, steps=14, material="chrome", width=0.014, lift=0.006)
    car.interior(seat=-0.24, spread=0.33, rear_bench=-1.0, height=0.14, width=0.42, material="interior")
    return car.finish(paint)


def mustang_gt():
    return mustang("ford-mustang-gt", "#c4161c", {"wheel": "ten", "metal": "rim", "barrel": "rim_dark"}, "gt")


def mustang_bullitt():
    return mustang("ford-mustang-bullitt", "#1c3a2a", {"wheel": "five", "metal": "rim_dark", "lip": "rim", "root": 0.085, "tip": 0.075, "cap": "rim_dark", "dish": 0.05}, "bullitt")


def mustang_mach_1():
    return mustang("ford-mustang-mach-1", "#5e6b73", {"wheel": "five", "metal": "rim_dark", "barrel": "rim_dark", "root": 0.07, "tip": 0.055, "dish": 0.05}, "mach")


CARS = {
    "ford-focus-tdci": focus_tdci,
    "ford-mondeo-tdci": mondeo,
    "ford-c-max-tdci": c_max,
    "ford-galaxy-tdci": galaxy,
    "ford-fiesta-ecoboost": fiesta,
    "ford-focus-ecoboost": focus_ecoboost,
    "ford-ecosport": ecosport,
    "ford-puma": puma,
    "ford-f-150-5-0": f150,
    "ford-transit-connect": transit_connect,
    "ford-mustang-gt": mustang_gt,
    "ford-mustang-bullitt": mustang_bullitt,
    "ford-mustang-mach-1": mustang_mach_1,
}
