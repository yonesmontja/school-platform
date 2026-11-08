"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, HURUF, bacaAiMode, labelBentuk, simpanAiMode } from "./konstanta";
import { OTOMATIS, dariTeks, keTeks, ringkas, skorButir } from "./skor";
import { srcGambar } from "./PratinjauSoal";

const rekaman = (v) => typeof v === "string" && v.startsWith("/storage/rekaman/");
import { bacaBerkas, minta } from "./api";

const kosong = () => ({ jawaban: {}, skor_manual: {}, foto: [], teks: {} });
const dariServer = (butir, j) => ({
  jawaban: j?.jawaban || {}, skor_manual: j?.skor_manual || {}, foto: j?.foto || [],
  online: j?.sumber === "ONLINE", sedang: j?.sumber === "ONLINE" && !j?.selesai_pada, pelanggaran: j?.pelanggaran || 0,
  teks: Object.fromEntries(butir.map((b) => [b.id, keTeks(b.soal, j?.jawaban?.[b.id])])),
});
const kunciTeks = (b) => {
  const k = b.soal.kunci?.jawaban;
  switch (b.soal.bentuk) {
    case "PG": return HURUF[k];
    case "PG_KOMPLEKS": return (k || []).map((i) => HURUF[i]).join("");
    case "BENAR_SALAH": return (k || []).map((v) => (v ? "B" : "S")).join("");
    case "ISIAN": return (k || [])[0] || "";
    case "LENGKAPI_GAMBAR": return (k || []).map((x) => (Array.isArray(x) ? x[0] : x)).join("; ");
    default: return `0–${b.skor_maks}`;
  }
};

/**
 * Koreksi cepat: satu baris per siswa. Pilihan ganda, benar/salah, dan isian cukup diketik (A / AC / BSB / teks)
 * dan langsung dinilai; uraian, menjodohkan, dan mengurutkan diisi skornya. Foto lembar jawaban bisa dibaca AI,
 * dan skor uraian bisa diusulkan AI (dari jawaban online/catatan atau foto) untuk diperiksa guru.
 */
