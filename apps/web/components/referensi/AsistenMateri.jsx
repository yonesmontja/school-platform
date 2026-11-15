"use client";
// Asisten form Materi: rujukan TP dari perangkat ajar (tanpa AI), saran TP/IKTP/bobot STNKM dari AI, dan "Bikin pakai AI".
// Semua hasil hanya usulan; guru mencentang lalu menyimpan form seperti biasa.
import { useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { AI_MODES, simpanAiMode } from "@/components/banksoal/konstanta";

export const BOBOT = [
  { k: "S", key: "mat_S", label: "Skill", warna: "primary" },
  { k: "T", key: "mat_T", label: "Teori", warna: "success" },
  { k: "N", key: "mat_N", label: "Nalar", warna: "info" },
  { k: "K", key: "mat_K", label: "Karakter", warna: "warning" },
  { k: "M", key: "mat_M", label: "Minat", warna: "danger" },
];
const WARNA_DIMENSI = Object.fromEntries(BOBOT.map((b) => [b.k, b.warna]));

const SUMBER_TP = {
  ATP: { ikon: "bi-diagram-3", warna: "primary" },
  PETA_TEMA: { ikon: "bi-bullseye", warna: "success" },
  MODUL: { ikon: "bi-journal-richtext", warna: "info" },
  MATERI: { ikon: "bi-journal-bookmark", warna: "secondary" },
  CP: { ikon: "bi-flag", warna: "warning" },
  AI: { ikon: "bi-stars", warna: "success" },
};

/** Isian form yang dikirim ke asisten. */
export const isianAsisten = (f) => ({
  id_materi: f.id_materi || null,
  id_mapel: f.id_mapel,
  id_kelas: f.id_kelas || null,
  id_periode: f.id_periode || null,
  id_kategori: f.id_kategori || null,
  nama_materi: f.nama_materi || "",
  deskripsi_kompetensi: f.deskripsi_kompetensi || "",
  indikator: (f.indikator || []).filter((i) => i.deskripsi?.trim()).map((i) => ({ deskripsi: i.deskripsi })),
});

/** Kelengkapan materi sesuai isian form: TP, minimal satu IKTP aktif, dan bobot STNKM yang sudah diatur (bukan semuanya 100%). */
export function kelengkapanMateri(m) {
  const kurang = [];
  if (!String(m.deskripsi_kompetensi || "").trim()) kurang.push("TP");
  if (!(m.indikator || []).some((i) => i.aktif !== false)) kurang.push("IKTP");
  const nilai = BOBOT.map((b) => parseFloat(m[b.key]));
  if (nilai.every((v) => !Number.isFinite(v) || v === 1)) kurang.push("bobot STNKM");
  return { lengkap: kurang.length === 0, kurang };
}

const toast = (icon, title) => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 3500 });

