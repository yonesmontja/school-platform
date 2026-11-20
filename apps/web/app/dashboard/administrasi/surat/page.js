"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { MenuAksi } from "@/components/dashboard/menuAksi";
import Pengisi from "@/components/dashboard/Pengisi";
import EditorKaya from "@/components/editor/EditorKaya";
import { esc, gagal, gantiTabUrl, kirimForm, lihatBerkas, mintaAlasan, nilai, tgl, toast, useTerbaru, yakin } from "../bantu";
import { cetakSurat } from "./cetak";

const TAB = [
  { id: "keluar", label: "Surat Keluar", ikon: "bi-send" },
  { id: "masuk", label: "Surat Masuk", ikon: "bi-inbox" },
  { id: "arsip", label: "Arsip", ikon: "bi-archive" },
  { id: "legal", label: "Dokumen Legal", ikon: "bi-shield-check" },
  { id: "templat", label: "Templat & Nomor", ikon: "bi-file-earmark-text" },
];
const WARNA_KELUAR = { DRAF: "secondary", DIAJUKAN: "warning", TERBIT: "success", BATAL: "dark" };
const WARNA_MASUK = { BARU: "warning", DIDISPOSISI: "info", SELESAI: "success" };
const NAMA_MASUK = { BARU: "Belum didisposisi", DIDISPOSISI: "Didisposisi", SELESAI: "Selesai" };
const NAMA_DISPOSISI = { BARU: "Belum dibaca", DIBACA: "Dibaca", SELESAI: "Selesai" };

/**
 * Surat & Arsip (Administrasi Sekolah Tahap D): surat keluar dari templat dengan nomor otomatis, tanda tangan
 * kepala sekolah dan kode verifikasi; surat masuk + disposisi; arsip berlabel; dokumen legal dengan masa berlaku.
 */
export default function SuratPage() {
  const akses = useAkses();
  const bolehUbah = !akses.isPeninjau;
  const [tab, setTab] = useState("keluar");
  const [pilihan, setPilihan] = useState(null);
  const [galat, setGalat] = useState("");
  const [saringAwal, setSaringAwal] = useState("");

  const muatPilihan = useCallback(() => minta("GET", "/administrasi/surat/pilihan").then((r) => setPilihan(r.data)).catch((e) => setGalat(e.message)), []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (TAB.some((t) => t.id === q.get("tab"))) setTab(q.get("tab"));
    if (q.get("status")) setSaringAwal(q.get("status"));
    muatPilihan();
  }, [muatPilihan]);
  const pindah = (t) => { setTab(t); setSaringAwal(""); gantiTabUrl(t); };

  if (galat) return <div className="container-fluid py-3"><div className="alert alert-warning">{galat}</div></div>;
  if (!pilihan) return <div className="container-fluid py-3 text-muted">Memuat…</div>;
  const props = { pilihan, bolehUbah, muatPilihan, isKepsek: akses.isKepsek, saringAwal };
  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1250 }}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <div className="small text-muted"><Link href="/dashboard/administrasi">Administrasi Sekolah</Link></div>
          <h3 className="fw-bold mb-0"><i className="bi bi-envelope-paper text-primary me-2"></i>Surat & Arsip</h3>
        </div>
        {!bolehUbah && <span className="badge text-bg-secondary">Mode lihat saja</span>}
      </div>
      <ul className="nav nav-pills flex-nowrap overflow-auto gap-1 mb-3" role="tablist">
        {TAB.map((t) => (
          <li key={t.id} className="nav-item">
            <button type="button" role="tab" aria-selected={tab === t.id} className={`nav-link text-nowrap ${tab === t.id ? "active" : ""}`} onClick={() => pindah(t.id)}>
              <i className={`bi ${t.ikon} me-1`}></i>{t.label}
            </button>
          </li>
        ))}
      </ul>
      {tab === "keluar" && <SuratKeluar {...props} />}
      {tab === "masuk" && <SuratMasuk {...props} />}
      {tab === "arsip" && <Arsip {...props} jenis="ARSIP" />}
      {tab === "legal" && <Arsip {...props} jenis="LEGAL" />}
      {tab === "templat" && <Templat {...props} />}
    </div>
  );
}

/** Menu "Sisipkan data" di editor: isian {{kunci}} yang diisi otomatis. */
const sisipanIsian = (pilihan) => pilihan.isian.map((i) => ({ label: i.nama, keterangan: `{{${i.kunci}}}`, ikon: "bi-braces", html: () => `{{${i.kunci}}}` }));

