"""Curated catalog of legal Public-Domain & Creative Commons films on Internet Archive."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ALLOWED_ARCHIVE_HOSTS = ("archive.org",)

ERAS = [
    "Silent Era (Pre-1930)",
    "Golden Age (1930s-1950s)",
    "1960s & Classic Era",
    "Modern Creative Commons (2000s+)",
]


def get_era(year: int) -> str:
    """Map a release year to a human-readable cinema era label."""
    if year < 1930:
        return ERAS[0]
    if year < 1960:
        return ERAS[1]
    if year < 1980:
        return ERAS[2]
    return ERAS[3]


def is_allowed_archive_url(url: str) -> bool:
    """Validate that a download URL points to an allowlisted archive.org host."""
    if not url or not isinstance(url, str):
        return False
    parsed = urllib.parse.urlparse(url.strip())
    if parsed.scheme not in ("https", "http"):
        return False
    if parsed.username or parsed.password:
        return False
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        return False
    return any(
        hostname == allowed or hostname.endswith(f".{allowed}")
        for allowed in ALLOWED_ARCHIVE_HOSTS
    )


def _build_movie(
    *,
    movie_id: str,
    title: str,
    year: int,
    director: str,
    genres: list[str],
    moods: list[str],
    runtime_min: int,
    synopsis: str,
    license_name: str,
    archive_id: str,
    mp4_filename: str,
) -> dict[str, Any]:
    """Construct a normalized movie dictionary with verified archive.org URLs."""
    return {
        "id": movie_id,
        "title": title,
        "year": year,
        "director": director,
        "genres": genres,
        "moods": moods,
        "runtime_min": runtime_min,
        "era": get_era(year),
        "synopsis": synopsis,
        "license": license_name,
        "archive_id": archive_id,
        "download_url": f"https://archive.org/download/{archive_id}/{mp4_filename}",
        "poster_url": f"https://archive.org/services/img/{archive_id}",
        "archive_url": f"https://archive.org/details/{archive_id}",
    }


MOVIES: list[dict[str, Any]] = [
    _build_movie(
        movie_id="night-of-the-living-dead",
        title="Night of the Living Dead",
        year=1968,
        director="George A. Romero",
        genres=["Horror", "Thriller"],
        moods=["Suspenseful", "Dark", "Tense"],
        runtime_min=96,
        synopsis=(
            "A ragtag group of Pennsylvanians barricades themselves inside an isolated "
            "farmhouse as the dead inexplicably rise and besiege the living."
        ),
        license_name="Public Domain",
        archive_id="night_of_the_living_dead",
        mp4_filename="night_of_the_living_dead_512kb.mp4",
    ),
    _build_movie(
        movie_id="nosferatu",
        title="Nosferatu",
        year=1922,
        director="F. W. Murnau",
        genres=["Horror", "Silent"],
        moods=["Eerie", "Gothic", "Atmospheric"],
        runtime_min=94,
        synopsis=(
            "An unauthorized silent expressionist adaptation of Bram Stoker's Dracula, "
            "following estate agent Hutter to the Carpathian castle of Count Orlok."
        ),
        license_name="Public Domain",
        archive_id="nosferatu_1922",
        mp4_filename="nosferatu_1922_512kb.mp4",
    ),
    _build_movie(
        movie_id="his-girl-friday",
        title="His Girl Friday",
        year=1940,
        director="Howard Hawks",
        genres=["Comedy", "Romance"],
        moods=["Witty", "Fast-Paced", "Uplifting"],
        runtime_min=92,
        synopsis=(
            "A sharp-tongued newspaper editor uses every trick in the book to keep his "
            "star reporter—and ex-wife—from remarrying and leaving the newsroom."
        ),
        license_name="Public Domain",
        archive_id="his_girl_friday",
        mp4_filename="his_girl_friday_512kb.mp4",
    ),
    _build_movie(
        movie_id="the-general",
        title="The General",
        year=1926,
        director="Buster Keaton & Clyde Bruckman",
        genres=["Comedy", "Action", "Silent"],
        moods=["Adventurous", "Playful", "Uplifting"],
        runtime_min=78,
        synopsis=(
            "Rejected by the army, a devoted locomotive engineer single-handedly pursues "
            "Union spies who steal both his beloved train and his fiancée."
        ),
        license_name="Public Domain",
        archive_id="TheGeneralBusterKeaton",
        mp4_filename="The_General_512kb.mp4",
    ),
    _build_movie(
        movie_id="metropolis",
        title="Metropolis",
        year=1927,
        director="Fritz Lang",
        genres=["Sci-Fi", "Drama", "Silent"],
        moods=["Epic", "Thought-Provoking", "Atmospheric"],
        runtime_min=153,
        synopsis=(
            "In a towering futuristic city divided between wealthy planners and exploited "
            "underground workers, the son of the city's mastermind sparks a rebellion."
        ),
        license_name="Public Domain",
        archive_id="Metropolis1927_201809",
        mp4_filename="Metropolis_1927.mp4",
    ),
    _build_movie(
        movie_id="charade",
        title="Charade",
        year=1963,
        director="Stanley Donen",
        genres=["Mystery", "Thriller", "Romance"],
        moods=["Witty", "Suspenseful", "Stylish"],
        runtime_min=113,
        synopsis=(
            "Returning to Paris to divorce her husband, Regina Lampert finds him murdered "
            "and herself pursued by four dangerous men searching for a hidden fortune."
        ),
        license_name="Public Domain",
        archive_id="Charade_1963",
        mp4_filename="Charade_1963_512kb.mp4",
    ),
    _build_movie(
        movie_id="plan-9-from-outer-space",
        title="Plan 9 from Outer Space",
        year=1957,
        director="Ed Wood",
        genres=["Sci-Fi", "Horror"],
        moods=["Campy", "Playful", "Weird"],
        runtime_min=79,
        synopsis=(
            "Extraterrestrials resurrect Earth's dead in a desperate bid to stop humanity "
            "from inventing a doomsday weapon in this beloved cult classic."
        ),
        license_name="Public Domain",
        archive_id="Plan_9_from_Outer_Space_1959",
        mp4_filename="Plan_9_from_Outer_Space_1959_512kb.mp4",
    ),
    _build_movie(
        movie_id="little-shop-of-horrors",
        title="The Little Shop of Horrors",
        year=1960,
        director="Roger Corman",
        genres=["Comedy", "Horror"],
        moods=["Campy", "Dark", "Playful"],
        runtime_min=72,
        synopsis=(
            "A meek Skid Row florist's assistant cultivates a bizarre crossbred plant "
            "that develops an insatiable appetite for human blood."
        ),
        license_name="Public Domain",
        archive_id="TheLittleShopOfHorrors",
        mp4_filename="TheLittleShopOfHorrors_512kb.mp4",
    ),
    _build_movie(
        movie_id="carnival-of-souls",
        title="Carnival of Souls",
        year=1962,
        director="Herk Harvey",
        genres=["Horror", "Mystery"],
        moods=["Eerie", "Dreamlike", "Atmospheric"],
        runtime_min=78,
        synopsis=(
            "After surviving a mysterious car accident, a young church organist moves to "
            "Utah and finds herself drawn to an abandoned lakeside pavilion."
        ),
        license_name="Public Domain",
        archive_id="CarnivalofSouls",
        mp4_filename="Carnival_of_Souls_512kb.mp4",
    ),
    _build_movie(
        movie_id="house-on-haunted-hill",
        title="House on Haunted Hill",
        year=1959,
        director="William Castle",
        genres=["Horror", "Mystery"],
        moods=["Suspenseful", "Campy", "Eerie"],
        runtime_min=75,
        synopsis=(
            "An eccentric millionaire offers five strangers ten thousand dollars each if "
            "they can survive a single night locked inside a supposedly haunted mansion."
        ),
        license_name="Public Domain",
        archive_id="house_on_haunted_hill_ipod",
        mp4_filename="house_on_haunted_hill_512kb.mp4",
    ),
    _build_movie(
        movie_id="phantom-of-the-opera",
        title="The Phantom of the Opera",
        year=1925,
        director="Rupert Julian",
        genres=["Horror", "Drama", "Silent"],
        moods=["Gothic", "Eerie", "Atmospheric"],
        runtime_min=93,
        synopsis=(
            "A disfigured musical genius lurking beneath the Paris Opera House becomes "
            "obsessed with making a young soprano the star of the company."
        ),
        license_name="Public Domain",
        archive_id="ThePhantomoftheOpera1925",
        mp4_filename="The_Phantom_of_the_Opera_1925_512kb.mp4",
    ),
    _build_movie(
        movie_id="a-trip-to-the-moon",
        title="A Trip to the Moon",
        year=1902,
        director="Georges Méliès",
        genres=["Sci-Fi", "Action", "Silent", "Short"],
        moods=["Whimsical", "Dreamlike", "Playful"],
        runtime_min=13,
        synopsis=(
            "A group of astronomers launches a bullet-shaped capsule to the Moon via giant "
            "cannon, encountering fantastical Selenites in cinema's pioneering sci-fi tale."
        ),
        license_name="Public Domain",
        archive_id="LeVoyageDansLaLune1902",
        mp4_filename="Le_Voyage_Dans_La_Lune_1902_512kb.mp4",
    ),
    _build_movie(
        movie_id="detour",
        title="Detour",
        year=1945,
        director="Edgar G. Ulmer",
        genres=["Film Noir", "Thriller"],
        moods=["Dark", "Tense", "Gritty"],
        runtime_min=68,
        synopsis=(
            "A down-on-his-luck nightclub pianist hitchhiking to Los Angeles is plunged "
            "into a spiral of fatal coincidence and blackmail."
        ),
        license_name="Public Domain",
        archive_id="Detour_1945",
        mp4_filename="Detour_1945_512kb.mp4",
    ),
    _build_movie(
        movie_id="the-cabinet-of-dr-caligari",
        title="The Cabinet of Dr. Caligari",
        year=1920,
        director="Robert Wiene",
        genres=["Horror", "Mystery", "Silent"],
        moods=["Dreamlike", "Eerie", "Thought-Provoking"],
        runtime_min=76,
        synopsis=(
            "Inside a German carnival, an enigmatic hypnotist uses a sleepwalker to "
            "commit murders in a landmark of German Expressionist cinema."
        ),
        license_name="Public Domain",
        archive_id="DasCabinetDesDr.Caligari",
        mp4_filename="Das_Cabinet_des_Dr_Caligari_512kb.mp4",
    ),
    _build_movie(
        movie_id="d-o-a",
        title="D.O.A.",
        year=1949,
        director="Rudolph Maté",
        genres=["Film Noir", "Mystery", "Thriller"],
        moods=["Tense", "Gritty", "Suspenseful"],
        runtime_min=83,
        synopsis=(
            "A fatally poisoned accountant races against his final hours to uncover who "
            "murdered him—and why."
        ),
        license_name="Public Domain",
        archive_id="DOA_1949",
        mp4_filename="DOA_1949_512kb.mp4",
    ),
    _build_movie(
        movie_id="sita-sings-the-blues",
        title="Sita Sings the Blues",
        year=2008,
        director="Nina Paley",
        genres=["Animation", "Comedy", "Drama"],
        moods=["Whimsical", "Uplifting", "Thought-Provoking"],
        runtime_min=82,
        synopsis=(
            "An animated musical weaving the ancient Indian epic Ramayana with 1920s "
            "jazz vocals and a modern story of heartbreak."
        ),
        license_name="CC0 1.0 (Creative Commons)",
        archive_id="Sita_Sings_the_Blues",
        mp4_filename="Sita_Sings_the_Blues_512kb.mp4",
    ),
    _build_movie(
        movie_id="big-buck-bunny",
        title="Big Buck Bunny",
        year=2008,
        director="Sacha Goedegebure",
        genres=["Animation", "Comedy", "Short"],
        moods=["Playful", "Uplifting", "Whimsical"],
        runtime_min=10,
        synopsis=(
            "A gentle, oversized rabbit's peaceful morning is disrupted by three bullying "
            "rodents, prompting an ingenious woodland payback."
        ),
        license_name="CC BY 3.0 (Creative Commons)",
        archive_id="BigBuckBunny_328",
        mp4_filename="BigBuckBunny_512kb.mp4",
    ),
    _build_movie(
        movie_id="elephants-dream",
        title="Elephants Dream",
        year=2006,
        director="Bassam Kurdali",
        genres=["Animation", "Sci-Fi", "Short"],
        moods=["Dreamlike", "Thought-Provoking", "Weird"],
        runtime_min=11,
        synopsis=(
            "Two characters explore a surreal, living mechanical world shaped by their "
            "conflicting imaginations in the first Blender Foundation open movie."
        ),
        license_name="CC BY 2.5 (Creative Commons)",
        archive_id="ElephantsDream",
        mp4_filename="ElephantsDream_512kb.mp4",
    ),
]

_MOVIE_INDEX: dict[str, dict[str, Any]] = {m["id"]: m for m in MOVIES}


def get_movie_by_id(movie_id: str) -> dict[str, Any] | None:
    """Return a single movie dict by its slug ID, or None if not found."""
    return _MOVIE_INDEX.get(movie_id)


def get_all_genres() -> list[str]:
    """Return a sorted list of unique genres across the catalog."""
    return sorted({g for m in MOVIES for g in m["genres"]})


def get_all_moods() -> list[str]:
    """Return a sorted list of unique moods across the catalog."""
    return sorted({mood for m in MOVIES for mood in m["moods"]})


def get_all_eras() -> list[str]:
    """Return era labels in chronological order."""
    present = {m["era"] for m in MOVIES}
    return [era for era in ERAS if era in present]


def _parse_max_runtime(max_runtime: int | str | None) -> int | None:
    """Safely parse max_runtime into a positive integer, or return None."""
    if max_runtime is None or max_runtime == "":
        return None
    try:
        value = int(max_runtime)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def filter_movies(
    query: str | None = None,
    genre: str | None = None,
    mood: str | None = None,
    era: str | None = None,
    max_runtime: int | str | None = None,
) -> list[dict[str, Any]]:
    """Filter catalog movies by text query, genre, mood, era, and max runtime."""
    q_norm = (query or "").strip().lower()
    genre_norm = (genre or "").strip().lower()
    mood_norm = (mood or "").strip().lower()
    era_norm = (era or "").strip().lower()
    runtime_limit = _parse_max_runtime(max_runtime)

    results: list[dict[str, Any]] = []
    for movie in MOVIES:
        if genre_norm and not any(g.lower() == genre_norm for g in movie["genres"]):
            continue
        if mood_norm and not any(m.lower() == mood_norm for m in movie["moods"]):
            continue
        if era_norm and movie["era"].lower() != era_norm:
            continue
        if runtime_limit is not None and movie["runtime_min"] > runtime_limit:
            continue
        if q_norm:
            haystack = " ".join(
                [
                    movie["title"],
                    movie["director"],
                    movie["synopsis"],
                    movie["license"],
                    str(movie["year"]),
                    *movie["genres"],
                    *movie["moods"],
                ]
            ).lower()
            if q_norm not in haystack:
                continue
        results.append(movie)
    return results


def recommend_movies(
    genre: str | None = None,
    mood: str | None = None,
    era: str | None = None,
    max_runtime: int | str | None = None,
    similar_to: str | None = None,
    query: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Recommend movies by mood/genre/era/runtime filters or similarity to a movie ID."""
    if similar_to:
        target = get_movie_by_id(similar_to)
        if target is None:
            return []
        target_genres = {g.lower() for g in target["genres"]}
        target_moods = {m.lower() for m in target["moods"]}

        scored: list[tuple[int, int, dict[str, Any]]] = []
        for candidate in MOVIES:
            if candidate["id"] == target["id"]:
                continue
            cand_genres = {g.lower() for g in candidate["genres"]}
            cand_moods = {m.lower() for m in candidate["moods"]}
            genre_overlap = len(target_genres & cand_genres)
            mood_overlap = len(target_moods & cand_moods)
            era_bonus = 1 if candidate["era"] == target["era"] else 0
            score = genre_overlap * 3 + mood_overlap * 2 + era_bonus
            year_diff = abs(candidate["year"] - target["year"])
            scored.append((score, -year_diff, candidate))

        scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
        recs = [item[2] for item in scored]
    else:
        recs = filter_movies(
            query=query,
            genre=genre,
            mood=mood,
            era=era,
            max_runtime=max_runtime,
        )

    if limit is not None and limit > 0:
        return recs[:limit]
    return recs


