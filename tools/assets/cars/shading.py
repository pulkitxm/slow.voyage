import math

import bpy
import numpy


def shade(scene, objects, samples=24, reach=0.7, floor=0.12, depth=1.0):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    world = bpy.data.worlds.new("occlusion")
    world.light_settings.distance = reach
    scene.world = world
    ground_mesh = bpy.data.meshes.new("occluder")
    ground_mesh.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("occluder", ground_mesh)
    scene.collection.objects.link(ground)
    wheels = [item for item in objects if item.name.startswith("Wheel_")]
    shell = [item for item in objects if item not in wheels]
    done = set()
    for group, others in ((shell, wheels), (wheels, shell)):
        for item in others:
            item.hide_render = group is wheels
        ground.hide_render = group is wheels
        for item in group:
            mesh = item.data
            if mesh.name in done:
                continue
            done.add(mesh.name)
            layer = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
            mesh.color_attributes.active_color = layer
            mesh.color_attributes.render_color_index = mesh.color_attributes.find("Col")
            for other in scene.objects:
                other.select_set(other is item)
            bpy.context.view_layer.objects.active = item
            bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
            values = numpy.empty(len(mesh.vertices) * 4, dtype=numpy.float32)
            layer.data.foreach_get("color", values)
            values = values.reshape(-1, 4)
            light = numpy.clip(values[:, :3].mean(axis=1), 0.0, 1.0)
            light = floor + (1.0 - floor) * light**depth
            values[:, 0] = values[:, 1] = values[:, 2] = light
            values[:, 3] = 1.0
            layer.data.foreach_set("color", values.ravel())
    for item in objects:
        item.hide_render = False
    bpy.data.objects.remove(ground)
    bpy.data.meshes.remove(ground_mesh)


def bounds(objects):
    low = [1e9, 1e9, 1e9]
    high = [-1e9, -1e9, -1e9]
    for item in objects:
        for vert in item.data.vertices:
            point = item.matrix_world @ vert.co
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def emission(name, strength):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    glow = nodes.new("ShaderNodeEmission")
    glow.inputs["Color"].default_value = (strength, strength, strength, 1)
    out = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(glow.outputs["Emission"], out.inputs["Surface"])
    return material


def snapshot(scene, path, mode, quality):
    scene.render.filepath = path
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = mode
    scene.render.image_settings.quality = quality
    bpy.ops.render.render(write_still=True)


def thumbnail(objects, base_path, mask_path, width=480, samples=48):
    from mathutils import Vector

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = width * 9 // 16
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(42)
    sky.sun_rotation = math.radians(150)
    sky.sun_intensity = 0.3
    background = nodes["Background"]
    background.inputs["Strength"].default_value = 0.3
    world.node_tree.links.new(sky.outputs["Color"], background.inputs["Color"])
    scene.world = world
    low, high = bounds(objects)
    floor = bpy.data.meshes.new("floor")
    floor.from_pydata([(-30, -30, low[2]), (30, -30, low[2]), (30, 30, low[2]), (-30, 30, low[2])], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("floor", floor)
    ground.is_shadow_catcher = True
    scene.collection.objects.link(ground)
    paint = bpy.data.materials.get("body")
    if paint:
        shader = paint.node_tree.nodes["Principled BSDF"]
        shader.inputs["Base Color"].default_value = (0.82, 0.82, 0.82, 1)
        shader.inputs["Metallic"].default_value = 0.0
        shader.inputs["Roughness"].default_value = 0.32
        shader.inputs["Coat Weight"].default_value = 1.0
        shader.inputs["Coat Roughness"].default_value = 0.04
    lens = bpy.data.cameras.new("lens")
    lens.lens = 50
    camera = bpy.data.objects.new("camera", lens)
    scene.collection.objects.link(camera)
    scene.camera = camera
    centre = Vector(((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (high[2] - low[2]) * 0.42 + low[2]))
    span = max(high[1] - low[1], (high[0] - low[0]) * 1.6, 3.6)
    yaw = math.radians(-38)
    tilt = math.radians(12)
    offset = Vector((math.sin(yaw) * math.cos(tilt), -math.cos(yaw) * math.cos(tilt), math.sin(tilt)))
    camera.location = centre + offset * span * 1.5
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    snapshot(scene, base_path, "RGBA", 82)
    ground.hide_render = True
    lit = emission("mask_paint", 1.0)
    dark = emission("mask_other", 0.0)
    for item in objects:
        slots = item.material_slots
        for slot in slots:
            slot.material = lit if slot.material and slot.material.name == "body" else dark
    scene.cycles.samples = 8
    scene.cycles.use_denoising = False
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    background.inputs["Strength"].default_value = 0.0
    snapshot(scene, mask_path, "RGB", 80)
