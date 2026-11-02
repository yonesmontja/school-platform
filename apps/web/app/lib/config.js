// Alamat API dilihat dari browser. Bawaan "/api" diteruskan Next.js ke core-api (lihat next.config.mjs),
// sehingga aplikasi tetap berjalan lewat tunnel, domain sekolah, atau HP guru tanpa membuka port API.
// NEXT_PUBLIC_API_URL hanya perlu diisi bila API berada di domain lain.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/+$/, "");

// Asal berkas unggahan (/storage/...); kosong berarti domain yang sama dengan halaman
export const API_ORIGIN = API_URL.replace(/\/api$/, "");
