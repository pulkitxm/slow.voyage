import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

FRAME_RATE = 24
LEGS = ("Back.L", "Front.L", "Back.R", "Front.R")
LEG_CHAIN = ("Upper", "Lower", "Cannon", "Hoof")


def linear(code):
    def channel(value):
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    return tuple(channel(int(code[index : index + 2], 16) / 255) for index in (1, 3, 5))


def scene_point(point):
    return Vector((point[0], -point[1], point[2]))


def leg_bone(part, leg):
    side, hand = leg.split(".")
    return f"{side}{part}.{hand}"


def other_side(name):
    return name[:-2] + ".R" if name.endswith(".L") else name


def radius_triple(radius):
    if isinstance(radius, (int, float)):
        return (radius, radius, radius)
    if len(radius) == 2:
        return (radius[0], radius[1], radius[1])
    return tuple(radius)


def weight_map(bind):
    return {bind: 1.0} if isinstance(bind, str) else dict(bind)


def blend_weights(first, second, amount):
    mixed = {}
    for name, value in first.items():
        mixed[name] = mixed.get(name, 0) + value * (1 - amount)
    for name, value in second.items():
        mixed[name] = mixed.get(name, 0) + value * amount
    return {name: value for name, value in mixed.items() if value > 1e-4}


def spline(values, steps):
    padded = np.vstack([values[0], values, values[-1]])
    rows = []
    for index in range(len(values) - 1):
        before, start, end, after = padded[index : index + 4]
        for step in range(steps):
            t = step / steps
            rows.append(
                0.5
                * (
                    2 * start
                    + (end - before) * t
                    + (2 * before - 5 * start + 4 * end - after) * t * t
                    + (3 * start - before - 3 * end + after) * t * t * t
                )
            )
    rows.append(values[-1])
    return np.array(rows)


