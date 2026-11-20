"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { FotoKecil } from "@/components/siswa/EditorFoto";
import { useAkses } from "@/app/lib/akses";
import { esc, gagal, toast } from "../administrasi/bantu";
import { IKON_KATEGORI, TINGKAT_PD } from "@/components/siswa/PeringatanDini";

const waktu = (t) => (t ? new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Peringatan dini siswa: skor dari presensi, nilai, tes online, dan pembinaan. Setiap poin punya alasan;
 * wali kelas & pengelola mencatat tindak lanjut agar siswa yang sudah ditangani tidak terus muncul sebagai mendesak.
 */
function Isi() {
  const params = useSearchParams();
  const { isPeninjau, isAdmin, isKepsek, isGuru } = useAkses();
  const [hasil, setHasil] = useState(null);
  const [kelas, setKelas] = useState(params.get("kelas") || "");
  const [tingkat, setTingkat] = useState(params.get("tingkat") || "");
  const [cari, setCari] = useState("");
  const [sembunyiDitangani, setSembunyiDitangani] = useState(false);

  const muat = useCallback(() => {
    minta("GET", `/peringatan-dini${kelas ? `?id_kelas=${encodeURIComponent(kelas)}` : ""}`).then(setHasil).catch((e) => { setHasil({ data: [], ringkas: {}, kelas: [] }); gagal(e); });
  }, [kelas]);
  useEffect(() => { muat(); }, [muat]);

  const tampil = useMemo(() => (hasil?.data || []).filter((s) =>
    (!tingkat || s.tingkat === tingkat)
    && (!cari || s.nama_siswa.toLowerCase().includes(cari.toLowerCase()))
    && (!sembunyiDitangani || !s.tindak_lanjut?.masih_berlaku)), [hasil, tingkat, cari, sembunyiDitangani]);

  const bolehPribadi = isAdmin || isKepsek || isGuru;

  const catat = async (s) => {
    const daftar = s.alasan.map((a) => `<li>${esc(a.label)}</li>`).join("");
    const r = await Swal.fire({
      title: `Tindak lanjut: ${s.nama_siswa}`,
      html: `<div class="text-start small mb-2">Alasan saat ini:<ul class="mb-0">${daftar || "<li>tidak ada</li>"}</ul></div>`,
      input: "textarea", inputLabel: "Apa yang sudah atau akan dilakukan?",
      inputPlaceholder: "Mis. menelepon orang tua, jadwal remedial Matematika, konseling dengan guru BK…",
      inputValidator: (v) => (!v?.trim() || v.trim().length < 3 ? "Tulis tindak lanjutnya." : null),
      showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal",
    });
    if (!r.isConfirmed) return;
    try { const x = await minta("POST", `/peringatan-dini/${s.id_siswa}/tindak`, { catatan: r.value }); toast(x.message); muat(); } catch (e) { gagal(e); }
  };

  const riwayat = async (s) => {
    try {
      const r = await minta("GET", `/peringatan-dini/${s.id_siswa}/riwayat`);
      const isi = r.data.length
        ? r.data.map((t) => `<div class="border-bottom py-2"><div class="small text-body-secondary">${esc(waktu(t.pada))} · ${esc(t.oleh || "-")} · skor ${t.skor}</div><div>${esc(t.catatan)}</div><div class="small text-body-secondary">${esc((t.alasan || []).map((a) => a.label).join(", "))}</div></div>`).join("")
        : "<div class='text-body-secondary'>Belum ada tindak lanjut.</div>";
      Swal.fire({ title: `Riwayat tindak lanjut: ${s.nama_siswa}`, html: `<div class="text-start">${isi}</div>`, width: 640, confirmButtonText: "Tutup" });
    } catch (e) { gagal(e); }
  };

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <h3 className="fw-bold mb-0"><i className="bi bi-activity text-danger me-2"></i>Peringatan Dini Siswa</h3>
          <div className="small text-body-secondary">
            Dihitung otomatis dari presensi {hasil?.hari_presensi || 30} hari terakhir, nilai semester aktif, tes online yang terlewat, catatan perilaku negatif di jurnal, dan pembinaan kehadiran.
            Setiap poin ada alasannya — keputusan tetap di tangan guru.
          </div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={muat}><i className="bi bi-arrow-clockwise"></i><span className="d-none d-sm-inline ms-1">Segarkan</span></button>
      </div>

      <div className="row g-2 mb-3">
        {Object.entries(TINGKAT_PD).map(([t, info]) => (
          <div key={t} className="col-6 col-lg-3">
            <button type="button" data-ringkas-pd={t} onClick={() => setTingkat(tingkat === t ? "" : t)}
              className={`w-100 text-start notif-ringkas border-0 ${tingkat === t ? "shadow-sm bg-body-tertiary" : ""}`} style={{ borderLeft: `4px solid var(--bs-${info.warna})` }}>
              <span className={`notif-ikon text-bg-${info.warna}`}><i className={`bi ${info.ikon}`}></i></span>
              <div>
                <div className="fs-4 fw-bold lh-1">{hasil?.ringkas?.[t] ?? "–"}</div>
                <div className="small text-body-secondary">{info.label}</div>
              </div>
            </button>
          </div>
        ))}
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <select className="form-select form-select-sm w-auto" value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas">
          <option value="">Semua kelas</option>
          {(hasil?.kelas || []).map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
        </select>
        <select className="form-select form-select-sm w-auto" value={tingkat} onChange={(e) => setTingkat(e.target.value)} aria-label="Tingkat">
          <option value="">Semua tingkat</option>
          {Object.entries(TINGKAT_PD).map(([t, i]) => <option key={t} value={t}>{i.label}</option>)}
        </select>
        <input type="search" className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="Cari nama siswa…" value={cari} onChange={(e) => setCari(e.target.value)} />
        <div className="form-check form-switch small ms-1">
          <input className="form-check-input" type="checkbox" id="sembunyiDitangani" checked={sembunyiDitangani} onChange={(e) => setSembunyiDitangani(e.target.checked)} />
          <label className="form-check-label" htmlFor="sembunyiDitangani">Sembunyikan yang sudah ditangani</label>
        </div>
      </div>

      {!hasil && <div className="text-body-secondary">Memuat…</div>}
      {hasil && !hasil.periode && <div className="alert alert-warning small">Belum ada semester aktif; peringatan dari nilai dan tes belum bisa dihitung.</div>}
      {hasil && tampil.length === 0 && (
        <div className="text-center text-body-secondary py-5"><i className="bi bi-emoji-smile fs-2 d-block mb-1"></i>Tidak ada siswa yang cocok dengan saringan ini.</div>
      )}

      <div className="row g-2">
        {tampil.map((s) => {
          const info = TINGKAT_PD[s.tingkat];
          const tl = s.tindak_lanjut;
          return (
            <div key={s.id_siswa} className="col-12 col-xl-6">
              <div className="card h-100" data-siswa-pd={s.nama_siswa} style={{ borderLeft: `4px solid var(--bs-${info.warna})` }}>
                <div className="card-body py-2">
                  <div className="d-flex gap-2 align-items-start">
                    <FotoKecil siswa={s} ukuran={44} />
                    <div className="me-auto min-w-0">
                      <div className="fw-semibold text-truncate">{s.nama_siswa}</div>
                      <div className="small text-body-secondary">{s.nama_kelas}
                        {s.ringkas.hadir_persen !== null && <> · hadir {s.ringkas.hadir_persen}%</>}
                        {s.ringkas.rata_nilai !== null && <> · rata-rata nilai {s.ringkas.rata_nilai}</>}
                      </div>
                    </div>
                    <div className="text-end">
                      <span className={`badge text-bg-${info.warna}`} data-tingkat-pd={s.tingkat}>{info.label}</span>
                      <div className="small text-body-secondary">skor {s.skor}</div>
                    </div>
                  </div>

                  {s.alasan.length > 0 && (
                    <ul className="list-unstyled small mb-1 mt-2">
                      {s.alasan.map((a) => (
                        <li key={a.kode} className="d-flex gap-2 py-1 border-top" data-alasan-pd={a.kode}>
                          <i className={`bi ${IKON_KATEGORI[a.kategori] || "bi-dot"} text-${info.warna}`}></i>
                          <div className="me-auto"><b>{a.label}</b> <span className="text-body-secondary">{a.detail}</span></div>
                          <span className="text-body-secondary text-nowrap">+{a.bobot}</span>
                          {a.tautan && <Link href={a.tautan} className="text-nowrap" title="Buka data terkait"><i className="bi bi-box-arrow-up-right"></i></Link>}
                        </li>
                      ))}
                    </ul>
                  )}

                  {tl && (
                    <div className={`small rounded px-2 py-1 mb-1 ${tl.masih_berlaku ? "bg-success-subtle" : "bg-body-tertiary"}`} data-tindak-pd>
                      <i className={`bi ${tl.masih_berlaku ? "bi-check2-circle text-success" : "bi-clock-history"} me-1`}></i>
                      {tl.masih_berlaku ? "Sudah ditangani" : "Tindak lanjut terakhir (alasan sudah berubah)"}: {tl.catatan}
                      <span className="text-body-secondary"> — {tl.oleh}, {waktu(tl.pada)}</span>
                    </div>
                  )}

                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {!isPeninjau && s.alasan.length > 0 && (
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => catat(s)}><i className="bi bi-pencil-square me-1"></i>Catat tindak lanjut</button>
                    )}
                    {s.riwayat_tindak > 0 && (
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => riwayat(s)}><i className="bi bi-clock-history me-1"></i>Riwayat ({s.riwayat_tindak})</button>
                    )}
                    {bolehPribadi && (
                      <a className="btn btn-sm btn-outline-secondary" href={`/dashboard/portal?siswa=${encodeURIComponent(s.id_siswa)}`} target="_blank" rel="noopener"><i className="bi bi-person-badge me-1"></i>Dashboard pribadi</a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PeringatanDiniPage() {
  return <Suspense fallback={<div className="container-fluid py-3 text-body-secondary">Memuat…</div>}><Isi /></Suspense>;
}
