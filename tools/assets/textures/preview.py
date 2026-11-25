import sys
from pathlib import Path

import numpy as np
from PIL import Image

SUN = np.array([0.55, 0.45, 0.7]) / np.linalg.norm([0.55, 0.45, 0.7])


def tiled(image, repeats=3):
    return np.tile(image, (repeats, repeats, 1))


def lit(albedo, normal):
    direction = normal.astype(float) / 127.5 - 1
    shade = np.clip(direction @ SUN, 0, 1) / SUN[2]
    return np.clip(albedo.astype(float) * (0.25 + 0.75 * shade[..., None]), 0, 255).astype(np.uint8)


def load(path):
    return np.asarray(Image.open(path).convert('RGB'))


def main():
    assets = Path(sys.argv[1])
    previews = Path(sys.argv[2])
    previews.mkdir(parents=True, exist_ok=True)
    rock_albedo = load(assets / 'rock-albedo.jpg')
    rock_normal = load(assets / 'rock-normal.png')
    asphalt_albedo = load(assets / 'asphalt-albedo.webp')
    asphalt_normal = load(assets / 'asphalt-normal.webp')
    ground = load(assets / 'ground-detail.webp')
    sheets = {
        'rock-albedo-tiled': tiled(rock_albedo),
        'rock-normal-tiled': tiled(rock_normal),
        'rock-lit-tiled': tiled(lit(rock_albedo, rock_normal)),
        'asphalt-albedo-tiled': tiled(asphalt_albedo),
        'asphalt-lit-tiled': tiled(lit(asphalt_albedo, asphalt_normal)),
        'asphalt-normal-seam': tiled(asphalt_normal, 2)[768:1280, 768:1280],
        'asphalt-albedo-seam': tiled(asphalt_albedo, 2)[768:1280, 768:1280],
        'ground-detail-tiled': tiled(ground),
        'ground-detail-seam': tiled(ground, 2)[768:1280, 768:1280],
    }
    for name, sheet in sheets.items():
        picture = Image.fromarray(sheet)
        if picture.width > 1536:
            picture = picture.resize((1536, 1536), Image.LANCZOS)
        picture.save(previews / f'{name}.png')


if __name__ == '__main__':
    main()
