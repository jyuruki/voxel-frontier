/* eslint-disable -- generated from the production file list */
const root = self.registration.scope;
const prefix = 'northshire-offline:' + new URL(root).pathname + ':';
const cacheName = prefix + '9df078f3fb41115f';
const urls = ["art/northshire.webp","art/ui/BARLOW-OFL.txt","art/ui/CINZEL-OFL.txt","art/ui/CREDITS.txt","art/ui/barlow.ttf","art/ui/cinzel.ttf","art/ui/class-portraits.webp","art/ui/grain.png","art/world/CREDITS.txt","art/world/LICENSE-KayKit.txt","art/world/models/barbarian.glb","art/world/models/boar.glb","art/world/models/demon.glb","art/world/models/goblin.glb","art/world/models/knight.glb","art/world/models/mage.glb","art/world/models/rogue.glb","art/world/models/rogue_hooded.glb","art/world/models/wolf.glb","assets/index-Dw87Nvgr.css","assets/index-sYIP7Ykg.js","assets/three-CSaap00U.js","audio/CREDITS.txt","audio/ambience/birds.mp3","audio/ambience/stream.mp3","audio/fx/arcane-1.mp3","audio/fx/arcane-build.mp3","audio/fx/arcane-impact.mp3","audio/fx/bag.mp3","audio/fx/bandit-1.mp3","audio/fx/bandit-2.mp3","audio/fx/blade-1.mp3","audio/fx/blade-2.mp3","audio/fx/blade-3.mp3","audio/fx/blade-impact-1.mp3","audio/fx/blade-impact-2.mp3","audio/fx/coins-1.mp3","audio/fx/coins-2.mp3","audio/fx/coins-3.mp3","audio/fx/draw.mp3","audio/fx/drink.mp3","audio/fx/fire-1.mp3","audio/fx/fire-2.mp3","audio/fx/fire-build.mp3","audio/fx/fire-impact.mp3","audio/fx/foot-grass-1.mp3","audio/fx/foot-grass-2.mp3","audio/fx/foot-grass-3.mp3","audio/fx/foot-grass-4.mp3","audio/fx/foot-stone-1.mp3","audio/fx/foot-stone-2.mp3","audio/fx/foot-stone-3.mp3","audio/fx/gear.mp3","audio/fx/hit-1.mp3","audio/fx/hit-2.mp3","audio/fx/holy-1.mp3","audio/fx/holy-2.mp3","audio/fx/ice-1.mp3","audio/fx/ice-2.mp3","audio/fx/ice-build.mp3","audio/fx/ice-impact.mp3","audio/fx/imp.mp3","audio/fx/kobold-1.mp3","audio/fx/kobold-2.mp3","audio/fx/menu.mp3","audio/fx/page-1.mp3","audio/fx/page-2.mp3","audio/fx/reject.mp3","audio/fx/shade.mp3","audio/fx/shadow-1.mp3","audio/fx/shadow-build.mp3","audio/fx/teleport.mp3","audio/fx/victory.mp3","audio/fx/ward.mp3","audio/fx/wolf-1.mp3","audio/fx/wolf-2.mp3","audio/fx/wolf-3.mp3","audio/music/combat.mp3","audio/music/inn.mp3","audio/music/mine.mp3","audio/music/valley.mp3","credits.txt","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","index.html","manifest.webmanifest"].map(path => new URL(path,root).href);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  try { await cache.addAll(urls.map(url => new Request(url,{cache:'reload'}))); }
  catch (err) { await caches.delete(cacheName); throw err; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if(key.startsWith(prefix) && key!==cacheName) await caches.delete(key);
  await self.clients.claim();
})()));
async function mediaRange(response, range) {
  const match = /^bytes=([0-9]*)-([0-9]*)$/.exec(range);
  if(!match || (!match[1] && !match[2])) return response;
  const data = await response.arrayBuffer(), size = data.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0,size-Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size-1,Number(match[2])) : size-1;
  if(start>=size || start>end) return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
  return new Response(data.slice(start,end+1), {status:206,headers:{
    'Content-Type':response.headers.get('Content-Type')||'audio/mpeg',
    'Content-Range':'bytes '+start+'-'+end+'/'+size, 'Accept-Ranges':'bytes', 'Content-Length':String(end-start+1)
  }});
}
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||!event.request.url.startsWith(root)) return;
  const isShell=event.request.mode==='navigate' && [new URL(root).pathname, new URL('index.html',root).pathname].includes(new URL(event.request.url).pathname);
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    const cached=await cache.match(isShell ? new URL('index.html',root).href : event.request,{ignoreSearch:true});
    if(!cached) return fetch(event.request);
    const range=event.request.headers.get('Range');
    if(range && new URL(event.request.url).pathname.endsWith('.mp3')) return mediaRange(cached,range);
    return cached;
  })());
});