# Release Radar

**Release Radar** is a Django-powered Product Changelog & Feature Request Portal where teams publish versioned release notes and users browse updates, filter by release category, submit feature requests, and upvote roadmap items.

## Features

- **Multi-Product Changelog Portal**: Browse all tracked products, latest version badges, and a cross-product recent releases feed.
- **Versioned Timeline & Filtering**: Filter each product's releases by category (`Feature`, `Fix`, `Breaking`, `Improvement`) or keyword/version search (`?category=...&q=...`).
- **Community Feature Requests & Upvoting**: Submit new feature requests per product, filter by status (`Planned`, `In Progress`, `Shipped`), and upvote items atomically (with progressive AJAX enhancement and standard POST fallback).
- **Customized Django Admin**: Inline release editing on projects, date hierarchy, category/status filters, editable status column, and bulk status actions.
- **JSON API Endpoints**:
  - `GET /api/projects/<slug>/releases/` (supports `?category=` and `?q=`)
  - `GET /api/projects/<slug>/features/` (supports `?status=`)
- **One-Command Sample Seeding**: `python manage.py seed_data` populates three realistic developer products (`PulseDB`, `EdgeKit`, `TraceFlow`) with releases and feature requests.

## Tech Stack

- **Backend**: Python 3.12, Django 5.2
- **Database**: SQLite (`db.sqlite3`)
- **Frontend**: Django Templates + Vanilla CSS (zero Node/bundler step) + progressive-enhancement JavaScript for upvoting

## Project Structure

```text
release-radar/
├── manage.py
├── requirements.txt
├── README.md
├── release_radar/
│   ├── settings.py
│   ├── urls.py
│   ├── wsgi.py
│   └── asgi.py
└── changelog/
    ├── admin.py
    ├── forms.py
    ├── models.py
    ├── tests.py
    ├── urls.py
    ├── views.py
    ├── management/
    │   └── commands/
    │       └── seed_data.py
    ├── static/
    │   └── changelog/
    │       └── styles.css
    └── templates/
        └── changelog/
            ├── base.html
            ├── project_list.html
            └── project_detail.html
```

## Setup & Running Locally

1. **Create and activate a virtual environment** (recommended):

   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS/Linux:
   source .venv/bin/activate
   ```

2. **Install dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

3. **Apply migrations and seed sample data**:

   ```bash
   python manage.py migrate
   python manage.py seed_data
   ```

   *(Optional)* Create an admin superuser to explore `/admin/`:

   ```bash
   python manage.py createsuperuser
   ```

4. **Start the development server**:

   ```bash
   python manage.py runserver
   ```

   Visit `http://127.0.0.1:8000/` for the portal and `http://127.0.0.1:8000/admin/` for Django Admin.

## Running Checks & Tests

```bash
python manage.py check
python manage.py test
```