export default function KoreksiPaket({ paket, onBerubah }) {
  const butir = paket.butir || [];
  const [siswa, setSiswa] = useState([]);
  const [baris, setBaris] = useState({}); // id_siswa → {jawaban, skor_manual, foto, teks}
  const [kotor, setKotor] = useState(new Set());
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [lihatKunci, setLihatKunci] = useState(false);
  const [detail, setDetail] = useState(null); // id_siswa
  const [saranAi, setSaranAi] = useState({}); // id_siswa → id_butir → {skor, alasan, transkrip}
  const adaUraian = butir.some((b) => b.soal.bentuk === "URAIAN");
  const tabel = useRef(null);
  // Muat ulang hanya bila susunan butir berubah, agar isian yang belum disimpan tidak hilang saat paket disegarkan
  const butirRef = useRef(butir);
  butirRef.current = butir;
  const susunan = butir.map((b) => `${b.id}:${b.skor_maks}`).join(",");

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const r = await minta("GET", `/paket-soal/${paket.id_paket}/jawaban`);
      setSiswa(r.siswa);
      setBaris(Object.fromEntries(r.siswa.map((s) => [s.id_siswa, r.jawaban[s.id_siswa] ? dariServer(butirRef.current, r.jawaban[s.id_siswa]) : kosong()])));
      setKotor(new Set());
    } catch (err) { Swal.fire("Gagal memuat", err.message, "error"); }
    finally { setMemuat(false); }
  }, [paket.id_paket, susunan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, [muat]);

  // Peringatan bila meninggalkan halaman dengan perubahan belum disimpan
  useEffect(() => {
    if (!kotor.size) return;
    const tahan = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [kotor]);

  const ubah = (idSiswa, fn) => {
    setBaris((b) => ({ ...b, [idSiswa]: fn(b[idSiswa] || kosong()) }));
    setKotor((k) => new Set(k).add(idSiswa));
  };
  const isiTeks = (idSiswa, b, nilai) => ubah(idSiswa, (r) => ({ ...r, teks: { ...r.teks, [b.id]: nilai }, jawaban: { ...r.jawaban, [b.id]: dariTeks(b.soal, nilai) } }));
  const isiSkor = (idSiswa, b, nilai) => ubah(idSiswa, (r) => {
    const sm = { ...r.skor_manual };
    if (nilai === "") delete sm[b.id]; else sm[b.id] = Math.min(Math.max(Number(nilai), 0), b.skor_maks);
    return { ...r, skor_manual: sm };
  });

  const simpan = async (ids = [...kotor]) => {
    if (!ids.length) return true;
    setMenyimpan(true);
    try {
      const records = ids.map((id) => ({ id_siswa: id, jawaban: baris[id]?.jawaban || {}, skor_manual: baris[id]?.skor_manual || {} }));
      const res = await minta("PUT", `/paket-soal/${paket.id_paket}/jawaban`, { records });
      setBaris((b) => ({ ...b, ...Object.fromEntries(Object.entries(res.data).map(([id, j]) => [id, { ...dariServer(butir, j), teks: { ...b[id]?.teks } }])) }));
      setKotor((k) => { const n = new Set(k); ids.forEach((i) => n.delete(i)); return n; });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 1800 });
      onBerubah?.();
      return true;
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); return false; }
    finally { setMenyimpan(false); }
  };

  /** Minta usulan skor uraian untuk satu siswa lalu isi ke lembar (belum disimpan). */
  const nilaiUraianAi = async (idSiswa, mode) => {
    const r = baris[idSiswa] || kosong();
    const jawaban = Object.fromEntries(butir.filter((b) => b.soal.bentuk === "URAIAN" && typeof r.jawaban?.[b.id] === "string" && r.jawaban[b.id].trim())
      .map((b) => [b.id, r.jawaban[b.id]]));
    const res = await minta("POST", `/paket-soal/${paket.id_paket}/jawaban/${idSiswa}/nilai-ai`, { ai_mode: mode, jawaban });
    setSaranAi((s) => ({ ...s, [idSiswa]: { ...s[idSiswa], ...res.saran } }));
    ubah(idSiswa, (x) => {
      const sm = { ...x.skor_manual };
      const jw = { ...x.jawaban };
      const tk = { ...x.teks };
      for (const [idB, sr] of Object.entries(res.saran)) {
        if (sr.skor != null) sm[idB] = sr.skor;
        // Transkrip dari foto mengisi jawaban yang masih kosong
        if (sr.transkrip && !String(jw[idB] ?? "").trim()) { jw[idB] = sr.transkrip; tk[idB] = sr.transkrip; }
      }
      return { ...x, skor_manual: sm, jawaban: jw, teks: tk };
    });
    return { pesan: res.message };
  };

  // Semua siswa yang punya jawaban uraian (online/catatan) atau foto dan masih ada uraian tanpa skor
  const nilaiSemuaUraian = async () => {
    const uraian = butir.filter((b) => b.soal.bentuk === "URAIAN");
    const calon = siswa.filter((s) => {
      const r = baris[s.id_siswa];
      if (!r || r.sedang) return false;
      const adaBahan = (r.foto || []).length > 0 || uraian.some((b) => typeof r.jawaban?.[b.id] === "string" && r.jawaban[b.id].trim());
      return adaBahan && uraian.some((b) => r.skor_manual?.[b.id] == null);
    });
    if (!calon.length) return Swal.fire("Tidak ada yang perlu dinilai", "Belum ada siswa dengan jawaban uraian atau foto lembar jawaban yang uraiannya belum diberi skor.", "info");
    const pilihan = await Swal.fire({
      title: "Nilai uraian dengan AI",
      html: `AI mengusulkan skor uraian untuk <b>${calon.length} siswa</b> sesuai rubrik. Skor terisi di lembar tetapi <b>belum disimpan</b>; periksa dulu, lalu tekan Simpan.<br><small class="text-muted">Foto lembar jawaban hanya dibaca Gemini atau Claude.</small>`,
      input: "select", inputOptions: Object.fromEntries(AI_MODES.map((m) => [m.value, m.label])), inputValue: bacaAiMode(),
      showCancelButton: true, confirmButtonText: "Mulai", cancelButtonText: "Batal",
    });
    if (!pilihan.isConfirmed) return;
    simpanAiMode(pilihan.value);
    let berhasil = 0;
    const gagal = [];
    for (const [i, s] of calon.entries()) {
      Swal.fire({ title: "AI sedang menilai…", html: `${i + 1} dari ${calon.length}: <b>${s.nama_siswa}</b>`, allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
      try { await nilaiUraianAi(s.id_siswa, pilihan.value); berhasil++; }
      catch (err) { gagal.push(`${s.nama_siswa}: ${err.message}`); }
    }
    Swal.fire({ icon: gagal.length ? "warning" : "success", title: `Usulan skor untuk ${berhasil} siswa`,
      html: `Baris berwarna kuning belum disimpan. Arahkan kursor ke kolom uraian bertanda <i class="bi bi-stars"></i> untuk melihat alasan AI, atau buka rincian siswa.${gagal.length ? `<br><br><small class="text-start d-block">${gagal.slice(0, 5).join("<br>")}</small>` : ""}` });
  };

  const kirimNilai = async () => {
    if (kotor.size && !(await simpan())) return;
    if (!paket.id_jenis || !paket.tanggal) return Swal.fire("Lengkapi pengaturan paket", "Isi jenis penilaian dan tanggal pada pengaturan paket (tombol Ubah) sebelum mengirim nilai.", "info");
    const ok = await Swal.fire({ title: "Kirim nilai ke Input Nilai?", html: `Nilai siswa yang <b>sudah lengkap dikoreksi</b> dicatat per TP pada tanggal <b>${paket.tanggal}</b>. Mengirim ulang memperbarui nilai yang sama.`,
      icon: "question", showCancelButton: true, confirmButtonText: "Kirim", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    try {
      const res = await minta("POST", `/paket-soal/${paket.id_paket}/kirim-nilai`);
      await Swal.fire({ icon: "success", title: "Nilai terkirim", text: res.message });
      onBerubah?.();
    } catch (err) { Swal.fire("Belum bisa dikirim", err.message, "warning"); }
  };

  // Enter pindah ke siswa berikutnya pada kolom yang sama
  const pindah = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const { baris: br, kolom } = e.currentTarget.dataset;
    tabel.current?.querySelector(`[data-baris="${Number(br) + 1}"][data-kolom="${kolom}"]`)?.focus();
  };

  const ringkasan = useMemo(() => Object.fromEntries(siswa.map((s) => [s.id_siswa, ringkas(butir, baris[s.id_siswa]?.jawaban, baris[s.id_siswa]?.skor_manual, baris[s.id_siswa]?.online)])), [siswa, baris, butir]);
  const sudahDiisi = (id) => {
    const r = baris[id];
    return r && (Object.values(r.teks || {}).some((t) => t) || Object.keys(r.skor_manual || {}).length > 0 || (r.foto || []).length > 0);
  };
  const jumlahLengkap = siswa.filter((s) => sudahDiisi(s.id_siswa) && ringkasan[s.id_siswa]?.lengkap && !baris[s.id_siswa]?.sedang).length;

  if (!butir.length) return <div className="text-center text-muted py-5"><i className="bi bi-journal-x fs-1 d-block mb-2"></i>Paket belum berisi soal. Tambahkan soal di bagian Susun.</div>;
  if (!paket.id_kelas) return <div className="alert alert-info">Pilih kelas pada pengaturan paket untuk mulai mengoreksi.</div>;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <div className="small text-muted me-auto">
          Ketik jawaban siswa: <b>A</b> untuk pilihan ganda, <b>AC</b> untuk kompleks, <b>BSB</b> untuk benar/salah, teks untuk isian; kolom bertanda <i className="bi bi-pencil-square"></i> diisi skornya. Tekan Enter untuk turun ke siswa berikutnya.
        </div>
        <div className="form-check form-switch m-0 small">
          <input className="form-check-input" type="checkbox" id="lihatKunci" checked={lihatKunci} onChange={(e) => setLihatKunci(e.target.checked)} />
          <label className="form-check-label" htmlFor="lihatKunci">Tampilkan kunci</label>
        </div>
        <button className="btn btn-sm btn-primary" disabled={!kotor.size || menyimpan} onClick={() => simpan()}>
          {menyimpan ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-save me-1"></i>}Simpan{kotor.size ? ` (${kotor.size})` : ""}
        </button>
        {adaUraian && <button className="btn btn-sm btn-outline-primary" onClick={nilaiSemuaUraian} disabled={menyimpan}><i className="bi bi-stars me-1"></i>Nilai uraian (AI)</button>}
        <button className="btn btn-sm btn-success" onClick={kirimNilai} disabled={menyimpan}><i className="bi bi-send-check me-1"></i>Kirim ke Input Nilai</button>
      </div>
      {paket.terkirim_pada && <div className="small text-success-emphasis mb-2"><i className="bi bi-check2-circle me-1"></i>Terakhir dikirim ke Input Nilai {new Date(paket.terkirim_pada).toLocaleString("id-ID")}. Kirim lagi setelah ada koreksi baru.</div>}

      {memuat ? <div className="text-muted small py-3"><span className="spinner-border spinner-border-sm me-2"></span>Memuat lembar koreksi…</div> : (
        <div className="table-responsive border rounded" style={{ maxHeight: "70vh" }}>
          <table className="table table-sm table-bordered align-middle mb-0 lembar-koreksi" ref={tabel} style={{ fontSize: ".85rem" }}>
            <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 3, minWidth: 150 }} className="bg-body-tertiary">Siswa</th>
                {butir.map((b, i) => (
                  <th key={b.id} className="text-center text-nowrap" title={`${labelBentuk(b.soal.bentuk)} · skor maks. ${b.skor_maks}\n${b.soal.pertanyaan}`}>
                    {i + 1}{!OTOMATIS.includes(b.soal.bentuk) && <i className="bi bi-pencil-square ms-1 text-warning"></i>}
                    {lihatKunci && <div className="fw-normal text-success small text-truncate" style={{ maxWidth: 70 }}>{kunciTeks(b)}</div>}
                  </th>
                ))}
                <th className="text-center">Nilai</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {siswa.map((s, si) => {
                const r = baris[s.id_siswa] || kosong();
                const rk = ringkasan[s.id_siswa];
                const diisi = sudahDiisi(s.id_siswa);
                return (
                  <tr key={s.id_siswa} className={kotor.has(s.id_siswa) ? "table-warning" : ""}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1 }} className="bg-body text-nowrap">
                      {s.nama_siswa}
                      {r.online && <i className={`bi ${r.sedang ? "bi-phone-vibrate text-primary" : "bi-phone text-muted"} ms-1`} title={r.sedang ? "Sedang mengerjakan tes online" : "Dikerjakan online"}></i>}
                      {r.pelanggaran > 0 && <span className="badge text-bg-warning ms-1" title="Berapa kali keluar dari halaman tes">{r.pelanggaran}×</span>}
                    </td>
                    {butir.map((b, bi) => {
                      const otomatis = OTOMATIS.includes(b.soal.bentuk);
                      const sk = diisi ? skorButir(b, r.jawaban, r.skor_manual, r.online) : null;
                      const auto = skorButir(b, r.jawaban, {}, r.online);
                      const warna = sk == null ? "" : sk >= b.skor_maks ? "bg-success-subtle" : sk > 0 ? "bg-warning-subtle" : "bg-danger-subtle";
                      const sr = saranAi[s.id_siswa]?.[b.id];
                      return (
                        <td key={b.id} className={`p-0 position-relative ${warna}`} title={sr ? `Usulan AI: ${sr.skor ?? "–"}/${b.skor_maks}. ${sr.alasan}` : sk != null ? `Skor ${sk}/${b.skor_maks}${r.skor_manual?.[b.id] != null && otomatis ? " (ditetapkan guru)" : ""}` : undefined}>
                          {sr && <i className="bi bi-stars text-primary position-absolute" style={{ fontSize: ".6rem", top: 1, right: 2 }} aria-hidden="true"></i>}
                          {rekaman(r.jawaban?.[b.id]) && (
                            <button type="button" className="btn btn-link p-0 position-absolute text-danger" style={{ fontSize: ".7rem", top: 0, left: 2, zIndex: 1 }}
                              onClick={() => setDetail(s.id_siswa)} title="Dengarkan rekaman" aria-label={`Dengarkan rekaman ${s.nama_siswa} nomor ${bi + 1}`}><i className="bi bi-mic-fill"></i></button>
                          )}
                          {otomatis ? (
                            <input className="form-control form-control-sm border-0 bg-transparent text-center px-1" style={{ width: ["ISIAN", "LENGKAPI_GAMBAR"].includes(b.soal.bentuk) ? 90 : 52 }}
                              aria-label={`Jawaban ${s.nama_siswa} nomor ${bi + 1}`} value={r.teks?.[b.id] ?? ""} data-baris={si} data-kolom={bi} onKeyDown={pindah} disabled={r.sedang}
                              onChange={(e) => isiTeks(s.id_siswa, b, ["ISIAN", "LENGKAPI_GAMBAR"].includes(b.soal.bentuk) ? e.target.value : e.target.value.toUpperCase())} />
                          ) : (
                            <input type="number" min={0} max={b.skor_maks} step="0.5" className="form-control form-control-sm border-0 bg-transparent text-center px-1" style={{ width: 52 }}
                              aria-label={`Skor ${s.nama_siswa} nomor ${bi + 1}`} placeholder={diisi && auto != null ? String(auto) : "–"} value={r.skor_manual?.[b.id] ?? ""} data-baris={si} data-kolom={bi} onKeyDown={pindah}
                              disabled={r.sedang} onChange={(e) => isiSkor(s.id_siswa, b, e.target.value)} />
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center text-nowrap">
                      {r.sedang ? <span className="badge text-bg-primary">Mengerjakan</span>
                        : diisi ? <><b>{rk.nilai}</b>{!rk.lengkap && <i className="bi bi-hourglass-split text-warning ms-1" title="Ada butir yang belum diberi skor"></i>}</> : <span className="text-muted">–</span>}
                    </td>
                    <td className="text-nowrap">
                      <button className="btn btn-sm btn-link p-0 px-1" onClick={() => setDetail(s.id_siswa)} aria-label={`Rincian & foto ${s.nama_siswa}`} title="Rincian, foto lembar jawaban, dan baca dengan AI">
                        <i className={`bi ${r.foto?.length ? "bi-camera-fill" : "bi-camera"}`}></i>{r.foto?.length > 0 && <small>{r.foto.length}</small>}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="small text-muted mt-2">{jumlahLengkap} dari {siswa.length} siswa selesai dikoreksi. Siswa yang belum diisi dianggap tidak ikut dan tidak dikirim.</div>

      {detail && (
        <RincianSiswa paket={paket} siswa={siswa.find((s) => s.id_siswa === detail)} baris={baris[detail] || kosong()}
          saran={saranAi[detail] || {}} onNilaiUraian={(mode) => nilaiUraianAi(detail, mode)}
          onTeks={(b, v) => isiTeks(detail, b, v)} onSkor={(b, v) => isiSkor(detail, b, v)}
          onJawabanAi={(jawaban) => ubah(detail, (r) => ({ ...r, jawaban: { ...r.jawaban, ...jawaban }, teks: { ...r.teks, ...Object.fromEntries(butir.map((b) => [b.id, keTeks(b.soal, jawaban[b.id] ?? r.jawaban[b.id])])) } }))}
          onFoto={(foto) => setBaris((b) => ({ ...b, [detail]: { ...(b[detail] || kosong()), foto } }))}
          onSimpan={async () => { if (await simpan([detail])) setDetail(null); }}
          menyimpan={menyimpan} onTutup={() => setDetail(null)} />
      )}
    </div>
  );
}

/** Rincian satu siswa: foto lembar jawaban (unggah, baca AI), jawaban dan skor per butir (skor guru menggantikan otomatis). */
function RincianSiswa({ paket, siswa, baris, saran, onNilaiUraian, onTeks, onSkor, onJawabanAi, onFoto, onSimpan, menyimpan, onTutup }) {
  const butir = paket.butir || [];
  const [aiMode, setAiMode] = useState(bacaAiMode);
  const bisaBaca = AI_MODES.find((m) => m.value === aiMode)?.berkas;
  const adaUraian = butir.some((b) => b.soal.bentuk === "URAIAN");
  const [proses, setProses] = useState(null); // "unggah" | url yang sedang dibaca
  const berkas = useRef(null);
  const rk = ringkas(butir, baris.jawaban, baris.skor_manual, baris.online);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !proses) onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup, proses]);

  const unggah = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return Swal.fire("Berkas terlalu besar", "Maksimal 8MB per foto.", "warning");
    setProses("unggah");
    try {
      const res = await minta("POST", `/paket-soal/${paket.id_paket}/jawaban/${siswa.id_siswa}/foto`, { foto_base64: await bacaBerkas(file) });
      onFoto(res.data.foto || []);
    } catch (err) { Swal.fire("Gagal mengunggah", err.message, "error"); }
    finally { setProses(null); if (berkas.current) berkas.current.value = ""; }
  };

  const hapusFoto = async (url) => {
    const ok = await Swal.fire({ title: "Hapus foto ini?", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try {
      const res = await minta("DELETE", `/paket-soal/${paket.id_paket}/jawaban/${siswa.id_siswa}/foto`, { url });
      onFoto(res.data.foto || []);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const bacaAi = async (url) => {
    simpanAiMode(aiMode);
    setProses(url);
    try {
      const res = await minta("POST", `/paket-soal/${paket.id_paket}/jawaban/${siswa.id_siswa}/baca`, { url, ai_mode: aiMode });
      // Hanya jawaban yang terbaca yang dipakai; yang kosong tidak menimpa isian guru
      onJawabanAi(Object.fromEntries(Object.entries(res.jawaban).filter(([, v]) => v != null && !(Array.isArray(v) && (!v.length || v.every((x) => x == null))))));
      const beda = res.nama_siswa && !siswa.nama_siswa.toLowerCase().includes(res.nama_siswa.toLowerCase().split(" ")[0]);
      Swal.fire({ icon: beda ? "warning" : "success", title: "Jawaban terbaca", html: `${res.message}${beda ? `<br><br>Nama di lembar: <b>${res.nama_siswa}</b>. Pastikan ini lembar ${siswa.nama_siswa}.` : ""}` });
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(null); }
  };

  const nilaiUraian = async () => {
    simpanAiMode(aiMode);
    setProses("uraian");
    try {
      const { pesan } = await onNilaiUraian(aiMode);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: pesan, showConfirmButton: false, timer: 3500 });
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(null); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Koreksi ${siswa.nama_siswa}`}>
        <div className="modal-dialog modal-dialog-scrollable modal-xl">
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-person-check text-primary me-2"></i>{siswa.nama_siswa}
                <span className="badge text-bg-light border ms-2 fw-normal">Nilai {rk.nilai}{!rk.lengkap && " · belum lengkap"}</span></h5>
              <button type="button" className="btn-close" onClick={onTutup} disabled={!!proses} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <div className="row g-3">
                <div className="col-lg-5">
                  <div className="fw-semibold mb-1"><i className="bi bi-camera me-1"></i>Foto lembar jawaban</div>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {(baris.foto || []).map((url) => (
                      <div key={url} className="border rounded p-1 text-center" style={{ width: 150 }}>
                        <a href={srcGambar(url)} target="_blank" rel="noreferrer">
                          {url.endsWith(".pdf") ? <div className="py-4"><i className="bi bi-file-earmark-pdf fs-1 text-danger"></i></div>
                            : <img src={srcGambar(url)} alt="Lembar jawaban" style={{ width: "100%", height: 120, objectFit: "cover" }} />}
                        </a>
                        <div className="d-flex gap-1 mt-1">
                          <button className="btn btn-sm btn-primary flex-grow-1" disabled={!!proses || !bisaBaca} onClick={() => bacaAi(url)} title={bisaBaca ? undefined : "Foto hanya bisa dibaca Gemini atau Claude"}>
                            {proses === url ? <span className="spinner-border spinner-border-sm"></span> : <><i className="bi bi-magic me-1"></i>Baca AI</>}
                          </button>
                          <button className="btn btn-sm btn-outline-danger" disabled={!!proses} onClick={() => hapusFoto(url)} aria-label="Hapus foto"><i className="bi bi-trash"></i></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <input ref={berkas} type="file" accept="image/*,application/pdf" className="d-none" id="unggahLembar" onChange={(e) => unggah(e.target.files?.[0])} />
                  <label htmlFor="unggahLembar" className={`btn btn-sm btn-outline-primary ${proses || (baris.foto || []).length >= 4 ? "disabled" : ""}`}>
                    {proses === "unggah" ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-upload me-1"></i>}Unggah / foto lembar
                  </label>
                  <div className="mt-2">
                    <label className="form-label small mb-1" htmlFor="aiBaca">Penyedia AI</label>
                    <select id="aiBaca" className="form-select form-select-sm" value={aiMode} onChange={(e) => setAiMode(e.target.value)}>
                      {AI_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}{m.berkas ? "" : " (tanpa foto)"}</option>)}
                    </select>
                    {adaUraian && (
                      <button type="button" className="btn btn-sm btn-outline-primary mt-2 w-100" disabled={!!proses || baris.sedang} onClick={nilaiUraian}>
                        {proses === "uraian" ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}Nilai uraian dengan AI
                      </button>
                    )}
                    <div className="form-text">AI hanya mengisi usulan jawaban dan skor. Foto hanya dibaca Gemini atau Claude. Periksa, lalu tekan Simpan.</div>
                  </div>
                </div>
                <div className="col-lg-7">
                  <div className="fw-semibold mb-1"><i className="bi bi-list-check me-1"></i>Jawaban & skor</div>
                  <div className="d-flex flex-column gap-2">
                    {butir.map((b, i) => {
                      const otomatis = OTOMATIS.includes(b.soal.bentuk);
                      const sk = skorButir(b, baris.jawaban, {}, baris.online);
                      const hanyaBaca = Array.isArray(baris.jawaban?.[b.id]) && ["MENJODOHKAN", "MENGURUTKAN"].includes(b.soal.bentuk);
                      return (
                        <div key={b.id} className="border rounded p-2 small">
                          <div className="d-flex gap-2">
                            <b>{i + 1}.</b>
                            <div className="flex-grow-1 min-w-0">
                              <div className="text-truncate" title={b.soal.pertanyaan}>{b.soal.pertanyaan}</div>
                              <div className="text-muted">{labelBentuk(b.soal.bentuk)} · kunci: <span className="text-success-emphasis">{kunciTeks(b)}</span></div>
                            </div>
                          </div>
                          <div className="row g-2 mt-1 align-items-center">
                            <div className="col-7">
                              {rekaman(baris.jawaban?.[b.id]) ? (
                                <audio controls preload="none" src={srcGambar(baris.jawaban[b.id])} className="w-100" style={{ height: 34 }} aria-label={`Rekaman nomor ${i + 1}`} />
                              ) : b.soal.bentuk === "URAIAN" || !otomatis ? (
                                <input className="form-control form-control-sm" placeholder="Catatan/jawaban siswa (opsional)" aria-label={`Jawaban nomor ${i + 1}`}
                                  value={baris.teks?.[b.id] ?? ""} readOnly={hanyaBaca} title={hanyaBaca ? "Jawaban tes online (dinilai otomatis)" : undefined} onChange={(e) => onTeks(b, e.target.value)} />
                              ) : (
                                <input className="form-control form-control-sm" aria-label={`Jawaban nomor ${i + 1}`} value={baris.teks?.[b.id] ?? ""}
                                  onChange={(e) => onTeks(b, ["ISIAN", "LENGKAPI_GAMBAR"].includes(b.soal.bentuk) ? e.target.value : e.target.value.toUpperCase())} />
                              )}
                            </div>
                            <div className="col-5 d-flex align-items-center gap-1">
                              <input type="number" min={0} max={b.skor_maks} step="0.5" className="form-control form-control-sm" style={{ width: 70 }}
                                aria-label={`Skor nomor ${i + 1}`} placeholder={otomatis && sk != null ? String(sk) : "–"} value={baris.skor_manual?.[b.id] ?? ""} onChange={(e) => onSkor(b, e.target.value)} />
                              <span className="text-muted text-nowrap">/ {b.skor_maks}</span>
                            </div>
                          </div>
                          {["URAIAN", "MEMBACA_NYARING"].includes(b.soal.bentuk) && b.soal.rubrik && <div className="text-body-secondary mt-1" style={{ whiteSpace: "pre-wrap" }}><b>Rubrik:</b> {b.soal.rubrik}</div>}
                          {saran[b.id] && (
                            <div className="alert alert-primary py-1 px-2 mt-1 mb-0 saran-ai">
                              <i className="bi bi-stars me-1"></i><b>Usulan AI {saran[b.id].skor ?? "–"}/{b.skor_maks}:</b> {saran[b.id].alasan}
                              {saran[b.id].transkrip && <div className="text-body-secondary mt-1" style={{ whiteSpace: "pre-wrap" }}><b>Tulisan siswa:</b> {saran[b.id].transkrip}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="form-text">Kotak skor pada soal otomatis boleh dikosongkan; isi hanya bila ingin mengganti skor otomatis.</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup} disabled={!!proses}>Tutup</button>
              <button type="button" className="btn btn-primary" onClick={onSimpan} disabled={!!proses || menyimpan}>
                {menyimpan ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-save me-1"></i>}Simpan jawaban
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}
