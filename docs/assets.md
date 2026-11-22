# Asset sources

The bundled rock surface uses
[Rock Face 03](https://polyhaven.com/a/rock_face_03) by Dario Barresi and Rico
Cilliers, published by Poly Haven under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- `src/assets/rock-albedo.jpg` derives from `rock_face_03_diff_1k.jpg`.
- `src/assets/rock-normal.png` derives from `rock_face_03_nor_gl_1k.png`.

Both maps are reduced to 512 by 512 pixels. The color map uses JPEG compression.
The OpenGL normal map is converted to eight-bit PNG with renormalized vectors.
The material tiles over 3.6 meters with world-space color variation. Native
rendering combines two texture scales and normal detail; software rendering
samples one color scale and retains the underlying terrain bump shading. Three
projections blend by surface orientation to avoid stretching on differently
facing slopes. Each normal projection uses its own tangent frame. Seasonal rock
and soil colors tint the photographic surface.

The files are served from the application and included in its offline cache. The
running game makes no requests to Poly Haven.

## People and animals

Walkers and three of the grazing animals are rigged models by
[Quaternius](https://quaternius.com/), published under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- `src/assets/models/man.glb` and `woman.glb` derive from the Man and Woman
  Casual models, downloaded from [Poly Pizza](https://poly.pizza/m/HMnuH5geEG).
- `src/assets/models/sheep.glb` derives from the Sheep model on
  [Poly Pizza](https://poly.pizza/m/rgJXF570ZK).
- `src/assets/models/horse.glb` and `deer.glb` derive from the
  [Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html)
  pack.

Each file keeps only its walk, idle, and eating clips. Meshes are welded and
quantized with glTF Transform, which brings the six files to about 2 MB
together. Shirt, trouser, and skin materials are recoloured per walker. Goats
and camels have no suitable freely licensed rigged model with a walk cycle and
remain generated in code, as does every figure on software rendering or if a
model fails to load.

Cattle and elephants are textured, rigged models published on Sketchfab under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The files were taken
from the [Objaverse](https://huggingface.co/datasets/allenai/objaverse) mirror.

| Animal   | File                             | Model            | Author                                                       | Source                                                             |
| -------- | -------------------------------- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Cow      | `src/assets/models/cattle.glb`   | Cow+motions      | [Kapi777](https://sketchfab.com/Kapi777)                     | <https://sketchfab.com/3d-models/cfacf56db7934b6cb7382fd1c3e428f1> |
| Bull     | `src/assets/models/bull.glb`     | Bull+motions     | [Kapi777](https://sketchfab.com/Kapi777)                     | <https://sketchfab.com/3d-models/50982988cd354bfcb79f9820ba60a27b> |
| Elephant | `src/assets/models/elephant.glb` | walking elephant | [erinaekasyaharani](https://sketchfab.com/erinaekasyaharani) | <https://sketchfab.com/3d-models/2705e7483341479e8015d996cd766611> |

Changes made: each model keeps its colour texture at 512 pixels in WebP and
loses its other maps, clips were renamed to the game's walk, idle and eating
cycles and the rest removed, and meshes were welded and compressed with meshopt
through glTF Transform. The elephant has only a walk cycle, so it stands in its
rest pose when idle. None of the three has a falling cycle, so a struck animal
tips over. The credit also appears in the game's help dialog.

The files are served from the application and included in its offline cache.

## Cars

Four car bodies are models by
[Daniel Zhabotinsky](https://sketchfab.com/Daniel.Zhabotinsky), published on
Sketchfab under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The
files were taken from the
[Objaverse](https://huggingface.co/datasets/allenai/objaverse) mirror.

| Vehicle   | File                                   | Model              | Source                                                             |
| --------- | -------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| Touring   | `src/assets/models/cars/touring.glb`   | Fairheaven LT '80  | <https://sketchfab.com/3d-models/e2678da920cc4be68dbc193727919ffb> |
| Hatchback | `src/assets/models/cars/hatchback.glb` | Milano '95         | <https://sketchfab.com/3d-models/122a22d210234596ad23623588d0d166> |
| Supercar  | `src/assets/models/cars/supercar.glb`  | Saba V12 '95       | <https://sketchfab.com/3d-models/3ab977050c334c13b6abb5de078b4957> |
| Pickup    | `src/assets/models/cars/pickup.glb`    | Conquer '89 Pickup | <https://sketchfab.com/3d-models/6c48c94be8974dc7a5932f697c0ba68f> |

Changes made: textures were resized to 512 pixels and converted to WebP, and
geometry was welded, quantized, and compressed with meshopt through glTF
Transform. In the game each model is scaled to its vehicle's wheelbase, its
wheels are driven by the simulated suspension, and its body paint takes the
chosen colour. These are fictional designs; models carrying real marques were
not used. The credit also appears in the game's help dialog.

The roadster, coach, and motorcycle remain generated in code, as do all vehicles
on software rendering, in the bonnet view, and if a model fails to load.

## Surface textures

Road and ground surfaces use photographed materials from ambientCG, released
under
[Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| Surface       | Files                                                   | Source material |
| ------------- | ------------------------------------------------------- | --------------- |
| Asphalt       | `src/assets/asphalt-albedo.webp`, `asphalt-normal.webp` | Asphalt015      |
| Ground detail | `src/assets/ground-detail.webp`                         | Grass004        |

Changes made: each map was resized to 1024 pixels and converted to WebP. The
asphalt colour was desaturated and levelled so the road keeps its tint from the
weather, and the ground map is used as brightness only, layered over the
procedural field colours near the camera. Software rendering keeps the generated
asphalt.

## Rocks

The boulders scattered through each landscape are photoscanned rocks from Poly
Haven, released under
[Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| File                                 | Source asset           |
| ------------------------------------ | ---------------------- |
| `src/assets/models/rocks/rock-a.glb` | Rock 07                |
| `src/assets/models/rocks/rock-b.glb` | Rock 09                |
| `src/assets/models/rocks/rock-c.glb` | Namaqualand Boulder 04 |

Changes made: each scan was simplified to about 1,500 triangles, its textures
were resized to 512 pixels and converted to WebP, and the mesh was compressed
with meshopt. In the game they are scaled, turned and sunk slightly into the
ground, and are solid to drive into. Software rendering leaves them out.

## Plants

Three more photoscanned models from Poly Haven, also
[Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/),
are planted beside the road where they belong.

| File                                                   | Source asset          | Planted in                                  |
| ------------------------------------------------------ | --------------------- | ------------------------------------------- |
| `src/assets/models/plants/quiver.glb`                  | Quiver Tree 02        | desert and canyon                           |
| `src/assets/models/plants/stump.glb`                   | Tree Stump 01         | every landscape                             |
| `src/assets/models/plants/fern.glb`                    | Fern 02               | forest, fjord and jungle                    |
| `src/assets/models/plants/shrub.glb`, `shrub-wide.glb` | Shrub 02              | highlands, alpine, forest, fjord and jungle |
| `src/assets/models/plants/bush.glb`, `bush-small.glb`  | Searsia Lucida        | highlands, alpine, forest and fjord         |
| `src/assets/models/plants/scrub.glb`                   | Wild Rooibos Bush     | desert and canyon                           |
| `src/assets/models/plants/pachira.glb`                 | Pachira Aquatica 01   | jungle                                      |
| `src/assets/models/plants/calathea.glb`                | Calathea Orbifolia 01 | jungle                                      |

Changes made: the tree and the stump were simplified to about 5,000 and 2,000
triangles, textures were resized to 512 pixels and converted to WebP, and all
three were compressed with meshopt. In the game they are scaled, turned and
brightened to sit in the scene's lighting. The tree and the stump are solid;
ferns are not.

The shrubs, bushes and jungle plants each keep one variant of their scan at or
near its full detail, between 6,000 and 17,000 triangles, take their leaf
cut-outs from the scan's separate alpha map, use one 512 pixel colour texture in
WebP, and are compressed with meshopt. They are planted close to their real
size, can be driven through, and the leafy ones turn in autumn and are left out
in winter. Scans of fir and pine saplings were tried as roadside trees and left
out: cut down far enough to plant in numbers they lose their needles.

## Trees

The woodland trees are pictures of photoscanned plants from Poly Haven, released
under
[Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| File                                | Source assets                   | Used for                  |
| ----------------------------------- | ------------------------------- | ------------------------- |
| `src/assets/trees/broadleaf-a.webp` | Island Tree 02                  | broadleaf trees           |
| `src/assets/trees/broadleaf-b.webp` | Island Tree 02                  | spreading broadleaf trees |
| `src/assets/trees/conifer.webp`     | Fir Sapling, Pine Sapling Small | firs and pines            |
| `src/assets/trees/slender.webp`     | Searsia Lucida                  | tall slender trees        |
| `src/assets/trees/bush-a.webp`      | Searsia Lucida                  | woodland shrubs           |
| `src/assets/trees/bush-b.webp`      | Searsia Lucida                  | woodland shrubs           |

Changes made: each scan was rendered from the side at full detail under soft
light, with its leaf cut-outs from the scan's alpha map, into a 512 pixel
picture with a transparent background. The fir is built from several renders of
the fir and pine saplings layered into one full tree, and the slender tree from
layered bushes. The pictures are 768 pixels square, were levelled to a common
brightness, had their colour spread under the transparent edges, and were saved
as WebP. In the game they are drawn on the crossed tree cards that the painted
trees used, tinted per landscape, turned yellow to rust in autumn and dusted
with snow on the conifers in winter. Bare winter broadleaf trees are still
painted in code, as is every tree if a picture fails to load.
