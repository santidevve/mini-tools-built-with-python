/* Public Cinema — Progressive enhancement for filtering, Surprise Me, and Copy Link */

(function () {
  "use strict";

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

  // Voice search (free, uses the browser Web Speech API — no API keys or cost).
  const micBtn = document.getElementById("mic-btn");
  const searchInput = document.getElementById("filter-q");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (micBtn && searchInput && SpeechRecognition) {
    micBtn.hidden = false;
    let recognizing = false;

    const stopListening = () => {
      recognizing = false;
      micBtn.classList.remove("listening");
    };

    micBtn.addEventListener("click", () => {
      if (recognizing) return;
      const recognition = new SpeechRecognition();
      recognition.lang = navigator.language || "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.addEventListener("start", () => {
        recognizing = true;
        micBtn.classList.add("listening");
      });

      recognition.addEventListener("result", (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (!transcript) return;
        searchInput.value = transcript;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      });

      recognition.addEventListener("error", stopListening);
      recognition.addEventListener("end", stopListening);

      try {
        recognition.start();
      } catch (_err) {
        stopListening();
      }
    });
  } else if (micBtn) {
    micBtn.hidden = true;
  }
})();
