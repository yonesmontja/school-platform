"use client";
// Pustaka Dokumen: dokumen & tautan resmi (CP, regulasi, panduan) yang dibaca AI sebagai rujukan saat menyusun
// CP, ATP, modul ajar, dan soal. Admin & kepala sekolah langsung aktif; guru (bila diizinkan admin) disetujui kepala sekolah.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { API_URL, authHeaders, bacaUser } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { AI_MODES, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { MenuAksi, aksiHapus } from "@/components/dashboard/menuAksi";

const JENIS = [
  { value: "CP", label: "Capaian Pembelajaran" },
  { value: "KURIKULUM", label: "Kurikulum / struktur" },
  { value: "REGULASI", label: "Regulasi (Permen, Kepmen, SK)" },
  { value: "PANDUAN", label: "Panduan / modul resmi" },
  { value: "LAINNYA", label: "Lainnya" },
];
const labelJenis = (v) => JENIS.find((j) => j.value === v)?.label || v;
const STATUS = {
  DIAJUKAN: { label: "Menunggu persetujuan", warna: "warning" },
  AKTIF: { label: "Dipakai AI", warna: "success" },
  DITOLAK: { label: "Dikembalikan", warna: "danger" },
  NONAKTIF: { label: "Tidak dipakai", warna: "secondary" },
};
const FASE = ["A", "B", "C"];
const tanggal = (t) => (t ? new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 3500 });

