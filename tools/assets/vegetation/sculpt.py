import math

import bmesh
import bpy
import numpy as np

import blend
import paint
from meshkit import unit
from noise import fbm3, ridged3

TEXTURE_SIZE = 512

ROCKS = {
    "rock-a": {
        "seed": 11,
        "extent": (0.5, 0.36, 0.4),
        "lumps": 0.55,
        "cuts": 11,
        "bias": (1.0, 1.0, 0.7),
        "depth": (0.6, 0.86),
        "strata": 0.0,
        "top": None,
        "triangles": 1500,
    },
    "rock-b": {
        "seed": 23,
        "extent": (0.5, 0.4, 0.3),
        "lumps": 0.4,
        "cuts": 9,
        "bias": (1.0, 1.0, 0.12),
        "depth": (0.62, 0.88),
        "strata": 0.035,
        "top": 0.62,
        "triangles": 1500,
    },
    "rock-c": {
        "seed": 37,
        "extent": (0.5, 0.47, 0.5),
        "lumps": 0.7,
        "cuts": 13,
        "bias": (1.0, 1.0, 0.85),
        "depth": (0.58, 0.85),
        "strata": 0.0,
        "top": None,
        "triangles": 1600,
    },
}


def rock_surface(directions, spec):
    seed = spec["seed"]
    rng = np.random.default_rng(seed)
    lumps = fbm3(directions * 1.4 + 5.0, 3, seed)
    points = directions * (1 - spec["lumps"] / 2 + spec["lumps"] * lumps)[:, None] * np.array(spec["extent"])
    cuts = []
    if spec["top"] is not None:
        cuts.append((unit([0.07, -0.05, 1.0]), spec["top"]))
    for _ in range(spec["cuts"]):
        cuts.append((unit(rng.normal(size=3) * np.array(spec["bias"])), rng.uniform(*spec["depth"])))
    cuts.append((np.array([0.0, 0.0, -1.0]), 0.8))
    for normal, depth in cuts:
        heights = points @ normal
        level = heights.max() * depth
        points = points - np.outer(np.clip(heights - level, 0, None) * 0.92, normal)
    if spec["strata"]:
        layers = np.sin(points[:, 2] * 34 + fbm3(points * 2.5, 2, seed + 3) * 5)
        points[:, :2] *= (1 + np.tanh(layers * 3) * spec["strata"])[:, None]
    outward = np.array([unit(row) for row in points / np.array(spec["extent"]) ** 2])
    medium = fbm3(points * 7, 4, seed + 50) - 0.5
    fine = fbm3(points * 30, 3, seed + 90) - 0.5
    cracks = np.clip(ridged3(points * 3.2, 3, seed + 7) - 0.86, 0, None) / 0.14
    points = points + outward * (medium * 0.07 + fine * 0.012 - cracks * 0.03)[:, None]
    points[:, 2] -= points[:, 2].min()
    span = max(np.ptp(points[:, 0]), np.ptp(points[:, 1]))
    middle = (points[:, :2].max(axis=0) + points[:, :2].min(axis=0)) / 2
    points[:, :2] -= middle
    return points / span


def icosphere(subdivisions):
    mesh = bmesh.new()
    bmesh.ops.create_icosphere(mesh, subdivisions=subdivisions, radius=1.0)
    points = np.array([vertex.co[:] for vertex in mesh.verts])
    faces = [tuple(vertex.index for vertex in face.verts) for face in mesh.faces]
    mesh.free()
    return points, faces


