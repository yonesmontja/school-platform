"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { InfoBox } from "@adminlte/react";
import { ChartCanvas } from "@/components/dashboard/ChartCard";
import { API_URL, ROLE_LABEL, authHeaders, bacaUser } from "@/app/lib/akses";

// ================= KAMUS TAMPILAN =================
const KATEGORI = {
  AUTH: { label: "Autentikasi", warna: "primary", hex: "#3b82f6", ikon: "bi-key" },
  DATA: { label: "Perubahan Data", warna: "success", hex: "#10b981", ikon: "bi-database-gear" },
  OUTPUT: { label: "Output", warna: "warning", hex: "#f59e0b", ikon: "bi-box-arrow-up-right" },
  SISTEM: { label: "Sistem", warna: "dark", hex: "#64748b", ikon: "bi-cpu" },
  NAVIGASI: { label: "Navigasi", warna: "secondary", hex: "#a5b4c3", ikon: "bi-compass" },
};
const AKSI = {
  LOGIN: { label: "Login", ikon: "bi-box-arrow-in-right", warna: "success" },
  LOGIN_GAGAL: { label: "Login gagal", ikon: "bi-shield-exclamation", warna: "danger" },
  LOGOUT: { label: "Logout", ikon: "bi-box-arrow-right", warna: "secondary" },
  GANTI_SANDI: { label: "Ganti sandi", ikon: "bi-key", warna: "warning" },
  RESET_SANDI: { label: "Reset sandi", ikon: "bi-key-fill", warna: "warning" },
  TAMBAH: { label: "Tambah", ikon: "bi-plus-circle", warna: "success" },
  UBAH: { label: "Ubah", ikon: "bi-pencil-square", warna: "warning" },
  HAPUS: { label: "Hapus", ikon: "bi-trash3", warna: "danger" },
  SIMPAN: { label: "Simpan", ikon: "bi-floppy", warna: "primary" },
  IMPORT: { label: "Import", ikon: "bi-file-earmark-arrow-up", warna: "info" },
  EKSPOR: { label: "Ekspor", ikon: "bi-download", warna: "info" },
  CETAK: { label: "Cetak", ikon: "bi-printer", warna: "dark" },
  KIRIM_WA: { label: "WhatsApp", ikon: "bi-whatsapp", warna: "success" },
  SUSUN_PESAN: { label: "Susun pesan", ikon: "bi-chat-text", warna: "info" },
  SALIN: { label: "Salin", ikon: "bi-clipboard", warna: "secondary" },
  AI: { label: "AI", ikon: "bi-stars", warna: "primary" },
  BUKA_HALAMAN: { label: "Buka halaman", ikon: "bi-compass", warna: "secondary" },
  OTOMATIS: { label: "Otomatis", ikon: "bi-cpu", warna: "dark" },
};
const aksiInfo = (a) => AKSI[a] || { label: a, ikon: "bi-dot", warna: "secondary" };
const KATEGORI_BAWAAN = ["AUTH", "DATA", "OUTPUT", "SISTEM"]; // navigasi disembunyikan bawaan karena sangat banyak
const PRESET = [
  { id: "hari", label: "Hari ini", hari: 0 },
  { id: "7", label: "7 hari", hari: 6 },
  { id: "30", label: "30 hari", hari: 29 },
  { id: "kustom", label: "Kustom" },
];

