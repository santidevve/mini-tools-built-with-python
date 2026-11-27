# Public Cinema

**Public Cinema** is a Flask movie recommender and downloader for films that are in
the **public domain** or released under **Creative Commons** licenses. It ships a
curated catalog of legal, freely distributable films sourced from the Internet
Archive, with filtering, mood/genre/era facets, similarity-based recommendations,
and direct download/stream links.

## Features

- **Curated legal catalog**: Hand-picked public-domain and Creative Commons films
  (from silent-era classics to modern open movies), each with verified
  `archive.org` download, poster, and detail URLs.
- **Multi-facet filtering**: Filter by free-text query, genre, mood, era, and
  maximum runtime.
- **Similarity recommendations**: Get "more like this" suggestions scored by genre,
  mood, and era overlap (`/api/recommend?similar_to=...`).
- **Safe downloads**: Download/stream redirects are validated against an
  allowlist of `archive.org` hosts to prevent open redirects.
- **Public-domain source recommendations**: A curated `/sources` page and
  `/api/sources` endpoint recommend reputable libraries (Internet Archive, Prelinger,
  Library of Congress, Blender Open Movies, and more) to find additional free films.
- **Add your own sources**: Submit new sources via the on-page form (`POST /sources`) or
  the JSON API (`POST /api/sources`). Additions are kept in memory for the session.
- **JSON API**: Machine-readable endpoints for the catalog and recommendations.
- **Server-rendered UI**: Jinja2 templates with vanilla CSS/JS, no build step.

## Tech Stack

- **Backend**: Python 3.10+, Flask 3.x
- **Data**: In-memory curated catalog (`catalog.py`); optional live search via the
  Internet Archive `advancedsearch` API
- **Frontend**: Jinja2 templates, vanilla CSS & JavaScript

## Project Structure

```text
public-cinema/
├── app.py               # Flask application factory, UI & API routes
├── catalog.py           # Curated movie data, filtering, recommendations, IA search
├── requirements.txt     # Python dependencies
├── pyproject.toml       # Packaging + pytest configuration
├── static/
│   ├── app.js
│   └── style.css
└── templates/
    ├── base.html
    ├── index.html
    ├── movie_detail.html
    └── error.html
```

## Setup & Running Locally

```bash
cd public-cinema
python -m venv .venv
```

Activate the virtual environment:

- **Windows (PowerShell)**: `.\.venv\Scripts\Activate.ps1`
- **macOS / Linux**: `source .venv/bin/activate`

Install dependencies and start the server:

```bash
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

## Routes

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Home page with catalog, filters, and a featured film |
| `GET` | `/movie/<movie_id>` | Movie detail page with similar titles |
| `GET` | `/download/<movie_id>` | Redirect to the allowlisted `archive.org` file (`?stream=1` for inline playback) |
| `GET` | `/sources` | Curated public-domain & CC film sources (`?kind=` filters by license type) |
| `POST` | `/sources` | Add a new source via the on-page form (redirects back on success) |
| `GET` | `/api/movies` | Filtered catalog as JSON (`q`, `genre`, `mood`, `era`, `max_runtime`) |
| `GET` | `/api/recommend` | Recommendations as JSON (`similar_to`, `limit`, plus filters) |
| `GET` | `/api/sources` | Recommended free-film sources as JSON (`?kind=` optional filter) |
| `POST` | `/api/sources` | Add a source via JSON (`name`, `url`, `kind`, `description`, `tags`) → 201 |

## Examples

```bash
# Filter the catalog
curl "http://127.0.0.1:5000/api/movies?genre=Horror&max_runtime=90"

# Recommend films similar to a given ID
curl "http://127.0.0.1:5000/api/recommend?similar_to=nosferatu&limit=4"

# List recommended public-domain / CC film sources
curl "http://127.0.0.1:5000/api/sources"
curl "http://127.0.0.1:5000/api/sources?kind=Creative%20Commons"

# Add a new source (JSON)
curl -X POST "http://127.0.0.1:5000/api/sources" -H "Content-Type: application/json" \
  -d '{"name":"My Archive","url":"https://example.org","kind":"Public Domain","tags":["Classics"]}'
```

> Note: sources are stored in memory, so sources added at runtime last until the
> server restarts.

## Running Tests

```bash
pytest -v
```

## Deployment

The app includes a `.vercelignore` and runs on Vercel's Python runtime. The catalog
is in-memory, so no database or writable filesystem is required.