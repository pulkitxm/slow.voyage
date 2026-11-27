import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np

import finish
import plants
import scene as staging
from species import LEVELS, SPECIES

TILE = 768
OVERSAMPLE = 2
BACKDROP = (0.62, 0.72, 0.82)


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--previews")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--quality", type=int, default=90)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def capture(scene, scratch, strength):
    path = os.path.join(scratch, "render.png")
    staging.render(scene, path, TILE * OVERSAMPLE)
    return finish.firm(finish.shrink(finish.read(path), OVERSAMPLE), strength)


def tile(pixels, amount):
    return finish.bleed(finish.scale(pixels, amount), 48)


def publish(pixels, name, options, sheet):
    finish.write(pixels, os.path.join(options.output, f"{name}.webp"), "WEBP", options.quality)
    if options.previews:
        flat = finish.over(pixels, BACKDROP)
        finish.write(flat, os.path.join(options.previews, f"{name}.png"), "PNG", 90)
        sheet.append(flat)


def main():
    options = arguments()
    names = options.only or list(SPECIES)
    sheet = []
    with tempfile.TemporaryDirectory() as scratch:
        for name in names:
            spec = SPECIES[name]
            plant = plants.conifer(spec) if spec["kind"] == "conifer" else plants.broadleaf(spec)
            scene = staging.reset(128)
            staging.bark_object(scene, plant, spec.get("bark", 1.0))
            leaves = staging.leaf_object(scene, plant)
            leafed = capture(scene, scratch, 1.15)
            amount = finish.gain(leafed, LEVELS["leafed" if spec["bare"] else "evergreen"])
            publish(tile(leafed, amount), name, options, sheet)
            if spec["bare"]:
                leaves.hide_render = True
                publish(tile(capture(scene, scratch, 1.35), amount), f"{name}-bare", options, sheet)
    if options.previews and len(sheet) > 1:
        columns = 4
        rows = -(-len(sheet) // columns)
        board = np.ones((rows * TILE, columns * TILE, 4), dtype=np.float32)
        board[..., :3] = BACKDROP
        for index, flat in enumerate(sheet):
            top = (index // columns) * TILE
            left = (index % columns) * TILE
            board[top : top + TILE, left : left + TILE] = flat
        finish.write(finish.shrink(board, 2), os.path.join(options.previews, "sheet.png"), "PNG", 90)


main()
