// Service worker EduRapor.
// Sengaja minimal: aset aplikasi TIDAK di-cache agar tampilan selalu versi terbaru (menghindari skrip basi).
// Yang disediakan: halaman offline saat koneksi putus, dan notifikasi perangkat yang dikirim dari halaman.
const CACHE = "edurapor-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Hanya navigasi halaman yang ditangani: coba jaringan, bila gagal tampilkan halaman offline
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
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
