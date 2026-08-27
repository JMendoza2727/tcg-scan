(() => {
  const MODE_KEY = "pokex_music_mode_v33";
  const TECHNO_KEY = "pokex_music_techno_enabled";
  const ORIGINAL_KEY = "pokex_music_enabled";
  const VOLUME_KEY = "pokex_music_volume";

  let ctx = null;
  let gain = null;
  let filter = null;
  let compressor = null;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  const voices = new Set();

  const STEP = 0.125;
  const LOOKAHEAD = 360;
  const AHEAD = 0.85;

  const notes = {
    A2:110.00,C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196.00,A3:220.00,C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392.00,A4:440.00,C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99,A5:880.00
  };

  const lead = [
    "A4",null,"C5","D5","E5",null,"D5","C5",
    "A4",null,"E5",null,"G5","E5","D5",null,
    "F4","A4","C5",null,"D5","C5","A4",null,
    "G4",null,"D5","E5","D5","A4","G4",null
  ];

  const bass = ["A2","F3","C3","G3"];
  const arp = [
    ["A3","C4","E4","C4"],
    ["F3","A3","C4","A3"],
    ["C3","E3","G3","E3"],
    ["G3","A3","D4","A3"]
  ];

  const mode = () => localStorage.getItem(MODE_KEY) || "original";
  const technoEnabled = () => localStorage.getItem(TECHNO_KEY) === "1";
  const volume = () => Math.max(0, Math.min(100, Number(localStorage.getItem(VOLUME_KEY) ?? 18)));

  function scannerOpen(){
    return document.body.classList.contains("cv11-camera-open");
  }

  function setLevel(){
    if(!gain || !ctx) return;
    gain.gain.setTargetAtTime(0.14 * (volume()/100), ctx.currentTime, 0.05);
  }

  function tone(freq, duration, when, type="square", level=.08, detune=0){
    if(!ctx || !gain || ctx.state !== "running" || !freq) return;
    const t = Math.max(ctx.currentTime, when);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq,t);
    osc.detune.setValueAtTime(detune,t);
    g.gain.setValueAtTime(.0001,t);
    g.gain.linearRampToValueAtTime(level,t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(g);
    g.connect(gain);
    osc.start(t);
    osc.stop(t+duration+.025);
    voices.add(osc);
    osc.addEventListener("ended",()=>voices.delete(osc),{once:true});
  }

  function tick(when){
    const s = step % lead.length;
    const section = Math.floor(s/8)%4;
    const beat = s%4;
    const n = lead[s];

    if(n){
      tone(notes[n],.105,when,"square",.075);
      tone(notes[n],.09,when+.004,"triangle",.026,7);
    }

    const an = arp[section][beat];
    tone(notes[an],.085,when+.012,"triangle",.032);

    if(s%4===0){
      tone(notes[bass[section]],.22,when,"sawtooth",.085);
      tone(58,.055,when,"sine",.055);
    }
    if(s%2===1){
      tone(2400,.018,when,"square",.008);
    }
    if(s%8===6){
      tone(1200,.025,when,"square",.014);
    }
    step++;
  }

  function schedule(){
    if(!ctx || ctx.state !== "running" || mode() !== "techno" || !technoEnabled()) return;
    const now = ctx.currentTime;
    if(!nextTime || nextTime < now-STEP) nextTime = now+.035;
    while(nextTime < now+AHEAD){
      tick(nextTime);
      nextTime += STEP;
    }
  }

  async function ensureContext(){
    if(!ctx){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gain = ctx.createGain();
      filter = ctx.createBiquadFilter();
      compressor = ctx.createDynamicsCompressor();
      filter.type = "lowpass";
      filter.frequency.value = 4400;
      filter.Q.value = .7;
      compressor.threshold.value = -20;
      compressor.knee.value = 12;
      compressor.ratio.value = 3;
      compressor.attack.value = .008;
      compressor.release.value = .18;
      gain.connect(filter);
      filter.connect(compressor);
      compressor.connect(ctx.destination);
      setLevel();
    }
    if(ctx.state !== "running") await ctx.resume();
  }

  async function startTechno(){
    if(mode() !== "techno" || !technoEnabled() || document.hidden || scannerOpen()) return;
    await ensureContext();
    if(!timer){
      nextTime = ctx.currentTime+.035;
      schedule();
      timer = setInterval(schedule,LOOKAHEAD);
    }
    refreshUI();
  }

  async function stopTechno(){
    if(timer){ clearInterval(timer); timer = null; }
    nextTime = 0;
    for(const voice of voices){ try{ voice.stop(); }catch{} }
    voices.clear();
    if(ctx && ctx.state === "running"){
      try{ await ctx.suspend(); }catch{}
    }
    refreshUI();
  }

  async function setTechnoMode(){
    localStorage.setItem(MODE_KEY,"techno");
    localStorage.setItem(TECHNO_KEY,"1");
    localStorage.setItem(ORIGINAL_KEY,"0");
    try{ await window.PokEXMobile231?.stopMusic?.(); }catch{}
    try{ await startTechno(); }catch{}
    refreshUI();
  }

  async function setOriginalMode(){
    localStorage.setItem(MODE_KEY,"original");
    localStorage.setItem(TECHNO_KEY,"0");
    await stopTechno();
    localStorage.setItem(ORIGINAL_KEY,"1");
    try{ await window.PokEXMobile231?.startMusic?.(); }catch{}
    refreshUI();
  }

  async function toggleCurrent(){
    if(mode() !== "techno") return false;
    if(technoEnabled()){
      localStorage.setItem(TECHNO_KEY,"0");
      await stopTechno();
    }else{
      localStorage.setItem(TECHNO_KEY,"1");
      await startTechno();
    }
    refreshUI();
    return true;
  }

  function updateSync(){
    document.querySelectorAll(".v23-sync").forEach(row=>{
      const text = row.textContent.trim().toLowerCase();
      row.classList.toggle("is-synced", text.includes("sincronizado") && !text.includes("sincronizando"));
      row.classList.toggle("is-syncing", text.includes("sincronizando"));
      row.classList.toggle("is-pending", text.includes("pendiente"));
    });
  }

  function updateVersion(){
    document.querySelectorAll(".v23-stat").forEach(stat=>{
      if(stat.textContent.toLowerCase().includes("versión vista")){
        const strong = stat.querySelector("strong");
        if(strong && strong.textContent.trim() !== "v3.3") strong.textContent = "v3.3";
      }
    });
  }

  function wireMusic(){
    document.querySelectorAll(".v231-setting-line").forEach(line=>{
      if(!line.textContent.toLowerCase().includes("música de fondo")) return;
      line.classList.add("v33-music-line");
      const btn = line.querySelector(".v231-music-btn");
      if(!btn) return;

      let actions = line.querySelector(".v33-music-actions");
      if(!actions){
        actions = document.createElement("div");
        actions.className = "v33-music-actions";
        btn.parentNode.insertBefore(actions,btn);
        actions.appendChild(btn);
      }

      let techno = actions.querySelector(".v33-techno-btn");
      if(!techno){
        techno = document.createElement("button");
        techno.type = "button";
        techno.className = "v33-techno-btn";
        actions.appendChild(techno);
        techno.addEventListener("click",async e=>{
          e.preventDefault();
          e.stopPropagation();
          if(mode()==="techno") await setOriginalMode();
          else await setTechnoMode();
        });
      }

      if(!btn.dataset.v33TechnoWired){
        btn.dataset.v33TechnoWired = "1";
        btn.addEventListener("click",async e=>{
          if(mode() !== "techno") return;
          e.preventDefault();
          e.stopImmediatePropagation();
          await toggleCurrent();
        },true);
      }

      const subtitle = line.querySelector(".v23-muted");
      if(subtitle){
        const wanted = mode()==="techno" ? "Techno chiptune original · v3.3" : "Chiptune original · v3.3";
        if(subtitle.textContent.trim() !== wanted) subtitle.textContent = wanted;
      }
    });
  }

  function refreshUI(){
    updateSync();
    updateVersion();
    wireMusic();

    document.querySelectorAll(".v33-techno-btn").forEach(btn=>{
      const active = mode()==="techno";
      btn.classList.toggle("active",active);
      btn.textContent = active ? "🎮 Original" : "⚡ Techno";
      btn.setAttribute("aria-pressed",String(active));
    });

    if(mode()==="techno"){
      document.querySelectorAll(".v231-music-btn").forEach(btn=>{
        const on = technoEnabled();
        const wanted = on ? "🎵 Activada" : "🔇 Desactivada";
        if(btn.textContent !== wanted) btn.textContent = wanted;
        btn.classList.toggle("on",on);
        btn.setAttribute("aria-pressed",String(on));
      });
    }
  }

  let raf = 0;
  const observer = new MutationObserver(()=>{
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(refreshUI);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});

  document.addEventListener("input",e=>{
    if(e.target?.classList?.contains("v231-volume")){
      setLevel();
    }
  },true);

  document.addEventListener("visibilitychange",async()=>{
    if(mode()!=="techno" || !technoEnabled()) return;
    if(document.hidden) await stopTechno();
    else try{ await startTechno(); }catch{}
  });

  new MutationObserver(async()=>{
    if(mode()!=="techno" || !technoEnabled()) return;
    if(scannerOpen()) await stopTechno();
    else if(!document.hidden) try{ await startTechno(); }catch{}
  }).observe(document.body,{attributes:true,attributeFilter:["class"]});

  if(mode()==="techno" && technoEnabled()){
    localStorage.setItem(ORIGINAL_KEY,"0");
    const resume = async()=>{
      document.removeEventListener("pointerdown",resume,true);
      try{ await startTechno(); }catch{}
    };
    document.addEventListener("pointerdown",resume,true);
  }

  refreshUI();
})();
