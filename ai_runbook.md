# AI Runbook: Scan Compression Cycle

1. Run `python3 compress_images.py -i scans/images -o scans/images_optimized` from repo root. Skip re-running if manifests already list the new filename.
2. Confirm the new optimized file exists and manifests list it (`scans/images_optimized/manifest.json` + `.js`). Do not edit other files.
3. Run `node scans/tests/hud_and_preload_test.js` to ensure viewer preload logic still passes.
4. Stage only the new raw scan, its optimized twin, and manifest updates.
5. Commit with `scans: add scan <slug>` and push to `master`.

Keep responses terse; state commands executed and test result, nothing else.
