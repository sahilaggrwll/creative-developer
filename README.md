# AETHER GT-E — Tilt-to-Unleash interstitial

A full-screen mobile rich-media ad. Tilt your phone to drive the AETHER GT-E through a city at night, pass five feature cards, then land on a call-to-action end card.

Vanilla HTML/CSS/JS, no libraries. Initial load is about **285 KB** plus web fonts.

## Run

Serve the folder with any static server (Netlify, Vercel, GitHub Pages, or `python3 -m http.server`) and open `index.html`.
- **Phone:** full-screen. iOS asks for motion permission when you tap the first screen.
- **Desktop:** the ad sits in a centred phone frame. Drag with the mouse or use ← → to drive. Buttons next to the frame switch between 9:16, 9:19.5 and 9:21.

## How the sensor drives the pan

Tilt works as a **throttle**: it sets the car's speed, not where the scene is. This feels like driving, and you don't need to hold the phone at an extreme angle to reach the end.

1. **Calibrate.** The first 6 `deviceorientation` readings are averaged. That average is the resting angle, so the phone works however it is held. If you tilt backwards at the start line, the resting angle quietly moves to match.
2. **Filter.** Raw `gamma` goes through a low-pass filter (α = 0.3 per event) to remove sensor jitter. In landscape the code uses `beta` instead, based on `screen.orientation.angle`.
3. **Map.** Tilt minus the resting angle gives a throttle from −1 to 1. There is a ±3° dead zone, full throttle comes at 22°, and a 1.35 power curve gives fine control at small angles.
4. **Inertia.** Speed moves toward `throttle × vmax` with time constants: 0.38 s when speeding up, 0.26 s when slowing down. Distance is speed integrated over `dt`, so the result is the same at any frame rate. At full throttle the drive (3 screen widths) takes about 3.4 s.
5. **Fallback.** If no sensor data has arrived 1.2 s into the drive (permission denied, or a desktop), the instruction changes to *"Swipe left"*. Drag uses Pointer Events, so touch and mouse share one code path. The scene follows the finger at 2.1× gain and keeps rolling with friction after a flick.

## What reacts to the motion

All of it uses `transform` / `opacity` in a single `requestAnimationFrame` loop:

- **Wheels** turn by `distance ÷ wheel radius` (radians), so they roll exactly with the road and never slip. Above about 30 % speed they blend into a motion-blurred wheel image.
- **Suspension:** the body pitches through a damped spring driven by acceleration. It squats when you speed up, dips when you brake, then settles. It also bounces slightly with road texture.
- **Brake lights** brighten when you slow down. **Headlight beam** and glow are always on.
- **Street-lamp reflections** slide over the paintwork in step with the lamps going past. This uses a gradient masked to the car's shape.
- **5-layer parallax:** sky ×0.05, far skyline ×0.2, mid city ×0.48, street ×1, foreground railing ×1.5.
- **Feature cards** live in the street layer and tilt in a slight cover-flow as they pass the centre. The centred card turns from dim to bright.
- **HUD:** five progress segments (one per card, lit when seen) and a live km/h readout.

## Assets: why they no longer look fake

| Before | Now |
|---|---|
| A separate stock wheel (different rim, visible tyre branding) pasted on the car | The car's **own wheels** are cut out of the car image (`tools/build_assets.py`), so the rim matches exactly. The wheel arches are filled dark underneath. |
| Hard 1-bit cut-out edges and a grey studio floor under the car | Floor removed, alpha eroded and feathered, car colour-graded down to night exposure |
| A square, perspective-road illustration stretched 4× wide | A **procedural night city** painted per layer with a seeded random generator: lit window grids, glass towers, neon signs, an in-world AETHER billboard, blinking aviation beacons, shopfronts, street lamps with light pools, and wet-road reflections. It is crisp at any DPR and adds no download. |
| Emoji icons on the cards | Card photos cropped from the product shots, with one shared colour grade |
| Static hero | Ken Burns zoom, pointer/tilt parallax, rain, and a daytime-running-light "welcome" flash |

To rebuild the assets: `python3 tools/build_assets.py` (needs Pillow, numpy and ImageMagick).

## States

`teaser → drive → first move (5 %) → cards → exit (end of the drive) → end card`

- **Teaser:** the headline lines rise in one after another and the pill pulses. Tapping it requests iOS permission inside that tap, then cross-fades over 500 ms.
- **Drive:** the headline appears at 1 s and the instruction at 3.5 s. At 5 % the headline slides out left and the dark overlay fades. This fires once.
- **Exit:** input locks, the HUD and instruction fade, then after 450 ms the car pulls away to the right on an ease-in curve, with wheels still rolling exactly. The cards slide off left one after another.
- **End card:** slides in from the right. The hero image eases in, the headlights flash, then the lockup, specs and CTA come in, and the CTA has a shine sweep. The CTA opens the landing URL in a new tab. "Drive again" replays. × works in every state.

Tracking (`console.log`): `impression`, `first_interaction`, `motion_permission`, `first_move`, `card_seen` ×5, `completion`, `cta_click`, `replay`, `close`. Haptic tick (`navigator.vibrate(12)`) as each card reaches the centre. `prefers-reduced-motion` turns off rain, Ken Burns, bounce and pitch, and cover-flow, and replaces slides with fades.

## Structure

```
index.html            markup for the three states
style.css             layout (container-query units), choreography, reduced motion
js/scene.js           procedural panorama painter (one canvas per parallax layer)
js/app.js             state machine, input, motion model, render loop
tools/build_assets.py car cut-out, wheel sprites, motion blur, card crops
assets/build/         generated runtime images
```

## With more time

- **One consistent product shoot.** The teaser, side and front images are three different dark sedans. A single 3D render set of one car is the biggest remaining improvement.
- A separate, non-rotating brake caliper layer.
- An engine sound tied to speed, with a mute toggle.
- Render the city to WebP at build time for very low-memory devices. Today it is painted at runtime with DPR capped at 2.
