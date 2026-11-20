# Rebuilding holes from the designs

The hole art and geometry come from the design generator in the project files (`designs/generator/holes3.py`) and its looks page.

1. `python3 tools/gen.py` writes `holes.json` from the generator's hole specs (it reads only the spec part, so it never rewrites the looks page). Wrap it as `window.HOLES = …;` in `holes.js`.
2. `node tools/ex3.js` dumps each hole's SVG and the shared sprites from the looks page; `python3 tools/strip.py` removes the HUD, ball, flags and live kangaroos and writes `holes/hN.svg`.
3. `node tools/bot.js` plays every hole with a simple bot as a smoke test (needs Playwright).

Paths inside the scripts point at the cloud session's working folders; adjust them if you run them elsewhere.
