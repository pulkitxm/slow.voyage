import argparse
import importlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import bpy
import numpy
from mathutils import Matrix, Vector

from carkit import linear, material_named
from shading import shade, thumbnail

VIEWS = {
    "front": (-36, 14, 1.75),
    "rear": (148, 16, 1.75),
    "side": (-90, 3, 1.75),
    "top": (-60, 55, 1.9),
    "nose": (-8, 7, 1.5),
    "tail": (172, 9, 1.5),
}


def registry():
    cars = {}
    folder = os.path.join(HERE, "makers")
    sys.path.insert(0, folder)
    for entry in sorted(os.listdir(folder)):
        if not entry.endswith(".py"):
            continue
        try:
            cars.update(importlib.import_module(entry[:-3]).CARS)
        except Exception as problem:
            print(f"skipped {entry}: {problem!r}")
    return cars


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--previews")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--views", nargs="*", default=["front", "rear", "side", "top", "nose", "tail"])
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--columns", type=int, default=2)
    parser.add_argument("--flat", action="store_true")
    parser.add_argument("--thumbs")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def export(objects, path):
    for item in bpy.context.scene.objects:
        item.select_set(item in objects)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
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


def pixels(path):
    image = bpy.data.images.load(path)
    width, height = image.size
    data = numpy.empty(width * height * 4, dtype=numpy.float32)
    image.pixels.foreach_get(data)
    bpy.data.images.remove(image)
    return data.reshape(height, width, 4)


def contact_sheet(paths, target, columns):
    tiles = [pixels(path) for path in paths]
    height, width, _ = tiles[0].shape
    rows = math.ceil(len(tiles) / columns)
    sheet = numpy.zeros((rows * height, columns * width, 4), dtype=numpy.float32)
    sheet[..., 3] = 1
    for index, tile in enumerate(tiles):
        row = rows - 1 - index // columns
        column = index % columns
        sheet[row * height : (row + 1) * height, column * width : (column + 1) * width] = tile
    image = bpy.data.images.new("sheet", columns * width, rows * height)
    image.pixels.foreach_set(sheet.ravel())
    image.filepath_raw = target
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)
    for path in paths:
        os.remove(path)


def main():
    options = arguments()
    cars = registry()
    os.makedirs(options.output, exist_ok=True)
    failures = []
    paints = {}
    for name in options.only or list(cars):
        if name not in cars:
            failures.append(f"{name}: no design registered")
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        try:
            car, paint = cars[name]()
        except Exception as problem:
            import traceback

            traceback.print_exc()
            failures.append(f"{name}: {problem}")
            continue
        try:
            objects = car.model.finish()
            if any(len(item.data.polygons) < 500 for item in objects if item.name == "Coachwork"):
                raise ValueError("the body came out empty")
        except Exception as problem:
            failures.append(f"{name}: {problem}")
            continue
        paints[name] = paint
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
        sheet = car.sheet
        size = high - low
        shell = [item for item in objects if item.name == "Coachwork"]
        girth = max((abs(vert.co.x) for item in shell for vert in item.data.vertices), default=size.x / 2) * 2
        print(
            f"built {name}: {triangles} triangles, "
            f"length {size.y:.3f} ({sheet.length:.3f}), width {girth:.3f} ({sheet.width:.3f}), height {high.z:.3f} ({sheet.height:.3f}), floor {low.z:.3f}"
        )
        if not options.flat:
            shade(scene, objects)
        export(objects, os.path.join(options.output, f"{name}.glb"))
        if options.thumbs:
            os.makedirs(options.thumbs, exist_ok=True)
            thumbnail(objects, os.path.join(options.thumbs, f"{name}.webp"), os.path.join(options.thumbs, f"{name}-mask.webp"))
            continue
        if not options.previews:
            continue
        os.makedirs(options.previews, exist_ok=True)
        camera = stage(scene, paint, options.samples, options.width)
        length = high.y - low.y
        target = Vector((0, (high.y + low.y) / 2, 0.55))
        paths = []
        for view in options.views:
            heading, pitch, reach = VIEWS[view]
            aim(camera, heading, pitch, max(length, 3.9) * reach, target)
            path = os.path.join(options.previews, f"{name}-{view}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            paths.append(path)
        contact_sheet(paths, os.path.join(options.previews, f"{name}.png"), options.columns)
    with open(os.path.join(options.output, "paints.json"), "w", encoding="utf-8") as record:
        json.dump(paints, record, indent=2, sort_keys=True)
    if failures:
        print("FAILED " + "; ".join(failures))
        sys.exit(1)


main()