class Shape:
    def __init__(self, palette):
        self.palette = {name: linear(code) for name, code in palette.items()}
        self.points = []
        self.faces = []
        self.tints = []
        self.binds = []

    def tint(self, colour):
        return self.palette[colour] if isinstance(colour, str) else colour

    def loft(self, keys, sides=8, steps=2, ref=(1, 0, 0), mirror=False, ruffle=None):
        centres = spline(np.array([scene_point(key[0]) for key in keys], dtype=float), steps)
        radii = np.maximum(
            spline(np.array([radius_triple(key[1]) for key in keys], dtype=float), steps), 1e-4
        )
        count = len(centres)
        reference = np.array(scene_point(ref), dtype=float)
        for side in (1, -1) if mirror else (1,):
            start = len(self.points)
            for ring in range(count):
                tangent = centres[min(ring + 1, count - 1)] - centres[max(ring - 1, 0)]
                tangent /= np.linalg.norm(tangent)
                across = reference - tangent * np.dot(reference, tangent)
                across /= np.linalg.norm(across)
                along = np.cross(tangent, across)
                key = min(ring // steps, len(keys) - 2)
                amount = ring / steps - key
                first = np.array(self.tint(keys[key][2]))
                second = np.array(self.tint(keys[key + 1][2]))
                tint = tuple(first + (second - first) * amount)
                bind = blend_weights(
                    weight_map(keys[key][3]), weight_map(keys[key + 1][3]), amount
                )
                if side < 0:
                    bind = {other_side(name): value for name, value in bind.items()}
                for corner in range(sides):
                    angle = 2 * math.pi * corner / sides
                    reach = radii[ring][1] if math.sin(angle) >= 0 else radii[ring][2]
                    swell = 1 + ruffle(ring, corner) if ruffle else 1
                    point = (
                        centres[ring]
                        + across * radii[ring][0] * math.cos(angle) * swell
                        + along * reach * math.sin(angle) * swell
                    )
                    self.points.append((point[0] * side, point[1], point[2]))
                    self.tints.append(tint)
                    self.binds.append(bind)
            for ring in range(count - 1):
                for corner in range(sides):
                    following = (corner + 1) % sides
                    face = (
                        start + ring * sides + corner,
                        start + ring * sides + following,
                        start + (ring + 1) * sides + following,
                        start + (ring + 1) * sides + corner,
                    )
                    self.faces.append(face if side > 0 else face[::-1])
            for ring, flip in ((0, True), (count - 1, False)):
                hub = len(self.points)
                self.points.append((centres[ring][0] * side, centres[ring][1], centres[ring][2]))
                self.tints.append(self.tints[start + ring * sides])
                self.binds.append(self.binds[start + ring * sides])
                for corner in range(sides):
                    following = (corner + 1) % sides
                    face = (hub, start + ring * sides + corner, start + ring * sides + following)
                    if flip != (side < 0):
                        face = face[::-1]
                    self.faces.append(face)

    def ball(self, centre, radius, colour, bind, mirror=True, sides=6):
        x, f, z = centre
        self.loft(
            [
                ((x, f, z - radius), radius * 0.2, colour, bind),
                ((x, f, z - radius * 0.6), radius * 0.8, colour, bind),
                ((x, f, z), radius, colour, bind),
                ((x, f, z + radius * 0.6), radius * 0.8, colour, bind),
                ((x, f, z + radius), radius * 0.2, colour, bind),
            ],
            sides=sides,
            steps=1,
            mirror=mirror,
        )


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FRAME_RATE


def build_mesh(name, shape, repaint=None, crease=40):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(shape.points, [], shape.faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(crease))
    colours = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    normals = [vertex.normal.copy() for vertex in mesh.vertices]
    for polygon in mesh.polygons:
        for loop in polygon.loop_indices:
            vertex = mesh.loops[loop].vertex_index
            tint = shape.tints[vertex]
            if repaint:
                tint = repaint(polygon.center, polygon.normal, tint)
            shade = 0.74 + 0.26 * (normals[vertex].z * 0.5 + 0.5)
            colours.data[loop].color = (tint[0] * shade, tint[1] * shade, tint[2] * shade, 1)
    body = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(body)
    groups = {}
    for vertex, bind in enumerate(shape.binds):
        strongest = sorted(bind.items(), key=lambda item: -item[1])[:4]
        total = sum(value for _, value in strongest)
        for bone, value in strongest:
            if bone not in groups:
                groups[bone] = body.vertex_groups.new(name=bone)
            groups[bone].add([vertex], value / total, "REPLACE")
    material = bpy.data.materials.new("Coat")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 0.88
    shader.inputs["Metallic"].default_value = 0
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Col"
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1
    mix.inputs[7].default_value = (1, 1, 1, 1)
    material.node_tree.links.new(attribute.outputs["Color"], mix.inputs[6])
    material.node_tree.links.new(mix.outputs[2], shader.inputs["Base Color"])
    mesh.materials.append(material)
    return body


def set_tint_factor(body, factor):
    for node in body.data.materials[0].node_tree.nodes:
        if node.bl_idname == "ShaderNodeMix":
            node.inputs[7].default_value = (factor, factor, factor, 1)


class Rig:
    def __init__(self, bones):
        self.order = []
        self.parent = {}
        self.head = {}
        self.tail = {}
        for name, head, tail, parent in bones:
            names = (name, other_side(name)) if name.endswith(".L") else (name,)
            for index, bone in enumerate(names):
                flip = -1 if index else 1
                self.order.append(bone)
                self.parent[bone] = other_side(parent) if index and parent else parent
                self.head[bone] = scene_point((head[0] * flip, head[1], head[2]))
                self.tail[bone] = scene_point((tail[0] * flip, tail[1], tail[2]))
        self.rest = {}
        self.armature = None

    def build(self, name, body):
        data = bpy.data.armatures.new(name + "Rig")
        armature = bpy.data.objects.new(name + "Rig", data)
        bpy.context.scene.collection.objects.link(armature)
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode="EDIT")
        for bone in self.order:
            edit = data.edit_bones.new(bone)
            edit.head = self.head[bone]
            edit.tail = self.tail[bone]
            if self.parent[bone]:
                edit.parent = data.edit_bones[self.parent[bone]]
        bpy.ops.object.mode_set(mode="OBJECT")
        for bone in self.order:
            self.rest[bone] = data.bones[bone].matrix_local.copy()
        body.parent = armature
        modifier = body.modifiers.new("Armature", "ARMATURE")
        modifier.object = armature
        for bone in armature.pose.bones:
            bone.rotation_mode = "QUATERNION"
        self.armature = armature
        return armature

    def solve(self, turns, shifts):
        locals_, worlds = {}, {}
        for bone in self.order:
            pitch, yaw, roll = turns.get(bone, (0, 0, 0))
            head = self.head[bone]
            local = (
                Matrix.Translation(scene_point(shifts.get(bone, (0, 0, 0))))
                @ Matrix.Translation(head)
                @ Matrix.Rotation(yaw, 4, "Z")
                @ Matrix.Rotation(-pitch, 4, "X")
                @ Matrix.Rotation(roll, 4, "Y")
                @ Matrix.Translation(-head)
            )
            locals_[bone] = local
            parent = self.parent[bone]
            worlds[bone] = worlds[parent] @ local if parent else local
        return locals_, worlds


