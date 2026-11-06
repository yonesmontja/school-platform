"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders } from "@/app/lib/akses";
import { API_ORIGIN } from "@/app/lib/config";

// Opsi tindak lanjut bagi siswa yang belum mencapai KKM (nama harus sama dengan TransRencanaRemedial::OPSI)
export const OPSI_TINDAK_LANJUT = [
  { nama: "Pengulangan Materi", ikon: "bi-arrow-repeat", ket: "Menjelaskan ulang materi dengan metode atau pendekatan yang berbeda.", kelompok: true },
  { nama: "Tugas Tambahan", ikon: "bi-journal-plus", ket: "Latihan atau tugas yang berfokus pada indikator yang belum tuntas." },
  { nama: "Tes Ulang", ikon: "bi-clipboard-check", ket: "Kesempatan mengerjakan ulang tes pada materi yang sama untuk memperbaiki nilai." },
  { nama: "Bimbingan Individual", ikon: "bi-person-heart", ket: "Pendampingan personal untuk mendiagnosis kesulitan belajar siswa." },
  { nama: "Tutor Sebaya", ikon: "bi-people", ket: "Siswa yang sudah tuntas membantu menjelaskan materi kepada temannya.", kelompok: true },
  { nama: "Kelompok Kecil", ikon: "bi-diagram-3", ket: "Siswa dengan kesulitan serupa dibimbing bersama secara intensif.", kelompok: true },
  { nama: "Media / Alat Peraga", ikon: "bi-easel2", ket: "Memakai media atau alat peraga yang lebih konkret untuk konsep yang sulit." },
];

export const STATUS_RENCANA = {
  DIRENCANAKAN: { label: "Dalam Remedial", warna: "warning", ikon: "bi-hourglass-split" },
  SELESAI: { label: "Remedial Selesai", warna: "success", ikon: "bi-check2-circle" },
};

const besok = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const BUKTI_MAX_MB = 10;

/**
 * Bukti pelaksanaan sebuah rencana: lampiran sesi Jadwal bila rencana punya sesi (satu berkas untuk
 * semua siswa di sesi itu), atau bukti milik rencana sendiri.
 */
export const buktiRencana = (r) => {
  if (!r) return null;
  if (r.id_jadwal) return r.jadwal?.lampiran_url ? { url: r.jadwal.lampiran_url, nama: r.jadwal.lampiran_nama, di_jadwal: true } : null;
  return r.bukti_url ? { url: r.bukti_url, nama: r.bukti_nama, di_jadwal: false } : null;
};
const urlBukti = (url) => (url?.startsWith("/storage/") ? `${API_ORIGIN}${url}` : url);

const jamDari = (dt) => (dt ? String(dt).slice(11, 16) : "");
const angka = (v) => (Number.isInteger(Number(v)) ? Number(v) : Number(v).toFixed(1));

/**
 * Rencana tindak lanjut remedial.
 * - target.mode "baru": items = [{ id_nilai, nama_siswa, nilai }] (satu siswa atau kelompok, bisa dicentang)
 * - target.mode "ubah": rencana = baris trans_rencana_remedial (+ relasi jadwal), item = { nama_siswa, nilai }
 */
