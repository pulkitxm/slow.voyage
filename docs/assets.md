# Asset sources

The bundled rock surface uses [Rock Face 03](https://polyhaven.com/a/rock_face_03)
by Dario Barresi and Rico Cilliers, published by Poly Haven under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- `src/assets/rock-albedo.jpg` derives from `rock_face_03_diff_1k.jpg`.
- `src/assets/rock-normal.png` derives from `rock_face_03_nor_gl_1k.png`.

Both maps are reduced to 512 by 512 pixels. The color map uses JPEG compression.
The OpenGL normal map is converted to eight-bit PNG with renormalized vectors.
The material tiles over 3.6 meters with world-space color variation. Native
rendering combines two texture scales and normal detail; software rendering
samples one color scale and retains the underlying terrain bump shading.
Three projections blend by surface orientation to avoid stretching
on differently facing slopes. Each normal projection uses its own tangent frame.
Seasonal rock and soil colors tint the photographic surface.

The files are served from the application and included in its offline cache.
The running game makes no requests to Poly Haven.

## People and animals

Walkers and four of the grazing animals are rigged models by
[Quaternius](https://quaternius.com/), published under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- `src/assets/models/man.glb` and `woman.glb` derive from the Man and Woman Casual
  models, downloaded from [Poly Pizza](https://poly.pizza/m/HMnuH5geEG).
- `src/assets/models/sheep.glb` derives from the Sheep model on
  [Poly Pizza](https://poly.pizza/m/rgJXF570ZK).
- `src/assets/models/cow.glb`, `horse.glb`, and `deer.glb` derive from the
  [Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html)
  pack.

Each file keeps only its walk, idle, and eating clips. Meshes are welded and
quantized with glTF Transform, which brings the six files to about 2 MB together.
Shirt, trouser, and skin materials are recoloured per walker. Goats, camels, and
elephants have no suitable public-domain rigged model and remain generated in code,
as does every figure on software rendering or if a model fails to load.

The files are served from the application and included in its offline cache.

## Cars

Four car bodies are models by
[Daniel Zhabotinsky](https://sketchfab.com/Daniel.Zhabotinsky), published on Sketchfab
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The files were
taken from the [Objaverse](https://huggingface.co/datasets/allenai/objaverse) mirror.

| Vehicle   | File                                   | Model              | Source                                                             |
| --------- | -------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| Touring   | `src/assets/models/cars/touring.glb`   | Fairheaven LT '80  | <https://sketchfab.com/3d-models/e2678da920cc4be68dbc193727919ffb> |
| Hatchback | `src/assets/models/cars/hatchback.glb` | Milano '95         | <https://sketchfab.com/3d-models/122a22d210234596ad23623588d0d166> |
| Supercar  | `src/assets/models/cars/supercar.glb`  | Saba V12 '95       | <https://sketchfab.com/3d-models/3ab977050c334c13b6abb5de078b4957> |
| Pickup    | `src/assets/models/cars/pickup.glb`    | Conquer '89 Pickup | <https://sketchfab.com/3d-models/6c48c94be8974dc7a5932f697c0ba68f> |

Changes made: textures were resized to 512 pixels and converted to WebP, and
geometry was welded, quantized, and compressed with meshopt through glTF Transform.
In the game each model is scaled to its vehicle's wheelbase, its wheels are driven
by the simulated suspension, and its body paint takes the chosen colour. These are
fictional designs; models carrying real marques were not used. The credit also
appears in the game's help dialog.

The roadster, coach, and motorcycle remain generated in code, as do all vehicles on
software rendering, in the bonnet view, and if a model fails to load.
