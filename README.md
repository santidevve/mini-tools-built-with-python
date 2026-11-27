# Python Portfolio Apps

A collection of three self-contained Python web applications that double as portfolio
pieces. Each app is an independent project with its own dependencies, database, and
documentation, and can be run or deployed on its own. They are grouped in this
repository only to keep them together.

| App | Framework | Database | One-line summary |
| :--- | :--- | :--- | :--- |
| [`public-cinema/`](./public-cinema) | Flask 3 | none (in-memory catalog) | Legal public-domain & Creative Commons movie recommender backed by Internet Archive. |
| [`release-radar/`](./release-radar) | Django 5.2 | SQLite | Product changelog & feature-request portal with upvoting and a JSON API. |
| [`webhook-lab/`](./webhook-lab) | Flask 3 | SQLite | Local webhook & HTTP request inspector with replay and export. |

## Repository layout

```text
python-portfolio-apps/
├── README.md            # this file
├── .gitignore           # shared Python/editor/venv ignores
├── public-cinema/       # Flask movie recommender
├── release-radar/       # Django changelog portal
├── webhook-lab/         # Flask webhook inspector
└── android/             # Android WebView APK wrapper for public-cinema
```

Each app directory is a standalone project. There is no shared package, shared
virtualenv, or root-level build step; treat each subdirectory as its own repo.

## Common prerequisites

- Python 3.10+ (`public-cinema`, `webhook-lab`) or Python 3.12+ (`release-radar`)
- A per-project virtual environment (recommended)
- No Node.js / bundler step is required by any app

## Quick start

Run each app from its own directory. The commands below assume a fresh virtual
environment per project.

### public-cinema (Flask)

```bash
cd public-cinema
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py            # http://127.0.0.1:5000
```

See [`public-cinema/README.md`](./public-cinema/README.md) for routes and API details.

### release-radar (Django)

```bash
cd release-radar
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_data      # optional sample data
python manage.py runserver      # http://127.0.0.1:8000
```

See [`release-radar/README.md`](./release-radar/README.md) for the admin, API, and seeding details.

### webhook-lab (Flask)

```bash
cd webhook-lab
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py            # http://127.0.0.1:5000
```

See [`webhook-lab/README.md`](./webhook-lab/README.md) for the API endpoint table.

## Testing

Each app ships its own test suite and configuration:

```bash
cd public-cinema && pytest -v      # pytest config in pyproject.toml
cd release-radar && python manage.py test
cd webhook-lab && pytest -v
```

## Deployment notes

All three apps include Vercel ignore files (`.vercelignore`) and are structured to
run on Vercel's Python runtime. `release-radar` and `webhook-lab` detect the
`VERCEL` environment variable and fall back to a writable `/tmp` SQLite database,
since the serverless filesystem is read-only. See each app's README for details.

## Android APK (Google TV / Android TV)

`public-cinema` can be packaged as an Android APK via the WebView wrapper in
[`android/`](./android). Set `START_URL` in `android/gradle.properties` to the hosted app,
then run `android/build_apk.ps1` (auto-installs JDK/Gradle/Android SDK and builds a debug
APK). See [`android/README.md`](./android/README.md) for details.

## License

Each project is provided as a portfolio sample. Consult the individual project
directories for any app-specific licensing; third-party films referenced by
`public-cinema` remain under their original public-domain / Creative Commons terms.