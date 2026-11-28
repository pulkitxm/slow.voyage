import argparse
import json
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
TARGET = os.path.join(ROOT, "src", "assets", "models", "cars", "thumbs")
CLASSES = ("touring", "roadster", "hatchback", "supercar", "pickup", "supercar-grand", "supercar-longtail", "supercar-track")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blender", default=os.environ.get("BLENDER", os.path.expanduser("~/.local/bin/blender")))
    parser.add_argument("--only", nargs="*")
    options = parser.parse_args()
    with open(os.path.join(ROOT, "src", "game", "car-sheets.json"), encoding="utf-8") as source:
        bodies = list(json.load(source))
    names = options.only or [*CLASSES, *bodies]
    os.makedirs(TARGET, exist_ok=True)
    with tempfile.TemporaryDirectory() as scratch:
        for script, group in (("build.py", [n for n in names if n in CLASSES]), (os.path.join("bodies", "build.py"), [n for n in names if n not in CLASSES])):
            if not group:
                continue
            command = [options.blender, "-b", "--factory-startup", "--python", os.path.join(HERE, script), "--", "--output", scratch, "--thumbs", TARGET, "--only", *group]
            if script != "build.py":
                command.append("--flat")
            subprocess.run(command, check=True)


main()
