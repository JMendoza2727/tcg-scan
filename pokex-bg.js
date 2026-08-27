(() => {
  if (document.getElementById("pokexParticles")) return;

  const wrap = document.createElement("div");
  wrap.id = "pokexParticles";
  document.body.prepend(wrap);

  const colors = ["yellow", "blue", "red"];
  const reducedMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  const mobile =
    window.matchMedia(
      "(max-width: 700px), (pointer: coarse)"
    ).matches;

  const particleCount =
    reducedMotion
      ? 0
      : mobile
        ? 8
        : 14;

  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement("div");
    const size = 6 + Math.random() * 18;
    const left = Math.random() * 100;
    const delay = Math.random() * 12;
    const duration = 14 + Math.random() * 18;
    const color = colors[Math.floor(Math.random() * colors.length)];

    p.className = `pokex-particle ${color}`;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.left = `${left}%`;
    p.style.top = `${85 + Math.random() * 20}%`;
    p.style.animationDuration = `${duration}s`;
    p.style.animationDelay = `-${delay}s`;

    wrap.appendChild(p);
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      document.body.classList.toggle(
        "pokex-background-paused",
        document.hidden
      );
    }
  );

  document.body.classList.toggle(
    "pokex-background-paused",
    document.hidden
  );
})();
