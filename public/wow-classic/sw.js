/* eslint-disable -- generated from the production file list */
const root = self.registration.scope;
const prefix = 'northshire-offline:' + new URL(root).pathname + ':';
const cacheName = prefix + '97aad7115d36adf7';
const urls = ["art/northshire.webp","art/ui/BARLOW-OFL.txt","art/ui/CINZEL-OFL.txt","art/ui/CREDITS.txt","art/ui/barlow.ttf","art/ui/cinzel.ttf","art/ui/class-portraits.webp","art/ui/grain.png","assets/index-DHhHPGfV.js","assets/index-Dr8h9MUZ.css","assets/three-D9tVpnAa.js","audio/License.txt","audio/confirmation_002.ogg","audio/drop_003.ogg","audio/error_002.ogg","audio/scroll_002.ogg","audio/select_002.ogg","credits.txt","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","index.html","manifest.webmanifest"].map(path => new URL(path,root).href);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  try { await cache.addAll(urls.map(url => new Request(url,{cache:'reload'}))); }
  catch (err) { await caches.delete(cacheName); throw err; }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if(key.startsWith(prefix) && key!==cacheName) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||!event.request.url.startsWith(root)) return;
  const isShell=event.request.mode==='navigate' && [new URL(root).pathname, new URL('index.html',root).pathname].includes(new URL(event.request.url).pathname);
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    return await cache.match(isShell ? new URL('index.html',root).href : event.request,{ignoreSearch:true}) || fetch(event.request);
  })());
});