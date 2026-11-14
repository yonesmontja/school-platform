"use client";
// Pembinaan kehadiran: rencana tindakan bagi siswa yang presensinya perlu perhatian (pilihan + tulisan guru),
// status Otomatis/Berlangsung/Selesai/Batal, tindak lanjut yang masuk Perlu Tindakan, dan pencatatan ke jurnal
// (catatan terpisah; STNKM kosong kecuali respons siswa dianalisis).
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { API_URL } from "@/app/lib/config";
import { MenuAksi } from "@/components/dashboard/menuAksi";
import { TombolLipat, useLipat } from "./lipat";

const STATUS = {
  OTOMATIS: { label: "Otomatis", warna: "primary" },
  BERLANGSUNG: { label: "Berlangsung", warna: "warning" },
  SELESAI: { label: "Selesai", warna: "success" },
  BATAL: { label: "Batal", warna: "secondary" },
  DIRENCANAKAN: { label: "Direncanakan", warna: "info" },
};
const AI_MODES = [
  { value: "HEURISTIK", label: "Heuristik Lokal (cepat, offline)" },
  { value: "GEMINI", label: "Google Gemini" },
  { value: "CLAUDE", label: "Anthropic Claude" },
  { value: "QWEN", label: "Qwen (OpenRouter)" },
  { value: "DEEPSEEK", label: "DeepSeek" },
  { value: "OPENKEY", label: "OpenKey" },
];
const DIMENSI = [["val_S", "S"], ["val_T", "T"], ["val_N", "N"], ["val_K", "K"], ["val_M", "M"]];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tambahHari = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const tgl = (s) => { if (!s) return "-"; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); };

async function minta(method, url, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir."); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json.errors && Object.values(json.errors)[0]?.[0]) || json.message || "Terjadi kesalahan pada server.");
  return json;
}

/** Teks status efektif, mis. "Otomatis · Berlangsung (4/10 hari hadir beruntun)". */
function teksStatus(r, hariPulih) {
  const ef = r.efektif || {};
  const dasar = STATUS[ef.status]?.label || ef.status;
  if (!ef.otomatis) return dasar;
  if (ef.status === "SELESAI") return `Otomatis · Selesai (${ef.beruntun} hari hadir beruntun)`;
  if (ef.status === "DIRENCANAKAN") return "Otomatis · Direncanakan";
  return `Otomatis · Berlangsung (${ef.beruntun}/${hariPulih} hari hadir beruntun)`;
}

/**
 * Kartu daftar pembinaan + dialognya. Induk membuka formulir lewat ref: ref.current.rencanakan(siswa).
 * props: idKelas, idPeriode, namaKelas, students, onAktif(Set id_siswa yang punya rencana aktif)
 */