export function PilihAI({ aiMode, setAiMode }) {
  return (
    <select className="form-select form-select-sm" style={{ maxWidth: 190 }} aria-label="Penyedia AI" value={aiMode}
      onChange={(e) => { setAiMode(e.target.value); simpanAiMode(e.target.value); }}>
      {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );
}

/** Tombol "Bikin pakai AI": mengisi nama (bila kosong), TP, IKTP baru, dan bobot STNKM sekaligus. */
export function TombolBikinAI({ form, aiMode, onHasil }) {
  const [sibuk, setSibuk] = useState(false);
  const siap = form.id_mapel && form.id_kelas && form.id_periode && form.id_kategori;

  const jalan = async () => {
    if (!siap) return Swal.fire("Lengkapi dulu", "Pilih Mata Pelajaran, Kelas, Periode, dan High Level agar AI tahu alur ATP dan Peta Tema yang dirujuk.", "info");
    const sudahIsi = form.deskripsi_kompetensi?.trim() || (form.indikator || []).length;
    if (sudahIsi) {
      const ok = await Swal.fire({
        title: "Isi form dengan AI?", icon: "question", showCancelButton: true, confirmButtonText: "Ya, isi", cancelButtonText: "Batal",
        html: "<div class='text-start small'>TP dan bobot STNKM akan diganti usulan AI. IKTP usulan <b>ditambahkan</b>; IKTP yang sudah ada tidak dihapus. Anda tetap bisa mengubah semuanya sebelum Simpan.</div>",
      });
      if (!ok.isConfirmed) return;
    }
    setSibuk(true);
    try {
      const r = await minta("POST", "/materi/asisten-ai", { ...isianAsisten(form), bagian: "semua", ai_mode: aiMode });
      onHasil(r.data);
      toast("success", "Form terisi dari AI. Periksa, ubah bila perlu, lalu Simpan.");
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setSibuk(false); }
  };

  return (
    <button type="button" className="btn btn-sm btn-success" onClick={jalan} disabled={sibuk} title={siap ? "Isi seluruh form dengan bantuan AI" : "Pilih mapel, kelas, periode, dan High Level dulu"}>
      {sibuk ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> : <i className="bi bi-magic me-1"></i>}
      {sibuk ? "AI sedang menyusun…" : "Bikin pakai AI"}
    </button>
  );
}

/** Daftar centang TP: rujukan dari perangkat ajar (tanpa AI) + saran AI. Yang dicentang dimasukkan ke kolom TP. */
export function BantuTp({ form, aiMode, onPakai }) {
  const [daftar, setDaftar] = useState(null); // [{teks, sumber, label}]
  const [pilih, setPilih] = useState({});
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState("");

  const muatRujukan = async () => {
    if (!form.id_mapel) return Swal.fire("Pilih mapel dulu", "Rujukan TP diambil dari perangkat ajar mapel dan kelas yang dipilih.", "info");
    setSibuk("rujukan");
    try {
      const r = await minta("POST", "/materi/rujukan-tp", isianAsisten(form));
      setDaftar((lama) => [...(lama || []).filter((x) => x.sumber === "AI"), ...r.data]);
      setPesan(r.message || "");
    } catch (err) { Swal.fire("Gagal memuat rujukan", err.message, "warning"); }
    finally { setSibuk(""); }
  };

  const saranAI = async () => {
    if (!form.id_mapel) return Swal.fire("Pilih mapel dulu", "AI butuh mapel, kelas, dan High Level untuk menyusun TP.", "info");
    setSibuk("ai");
    try {
      const r = await minta("POST", "/materi/asisten-ai", { ...isianAsisten(form), bagian: "tp", ai_mode: aiMode });
      const saran = (r.data.tp_saran || []).map((teks) => ({ teks, sumber: "AI", label: "Saran AI" }));
      setDaftar((lama) => [...saran, ...(lama || []).filter((x) => x.sumber !== "AI")]);
      setPesan(r.data.alasan || "");
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setSibuk(""); }
  };

  const dipilih = (daftar || []).filter((_, i) => pilih[i]);
  const masukkan = () => {
    if (!dipilih.length) return;
    onPakai(dipilih.map((x) => x.teks));
    setPilih({});
    setDaftar(null);
    toast("success", `${dipilih.length} TP dimasukkan. Anda bisa menyuntingnya di kolom TP.`);
  };

  return (
    <div className="mt-2" id="bantu-tp">
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={muatRujukan} disabled={!!sibuk}>
          {sibuk === "rujukan" ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-list-check me-1"></i>}
          Pilih dari perangkat ajar
        </button>
        <button type="button" className="btn btn-sm btn-outline-success" onClick={saranAI} disabled={!!sibuk}>
          {sibuk === "ai" ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}
          Saran TP (AI)
        </button>
        <span className="small text-muted">Rujukan: ATP, Peta Tema, modul ajar, materi lain, dan CP. Belum ada? Tulis sendiri.</span>
      </div>

      {daftar && (
        <div className="border rounded-3 p-2 mt-2 bg-light-subtle">
          {pesan && <div className="small text-muted mb-2"><i className="bi bi-info-circle me-1"></i>{pesan}</div>}
          {daftar.length === 0 ? (
            !pesan && <div className="small fst-italic text-muted">Tidak ada rujukan.</div>
          ) : (
            <ul className="list-unstyled mb-2 d-flex flex-column gap-1" style={{ maxHeight: 260, overflowY: "auto" }}>
              {daftar.map((x, i) => {
                const s = SUMBER_TP[x.sumber] || SUMBER_TP.MATERI;
                return (
                  <li key={`${x.sumber}-${i}`}>
                    <label className="d-flex gap-2 align-items-start small" style={{ cursor: "pointer" }}>
                      <input type="checkbox" className="form-check-input mt-1 flex-shrink-0" checked={!!pilih[i]} onChange={(e) => setPilih((p) => ({ ...p, [i]: e.target.checked }))} />
                      <span className="flex-grow-1">
                        {x.teks}
                        <span className={`badge bg-${s.warna}-subtle text-${s.warna}-emphasis border ms-2 fw-normal`}><i className={`bi ${s.ikon} me-1`}></i>{x.label}</span>
                        {x.dipakai && <span className="badge text-bg-light border ms-1 fw-normal">sudah di TP</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={() => { setDaftar(null); setPilih({}); }}>Tutup</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={masukkan} disabled={!dipilih.length}>
              <i className="bi bi-box-arrow-in-down me-1"></i>Masukkan {dipilih.length || ""} TP ke kolom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Saran IKTP + bobot STNKM dari AI berdasarkan TP yang ditulis; guru mencentang lalu menambahkannya. */
export function SaranIktp({ form, aiMode, onTambah }) {
  const [hasil, setHasil] = useState(null); // {iktp[], bobot, alasan, sumber[]}
  const [pilih, setPilih] = useState({});
  const [pakaiBobot, setPakaiBobot] = useState(true);
  const [sibuk, setSibuk] = useState(false);

  const minta_ = async () => {
    if (!form.id_mapel) return Swal.fire("Pilih mapel dulu", "AI butuh mapel, kelas, dan TP untuk menyusun IKTP.", "info");
    if (!form.deskripsi_kompetensi?.trim() && !form.nama_materi?.trim()) {
      return Swal.fire("Tulis TP dulu", "IKTP diturunkan dari Tujuan Pembelajaran. Isi kolom TP (atau minimal Nama Materi), lalu coba lagi.", "info");
    }
    setSibuk(true);
    try {
      const r = await minta("POST", "/materi/asisten-ai", { ...isianAsisten(form), bagian: "iktp", ai_mode: aiMode });
      setHasil(r.data);
      setPilih(Object.fromEntries((r.data.iktp || []).map((_, i) => [i, true])));
      setPakaiBobot(!!r.data.bobot);
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setSibuk(false); }
  };

  const iktp = hasil?.iktp || [];
  const dipilih = iktp.filter((_, i) => pilih[i]);
  const tambah = () => {
    onTambah(dipilih.map((x) => x.deskripsi), pakaiBobot ? hasil.bobot : null);
    toast("success", `${dipilih.length} IKTP ditambahkan${pakaiBobot && hasil.bobot ? " dan bobot STNKM diatur" : ""}. Jangan lupa Simpan.`);
    setHasil(null);
  };

  return (
    <div className="mb-2" id="saran-iktp">
      <button type="button" className="btn btn-sm btn-outline-success" onClick={minta_} disabled={sibuk}>
        {sibuk ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}
        {sibuk ? "AI menganalisis TP…" : "Saran IKTP & bobot (AI)"}
      </button>
      <span className="small text-muted ms-2">AI membaca TP di atas, alur ATP, dan Peta Tema mapel ini.</span>

      {hasil && (
        <div className="border rounded-3 p-2 mt-2 bg-light-subtle">
          {hasil.sumber?.length > 0 && <div className="small text-muted mb-1">Dasar analisis: {hasil.sumber.join(", ")}.</div>}
          {iktp.length === 0 ? <div className="small fst-italic text-muted">AI tidak menemukan IKTP baru (semua sudah ada).</div> : (
            <ul className="list-unstyled mb-2 d-flex flex-column gap-1">
              {iktp.map((x, i) => (
                <li key={i}>
                  <label className="d-flex gap-2 align-items-start small" style={{ cursor: "pointer" }}>
                    <input type="checkbox" className="form-check-input mt-1 flex-shrink-0" checked={!!pilih[i]} onChange={(e) => setPilih((p) => ({ ...p, [i]: e.target.checked }))} />
                    <span className="flex-grow-1">{x.deskripsi}
                      {x.dimensi && <span className={`badge bg-${WARNA_DIMENSI[x.dimensi]} ms-2`} title="Aspek STNKM yang paling diukur">{x.dimensi}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {hasil.bobot && (
            <label className="d-flex flex-wrap gap-2 align-items-center small border-top pt-2" style={{ cursor: "pointer" }}>
              <input type="checkbox" className="form-check-input mt-0" checked={pakaiBobot} onChange={(e) => setPakaiBobot(e.target.checked)} />
              <span>Atur bobot STNKM sesuai rekomendasi:</span>
              {BOBOT.map((b) => hasil.bobot[b.k] != null && (
                <span key={b.k} className={`badge bg-${b.warna}`}>{Math.round(hasil.bobot[b.k] * 100)}%{b.k}</span>
              ))}
            </label>
          )}
          {hasil.alasan && <div className="small text-muted mt-1"><i className="bi bi-lightbulb me-1"></i>{hasil.alasan}</div>}
          <div className="d-flex gap-2 justify-content-end mt-2">
            <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={() => setHasil(null)}>Tutup</button>
            <button type="button" className="btn btn-sm btn-success" onClick={tambah} disabled={!dipilih.length && !(pakaiBobot && hasil.bobot)}>
              <i className="bi bi-check2-square me-1"></i>Tambahkan {dipilih.length} IKTP{pakaiBobot && hasil.bobot ? " & atur bobot" : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
