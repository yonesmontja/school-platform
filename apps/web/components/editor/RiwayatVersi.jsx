"use client";
// Riwayat versi (seperti log git) untuk objek apa pun yang disimpan lewat App\Services\VersiCatatan:
// tiap versi menampilkan nomor, waktu, penulis, keterangan perubahan, dan perbedaan kata dengan versi sebelumnya.
import { Fragment, useState } from "react";

export const waktuVersi = (s) => (s ? new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

/** Perbedaan per kata (LCS). @returns [{ t: 'sama'|'tambah'|'hapus', s }] */
export function bedaKata(lama, baru) {
  const a = String(lama ?? "").split(/(\s+)/).filter(Boolean);
  const b = String(baru ?? "").split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 4_000_000) return [{ t: "hapus", s: lama }, { t: "tambah", s: baru }];
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hasil = [];
  const dorong = (t, s) => { const akhir = hasil[hasil.length - 1]; if (akhir?.t === t) akhir.s += s; else hasil.push({ t, s }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { dorong("sama", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) dorong("hapus", a[i++]);
    else dorong("tambah", b[j++]);
  }
  while (i < n) dorong("hapus", a[i++]);
  while (j < m) dorong("tambah", b[j++]);
  return hasil;
}

export function TeksBeda({ lama, baru }) {
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {bedaKata(lama, baru).map((p, k) => p.t === "sama" ? <Fragment key={k}>{p.s}</Fragment>
        : p.t === "tambah" ? <ins key={k} className="beda-tambah">{p.s}</ins> : <del key={k} className="beda-hapus">{p.s}</del>)}
    </span>
  );
}

/**
 * props: versi [{versi, isi, keterangan, oleh, waktu}] (terbaru dulu), bidang [{ label, teks: (isi) => string }], kosong?
 */
export default function RiwayatVersi({ versi = [], bidang, kosong = "Belum ada riwayat versi." }) {
  const [buka, setBuka] = useState(() => new Set());
  if (!versi.length) return <div className="text-muted small">{kosong}</div>;
  const alih = (v) => setBuka((s) => { const x = new Set(s); x.has(v) ? x.delete(v) : x.add(v); return x; });
  return (
    <ol className="riwayat-versi small">
      {versi.map((v, i) => {
        const sebelum = versi[i + 1];
        const berubah = bidang.filter((b) => !sebelum || b.teks(sebelum.isi || {}) !== b.teks(v.isi || {}));
        return (
          <li key={v.versi}>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className={`badge ${i === 0 ? "text-bg-success" : "text-bg-light border"} font-monospace`}>v{v.versi}</span>
              <span className="fw-semibold">{v.keterangan || (sebelum ? "Diperbarui" : "Versi awal")}</span>
              {i === 0 && <span className="badge text-bg-light border fw-normal">terbaru</span>}
            </div>
            <div className="text-muted">{waktuVersi(v.waktu)} · oleh {v.oleh || "—"}{sebelum && berubah.length > 0 && ` · berubah: ${berubah.map((b) => b.label.toLowerCase()).join(", ")}`}</div>
            <button type="button" className="btn btn-link btn-sm p-0" onClick={() => alih(v.versi)} aria-expanded={buka.has(v.versi)}>
              {buka.has(v.versi) ? "Sembunyikan" : sebelum ? `Lihat perubahan v${sebelum.versi} → v${v.versi}` : "Lihat isi versi ini"}
            </button>
            {buka.has(v.versi) && (
              <div className="border rounded-3 p-2 mt-1 bg-body-tertiary">
                {(sebelum ? berubah : bidang).map((b) => (
                  <div key={b.label} className="mb-1">
                    <div className="fw-semibold">{b.label}</div>
                    {sebelum ? <TeksBeda lama={b.teks(sebelum.isi || {})} baru={b.teks(v.isi || {})} /> : <span style={{ whiteSpace: "pre-wrap" }}>{b.teks(v.isi || {}) || "–"}</span>}
                  </div>
                ))}
                {sebelum && !berubah.length && <div className="text-muted">Tidak ada perubahan isi.</div>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
