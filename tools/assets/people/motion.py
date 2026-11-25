import math

from mathutils import Matrix, Quaternion, Vector

frame_rate = 30
clip_frames = {"Idle": 120, "Walk": 30, "Run": 20, "Death": 60}
looping = {"Idle", "Walk", "Run"}

walk_gait = {
    "stance": 0.6,
    "reach": 0.29,
    "lead": 0.02,
    "strike": math.radians(18),
    "push": math.radians(38),
    "lift": 0.085,
    "skew": 1.0,
    "drop": 0.022,
    "bob": 0.018,
    "crest": 0.3,
    "lean": math.radians(3),
    "pelvis_yaw": math.radians(6),
    "pelvis_roll": math.radians(2.5),
    "chest_yaw": math.radians(5),
    "arm_swing": math.radians(24),
    "arm_bias": math.radians(2),
    "arm_hang": math.radians(7),
    "elbow": math.radians(12),
    "elbow_swing": math.radians(16),
    "sway": 0.014,
}

run_gait = {
    "stance": 0.38,
    "reach": 0.34,
    "lead": 0.03,
    "strike": math.radians(6),
    "push": math.radians(48),
    "lift": 0.27,
    "skew": 0.75,
    "drop": 0.075,
    "bob": 0.032,
    "crest": 0.44,
    "lean": math.radians(11),
    "pelvis_yaw": math.radians(9),
    "pelvis_roll": math.radians(3),
    "chest_yaw": math.radians(9),
    "arm_swing": math.radians(42),
    "arm_bias": math.radians(4),
    "arm_hang": math.radians(9),
    "elbow": math.radians(78),
    "elbow_swing": math.radians(14),
    "sway": 0.008,
}


def pitch(angle):
    return Matrix.Rotation(-angle, 3, "X")


def roll(angle):
    return Matrix.Rotation(angle, 3, "Y")


def yaw(angle):
    return Matrix.Rotation(angle, 3, "Z")


def smooth(amount):
    amount = min(1.0, max(0.0, amount))
    return amount * amount * (3 - 2 * amount)


def hermite(start, end, slope, amount):
    square = amount * amount
    cube = square * amount
    return (
        (2 * cube - 3 * square + 1) * start
        + (cube - 2 * square + amount) * slope
        + (-2 * cube + 3 * square) * end
        + (cube - square) * slope
    )


class Frame:
    def __init__(self, armature, unit):
        self.unit = unit
        bones = armature.data.bones
        self.rest = {bone.name: bone.matrix_local.to_3x3() for bone in bones}
        self.heads = {bone.name: bone.head_local.copy() for bone in bones}
        self.parents = {bone.name: bone.parent.name if bone.parent else None for bone in bones}
        self.order = [bone.name for bone in bones]
        self.thigh = (self.heads["LowerLegL"] - self.heads["UpperLegL"]).length
        self.shin = (self.heads["FootL"] - self.heads["LowerLegL"]).length
        self.ankle = self.heads["FootL"].z
        self.heel = Vector((-0.045 * unit, self.ankle))
        self.ball = Vector((0.11 * unit, self.ankle))

    def ankle_height(self, foot_pitch):
        return max(
            point.y * math.cos(foot_pitch) - point.x * math.sin(foot_pitch)
            for point in (self.heel, self.ball)
        )

    def hip_joint(self, side, offset, hips_turn):
        arm = self.heads["UpperLeg" + side] - self.heads["Hips"]
        return self.heads["Hips"] + offset + hips_turn @ arm

    def reach_height(self, forward, hip_forward):
        span = (self.thigh + self.shin) * 0.996
        return math.sqrt(max(1e-6, span * span - (forward - hip_forward) ** 2))

    def leg(self, pose, side, forward, height, foot_pitch, toe_pitch):
        joint = self.hip_joint(side, pose["offset"], pose["turns"]["Hips"])
        across = forward - (-joint.y)
        down = joint.z - height
        span = math.hypot(across, down)
        longest = (self.thigh + self.shin) * 0.999
        shortest = abs(self.thigh - self.shin) + 0.02
        line = math.atan2(across, down)
        span = min(longest, max(shortest, span))
        bend = math.acos(
            max(-1.0, min(1.0, (self.thigh**2 + span**2 - self.shin**2) / (2 * self.thigh * span)))
        )
        upper = line + bend
        knee_forward = self.thigh * math.sin(upper)
        knee_down = self.thigh * math.cos(upper)
        lower = math.atan2(span * math.sin(line) - knee_forward, span * math.cos(line) - knee_down)
        pose["turns"]["UpperLeg" + side] = pitch(upper)
        pose["turns"]["LowerLeg" + side] = pitch(lower)
        pose["turns"]["Foot" + side] = pitch(foot_pitch)
        pose["turns"]["Toes" + side] = pitch(toe_pitch)