/** Baca teks PDF di browser (pdf.js dari CDN) — dipakai bila server belum bisa membaca PDF. */
async function teksPdfBrowser(file) {
  const versi = "4.10.38";
  const pdfjs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${versi}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${versi}/pdf.worker.min.mjs`;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const halaman = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 300); i++) {
    const isi = await (await pdf.getPage(i)).getTextContent();
    let baris = "";
    for (const it of isi.items) baris += it.str + (it.hasEOL ? "\n" : " ");
    halaman.push(baris);
  }
  return halaman.join("\n\n");
}

const MAKS_MB = 50; // sama dengan DokumenRujukan::MAKS_KB di server
const MAKS_TEKS = 800000; // batas teks hasil baca browser yang diterima server

/**
 * Kirim formulir berkas dengan XMLHttpRequest agar kemajuan unggah bisa ditampilkan (fetch tidak memberi progres);
 * koneksi sekolah bisa butuh beberapa menit untuk berkas puluhan MB.
 */
function kirimForm(path, form, onProgres) {
  return new Promise((selesai, gagal) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    for (const [k, v] of Object.entries(authHeaders(false))) xhr.setRequestHeader(k, v);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgres) onProgres(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
    xhr.upload.onload = () => onProgres?.(100);
    xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah. Periksa internet lalu coba lagi."));
    xhr.ontimeout = () => gagal(new Error("Unggahan terlalu lama (lebih dari 10 menit). Periksa koneksi internet lalu coba lagi."));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText.slice(xhr.responseText.indexOf("{"))); } catch { /* bukan JSON */ }
      if (xhr.status === 413 || /POST data is too large/.test(xhr.responseText)) return gagal(new Error(`Berkas terlalu besar untuk server. Maksimal ${MAKS_MB} MB.`));
      if (xhr.status < 200 || xhr.status >= 300) return gagal(new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || `Gagal (status ${xhr.status}).`));
      selesai(data);
    };
    xhr.send(form);
  });
}

export default function PustakaDokumenPage() {
  return <Suspense fallback={null}><PustakaDokumen /></Suspense>;
}

function PustakaDokumen() {
  const params = useSearchParams();
  const [data, setData] = useState(null);
  const [izin, setIzin] = useState({});
  const [mapel, setMapel] = useState([]);
  const [status, setStatus] = useState(params.get("status") || "");
  const [jenis, setJenis] = useState("");
  const [cari, setCari] = useState("");
  const [form, setForm] = useState(null); // {mode: baru|perbarui|ubah, dokumen?}
  const [detail, setDetail] = useState(null);

  const muat = useCallback(() => {
    minta("GET", "/dokumen-rujukan").then((r) => { setData(r.data); setIzin(r.izin); }).catch((e) => Swal.fire("Gagal memuat", e.message, "error"));
  }, []);
  useEffect(() => { muat(); minta("GET", "/perangkat-ajar/referensi").then((r) => setMapel(r.mapel)).catch(() => {}); }, [muat]);

  const tampil = useMemo(() => (data || []).filter((d) => (!status || d.status === status) && (!jenis || d.jenis === jenis)
    && (!cari || `${d.judul} ${d.nama_berkas || ""} ${d.url_tautan || ""} ${d.mapel?.nama_mapel || ""}`.toLowerCase().includes(cari.toLowerCase()))), [data, status, jenis, cari]);
  const jumlah = useMemo(() => Object.fromEntries(Object.keys(STATUS).map((s) => [s, (data || []).filter((d) => d.status === s).length])), [data]);

  const aturIzin = async (v) => {
    try { const r = await minta("PUT", "/dokumen-rujukan/pengaturan", { guru_boleh_unggah: v }); toast(r.message); muat(); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const aksi = async (d, path, body, konfirmasi) => {
    if (konfirmasi) {
      const ok = await Swal.fire({ title: konfirmasi, icon: "question", showCancelButton: true, confirmButtonText: "Ya", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return;
    }
    try { const r = await minta("POST", `/dokumen-rujukan/${d.id_dokumen}/${path}`, body); toast(r.message); muat(); if (detail?.id_dokumen === d.id_dokumen) bukaDetail(d); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const tolak = async (d) => {
    const { value } = await Swal.fire({ title: "Kembalikan dokumen", input: "textarea", inputLabel: "Catatan untuk pengunggah", inputPlaceholder: "mis. Pakai versi CP terbaru dari BSKAP",
      showCancelButton: true, confirmButtonText: "Kembalikan", cancelButtonText: "Batal", inputValidator: (v) => (!v?.trim() ? "Tulis catatannya" : undefined) });
    if (value) aksi(d, "tolak", { catatan: value });
  };
  const hapus = async (d) => {
    const ok = await Swal.fire({ title: `Hapus "${d.judul}"?`, text: "Dokumen tidak lagi dibaca AI dan berkasnya dihapus.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/dokumen-rujukan/${d.id_dokumen}`); toast("Dokumen dihapus"); setDetail(null); muat(); } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const unduh = async (d) => {
    if (d.sumber_tipe === "TAUTAN") return window.open(d.url_tautan, "_blank", "noopener");
    try {
      const res = await fetch(`${API_URL}/dokumen-rujukan/${d.id_dokumen}/unduh`, { headers: authHeaders(false) });
      if (!res.ok) throw new Error("Berkas tidak bisa diunduh.");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await res.blob()), download: d.nama_berkas || "dokumen" });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const bukaDetail = (d) => minta("GET", `/dokumen-rujukan/${d.id_dokumen}`).then((r) => setDetail(r.data)).catch((e) => Swal.fire("Gagal", e.message, "error"));

  const saya = typeof window !== "undefined" ? bacaUser() : null;
  const milik = (d) => d.diunggah_oleh === saya?.id;
  const itemMenu = (d) => [
    { label: "Lihat isi & analisis", ikon: "bi-eye", onClick: () => bukaDetail(d) },
    { label: d.sumber_tipe === "TAUTAN" ? "Buka tautan" : "Unduh berkas", ikon: d.sumber_tipe === "TAUTAN" ? "bi-box-arrow-up-right" : "bi-download", onClick: () => unduh(d) },
    { label: "Setujui (dipakai AI)", ikon: "bi-check2-circle", tampil: izin.setujui && d.status === "DIAJUKAN", onClick: () => aksi(d, "setujui") },
    { label: "Kembalikan dengan catatan", ikon: "bi-arrow-return-left", tampil: izin.setujui && d.status === "DIAJUKAN", onClick: () => tolak(d) },
    { label: "Unggah versi baru", ikon: "bi-arrow-repeat", tampil: izin.langsung_aktif || (izin.unggah && (milik(d) || d.status === "AKTIF")), onClick: () => setForm({ mode: "perbarui", dokumen: d }) },
    { label: "Ubah keterangan", ikon: "bi-pencil-square", tampil: izin.langsung_aktif || (milik(d) && d.status !== "AKTIF"), onClick: () => setForm({ mode: "ubah", dokumen: d }) },
    { label: "Baca ulang teks", ikon: "bi-file-earmark-text", tampil: !!izin.langsung_aktif, onClick: () => aksi(d, "baca-ulang") },
    { label: d.status === "NONAKTIF" ? "Pakai lagi untuk AI" : "Jangan dipakai AI", ikon: d.status === "NONAKTIF" ? "bi-toggle-on" : "bi-toggle-off",
      tampil: !!izin.langsung_aktif && ["AKTIF", "NONAKTIF"].includes(d.status), onClick: () => aksi(d, "aktifkan", { aktif: d.status === "NONAKTIF" }) },
    aksiHapus(() => hapus(d), izin.langsung_aktif || (milik(d) && d.status !== "AKTIF")),
  ];

  return (
    <div className="container-fluid mb-5">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="fw-bold text-primary mb-1"><i className="bi bi-folder2-open me-2"></i>Pustaka Dokumen</h3>
          <div className="small text-body-secondary">Dokumen dan tautan resmi pemerintah (CP, regulasi, panduan) yang dibaca AI saat menyusun CP, ATP, modul ajar, dan soal.</div>
        </div>
        {izin.unggah && <button className="btn btn-primary" onClick={() => setForm({ mode: "baru" })}><i className="bi bi-cloud-arrow-up me-1"></i>Tambah dokumen</button>}
      </div>

      {izin.atur && (
        <div className="card shadow-sm mb-3"><div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" role="switch" id="izinGuru" checked={!!izin.guru_boleh_unggah} onChange={(e) => aturIzin(e.target.checked)} />
            <label className="form-check-label fw-semibold" htmlFor="izinGuru">Izinkan semua guru mengunggah dan memperbarui dokumen</label>
          </div>
          <span className="small text-body-secondary">Unggahan guru dipakai AI setelah disetujui kepala sekolah.</span>
        </div></div>
      )}
      {!izin.unggah && data && <div className="alert alert-light border small"><i className="bi bi-info-circle me-1"></i>Unggah dokumen saat ini hanya untuk admin dan kepala sekolah. Admin bisa mengizinkan guru mengunggah.</div>}
      {izin.unggah && izin.baca_pdf_server === false && <div className="alert alert-light border small py-2"><i className="bi bi-info-circle me-1"></i>Teks PDF dibaca di browser Anda saat diunggah; tautan PDF perlu diunduh lalu diunggah sebagai berkas.</div>}

      <div className="card shadow-sm">
        <div className="card-header d-flex flex-wrap gap-2 align-items-center">
          <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label="Status">
            <button className={`btn ${!status ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setStatus("")}>Semua <span className="badge text-bg-light ms-1">{data?.length ?? 0}</span></button>
            {Object.entries(STATUS).map(([k, s]) => (
              <button key={k} className={`btn ${status === k ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setStatus(k)}>{s.label} {jumlah[k] > 0 && <span className="badge text-bg-light ms-1">{jumlah[k]}</span>}</button>
            ))}
          </div>
          <select className="form-select form-select-sm w-auto" value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Jenis dokumen">
            <option value="">Semua jenis</option>{JENIS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
          </select>
          <input type="search" className="form-control form-control-sm ms-md-auto" style={{ maxWidth: 260 }} placeholder="Cari judul, berkas, mapel…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari dokumen" />
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light"><tr><th>Dokumen</th><th>Jenis</th><th>Mapel / fase</th><th>Teks</th><th>Status</th><th>Diunggah</th><th className="text-center">Aksi</th></tr></thead>
            <tbody>
              {!data ? <tr><td colSpan={7} className="text-center text-muted py-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</td></tr>
                : !tampil.length ? <tr><td colSpan={7} className="text-center text-muted py-5"><i className="bi bi-folder2 fs-1 d-block mb-2"></i>Belum ada dokumen{status || jenis || cari ? " yang cocok" : ". Tambahkan CP, regulasi, atau panduan resmi agar AI memakainya sebagai rujukan"}.</td></tr>
                : tampil.map((d) => (
                  <tr key={d.id_dokumen}>
                    <td className="min-w-0" style={{ maxWidth: 360 }}>
                      <button type="button" className="btn btn-link p-0 fw-semibold text-start text-decoration-none" onClick={() => bukaDetail(d)}>{d.judul}</button>
                      <div className="small text-body-secondary text-truncate">
                        <i className={`bi ${d.sumber_tipe === "TAUTAN" ? "bi-link-45deg" : "bi-paperclip"} me-1`}></i>
                        {d.sumber_tipe === "TAUTAN" ? (() => { try { return new URL(d.url_tautan).hostname; } catch { return d.url_tautan; } })() : d.nama_berkas}
                        {d.versi > 1 && <span className="ms-1">· versi {d.versi}</span>}
                      </div>
                      {d.status === "DITOLAK" && d.catatan_review && <div className="small text-danger"><i className="bi bi-chat-left-text me-1"></i>{d.catatan_review}</div>}
                    </td>
                    <td><span className="badge text-bg-light border fw-normal">{labelJenis(d.jenis)}</span></td>
                    <td className="small">{d.mapel?.nama_mapel || <span className="text-body-secondary">Semua mapel</span>}{d.fase && <span className="text-body-secondary"> · Fase {d.fase}</span>}</td>
                    <td className="small text-nowrap">{d.status_teks === "TERBACA" ? <span className="text-success"><i className="bi bi-check2 me-1"></i>{d.jumlah_karakter.toLocaleString("id-ID")} karakter</span>
                      : <span className="text-danger" title="Teks belum bisa dibaca AI"><i className="bi bi-exclamation-triangle me-1"></i>Belum terbaca</span>}</td>
                    <td><span className={`badge text-bg-${STATUS[d.status]?.warna}`}>{STATUS[d.status]?.label}</span></td>
                    <td className="small text-nowrap">{d.pengunggah?.name || "-"}<div className="text-body-secondary">{tanggal(d.updated_at)}</div></td>
                    <td className="text-center"><MenuAksi label={`Aksi dokumen ${d.judul}`} items={itemMenu(d)} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <UjiPencarian mapel={mapel} />

      {form && <FormDokumen form={form} mapel={mapel} izin={izin} onTutup={() => setForm(null)} onSelesai={() => { setForm(null); muat(); }} />}
      {detail && <DetailDokumen d={detail} izin={izin} milik={milik(detail)} onTutup={() => setDetail(null)} onBerubah={(x) => { setDetail(x); muat(); }} onSetujui={() => aksi(detail, "setujui")} onTolak={() => tolak(detail)} onUnduh={() => unduh(detail)} />}
    </div>
  );
}

function FormDokumen({ form, mapel, izin, onTutup, onSelesai }) {
  const d = form.dokumen;
  const [f, setF] = useState({ judul: d?.judul || "", jenis: d?.jenis || "CP", id_mapel: d?.id_mapel || "", fase: d?.fase || "", keterangan: d?.keterangan || "",
    sumber: d?.sumber_tipe === "TAUTAN" ? "tautan" : "berkas", url: d?.url_tautan || "", berkas: null });
  const [proses, setProses] = useState("");
  const ubah = (x) => setF((v) => ({ ...v, ...x }));
  const judulForm = { baru: "Tambah dokumen", perbarui: "Unggah versi baru", ubah: "Ubah keterangan dokumen" }[form.mode];

  const simpan = async (e) => {
    e.preventDefault();
    try {
      if (form.mode === "ubah") {
        setProses("Menyimpan…");
        await minta("PUT", `/dokumen-rujukan/${d.id_dokumen}`, { judul: f.judul, jenis: f.jenis, id_mapel: f.id_mapel || null, fase: f.fase || null, keterangan: f.keterangan || null });
        toast("Keterangan disimpan"); return onSelesai();
      }
      if (f.sumber === "berkas" && !f.berkas) return Swal.fire("Perhatian", "Pilih berkas PDF, DOCX, atau TXT.", "warning");
      if (f.sumber === "berkas" && f.berkas.size > MAKS_MB * 1024 * 1024) {
        return Swal.fire("Berkas terlalu besar", `Ukuran berkas ${(f.berkas.size / 1024 / 1024).toFixed(1)} MB, maksimal ${MAKS_MB} MB. Unduh versi yang lebih kecil dari situs resmi, atau pakai tab "Tautan resmi".`, "warning");
      }
      const fd = new FormData();
      [["judul", f.judul], ["jenis", f.jenis], ["id_mapel", f.id_mapel], ["fase", f.fase], ["keterangan", f.keterangan]].forEach(([k, v]) => v && fd.append(k, v));
      if (f.sumber === "berkas") {
        fd.append("berkas", f.berkas);
        if (/\.pdf$/i.test(f.berkas.name) && !izin.baca_pdf_server) {
          setProses("Membaca teks PDF…");
          try { fd.append("teks", (await teksPdfBrowser(f.berkas)).slice(0, MAKS_TEKS)); } catch { /* server menandai "belum terbaca" */ }
        }
      } else fd.append("url_tautan", f.url);
      setProses(f.sumber === "tautan" ? "Membuka tautan…" : "Mengunggah…");
      const progres = f.sumber === "berkas" ? (p) => setProses(p >= 100 ? "Memproses di server…" : `Mengunggah… ${p}%`) : null;
      const r = await kirimForm(form.mode === "perbarui" ? `/dokumen-rujukan/${d.id_dokumen}/perbarui` : "/dokumen-rujukan", fd, progres);
      Swal.fire({ icon: r.data?.status_teks === "TERBACA" ? "success" : "warning", title: "Tersimpan", text: r.message });
      onSelesai();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(""); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={judulForm}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header"><h5 className="modal-title fw-bold"><i className="bi bi-cloud-arrow-up text-primary me-2"></i>{judulForm}</h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={!!proses} aria-label="Tutup"></button></div>
            <div className="modal-body">
              {!izin.langsung_aktif && form.mode !== "ubah" && <div className="alert alert-info small py-2"><i className="bi bi-info-circle me-1"></i>Dokumen Anda diajukan ke kepala sekolah dan dipakai AI setelah disetujui.</div>}
              {form.mode !== "ubah" && (
                <>
                  <ul className="nav nav-pills nav-fill small mb-3" role="tablist">
                    <li className="nav-item"><button type="button" role="tab" aria-selected={f.sumber === "berkas"} className={`nav-link ${f.sumber === "berkas" ? "active" : ""}`} onClick={() => ubah({ sumber: "berkas" })}><i className="bi bi-paperclip me-1"></i>Unggah berkas</button></li>
                    <li className="nav-item"><button type="button" role="tab" aria-selected={f.sumber === "tautan"} className={`nav-link ${f.sumber === "tautan" ? "active" : ""}`} onClick={() => ubah({ sumber: "tautan" })}><i className="bi bi-link-45deg me-1"></i>Tautan resmi</button></li>
                  </ul>
                  {f.sumber === "berkas" ? (
                    <div className="mb-3">
                      <label className="form-label small mb-1" htmlFor="dokBerkas">Berkas (PDF, DOCX, TXT; maks. {MAKS_MB} MB)</label>
                      <input id="dokBerkas" type="file" className="form-control" accept=".pdf,.docx,.txt,.md" onChange={(e) => { const b = e.target.files?.[0] || null; ubah({ berkas: b, judul: f.judul || (b ? b.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") : "") }); }} />
                      <div className="form-text">PDF hasil pindai (foto) belum bisa dibaca; pakai PDF berteks dari situs resmi.</div>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <label className="form-label small mb-1" htmlFor="dokUrl">Alamat tautan</label>
                      <input id="dokUrl" type="url" className="form-control" required placeholder="https://kurikulum.kemendikdasmen.go.id/…" value={f.url} onChange={(e) => ubah({ url: e.target.value })} />
                      <div className="form-text">Halaman web atau PDF dari situs pemerintah. Isinya dibaca sekali saat disimpan; tekan Unggah versi baru bila halamannya berubah.</div>
                    </div>
                  )}
                </>
              )}
              <div className="row g-2">
                <div className="col-12"><label className="form-label small mb-1" htmlFor="dokJudul">Judul</label>
                  <input id="dokJudul" className="form-control" required maxLength={200} value={f.judul} onChange={(e) => ubah({ judul: e.target.value })} placeholder="mis. CP Bahasa Inggris Fase B (Keputusan Kepala BSKAP 046/2025)" /></div>
                <div className="col-md-4"><label className="form-label small mb-1" htmlFor="dokJenis">Jenis</label>
                  <select id="dokJenis" className="form-select" value={f.jenis} onChange={(e) => ubah({ jenis: e.target.value })}>{JENIS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}</select></div>
                <div className="col-md-5"><label className="form-label small mb-1" htmlFor="dokMapel">Mata pelajaran</label>
                  <select id="dokMapel" className="form-select" value={f.id_mapel} onChange={(e) => ubah({ id_mapel: e.target.value })}>
                    <option value="">Semua mapel (dokumen umum)</option>{mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                  </select></div>
                <div className="col-md-3"><label className="form-label small mb-1" htmlFor="dokFase">Fase</label>
                  <select id="dokFase" className="form-select" value={f.fase} onChange={(e) => ubah({ fase: e.target.value })}>
                    <option value="">Semua fase</option>{FASE.map((x) => <option key={x} value={x}>Fase {x}</option>)}
                  </select></div>
                <div className="col-12"><label className="form-label small mb-1" htmlFor="dokKet">Keterangan (opsional)</label>
                  <textarea id="dokKet" className="form-control" rows={2} maxLength={2000} value={f.keterangan} onChange={(e) => ubah({ keterangan: e.target.value })} placeholder="mis. berlaku mulai tahun ajaran 2025/2026" /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={!!proses}>Batal</button>
              <button className="btn btn-primary" disabled={!!proses}>{proses ? <><span className="spinner-border spinner-border-sm me-1"></span>{proses}</> : <><i className="bi bi-save me-1"></i>{form.mode === "ubah" ? "Simpan" : izin.langsung_aktif ? "Simpan" : "Ajukan"}</>}</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

function DetailDokumen({ d, izin, milik, onTutup, onBerubah, onSetujui, onTolak, onUnduh }) {
  const [mode, setMode] = useState(bacaAiMode);
  const [proses, setProses] = useState(false);
  const analisis = async () => {
    simpanAiMode(mode); setProses(true);
    try { const r = await minta("POST", `/dokumen-rujukan/${d.id_dokumen}/analisis`, { ai_mode: mode }); toast(r.message); const x = await minta("GET", `/dokumen-rujukan/${d.id_dokumen}`); onBerubah(x.data); }
    catch (e) { Swal.fire("AI belum berhasil", e.message, "warning"); }
    finally { setProses(false); }
  };
  return (
    <>
      <div className="offcanvas offcanvas-end show log-drawer" tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Dokumen ${d.judul}`}>
        <div className="offcanvas-header border-bottom">
          <div className="min-w-0"><h5 className="offcanvas-title fw-bold text-truncate">{d.judul}</h5>
            <div className="small"><span className={`badge text-bg-${STATUS[d.status]?.warna} me-1`}>{STATUS[d.status]?.label}</span>{labelJenis(d.jenis)}{d.versi > 1 && ` · versi ${d.versi}`}</div></div>
          <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button>
        </div>
        <div className="offcanvas-body">
          <dl className="row small log-meta mb-2">
            <dt className="col-4">Mapel / fase</dt><dd className="col-8">{d.mapel?.nama_mapel || "Semua mapel"}{d.fase ? ` · Fase ${d.fase}` : ""}</dd>
            <dt className="col-4">Sumber</dt><dd className="col-8 text-break">{d.sumber_tipe === "TAUTAN" ? d.url_tautan : `${d.nama_berkas} (${d.ukuran_kb?.toLocaleString("id-ID")} KB)`}</dd>
            <dt className="col-4">Diunggah</dt><dd className="col-8">{d.pengunggah?.name || "-"} · {tanggal(d.created_at)}</dd>
            {d.penyetuju && <><dt className="col-4">Disetujui</dt><dd className="col-8">{d.penyetuju.name} · {tanggal(d.disetujui_pada)}</dd></>}
            {d.keterangan && <><dt className="col-4">Keterangan</dt><dd className="col-8">{d.keterangan}</dd></>}
            {d.catatan_review && <><dt className="col-4">Catatan</dt><dd className="col-8 text-danger">{d.catatan_review}</dd></>}
          </dl>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button className="btn btn-sm btn-outline-secondary" onClick={onUnduh}><i className={`bi ${d.sumber_tipe === "TAUTAN" ? "bi-box-arrow-up-right" : "bi-download"} me-1`}></i>{d.sumber_tipe === "TAUTAN" ? "Buka tautan" : "Unduh"}</button>
            {izin.setujui && d.status === "DIAJUKAN" && <>
              <button className="btn btn-sm btn-success" onClick={onSetujui}><i className="bi bi-check2-circle me-1"></i>Setujui</button>
              <button className="btn btn-sm btn-outline-danger" onClick={onTolak}><i className="bi bi-arrow-return-left me-1"></i>Kembalikan</button>
            </>}
          </div>

          <h6 className="fw-bold"><i className="bi bi-stars text-primary me-1"></i>Analisis AI</h6>
          {d.ringkasan ? <div className="small border rounded p-2 bg-body-tertiary mb-2" style={{ whiteSpace: "pre-wrap" }}>{d.ringkasan}</div>
            : <div className="small text-body-secondary mb-2">Belum dianalisis. Analisis merangkum isi pokok dan memeriksa bahwa teks dokumen terbaca dengan benar.</div>}
          {(izin.langsung_aktif || milik) && d.status_teks === "TERBACA" && (
            <div className="d-flex gap-2 mb-3">
              <select className="form-select form-select-sm w-auto" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Penyedia AI">{AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
              <button className="btn btn-sm btn-outline-primary" onClick={analisis} disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}{d.ringkasan ? "Analisis ulang" : "Analisis dengan AI"}</button>
            </div>
          )}

          <h6 className="fw-bold">Teks yang dibaca AI <span className="fw-normal small text-body-secondary">({(d.jumlah_karakter || 0).toLocaleString("id-ID")} karakter, {d.potongan_count} bagian)</span></h6>
          {d.status_teks === "TERBACA" ? <pre className="log-json small border rounded p-2 bg-body-tertiary" style={{ maxHeight: 360 }}>{d.cuplikan}{d.jumlah_karakter > 6000 ? "\n\n…" : ""}</pre>
            : <div className="alert alert-warning small">Teks belum terbaca, jadi dokumen ini belum bisa dipakai AI. Unggah PDF berteks (bukan hasil pindai) atau DOCX.</div>}
        </div>
      </div>
      <div className="offcanvas-backdrop fade show" onClick={onTutup}></div>
    </>
  );
}

/** Pratinjau: bagian dokumen mana yang akan dibaca AI untuk sebuah topik. */
function UjiPencarian({ mapel }) {
  const [kueri, setKueri] = useState("");
  const [idMapel, setIdMapel] = useState("");
  const [hasil, setHasil] = useState(null);
  const uji = async (e) => {
    e.preventDefault();
    try { setHasil((await minta("POST", "/dokumen-rujukan/cari", { kueri, id_mapel: idMapel || null })).data); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  return (
    <details className="card shadow-sm mt-3">
      <summary className="card-header fw-semibold" style={{ cursor: "pointer" }}><i className="bi bi-search me-1"></i>Uji: bagian dokumen mana yang dibaca AI?</summary>
      <div className="card-body">
        <form className="d-flex flex-wrap gap-2 mb-2" onSubmit={uji}>
          <input className="form-control form-control-sm" style={{ maxWidth: 360 }} required value={kueri} onChange={(e) => setKueri(e.target.value)} placeholder="mis. capaian bahasa inggris fase A menyimak" aria-label="Topik uji" />
          <select className="form-select form-select-sm w-auto" value={idMapel} onChange={(e) => setIdMapel(e.target.value)} aria-label="Mapel uji"><option value="">Semua mapel</option>{mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}</select>
          <button className="btn btn-sm btn-outline-primary"><i className="bi bi-search me-1"></i>Uji</button>
        </form>
        {hasil && (hasil.sumber.length
          ? <><div className="small mb-1">Dibaca dari: {hasil.sumber.map((s) => <span key={s.id_dokumen} className="badge text-bg-light border fw-normal me-1">{s.judul}</span>)}</div>
            <pre className="log-json small border rounded p-2 bg-body-tertiary" style={{ maxHeight: 260 }}>{hasil.teks}</pre></>
          : <div className="small text-body-secondary">Tidak ada dokumen aktif yang cocok dengan topik ini.</div>)}
      </div>
    </details>
  );
}
