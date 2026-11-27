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
