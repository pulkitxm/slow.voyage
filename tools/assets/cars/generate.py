import argparse
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
TARGET = os.path.join(ROOT, "src", "assets", "models", "cars")
NAMES = ("touring", "hatchback", "supercar", "pickup", "supercar-grand", "supercar-longtail", "supercar-track")
TRANSFORM = ["bunx", "--bun", "@gltf-transform/cli"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blender", default=os.path.expanduser("~/.local/bin/blender"))
    parser.add_argument("--previews")
    parser.add_argument("--only", nargs="*", default=list(NAMES))
    parser.add_argument("--views", nargs="*", default=["front", "rear"])
    options = parser.parse_args()
    with tempfile.TemporaryDirectory() as scratch:
        command = [
            options.blender,
            "-b",
            "--factory-startup",
            "--python",
            os.path.join(HERE, "build.py"),
            "--",
            "--output",
            scratch,
            "--only",
            *options.only,
        ]
        if options.previews:
            command += ["--previews", options.previews, "--views", *options.views]
        subprocess.run(command, check=True)
        for name in options.only:
            raw = os.path.join(scratch, f"{name}.glb")
            welded = os.path.join(scratch, f"{name}-welded.glb")
            subprocess.run([*TRANSFORM, "weld", raw, welded], check=True, cwd=ROOT)
            subprocess.run(
                [*TRANSFORM, "meshopt", welded, os.path.join(TARGET, f"{name}.glb")],
                check=True,
                cwd=ROOT,
            )


main()
