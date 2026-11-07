"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DIMENSI, HURUF, labelBentuk } from "./konstanta";
import { minta } from "./api";

const KESUKARAN = { MUDAH: ["Mudah", "info"], SEDANG: ["Sedang", "success"], SUKAR: ["Sukar", "warning"] };
const DAYA_BEDA = { BAIK_SEKALI: ["Baik sekali", "success"], BAIK: ["Baik", "success"], CUKUP: ["Cukup", "warning"], JELEK: ["Perlu diperbaiki", "danger"] };
const reliabel = (a) => (a == null ? "–" : a >= 0.7 ? "tinggi" : a >= 0.5 ? "sedang" : "rendah");

/** Analisis butir klasik dan capaian per TP & STNKM dari jawaban yang sudah lengkap dikoreksi. */
export default function AnalisisPaket({ paket }) {
  const [a, setA] = useState(null);
  const [galat, setGalat] = useState(null);

  useEffect(() => {
    setA(null);
    minta("GET", `/paket-soal/${paket.id_paket}/analisis`).then((r) => setA(r.data)).catch((err) => setGalat(err.message));
  }, [paket.id_paket, paket.updated_at]);

  if (galat) return <div className="alert alert-warning">{galat}</div>;
  if (!a) return <div className="text-muted small py-3"><span className="spinner-border spinner-border-sm me-2"></span>Menghitung analisis…</div>;
  if (!a.jumlah_siswa) return (
    <div className="text-center text-muted py-5"><i className="bi bi-graph-up fs-1 d-block mb-2"></i>
      Belum ada jawaban yang lengkap dikoreksi.{a.belum_lengkap > 0 && ` ${a.belum_lengkap} siswa masih punya butir yang belum diberi skor.`}</div>
  );

  const unduhPdf = () => {
    const doc = new jsPDF("landscape", "mm", "a4");
    doc.setFont("helvetica", "bold").setFontSize(13).text(`Analisis Butir: ${paket.judul}`, 14, 14);
    doc.setFont("helvetica", "normal").setFontSize(9).text(
      `${paket.mapel?.nama_mapel || ""} | ${paket.kelas?.nama_kelas || ""} | ${a.jumlah_siswa} siswa | rata-rata ${a.rata_nilai} | tuntas ${a.tuntas}/${a.jumlah_siswa} (KKM ${a.kkm}) | reliabilitas ${a.reliabilitas ?? "-"} (${reliabel(a.reliabilitas)})`, 14, 20);
    autoTable(doc, {
      startY: 25, styles: { fontSize: 8 }, headStyles: { fillColor: [32, 107, 196] },
      head: [["No", "Bentuk", "Level", "TP", "p", "Kesukaran", "D", "Daya beda", "Saran"]],
      body: a.butir.map((b) => [b.nomor, labelBentuk(b.bentuk), b.level_kognitif || "", b.tp || "", b.p ?? "", KESUKARAN[b.kesukaran]?.[0] || "", b.d ?? "-", DAYA_BEDA[b.daya_beda]?.[0] || "-", b.saran || ""]),
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6, styles: { fontSize: 8 }, headStyles: { fillColor: [47, 179, 68] },
      head: [["TP", "Materi", "Butir", "Rata-rata (%)", "Tuntas"]],
      body: a.per_tp.map((t) => [t.tp || "(tanpa TP)", t.materi || "", t.jumlah_butir, t.rata ?? "", `${t.tuntas}/${a.jumlah_siswa}`]),
    });
    doc.save(`analisis-${paket.judul.replace(/[^\w-]+/g, "_")}.pdf`);
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <div className="small text-muted me-auto">Dihitung dari {a.jumlah_siswa} siswa yang selesai dikoreksi{a.belum_lengkap > 0 && ` (${a.belum_lengkap} belum lengkap tidak dihitung)`}.</div>
        <button className="btn btn-sm btn-outline-secondary" onClick={unduhPdf}><i className="bi bi-file-earmark-pdf me-1"></i>Unduh PDF</button>
      </div>

      <div className="row g-2">
        {[
          ["Rata-rata nilai", a.rata_nilai, `tertinggi ${a.tertinggi} · terendah ${a.terendah}`, "bi-bar-chart"],
          ["Tuntas KKM", `${a.tuntas}/${a.jumlah_siswa}`, `KKM ${a.kkm}`, "bi-check2-circle"],
          ["Reliabilitas", a.reliabilitas ?? "–", `Cronbach alpha, ${reliabel(a.reliabilitas)}`, "bi-shield-check"],
          ["Butir", a.butir.length, `${a.butir.filter((b) => b.daya_beda === "JELEK").length} perlu diperbaiki`, "bi-list-ol"],
        ].map(([judul, nilai, ket, ikon]) => (
          <div key={judul} className="col-6 col-md-3">
            <div className="border rounded p-2 h-100">
              <div className="small text-muted"><i className={`bi ${ikon} me-1`}></i>{judul}</div>
              <div className="fs-4 fw-bold">{nilai}</div>
              <div className="small text-muted">{ket}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="fw-semibold mb-2"><i className="bi bi-pentagon me-1"></i>Profil STNKM kelas</div>
          {DIMENSI.map((d) => {
            const v = a.stnkm[d.key];
            return (
              <div key={d.key} className="mb-2">
                <div className="d-flex justify-content-between small"><span><b>{d.key}</b> {d.label}</span><span>{v == null ? "tidak diukur" : `${v}%`}</span></div>
                <div className="progress" style={{ height: 8 }} role="progressbar" aria-label={`${d.label} ${v ?? 0}%`} aria-valuenow={v ?? 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`progress-bar bg-${d.warna}`} style={{ width: `${v ?? 0}%` }}></div>
                </div>
              </div>
            );
          })}
          <div className="form-text">Capaian tertimbang bobot STNKM setiap butir: dimensi yang banyak diukur soal paket ini tampak jelas, yang tidak diukur ditandai.</div>
        </div>
        <div className="col-lg-7">
          <div className="fw-semibold mb-2"><i className="bi bi-bullseye me-1"></i>Capaian per TP</div>
          <div className="table-responsive">
            <table className="table table-sm align-middle small mb-0">
              <thead><tr><th>TP</th><th className="text-center">Butir</th><th className="text-center">Rata-rata</th><th className="text-center">Tuntas</th></tr></thead>
              <tbody>
                {a.per_tp.map((t, i) => (
                  <tr key={i}>
                    <td>{t.tp || <span className="text-muted">(tanpa TP)</span>}{t.materi && <div className="text-muted">{t.materi}</div>}</td>
                    <td className="text-center">{t.jumlah_butir}</td>
                    <td className={`text-center fw-semibold ${t.rata < a.kkm ? "text-danger" : "text-success"}`}>{t.rata}%</td>
                    <td className="text-center">{t.tuntas}/{a.jumlah_siswa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <div className="fw-semibold mb-2"><i className="bi bi-list-check me-1"></i>Analisis butir</div>
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle small mb-0 analisis-butir">
            <thead className="table-light"><tr><th>No</th><th>Soal</th><th className="text-center" title="Tingkat kesukaran: proporsi skor yang diperoleh siswa">p</th><th className="text-center" title="Daya beda: selisih kelompok atas & bawah (27%)">D</th><th>Pilihan siswa</th><th>Saran</th></tr></thead>
            <tbody>
              {a.butir.map((b) => (
                <tr key={b.id}>
                  <td className="fw-bold">{b.nomor}</td>
                  <td style={{ minWidth: 200 }}>
                    <div className="text-truncate" style={{ maxWidth: 320 }} title={b.pertanyaan}>{b.pertanyaan}</div>
                    <div className="text-muted">{labelBentuk(b.bentuk)} · {b.level_kognitif}{b.tp && ` · ${b.tp}`}</div>
                  </td>
                  <td className="text-center text-nowrap">{b.p}<div><span className={`badge text-bg-${KESUKARAN[b.kesukaran]?.[1] || "light"}`}>{KESUKARAN[b.kesukaran]?.[0]}</span></div></td>
                  <td className="text-center text-nowrap">{b.d ?? "–"}{b.daya_beda && <div><span className={`badge text-bg-${DAYA_BEDA[b.daya_beda][1]}`}>{DAYA_BEDA[b.daya_beda][0]}</span></div>}</td>
                  <td className="text-nowrap">
                    {b.sebaran ? b.sebaran.pilihan.map((c, i) => (
                      <span key={i} className={`me-2 ${i === b.sebaran.kunci ? "fw-bold text-success" : b.sebaran.pengecoh_lemah.includes(i) ? "text-danger" : ""}`}
                        title={i === b.sebaran.kunci ? "Kunci" : b.sebaran.pengecoh_lemah.includes(i) ? "Pengecoh jarang dipilih" : "Pengecoh"}>{HURUF[i]}:{c}</span>
                    )) : <span className="text-muted">rata-rata {b.rata}/{b.skor_maks}</span>}
                    {b.sebaran?.kosong > 0 && <span className="text-muted">kosong:{b.sebaran.kosong}</span>}
                  </td>
                  <td>{b.saran}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.jumlah_siswa < 4 && <div className="form-text">Daya beda dihitung bila minimal 4 siswa selesai dikoreksi.</div>}
      </div>

      <div>
        <div className="fw-semibold mb-2"><i className="bi bi-people me-1"></i>Nilai siswa</div>
        <div className="table-responsive">
          <table className="table table-sm align-middle small mb-0">
            <thead><tr><th>#</th><th>Siswa</th><th className="text-center">Nilai</th>{DIMENSI.filter((d) => a.stnkm[d.key] != null).map((d) => <th key={d.key} className="text-center" title={d.label}>{d.key}</th>)}</tr></thead>
            <tbody>
              {a.siswa.map((s, i) => (
                <tr key={s.id_siswa}>
                  <td>{i + 1}</td><td>{s.nama_siswa}</td>
                  <td className={`text-center fw-semibold ${s.nilai < a.kkm ? "text-danger" : ""}`}>{s.nilai}</td>
                  {DIMENSI.filter((d) => a.stnkm[d.key] != null).map((d) => <td key={d.key} className="text-center">{s.stnkm[d.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