// ===================== SURAT KELUAR =====================
function SuratKeluar({ pilihan, bolehUbah, isKepsek, saringAwal }) {
  const [status, setStatus] = useState(saringAwal || "");
  const [cari, setCari] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("cari") || "")); // ?cari= dari pencarian global
  const [daftar, setDaftar] = useState(null);
  const [edit, setEdit] = useState(null); // null | {} (baru) | surat
  const terbaru = useTerbaru();
  const muat = useCallback(() => {
    const q = new URLSearchParams({ ...(status && { status }), ...(cari && { search: cari }) });
    terbaru(minta("GET", `/administrasi/surat/keluar?${q}`)).then((r) => setDaftar(r.data)).catch(gagal);
  }, [status, cari, terbaru]);
  useEffect(() => { const t = setTimeout(muat, 250); return () => clearTimeout(t); }, [muat]);

  const aksi = async (s, jalur, pesanKonfirmasi) => {
    if (pesanKonfirmasi) {
      const k = await Swal.fire({ title: pesanKonfirmasi.judul, text: pesanKonfirmasi.teks, icon: "question", showCancelButton: true, confirmButtonText: pesanKonfirmasi.tombol, cancelButtonText: "Batal" });
      if (!k.isConfirmed) return;
    }
    try { const r = await minta("POST", `/administrasi/surat/keluar/${s.id}/${jalur}`); toast(r.message); muat(); } catch (e) { gagal(e); }
  };
  const batal = async (s) => {
    const alasan = await mintaAlasan(`Batalkan surat ${s.nomor}?`, { text: "Nomor surat tetap tercatat dan tidak dipakai ulang.", tombol: "Batalkan surat" });
    if (!alasan) return;
    try { const r = await minta("POST", `/administrasi/surat/keluar/${s.id}/batal`, { alasan }); toast(r.message); muat(); } catch (e) { gagal(e); }
  };
  const hapus = async (s) => {
    if (!(await yakin("Hapus draf ini?", s.perihal))) return;
    try { const r = await minta("DELETE", `/administrasi/surat/keluar/${s.id}`); toast(r.message); muat(); } catch (e) { gagal(e); }
  };
  const bukaEdit = async (s) => {
    try { setEdit(s ? (await minta("GET", `/administrasi/surat/keluar/${s.id}`)).data : {}); } catch (e) { gagal(e); }
  };

  if (edit) return <EditorSurat surat={edit} pilihan={pilihan} onTutup={() => setEdit(null)} onSimpan={() => { setEdit(null); muat(); }} />;

  const terbitkan = isKepsek
    ? { label: "Tandatangani & terbitkan", ikon: "bi-pen", jalur: "tandatangani", konfirmasi: { judul: "Tandatangani & terbitkan?", teks: "Surat diberi nomor dan tanda tangan elektronik Anda.", tombol: "Tandatangani" } }
    : { label: "Terbitkan (tanda tangan basah)", ikon: "bi-check2-square", jalur: "terbitkan", konfirmasi: { judul: "Terbitkan surat?", teks: "Surat diberi nomor. Cetak lalu mintakan tanda tangan kepala sekolah di kertas.", tombol: "Terbitkan" } };

  return (
    <div className="card">
      <div className="card-body d-flex flex-wrap gap-2 align-items-center">
        <select className="form-select form-select-sm w-auto" aria-label="Saring status surat" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>{pilihan.status.map((s) => <option key={s.kode} value={s.kode}>{s.nama}</option>)}
        </select>
        <input className="form-control form-control-sm" style={{ maxWidth: 260 }} placeholder="Cari perihal, nomor, tujuan…" aria-label="Cari surat keluar" value={cari} onChange={(e) => setCari(e.target.value)} />
        {bolehUbah && <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => bukaEdit(null)}><i className="bi bi-plus-lg me-1"></i>Surat baru</button>}
      </div>
      <div className="list-group list-group-flush">
        {!daftar && <div className="list-group-item text-muted">Memuat…</div>}
        {daftar?.length === 0 && <div className="list-group-item text-muted">Belum ada surat keluar.</div>}
        {daftar?.map((s) => (
          <div key={s.id} className="list-group-item d-flex align-items-center gap-2" data-surat-keluar={s.perihal}>
            <div className="me-auto">
              <div className="fw-semibold">{s.perihal} <span className={`badge text-bg-${WARNA_KELUAR[s.status]} ms-1`} data-status-surat>{pilihan.status.find((x) => x.kode === s.status)?.nama}</span>
                {s.ditandatangani_at && <span className="badge text-bg-light border ms-1"><i className="bi bi-pen me-1"></i>TTD elektronik</span>}</div>
              <div className="small text-muted"><span data-nomor-surat>{s.nomor || "Belum bernomor"}</span> · {tgl(s.tanggal)} · {String(s.tujuan).split("\n")[0]}</div>
              <div className="small d-flex gap-1 align-items-center">Dibuat <Pengisi pengisi={s.pembuat?.name} sebaris />{s.alasan_batal && <span className="text-danger">· batal: {s.alasan_batal}</span>}</div>
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => cetakSurat(s.id)} title="Lihat / cetak"><i className="bi bi-printer"></i></button>
            {bolehUbah && <MenuAksi label={`Aksi untuk ${s.perihal}`} items={[
              { label: "Ubah", ikon: "bi-pencil-square", onClick: () => bukaEdit(s), tampil: ["DRAF", "DIAJUKAN"].includes(s.status) },
              { label: "Ajukan tanda tangan ke kepala sekolah", ikon: "bi-send-check", onClick: () => aksi(s, "ajukan"), tampil: s.status === "DRAF" && !isKepsek },
              { label: terbitkan.label, ikon: terbitkan.ikon, onClick: () => aksi(s, terbitkan.jalur, terbitkan.konfirmasi), tampil: ["DRAF", "DIAJUKAN"].includes(s.status) },
              { label: "Tandatangani elektronik", ikon: "bi-pen", onClick: () => aksi(s, "tandatangani"), tampil: isKepsek && s.status === "TERBIT" && !s.ditandatangani_at },
              { label: "Batalkan surat", ikon: "bi-x-circle", bahaya: true, pemisah: true, onClick: () => batal(s), tampil: s.status === "TERBIT" },
              { label: "Hapus draf", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapus(s), tampil: ["DRAF", "DIAJUKAN"].includes(s.status) },
            ]} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorSurat({ surat, pilihan, onTutup, onSimpan }) {
  const [f, setF] = useState(() => ({
    id_templat: surat.id_templat || "", tanggal: surat.tanggal || pilihan.hari_ini, kode_klasifikasi: surat.kode_klasifikasi || "",
    perihal: surat.perihal || "", tujuan: surat.tujuan || "", sifat: surat.sifat || "Biasa", lampiran: surat.lampiran || "", isi: surat.isi || "",
  }));
  const [idSiswa, setIdSiswa] = useState("");
  const [kunci, setKunci] = useState(0); // remount editor saat isi diganti dari templat
  const [menyimpan, setMenyimpan] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sisipan = useMemo(() => sisipanIsian(pilihan), [pilihan]);

  const pakaiTemplat = async () => {
    if (!f.id_templat) return Swal.fire("Pilih templat", "Pilih templat surat dulu.", "info");
    if (f.isi && !(await yakin("Ganti isi surat?", "Isi yang sudah ditulis diganti dengan templat.", "Ganti"))) return;
    try {
      const r = await minta("GET", `/administrasi/surat/templat/${f.id_templat}/isi${idSiswa ? `?id_siswa=${encodeURIComponent(idSiswa)}` : ""}`);
      setF((x) => ({ ...x, isi: r.data.isi, perihal: x.perihal || r.data.perihal || "", kode_klasifikasi: x.kode_klasifikasi || r.data.kode_klasifikasi || "" }));
      setKunci((k) => k + 1);
    } catch (e) { gagal(e); }
  };

  const simpan = async () => {
    setMenyimpan(true);
    try {
      const isi = { ...f, id_templat: f.id_templat || null, kode_klasifikasi: f.kode_klasifikasi || null, lampiran: f.lampiran || null };
      const r = await minta(surat.id ? "PUT" : "POST", `/administrasi/surat/keluar${surat.id ? `/${surat.id}` : ""}`, isi);
      toast(r.message); onSimpan();
    } catch (e) { gagal(e); } finally { setMenyimpan(false); }
  };

  return (
    <div className="card" data-editor-surat>
      <div className="card-header d-flex align-items-center gap-2">
        <button type="button" className="btn btn-sm btn-light" onClick={onTutup} aria-label="Kembali"><i className="bi bi-arrow-left"></i></button>
        <span className="fw-semibold me-auto">{surat.id ? "Ubah draf surat" : "Surat baru"}</span>
      </div>
      <div className="card-body">
        <div className="row g-2 mb-2 p-2 bg-body-tertiary rounded">
          <div className="col-md-5"><label className="form-label small mb-0" htmlFor="sTemplat">Templat</label>
            <select id="sTemplat" className="form-select form-select-sm" value={f.id_templat} onChange={set("id_templat")}>
              <option value="">Tanpa templat</option>{pilihan.templat.filter((t) => t.aktif).map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select></div>
          <div className="col-md-4"><label className="form-label small mb-0" htmlFor="sSiswa">Siswa (untuk isian otomatis)</label>
            <select id="sSiswa" className="form-select form-select-sm" value={idSiswa} onChange={(e) => setIdSiswa(e.target.value)}>
              <option value="">Tidak perlu</option>{pilihan.siswa.map((s) => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa}{s.kelas ? ` · ${s.kelas.nama_kelas}` : ""}</option>)}
            </select></div>
          <div className="col-md-3 d-flex align-items-end"><button type="button" className="btn btn-sm btn-outline-primary w-100" onClick={pakaiTemplat}><i className="bi bi-magic me-1"></i>Isi dari templat</button></div>
        </div>
        <div className="row g-2 mb-2">
          <div className="col-6 col-md-3"><label className="form-label small mb-0" htmlFor="sTanggal">Tanggal</label><input id="sTanggal" type="date" className="form-control form-control-sm" value={f.tanggal} onChange={set("tanggal")} /></div>
          <div className="col-6 col-md-3"><label className="form-label small mb-0" htmlFor="sKode">Kode klasifikasi</label><input id="sKode" className="form-control form-control-sm" placeholder="mis. 421.2" value={f.kode_klasifikasi} onChange={set("kode_klasifikasi")} /></div>
          <div className="col-6 col-md-3"><label className="form-label small mb-0" htmlFor="sSifat">Sifat</label>
            <select id="sSifat" className="form-select form-select-sm" value={f.sifat} onChange={set("sifat")}>{pilihan.sifat.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="col-6 col-md-3"><label className="form-label small mb-0" htmlFor="sLampiran">Lampiran</label><input id="sLampiran" className="form-control form-control-sm" placeholder="mis. 1 berkas" value={f.lampiran} onChange={set("lampiran")} /></div>
          <div className="col-md-6"><label className="form-label small mb-0" htmlFor="sPerihal">Perihal</label><input id="sPerihal" className="form-control form-control-sm" value={f.perihal} onChange={set("perihal")} /></div>
          <div className="col-md-6"><label className="form-label small mb-0" htmlFor="sTujuan">Kepada Yth.</label><textarea id="sTujuan" rows={2} className="form-control form-control-sm" placeholder={"Bapak/Ibu …\ndi Tempat"} value={f.tujuan} onChange={set("tujuan")} /></div>
        </div>
        <label className="form-label small mb-0">Isi surat</label>
        <EditorKaya key={kunci} value={f.isi} onChange={(isi) => setF((x) => ({ ...x, isi }))} label="Isi surat" placeholder="Tulis isi surat, atau pilih templat lalu tekan Isi dari templat." sisipan={sisipan} />
        <div className="small text-muted mt-1">{"{{nomor}}"} dan {"{{tanggal}}"} terisi otomatis saat surat dicetak. Kop, tanggal, dan tanda tangan kepala sekolah ditambahkan otomatis.</div>
        <div className="d-flex gap-2 mt-3">
          <button type="button" className="btn btn-primary btn-sm" disabled={menyimpan} onClick={simpan}><i className="bi bi-save me-1"></i>Simpan draf</button>
          <button type="button" className="btn btn-light btn-sm" onClick={onTutup}>Batal</button>
        </div>
      </div>
    </div>
  );
}

// ===================== SURAT MASUK =====================
function SuratMasuk({ pilihan, bolehUbah, saringAwal }) {
  const [status, setStatus] = useState(saringAwal || "");
  const [cari, setCari] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("cari") || "")); // ?cari= dari pencarian global
  const [daftar, setDaftar] = useState(null);
  const terbaru = useTerbaru();
  const muat = useCallback(() => {
    const q = new URLSearchParams({ ...(status && { status }), ...(cari && { search: cari }) });
    terbaru(minta("GET", `/administrasi/surat/masuk?${q}`)).then((r) => setDaftar(r.data)).catch(gagal);
  }, [status, cari, terbaru]);
  useEffect(() => { const t = setTimeout(muat, 250); return () => clearTimeout(t); }, [muat]);

  const form = async (s) => {
    const r = await Swal.fire({
      title: s ? "Ubah surat masuk" : "Catat surat masuk", width: 600, showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="mTerima">Tanggal diterima</label><input id="mTerima" type="date" class="form-control form-control-sm" value="${s?.tanggal_terima || pilihan.hari_ini}"></div>
        <div class="col-6"><label class="form-label mb-0" for="mTglSurat">Tanggal surat</label><input id="mTglSurat" type="date" class="form-control form-control-sm" value="${s?.tanggal_surat || ""}"></div></div>
        <label class="form-label mb-0" for="mPengirim">Pengirim</label><input id="mPengirim" class="form-control form-control-sm mb-2" value="${esc(s?.pengirim || "")}">
        <div class="row g-2 mb-2"><div class="col-7"><label class="form-label mb-0" for="mNomor">Nomor surat</label><input id="mNomor" class="form-control form-control-sm" value="${esc(s?.nomor_surat || "")}"></div>
        <div class="col-5"><label class="form-label mb-0" for="mSifat">Sifat</label><select id="mSifat" class="form-select form-select-sm">${pilihan.sifat.map((x) => `<option ${s?.sifat === x ? "selected" : ""}>${x}</option>`).join("")}</select></div></div>
        <label class="form-label mb-0" for="mPerihal">Perihal</label><input id="mPerihal" class="form-control form-control-sm mb-2" value="${esc(s?.perihal || "")}">
        <label class="form-label mb-0" for="mRingkasan">Ringkasan isi</label><textarea id="mRingkasan" rows="2" class="form-control form-control-sm mb-2">${esc(s?.ringkasan || "")}</textarea>
        <label class="form-label mb-0" for="mBerkas">Pindaian / foto surat ${s?.berkas_nama ? `(sekarang: ${esc(s.berkas_nama)})` : ""}</label>
        <input id="mBerkas" type="file" accept=".pdf,image/*" class="form-control form-control-sm"></div>`,
      preConfirm: async () => {
        try {
          return await kirimForm(`/administrasi/surat/masuk${s ? `/${s.id}` : ""}`, {
            tanggal_terima: nilai("mTerima"), tanggal_surat: nilai("mTglSurat"), pengirim: nilai("mPengirim"), nomor_surat: nilai("mNomor"),
            sifat: nilai("mSifat"), perihal: nilai("mPerihal"), ringkasan: nilai("mRingkasan"), berkas: document.getElementById("mBerkas").files[0],
          });
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); }
  };

  const disposisi = async (s) => {
    const r = await Swal.fire({
      title: "Disposisi surat", showCancelButton: true, confirmButtonText: "Kirim disposisi", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><div class="mb-2"><b>${esc(s.perihal)}</b><br>dari ${esc(s.pengirim)}</div>
        <label class="form-label mb-0" for="dKepada">Diteruskan kepada</label>
        <select id="dKepada" class="form-select form-select-sm mb-2"><option value="">Pilih…</option>${pilihan.staf.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select>
        <label class="form-label mb-0" for="dInstruksi">Instruksi</label>
        <input id="dInstruksi" list="dDaftar" class="form-control form-control-sm mb-2" placeholder="Mis. hadiri dan laporkan">
        <datalist id="dDaftar">${["Untuk diketahui", "Hadiri dan laporkan", "Tindak lanjuti", "Siapkan jawaban", "Bagikan ke guru", "Arsipkan"].map((x) => `<option value="${x}">`).join("")}</datalist>
        <label class="form-label mb-0" for="dBatas">Batas waktu (opsional)</label><input id="dBatas" type="date" class="form-control form-control-sm"></div>`,
      preConfirm: async () => {
        try { return await minta("POST", `/administrasi/surat/masuk/${s.id}/disposisi`, { kepada_user: Number(nilai("dKepada")) || null, instruksi: nilai("dInstruksi"), batas_waktu: nilai("dBatas") || null }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); }
  };

  const selesai = async (s) => { try { const r = await minta("POST", `/administrasi/surat/masuk/${s.id}/selesai`); toast(r.message); muat(); } catch (e) { gagal(e); } };
  const hapus = async (s) => {
    if (!(await yakin("Hapus surat masuk?", s.perihal))) return;
    try { const r = await minta("DELETE", `/administrasi/surat/masuk/${s.id}`); toast(r.message); muat(); } catch (e) { gagal(e); }
  };

  return (
    <div className="card">
      <div className="card-body d-flex flex-wrap gap-2 align-items-center">
        <select className="form-select form-select-sm w-auto" aria-label="Saring status surat masuk" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>{Object.entries(NAMA_MASUK).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <input className="form-control form-control-sm" style={{ maxWidth: 260 }} placeholder="Cari perihal, pengirim, nomor…" aria-label="Cari surat masuk" value={cari} onChange={(e) => setCari(e.target.value)} />
        {bolehUbah && <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => form(null)}><i className="bi bi-plus-lg me-1"></i>Catat surat masuk</button>}
      </div>
      <div className="list-group list-group-flush">
        {!daftar && <div className="list-group-item text-muted">Memuat…</div>}
        {daftar?.length === 0 && <div className="list-group-item text-muted">Belum ada surat masuk.</div>}
        {daftar?.map((s) => (
          <div key={s.id} className="list-group-item" data-surat-masuk={s.perihal}>
            <div className="d-flex align-items-center gap-2">
              <div className="me-auto">
                <div className="fw-semibold">{s.perihal} <span className={`badge text-bg-${WARNA_MASUK[s.status]} ms-1`} data-status-masuk>{NAMA_MASUK[s.status]}</span>{s.sifat !== "Biasa" && <span className="badge text-bg-danger ms-1">{s.sifat}</span>}</div>
                <div className="small text-muted">Agenda {s.nomor_agenda}/{s.tahun} · diterima {tgl(s.tanggal_terima)} · dari {s.pengirim}{s.nomor_surat ? ` · No. ${s.nomor_surat}` : ""}</div>
                {s.ringkasan && <div className="small">{s.ringkasan}</div>}
              </div>
              {s.berkas_nama && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => lihatBerkas(`/administrasi/surat/masuk/${s.id}/berkas`)} title="Lihat pindaian"><i className="bi bi-paperclip"></i></button>}
              {bolehUbah && <button type="button" className="btn btn-sm btn-outline-primary text-nowrap" onClick={() => disposisi(s)}><i className="bi bi-signpost-split me-1"></i>Disposisi</button>}
              {bolehUbah && <MenuAksi label={`Aksi untuk ${s.perihal}`} items={[
                { label: "Ubah", ikon: "bi-pencil-square", onClick: () => form(s) },
                { label: "Tandai selesai", ikon: "bi-check2-circle", onClick: () => selesai(s), tampil: s.status !== "SELESAI" },
                { label: "Hapus", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapus(s) },
              ]} />}
            </div>
            {s.disposisi.length > 0 && (
              <ul className="list-unstyled small mt-1 mb-0 ps-3 border-start">
                {s.disposisi.map((d) => (
                  <li key={d.id}><i className="bi bi-arrow-return-right me-1"></i><b>{d.kepada?.name}</b>: {d.instruksi}{d.batas_waktu && ` (sampai ${tgl(d.batas_waktu)})`}
                    {" "}<span className={`badge text-bg-${d.status === "SELESAI" ? "success" : d.status === "DIBACA" ? "info" : "secondary"}`}>{NAMA_DISPOSISI[d.status]}</span>
                    {d.tindak_lanjut && <div className="text-success ms-3">Tindak lanjut: {d.tindak_lanjut}</div>}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== ARSIP & DOKUMEN LEGAL =====================
function Arsip({ pilihan, bolehUbah, jenis }) {
  const legal = jenis === "LEGAL";
  const [saring, setSaring] = useState({ kategori: "", label: "", search: "" });
  const [hasil, setHasil] = useState(null);
  const terbaru = useTerbaru();
  const muat = useCallback(() => {
    const q = new URLSearchParams({ jenis, ...Object.fromEntries(Object.entries(saring).filter(([, v]) => v)) });
    terbaru(minta("GET", `/administrasi/surat/arsip?${q}`)).then(setHasil).catch(gagal);
  }, [jenis, saring, terbaru]);
  useEffect(() => { const t = setTimeout(muat, 250); return () => clearTimeout(t); }, [muat]);
  const kategori = legal ? pilihan.kategori_legal : pilihan.kategori_arsip;

  const form = async (a) => {
    const r = await Swal.fire({
      title: a ? "Ubah dokumen" : legal ? "Dokumen legal baru" : "Arsip baru", width: 600, showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <label class="form-label mb-0" for="aJudul">Judul</label><input id="aJudul" class="form-control form-control-sm mb-2" value="${esc(a?.judul || "")}">
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="aKategori">Kategori</label>
          <input id="aKategori" list="aDaftar" class="form-control form-control-sm" value="${esc(a?.kategori || kategori[0])}"><datalist id="aDaftar">${kategori.map((k) => `<option value="${esc(k)}">`).join("")}</datalist></div>
        <div class="col-6"><label class="form-label mb-0" for="aNomor">Nomor dokumen</label><input id="aNomor" class="form-control form-control-sm" value="${esc(a?.nomor_dokumen || "")}"></div></div>
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="aTanggal">Tanggal dokumen</label><input id="aTanggal" type="date" class="form-control form-control-sm" value="${a?.tanggal_dokumen || ""}"></div>
        <div class="col-6"><label class="form-label mb-0" for="aBerlaku">Berlaku sampai ${legal ? "" : "(opsional)"}</label><input id="aBerlaku" type="date" class="form-control form-control-sm" value="${a?.berlaku_sampai || ""}"></div></div>
        <label class="form-label mb-0" for="aLabel">Label (pisahkan dengan koma)</label><input id="aLabel" class="form-control form-control-sm mb-2" placeholder="rapat, guru, 2027" value="${esc((a?.label || []).join(", "))}">
        <label class="form-label mb-0" for="aKet">Keterangan</label><textarea id="aKet" rows="2" class="form-control form-control-sm mb-2">${esc(a?.keterangan || "")}</textarea>
        <label class="form-label mb-0" for="aBerkas">Berkas (PDF, foto, Word, Excel; maks. 10 MB) ${a?.berkas_nama ? `— sekarang: ${esc(a.berkas_nama)}` : ""}</label>
        <input id="aBerkas" type="file" class="form-control form-control-sm"></div>`,
      preConfirm: async () => {
        try {
          return await kirimForm(`/administrasi/surat/arsip${a ? `/${a.id}` : ""}`, {
            jenis, judul: nilai("aJudul"), kategori: nilai("aKategori"), nomor_dokumen: nilai("aNomor"), tanggal_dokumen: nilai("aTanggal"),
            berlaku_sampai: nilai("aBerlaku"), keterangan: nilai("aKet"), label: nilai("aLabel").split(",").map((x) => x.trim()).filter(Boolean),
            berkas: document.getElementById("aBerkas").files[0],
          });
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); }
  };
  const hapus = async (a) => {
    if (!(await yakin("Hapus dokumen ini?", a.judul))) return;
    try { const r = await minta("DELETE", `/administrasi/surat/arsip/${a.id}`); toast(r.message); muat(); } catch (e) { gagal(e); }
  };

  const masa = (a) => {
    if (!a.berlaku_sampai || !hasil) return null;
    const sisa = Math.round((new Date(`${a.berlaku_sampai}T00:00:00`) - new Date(`${hasil.hari_ini}T00:00:00`)) / 86400000);
    if (sisa < 0) return <span className="badge text-bg-danger" data-masa-berlaku>Habis {tgl(a.berlaku_sampai)}</span>;
    if (sisa <= 90) return <span className="badge text-bg-warning" data-masa-berlaku>Habis dalam {sisa} hari</span>;
    return <span className="badge text-bg-success" data-masa-berlaku>Berlaku s.d. {tgl(a.berlaku_sampai)}</span>;
  };
  const set = (k) => (e) => setSaring((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="card">
      <div className="card-body d-flex flex-wrap gap-2 align-items-center">
        <select className="form-select form-select-sm w-auto" aria-label="Saring kategori" value={saring.kategori} onChange={set("kategori")}>
          <option value="">Semua kategori</option>{kategori.map((k) => <option key={k}>{k}</option>)}
        </select>
        <input className="form-control form-control-sm" style={{ maxWidth: 240 }} placeholder="Cari judul, nomor…" aria-label="Cari arsip" value={saring.search} onChange={set("search")} />
        {bolehUbah && <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => form(null)}><i className="bi bi-plus-lg me-1"></i>{legal ? "Dokumen legal baru" : "Arsip baru"}</button>}
      </div>
      {!legal && hasil?.label.length > 0 && (
        <div className="px-3 pb-2 d-flex flex-wrap gap-1">
          {hasil.label.map((l) => (
            <button key={l} type="button" className={`btn btn-sm rounded-pill py-0 ${saring.label === l ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setSaring((s) => ({ ...s, label: s.label === l ? "" : l }))}>#{l}</button>
          ))}
        </div>
      )}
      <div className="list-group list-group-flush">
        {!hasil && <div className="list-group-item text-muted">Memuat…</div>}
        {hasil?.data.length === 0 && <div className="list-group-item text-muted">{legal ? "Belum ada dokumen legal. Catat izin operasional, akreditasi, akta yayasan, dan lainnya agar masa berlakunya diingatkan." : "Belum ada arsip."}</div>}
        {hasil?.data.map((a) => (
          <div key={a.id} className="list-group-item d-flex align-items-center gap-2" data-arsip={a.judul}>
            <div className="me-auto">
              <div className="fw-semibold">{a.judul} {masa(a)}</div>
              <div className="small text-muted">{a.kategori}{a.nomor_dokumen ? ` · No. ${a.nomor_dokumen}` : ""}{a.tanggal_dokumen ? ` · ${tgl(a.tanggal_dokumen)}` : ""}</div>
              {a.label?.length > 0 && <div className="small">{a.label.map((l) => <span key={l} className="badge text-bg-light border me-1">#{l}</span>)}</div>}
              {a.keterangan && <div className="small text-muted">{a.keterangan}</div>}
            </div>
            {a.berkas_nama && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => lihatBerkas(`/administrasi/surat/arsip/${a.id}/berkas`)} title={`Buka ${a.berkas_nama}`}><i className="bi bi-paperclip"></i></button>}
            {bolehUbah && <MenuAksi label={`Aksi untuk ${a.judul}`} items={[
              { label: "Ubah", ikon: "bi-pencil-square", onClick: () => form(a) },
              { label: "Hapus", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapus(a) },
            ]} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== TEMPLAT & NOMOR =====================
function Templat({ pilihan, bolehUbah, muatPilihan }) {
  const [edit, setEdit] = useState(null);
  const [atur, setAtur] = useState(pilihan.pengaturan);
  const sisipan = useMemo(() => sisipanIsian(pilihan), [pilihan]);

  const simpanAtur = async () => {
    try { const r = await minta("PUT", "/administrasi/surat/pengaturan", { ...atur, digit: Number(atur.digit) }); toast(r.message); muatPilihan(); } catch (e) { gagal(e); }
  };
  const contoh = async () => { try { const r = await minta("POST", "/administrasi/surat/templat/contoh"); toast(r.message); muatPilihan(); } catch (e) { gagal(e); } };
  const simpan = async () => {
    try {
      const r = await minta(edit.id ? "PUT" : "POST", `/administrasi/surat/templat${edit.id ? `/${edit.id}` : ""}`, {
        nama: edit.nama, kode_klasifikasi: edit.kode_klasifikasi || null, perihal: edit.perihal || null, isi: edit.isi, aktif: edit.aktif !== false,
      });
      toast(r.message); setEdit(null); muatPilihan();
    } catch (e) { gagal(e); }
  };
  const hapus = async (t) => {
    if (!(await yakin(`Hapus templat ${t.nama}?`))) return;
    try { const r = await minta("DELETE", `/administrasi/surat/templat/${t.id}`); toast(r.message); muatPilihan(); } catch (e) { gagal(e); }
  };

  if (edit) {
    const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));
    return (
      <div className="card" data-editor-templat>
        <div className="card-header d-flex align-items-center gap-2">
          <button type="button" className="btn btn-sm btn-light" onClick={() => setEdit(null)} aria-label="Kembali"><i className="bi bi-arrow-left"></i></button>
          <span className="fw-semibold">{edit.id ? "Ubah templat" : "Templat baru"}</span>
        </div>
        <div className="card-body">
          <div className="row g-2 mb-2">
            <div className="col-md-5"><label className="form-label small mb-0" htmlFor="tNama">Nama templat</label><input id="tNama" className="form-control form-control-sm" value={edit.nama || ""} onChange={set("nama")} /></div>
            <div className="col-md-4"><label className="form-label small mb-0" htmlFor="tPerihal">Perihal bawaan</label><input id="tPerihal" className="form-control form-control-sm" value={edit.perihal || ""} onChange={set("perihal")} /></div>
            <div className="col-md-3"><label className="form-label small mb-0" htmlFor="tKode">Kode klasifikasi</label><input id="tKode" className="form-control form-control-sm" value={edit.kode_klasifikasi || ""} onChange={set("kode_klasifikasi")} /></div>
          </div>
          <EditorKaya value={edit.isi || ""} onChange={(isi) => setEdit((x) => ({ ...x, isi }))} label="Isi templat" placeholder="Tulis isi templat; sisipkan isian seperti {{nama_siswa}} lewat tombol Sisipkan data." sisipan={sisipan} />
          <div className="d-flex gap-2 mt-3">
            <button type="button" className="btn btn-primary btn-sm" onClick={simpan}><i className="bi bi-save me-1"></i>Simpan templat</button>
            <button type="button" className="btn btn-light btn-sm" onClick={() => setEdit(null)}>Batal</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="row g-3">
      <div className="col-lg-7">
        <div className="card">
          <div className="card-header d-flex align-items-center gap-2"><span className="fw-semibold me-auto">Templat surat</span>
            {bolehUbah && <button type="button" className="btn btn-outline-secondary btn-sm" onClick={contoh}>Tambah contoh templat</button>}
            {bolehUbah && <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ aktif: true })}><i className="bi bi-plus-lg me-1"></i>Templat baru</button>}</div>
          <ul className="list-group list-group-flush">
            {pilihan.templat.length === 0 && <li className="list-group-item text-muted">Belum ada templat. Tekan Tambah contoh templat untuk memulai.</li>}
            {pilihan.templat.map((t) => (
              <li key={t.id} className="list-group-item d-flex align-items-center gap-2" data-templat={t.nama}>
                <span className="me-auto"><b>{t.nama}</b>{t.kode_klasifikasi && <span className="text-muted small"> · {t.kode_klasifikasi}</span>}{t.perihal && <div className="small text-muted">{t.perihal}</div>}</span>
                {bolehUbah && <MenuAksi label={`Aksi untuk ${t.nama}`} items={[
                  { label: "Ubah", ikon: "bi-pencil-square", onClick: () => setEdit(t) },
                  { label: "Hapus", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapus(t) },
                ]} />}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="col-lg-5">
        <div className="card"><div className="card-body">
          <div className="fw-semibold mb-2">Format nomor surat</div>
          <label className="form-label small mb-0" htmlFor="nFormat">Format</label>
          <input id="nFormat" className="form-control form-control-sm mb-1" value={atur.format} disabled={!bolehUbah} onChange={(e) => setAtur({ ...atur, format: e.target.value })} />
          <div className="small text-muted mb-2">Bagian: {"{urut}"} {"{kode}"} {"{singkatan}"} {"{bulan_romawi}"} {"{bulan}"} {"{tahun}"}. Nomor urut mulai lagi dari 1 setiap tahun.</div>
          <div className="row g-2 mb-2">
            <div className="col-7"><label className="form-label small mb-0" htmlFor="nSingkatan">Singkatan sekolah</label><input id="nSingkatan" className="form-control form-control-sm" value={atur.singkatan} disabled={!bolehUbah} onChange={(e) => setAtur({ ...atur, singkatan: e.target.value })} /></div>
            <div className="col-5"><label className="form-label small mb-0" htmlFor="nDigit">Digit urut</label><input id="nDigit" type="number" min="1" max="6" className="form-control form-control-sm" value={atur.digit} disabled={!bolehUbah} onChange={(e) => setAtur({ ...atur, digit: e.target.value })} /></div>
          </div>
          <div className="small mb-2">Contoh sekarang: <b data-contoh-nomor>{pilihan.contoh_nomor}</b></div>
          {bolehUbah && <button type="button" className="btn btn-primary btn-sm" onClick={simpanAtur}>Simpan format</button>}
        </div></div>
      </div>
    </div>
  );
}