def foot_track(frame, gait, beat):
    unit = frame.unit
    reach = gait["reach"] * unit
    lead = gait["lead"] * unit
    stance = gait["stance"]
    if beat < stance:
        step = beat / stance
        forward = reach * (1 - 2 * step) + lead
        tilt = gait["strike"] * (1 - smooth(step / 0.25)) - gait["push"] * smooth((step - 0.6) / 0.4)
        return forward, frame.ankle_height(tilt), tilt, max(tilt, 0.0)
    swing = (beat - stance) / (1 - stance)
    slope = -2 * reach * (1 - stance) / stance
    forward = hermite(-reach, reach, slope, swing) + lead
    tilt = -gait["push"] + (gait["push"] + gait["strike"]) * smooth(swing)
    lift = gait["lift"] * unit * math.sin(math.pi * swing ** gait["skew"])
    toes = tilt if tilt > 0 else tilt * smooth(swing / 0.3)
    return forward, frame.ankle_height(tilt) + lift, tilt, toes


def stride(frame, gait, beat):
    unit = frame.unit
    turn = 2 * math.pi * beat
    hips_turn = (
        yaw(-gait["pelvis_yaw"] * math.cos(turn))
        @ roll(-gait["pelvis_roll"] * math.sin(turn - 0.3))
        @ pitch(-gait["lean"] * 0.5)
    )
    pose = {"offset": Vector((0, 0, 0)), "turns": {"Hips": hips_turn}}
    tracks = {"L": foot_track(frame, gait, beat % 1.0), "R": foot_track(frame, gait, (beat + 0.5) % 1.0)}
    rise = -gait["drop"] * unit - gait["bob"] * unit * math.cos(4 * math.pi * (beat - gait["crest"]) + math.pi)
    for side, (forward, height, _, _) in tracks.items():
        joint = frame.hip_joint(side, Vector((0, 0, 0)), hips_turn)
        rise = min(rise, frame.reach_height(forward, -joint.y) + height - joint.z)
    pose["offset"] = Vector((gait["sway"] * unit * math.sin(turn - 0.3), 0, rise))
    for side, (forward, height, tilt, toes) in tracks.items():
        frame.leg(pose, side, forward, height, tilt, toes)
    twist = gait["chest_yaw"] * math.cos(turn)
    pose["turns"]["Spine"] = yaw(twist * 0.3) @ pitch(-gait["lean"] * 0.8)
    pose["turns"]["Chest"] = yaw(twist) @ pitch(-gait["lean"])
    pose["turns"]["Neck"] = yaw(twist * 0.4) @ pitch(-gait["lean"] * 0.5)
    pose["turns"]["Head"] = pitch(-gait["lean"] * 0.15)
    for side, sign in (("L", 1), ("R", -1)):
        wave = -sign * math.cos(turn)
        swing = gait["arm_swing"] * wave + gait["arm_bias"]
        rest_spread = math.radians(15.5)
        hang = roll(sign * (rest_spread - gait["arm_hang"]))
        flex = gait["elbow"] + gait["elbow_swing"] * (0.5 + 0.5 * wave)
        pose["turns"]["UpperArm" + side] = yaw(twist) @ pitch(swing) @ hang
        pose["turns"]["LowerArm" + side] = yaw(twist) @ pitch(swing + flex) @ roll(sign * rest_spread * 1.1)
        pose["turns"]["Hand" + side] = yaw(twist) @ pitch(swing + flex * 1.1) @ roll(sign * rest_spread * 1.1)
    return pose


