import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Matrix, Vector

from carkit import Car, linear, material_named
from shading import shade

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "bodies"))

from kit import refine

Car.refiner = lambda shell: refine(shell, 1)
from designs import DESIGNS

VIEWS = {
    "front": (-36, 14, 1.75),
    "rear": (148, 16, 1.75),
    "side": (-90, 3, 1.75),
    "top": (-60, 55, 1.9),
    "nose": (-14, 8, 1.15),
    "tail": (166, 10, 1.15),
}


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--previews")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--views", nargs="*", default=["front", "rear"])
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--width", type=int, default=1280)
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
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )


def stage(scene, paint, samples, width):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = width * 9 // 16
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
    offset = Vector((math.sin(yaw) * math.cos(tilt), -math.cos(yaw) * math.cos(tilt), math.sin(tilt)))
    camera.location = target + offset * distance
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def main():
    options = arguments()
    os.makedirs(options.output, exist_ok=True)
    for name in options.only or list(DESIGNS):
        scene = reset()
        car, paint = DESIGNS[name]()
        objects = car.model.finish()
        turn = Matrix.Rotation(-math.pi / 2, 4, "Z")
        for mesh in {item.data for item in objects}:
            mesh.transform(turn)
        for item in objects:
            item.location = turn @ item.location
        triangles = 0
        low = Vector((1e9, 1e9, 1e9))
        high = -low
        for item in objects:
            item.data.calc_loop_triangles()
            triangles += len(item.data.loop_triangles)
            for vert in item.data.vertices:
                point = item.matrix_basis @ vert.co
                low = Vector(map(min, low, point))
                high = Vector(map(max, high, point))
        print(f"built {name}: {triangles} triangles, bounds {tuple(round(v, 3) for v in low)} {tuple(round(v, 3) for v in high)}")
        shade(scene, objects)
        export(objects, os.path.join(options.output, f"{name}.glb"))
        if not options.previews:
            continue
        os.makedirs(options.previews, exist_ok=True)
        camera = stage(scene, paint, options.samples, options.width)
        length = high.y - low.y
        target = Vector((0, (high.y + low.y) / 2, 0.55))
        for view in options.views:
            heading, pitch, reach = VIEWS[view]
            aim(camera, heading, pitch, length * reach, target)
            scene.render.filepath = os.path.join(options.previews, f"{name}-{view}.png")
            bpy.ops.render.render(write_still=True)


main()
