"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { MenuAksi, aksiHapus, aksiUbah } from "@/components/dashboard/menuAksi";

const STATUS = { queued: ["Antre", "secondary"], rendering: ["Dirender", "info"], done: ["Selesai", "success"], failed: ["Gagal", "danger"] };
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const waktu = (t) => (t ? new Date(t).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "–");
const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2500 });

/** API Render (admin): kunci API untuk aplikasi luar (mis. Muse), riwayat job render, dan tabel tempat peta terverifikasi. */
export default function ApiRenderPage() {
  const [tab, setTab] = useState("kunci");
  const [data, setData] = useState(null);
  const muat = useCallback(() => minta("GET", "/render-api").then(setData).catch((e) => Swal.fire("Gagal memuat", e.message, "error")), []);
  useEffect(() => { muat(); }, [muat]);
  // Segarkan selama ada job yang masih antre atau dirender
  useEffect(() => {
    if (!data?.job?.some((j) => ["queued", "rendering"].includes(j.status))) return undefined;
    const t = setInterval(muat, 10000);
    return () => clearInterval(t);
  }, [data, muat]);

  return (
    <div className="container-fluid mt-3 mb-5" style={{ maxWidth: 1000 }}>
      <h3 className="fw-bold text-primary mb-1"><i className="bi bi-broadcast me-2"></i>API Render</h3>
      <p className="text-muted small mb-3">
        Aplikasi luar (mis. asisten AI Muse) mengirim Scene JSON ke <code>{data?.endpoint || "…/api/v1"}</code> lalu mengambil MP4 hasilnya.
        Video API terpisah dari Video Belajar sekolah dan dirender dengan mesin Revideo. Panduan lengkap untuk developer ada di <code>docs/API-RENDER-V1.md</code>.
      </p>
      <ul className="nav nav-tabs mb-3">
        {[["kunci", "Kunci API", "bi-key"], ["job", "Riwayat render", "bi-film"], ["tempat", "Tempat peta", "bi-geo-alt"]].map(([id, label, ikon]) => (
          <li key={id} className="nav-item"><button type="button" className={`nav-link ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}><i className={`bi ${ikon} me-1`}></i>{label}</button></li>
        ))}
      </ul>
      {!data ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : tab === "kunci" ? <TabKunci data={data} muat={muat} />
        : tab === "job" ? <TabJob data={data} muat={muat} />
        : <TabTempat />}
    </div>
  );
}

function TabKunci({ data, muat }) {
  const buat = async () => {
    const r = await Swal.fire({ title: "Kunci API baru", input: "text", inputLabel: "Nama aplikasi", inputPlaceholder: "mis. Muse", showCancelButton: true, confirmButtonText: "Buat", cancelButtonText: "Batal",
      inputValidator: (v) => (!v?.trim() ? "Isi nama aplikasinya." : undefined) });
    if (!r.isConfirmed) return;
    try {
      const x = await minta("POST", "/render-api/klien", { nama: r.value.trim() });
      await Swal.fire({
        title: "Salin kunci ini sekarang", icon: "warning", confirmButtonText: "Sudah saya simpan",
        html: `<p class="small">Kunci hanya ditampilkan sekali. Masukkan ke Secure Vault aplikasi tujuan; jangan ditempel di chat.</p>
          <input id="kunciBaru" class="form-control font-monospace" readonly value="${esc(x.kunci)}" onfocus="this.select()">
          <button type="button" id="salinKunci" class="btn btn-sm btn-outline-primary mt-2"><i class="bi bi-clipboard me-1"></i>Salin</button>`,
        didOpen: () => document.getElementById("salinKunci").addEventListener("click", () => navigator.clipboard?.writeText(x.kunci).then(() => toast("Kunci disalin"))),
      });
      muat();
    } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const ubah = async (k, aktif) => { try { const x = await minta("PATCH", `/render-api/klien/${k.id}`, { aktif }); toast(x.message); muat(); } catch (e) { Swal.fire("Gagal", e.message, "error"); } };
  const hapus = async (k) => {
    if (!(await Swal.fire({ title: `Hapus kunci ${k.nama}?`, text: "Aplikasi itu tidak bisa memakai API lagi, dan semua hasil render-nya ikut dihapus.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" })).isConfirmed) return;
    try { const x = await minta("DELETE", `/render-api/klien/${k.id}`); toast(x.message); muat(); } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  return (
    <div>
      <div className="d-flex mb-2"><button className="btn btn-primary ms-auto" onClick={buat}><i className="bi bi-plus-lg me-1"></i>Buat kunci API</button></div>
      {!data.klien.length ? <div className="text-center text-muted py-5"><i className="bi bi-key fs-1 d-block mb-2"></i>Belum ada kunci. Buat satu untuk aplikasi yang akan memakai API Render.</div> : (
        <div className="list-group">
          {data.klien.map((k) => (
            <div key={k.id} className="list-group-item d-flex align-items-center gap-2 kartu-kunci">
              <i className={`bi bi-key-fill fs-4 ${k.aktif ? "text-primary" : "text-muted"}`}></i>
              <div className="me-auto min-w-0">
                <div className="fw-semibold">{k.nama} {!k.aktif && <span className="badge text-bg-secondary fw-normal">nonaktif</span>}</div>
                <div className="small text-muted"><code>{k.awalan}…</code> · {k.jumlah_job} render · dipakai terakhir {waktu(k.terakhir_dipakai)}</div>
              </div>
              <MenuAksi label={`Aksi untuk ${k.nama}`} items={[
                { label: k.aktif ? "Nonaktifkan" : "Aktifkan", ikon: k.aktif ? "bi-pause-circle" : "bi-play-circle", onClick: () => ubah(k, !k.aktif) },
                aksiHapus(() => hapus(k)),
              ]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabJob({ data, muat }) {
  const hapus = async (j) => {
    if (!(await Swal.fire({ title: "Hapus job render ini?", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" })).isConfirmed) return;
    try { const x = await minta("DELETE", `/render-api/job/${j.id}`); toast(x.message); muat(); } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  if (!data.job.length) return <div className="text-center text-muted py-5"><i className="bi bi-film fs-1 d-block mb-2"></i>Belum ada render dari API.</div>;
  return (
    <div className="list-group">
      {data.job.map((j) => {
        const [label, warna] = STATUS[j.status] || [j.status, "secondary"];
        return (
          <div key={j.id} className="list-group-item kartu-job">
            <div className="d-flex align-items-center gap-2">
              <div className="me-auto min-w-0">
                <div className="fw-semibold text-truncate">{j.episode || j.id}</div>
                <div className="small text-muted">{j.klien} · {j.templat} · {waktu(j.created_at)}{j.durasi_detik ? ` · ${j.durasi_detik} detik` : ""}{j.ukuran_kb ? ` · ${(j.ukuran_kb / 1024).toFixed(1)} MB` : ""}</div>
              </div>
              <span className={`badge text-bg-${warna}`}>{j.status === "rendering" && <span className="spinner-border spinner-border-sm me-1" style={{ width: ".7rem", height: ".7rem" }}></span>}{label}</span>
              <MenuAksi label={`Aksi untuk ${j.episode || j.id}`} items={[
                { label: "Putar / unduh", ikon: "bi-play-circle", tampil: !!j.video_url, onClick: () => window.open(j.video_url, "_blank", "noopener") },
                { label: "Salin job_id", ikon: "bi-clipboard", onClick: () => navigator.clipboard?.writeText(j.id).then(() => toast("job_id disalin")) },
                aksiHapus(() => hapus(j), j.status !== "rendering"),
              ]} />
            </div>
            {j.pesan && j.status === "failed" && <div className="small text-danger mt-1"><i className="bi bi-x-circle me-1"></i>{j.pesan}</div>}
            {j.peringatan?.length > 0 && (
              <details className="small mt-1"><summary className="text-warning-emphasis">{j.peringatan.length} peringatan</summary>
                <ul className="mb-0">{j.peringatan.map((w, i) => <li key={i}>{w}</li>)}</ul></details>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabTempat() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const urutan = useRef(0);
  const muat = useCallback((cari) => {
    const ke = ++urutan.current;
    minta("GET", `/render-api/tempat?q=${encodeURIComponent(cari)}`).then((r) => ke === urutan.current && setRes(r)).catch((e) => Swal.fire("Gagal", e.message, "error"));
  }, []);
  useEffect(() => { const t = setTimeout(() => muat(q), 250); return () => clearTimeout(t); }, [q, muat]);

  const form = async (t) => {
    const r = await Swal.fire({
      title: t ? "Ubah tempat" : "Tambah tempat terverifikasi", width: 560, showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <label class="form-label mb-1" for="tpNama">Nama</label><input id="tpNama" class="form-control mb-2" value="${esc(t?.nama)}">
        <label class="form-label mb-1" for="tpAlias">Nama lain (pisahkan dengan koma)</label><input id="tpAlias" class="form-control mb-2" value="${esc((t?.alias || []).join(", "))}">
        <div class="row g-2 mb-2"><div class="col-4"><label class="form-label mb-1" for="tpJenis">Jenis</label><select id="tpJenis" class="form-select">
          <option value="titik"${t?.jenis !== "wilayah" ? " selected" : ""}>Titik</option><option value="wilayah"${t?.jenis === "wilayah" ? " selected" : ""}>Wilayah</option></select></div>
          <div class="col-4"><label class="form-label mb-1" for="tpLat">Lintang</label><input id="tpLat" type="number" step="any" class="form-control" value="${esc(t?.lat)}"></div>
          <div class="col-4"><label class="form-label mb-1" for="tpLon">Bujur</label><input id="tpLon" type="number" step="any" class="form-control" value="${esc(t?.lon)}"></div></div>
        <label class="form-label mb-1" for="tpBbox">Kotak wilayah (barat, selatan, timur, utara), khusus wilayah</label><input id="tpBbox" class="form-control mb-2" placeholder="95.45, 0.69, 103.5, 8.34" value="${esc((t?.bbox || []).join(", "))}">
        <label class="form-label mb-1" for="tpSumber">Sumber verifikasi</label><input id="tpSumber" class="form-control" placeholder="mis. geocoder, peta BIG, dokumen resmi" value="${esc(t?.sumber)}"></div>`,
      preConfirm: () => {
        const v = (id) => document.getElementById(id).value.trim();
        const bbox = v("tpBbox") ? v("tpBbox").split(",").map((x) => Number(x.trim())) : null;
        const isi = { nama: v("tpNama"), alias: v("tpAlias") ? v("tpAlias").split(",").map((x) => x.trim()).filter(Boolean) : [], jenis: v("tpJenis"),
          lat: Number(v("tpLat")), lon: Number(v("tpLon")), bbox, sumber: v("tpSumber") };
        if (!isi.nama || !v("tpLat") || !v("tpLon") || !isi.sumber) { Swal.showValidationMessage("Isi nama, lintang, bujur, dan sumber verifikasi."); return false; }
        if (bbox && (bbox.length !== 4 || bbox.some(Number.isNaN))) { Swal.showValidationMessage("Kotak wilayah berisi 4 angka."); return false; }
        return isi;
      },
    });
    if (!r.isConfirmed) return;
    try { const x = await minta(t ? "PUT" : "POST", t ? `/render-api/tempat/${t.id}` : "/render-api/tempat", r.value); toast(x.message); muat(q); }
    catch (e) { Swal.fire("Belum bisa", e.message, "warning"); }
  };
  const hapus = async (t) => {
    if (!(await Swal.fire({ title: `Hapus ${t.nama}?`, text: "Payload yang menyebut tempat ini akan ditolak sampai ditambahkan lagi.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" })).isConfirmed) return;
    try { const x = await minta("DELETE", `/render-api/tempat/${t.id}`); toast(x.message); muat(q); } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };

  return (
    <div>
      <p className="small text-muted">
        Gerbang verifikasi peta: adegan peta hanya boleh menyebut tempat di tabel ini (nama, nama lain, atau kode). Data awal dari Natural Earth (wilayah laut dan kota sekitar Asia Tenggara) ditambah koordinat yang diverifikasi manual.
      </p>
      <div className="d-flex flex-wrap gap-2 mb-2">
        <input type="search" className="form-control" style={{ maxWidth: 320 }} placeholder="Cari tempat, mis. Natuna" aria-label="Cari tempat" value={q} onChange={(e) => setQ(e.target.value)} />
        {res && <span className="small text-muted align-self-center">{res.total} tempat terverifikasi</span>}
        <button className="btn btn-primary ms-auto" onClick={() => form(null)}><i className="bi bi-plus-lg me-1"></i>Tambah tempat</button>
      </div>
      {!res ? <div className="text-muted small">Memuat…</div> : !res.data.length ? <div className="text-center text-muted py-4">Tidak ada tempat yang cocok. Tambahkan bila koordinatnya sudah diverifikasi.</div> : (
        <div className="list-group">
          {res.data.map((t) => (
            <div key={t.id} className="list-group-item d-flex align-items-center gap-2 kartu-tempat">
              <i className={`bi ${t.jenis === "wilayah" ? "bi-water" : "bi-geo-alt-fill"} text-primary`}></i>
              <div className="me-auto min-w-0">
                <div className="fw-semibold">{t.nama} <code className="small fw-normal">{t.kode}</code></div>
                <div className="small text-muted text-truncate">{Number(t.lat).toFixed(4)}, {Number(t.lon).toFixed(4)}{t.negara ? ` · ${t.negara}` : ""} · {t.sumber}</div>
              </div>
              <MenuAksi label={`Aksi untuk ${t.nama}`} items={[aksiUbah(() => form(t)), aksiHapus(() => hapus(t))]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