def search_archive_org(query: str, rows: int = 10) -> list[dict[str, Any]]:
    """Query Internet Archive's public advancedsearch API for legal public-domain/CC films."""
    cleaned = (query or "").strip()
    if not cleaned:
        return []

    search_q = (
        f"({cleaned}) AND mediatype:(movies) AND "
        "(collection:(feature_films) OR licenseurl:(*creativecommons* OR *publicdomain*))"
    )
    params = urllib.parse.urlencode(
        {
            "q": search_q,
            "fl[]": "identifier,title,year,creator,licenseurl",
            "rows": str(max(1, min(rows, 25))),
            "output": "json",
        }
    )
    url = f"https://archive.org/advancedsearch.php?{params}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "PublicCinema/0.1 (https://archive.org)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return []

    docs = payload.get("response", {}).get("docs", [])
    results: list[dict[str, Any]] = []
    for doc in docs:
        identifier = doc.get("identifier")
        if not identifier:
            continue
        results.append(
            {
                "archive_id": identifier,
                "title": doc.get("title") or identifier,
                "year": doc.get("year"),
                "director": doc.get("creator") or "Unknown",
                "license_url": doc.get("licenseurl") or "",
                "archive_url": f"https://archive.org/details/{identifier}",
                "poster_url": f"https://archive.org/services/img/{identifier}",
            }
        )
    return results
