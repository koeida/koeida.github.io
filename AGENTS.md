# Repository Guidelines

This repository hosts the Koeida timeline and supporting static assets. Use this guide to keep contributions consistent and repeatable.

## Project Structure & Module Organization
- Root `index.html` is the GitHub Pages landing page; timeline app lives in `timeline/` with `index.html`, `script.js`, `styles.css`, and data under `content/`.
- Movie metadata stays in `timeline/content/movies.json`; poster art belongs in `/covers/` using slugged filenames that match the JSON `cover_url`.
- `scans/` contains the document viewer, compression script, optimized image manifests, and accompanying tests. Use `scans/images/` for raw uploads and `scans/images_optimized/` for generated output.
- Reference artifacts (word lists, PDFs, screenshots) are housed in `docs/`.

## Build, Test, and Development Commands
- `python3 -m http.server --directory timeline 8000` — preview the timeline locally at `http://localhost:8000`.
- `python3 timeline/tools/fetch_apple_covers.py "American Graffiti:1973"` — download and slug a poster into `covers/` via the iTunes API (requires `requests`).
- `python3 scans/compress_images.py` — batch-compress any new `scans/images/` assets (install Pillow per `scans/requirements.txt`).
- `node scans/tests/hud_and_preload_test.js` — run the JS unit tests that mirror the viewer preload logic.

## Coding Style & Naming Conventions
- Keep HTML, CSS, and JS indented with two spaces; prefer single quotes in JS and descriptive const names. Avoid inline styles outside prototypes.
- Python scripts follow standard PEP 8 with snake_case helpers and docstrings; keep CLI usage examples up to date.
- JSON is stored compactly; append new movie objects in watched-date order without trailing commas and ensure `watched_date` uses UTC `YYYY-MM-DD`.

## Testing Guidelines
- Run the Node tests before committing viewer changes; they guard preload rules shared with the browser.
- For UI tweaks, spot-check `timeline/index.html` and `scans/index.html` in a local server to confirm layout and asset paths.
- If you touch compression or fetching scripts, validate on a single sample file before batch runs.

## Commit & Pull Request Guidelines
- Follow the existing history format: concise imperative summaries (`timeline: add American Graffiti cover`) with optional area prefixes.
- Each PR should state scope, manual verification steps, and reference related issues or content IDs. Include screenshots or GIFs when UI changes are visible.
