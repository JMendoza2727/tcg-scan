(() => {
  const APP_VERSION = "3.3";
  const RELEASE_KEY = "pokex_seen_release_v33";
  const LEGACY_SEEN_KEY = "pokex_seen_version";
  const LAST_SYNC_KEY = "pokex_last_successful_sync_v33";

  try { localStorage.setItem(LEGACY_SEEN_KEY, "3.2"); } catch (_) {}

  const releaseChanges = [
    "👥 Amigos: búsqueda, solicitudes y gestión de amistades.",
    "🃏 Catálogos, imágenes y precios mejorados en ES, EN y JP.",
    "🔎 Buscador e idioma integrados en una interfaz más limpia.",
    "⚡ Mejoras de rendimiento, caché y fluidez en iPhone/PWA.",
    "🎵 Cuenta, sincronización y música renovadas."
  ];

  function applyVersionLabels() {
    document.title = `PokEX ${APP_VERSION}`;
    document.querySelectorAll(".pokex-version").forEach(el => {
      el.textContent = `v${APP_VERSION}`;
    });

    document.querySelectorAll(".v23-stat").forEach(stat => {
      const label = stat.querySelector("span")?.textContent?.trim().toLowerCase();
      if (label === "versión vista" || label === "version vista") {
        const strong = stat.querySelector("strong");
        if (strong) strong.textContent = `v${APP_VERSION}`;
      }
    });
  }

  function removeLegacyRelease() {
    document.querySelectorAll(".v23-overlay").forEach(overlay => {
      const title = overlay.querySelector("h2")?.textContent?.trim() || "";
      if (/PokEX\s+Beta\s+v3\.2/i.test(title)) {
        overlay.remove();
        try { localStorage.setItem(LEGACY_SEEN_KEY, "3.2"); } catch (_) {}
      }
    });
  }

  function showReleaseIfNeeded() {
    let seen = "";
    try { seen = localStorage.getItem(RELEASE_KEY) || ""; } catch (_) {}
    if (seen === APP_VERSION || document.getElementById("pokexReleaseV33")) return;

    const overlay = document.createElement("div");
    overlay.id = "pokexReleaseV33";
    overlay.className = "pokex-release-overlay";
    overlay.innerHTML = `
      <div class="pokex-release-card" role="dialog" aria-modal="true" aria-labelledby="pokexReleaseTitle">
        <h2 id="pokexReleaseTitle">PokEX v${APP_VERSION}</h2>
        <p class="pokex-release-lead">Nueva versión disponible.</p>
        <div class="pokex-release-changes">
          <strong>Novedades principales</strong>
          ${releaseChanges.map(item => `<p>${item}</p>`).join("")}
        </div>
        <button type="button" class="pokex-release-continue">Continuar</button>
      </div>`;

    const close = () => {
      try { localStorage.setItem(RELEASE_KEY, APP_VERSION); } catch (_) {}
      overlay.remove();
    };
    overlay.querySelector(".pokex-release-continue")?.addEventListener("click", close, { once: true });
    document.body.appendChild(overlay);
  }

  function formatRelativeSync(ts) {
    const value = Number(ts) || 0;
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startToday - startDate) / 86400000);
    const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(date);

    if (days === 0) return `hoy ${time}`;
    if (days === 1) return `ayer ${time}`;
    const day = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
    return `${day} · ${time}`;
  }

  const syncState = new WeakMap();
  function polishSyncRows() {
    document.querySelectorAll(".v23-sync").forEach(row => {
      const textNode = row.querySelector("[data-pokex-sync]");
      if (!textNode) return;

      const raw = textNode.textContent.trim().toLowerCase();
      const isSyncing = raw.includes("sincronizando");
      const isSynced = raw.includes("sincronizado") && !isSyncing;
      const prev = syncState.get(row) || "";

      if (isSyncing) {
        syncState.set(row, "syncing");
        return;
      }

      if (isSynced) {
        if (prev === "syncing") {
          try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch (_) {}
        }
        syncState.set(row, "synced");

        let last = 0;
        try { last = Number(localStorage.getItem(LAST_SYNC_KEY)) || 0; } catch (_) {}
        const formatted = formatRelativeSync(last);
        const wanted = formatted ? `Sincronizado · ${formatted}` : "Sincronizado";
        if (textNode.textContent.trim() !== wanted) textNode.textContent = wanted;
      } else {
        syncState.set(row, "other");
      }
    });
  }

  function restoreAccountPolish() {
    const accountOpen = [...document.querySelectorAll(".v23-overlay:not(.hidden)")]
      .some(el => el.querySelector("#v23SyncNow"));
    if (!accountOpen) return;

    try { window.PokEXMobile231?.polish?.(); } catch (_) {}

    const message = document.getElementById("v23AccountMessage");
    if (message && /^✅\s*Sincronizado\.?$/i.test(message.textContent.trim())) {
      message.textContent = "";
    }
  }

  let pokedexTimer = null;
  function polishPokedexStatus() {
    const status = document.getElementById("pokedexUpdateStatus");
    if (!status || status.hidden) return;
    if (!status.textContent.includes("Actualización terminada")) return;

    if (status.dataset.autoHideScheduled === status.textContent) return;
    status.dataset.autoHideScheduled = status.textContent;
    clearTimeout(pokedexTimer);
    pokedexTimer = setTimeout(() => {
      status.hidden = true;
      status.dataset.autoHideScheduled = "";
    }, 5000);
  }

  const style = document.createElement("style");
  style.textContent = `
    .pokex-release-overlay{position:fixed;inset:0;z-index:10000050;background:rgba(2,8,23,.82);display:grid;place-items:center;padding:22px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
    .pokex-release-card{width:min(520px,100%);max-height:min(720px,calc(100dvh - 44px));overflow:auto;background:#0d1d3b;border:1px solid rgba(119,150,205,.28);border-radius:24px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.45);color:#fff}
    .pokex-release-card h2{margin:0;text-align:center;font-size:28px;font-weight:950}.pokex-release-lead{text-align:center;color:#d5dceb;margin:12px 0 18px}
    .pokex-release-changes{background:rgba(255,255,255,.055);border-radius:18px;padding:16px}.pokex-release-changes strong{display:block;margin-bottom:8px}.pokex-release-changes p{margin:8px 0;line-height:1.35}
    .pokex-release-continue{width:100%;margin-top:18px;min-height:52px}
  `;
  document.head.appendChild(style);

  let raf = 0;
  const refresh = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      removeLegacyRelease();
      applyVersionLabels();
      polishSyncRows();
      polishPokedexStatus();
      restoreAccountPolish();
    });
  };

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "class"]
  });

  document.addEventListener("DOMContentLoaded", () => {
    removeLegacyRelease();
    applyVersionLabels();
    polishSyncRows();
    setTimeout(showReleaseIfNeeded, 350);
  }, { once: true });

  if (document.readyState !== "loading") {
    removeLegacyRelease();
    applyVersionLabels();
    polishSyncRows();
    setTimeout(showReleaseIfNeeded, 350);
  }
})();
