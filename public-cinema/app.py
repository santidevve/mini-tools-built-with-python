"""Flask application for Public Cinema — legal public-domain & CC movie recommender."""

from __future__ import annotations

from typing import Any

from flask import Flask, abort, jsonify, redirect, render_template, request, send_from_directory

from catalog import (
    MOVIES,
    filter_movies,
    get_all_eras,
    get_all_genres,
    get_all_moods,
    get_movie_by_id,
    get_sources,
    is_allowed_archive_url,
    recommend_movies,
)


def _extract_filter_params() -> dict[str, Any]:
    """Read and normalize movie filter query parameters from the current request."""
    max_runtime_raw = (request.args.get("max_runtime") or "").strip()
    max_runtime: int | None = None
    if max_runtime_raw:
        try:
            parsed = int(max_runtime_raw)
            if parsed > 0:
                max_runtime = parsed
        except ValueError:
            max_runtime = None

    return {
        "q": (request.args.get("q") or "").strip(),
        "genre": (request.args.get("genre") or "").strip(),
        "mood": (request.args.get("mood") or "").strip(),
        "era": (request.args.get("era") or "").strip(),
        "max_runtime": max_runtime,
    }


def create_app() -> Flask:
    """Application factory for the Public Cinema Flask app."""
    flask_app = Flask(__name__)

    # ------------------------------------------------------------------
    # PWA plumbing: served from the root so the service worker scope is "/"
    # and the manifest is discoverable for installable (Google TV) installs.
    # ------------------------------------------------------------------

    @flask_app.get("/sw.js")
    def service_worker():
        return send_from_directory(
            "static", "sw.js", mimetype="application/javascript"
        )

    @flask_app.get("/manifest.webmanifest")
    def web_manifest():
        return send_from_directory(
            "static", "manifest.webmanifest", mimetype="application/manifest+json"
        )

    @flask_app.get("/")
    def index():
        filters = _extract_filter_params()
        movies = filter_movies(
            query=filters["q"] or None,
            genre=filters["genre"] or None,
            mood=filters["mood"] or None,
            era=filters["era"] or None,
            max_runtime=filters["max_runtime"],
        )
        featured_movie = movies[0] if movies else (MOVIES[0] if MOVIES else None)
        return render_template(
            "index.html",
            movies=movies,
            all_movies_count=len(MOVIES),
            genres=get_all_genres(),
            moods=get_all_moods(),
            eras=get_all_eras(),
            filters=filters,
            featured_movie=featured_movie,
        )

    @flask_app.get("/movie/<movie_id>")
    def movie_detail(movie_id: str):
        movie = get_movie_by_id(movie_id)
        if movie is None:
            abort(404)
        similar_movies = recommend_movies(similar_to=movie_id, limit=4)
        return render_template(
            "movie_detail.html",
            movie=movie,
            similar_movies=similar_movies,
        )

    @flask_app.get("/download/<movie_id>")
    def download_movie(movie_id: str):
        movie = get_movie_by_id(movie_id)
        if movie is None:
            abort(404)
        download_url = movie.get("download_url", "")
        if not is_allowed_archive_url(download_url):
            abort(400)
        # ?stream=1 is accepted for inline HTML5 <video> playback; archive.org
        # serves range-capable MP4 responses directly on the allowlisted URL.
        _stream = request.args.get("stream") == "1"
        return redirect(download_url, code=302)

    @flask_app.get("/api/movies")
    def api_movies():
        filters = _extract_filter_params()
        movies = filter_movies(
            query=filters["q"] or None,
            genre=filters["genre"] or None,
            mood=filters["mood"] or None,
            era=filters["era"] or None,
            max_runtime=filters["max_runtime"],
        )
        return jsonify(
            {
                "count": len(movies),
                "filters": filters,
                "movies": movies,
            }
        )

    @flask_app.get("/api/recommend")
    def api_recommend():
        filters = _extract_filter_params()
        similar_to = (request.args.get("similar_to") or "").strip() or None
        limit_raw = (request.args.get("limit") or "").strip()
        limit: int | None = None
        if limit_raw:
            try:
                parsed_limit = int(limit_raw)
                if parsed_limit > 0:
                    limit = parsed_limit
            except ValueError:
                limit = None

        recs = recommend_movies(
            genre=filters["genre"] or None,
            mood=filters["mood"] or None,
            era=filters["era"] or None,
            max_runtime=filters["max_runtime"],
            similar_to=similar_to,
            query=filters["q"] or None,
            limit=limit,
        )
        return jsonify(
            {
                "count": len(recs),
                "recommendations": recs,
                "movies": recs,
            }
        )

    @flask_app.get("/sources")
    def sources_page():
        kind = (request.args.get("kind") or "").strip() or None
        return render_template(
            "sources.html",
            sources=get_sources(kind=kind),
            all_sources_count=len(get_sources()),
            selected_kind=kind or "",
        )

    @flask_app.get("/api/sources")
    def api_sources():
        kind = (request.args.get("kind") or "").strip() or None
        items = get_sources(kind=kind)
        return jsonify({"count": len(items), "sources": items})

    @flask_app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found", "status": 404}), 404
        return (
            render_template(
                "error.html",
                status_code=404,
                message="The requested film or page could not be found.",
            ),
            404,
        )

    return flask_app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
