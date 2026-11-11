# API Render v1

API publik untuk membuat video motion graphic dari Scene JSON. Dipakai aplikasi luar, misalnya asisten AI **Muse**:
Muse menulis skrip dan Scene JSON, server ini merender MP4 dengan Revideo (lisensi MIT) dan mengembalikan tautan unduhnya.

- **Base URL:** `https://web.saprapor.com/api/v1`
- **Autentikasi:** kunci API dari menu **API Render → Kunci API** (khusus admin). Kirim lewat header
  `Authorization: Bearer srk_…` atau `X-API-Key: srk_…`. Kunci hanya ditampilkan sekali saat dibuat; simpan di Secure Vault, jangan di chat, file, atau kode.
- **Batas:** 60 permintaan/menit per kunci; `POST /renders` 10/menit; maksimal 5 job antre atau dirender per kunci.
- **Galat** selalu berbentuk `{"error": {"code": "...", "message": "...", "details": {...}}}`.

Tidak ada webhook. Pantau status dengan `GET /renders/{job_id}` berkala, misalnya tiap 30–60 detik.

## Endpoint

| Metode | Jalur | Keterangan |
|---|---|---|
| GET | `/templates` | Daftar templat (`maritime-50s`, `maritime-60s`), ukuran video, fps, dan jenis adegan yang didukung |
| GET | `/places?q=malaka&type=point\|region` | Cari tempat terverifikasi untuk adegan peta (maks. 50 hasil) |
| POST | `/renders` | Kirim Scene JSON. Balasan `202` berisi `job_id` dengan status `queued` |
| GET | `/renders/{job_id}` | Status, progres, peringatan, dan `video_url` bila sudah selesai |
| GET | `video_url` / `poster_url` | Tautan bertanda tangan, berlaku 7 hari, **tanpa** kunci API. Berkas disimpan 30 hari |

### Status job

`queued` → `rendering` → `done` | `failed`.

`progress` bernilai 0–1. Saat `rendering`, nilainya hanya **perkiraan** dari lama berjalan (`progress_is_estimate: true`).
Lama render kira-kira 5–10× durasi video untuk 1080×1920.

```json
{
  "job_id": "rnd_…", "status": "done", "progress": 1, "progress_is_estimate": false,
  "video_url": "https://web.saprapor.com/api/v1/renders/rnd_…/video?expires=…&signature=…",
  "poster_url": "…", "url_expires_at": "2026-11-18T…", "duration_sec": 52, "size_kb": 6400,
  "error": null, "warnings": ["audio.music bukan URL https (mis. asset://), jadi video dibuat tanpa musik latar."]
}
```

## Scene JSON

Formatnya mengikuti Bab 8 spesifikasi teknis v2. Kolom yang tidak dikenal disimpan dan diabaikan, misalnya `_notes`, `pillar`, dan `region`.

| Kolom | Wajib | Keterangan |
|---|---|---|
| `template` | ya | `maritime-50s` atau `maritime-60s` |
| `format.width` × `format.height` | ya | `1080×1920`, `1920×1080`, atau `1080×1080` |
| `format.fps` | – | hanya `30` |
| `format.durationSec` | ya | 5–180. Harus sama dengan `endSec` adegan terakhir |
| `scenes[]` | ya | 1–20 adegan, berurutan tanpa celah (`startSec` = `endSec` sebelumnya), maks. 40 detik per adegan |
| `voice` | – | nama suara Azure Neural (mis. `id-ID-ArdiNeural`) atau suara bawaan Gemini (mis. `Charon`, `Orus`, `Kore`) |
| `audio.narration` | – | URL **https** ke MP3/WAV/M4A/OGG (maks. 30 MB) untuk satu narasi utuh. Bila diisi, server tidak membuat suara |
| `audio.music`, `audio.musicVolume` | – | URL **https** musik latar (maks. 15 MB) dan volumenya (0–1). Musik otomatis diredam saat narasi |
| `sources[]` | – | `publisher` tampil di adegan penutup sebagai "Sumber: …" |

URL `asset://…` tidak bisa diambil server. Kolom seperti itu diabaikan dan dilaporkan di `warnings`.

### Jenis adegan

