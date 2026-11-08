"use client";
import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { BENTUK, DIMENSI, HURUF, KESULITAN, LEVEL, STATUS } from "./konstanta";
import PratinjauSoal, { srcGambar, srcSvg } from "./PratinjauSoal";
import { bacaBerkas, minta } from "./api";
import ModalGambarAI from "./ModalGambarAI";

// Isi & kunci awal per bentuk (aturan sama dengan BankSoalService::normalisasi)
const isiAwal = (bentuk) => ({
  PG: [{ pilihan: ["", "", "", ""] }, { jawaban: 0 }],
  PG_KOMPLEKS: [{ pilihan: ["", "", "", ""] }, { jawaban: [] }],
  BENAR_SALAH: [{ pernyataan: ["", "", ""] }, { jawaban: [true, false, true] }],
  ISIAN: [{}, { jawaban: [""] }],
  URAIAN: [{}, { jawaban: "" }],
  MENJODOHKAN: [{ pasangan: [{ kiri: "", kanan: "" }, { kiri: "", kanan: "" }, { kiri: "", kanan: "" }] }, {}],
  MENGURUTKAN: [{ urutan: ["", "", ""] }, {}],
  LENGKAPI_GAMBAR: [{ bank_kata: [] }, { jawaban: ["", ""] }],
  MEMBACA_NYARING: [{ teks: "" }, {}],
}[bentuk]);

// Melengkapi gambar: jawaban per bagian disunting sebagai teks "a / b"
const teksBagian = (j) => (Array.isArray(j) ? j.join(" / ") : j || "");

const dariSoal = (s, bawaan) => {
  const bentuk = s?.bentuk || bawaan?.bentuk || "PG";
  let [isi, kunci] = s ? [s.isi || {}, s.kunci || {}] : isiAwal(bentuk);
  if (bentuk === "LENGKAPI_GAMBAR") kunci = { jawaban: (kunci.jawaban || []).map(teksBagian) };
  return {
    id_mapel: s?.id_mapel || bawaan?.id_mapel || "", id_kelas: s?.id_kelas || bawaan?.id_kelas || "",
    id_materi: s?.id_materi || bawaan?.id_materi || "", id_indikator: s?.id_indikator || bawaan?.id_indikator || "",
    id_kisi_baris: s?.id_kisi_baris || bawaan?.id_kisi_baris || null,
    bentuk, level_kognitif: s?.level_kognitif || bawaan?.level_kognitif || "C2", tingkat_kesulitan: s?.tingkat_kesulitan || bawaan?.tingkat_kesulitan || "SEDANG",
    ...Object.fromEntries(DIMENSI.map((d) => [`dim_${d.key}`, s ? Number(s[`dim_${d.key}`]) : 0])),
    pertanyaan: s?.pertanyaan || "", gambar_svg: s?.gambar_svg || null, gambar_url: s?.gambar_url || null,
    isi, kunci, rubrik: s?.rubrik || "", pembahasan: s?.pembahasan || "", skor_maks: s?.skor_maks || "",
  };
};

