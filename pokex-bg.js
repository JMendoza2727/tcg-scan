(() => {
  if (document.getElementById("pokexParticles")) return;

  const wrap = document.createElement("div");
  wrap.id = "pokexParticles";
  document.body.prepend(wrap);

  const colors = ["yellow", "blue", "red"];

  for (let i = 0; i < 18; i++) {
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
})();
