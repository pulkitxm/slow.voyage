import argparse
import json
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
TARGET = os.path.join(ROOT, "src", "assets", "models", "cars", "bodies")
SHEETS = os.path.join(ROOT, "src", "game", "car-sheets.json")
TRANSFORM = ["bunx", "--bun", "@gltf-transform/cli"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blender", default=os.environ.get("BLENDER", os.path.expanduser("~/.local/bin/blender")))
    parser.add_argument("--previews")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--views", nargs="*")
    options = parser.parse_args()
    os.makedirs(TARGET, exist_ok=True)
    with open(SHEETS, encoding="utf-8") as source:
        sheets = json.load(source)
    names = options.only or list(sheets)
    with tempfile.TemporaryDirectory() as scratch:
        command = [options.blender, "-b", "--factory-startup", "--python", os.path.join(HERE, "build.py"), "--", "--output", scratch, "--only", *names]
        if options.previews:
            command += ["--previews", options.previews]
            if options.views:
                command += ["--views", *options.views]
        subprocess.run(command, check=True)
        with open(os.path.join(scratch, "paints.json"), encoding="utf-8") as source:
            paints = json.load(source)
        for name in names:
            raw = os.path.join(scratch, f"{name}.glb")
            welded = os.path.join(scratch, f"{name}-welded.glb")
            subprocess.run([*TRANSFORM, "weld", raw, welded], check=True, cwd=ROOT)
            subprocess.run([*TRANSFORM, "meshopt", welded, os.path.join(TARGET, f"{name}.glb")], check=True, cwd=ROOT)
            sheets[name]["paint"] = paints[name]
    with open(SHEETS, "w", encoding="utf-8") as target:
        json.dump(sheets, target, indent=2, ensure_ascii=False)
        target.write("\n")
    subprocess.run(["bun", "run", "--bun", "biome", "format", "--write", SHEETS], check=True, cwd=ROOT)


main()