def stump_surface(seed):
    rng = np.random.default_rng(seed)
    columns, side_rows, top_rows = 360, 120, 56
    trunk, height = 0.25, 0.4
    theta = np.linspace(0, math.tau, columns, endpoint=False)
    root_count = 6
    root_angles = (np.arange(root_count) + rng.uniform(-0.3, 0.3, root_count)) * math.tau / root_count
    root_widths = rng.uniform(0.17, 0.3, root_count)
    root_reaches = rng.uniform(0.6, 1.0, root_count)
    root_reaches[rng.integers(root_count)] = 1.0
    lobe = np.zeros(columns)
    for angle, width, reach in zip(root_angles, root_widths, root_reaches):
        gap = np.angle(np.exp(1j * (theta - angle)))
        lobe = np.maximum(lobe, reach * np.exp(-((gap / width) ** 2)))
    body = trunk * (1 + 0.07 * np.sin(2 * theta + 1.3) + 0.05 * np.sin(3 * theta + 0.4) + 0.03 * np.sin(5 * theta))
    foot = body * (1.12 + 0.9 * lobe)
    circle = np.stack([np.cos(theta), np.sin(theta)], axis=1)

    def crown(relative):
        flat = circle * (body * relative)[:, None]
        waves = fbm3(np.column_stack([flat * 6, np.zeros(columns)]), 3, seed + 1) - 0.5
        splinter = np.clip(fbm3(np.column_stack([circle * 2.2, np.full(columns, 4.0)]), 2, seed + 2) - 0.55, 0, None) * 4
        edge = np.clip((relative - 0.72) / 0.28, 0, 1) ** 2
        rings = np.sin(body * relative * 230 + waves * 9) * 0.0022
        return height + waves * 0.03 + flat[:, 0] * 0.07 + splinter * 0.09 * edge + rings * (1 - edge)

    rim = crown(1.0)
    rows = []
    for row in range(side_rows):
        fraction = row / (side_rows - 1)
        z = rim * fraction**1.8
        flare = np.exp(-z / 0.065)
        radius = body + (foot - body) * flare
        points = np.column_stack([circle * radius[:, None], z])
        furrows = ridged3(points * np.array([15.0, 15.0, 2.4]), 3, seed + 5)
        coarse = fbm3(points * np.array([5.0, 5.0, 1.6]), 2, seed + 6) - 0.5
        fade = min(1.0, (1 - fraction) / 0.04)
        shift = (-(furrows**2) * 0.02 + coarse * 0.03) * fade
        points[:, :2] += circle * shift[:, None]
        rows.append(points)
    for row in range(top_rows):
        relative = 1 - (row + 1) / top_rows * 0.985
        rows.append(np.column_stack([circle * (body * relative)[:, None], crown(relative)]))
    points = np.concatenate(rows)
    total_rows = side_rows + top_rows
    faces = []
    for row in range(total_rows - 1):
        for column in range(columns):
            a = row * columns + column
            b = row * columns + (column + 1) % columns
            faces.append((a, b, b + columns, a + columns))
    centre = len(points)
    points = np.vstack([points, [[0.0, 0.0, float(rows[-1][:, 2].mean())]]])
    last = (total_rows - 1) * columns
    for column in range(columns):
        faces.append((last + column, last + (column + 1) % columns, centre))
    return points, faces


class Graph:
    def __init__(self, tree):
        self.tree = tree

    def node(self, kind, **settings):
        made = self.tree.nodes.new(kind)
        for key, value in settings.items():
            setattr(made, key, value)
        return made

    def link(self, source, target):
        self.tree.links.new(source, target)

    def ramp(self, source, stops, colour=False):
        made = self.node("ShaderNodeValToRGB")
        elements = made.color_ramp.elements
        while len(elements) < len(stops):
            elements.new(0.5)
        for element, (position, value) in zip(elements, stops):
            element.position = position
            element.color = (*value, 1.0) if colour else (value, value, value, 1.0)
        self.link(source, made.inputs["Fac"])
        return made.outputs["Color"]

    def mix(self, factor, first, second, blend_type="MIX"):
        made = self.node("ShaderNodeMix", data_type="RGBA", blend_type=blend_type)
        for socket, value in ((made.inputs[0], factor), (made.inputs[6], first), (made.inputs[7], second)):
            if isinstance(value, bpy.types.NodeSocket):
                self.link(value, socket)
            elif isinstance(value, (int, float)):
                socket.default_value = value
            else:
                socket.default_value = (*value, 1.0)
        return made.outputs[2]

    def noise(self, vector, scale, detail, roughness=0.55):
        made = self.node("ShaderNodeTexNoise")
        made.inputs["Scale"].default_value = scale
        made.inputs["Detail"].default_value = detail
        made.inputs["Roughness"].default_value = roughness
        self.link(vector, made.inputs["Vector"])
        return made.outputs["Fac"]

    def math(self, operation, first, second):
        made = self.node("ShaderNodeMath", operation=operation)
        for socket, value in ((made.inputs[0], first), (made.inputs[1], second)):
            if isinstance(value, bpy.types.NodeSocket):
                self.link(value, socket)
            else:
                socket.default_value = value
        return made.outputs[0]

    def emit(self, colour_socket):
        emission = self.node("ShaderNodeEmission")
        output = self.node("ShaderNodeOutputMaterial")
        self.link(colour_socket, emission.inputs["Color"])
        self.link(emission.outputs["Emission"], output.inputs["Surface"])


def source_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    graph = Graph(material.node_tree)
    geometry = graph.node("ShaderNodeNewGeometry")
    return material, graph, geometry


