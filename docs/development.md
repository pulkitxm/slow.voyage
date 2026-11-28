# Development

## Run

Requires Bun 1.4.2 or newer.

```sh
bun install
bun run dev
```

The live development server uses port 3002 with hot updates. The port is strict,
so a conflicting process causes an explicit failure.

```sh
bun run validate
bun run build
bun run test:offline
bun run test:browser
bun run preview
```

Stop the development server before starting the production preview on port 3002.
The production build is a static site in `dist/client` and can be served over
HTTPS or localhost. No application server is required.

Development and verification stay local. Checkpoint commits are published to
GitHub through Pukbot. The `Pages` GitHub Actions workflow builds every push to
main with Bun and publishes `dist/client` to GitHub Pages at
<https://slow.voyage>.
Local pre-commit checks remain mandatory.

## Controls

| Key              | Action                                                           |
| ---------------- | ---------------------------------------------------------------- |
| W / Up           | Accelerate                                                       |
| Shift            | Boost while charged                                              |
| S / Down         | Brake, then reverse                                              |
| A D / Left Right | Steer                                                            |
| Space            | Handbrake                                                        |
| F                | Autodrive                                                        |
| G                | Assistance mode                                                  |
| + / -            | Cruise speed                                                     |
| C                | Cycle camera                                                     |
| X                | Look behind                                                      |
| T                | Photo mode                                                       |
| B                | Horn                                                             |
| Q / E            | Previous / next scenery; shift down / up with the manual gearbox |
| V / Shift V      | Next / previous vehicle                                          |
| O                | Pull into a roadside garage when one is beside you               |
| M                | Mute / unmute sound                                              |
| U                | Toggle mouse driving                                             |
| R                | Reset to the road                                                |
| P / Escape       | Pause                                                            |
| H                | Help                                                             |

Touch devices have steering and pedal buttons. Settings include seven vehicles
with front, rear, or four-wheel drive, twenty-four engines and the 87 real cars
they went into, switchable antilock brakes, brake force distribution, and
traction control, seven landscapes, three seasons, six skies including a live day cycle, five kinds
of weather, paint, camera, grip, power, sound, detail, and units. Preferences are
stored on the device. Detail has three levels: Easy on the engine, Full beauty,
and Ultra. Ultra is the default on hardware that can hold it at 60 frames a
second, and it lowers its own resolution and effects, or steps back to Full
beauty, when frames run slow. Tyre smoke, dust, rain spray, sparks, and visible headlight
beams follow the detail level: Ultra shows them in full, Full beauty with fewer
particles and simpler beams, and Easy on the engine keeps only the lamp glow.

The Journey tab also chooses the road itself. Winding Roads is the full road
with every bend. Endless Straight holds one heading for the whole drive while the
hills, lakes and forests keep changing around it. Calm Drive keeps only long,
wide curves and halves the walkers on the verge. Links to a spot carry the road
mode.

The car list's easy picks include four supercars: the mid-engine Corsa V12, the
front-engine Aurelia GT with a twin-turbo six, the Strale Longtail with a
flat-plane V8 and the winged Furia R with a V10. Each has its own generated body,
gearing and synthesized engine.

Every car slowly gathers dirt as it drives: a little on dry tarmac, more in
rain and storms, much more off the road and fastest through water. Winter roads
leave a pale salt film. Dirt settles low on the body and behind the wheels and
dulls the clear coat, and it is kept per vehicle on the device.

A roadside garage sits on a flat, unrailed spot of roughly every 3 km of road.
Slow down beside one and press O, or the on-screen prompt, to roll into the
service bay. Two mechanics can foam, scrub and rinse the car, respray it in a
new colour, swap the wheels for one of four alloy designs in four finishes, or
fit a stock or sport valved exhaust and rev it to test. Escape or Drive out
reverses back onto the road.