export default function ModalTindakLanjut({ target, kkm, onTutup, onTersimpan }) {
  const ubah = target.mode === "ubah";
  const rencana = target.rencana;
  const [dipilih, setDipilih] = useState(() => (ubah ? [] : target.items.map((i) => i.id_nilai)));
  const [form, setForm] = useState(() => ({
    opsi_tindakan: rencana?.opsi_tindakan || (target.items?.length > 1 ? "Kelompok Kecil" : "Bimbingan Individual"),
    catatan: rencana?.catatan || "",
    tanggal_rencana: rencana?.tanggal_rencana?.slice(0, 10) || besok(),
    masuk_jadwal: ubah ? !!rencana?.id_jadwal : true,
    jam_mulai: jamDari(rencana?.jadwal?.mulai) || "13:00",
    jam_selesai: jamDari(rencana?.jadwal?.selesai) || "14:00",
    id_ruangan: rencana?.jadwal?.id_ruangan || "",
  }));
  const [ruangan, setRuangan] = useState([]);
  const [proses, setProses] = useState(false);
  const [kabariOrtu, setKabariOrtu] = useState(true);
  const [bukti, setBukti] = useState(() => buktiRencana(rencana));
  const [buktiBerubah, setBuktiBerubah] = useState(false);
  const [tautanBukti, setTautanBukti] = useState("");
  // Daftar di halaman dimuat ulang saat ditutup bila bukti berubah
  const tutup = () => (buktiBerubah ? onTersimpan() : onTutup());

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") tutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    fetch(`${API_URL}/ruangan`, { headers: authHeaders(false) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRuangan(d?.data || []))
      .catch(() => setRuangan([]));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const opsiAktif = OPSI_TINDAK_LANJUT.find((o) => o.nama === form.opsi_tindakan);
  const jumlah = ubah ? 1 : dipilih.length;

  const kirim = async (method, url, body) => {
    const res = await fetch(url, { method, headers: authHeaders(), body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Terjadi kesalahan pada server");
    return data;
  };

  const simpan = async (e) => {
    e.preventDefault();
    if (!ubah && dipilih.length === 0) return Swal.fire("Pilih siswa", "Centang minimal satu siswa.", "warning");
    setProses(true);
    try {
      const body = { ...form, id_ruangan: form.id_ruangan || null };
      const data = ubah
        ? await kirim("PUT", `${API_URL}/remedial/${rencana.id_rencana}`, body)
        : await kirim("POST", `${API_URL}/remedial`, { ...body, id_nilai: dipilih });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2500 });
      // Rencana baru: halaman membuka panel WA orang tua untuk rencana yang baru dibuat
      onTersimpan(!ubah && kabariOrtu ? { jenis: "RENCANA", idRencana: (data.data || []).map((r) => r.id_rencana) } : null);
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setProses(false); }
  };

  const kirimBukti = async (body) => {
    setProses(true);
    try {
      const data = await kirim("POST", `${API_URL}/remedial/${rencana.id_rencana}/bukti`, body);
      setBukti(data.data);
      setBuktiBerubah(true);
      setTautanBukti("");
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2500 });
    } catch (err) { Swal.fire("Gagal Mengunggah", err.message, "error"); }
    finally { setProses(false); }
  };

  const pilihBerkas = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > BUKTI_MAX_MB * 1024 * 1024) return Swal.fire("File Terlalu Besar", `Maksimal ${BUKTI_MAX_MB}MB`, "warning");
    if (bukti?.di_jadwal) {
      const ok = await Swal.fire({
        title: "Ganti lampiran sesi?", icon: "question", showCancelButton: true, confirmButtonText: "Ya, ganti", cancelButtonText: "Batal",
        text: `Bukti disimpan sebagai lampiran sesi di Jadwal. Lampiran "${bukti.nama || "sebelumnya"}" akan diganti untuk semua siswa di sesi ini.`,
      });
      if (!ok.isConfirmed) return;
    }
    const reader = new FileReader();
    reader.onload = () => kirimBukti({ lampiran_base64: reader.result, lampiran_nama: file.name });
    reader.readAsDataURL(file);
  };

  const hapusBukti = async () => {
    const ok = await Swal.fire({
      title: "Hapus bukti?", icon: "warning", showCancelButton: true, confirmButtonText: "Ya, hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545",
      text: bukti?.di_jadwal ? "Lampiran sesi di Jadwal ikut terhapus untuk semua siswa di sesi ini." : "",
    });
    if (!ok.isConfirmed) return;
    setProses(true);
    try {
      await kirim("DELETE", `${API_URL}/remedial/${rencana.id_rencana}/bukti`);
      setBukti(null);
      setBuktiBerubah(true);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(false); }
  };

  const batalkan = async () => {
    const ok = await Swal.fire({
      title: "Batalkan rencana ini?", text: rencana?.id_jadwal ? "Sesi jadwalnya ikut dihapus bila tidak dipakai siswa lain." : "",
      icon: "warning", showCancelButton: true, confirmButtonText: "Ya, batalkan", cancelButtonText: "Kembali", confirmButtonColor: "#dc3545",
    });
    if (!ok.isConfirmed) return;
    setProses(true);
    try {
      const data = await kirim("DELETE", `${API_URL}/remedial/${rencana.id_rencana}`);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2000 });
      onTersimpan();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold">
                <i className="bi bi-life-preserver me-2 text-danger"></i>
                {ubah ? "Ubah Rencana Tindak Lanjut" : "Rencana Tindak Lanjut"}
              </h5>
              <button type="button" className="btn-close" onClick={tutup} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {/* SISWA */}
              <div className="mb-3">
                <label className="form-label fw-semibold small mb-1">
                  <i className="bi bi-person-exclamation text-danger me-1"></i>Siswa belum tuntas <span className="text-muted fw-normal">(KKM {kkm})</span>
                </label>
                {ubah ? (
                  <div className="d-flex align-items-center gap-2 border rounded p-2">
                    <span className="fw-semibold me-auto">{target.item.nama_siswa}</span>
                    <span className="badge text-bg-danger">{angka(target.item.nilai)}</span>
                  </div>
                ) : (
                  <div className="border rounded p-2 d-flex flex-wrap gap-2" style={{ maxHeight: 160, overflowY: "auto" }}>
                    {target.items.map((i) => {
                      const aktif = dipilih.includes(i.id_nilai);
                      return (
                        <label key={i.id_nilai} role="button"
                          className={`d-inline-flex align-items-center gap-2 border rounded-pill px-3 py-1 small ${aktif ? "border-danger bg-danger-subtle" : "text-muted"}`}>
                          <input type="checkbox" className="form-check-input m-0" checked={aktif}
                            onChange={() => setDipilih((p) => (aktif ? p.filter((x) => x !== i.id_nilai) : [...p, i.id_nilai]))} />
                          {i.nama_siswa} <b className="text-danger">{angka(i.nilai)}</b>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* OPSI TINDAKAN */}
              <label className="form-label fw-semibold small mb-1"><i className="bi bi-signpost-split text-primary me-1"></i>Bentuk tindak lanjut</label>
              <div className="row g-2 mb-1">
                {OPSI_TINDAK_LANJUT.map((o) => {
                  const aktif = form.opsi_tindakan === o.nama;
                  return (
                    <div key={o.nama} className="col-6 col-md-4">
                      <button type="button" onClick={() => set("opsi_tindakan", o.nama)}
                        className={`btn w-100 h-100 text-start small p-2 ${aktif ? "btn-primary" : "btn-outline-secondary"}`}>
                        <i className={`bi ${o.ikon} me-1`}></i><span className="fw-semibold">{o.nama}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {opsiAktif && (
                <div className="small text-muted mb-3">
                  <i className="bi bi-info-circle me-1"></i>{opsiAktif.ket}
                  {opsiAktif.kelompok && jumlah === 1 && !ubah && <span className="text-warning-emphasis"> Cocok juga untuk beberapa siswa sekaligus.</span>}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fw-semibold small mb-1"><i className="bi bi-chat-left-text text-primary me-1"></i>Catatan / detail rencana</label>
                <textarea className="form-control" rows={2} maxLength={2000} value={form.catatan}
                  placeholder="mis. indikator yang belum dikuasai, soal latihan nomor 3–7, siapa tutor sebayanya"
                  onChange={(e) => set("catatan", e.target.value)}></textarea>
              </div>

              {/* JADWAL */}
              <div className="row g-2 align-items-end">
                <div className="col-12 col-sm-4">
                  <label className="form-label fw-semibold small mb-1"><i className="bi bi-calendar-event text-primary me-1"></i>Tanggal pelaksanaan</label>
                  <input type="date" className="form-control" required value={form.tanggal_rencana} onChange={(e) => set("tanggal_rencana", e.target.value)} />
                </div>
                <div className="col-12 col-sm-8">
                  <div className="form-check form-switch mb-2">
                    <input className="form-check-input" type="checkbox" id="masukJadwal" checked={form.masuk_jadwal} onChange={(e) => set("masuk_jadwal", e.target.checked)} />
                    <label className="form-check-label small fw-semibold" htmlFor="masukJadwal">Masukkan ke Jadwal Pembelajaran</label>
                  </div>
                </div>
                {form.masuk_jadwal && (
                  <>
                    <div className="col-6 col-sm-4">
                      <label className="form-label small mb-1">Jam mulai</label>
                      <input type="time" className="form-control" required value={form.jam_mulai} onChange={(e) => set("jam_mulai", e.target.value)} />
                    </div>
                    <div className="col-6 col-sm-4">
                      <label className="form-label small mb-1">Jam selesai</label>
                      <input type="time" className="form-control" required value={form.jam_selesai} onChange={(e) => set("jam_selesai", e.target.value)} />
                    </div>
                    <div className="col-12 col-sm-4">
                      <label className="form-label small mb-1">Ruangan <span className="text-muted">(opsional)</span></label>
                      <select className="form-select" value={form.id_ruangan} onChange={(e) => set("id_ruangan", e.target.value)}>
                        <option value="">—</option>
                        {ruangan.map((r) => <option key={r.id_ruangan} value={r.id_ruangan}>{r.nama_ruangan}</option>)}
                      </select>
                    </div>
                    <div className="col-12">
                      <small className="text-muted">
                        <i className="bi bi-calendar-plus me-1"></i>
                        {jumlah > 1 ? `Satu sesi bersama untuk ${jumlah} siswa` : "Satu sesi"} akan dibuat di Jadwal dan otomatis berstatus Selesai setelah nilai remedialnya dicatat.
                        {ubah && rencana?.id_jadwal && " Bila sesinya dipakai bersama siswa lain, mengubah tanggal/jam memindahkan siswa ini ke sesi tersendiri."}
                      </small>
                    </div>
                  </>
                )}
              </div>

              {/* BUKTI PELAKSANAAN */}
              {ubah && (
                <div className="border rounded p-3 mt-3" aria-label="Bukti pelaksanaan">
                  <div className="fw-semibold small mb-2"><i className="bi bi-paperclip text-primary me-1"></i>Bukti pelaksanaan</div>
                  {bukti ? (
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                      <a href={urlBukti(bukti.url)} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-primary text-truncate" style={{ maxWidth: "100%" }}>
                        <i className="bi bi-box-arrow-up-right me-1"></i>{bukti.nama || "Lihat bukti"}
                      </a>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={hapusBukti} disabled={proses} aria-label="Hapus bukti">
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  ) : <div className="small text-muted mb-2">Belum ada bukti. Unggah foto hasil kerja, lembar tes ulang, atau tautan Google Drive.</div>}
                  <div className="d-flex flex-wrap gap-2">
                    <label className={`btn btn-sm btn-primary mb-0${proses ? " disabled" : ""}`}>
                      <i className="bi bi-upload me-1"></i>{bukti ? "Ganti berkas" : "Unggah berkas"}
                      <input type="file" hidden accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip" onChange={pilihBerkas} disabled={proses} />
                    </label>
                    <div className="input-group input-group-sm flex-grow-1" style={{ minWidth: 220 }}>
                      <input type="url" className="form-control" placeholder="atau tempel tautan (https://...)" aria-label="Tautan bukti"
                        value={tautanBukti} onChange={(e) => setTautanBukti(e.target.value)} />
                      <button type="button" className="btn btn-outline-primary" disabled={proses || !/^https?:\/\/\S+$/.test(tautanBukti)}
                        onClick={() => kirimBukti({ lampiran_url: tautanBukti, lampiran_nama: "Tautan bukti" })}>Simpan tautan</button>
                    </div>
                  </div>
                  <small className="text-muted d-block mt-2">
                    <i className="bi bi-info-circle me-1"></i>
                    {rencana?.id_jadwal
                      ? "Bukti disimpan sebagai lampiran sesi remedial di Jadwal, jadi terlihat juga di sana tanpa berkas ganda."
                      : "Bukti disimpan pada rencana ini. Bila nanti dimasukkan ke Jadwal, bukti ikut menjadi lampiran sesinya."}
                    {" "}Maksimal {BUKTI_MAX_MB}MB.
                  </small>
                </div>
              )}

              {!ubah && (
                <div className="form-check form-switch mt-3 mb-0">
                  <input className="form-check-input" type="checkbox" id="kabariOrtu" checked={kabariOrtu} onChange={(e) => setKabariOrtu(e.target.checked)} />
                  <label className="form-check-label small fw-semibold" htmlFor="kabariOrtu">
                    <i className="bi bi-whatsapp text-success me-1"></i>Kabari orang tua/wali lewat WhatsApp setelah disimpan
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {ubah && rencana?.status === "DIRENCANAKAN" && (
                <button type="button" className="btn btn-outline-danger me-auto" onClick={batalkan} disabled={proses}>
                  <i className="bi bi-x-circle me-1"></i>Batalkan Rencana
                </button>
              )}
              <button type="button" className="btn btn-outline-secondary" onClick={tutup} disabled={proses}>Tutup</button>
              <button type="submit" className="btn btn-danger fw-semibold" disabled={proses || (!ubah && jumlah === 0)}>
                {proses ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-floppy me-1"></i>}
                {ubah ? "Simpan Perubahan" : `Simpan Rencana${jumlah > 1 ? ` (${jumlah} siswa)` : ""}`}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
