"use client";
// Formulir SPMB publik + cek status. Akses pendaftar = nomor pendaftaran + kode akses (ditampilkan sekali saat mendaftar).
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/app/lib/config";
import { kecilkanFoto } from "@/app/lib/foto";

const INGAT = "spmb-akses";
const tgl = (t) => (t ? new Date(`${String(t).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "");
const WARNA = {
  DIAJUKAN: "secondary", PERLU_PERBAIKAN: "warning", TERVERIFIKASI: "info", DITERIMA: "success",
  CADANGAN: "warning", TIDAK_DITERIMA: "danger", DAFTAR_ULANG: "success", SELESAI: "success",
};
const KOSONG = {
  nama_siswa: "", panggilan: "", nisn: "", jenis_kelamin: "", tempat_lahir: "", tgl_lahir: "", id_agama: "", id_suku: "",
  sekolah_asal: "", alamat: "", nama_ayah: "", id_pekerjaan_ayah: "", nama_ibu: "", id_pekerjaan_ibu: "", nama_wali: "", id_pekerjaan_wali: "", no_wa: "",
};

class GalatApi extends Error {
  constructor(pesan, galat = {}) { super(pesan); this.galat = galat; }
}

async function kirim(method, path, body) {
  const form = body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Accept: "application/json", ...(form || body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) throw new GalatApi("Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
  if (!res.ok) {
    const galat = Object.fromEntries(Object.entries(data.errors || {}).map(([k, v]) => [k, v[0]]));
    throw new GalatApi(Object.values(galat)[0] || data.message || `Gagal (status ${res.status}).`, galat);
  }
  return data;
}

const ingat = (akses) => { try { akses ? localStorage.setItem(INGAT, JSON.stringify(akses)) : localStorage.removeItem(INGAT); } catch {} };
const bacaIngatan = () => { try { return JSON.parse(localStorage.getItem(INGAT) || "null"); } catch { return null; } };

export default function SpmbPublik() {
  const [info, setInfo] = useState(null);
  const [galatInfo, setGalatInfo] = useState("");
  const [mode, setMode] = useState("daftar");
  const [akses, setAkses] = useState(null);
  const [baru, setBaru] = useState(null);

  useEffect(() => {
    kirim("GET", "/spmb/info").then((r) => setInfo(r.data)).catch((e) => setGalatInfo(e.message));
    const tersimpan = bacaIngatan();
    if (tersimpan) setAkses(tersimpan);
    if (new URLSearchParams(window.location.search).has("cek") || tersimpan) setMode("cek");
  }, []);

  if (galatInfo) return <div className="alert alert-danger mt-4">{galatInfo}</div>;
  if (!info) return <div className="text-muted mt-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>;

  return (
    <div className="mt-4">
      <ul className="nav nav-pills gap-2 mb-3" role="tablist">
        <li className="nav-item"><button type="button" role="tab" aria-selected={mode === "daftar"} className={`nav-link ${mode === "daftar" ? "active" : ""}`} onClick={() => setMode("daftar")}>Daftar baru</button></li>
        <li className="nav-item"><button type="button" role="tab" aria-selected={mode === "cek"} className={`nav-link ${mode === "cek" ? "active" : ""}`} onClick={() => setMode("cek")}>Cek status &amp; berkas</button></li>
      </ul>
      {mode === "daftar"
        ? <Daftar info={info} baru={baru} onTerdaftar={(d) => { setBaru(d); const a = { nomor_daftar: d.nomor_daftar, kode_akses: d.kode_akses }; setAkses(a); ingat(a); }}
            onLanjut={() => { setBaru(null); setMode("cek"); }} />
        : <Cek info={info} akses={akses} setAkses={(a) => { setAkses(a); ingat(a); }} />}
    </div>
  );
}

/* ================= Daftar ================= */

function Daftar({ info, baru, onTerdaftar, onLanjut }) {
  const buka = info.gelombang.filter((g) => g.buka);
  const [idGelombang, setIdGelombang] = useState(buka[0]?.id || "");
  const [galat, setGalat] = useState({});
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  if (baru) {
    return (
      <div className="card"><div className="card-body p-4" data-spmb-terdaftar>
        <h2 className="h4 mb-2"><i className="bi bi-check-circle-fill text-success me-2"></i>Pendaftaran terkirim</h2>
        <p>Simpan <b>nomor pendaftaran</b> dan <b>kode akses</b> di bawah ini (tulis atau foto layar). Keduanya dipakai untuk mengunggah berkas dan melihat hasil seleksi. Kode akses tidak bisa dilihat lagi.</p>
        <div className="spmb-kode mb-3">
          <div><span className="small text-muted">Nomor pendaftaran</span><b data-nomor>{baru.nomor_daftar}</b></div>
          <div><span className="small text-muted">Kode akses</span><b data-kode>{baru.kode_akses}</b></div>
        </div>
        <button type="button" className="btn btn-primary" onClick={onLanjut}>Lanjut unggah berkas <i className="bi bi-arrow-right"></i></button>
      </div></div>
    );
  }

  if (!buka.length) {
    const nanti = info.gelombang[0];
    return (
      <div className="card"><div className="card-body p-4 text-center">
        <i className="bi bi-calendar-event fs-1 text-muted d-block mb-2"></i>
        <h2 className="h5">Pendaftaran belum dibuka</h2>
        <p className="text-muted mb-0">{nanti ? <>{nanti.nama} ({nanti.tahun_ajaran}) dibuka {tgl(nanti.tgl_buka)} sampai {tgl(nanti.tgl_tutup)}.</> : "Saat ini tidak ada gelombang pendaftaran. Pantau pengumuman sekolah."}</p>
      </div></div>
    );
  }

  const g = buka.find((x) => x.id === Number(idGelombang)) || buka[0];
  const namaBerkas = Object.fromEntries(info.jenis_berkas.map((b) => [b.kode, b.nama]));

  const kirimFormulir = async (data) => {
    setSibuk(true); setGalat({}); setPesan("");
    try {
      const r = await kirim("POST", "/spmb/daftar", { ...data, id_gelombang: g.id });
      onTerdaftar(r.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setGalat(e.galat || {}); setPesan(e.message); }
    finally { setSibuk(false); }
  };

  return (
    <div className="card"><div className="card-body p-3 p-md-4">
      {buka.length > 1 && (
        <div className="mb-3">
          <label className="form-label" htmlFor="spmbGelombang">Gelombang</label>
          <select id="spmbGelombang" className="form-select" value={g.id} onChange={(e) => setIdGelombang(e.target.value)}>
            {buka.map((x) => <option key={x.id} value={x.id}>{x.nama} · {x.tahun_ajaran}</option>)}
          </select>
        </div>
      )}
      <div className="alert alert-light border small mb-4">
        <div className="fw-semibold mb-1">{g.nama} · Tahun ajaran {g.tahun_ajaran}</div>
        <div>Dibuka {tgl(g.tgl_buka)} sampai {tgl(g.tgl_tutup)}{g.tgl_pengumuman && <> · pengumuman {tgl(g.tgl_pengumuman)}</>}{g.kuota && <> · kuota {g.kuota} murid</>}.</div>
        {g.berkas_wajib.length > 0 && <div>Siapkan foto/scan: <b>{g.berkas_wajib.map((k) => namaBerkas[k] || k).join(", ")}</b> (diunggah setelah formulir terkirim).</div>}
        {g.info && <div className="mt-1" style={{ whiteSpace: "pre-line" }}>{g.info}</div>}
      </div>
      <FormIsian info={info} awal={KOSONG} galat={galat} pesan={pesan} sibuk={sibuk} tombol="Kirim pendaftaran" onKirim={kirimFormulir} />
    </div></div>
  );
}

/* ================= Isian data (daftar & perbaikan) ================= */

function FormIsian({ info, awal, galat, pesan, sibuk, tombol, onKirim, onBatal }) {
  const [d, setD] = useState(() => Object.fromEntries(Object.keys(KOSONG).map((k) => [k, awal[k] ?? ""])));
  const ubah = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const kelas = (k) => `form-control${galat[k] ? " is-invalid" : ""}`;
  const kelasPilih = (k) => `form-select${galat[k] ? " is-invalid" : ""}`;
  const Galat = ({ k }) => (galat[k] ? <div className="invalid-feedback">{galat[k]}</div> : null);
  const pekerjaan = (k) => (
    <select id={k} className={kelasPilih(k)} value={d[k]} onChange={ubah(k)}>
      <option value="">— Pilih —</option>
      {info.pekerjaan.map((p) => <option key={p.id_pekerjaan} value={p.id_pekerjaan}>{p.nama_pekerjaan}</option>)}
    </select>
  );

  const kirimkan = (e) => {
    e.preventDefault();
    // Kosong dikirim sebagai null agar kolom opsional benar-benar dikosongkan
    onKirim(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v])));
  };

  return (
    <form onSubmit={kirimkan} noValidate>
      <h3 className="spmb-bagian">Data calon murid</h3>
      <div className="row g-3">
        <div className="col-md-8"><label className="form-label" htmlFor="nama_siswa">Nama lengkap (sesuai akta) *</label>
          <input id="nama_siswa" className={kelas("nama_siswa")} value={d.nama_siswa} onChange={ubah("nama_siswa")} maxLength={255} autoComplete="off" /><Galat k="nama_siswa" /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="panggilan">Nama panggilan</label>
          <input id="panggilan" className={kelas("panggilan")} value={d.panggilan} onChange={ubah("panggilan")} maxLength={100} /><Galat k="panggilan" /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="jenis_kelamin">Jenis kelamin *</label>
          <select id="jenis_kelamin" className={kelasPilih("jenis_kelamin")} value={d.jenis_kelamin} onChange={ubah("jenis_kelamin")}>
            <option value="">— Pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
          </select><Galat k="jenis_kelamin" /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="tempat_lahir">Tempat lahir *</label>
          <input id="tempat_lahir" className={kelas("tempat_lahir")} value={d.tempat_lahir} onChange={ubah("tempat_lahir")} maxLength={100} /><Galat k="tempat_lahir" /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="tgl_lahir">Tanggal lahir *</label>
          <input id="tgl_lahir" type="date" className={kelas("tgl_lahir")} value={d.tgl_lahir} onChange={ubah("tgl_lahir")} /><Galat k="tgl_lahir" /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="nisn">NISN</label>
          <input id="nisn" inputMode="numeric" className={kelas("nisn")} value={d.nisn} onChange={ubah("nisn")} maxLength={10} placeholder="10 angka, bila ada" /><Galat k="nisn" /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="id_agama">Agama</label>
          <select id="id_agama" className={kelasPilih("id_agama")} value={d.id_agama} onChange={ubah("id_agama")}>
            <option value="">— Pilih —</option>{info.agama.map((a) => <option key={a.id_agama} value={a.id_agama}>{a.nama_agama}</option>)}
          </select><Galat k="id_agama" /></div>
        <div className="col-md-4"><label className="form-label" htmlFor="id_suku">Suku</label>
          <select id="id_suku" className={kelasPilih("id_suku")} value={d.id_suku} onChange={ubah("id_suku")}>
            <option value="">— Pilih —</option>{info.suku.map((s) => <option key={s.id_suku} value={s.id_suku}>{s.nama_suku}</option>)}
          </select><Galat k="id_suku" /></div>
        <div className="col-12"><label className="form-label" htmlFor="sekolah_asal">Sekolah asal (TK/PAUD/SD)</label>
          <input id="sekolah_asal" className={kelas("sekolah_asal")} value={d.sekolah_asal} onChange={ubah("sekolah_asal")} maxLength={255} placeholder="Kosongkan bila belum pernah sekolah" /><Galat k="sekolah_asal" /></div>
        <div className="col-12"><label className="form-label" htmlFor="alamat">Alamat tempat tinggal *</label>
          <textarea id="alamat" rows={2} className={kelas("alamat")} value={d.alamat} onChange={ubah("alamat")} maxLength={1000} placeholder="Jalan, RT/RW, kampung/kelurahan, distrik" /><Galat k="alamat" /></div>
      </div>

      <h3 className="spmb-bagian">Orang tua / wali</h3>
      <p className="small text-muted mt-n2">Isi minimal satu nama: ayah, ibu, atau wali.</p>
      <div className="row g-3">
        <div className="col-md-7"><label className="form-label" htmlFor="nama_ayah">Nama ayah</label>
          <input id="nama_ayah" className={kelas("nama_ayah")} value={d.nama_ayah} onChange={ubah("nama_ayah")} maxLength={255} /><Galat k="nama_ayah" /></div>
        <div className="col-md-5"><label className="form-label" htmlFor="id_pekerjaan_ayah">Pekerjaan ayah</label>{pekerjaan("id_pekerjaan_ayah")}</div>
        <div className="col-md-7"><label className="form-label" htmlFor="nama_ibu">Nama ibu</label>
          <input id="nama_ibu" className={kelas("nama_ibu")} value={d.nama_ibu} onChange={ubah("nama_ibu")} maxLength={255} /><Galat k="nama_ibu" /></div>
        <div className="col-md-5"><label className="form-label" htmlFor="id_pekerjaan_ibu">Pekerjaan ibu</label>{pekerjaan("id_pekerjaan_ibu")}</div>
        <div className="col-md-7"><label className="form-label" htmlFor="nama_wali">Nama wali (bila tinggal bersama wali)</label>
          <input id="nama_wali" className={kelas("nama_wali")} value={d.nama_wali} onChange={ubah("nama_wali")} maxLength={255} /><Galat k="nama_wali" /></div>
        <div className="col-md-5"><label className="form-label" htmlFor="id_pekerjaan_wali">Pekerjaan wali</label>{pekerjaan("id_pekerjaan_wali")}</div>
        <div className="col-md-6"><label className="form-label" htmlFor="no_wa">Nomor WhatsApp yang aktif *</label>
          <input id="no_wa" type="tel" inputMode="tel" className={kelas("no_wa")} value={d.no_wa} onChange={ubah("no_wa")} maxLength={16} placeholder="08…" /><Galat k="no_wa" /></div>
      </div>

      {pesan && <div className="alert alert-danger small mt-3 mb-0" role="alert">{pesan}</div>}
      <div className="d-flex flex-wrap gap-2 mt-4">
        <button type="submit" className="btn btn-primary px-4" disabled={sibuk}>{sibuk && <span className="spinner-border spinner-border-sm me-2"></span>}{tombol}</button>
        {onBatal && <button type="button" className="btn btn-outline-secondary" onClick={onBatal}>Batal</button>}
      </div>
    </form>
  );
}

/* ================= Cek status ================= */

function Cek({ info, akses, setAkses }) {
  const [isian, setIsian] = useState({ nomor_daftar: akses?.nomor_daftar || "", kode_akses: akses?.kode_akses || "" });
  const [st, setSt] = useState(null);
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async (a) => {
    setSibuk(true); setPesan("");
    try {
      const r = await kirim("POST", "/spmb/status", a);
      setSt(r.data);
      setAkses({ nomor_daftar: r.data.nomor_daftar, kode_akses: a.kode_akses.trim().toUpperCase() });
    } catch (e) { setPesan(e.message); setSt(null); }
    finally { setSibuk(false); }
  }, [setAkses]);

  // Sekali saat dibuka: bila nomor & kode tersimpan di perangkat ini, langsung tampilkan statusnya
  useEffect(() => { if (akses?.nomor_daftar && akses?.kode_akses) muat(akses); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (st) {
    return <Status info={info} st={st} akses={akses} onBaru={setSt}
      onKeluar={() => { setSt(null); setAkses(null); setIsian({ nomor_daftar: "", kode_akses: "" }); }} />;
  }

  return (
    <div className="card"><div className="card-body p-3 p-md-4">
      <form className="row g-3 align-items-end" onSubmit={(e) => { e.preventDefault(); muat(isian); }}>
        <div className="col-sm-6"><label className="form-label" htmlFor="cekNomor">Nomor pendaftaran</label>
          <input id="cekNomor" className="form-control text-uppercase" value={isian.nomor_daftar} onChange={(e) => setIsian((x) => ({ ...x, nomor_daftar: e.target.value }))} placeholder="SPMB-2027-0001" autoComplete="off" /></div>
        <div className="col-sm-3"><label className="form-label" htmlFor="cekKode">Kode akses</label>
          <input id="cekKode" className="form-control text-uppercase" value={isian.kode_akses} onChange={(e) => setIsian((x) => ({ ...x, kode_akses: e.target.value }))} maxLength={20} autoComplete="off" /></div>
        <div className="col-sm-3"><button type="submit" className="btn btn-primary w-100" disabled={sibuk || !isian.nomor_daftar || !isian.kode_akses}>
          {sibuk && <span className="spinner-border spinner-border-sm me-2"></span>}Lihat status</button></div>
      </form>
      {pesan && <div className="alert alert-danger small mt-3 mb-0" role="alert">{pesan}</div>}
      <p className="small text-muted mt-3 mb-0">Lupa kode akses? Datang ke sekolah membawa nomor pendaftaran; operator dapat membantu.</p>
    </div></div>
  );
}

const LANGKAH = ["Kirim formulir", "Verifikasi berkas", "Pengumuman", "Daftar ulang"];
// Jumlah tahap yang sudah selesai; tahap berikutnya ditandai "kini" kecuali alurnya berhenti (cadangan/tidak diterima)
const SELESAI_N = { DIAJUKAN: 1, PERLU_PERBAIKAN: 1, TERVERIFIKASI: 2, DITERIMA: 3, CADANGAN: 3, TIDAK_DITERIMA: 3, DAFTAR_ULANG: 4, SELESAI: 4 };

function Status({ info, st, akses, onBaru, onKeluar }) {
  const [ubahData, setUbahData] = useState(false);
  const [galat, setGalat] = useState({});
  const [pesan, setPesan] = useState("");
  const [sukses, setSukses] = useState("");
  const [sibuk, setSibuk] = useState("");
  const selesaiN = SELESAI_N[st.status] ?? 1;
  const berhenti = ["CADANGAN", "TIDAK_DITERIMA"].includes(st.status);

  const jalankan = async (kunci, fn) => {
    setSibuk(kunci); setPesan(""); setSukses(""); setGalat({});
    try { const r = await fn(); onBaru(r.data); setSukses(r.message); return true; }
    catch (e) { setPesan(e.message); setGalat(e.galat || {}); return false; }
    finally { setSibuk(""); }
  };

  const unggah = (jenis) => async (e) => {
    const asli = e.target.files?.[0];
    e.target.value = "";
    if (!asli) return;
    const file = await kecilkanFoto(asli);
    if (file.size > 5 * 1024 * 1024) { setPesan("Ukuran berkas maksimal 5 MB."); return; }
    const fd = new FormData();
    fd.append("nomor_daftar", akses.nomor_daftar); fd.append("kode_akses", akses.kode_akses);
    fd.append("jenis", jenis); fd.append("berkas", file);
    jalankan(`berkas-${jenis}`, () => kirim("POST", "/spmb/berkas", fd));
  };

  const kurang = st.berkas.filter((b) => b.wajib && !b.ada);

  return (
    <div className="card"><div className="card-body p-3 p-md-4" data-spmb-status={st.status}>
      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <div className="me-auto">
          <div className="small text-muted">{st.nomor_daftar} · {st.gelombang.nama} {st.gelombang.tahun_ajaran}</div>
          <h2 className="h4 mb-1">{st.data.nama_siswa}</h2>
          <span className={`badge text-bg-${WARNA[st.status] || "secondary"} fs-6 fw-semibold`} data-status-label>{st.status_label}</span>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onKeluar}>Keluar</button>
      </div>

      <ol className="spmb-langkah" aria-label="Tahap pendaftaran">
        {LANGKAH.map((l, i) => <li key={l} className={i < selesaiN ? "selesai" : i === selesaiN && !berhenti ? "kini" : ""}>{l}</li>)}
      </ol>

      {st.status === "DIAJUKAN" && <div className="alert alert-light border small">Pendaftaran sedang menunggu diperiksa operator sekolah.{kurang.length > 0 && <> Unggah dulu berkas wajib yang belum ada di bawah ini.</>}</div>}
      {st.status === "PERLU_PERBAIKAN" && (
        <div className="alert alert-warning small">
          <b>Operator meminta perbaikan:</b> <span style={{ whiteSpace: "pre-line" }}>{st.catatan_verifikasi}</span>
          <div className="mt-1">Perbaiki data atau unggah ulang berkas yang ditandai, lalu tekan <b>Kirim perbaikan</b>.</div>
        </div>
      )}
      {st.status === "TERVERIFIKASI" && <div className="alert alert-info small">Berkas sudah diverifikasi. Hasil seleksi diumumkan di halaman ini{st.gelombang.tgl_pengumuman && <> pada {tgl(st.gelombang.tgl_pengumuman)}</>}.</div>}
      {st.status === "DITERIMA" && <div className="alert alert-success small"><b>Selamat, {st.data.nama_siswa} diterima.</b> Tekan <b>Konfirmasi daftar ulang</b> bila akan bersekolah di sini.{st.catatan_verifikasi && <div className="mt-1">{st.catatan_verifikasi}</div>}</div>}
      {st.status === "CADANGAN" && <div className="alert alert-warning small">Anak Anda masuk <b>daftar cadangan</b>. Sekolah akan menghubungi bila ada kursi kosong.{st.catatan_verifikasi && <div className="mt-1">{st.catatan_verifikasi}</div>}</div>}
      {st.status === "TIDAK_DITERIMA" && <div className="alert alert-secondary small">Mohon maaf, pendaftaran ini belum dapat diterima.{st.catatan_verifikasi && <div className="mt-1">{st.catatan_verifikasi}</div>}</div>}
      {st.status === "DAFTAR_ULANG" && <div className="alert alert-success small">Daftar ulang tercatat. Sekolah akan menghubungi lewat WhatsApp untuk langkah berikutnya.</div>}
      {st.status === "SELESAI" && <div className="alert alert-success small">{st.data.nama_siswa} sudah tercatat sebagai murid. Akun portal orang tua dibuat oleh sekolah.</div>}

      {sukses && <div className="alert alert-success small py-2" role="status">{sukses}</div>}
      {pesan && <div className="alert alert-danger small py-2" role="alert">{pesan}</div>}

      <h3 className="spmb-bagian">Berkas</h3>
      <ul className="list-group mb-3">
        {st.berkas.map((b) => (
          <li key={b.jenis} className="list-group-item d-flex flex-wrap align-items-center gap-2" data-berkas={b.jenis}>
            <div className="me-auto">
              <div className="fw-semibold">{b.nama}{b.wajib && <span className="text-danger"> *</span>}</div>
              <div className="small text-muted">
                {!b.ada ? (b.wajib ? "Belum diunggah" : "Opsional")
                  : b.status === "SAH" ? <span className="text-success"><i className="bi bi-check-circle me-1"></i>Sah</span>
                  : b.status === "DITOLAK" ? <span className="text-danger"><i className="bi bi-x-circle me-1"></i>Ditolak{b.catatan ? `: ${b.catatan}` : ""}</span>
                  : <>Terunggah{b.nama_berkas ? ` · ${b.nama_berkas}` : ""} · menunggu diperiksa</>}
              </div>
            </div>
            {st.boleh_ubah && (
              <label className={`btn btn-sm ${b.ada ? "btn-outline-primary" : "btn-primary"} mb-0`}>
                {sibuk === `berkas-${b.jenis}` ? <span className="spinner-border spinner-border-sm"></span> : <><i className="bi bi-upload me-1"></i>{b.ada ? "Ganti" : "Unggah"}</>}
                <input type="file" accept="image/*,application/pdf" className="d-none" onChange={unggah(b.jenis)} disabled={!!sibuk} aria-label={`Unggah ${b.nama}`} />
              </label>
            )}
          </li>
        ))}
      </ul>
      {st.boleh_ubah && <p className="small text-muted">Foto (JPG/PNG) atau PDF, maksimal 5 MB per berkas. Foto dari kamera HP otomatis diperkecil.</p>}

      {ubahData ? (
        <>
          <h3 className="spmb-bagian">Perbaiki data</h3>
          <FormIsian info={info} awal={st.data} galat={galat} pesan="" sibuk={sibuk === "data"} tombol="Simpan data" onBatal={() => setUbahData(false)}
            onKirim={async (d) => { if (await jalankan("data", () => kirim("PUT", "/spmb/data", { ...akses, ...d }))) setUbahData(false); }} />
        </>
      ) : (
        <div className="d-flex flex-wrap gap-2">
          {st.boleh_ubah && <button type="button" className="btn btn-outline-primary" onClick={() => setUbahData(true)}><i className="bi bi-pencil me-1"></i>Perbaiki data</button>}
          {st.status === "PERLU_PERBAIKAN" && (
            <button type="button" className="btn btn-warning" disabled={!!sibuk} onClick={() => jalankan("ulang", () => kirim("POST", "/spmb/ajukan-ulang", akses))}>
              <i className="bi bi-send me-1"></i>Kirim perbaikan</button>
          )}
          {st.boleh_daftar_ulang && (
            <button type="button" className="btn btn-success" disabled={!!sibuk} onClick={() => jalankan("du", () => kirim("POST", "/spmb/daftar-ulang", akses))}>
              <i className="bi bi-check2-circle me-1"></i>Konfirmasi daftar ulang</button>
          )}
        </div>
      )}
    </div></div>
  );
}