Lifting off the throttle from high revs crackles and pops through the exhaust,
and loaded upshifts bark. The sport valved exhaust, the default, makes the runs
longer and louder; at night a short flame flickers at the supercar tailpipes on
the biggest pops.

The minimap shows the next 1.6 km of road, the terrain, landmarks to find, and an
arrow back to the road when off it. Far from the road a pointer on screen shows
the way back. The Journey
tab copies a link that reopens the same road at the same spot.

The Controls tab selects full autodrive, steering assistance, or speed assistance.
Steering input releases steering assistance; pedal input releases speed
assistance. One-pedal driving gently brakes on accelerator release without
selecting reverse. Cruise speed follows the selected display units.

Keyboard steering is free by default: a key turns the car as hard as the tyres
allow at any speed, with the same response on a fast road as on a slow one. The
steering setting can add a light or strong assist, where a tap at highway speed
only nudges the car within its lane and holding a key builds to full grip.

Drag the scenery to orbit in chase view or look around in bonnet view. Scroll to
zoom in chase view and double-click to reset the camera. When mouse driving is
enabled, use the middle mouse button for camera movement. Bonnet look-around
returns smoothly to the road after release. The field of view widens subtly at
speed, and portrait framing gives the vehicle more room.

Standard controllers use the left stick to steer, right trigger to accelerate,
and left trigger to brake. A starts, B is the handbrake, X toggles assistance,
Y changes camera, Start pauses, and Back resets to the road. The left bumper
cycles assistance modes; D-pad up/down adjusts cruise speed. Controls settings
include an enable switch and stick deadzone. Button labels refer to Xbox positions;
PlayStation controllers use the corresponding positions.

Mouse driving uses horizontal cursor position for steering. Hold left click to
accelerate or right click to brake and reverse. Enable it with M or in Controls
settings, where sensitivity is adjustable. Keyboard and touch remain available;
mouse driving takes priority over controller pedals and steering.

The Vehicle tab has one searchable car list, shown as a grid of car pictures in
the chosen paint. Easy picks are the seven game vehicles, each with a one-line
description; below them are the 87 real cars by maker. Picking a real car switches to the chassis that suits it, puts that car's
own body on it in a factory paint, and fits its engine. The car keeps the
chassis's handling; its wheelbase, track and wheel sizes are the real car's. A
second list optionally swaps in any of the twenty-four engines, keeping the
chosen car's body; Its own engine restores the original. The motorcycle keeps
its own engine.

Each real car reaches its own published top speed and accelerates by its own
power to weight; a swapped engine moves both from there. Boost is stronger but
shorter on light, powerful cars and gentler but longer on everyday ones. Each car
also carries its own kind of brakes: front discs with rear drums, discs,
ventilated discs, large multi-piston discs, carbon-ceramics or carbon racing
brakes. Stronger brakes bite harder and let antilock hold more of the tyre
grip, so they stop shorter even at the grip limit. Brakes heat up under repeated
hard stops and fade as they do, ceramics barely fade, and carbon racing brakes
need some heat before they bite fully. The settings show each car's top speed and brakes.

Car paint is a metallic clearcoat. On Full beauty and Ultra a reflection probe
renders the surroundings around the car into a cube map, one face a frame, and the
paint, glass, chrome and lamp lenses mirror it; Easy on the engine and software
rendering keep the painted sky reflection. Car bodies are not part of the offline
install: each is cached the first time it is driven and works offline afterwards.

Q and E move through scenery, seasonal weather, and time-of-day presets. V cycles
vehicles; Shift V cycles backward. Branding and decorative status messages disappear
once driving starts. Weather settings include clear skies, overcast, rain, and fog.
Rain becomes snow in winter. Wet road traction also informs assisted corner speeds.

## Offline behavior

The production build precaches every bundled asset before activating its service
worker. Once the interface displays "Offline ready", reloading and driving work
with the origin unavailable. Development mode uses live source updates and leaves
service worker registration disabled.

