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

  // 154 BPM aprox. Mantiene el motor ligero para iOS.
  const STEP = 60 / 154 / 4;
  const LOOKAHEAD = 330;
  const AHEAD = 0.78;

  const notes = {
    G2:98.00,A2:110.00,B2:123.47,C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196.00,A3:220.00,B3:246.94,
    C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392.00,A4:440.00,B4:493.88,
    C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99,A5:880.00,B5:987.77,
    C6:1046.50,D6:1174.66,E6:1318.51
  };

  // Hook original PokEX: eurotrance/makina 2000, emotivo y ascendente.
  const lead = [
    "A4",null,"E5","E5", "D5",null,"C5","D5",
    "E5",null,"A5","G5", "E5","D5","C5",null,
    "C5",null,"G5","G5", "E5",null,"D5","E5",
    "G5",null,"C6","B5", "G5","E5","D5",null,

    "F5",null,"A5","A5", "G5",null,"F5","E5",
    "D5",null,"F5","G5", "A5","G5","E5",null,
    "E5",null,"G5","A5", "C6",null,"B5","A5",
    "G5","A5","B5","C6", "B5","G5","E5",null,

    "A5",null,"A5","C6", "B5",null,"A5","G5",
    "E5",null,"G5","A5", "B5","A5","G5",null,
    "C6",null,"B5","A5", "G5",null,"E5","G5",
    "A5","B5","C6","B5", "A5","G5","E5",null
  ];

  const bassRoots = ["A2","C3","F3","G2","A2","F3"];
  const arp = [
    ["A3","C4","E4","A4"],
    ["C4","E4","G4","C5"],
    ["F3","A3","C4","F4"],
    ["G3","B3","D4","G4"],
    ["A3","E4","A4","C5"],
    ["F3","C4","F4","A4"]
  ];

  const mode = () => localStorage.getItem(MODE_KEY) || "original";
  const technoEnabled = () => localStorage.getItem(TECHNO_KEY) === "1";
  const volume = () => Math.max(0, Math.min(100, Number(localStorage.getItem(VOLUME_KEY) ?? 18)));

  function scannerOpen(){ return document.body.classList.contains("cv11-camera-open"); }

  function setLevel(){
    if(!gain || !ctx) return;
    gain.gain.setTargetAtTime(0.125 * (volume()/100), ctx.currentTime, 0.05);
  }

  function tone(freq,duration,when,type="square",level=.08,detune=0){
    if(!ctx || !gain || ctx.state!=="running" || !freq) return;
    const t=Math.max(ctx.currentTime,when);
    const osc=ctx.createOscillator();
    const g=ctx.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(freq,t);
    osc.detune.setValueAtTime(detune,t);
    g.gain.setValueAtTime(.0001,t);
    g.gain.linearRampToValueAtTime(level,t+.005);
    g.gain.exponentialRampToValueAtTime(Math.max(.0001,level*.36),t+duration*.62);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(g); g.connect(gain);
    osc.start(t); osc.stop(t+duration+.018);
    voices.add(osc);
    osc.addEventListener("ended",()=>voices.delete(osc),{once:true});
  }

  function kick(when){
    tone(57,.072,when,"sine",.092);
    tone(126,.026,when,"triangle",.028);
  }

  function tick(when){
    const s=step%lead.length;
    const bar=s%16;
    const section=Math.floor(s/16)%6;
    const n=lead[s];

    // Lead supersaw simulado con solo dos osciladores para ahorrar CPU.
    if(n){
      tone(notes[n],.142,when,"sawtooth",.048,-5);
      tone(notes[n],.130,when+.003,"square",.035,6);
    }

    // Arpegio brillante continuo.
    const an=arp[section][s%4];
    tone(notes[an],.067,when+.009,"triangle",.027);

    // Four-on-the-floor.
    if(bar%4===0) kick(when);

    // Bajo makina a contratiempo.
    if(bar%4===2) tone(notes[bassRoots[section]],.132,when+.007,"sawtooth",.058);

    // Hat corto en contratiempo.
    if(bar%2===1) tone(3500,.010,when+.003,"square",.0045);

    // Stabs que refuerzan la subida sin añadir muchas voces.
    if(bar===6 || bar===14){
      const stab=["E5","G5","A5","D5","E5","C5"][section];
      tone(notes[stab],.050,when,"square",.015);
    }

    // Pequeño fill antes del siguiente compás.
    if(bar===15){
      tone(notes.B5,.030,when,"square",.010);
      tone(notes.C6,.025,when+STEP*.45,"square",.008);
    }
    step++;
  }

  function schedule(){
    if(!ctx || ctx.state!=="running" || mode()!=="techno" || !technoEnabled()) return;
    const now=ctx.currentTime;
    if(!nextTime || nextTime<now-STEP) nextTime=now+.03;
    while(nextTime<now+AHEAD){ tick(nextTime); nextTime+=STEP; }
  }

  async function ensureContext(){
    if(!ctx){
      ctx=new (window.AudioContext||window.webkitAudioContext)();
      gain=ctx.createGain();
      filter=ctx.createBiquadFilter();
      compressor=ctx.createDynamicsCompressor();
      filter.type="lowpass"; filter.frequency.value=5400; filter.Q.value=.72;
      compressor.threshold.value=-21; compressor.knee.value=12; compressor.ratio.value=3.2;
      compressor.attack.value=.007; compressor.release.value=.15;
      gain.connect(filter); filter.connect(compressor); compressor.connect(ctx.destination);
      setLevel();
    }
    if(ctx.state!=="running") await ctx.resume();
  }

  async function startTechno(){
    if(mode()!=="techno" || !technoEnabled() || document.hidden || scannerOpen()) return;
    await ensureContext();
    if(!timer){
      nextTime=ctx.currentTime+.03; schedule(); timer=setInterval(schedule,LOOKAHEAD);
    }
    refreshUI();
  }

  async function stopTechno(){
    if(timer){ clearInterval(timer); timer=null; }
    nextTime=0;
    for(const voice of voices){ try{voice.stop();}catch{} }
    voices.clear();
    if(ctx && ctx.state==="running"){ try{await ctx.suspend();}catch{} }
    refreshUI();
  }

  async function setTechnoMode(){
    localStorage.setItem(MODE_KEY,"techno"); localStorage.setItem(TECHNO_KEY,"1"); localStorage.setItem(ORIGINAL_KEY,"0");
    step=0;
    try{await window.PokEXMobile231?.stopMusic?.();}catch{}
    try{await startTechno();}catch{}
    refreshUI();
  }

  async function setOriginalMode(){
    localStorage.setItem(MODE_KEY,"original"); localStorage.setItem(TECHNO_KEY,"0");
    await stopTechno(); localStorage.setItem(ORIGINAL_KEY,"1");
    try{await window.PokEXMobile231?.startMusic?.();}catch{}
    refreshUI();
  }

  async function toggleCurrent(){
    if(mode()!=="techno") return false;
    if(technoEnabled()){ localStorage.setItem(TECHNO_KEY,"0"); await stopTechno(); }
    else { localStorage.setItem(TECHNO_KEY,"1"); step=0; await startTechno(); }
    refreshUI(); return true;
  }

  function updateSync(){
    document.querySelectorAll(".v23-sync").forEach(row=>{
      const text=row.textContent.trim().toLowerCase();
      row.classList.toggle("is-synced",text.includes("sincronizado")&&!text.includes("sincronizando"));
      row.classList.toggle("is-syncing",text.includes("sincronizando"));
      row.classList.toggle("is-pending",text.includes("pendiente"));
    });
  }

  function wireMusic(){
    document.querySelectorAll(".v231-setting-line").forEach(line=>{
      if(!line.textContent.toLowerCase().includes("música de fondo")) return;
      line.classList.add("v33-music-line");
      const btn=line.querySelector(".v231-music-btn"); if(!btn) return;
      let actions=line.querySelector(".v33-music-actions");
      if(!actions){ actions=document.createElement("div"); actions.className="v33-music-actions"; btn.parentNode.insertBefore(actions,btn); actions.appendChild(btn); }
      let techno=actions.querySelector(".v33-techno-btn");
      if(!techno){
        techno=document.createElement("button"); techno.type="button"; techno.className="v33-techno-btn"; actions.appendChild(techno);
        techno.addEventListener("click",async e=>{ e.preventDefault(); e.stopPropagation(); if(mode()==="techno") await setOriginalMode(); else await setTechnoMode(); });
      }
      if(!btn.dataset.v33TechnoWired){
        btn.dataset.v33TechnoWired="1";
        btn.addEventListener("click",async e=>{ if(mode()!=="techno") return; e.preventDefault(); e.stopImmediatePropagation(); await toggleCurrent(); },true);
      }
      const subtitle=line.querySelector(".v23-muted");
      if(subtitle){ const wanted=mode()==="techno"?"Techno makina · v3.3":"Chiptune original · v3.3"; if(subtitle.textContent.trim()!==wanted) subtitle.textContent=wanted; }
    });
  }

  function refreshUI(){
    updateSync(); wireMusic();
    document.querySelectorAll(".v33-techno-btn").forEach(btn=>{
      const active=mode()==="techno"; btn.classList.toggle("active",active); btn.textContent=active?"🎮 Original":"⚡ Techno"; btn.setAttribute("aria-pressed",String(active));
    });
    if(mode()==="techno") document.querySelectorAll(".v231-music-btn").forEach(btn=>{
      const on=technoEnabled(); const wanted=on?"🎵 Activada":"🔇 Desactivada"; if(btn.textContent!==wanted) btn.textContent=wanted; btn.classList.toggle("on",on); btn.setAttribute("aria-pressed",String(on));
    });
  }

  let raf=0;
  const observer=new MutationObserver(()=>{ cancelAnimationFrame(raf); raf=requestAnimationFrame(refreshUI); });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  document.addEventListener("input",e=>{ if(e.target?.classList?.contains("v231-volume")) setLevel(); },true);
  document.addEventListener("visibilitychange",async()=>{
    if(mode()!=="techno"||!technoEnabled()) return;
    if(document.hidden) await stopTechno(); else try{await startTechno();}catch{}
  });
  new MutationObserver(async()=>{
    if(mode()!=="techno"||!technoEnabled()) return;
    if(scannerOpen()) await stopTechno(); else if(!document.hidden) try{await startTechno();}catch{}
  }).observe(document.body,{attributes:true,attributeFilter:["class"]});
  if(mode()==="techno"&&technoEnabled()){
    localStorage.setItem(ORIGINAL_KEY,"0");
    const resume=async()=>{ document.removeEventListener("pointerdown",resume,true); try{await startTechno();}catch{} };
    document.addEventListener("pointerdown",resume,true);
  }
  refreshUI();
})();