| `type` | Kolom | Tampilan |
|---|---|---|
| `hook` | `text`, `motion` | Label seri (dari `series` di adegan `closing`) dan teks besar |
| `map` | `bbox`, `places[]`, `markers[{place, icon}]`, `route[]` | Peta Natural Earth 10m: penanda berdenyut, label wilayah, dan rute beranimasi lewat laut |
| `fact` | `text` | Kartu kaca berlabel "FAKTA". Teks panjang mengecil otomatis |
| `twist` | `text`, `motion` | Label "TAPI…" dan teks yang muncul kata demi kata |
| `closing` | `question`, `series` | Pertanyaan untuk penonton, label seri, dan sumber |

Nilai `motion` yang dikenal: `fade-slide-up`, `twist-marker`, `fade`, `pop`, `words`. Nilai lain memakai animasi bawaan adegannya.

### Narasi

1. Bila `audio.narration` berupa URL https, berkas itu diputar dari detik 0.
2. Bila tidak, server membuat suara dari teks tiap adegan (`text`, atau `question` untuk `closing`), dengan urutan penyedia:
   **Azure Speech** (kunci & region di **Pengaturan → Suara Azure**) → **Gemini** (API key Gemini di Pengaturan; gaya narator berita,
   suara `Charon` kecuali `voice` menyebut suara Gemini lain) → suara lokal **Piper**. Penyedia yang dipakai dan alasannya tercantum di `warnings`.
3. Bila narasi suatu adegan lebih panjang dari durasinya, bacaan dipercepat sampai 25% (Azure; Gemini diminta bertempo agak cepat; Piper tidak). Bila masih tidak muat, **adegan diperpanjang** dan `duration_sec` hasil akhir bisa melebihi `durationSec`. Ini dilaporkan di `warnings`.
   Patokan kasar: ±2,5 kata per detik. Contohnya, hook 3 detik muat sekitar 7 kata.

### Gerbang verifikasi peta

Setiap nama di `bbox`, `places`, `markers[].place`, dan `route` harus ada di tabel tempat terverifikasi.
Nama dicocokkan dengan nama, nama lain, atau `code`, tanpa membedakan huruf besar dan kecil.
Bila ada satu saja yang tidak dikenal, `POST /renders` ditolak `422` dan nama-nama yang hilang disebutkan.
Tambahkan tempat baru di menu **API Render → Tempat peta** beserta sumber verifikasinya, atau cari yang sudah ada dengan `GET /places`.

- **Titik** (kota, pangkalan): satu koordinat.
- **Wilayah** (selat, laut, samudra): titik label dan `bbox` dari Natural Earth marine polys. Wilayah yang sangat luas (mis. Samudra Hindia) tidak dimasukkan ke bingkai. Di `route`, wilayah seperti itu menjadi **arah**: rute berhenti di tepi bingkai yang terjangkau lewat laut.
- Bingkai peta = gabungan `bbox`, semua titik, dan wilayah yang tidak terlalu luas, ditambah tepi 12%, lalu disesuaikan dengan rasio video.
- Rute dicari lewat laut sehingga tidak memotong daratan. Titik di darat, misalnya pangkalan di tepi pantai, digeser ke laut terdekat.

Data awal: 295 wilayah laut dan 418 kota (88–155° BT, 15° LS–22° LU) dari [Natural Earth](https://www.naturalearthdata.com/) (domain publik), ditambah Pangkalan Angkatan Laut Changi (1.31771, 104.01561), yang diverifikasi lewat geocoder pada 2026-11-11.

## Contoh

```bash
curl -s https://web.saprapor.com/api/v1/renders \
  -H "Authorization: Bearer $KUNCI" -H "Content-Type: application/json" \
  --data @roosevelt-50s-scene-test.json
# → 202 {"job_id":"rnd_…","status":"queued",…}

curl -s https://web.saprapor.com/api/v1/renders/rnd_… -H "Authorization: Bearer $KUNCI"
```

Kode galat: `unauthorized` (401), `not_found` (404), `validation_failed` (422, termasuk tempat peta yang belum terverifikasi),
`asset_unavailable` (422, URL narasi atau musik gagal diunduh), `queue_full` (429), dan `render_failed` (di `error` pada status job).
