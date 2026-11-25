import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import quadruped
import species


def frame_camera(camera, centre, span, yaw, pitch):
    distance = span * 5.6
    offset = Vector(
        (
            math.sin(yaw) * math.cos(pitch) * distance,
            -math.cos(yaw) * math.cos(pitch) * distance,
            math.sin(pitch) * distance,
        )
    )
    camera.location = centre + offset
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()


def render_tiles(spec, rig, motion, folder):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 560
    scene.render.resolution_y = 420
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.82, 0.9, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    ground_mesh = bpy.data.meshes.new("Ground")
    ground_mesh.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("Ground", ground_mesh)
    turf = bpy.data.materials.new("Turf")
    turf.use_nodes = True
    turf.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.3, 0.12, 1)
    ground_mesh.materials.append(turf)
    scene.collection.objects.link(ground)
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.lens = 60
    scene.collection.objects.link(camera)
    scene.camera = camera
    tall = spec["joints"]["Front"][0][2]
    centre = Vector((0, -spec.get("view_shift", 0.15) * tall, tall * 0.78))
    span = tall * spec.get("view_span", 1.0)
    front, flank, rear = math.radians(-35), math.radians(-90), math.radians(-150)
    shots = [
        ("rest", None, front, 0.2),
        ("flank", None, flank, 0.05),
        ("rear", None, rear, 0.3),
        ("walk-a", motion.walk(0.1), flank, 0.05),
        ("walk-b", motion.walk(0.45), front, 0.2),
        ("run-a", motion.run(0.2), flank, 0.05),
        ("run-b", motion.run(0.7), flank, 0.05),
        ("idle", motion.idle(0.3), front, 0.2),
        ("eating", motion.eating(0.3), flank, 0.05),
        ("death-a", motion.death(0.45), math.radians(-20), 0.25),
        ("death-b", motion.death(1.0), math.radians(-35), 0.5),
        ("above", None, math.radians(-60), 1.0),
    ]
    tiles = []
    for label, frame, yaw, pitch in shots:
        quadruped.show_pose(rig, spec["joints"], frame or {})
        frame_camera(camera, centre, span, yaw, pitch)
        scene.render.filepath = os.path.join(folder, f"{spec['name']}-{label}.png")
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(scene.render.filepath)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)
        tiles.append(pixels)
        bpy.data.images.remove(image)
        os.remove(scene.render.filepath)
    quadruped.show_pose(rig, spec["joints"], {})
    columns = 4
    rows = [np.hstack(tiles[index : index + columns]) for index in range(0, len(tiles), columns)]
    sheet = np.vstack(rows[::-1])
    result = bpy.data.images.new("Sheet", sheet.shape[1], sheet.shape[0])
    result.pixels = sheet.ravel()
    result.filepath_raw = os.path.join(folder, f"{spec['name']}.png")
    result.file_format = "PNG"
    result.save()
    for item in (sun, ground, camera):
        bpy.data.objects.remove(item)


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    output, previews, names = arguments[0], arguments[1], arguments[2:]
    for name in names:
        spec = species.SPECIES[name]()
        body, rig = quadruped.assemble(spec)
        motion = quadruped.Motion(spec, rig)
        if previews != "-":
            os.makedirs(previews, exist_ok=True)
            render_tiles(spec, rig, motion, previews)
        for clip, seconds, pose in motion.clips():
            quadruped.record_clip(rig, spec["joints"], clip, seconds, pose)
        quadruped.set_tint_factor(body, 1 / species.GLOW.get(name, 1))
        quadruped.export_model(body, rig, os.path.join(output, f"{name}.glb"))
        print("built", name, len(body.data.polygons), "faces", "graze", round(motion.graze, 3))


main()
