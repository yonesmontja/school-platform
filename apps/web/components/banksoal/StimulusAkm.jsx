"use client";
// Stimulus AKM bersama (CBT Tahap B): satu bacaan, tabel, atau grafik untuk beberapa soal sekaligus.
// Soal ditautkan lewat pilihan "Stimulus bersama" di editor soal; di paket, soal satu stimulus selalu berdampingan.
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import EditorKaya from "@/components/editor/EditorKaya";
import { MenuAksi, aksiHapus, aksiUbah } from "@/components/dashboard/menuAksi";
import Pengisi, { pengisiMapel } from "@/components/dashboard/Pengisi";
import { useAkses } from "@/app/lib/akses";
import { JENIS_STIMULUS, KONTEKS_STIMULUS, labelJenisStimulus } from "./konstanta";
import { KotakStimulus, srcGambar } from "./PratinjauSoal";
import { bacaBerkas, minta } from "./api";

const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2500 });

function FormStimulus({ awal, referensi, onTutup, onTersimpan }) {
  const [f, setF] = useState(() => ({
    id_mapel: awal?.id_mapel || (referensi.mapel.length === 1 ? referensi.mapel[0].id_mapel : ""), id_kelas: awal?.id_kelas || "",
    judul: awal?.judul || "", jenis: awal?.jenis || "LITERASI_INFORMASI", konteks: awal?.konteks || "PERSONAL",
    konten: awal?.konten || "", gambar_url: awal?.gambar_url || null, sumber_teks: awal?.sumber_teks || "",
  }));
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);

  const unggah = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return Swal.fire("Gambar terlalu besar", "Maksimal 2MB.", "warning");
    try { set("gambar_url", (await minta("POST", "/bank-soal/gambar", { gambar_base64: await bacaBerkas(file) })).url); }
    catch (err) { Swal.fire("Gagal mengunggah", err.message, "error"); }
  };

  const simpan = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const body = { ...f, id_kelas: f.id_kelas || null, sumber_teks: f.sumber_teks || null };
      const r = awal ? await minta("PUT", `/stimulus/${awal.id_stimulus}`, body) : await minta("POST", "/stimulus", body);
      toast(r.message);
      onTersimpan(r.data);
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); }
    finally { setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={awal ? "Ubah stimulus" : "Stimulus baru"}>
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-file-earmark-richtext text-primary me-2"></i>{awal ? "Ubah Stimulus" : "Stimulus Baru"}</h5>
              <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {awal?.soal_count > 0 && <div className="alert alert-info small py-2"><i className="bi bi-info-circle me-1"></i>Dipakai {awal.soal_count} soal. Paket yang sudah berisi soalnya tetap memakai isi lama.</div>}
              <div className="row g-2 mb-2">
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold mb-1" htmlFor="stMapel">Mata pelajaran</label>
                  <select id="stMapel" className="form-select form-select-sm" required value={f.id_mapel} onChange={(e) => set("id_mapel", e.target.value)}>
                    <option value="">Pilih mapel</option>
                    {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                  </select>
                </div>
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold mb-1" htmlFor="stKelas">Kelas <span className="fw-normal text-muted">(opsional)</span></label>
                  <select id="stKelas" className="form-select form-select-sm" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                    <option value="">Semua kelas</option>
                    {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold mb-1" htmlFor="stJudul">Judul</label>
                  <input id="stJudul" className="form-control form-control-sm" required maxLength={200} value={f.judul} onChange={(e) => set("judul", e.target.value)} placeholder="mis. Pasar Mama-mama di Jayapura" />
                </div>
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold mb-1" htmlFor="stJenis">Jenis</label>
                  <select id="stJenis" className="form-select form-select-sm" value={f.jenis} onChange={(e) => set("jenis", e.target.value)}>
                    {JENIS_STIMULUS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
                  </select>
                </div>
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold mb-1" htmlFor="stKonteks">Konteks</label>
                  <select id="stKonteks" className="form-select form-select-sm" value={f.konteks} onChange={(e) => set("konteks", e.target.value)}>
                    {KONTEKS_STIMULUS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
              </div>
              <label className="form-label small fw-semibold mb-1">Isi stimulus</label>
              <EditorKaya value={f.konten} onChange={(v) => set("konten", v)} label="Isi stimulus" placeholder="Tulis bacaan, cerita, atau tabel data yang dipakai beberapa soal." />
              <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                <label className="btn btn-sm btn-outline-primary mb-0"><i className="bi bi-image me-1"></i>{f.gambar_url ? "Ganti gambar" : "Tambah gambar/grafik"}
                  <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={unggah} /></label>
                {f.gambar_url && (
                  <>
                    <img src={srcGambar(f.gambar_url)} alt="Gambar stimulus" className="border rounded bg-white" style={{ height: 48 }} />
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => set("gambar_url", null)} aria-label="Hapus gambar"><i className="bi bi-trash"></i></button>
                  </>
                )}
              </div>
              <label className="form-label small fw-semibold mb-1 mt-2" htmlFor="stSumber">Sumber teks <span className="fw-normal text-muted">(opsional)</span></label>
              <input id="stSumber" className="form-control form-control-sm" maxLength={300} value={f.sumber_teks} onChange={(e) => set("sumber_teks", e.target.value)} placeholder="mis. Diadaptasi dari Majalah Bobo, 2024" />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={proses}>Batal</button>
              <button type="submit" className="btn btn-primary fw-semibold" disabled={proses}>
                {proses ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-floppy me-1"></i>}Simpan
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

/** Daftar stimulus AKM: tambah, ubah, lihat soalnya, dan buat soal baru untuk stimulus itu. */
export default function StimulusAkm({ referensi, onLihatSoal, onBuatSoal }) {
  const { user, isPengelola } = useAkses();
  const [filter, setFilter] = useState({ id_mapel: "", jenis: "", cari: "" });
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null); // { awal } untuk FormStimulus
  const [buka, setBuka] = useState({});

  const muat = useCallback(() => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    minta("GET", `/stimulus?${q}`).then((r) => setData(r.data)).catch((e) => { setData([]); Swal.fire("Gagal memuat", e.message, "error"); });
  }, [filter]);
  useEffect(() => { const t = setTimeout(muat, filter.cari ? 300 : 0); return () => clearTimeout(t); }, [muat, filter.cari]);

  const bolehUbah = (s) => isPengelola || s.dibuat_oleh === user?.id;
  const hapus = async (s) => {
    const ok = await Swal.fire({ title: "Hapus stimulus ini?", text: s.judul, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { toast((await minta("DELETE", `/stimulus/${s.id_stimulus}`)).message); muat(); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };

  return (
    <div className="card shadow-sm">
      <div className="card-header d-flex flex-wrap align-items-center gap-2">
        <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-file-earmark-richtext me-2"></i>Stimulus AKM</h3>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setForm({ awal: null })}><i className="bi bi-plus-lg me-1"></i>Stimulus baru</button>
      </div>
      <div className="card-body">
        <p className="small text-muted mb-3">Satu bacaan, cerita, atau tabel data untuk beberapa soal sekaligus, seperti AKM. Siswa membacanya sekali di samping soal-soalnya; saat soal diacak, soal satu stimulus tetap berdampingan.</p>
        <div className="row g-2 mb-3">
          <div className="col-6 col-md-3"><select className="form-select form-select-sm" value={filter.id_mapel} onChange={(e) => setFilter((x) => ({ ...x, id_mapel: e.target.value }))} aria-label="Filter mapel stimulus">
            <option value="">Semua mapel</option>{referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}</select></div>
          <div className="col-6 col-md-3"><select className="form-select form-select-sm" value={filter.jenis} onChange={(e) => setFilter((x) => ({ ...x, jenis: e.target.value }))} aria-label="Filter jenis stimulus">
            <option value="">Semua jenis</option>{JENIS_STIMULUS.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}</select></div>
          <div className="col-12 col-md-6"><input type="search" className="form-control form-control-sm" placeholder="Cari judul atau isi" aria-label="Cari stimulus"
            value={filter.cari} onChange={(e) => setFilter((x) => ({ ...x, cari: e.target.value }))} /></div>
        </div>

        {!data ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
          : !data.length ? <div className="text-center text-muted py-4"><i className="bi bi-file-earmark-richtext fs-2 d-block mb-2"></i>{filter.cari || filter.jenis || filter.id_mapel ? "Tidak ada stimulus yang cocok." : "Belum ada stimulus. Buat satu bacaan atau tabel, lalu tautkan beberapa soal kepadanya."}</div>
          : (
            <div className="d-flex flex-column gap-2">
              {data.map((s) => (
                <div key={s.id_stimulus} className="border rounded p-2 p-md-3" data-stimulus={s.judul}>
                  <div className="d-flex flex-wrap align-items-start gap-2">
                    <button type="button" className="btn btn-link p-0 text-start text-decoration-none flex-grow-1 min-w-0" onClick={() => setBuka((b) => ({ ...b, [s.id_stimulus]: !b[s.id_stimulus] }))} aria-expanded={!!buka[s.id_stimulus]}>
                      <div className="fw-semibold text-body">{s.judul}</div>
                      <div className="small text-muted">
                        {labelJenisStimulus(s.jenis)} · {KONTEKS_STIMULUS.find((k) => k.value === s.konteks)?.label} · {s.mapel?.nama_mapel}{s.kelas ? ` · ${s.kelas.nama_kelas}` : ""}
                        {" · "}<span data-jumlah-soal-stimulus>{s.soal_count} soal</span>
                      </div>
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onBuatSoal(s)}><i className="bi bi-plus-lg me-1"></i>Soal baru</button>
                    <MenuAksi label={`Aksi stimulus ${s.judul}`} items={[
                      { label: `Lihat ${s.soal_count} soal`, ikon: "bi-collection", onClick: () => onLihatSoal(s), tampil: s.soal_count > 0 },
                      aksiUbah(() => setForm({ awal: s }), bolehUbah(s)),
                      aksiHapus(() => hapus(s), bolehUbah(s)),
                    ]} />
                  </div>
                  <div className="small text-muted mt-1"><Pengisi sebaris {...pengisiMapel(s)} /></div>
                  {buka[s.id_stimulus] && <div className="mt-2"><KotakStimulus stimulus={s} /></div>}
                </div>
              ))}
            </div>
          )}
      </div>
      {form && <FormStimulus awal={form.awal} referensi={referensi} onTutup={() => setForm(null)} onTersimpan={() => { setForm(null); muat(); }} />}
    </div>
  );
}
