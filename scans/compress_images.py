#!/usr/bin/env python3
"""
Compress images in a folder while preserving dimensions.

Features:
- JPEG: re-encode with lower quality, optimize, progressive.
- PNG: optional palette quantization + optimized compression.
- Preserves visual orientation (applies EXIF transpose), strips most metadata.
- Writes to an output directory by default; can overwrite in place.

Usage examples:
  python3 scans/compress_images.py                  # scans/images -> scans/images_optimized
  python3 scans/compress_images.py -i scans/images -o scans/images_optimized -q 75
  python3 scans/compress_images.py --overwrite      # compress in place (destructive)

Requires: Pillow (pip install pillow)
"""
from __future__ import annotations

import argparse
import concurrent.futures
from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Iterable, Tuple
import json

try:
    from PIL import Image, ImageOps
except Exception as exc:  # pragma: no cover
    print("This script requires Pillow. Install with: pip install pillow", file=sys.stderr)
    raise


SUPPORTED_EXTS = {".jpg", ".jpeg", ".png"}


@dataclass
class Options:
    input_dir: Path
    output_dir: Path
    overwrite: bool
    jpeg_quality: int
    png_palette: int | None
    workers: int


def find_images(root: Path) -> Iterable[Path]:
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS:
            yield p


def ensure_out_path(src: Path, opts: Options) -> Path:
    if opts.overwrite:
        return src
    rel = src.relative_to(opts.input_dir)
    out = opts.output_dir / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def compress_one(src: Path, opts: Options) -> Tuple[Path, int, int]:
    out = ensure_out_path(src, opts)

    # Skip if output is newer or same size and exists
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime and out.stat().st_size > 0:
        return out, src.stat().st_size, out.stat().st_size

    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            ext = src.suffix.lower()

            if ext in {".jpg", ".jpeg"}:
                im = im.convert("RGB") if im.mode not in ("RGB",) else im
                save_params = dict(
                    format="JPEG",
                    quality=opts.jpeg_quality,
                    optimize=True,
                    progressive=True,
                    # Use 4:2:0 subsampling (2) for smaller files with minimal visible loss
                    subsampling=2,
                )
                # Strip EXIF/ICC to reduce size; comment to keep
                # save_params["exif"] = im.info.get("exif")
                out = out.with_suffix(".jpg") if not opts.overwrite else out
                out.parent.mkdir(parents=True, exist_ok=True)
                im.save(out, **save_params)

            elif ext == ".png":
                work = im
                if opts.png_palette:
                    # Preserve alpha by separating, quantize color, then recombine if needed
                    if work.mode in ("RGBA", "LA"):
                        alpha = work.getchannel("A")
                        # Quantize color channels only
                        work = work.convert("RGB").quantize(colors=opts.png_palette, method=Image.FASTOCTREE)
                        work = work.convert("RGBA")
                        work.putalpha(alpha)
                    else:
                        base = work.convert("RGB") if work.mode != "RGB" else work
                        work = base.quantize(colors=opts.png_palette, method=Image.FASTOCTREE)

                save_params = dict(
                    format="PNG",
                    optimize=True,
                    compress_level=9,
                )
                out.parent.mkdir(parents=True, exist_ok=True)
                work.save(out, **save_params)

            else:
                # Unsupported fallback: copy bytes untouched
                if src != out:
                    out.write_bytes(src.read_bytes())

    except Exception as e:  # pragma: no cover
        print(f"[WARN] Failed to process {src}: {e}", file=sys.stderr)
        return out, src.stat().st_size if src.exists() else 0, out.stat().st_size if out.exists() else 0

    return out, src.stat().st_size, out.stat().st_size if out.exists() else 0


def parse_args(argv: list[str]) -> Options:
    parser = argparse.ArgumentParser(description="Compress images while preserving dimensions.")
    parser.add_argument("-i", "--input", default="scans/images", type=Path, help="Input images directory")
    parser.add_argument("-o", "--output", default="scans/images_optimized", type=Path, help="Output directory (ignored if --overwrite)")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite files in place (destructive)")
    parser.add_argument("-q", "--quality", type=int, default=75, help="JPEG quality (lower = smaller)")
    parser.add_argument("--png-palette", type=int, default=256, help="PNG palette size (e.g., 256). Set 0 to disable quantization.")
    parser.add_argument("-j", "--jobs", type=int, default=0, help="Parallel workers (0 auto)")
    ns = parser.parse_args(argv)

    input_dir: Path = ns.input
    output_dir: Path = ns.output
    overwrite: bool = ns.overwrite
    jpeg_quality: int = max(1, min(95, ns.quality))
    png_palette: int | None = None if int(ns.png_palette) <= 0 else int(ns.png_palette)
    workers = ns.jobs if ns.jobs and ns.jobs > 0 else (min(32, (os_cpu_count() or 4)))

    if not input_dir.exists():
        raise SystemExit(f"Input directory not found: {input_dir}")
    if not overwrite:
        output_dir.mkdir(parents=True, exist_ok=True)

    return Options(
        input_dir=input_dir,
        output_dir=output_dir,
        overwrite=overwrite,
        jpeg_quality=jpeg_quality,
        png_palette=png_palette,
        workers=workers,
    )


def os_cpu_count() -> int | None:
    try:
        import os
        return os.cpu_count()
    except Exception:
        return None


def main(argv: list[str]) -> int:
    opts = parse_args(argv)

    images = list(find_images(opts.input_dir))
    if not images:
        print(f"No images found in {opts.input_dir} (extensions: {sorted(SUPPORTED_EXTS)})")
        return 0

    total_in = 0
    total_out = 0
    outputs: list[Path] = []

    def task(p: Path):
        return compress_one(p, opts)

    with concurrent.futures.ThreadPoolExecutor(max_workers=opts.workers) as ex:
        for out_path, before, after in ex.map(task, images):
            total_in += before
            total_out += after
            if out_path:
                outputs.append(out_path)
            if after and before:
                savings = before - after
                pct = (savings / before * 100) if before else 0
                print(f"{out_path}: -{savings/1024:.1f} KiB ({pct:.1f}%)")
            else:
                print(f"{out_path}: processed")

    # Write manifests of output files for the viewer
    try:
        manifest_dir = opts.output_dir if not opts.overwrite else opts.input_dir
        manifest_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = manifest_dir / "manifest.json"
        # Store filenames relative to the manifest directory
        items = []
        for p in outputs:
            try:
                items.append(str(p.relative_to(manifest_dir)))
            except ValueError:
                # If not under manifest_dir, fall back to basename
                items.append(p.name)
        # Only keep supported image types, sort alphabetically for stable order
        items = [s for s in items if s.lower().endswith(tuple(SUPPORTED_EXTS))]
        items.sort()
        with manifest_path.open("w", encoding="utf-8") as f:
            json.dump(items, f, indent=2)
        # Also write a JS manifest for file:// fallback
        manifest_js = manifest_dir / "manifest.js"
        with manifest_js.open("w", encoding="utf-8") as fjs:
            fjs.write("window.SCANS_MANIFEST = ")
            json.dump(items, fjs)
            fjs.write(";\n")
        print(f"Wrote manifest: {manifest_path} and {manifest_js} ({len(items)} items)")
    except Exception as e:
        print(f"[WARN] Failed to write manifest: {e}", file=sys.stderr)

    if total_in:
        saved = total_in - total_out
        pct = saved / total_in * 100
        print(f"Total saved: {saved/1024:.1f} KiB ({pct:.1f}%)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
