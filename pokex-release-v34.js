(() => {
  const VERSION = "3.4";
  const BUILD = document.querySelector('meta[name="pokex-build"]')?.content || "3432";
  const KEY = `pokex_seen_release_v34_${BUILD}`;

  const changes = [
    "🛠️ Corregido el bloqueo del inicio provocado por el observador del nuevo botón Intercambios.",
    "🔄 Intercambios se instala una sola vez y mantiene su contador en tiempo real sin repintar la interfaz continuamente.",
    "🧹 Limpiado el service worker para que no intente cachear módulos eliminados.",
    "📥 El acceso directo a Activos, Recibidos e Historial sigue disponible desde el inicio.",
    "📱 Se fuerza una caché nueva sin tocar el caché pesado del escáner."
  ];

  function applyVersion(){
    document.title=`PokEX ${VERSION}`;
    document.querySelectorAll(".pokex-version").forEach(el=>el.textContent=`v${VERSION}`);
  }

  function show(){
    let seen="";
    try{seen=localStorage.getItem(KEY)||"";}catch{}
    if(seen===BUILD || document.getElementById("pokexReleaseV34")) return;
    const overlay=document.createElement("div");
    overlay.id="pokexReleaseV34";
    overlay.className="pokex-release-overlay";
    overlay.innerHTML=`<div class="pokex-release-card" role="dialog" aria-modal="true" aria-labelledby="pokexReleaseV34Title"><h2 id="pokexReleaseV34Title">PokEX v${VERSION}</h2><p class="pokex-release-lead">PokEX se ha actualizado.</p><div class="pokex-release-changes"><strong>Novedades principales</strong>${changes.map(item=>`<p>${item}</p>`).join("")}</div><button type="button" class="pokex-release-continue">Continuar</button></div>`;
    overlay.querySelector(".pokex-release-continue")?.addEventListener("click",()=>{try{localStorage.setItem(KEY,BUILD);}catch{}overlay.remove();},{once:true});
    document.body.appendChild(overlay);
  }

  const style=document.createElement("style");
  style.textContent=`.pokex-release-overlay{position:fixed;inset:0;z-index:2147483500;background:rgba(2,8,23,.82);display:grid;place-items:center;padding:22px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.pokex-release-card{width:min(520px,100%);max-height:min(720px,calc(100dvh - 44px));overflow:auto;background:#0d1d3b;border:1px solid rgba(119,150,205,.28);border-radius:24px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.45);color:#fff}.pokex-release-card h2{margin:0;text-align:center;font-size:28px;font-weight:950}.pokex-release-lead{text-align:center;color:#d5dceb;margin:12px 0 18px}.pokex-release-changes{background:rgba(255,255,255,.055);border-radius:18px;padding:16px}.pokex-release-changes strong{display:block;margin-bottom:8px}.pokex-release-changes p{margin:8px 0;line-height:1.35}.pokex-release-continue{width:100%;margin-top:18px;min-height:52px}`;
  document.head.appendChild(style);
  applyVersion();
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>setTimeout(show,450),{once:true}); else setTimeout(show,450);
})();