def idle(frame, beat):
    unit = frame.unit
    breath = math.sin(4 * math.pi * beat)
    drift = math.sin(2 * math.pi * beat)
    hips_turn = yaw(math.radians(1.2) * drift)
    pose = {
        "offset": Vector((0.006 * unit * drift, 0, -0.006 * unit - 0.003 * unit * breath)),
        "turns": {"Hips": hips_turn},
    }
    for side in ("L", "R"):
        frame.leg(pose, side, 0.0, frame.ankle, 0.0, 0.0)
    pose["turns"]["Spine"] = pitch(math.radians(0.6) * breath)
    pose["turns"]["Chest"] = yaw(math.radians(-1.5) * drift) @ pitch(math.radians(1.6) * breath)
    pose["turns"]["Neck"] = yaw(math.radians(3) * drift) @ pitch(math.radians(-1))
    pose["turns"]["Head"] = yaw(math.radians(7) * drift) @ pitch(
        math.radians(-2) + math.radians(1.2) * math.sin(4 * math.pi * beat + 0.8)
    )
    for side, sign in (("L", 1), ("R", -1)):
        sway = math.radians(1.5) * math.sin(2 * math.pi * beat + sign * 0.6)
        rest_spread = math.radians(15.5)
        hang = roll(sign * (rest_spread - math.radians(5.5) - math.radians(0.7) * breath))
        pose["turns"]["UpperArm" + side] = pitch(sway - math.radians(2)) @ hang
        pose["turns"]["LowerArm" + side] = pitch(sway + math.radians(9)) @ roll(sign * rest_spread * 1.05)
        pose["turns"]["Hand" + side] = pitch(sway + math.radians(14)) @ roll(sign * rest_spread * 1.05)
    return pose


def limbs(turns, spec):
    for name, (lean, tilt, twist) in spec.items():
        turns[name] = yaw(math.radians(twist)) @ pitch(math.radians(lean)) @ roll(math.radians(tilt))


collapse_keys = [
    (
        0.0,
        (0.0, 0.0),
        {
            "Hips": (0, 0, 0),
            "Spine": (0, 0, 0),
            "Chest": (0, 0, 0),
            "Neck": (0, 0, 0),
            "Head": (-2, 0, 0),
            "UpperLegL": (0, 0, 0),
            "LowerLegL": (0, 0, 0),
            "FootL": (0, 0, 0),
            "UpperLegR": (0, 0, 0),
            "LowerLegR": (0, 0, 0),
            "FootR": (0, 0, 0),
            "UpperArmL": (-2, 10, 0),
            "LowerArmL": (9, 16, 0),
            "UpperArmR": (-2, -10, 0),
            "LowerArmR": (9, -16, 0),
        },
    ),
    (
        0.35,
        (0.07, -0.04),
        {
            "Hips": (10, 0, 6),
            "Spine": (16, 0, 4),
            "Chest": (24, 0, 0),
            "Neck": (30, 0, 0),
            "Head": (38, 0, -6),
            "UpperLegL": (22, 0, 0),
            "LowerLegL": (-24, 0, 0),
            "FootL": (4, 0, 0),
            "UpperLegR": (8, 0, 0),
            "LowerLegR": (-34, 0, 0),
            "FootR": (-10, 0, 0),
            "UpperArmL": (60, -12, 0),
            "LowerArmL": (110, -14, 0),
            "UpperArmR": (40, 22, 0),
            "LowerArmR": (95, 26, 0),
        },
    ),
    (
        0.75,
        (0.34, -0.3),
        {
            "Hips": (46, 0, 10),
            "Spine": (54, 0, 6),
            "Chest": (62, 0, 0),
            "Neck": (58, 0, 0),
            "Head": (50, 0, -8),
            "UpperLegL": (86, 0, 0),
            "LowerLegL": (6, 0, 0),
            "FootL": (30, 0, 0),
            "UpperLegR": (70, 0, 0),
            "LowerLegR": (-18, 0, 0),
            "FootR": (10, 0, 0),
            "UpperArmL": (130, -30, 0),
            "LowerArmL": (160, -30, 0),
            "UpperArmR": (118, 38, 0),
            "LowerArmR": (150, 40, 0),
        },
    ),
    (
        1.05,
        (0.52, -0.6),
        {
            "Hips": (90, 0, 8),
            "Spine": (92, 0, 5),
            "Chest": (94, 0, 0),
            "Neck": (88, 0, 0),
            "Head": (80, 0, -14),
            "UpperLegL": (112, 6, 0),
            "LowerLegL": (80, 6, 0),
            "FootL": (70, 0, 0),
            "UpperLegR": (102, -8, 0),
            "LowerLegR": (86, -8, 0),
            "FootR": (84, 0, 0),
            "UpperArmL": (104, -52, 0),
            "LowerArmL": (112, -64, 0),
            "UpperArmR": (100, 60, 0),
            "LowerArmR": (106, 78, 0),
        },
    ),
    (
        1.3,
        (0.56, -0.6),
        {
            "Hips": (88, 0, 8),
            "Spine": (89, 0, 5),
            "Chest": (90, 0, 0),
            "Neck": (92, 0, 0),
            "Head": (94, 0, -20),
            "UpperLegL": (92, 9, 0),
            "LowerLegL": (86, 9, 0),
            "FootL": (62, 0, 16),
            "UpperLegR": (91, -11, 0),
            "LowerLegR": (89, -12, 0),
            "FootR": (66, 0, -22),
            "UpperArmL": (91, -58, 0),
            "LowerArmL": (91, -72, 0),
            "UpperArmR": (91, 66, 0),
            "LowerArmR": (91, 88, 0),
        },
    ),
]