const PembinaanPresensi = forwardRef(function PembinaanPresensi({ idKelas, idPeriode, namaKelas, students, onAktif }, ref) {
  const [terlipat, lipat] = useLipat("pembinaanPresensiTerlipat");
  const [data, setData] = useState(null);
  const [opsi, setOpsi] = useState([]);
  const [hariPulih, setHariPulih] = useState(10);
  const [filter, setFilter] = useState("AKTIF");
  const [form, setForm] = useState(null);     // rencana yang sedang dibuat/diubah
  const [catat, setCatat] = useState(null);   // rencana yang sedang dicatat ke jurnal

  const muat = useCallback(async () => {
    try {
      const r = await minta("GET", `/presensi/pembinaan?${new URLSearchParams({ id_kelas: idKelas, ...(idPeriode ? { id_periode: idPeriode } : {}) })}`);
      setData(r.data || []); setOpsi(r.opsi || []); setHariPulih(r.hari_pulih || 10);
    } catch (e) { setData([]); }
  }, [idKelas, idPeriode]);
  useEffect(() => { muat(); }, [muat]);

  const aktif = (r) => ["DIRENCANAKAN", "BERLANGSUNG"].includes(r.efektif?.status);
  useEffect(() => { onAktif?.(new Set((data || []).filter(aktif).map((r) => r.id_siswa))); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const formBaru = (siswa) => {
    const hariIni = ymd(new Date());
    setForm({ id_siswa: siswa?.id_siswa || "", nama: siswa?.nama_siswa || "", tindakan: [], lain: "", catatan: "", tanggal_mulai: hariIni, tanggal_tindak_lanjut: tambahHari(hariIni, 14), status: "OTOMATIS", hasil: "" });
  };
  useImperativeHandle(ref, () => ({
    rencanakan: (siswa) => {
      if (terlipat) lipat();
      const ada = (data || []).find((r) => r.id_siswa === siswa.id_siswa && aktif(r));
      if (ada) return ubah(ada);
      formBaru(siswa);
    },
  }));

  const ubah = (r) => setForm({ id: r.id_pembinaan, id_siswa: r.id_siswa, nama: r.siswa?.nama_siswa, tindakan: r.tindakan.filter((t) => opsi.includes(t)),
    lain: r.tindakan.filter((t) => !opsi.includes(t)).join("\n"), catatan: r.catatan || "", tanggal_mulai: r.tanggal_mulai, tanggal_tindak_lanjut: r.tanggal_tindak_lanjut, status: r.status, hasil: r.hasil || "" });

  const simpan = async (e) => {
    e.preventDefault();
    const tindakan = [...form.tindakan, ...form.lain.split("\n").map((t) => t.trim()).filter(Boolean)];
    if (!form.id_siswa) return Swal.fire("Perhatian", "Pilih siswa yang dibina.", "warning");
    if (!tindakan.length) return Swal.fire("Perhatian", "Pilih atau tulis minimal satu tindakan pembinaan.", "warning");
    const badan = { tindakan, catatan: form.catatan, tanggal_mulai: form.tanggal_mulai, tanggal_tindak_lanjut: form.tanggal_tindak_lanjut, status: form.status, hasil: form.hasil };
    try {
      const r = form.id ? await minta("PUT", `/presensi/pembinaan/${form.id}`, badan) : await minta("POST", "/presensi/pembinaan", { ...badan, id_siswa: form.id_siswa, id_periode: idPeriode || null });
      setForm(null);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message, showConfirmButton: false, timer: 2000 });
      muat();
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); }
  };

  const gantiStatus = async (r, status) => {
    let hasil;
    if (status === "SELESAI" || status === "BATAL") {
      const jawab = await Swal.fire({
        title: status === "SELESAI" ? "Tandai pembinaan selesai?" : "Batalkan pembinaan?", input: "textarea",
        inputLabel: status === "SELESAI" ? "Hasil pembinaan (opsional)" : "Alasan (opsional)", inputValue: r.hasil || "",
        showCancelButton: true, confirmButtonText: status === "SELESAI" ? "Tandai selesai" : "Batalkan pembinaan", cancelButtonText: "Kembali",
      });
      if (!jawab.isConfirmed) return;
      hasil = jawab.value;
    }
    try {
      const x = await minta("PATCH", `/presensi/pembinaan/${r.id_pembinaan}/status`, { status, ...(hasil !== undefined ? { hasil } : {}) });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: x.message, showConfirmButton: false, timer: 2000 });
      muat();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const hapus = async (r) => {
    const ok = await Swal.fire({ title: "Hapus rencana pembinaan?", text: "Catatan yang sudah masuk jurnal tetap tersimpan.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#d33" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/presensi/pembinaan/${r.id_pembinaan}`); muat(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const tampil = useMemo(() => (data || []).filter((r) => filter === "SEMUA" || aktif(r)), [data, filter]);
  const jumlahAktif = (data || []).filter(aktif).length;
  const jumlahTindakLanjut = (data || []).filter((r) => r.perlu_tindak_lanjut).length;

  return (
    <div className="card card-outline card-danger shadow-sm mb-3" id="pembinaan-presensi" style={{ scrollMarginTop: "1rem" }}>
      <div className="card-header d-flex flex-wrap align-items-center gap-2">
        <h3 className="card-title fw-semibold mb-0 me-auto">
          <i className="bi bi-person-heart me-2"></i>Pembinaan kehadiran{namaKelas ? ` · ${namaKelas}` : ""}
          {jumlahAktif > 0 && <span className="badge text-bg-warning ms-2 fw-normal">{jumlahAktif} aktif</span>}
          {jumlahTindakLanjut > 0 && <span className="badge text-bg-danger ms-1 fw-normal">{jumlahTindakLanjut} perlu tindak lanjut</span>}
        </h3>
        {!terlipat && (
          <>
            <div className="btn-group btn-group-sm">
              {[["AKTIF", "Aktif"], ["SEMUA", "Semua"]].map(([v, l]) => <button key={v} type="button" className={`btn ${filter === v ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => setFilter(v)}>{l}</button>)}
            </div>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => formBaru(null)}><i className="bi bi-plus-lg me-1"></i>Rencana pembinaan</button>
          </>
        )}
        <TombolLipat terlipat={terlipat} onClick={lipat} label="pembinaan kehadiran" />
      </div>
      {!terlipat && (
        <div className="card-body p-0">
          {data === null ? <div className="text-center text-muted py-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat pembinaan…</div>
            : tampil.length === 0 ? (
              <div className="text-center text-muted small py-4 px-3">
                {filter === "AKTIF" && data.length ? "Tidak ada pembinaan yang sedang berjalan." : "Belum ada rencana pembinaan."} Tekan <b>Bina</b> pada siswa di daftar &quot;Perlu perhatian&quot;, atau tombol Rencana pembinaan.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle small mb-0">
                  <thead className="table-light">
                    <tr><th>Siswa</th><th>Tindakan</th><th className="text-nowrap">Mulai → tindak lanjut</th><th>Status</th><th className="text-center">Jurnal</th><th className="text-center">Aksi</th></tr>
                  </thead>
                  <tbody>
                    {tampil.map((r) => {
                      const st = STATUS[r.efektif?.status] || STATUS.BERLANGSUNG;
                      return (
                        <tr key={r.id_pembinaan} className={r.perlu_tindak_lanjut ? "table-warning" : ""}>
                          <td>
                            <div className="fw-semibold">{r.siswa?.nama_siswa}</div>
                            {r.ringkasan_awal?.persen != null && <div className="text-muted">Awal: hadir {r.ringkasan_awal.persen}% · alpa {r.ringkasan_awal.alpa}</div>}
                          </td>
                          <td style={{ maxWidth: 320 }}>
                            <div className="d-flex flex-wrap gap-1">{r.tindakan.map((t) => <span key={t} className="badge text-bg-light border fw-normal text-wrap text-start">{t}</span>)}</div>
                            {r.catatan && <div className="text-muted mt-1">{r.catatan}</div>}
                            {r.hasil && <div className="mt-1"><b>Hasil:</b> {r.hasil}</div>}
                          </td>
                          <td className="text-nowrap">{tgl(r.tanggal_mulai)} → {tgl(r.tanggal_tindak_lanjut)}{r.perlu_tindak_lanjut && <div className="text-danger fw-semibold">Waktunya tindak lanjut</div>}</td>
                          <td><span className={`badge text-bg-${st.warna} fw-normal text-wrap text-start`}>{teksStatus(r, hariPulih)}</span></td>
                          <td className="text-center">
                            {r.jurnal_detail?.length ? <span className="badge text-bg-light border" title={r.jurnal_detail.map((j) => `${j.tanggal}: ${j.narasi_kejadian || "(catatan tertutup)"}`).join("\n")}>{r.jurnal_detail.length} catatan</span> : <span className="text-muted">–</span>}
                          </td>
                          <td className="text-center">
                            <MenuAksi label={`Aksi pembinaan ${r.siswa?.nama_siswa}`} items={[
                              { label: "Catat ke jurnal", ikon: "bi-journal-plus", onClick: () => setCatat(r) },
                              { label: "Ubah rencana", ikon: "bi-pencil-square", tampil: r.boleh_ubah, onClick: () => ubah(r) },
                              { label: "Tandai selesai", ikon: "bi-check2-circle", tampil: r.boleh_ubah && r.status !== "SELESAI", onClick: () => gantiStatus(r, "SELESAI") },
                              { label: "Kembali ke status otomatis", ikon: "bi-magic", tampil: r.boleh_ubah && r.status !== "OTOMATIS", onClick: () => gantiStatus(r, "OTOMATIS") },
                              { label: "Batalkan", ikon: "bi-x-circle", tampil: r.boleh_ubah && r.status !== "BATAL", onClick: () => gantiStatus(r, "BATAL") },
                              { label: "Hapus", ikon: "bi-trash", bahaya: true, pemisah: true, tampil: r.boleh_ubah, onClick: () => hapus(r) },
                            ]} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {form && <FormRencana form={form} setForm={setForm} opsi={opsi} students={students} hariPulih={hariPulih} onSimpan={simpan} />}
      {catat && <CatatJurnal r={catat} idKelas={idKelas} onClose={() => setCatat(null)} onSelesai={() => { setCatat(null); muat(); }} teksStatus={teksStatus(catat, hariPulih)} />}
    </div>
  );
});
export default PembinaanPresensi;

function Dialog({ judul, ikon, onClose, children, footer, onSubmit }) {
  const Isi = onSubmit ? "form" : "div";
  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-label={judul} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <Isi className="modal-content border-0 shadow rounded-4" onSubmit={onSubmit}>
            <div className="modal-header border-0 pb-0">
              <h5 className="modal-title fw-bold"><i className={`bi ${ikon} me-2 text-danger`}></i>{judul}</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer border-0">{footer}</div>
          </Isi>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}

function FormRencana({ form, setForm, opsi, students, hariPulih, onSimpan }) {
  const ubah = (patch) => setForm((f) => ({ ...f, ...patch }));
  const pilih = (t) => ubah({ tindakan: form.tindakan.includes(t) ? form.tindakan.filter((x) => x !== t) : [...form.tindakan, t] });
  return (
    <Dialog judul={form.id ? "Ubah rencana pembinaan" : "Rencana pembinaan kehadiran"} ikon="bi-person-heart" onClose={() => setForm(null)} onSubmit={onSimpan}
      footer={<><button type="button" className="btn btn-light" onClick={() => setForm(null)}>Batal</button><button type="submit" className="btn btn-danger px-4 fw-semibold"><i className="bi bi-check2 me-1"></i>Simpan rencana</button></>}>
      <div className="mb-3">
        <label className="form-label small fw-semibold mb-1" htmlFor="pbSiswa">Siswa</label>
        {form.id || form.nama ? <div id="pbSiswa" className="form-control-plaintext fw-semibold py-0">{form.nama}</div> : (
          <select id="pbSiswa" className="form-select" value={form.id_siswa} onChange={(e) => ubah({ id_siswa: e.target.value })} required>
            <option value="">— Pilih siswa —</option>
            {students.map((s) => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa}</option>)}
          </select>
        )}
      </div>
      <fieldset className="mb-3">
        <legend className="form-label small fw-semibold mb-1">Tindakan pembinaan</legend>
        <div className="row g-1">
          {opsi.map((t, i) => (
            <div key={t} className="col-md-6">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id={`pbOpsi${i}`} checked={form.tindakan.includes(t)} onChange={() => pilih(t)} />
                <label className="form-check-label small" htmlFor={`pbOpsi${i}`}>{t}</label>
              </div>
            </div>
          ))}
        </div>
        <label className="form-label small mt-2 mb-1" htmlFor="pbLain">Tindakan lain (tulis sendiri, satu per baris)</label>
        <textarea id="pbLain" className="form-control form-control-sm" rows={2} value={form.lain} onChange={(e) => ubah({ lain: e.target.value })} placeholder="Mis. Mengatur antar-jemput bersama tetangga" />
      </fieldset>
      <div className="mb-3">
        <label className="form-label small fw-semibold mb-1" htmlFor="pbCatatan">Catatan / latar belakang</label>
        <textarea id="pbCatatan" className="form-control form-control-sm" rows={2} value={form.catatan} onChange={(e) => ubah({ catatan: e.target.value })} placeholder="Mis. Sering alpa hari Senin; rumah jauh dari sekolah" />
      </div>
      <div className="row g-2 mb-3">
        <div className="col-md-4">
          <label className="form-label small fw-semibold mb-1" htmlFor="pbMulai">Mulai</label>
          <input id="pbMulai" type="date" className="form-control form-control-sm" value={form.tanggal_mulai} onChange={(e) => ubah({ tanggal_mulai: e.target.value })} required />
        </div>
        <div className="col-md-4">
          <label className="form-label small fw-semibold mb-1" htmlFor="pbTindak">Tindak lanjut</label>
          <input id="pbTindak" type="date" className="form-control form-control-sm" value={form.tanggal_tindak_lanjut} min={form.tanggal_mulai} onChange={(e) => ubah({ tanggal_tindak_lanjut: e.target.value })} required />
        </div>
        <div className="col-md-4">
          <label className="form-label small fw-semibold mb-1" htmlFor="pbStatus">Status</label>
          <select id="pbStatus" className="form-select form-select-sm" value={form.status} onChange={(e) => ubah({ status: e.target.value })}>
            {["OTOMATIS", "BERLANGSUNG", "SELESAI", "BATAL"].map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-text mb-3">
        <b>Otomatis</b>: Direncanakan sampai tanggal mulai, lalu Berlangsung, dan Selesai sendiri setelah {hariPulih} hari presensi hadir berturut-turut tanpa alpa.
        Sejak tanggal tindak lanjut, pembinaan yang belum selesai muncul di <b>Perlu Tindakan</b>.
      </div>
      {(form.id || form.status === "SELESAI" || form.status === "BATAL") && (
        <div>
          <label className="form-label small fw-semibold mb-1" htmlFor="pbHasil">Hasil pembinaan</label>
          <textarea id="pbHasil" className="form-control form-control-sm" rows={2} value={form.hasil} onChange={(e) => ubah({ hasil: e.target.value })} />
        </div>
      )}
    </Dialog>
  );
}

function CatatJurnal({ r, idKelas, onClose, onSelesai, teksStatus }) {
  const [narasi, setNarasi] = useState(() => `[Pembinaan kehadiran] Tindakan: ${r.tindakan.join("; ")}.${r.catatan ? ` Catatan: ${r.catatan}.` : ""} Status: ${teksStatus}.${r.hasil ? ` Hasil: ${r.hasil}.` : ""}`);
  const [respons, setRespons] = useState("");
  const [mode, setMode] = useState("HEURISTIK");
  // Jurnal menolak hari Minggu/libur: bawaan hari ini, mundur ke Sabtu bila hari ini Minggu
  const [tanggal, setTanggal] = useState(() => { const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() - 1); return ymd(d); });
  const [skor, setSkor] = useState(null); // { val_S..val_M, ai_mode, ai_raw_response, untuk }
  const [sibuk, setSibuk] = useState(false);
  const skorBerlaku = skor && skor.untuk === respons.trim();

  const analisis = async () => {
    if (respons.trim().length < 10) return Swal.fire("Perhatian", "Tulis respons siswa minimal 10 huruf agar bisa dianalisis.", "warning");
    setSibuk(true);
    try {
      const d = (await minta("POST", "/jurnal/analyze", { narasi_kejadian: respons.trim(), ai_mode: mode })).data || {};
      const n = (v) => Number(v) || 0;
      setSkor({ val_S: n(d.S), val_T: n(d.T), val_N: n(d.N), val_K: n(d.K), val_M: n(d.M), ai_mode: d.mode || "HEURISTIK", ai_raw_response: d.raw || null, untuk: respons.trim() });
    } catch (err) { Swal.fire("Analisis gagal", err.message, "error"); } finally { setSibuk(false); }
  };

  const simpan = async () => {
    const teks = `${narasi.trim()}${respons.trim() ? `\nRespons siswa: ${respons.trim()}` : ""}`;
    if (teks.length < 10) return Swal.fire("Perhatian", "Catatan terlalu pendek.", "warning");
    setSibuk(true);
    try {
      const j = await minta("POST", "/jurnal/store", {
        tanggal, id_siswa: r.id_siswa, id_kelas: r.id_kelas || idKelas, narasi_kejadian: teks.slice(0, 2000), mode_dampak: "PISAH",
        ...(skorBerlaku ? { val_S: skor.val_S, val_T: skor.val_T, val_N: skor.val_N, val_K: skor.val_K, val_M: skor.val_M, ai_mode: skor.ai_mode, ai_raw_response: skor.ai_raw_response } : {}),
      });
      await minta("POST", `/presensi/pembinaan/${r.id_pembinaan}/jurnal`, { id_jurnal: j.data.id_jurnal });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Tercatat di jurnal (catatan terpisah)", showConfirmButton: false, timer: 2200 });
      onSelesai();
    } catch (err) { Swal.fire("Gagal mencatat", err.message, "error"); } finally { setSibuk(false); }
  };

  return (
    <Dialog judul={`Catat ke jurnal · ${r.siswa?.nama_siswa || ""}`} ikon="bi-journal-plus" onClose={onClose}
      footer={<><button type="button" className="btn btn-light" onClick={onClose} disabled={sibuk}>Batal</button><button type="button" className="btn btn-primary px-4 fw-semibold" onClick={simpan} disabled={sibuk}>{sibuk ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-journal-check me-1"></i>}Simpan ke jurnal</button></>}>
      <div className="alert alert-light border small py-2"><i className="bi bi-info-circle me-1"></i>Tercatat sebagai <b>catatan terpisah</b> (tidak masuk nilai rapor). Skor STNKM kosong, kecuali respons siswa dianalisis di bawah.</div>
      <div className="mb-3" style={{ maxWidth: 220 }}>
        <label className="form-label small fw-semibold mb-1" htmlFor="cjTanggal">Tanggal kejadian</label>
        <input id="cjTanggal" type="date" className="form-control form-control-sm" value={tanggal} max={ymd(new Date())} onChange={(e) => setTanggal(e.target.value)} required />
      </div>
      <label className="form-label small fw-semibold mb-1" htmlFor="cjNarasi">Catatan langkah pembinaan</label>
      <textarea id="cjNarasi" className="form-control form-control-sm mb-3" rows={4} value={narasi} onChange={(e) => setNarasi(e.target.value)} />
      <label className="form-label small fw-semibold mb-1" htmlFor="cjRespons">Respons siswa (opsional)</label>
      <textarea id="cjRespons" className="form-control form-control-sm mb-2" rows={2} value={respons} onChange={(e) => setRespons(e.target.value)} placeholder="Mis. Siswa mengakui terlambat bangun dan berjanji datang tepat waktu" />
      {respons.trim() && (
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <select className="form-select form-select-sm w-auto" aria-label="Mode analisis STNKM" value={mode} onChange={(e) => setMode(e.target.value)}>
            {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={analisis} disabled={sibuk}><i className="bi bi-stars me-1"></i>Analisis STNKM respons</button>
          {skorBerlaku && <span className="small">{DIMENSI.map(([k, l]) => <span key={k} className="badge text-bg-light border me-1">{l} {skor[k] > 0 ? `+${skor[k]}` : skor[k]}</span>)}</span>}
        </div>
      )}
    </Dialog>
  );
}
