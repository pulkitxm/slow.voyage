import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Vector

from carkit import linear, material_named
from designs import DESIGNS

VIEWS = {
    "front": (-36, 15, 1.75),
    "rear": (148, 20, 1.75),
    "side": (-90, 4, 1.75),
    "top": (-60, 55, 1.9),
    "nose": (-12, 8, 1.0),
    "tail": (168, 10, 1.0),
}


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--previews")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--views", nargs="*", default=["front", "rear"])
    parser.add_argument("--samples", type=int, default=24)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def export(objects, path):
    for item in bpy.context.scene.objects:
        item.select_set(item in objects)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )


def stage(scene, paint, samples):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(38)
    sky.sun_rotation = math.radians(140)
    sky.sun_intensity = 0.25
    background = nodes["Background"]
    background.inputs["Strength"].default_value = 0.22
    world.node_tree.links.new(sky.outputs["Color"], background.inputs["Color"])
    scene.world = world
    ground_mesh = bpy.data.meshes.new("ground")
    ground_mesh.from_pydata([(-40, -40, 0), (40, -40, 0), (40, 40, 0), (-40, 40, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("ground", ground_mesh)
    surface = bpy.data.materials.new("ground")
    surface.use_nodes = True
    shader = surface.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (0.2, 0.2, 0.19, 1)
    shader.inputs["Roughness"].default_value = 0.9
    ground_mesh.materials.append(surface)
    scene.collection.objects.link(ground)
    body = material_named("body").node_tree.nodes["Principled BSDF"]
    red, green, blue = linear(paint)
    body.inputs["Base Color"].default_value = (red, green, blue, 1)
    body.inputs["Roughness"].default_value = 0.35
    body.inputs["Coat Weight"].default_value = 1.0
    camera_data = bpy.data.cameras.new("camera")
    camera_data.lens = 55
    camera = bpy.data.objects.new("camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def aim(camera, heading, pitch, distance, target):
    yaw = math.radians(heading)
    tilt = math.radians(pitch)
    offset = Vector(
        (math.sin(yaw) * math.cos(tilt), -math.cos(yaw) * math.cos(tilt), math.sin(tilt))
    )
    camera.location = target + offset * distance
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def main():
    options = arguments()
    os.makedirs(options.output, exist_ok=True)
    for name in options.only or list(DESIGNS):
        scene = reset()
        model, paint = DESIGNS[name]()
        objects = model.finish()
        triangles = sum(len(item.data.polygons) for item in objects if not item.name.startswith("Wheel_"))
        triangles += 4 * len(model.wheels[0].data.polygons)
        print(f"built {name}: {triangles} triangles")
        export(objects, os.path.join(options.output, f"{name}.glb"))
        if not options.previews:
            continue
        os.makedirs(options.previews, exist_ok=True)
        camera = stage(scene, paint, options.samples)
        length = model.loft.rear - model.loft.front
        target = Vector((0, (model.loft.rear + model.loft.front) / 2, 0.6))
        for view in options.views:
            heading, pitch, reach = VIEWS[view]
            aim(camera, heading, pitch, length * reach, target)
            scene.render.filepath = os.path.join(options.previews, f"{name}-{view}.png")
            bpy.ops.render.render(write_still=True)


main()
