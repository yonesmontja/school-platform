"use client";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import PerangkatEditor from "./PerangkatEditor";
import { API_URL, HARI, WARNA_JADWAL, adalahMinggu, parseLokal, pesanMinggu, tambahMenit, ymd, jamMenit } from "@/app/dashboard/jadwal/_lib/jadwal";

const DURASI_CEPAT = [35, 70, 90, 105];
const LAMPIRAN_MAX = 10 * 1024 * 1024;
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function kirimAPI(method, url, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir."); }
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}
export const pesanGalat = (json) => (json.errors ? Object.values(json.errors)[0]?.[0] : null) || json.message || "Terjadi kesalahan pada server";

// Tanya cakupan perubahan untuk jadwal berulang (seperti Google Calendar)
export async function tanyaModeBerantai(judul, label = "Simpan") {
  const res = await Swal.fire({
    title: judul,
    input: "radio",
    inputOptions: { only_this: "Hanya sesi ini", following: "Sesi ini dan berikutnya", all: "Semua sesi dalam rangkaian" },
    inputValue: "only_this",
    showCancelButton: true,
    confirmButtonText: label,
    cancelButtonText: "Batal",
  });
  return res.isConfirmed ? res.value : null;
}

// Tampilkan daftar bentrok; true bila pengguna memilih tetap menyimpan
export async function konfirmasiBentrok(json) {
  const daftar = (json.bentrok || []).map((b) => `<li class="mb-1"><b>${escapeHtml(b.judul)}</b> · ${escapeHtml(b.waktu)}<br><small class="text-danger">Bentrok ${escapeHtml(b.sebab)}</small></li>`).join("");
  const res = await Swal.fire({
    title: "Jadwal bentrok",
    html: `<div class="text-start small">${escapeHtml(json.message)}<ul class="mt-2 ps-3">${daftar}</ul></div>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Tetap simpan",
    cancelButtonText: "Ubah dulu",
    confirmButtonColor: "#f4511e",
  });
  return res.isConfirmed;
}

const formKosong = () => ({
  jenis: "kbm", judul: "", id_guru: "", id_kelas: "", id_mapel: "", id_materi: "", id_ruangan: "", id_modul: "", pertemuan_ke: "",
  tanggal: ymd(new Date()), jamMulai: "07:30", jamSelesai: "09:00", status_sesi: "",
  warna: WARNA_JADWAL[0], catatan: "", perangkat: [], video_ids: null, videoInfo: {}, pola: "sekali", hari: [], sampai: "",
  lampiranMode: "tidak", lampiran_url: "", file: null, lampiranLama: null, hapus_lampiran: false,
  waOtomatis: true, waPanel: true,
});

/**
 * Modal buat/ubah jadwal. `awal` = { mode: "baru"|"edit"|"duplikat", jadwal?, mulai?, selesai? }
 */
export default function FormJadwal({ awal, refData, onClose, onSaved }) {
  const [f, setF] = useState(formKosong);
  const [menyimpan, setMenyimpan] = useState(false);
  const edit = awal?.mode === "edit";
  const berulang = edit && !!awal.jadwal?.id_group;
  // Akun guru selalu membuat jadwal atas namanya sendiri
  const { isGuru, idGuru } = useAkses();

  useEffect(() => {
    if (!awal) return;
    const dasar = formKosong();
    if (awal.jadwal) {
      const j = awal.jadwal;
      const m = parseLokal(j.mulai), s = parseLokal(j.selesai);
      Object.assign(dasar, {
        jenis: j.judul && !j.id_mapel ? "agenda" : "kbm", judul: j.judul || "",
        id_guru: j.id_guru || "", id_kelas: j.id_kelas || "", id_mapel: j.id_mapel || "", id_materi: j.id_materi || "", id_ruangan: j.id_ruangan || "",
        id_modul: j.id_modul || "", pertemuan_ke: j.id_modul ? String((j.pertemuan_ke || 0) + (awal.mode === "duplikat" && j.pertemuan_ke ? 1 : 0) || "") : "",
        tanggal: ymd(m), jamMulai: jamMenit(m), jamSelesai: jamMenit(s),
        status_sesi: awal.mode !== "duplikat" && j.status_sesi === "Batal" ? "Batal" : "",
        warna: j.warna || WARNA_JADWAL[0], catatan: j.catatan || "", perangkat: j.perangkat || [],
        lampiranLama: j.lampiran_url ? { url: j.lampiran_url, nama: j.lampiran_nama } : null,
      });
      if (awal.mode === "duplikat" && j.lampiran_url) Object.assign(dasar, { lampiranMode: "link", lampiran_url: j.lampiran_url.startsWith("http") ? j.lampiran_url : "", lampiranLama: null });
    } else if (awal.mulai) {
      const m = awal.mulai, s = awal.selesai;
      Object.assign(dasar, { tanggal: ymd(m), jamMulai: jamMenit(m), jamSelesai: s && ymd(s) === ymd(m) && s > m ? jamMenit(s) : tambahMenit(jamMenit(m), 90) });
    }
    dasar.hari = [parseLokal(`${dasar.tanggal}T00:00`).getDay()].filter((h) => h !== 0);
    if (isGuru) dasar.id_guru = idGuru || "";
    setF(dasar);
    // Video yang sudah ditautkan ke sesi asal ikut dimuat (ubah & duplikat) agar tidak terhapus saat disimpan
    let batal = false;
    if (awal.jadwal?.id_jadwal) {
      kirimAPI("GET", `/video-belajar/tautan?jenis=JADWAL&id_target=${encodeURIComponent(awal.jadwal.id_jadwal)}`).then((r) => {
        if (batal || !r.ok) return;
        const data = r.json.data || [];
        setF((x) => ({ ...x, video_ids: data.map((v) => v.id_video), videoInfo: Object.fromEntries(data.map((v) => [v.id_video, v.judul])) }));
      }).catch(() => {});
    }
    return () => { batal = true; };
  }, [awal, isGuru, idGuru]);

  const ubah = (patch) => setF((x) => ({ ...x, ...patch }));
  const subjects = refData?.subjects || [];
  const namaGuru = (id) => refData?.teachers.find((t) => t.id_guru === id)?.nama_guru;
  const materiTersedia = useMemo(
    () => (refData?.materi || []).filter((m) => (!f.id_mapel || m.id_mapel === f.id_mapel) && (!f.id_kelas || !m.id_kelas || m.id_kelas === f.id_kelas)),
    [refData, f.id_mapel, f.id_kelas],
  );

  // Modul ajar untuk mapel & kelas ini (disetujui atau milik sendiri)
  const modulTersedia = useMemo(
    () => (refData?.modul || []).filter((m) => m.id_mapel === f.id_mapel && (!f.id_kelas || !m.id_kelas || m.id_kelas === f.id_kelas)),
    [refData, f.id_mapel, f.id_kelas],
  );
  const modulDipilih = (refData?.modul || []).find((m) => m.id_modul === f.id_modul);
  const pilihModul = (id_modul) => {
    const m = (refData?.modul || []).find((x) => x.id_modul === id_modul);
    ubah({ id_modul, pertemuan_ke: id_modul ? f.pertemuan_ke || "1" : "", ...(m?.id_materi ? { id_materi: m.id_materi } : {}) });
  };

  const pilihMapel = (id_mapel) => {
    const mapel = subjects.find((s) => s.id_mapel === id_mapel);
    const materiMasihCocok = (refData?.materi || []).some((m) => m.id_materi === f.id_materi && m.id_mapel === id_mapel);
    const modulMasihCocok = (refData?.modul || []).some((m) => m.id_modul === f.id_modul && m.id_mapel === id_mapel);
    // Guru mengikuti pengampu mapel yang dipilih; akun guru tetap atas namanya sendiri; admin masih bisa menggantinya
    ubah({ id_mapel, id_guru: isGuru ? f.id_guru : (mapel?.id_guru || f.id_guru || ""), id_materi: materiMasihCocok ? f.id_materi : "", ...(modulMasihCocok ? {} : { id_modul: "", pertemuan_ke: "" }), ...(id_mapel !== f.id_mapel ? { perangkat: [] } : {}) });
  };

  const pilihFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > LAMPIRAN_MAX) { e.target.value = ""; return Swal.fire("Terlalu besar", "Ukuran lampiran maksimal 10MB.", "warning"); }
    const reader = new FileReader();
    reader.onload = (ev) => ubah({ file: { nama: file.name, base64: ev.target.result }, hapus_lampiran: false });
    reader.readAsDataURL(file);
  };

  const toggleHari = (id) => ubah({ hari: f.hari.includes(id) ? f.hari.filter((h) => h !== id) : [...f.hari, id] });

  // Gabungkan id pilihan dengan objek referensi agar pesan WA bisa disusun tanpa menunggu server
  const rakit = (payload) => ({
    ...payload,
    guru: refData?.teachers.find((t) => t.id_guru === payload.id_guru) || null,
    mapel: subjects.find((s) => s.id_mapel === payload.id_mapel) || null,
    materi: refData?.materi.find((m) => m.id_materi === payload.id_materi) || null,
    kelas: refData?.classes.find((k) => k.id_kelas === payload.id_kelas) || null,
    ruangan: refData?.ruangan.find((r) => r.id_ruangan === payload.id_ruangan) || null,
    lampiran_url: f.file ? null : payload.lampiran_url || f.lampiranLama?.url || null,
  });

  const simpan = async (e) => {
    e.preventDefault();
    if (f.jenis === "kbm" && !f.id_mapel) return Swal.fire("Perhatian", "Pilih mata pelajaran.", "warning");
    if (f.jenis === "agenda" && !f.judul.trim()) return Swal.fire("Perhatian", "Isi judul agenda.", "warning");
    if (f.jamSelesai <= f.jamMulai) return Swal.fire("Perhatian", "Jam selesai harus setelah jam mulai.", "warning");
    if (adalahMinggu(f.tanggal)) return Swal.fire("Hari Minggu", pesanMinggu(f.tanggal), "warning");
    if (!edit && f.pola !== "sekali" && !f.sampai) return Swal.fire("Perhatian", "Tentukan tanggal batas akhir pengulangan.", "warning");
    if (!edit && f.pola === "kustom" && !f.hari.length) return Swal.fire("Perhatian", "Pilih minimal satu hari pertemuan.", "warning");

    let mode = "only_this";
    if (berulang) {
      mode = await tanyaModeBerantai("Ubah jadwal berulang");
      if (!mode) return;
    }

    const payload = {
      judul: f.jenis === "agenda" ? f.judul.trim() : null,
      id_mapel: f.jenis === "kbm" ? f.id_mapel : null,
      id_materi: f.jenis === "kbm" ? f.id_materi || null : null,
      id_modul: f.jenis === "kbm" ? f.id_modul || null : null,
      pertemuan_ke: f.jenis === "kbm" && f.id_modul && f.pertemuan_ke ? Number(f.pertemuan_ke) : null,
      id_guru: f.id_guru || null, id_kelas: f.id_kelas || null, id_ruangan: f.id_ruangan || null,
      mulai: `${f.tanggal}T${f.jamMulai}`, selesai: `${f.tanggal}T${f.jamSelesai}`,
      warna: f.warna, catatan: f.catatan || null,
      // Status mengikuti jam sesi (dihitung server); hanya pembatalan yang dipilih manual
      status_sesi: f.status_sesi === "Batal" ? "Batal" : "Menunggu",
      perangkat: f.jenis === "kbm" ? (f.perangkat || []).map(({ jenis, id, label, atp }) => ({ jenis, id, label, ...(atp ? { atp } : {}) })) : [],
      ...(Array.isArray(f.video_ids) ? { video_ids: f.jenis === "kbm" ? f.video_ids : [] } : {}),
      ...(f.lampiranMode === "file" && f.file ? { lampiran_base64: f.file.base64, lampiran_nama: f.file.nama } : {}),
      ...(f.lampiranMode === "link" && f.lampiran_url ? { lampiran_url: f.lampiran_url, lampiran_nama: "Tautan lampiran" } : {}),
      ...(f.hapus_lampiran ? { hapus_lampiran: true } : {}),
      ...(edit ? { mode } : { pola: f.pola, hari: f.pola === "kustom" ? f.hari : undefined, sampai: f.pola !== "sekali" ? f.sampai : undefined }),
    };

    setMenyimpan(true);
    try {
      let res = await kirimAPI(edit ? "PUT" : "POST", edit ? `/jadwal/${awal.jadwal.id_jadwal}` : "/jadwal", payload);
      if (res.status === 409 && (await konfirmasiBentrok(res.json))) {
        res = await kirimAPI(edit ? "PUT" : "POST", edit ? `/jadwal/${awal.jadwal.id_jadwal}` : "/jadwal", { ...payload, abaikan_bentrok: true });
      } else if (res.status === 409) {
        return;
      }
      if (!res.ok) return Swal.fire("Gagal Menyimpan", pesanGalat(res.json), "error");

      onSaved({
        pesan: res.json.message,
        contoh: res.json.data?.[0] || rakit({ ...payload, id_jadwal: awal.jadwal?.id_jadwal }),
        jumlah: res.json.jumlah || 1,
        sampai: f.pola !== "sekali" ? f.sampai : null,
        waOtomatis: f.waOtomatis,
        waPanel: f.waPanel,
      });
    } catch (err) {
      Swal.fire("Gagal", err.message, "error");
    } finally {
      setMenyimpan(false);
    }
  };

  if (!awal) return null;
  const judulModal = edit ? "Ubah Jadwal" : awal.mode === "duplikat" ? "Duplikat Jadwal" : "Jadwal Baru";

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && !menyimpan && onClose()}>
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <form className="modal-content border-0 shadow rounded-4 jadwal-form" onSubmit={simpan}>
            <div className="modal-header border-0 pb-0" style={{ borderTop: `6px solid ${f.warna}`, borderRadius: "1rem 1rem 0 0" }}>
              <h5 className="modal-title fw-bold"><i className="bi bi-calendar-plus me-2" style={{ color: f.warna }}></i>{judulModal}
                {berulang && <span className="badge text-bg-light border ms-2 fw-normal"><i className="bi bi-arrow-repeat me-1"></i>Berulang</span>}
              </h5>
              <button type="button" className="btn-close" onClick={onClose} disabled={menyimpan} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="jadwal-segment mb-3">
                <button type="button" className={f.jenis === "kbm" ? "active" : ""} onClick={() => ubah({ jenis: "kbm" })}><i className="bi bi-book me-1"></i>Pembelajaran (KBM)</button>
                <button type="button" className={f.jenis === "agenda" ? "active" : ""} onClick={() => ubah({ jenis: "agenda" })}><i className="bi bi-people me-1"></i>Agenda lain</button>
              </div>

              {f.jenis === "agenda" ? (
                <input type="text" className="form-control form-control-lg jadwal-judul mb-3" placeholder="Judul agenda, mis. Rapat Dewan Guru" maxLength={150} value={f.judul} onChange={(e) => ubah({ judul: e.target.value })} autoFocus />
              ) : (
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold mb-1">Mata Pelajaran</label>
                    <select className="form-select" value={f.id_mapel} onChange={(e) => pilihMapel(e.target.value)} required>
                      <option value="">— Pilih Mapel —</option>
                      {subjects.map((s) => <option key={s.id_mapel} value={s.id_mapel}>{s.nama_mapel}{namaGuru(s.id_guru) ? ` · ${namaGuru(s.id_guru)}` : ""}</option>)}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold mb-1">Topik / Materi</label>
                    <select className="form-select" value={f.id_materi} onChange={(e) => ubah({ id_materi: e.target.value })}>
                      <option value="">— Tanpa materi khusus —</option>
                      {materiTersedia.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                    </select>
                  </div>
                  {f.id_mapel && (modulTersedia.length > 0 || f.id_modul) && (
                    <>
                      <div className="col-md-8">
                        <label className="form-label small fw-semibold mb-1" htmlFor="jdModul">Modul ajar</label>
                        <select id="jdModul" className="form-select" value={f.id_modul} onChange={(e) => pilihModul(e.target.value)}>
                          <option value="">— Tanpa modul ajar —</option>
                          {modulTersedia.map((m) => <option key={m.id_modul} value={m.id_modul}>{m.judul}{m.status !== "DISETUJUI" ? " (draf)" : ""}</option>)}
                        </select>
                      </div>
                      {f.id_modul && (
                        <div className="col-md-4">
                          <label className="form-label small fw-semibold mb-1" htmlFor="jdPertemuan">Pertemuan ke</label>
                          <select id="jdPertemuan" className="form-select" value={f.pertemuan_ke} onChange={(e) => ubah({ pertemuan_ke: e.target.value })}>
                            {Array.from({ length: modulDipilih?.jumlah_pertemuan || 1 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
                          </select>
                          {!edit && f.pola !== "sekali" && <div className="form-text">Sesi berikutnya otomatis pertemuan berikutnya.</div>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1"><i className="bi bi-person me-1"></i>Guru / Instruktur</label>
                  <select className="form-select" value={f.id_guru} disabled={isGuru} title={isGuru ? "Jadwal dibuat atas nama Anda" : undefined} onChange={(e) => ubah({ id_guru: e.target.value })}>
                    <option value="">— Pilih Guru —</option>
                    {(refData?.teachers || []).map((t) => <option key={t.id_guru} value={t.id_guru}>{t.nama_guru}</option>)}
                  </select>
                  {!isGuru && f.jenis === "kbm" && f.id_mapel && (() => {
                    const pengampu = subjects.find((s) => s.id_mapel === f.id_mapel)?.id_guru;
                    if (!pengampu) return null;
                    return pengampu === f.id_guru
                      ? <div className="form-text"><i className="bi bi-magic me-1"></i>Otomatis: guru pengampu mapel</div>
                      : <div className="form-text text-warning-emphasis">Bukan pengampu mapel ({namaGuru(pengampu)}). <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => ubah({ id_guru: pengampu })}>Kembalikan</button></div>;
                  })()}
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1"><i className="bi bi-mortarboard me-1"></i>Kelas</label>
                  <select className="form-select" value={f.id_kelas} onChange={(e) => ubah({ id_kelas: e.target.value })}>
                    <option value="">— Semua / tidak spesifik —</option>
                    {(refData?.classes || []).map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1"><i className="bi bi-door-open me-1"></i>Ruangan</label>
                  <select className="form-select" value={f.id_ruangan} onChange={(e) => ubah({ id_ruangan: e.target.value })}>
                    <option value="">— Tanpa ruangan —</option>
                    {(refData?.ruangan || []).map((r) => <option key={r.id_ruangan} value={r.id_ruangan}>{r.nama_ruangan}{r.kapasitas ? ` (${r.kapasitas})` : ""}</option>)}
                  </select>
                </div>
              </div>

              <div className="row g-3 mb-2 align-items-end">
                <div className="col-md-4">
                  <label className="form-label small fw-semibold mb-1"><i className="bi bi-calendar-event me-1"></i>Tanggal{!edit && f.pola !== "sekali" ? " mulai" : ""}</label>
                  <input type="date" className={`form-control${adalahMinggu(f.tanggal) ? " is-invalid" : ""}`} value={f.tanggal} required onChange={(e) => ubah({ tanggal: e.target.value })} />
                  {adalahMinggu(f.tanggal) && <div className="invalid-feedback">Hari Minggu libur umum. Pilih Senin–Sabtu.</div>}
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label small fw-semibold mb-1">Mulai</label>
                  <input type="time" className="form-control" value={f.jamMulai} required step="300" onChange={(e) => ubah({ jamMulai: e.target.value })} />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label small fw-semibold mb-1">Selesai</label>
                  <input type="time" className="form-control" value={f.jamSelesai} required step="300" onChange={(e) => ubah({ jamSelesai: e.target.value })} />
                </div>
                <div className="col-md-2">
                  <label className="form-label small fw-semibold mb-1" htmlFor="jdStatus">Status</label>
                  <select id="jdStatus" className="form-select" value={f.status_sesi} onChange={(e) => ubah({ status_sesi: e.target.value })}
                    title="Menunggu → Berlangsung → Selesai berubah sendiri mengikuti jam sesi">
                    <option value="">Otomatis</option>
                    <option value="Batal">Batal</option>
                  </select>
                </div>
              </div>
              <div className="d-flex flex-wrap gap-1 mb-3">
                <small className="text-body-secondary me-1 align-self-center">Durasi cepat:</small>
                {DURASI_CEPAT.map((m) => (
                  <button key={m} type="button" className="btn btn-sm btn-chip" onClick={() => ubah({ jamSelesai: tambahMenit(f.jamMulai, m) })}>{m} mnt{m % 35 === 0 ? ` · ${m / 35} JP` : ""}</button>
                ))}
              </div>

              {!edit && (
                <div className="jadwal-box mb-3">
                  <div className="row g-2 align-items-center">
                    <div className="col-md-6">
                      <label className="form-label small fw-semibold mb-1"><i className="bi bi-arrow-repeat me-1"></i>Pengulangan</label>
                      <select className="form-select form-select-sm" value={f.pola} onChange={(e) => ubah({ pola: e.target.value })}>
                        <option value="sekali">Tidak berulang</option>
                        <option value="harian">Setiap hari kerja (Senin–Jumat)</option>
                        <option value="kustom">Mingguan pada hari tertentu…</option>
                      </select>
                    </div>
                    {f.pola !== "sekali" && (
                      <div className="col-md-6">
                        <label className="form-label small fw-semibold mb-1">Berakhir pada</label>
                        <input type="date" className="form-control form-control-sm" value={f.sampai} min={f.tanggal} onChange={(e) => ubah({ sampai: e.target.value })} />
                      </div>
                    )}
                  </div>
                  {f.pola === "kustom" && (
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {HARI.map((h) => (
                        <button key={h.id} type="button" className={`jadwal-day${f.hari.includes(h.id) ? " active" : ""}`} onClick={() => toggleHari(h.id)} title={h.label}>{h.singkat}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label className="form-label small fw-semibold mb-1"><i className="bi bi-box-seam me-1"></i>Perangkat ajar, persiapan alat & catatan guru</label>
              <PerangkatEditor f={f} ubah={ubah} refData={refData} />

              <div className="row g-3 mt-0">
                <div className="col-md-6">
                  <label className="form-label small fw-semibold mb-1">Warna kartu</label>
                  <div className="d-flex flex-wrap gap-2">
                    {WARNA_JADWAL.map((c) => (
                      <button key={c} type="button" className={`jadwal-swatch${f.warna === c ? " active" : ""}`} style={{ background: c }} onClick={() => ubah({ warna: c })} aria-label={`Warna ${c}`}></button>
                    ))}
                  </div>
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-semibold mb-1"><i className="bi bi-paperclip me-1"></i>Lampiran modul / bahan</label>
                  {f.lampiranLama && !f.hapus_lampiran && f.lampiranMode === "tidak" ? (
                    <div className="d-flex align-items-center gap-2 small">
                      <span className="text-truncate"><i className="bi bi-file-earmark me-1"></i>{f.lampiranLama.nama || "Lampiran"}</span>
                      <button type="button" className="btn btn-sm btn-link p-0" onClick={() => ubah({ lampiranMode: "file" })}>Ganti</button>
                      <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => ubah({ hapus_lampiran: true })}>Hapus</button>
                    </div>
                  ) : (
                    <>
                      <div className="btn-group btn-group-sm w-100 mb-2">
                        {[["tidak", "Tidak ada"], ["file", "Unggah file"], ["link", "Tautan"]].map(([v, l]) => (
                          <button key={v} type="button" className={`btn ${f.lampiranMode === v ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => ubah({ lampiranMode: v })}>{l}</button>
                        ))}
                      </div>
                      {f.lampiranMode === "file" && <input type="file" className="form-control form-control-sm" onChange={pilihFile} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.ppt,.pptx,.xlsx,.zip" />}
                      {f.lampiranMode === "link" && <input type="url" className="form-control form-control-sm" placeholder="https://drive.google.com/…" value={f.lampiran_url} onChange={(e) => ubah({ lampiran_url: e.target.value })} />}
                      {f.hapus_lampiran && <small className="text-danger d-block mt-1">Lampiran lama akan dihapus saat disimpan.</small>}
                    </>
                  )}
                </div>
              </div>

              <div className="jadwal-box mt-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span className="small fw-semibold text-success"><i className="bi bi-whatsapp me-1"></i>Pengingat WhatsApp</span>
                <div className="d-flex flex-wrap gap-3">
                  <div className="form-check form-switch m-0">
                    <input className="form-check-input" type="checkbox" id="wa_oto" checked={f.waOtomatis} onChange={(e) => ubah({ waOtomatis: e.target.checked })} />
                    <label className="form-check-label small" htmlFor="wa_oto">Kirim otomatis (bila Fonnte aktif)</label>
                  </div>
                  <div className="form-check form-switch m-0">
                    <input className="form-check-input" type="checkbox" id="wa_panel" checked={f.waPanel} onChange={(e) => ubah({ waPanel: e.target.checked })} />
                    <label className="form-check-label small" htmlFor="wa_panel">Buka panel bagikan</label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer border-0">
              <button type="button" className="btn btn-light" onClick={onClose} disabled={menyimpan}>Batal</button>
              <button type="submit" className="btn btn-primary px-4 fw-semibold" disabled={menyimpan}>
                {menyimpan ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-check2 me-1"></i>}{edit ? "Simpan Perubahan" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}
