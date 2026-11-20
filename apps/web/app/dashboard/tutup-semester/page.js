"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { API_URL } from "@/app/lib/config";

const getToken = () => localStorage.getItem("token");

async function panggil(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const teks = await res.text();
  let data = {};
  try { data = teks ? JSON.parse(teks) : {}; } catch { throw new Error("Respon server tidak valid."); }
  if (!res.ok) throw new Error(data.message || "Terjadi kesalahan pada server");
  return data;
}

const LANGKAH = ["Periksa", "Semester tujuan", "Yang disalin", "Konfirmasi"];

export default function TutupSemesterPage() {
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [langkah, setLangkah] = useState(0);
  const [form, setForm] = useState({ salin_rombel: true, salin_pengampu: true, salin_jadwal: false, kunci_lama: true });
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const d = await panggil(`${API_URL}/semester/tutup`);
      setData(d);
      if (d.usulan) setForm((f) => ({
        ...f,
        id_periode_tujuan: d.usulan.id_periode || "",
        tahun_ajaran: d.usulan.tahun_ajaran,
        semester: d.usulan.semester,
        tanggal_mulai: d.usulan.tanggal_mulai || "",
        tanggal_selesai: d.usulan.tanggal_selesai || "",
        salin_pengampu: !d.naik_tahun,
        salin_jadwal: false,
      }));
    } catch (e) {
      Swal.fire("Gagal memuat", e.message, "error");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const ubah = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pilihTujuan = (id) => {
    const p = data.pilihan_tujuan.find((x) => x.id_periode === id);
    setForm((f) => p
      ? { ...f, id_periode_tujuan: id, tahun_ajaran: p.tahun_ajaran, semester: p.semester, tanggal_mulai: p.tanggal_mulai || "", tanggal_selesai: p.tanggal_selesai || "" }
      : { ...f, id_periode_tujuan: "", tahun_ajaran: data.usulan.tahun_ajaran, semester: data.usulan.semester });
  };

  const jalankan = async () => {
    const aktif = data.aktif;
    const ok = await Swal.fire({
      title: "Tutup semester sekarang?",
      html: `Semester aktif berpindah dari <b>${aktif.tahun_ajaran} ${aktif.semester}</b> ke <b>${form.tahun_ajaran} ${form.semester}</b>.`
        + (form.kunci_lama ? "<br>Semester lama dikunci: guru hanya bisa membaca datanya." : ""),
      icon: "warning", showCancelButton: true, confirmButtonText: "Ya, tutup semester", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    setProses(true);
    try {
      const body = { ...form };
      if (!body.id_periode_tujuan) delete body.id_periode_tujuan;
      if (!body.tanggal_mulai) delete body.tanggal_mulai;
      if (!body.tanggal_selesai) delete body.tanggal_selesai;
      const res = await panggil(`${API_URL}/semester/tutup`, { method: "POST", body: JSON.stringify(body) });
      setHasil(res);
    } catch (e) {
      Swal.fire("Gagal menutup semester", e.message, "error");
    } finally {
      setProses(false);
    }
  };

  if (memuat) return <div className="p-4 text-muted"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memeriksa semester aktif…</div>;
  if (!data?.aktif) return <div className="alert alert-warning m-3">Belum ada semester aktif. Aktifkan semester dulu di <Link href="/dashboard/master-periode">Referensi → Semester</Link>.</div>;

  const { aktif, periksa, salin, naik_tahun: naikTahun } = data;

  if (hasil) {
    const r = hasil.ringkasan;
    return (
      <div className="container-fluid py-3" style={{ maxWidth: 820 }}>
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h1 className="h4 fw-bold text-success"><i className="bi bi-check-circle-fill me-2" aria-hidden="true"></i>Semester berhasil ditutup</h1>
            <p className="mb-3">{hasil.message}</p>
            <ul className="mb-3">
              <li>Rombel {r.siswa_dicatat} siswa dan wali kelas tercatat di riwayat semester lama.</li>
              {r.rombel_disalin > 0 && <li>{r.rombel_disalin} status rombel aktif disalin.</li>}
              {r.pengampu_disalin > 0 && <li>{r.pengampu_disalin} pembagian mengajar disalin.</li>}
              {r.jadwal_sesi > 0 && <li>{r.jadwal_seri} pola jadwal mingguan menjadi {r.jadwal_sesi} sesi.</li>}
              {r.dikunci && <li>Semester lama dikunci (hanya bisa dibaca). Admin bisa membukanya di menu Semester.</li>}
            </ul>
            <div className="alert alert-light border small mb-3">
              Langkah berikutnya: periksa <Link href="/dashboard/pengampu">Pembagian Mengajar</Link>, susun ATP/Promes semester ini di Perencanaan Ajar,
              {r.jadwal_sesi > 0 ? " lalu lengkapi materi pada jadwal yang disalin." : " lalu buat jadwal di menu Jadwal."}
              {r.naik_tahun && " Untuk tahun ajaran baru, atur kenaikan kelas dan rombel siswa di Data Sekolah → Siswa."}
            </div>
            <Link href="/dashboard/master-periode" className="btn btn-primary">Kembali ke Semester</Link>
          </div>
        </div>
      </div>
    );
  }

  const peringatan = periksa.filter((i) => i.tingkat === "peringatan").length;

  return (
    <div className="container-fluid py-3" style={{ maxWidth: 900 }}>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small mb-2">
          <li className="breadcrumb-item"><Link href="/dashboard/master-periode">Semester</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Tutup Semester</li>
        </ol>
      </nav>
      <h1 className="h4 fw-bold mb-1"><i className="bi bi-calendar2-check me-2 text-primary" aria-hidden="true"></i>Tutup Semester</h1>
      <p className="text-muted small mb-3">Semester aktif: <b>{aktif.tahun_ajaran} {aktif.semester}</b></p>

      <ol className="list-unstyled d-flex flex-wrap gap-2 mb-3" aria-label="Langkah">
        {LANGKAH.map((l, i) => (
          <li key={l}>
            <button type="button" className={`btn btn-sm ${i === langkah ? "btn-primary" : i < langkah ? "btn-outline-primary" : "btn-outline-secondary"}`}
              onClick={() => i <= langkah && setLangkah(i)} disabled={i > langkah} aria-current={i === langkah ? "step" : undefined}>
              {i + 1}. {l}
            </button>
          </li>
        ))}
      </ol>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          {langkah === 0 && (
            <>
              <h2 className="h6 fw-bold">Kelengkapan semester {aktif.tahun_ajaran} {aktif.semester}</h2>
              {periksa.length === 0 ? (
                <div className="alert alert-success mb-0"><i className="bi bi-check2-circle me-1" aria-hidden="true"></i>Semua lengkap. Semester siap ditutup.</div>
              ) : (
                <>
                  <p className="small text-muted">Daftar ini tidak menghalangi penutupan, tetapi sebaiknya diselesaikan dulu karena semester lama akan dikunci.</p>
                  <ul className="list-group mb-0">
                    {periksa.map((i, n) => (
                      <li key={n} className="list-group-item d-flex gap-2 align-items-start">
                        <i className={`bi ${i.tingkat === "peringatan" ? "bi-exclamation-triangle-fill text-warning" : "bi-info-circle text-info"} mt-1`} aria-hidden="true"></i>
                        <div className="me-auto">
                          <div>{i.judul}</div>
                          {i.rincian && <div className="small text-muted">{i.rincian}</div>}
                        </div>
                        {i.href && <Link href={i.href} className="btn btn-sm btn-outline-secondary">Buka</Link>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {langkah === 1 && (
            <>
              <h2 className="h6 fw-bold">Semester berikutnya</h2>
              {naikTahun && (
                <div className="alert alert-warning small">
                  Ini pergantian <b>tahun ajaran</b>. Siswa tetap di rombel sekarang; kenaikan kelas dan pemetaan rombel baru dilakukan terpisah.
                  Pembagian mengajar dan jadwal tidak disalin karena rombel tahun baru berbeda.
                </div>
              )}
              <div className="mb-3">
                <label className="form-label small fw-bold text-muted" htmlFor="tujuan">Semester tujuan</label>
                <select id="tujuan" className="form-select" value={form.id_periode_tujuan || ""} onChange={(e) => pilihTujuan(e.target.value)}>
                  <option value="">Buat baru: {data.usulan.tahun_ajaran} {data.usulan.semester}</option>
                  {data.pilihan_tujuan.map((p) => (
                    <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} {p.semester} (sudah ada{p.terkunci ? ", terkunci" : ""})</option>
                  ))}
                </select>
              </div>
              {!form.id_periode_tujuan && (
                <div className="row g-2 mb-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted" htmlFor="ta">Tahun ajaran</label>
                    <input id="ta" className="form-control" value={form.tahun_ajaran || ""} onChange={(e) => ubah("tahun_ajaran", e.target.value)} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-bold text-muted" htmlFor="sem">Semester</label>
                    <select id="sem" className="form-select" value={form.semester || "Genap"} onChange={(e) => ubah("semester", e.target.value)}>
                      <option value="Ganjil">Ganjil</option>
                      <option value="Genap">Genap</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="row g-2">
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted" htmlFor="mulai">Tanggal mulai</label>
                  <input id="mulai" type="date" className="form-control" value={form.tanggal_mulai || ""} onChange={(e) => ubah("tanggal_mulai", e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-bold text-muted" htmlFor="selesai">Tanggal selesai</label>
                  <input id="selesai" type="date" className="form-control" value={form.tanggal_selesai || ""} onChange={(e) => ubah("tanggal_selesai", e.target.value)} />
                </div>
                <div className="col-12 form-text">Boleh dikosongkan: dipakai kalender umum (Genap awal Januari–akhir Juni, Ganjil pertengahan Juli–pertengahan Desember).</div>
              </div>
            </>
          )}

          {langkah === 2 && (
            <>
              <h2 className="h6 fw-bold">Yang dibawa ke semester baru</h2>
              <p className="small text-muted">Rombel siswa dan wali kelas sekarang selalu dicatat ke riwayat semester lama, sehingga rapornya tetap utuh.</p>
              <div className="form-check mb-2">
                <input id="sRombel" className="form-check-input" type="checkbox" checked={form.salin_rombel} onChange={(e) => ubah("salin_rombel", e.target.checked)} />
                <label className="form-check-label" htmlFor="sRombel">Status rombel aktif/nonaktif ({salin.rombel} rombel aktif)</label>
              </div>
              <div className="form-check mb-2">
                <input id="sPengampu" className="form-check-input" type="checkbox" checked={form.salin_pengampu && !naikTahun} disabled={naikTahun} onChange={(e) => ubah("salin_pengampu", e.target.checked)} />
                <label className="form-check-label" htmlFor="sPengampu">
                  Pembagian mengajar ({salin.pengampu} pengaturan khusus{salin.pengampu === 0 ? "; guru bawaan mapel tetap berlaku" : ""})
                </label>
              </div>
              <div className="form-check mb-2">
                <input id="sJadwal" className="form-check-input" type="checkbox" checked={form.salin_jadwal && !naikTahun} disabled={naikTahun || salin.jadwal_seri === 0} onChange={(e) => ubah("salin_jadwal", e.target.checked)} />
                <label className="form-check-label" htmlFor="sJadwal">
                  Pola jadwal mingguan ({salin.jadwal_seri} jadwal berulang). Hari dan jam diulang sepanjang semester baru, melewati hari libur; materi dan perangkat tidak ikut. Jadwal dari Peta Tema dibuat ulang lewat Peta Tema.
                </label>
              </div>
              <hr />
              <div className="form-check">
                <input id="kunci" className="form-check-input" type="checkbox" checked={form.kunci_lama} onChange={(e) => ubah("kunci_lama", e.target.checked)} />
                <label className="form-check-label" htmlFor="kunci">
                  Kunci semester {aktif.tahun_ajaran} {aktif.semester}: nilai, presensi, jurnal, dan catatan hanya bisa dibaca. Admin tetap bisa memperbaiki, dan perubahannya tercatat di Log Aktivitas.
                </label>
              </div>
            </>
          )}

          {langkah === 3 && (
            <>
              <h2 className="h6 fw-bold">Ringkasan</h2>
              <dl className="row small mb-3">
                <dt className="col-sm-4">Ditutup</dt><dd className="col-sm-8">{aktif.tahun_ajaran} {aktif.semester}{form.kunci_lama ? " (dikunci)" : ""}</dd>
                <dt className="col-sm-4">Aktif berikutnya</dt><dd className="col-sm-8">{form.tahun_ajaran} {form.semester}{form.tanggal_mulai ? `, ${form.tanggal_mulai} s.d. ${form.tanggal_selesai || "…"}` : ""}</dd>
                <dt className="col-sm-4">Disalin</dt>
                <dd className="col-sm-8">
                  {[form.salin_rombel && "status rombel", form.salin_pengampu && !naikTahun && "pembagian mengajar", form.salin_jadwal && !naikTahun && "pola jadwal"].filter(Boolean).join(", ") || "tidak ada"}
                </dd>
                {peringatan > 0 && (<><dt className="col-sm-4 text-warning">Perhatian</dt><dd className="col-sm-8">{peringatan} hal di langkah Periksa belum selesai.</dd></>)}
              </dl>
              <button type="button" className="btn btn-danger fw-bold" onClick={jalankan} disabled={proses || !form.tahun_ajaran}>
                {proses ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Memproses…</> : <><i className="bi bi-calendar2-check me-1" aria-hidden="true"></i>Tutup semester</>}
              </button>
            </>
          )}
        </div>
        <div className="card-footer bg-white d-flex justify-content-between">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setLangkah((l) => Math.max(0, l - 1))} disabled={langkah === 0}>Kembali</button>
          {langkah < LANGKAH.length - 1 && <button type="button" className="btn btn-primary" onClick={() => setLangkah((l) => l + 1)}>Lanjut</button>}
        </div>
      </div>
    </div>
  );
}
