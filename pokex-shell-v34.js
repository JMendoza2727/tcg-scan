(() => {
  "use strict";

  const VERSION = "3.4";
  const script = document.currentScript;
  const BUILD =
    document.querySelector('meta[name="pokex-build"]')?.content ||
    (() => {
      try {
        return new URL(script?.src || "", location.href).searchParams.get("v") || "3412";
      } catch (_) {
        return "3412";
      }
    })();

  window.POKEX_VERSION = VERSION;
  window.POKEX_BUILD = BUILD;

  function applyVersion() {
    document.title = `PokEX ${VERSION}`;
    document.querySelectorAll(".pokex-version").forEach(el => {
      if (el.textContent !== `v${VERSION}`) el.textContent = `v${VERSION}`;
    });

    const account = document.getElementById("pokexAccountOverlay");
    account?.querySelectorAll(".v23-stat").forEach(stat => {
      if (!stat.textContent.toLowerCase().includes("versión vista")) return;
      const value = stat.querySelector("strong");
      if (value && value.textContent !== `v${VERSION}`) value.textContent = `v${VERSION}`;
    });
  }

  function cleanupModalState() {
    const visibleLegacyModal = [...document.querySelectorAll(".v23-overlay")]
      .some(node => node.isConnected && !node.classList.contains("hidden"));
    if (visibleLegacyModal) return;
    document.body.classList.remove("pokex-modal-open");
    document.documentElement.classList.remove("pokex-modal-open");
  }

  let legacyWelcome = null;
  let legacyWelcomeObserver = null;
  function watchLegacyWelcome() {
    const found = document.getElementById("pokexWelcomeOverlay");
    if (!found || found === legacyWelcome) return;

    legacyWelcome = found;
    legacyWelcomeObserver?.disconnect();
    legacyWelcomeObserver = new MutationObserver(() => {
      if (!legacyWelcome || legacyWelcome.classList.contains("hidden")) return;
      legacyWelcome.remove();
      queueMicrotask(cleanupModalState);
    });
    legacyWelcomeObserver.observe(legacyWelcome, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true
    });
  }

  function removeUnusedBackupUI() {
    document.querySelector('.v22-tab[data-tab="backup"]')?.remove();
    document.getElementById("v22Backup")?.remove();
  }

  let accountObserver = null;
  function attachAccountObserver() {
    if (accountObserver) return true;
    const account = document.getElementById("pokexAccountOverlay");
    if (!account) return false;

    accountObserver = new MutationObserver(applyVersion);
    accountObserver.observe(account, { childList: true, subtree: true });
    applyVersion();
    return true;
  }

  function installUpdateButton() {
    if (document.getElementById("pokexCheckUpdate")) return;
    const version = document.querySelector(".pokex-version");
    if (!version) return;

    const button = document.createElement("button");
    button.id = "pokexCheckUpdate";
    button.type = "button";
    button.className = "pokex-update-check";
    button.textContent = "↻";
    button.title = "Comprobar si hay una actualización";
    button.setAttribute("aria-label", "Comprobar actualización de PokEX");
    version.insertAdjacentElement("afterend", button);
    button.addEventListener("click", checkForUpdate);
  }

  function remoteBuildFromHTML(html) {
    const meta = html.match(/<meta\s+name=["']pokex-build["']\s+content=["']([^"']+)["']/i);
    if (meta?.[1]) return meta[1];
    const scriptBuild = html.match(/pokex-shell-v34\.js\?v=([0-9]+)/i);
    return scriptBuild?.[1] || "";
  }

  function cleanRefreshQuery() {
    const params = new URLSearchParams(location.search);
    if (!params.has("pokex-refresh")) return;
    params.delete("pokex-refresh");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
  }

  async function checkForUpdate() {
    const button = document.getElementById("pokexCheckUpdate");
    if (!button || button.disabled) return;

    button.disabled = true;
    button.textContent = "…";
    button.title = "Comprobando actualización…";

    try {
      const response = await fetch(`./index.html?pokex-check=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const remoteBuild = remoteBuildFromHTML(await response.text()) || BUILD;

      try {
        const registration = await navigator.serviceWorker?.getRegistration?.();
        await registration?.update?.();
      } catch (_) {}

      if (remoteBuild !== BUILD) {
        button.textContent = "↑";
        button.title = "Nueva versión encontrada. Actualizando…";
        setTimeout(() => {
          location.replace(`${location.pathname}?pokex-refresh=${encodeURIComponent(remoteBuild)}`);
        }, 180);
        return;
      }

      button.textContent = "✓";
      button.title = "PokEX está actualizada";
      setTimeout(() => resetUpdateButton(button), 1400);
    } catch (error) {
      console.warn("PokEX update check:", error);
      button.textContent = "!";
      button.title = "No se pudo comprobar la actualización";
      setTimeout(() => resetUpdateButton(button), 1800);
    }
  }

  function resetUpdateButton(button) {
    button.textContent = "↻";
    button.title = "Comprobar si hay una actualización";
    button.disabled = false;
  }

  const style = document.createElement("style");
  style.textContent = `
    .pokex-update-check{
      display:inline-grid;place-items:center;vertical-align:middle;
      width:28px;height:28px;margin-left:7px;padding:0;
      border:1px solid rgba(255,255,255,.18);border-radius:9px;
      background:rgba(9,25,55,.62);color:#d8e4fb;
      font:900 17px/1 system-ui,-apple-system,sans-serif;
      box-shadow:none;cursor:pointer;transform:translateY(-1px)
    }
    .pokex-update-check:active{transform:translateY(-1px) scale(.94)}
    .pokex-update-check:disabled{opacity:.72;cursor:default}
  `;
  document.head.appendChild(style);

  cleanRefreshQuery();
  applyVersion();
  installUpdateButton();
  removeUnusedBackupUI();

  const startupObserver = new MutationObserver(() => {
    applyVersion();
    installUpdateButton();
    watchLegacyWelcome();
    removeUnusedBackupUI();
    attachAccountObserver();
  });

  startupObserver.observe(document.body, {
    childList: true,
    attributes: true,
    attributeFilter: ["class"]
  });

  watchLegacyWelcome();
  attachAccountObserver();

  setTimeout(() => {
    watchLegacyWelcome();
    removeUnusedBackupUI();
    attachAccountObserver();
    cleanupModalState();
    startupObserver.disconnect();
  }, 15000);
})();