def wrap(angle):
    return (angle + math.pi) % (2 * math.pi) - math.pi


def direction(vector):
    return math.atan2(vector[1], vector[0])


def turned(vector, angle):
    cos, sin = math.cos(angle), math.sin(angle)
    return np.array([vector[0] * cos - vector[1] * sin, vector[0] * sin + vector[1] * cos])


def place_leg(rig, joints, leg, turns, worlds, step):
    drift, rise, lean, tilt = step
    upper = leg_bone("Upper", leg)
    parent = worlds[rig.parent[upper]]
    side = -1 if leg.endswith(".R") else 1
    hip, knee, hock, fetlock = (np.array(joint[1:]) for joint in joints[:4])
    goal = parent.inverted() @ scene_point(
        (joints[3][0] * side, joints[3][1] + drift, joints[3][2] + rise)
    )
    forward = parent.to_3x3() @ Vector((0, -1, 0))
    carried = math.atan2(forward.z, -forward.y)
    lean -= carried
    tilt -= carried
    target = np.array([-goal.y, goal.z]) - turned(fetlock - hock, lean)
    first = np.linalg.norm(knee - hip)
    second = np.linalg.norm(hock - knee)
    span = target - hip
    distance = min(max(np.linalg.norm(span), abs(first - second) + 1e-4), first + second - 1e-4)
    bend = np.sign(np.cross(knee - hip, hock - knee)) or 1.0
    corner = math.acos(
        max(-1, min(1, (first**2 + distance**2 - second**2) / (2 * first * distance)))
    )
    thigh = direction(span) - bend * corner
    joint = hip + first * np.array([math.cos(thigh), math.sin(thigh)])
    reach = hip + span / np.linalg.norm(span) * distance
    upper_turn = wrap(thigh - direction(knee - hip))
    lower_total = wrap(direction(reach - joint) - direction(hock - knee))
    turns[upper] = (upper_turn, 0, 0)
    turns[leg_bone("Lower", leg)] = (wrap(lower_total - upper_turn), 0, 0)
    turns[leg_bone("Cannon", leg)] = (wrap(lean - lower_total), 0, 0)
    turns[leg_bone("Hoof", leg)] = (wrap(tilt - lean), 0, 0)


def pose_matrices(rig, joints, frame):
    turns = dict(frame.get("turns", {}))
    shifts = frame.get("shifts", {})
    steps = frame.get("steps")
    if steps:
        _, worlds = rig.solve(turns, shifts)
        for leg in LEGS:
            place_leg(rig, joints[leg.split(".")[0]], leg, turns, worlds, steps[leg])
    return rig.solve(turns, shifts)


def record_clip(rig, joints, name, seconds, pose):
    armature = rig.armature
    frames = max(2, round(seconds * FRAME_RATE))
    action = bpy.data.actions.new(name)
    armature.animation_data_create()
    armature.animation_data.action = action
    previous = {}
    for frame in range(frames + 1):
        locals_, _ = pose_matrices(rig, joints, pose(frame / frames))
        for bone in armature.pose.bones:
            rest = rig.rest[bone.name]
            basis = rest.inverted() @ locals_[bone.name] @ rest
            turn = basis.to_quaternion()
            if bone.name in previous and previous[bone.name].dot(turn) < 0:
                turn.negate()
            previous[bone.name] = turn.copy()
            bone.rotation_quaternion = turn
            bone.location = basis.to_translation()
            bone.keyframe_insert("rotation_quaternion", frame=frame)
            bone.keyframe_insert("location", frame=frame)
    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    track = armature.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    armature.animation_data.action = None
    for bone in armature.pose.bones:
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.location = (0, 0, 0)
    return action


