# BMW M4 Competition — Tilt-to-Unleash interstitial

A full-screen mobile rich-media ad. Tilt your phone to drive a BMW M4 Competition through a city at night, pass five feature cards, then land on a call-to-action end card.

Vanilla HTML/CSS/JS, no libraries. Initial load is about **600 KB** plus web fonts.

> Non-commercial demo built for a creative-developer test. BMW, M4 and the BMW M logo colours are trademarks of BMW AG. This project is not affiliated with or endorsed by BMW.

## Image sources

**All car images were generated with Google Gemini** (text-to-image, November 2026), from one prompt describing a Black Sapphire BMW M4 Competition (G82, LCI). They are AI-generated, not photographs of a real car.

| Source (not in repo) | Used for | Processed into |
|---|---|---|
| `side.png`, studio side profile | the car you drive | `car-body.webp`, plus wheel, spoke and caliper layers for each wheel |
| `teaser.png`, night street, vertical | opening screen | `teaser.webp` |
| `front.png`, dark studio, square | end card | `front.webp` |
| `card-1…5.png`, close-ups | feature cards | `card-1…5.webp` |

Gemini puts a visible ✦ mark in the bottom-right corner of each image. Every image is cropped so that corner is not included (see `build_photos()` in `tools/build_assets.py`).

The originals (63 MB, watermarked) are not included. `tools/build_assets.py` documents every processing step; with the originals placed in `assets/source/` it rebuilds `plain/assets/build/` (needs Pillow, numpy, scipy and ImageMagick).

Everything else is drawn in code: the city, the street, rain, light effects and icons.

## Two versions

| Folder | What it is |
|---|---|
| `plain/` | The ad as plain HTML/CSS/JS. This is the source of truth, and what the live link serves. |
| `gwd/` | The same ad as a Google Web Designer document (Display & Video 360 → Interstitial), ready to publish from GWD. |

`gwd/` is generated from `plain/`. After changing anything in `plain/`, run `python3 tools/make_gwd.py`. It updates `gwd/Creative-Developer.html` in place, writes `gwd/bmw-ad.css` and `gwd/bmw-ad.js`, and copies the images. Reopen the document in GWD afterwards.

What changes in the GWD version:
- **CSS and JS:** they live in linked files rather than inline. GWD re-saves inline CSS through Chrome (which drops `-webkit-` properties iOS needs), and it scans inline scripts for asset paths.
- **Click-through:** the CTA calls `Enabler.exit('CTA', url)`, so no GWD Exit event is needed.
- **Close button:** the ad's own × is hidden, because the ad server draws one.
- **Media rules:** GWD only understands width breakpoints. The reduced-motion and landscape rules become class rules, switched by `matchMedia`, and the desktop review frame is dropped.
- **Images:** GWD turns `<img>` into `<gwd-image>`, and extra CSS keeps both laid out the same.

The packaged ad from GWD's *Publish → Locally* lands in `gwd/Creative-Developer/Creative-Developer_360x640.zip`.

## Run

Serve the repo with any static server (GitHub Pages, Netlify, Vercel, or `python3 -m http.server`) and open `plain/index.html`.
- **Phone:** full-screen. Tilt needs HTTPS. iOS asks for motion permission when you tap the first screen.
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

- **Wheels** turn by `distance ÷ wheel radius` (radians), so they roll exactly with the road and never slip. Each wheel is three layers cut from the car photo: the rim and brake disc rotate, the **red M caliper stays still** (as on a real car), and the spokes rotate on top so they pass in front of it. Above about 30 % speed the rotating layers blend into motion-blurred versions.
- **Suspension:** the body pitches through a damped spring driven by acceleration. It squats when you speed up, dips when you brake, then settles. It also bounces slightly with road texture.
- **Brake lights** brighten when you slow down. **Headlight beam** and glow are always on.
- **Street-lamp reflections** slide over the paintwork in step with the lamps going past. This uses a gradient masked to the car's shape.
- **5-layer parallax:** sky ×0.05, far skyline ×0.2, mid city ×0.48, street ×1, foreground railing ×1.5.
- **Feature cards** live in the street layer and tilt in a slight cover-flow as they pass the centre. The centred card turns from dim to bright.
- **HUD:** five progress segments (one per card, lit when seen) and a live km/h readout.

## Asset processing (`tools/build_assets.py`)

- **Car cut-out:** the car is separated from the grey studio background by brightness. Enclosed light areas are filled in, so the windows stay part of the car. The edge gets a soft alpha, then the grey studio tint is removed from the edge pixels so no halo shows on the dark street.
- **Floor:** the studio floor shadow below the sill is removed. The windows are darkened to night-tinted glass, and the body is graded down to night exposure.
- **Caliper:** red pixels are detected and joined into one solid caliper shape. Under it, the rotating layer is filled with the wheel's own image rotated by the angle that best matches the spoke pattern, so spokes and disc continue behind it.
- **Direction:** the car is mirrored so it drives to the right.

## States

`teaser → drive → first move (5 %) → cards → exit (end of the drive) → end card`

- **Teaser:** the headline lines rise in one after another and the pill pulses. The hero image has a Ken Burns zoom, rain, pointer/tilt parallax and a headlight "welcome" flash. Tapping the pill requests iOS permission inside that tap, then cross-fades over 500 ms.
- **Drive:** the headline appears at 1 s and the instruction at 3.5 s. At 5 % the headline slides out left and the dark overlay fades. This fires once.
- **Exit:** input locks, the HUD and instruction fade, then after 450 ms the car pulls away to the right on an ease-in curve, with wheels still rolling exactly. The cards slide off left one after another.
- **End card:** slides in from the right. The hero image eases in, the headlights flash, then the M4 Competition lockup, specs (530 hp · 3.4 s · 650 Nm) and CTA come in, and the CTA has a shine sweep. The CTA opens the landing URL in a new tab. "Drive again" replays. × works in every state.

Tracking (`console.log`): `impression`, `first_interaction`, `motion_permission`, `first_move`, `card_seen` ×5, `completion`, `cta_click`, `replay`, `close`. Haptic tick (`navigator.vibrate(12)`) as each card reaches the centre. `prefers-reduced-motion` turns off rain, Ken Burns, bounce and pitch, and cover-flow, and replaces slides with fades.

## Structure

```
plain/
  index.html            markup for the three states
  style.css             layout (container-query units), choreography, reduced motion
  js/scene.js           procedural panorama painter (one canvas per parallax layer)
  js/app.js             state machine, input, motion model, render loop
  assets/build/         runtime images
gwd/
  Creative-Developer.html   GWD document (DV360 interstitial)
  bmw-ad.css, bmw-ad.js     generated from plain/ by tools/make_gwd.py
  gwd*_min.js / *_style.css GWD's own component files
  assets/build/             copy of plain/assets/build/
tools/
  build_assets.py       car cut-out, 3-layer wheels, motion blur, photo crops
  make_gwd.py           builds gwd/ from plain/
```

## With more time

- Real photography or a licensed 3D model instead of AI images, for a production ad.
- An engine sound tied to speed, with a mute toggle.
- Render the city to WebP at build time for very low-memory devices. Today it is painted at runtime with DPR capped at 2.
