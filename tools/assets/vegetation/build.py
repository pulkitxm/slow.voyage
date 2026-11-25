import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLENDER = os.environ.get("BLENDER", os.path.expanduser("~/.local/bin/blender"))
TRANSFORM = ["bunx", "--bun", "@gltf-transform/cli"]

ASSETS = {
    "rock-a": ("src/assets/models/rocks/rock-a.glb", 1.0),
    "rock-b": ("src/assets/models/rocks/rock-b.glb", 1.0),
    "rock-c": ("src/assets/models/rocks/rock-c.glb", 1.0),
    "quiver": ("src/assets/models/plants/quiver.glb", 2.1),
    "stump": ("src/assets/models/plants/stump.glb", 1.7),
    "fern": ("src/assets/models/plants/fern.glb", 2.6),
    "shrub": ("src/assets/models/plants/shrub.glb", 1.9),
    "shrub-wide": ("src/assets/models/plants/shrub-wide.glb", 1.9),
    "bush": ("src/assets/models/plants/bush.glb", 1.9),
    "bush-small": ("src/assets/models/plants/bush-small.glb", 1.9),
    "scrub": ("src/assets/models/plants/scrub.glb", 1.8),
    "pachira": ("src/assets/models/plants/pachira.glb", 1.4),
    "calathea": ("src/assets/models/plants/calathea.glb", 1.8),
}


def run(command):
    done = subprocess.run(command, capture_output=True, text=True)
    if done.returncode != 0:
        sys.stderr.write(done.stdout[-4000:] + done.stderr[-4000:])
        raise SystemExit("failed: " + " ".join(command))
    return done.stdout


def blender(script, *arguments):
    return run([BLENDER, "-b", "--factory-startup", "--python", os.path.join(HERE, script), "--", *arguments])


def set_material_modes(path, masked):
    with open(path, "rb") as handle:
        data = handle.read()
    length = struct.unpack("<I", data[12:16])[0]
    document = json.loads(data[20 : 20 + length])
    rest = data[20 + length :]
    for material in document.get("materials", []):
        material["doubleSided"] = True
        material.pop("extensions", None)
        material.pop("alphaMode", None)
        material.pop("alphaCutoff", None)
        if material.get("name") in masked:
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = 0.5
    used = {key for material in document.get("materials", []) for key in material.get("extensions", {})}
    for field in ("extensionsUsed", "extensionsRequired"):
        if field in document:
            document[field] = [name for name in document[field] if not name.startswith("KHR_materials") or name in used]
            if not document[field]:
                del document[field]
    packed = json.dumps(document, separators=(",", ":")).encode()
    packed += b" " * (-len(packed) % 4)
    body = struct.pack("<II", len(packed), 0x4E4F534A) + packed + rest
    with open(path, "wb") as handle:
        handle.write(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def build(name, work, previews):
    target, glow = ASSETS[name]
    raw = os.path.join(work, name + ".glb")
    log = blender("generate.py", name, raw)
    with open(os.path.join(work, name + ".json")) as handle:
        masked = set(json.load(handle)["masked"])
    set_material_modes(raw, masked)
    if previews:
        blender("preview.py", raw, os.path.join(previews, name + ".png"), str(glow), "rock" if name.startswith("rock") else "plant")
    welded = os.path.join(work, name + "-welded.glb")
    encoded = os.path.join(work, name + "-encoded.glb")
    output = os.path.join(ROOT, target)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    run([*TRANSFORM, "weld", raw, welded])
    run([*TRANSFORM, "webp", welded, encoded, "--quality", "82"])
    run([*TRANSFORM, "meshopt", encoded, output, "--level", "medium"])
    counts = [line for line in log.splitlines() if line.startswith("triangles")]
    return name, os.path.getsize(output), counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("names", nargs="*", default=list(ASSETS))
    parser.add_argument("--previews")
    parser.add_argument("--work")
    options = parser.parse_args()
    work = options.work or tempfile.mkdtemp(prefix="vegetation-")
    os.makedirs(work, exist_ok=True)
    if options.previews:
        os.makedirs(options.previews, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for name, size, counts in pool.map(lambda name: build(name, work, options.previews), options.names):
            print(name, size, "bytes", *counts)


main()
