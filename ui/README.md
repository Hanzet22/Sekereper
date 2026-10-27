# HANZET-SCRAPER UI

Root `index.html` is the HTML5 shell. UI assets are split by responsibility:

- `assets/`: favicon and external SVG icon sprite.
- `css/app.css`: responsive project styling and Houdini fallback.
- `css/tailwind.input.css`: Tailwind CSS v4 source.
- `css/tailwind.css`: browser-served CSS output; contains a small offline fallback until built.
- `js/app.js`: API client, scrape/batch/crawl controls, progress and exports.
- `js/ambient-canvas.js`: Canvas ambience and Paint Worklet loader.
- `worklets/hanzet-grid.js`: CSS Houdini Paint Worklet.

From the repository root, run `npm install` then `npm start`. Express serves the workbench at `http://127.0.0.1:3131/`. Use `npm run build:ui:css` to compile Tailwind or `npm run watch:ui:css` while editing. Canvas/Houdini are optional enhancements and respect reduced-motion settings. The API defaults to the current page origin.
