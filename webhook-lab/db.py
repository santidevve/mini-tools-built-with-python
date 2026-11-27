"""SQLite database setup and query helpers for Webhook Lab."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, current_app, g

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS bins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    default_status_code INTEGER NOT NULL DEFAULT 200,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bin_id TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    headers TEXT NOT NULL,
    query_params TEXT NOT NULL,
    body TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT '',
    remote_addr TEXT NOT NULL DEFAULT '',
    status_code INTEGER NOT NULL DEFAULT 200,
    is_replay INTEGER NOT NULL DEFAULT 0,
    replayed_from_id INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (bin_id) REFERENCES bins (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_requests_bin_created
    ON requests (bin_id, created_at DESC, id DESC);
"""


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_db() -> sqlite3.Connection:
    """Get a per-request SQLite connection with foreign keys enabled."""
    if "db" not in g:
        db_path = current_app.config["DATABASE"]
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


def close_db(_exc: BaseException | None = None) -> None:
    """Close the per-request SQLite connection if open."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    """Initialize database tables and indexes."""
    db_path = Path(current_app.config["DATABASE"])
    if str(db_path) != ":memory:":
        db_path.parent.mkdir(parents=True, exist_ok=True)
    db = get_db()
    db.executescript(SCHEMA_SQL)
    db.commit()


def init_app(app: Flask) -> None:
    """Register database teardown and ensure schema exists."""
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()


def list_bins() -> list[dict[str, Any]]:
    """Return all bins ordered by newest first with captured request counts."""
    db = get_db()
    rows = db.execute(
        """
        SELECT
            b.id,
            b.name,
            b.description,
            b.default_status_code,
            b.created_at,
            COUNT(r.id) AS request_count,
            MAX(r.created_at) AS last_request_at
        FROM bins b
        LEFT JOIN requests r ON r.bin_id = b.id
        GROUP BY b.id
        ORDER BY b.created_at DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def get_bin(bin_id: str) -> dict[str, Any] | None:
    """Fetch a single bin by ID, or None if not found."""
    db = get_db()
    row = db.execute(
        """
        SELECT
            b.id,
            b.name,
            b.description,
            b.default_status_code,
            b.created_at,
            COUNT(r.id) AS request_count
        FROM bins b
        LEFT JOIN requests r ON r.bin_id = b.id
        WHERE b.id = ?
        GROUP BY b.id
        """,
        (bin_id,),
    ).fetchone()
    return dict(row) if row is not None else None


def create_bin(
    bin_id: str,
    name: str,
    description: str = "",
    default_status_code: int = 200,
) -> dict[str, Any]:
    """Insert a new webhook bin and return its record."""
    db = get_db()
    created_at = utc_now_iso()
    db.execute(
        """
        INSERT INTO bins (id, name, description, default_status_code, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (bin_id, name, description, default_status_code, created_at),
    )
    db.commit()
    return {
        "id": bin_id,
        "name": name,
        "description": description,
        "default_status_code": default_status_code,
        "created_at": created_at,
        "request_count": 0,
    }


def delete_bin(bin_id: str) -> bool:
    """Delete a bin and its captured requests. Returns True if a row was deleted."""
    db = get_db()
    cur = db.execute("DELETE FROM bins WHERE id = ?", (bin_id,))
    db.commit()
    return cur.rowcount > 0


def record_request(
    *,
    bin_id: str,
    method: str,
    path: str,
    headers: dict[str, str],
    query_params: dict[str, Any],
    body: str,
    content_type: str,
    remote_addr: str,
    status_code: int,
    is_replay: bool = False,
    replayed_from_id: int | None = None,
) -> dict[str, Any]:
    """Persist an incoming or replayed HTTP request and return its full record."""
    db = get_db()
    created_at = utc_now_iso()
    cur = db.execute(
        """
        INSERT INTO requests (
            bin_id, method, path, headers, query_params, body,
            content_type, remote_addr, status_code, is_replay,
            replayed_from_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            bin_id,
            method.upper(),
            path,
            json.dumps(headers, ensure_ascii=False),
            json.dumps(query_params, ensure_ascii=False),
            body,
            content_type,
            remote_addr,
            status_code,
            1 if is_replay else 0,
            replayed_from_id,
            created_at,
        ),
    )
    db.commit()
    return get_request(bin_id, int(cur.lastrowid))  # type: ignore[return-value]


def _deserialize_request(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a SQLite request row into a JSON-friendly dictionary."""
    item = dict(row)
    item["headers"] = json.loads(item["headers"])
    item["query_params"] = json.loads(item["query_params"])
    item["is_replay"] = bool(item["is_replay"])
    try:
        parsed = json.loads(item["body"]) if item["body"].strip() else None
    except (json.JSONDecodeError, TypeError):
        parsed = None
    item["parsed_json"] = parsed
    item["formatted_body"] = (
        json.dumps(parsed, indent=2, ensure_ascii=False)
        if parsed is not None
        else item["body"]
    )
    return item


def list_requests(
    bin_id: str,
    method: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    """List captured requests for a bin, optionally filtered by method and search text."""
    db = get_db()
    clauses = ["bin_id = ?"]
    params: list[Any] = [bin_id]

    if method and method.upper() != "ALL":
        clauses.append("UPPER(method) = ?")
        params.append(method.upper())

    if search and search.strip():
        like = f"%{search.strip()}%"
        clauses.append(
            "(body LIKE ? OR headers LIKE ? OR query_params LIKE ? OR path LIKE ?)"
        )
        params.extend([like, like, like, like])

    where_sql = " AND ".join(clauses)
    rows = db.execute(
        f"""
        SELECT *
        FROM requests
        WHERE {where_sql}
        ORDER BY id DESC
        """,
        params,
    ).fetchall()
    return [_deserialize_request(row) for row in rows]


def get_request(bin_id: str, request_id: int) -> dict[str, Any] | None:
    """Fetch a single captured request by ID within a bin."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM requests WHERE bin_id = ? AND id = ?",
        (bin_id, request_id),
    ).fetchone()
    return _deserialize_request(row) if row is not None else None


def clear_requests(bin_id: str) -> int:
    """Delete all captured requests for a bin and return deleted count."""
    db = get_db()
    cur = db.execute("DELETE FROM requests WHERE bin_id = ?", (bin_id,))
    db.commit()
    return cur.rowcount
