import math
import sys

import bpy
from mathutils import Vector


def main():
    source, target, glow, kind = sys.argv[sys.argv.index("--") + 1 :][:4]
    glow = float(glow)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    scene = bpy.context.scene
    tint = (0.58 * 1.9, 0.5 * 1.9, 0.45 * 1.9) if kind == "rock" else (glow, glow, glow)
    for material in bpy.data.materials:
        tree = material.node_tree
        shader = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if not shader or not shader.inputs["Base Color"].links:
            continue
        origin = shader.inputs["Base Color"].links[0].from_socket
        scale = tree.nodes.new("ShaderNodeMix")
        scale.data_type = "RGBA"
        scale.blend_type = "MULTIPLY"
        scale.inputs[0].default_value = 1.0
        scale.inputs[7].default_value = (*tint, 1.0)
        tree.links.new(origin, scale.inputs[6])
        tree.links.new(scale.outputs[2], shader.inputs["Base Color"])
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for item in scene.objects:
        if item.type != "MESH":
            continue
        for corner in item.bound_box:
            point = item.matrix_world @ Vector(corner)
            low = Vector(map(min, low, point))
            high = Vector(map(max, high, point))
    span = max(high.x - low.x, high.y - low.y)
    floor = low.z + (0.3 * span if kind == "rock" else 0.0)
    bpy.ops.mesh.primitive_plane_add(size=span * 40, location=(0, 0, floor))
    ground = bpy.context.object
    earth = bpy.data.materials.new("earth")
    earth.use_nodes = True
    earth.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.19, 0.13, 1.0)
    ground.data.materials.append(earth)
    centre = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, (floor + high.z) / 2))
    radius = max(span, high.z - floor) * 0.75
    camera_data = bpy.data.cameras.new("camera")
    camera_data.lens = 60
    camera = bpy.data.objects.new("camera", camera_data)
    scene.collection.objects.link(camera)
    offset = Vector((math.cos(math.radians(-55)), math.sin(math.radians(-55)), 0.42)).normalized()
    camera.location = centre + offset * radius * 3.0
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(52), 0, math.radians(35))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.45, 0.6, 0.85, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.transparent_max_bounces = 96
    scene.render.resolution_x = 520
    scene.render.resolution_y = 520
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = target
    bpy.ops.render.render(write_still=True)


main()
