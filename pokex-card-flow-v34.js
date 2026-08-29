(() => {
  const state = {
    previousSearch: null,
    restoring: false
  };

  const $ = id => document.getElementById(id);

  function mainViewActive() {
    const resultVisible = !$("resultBox")?.classList.contains("hidden");
    const listVisible = !$("listBox")?.classList.contains("hidden");
    return resultVisible || listVisible;
  }

  function pokedexOpen() {
    return document.body.classList.contains("pokedex-open") || !!document.querySelector(".pokedex-overlay");
  }

  function ensureBackButton() {
    let button = $("pokexMainBack");
    if (button) return button;

    button = document.createElement("button");
    button.id = "pokexMainBack";
    button.type = "button";
    button.className = "pokex-main-back";
    button.setAttribute("aria-label", "Volver");
    button.innerHTML = "← <span>Atrás</span>";
    button.hidden = true;
    document.body.appendChild(button);

    button.addEventListener("click", restorePreviousView);
    return button;
  }

  function updateBackButton() {
    const button = ensureBackButton();
    const visible = mainViewActive() && !pokedexOpen();
    button.hidden = !visible;
    document.body.classList.toggle("pokex-back-visible", visible);
  }

  function snapshotSearchBeforeCard() {
    const list = $("listBox");
    if (!list || list.classList.contains("hidden")) return;

    state.previousSearch = {
      query: $("query")?.value || "",
      language: $("lang")?.value || "es",
      tileCount: document.querySelectorAll("#cards .cardTile").length,
      scrollY: window.scrollY
    };
  }

  async function waitForSearchResults(timeout = 5000) {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const list = $("listBox");
      const progress = $("progressBox");
      const loading = progress && !progress.classList.contains("hidden");
      if (list && !list.classList.contains("hidden") && !loading) return true;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return false;
  }

  async function restorePreviousView() {
    if (state.restoring) return;
    state.restoring = true;

    try {
      const previous = state.previousSearch;

      if (!previous) {
        $("resultBox")?.classList.add("hidden");
        $("listBox")?.classList.add("hidden");
        if ($("resultBox")) $("resultBox").innerHTML = "";
        if ($("cards")) $("cards").innerHTML = "";
        window.scrollTo({ top: 0, behavior: "auto" });
        updateBackButton();
        return;
      }

      const query = $("query");
      const language = $("lang");
      if (language) language.value = previous.language;
      if (query) query.value = previous.query;

      $("searchBtn")?.click();
      const ready = await waitForSearchResults();

      if (ready) {
        let rendered = document.querySelectorAll("#cards .cardTile").length;
        while (rendered < previous.tileCount) {
          const more = $("moreBtn");
          if (!more || more.classList.contains("hidden")) break;
          more.click();
          await new Promise(resolve => requestAnimationFrame(resolve));
          const next = document.querySelectorAll("#cards .cardTile").length;
          if (next <= rendered) break;
          rendered = next;
        }
        requestAnimationFrame(() => {
          window.scrollTo({ top: previous.scrollY, behavior: "auto" });
        });
      }

      state.previousSearch = null;
      updateBackButton();
    } finally {
      state.restoring = false;
    }
  }

  function moveCollectionControls() {
    const detail = document.querySelector("#resultBox .detail");
    const controls = detail?.querySelector(".pokedex-card-controls");
    const right = detail?.querySelector(".detailGrid > div:nth-child(2)");
    const title = right?.querySelector("h2");

    if (!controls || !right || !title) return;
    if (controls.dataset.pokexCompactMoved === "1") return;

    controls.dataset.pokexCompactMoved = "1";
    controls.classList.add("pokedex-card-controls-compact");
    title.insertAdjacentElement("afterend", controls);
  }

  function installStyles() {
    if ($("pokexCardFlowStyles")) return;
    const style = document.createElement("style");
    style.id = "pokexCardFlowStyles";
    style.textContent = `
      body.pokex-back-visible .top .pokex-brand{
        visibility:hidden!important;
        opacity:0!important;
        pointer-events:none!important;
      }
      .pokex-main-back{
        position:fixed;z-index:2147482000;
        top:calc(env(safe-area-inset-top,0px) + 22px);left:24px;
        min-height:40px;padding:8px 13px;border-radius:13px;
        border:1px solid rgba(126,157,214,.32);
        background:rgba(10,26,55,.96);color:#fff;
        box-shadow:0 8px 24px rgba(0,0,0,.22);
        font:800 14px/1 system-ui,-apple-system,sans-serif;
        backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)
      }
      .pokex-main-back[hidden]{display:none!important}
      .pokex-main-back span{margin-left:3px}

      #resultBox .pokedex-card-controls-compact{
        margin:10px 0 13px!important;padding:0!important;
        border:0!important;background:transparent!important;
        box-shadow:none!important;display:flex!important;
        align-items:center!important;gap:7px!important;flex-wrap:wrap!important
      }
      #resultBox .pokedex-card-controls-compact .owned-card{
        width:auto!important;margin:0!important;padding:7px 10px!important;
        min-height:34px!important;border-radius:11px!important;
        font-size:13px!important;line-height:1.1!important
      }
      #resultBox .pokedex-card-controls-compact .owned-actions{
        display:flex!important;gap:7px!important;margin:0!important;width:auto!important
      }
      #resultBox .pokedex-card-controls-compact button{
        width:auto!important;min-width:0!important;min-height:34px!important;
        margin:0!important;padding:7px 10px!important;border-radius:11px!important;
        font-size:13px!important;line-height:1.1!important
      }
      #resultBox .pokedex-card-controls-compact .add-pokedex{
        width:auto!important;padding:8px 12px!important
      }
      @media(max-width:420px){
        .pokex-main-back{top:calc(env(safe-area-inset-top,0px) + 18px);left:20px}
        #resultBox .pokedex-card-controls-compact{gap:6px!important}
        #resultBox .pokedex-card-controls-compact button,
        #resultBox .pokedex-card-controls-compact .owned-card{font-size:12px!important;padding:7px 9px!important}
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener("click", event => {
    const tile = event.target.closest?.("#cards .cardTile");
    if (tile && !state.restoring) snapshotSearchBeforeCard();
  }, true);

  const observer = new MutationObserver(() => {
    moveCollectionControls();
    updateBackButton();
  });

  function boot() {
    installStyles();
    ensureBackButton();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    moveCollectionControls();
    updateBackButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
