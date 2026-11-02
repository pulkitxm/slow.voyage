# Slow Roads

An endless scenic driving game built with TanStack Start, React, TypeScript, and
Three.js. All geometry and sounds are generated locally. Fonts and application
assets are bundled for offline play.

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

## Controls

| Key              | Action                  |
| ---------------- | ----------------------- |
| W / Up           | Accelerate              |
| S / Down         | Brake, then reverse     |
| A D / Left Right | Steer                   |
| Space            | Handbrake               |
| F                | Autodrive               |
| G                | Assistance mode         |
| + / -            | Cruise speed            |
| C                | Cycle camera            |
| Q / E            | Previous / next scenery |
| V / Shift V      | Next / previous vehicle |
| M                | Toggle mouse driving    |
| R                | Reset to the road       |
| P / Escape       | Pause                   |
| H                | Help                    |

Touch devices have steering and pedal buttons. Settings include four vehicles,
three landscapes, three seasons, lighting, paint, camera, grip, power, sound,
detail, and units. Preferences are stored on the device.

The Controls tab selects full autodrive, steering assistance, or speed assistance.
Steering input releases steering assistance; pedal input releases speed
assistance. One-pedal driving gently brakes on accelerator release without
selecting reverse. Cruise speed follows the selected display units.

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
reloading with its test origin shut down. Chrome is discovered automatically on
macOS and Linux; set `BROWSER_EXECUTABLE` to override its location.

The worker has its own TypeScript configuration. CI builds the worker and tests
installation, application reloads with the origin unavailable, cached scripts,
cache upgrades, and isolation from unrelated requests and storage.

## Quality gates

`bun install` installs the Lefthook pre-commit hook. Every commit runs formatting
and lint checks, strict YAML 1.2 validation, YAML formatting, route generation,
application and worker type checks, and dynamics and preference tests. YAML must
contain one document with unique keys, without anchors or aliases.

CI installs from the frozen Bun lockfile, runs the same checks, creates the
production build, tests the compiled offline worker, and runs real-browser checks. Use `bun run format` to
apply formatting.

## Visual review

Run `bun run review:capture pass-name` while the local server is running to save
repeatable 1280 × 720 comparisons with the accessible historical v1.0.1 build.
Each clean browser session enables autodrive and captures six and twelve seconds
of driving. The generated `.review/pass-name/index.html` compares the frames;
the manifest records the revision and browser errors. Capture files remain local
and are ignored by Git. Open `http://localhost:3002/__review/pass-name/` to view
the comparison. This viewer is available only in development. Different routes
and seeds limit terrain comparisons.
Review visual findings, change one related concern, and capture again with a new
label. Verify handling changes with measured input-response and simulation checks.

## Structure

- `src/game`: world generation, geometry, dynamics, cameras, and audio.
- `src/components`: dashboard controls, settings, and accessible native dialogs.
- `src/useDrive.ts`: browser lifecycle, preferences, and interface state.
- `worker/sw.ts`: the offline worker.
- `scripts/offline.ts`: content-addressed precache generation and worker bundling.
- `tests/offline.test.ts`: production worker tests against an unavailable origin.

The current fidelity findings and remaining reconstruction work are recorded in
[the reference study](docs/reference-study.md).
