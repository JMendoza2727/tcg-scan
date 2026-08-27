(() => {
  const VERSION = "3.4";
  const BUILD = "3.4.1";
  const AVATARS = ["😎","🤠","🥷","🧙","🦸","🧑‍🚀","🤖","👻","🧑‍🎤","🧑‍💻"];
  const MUSIC_KEY = "pokex_music_enabled";
  const VOLUME_KEY = "pokex_music_volume";

  function applyVersion(){
    document.title = `PokEX ${VERSION}`;
    document.querySelectorAll(".pokex-version").forEach(el => el.textContent = `v${VERSION}`);
    document.querySelectorAll(".v23-stat").forEach(stat => {
      if(!stat.textContent.toLowerCase().includes("versión vista")) return;
      const strong = stat.querySelector("strong");
      if(strong) strong.textContent = `v${VERSION}`;
    });
  }

  function accountOverlay(){ return document.getElementById("pokexAccountOverlay"); }
  function logoutButton(root){
    return [...(root?.querySelectorAll("button") || [])].find(b => b.textContent.trim().toLowerCase().includes("cerrar sesión")) || null;
  }
  function refreshMusic(root){
    const button = root?.querySelector(".v341-music-btn");
    const slider = root?.querySelector(".v341-volume");
    const on = localStorage.getItem(MUSIC_KEY) === "1";
    if(button){ button.textContent = on ? "🎵 Activada" : "🔇 Desactivada"; button.classList.toggle("on",on); }
    if(slider) slider.value = String(Math.max(0,Math.min(100,Number(localStorage.getItem(VOLUME_KEY) ?? 18))));
  }
  function ensureAccount(){
    const root = accountOverlay();
    if(!root || root.classList.contains("hidden")) return;
    applyVersion();

    // No dejamos dos paneles compitiendo. Si el original existe y está completo, se conserva.
    const original = root.querySelector(".v231-settings:not([data-pokex-v341])");
    if(original && original.querySelectorAll("[data-avatar]").length >= 10 && original.querySelector(".v231-music-btn")) return;
    original?.remove();

    let settings = root.querySelector("[data-pokex-v341]");
    const logout = logoutButton(root);
    if(!logout) return;
    if(!settings){
      settings = document.createElement("div");
      settings.className = "v231-settings";
      settings.dataset.pokexV341 = "1";
      settings.innerHTML = `
        <h3>Personalización</h3>
        <div class="v23-muted">Avatar PokEX</div>
        <div class="v231-avatar-picker">${AVATARS.map(a=>`<button type="button" class="v231-avatar-option" data-avatar="${a}">${a}</button>`).join("")}</div>
        <div class="v231-setting-line"><div><strong>Música de fondo</strong><div class="v23-muted">Chiptune original · v3.4</div></div><button class="v231-music-btn v341-music-btn" type="button"></button></div>
        <input class="v231-volume v341-volume" type="range" min="0" max="100" step="1" aria-label="Volumen de música">`;
      logout.parentNode.insertBefore(settings,logout);
      settings.querySelectorAll("[data-avatar]").forEach(btn => btn.addEventListener("click",()=>{
        // El módulo de cuenta original gestiona persistencia; forzamos su opción equivalente si existe.
        const equivalent = [...root.querySelectorAll(".v231-avatar-option")].find(x => x !== btn && x.dataset.avatar === btn.dataset.avatar);
        if(equivalent) equivalent.click();
        settings.querySelectorAll("[data-avatar]").forEach(x=>x.classList.toggle("active",x===btn));
      }));
      settings.querySelector(".v341-music-btn")?.addEventListener("click",async()=>{
        if(window.PokEXMobile231?.toggleMusic) await window.PokEXMobile231.toggleMusic();
        else localStorage.setItem(MUSIC_KEY,localStorage.getItem(MUSIC_KEY)==="1"?"0":"1");
        refreshMusic(settings);
      });
      settings.querySelector(".v341-volume")?.addEventListener("input",e=>{
        localStorage.setItem(VOLUME_KEY,String(e.target.value));
        const originalSlider = [...root.querySelectorAll(".v231-volume")].find(x=>x!==e.target);
        if(originalSlider){ originalSlider.value=e.target.value; originalSlider.dispatchEvent(new Event("input",{bubbles:true})); }
      });
    }
    refreshMusic(settings);
  }

  function ensureRankings(){
    const root = document.getElementById("pokexFriendsV33Overlay");
    if(!root) return;
    const tabs = root.querySelector(".f33-tabs");
    if(!tabs) return;
    let rank = tabs.querySelector("[data-v34-tab='ranking']");
    if(!rank){
      rank = document.createElement("button"); rank.type="button"; rank.dataset.v34Tab="ranking"; rank.textContent="Rankings"; tabs.appendChild(rank);
      rank.addEventListener("click",async()=>{
        tabs.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===rank));
        await window.PokEXSocialV34?.renderRankings?.();
      });
    }
    root.querySelectorAll(".f33-user-card").forEach(card=>{
      if(card.querySelector(".f34-view")) return;
      const source=card.querySelector("[data-remove],[data-block]"); const uid=source?.dataset.remove||source?.dataset.block;
      if(!uid) return;
      const actions=card.querySelector(".f33-actions")||card;
      const b=document.createElement("button"); b.type="button"; b.className="f33-soft f34-view"; b.textContent="Ver colección";
      b.onclick=()=>window.PokEXSocialV34?.openFriendProfile?.(uid); actions.prepend(b);
    });
  }

  let statusTimer = 0;
  function watchPokedexStatus(){
    const status=document.getElementById("pokedexUpdateStatus");
    if(!status || status.dataset.v341Watched) return;
    status.dataset.v341Watched="1";
    const arm=()=>{
      clearTimeout(statusTimer);
      const text=status.textContent.trim();
      if(!text || status.hidden) return;
      if(text === "No tienes cartas para actualizar." || text.startsWith("✅ Actualización terminada")){
        statusTimer=setTimeout(()=>{ status.hidden=true; status.textContent=""; status.className="pokedex-update-status"; },5000);
      }
    };
    new MutationObserver(arm).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","class"]});
    arm();
  }

  function restartParticles(){
    const wrap=document.getElementById("pokexParticles"); if(!wrap) return;
    wrap.querySelectorAll(".pokex-particle").forEach(p=>{
      p.style.animationPlayState="running";
      p.style.webkitAnimationPlayState="running";
    });
    document.body.classList.remove("pokex-background-paused");
  }

  function showBuildNotice(){
    const key=`pokex_seen_build_${BUILD}`;
    try{ if(localStorage.getItem(key)==="1") return; }catch{}
    if(document.getElementById("pokexBuildNotice341")) return;
    const overlay=document.createElement("div"); overlay.id="pokexBuildNotice341"; overlay.className="pokex-release-overlay";
    overlay.innerHTML=`<div class="pokex-release-card" role="dialog" aria-modal="true"><h2>PokEX v3.4</h2><p class="pokex-release-lead">Actualización de estabilidad y funciones sociales.</p><div class="pokex-release-changes"><strong>Novedades</strong><p>🏆 Rankings y colecciones de amigos integrados.</p><p>👤 Avatar y música cargan junto con Cuenta.</p><p>✨ Corregido el arranque de las partículas en iPhone.</p><p>🃏 Los avisos de actualización de Mi Pokédex desaparecen tras 5 segundos.</p></div><button type="button" class="pokex-release-continue">Continuar</button></div>`;
    overlay.querySelector("button").onclick=()=>{try{localStorage.setItem(key,"1");}catch{} overlay.remove();}; document.body.appendChild(overlay);
  }

  const style=document.createElement("style");
  style.textContent=`.f33-tabs{grid-template-columns:repeat(4,minmax(0,1fr))!important}.f33-tabs button{min-width:0!important;padding-left:8px!important;padding-right:8px!important}.v231-settings[data-pokex-v341]{display:block!important;visibility:visible!important;opacity:1!important}.pokex-release-overlay{position:fixed;inset:0;z-index:2147483600;background:rgba(2,8,23,.84);display:grid;place-items:center;padding:22px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.pokex-release-card{width:min(520px,100%);background:#0d1d3b;border:1px solid rgba(119,150,205,.28);border-radius:24px;padding:24px;color:#fff}.pokex-release-card h2{text-align:center;margin:0;font-size:28px}.pokex-release-lead{text-align:center;color:#d5dceb}.pokex-release-changes{background:rgba(255,255,255,.055);border-radius:18px;padding:16px}.pokex-release-changes p{margin:8px 0}.pokex-release-continue{width:100%;margin-top:18px;min-height:52px}@media(max-width:430px){.f33-tabs{grid-template-columns:repeat(2,1fr)!important}}`;
  document.head.appendChild(style);

  applyVersion();
  const observer=new MutationObserver(()=>{ applyVersion(); ensureAccount(); ensureRankings(); watchPokedexStatus(); });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("click",e=>{
    if(e.target.closest("#v23AccountButton")) requestAnimationFrame(()=>requestAnimationFrame(ensureAccount));
    if(e.target.closest("#pokexFriendsV33Button")) requestAnimationFrame(()=>requestAnimationFrame(ensureRankings));
  },true);
  window.addEventListener("pageshow",()=>{restartParticles(); setTimeout(restartParticles,120); setTimeout(restartParticles,600);});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden) setTimeout(restartParticles,80);});
  requestAnimationFrame(()=>requestAnimationFrame(restartParticles));
  setTimeout(restartParticles,250);
  setTimeout(()=>{ ensureAccount(); ensureRankings(); watchPokedexStatus(); showBuildNotice(); },700);
})();