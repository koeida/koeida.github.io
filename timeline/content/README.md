# Content Structure

This site can be hosted as a static site. All data lives in `content/` and images in `covers/`.

## Movies

Primary manifest: `content/movies.json`

Array of entries with the shape:

```
{
  "id": 123,                     // any stable integer
  "title": "Movie Title",
  "year": 1984,                  // optional
  "watched_date": "2025-08-16", // YYYY-MM-DD
  "rating": 3.5,                 // 0..5, optional
  "cover_url": "/covers/slug.jpg", // relative URL to image
  "summary": "...",              // optional
  "review_text": "..."           // optional
}
```

## Adding a Movie

1. Save the poster to `covers/` and reference it via `/covers/your-file.jpg`.
2. Append a new object to `content/movies.json` with the fields above.
3. Open `index.html` in a static server (e.g. `python3 -m http.server`).

Tip: keep `watched_date` in UTC date (YYYY-MM-DD). The timeline uses UTC to avoid month off‑by‑one issues.

