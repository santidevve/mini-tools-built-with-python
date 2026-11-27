# Webhook Lab

An interactive local **Webhook & HTTP Request Inspector** built with Flask, SQLite, and Jinja2. Create isolated webhook bins, send or simulate HTTP requests (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), inspect formatted JSON payloads, headers, and query parameters, replay captured requests, and export logs.

## Features

- **Named Webhook Bins**: Create isolated endpoints (`/hook/<bin_id>`) with custom descriptions and configurable default HTTP response status codes (`100`–`599`).
- **Any-Method HTTP Capture**: Accepts `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, and `HEAD` requests on `/hook/<bin_id>` (and subpaths like `/hook/<bin_id>/events`), recording headers, query parameters, body, content type, remote address, status code, and UTC timestamp.
- **Built-in Payload Simulator**: Test endpoints directly from the browser UI with custom methods, content types, query strings, and JSON/raw payloads.
- **Search & Method Filtering**: Filter captured requests by HTTP method or search across request bodies, headers, query parameters, and paths.
- **One-Click Request Replay**: Re-send any captured request to its bin endpoint and track replay lineage (`is_replay`, `replayed_from_id`).
- **Export & Log Management**: Download all captured requests for a bin as a formatted JSON file, clear logs, or delete bins.
- **Responsive Dark-Mode UI**: Clean developer-focused interface with zero external CSS/JS build steps.

## Tech Stack

- **Backend**: Python 3.12+, Flask 3.x
- **Database**: SQLite (`sqlite3` with foreign-key cascading)
- **Frontend**: Jinja2 templates, vanilla CSS & JavaScript
- **Testing**: `pytest`

## Project Structure

```text
webhook-lab/
├── app.py                  # Flask application factory, UI & API routes
├── db.py                   # SQLite schema, connection lifecycle, query helpers
├── requirements.txt        # Python dependencies
├── static/
│   ├── app.js              # Copy-to-clipboard interaction
│   └── style.css           # Responsive dark-mode UI styles
├── templates/
│   ├── base.html           # Shared layout
│   ├── index.html          # Dashboard & bin creation
│   ├── bin_detail.html     # Bin inspector, simulator, filters & detail view
│   └── error.html          # Error page
└── tests/
    └── test_app.py         # Pytest suite
```

## Setup & Running Locally

```bash
cd webhook-lab
python -m venv .venv
```

Activate the virtual environment:

- **Windows (PowerShell)**:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  ```
- **macOS / Linux**:
  ```bash
  source .venv/bin/activate
  ```

Install dependencies and start the server:

```bash
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/bins` | List all webhook bins with request counts |
| `POST` | `/api/bins` | Create a new bin (`name`, optional `description`, `default_status_code`) |
| `GET` | `/api/bins/<bin_id>` | Get bin metadata |
| `DELETE` | `/api/bins/<bin_id>` | Delete a bin and all its captured requests |
| `ANY` | `/hook/<bin_id>` | Capture any incoming HTTP request (`?status=<code>` overrides response status) |
| `GET` | `/api/bins/<bin_id>/requests` | List captured requests (supports `?method=` and `?q=`) |
| `DELETE` | `/api/bins/<bin_id>/requests` | Clear all captured requests for a bin |
| `POST` | `/api/bins/<bin_id>/requests/<id>/replay` | Replay a captured request |
| `GET` | `/api/bins/<bin_id>/export` | Download captured requests as a JSON attachment |

## Running Tests

```bash
pytest -v
```
