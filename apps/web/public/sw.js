// Service worker EduRapor: aplikasi tetap bisa dibuka & dipakai mengisi nilai/jurnal saat sinyal putus.
// - Aset Next.js (/_next/static, nama berisi hash) → cache dulu; tidak pernah basi karena tiap versi beda nama.
// - Halaman & data GET /api → jaringan dulu (selalu versi terbaru saat online), salinan terakhir saat offline.
// - Kiriman (POST/PUT) tidak disentuh di sini; yang gagal karena offline diantrekan halaman (app/lib/antrean.js).
const VERSI = "v2";
const OFFLINE = "/offline.html";
const CACHE_DASAR = `edurapor-dasar-${VERSI}`;
const CACHE_STATIS = "edurapor-statis";
const CACHE_HALAMAN = "edurapor-halaman";
const CACHE_API = "edurapor-api";
const MAKS_STATIS = 400;
const MAKS_API = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_DASAR).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const tetap = [CACHE_DASAR, CACHE_STATIS, CACHE_HALAMAN, CACHE_API];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !tetap.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Batasi jumlah entri (yang paling lama disimpan dibuang lebih dulu)
async function pangkas(nama, maks) {
  const cache = await caches.open(nama);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maks; i++) await cache.delete(keys[i]);
}

async function cacheDulu(request) {
  const ada = await caches.match(request, { cacheName: CACHE_STATIS });
  if (ada) return ada;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(CACHE_STATIS);
    await cache.put(request, res.clone());
    pangkas(CACHE_STATIS, MAKS_STATIS);
  }
  return res;
}

// Kunci cache data API memuat token agar salinan satu akun tidak terbaca akun lain di HP yang sama
function kunciApi(request) {
  const token = request.headers.get("Authorization") || "";
  const url = new URL(request.url);
  url.searchParams.set("__sesi", token.slice(-16));
  return url.toString();
}

async function jaringanDulu(request, namaCache, kunci = request, maks = 0) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(namaCache);
      await cache.put(kunci, res.clone());
      if (maks) pangkas(namaCache, maks);
    }
    return res;
  } catch (err) {
    const salinan = await caches.match(kunci, { cacheName: namaCache, ignoreVary: true });
    if (salinan) return salinan;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheDulu(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    // Hanya data yang dibaca dengan login; berkas unduhan & ekspor tidak disimpan
    if (!request.headers.get("Authorization") || url.pathname.startsWith("/api/log-aktivitas")) return;
    event.respondWith(jaringanDulu(request, CACHE_API, kunciApi(request), MAKS_API));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      jaringanDulu(request, CACHE_HALAMAN, url.pathname).catch(async () => (await caches.match(OFFLINE)) || Response.error())
    );
    return;
  }
  // Data halaman saat pindah menu di dalam aplikasi (RSC Next.js)
  if (request.headers.get("RSC") === "1") {
    const kunci = url.pathname + "?rsc";
    event.respondWith(jaringanDulu(request, CACHE_HALAMAN, kunci));
  }
});

// Klik notifikasi perangkat: fokuskan jendela aplikasi yang terbuka atau buka tautannya
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard/notifikasi";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const ada = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (ada) return ada.focus().then((c) => c.navigate?.(url));
      return self.clients.openWindow(url);
    })
  );
});