def collapse(frame, beat):
    time = beat * 2.0
    keys = collapse_keys
    index = 0
    while index < len(keys) - 2 and time > keys[index + 1][0]:
        index += 1
    start, end = keys[index], keys[index + 1]
    amount = smooth((time - start[0]) / (end[0] - start[0]))
    if index == 0:
        amount = amount * amount
    first = {}
    second = {}
    limbs(first, start[2])
    limbs(second, end[2])
    turns = {}
    for name in first:
        blended = first[name].to_quaternion().slerp(second[name].to_quaternion(), amount)
        turns[name] = blended.to_matrix()
    for side in ("L", "R"):
        turns["Toes" + side] = turns["Foot" + side]
        turns["Hand" + side] = turns["LowerArm" + side]
    back = start[1][0] + (end[1][0] - start[1][0]) * amount
    return {
        "offset": Vector((0, back * frame.unit, 0)),
        "turns": turns,
        "grounded": True,
    }


def pose_for(frame, clip, beat):
    if clip == "Walk":
        return stride(frame, walk_gait, beat)
    if clip == "Run":
        return stride(frame, run_gait, beat)
    if clip == "Death":
        return collapse(frame, beat)
    return idle(frame, beat)


def lowest_point(armature, body):
    import bpy

    graph = bpy.context.evaluated_depsgraph_get()
    graph.update()
    shaped = body.evaluated_get(graph)
    mesh = shaped.to_mesh()
    lowest = min((shaped.matrix_world @ vertex.co).z for vertex in mesh.vertices)
    shaped.to_mesh_clear()
    return lowest


def apply(frame, armature, body, pose):
    turns = pose["turns"]
    resolved = {}
    for name in frame.order:
        parent = frame.parents[name]
        resolved[name] = turns.get(name, resolved[parent] if parent else Matrix.Identity(3))
    for name in frame.order:
        parent = frame.parents[name]
        rest = frame.rest[name]
        inherited = resolved[parent] if parent else Matrix.Identity(3)
        basis = rest.inverted() @ inherited.inverted() @ resolved[name] @ rest
        bone = armature.pose.bones[name]
        bone.rotation_mode = "QUATERNION"
        turn = basis.to_quaternion()
        if bone.rotation_quaternion.dot(turn) < 0:
            turn.negate()
        bone.rotation_quaternion = turn
    hips = armature.pose.bones["Hips"]
    hips.location = frame.rest["Hips"].inverted() @ pose["offset"]
    if pose.get("grounded"):
        sink = lowest_point(armature, body)
        hips.location = frame.rest["Hips"].inverted() @ (pose["offset"] - Vector((0, 0, sink)))


def rest_pose(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = Quaternion()
        bone.location = Vector((0, 0, 0))


def record(frame, armature, body, clip):
    import bpy

    frames = clip_frames[clip]
    action = bpy.data.actions.new(clip)
    data = armature.animation_data_create()
    data.action = action
    rest_pose(armature)
    for step in range(frames + 1):
        beat = step / frames
        if clip in looping and step == frames:
            beat = 0.0
        apply(frame, armature, body, pose_for(frame, clip, beat))
        for bone in armature.pose.bones:
            bone.keyframe_insert("rotation_quaternion", frame=step)
        armature.pose.bones["Hips"].keyframe_insert("location", frame=step)
    data.action = None
    rest_pose(armature)
    return action


def shelve(armature, actions):
    data = armature.animation_data
    for action in actions:
        track = data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 0, action)
        strip.name = action.name
        if hasattr(strip, "action_slot") and strip.action_slot is None and action.slots:
            strip.action_slot = action.slots[0]