The browser suite uses an isolated Chrome profile and verifies renderer errors,
bonnet visibility, keyboard button activation, seasonal vehicle changes, and
reloading with its test origin shut down. Chrome is discovered automatically
through PATH lookup and installed-browser discovery. Set `BROWSER_EXECUTABLE` to an
executable command name or path to override discovery. Relative paths resolve
from the project directory, so local wrappers can move with the project.
Local environment files stay untracked; `.env.example` lists the optional settings.

Held-key flows also use Playwright with the same browser discovery and isolated
production fixture. They verify braking from powered motion, switching from
accelerating reverse into forward travel, and steering with held, released, and
opposing keys through the rendered dashboard and steering telemetry.
Captures and readout traces remain in the ignored `.review/held-driving/` folder.

The worker has its own TypeScript configuration. Local checks build the worker and test
installation, application reloads with the origin unavailable, cached scripts,
cache upgrades, and isolation from unrelated requests and storage.

## Quality gates

`bun install` installs the Lefthook pre-commit hook. Every commit runs formatting
and lint checks, strict YAML 1.2 validation, YAML formatting, route generation,
application and worker type checks, and dynamics and preference tests. YAML must
contain one document with unique keys, without anchors or aliases.
The hook uses the project runner through Bun and rejects commits when that runner
is unavailable.

Run `bun install --frozen-lockfile`, `bun run validate`, `bun run build`,
`bun run test:offline`, and `bun run test:browser` locally before a release
checkpoint. Use `bun run format` to apply formatting.

## Launch media

With the development server running on port 3002, `bun run media:video` renders
the launch video and `bun run media:frames` renders the launch frames and the
three-panel carousel. Both write to the ignored `.review/launch/` folder and run
in headless Chrome on the GPU.

Capture is deterministic: the page clock advances in fixed steps and every
animation frame hands the game exactly one sixtieth of a second, so the video
plays at real speed with no dropped or doubled frames however long a frame takes
to render. The video is 50 seconds at 60 fps in 4K, with a 1080p copy sized for
social posts and silent versions of both. Its soundtrack is assembled from the
game's own synthesized engine, road and wind sound, rendered on demand with
`scripts/sound-render.ts`. Pass `--scale 1` for a quick 1080p preview, `--url` for
another server, and `--only 01,08` to render selected frames.

## Visual review

Run `bun run review:capture pass-name` while the local server is running to save
repeatable 1280 × 720 captures of the local build.
Each clean browser session enables autodrive and captures six and twelve seconds
of driving. The generated `.review/pass-name/index.html` shows the frames;
the manifest records the revision and browser errors. Capture files remain local
and are ignored by Git. Open `http://localhost:3002/__review/pass-name/` to view
the capture. This viewer is available only in development.
Review visual findings, change one related concern, and capture again with a new
label. Verify handling changes with measured input-response and simulation checks.

## Sound

Every sound is synthesised live, with no recordings. An audio worklet models
each engine from its cylinders, firing order and exhaust, and renders tyres,
road, wind, rain and ambience off the main thread; reverberation comes from
generated impulse responses. `bun scripts/sound-render.ts --out .review/sound`
checks firing frequencies, offsets, parameter steps and render cost. Add
`--url http://localhost:3002` with the development server running to render
every vehicle through the full mix into WAV files and spectrograms there.

## Structure

- `src/game`: world generation, geometry, dynamics, cameras, and audio.
- `scripts/sound-render.ts`: offline sound renders, spectrograms, and checks.
- `src/components`: dashboard controls, settings, and accessible native dialogs.
- `src/useDrive.ts`: browser lifecycle, preferences, and interface state.
- `worker/sw.ts`: the offline worker.
- `scripts/offline.ts`: content-addressed precache generation and worker bundling.
- `scripts/frame-times.ts`: median and 95th percentile frame times per detail level.
- `tests/offline.test.ts`: production worker tests against an unavailable origin.
