import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPOSITORY = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
MODELS = os.path.join(REPOSITORY, "src", "assets", "models")
BLENDER = os.environ.get("BLENDER", os.path.expanduser("~/.local/bin/blender"))
ANIMALS = ["sheep", "horse", "deer", "cattle", "bull", "elephant"]
TRANSFORM = ["bunx", "--bun", "@gltf-transform/cli"]


REST = {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]}


def drop_resting_channels(path):
    with open(path, "rb") as file:
        data = file.read()
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + length])
    binary_start = 20 + length + 8

    def values(index):
        accessor = document["accessors"][index]
        view = document["bufferViews"][accessor["bufferView"]]
        width = {"VEC3": 3, "VEC4": 4, "SCALAR": 1}[accessor["type"]]
        start = binary_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        flat = struct.unpack_from(f"<{accessor['count'] * width}f", data, start)
        return [flat[index : index + width] for index in range(0, len(flat), width)]

    def resting(channel, sampler):
        target = channel["target"]
        node = document["nodes"][target["node"]]
        rest = node.get(target["path"], REST[target["path"]])
        for value in values(sampler["output"]):
            same = all(abs(a - b) < 2e-4 for a, b in zip(value, rest))
            flipped = target["path"] == "rotation" and all(
                abs(a + b) < 2e-4 for a, b in zip(value, rest)
            )
            if not same and not flipped:
                return False
        return True

    for animation in document["animations"]:
        channels, samplers = [], []
        for channel in animation["channels"]:
            sampler = animation["samplers"][channel["sampler"]]
            if resting(channel, sampler):
                continue
            channels.append({**channel, "sampler": len(samplers)})
            samplers.append(sampler)
        animation["channels"], animation["samplers"] = channels, samplers
    text = json.dumps(document, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    rest_of_file = data[20 + length :]
    total = 12 + 8 + len(text) + len(rest_of_file)
    with open(path, "wb") as file:
        file.write(struct.pack("<4sII", b"glTF", 2, total))
        file.write(struct.pack("<I4s", len(text), b"JSON"))
        file.write(text)
        file.write(rest_of_file)


def main():
    arguments = sys.argv[1:]
    previews = "-"
    if "--previews" in arguments:
        index = arguments.index("--previews")
        previews = os.path.abspath(arguments[index + 1])
        del arguments[index : index + 2]
    names = arguments or ANIMALS
    with tempfile.TemporaryDirectory() as work:
        subprocess.run(
            [
                BLENDER,
                "-b",
                "--factory-startup",
                "--python",
                os.path.join(HERE, "build.py"),
                "--",
                work,
                previews,
                *names,
            ],
            check=True,
        )
        for name in names:
            current = os.path.join(work, f"{name}.glb")
            drop_resting_channels(current)
            for stage in (
                ["weld"],
                ["resample", "--tolerance", "0.002"],
                ["prune"],
                ["quantize"],
                ["meshopt", "--level", "high"],
            ):
                following = os.path.join(work, f"{name}-{stage[0]}.glb")
                subprocess.run([*TRANSFORM, *stage, current, following], check=True, cwd=REPOSITORY)
                current = following
            shutil.copyfile(current, os.path.join(MODELS, f"{name}.glb"))
            print(name, os.path.getsize(os.path.join(MODELS, f"{name}.glb")), "bytes")


main()
