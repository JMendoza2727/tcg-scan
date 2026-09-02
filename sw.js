const VERSION = "3423";
const APP_CACHE = `pokex-app-${VERSION}`;
const DATA_CACHE = `pokex-data-${VERSION}`;
const SCANNER_CACHE = "pokex-scanner-v12";

const APP_SHELL = [
  "./","./index.html","./manifest.webmanifest?v=3423","./icon-192.png","./icon-512.png","./styles.css?v=3423",
  "./pokedex-v1.css?v=3423","./pokex-pokedex-layout-fix-v34.css?v=3423","./scanner-v11.css?v=3423","./pokex-bg.css?v=3423","./pokex-v22.css?v=3423","./pokex-auth-v23.css?v=3423","./pokex-mobile-v231.css?v=3423","./pokex-final-v24.css?v=3423","./pokex-polish-v321.css?v=3423","./pokex-friends-v33.css?v=3423","./pokex-account-polish-v33.css?v=3423","./pokex-ui-fix-v33.css?v=3423","./pokex-social-v34.css?v=3423",
  "./jp-extra-v21.js?v=3423","./en-images-v21.js?v=3423","./pokex-image-resolver-v241.js?v=3423","./pokex-image-fallback-v34.js?v=3423","./pokex-price-resolver-v30.js?v=3423","./pokex-scanner-result-fix-v34.js?v=3423","./app.js?v=3423","./pokedex-v1.js?v=3423","./pokex-card-flow-v34.js?v=3423","./pokex-scanner-quality-v34.js?v=3423","./scanner-v11.js?v=3423","./pokex-clean-v1.js?v=3423","./pokex-language-v1.js?v=3423","./pokex-bg.js?v=3423","./pokex-v22.js?v=3423","./pokex-shell-v34.js?v=3423","./pokex-release-v34.js?v=3423","./pokex-firebase-config.js?v=3423","./pokex-auth-v23.js?v=3423","./pokex-mobile-v231.js?v=3423","./pokex-friends-v33.js?v=3423","./pokex-friends-fix-v33.js?v=3423","./pokex-account-polish-v33.js?v=3423","./pokex-account-core-v33.js?v=3423","./pokex-social-v34.js?v=3423","./pokex-card-language-v34.js?v=3423"
];

self.addEventListener("install",event=>{event.waitUntil(caches.open(APP_CACHE).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith("pokex-app-")||key.startsWith("pokex-shell-")||key.startsWith("pokex-data-")||key.startsWith("pokex-scanner-"))&&key!==APP_CACHE&&key!==DATA_CACHE&&key!==SCANNER_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});

async function networkFirst(request){
  const cache=await caches.open(APP_CACHE);
  try{const freshRequest=new Request(request,{cache:"no-cache"});const response=await fetch(freshRequest);if(response.ok)await cache.put(request,response.clone());return response;}
  catch(err){const cached=await cache.match(request);if(cached)return cached;if(request.mode==="navigate")return cache.match("./index.html");throw err;}
}
async function cacheFirst(request,cacheName=DATA_CACHE){const cache=await caches.open(cacheName);const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.status===200)await cache.put(request,response.clone());return response;}

self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;
  const url=new URL(request.url);if(url.origin!==self.location.origin)return;
  if(url.pathname.includes("/scanner/")){
    const stable=url.pathname.includes("/scanner/assets/")||url.pathname.includes("/scanner/vendor/")||url.pathname.includes("/scanner/sounds/")||/\.(?:wasm|onnx|bin|f16)$/i.test(url.pathname);
    event.respondWith(stable?cacheFirst(request,SCANNER_CACHE):networkFirst(request));return;
  }
  const isInterface=request.mode==="navigate"||/\.(?:html|css|js|webmanifest)$/i.test(url.pathname);
  if(isInterface){event.respondWith(networkFirst(request));return;}
  if(/\.(?:json|png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname))event.respondWith(cacheFirst(request));
});