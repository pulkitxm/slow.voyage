import os
import subprocess
import sys
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, "..", "..", ".."))
models = os.path.join(root, "src", "assets", "models")
blender = os.environ.get("BLENDER", os.path.expanduser("~/.local/bin/blender"))
transform = ["bunx", "--bun", "@gltf-transform/cli"]


def run(command):
    subprocess.run(command, check=True, cwd=root)


def generate(variant, previews):
    with tempfile.TemporaryDirectory() as scratch:
        raw = os.path.join(scratch, variant + "_raw.glb")
        step = os.path.join(scratch, variant + "_step.glb")
        command = [blender, "-b", "--factory-startup", "--python", os.path.join(here, "build_walker.py"), "--", variant, raw]
        if previews:
            command.append(previews)
        run(command)
        run([*transform, "resample", raw, step, "--tolerance", "0.0001"])
        run([*transform, "prune", step, step])
        run([*transform, "weld", step, step])
        run([*transform, "meshopt", step, os.path.join(models, variant + ".glb"), "--level", "medium"])


def main():
    previews = None
    if "--previews" in sys.argv:
        previews = os.path.abspath(sys.argv[sys.argv.index("--previews") + 1])
    for variant in ("man", "woman"):
        generate(variant, previews)


main()
