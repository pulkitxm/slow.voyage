# The looping world

This note records how the world is laid out and which features it offers.

## Shape

The world is a torus measured in road coordinates. The road is a single line
`x = f(s)`, where `s` runs along the lap and `x` across it.

- It repeats every 12 km along `s`. Road curves, terrain, woodland, roadside
  furniture, and landmarks all wrap their lattice indices, so lap two is the
  same place as lap one. `physics.s` keeps counting, and lap numbers come from it.
- It repeats every 3 km across `x`, measured from the road. When the car passes
  1.5 km from the road it is moved 3 km sideways in the same step. Terrain tiles
  are drawn a second time across the seam so the join is not visible.

Both lengths are whole multiples of the terrain control cells and the 120 m tile.

## Getting back to the road

Leaving the road and continuing leads back to it. Three rules make that hold:

- Water is shallow everywhere. Terrain eases onto a bed 0.3 m under the surface,
  so lakes and bays can be forded slowly instead of acting as walls.
- Alpine and canyon landscapes open two gentle passes per lap across the full
  width, because their mountains and mesas otherwise wall the road in.
- A flood fill over the height field checks, for every landscape and several
  seeds, that a route no steeper than 35 percent leaves the road, crosses the
  side seam, and returns. Steep hillsides still stop a car driven straight at
  them, as they should; the route goes around.

The minimap shows the terrain, the road and its copies across the seam, an arrow
with distance back to the road, lap progress, and landmarks. The N key opens a map
of the whole loop.

## Features

- Boost draws from a charge that burns for 7 seconds and refills in 22. While it
  fires it adds drive past the nominal top speed, widens the view, and streaks
  the edges of the frame.
- Rendering on capable hardware goes through an HDR pipeline with bloom, ambient
  occlusion, distance haze, and grading. Slow frames step the resolution down
  before any effect is dropped, and a display that is steadily capped at 30 Hz is
  not treated as slow.
- Landscapes are profiles in `src/game/landscapes.ts`. Forest, canyon, and
  northern lakes were added to highlands, alpine, and desert.
- Skies include dawn, dusk, and a live cycle through a full day every twelve
  minutes. Weather includes a storm with lightning and thunder.
- A pickup, hatchback, and supercar are built from a lofted body generator.
- Laps are timed from line to line. A link encodes landscape, seed, and distance.
  Photo mode freezes the drive and hides the interface.
- The road carries delineator posts, bend chevrons, and a gantry at the lap line.
  Up to eight landmarks per lap can be found.
- Tyres raise dust, smoke, and spray, and leave skid marks when they slide.
