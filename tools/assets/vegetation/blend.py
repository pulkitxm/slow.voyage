import bpy
import numpy as np


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_object(name, points, faces, coords=None, material_indices=None, location=(0.0, 0.0, 0.0)):
    data = bpy.data.meshes.new(name)
    data.from_pydata([tuple(point) for point in points], [], [tuple(face) for face in faces])
    data.update()
    if coords is not None:
        layer = data.uv_layers.new(name="UVMap")
        corners = np.empty(len(data.loops), dtype=np.int32)
        data.loops.foreach_get("vertex_index", corners)
        layer.data.foreach_set("uv", np.asarray(coords, dtype=np.float32)[corners].ravel())
    if material_indices is not None:
        data.polygons.foreach_set("material_index", np.asarray(material_indices, dtype=np.int32))
    data.polygons.foreach_set("use_smooth", [True] * len(data.polygons))
    item = bpy.data.objects.new(name, data)
    item.location = location
    bpy.context.scene.collection.objects.link(item)
    return item


def object_from_parts(mesh, materials):
    points, coords, faces, indices = [], [], [], []
    for slot, (part_name, part) in enumerate(mesh.parts.items()):
        offset = len(points)
        points.extend(part["points"])
        coords.extend(part["coords"])
        for face in part["faces"]:
            faces.append(tuple(index + offset for index in face))
            indices.append(slot)
    item = mesh_object(mesh.name, points, faces, coords, indices, mesh.location)
    for part_name in mesh.parts:
        item.data.materials.append(materials[part_name])
    return item


def image_material(name, image, cutout=False, normal_image=None, roughness=0.85):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    shader = tree.nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0
    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    if cutout:
        tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
    if normal_image is not None:
        relief = tree.nodes.new("ShaderNodeTexImage")
        relief.image = normal_image
        bump = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(relief.outputs["Color"], bump.inputs["Color"])
        tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def export_scene(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_image_format="AUTO",
    )
