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

| Key              | Action              |
| ---------------- | ------------------- |
| W / Up           | Accelerate          |
| S / Down         | Brake, then reverse |
| A D / Left Right | Steer               |
| Space            | Handbrake           |
| F                | Autodrive           |
| G                | Assistance mode     |
| + / -            | Cruise speed        |
| C                | Cycle camera        |
| R                | Reset to the road   |
| P / Escape       | Pause               |
| H                | Help                |

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

## Structure

- `src/game`: world generation, geometry, dynamics, cameras, and audio.
- `src/components`: dashboard controls, settings, and accessible native dialogs.
- `src/useDrive.ts`: browser lifecycle, preferences, and interface state.
- `worker/sw.ts`: the offline worker.
- `scripts/offline.ts`: content-addressed precache generation and worker bundling.
- `tests/offline.test.ts`: production worker tests against an unavailable origin.

The current fidelity findings and remaining reconstruction work are recorded in
[the reference study](docs/reference-study.md).
