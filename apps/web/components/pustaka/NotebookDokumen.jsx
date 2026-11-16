"use client";
// Notebook AI Pustaka Dokumen (Fase 23 Tahap A): panel riset per dokumen — ringkasan, ringkasan per bagian, poin penting,
// istilah, ekstrak data & tabel, FAQ, dan tanya-jawab yang selalu menunjuk bagian dokumen sumbernya.
import { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { AI_MODES, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { muatSekolah } from "@/app/lib/dokumenResmi";
import { unduhDocx, unduhPdf } from "@/app/lib/eksporBlok";
import JadikanSoal from "./JadikanSoal";

export const TAB_RISET = [
  { jenis: "RINGKAS", label: "Ringkasan", ikon: "bi-card-text", ajakan: "Ringkasan singkat isi dokumen dan poin utamanya." },
  { jenis: "RINCI", label: "Per bagian", ikon: "bi-list-nested", ajakan: "Ringkasan tiap bab/bagian sesuai urutan dokumen." },
  { jenis: "POIN", label: "Poin penting", ikon: "bi-pin-angle", ajakan: "Hal-hal penting dan siapa yang perlu memperhatikannya." },
  { jenis: "ISTILAH", label: "Istilah", ikon: "bi-book", ajakan: "Istilah dan singkatan beserta artinya menurut dokumen." },
  { jenis: "EKSTRAK", label: "Data & tabel", ikon: "bi-table", ajakan: "Angka, tanggal, nomor aturan, nama, dan tabel yang ada di dokumen." },
  { jenis: "FAQ", label: "Tanya-jawab umum", ikon: "bi-question-circle", ajakan: "Pertanyaan yang mungkin diajukan guru atau orang tua, dijawab dari dokumen." },
];
const UNTUK = { GURU: ["Guru", "primary"], KEPSEK: ["Kepala sekolah", "success"], SEKOLAH: ["Sekolah", "info"], UMUM: ["Umum", "secondary"] };
const JENIS_DATA = { ANGKA: "Angka", TANGGAL: "Tanggal", ATURAN: "Aturan", NAMA: "Nama", LAINNYA: "Lainnya" };
const waktu = (t) => (t ? new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const ribu = (n) => (n || 0).toLocaleString("id-ID");

/** Isi satu tab riset sebagai baris Markdown (dipakai tombol Salin dan unduhan .md). */
export function markdownRiset(jenis, h) {
  const baris = [];
  const sel = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  if (jenis === "RINGKAS") baris.push(h.ringkasan || "", "", ...(h.poin || []).map((p) => `- ${p}`));
  if (jenis === "RINCI") (h.bagian || []).forEach((b) => baris.push(`### ${b.judul || "Bagian"}`, "", b.isi, ""));
  if (jenis === "POIN") (h.poin || []).forEach((p) => baris.push(`- ${p.teks} (${UNTUK[p.untuk]?.[0] || "Umum"})`));
  if (jenis === "ISTILAH") (h.istilah || []).forEach((x) => baris.push(`- **${x.istilah}**: ${x.definisi}`));
  if (jenis === "EKSTRAK") {
    if (h.data?.length) baris.push("| Jenis | Nilai | Keterangan |", "| --- | --- | --- |", ...h.data.map((x) => `| ${JENIS_DATA[x.jenis] || x.jenis} | ${sel(x.nilai)} | ${sel(x.keterangan)} |`), "");
    (h.tabel || []).forEach((tb) => baris.push(`**${tb.judul || "Tabel"}**`, "", `| ${tb.kolom.map(sel).join(" | ")} |`, `| ${tb.kolom.map(() => "---").join(" | ")} |`,
      ...tb.baris.map((r) => `| ${tb.kolom.map((_, i) => sel(r[i])).join(" | ")} |`), ""));
  }
  if (jenis === "FAQ") (h.faq || []).forEach((x) => baris.push(`**${x.tanya}**`, "", x.jawab, ""));
  return baris;
}
const markdownTanya = (q) => [`**T:** ${q.pertanyaan}`, "", `**J:** ${q.hasil?.jawaban || ""}`, "",
  ...(q.rujukan || []).map((r) => `> [B${r.no}] ${String(r.teks).slice(0, 300).replace(/\n/g, " ")}…`), ""];

/** Hasil riset sebagai Markdown (untuk diunduh). */
export function keMarkdown(judul, riset, tanya = []) {
  const baris = [`# ${judul}`, "", `_Notebook AI SAPrapor · ${new Date().toLocaleDateString("id-ID")}_`, ""];
  for (const t of TAB_RISET) {
    const h = riset[t.jenis]?.hasil;
    if (h) baris.push(`## ${t.label}`, "", ...markdownRiset(t.jenis, h), "");
  }
  if (tanya.length) {
    baris.push("## Tanya dokumen", "");
    [...tanya].reverse().forEach((q) => baris.push(...markdownTanya(q)));
  }
  return baris.join("\n");
}

/** Hasil riset sebagai blok dokumen, untuk diekspor ke Word (.docx) dan PDF. */
export function blokRiset(judul, riset, tanya = []) {
  const blok = [{ t: "judul", teks: `Notebook AI: ${judul}`, sub: `Disusun dengan AI pada ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}; periksa kembali dengan dokumen aslinya.` }];
  for (const tb of TAB_RISET) {
    const h = riset[tb.jenis]?.hasil;
    if (!h) continue;
    blok.push({ t: "h", teks: tb.label });
    if (tb.jenis === "RINGKAS") blok.push({ t: "p", teks: h.ringkasan || "" }, ...(h.poin || []).map((p) => ({ t: "li", teks: p })));
    if (tb.jenis === "RINCI") (h.bagian || []).forEach((b, i) => blok.push({ t: "li", label: `${i + 1}.`, teks: b.judul || `Bagian ${i + 1}`, tebal: true }, { t: "p", teks: b.isi || "" }));
    if (tb.jenis === "POIN") (h.poin || []).forEach((p) => blok.push({ t: "li", teks: `${p.teks} (${UNTUK[p.untuk]?.[0] || "Umum"})` }));
    if (tb.jenis === "ISTILAH") blok.push({ t: "tabel", kolom: ["Istilah", "Definisi"], baris: (h.istilah || []).map((x) => [x.istilah, x.definisi]) });
    if (tb.jenis === "EKSTRAK") {
      if (h.data?.length) blok.push({ t: "tabel", kolom: ["Jenis", "Nilai", "Keterangan"], baris: h.data.map((x) => [JENIS_DATA[x.jenis] || x.jenis, x.nilai, x.keterangan]) });
      (h.tabel || []).forEach((x) => blok.push({ t: "p", teks: x.judul || "Tabel", tebal: true }, { t: "tabel", kolom: x.kolom || [], baris: x.baris || [] }));
    }
    if (tb.jenis === "FAQ") (h.faq || []).forEach((x) => blok.push({ t: "p", teks: x.tanya, tebal: true }, { t: "p", teks: x.jawab }));
  }
  if (tanya.length) {
    blok.push({ t: "h", teks: "Tanya dokumen" });
    [...tanya].reverse().forEach((q) => {
      blok.push({ t: "p", teks: `T: ${q.pertanyaan}`, tebal: true }, { t: "p", teks: `J: ${q.hasil?.jawaban || ""}` });
      if (q.rujukan?.length) blok.push({ t: "p", kecil: true, teks: q.rujukan.map((r) => `[B${r.no}] ${String(r.teks).slice(0, 300).replace(/\s+/g, " ")}…`).join("\n") });
    });
  }
  return blok;
}

/** Salin teks ke papan klip (dengan cadangan untuk browser lama / HTTP). */
async function salin(teks) {
  try { await navigator.clipboard.writeText(teks); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: teks });
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Disalin", showConfirmButton: false, timer: 1200 });
}

function HasilRiset({ jenis, h }) {
  if (jenis === "RINGKAS") return (
    <div><p style={{ whiteSpace: "pre-wrap" }}>{h.ringkasan}</p>
      {!!h.poin?.length && <ul className="mb-0">{h.poin.map((p, i) => <li key={i}>{p}</li>)}</ul>}</div>);
  if (jenis === "RINCI") return (
    <ol className="ps-3 mb-0">{(h.bagian || []).map((b, i) => <li key={i} className="mb-2"><div className="fw-semibold">{b.judul || `Bagian ${i + 1}`}</div><div>{b.isi}</div></li>)}</ol>);
  if (jenis === "POIN") return (
    <ul className="list-unstyled mb-0">{(h.poin || []).map((p, i) => (
      <li key={i} className="d-flex gap-2 align-items-start mb-2"><span className={`badge text-bg-${UNTUK[p.untuk]?.[1] || "secondary"} flex-shrink-0 mt-1`}>{UNTUK[p.untuk]?.[0] || "Umum"}</span><span>{p.teks}</span></li>))}</ul>);
  if (jenis === "ISTILAH") return (
    <dl className="row mb-0">{(h.istilah || []).map((x, i) => <div key={i} className="col-12 d-flex gap-2 border-bottom py-1"><dt className="flex-shrink-0" style={{ minWidth: 140 }}>{x.istilah}</dt><dd className="mb-0">{x.definisi}</dd></div>)}</dl>);
  if (jenis === "EKSTRAK") return (
    <div>
      {!!h.data?.length && <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Jenis</th><th>Nilai</th><th>Keterangan</th></tr></thead>
        <tbody>{h.data.map((x, i) => <tr key={i}><td><span className="badge text-bg-light border">{JENIS_DATA[x.jenis] || x.jenis}</span></td><td className="fw-semibold">{x.nilai}</td><td>{x.keterangan}</td></tr>)}</tbody></table></div>}
      {(h.tabel || []).map((tb, i) => (
        <div key={i} className="mb-3"><div className="fw-semibold small mb-1">{tb.judul || `Tabel ${i + 1}`}</div>
          <div className="table-responsive"><table className="table table-sm table-bordered small"><thead><tr>{tb.kolom.map((k, j) => <th key={j}>{k}</th>)}</tr></thead>
            <tbody>{tb.baris.map((r, j) => <tr key={j}>{tb.kolom.map((_, c) => <td key={c}>{r[c]}</td>)}</tr>)}</tbody></table></div></div>))}
      {!h.data?.length && !h.tabel?.length && <div className="text-body-secondary">Tidak ada data yang ditemukan.</div>}
    </div>);
  if (jenis === "FAQ") return (
    <div className="d-flex flex-column gap-2">{(h.faq || []).map((x, i) => (
      <details key={i} className="border rounded p-2"><summary className="fw-semibold">{x.tanya}</summary><div className="mt-1">{x.jawab}</div></details>))}</div>);
  return null;
}

function JawabanTanya({ q, bolehHapus, onHapus, onSoal }) {
  return (
    <div className="border rounded p-2 mb-2" data-tanya>
      <div className="d-flex justify-content-between gap-2"><div className="fw-semibold"><i className="bi bi-person-circle me-1 text-body-secondary"></i>{q.pertanyaan}</div>
        {bolehHapus && <button className="btn btn-sm btn-link text-danger p-0" onClick={onHapus} aria-label="Hapus pertanyaan"><i className="bi bi-x-lg"></i></button>}</div>
      <div className="mt-1" style={{ whiteSpace: "pre-wrap" }}><i className="bi bi-stars text-primary me-1"></i>{q.hasil?.jawaban}</div>
      {q.hasil?.cukup === false && <div className="small text-warning-emphasis mt-1"><i className="bi bi-info-circle me-1"></i>Dokumen tampaknya tidak membahas ini secara lengkap.</div>}
      {!!q.rujukan?.length && <div className="mt-2 d-flex flex-column gap-1">{q.rujukan.map((r) => (
        <details key={r.no} className="small"><summary className="text-primary">Bagian B{r.no} yang dirujuk</summary>
          <pre className="border rounded p-2 bg-body-tertiary mb-0 mt-1 small" style={{ whiteSpace: "pre-wrap", overflow: "visible" }}>{r.teks}</pre></details>))}</div>}
      <div className="d-flex flex-wrap align-items-center gap-2 mt-1 small text-body-secondary">
        <span>{q.pembuat?.name} · {waktu(q.created_at)}</span>
        <span className="ms-auto d-flex gap-2">
          <button className="btn btn-sm btn-link p-0 text-decoration-none" onClick={() => salin(markdownTanya(q).join("\n"))}><i className="bi bi-clipboard me-1"></i>Salin</button>
          <button className="btn btn-sm btn-link p-0 text-decoration-none" onClick={onSoal}><i className="bi bi-patch-question me-1"></i>Jadikan soal</button>
        </span>
      </div>
    </div>
  );
}

/** Modal Notebook AI untuk satu dokumen. */
export default function NotebookDokumen({ d, saya, pengelola, onTutup }) {
  const [panel, setPanel] = useState(null);
  const [tab, setTab] = useState("RINGKAS");
  const [mode, setMode] = useState(bacaAiMode);
  const [proses, setProses] = useState("");
  const [pertanyaan, setPertanyaan] = useState("");
  const [soal, setSoal] = useState(null); // hasil riset/tanya yang akan dijadikan soal

  const muat = useCallback(() => minta("GET", `/dokumen-rujukan/${d.id_dokumen}/riset`).then((r) => setPanel(r.data)).catch((e) => Swal.fire("Gagal memuat", e.message, "error")), [d.id_dokumen]);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { const esc = (e) => e.key === "Escape" && !proses && onTutup(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onTutup, proses]);

  const terbaca = d.status_teks === "TERBACA";
  const buat = async (jenis) => {
    simpanAiMode(mode); setProses(jenis);
    try {
      const r = await minta("POST", `/dokumen-rujukan/${d.id_dokumen}/riset`, { jenis, ai_mode: mode });
      setPanel((p) => ({ ...p, riset: { ...(p?.riset || {}), [jenis]: r.data } }));
      if (r.message?.includes("sangat panjang")) Swal.fire({ toast: true, position: "top-end", icon: "info", title: r.message, showConfirmButton: false, timer: 6000 });
    } catch (e) { Swal.fire("AI belum berhasil", e.message, "warning"); }
    finally { setProses(""); }
  };
  const tanya = async (e) => {
    e.preventDefault();
    if (pertanyaan.trim().length < 5) return;
    simpanAiMode(mode); setProses("TANYA");
    try { const r = await minta("POST", `/dokumen-rujukan/${d.id_dokumen}/tanya`, { pertanyaan: pertanyaan.trim(), ai_mode: mode }); setPanel((p) => ({ ...p, tanya: [r.data, ...(p?.tanya || [])] })); setPertanyaan(""); }
    catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(""); }
  };
  const hapusTanya = async (q) => {
    try { await minta("DELETE", `/dokumen-rujukan/${d.id_dokumen}/riset/${q.id}`); setPanel((p) => ({ ...p, tanya: p.tanya.filter((x) => x.id !== q.id) })); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const unduh = () => {
    const blob = new Blob([keMarkdown(d.judul, panel?.riset || {}, panel?.tanya || [])], { type: "text/markdown;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `Notebook - ${d.judul}.md`.replace(/[\\/:*?"<>|]/g, "-") });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const ekspor = async (jenis) => {
    try {
      const sek = await muatSekolah(null);
      const blok = blokRiset(d.judul, panel?.riset || {}, panel?.tanya || []);
      (jenis === "pdf" ? unduhPdf : unduhDocx)(`Notebook - ${d.judul}`, blok, sek);
    } catch (e) { Swal.fire("Gagal mengekspor", e.message, "error"); }
  };

  const aktif = TAB_RISET.find((t) => t.jenis === tab);
  const hasil = panel?.riset?.[tab];
  const adaHasil = panel && (Object.keys(panel.riset || {}).length > 0 || panel.tanya?.length > 0);
  const cakupan = panel?.cakupan;
  const usang = hasil && cakupan && hasil.versi_dokumen < cakupan.versi;

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judulNotebook">
        <div className="modal-dialog modal-xl modal-fullscreen-lg-down modal-dialog-scrollable">
          <div className="modal-content" id="notebook-ai">
            <div className="modal-header">
              <div className="min-w-0"><h5 className="modal-title fw-bold text-truncate" id="judulNotebook"><i className="bi bi-journal-richtext text-primary me-2"></i>Notebook AI</h5>
                <div className="small text-body-secondary text-truncate">{d.judul}</div></div>
              <button type="button" className="btn-close" onClick={onTutup} disabled={!!proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <select className="form-select form-select-sm w-auto" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Penyedia AI">{AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
                {cakupan && <span className="small text-body-secondary">{cakupan.lengkap ? `AI membaca seluruh dokumen (${ribu(cakupan.dibaca)} karakter${cakupan.segmen > 1 ? `, ${cakupan.segmen} bagian besar` : ""}).`
                  : `Dokumen sangat panjang: riset membaca ${ribu(cakupan.dibaca)} dari ${ribu(cakupan.total)} karakter pertama. Tanya dokumen tetap mencari di seluruh isi.`}</span>}
                <div className="ms-auto d-flex gap-1">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => ekspor("docx")} disabled={!adaHasil}><i className="bi bi-file-earmark-word me-1"></i>Word (.docx)</button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => ekspor("pdf")} disabled={!adaHasil}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={unduh} disabled={!adaHasil}><i className="bi bi-download me-1"></i>Unduh (.md)</button>
                </div>
              </div>
              {!terbaca && <div className="alert alert-warning small">Teks dokumen belum terbaca, jadi belum bisa diteliti AI.</div>}

              <div className="row g-3">
                <div className="col-lg-7">
                  <ul className="nav nav-pills flex-wrap gap-1 mb-2" role="tablist">
                    {TAB_RISET.map((t) => (
                      <li key={t.jenis} className="nav-item"><button type="button" role="tab" aria-selected={tab === t.jenis} className={`nav-link py-1 px-2 small ${tab === t.jenis ? "active" : ""}`} onClick={() => setTab(t.jenis)}>
                        <i className={`bi ${t.ikon} me-1`}></i>{t.label}{panel?.riset?.[t.jenis] && <i className="bi bi-check2 ms-1" aria-label="sudah ada"></i>}</button></li>))}
                  </ul>
                  <div className="border rounded p-3" role="tabpanel" data-riset={tab}>
                    {!panel ? <div className="text-center py-4"><span className="spinner-border spinner-border-sm"></span></div> : hasil ? (
                      <>
                        <HasilRiset jenis={tab} h={hasil.hasil} />
                        <div className="d-flex flex-wrap align-items-center gap-2 border-top mt-3 pt-2 small text-body-secondary">
                          <span>{hasil.pembuat?.name} · {waktu(hasil.created_at)} · {hasil.ai_mode}</span>
                          {usang && <span className="badge text-bg-warning">Dibuat dari versi dokumen lama</span>}
                          <span className="ms-auto d-flex flex-wrap gap-1">
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => salin(markdownRiset(tab, hasil.hasil).join("\n"))}><i className="bi bi-clipboard me-1"></i>Salin</button>
                          <button className="btn btn-sm btn-outline-success" onClick={() => setSoal(hasil)} disabled={!!proses}><i className="bi bi-patch-question me-1"></i>Jadikan soal</button>
                          {terbaca && <button className="btn btn-sm btn-outline-primary" onClick={() => buat(tab)} disabled={!!proses}>
                            {proses === tab ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-arrow-repeat me-1"></i>}Buat ulang</button>}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-body-secondary mb-2">{aktif.ajakan}</p>
                        <button className="btn btn-primary btn-sm" onClick={() => buat(tab)} disabled={!terbaca || !!proses}>
                          {proses === tab ? <><span className="spinner-border spinner-border-sm me-1"></span>AI sedang membaca dokumen…</> : <><i className="bi bi-stars me-1"></i>Buat {aktif.label.toLowerCase()} dengan AI</>}</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-lg-5">
                  <h6 className="fw-bold"><i className="bi bi-chat-square-text me-1 text-primary"></i>Tanya dokumen</h6>
                  <form onSubmit={tanya} className="mb-2">
                    <textarea className="form-control form-control-sm mb-2" rows={2} maxLength={500} value={pertanyaan} onChange={(e) => setPertanyaan(e.target.value)}
                      placeholder="mis. Kapan remedial harus diberikan?" aria-label="Pertanyaan untuk dokumen" disabled={!terbaca}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }} />
                    <button className="btn btn-sm btn-primary" disabled={!terbaca || !!proses || pertanyaan.trim().length < 5}>
                      {proses === "TANYA" ? <><span className="spinner-border spinner-border-sm me-1"></span>Mencari jawaban…</> : <><i className="bi bi-send me-1"></i>Tanya</>}</button>
                    <div className="form-text">Jawaban hanya dari isi dokumen ini, dengan nomor bagian yang dirujuk.</div>
                  </form>
                  <div>
                    {panel?.tanya?.map((q) => <JawabanTanya key={q.id} q={q} bolehHapus={pengelola || q.dibuat_oleh === saya?.id} onHapus={() => hapusTanya(q)} onSoal={() => setSoal(q)} />)}
                    {panel && !panel.tanya?.length && <div className="small text-body-secondary">Belum ada pertanyaan.</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
      {soal && <JadikanSoal riset={soal} dokumen={d} onTutup={() => setSoal(null)} />}
    </>
  );
}
