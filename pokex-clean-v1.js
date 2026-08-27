(() => {
  const version =
    document.querySelector(
      ".pokex-version"
    );

  if (version) {
    version.textContent = "v3.2";
  }

  const resultBox =
    document.getElementById(
      "resultBox"
    );

  const listBox =
    document.getElementById(
      "listBox"
    );

  const main =
    document.querySelector("main.wrap");

  let frame = 0;

  function syncHomeScroll() {
    cancelAnimationFrame(frame);

    document.documentElement
      .classList.remove(
        "pokex-home-locked"
      );

    frame = requestAnimationFrame(
      () => {
        const hasCards =
          Boolean(
            resultBox &&
            !resultBox.classList
              .contains("hidden")
          ) ||
          Boolean(
            listBox &&
            !listBox.classList
              .contains("hidden")
          );

        const viewportHeight =
          window.visualViewport
            ?.height ||
          window.innerHeight;

        const contentFits =
          main &&
          main.getBoundingClientRect()
            .bottom <=
              viewportHeight + 1;

        document.documentElement
          .classList.toggle(
            "pokex-home-locked",
            !hasCards &&
              contentFits &&
              window.scrollY <= 1
          );
      }
    );
  }

  const observer =
    new MutationObserver(
      syncHomeScroll
    );

  [resultBox, listBox]
    .filter(Boolean)
    .forEach(box => {
      observer.observe(
        box,
        {
          attributes: true,
          attributeFilter: ["class"]
        }
      );
    });

  window.addEventListener(
    "resize",
    syncHomeScroll,
    { passive: true }
  );

  window.visualViewport
    ?.addEventListener(
      "resize",
      syncHomeScroll,
      { passive: true }
    );

  syncHomeScroll();
})();
