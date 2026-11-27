/* Public Cinema — Progressive enhancement for filtering, Surprise Me, and Copy Link */

(function () {
  "use strict";

  // Register the service worker for installable/offline PWA support (Google TV).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Non-fatal: app still works without offline support. */
      });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderMovieCard(movie) {
    const genresHtml = (movie.genres || [])
      .map((g) => `<span class="tag">${escapeHtml(g)}</span>`)
      .join("");
    const moodsHtml = (movie.moods || [])
      .map((m) => `<span class="tag tag-mood">${escapeHtml(m)}</span>`)
      .join("");
    const detailUrl = `/movie/${encodeURIComponent(movie.id)}`;
    const downloadUrl = `/download/${encodeURIComponent(movie.id)}`;

    return `
      <article class="movie-card" data-movie-id="${escapeHtml(movie.id)}">
        <a class="poster-wrap" href="${detailUrl}">
          <img
            class="poster-img"
            src="${escapeHtml(movie.poster_url || "")}"
            alt="${escapeHtml(movie.title)} (${escapeHtml(movie.year)}) poster"
            loading="lazy"
            onerror="this.style.display='none'"
          >
          <div class="poster-overlay">
            <span class="pill">${escapeHtml(movie.year)} &bull; ${escapeHtml(movie.runtime_min)} min</span>
            <span class="pill pill-license">${escapeHtml(movie.license)}</span>
          </div>
        </a>
        <div class="card-body">
          <h2 class="card-title"><a href="${detailUrl}">${escapeHtml(movie.title)}</a></h2>
          <p class="card-director">Directed by ${escapeHtml(movie.director)}</p>
          <p class="card-synopsis">${escapeHtml(movie.synopsis)}</p>
          <div class="tag-row">${genresHtml}${moodsHtml}</div>
          <div class="card-actions">
            <a class="btn btn-secondary btn-sm" href="${detailUrl}">Details</a>
            <a class="btn btn-primary btn-sm" href="${downloadUrl}">Download MP4</a>
          </div>
        </div>
      </article>
    `;
  }

  // Catalog page enhancements
  const filterForm = document.getElementById("filter-form");
  const movieGrid = document.getElementById("movie-grid");
  const emptyState = document.getElementById("empty-state");
  const resultsCount = document.getElementById("results-count");
  const surpriseBtn = document.getElementById("surprise-btn");

  if (filterForm && movieGrid) {
    let debounceTimer = null;

    function buildQueryString() {
      const formData = new FormData(filterForm);
      const params = new URLSearchParams();
      for (const [key, val] of formData.entries()) {
        const trimmed = String(val).trim();
        if (trimmed) {
          params.set(key, trimmed);
        }
      }
      return params.toString();
    }

    async function applyFiltersAsync() {
      const qs = buildQueryString();
      const apiUrl = qs ? `/api/movies?${qs}` : "/api/movies";
      const pageUrl = qs ? `/?${qs}` : "/";

      try {
        const response = await fetch(apiUrl, { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const data = await response.json();
        const movies = data.movies || [];

        if (resultsCount) {
          resultsCount.textContent = String(movies.length);
        }

        if (movies.length === 0) {
          movieGrid.innerHTML = "";
          movieGrid.classList.add("hidden");
          if (emptyState) emptyState.classList.remove("hidden");
        } else {
          movieGrid.innerHTML = movies.map(renderMovieCard).join("");
          movieGrid.classList.remove("hidden");
          if (emptyState) emptyState.classList.add("hidden");
        }

        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", pageUrl);
        }
      } catch (_err) {
        // Fall back silently; standard form submission still works.
      }
    }

    const searchInput = document.getElementById("filter-q");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyFiltersAsync, 220);
      });
    }

    filterForm.querySelectorAll("select").forEach((selectEl) => {
      selectEl.addEventListener("change", applyFiltersAsync);
    });

    if (surpriseBtn) {
      surpriseBtn.addEventListener("click", () => {
        const cards = Array.from(movieGrid.querySelectorAll(".movie-card"));
        if (cards.length === 0) return;

        cards.forEach((c) => c.classList.remove("is-highlighted"));
        const chosen = cards[Math.floor(Math.random() * cards.length)];
        chosen.classList.add("is-highlighted");
        chosen.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  // Detail page: Copy Link button
  const copyLinkBtn = document.getElementById("copy-link-btn");
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", async () => {
      const originalText = copyLinkBtn.textContent;
      try {
        await navigator.clipboard.writeText(window.location.href);
        copyLinkBtn.textContent = "Copied!";
        setTimeout(() => {
          copyLinkBtn.textContent = originalText;
        }, 1800);
      } catch (_err) {
        copyLinkBtn.textContent = "Copy URL from address bar";
        setTimeout(() => {
          copyLinkBtn.textContent = originalText;
        }, 2200);
      }
    });
  }

  // ------------------------------------------------------------------
  // D-pad / remote spatial navigation for Google TV & Android TV.
  // Arrow keys move focus to the nearest focusable element in that
  // direction; Enter/Space activate it natively.
  // ------------------------------------------------------------------
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "video[controls]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function getFocusable() {
    return Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
      if (el.closest(".hidden")) return false;
      if (el.offsetParent === null && el.tagName !== "VIDEO") return false;
      return true;
    });
  }

  function focusFirst() {
    const items = getFocusable();
    if (items.length) items[0].focus({ preventScroll: false });
  }

  function spatialNavigate(key) {
    const items = getFocusable();
    if (!items.length) return false;
    const current = document.activeElement;
    if (!current || !items.includes(current)) {
      focusFirst();
      return true;
    }

    const from = current.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;

    let best = null;
    let bestScore = Infinity;

    for (const el of items) {
      if (el === current) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - fx;
      const dy = cy - fy;

      let primary = 0;
      let secondary = 0;
      if (key === "ArrowRight") { primary = dx; secondary = Math.abs(dy); }
      else if (key === "ArrowLeft") { primary = -dx; secondary = Math.abs(dy); }
      else if (key === "ArrowDown") { primary = dy; secondary = Math.abs(dx); }
      else if (key === "ArrowUp") { primary = -dy; secondary = Math.abs(dx); }

      if (primary <= 4) continue; // must be in the requested direction
      const score = primary + secondary * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best) {
      best.focus({ preventScroll: false });
      best.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      return true;
    }
    return false;
  }

  const ARROW_KEYS = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented) return;
      const tag = (event.target && event.target.tagName) || "";
      // Let text inputs keep native caret movement.
      if (tag === "INPUT" && event.target.type !== "checkbox" && event.target.type !== "radio") {
        const isTextInput = ["text", "search", "email", "url", "tel", "password", "number"].includes(
          event.target.type
        );
        if (isTextInput) return;
      }
      if (ARROW_KEYS.includes(event.key)) {
        if (spatialNavigate(event.key)) {
          event.preventDefault();
        }
      }
    },
    true
  );

  // Show a focus hint the first time the user navigates with the remote.
  let tvHintShown = false;
  document.addEventListener(
    "keydown",
    (event) => {
      if (!tvHintShown && (ARROW_KEYS.includes(event.key) || event.key === "Enter")) {
        tvHintShown = true;
        document.body.classList.add("using-remote");
      }
    },
    true
  );
})();
