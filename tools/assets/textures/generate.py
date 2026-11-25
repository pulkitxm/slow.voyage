import sys
from pathlib import Path

import numpy as np
from PIL import Image

import asphalt
import ground_detail
import rock
from tiling import encode_colour, encode_normal

ASSETS = Path(__file__).resolve().parents[3] / 'src' / 'assets'


def grey_image(tone):
    return Image.fromarray(encode_colour(np.repeat(tone[..., None], 3, axis=2)), 'RGB')


def write_rock(folder):
    colour, normal = rock.surface()
    Image.fromarray(encode_colour(colour), 'RGB').save(folder / 'rock-albedo.jpg', quality=82, optimize=True)
    Image.fromarray(encode_normal(normal), 'RGB').save(folder / 'rock-normal.png', optimize=True)


def write_asphalt(folder):
    tone, normal = asphalt.surface()
    grey_image(tone).save(folder / 'asphalt-albedo.webp', quality=78, method=6)
    Image.fromarray(encode_normal(normal), 'RGB').save(folder / 'asphalt-normal.webp', quality=84, method=6)


def write_ground_detail(folder):
    grey_image(ground_detail.surface()).save(folder / 'ground-detail.webp', quality=76, method=6)


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else ASSETS
    folder.mkdir(parents=True, exist_ok=True)
    write_rock(folder)
    write_asphalt(folder)
    write_ground_detail(folder)
    for name in (
        'rock-albedo.jpg',
        'rock-normal.png',
        'asphalt-albedo.webp',
        'asphalt-normal.webp',
        'ground-detail.webp',
    ):
        print(name, (folder / name).stat().st_size)


if __name__ == '__main__':
    main()