def show_pose(rig, joints, frame):
    locals_, _ = pose_matrices(rig, joints, frame)
    for bone in rig.armature.pose.bones:
        rest = rig.rest[bone.name]
        basis = rest.inverted() @ locals_[bone.name] @ rest
        bone.rotation_quaternion = basis.to_quaternion()
        bone.location = basis.to_translation()
    bpy.context.view_layer.update()


def ease(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def wave(cycle, turn=0.0):
    return math.sin(2 * math.pi * (cycle + turn))


def pulse(cycle, centre, width=0.035):
    gap = (cycle - centre + 0.5) % 1 - 0.5
    return math.exp(-((gap / width) ** 2))


def footfall(phase, gait, height, front):
    duty, stride, lift = gait["duty"], gait["stride"] * height, gait["lift"] * height
    follow = gait.get("follow", 0.75)
    if phase < duty:
        drift = stride * (0.5 - phase / duty)
        return (drift, 0, follow * math.atan2(drift, height), 0)
    swing = (phase - duty) / (1 - duty)
    drift = stride * (ease(swing) - 0.5)
    fold = gait["fold_front"] if front else gait["fold_back"]
    arc = math.sin(math.pi * swing)
    return (
        drift,
        lift * arc,
        follow * math.atan2(drift, height) - fold * arc,
        -gait.get("toe", 0.6) * arc * (1 - 0.6 * swing),
    )


def stepping(cycle, gait, heights):
    return {
        leg: footfall(
            (cycle + gait["phases"][leg]) % 1,
            gait,
            heights[leg.split(".")[0]],
            leg.startswith("Front"),
        )
        for leg in LEGS
    }


def standing_steps():
    return {leg: (0, 0, 0, 0) for leg in LEGS}


def tail_swing(turns, count, cycle, reach, lag=0.12, droop=0.0):
    for index in range(count):
        turns[f"Tail{index + 1}"] = (droop, reach * wave(cycle, -lag * index), 0)


class Motion:
    def __init__(self, spec, rig):
        self.spec = spec
        self.rig = rig
        self.joints = spec["joints"]
        self.heights = {side: self.joints[side][0][2] for side in ("Back", "Front")}
        self.tall = self.heights["Front"]
        self.tails = spec["tail_bones"]
        self.trunk = spec.get("trunk_bones", 0)
        self.graze = self.reach_ground()
        self.slump = 0.0
        self.slump = self.settle_head()

    def muzzle_height(self, amount):
        turns = {bone: (angle * amount, 0, 0) for bone, angle in self.spec.get("graze", {}).items()}
        _, worlds = self.rig.solve(turns, {})
        return (worlds["Head"] @ scene_point(self.spec["muzzle"])).z

    def reach_ground(self):
        if not self.spec.get("graze"):
            return 1.0
        floor = self.spec.get("graze_floor", 0.05) * self.tall
        amounts = [index / 60 for index in range(61)]
        for amount in amounts:
            if self.muzzle_height(amount) <= floor:
                return amount
        return min(amounts, key=self.muzzle_height)

    def settle_head(self):
        if "slump" in self.spec:
            return self.spec["slump"]
        cheek = self.spec.get("cheek", 0.3 * self.spec["girth"])
        for index in range(46):
            self.slump = index / 50
            frame = self.death(1.0)
            _, worlds = self.rig.solve(frame["turns"], frame["shifts"])
            if (worlds["Head"] @ scene_point(self.spec["muzzle"])).z <= cheek:
                break
        return self.slump

    def trunk_sway(self, turns, cycle, reach):
        for index in range(self.trunk):
            turns[f"Trunk{index + 1}"] = (
                reach * 0.5 * wave(cycle * 2, -0.1 * index),
                0,
                reach * wave(cycle, -0.12 * index),
            )

    def ears(self, turns, flap):
        turns["Ear.L"] = (0, -flap, 0)
        turns["Ear.R"] = (0, flap, 0)

    def walk(self, cycle):
        gait = self.spec["walk"]
        tall = self.tall
        nod = gait.get("nod", 0.05)
        turns = {
            "Body": (0.006 * wave(cycle * 2, 0.1), 0, 0.012 * wave(cycle)),
            "Pelvis": (0, 0.03 * wave(cycle, 0.25), 0.02 * wave(cycle, 0.5)),
            "Chest": (0, -0.025 * wave(cycle, 0.25), 0),
            "Neck1": (nod * wave(cycle * 2, 0.2), 0.02 * wave(cycle), 0),
            "Neck2": (nod * 0.5 * wave(cycle * 2, 0.3), 0, 0),
            "Head": (-nod * 1.2 * wave(cycle * 2, 0.25), 0, 0),
        }
        tail_swing(turns, self.tails, cycle, gait.get("tail", 0.12))
        self.trunk_sway(turns, cycle, 0.07)
        if self.spec.get("ear_flap"):
            self.ears(turns, 0.12 + 0.12 * wave(cycle))
        shifts = {
            "Body": (
                0.012 * tall * wave(cycle, 0.3),
                0,
                tall * (-gait["drop"] + gait["bob"] * wave(cycle * 2, 0.15)),
            )
        }
        return {"turns": turns, "shifts": shifts, "steps": stepping(cycle, gait, self.heights)}

    def run(self, cycle):
        gait = self.spec["run"]
        tall = self.tall
        rock = gait["rock"]
        tilt = rock * math.cos(2 * math.pi * (cycle - 0.16))
        flex = gait["flex"] * wave(cycle, -0.7)
        turns = {
            "Body": (tilt, 0, 0),
            "Pelvis": (flex, 0, 0),
            "Chest": (-flex * 0.5, 0, 0),
            "Neck1": (-tilt * 0.7 + gait.get("stretch", -0.12), 0, 0),
            "Neck2": (-tilt * 0.3, 0, 0),
            "Head": (0.5 * tilt + gait.get("lift_head", 0.1), 0, 0),
        }
        for index in range(self.tails):
            turns[f"Tail{index + 1}"] = (
                -gait.get("tail_lift", 0.25) + 0.12 * wave(cycle, -0.15 * index),
                0,
                0,
            )
        self.trunk_sway(turns, cycle, 0.12)
        if self.spec.get("ear_flap"):
            self.ears(turns, 0.3 + 0.2 * wave(cycle * 2))
        else:
            turns["Ear.L"] = (-0.35, 0, 0)
            turns["Ear.R"] = (-0.35, 0, 0)
        shifts = {"Body": (0, 0, tall * (-gait["drop"] + gait["bounce"] * wave(cycle, -0.55)))}
        return {"turns": turns, "shifts": shifts, "steps": stepping(cycle, gait, self.heights)}

    def idle(self, cycle):
        tall = self.tall
        look = self.spec.get("look", 0.16)
        turns = {
            "Chest": (0.008 * wave(cycle * 3), 0, 0),
            "Neck1": (0.03 * wave(cycle, 0.3), look * wave(cycle), 0),
            "Neck2": (0.03 * wave(cycle * 2, 0.1), look * 0.5 * wave(cycle, -0.08), 0),
            "Head": (0.04 * wave(cycle, 0.6), look * 0.7 * wave(cycle, -0.15), 0),
        }
        swish = pulse(cycle, 0.2, 0.12) + pulse(cycle, 0.7, 0.1)
        tail_swing(turns, self.tails, cycle * 6, self.spec.get("swish", 0.35) * swish + 0.03)
        if self.spec.get("ear_flap"):
            self.ears(turns, 0.18 + 0.3 * ease(0.5 + 0.5 * wave(cycle * 2)))
            for index in range(self.trunk):
                turns[f"Trunk{index + 1}"] = (
                    0.06 * wave(cycle, -0.1 * index),
                    0,
                    0.07 * wave(cycle * 2, -0.12 * index),
                )
        else:
            turns["Ear.L"] = (-0.5 * pulse(cycle, 0.3) - 0.4 * pulse(cycle, 0.36), 0, 0)
            turns["Ear.R"] = (-0.5 * pulse(cycle, 0.78), 0, 0)
        shifts = {
            "Body": (0.008 * tall * wave(cycle), 0, tall * (-0.012 + 0.004 * wave(cycle * 3)))
        }
        return {"turns": turns, "shifts": shifts, "steps": standing_steps()}

    def eating(self, cycle):
        tall = self.tall
        turns = {}
        if self.trunk:
            gather = ease(0.5 - 0.5 * math.cos(2 * math.pi * cycle * 2))
            for index in range(self.trunk):
                share = (index + 1) / self.trunk
                turns[f"Trunk{index + 1}"] = (
                    0.1 * (1 - gather) - 0.62 * gather * (0.5 + share),
                    0,
                    0.05 * wave(cycle, -0.1 * index) * (1 - gather),
                )
            turns["Head"] = (0.08 * gather, 0.03 * wave(cycle), 0)
            turns["Neck1"] = (0.03 * gather, 0, 0)
            self.ears(turns, 0.15 + 0.25 * ease(0.5 + 0.5 * wave(cycle * 3)))
        else:
            lowered = self.graze * (0.97 + 0.03 * wave(cycle * 2))
            for bone, angle in self.spec["graze"].items():
                turns[bone] = (angle * lowered, 0, 0)
            chew = 0.035 * wave(cycle * 12) * (0.5 + 0.5 * wave(cycle * 2, 0.2))
            pitch = turns.get("Head", (0, 0, 0))[0]
            turns["Head"] = (pitch + chew, 0.1 * wave(cycle, 0.1), 0)
            pitch = turns.get("Neck1", (0, 0, 0))[0]
            turns["Neck1"] = (pitch, 0.1 * wave(cycle), 0)
            turns["Ear.L"] = (-0.4 * pulse(cycle, 0.55), 0, 0)
            turns["Ear.R"] = (-0.4 * pulse(cycle, 0.15), 0, 0)
        swish = pulse(cycle, 0.4, 0.1) + pulse(cycle, 0.85, 0.08)
        tail_swing(turns, self.tails, cycle * 8, self.spec.get("swish", 0.35) * swish + 0.03)
        shifts = {"Body": (0, 0, tall * (-0.012 + 0.003 * wave(cycle * 4)))}
        return {"turns": turns, "shifts": shifts, "steps": standing_steps()}

    def death(self, cycle):
        spec = self.spec
        landing = 0.68
        fall = min(1, cycle / landing) ** 2.2
        settle = ease((cycle - landing * 0.5) / (1 - landing * 0.5))
        rebound = (
            0.05 * math.sin(math.pi * (cycle - landing) / (1 - landing)) if cycle > landing else 0
        )
        roll = (math.pi / 2) * fall - rebound
        girth = spec["girth"]
        stance = self.joints["Back"][3][0]
        lift = max(
            stance * math.sin(roll),
            girth * math.sin(roll) - spec["belly"] * math.cos(roll),
            0,
        )
        slump = self.slump * settle
        limp = ease(cycle / landing)
        turns = {
            "Root": (0, 0, roll),
            "Neck1": (-0.25 * limp, slump * 0.6, 0),
            "Neck2": (-0.1 * limp, slump * 0.4, 0),
            "Head": (0.2 * limp, slump * 0.3, 0),
            "Pelvis": (0, 0.05 * limp, 0),
        }
        for leg, bend in (("Front.L", 0.3), ("Front.R", 0.5), ("Back.L", -0.25), ("Back.R", -0.45)):
            fold = 1 if leg.startswith("Front") else -1
            turns[leg_bone("Upper", leg)] = (bend * limp, 0, 0)
            turns[leg_bone("Lower", leg)] = (-0.35 * fold * limp, 0, 0)
            turns[leg_bone("Cannon", leg)] = (-0.3 * limp, 0, 0)
            turns[leg_bone("Hoof", leg)] = (-0.4 * limp, 0, 0)
        for index in range(self.tails):
            turns[f"Tail{index + 1}"] = (0, 0.2 * settle, 0)
        for index in range(self.trunk):
            turns[f"Trunk{index + 1}"] = (0.12 * limp, 0.12 * settle, 0)
        if spec.get("ear_flap"):
            turns["Ear.L"] = (0, 0.9 * settle, 0)
            turns["Ear.R"] = (0, -0.9 * settle, 0)
        return {"turns": turns, "shifts": {"Root": (0, 0, lift)}}

    def clips(self):
        spec = self.spec
        return [
            ("Walk", spec["walk"]["period"], self.walk),
            ("Run", spec["run"]["period"], self.run),
            ("Idle", 4.0, self.idle),
            ("Eating", 5.0, self.eating),
            ("Death", 1.0, self.death),
        ]


def leg_joints(top, height_ratios, drifts):
    x, f, z = top
    joints = [top]
    for ratio, drift in zip(height_ratios, drifts):
        joints.append((x, f + drift * z, z * ratio))
    return joints


def leg_bones(side, joints, parent):
    names = [f"{side}{part}.L" for part in LEG_CHAIN] + [f"{side}Toe.L"]
    bones = []
    for index in range(4):
        bones.append((names[index], joints[index], joints[index + 1], parent if index == 0 else names[index - 1]))
    toe = joints[4]
    bones.append((names[4], toe, (toe[0], toe[1] + 0.3 * joints[3][2] + 0.03, toe[2]), names[3]))
    return bones


def leg_keys(side, joints, girth, parent, coat, sock, hoof):
    upper, lower, cannon, foot = (f"{side}{part}.L" for part in LEG_CHAIN)
    top, knee, hock, fetlock, toe = joints
    x = top[0]
    thigh, mid, slim, ankle, sole = (
        girth["thigh"],
        girth["knee"],
        girth["cannon"],
        girth["fetlock"],
        girth["hoof"],
    )
    inset = girth.get("inset", 0.75)
    hoof_height = girth.get("hoof_height", 0.4) * fetlock[2]

    def between(first, second, amount):
        return tuple(a + (b - a) * amount for a, b in zip(first, second))

    def scaled(radius, amount):
        return tuple(value * amount for value in radius_triple(radius))

    return [
        ((x * inset, top[1], top[2] + thigh[1] * 0.35), scaled(thigh, 0.8), coat, parent),
        (between((x * 0.9, top[1], top[2]), knee, 0.3), thigh, coat, {parent: 0.6, upper: 0.4}),
        (knee, between(radius_triple(thigh), radius_triple(mid), 0.45), coat, {upper: 0.6, lower: 0.4}),
        (between(knee, hock, 0.55), between(radius_triple(thigh), radius_triple(mid), 0.8), coat, lower),
        (hock, mid, sock, {lower: 0.5, cannon: 0.5}),
        (between(hock, fetlock, 0.5), slim, sock, cannon),
        (fetlock, ankle, sock, {cannon: 0.5, foot: 0.5}),
        ((x, between(fetlock, toe, 0.45)[1], hoof_height * 1.15), scaled(ankle, 0.95), sock, foot),
        ((x, between(fetlock, toe, 0.6)[1], hoof_height), scaled(sole, 0.88), hoof, foot),
        ((x, between(fetlock, toe, 0.7)[1], 0), sole, hoof, foot),
    ]


def assemble(spec):
    reset_scene()
    shape = Shape(spec["palette"])
    spec["sculpt"](shape, spec)
    for side in ("Back", "Front"):
        parent = "Pelvis" if side == "Back" else "Chest"
        shape.loft(
            leg_keys(
                side,
                spec["joints"][side],
                spec["legs"][side],
                parent,
                spec["legs"].get("coat", "coat"),
                spec["legs"].get("sock", "coat"),
                "hoof",
            ),
            sides=spec["legs"].get("sides", 8),
            steps=2,
            mirror=True,
        )
    body = build_mesh(spec["name"], shape, spec.get("repaint"), spec.get("crease", 40))
    bones = list(spec["bones"])
    bones += leg_bones("Back", spec["joints"]["Back"], "Pelvis")
    bones += leg_bones("Front", spec["joints"]["Front"], "Chest")
    rig = Rig(bones)
    rig.build(spec["name"], body)
    return body, rig


def export_model(body, rig, path):
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig.armature.select_set(True)
    bpy.context.scene.frame_set(0)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_skins=True,
        export_def_bones=False,
        export_optimize_animation_size=False,
        export_vertex_color="MATERIAL",
        export_all_vertex_colors=False,
        export_normals=True,
        export_texcoords=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
    )
