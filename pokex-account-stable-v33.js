(() => {
  const isSyncText = value => {
    const text = String(value || "").trim().toLowerCase();
    return text === "sincronizando..." ||
      text === "sincronizando…" ||
      text === "sincronizado" ||
      text === "sincronizado." ||
      text === "✅ sincronizado.";
  };

  function polishAccountOnce() {
    try {
      window.PokEXMobile231?.polish?.();
    } catch (_) {}
  }

  function clearDuplicateSyncMessage() {
    const msg = document.querySelector("#v23AccountMessage");
    if (!msg) return;
    if (isSyncText(msg.textContent)) {
      msg.textContent = "";
      msg.hidden = true;
    }
  }

  document.addEventListener("click", event => {
    if (event.target.closest("#v23AccountButton")) {
      setTimeout(polishAccountOnce, 120);
      setTimeout(polishAccountOnce, 420);
      return;
    }

    if (event.target.closest("#v23SyncNow")) {
      const started = Date.now();
      const timer = setInterval(() => {
        clearDuplicateSyncMessage();
        if (Date.now() - started > 12000) {
          clearInterval(timer);
        }
      }, 180);
      setTimeout(clearDuplicateSyncMessage, 0);
    }
  }, true);
})();
