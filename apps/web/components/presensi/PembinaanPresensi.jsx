"use client";
// Pembinaan kehadiran: rencana tindakan bagi siswa yang presensinya perlu perhatian (pilihan + tulisan guru + saran AI),
// catatan/latar belakang dengan editor kaya (checklist, foto/kamera, video, sisipan data kehadiran & jurnal),
// status Otomatis/Berlangsung/Selesai/Batal, tindak lanjut di Perlu Tindakan, catatan progres ke jurnal (catatan terpisah;
// STNKM kosong kecuali respons siswa dianalisis) yang bisa diperbarui sebagai versi baru sampai pembinaan selesai,
// riwayat versi seperti git, serta ekspor PDF/Excel.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { API_URL } from "@/app/lib/config";
import { MenuAksi } from "@/components/dashboard/menuAksi";
import EditorKaya, { esc, teksDariHtml } from "@/components/editor/EditorKaya";
import RiwayatVersi, { waktuVersi } from "@/components/editor/RiwayatVersi";
import { unduhExcelPembinaan, unduhPdfPembinaan } from "./eksporPembinaan";
import { TombolLipat, useLipat } from "./lipat";
import Pengisi, { teksPengisi } from "@/components/dashboard/Pengisi";

// Guru yang tercatat + akun penginput: catatan jurnal (guru jurnal) dan rencana (wali kelas siswa)
export const pengisiCatatan = (j) => ({ guru: j.guru_nama, idGuru: j.id_guru, pengisi: j.pencatat_nama, idGuruPengisi: j.pencatat_id_guru });
export const pengisiRencana = (r) => ({ guru: r.kelas?.wali_kelas?.nama_guru, idGuru: r.kelas?.wali_kelas?.id_guru, pengisi: r.pembuat?.name, idGuruPengisi: r.pembuat?.id_guru });

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
// Saran pembinaan: LOKAL = aturan sederhana dari data (tanpa AI, tanpa kuota)
const SARAN_MODES = [{ value: "LOKAL", label: "Analisis data lokal (tanpa AI)" }, ...AI_MODES.filter((m) => m.value !== "HEURISTIK")];
const KUNCI_SARAN = "pembinaan_ai";
const bacaModeSaran = () => { try { return localStorage.getItem(KUNCI_SARAN) || "GEMINI"; } catch (e) { return "GEMINI"; } };
const simpanModeSaran = (v) => { try { localStorage.setItem(KUNCI_SARAN, v); } catch (e) { /* abaikan */ } };
const DIMENSI = [["val_S", "S"], ["val_T", "T"], ["val_N", "N"], ["val_K", "K"], ["val_M", "M"]];
const STATUS_HADIR = { HADIR: "Hadir", SAKIT: "Sakit", IZIN: "Izin", ALPA: "Alpa" };

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tambahHari = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const tgl = (s) => { if (!s) return "-"; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); };
const potong = (s, n) => (s && s.length > n ? `${s.slice(0, n).trimEnd()}…` : s || "");
const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2200 });
const penggunaIni = () => { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch (e) { return null; } };
const mediaDalam = (html) => ({ foto: (html?.match(/<img\b/g) || []).length, video: (html?.match(/<video\b/g) || []).length });

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
  const [catat, setCatat] = useState(null);   // { r, jurnal? } catatan progres baru / yang diperbarui
  const [rinci, setRinci] = useState(null);   // id_pembinaan yang dibuka rinciannya
  const [ekspor, setEkspor] = useState(null); // 'pdf' | 'xlsx' saat sedang menyiapkan

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
    setForm({ id_siswa: siswa?.id_siswa || "", nama: siswa?.nama_siswa || "", tindakan: [], lain: "", catatan: "", tanggal_mulai: hariIni, tanggal_tindak_lanjut: tambahHari(hariIni, 14), status: "OTOMATIS", hasil: "", keterangan_versi: "" });
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
    lain: r.tindakan.filter((t) => !opsi.includes(t)).join("\n"), catatan: r.catatan || "", tanggal_mulai: r.tanggal_mulai, tanggal_tindak_lanjut: r.tanggal_tindak_lanjut,
    status: r.status, hasil: r.hasil || "", keterangan_versi: "", versi: r.versi_terakhir });

  const simpan = async (e) => {
    e.preventDefault();
    const tindakan = [...form.tindakan, ...form.lain.split("\n").map((t) => t.trim()).filter(Boolean)];
    if (!form.id_siswa) return Swal.fire("Perhatian", "Pilih siswa yang dibina.", "warning");
    if (!tindakan.length) return Swal.fire("Perhatian", "Pilih atau tulis minimal satu tindakan pembinaan.", "warning");
    const badan = { tindakan, catatan: form.catatan, tanggal_mulai: form.tanggal_mulai, tanggal_tindak_lanjut: form.tanggal_tindak_lanjut, status: form.status, hasil: form.hasil, keterangan_versi: form.keterangan_versi || null };
    try {
      const r = form.id ? await minta("PUT", `/presensi/pembinaan/${form.id}`, badan) : await minta("POST", "/presensi/pembinaan", { ...badan, id_siswa: form.id_siswa, id_periode: idPeriode || null });
      setForm(null);
      toast(r.message);
      muat();
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); }
  };

  const gantiStatus = async (r, status) => {
    let hasil;
    if (status === "SELESAI" || status === "BATAL") {
      const jawab = await Swal.fire({
        title: status === "SELESAI" ? "Tandai pembinaan selesai?" : "Batalkan pembinaan?", input: "textarea",
        inputLabel: status === "SELESAI" ? "Hasil pembinaan (opsional)" : "Alasan (opsional)", inputValue: r.hasil || "",
        html: '<div class="small text-muted">Setelah ini catatan progres di jurnal dikunci (hanya bisa dibaca).</div>',
        showCancelButton: true, confirmButtonText: status === "SELESAI" ? "Tandai selesai" : "Batalkan pembinaan", cancelButtonText: "Kembali",
      });
      if (!jawab.isConfirmed) return;
      hasil = jawab.value;
    }
    try {
      const x = await minta("PATCH", `/presensi/pembinaan/${r.id_pembinaan}/status`, { status, ...(hasil !== undefined ? { hasil } : {}) });
      toast(x.message);
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

  const unduh = async (jenis, daftar) => {
    if (!daftar.length) return Swal.fire("Tidak ada data", "Belum ada rencana pembinaan untuk diekspor.", "info");
    setEkspor(jenis);
    try {
      const rincian = await Promise.all(daftar.map((r) => minta("GET", `/presensi/pembinaan/${r.id_pembinaan}`).then((x) => x.data)));
      const o = { namaKelas, hariPulih, pencetak: penggunaIni()?.name };
      if (jenis === "pdf") await unduhPdfPembinaan(rincian, o); else await unduhExcelPembinaan(rincian, o);
    } catch (err) { Swal.fire("Ekspor gagal", err.message, "error"); }
    finally { setEkspor(null); }
  };

  const tutupCatat = (simpanBerhasil) => {
    setCatat(null);
    if (simpanBerhasil) muat();
  };

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
            <div className="btn-group btn-group-sm" role="group" aria-label="Ekspor rencana pembinaan">
              <button type="button" className="btn btn-outline-danger" onClick={() => unduh("pdf", tampil)} disabled={!!ekspor} title="Ekspor rencana yang tampil ke PDF">
                {ekspor === "pdf" ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-file-earmark-pdf"></i>}<span className="ms-1">PDF</span>
              </button>
              <button type="button" className="btn btn-outline-success" onClick={() => unduh("xlsx", tampil)} disabled={!!ekspor} title="Ekspor rencana yang tampil ke Excel">
                {ekspor === "xlsx" ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-file-earmark-excel"></i>}<span className="ms-1">Excel</span>
              </button>
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
                      const md = mediaDalam(r.catatan);
                      const vj = Math.max(0, ...(r.jurnal_detail || []).map((j) => j.versi_terakhir || 0));
                      return (
                        <tr key={r.id_pembinaan} className={r.perlu_tindak_lanjut ? "table-warning" : ""}>
                          <td>
                            <button type="button" className="btn btn-link p-0 fw-semibold text-start text-body text-decoration-none" onClick={() => setRinci(r.id_pembinaan)} title="Lihat rincian & riwayat">{r.siswa?.nama_siswa}</button>
                            {r.ringkasan_awal?.persen != null && <div className="text-muted">Awal: hadir {r.ringkasan_awal.persen}% · alpa {r.ringkasan_awal.alpa}</div>}
                          </td>
                          <td style={{ maxWidth: 340 }}>
                            <div className="d-flex flex-wrap gap-1">{r.tindakan.map((t) => <span key={t} className="badge text-bg-light border fw-normal text-wrap text-start">{t}</span>)}</div>
                            {r.catatan_teks && <div className="text-muted mt-1" style={{ whiteSpace: "pre-line" }}>{potong(r.catatan_teks.replace(/\[foto\]|\[video\]/g, "").trim(), 160)}</div>}
                            {(md.foto > 0 || md.video > 0) && <div className="text-muted mt-1">{md.foto > 0 && <span className="me-2"><i className="bi bi-image me-1"></i>{md.foto} foto</span>}{md.video > 0 && <span><i className="bi bi-film me-1"></i>{md.video} video</span>}</div>}
                            {r.hasil && <div className="mt-1"><b>Hasil:</b> {r.hasil}</div>}
                          </td>
                          <td className="text-nowrap">{tgl(r.tanggal_mulai)} → {tgl(r.tanggal_tindak_lanjut)}{r.perlu_tindak_lanjut && <div className="text-danger fw-semibold">Waktunya tindak lanjut</div>}</td>
                          <td>
                            <span className={`badge text-bg-${st.warna} fw-normal text-wrap text-start`}>{teksStatus(r, hariPulih)}</span>
                            {r.versi_terakhir > 0 && <div className="text-muted mt-1 font-monospace" title="Versi rencana">rencana v{r.versi_terakhir}{r.terkunci && <i className="bi bi-lock-fill ms-1" title="Terkunci"></i>}</div>}
                          </td>
                          <td className="text-center">
                            {r.jurnal_detail?.length ? (
                              <button type="button" className="btn btn-sm btn-light border py-0" onClick={() => setRinci(r.id_pembinaan)} title={r.jurnal_detail.map((j) => `${j.tanggal}: ${j.narasi_kejadian || "(catatan tertutup)"}`).join("\n")}>
                                {r.jurnal_detail.length} catatan{vj > 1 && <span className="text-muted font-monospace ms-1">v{vj}</span>}
                              </button>
                            ) : <span className="text-muted">–</span>}
                          </td>
                          <td className="text-center">
                            <MenuAksi label={`Aksi pembinaan ${r.siswa?.nama_siswa}`} items={[
                              { label: "Rincian & riwayat versi", ikon: "bi-clock-history", onClick: () => setRinci(r.id_pembinaan) },
                              { label: "Catat ke jurnal", ikon: "bi-journal-plus", tampil: !r.terkunci, onClick: () => setCatat({ r }) },
                              { label: "Ubah rencana", ikon: "bi-pencil-square", tampil: r.boleh_ubah, onClick: () => ubah(r) },
                              { label: "Ekspor PDF", ikon: "bi-file-earmark-pdf", onClick: () => unduh("pdf", [r]) },
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

      {form && <FormRencana form={form} setForm={setForm} opsi={opsi} students={students} hariPulih={hariPulih} idPeriode={idPeriode} onSimpan={simpan} />}
      {catat && <CatatJurnal r={catat.r} jurnal={catat.jurnal} onClose={() => tutupCatat(false)} onSelesai={() => tutupCatat(true)} teksStatus={teksStatus(catat.r, hariPulih)} />}
      {rinci && !catat && !form && (
        <RincianPembinaan id={rinci} hariPulih={hariPulih} onClose={() => setRinci(null)}
          onUbah={(r) => ubah(r)} onCatat={(r, jurnal) => setCatat({ r, jurnal })} onEkspor={(jenis, r) => unduh(jenis, [r])} ekspor={ekspor} />
      )}
    </div>
  );
});
export default PembinaanPresensi;

function Dialog({ judul, ikon, onClose, children, footer, onSubmit, lebar = "modal-lg" }) {
  const Isi = onSubmit ? "form" : "div";
  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-label={judul} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`modal-dialog ${lebar} modal-dialog-centered modal-dialog-scrollable`}>
          <Isi className="modal-content border-0 shadow rounded-4" onSubmit={onSubmit}>
            <div className="modal-header border-0 pb-0">
              <h5 className="modal-title fw-bold"><i className={`bi ${ikon} me-2 text-danger`}></i>{judul}</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer border-0">{footer}</div>}
          </Isi>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}

// ===================== SISIPAN DATA (untuk editor) =====================

function sisipanDari(k, tindakanTerpilih) {
  const sekarang = new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const tabel = (kepala, baris, sumber) => `<table data-sumber="${sumber}"><thead><tr>${kepala.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${baris.map((b) => `<tr>${b.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table><p><br></p>`;
  return [
    { label: "Checklist dari tindakan terpilih", ikon: "bi-check2-square", keterangan: "Tindakan yang dicentang menjadi daftar periksa",
      html: () => { const t = tindakanTerpilih(); return t.length ? `<ul class="cek">${t.map((x) => `<li data-cek="0">${esc(x)}</li>`).join("")}</ul><p><br></p>` : ""; } },
    { label: "Ringkasan kehadiran", ikon: "bi-pie-chart", keterangan: k ? `${k.ringkasan.hari} hari tercatat · alpa ${k.ringkasan.alpa}` : "Pilih siswa dulu",
      html: () => k && k.ringkasan.hari ? `<p><strong>Kehadiran:</strong> ${k.ringkasan.hari} hari tercatat — hadir ${k.ringkasan.hadir}${k.ringkasan.persen != null ? ` (${k.ringkasan.persen}%)` : ""}, sakit ${k.ringkasan.sakit}, izin ${k.ringkasan.izin}, alpa ${k.ringkasan.alpa}.</p>` : "" },
    { label: "Pola alpa per hari", ikon: "bi-calendar-week", keterangan: "Senin–Jumat",
      html: () => k && k.ringkasan.alpa ? tabel(Object.keys(k.alpa_per_hari), [Object.values(k.alpa_per_hari).map(String)], "pola-alpa") : "" },
    { label: "Ketidakhadiran terakhir", ikon: "bi-calendar-x", keterangan: "Tanggal, status, dan keterangan presensi",
      html: () => k?.tidak_hadir_terakhir.length ? tabel(["Tanggal", "Status", "Keterangan"], k.tidak_hadir_terakhir.map((x) => [`${x.hari}, ${tgl(x.tanggal)}`, STATUS_HADIR[x.status] || x.status, x.keterangan || "–"]), "presensi") : "" },
    { label: "Ketidakhadiran per mapel", ikon: "bi-journal-bookmark", keterangan: "Dari presensi per mapel guru mapel",
      html: () => k?.mapel_tidak_hadir.length ? tabel(["Mapel", "Tidak hadir", "Alpa"], k.mapel_tidak_hadir.map((x) => [x.mapel, String(x.jumlah), String(x.alpa)]), "presensi-mapel") : "" },
    { label: "Catatan jurnal terbaru", ikon: "bi-journal-text", keterangan: "Narasi jurnal siswa ini",
      html: () => k?.jurnal_terbaru.length ? `<p><strong>Catatan jurnal terbaru:</strong></p><ul>${k.jurnal_terbaru.map((j) => `<li>${esc(tgl(j.tanggal))}: ${esc(j.narasi)}</li>`).join("")}</ul><p><br></p>` : "" },
    { label: "Pembinaan sebelumnya", ikon: "bi-arrow-repeat", keterangan: "Rencana pembinaan lain untuk siswa ini",
      html: () => k?.pembinaan_sebelumnya.length ? `<p><strong>Pembinaan sebelumnya:</strong></p><ul>${k.pembinaan_sebelumnya.map((p) => `<li>${esc(tgl(p.tanggal_mulai))} (${esc(STATUS[p.status]?.label || p.status)}): ${esc(p.tindakan.join("; "))}${p.hasil ? ` — hasil: ${esc(p.hasil)}` : ""}</li>`).join("")}</ul><p><br></p>` : "" },
    { label: "Cap tanggal & jam", ikon: "bi-clock", keterangan: sekarang, html: () => `<p><strong>${esc(sekarang)}</strong> — </p>` },
  ];
}

function useKonteks(idSiswa, idPeriode, kecuali) {
  const [k, setK] = useState(null);
  useEffect(() => {
    setK(null);
    if (!idSiswa) return undefined;
    let batal = false;
    minta("GET", `/presensi/pembinaan/konteks?${new URLSearchParams({ id_siswa: idSiswa, ...(idPeriode ? { id_periode: idPeriode } : {}), ...(kecuali ? { kecuali } : {}) })}`)
      .then((r) => !batal && setK(r.data)).catch(() => !batal && setK(null));
    return () => { batal = true; };
  }, [idSiswa, idPeriode, kecuali]);
  return k;
}

// ===================== FORMULIR RENCANA =====================

function FormRencana({ form, setForm, opsi, students, hariPulih, idPeriode, onSimpan }) {
  const ubah = (patch) => setForm((f) => ({ ...f, ...patch }));
  const pilih = (t) => ubah({ tindakan: form.tindakan.includes(t) ? form.tindakan.filter((x) => x !== t) : [...form.tindakan, t] });
  const konteks = useKonteks(form.id_siswa, idPeriode, form.id);
  const [panelAi, setPanelAi] = useState(false);
  const [mode, setMode] = useState(bacaModeSaran);
  const [arahan, setArahan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [saran, setSaran] = useState(null);
  const tindakanTerpilih = () => [...form.tindakan, ...form.lain.split("\n").map((t) => t.trim()).filter(Boolean)];
  const polaAlpa = konteks ? Object.entries(konteks.alpa_per_hari).filter(([, n]) => n > 0) : [];

  const mintaSaran = async ({ hanyaCatatan = false } = {}) => {
    if (!form.id_siswa) return Swal.fire("Perhatian", "Pilih siswa dulu agar saran memakai data kehadirannya.", "warning");
    simpanModeSaran(mode);
    setSibuk(true);
    try {
      const r = await minta("POST", "/presensi/pembinaan/ai", { bagian: "rencana", ai_mode: mode, id_siswa: form.id_siswa, id_periode: idPeriode || null, arahan: arahan || null, tindakan: tindakanTerpilih(), catatan: form.catatan });
      const d = r.data;
      const htmlCatatan = `${d.latar_belakang ? `<p>${esc(d.latar_belakang)}</p>` : ""}${d.langkah?.length ? `<h4>Langkah pembinaan</h4><ul class="cek">${d.langkah.map((l) => `<li data-cek="0">${esc(l)}</li>`).join("")}</ul>` : ""}`;
      setForm((f) => {
        const lainAda = f.lain.split("\n").map((t) => t.trim()).filter(Boolean);
        return {
          ...f,
          ...(hanyaCatatan ? {} : { tindakan: [...new Set([...f.tindakan, ...d.tindakan])], lain: [...new Set([...lainAda, ...(d.tindakan_lain || [])])].join("\n") }),
          catatan: f.catatan && teksDariHtml(f.catatan) ? `${f.catatan}${htmlCatatan}` : htmlCatatan,
        };
      });
      setSaran(d);
      toast(hanyaCatatan ? "Draf catatan dimasukkan — periksa sebelum menyimpan" : "Saran diterapkan — periksa sebelum menyimpan");
    } catch (err) { Swal.fire("Saran belum berhasil", err.message, "warning"); }
    finally { setSibuk(false); }
  };

  return (
    <Dialog judul={form.id ? "Ubah rencana pembinaan" : "Rencana pembinaan kehadiran"} ikon="bi-person-heart" onClose={() => setForm(null)} onSubmit={onSimpan}
      footer={<><button type="button" className="btn btn-light" onClick={() => setForm(null)}>Batal</button><button type="submit" className="btn btn-danger px-4 fw-semibold"><i className="bi bi-check2 me-1"></i>Simpan rencana</button></>}>
      <div className="mb-3 d-flex flex-wrap align-items-end gap-2">
        <div className="flex-grow-1">
          <label className="form-label small fw-semibold mb-1" htmlFor="pbSiswa">Siswa</label>
          {form.id || form.nama ? <div id="pbSiswa" className="form-control-plaintext fw-semibold py-0">{form.nama}</div> : (
            <select id="pbSiswa" className="form-select" value={form.id_siswa} onChange={(e) => ubah({ id_siswa: e.target.value })} required>
              <option value="">— Pilih siswa —</option>
              {students.map((s) => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa}</option>)}
            </select>
          )}
          {konteks?.ringkasan?.hari > 0 && (
            <div className="small text-muted mt-1">
              <i className="bi bi-graph-up me-1"></i>{konteks.ringkasan.hari} hari tercatat · hadir {konteks.ringkasan.persen}% · alpa {konteks.ringkasan.alpa}
              {polaAlpa.length > 0 && <> · alpa per hari: {polaAlpa.map(([h, n]) => `${h} ${n}`).join(", ")}</>}
            </div>
          )}
        </div>
        <button type="button" className={`btn btn-sm ${panelAi ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setPanelAi((v) => !v)} aria-expanded={panelAi}>
          <i className="bi bi-stars me-1"></i>Saran AI
        </button>
      </div>

      {panelAi && (
        <div className="border rounded-3 p-2 mb-3 bg-body-tertiary">
          <div className="small mb-2">AI membaca data kehadiran, keterangan presensi, presensi per mapel, jurnal, dan pembinaan sebelumnya, lalu menyarankan <b>tindakan</b>, <b>latar belakang</b>, dan <b>langkah (checklist)</b>. Nama siswa tidak dikirim ke penyedia AI.</div>
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label small mb-1" htmlFor="pbModeAi">Sumber saran</label>
              <select id="pbModeAi" className="form-select form-select-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
                {SARAN_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="col-md-8">
              <label className="form-label small mb-1" htmlFor="pbArahan">Yang Anda ketahui (opsional)</label>
              <input id="pbArahan" className="form-control form-control-sm" value={arahan} onChange={(e) => setArahan(e.target.value)} placeholder="Mis. rumah di kampung seberang, sering membantu orang tua ke kebun" />
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2 mt-2 align-items-center">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => mintaSaran()} disabled={sibuk}>{sibuk ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-magic me-1"></i>}Buat & terapkan saran</button>
            {saran?.alasan && <span className="small text-muted"><i className="bi bi-lightbulb me-1"></i>{saran.alasan}</span>}
          </div>
        </div>
      )}

      <fieldset className="mb-3">
        <legend className="form-label small fw-semibold mb-1">Tindakan pembinaan</legend>
        <div className="row g-1">
          {opsi.map((t, i) => (
            <div key={t} className="col-md-6">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" id={`pbOpsi${i}`} checked={form.tindakan.includes(t)} onChange={() => pilih(t)} />
                <label className="form-check-label small" htmlFor={`pbOpsi${i}`}>{t}{saran?.tindakan?.includes(t) && <i className="bi bi-stars text-primary ms-1" title="Disarankan"></i>}</label>
              </div>
            </div>
          ))}
        </div>
        <label className="form-label small mt-2 mb-1" htmlFor="pbLain">Tindakan lain (tulis sendiri, satu per baris)</label>
        <textarea id="pbLain" className="form-control form-control-sm" rows={2} value={form.lain} onChange={(e) => ubah({ lain: e.target.value })} placeholder="Mis. Mengatur antar-jemput bersama tetangga" />
      </fieldset>
      <div className="mb-3">
        <div className="form-label small fw-semibold mb-1">Catatan / latar belakang</div>
        <EditorKaya value={form.catatan} onChange={(html) => ubah({ catatan: html })} label="Catatan / latar belakang" entitas="pembinaan"
          placeholder="Mis. Sering alpa hari Senin; rumah jauh dari sekolah. Sisipkan data, checklist langkah, atau foto kunjungan rumah."
          sisipan={sisipanDari(konteks, tindakanTerpilih)} onAi={() => mintaSaran({ hanyaCatatan: true })} aiSibuk={sibuk} labelAi="Bantu tulis" />
        <div className="form-text">Klik kotak pada daftar centang untuk menandai langkah yang sudah dilakukan. Foto bisa diambil langsung dari kamera HP.</div>
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
        <div className="mb-3">
          <label className="form-label small fw-semibold mb-1" htmlFor="pbHasil">Hasil pembinaan</label>
          <textarea id="pbHasil" className="form-control form-control-sm" rows={2} value={form.hasil} onChange={(e) => ubah({ hasil: e.target.value })} />
        </div>
      )}
      {form.id && (
        <div>
          <label className="form-label small fw-semibold mb-1" htmlFor="pbVersi"><i className="bi bi-git me-1"></i>Keterangan perubahan (versi {(form.versi || 0) + 1})</label>
          <input id="pbVersi" className="form-control form-control-sm" maxLength={300} value={form.keterangan_versi} onChange={(e) => ubah({ keterangan_versi: e.target.value })} placeholder="Mis. Menambah kunjungan rumah setelah orang tua sulit dihubungi" />
        </div>
      )}
    </Dialog>
  );
}

// ===================== CATATAN PROGRES KE JURNAL =====================

function CatatJurnal({ r, jurnal, onClose, onSelesai, teksStatus }) {
  const pengguna = penggunaIni();
  const [narasi, setNarasi] = useState(() => jurnal?.isi?.catatan
    ?? `[Pembinaan kehadiran] Tindakan: ${r.tindakan.join("; ")}.${r.catatan_teks ? ` Catatan: ${potong(r.catatan_teks.replace(/\n/g, "; "), 400)}.` : ""} Status: ${teksStatus}.${r.hasil ? ` Hasil: ${r.hasil}.` : ""}`);
  const [respons, setRespons] = useState(jurnal?.isi?.respons || "");
  const [mode, setMode] = useState("HEURISTIK");
  const [modeSaran, setModeSaran] = useState(bacaModeSaran);
  const [keterangan, setKeterangan] = useState("");
  // Jurnal menolak hari Minggu/libur: bawaan hari ini, mundur ke Sabtu bila hari ini Minggu
  const [tanggal, setTanggal] = useState(() => { if (jurnal?.tanggal) return jurnal.tanggal; const d = new Date(); if (d.getDay() === 0) d.setDate(d.getDate() - 1); return ymd(d); });
  const [skor, setSkor] = useState(null); // { val_S..val_M, ai_mode, ai_raw_response, untuk }
  const [sibuk, setSibuk] = useState(false);
  const skorBerlaku = skor && skor.untuk === respons.trim();
  const versiBaru = (jurnal?.versi_terakhir || 0) + 1;

  const analisis = async () => {
    if (respons.trim().length < 10) return Swal.fire("Perhatian", "Tulis respons siswa minimal 10 huruf agar bisa dianalisis.", "warning");
    setSibuk(true);
    try {
      const d = (await minta("POST", "/jurnal/analyze", { narasi_kejadian: respons.trim(), ai_mode: mode })).data || {};
      const n = (v) => Number(v) || 0;
      setSkor({ val_S: n(d.S), val_T: n(d.T), val_N: n(d.N), val_K: n(d.K), val_M: n(d.M), ai_mode: d.mode || "HEURISTIK", ai_raw_response: d.raw || null, untuk: respons.trim() });
    } catch (err) { Swal.fire("Analisis gagal", err.message, "error"); } finally { setSibuk(false); }
  };

  const draf = async () => {
    simpanModeSaran(modeSaran);
    setSibuk(true);
    try {
      const d = (await minta("POST", "/presensi/pembinaan/ai", { bagian: "progres", ai_mode: modeSaran, id_pembinaan: r.id_pembinaan, arahan: narasi.trim() || null })).data;
      setNarasi(d.catatan);
      toast("Draf catatan dimasukkan — periksa sebelum menyimpan");
    } catch (err) { Swal.fire("Draf belum berhasil", err.message, "warning"); } finally { setSibuk(false); }
  };

  const simpan = async () => {
    if (narasi.trim().length < 10) return Swal.fire("Perhatian", "Catatan terlalu pendek.", "warning");
    setSibuk(true);
    try {
      const x = await minta("POST", `/presensi/pembinaan/${r.id_pembinaan}/progres`, {
        ...(jurnal ? { id_jurnal: jurnal.id_jurnal } : {}), tanggal, catatan: narasi.trim().slice(0, 1800), respons: respons.trim() || null, keterangan_versi: keterangan.trim() || null,
        ...(skorBerlaku ? { skor: { S: skor.val_S, T: skor.val_T, N: skor.val_N, K: skor.val_K, M: skor.val_M }, ai_mode: skor.ai_mode, ai_raw_response: skor.ai_raw_response } : {}),
      });
      toast(x.message);
      onSelesai();
    } catch (err) { Swal.fire("Gagal mencatat", err.message, "error"); } finally { setSibuk(false); }
  };

  return (
    <Dialog judul={`${jurnal ? "Perbarui catatan" : "Catat ke jurnal"} · ${r.siswa?.nama_siswa || ""}`} ikon={jurnal ? "bi-journal-arrow-up" : "bi-journal-plus"} onClose={onClose}
      footer={<><button type="button" className="btn btn-light" onClick={onClose} disabled={sibuk}>Batal</button><button type="button" className="btn btn-primary px-4 fw-semibold" onClick={simpan} disabled={sibuk}>{sibuk ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-journal-check me-1"></i>}{jurnal ? `Simpan versi ${versiBaru}` : "Simpan ke jurnal"}</button></>}>
      <div className="alert alert-light border small py-2"><i className="bi bi-info-circle me-1"></i>Tercatat sebagai <b>catatan terpisah</b> (tidak masuk nilai rapor). Skor STNKM kosong, kecuali respons siswa dianalisis di bawah.</div>
      <div className="d-flex flex-wrap gap-3 small mb-3 text-muted">
        {jurnal ? <>
          <span><i className="bi bi-person-check me-1"></i>Dicatat oleh <b>{teksPengisi(pengisiCatatan(jurnal))}</b></span>
          <span><i className="bi bi-git me-1"></i>Versi sekarang v{jurnal.versi_terakhir || 1} → disimpan sebagai <b>v{versiBaru}</b> atas nama <b>{pengguna?.name || "Anda"}</b></span>
        </> : <span><i className="bi bi-person-check me-1"></i>Dicatat atas nama <b>{pengguna?.name || "akun Anda"}</b> · versi 1</span>}
      </div>
      <div className="mb-3" style={{ maxWidth: 220 }}>
        <label className="form-label small fw-semibold mb-1" htmlFor="cjTanggal">Tanggal kejadian</label>
        <input id="cjTanggal" type="date" className="form-control form-control-sm" value={tanggal} max={ymd(new Date())} onChange={(e) => setTanggal(e.target.value)} required />
      </div>
      <div className="d-flex flex-wrap align-items-end gap-2 mb-1">
        <label className="form-label small fw-semibold mb-0 me-auto" htmlFor="cjNarasi">Catatan langkah pembinaan</label>
        <select className="form-select form-select-sm w-auto" aria-label="Sumber draf catatan" value={modeSaran} onChange={(e) => setModeSaran(e.target.value)}>
          {SARAN_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={draf} disabled={sibuk} title="Susun catatan dari data kehadiran sejak pembinaan dimulai; tulisan Anda dipakai sebagai bahan"><i className="bi bi-stars me-1"></i>Bantu tulis</button>
      </div>
      <textarea id="cjNarasi" className="form-control form-control-sm mb-3" rows={5} maxLength={1800} value={narasi} onChange={(e) => setNarasi(e.target.value)} />
      <label className="form-label small fw-semibold mb-1" htmlFor="cjRespons">Respons siswa (opsional)</label>
      <textarea id="cjRespons" className="form-control form-control-sm mb-2" rows={2} maxLength={600} value={respons} onChange={(e) => setRespons(e.target.value)} placeholder="Mis. Siswa mengakui terlambat bangun dan berjanji datang tepat waktu" />
      {respons.trim() && (
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <select className="form-select form-select-sm w-auto" aria-label="Mode analisis STNKM" value={mode} onChange={(e) => setMode(e.target.value)}>
            {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={analisis} disabled={sibuk}><i className="bi bi-stars me-1"></i>Analisis STNKM respons</button>
          {skorBerlaku && <span className="small">{DIMENSI.map(([k, l]) => <span key={k} className="badge text-bg-light border me-1">{l} {skor[k] > 0 ? `+${skor[k]}` : skor[k]}</span>)}</span>}
          {jurnal && !skorBerlaku && jurnal.isi?.respons === respons.trim() && <span className="small text-muted">Skor STNKM sebelumnya tetap dipakai.</span>}
        </div>
      )}
      <label className="form-label small fw-semibold mb-1" htmlFor="cjVersi"><i className="bi bi-git me-1"></i>Keterangan {jurnal ? "perubahan" : "catatan"} (opsional)</label>
      <input id="cjVersi" className="form-control form-control-sm" maxLength={300} value={keterangan} onChange={(e) => setKeterangan(e.target.value)}
        placeholder={jurnal ? "Mis. Orang tua sudah dihubungi; siswa hadir 3 hari berturut-turut" : "Mis. Pertemuan pertama dengan siswa"} />
      <div className="form-text">Selama pembinaan belum selesai, catatan ini bisa diperbarui; setiap perubahan disimpan sebagai versi baru dan riwayatnya bisa dilihat.</div>
    </Dialog>
  );
}

// ===================== RINCIAN & RIWAYAT =====================

const BIDANG_RENCANA = [
  { label: "Tindakan", teks: (i) => (i.tindakan || []).join("\n") },
  { label: "Catatan", teks: (i) => teksDariHtml(i.catatan) },
  { label: "Jadwal", teks: (i) => (i.tanggal_mulai ? `${tgl(i.tanggal_mulai)} → ${tgl(i.tanggal_tindak_lanjut)}` : "") },
  { label: "Status", teks: (i) => STATUS[i.status]?.label || i.status || "" },
  { label: "Hasil", teks: (i) => i.hasil || "" },
];
const BIDANG_JURNAL = [
  { label: "Tanggal", teks: (i) => (i.tanggal ? tgl(i.tanggal) : "") },
  { label: "Catatan", teks: (i) => i.catatan || "" },
  { label: "Respons siswa", teks: (i) => i.respons || "" },
  { label: "Skor STNKM", teks: (i) => (i.skor ? Object.entries(i.skor).map(([k, v]) => `${k} ${v}`).join(" · ") : "") },
];

function RincianPembinaan({ id, hariPulih, onClose, onUbah, onCatat, onEkspor, ekspor }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("catatan");
  const [bukaVersi, setBukaVersi] = useState(null);
  useEffect(() => {
    let batal = false;
    minta("GET", `/presensi/pembinaan/${id}`).then((r) => !batal && setD(r.data)).catch((e) => { Swal.fire("Gagal memuat", e.message, "error"); onClose(); });
    return () => { batal = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = d ? STATUS[d.efektif?.status] || STATUS.BERLANGSUNG : null;
  return (
    <Dialog judul={`Rincian pembinaan · ${d?.siswa?.nama_siswa || ""}`} ikon="bi-clock-history" onClose={onClose} lebar="modal-xl"
      footer={d && <>
        <div className="me-auto d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onEkspor("pdf", d)} disabled={!!ekspor}><i className="bi bi-file-earmark-pdf me-1"></i>Ekspor PDF</button>
          <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onEkspor("xlsx", d)} disabled={!!ekspor}><i className="bi bi-file-earmark-excel me-1"></i>Ekspor Excel</button>
        </div>
        {d.boleh_ubah && <button type="button" className="btn btn-light" onClick={() => onUbah(d)}><i className="bi bi-pencil-square me-1"></i>Ubah rencana</button>}
        {!d.terkunci && <button type="button" className="btn btn-primary" onClick={() => onCatat(d)}><i className="bi bi-journal-plus me-1"></i>Catat progres baru</button>}
      </>}>
      {!d ? <div className="text-center text-muted py-5"><span className="spinner-border spinner-border-sm me-2"></span>Memuat rincian…</div> : (
        <>
          {d.terkunci && <div className="alert alert-secondary small py-2"><i className="bi bi-lock-fill me-1"></i>Pembinaan {d.efektif?.status === "SELESAI" ? "selesai" : "dibatalkan"}: catatan dikunci dan hanya bisa dibaca. Riwayat versinya tetap tersimpan.</div>}
          <div className="row g-3">
            <div className="col-lg-5">
              <div className="small">
                <div className="mb-2"><span className={`badge text-bg-${st.warna} fw-normal`}>{teksStatus(d, hariPulih)}</span>{d.versi_terakhir > 0 && <span className="badge text-bg-light border font-monospace ms-1">rencana v{d.versi_terakhir}</span>}</div>
                <div><b>Kelas:</b> {d.kelas?.nama_kelas || "-"} · <b>Wali kelas:</b> <Pengisi sebaris {...pengisiRencana(d)} /></div>
                <div><b>Mulai → tindak lanjut:</b> {tgl(d.tanggal_mulai)} → {tgl(d.tanggal_tindak_lanjut)}</div>
                {d.ringkasan_awal?.hari > 0 && <div><b>Kondisi awal:</b> hadir {d.ringkasan_awal.persen}% · alpa {d.ringkasan_awal.alpa} dari {d.ringkasan_awal.hari} hari</div>}
                <div><b>Kemajuan:</b> {d.efektif?.beruntun ?? 0}/{hariPulih} hari hadir beruntun · {d.efektif?.alpa ?? 0} alpa sejak mulai</div>
                {d.hasil && <div><b>Hasil:</b> {d.hasil}</div>}
                <div className="fw-semibold mt-2 mb-1">Tindakan</div>
                <div className="d-flex flex-wrap gap-1 mb-2">{d.tindakan.map((t) => <span key={t} className="badge text-bg-light border fw-normal text-wrap text-start">{t}</span>)}</div>
                <div className="fw-semibold mb-1">Catatan / latar belakang</div>
                {d.catatan ? <div className="isi-kaya border rounded-3 p-2" dangerouslySetInnerHTML={{ __html: d.catatan }} /> : <div className="text-muted">–</div>}
              </div>
            </div>
            <div className="col-lg-7">
              <ul className="nav nav-tabs small mb-2">
                {[["catatan", `Catatan progres (${d.jurnal_detail.length})`], ["rencana", `Riwayat rencana (${d.riwayat.length})`]].map(([v, l]) => (
                  <li key={v} className="nav-item"><button type="button" className={`nav-link py-1 ${tab === v ? "active" : ""}`} onClick={() => setTab(v)}>{l}</button></li>
                ))}
              </ul>
              {tab === "rencana" ? <RiwayatVersi versi={d.riwayat} bidang={BIDANG_RENCANA} kosong="Rencana ini dibuat sebelum riwayat versi tersedia." /> : (
                d.jurnal_detail.length === 0 ? <div className="text-muted small">Belum ada catatan progres.{d.terkunci ? "" : " Tekan Catat progres baru."}</div> : (
                  <div className="d-flex flex-column gap-2">
                    {[...d.jurnal_detail].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal))).map((j) => (
                      <div key={j.id_jurnal} className="border rounded-3 p-2 small">
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                          <b>{tgl(j.tanggal)}</b>
                          {j.versi_terakhir > 0 && <span className="badge text-bg-light border font-monospace">v{j.versi_terakhir}</span>}
                          <span className="text-muted"><i className="bi bi-person-check me-1"></i><Pengisi sebaris {...pengisiCatatan(j)} /></span>
                          {j.versi?.[0] && j.versi_terakhir > 1 && <span className="text-muted">· diubah {waktuVersi(j.versi[0].waktu)} oleh {j.versi[0].oleh || "—"}</span>}
                          <span className="ms-auto d-flex gap-1">
                            {!d.terkunci && (j.boleh_perbarui || d.boleh_ubah) && j.isi && <button type="button" className="btn btn-sm btn-outline-primary py-0" onClick={() => onCatat(d, j)}><i className="bi bi-pencil me-1"></i>Perbarui</button>}
                            {j.versi?.length > 0 && <button type="button" className="btn btn-sm btn-light border py-0" onClick={() => setBukaVersi(bukaVersi === j.id_jurnal ? null : j.id_jurnal)} aria-expanded={bukaVersi === j.id_jurnal}><i className="bi bi-git me-1"></i>Riwayat</button>}
                          </span>
                        </div>
                        {j.isi ? <>
                          <div style={{ whiteSpace: "pre-wrap" }}>{j.isi.catatan}</div>
                          {j.isi.respons && <div className="mt-1"><b>Respons siswa:</b> {j.isi.respons}</div>}
                        </> : <div className="text-muted fst-italic">(catatan tertutup)</div>}
                        {bukaVersi === j.id_jurnal && <div className="mt-2"><RiwayatVersi versi={j.versi} bidang={BIDANG_JURNAL} /></div>}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