def rock_material():
    material, graph, geometry = source_material("rock-source")
    position = geometry.outputs["Position"]
    patches = graph.ramp(
        graph.noise(position, 2.6, 7.0, 0.62),
        [(0.28, (0.105, 0.102, 0.098)), (0.5, (0.2, 0.196, 0.188)), (0.74, (0.34, 0.33, 0.31))],
        colour=True,
    )
    grain = graph.ramp(graph.noise(position, 46.0, 3.0, 0.7), [(0.25, 0.72), (0.75, 1.22)])
    tone = graph.mix(1.0, patches, grain, "MULTIPLY")
    voronoi = graph.node("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
    voronoi.inputs["Scale"].default_value = 8.5
    warp = graph.node("ShaderNodeTexNoise")
    warp.inputs["Scale"].default_value = 3.0
    warp.inputs["Detail"].default_value = 3.0
    graph.link(position, warp.inputs["Vector"])
    warped = graph.node("ShaderNodeMix", data_type="RGBA")
    warped.inputs[0].default_value = 0.3
    graph.link(position, warped.inputs[6])
    graph.link(warp.outputs["Color"], warped.inputs[7])
    graph.link(warped.outputs[2], voronoi.inputs["Vector"])
    cracks = graph.ramp(voronoi.outputs["Distance"], [(0.0, 0.72), (0.018, 1.0)])
    tone = graph.mix(1.0, tone, cracks, "MULTIPLY")
    cavity = graph.ramp(geometry.outputs["Pointiness"], [(0.4, 0.5), (0.5, 1.0), (0.62, 1.4)])
    tone = graph.mix(1.0, tone, cavity, "MULTIPLY")
    separate = graph.node("ShaderNodeSeparateXYZ")
    graph.link(geometry.outputs["Normal"], separate.inputs[0])
    upward = graph.ramp(separate.outputs["Z"], [(0.55, 0.0), (0.8, 1.0)])
    blotches = graph.ramp(graph.noise(position, 7.0, 5.0, 0.7), [(0.56, 0.0), (0.62, 1.0)])
    lichen = graph.math("MULTIPLY", graph.math("MULTIPLY", upward, blotches), 0.5)
    tone = graph.mix(lichen, tone, (0.43, 0.43, 0.37))
    graph.emit(tone)
    return material


def stump_material():
    material, graph, geometry = source_material("stump-source")
    position = geometry.outputs["Position"]
    mapping = graph.node("ShaderNodeMapping")
    mapping.inputs[3].default_value = (13.0, 13.0, 1.6)
    graph.link(position, mapping.inputs[0])
    streaks = graph.noise(mapping.outputs[0], 1.0, 6.0, 0.65)
    bark = graph.ramp(
        streaks,
        [(0.3, (0.032, 0.022, 0.015)), (0.52, (0.095, 0.066, 0.043)), (0.75, (0.2, 0.15, 0.105))],
        colour=True,
    )
    cavity = graph.ramp(geometry.outputs["Pointiness"], [(0.4, 0.45), (0.5, 1.0), (0.6, 1.5)])
    bark = graph.mix(1.0, bark, cavity, "MULTIPLY")
    wave = graph.node("ShaderNodeTexWave", wave_type="RINGS", rings_direction="Z")
    wave.inputs["Scale"].default_value = 16.0
    wave.inputs["Distortion"].default_value = 2.2
    wave.inputs["Detail"].default_value = 3.0
    wave.inputs["Detail Scale"].default_value = 1.4
    graph.link(position, wave.inputs["Vector"])
    rings = graph.ramp(
        wave.outputs["Fac"],
        [(0.15, (0.23, 0.15, 0.085)), (0.6, (0.43, 0.31, 0.19)), (1.0, (0.5, 0.38, 0.25))],
        colour=True,
    )
    weather = graph.ramp(graph.noise(position, 5.0, 5.0, 0.7), [(0.35, 0.0), (0.75, 0.75)])
    wood = graph.mix(weather, rings, (0.27, 0.25, 0.22))
    wood = graph.mix(1.0, wood, graph.ramp(graph.noise(position, 60.0, 2.0), [(0.2, 0.8), (0.8, 1.15)]), "MULTIPLY")
    separate_normal = graph.node("ShaderNodeSeparateXYZ")
    graph.link(geometry.outputs["Normal"], separate_normal.inputs[0])
    separate_position = graph.node("ShaderNodeSeparateXYZ")
    graph.link(position, separate_position.inputs[0])
    facing = graph.ramp(separate_normal.outputs["Z"], [(0.5, 0.0), (0.8, 1.0)])
    raised = graph.ramp(separate_position.outputs["Z"], [(0.27, 0.0), (0.34, 1.0)])
    cut = graph.math("MULTIPLY", facing, raised)
    tone = graph.mix(cut, bark, wood)
    moss_patches = graph.ramp(graph.noise(position, 4.2, 4.0, 0.7), [(0.5, 0.0), (0.6, 1.0)])
    moss_facing = graph.ramp(separate_normal.outputs["Z"], [(0.15, 0.0), (0.6, 1.0)])
    moss_low = graph.ramp(separate_position.outputs["Z"], [(0.2, 1.0), (0.42, 0.25)])
    moss = graph.math("MULTIPLY", graph.math("MULTIPLY", moss_patches, moss_facing), moss_low)
    moss = graph.math("MULTIPLY", moss, 0.8)
    tone = graph.mix(moss, tone, (0.09, 0.16, 0.035))
    graph.emit(tone)
    return material


def activate(item):
    bpy.ops.object.select_all(action="DESELECT")
    item.select_set(True)
    bpy.context.view_layer.objects.active = item


def reduce(points, faces, name, triangles):
    low = blend.mesh_object(name, points, faces)
    activate(low)
    current = sum(len(polygon.vertices) - 2 for polygon in low.data.polygons)
    modifier = low.modifiers.new("reduce", "DECIMATE")
    modifier.ratio = triangles / current
    bpy.ops.object.modifier_apply(modifier="reduce")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")
    low.data.polygons.foreach_set("use_smooth", [True] * len(low.data.polygons))
    return low


def read_pixels(image):
    buffer = np.empty(TEXTURE_SIZE * TEXTURE_SIZE * 4, dtype=np.float32)
    image.pixels.foreach_get(buffer)
    return buffer.reshape(TEXTURE_SIZE, TEXTURE_SIZE, 4)


def bake_maps(high, low):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    target = bpy.data.materials.new("bake-target")
    target.use_nodes = True
    holder = target.node_tree.nodes.new("ShaderNodeTexImage")
    target.node_tree.nodes.active = holder
    low.data.materials.append(target)
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    baked = {}
    for kind in ("EMIT", "AO", "NORMAL"):
        image = bpy.data.images.new("bake-" + kind, TEXTURE_SIZE, TEXTURE_SIZE, alpha=False)
        if kind != "EMIT":
            image.colorspace_settings.name = "Non-Color"
        holder.image = image
        bpy.ops.object.bake(
            type=kind,
            use_selected_to_active=True,
            cage_extrusion=0.04,
            margin=16,
            use_clear=True,
        )
        baked[kind] = read_pixels(image)
    low.data.materials.clear()
    return baked


def finish(high, low, stem, glow, material_name):
    baked = bake_maps(high, low)
    shade = 0.5 + 0.5 * baked["AO"][..., :1]
    albedo = np.ones((TEXTURE_SIZE, TEXTURE_SIZE, 4), dtype=np.float32)
    albedo[..., :3] = paint.to_display(paint.to_linear(baked["EMIT"][..., :3]) * shade / glow)
    relief = np.ones((TEXTURE_SIZE, TEXTURE_SIZE, 4), dtype=np.float32)
    relief[..., :3] = baked["NORMAL"][..., :3]
    colour_image = paint.save_image(albedo, stem + "-albedo.png")
    normal_image = paint.save_image(relief, stem + "-normal.png", non_colour=True)
    low.data.materials.append(blend.image_material(material_name, colour_image, normal_image=normal_image, roughness=0.92))
    bpy.data.objects.remove(high)


def build_rock(name, stem):
    spec = ROCKS[name]
    directions, faces = icosphere(7)
    points = rock_surface(directions, spec)
    high = blend.mesh_object("source", points, faces)
    high.data.materials.append(rock_material())
    low = reduce(points, faces, name, spec["triangles"])
    finish(high, low, stem, 1.0, "rock")
    return []


def build_stump(stem):
    points, faces = stump_surface(71)
    high = blend.mesh_object("source", points, faces)
    high.data.materials.append(stump_material())
    low = reduce(points, faces, "stump", 1900)
    finish(high, low, stem, 1.7, "stump")
    return []


BUILDERS = {
    "rock-a": lambda stem: build_rock("rock-a", stem),
    "rock-b": lambda stem: build_rock("rock-b", stem),
    "rock-c": lambda stem: build_rock("rock-c", stem),
    "stump": build_stump,
}
