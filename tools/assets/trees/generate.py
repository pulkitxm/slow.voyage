import argparse
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPOSITORY = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))


def blender():
    return (
        os.environ.get("BLENDER")
        or shutil.which("blender")
        or os.path.expanduser("~/.local/bin/blender")
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=os.path.join(REPOSITORY, "src", "assets", "trees"))
    parser.add_argument("--previews")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--quality", type=int, default=90)
    options = parser.parse_args()
    command = [
        blender(),
        "-b",
        "--factory-startup",
        "--python-exit-code",
        "1",
        "--python",
        os.path.join(HERE, "build.py"),
        "--",
        "--output",
        os.path.abspath(options.output),
        "--quality",
        str(options.quality),
    ]
    if options.previews:
        os.makedirs(options.previews, exist_ok=True)
        command += ["--previews", os.path.abspath(options.previews)]
    if options.only:
        command += ["--only", *options.only]
    os.makedirs(options.output, exist_ok=True)
    sys.exit(subprocess.run(command).returncode)


main()
