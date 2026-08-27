(() => {
  function languageFromImage(src) {
    const value = String(src || "");
    const tcgdex = value.match(/assets\.tcgdex\.net\/(es|en|ja)(?:\/|$)/i);
    if (tcgdex) return tcgdex[1].toLowerCase();
    return null;
  }

  function flagFor(lang) {
    return lang === "ja" ? "🇯🇵" : lang === "en" ? "🇬🇧" : "🇪🇸";
  }

  function correctFriendFlags(root = document) {
    root.querySelectorAll?.("#pokexFriendProfileV34 .f34-card").forEach(card => {
      const flag = card.querySelector(".f34-lang");
      const image = card.querySelector(".f34-card-media img");
      if (!flag || !image) return;

      const detected = languageFromImage(image.currentSrc || image.src);
      // Corrige registros antiguos cuya lang quedó como EN aunque la imagen exacta sea ES/JA.
      // No cambiamos una bandera ES/JA por EN: una imagen inglesa puede ser solo un fallback visual.
      if ((detected === "es" || detected === "ja") && flag.textContent.trim() !== flagFor(detected)) {
        flag.textContent = flagFor(detected);
      }
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) correctFriendFlags(node);
      }
    }
    correctFriendFlags();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
      correctFriendFlags();
    }, { once: true });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
    correctFriendFlags();
  }
})();
