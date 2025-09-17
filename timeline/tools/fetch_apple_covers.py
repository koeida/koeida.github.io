#!/usr/bin/env python3
"""
Fetch movie posters from Apple's iTunes Search API and save into ../covers/.

Usage examples:
  - Hardcoded list in main() demonstrates how to fetch a few titles.
  - Or call from CLI: python fetch_apple_covers.py "The Deer Hunter:1978" "Halloween:1978"

Notes:
  - The iTunes Search API returns artworkUrl100; we request a larger size by
    replacing the size segment with 1000x1000 where possible.
  - We pick the best match by normalized title, and optionally year if given.
  - Saved filename is a simplified, human-readable slug including year.
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
from dataclasses import dataclass
from typing import List, Optional, Tuple

try:
    import requests  # type: ignore
except Exception:
    requests = None  # Will surface a clear message at runtime


ITUNES_SEARCH_URL = "https://itunes.apple.com/search"


@dataclass
class MovieQuery:
    title: str
    year: Optional[int] = None


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"[^a-z0-9-]", "", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def upscale_artwork(url: str, size: int = 1000) -> str:
    # Common iTunes artwork patterns include .../100x100bb.jpg or .../200x200bb-85.jpg
    # Replace the <WxH> with the requested size while preserving suffixes.
    # Keep the trailing "bb...jpg/png" segment (group 3).
    return re.sub(r"/(\d+)x(\d+)(bb.*?\.(jpg|png))$", f"/{size}x{size}\\3", url)


def normalize_title(s: str) -> str:
    s = s.lower().strip()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def pick_best_result(title: str, year: Optional[int], results: List[dict]) -> Optional[dict]:
    norm_title = normalize_title(title)

    # Score results by title similarity and optional year proximity
    best: Tuple[float, Optional[dict]] = (-1.0, None)
    for r in results:
        track = r.get("trackName") or r.get("collectionName") or ""
        rel_date = r.get("releaseDate")
        r_year = None
        if rel_date:
            try:
                r_year = int(rel_date[:4])
            except Exception:
                r_year = None

        rt = normalize_title(track)

        # Simple token overlap score
        tokens_q = set(norm_title.split())
        tokens_r = set(rt.split())
        overlap = len(tokens_q & tokens_r) / max(1, len(tokens_q))

        score = overlap
        if year is not None and r_year is not None:
            score += 0.25 if abs(year - r_year) <= 1 else 0.0

        if score > best[0]:
            best = (score, r)

    return best[1]


def search_itunes(title: str) -> List[dict]:
    params = {
        "term": title,
        "entity": "movie",
        "media": "movie",
        "limit": 10,
        "country": "US",
    }
    url = ITUNES_SEARCH_URL + "?" + urllib.parse.urlencode(params)
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    return data.get("results", [])


def download(url: str, dest_path: str) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with requests.get(url, stream=True, timeout=30) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)


def fetch_cover(query: MovieQuery, covers_dir: str) -> Optional[str]:
    # Try search with a few title variants for better hit rate
    variants = [
        query.title,
        query.title.replace(":", ","),
        query.title.replace(",", ":"),
        re.sub(r"[,:]", "", query.title),
        f"{query.title} Mel Brooks",
    ]
    results: List[dict] = []
    used_title = query.title
    for t in variants:
        try:
            results = search_itunes(t)
        except Exception:
            results = []
        if results:
            used_title = t
            break
    if not results:
        return None
    best = pick_best_result(used_title, query.year, results)
    if not best:
        return None

    # Prefer trackName/year from API if missing
    api_title = best.get("trackName") or query.title
    rel_date = best.get("releaseDate")
    api_year = None
    if rel_date:
        try:
            api_year = int(rel_date[:4])
        except Exception:
            api_year = None

    year = query.year or api_year

    art = best.get("artworkUrl100") or best.get("artworkUrl60")
    if not art:
        return None

    # Try to upscale
    art_hi = upscale_artwork(art, size=1000)

    # Compose filename
    # If a year is present, strip embedded year tokens from title like "(2018)" or standalone years
    title_for_slug = api_title
    if year:
        title_for_slug = re.sub(r"\(\d{4}\)", "", title_for_slug)
        title_for_slug = re.sub(r"\b\d{4}\b", "", title_for_slug)
        title_for_slug = re.sub(r"\s+", " ", title_for_slug).strip()

    base = slugify(title_for_slug)
    if year:
        base = f"{base}-{year}"
    filename = base + ".jpg"
    dest_path = os.path.join(covers_dir, filename)

    # Download
    download(art_hi, dest_path)
    return filename


def parse_cli_items(items: List[str]) -> List[MovieQuery]:
    out: List[MovieQuery] = []
    for it in items:
        if ":" in it:
            t, y = it.rsplit(":", 1)
            try:
                out.append(MovieQuery(t.strip(), int(y)))
            except ValueError:
                out.append(MovieQuery(t.strip(), None))
        else:
            out.append(MovieQuery(it.strip(), None))
    return out


def main(argv: Optional[List[str]] = None) -> int:
    if requests is None:
        print("This script requires the 'requests' package. Install via: pip install requests", file=sys.stderr)
        return 2

    parser = argparse.ArgumentParser(description="Fetch Apple iTunes movie posters into covers/.")
    parser.add_argument("items", nargs="*", help="Items like 'Title:Year' or just 'Title'")
    parser.add_argument(
        "--covers-dir",
        default=os.path.join(os.path.dirname(__file__), "..", "..", "covers"),
        help="Destination covers directory",
    )
    args = parser.parse_args(argv)

    queries: List[MovieQuery]
    if args.items:
        queries = parse_cli_items(args.items)
    else:
        queries = [
            MovieQuery("The Deer Hunter", 1978),
            MovieQuery("Halloween", 1978),
            MovieQuery("Raging Bull", 1980),
            MovieQuery("History of the World, Part I", 1981),
        ]

    covers_dir = os.path.abspath(args.covers_dir)
    saved = []
    for q in queries:
        try:
            fn = fetch_cover(q, covers_dir)
            if fn:
                print(f"Saved: {fn}")
                saved.append(fn)
            else:
                print(f"No artwork found for: {q.title} ({q.year or '?'})", file=sys.stderr)
        except Exception as e:
            print(f"Error fetching {q.title}: {e}", file=sys.stderr)
    return 0 if saved else 1


if __name__ == "__main__":
    raise SystemExit(main())
