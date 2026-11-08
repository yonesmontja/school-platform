"use client";

import "./tabler.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { API_URL, authHeaders, useAkses } from "@/app/lib/akses";
import { aksiHapus, aksiUbah, kolomAksi } from "@/components/dashboard/menuAksi";

// Master Orang Tua & Wali bergaya Tabler (lihat tabler.css). Data ini menentukan nomor WA kabar
// remedial/presensi dan menjadi dasar akun portal orang tua di Manajemen Pengguna.

const JENIS = {
  ortu: { label: "Orang Tua", tunggal: "orang tua", icon: "bi-people", kunci: "id_ortu" },
  wali: { label: "Wali", tunggal: "wali", icon: "bi-person-heart", kunci: "id_wali" },
};
const WARNA = ["bg-primary-lt", "bg-green-lt", "bg-purple-lt", "bg-azure-lt", "bg-teal-lt", "bg-yellow-lt", "bg-red-lt"];
const POLA_WA = /^\+?[0-9 \-]{8,20}$/;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inisial = (nama) => (nama || "?").trim().split(/\s+/).slice(0, 2).map((k) => k[0]).join("").toUpperCase();
const warnaDari = (teks) => WARNA[[...(teks || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % WARNA.length];
// Nomor lokal 08… → 628… untuk tautan wa.me (sama seperti WhatsAppService di backend)
const nomorWa = (no) => {
  const d = String(no || "").replace(/\D/g, "");
  return !d ? "" : d.startsWith("0") ? `62${d.slice(1)}` : d.startsWith("8") ? `62${d}` : d;
};
const namaKeluarga = (jenis, r) => jenis === "ortu" ? [r.nama_ayah, r.nama_ibu].filter(Boolean).join(" & ") : r.nama_wali;

async function minta(url, opsi = {}) {
  const res = await fetch(url, { ...opsi, headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || "Terjadi kesalahan pada server.");
    err.errors = data.errors || {};
    throw err;
  }
  return data;
}

async function gambarBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(`${API_URL}/signature/${url.split("/").pop()}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((r) => { const f = new FileReader(); f.onloadend = () => r(f.result); f.readAsDataURL(blob); });
  } catch { return null; }
}

export default function MasterKeluargaPage() {
  const { isAdmin, user } = useAkses();
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState("ortu");
  const [form, setForm] = useState(null); // { jenis, baris }
  const [hapus, setHapus] = useState(null); // { jenis, baris }
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((judul, isi, warna = "green") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, judul, isi, warna }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const muat = useCallback(async () => {
    try {
      const [k, s] = await Promise.all([minta(`${API_URL}/keluarga`), minta(`${API_URL}/settings`).catch(() => null)]);
      setData(k); setSettings(s);
    } catch (e) { toast("Gagal memuat", e.message, "red"); }
  }, [toast]);
  useEffect(() => { muat(); }, [muat]);

  const pekerjaanNama = useMemo(() => Object.fromEntries((data?.pekerjaan || []).map((p) => [p.id_pekerjaan, p.nama_pekerjaan])), [data]);

  // Baris siap tampil, cari, dan ekspor
  const baris = useMemo(() => {
    if (!data) return { ortu: [], wali: [] };
    const umum = (jenis, r) => ({
      ...r,
      _jenis: jenis,
      _nama: namaKeluarga(jenis, r) || "(tanpa nama)",
      _anak: r.anak.map((a) => `${a.nama_siswa}${a.kelas ? ` (${a.kelas.nama_kelas})` : ""}`).join(", "),
      _akun: r.akun ? (r.akun.aktif ? "Aktif" : "Nonaktif") : "Belum ada",
      _alamat: (jenis === "ortu" ? r.jalan_ortu : r.jalan_wali) || "",
    });
    return {
      ortu: data.ortu.map((r) => ({ ...umum("ortu", r), _pekerjaan: [r.id_pekerjaan_ayah && `Ayah: ${pekerjaanNama[r.id_pekerjaan_ayah]}`, r.id_pekerjaan_ibu && `Ibu: ${pekerjaanNama[r.id_pekerjaan_ibu]}`].filter(Boolean).join(" · ") })),
      wali: data.wali.map((r) => ({ ...umum("wali", r), _pekerjaan: pekerjaanNama[r.id_pekerjaan_wali] || "" })),
    };
  }, [data, pekerjaanNama]);

  const statistik = useMemo(() => {
    if (!data) return null;
    const semua = [...data.ortu, ...data.wali];
    const terhubung = data.siswa.filter((s) => s.id_ortu || s.id_wali);
    return {
      keluarga: semua.length,
      siswa: data.siswa.length,
      terhubung: terhubung.length,
      belum: data.siswa.filter((s) => !s.id_ortu && !s.id_wali),
      wa: semua.filter((r) => r.no_wa).length,
      akun: semua.filter((r) => r.akun).length,
    };
  }, [data]);

  const persen = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="tb">
      <div className="container-xl">
        {/* Header halaman */}
        <div className="d-flex flex-wrap align-items-end gap-3 mb-4">
          <div className="me-auto">
            <div className="page-pretitle">Master Data</div>
            <h2 className="page-title">
              Orang Tua &amp; Wali
              {user && !isAdmin && <span className="tb-badge bg-azure-lt"><i className="bi bi-eye"></i>Lihat saja</span>}
            </h2>
            <div className="page-subtitle">Data keluarga siswa untuk akun portal orang tua dan kabar WhatsApp dari sekolah.</div>
          </div>
          <div className="btn-list">
            <button type="button" className="tb-btn" onClick={muat} title="Muat ulang"><i className="bi bi-arrow-clockwise"></i><span className="d-none d-sm-inline">Muat ulang</span></button>
            {isAdmin && (
              <button type="button" className="tb-btn tb-btn-primary" onClick={() => setForm({ jenis: null, baris: null })}>
                <i className="bi bi-plus-lg"></i>Tambah data keluarga
              </button>
            )}
          </div>
        </div>

        {/* Kartu ringkas */}
        <div className="row g-3 mb-4">
          <KartuStat ikon="bi-house-heart" warna="bg-primary-lt" judul="Keluarga tercatat" nilai={statistik?.keluarga}
            catatan={data && `${data.ortu.length} orang tua · ${data.wali.length} wali`} />
          <KartuStat ikon="bi-link-45deg" warna="bg-green-lt" judul="Siswa terhubung" nilai={statistik && `${statistik.terhubung}/${statistik.siswa}`}
            progres={statistik && persen(statistik.terhubung, statistik.siswa)} />
          <KartuStat ikon="bi-whatsapp" warna="bg-teal-lt" judul="Punya nomor WA" nilai={statistik?.wa}
            catatan={statistik && `${persen(statistik.wa, statistik.keluarga)}% dari keluarga tercatat`} />
          <KartuStat ikon="bi-person-check" warna="bg-purple-lt" judul="Akun portal" nilai={statistik?.akun}
            catatan="Dibuat di Manajemen Pengguna" />
        </div>

        {statistik?.belum.length > 0 && (
          <div className="tb-card tb-card-body d-flex flex-wrap align-items-center gap-3 mb-4">
            <span className="avatar bg-yellow-lt"><i className="bi bi-exclamation-triangle"></i></span>
            <div className="me-auto">
              <div className="fw-semibold">{statistik.belum.length} siswa belum terhubung ke orang tua atau wali</div>
              <div className="text-secondary small">Tanpa data keluarga, kabar WhatsApp memakai nomor siswa dan akun orang tua belum bisa dibuat.</div>
            </div>
            <div className="avatar-list">
              {statistik.belum.slice(0, 5).map((s) => (
                <span key={s.id_siswa} className={`avatar avatar-sm avatar-rounded ${warnaDari(s.nama_siswa)}`} title={s.nama_siswa}>{inisial(s.nama_siswa)}</span>
              ))}
              {statistik.belum.length > 5 && <span className="avatar avatar-sm avatar-rounded">+{statistik.belum.length - 5}</span>}
            </div>
            {isAdmin && <button type="button" className="tb-btn" onClick={() => setForm({ jenis: null, baris: null })}><i className="bi bi-plus-lg"></i>Hubungkan</button>}
          </div>
        )}

        {/* Tabel per jenis */}
        <div className="tb-card">
          <div className="tb-card-header">
            <ul className="card-header-tabs">
              {Object.entries(JENIS).map(([id, j]) => (
                <li key={id}>
                  <button type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
                    <i className={`bi ${j.icon}`}></i>{j.label}<span className="tb-badge">{baris[id].length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {!data ? (
            <div className="tb-card-body">
              {[0, 1, 2].map((i) => (
                <div key={i} className="d-flex align-items-center gap-3 py-2">
                  <span className="avatar avatar-sm placeholder-glow"></span>
                  <span className="placeholder-glow" style={{ width: "30%" }}></span>
                  <span className="placeholder-glow ms-auto" style={{ width: "15%" }}></span>
                </div>
              ))}
            </div>
          ) : baris[tab].length === 0 ? (
            <div className="empty">
              <div className="empty-img bg-primary-lt"><i className={`bi ${JENIS[tab].icon}`}></i></div>
              <div className="empty-title">Belum ada data {JENIS[tab].tunggal}</div>
              <div className="empty-subtitle">
                {tab === "ortu" ? "Catat nama ayah dan ibu, nomor WhatsApp, lalu centang anak-anaknya. Satu data bisa dipakai untuk kakak-adik." : "Isi data wali untuk siswa yang tinggal bersama wali, bukan orang tua kandung."}
              </div>
              {isAdmin && <button type="button" className="tb-btn tb-btn-primary" onClick={() => setForm({ jenis: tab, baris: null })}><i className="bi bi-plus-lg"></i>Tambah {JENIS[tab].tunggal}</button>}
            </div>
          ) : (
            <TabelKeluarga key={tab} jenis={tab} rows={baris[tab]} settings={settings} bolehUbah={isAdmin}
              onUbah={(b) => setForm({ jenis: tab, baris: b })} onHapus={(b) => setHapus({ jenis: tab, baris: b })} />
          )}
        </div>
      </div>

      {form && (
        <FormKeluarga {...form} data={data} onTutup={() => setForm(null)}
          onTersimpan={(jenis, pesan) => { setForm(null); setTab(jenis); toast("Tersimpan", pesan); muat(); }} />
      )}
      {hapus && (
        <KonfirmasiHapus {...hapus} onTutup={() => setHapus(null)}
          onTerhapus={(pesan) => { setHapus(null); toast("Dihapus", pesan); muat(); }}
          onGagal={(pesan) => { setHapus(null); toast("Tidak bisa dihapus", pesan, "red"); }} />
      )}

      <div className="tb-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="tb-toast">
            <span className={`avatar avatar-sm avatar-rounded bg-${t.warna}-lt`}><i className={`bi ${t.warna === "red" ? "bi-x-lg" : "bi-check-lg"}`}></i></span>
            <div className="flex-grow-1">
              <div className="fw-semibold">{t.judul}</div>
              <div className="text-secondary small">{t.isi}</div>
            </div>
            <button type="button" className="tb-btn tb-btn-ghost tb-btn-icon" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Tutup"><i className="bi bi-x"></i></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function KartuStat({ ikon, warna, judul, nilai, catatan, progres }) {
  return (
    <div className="col-sm-6 col-xl-3">
      <div className="tb-card tb-card-body h-100">
        <div className="d-flex align-items-center gap-3">
          <span className={`avatar ${warna}`}><i className={`bi ${ikon}`}></i></span>
          <div className="flex-grow-1 min-w-0">
            <div className="subheader">{judul}</div>
            <div className="h1 mb-0">{nilai ?? <span className="placeholder-glow" style={{ width: 40 }}></span>}</div>
          </div>
        </div>
        {progres !== undefined && progres !== null ? (
          <div className="mt-3">
            <div className="d-flex justify-content-between small text-secondary mb-1"><span>Kelengkapan</span><span>{progres}%</span></div>
            <div className="tb-progress"><div style={{ width: `${progres}%` }}></div></div>
          </div>
        ) : catatan && <div className="text-secondary small mt-2">{catatan}</div>}
      </div>
    </div>
  );
}

function TabelKeluarga({ jenis, rows, settings, bolehUbah, onUbah, onHapus }) {
  const [menuKolom, setMenuKolom] = useState(false);
  const aksi = useRef({ onUbah, onHapus });
  aksi.current = { onUbah, onHapus };

  const ambil = useCallback(async () => rows, [rows]);

  const COLUMNS_DEF = useMemo(() => [
    {
      title: jenis === "ortu" ? "Orang tua" : "Wali", field: "_nama", minWidth: 220, widthGrow: 3, responsive: 0,
      formatter: (c) => {
        const r = c.getRow().getData();
        return `<div class="sel-nama"><span class="avatar avatar-sm avatar-rounded ${warnaDari(r._nama)}">${esc(inisial(r._nama))}</span>
          <div style="min-width:0"><div class="judul">${esc(r._nama)}</div><div class="sub">${esc(r._pekerjaan || "Pekerjaan belum diisi")}</div></div></div>`;
      },
    },
    {
      title: "Anak", field: "_anak", minWidth: 180, widthGrow: 2, headerSort: false, responsive: 1,
      formatter: (c) => {
        const anak = c.getRow().getData().anak;
        return anak.length
          ? `<div class="tb-chip-list">${anak.map((a) => `<span class="tb-badge bg-primary-lt">${esc(a.nama_siswa)}${a.kelas ? `<span style="opacity:.7">· ${esc(a.kelas.nama_kelas)}</span>` : ""}</span>`).join("")}</div>`
          : `<span class="tb-badge bg-yellow-lt">Belum ada anak</span>`;
      },
    },
    {
      title: "WhatsApp", field: "no_wa", width: 170, responsive: 2,
      formatter: (c) => {
        const no = c.getValue();
        return no ? `<a class="tb-wa" href="https://wa.me/${nomorWa(no)}" target="_blank" rel="noreferrer"><span class="status-dot status-dot-animated"></span>${esc(no)}</a>` : `<span class="text-secondary">—</span>`;
      },
    },
    { title: "Alamat", field: "_alamat", minWidth: 150, widthGrow: 1, responsive: 4, formatter: (c) => esc(c.getValue()) || `<span class="text-secondary">—</span>` },
    {
      title: "Akun portal", field: "_akun", width: 140, responsive: 3,
      formatter: (c) => {
        const r = c.getRow().getData();
        return r.akun
          ? `<span class="status ${r.akun.aktif ? "bg-green-lt" : "bg-red-lt"}" title="${esc(r.akun.username)}"><span class="status-dot"></span>${r.akun.aktif ? "Aktif" : "Nonaktif"}</span>`
          : `<span class="status bg-yellow-lt"><span class="status-dot"></span>Belum ada</span>`;
      },
    },
    {
      ...kolomAksi((r) => [aksiUbah(() => aksi.current.onUbah(r)), aksiHapus(() => aksi.current.onHapus(r))], { responsive: 0 }),
    },
  ], [jenis]);

  const { tableRef, searchQuery, setSearchQuery, visibleColumns, toggleColumn, getFilteredData } =
    useTableLogic(ambil, COLUMNS_DEF, ["_nama", "_anak", "no_wa", "_alamat", "_pekerjaan"]);

  // Layar HP: kolom selain nama disembunyikan; isinya tampil di lipatan baris (Tabulator responsive collapse)
  const kolomHp = useRef(false); // sekali saja (StrictMode menjalankan efek dua kali saat pengembangan)
  useEffect(() => {
    if (kolomHp.current || !window.matchMedia("(max-width: 575.98px)").matches) return;
    kolomHp.current = true;
    ["_anak", "no_wa", "_alamat", "_akun"].forEach(toggleColumn);
  }, []);

  const judul = jenis === "ortu" ? "Data Orang Tua" : "Data Wali";
  const kePolos = () => getFilteredData().map((r) => jenis === "ortu" ? {
    "Nama Ayah": r.nama_ayah || "", "Nama Ibu": r.nama_ibu || "", "Pekerjaan": r._pekerjaan, "Anak": r._anak, "No. WhatsApp": r.no_wa || "", "Alamat": r._alamat, "Akun Portal": r._akun,
  } : {
    "Nama Wali": r.nama_wali, "Pekerjaan": r._pekerjaan, "Anak": r._anak, "No. WhatsApp": r.no_wa || "", "Alamat": r._alamat, "Akun Portal": r._akun,
  });
  const nama = (ext) => `${judul.replace(/ /g, "_")}_${Date.now()}.${ext}`;
  const unduhExcel = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kePolos()), jenis === "ortu" ? "Orang Tua" : "Wali"); XLSX.writeFile(wb, nama("xlsx")); };
  const unduhCsv = () => {
    const blob = new Blob([XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(kePolos()))], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nama("csv"); a.click();
  };
  const unduhPdf = () => generateProfessionalPDF(kePolos(), `Laporan ${judul}`, settings, gambarBase64);

  return (
    <>
      <div className="tb-card-body d-flex flex-wrap align-items-center gap-2 border-bottom" style={{ borderColor: "var(--tb-border)" }}>
        <div className="input-icon flex-grow-1" style={{ maxWidth: 360 }}>
          <span className="input-icon-addon"><i className="bi bi-search"></i></span>
          <input type="search" className="tb-input" placeholder={`Cari nama, anak, nomor WA…`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="ms-auto d-flex flex-wrap gap-2">
          <div className="tb-dropdown">
            <button type="button" className="tb-btn" onClick={() => setMenuKolom((v) => !v)}><i className="bi bi-layout-three-columns"></i>Kolom</button>
            {menuKolom && (
              <div className="tb-dropdown-menu" onMouseLeave={() => setMenuKolom(false)}>
                {COLUMNS_DEF.filter((c) => c.field !== "action").map((c) => (
                  <label key={c.field} className="tb-dropdown-item">
                    <input type="checkbox" checked={visibleColumns.includes(c.field)} onChange={() => toggleColumn(c.field)} />{c.title}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="tb-btn-group">
            <button type="button" className="tb-btn" onClick={unduhExcel} title="Unduh Excel"><i className="bi bi-file-earmark-excel text-success"></i>XLSX</button>
            <button type="button" className="tb-btn" onClick={unduhCsv} title="Unduh CSV"><i className="bi bi-filetype-csv" style={{ color: "var(--tb-azure)" }}></i>CSV</button>
            <button type="button" className="tb-btn" onClick={unduhPdf} title="Unduh PDF"><i className="bi bi-file-earmark-pdf text-danger"></i>PDF</button>
          </div>
        </div>
      </div>
      <div className="tb-table"><div ref={tableRef}></div></div>
    </>
  );
}

function FormKeluarga({ jenis: jenisAwal, baris, data, onTutup, onTersimpan }) {
  const ubah = !!baris;
  const [jenis, setJenis] = useState(jenisAwal || "ortu");
  const [isian, setIsian] = useState(() => ({
    nama_ayah: baris?.nama_ayah || "", nama_ibu: baris?.nama_ibu || "", id_pekerjaan_ayah: baris?.id_pekerjaan_ayah || "", id_pekerjaan_ibu: baris?.id_pekerjaan_ibu || "",
    jalan_ortu: baris?.jalan_ortu || "", nama_wali: baris?.nama_wali || "", id_pekerjaan_wali: baris?.id_pekerjaan_wali || "", jalan_wali: baris?.jalan_wali || "",
    no_wa: baris?.no_wa || "",
  }));
  const [anak, setAnak] = useState(() => new Set((baris?.anak || []).map((a) => a.id_siswa)));
  const [cari, setCari] = useState("");
  const [galat, setGalat] = useState({});
  const [menyimpan, setMenyimpan] = useState(false);
  const formRef = useRef(null);
  const kunci = JENIS[jenis].kunci;

  const set = (k) => (e) => { setIsian((f) => ({ ...f, [k]: e.target.value })); setGalat((g) => ({ ...g, [k]: undefined, ...(k.startsWith("nama_") && { nama_ayah: undefined, nama_ibu: undefined }) })); };
  const pilihAnak = (id) => setAnak((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Nama keluarga lain untuk peringatan "akan dipindah"
  const pemilik = useMemo(() => Object.fromEntries((data?.[jenis] || []).map((r) => [r[kunci], namaKeluarga(jenis, r)])), [data, jenis, kunci]);
  const siswa = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.siswa || []).filter((s) => !q || `${s.nama_siswa} ${s.nisn || ""} ${s.kelas?.nama_kelas || ""}`.toLowerCase().includes(q))
      .sort((a, b) => (anak.has(b.id_siswa) - anak.has(a.id_siswa)) || (!!a[kunci] - !!b[kunci]) || a.nama_siswa.localeCompare(b.nama_siswa));
  }, [data, cari, anak, kunci]);

  const waValid = !isian.no_wa || POLA_WA.test(isian.no_wa.trim());
  const namaTampil = jenis === "ortu" ? [isian.nama_ayah, isian.nama_ibu].filter((s) => s.trim()).join(" & ") : isian.nama_wali;

  const simpan = async (e) => {
    e?.preventDefault();
    const g = {};
    if (jenis === "ortu" && !isian.nama_ayah.trim() && !isian.nama_ibu.trim()) g.nama_ayah = g.nama_ibu = "Isi nama ayah atau nama ibu.";
    if (jenis === "wali" && !isian.nama_wali.trim()) g.nama_wali = "Nama wali wajib diisi.";
    if (!waValid) g.no_wa = "Nomor WhatsApp hanya boleh angka (boleh diawali +), 8–20 digit.";
    if (Object.keys(g).length) return setGalat(g);

    const kirim = jenis === "ortu"
      ? { nama_ayah: isian.nama_ayah, nama_ibu: isian.nama_ibu, id_pekerjaan_ayah: isian.id_pekerjaan_ayah || null, id_pekerjaan_ibu: isian.id_pekerjaan_ibu || null, jalan_ortu: isian.jalan_ortu }
      : { nama_wali: isian.nama_wali, id_pekerjaan_wali: isian.id_pekerjaan_wali || null, jalan_wali: isian.jalan_wali };
    setMenyimpan(true);
    try {
      await minta(ubah ? `${API_URL}/keluarga/${jenis}/${baris[kunci]}` : `${API_URL}/keluarga/${jenis}`, {
        method: ubah ? "PUT" : "POST", body: JSON.stringify({ ...kirim, no_wa: isian.no_wa, anak: [...anak] }),
      });
      onTersimpan(jenis, `${namaTampil || "Data keluarga"} ${ubah ? "diperbarui" : "ditambahkan"}${anak.size ? ` dengan ${anak.size} anak` : ""}.`);
    } catch (err) {
      setGalat(Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k.split(".")[0], v[0]])));
      if (!Object.keys(err.errors || {}).length) setGalat({ umum: err.message });
    } finally { setMenyimpan(false); }
  };

  useEffect(() => {
    const tombol = (e) => {
      if (e.key === "Escape") onTutup();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) formRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", tombol);
    return () => window.removeEventListener("keydown", tombol);
  }, [onTutup]);

  const pekerjaan = (k) => (
    <select className="tb-select" value={isian[k]} onChange={set(k)}>
      <option value="">— Pilih pekerjaan —</option>
      {(data?.pekerjaan || []).map((p) => <option key={p.id_pekerjaan} value={p.id_pekerjaan}>{p.nama_pekerjaan}</option>)}
    </select>
  );
  const nama = (k, label, ikon, placeholder) => (
    <div className="mb-3">
      <label className={`form-label${jenis === "wali" ? " required" : ""}`}>{label}</label>
      <div className="input-icon">
        <span className="input-icon-addon"><i className={`bi ${ikon}`}></i></span>
        <input className={`tb-input${galat[k] ? " is-invalid" : ""}`} value={isian[k]} onChange={set(k)} placeholder={placeholder} maxLength={150} />
      </div>
      {galat[k] && <div className="invalid-feedback">{galat[k]}</div>}
    </div>
  );

  return (
    <div className="tb-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onTutup()}>
      <form ref={formRef} className="tb-modal" onSubmit={simpan} noValidate role="dialog" aria-modal="true">
        <div className="modal-status" style={{ background: "var(--tb-primary)" }}></div>
        <div className="tb-modal-header">
          <span className={`avatar avatar-rounded ${namaTampil ? warnaDari(namaTampil) : "bg-primary-lt"}`}>{namaTampil ? inisial(namaTampil) : <i className={`bi ${JENIS[jenis].icon}`}></i>}</span>
          <div className="me-auto min-w-0">
            <h5 className="tb-modal-title">{ubah ? `Ubah data ${JENIS[jenis].tunggal}` : "Tambah data keluarga"}</h5>
            <div className="text-secondary small text-truncate">{namaTampil || "Nama akan tampil di sini"}</div>
          </div>
          <button type="button" className="tb-btn tb-btn-ghost tb-btn-icon" onClick={onTutup} aria-label="Tutup"><i className="bi bi-x-lg"></i></button>
        </div>

        <div className="tb-modal-body">
          {!ubah && (
            <div className="form-selectgroup form-selectgroup-boxes mb-4 row g-2 mx-0">
              {[["ortu", "Orang tua kandung", "Ayah dan/atau ibu siswa", "bi-people"], ["wali", "Wali", "Kerabat atau pengasuh yang tinggal bersama siswa", "bi-person-heart"]].map(([id, judul, sub, ikon]) => (
                <label key={id} className="form-selectgroup-item col-sm-6 px-1">
                  <input type="radio" name="jenis" className="form-selectgroup-input" checked={jenis === id} onChange={() => { setJenis(id); setGalat({}); }} />
                  <span className="form-selectgroup-label">
                    <span className="form-selectgroup-check"></span>
                    <span className="flex-grow-1">
                      <span className="d-block fw-semibold"><i className={`bi ${ikon} me-1`}></i>{judul}</span>
                      <span className="d-block text-secondary small">{sub}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {jenis === "ortu" ? (
            <div className="row g-3">
              <div className="col-md-6">
                <div className="form-fieldset h-100">
                  <div className="subheader mb-3"><i className="bi bi-person me-1"></i>Ayah</div>
                  {nama("nama_ayah", "Nama ayah", "bi-person", "Nama lengkap ayah")}
                  <label className="form-label">Pekerjaan</label>
                  {pekerjaan("id_pekerjaan_ayah")}
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-fieldset h-100">
                  <div className="subheader mb-3"><i className="bi bi-person me-1"></i>Ibu</div>
                  {nama("nama_ibu", "Nama ibu", "bi-person", "Nama lengkap ibu")}
                  <label className="form-label">Pekerjaan</label>
                  {pekerjaan("id_pekerjaan_ibu")}
                </div>
              </div>
              <div className="col-12 form-hint mt-1"><i className="bi bi-info-circle me-1"></i>Cukup salah satu nama bila hanya satu orang tua.</div>
            </div>
          ) : (
            <div className="row g-3">
              <div className="col-md-7">{nama("nama_wali", "Nama wali", "bi-person-heart", "Nama lengkap wali")}</div>
              <div className="col-md-5"><label className="form-label">Pekerjaan</label>{pekerjaan("id_pekerjaan_wali")}</div>
            </div>
          )}

          <div className="hr-text">Kontak</div>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Nomor WhatsApp</label>
              <div className="input-group-flat">
                <span className="input-group-text"><i className="bi bi-whatsapp" style={{ color: "var(--tb-green)" }}></i></span>
                <input className={`tb-input${galat.no_wa || !waValid ? " is-invalid" : isian.no_wa ? " is-valid" : ""}`} inputMode="tel" value={isian.no_wa} onChange={set("no_wa")} placeholder="0812 3456 7890" maxLength={20} />
              </div>
              {galat.no_wa || !waValid
                ? <div className="invalid-feedback">{galat.no_wa || "Hanya angka, spasi, atau tanda -, 8–20 digit."}</div>
                : <div className="form-hint">
                    {isian.no_wa ? <>Kabar dikirim ke <b>+{nomorWa(isian.no_wa)}</b> · <a href={`https://wa.me/${nomorWa(isian.no_wa)}`} target="_blank" rel="noreferrer">coba buka chat</a></> : "Dipakai untuk kabar presensi, remedial, dan rapor."}
                  </div>}
            </div>
            <div className="col-md-6">
              <label className="form-label">Alamat</label>
              <textarea className="tb-input" rows={2} value={jenis === "ortu" ? isian.jalan_ortu : isian.jalan_wali} onChange={set(jenis === "ortu" ? "jalan_ortu" : "jalan_wali")} placeholder="Jalan, kampung/kelurahan" maxLength={255} />
            </div>
          </div>

          <div className="hr-text">Anak ({anak.size} dipilih)</div>
          <div className="input-icon mb-2">
            <span className="input-icon-addon"><i className="bi bi-search"></i></span>
            <input type="search" className="tb-input" placeholder="Cari siswa, NISN, atau kelas…" value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <div className="tb-list">
            {siswa.map((s) => {
              const dipilih = anak.has(s.id_siswa);
              const milikLain = s[kunci] && s[kunci] !== baris?.[kunci];
              return (
                <label key={s.id_siswa} className={`tb-list-item${dipilih ? " terpilih" : ""}`}>
                  <input type="checkbox" checked={dipilih} onChange={() => pilihAnak(s.id_siswa)} />
                  <span className={`avatar avatar-sm avatar-rounded ${warnaDari(s.nama_siswa)}`}>{inisial(s.nama_siswa)}</span>
                  <span className="flex-grow-1 min-w-0">
                    <span className="d-block fw-semibold text-truncate">{s.nama_siswa}</span>
                    <span className="d-block text-secondary small">{s.kelas?.nama_kelas || "Tanpa kelas"}{s.nisn ? ` · NISN ${s.nisn}` : ""}</span>
                  </span>
                  {milikLain && (
                    <span className={`tb-badge ${dipilih ? "bg-yellow-lt" : ""}`} style={dipilih ? undefined : { background: "var(--tb-hover)", color: "var(--tb-muted)" }} title={`Saat ini: ${pemilik[s[kunci]] || "keluarga lain"}`}>
                      {dipilih ? <><i className="bi bi-arrow-left-right"></i>Dipindah</> : "Sudah ada"}
                    </span>
                  )}
                </label>
              );
            })}
            {siswa.length === 0 && <div className="text-center text-secondary py-4 small">Tidak ada siswa yang cocok.</div>}
          </div>
          {galat.anak && <div className="invalid-feedback">{galat.anak}</div>}
          {galat.umum && <div className="tb-badge bg-red-lt mt-3 p-2 w-100"><i className="bi bi-exclamation-circle"></i>{galat.umum}</div>}
        </div>

        <div className="tb-modal-footer">
          <span className="text-secondary small d-none d-sm-inline"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> untuk simpan</span>
          <button type="button" className="tb-btn tb-btn-ghost ms-auto" onClick={onTutup}>Batal</button>
          <button type="submit" className="tb-btn tb-btn-primary" disabled={menyimpan}>
            {menyimpan ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-check-lg"></i>}Simpan
          </button>
        </div>
      </form>
    </div>
  );
}

function KonfirmasiHapus({ jenis, baris, onTutup, onTerhapus, onGagal }) {
  const [proses, setProses] = useState(false);
  const nama = namaKeluarga(jenis, baris) || "data ini";
  const hapus = async () => {
    setProses(true);
    try {
      await minta(`${API_URL}/keluarga/${jenis}/${baris[JENIS[jenis].kunci]}`, { method: "DELETE" });
      onTerhapus(`${nama} dihapus.`);
    } catch (e) { onGagal(Object.values(e.errors || {})[0]?.[0] || e.message); }
  };
  return (
    <div className="tb-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onTutup()}>
      <div className="tb-modal tb-modal-sm" role="alertdialog" aria-modal="true">
        <div className="modal-status" style={{ background: "var(--tb-red)" }}></div>
        <div className="tb-modal-body pt-4">
          <span className="avatar avatar-rounded bg-red-lt mb-3" style={{ "--size": "3rem" }}><i className="bi bi-exclamation-triangle"></i></span>
          <h5 className="tb-modal-title mb-2">Hapus {nama}?</h5>
          <div className="text-secondary">
            {baris.akun
              ? "Data ini terhubung ke akun portal, jadi belum bisa dihapus. Hapus atau ubah akunnya dulu di Manajemen Pengguna."
              : baris.anak.length ? `${baris.anak.length} anak akan dilepas dari data ini. Tindakan ini tidak bisa dibatalkan.` : "Tindakan ini tidak bisa dibatalkan."}
          </div>
        </div>
        <div className="tb-modal-footer">
          <button type="button" className="tb-btn flex-fill" onClick={onTutup}>Batal</button>
          {!baris.akun && <button type="button" className="tb-btn tb-btn-danger flex-fill" onClick={hapus} disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-trash3"></i>}Hapus</button>}
        </div>
      </div>
    </div>
  );
}
