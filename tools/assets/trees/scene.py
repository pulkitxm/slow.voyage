import math

import bpy
import numpy as np

import plants

BARK_COLOUR = (0.115, 0.08, 0.05)


def reset(samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = samples
    scene.render.film_transparent = True
    scene.render.filter_size = 1.2
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.75
    scene.world = world
    camera_data = bpy.data.cameras.new("side")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1.0
    camera_data.clip_start = 0.1
    camera_data.clip_end = 20
    camera = bpy.data.objects.new("side", camera_data)
    camera.location = (0, -6, 0.5)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, energy, angle, turn in (
        ("key", 2.6, 50, (math.radians(52), 0, math.radians(-38))),
        ("fill", 0.7, 80, (math.radians(70), 0, math.radians(55))),
    ):
        sun_data = bpy.data.lights.new(name, "SUN")
        sun_data.energy = energy
        sun_data.angle = math.radians(angle)
        sun_data.use_shadow = name == "key"
        sun = bpy.data.objects.new(name, sun_data)
        sun.rotation_euler = turn
        scene.collection.objects.link(sun)
    return scene


def bark_material(depth):
    material = bpy.data.materials.new("bark")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfDiffuse")
    coordinates = nodes.new("ShaderNodeTexCoord")
    stretch = nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (60, 60, 9)
    grain = nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 1.0
    grain.inputs["Detail"].default_value = 5
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = tuple(c * 0.55 * depth for c in BARK_COLOUR) + (1,)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = tuple(c * 1.25 * depth for c in BARK_COLOUR) + (1,)
    links.new(coordinates.outputs["Object"], stretch.inputs["Vector"])
    links.new(stretch.outputs["Vector"], grain.inputs["Vector"])
    links.new(grain.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], surface.inputs["Color"])
    links.new(surface.outputs["BSDF"], output.inputs["Surface"])
    return material


def leaf_material():
    material = bpy.data.materials.new("leaf")
    material.use_nodes = True
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    tint = nodes.new("ShaderNodeAttribute")
    tint.attribute_name = "tint"
    facing = nodes.new("ShaderNodeAttribute")
    facing.attribute_name = "facing"
    lit = nodes.new("ShaderNodeBsdfDiffuse")
    glow = nodes.new("ShaderNodeBsdfTranslucent")
    blend = nodes.new("ShaderNodeMixShader")
    blend.inputs["Fac"].default_value = 0.3
    links.new(tint.outputs["Color"], lit.inputs["Color"])
    links.new(tint.outputs["Color"], glow.inputs["Color"])
    links.new(facing.outputs["Vector"], lit.inputs["Normal"])
    links.new(lit.outputs["BSDF"], blend.inputs[1])
    links.new(glow.outputs["BSDF"], blend.inputs[2])
    links.new(blend.outputs["Shader"], output.inputs["Surface"])
    return material


def bark_object(scene, plant, depth):
    mesh = bpy.data.meshes.new("bark")
    mesh.from_pydata(plant["bark"].tolist(), [], plant["faces"])
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.materials.append(bark_material(depth))
    item = bpy.data.objects.new("bark", mesh)
    scene.collection.objects.link(item)
    return item


def leaf_object(scene, plant):
    corners = plant["leaves"]
    sides = plants.LEAF_CORNERS
    count = len(corners) // sides
    mesh = bpy.data.meshes.new("leaves")
    mesh.vertices.add(len(corners))
    mesh.vertices.foreach_set("co", corners.astype(np.float32).ravel())
    mesh.loops.add(len(corners))
    mesh.loops.foreach_set("vertex_index", np.arange(len(corners), dtype=np.int32))
    mesh.polygons.add(count)
    mesh.polygons.foreach_set("loop_start", np.arange(count, dtype=np.int32) * sides)
    mesh.polygons.foreach_set("loop_total", np.full(count, sides, dtype=np.int32))
    mesh.update(calc_edges=True)
    tint = mesh.attributes.new("tint", "FLOAT_COLOR", "POINT")
    colours = np.concatenate([plant["tint"], np.ones((len(corners), 1))], axis=1)
    tint.data.foreach_set("color", colours.astype(np.float32).ravel())
    facing = mesh.attributes.new("facing", "FLOAT_VECTOR", "POINT")
    facing.data.foreach_set("vector", plant["facing"].astype(np.float32).ravel())
    mesh.materials.append(leaf_material())
    item = bpy.data.objects.new("leaves", mesh)
    scene.collection.objects.link(item)
    return item


def render(scene, path, size):
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
