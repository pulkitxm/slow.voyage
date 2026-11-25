import math
import os
import sys

import bpy
import bmesh
import numpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import figure
import motion


def clear_scene():
    for block in list(bpy.data.objects):
        bpy.data.objects.remove(block, do_unlink=True)


def make_materials(profile):
    materials = {}
    for name, color in profile["colors"].items():
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        shader = material.node_tree.nodes["Principled BSDF"]
        shader.inputs["Base Color"].default_value = (*color, 1.0)
        shader.inputs["Roughness"].default_value = 0.88
        shader.inputs["Metallic"].default_value = 0.0
        materials[name] = material
    return materials


def make_body(name, shell, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(shell.points, [], shell.faces)
    order = list(materials)
    for material in order:
        mesh.materials.append(materials[material])
    for polygon, material in zip(mesh.polygons, shell.materials):
        polygon.material_index = order.index(material)
        polygon.use_smooth = True
    body = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(body)
    groups = {}
    for index, weights in enumerate(shell.weights):
        for bone, weight in weights.items():
            if bone not in groups:
                groups[bone] = body.vertex_groups.new(name=bone)
            groups[bone].add([index], weight, "REPLACE")
    sharp = {frozenset(edge) for edge in shell.sharp}
    grid = bmesh.new()
    grid.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(grid, faces=grid.faces)
    for edge in grid.edges:
        if frozenset(vertex.index for vertex in edge.verts) in sharp:
            edge.smooth = False
    grid.to_mesh(mesh)
    grid.free()
    return body


def make_armature(name, bones):
    data = bpy.data.armatures.new(name)
    armature = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for bone, (start, end, parent) in bones.items():
        made = data.edit_bones.new(bone)
        made.head = start
        made.tail = end
        if parent:
            made.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def light_stage():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 420
    scene.render.resolution_y = 560
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("Stage")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.7, 0.8, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(52), 0, math.radians(-38))
    scene.collection.objects.link(sun)
    ground = bpy.data.meshes.new("Ground")
    ground.from_pydata([(-9, -9, 0), (9, -9, 0), (9, 9, 0), (-9, 9, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("Ground", ground)
    paint = bpy.data.materials.new("Ground")
    paint.use_nodes = True
    paint.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.36, 0.42, 0.28, 1)
    ground.materials.append(paint)
    scene.collection.objects.link(floor)
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.lens = 70
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, [sun, floor, camera]


def aim(camera, bearing, target, distance, raise_by=0.15):
    angle = math.radians(bearing)
    spot = Vector(target) + Vector((math.sin(angle) * distance, -math.cos(angle) * distance, raise_by * distance))
    camera.location = spot
    camera.rotation_euler = (Vector(target) - spot).to_track_quat("-Z", "Y").to_euler()


def render_tile(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = numpy.array(image.pixels[:], dtype=numpy.float32).reshape(height, width, 4)
    bpy.data.images.remove(image)
    return pixels


def save_sheet(tiles, columns, path):
    tiles = tiles + [numpy.ones_like(tiles[0])] * (-len(tiles) % columns)
    rows = [numpy.concatenate(tiles[start : start + columns], axis=1) for start in range(0, len(tiles), columns)]
    sheet = numpy.concatenate(rows[::-1], axis=0)
    height, width, _ = sheet.shape
    image = bpy.data.images.new("Sheet", width, height)
    image.pixels = sheet.ravel()
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def preview(variant, frame, armature, body, height, folder):
    os.makedirs(folder, exist_ok=True)
    camera, props = light_stage()
    middle = (0, 0, height * 0.52)
    shots = [
        (None, 0, 0, middle, 5.2),
        (None, 0, 90, middle, 5.2),
        (None, 0, 180, middle, 5.2),
        (None, 0, 35, (0, 0, height * 0.9), 1.9),
        ("Idle", 0.3, 25, middle, 5.2),
        ("Walk", 0.0, 90, middle, 5.2),
        ("Walk", 0.15, 90, middle, 5.2),
        ("Walk", 0.3, 90, middle, 5.2),
        ("Walk", 0.45, 90, middle, 5.2),
        ("Walk", 0.1, 30, middle, 5.2),
        ("Run", 0.0, 90, middle, 5.2),
        ("Run", 0.2, 90, middle, 5.2),
        ("Run", 0.42, 90, middle, 5.2),
        ("Run", 0.3, 30, middle, 5.2),
        ("Death", 0.17, 90, middle, 5.6),
        ("Death", 0.36, 90, (0, 0.2, height * 0.4), 5.6),
        ("Death", 0.5, 90, (0, 0.5, height * 0.3), 5.6),
        ("Death", 1.0, 60, (0, 0.8, 0.2), 6.0),
    ]
    tiles = []
    scratch = os.path.join(folder, variant + "_tile.png")
    for clip, beat, bearing, target, distance in shots:
        motion.rest_pose(armature)
        if clip:
            motion.apply(frame, armature, body, motion.pose_for(frame, clip, beat))
        aim(camera, bearing, target, distance)
        tiles.append(render_tile(scratch))
    os.remove(scratch)
    save_sheet(tiles[:9], 5, os.path.join(folder, variant + "_shape_walk.png"))
    save_sheet(tiles[9:], 5, os.path.join(folder, variant + "_run_fall.png"))
    motion.rest_pose(armature)
    for prop in props:
        bpy.data.objects.remove(prop, do_unlink=True)


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_skins=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_optimize_animation_size=False,
        export_anim_single_armature=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )


def main():
    arguments = sys.argv[sys.argv.index("--") + 1 :]
    variant, output = arguments[0], arguments[1]
    previews = arguments[2] if len(arguments) > 2 else None
    profile = figure.profiles[variant]
    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = motion.frame_rate
    scene.frame_start = 0
    shell, bones, unit = figure.build(profile)
    body = make_body("Walker", shell, make_materials(profile))
    armature = make_armature("Rig", bones)
    body.parent = armature
    body.modifiers.new("Rig", "ARMATURE").object = armature
    bpy.context.view_layer.update()
    frame = motion.Frame(armature, unit)
    if previews:
        preview(variant, frame, armature, body, profile["height"], previews)
    actions = [motion.record(frame, armature, body, clip) for clip in motion.clip_frames]
    motion.shelve(armature, actions)
    scene.frame_end = max(motion.clip_frames.values())
    export(output)


main()
