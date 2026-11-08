"use client";
import { API_ORIGIN } from "@/app/lib/config";
import { DIMENSI, HURUF } from "./konstanta";

// SVG dari AI ditampilkan sebagai <img> (skrip di dalamnya tidak pernah berjalan)
export const srcSvg = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
export const srcGambar = (url) => (url?.startsWith("/storage/") ? `${API_ORIGIN}${url}` : url);

/** Bobot STNKM sebuah soal sebagai deretan lencana kecil (hanya dimensi dengan bobot > 0). */
export function LencanaStnkm({ soal }) {
  const ada = DIMENSI.filter((d) => Number(soal[`dim_${d.key}`]) > 0);
  if (!ada.length) return null;
  return (
    <span className="d-inline-flex flex-wrap gap-1">
      {ada.map((d) => (
        <span key={d.key} className={`badge bg-${d.warna}-subtle text-${d.warna}-emphasis border border-${d.warna}-subtle fw-normal`} title={`${d.label}: bobot ${Number(soal[`dim_${d.key}`])}`}>
          {d.key} {Number(soal[`dim_${d.key}`]).toFixed(1)}
        </span>
      ))}
    </span>
  );
}

/**
 * Tampilan satu soal seperti dilihat siswa, dengan kunci ditandai bila `kunci` true.
 * Menjodohkan & mengurutkan ditampilkan dengan jawaban benar (urutan diacak saat tes).
 */
export default function PratinjauSoal({ soal, nomor, kunci = true }) {
  const isi = soal.isi || {};
  const k = soal.kunci || {};
  const benar = (cond) => (kunci && cond ? "fw-semibold text-success-emphasis" : "");

  return (
    <div className="pratinjau-soal">
      <div className="d-flex gap-2">
        {nomor != null && <b>{nomor}.</b>}
        <div className="flex-grow-1 min-w-0" style={{ whiteSpace: "pre-wrap" }}>{soal.pertanyaan}</div>
      </div>
      {soal.video?.file_url && (
        <div className="my-2" style={{ maxWidth: 420 }}>
          <video controls preload="none" playsInline src={srcGambar(soal.video.file_url)} poster={soal.video.poster_url ? srcGambar(soal.video.poster_url) : undefined} className="w-100 rounded bg-black" aria-label={`Video stimulus: ${soal.video.judul}`} />
        </div>
      )}
      {(soal.gambar_svg || soal.gambar_url) && (
        <div className="my-2">
          <img src={soal.gambar_svg ? srcSvg(soal.gambar_svg) : srcGambar(soal.gambar_url)} alt="Gambar soal"
            className="border rounded bg-white" style={{ maxWidth: "100%", maxHeight: 240 }} />
        </div>
      )}

      {(soal.bentuk === "PG" || soal.bentuk === "PG_KOMPLEKS") && (
        <ol className="list-unstyled mb-0 mt-2">
          {(isi.pilihan || []).map((p, i) => {
            const ok = soal.bentuk === "PG" ? k.jawaban === i : (k.jawaban || []).includes(i);
            return (
              <li key={i} className={benar(ok)}>
                {HURUF[i]}. {p} {kunci && ok && <i className="bi bi-check-circle-fill text-success" aria-label="kunci"></i>}
              </li>
            );
          })}
        </ol>
      )}

      {soal.bentuk === "BENAR_SALAH" && (
        <table className="table table-sm mb-0 mt-2 w-auto">
          <tbody>
            {(isi.pernyataan || []).map((p, i) => (
              <tr key={i}>
                <td>{p}</td>
                <td className="text-nowrap small">{kunci ? <b className={k.jawaban?.[i] ? "text-success" : "text-danger"}>{k.jawaban?.[i] ? "Benar" : "Salah"}</b> : "Benar / Salah"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {soal.bentuk === "ISIAN" && (
        <div className="mt-2 small">
          Jawaban: ____________ {kunci && <span className="text-success-emphasis ms-1">(kunci: {(k.jawaban || []).join(" / ")})</span>}
        </div>
      )}

      {soal.bentuk === "MEMBACA_NYARING" && (
        <div className="mt-2">
          <div className="border rounded p-2 bg-body-tertiary fs-6" style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{soal.isi?.teks}</div>
          <div className="small text-muted mt-1"><i className="bi bi-mic me-1"></i>Dibaca nyaring oleh siswa</div>
          {kunci && soal.rubrik && <div className="small text-body-secondary mt-1" style={{ whiteSpace: "pre-wrap" }}><b>Rubrik:</b> {soal.rubrik}</div>}
        </div>
      )}

      {soal.bentuk === "URAIAN" && kunci && (k.jawaban || soal.rubrik) && (
        <div className="mt-2 small">
          {k.jawaban && <div><b>Contoh jawaban:</b> {k.jawaban}</div>}
          {soal.rubrik && <div className="text-body-secondary" style={{ whiteSpace: "pre-wrap" }}><b>Rubrik:</b> {soal.rubrik}</div>}
        </div>
      )}

      {soal.bentuk === "MENJODOHKAN" && (
        <table className="table table-sm mb-0 mt-2 w-auto">
          <tbody>
            {(isi.pasangan || []).map((p, i) => (
              <tr key={i}><td>{p.kiri}</td><td className="text-muted"><i className="bi bi-arrow-left-right"></i></td><td>{p.kanan}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      {soal.bentuk === "MENGURUTKAN" && (
        <ol className="mb-0 mt-2 small">
          {(isi.urutan || []).map((u, i) => <li key={i}>{u}</li>)}
        </ol>
      )}

      {soal.bentuk === "LENGKAPI_GAMBAR" && (
        <div className="mt-2 small">
          {(soal.isi?.bank_kata || []).filter(Boolean).length > 0 && (
            <div className="mb-1">Bank kata: {(soal.isi.bank_kata || []).filter(Boolean).map((w, i) => <span key={i} className="badge text-bg-light border fw-normal me-1">{w}</span>)}</div>
          )}
          <ol className="mb-0">
            {(k.jawaban || []).map((j, i) => (
              <li key={i}>____________ {kunci && <span className="text-success-emphasis">({Array.isArray(j) ? j.join(" / ") : j})</span>}</li>
            ))}
          </ol>
        </div>
      )}

      {kunci && soal.pembahasan && <div className="small text-body-secondary mt-2"><i className="bi bi-lightbulb me-1"></i>{soal.pembahasan}</div>}
    </div>
  );
}
