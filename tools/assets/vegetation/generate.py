import json
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import blend
import paint
import plants
import sculpt


def main():
    name, target = sys.argv[sys.argv.index("--") + 1 :][:2]
    stem = os.path.splitext(target)[0]
    blend.reset_scene()
    if name in sculpt.BUILDERS:
        masked = sculpt.BUILDERS[name](stem)
    else:
        plan = plants.BUILDERS[name]()
        masked = sorted(plan["masked"])
        pixels = plan["atlas"].finish(plan["glow"], opaque=not masked)
        image = paint.save_image(pixels, stem + "-atlas.png")
        names = {part for mesh in plan["meshes"] for part in mesh.parts}
        materials = {part: blend.image_material(part, image, cutout=part in masked) for part in sorted(names)}
        for mesh in plan["meshes"]:
            blend.object_from_parts(mesh, materials)
            print("triangles", mesh.name, mesh.triangles())
    blend.export_scene(target)
    with open(stem + ".json", "w") as handle:
        json.dump({"masked": list(masked)}, handle)


main()