/** Formulir soal baru atau ubah soal, lengkap dengan pratinjau. */
export default function EditorSoal({ soal, referensi, bawaan, onTutup, onTersimpan }) {
  // Guru dengan satu mapel langsung mendapati mapelnya terpilih
  const [f, setF] = useState(() => dariSoal(soal, { id_mapel: referensi.mapel.length === 1 ? referensi.mapel[0].id_mapel : "", ...bawaan }));
  const [proses, setProses] = useState(false);
  const [gambarAi, setGambarAi] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setIsi = (k, v) => setF((x) => ({ ...x, isi: { ...x.isi, [k]: v } }));
  const setKunci = (v) => setF((x) => ({ ...x, kunci: { ...x.kunci, jawaban: v } }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !gambarAi) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, gambarAi]);

  const materiMapel = useMemo(() => (referensi.materi || []).filter((m) => m.id_mapel === f.id_mapel && (!f.id_kelas || !m.id_kelas || m.id_kelas === f.id_kelas)), [referensi, f.id_mapel, f.id_kelas]);
  const tpMateri = materiMapel.find((m) => m.id_materi === f.id_materi)?.indikator || [];

  const gantiBentuk = (b) => {
    const [isi, kunci] = isiAwal(b);
    setF((x) => ({ ...x, bentuk: b, isi, kunci }));
  };
  // Bobot STNKM awal mengikuti materi yang dipilih
  const gantiMateri = (id) => {
    const m = materiMapel.find((x) => x.id_materi === id);
    setF((x) => ({ ...x, id_materi: id, id_indikator: "", ...(m && DIMENSI.every((d) => !x[`dim_${d.key}`]) ? Object.fromEntries(DIMENSI.map((d) => [`dim_${d.key}`, Number(m[`mat_${d.key}`]) || 0])) : {}) }));
  };

  const unggahGambar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return Swal.fire("Gambar terlalu besar", "Maksimal 2MB.", "warning");
    try {
      const data = await minta("POST", "/bank-soal/gambar", { gambar_base64: await bacaBerkas(file) });
      setF((x) => ({ ...x, gambar_url: data.url, gambar_svg: null }));
    } catch (err) { Swal.fire("Gagal mengunggah", err.message, "error"); }
  };

  const simpan = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const body = { ...f, id_kelas: f.id_kelas || null, id_materi: f.id_materi || null, id_indikator: f.id_indikator || null, skor_maks: f.skor_maks || null };
      const data = soal ? await minta("PUT", `/bank-soal/${soal.id_soal}`, body) : await minta("POST", "/bank-soal", body);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2500 });
      onTersimpan(data.data);
    } catch (err) { Swal.fire("Belum bisa disimpan", err.message, "warning"); }
    finally { setProses(false); }
  };

  const daftar = (k, label, placeholder) => (
    <div className="mb-2">
      <label className="form-label small fw-semibold mb-1">{label}</label>
      {(f.isi[k] || []).map((v, i) => (
        <div key={i} className="input-group input-group-sm mb-1">
          <span className="input-group-text">{k === "pilihan" ? HURUF[i] : i + 1}</span>
          <input className="form-control" value={v} placeholder={placeholder} aria-label={`${label} ${i + 1}`}
            onChange={(e) => setIsi(k, f.isi[k].map((x, j) => (j === i ? e.target.value : x)))} />
          {f.bentuk === "PG" && k === "pilihan" && (
            <span className="input-group-text"><input type="radio" className="form-check-input m-0" name="kunciPg" aria-label={`Kunci ${HURUF[i]}`}
              checked={f.kunci.jawaban === i} onChange={() => setKunci(i)} /></span>
          )}
          {f.bentuk === "PG_KOMPLEKS" && k === "pilihan" && (
            <span className="input-group-text"><input type="checkbox" className="form-check-input m-0" aria-label={`Kunci ${HURUF[i]}`}
              checked={(f.kunci.jawaban || []).includes(i)}
              onChange={(e) => setKunci(e.target.checked ? [...(f.kunci.jawaban || []), i] : (f.kunci.jawaban || []).filter((x) => x !== i))} /></span>
          )}
          {f.bentuk === "BENAR_SALAH" && (
            <select className="form-select" style={{ maxWidth: 110 }} aria-label={`Kunci pernyataan ${i + 1}`} value={f.kunci.jawaban?.[i] ? "B" : "S"}
              onChange={(e) => setKunci((f.kunci.jawaban || []).map((x, j) => (j === i ? e.target.value === "B" : x)))}>
              <option value="B">Benar</option><option value="S">Salah</option>
            </select>
          )}
          <button type="button" className="btn btn-outline-secondary" aria-label="Hapus baris" disabled={(f.isi[k] || []).length <= 2}
            onClick={() => {
              setIsi(k, f.isi[k].filter((_, j) => j !== i));
              if (f.bentuk === "BENAR_SALAH") setKunci(f.kunci.jawaban.filter((_, j) => j !== i));
              if (f.bentuk === "PG") setKunci(f.kunci.jawaban === i ? 0 : f.kunci.jawaban > i ? f.kunci.jawaban - 1 : f.kunci.jawaban);
              if (f.bentuk === "PG_KOMPLEKS") setKunci((f.kunci.jawaban || []).filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
            }}><i className="bi bi-x"></i></button>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-link px-0" onClick={() => {
        setIsi(k, [...(f.isi[k] || []), ""]);
        if (f.bentuk === "BENAR_SALAH") setKunci([...(f.kunci.jawaban || []), true]);
      }}><i className="bi bi-plus-lg me-1"></i>Tambah</button>
      {f.bentuk === "PG" && k === "pilihan" && <div className="small text-muted">Tandai bulatan pada pilihan yang benar.</div>}
      {f.bentuk === "PG_KOMPLEKS" && k === "pilihan" && <div className="small text-muted">Centang semua pilihan yang benar (minimal 2).</div>}
    </div>
  );

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={soal ? "Ubah soal" : "Soal baru"}>
        <div className="modal-dialog modal-dialog-scrollable modal-xl">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-patch-question text-primary me-2"></i>{soal ? "Ubah Soal" : "Soal Baru"}</h5>
              {soal && <span className={`badge text-bg-${STATUS[soal.status].warna} ms-2`}>{STATUS[soal.status].label} · versi {soal.versi}</span>}
              <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              {soal?.status === "REVISI" && soal.catatan_revisi && (
                <div className="alert alert-danger py-2 small"><i className="bi bi-chat-left-quote me-1"></i><b>Catatan kepala sekolah:</b> {soal.catatan_revisi}</div>
              )}
              {soal?.status === "DISETUJUI" && !referensi.boleh_setujui && (
                <div className="alert alert-warning py-2 small"><i className="bi bi-info-circle me-1"></i>Soal ini sudah disetujui. Bila diubah, soal kembali menjadi draf dan perlu diajukan lagi.</div>
              )}
              <div className="row g-3">
                <div className="col-lg-7">
                  <div className="row g-2 mb-2">
                    <div className="col-sm-6">
                      <label className="form-label small fw-semibold mb-1">Mata pelajaran</label>
                      <select className="form-select form-select-sm" required value={f.id_mapel} onChange={(e) => setF((x) => ({ ...x, id_mapel: e.target.value, id_materi: "", id_indikator: "" }))}>
                        <option value="">— Pilih —</option>
                        {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label small fw-semibold mb-1">Kelas <span className="text-muted fw-normal">(opsional)</span></label>
                      <select className="form-select form-select-sm" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                        <option value="">Semua kelas</option>
                        {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label small fw-semibold mb-1">Materi</label>
                      <select className="form-select form-select-sm" value={f.id_materi} onChange={(e) => gantiMateri(e.target.value)} disabled={!f.id_mapel}>
                        <option value="">— Pilih materi —</option>
                        {materiMapel.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label small fw-semibold mb-1">Tujuan pembelajaran (TP)</label>
                      <select className="form-select form-select-sm" value={f.id_indikator} onChange={(e) => set("id_indikator", e.target.value)} disabled={!tpMateri.length}>
                        <option value="">{tpMateri.length ? "— Pilih TP —" : "Materi belum punya TP"}</option>
                        {tpMateri.map((t) => <option key={t.id_indikator} value={t.id_indikator}>{t.deskripsi}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label small fw-semibold mb-1">Bentuk soal</label>
                      <select className="form-select form-select-sm" value={f.bentuk} onChange={(e) => gantiBentuk(e.target.value)} aria-label="Bentuk soal">
                        {BENTUK.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label small fw-semibold mb-1">Level kognitif</label>
                      <select className="form-select form-select-sm" value={f.level_kognitif} onChange={(e) => set("level_kognitif", e.target.value)}>
                        {LEVEL.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </div>
                    <div className="col-sm-4">
                      <label className="form-label small fw-semibold mb-1">Tingkat kesulitan</label>
                      <select className="form-select form-select-sm" value={f.tingkat_kesulitan} onChange={(e) => set("tingkat_kesulitan", e.target.value)}>
                        {KESULITAN.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <label className="form-label small fw-semibold mb-1">Pertanyaan</label>
                  <textarea className="form-control mb-2" rows={3} required maxLength={5000} value={f.pertanyaan} onChange={(e) => set("pertanyaan", e.target.value)} aria-label="Pertanyaan" />

                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    <label className="btn btn-sm btn-outline-primary mb-0"><i className="bi bi-image me-1"></i>{f.gambar_url || f.gambar_svg ? "Ganti gambar" : "Tambah gambar"}
                      <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={unggahGambar} /></label>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setGambarAi(true)} disabled={!f.pertanyaan.trim()}
                      title={f.pertanyaan.trim() ? "Buat ilustrasi atau diagram dengan AI" : "Tulis pertanyaannya dulu"}><i className="bi bi-stars me-1"></i>Gambar AI</button>
                    {(f.gambar_url || f.gambar_svg) && (
                      <>
                        <img src={f.gambar_svg ? srcSvg(f.gambar_svg) : srcGambar(f.gambar_url)} alt="Gambar soal" className="border rounded bg-white" style={{ height: 48 }} />
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setF((x) => ({ ...x, gambar_url: null, gambar_svg: null }))}><i className="bi bi-trash"></i></button>
                        {f.gambar_svg && <span className="small text-muted">Diagram dari AI</span>}
                        {f.gambar_url?.includes("/soal_ai_") && <span className="small text-muted">Ilustrasi dari AI</span>}
                      </>
                    )}
                  </div>

                  {(f.bentuk === "PG" || f.bentuk === "PG_KOMPLEKS") && daftar("pilihan", "Pilihan jawaban", "Teks pilihan")}
                  {f.bentuk === "BENAR_SALAH" && daftar("pernyataan", "Pernyataan", "Pernyataan")}
                  {f.bentuk === "MENGURUTKAN" && daftar("urutan", "Langkah dalam urutan yang benar", "Langkah")}
                  {f.bentuk === "ISIAN" && (
                    <div className="mb-2">
                      <label className="form-label small fw-semibold mb-1">Jawaban yang diterima</label>
                      <input className="form-control form-control-sm" value={(f.kunci.jawaban || []).join(" | ")} aria-label="Jawaban yang diterima"
                        onChange={(e) => setKunci(e.target.value.split("|").map((x) => x.trimStart()))} placeholder="mis. 1/2 | setengah" />
                      <div className="small text-muted">Pisahkan beberapa jawaban yang benar dengan tanda |</div>
                    </div>
                  )}
                  {f.bentuk === "URAIAN" && (
                    <>
                      <label className="form-label small fw-semibold mb-1">Contoh jawaban</label>
                      <textarea className="form-control form-control-sm mb-2" rows={2} value={f.kunci.jawaban || ""} onChange={(e) => setKunci(e.target.value)} />
                      <label className="form-label small fw-semibold mb-1">Rubrik penilaian</label>
                      <textarea className="form-control form-control-sm mb-2" rows={3} value={f.rubrik} onChange={(e) => set("rubrik", e.target.value)}
                        placeholder={"4 = ...\n3 = ...\n2 = ...\n1 = ..."} />
                    </>
                  )}
                  {f.bentuk === "MEMBACA_NYARING" && (
                    <>
                      <label className="form-label small fw-semibold mb-1" htmlFor="teksBacaan">Teks bacaan</label>
                      <textarea id="teksBacaan" className="form-control mb-1" rows={5} maxLength={3000} value={f.isi.teks || ""} onChange={(e) => setIsi("teks", e.target.value)}
                        placeholder="Teks yang dibaca nyaring oleh siswa" />
                      <div className="small text-muted mb-2">Tes online: siswa merekam suaranya di HP dan guru mendengarkan rekamannya saat mengoreksi. Di kelas: guru menilai langsung.</div>
                      <label className="form-label small fw-semibold mb-1">Rubrik penilaian</label>
                      <textarea className="form-control form-control-sm mb-2" rows={3} value={f.rubrik} onChange={(e) => set("rubrik", e.target.value)}
                        placeholder={"4 = lancar, lafal tepat, intonasi dan jeda sesuai tanda baca\n3 = ...\n2 = ...\n1 = ..."} />
                    </>
                  )}
                  {f.bentuk === "LENGKAPI_GAMBAR" && (
                    <div className="mb-2">
                      <div className="alert alert-light border small py-2 mb-2">
                        <i className="bi bi-info-circle me-1"></i>Pasang gambar dengan nomor 1, 2, 3, … pada bagian yang harus dilengkapi siswa (unggah gambar, atau minta AI membuat diagramnya).
                      </div>
                      {!(f.gambar_url || f.gambar_svg) && <div className="small text-danger mb-2"><i className="bi bi-exclamation-triangle me-1"></i>Soal ini memerlukan gambar.</div>}
                      <label className="form-label small fw-semibold mb-1">Jawaban tiap bagian</label>
                      {(f.kunci.jawaban || []).map((v, i) => (
                        <div key={i} className="input-group input-group-sm mb-1">
                          <span className="input-group-text">Bagian {i + 1}</span>
                          <input className="form-control" value={v} placeholder="mis. kelopak / mahkota bunga" aria-label={`Jawaban bagian ${i + 1}`}
                            onChange={(e) => setKunci(f.kunci.jawaban.map((x, j) => (j === i ? e.target.value : x)))} />
                          <button type="button" className="btn btn-outline-secondary" aria-label="Hapus bagian" disabled={f.kunci.jawaban.length <= 1}
                            onClick={() => setKunci(f.kunci.jawaban.filter((_, j) => j !== i))}><i className="bi bi-x"></i></button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-sm btn-link px-0" disabled={(f.kunci.jawaban || []).length >= 10}
                        onClick={() => setKunci([...(f.kunci.jawaban || []), ""])}><i className="bi bi-plus-lg me-1"></i>Tambah bagian</button>
                      <div className="small text-muted mb-2">Pisahkan beberapa jawaban yang benar dengan tanda /</div>
                      <label className="form-label small fw-semibold mb-1">Bank kata <span className="text-muted fw-normal">(opsional; siswa memilih dari daftar ini)</span></label>
                      <input className="form-control form-control-sm" value={(f.isi.bank_kata || []).join(", ")} aria-label="Bank kata"
                        onChange={(e) => setIsi("bank_kata", e.target.value.split(",").map((x) => x.trimStart()))} placeholder="mis. kelopak, putik, benang sari, akar" />
                      <div className="small text-muted">Pisahkan dengan koma. Masukkan semua jawaban benar dan beberapa pengecoh.</div>
                    </div>
                  )}
                  {f.bentuk === "MENJODOHKAN" && (
                    <div className="mb-2">
                      <label className="form-label small fw-semibold mb-1">Pasangan yang benar <span className="text-muted fw-normal">(diacak saat tes)</span></label>
                      {(f.isi.pasangan || []).map((p, i) => (
                        <div key={i} className="input-group input-group-sm mb-1">
                          <input className="form-control" value={p.kiri} placeholder="Kiri" aria-label={`Kiri ${i + 1}`}
                            onChange={(e) => setIsi("pasangan", f.isi.pasangan.map((x, j) => (j === i ? { ...x, kiri: e.target.value } : x)))} />
                          <span className="input-group-text"><i className="bi bi-arrow-left-right"></i></span>
                          <input className="form-control" value={p.kanan} placeholder="Kanan" aria-label={`Kanan ${i + 1}`}
                            onChange={(e) => setIsi("pasangan", f.isi.pasangan.map((x, j) => (j === i ? { ...x, kanan: e.target.value } : x)))} />
                          <button type="button" className="btn btn-outline-secondary" aria-label="Hapus pasangan" disabled={f.isi.pasangan.length <= 2}
                            onClick={() => setIsi("pasangan", f.isi.pasangan.filter((_, j) => j !== i))}><i className="bi bi-x"></i></button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-sm btn-link px-0" onClick={() => setIsi("pasangan", [...(f.isi.pasangan || []), { kiri: "", kanan: "" }])}>
                        <i className="bi bi-plus-lg me-1"></i>Tambah pasangan</button>
                    </div>
                  )}

                  <label className="form-label small fw-semibold mb-1">Pembahasan <span className="text-muted fw-normal">(opsional)</span></label>
                  <textarea className="form-control form-control-sm" rows={2} value={f.pembahasan} onChange={(e) => set("pembahasan", e.target.value)} />
                </div>

                <div className="col-lg-5">
                  <div className="border rounded p-2 mb-3">
                    <div className="small fw-semibold mb-1"><i className="bi bi-diagram-3 text-primary me-1"></i>Bobot dimensi STNKM <span className="text-muted fw-normal">(0–1)</span></div>
                    {DIMENSI.map((d) => (
                      <div key={d.key} className="d-flex align-items-center gap-2 small">
                        <span className={`badge text-bg-${d.warna}`} style={{ width: 22 }}>{d.key}</span>
                        <span className="flex-grow-1 text-truncate" title={d.label}>{d.label}</span>
                        <input type="range" className="form-range" style={{ width: 110 }} min={0} max={1} step={0.1} aria-label={`Bobot ${d.key}`}
                          value={f[`dim_${d.key}`]} onChange={(e) => set(`dim_${d.key}`, Number(e.target.value))} />
                        <span style={{ width: 28 }} className="text-end">{Number(f[`dim_${d.key}`]).toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="small fw-semibold mb-1"><i className="bi bi-eye me-1"></i>Pratinjau</div>
                  <div className="border rounded p-3 bg-body-tertiary">
                    {f.pertanyaan ? <PratinjauSoal soal={f} /> : <span className="text-muted small">Tulis pertanyaan untuk melihat pratinjau.</span>}
                  </div>
                </div>
              </div>
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
      {gambarAi && <ModalGambarAI soal={f} onTutup={() => setGambarAi(false)} onPakai={(g) => { setF((x) => ({ ...x, ...g })); setGambarAi(false); }} />}
    </>
  );
}