// ================= UTILITAS =================
const tgl = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mundur = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return tgl(d); };
const parseWaktu = (w) => new Date(String(w).replace(" ", "T"));
const jam = (w) => parseWaktu(w).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const tanggalPanjang = (w) => parseWaktu(w).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const lalu = (w) => {
  const dtk = Math.round((Date.now() - parseWaktu(w)) / 1000);
  if (dtk < 60) return "baru saja";
  if (dtk < 3600) return `${Math.floor(dtk / 60)} menit lalu`;
  if (dtk < 86400) return `${Math.floor(dtk / 3600)} jam lalu`;
  return `${Math.floor(dtk / 86400)} hari lalu`;
};
const inisial = (nama) => String(nama || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((k) => k[0]).join("").toUpperCase();
const WARNA_AVATAR = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];
const warnaAvatar = (id) => WARNA_AVATAR[(Number(id) || 0) % WARNA_AVATAR.length];
const perangkat = (ua) => {
  const s = String(ua || "");
  if (!s) return { label: "—", ikon: "bi-question-circle" };
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "Peramban lain";
  const os = /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iOS" : /Windows/.test(s) ? "Windows" : /Mac OS/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "";
  const hp = /Mobile|Android|iPhone/.test(s);
  return { label: `${browser}${os ? ` · ${os}` : ""}`, ikon: hp ? "bi-phone" : "bi-laptop" };
};
const namaKolom = (k) => k.replace(/^id_/, "ID ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const tampilNilai = (v) => (v === null || v === undefined || v === "" ? null : typeof v === "object" ? JSON.stringify(v) : String(v));
const namaPengguna = (l) => l.nama_user || l.meta?.identitas || "Sistem";

async function ambil(path, params) {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null))}` : "";
  const res = await fetch(`${API_URL}${path}${qs}`, { headers: authHeaders(false) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Gagal memuat data");
  return data;
}

// ================= KOMPONEN KECIL =================
const Avatar = ({ nama, id, size = 34 }) => (
  <span className="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-semibold flex-shrink-0"
    style={{ width: size, height: size, fontSize: size * 0.38, background: id ? warnaAvatar(id) : "#94a3b8" }} aria-hidden="true">
    {id ? inisial(nama) : <i className="bi bi-cpu"></i>}
  </span>
);

const BadgeAksi = ({ aksi, berhasil = true }) => {
  const a = aksiInfo(aksi);
  return (
    <span className={`badge rounded-pill bg-${berhasil ? a.warna : "danger"}-subtle text-${berhasil ? a.warna : "danger"}-emphasis border border-${berhasil ? a.warna : "danger"}-subtle fw-medium`}>
      <i className={`bi ${berhasil ? a.ikon : "bi-x-octagon"} me-1`}></i>{a.label}{!berhasil && aksi !== "LOGIN_GAGAL" && " · gagal"}
    </span>
  );
};

// ================= DETAIL (DRAWER) =================
function DetailLog({ id, onTutup }) {
  const [log, setLog] = useState(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);
  useEffect(() => {
    setLog(null); setGalat("");
    ambil(`/log-aktivitas/${id}`).then((d) => setLog(d.data)).catch((e) => setGalat(e.message));
  }, [id]);

  const alat = log ? perangkat(log.user_agent) : null;
  const kat = log ? KATEGORI[log.kategori] || KATEGORI.SISTEM : null;

  return (
    <>
      <div className="offcanvas offcanvas-end show log-drawer" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judulDetailLog">
        <div className="offcanvas-header border-bottom">
          <div className="min-w-0">
            <div className="small text-body-secondary">Log #{id}</div>
            <h5 className="offcanvas-title fw-bold text-truncate" id="judulDetailLog">Detail Aktivitas</h5>
          </div>
          <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button>
        </div>
        <div className="offcanvas-body">
          {galat && <div className="alert alert-danger small">{galat}</div>}
          {!log && !galat && <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>}
          {log && (
            <>
              <div className={`p-3 rounded-3 mb-3 border ${log.berhasil ? "bg-body-tertiary" : "bg-danger-subtle border-danger-subtle"}`}>
                <div className="d-flex flex-wrap gap-2 mb-2">
                  <span className={`badge text-bg-${kat.warna}`}><i className={`bi ${kat.ikon} me-1`}></i>{kat.label}</span>
                  <BadgeAksi aksi={log.aksi} berhasil={log.berhasil} />
                  {log.modul && <span className="badge text-bg-light border fw-normal">{log.modul}</span>}
                </div>
                <div className="fw-semibold">{log.deskripsi}</div>
              </div>

              <dl className="row small mb-3 log-meta">
                <dt className="col-4">Pengguna</dt>
                <dd className="col-8 d-flex align-items-center gap-2">
                  <Avatar nama={namaPengguna(log)} id={log.user_id} size={24} />
                  <span>{namaPengguna(log)} {log.peran && <span className="text-body-secondary">· {ROLE_LABEL[log.peran] || log.peran}</span>}</span>
                </dd>
                <dt className="col-4">Waktu</dt>
                <dd className="col-8">{tanggalPanjang(log.waktu)}, {jam(log.waktu)} <span className="text-body-secondary">({lalu(log.waktu)})</span></dd>
                <dt className="col-4">Perangkat</dt>
                <dd className="col-8"><i className={`bi ${alat.ikon} me-1`}></i>{alat.label}{log.ip && <span className="text-body-secondary"> · IP {log.ip}</span>}</dd>
                {log.rute && (<>
                  <dt className="col-4">Permintaan</dt>
                  <dd className="col-8"><code className="small">{log.metode} {log.rute}</code>
                    {log.status_http && <span className={`badge ms-1 ${log.status_http < 400 ? "text-bg-success" : "text-bg-danger"}`}>{log.status_http}</span>}
                    {log.durasi_ms != null && <span className="text-body-secondary ms-1">{log.durasi_ms} ms</span>}
                  </dd>
                </>)}
              </dl>

              <h6 className="fw-bold mb-2"><i className="bi bi-arrow-left-right me-1 text-primary"></i>Perubahan data <span className="badge text-bg-light border">{log.perubahan.length}</span></h6>
              {log.perubahan.length === 0 ? (
                <div className="small text-body-secondary mb-3">Tidak ada data yang berubah pada tindakan ini.</div>
              ) : (
                <div className="d-flex flex-column gap-2 mb-3">
                  {log.perubahan.map((p) => {
                    const kunci = [...new Set([...Object.keys(p.data_lama || {}), ...Object.keys(p.data_baru || {})])];
                    return (
                      <details key={p.id} className="border rounded-3 log-diff" open={log.perubahan.length <= 3}>
                        <summary className="d-flex align-items-center gap-2 p-2 small">
                          <BadgeAksi aksi={p.aksi} />
                          <span className="fw-semibold text-truncate">{p.label || p.id_subjek}</span>
                          <span className="text-body-secondary text-truncate ms-auto">{p.modul}</span>
                        </summary>
                        <div className="table-responsive border-top">
                          <table className="table table-sm small mb-0 align-middle">
                            <thead><tr><th style={{ width: "30%" }}>Kolom</th>{p.aksi !== "TAMBAH" && <th>Sebelum</th>}{p.aksi !== "HAPUS" && <th>Sesudah</th>}</tr></thead>
                            <tbody>
                              {kunci.map((k) => {
                                const a = tampilNilai(p.data_lama?.[k]); const b = tampilNilai(p.data_baru?.[k]);
                                return (
                                  <tr key={k}>
                                    <td className="text-body-secondary">{namaKolom(k)}</td>
                                    {p.aksi !== "TAMBAH" && <td className={p.aksi === "UBAH" ? "log-lama" : ""}>{a ?? <span className="text-body-tertiary">—</span>}</td>}
                                    {p.aksi !== "HAPUS" && <td className={p.aksi === "UBAH" ? "log-baru" : ""}>{b ?? <span className="text-body-tertiary">—</span>}</td>}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="px-2 py-1 border-top small text-body-secondary">Tabel <code>{p.tabel}</code> · ID <code>{p.id_subjek}</code></div>
                      </details>
                    );
                  })}
                </div>
              )}

              {log.meta && (
                <details className="mb-3">
                  <summary className="small fw-semibold text-primary" role="button">Data tindakan (isian / output)</summary>
                  <pre className="small bg-body-tertiary border rounded-3 p-2 mt-2 mb-0 log-json">{JSON.stringify(log.meta, null, 2)}</pre>
                </details>
              )}
              <div className="small text-body-secondary"><i className="bi bi-lock me-1"></i>Log bersifat hanya-tambah: tidak dapat diubah atau dihapus lewat aplikasi. Log lebih dari 12 bulan dipindah otomatis ke file arsip yang ikut backup.</div>
            </>
          )}
        </div>
      </div>
      <div className="offcanvas-backdrop fade show" onClick={onTutup}></div>
    </>
  );
}

// ================= HALAMAN =================
export default function LogAktivitasPage() {
  const [user, setUser] = useState(null);
  const pengelola = ["admin", "kepsek"].includes(user?.role);

  const [preset, setPreset] = useState("7");
  const [rentang, setRentang] = useState({ dari: mundur(6), sampai: mundur(0) });
  const [kategori, setKategori] = useState(KATEGORI_BAWAAN);
  const [filter, setFilter] = useState({ user_id: "", modul: "", aksi: "", status: "" });
  const [cari, setCari] = useState("");
  const [q, setQ] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [tampilan, setTampilan] = useState("linimasa");
  const [langsung, setLangsung] = useState(false);

  const [opsi, setOpsi] = useState({ users: [], modul: [], aksi: [] });
  const [ringkasan, setRingkasan] = useState(null);
  const [daftar, setDaftar] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [detail, setDetail] = useState(null);
  const [diperbarui, setDiperbarui] = useState(null);

  useEffect(() => {
    setUser(bacaUser());
    try { const t = localStorage.getItem("log_tampilan"); if (t) setTampilan(t); } catch (e) { /* abaikan */ }
    ambil("/log-aktivitas/opsi").then(setOpsi).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem("log_tampilan", tampilan); } catch (e) { /* abaikan */ } }, [tampilan]);

  // Pencarian diketik: tunggu sejenak sebelum memuat ulang
  useEffect(() => { const t = setTimeout(() => setQ(cari.trim()), 400); return () => clearTimeout(t); }, [cari]);

  const params = useMemo(() => ({ ...rentang, ...filter, q, kategori: kategori.join(",") }), [rentang, filter, q, kategori]);
  useEffect(() => { setHalaman(1); }, [params]);

  const muat = useCallback(async (diam = false) => {
    if (!diam) setMemuat(true);
    try {
      const [r, d] = await Promise.all([ambil("/log-aktivitas/ringkasan", params), ambil("/log-aktivitas", { ...params, page: halaman, per_page: 25 })]);
      setRingkasan(r); setDaftar(d); setDiperbarui(new Date());
    } catch (e) { if (!diam) Swal.fire("Gagal memuat", e.message, "error"); }
    finally { setMemuat(false); }
  }, [params, halaman]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => {
    if (!langsung) return;
    const t = setInterval(() => muat(true), 20000);
    return () => clearInterval(t);
  }, [langsung, muat]);

  const pilihPreset = (p) => {
    setPreset(p.id);
    if (p.hari !== undefined) setRentang({ dari: mundur(p.hari), sampai: mundur(0) });
  };
  const toggleKategori = (k) => setKategori((ks) => (ks.includes(k) ? (ks.length > 1 ? ks.filter((x) => x !== k) : ks) : [...ks, k]));
  const adaFilter = filter.user_id || filter.modul || filter.aksi || filter.status || q;
  const resetFilter = () => { setFilter({ user_id: "", modul: "", aksi: "", status: "" }); setCari(""); setKategori(KATEGORI_BAWAAN); };

  const ekspor = async () => {
    Swal.fire({ title: "Menyiapkan CSV…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const d = await ambil("/log-aktivitas", { ...params, per_page: 5000 });
      const kolom = ["Waktu", "Pengguna", "Peran", "Kategori", "Aksi", "Modul", "Deskripsi", "Berhasil", "Perubahan", "IP", "Perangkat", "Permintaan"];
      const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const baris = d.data.map((l) => [l.waktu, namaPengguna(l), ROLE_LABEL[l.peran] || l.peran || "", KATEGORI[l.kategori]?.label || l.kategori, aksiInfo(l.aksi).label,
        l.modul, l.deskripsi, l.berhasil ? "Ya" : "Tidak", l.jumlah_perubahan, l.ip, perangkat(l.user_agent).label, l.rute ? `${l.metode} ${l.rute}` : ""].map(esc).join(","));
      const blob = new Blob(["﻿" + [kolom.map(esc).join(","), ...baris].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `Log_Aktivitas_${rentang.dari}_sd_${rentang.sampai}.csv`; a.click();
      Swal.close();
      if (d.total > d.data.length) Swal.fire("Sebagian diekspor", `${d.data.length} dari ${d.total} log terbaru diekspor. Persempit rentang tanggal untuk sisanya.`, "info");
    } catch (e) { Swal.fire("Gagal ekspor", e.message, "error"); }
  };

  // Grafik: aktivitas per hari (bertumpuk per kategori) dan jam sibuk
  const grafikHarian = useMemo(() => {
    if (!ringkasan) return null;
    const hari = [];
    for (let d = parseWaktu(`${rentang.dari} 00:00:00`); d <= parseWaktu(`${rentang.sampai} 00:00:00`); d.setDate(d.getDate() + 1)) hari.push(tgl(d));
    return {
      type: "bar",
      data: {
        labels: hari.map((h) => parseWaktu(`${h} 00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })),
        datasets: kategori.map((k) => ({
          label: KATEGORI[k].label, backgroundColor: KATEGORI[k].hex, borderRadius: 4, maxBarThickness: 28,
          data: hari.map((h) => Number(ringkasan.per_hari.find((r) => String(r.tanggal).slice(0, 10) === h && r.kategori === k)?.jumlah || 0)),
        })),
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
    };
  }, [ringkasan, rentang, kategori]);
  const jamSibuk = useMemo(() => (ringkasan ? Array.from({ length: 24 }, (_, j) => Number(ringkasan.per_jam?.[j] || 0)) : []), [ringkasan]);
  const maksJam = Math.max(1, ...jamSibuk);

  // Linimasa dikelompokkan per tanggal
  const perTanggal = useMemo(() => {
    const grup = [];
    (daftar?.data || []).forEach((l) => {
      const k = String(l.waktu).slice(0, 10);
      if (grup.at(-1)?.tanggal !== k) grup.push({ tanggal: k, item: [] });
      grup.at(-1).item.push(l);
    });
    return grup;
  }, [daftar]);

  const total = ringkasan?.total ?? 0;
  const persenGagal = total ? Math.round((ringkasan.gagal / total) * 100) : 0;

  return (
    <div className="container-fluid py-3 log-aktivitas">
      {/* HEADER */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto min-w-0" style={{ flex: "1 1 320px" }}>
          <h3 className="fw-bold mb-0"><i className="bi bi-shield-check text-primary me-2"></i>{pengelola ? "Log Aktivitas" : "Aktivitas Saya"}</h3>
          <div className="small text-body-secondary">
            Audit trail {pengelola ? "seluruh pengguna" : "akun Anda"}: login, perubahan data (sebelum → sesudah), cetak, ekspor, dan WhatsApp.
            {diperbarui && <> · diperbarui {diperbarui.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</>}
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
        <div className="form-check form-switch mb-0 me-1" title="Muat ulang otomatis tiap 20 detik">
          <input className="form-check-input" type="checkbox" id="logLangsung" checked={langsung} onChange={(e) => setLangsung(e.target.checked)} />
          <label className="form-check-label small" htmlFor="logLangsung">{langsung && <span className="log-pulse me-1"></span>}Langsung</label>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => muat()} disabled={memuat}><i className={`bi bi-arrow-clockwise ${memuat ? "log-putar" : ""}`}></i><span className="d-none d-sm-inline ms-1">Segarkan</span></button>
        <button type="button" className="btn btn-sm btn-success" onClick={ekspor}><i className="bi bi-filetype-csv"></i><span className="d-none d-sm-inline ms-1">Ekspor CSV</span></button>
        </div>
      </div>

      {/* RENTANG WAKTU */}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Rentang waktu">
          {PRESET.map((p) => (
            <button key={p.id} type="button" className={`btn ${preset === p.id ? "btn-primary" : "btn-outline-primary"}`} onClick={() => pilihPreset(p)}>{p.label}</button>
          ))}
        </div>
        {preset === "kustom" && (
          <div className="d-flex align-items-center gap-1">
            <input type="date" className="form-control form-control-sm" value={rentang.dari} max={rentang.sampai} onChange={(e) => setRentang((r) => ({ ...r, dari: e.target.value }))} aria-label="Dari tanggal" />
            <span className="text-body-secondary">–</span>
            <input type="date" className="form-control form-control-sm" value={rentang.sampai} min={rentang.dari} onChange={(e) => setRentang((r) => ({ ...r, sampai: e.target.value }))} aria-label="Sampai tanggal" />
          </div>
        )}
      </div>

      {/* KARTU STATISTIK (AdminLTE info-box) */}
      <div className="row g-2 g-md-3 mb-3">
        <div className="col-6 col-xl-3"><InfoBox icon="bi-activity" theme="primary" text="Total aktivitas" title={total.toLocaleString("id-ID")} progress={100} progressText={`${kategori.length} kategori dipilih`} /></div>
        <div className="col-6 col-xl-3"><InfoBox icon="bi-people" theme="info" text={pengelola ? "Pengguna aktif" : "Hari aktif"} title={pengelola ? String(ringkasan?.pengguna_aktif ?? 0) : String(new Set((ringkasan?.per_hari || []).map((r) => r.tanggal)).size)} progress={100} progressText="dalam rentang ini" /></div>
        <div className="col-6 col-xl-3"><InfoBox icon="bi-database-gear" theme="success" text="Data berubah" title={(ringkasan?.perubahan_data ?? 0).toLocaleString("id-ID")} progress={100} progressText="record tambah/ubah/hapus" /></div>
        <div className="col-6 col-xl-3"><InfoBox icon="bi-shield-exclamation" theme="danger" text="Gagal / ditolak" title={String(ringkasan?.gagal ?? 0)} progress={persenGagal} progressText={`${ringkasan?.login_gagal ?? 0} login gagal`} /></div>
      </div>

      {/* GRAFIK & PERINGKAT */}
      <div className="row g-3 mb-3">
        <div className={pengelola ? "col-lg-8" : "col-12"}>
          <div className="card card-outline card-primary h-100">
            <div className="card-header"><h3 className="card-title fw-semibold"><i className="bi bi-bar-chart-line me-1"></i>Tren aktivitas</h3></div>
            <div className="card-body">
              {grafikHarian && <ChartCanvas config={grafikHarian} height={220} />}
              <div className="mt-3">
                <div className="small text-body-secondary mb-1">Jam sibuk</div>
                <div className="log-jam" role="img" aria-label="Sebaran aktivitas per jam">
                  {jamSibuk.map((n, j) => (
                    <div key={j} className="log-jam-sel" title={`${String(j).padStart(2, "0")}.00 – ${n} aktivitas`}
                      style={{ background: n ? `rgba(59,130,246,${0.15 + (0.85 * n) / maksJam})` : undefined }}>
                      {j % 3 === 0 && <span>{j}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        {pengelola && (
          <div className="col-lg-4">
            <div className="card card-outline card-info h-100">
              <div className="card-header"><h3 className="card-title fw-semibold"><i className="bi bi-trophy me-1"></i>Paling aktif</h3></div>
              <div className="card-body">
                {(ringkasan?.pengguna_teratas || []).length === 0 && <div className="small text-body-secondary">Belum ada aktivitas.</div>}
                {(ringkasan?.pengguna_teratas || []).map((u) => (
                  <button key={u.user_id} type="button" className="btn btn-link text-reset text-decoration-none p-0 w-100 text-start d-flex align-items-center gap-2 mb-2"
                    onClick={() => setFilter((f) => ({ ...f, user_id: String(u.user_id) }))} title="Tampilkan aktivitas pengguna ini">
                    <Avatar nama={u.nama_user} id={u.user_id} size={30} />
                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex justify-content-between small"><span className="fw-semibold text-truncate">{u.nama_user}</span><b>{u.jumlah}</b></div>
                      <div className="progress" style={{ height: 4 }}><div className="progress-bar" style={{ width: `${(u.jumlah / ringkasan.pengguna_teratas[0].jumlah) * 100}%` }}></div></div>
                    </div>
                  </button>
                ))}
                {(ringkasan?.modul_teratas || []).length > 0 && (
                  <>
                    <div className="small text-body-secondary mt-3 mb-1">Modul tersibuk</div>
                    <div className="d-flex flex-wrap gap-1">
                      {ringkasan.modul_teratas.map((m) => (
                        <button key={m.modul} type="button" className="btn btn-sm btn-light border py-0" onClick={() => setFilter((f) => ({ ...f, modul: m.modul }))}>{m.modul} <span className="text-body-secondary">{m.jumlah}</span></button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FILTER & DAFTAR */}
      <div className="card card-outline card-secondary">
        <div className="card-header">
          <div className="d-flex flex-wrap align-items-center gap-2">
            {Object.entries(KATEGORI).map(([k, v]) => {
              const aktif = kategori.includes(k);
              return (
                <button key={k} type="button" onClick={() => toggleKategori(k)} aria-pressed={aktif}
                  className={`btn btn-sm rounded-pill ${aktif ? `btn-${v.warna}` : "btn-outline-secondary"}`}>
                  <i className={`bi ${v.ikon} me-1`}></i>{v.label}
                  {ringkasan?.per_kategori?.[k] != null && aktif && <span className="badge text-bg-light ms-1">{ringkasan.per_kategori[k]}</span>}
                </button>
              );
            })}
            <div className="btn-group btn-group-sm ms-md-auto" role="group" aria-label="Tampilan">
              <button type="button" className={`btn ${tampilan === "linimasa" ? "btn-dark" : "btn-outline-dark"}`} onClick={() => setTampilan("linimasa")}><i className="bi bi-list-nested me-1"></i>Linimasa</button>
              <button type="button" className={`btn ${tampilan === "tabel" ? "btn-dark" : "btn-outline-dark"}`} onClick={() => setTampilan("tabel")}><i className="bi bi-table me-1"></i>Tabel</button>
            </div>
          </div>
          <div className="row g-2 mt-1">
            <div className="col-12 col-md">
              <div className="input-group input-group-sm">
                <span className="input-group-text"><i className="bi bi-search"></i></span>
                <input type="search" className="form-control" placeholder="Cari deskripsi, nama siswa/data, pengguna, IP…" value={cari} onChange={(e) => setCari(e.target.value)} />
              </div>
            </div>
            {pengelola && (
              <div className="col-6 col-md-auto">
                <select className="form-select form-select-sm" value={filter.user_id} onChange={(e) => setFilter((f) => ({ ...f, user_id: e.target.value }))} aria-label="Pengguna">
                  <option value="">Semua pengguna</option>
                  {opsi.users.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABEL[u.role] || u.role})</option>)}
                </select>
              </div>
            )}
            <div className="col-6 col-md-auto">
              <select className="form-select form-select-sm" value={filter.modul} onChange={(e) => setFilter((f) => ({ ...f, modul: e.target.value }))} aria-label="Modul">
                <option value="">Semua modul</option>
                {opsi.modul.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="col-6 col-md-auto">
              <select className="form-select form-select-sm" value={filter.aksi} onChange={(e) => setFilter((f) => ({ ...f, aksi: e.target.value }))} aria-label="Aksi">
                <option value="">Semua aksi</option>
                {opsi.aksi.map((a) => <option key={a} value={a}>{aksiInfo(a).label}</option>)}
              </select>
            </div>
            <div className="col-6 col-md-auto">
              <select className="form-select form-select-sm" value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
                <option value="">Semua status</option>
                <option value="berhasil">Berhasil</option>
                <option value="gagal">Gagal / ditolak</option>
              </select>
            </div>
            {adaFilter && (
              <div className="col-12 col-md-auto">
                <button type="button" className="btn btn-sm btn-link text-danger px-0" onClick={resetFilter}><i className="bi bi-x-circle me-1"></i>Reset filter</button>
              </div>
            )}
          </div>
        </div>

        <div className="card-body">
          {memuat && !daftar ? (
            <div className="log-skeleton">{[1, 2, 3, 4].map((i) => <div key={i} className="placeholder-glow mb-3"><span className="placeholder col-12 rounded-3" style={{ height: 54 }}></span></div>)}</div>
          ) : !daftar?.data.length ? (
            <div className="text-center text-body-secondary py-5">
              <i className="bi bi-inbox fs-1 d-block mb-2"></i>Tidak ada aktivitas pada rentang & filter ini.
              {!kategori.includes("NAVIGASI") && <div className="small mt-1">Aktivitas membuka halaman disembunyikan; aktifkan chip <b>Navigasi</b> untuk melihatnya.</div>}
            </div>
          ) : tampilan === "linimasa" ? (
            // Linimasa bergaya AdminLTE 4 (timeline, time-label, timeline-icon)
            <div className="timeline log-timeline mb-0">
              {perTanggal.map((g) => (
                <Fragment key={g.tanggal}>
                  <div className="time-label"><span className="text-bg-primary">{tanggalPanjang(`${g.tanggal} 00:00:00`)}</span></div>
                  {g.item.map((l) => {
                    const a = aksiInfo(l.aksi);
                    return (
                      <div key={l.id}>
                        <i className={`timeline-icon bi ${l.berhasil ? a.ikon : "bi-x-octagon"} text-bg-${l.berhasil ? a.warna : "danger"}`}></i>
                        <div className={`timeline-item ${l.berhasil ? "" : "log-gagal"}`}>
                          <span className="time" title={lalu(l.waktu)}><i className="bi bi-clock me-1"></i>{jam(l.waktu)}</span>
                          <h3 className="timeline-header d-flex flex-wrap align-items-center gap-2 border-0 pb-1">
                            <Avatar nama={namaPengguna(l)} id={l.user_id} size={24} />
                            <span className="fw-semibold text-body">{namaPengguna(l)}</span>
                            {l.peran && <span className="small text-body-secondary">{ROLE_LABEL[l.peran] || l.peran}</span>}
                            <BadgeAksi aksi={l.aksi} berhasil={l.berhasil} />
                            {l.modul && <span className="badge text-bg-light border fw-normal">{l.modul}</span>}
                          </h3>
                          <div className="timeline-body pt-0">
                            <span>{l.deskripsi}</span>
                          </div>
                          <div className="timeline-footer pt-0 d-flex flex-wrap align-items-center gap-2 small text-body-secondary">
                            <span><i className={`bi ${perangkat(l.user_agent).ikon} me-1`}></i>{perangkat(l.user_agent).label}</span>
                            {l.ip && <span>· {l.ip}</span>}
                            {l.jumlah_perubahan > 0 && <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle">{l.jumlah_perubahan} data berubah</span>}
                            <button type="button" className="btn btn-sm btn-outline-primary py-0 ms-auto" onClick={() => setDetail(l.id)}>Detail <i className="bi bi-chevron-right"></i></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
              <div><i className="timeline-icon bi bi-clock-history text-bg-secondary"></i></div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle small mb-0">
                <thead className="table-light">
                  <tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Modul</th><th>Deskripsi</th><th className="text-center">Data</th><th>Perangkat</th></tr>
                </thead>
                <tbody>
                  {daftar.data.map((l) => (
                    <tr key={l.id} role="button" onClick={() => setDetail(l.id)} className={l.berhasil ? "" : "table-danger"}>
                      <td className="text-nowrap"><div>{jam(l.waktu)}</div><div className="text-body-secondary">{parseWaktu(l.waktu).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</div></td>
                      <td className="text-nowrap"><div className="d-flex align-items-center gap-2"><Avatar nama={namaPengguna(l)} id={l.user_id} size={26} /><div><div className="fw-semibold">{namaPengguna(l)}</div><div className="text-body-secondary">{ROLE_LABEL[l.peran] || l.peran || "—"}</div></div></div></td>
                      <td className="text-nowrap"><BadgeAksi aksi={l.aksi} berhasil={l.berhasil} /></td>
                      <td className="text-nowrap">{l.modul || "—"}</td>
                      <td style={{ minWidth: 260 }}>{l.deskripsi}</td>
                      <td className="text-center">{l.jumlah_perubahan || "—"}</td>
                      <td className="text-nowrap text-body-secondary"><i className={`bi ${perangkat(l.user_agent).ikon} me-1`}></i>{perangkat(l.user_agent).label}<div>{l.ip}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {daftar?.last_page > 1 && (
          <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
            <small className="text-body-secondary">{daftar.from}–{daftar.to} dari {daftar.total.toLocaleString("id-ID")} aktivitas</small>
            <ul className="pagination pagination-sm mb-0">
              <li className={`page-item ${halaman <= 1 ? "disabled" : ""}`}><button type="button" className="page-link" onClick={() => setHalaman((h) => h - 1)} aria-label="Sebelumnya"><i className="bi bi-chevron-left"></i></button></li>
              {Array.from({ length: daftar.last_page }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === daftar.last_page || Math.abs(n - halaman) <= 1)
                .map((n, i, arr) => (
                  <li key={n} className={`page-item ${n === halaman ? "active" : ""}`}>
                    {i > 0 && n - arr[i - 1] > 1 && <span className="page-link border-0 bg-transparent">…</span>}
                    <button type="button" className="page-link" onClick={() => setHalaman(n)}>{n}</button>
                  </li>
                ))}
              <li className={`page-item ${halaman >= daftar.last_page ? "disabled" : ""}`}><button type="button" className="page-link" onClick={() => setHalaman((h) => h + 1)} aria-label="Berikutnya"><i className="bi bi-chevron-right"></i></button></li>
            </ul>
          </div>
        )}
      </div>

      {detail && <DetailLog id={detail} onTutup={() => setDetail(null)} />}
    </div>
  );
}
