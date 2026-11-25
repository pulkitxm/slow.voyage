# Generated assets

Every bundled model and texture in `src/assets/` is original work produced by the
scripts in `tools/assets/`. Nothing is downloaded or derived from outside models,
scans, or photographs. Each group regenerates into its existing paths with one
command run from the repository root.

Requirements: Blender 4.5 on `PATH`, at `~/.local/bin/blender`, or named by
`BLENDER`; Bun for the glTF Transform weld, quantize, and meshopt steps; and, for
textures, Python with numpy and Pillow.

| Group            | Outputs                                                           | Command                                                                                               |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Cars             | `src/assets/models/cars/*.glb`                                    | `python3 tools/assets/cars/generate.py`                                                               |
| People           | `src/assets/models/man.glb`, `woman.glb`                          | `python3 tools/assets/people/generate.py`                                                             |
| Animals          | `src/assets/models/{sheep,horse,deer,cattle,bull,elephant}.glb`   | `python3 tools/assets/animals/generate.py`                                                            |
| Rocks and plants | `src/assets/models/rocks/*.glb`, `src/assets/models/plants/*.glb` | `python3 tools/assets/vegetation/build.py`                                                            |
| Trees            | `src/assets/trees/*.webp`                                         | `python3 tools/assets/trees/generate.py`                                                              |
| Textures         | `src/assets/rock-*`, `asphalt-*`, `ground-detail.webp`            | `uv run --with-requirements tools/assets/textures/requirements.txt tools/assets/textures/generate.py` |

Most generators accept `--previews <dir>` to render preview images.

## Cars

The touring sedan, hatchback, supercar, and pickup are lofted bodies with cut
wheel arches, glass, lamps, interiors, and separate wheels named `Wheel_FL`,
`Wheel_FR`, `Wheel_RL`, and `Wheel_RR`. The paint material is `body`, and the lamp
meshes are `Headlights` and `Taillights`. The game scales each body to its
vehicle's wheelbase and drives the wheels from the simulated suspension. The
roadster, coach, and motorcycle are built in code, as is every vehicle on software
rendering, in the bonnet view, or if a model fails to load.

## People and animals

Walkers are skinned meshes on a 19-bone skeleton with `Idle`, `Walk`, `Run`, and
`Death` clips. `Shirt`, `Pants`, and `Skin` are recoloured per walker. Every animal
comes from one parametric quadruped with per-species proportions and features,
one vertex-coloured `Coat` material, and `Walk`, `Run`, `Idle`, `Eating`, and
`Death` clips. Goats and camels, and every figure on software rendering, are
built in code.

## Rocks and plants

Rocks and the stump are sculpted, decimated to about 1,500 to 2,000 triangles,
and baked to a 512 pixel albedo and normal map. Plants are grown from tubes and
leaf cards with painted 512 pixel leaf atlases. Wood and leaves use separate
materials so only leaves turn in autumn and leafy plants are left out in winter.
Software rendering leaves them out.

## Trees

The woodland tree cards are orthographic renders of procedurally grown trees,
768 pixels square, with leafless variants for winter. Edge colour is bled under
the transparent pixels and each picture is levelled to a common brightness. Bare
winter broadleaf trees and every tree on a failed load are painted in code.

## Textures

Rock, asphalt, and ground detail maps are built from periodic noise, Worley cells,
and Poisson-disk aggregate so they tile without seams. Normals come from height by
wrapped finite differences. The rock albedo mean matches the colour divisor in
`src/game/ground.ts`, and asphalt and ground detail keep the brightness the
shaders expect.
