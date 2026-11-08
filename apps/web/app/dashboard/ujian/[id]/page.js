"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { HURUF } from "@/components/banksoal/konstanta";
import { srcGambar, srcSvg } from "@/components/banksoal/PratinjauSoal";
import PerekamSuara from "@/components/banksoal/PerekamSuara";

const JEDA_SIMPAN = 1200;

/** Apakah butir sudah dijawab (untuk penanda nomor & peringatan sebelum mengumpulkan). */
function terjawab(soal, v) {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) {
    if (soal.bentuk === "PG_KOMPLEKS") return v.length > 0;
    return v.some((x) => x != null && x !== "");
  }
  return true;
}

const fmtWaktu = (detik) => {
  if (detik == null) return null;
  const j = Math.floor(detik / 3600), m = Math.floor((detik % 3600) / 60), d = detik % 60;
  return `${j ? `${j}:` : ""}${String(m).padStart(j ? 2 : 1, "0")}:${String(d).padStart(2, "0")}`;
};

export default function KerjakanUjian() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [galat, setGalat] = useState(null);
  const [jawaban, setJawaban] = useState({});
  const [idx, setIdx] = useState(0);
  const [ragu, setRagu] = useState({});
  const [sisa, setSisa] = useState(null);
  const [status, setStatus] = useState("tersimpan"); // tersimpan | menyimpan | belum | gagal
  const [token, setToken] = useState("");
  const [proses, setProses] = useState(false);
  const tertunda = useRef({});      // jawaban yang belum terkirim
  const pelanggaran = useRef(0);     // keluar dari halaman sejak simpan terakhir
  const batas = useRef(null);        // waktu habis (ms, jam perangkat)
  const pengatur = useRef(null);
  const selesaiRef = useRef(false);
  const kunciRagu = `ujian_ragu_${id}`;

  const terima = useCallback((d) => {
    setInfo(d);
    if (d.status === "MENGERJAKAN") {
      setJawaban(d.jawaban || {});
      batas.current = d.sisa_detik != null ? Date.now() + d.sisa_detik * 1000 : null;
      setSisa(d.sisa_detik);
    }
  }, []);

  useEffect(() => {
    minta("GET", `/ujian/${id}`).then((r) => terima(r.data)).catch((err) => setGalat(err.message));
    try { setRagu(JSON.parse(localStorage.getItem(kunciRagu) || "{}")); } catch (e) { /* abaikan */ }
  }, [id, terima, kunciRagu]);

  const kirim = useCallback(async () => {
    clearTimeout(pengatur.current);
    const isi = tertunda.current;
    const keluar = pelanggaran.current;
    if (!Object.keys(isi).length && !keluar) return true;
    tertunda.current = {};
    pelanggaran.current = 0;
    setStatus("menyimpan");
    try {
      const r = await minta("PUT", `/ujian/${id}/jawaban`, { jawaban: isi, pelanggaran: keluar });
      if (r.sisa_detik != null) batas.current = Date.now() + r.sisa_detik * 1000;
      setStatus(Object.keys(tertunda.current).length ? "belum" : "tersimpan");
      return true;
    } catch (err) {
      // Kembalikan agar dicoba lagi (mis. sinyal hilang)
      tertunda.current = { ...isi, ...tertunda.current };
      pelanggaran.current += keluar;
      setStatus("gagal");
      if (/Waktu habis|tidak berjalan/.test(err.message)) {
        selesaiRef.current = true;
        minta("GET", `/ujian/${id}`).then((r) => terima(r.data));
      }
      return false;
    }
  }, [id, terima]);

  const ubah = (idButir, nilai) => {
    setJawaban((j) => ({ ...j, [idButir]: nilai }));
    tertunda.current[idButir] = nilai;
    setStatus("belum");
    clearTimeout(pengatur.current);
    pengatur.current = setTimeout(kirim, JEDA_SIMPAN);
  };

  // Coba kirim ulang tiap 5 detik bila ada yang belum tersimpan
  useEffect(() => {
    if (info?.status !== "MENGERJAKAN") return;
    const t = setInterval(() => { if (status === "gagal") kirim(); }, 5000);
    return () => clearInterval(t);
  }, [info?.status, status, kirim]);

  const kumpulkan = useCallback(async (otomatis = false) => {
    if (selesaiRef.current && !otomatis) return;
    setProses(true);
    try {
      const r = await minta("POST", `/ujian/${id}/selesai`, { jawaban: tertunda.current, pelanggaran: pelanggaran.current });
      tertunda.current = {};
      selesaiRef.current = true;
      try { localStorage.removeItem(kunciRagu); } catch (e) { /* abaikan */ }
      terima(r.data);
    } catch (err) {
      if (/Waktu habis|tidak berjalan/.test(err.message)) minta("GET", `/ujian/${id}`).then((r) => terima(r.data));
      else Swal.fire("Belum terkumpul", `${err.message} Periksa sinyal, lalu coba lagi.`, "warning");
    } finally { setProses(false); }
  }, [id, terima, kunciRagu]);

  // Hitung mundur; waktu habis → kumpulkan otomatis
  useEffect(() => {
    if (info?.status !== "MENGERJAKAN" || batas.current == null) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((batas.current - Date.now()) / 1000));
      setSisa(s);
      if (s === 0 && !selesaiRef.current) { selesaiRef.current = true; kumpulkan(true); }
    }, 1000);
    return () => clearInterval(t);
  }, [info?.status, kumpulkan]);

  // Keluar dari halaman tes dicatat (guru melihat jumlahnya)
  useEffect(() => {
    if (info?.status !== "MENGERJAKAN") return;
    const lihat = () => {
      if (document.visibilityState === "hidden") { pelanggaran.current += 1; kirim(); }
      else Swal.fire({ toast: true, position: "top", icon: "warning", title: "Tetap di halaman tes ya. Keluar halaman tercatat untuk guru.", showConfirmButton: false, timer: 3500 });
    };
    const tahan = (e) => { if (Object.keys(tertunda.current).length) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("visibilitychange", lihat);
    window.addEventListener("beforeunload", tahan);
    return () => { document.removeEventListener("visibilitychange", lihat); window.removeEventListener("beforeunload", tahan); };
  }, [info?.status, kirim]);

  const mulai = async (e) => {
    e?.preventDefault();
    setProses(true);
    try { terima((await minta("POST", `/ujian/${id}/mulai`, { token: token || null })).data); }
    catch (err) { Swal.fire("Belum bisa mulai", err.message, "warning"); }
    finally { setProses(false); }
  };

  const tandaiRagu = (idButir) => setRagu((r) => {
    const baru = { ...r, [idButir]: !r[idButir] };
    try { localStorage.setItem(kunciRagu, JSON.stringify(baru)); } catch (e) { /* abaikan */ }
    return baru;
  });

  const konfirmasiKumpul = async () => {
    const soal = info.soal;
    const kosong = soal.filter((s) => !terjawab(s, jawaban[s.id])).length;
    const raguN = soal.filter((s) => ragu[s.id]).length;
    const ok = await Swal.fire({
      title: "Kumpulkan jawaban?", icon: kosong ? "warning" : "question",
      html: `${kosong ? `<b>${kosong} soal belum dijawab.</b><br>` : "Semua soal sudah dijawab.<br>"}${raguN ? `${raguN} soal masih ditandai ragu-ragu.<br>` : ""}Setelah dikumpulkan, jawaban tidak bisa diubah.`,
      showCancelButton: true, confirmButtonText: "Kumpulkan", cancelButtonText: "Periksa lagi",
    });
    if (ok.isConfirmed) kumpulkan();
  };

  if (galat) return <div className="container mt-4" style={{ maxWidth: 760 }}><div className="alert alert-warning">{galat}</div><Link href="/dashboard/ujian">Kembali ke daftar tes</Link></div>;
  if (!info) return <div className="container mt-4 text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Memuat tes…</div>;

  // ===== Sebelum mulai / setelah selesai =====
  if (info.status !== "MENGERJAKAN") {
    return (
      <div className="container mt-4 mb-5" style={{ maxWidth: 640 }}>
        <div className="card shadow-sm">
          <div className="card-body p-4">
            <h3 className="fw-bold mb-1">{info.judul}</h3>
            <div className="text-muted mb-3">{info.mapel} · {info.jumlah_soal} soal{info.durasi_menit && ` · ${info.durasi_menit} menit`}</div>
            {info.status === "TERSEDIA" ? (
              <form onSubmit={mulai}>
                {info.petunjuk && <div className="alert alert-light border"><b>Petunjuk:</b> <span style={{ whiteSpace: "pre-wrap" }}>{info.petunjuk}</span></div>}
                <ul className="small text-muted">
                  <li>Jawaban tersimpan otomatis setiap kamu memilih atau mengetik.</li>
                  {info.durasi_menit && <li>Waktu berjalan sejak kamu menekan Mulai. Saat waktu habis, jawaban dikumpulkan otomatis.</li>}
                  <li>Jangan keluar dari halaman ini saat mengerjakan; gurumu bisa melihatnya.</li>
                </ul>
                {info.butuh_token && (
                  <div className="mb-3">
                    <label className="form-label fw-semibold" htmlFor="tokenUjian">Token dari guru</label>
                    <input id="tokenUjian" className="form-control form-control-lg text-uppercase font-monospace" autoComplete="off" required maxLength={12}
                      value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} />
                  </div>
                )}
                <button type="submit" className="btn btn-primary btn-lg w-100" disabled={proses}>
                  {proses ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-play-fill me-1"></i>}Mulai mengerjakan
                </button>
              </form>
            ) : info.status === "SELESAI" ? (
              <div className="text-center py-3">
                <i className="bi bi-check-circle-fill text-success" style={{ fontSize: 56 }}></i>
                <div className="fs-4 fw-semibold mt-2">Jawabanmu sudah terkumpul</div>
                {info.nilai != null && <div className="display-5 fw-bold text-primary my-2">{info.nilai}</div>}
                {info.menunggu_guru && <div className="text-muted">Nilai akhir muncul setelah gurumu menilai jawaban uraian.</div>}
                {info.nilai == null && !info.menunggu_guru && <div className="text-muted">Gurumu akan memeriksa dan mengumumkan nilainya.</div>}
              </div>
            ) : (
              <div className="alert alert-secondary mb-0">
                {info.status === "BELUM_DIBUKA" ? `Tes belum dibuka${info.online_mulai ? `. Dibuka ${new Date(info.online_mulai).toLocaleString("id-ID")}` : ""}.` : "Waktu tes sudah ditutup."}
              </div>
            )}
            <Link href="/dashboard/ujian" className="btn btn-link px-0 mt-3"><i className="bi bi-arrow-left me-1"></i>Daftar tes</Link>
          </div>
        </div>
      </div>
    );
  }

  // ===== Mengerjakan =====
  const soal = info.soal;
  const s = soal[Math.min(idx, soal.length - 1)];
  const dijawab = soal.filter((x) => terjawab(x, jawaban[x.id])).length;
  const hampirHabis = sisa != null && sisa <= 300;

  return (
    <div className="container-fluid px-2 px-md-4 mb-5 halaman-ujian" style={{ maxWidth: 900 }}>
      <div className="sticky-top bg-body border-bottom py-2 mb-3" style={{ top: 0, zIndex: 1020 }}>
        <div className="d-flex align-items-center gap-2">
          <div className="me-auto min-w-0">
            <div className="fw-semibold text-truncate">{info.judul}</div>
            <div className="small text-muted">
              {dijawab}/{soal.length} terjawab ·{" "}
              {status === "tersimpan" ? <span className="text-success"><i className="bi bi-cloud-check"></i> tersimpan</span>
                : status === "menyimpan" ? <span><span className="spinner-border spinner-border-sm"></span> menyimpan</span>
                : status === "gagal" ? <span className="text-danger"><i className="bi bi-wifi-off"></i> belum tersimpan, mencoba lagi…</span>
                : <span className="text-muted"><i className="bi bi-cloud-arrow-up"></i> menyimpan…</span>}
            </div>
          </div>
          {sisa != null && (
            <div className={`badge fs-6 font-monospace ${hampirHabis ? "text-bg-danger" : "text-bg-dark"}`} role="timer" aria-label="Sisa waktu">
              <i className="bi bi-stopwatch me-1"></i>{fmtWaktu(sisa)}
            </div>
          )}
          <button className="btn btn-success" onClick={konfirmasiKumpul} disabled={proses}>Kumpulkan</button>
        </div>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body p-3 p-md-4">
          <div className="d-flex align-items-center mb-2">
            <span className="badge text-bg-primary fs-6 me-2">Soal {idx + 1}</span>
            <span className="small text-muted me-auto">dari {soal.length}</span>
            <button className={`btn btn-sm ${ragu[s.id] ? "btn-warning" : "btn-outline-warning"}`} onClick={() => tandaiRagu(s.id)}>
              <i className="bi bi-flag me-1"></i>Ragu-ragu
            </button>
          </div>
          <div className="fs-5 mb-3" style={{ whiteSpace: "pre-wrap" }}>{s.pertanyaan}</div>
          {s.video?.file_url && (
            <div className="mb-3">
              <video key={s.id} controls preload="metadata" playsInline src={srcGambar(s.video.file_url)} poster={s.video.poster_url ? srcGambar(s.video.poster_url) : undefined}
                className="w-100 rounded bg-black" style={{ maxHeight: 360 }} aria-label={`Video: ${s.video.judul}`} />
              <div className="small text-muted mt-1"><i className="bi bi-play-circle me-1"></i>Tonton videonya dulu, lalu jawab.</div>
            </div>
          )}
          {(s.gambar_svg || s.gambar_url) && (
            <div className="mb-3 text-center">
              <img src={s.gambar_svg ? srcSvg(s.gambar_svg) : srcGambar(s.gambar_url)} alt="Gambar soal" className="border rounded bg-white img-fluid" style={{ maxHeight: 340 }} />
            </div>
          )}
          {s.bentuk === "MEMBACA_NYARING" ? (
            <>
              <div className="border rounded-3 p-3 mb-3 bg-white fs-4" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{s.teks}</div>
              <PerekamSuara key={s.id} idPaket={id} idButir={s.id} url={jawaban[s.id]}
                onTersimpan={(url, sisaDetik) => {
                  setJawaban((j) => ({ ...j, [s.id]: url }));
                  if (sisaDetik != null) batas.current = Date.now() + sisaDetik * 1000;
                }} />
            </>
          ) : <Jawab soal={s} nilai={jawaban[s.id]} ubah={(v) => ubah(s.id, v)} />}
        </div>
      </div>

      <div className="d-flex gap-2 mb-3">
        <button className="btn btn-outline-secondary btn-lg flex-fill" disabled={idx === 0} onClick={() => { kirim(); setIdx((i) => i - 1); }}><i className="bi bi-chevron-left"></i> Sebelumnya</button>
        {idx < soal.length - 1
          ? <button className="btn btn-primary btn-lg flex-fill" onClick={() => { kirim(); setIdx((i) => i + 1); }}>Berikutnya <i className="bi bi-chevron-right"></i></button>
          : <button className="btn btn-success btn-lg flex-fill" onClick={konfirmasiKumpul} disabled={proses}>Kumpulkan <i className="bi bi-send"></i></button>}
      </div>

      <div className="d-flex flex-wrap gap-1 justify-content-center" aria-label="Nomor soal">
        {soal.map((x, i) => (
          <button key={x.id} onClick={() => { kirim(); setIdx(i); }} aria-label={`Ke soal ${i + 1}`}
            className={`btn btn-sm ${ragu[x.id] ? "btn-warning" : terjawab(x, jawaban[x.id]) ? "btn-success" : "btn-outline-secondary"} ${i === idx ? "border-3 border-primary" : ""}`}
            style={{ width: 42 }}>{i + 1}</button>
        ))}
      </div>
    </div>
  );
}

/** Tampilan menjawab per bentuk soal. Pilihan memakai indeks asli (`i`) sehingga urutan acak tidak memengaruhi penilaian. */
function Jawab({ soal, nilai, ubah }) {
  const [aktif, setAktif] = useState(null); // kiri yang sedang dipasangkan (menjodohkan)
  useEffect(() => setAktif(null), [soal.id]);

  switch (soal.bentuk) {
    case "PG":
      return (
        <div className="d-flex flex-column gap-2" role="radiogroup">
          {soal.pilihan.map((p, n) => (
            <button key={p.i} type="button" role="radio" aria-checked={nilai === p.i} onClick={() => ubah(p.i)}
              className={`btn btn-lg text-start ${nilai === p.i ? "btn-primary" : "btn-outline-secondary"}`}>
              <b className="me-2">{HURUF[n]}.</b>{p.teks}
            </button>
          ))}
        </div>
      );
    case "PG_KOMPLEKS": {
      const dipilih = Array.isArray(nilai) ? nilai : [];
      return (
        <>
          <div className="small text-muted mb-2">Pilih semua jawaban yang benar.</div>
          <div className="d-flex flex-column gap-2">
            {soal.pilihan.map((p, n) => {
              const on = dipilih.includes(p.i);
              return (
                <button key={p.i} type="button" role="checkbox" aria-checked={on} onClick={() => ubah(on ? dipilih.filter((x) => x !== p.i) : [...dipilih, p.i])}
                  className={`btn btn-lg text-start ${on ? "btn-primary" : "btn-outline-secondary"}`}>
                  <i className={`bi ${on ? "bi-check-square-fill" : "bi-square"} me-2`}></i><b className="me-2">{HURUF[n]}.</b>{p.teks}
                </button>
              );
            })}
          </div>
        </>
      );
    }
    case "BENAR_SALAH": {
      const j = Array.isArray(nilai) ? nilai : soal.pernyataan.map(() => null);
      const set = (i, v) => ubah(soal.pernyataan.map((_, k) => (k === i ? v : j[k] ?? null)));
      return (
        <div className="d-flex flex-column gap-2">
          {soal.pernyataan.map((p, i) => (
            <div key={i} className="border rounded p-2">
              <div className="mb-2">{i + 1}. {p}</div>
              <div className="btn-group w-100" role="group" aria-label={`Pernyataan ${i + 1}`}>
                <button type="button" className={`btn ${j[i] === true ? "btn-success" : "btn-outline-success"}`} onClick={() => set(i, true)}>Benar</button>
                <button type="button" className={`btn ${j[i] === false ? "btn-danger" : "btn-outline-danger"}`} onClick={() => set(i, false)}>Salah</button>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "ISIAN":
      return <input className="form-control form-control-lg" placeholder="Tulis jawabanmu" aria-label="Jawaban" value={nilai ?? ""} onChange={(e) => ubah(e.target.value)} />;
    case "URAIAN":
      return <textarea className="form-control fs-5" rows={6} placeholder="Tulis jawabanmu" aria-label="Jawaban" value={nilai ?? ""} onChange={(e) => ubah(e.target.value)} />;
    case "MENJODOHKAN": {
      const j = Array.isArray(nilai) ? nilai : soal.kiri.map(() => null);
      const pasang = (kanan) => {
        if (aktif == null) return;
        ubah(soal.kiri.map((_, k) => (k === aktif ? kanan : j[k] === kanan ? null : j[k] ?? null)));
        const berikut = soal.kiri.findIndex((_, k) => k !== aktif && j[k] == null);
        setAktif(berikut >= 0 ? berikut : null);
      };
      const teksKanan = (i) => soal.kanan.find((k) => k.i === i)?.teks;
      return (
        <>
          <div className="small text-muted mb-2">Ketuk kotak di kiri, lalu ketuk pasangannya di bawah.</div>
          <div className="d-flex flex-column gap-2 mb-3">
            {soal.kiri.map((kiri, k) => (
              <button key={k} type="button" onClick={() => setAktif(aktif === k ? null : k)} aria-pressed={aktif === k} aria-label={`Pasangkan ${kiri}`}
                className={`btn text-start d-flex align-items-center gap-2 ${aktif === k ? "btn-primary" : j[k] != null ? "btn-outline-success" : "btn-outline-secondary"}`}>
                <span className="fw-semibold flex-grow-1">{kiri}</span>
                <i className="bi bi-arrow-right"></i>
                <span className={`flex-grow-1 text-end ${j[k] == null ? "opacity-50" : ""}`}>{j[k] != null ? teksKanan(j[k]) : "pilih pasangan"}</span>
              </button>
            ))}
          </div>
          <div className="d-flex flex-wrap gap-2" aria-label="Pilihan pasangan">
            {soal.kanan.map((p) => {
              const dipakai = j.indexOf(p.i);
              return (
                <button key={p.i} type="button" disabled={aktif == null} onClick={() => pasang(p.i)}
                  className={`btn ${dipakai >= 0 ? "btn-light border text-muted" : "btn-outline-primary"}`}>
                  {p.teks}{dipakai >= 0 && <span className="badge text-bg-secondary ms-1">{dipakai + 1}</span>}
                </button>
              );
            })}
          </div>
        </>
      );
    }
    case "MENGURUTKAN": {
      const urutan = Array.isArray(nilai) && nilai.every((x) => x != null) ? nilai : soal.langkah.map((l) => l.i);
      const teks = (i) => soal.langkah.find((l) => l.i === i)?.teks;
      const geser = (a, b) => {
        if (b < 0 || b >= urutan.length) return;
        const baru = [...urutan];
        [baru[a], baru[b]] = [baru[b], baru[a]];
        ubah(baru);
      };
      return (
        <>
          <div className="small text-muted mb-2">Susun dengan tombol panah sampai urutannya benar.</div>
          <ol className="list-unstyled d-flex flex-column gap-2 mb-2">
            {urutan.map((i, n) => (
              <li key={i} className="border rounded p-2 d-flex align-items-center gap-2 bg-body">
                <span className="badge text-bg-primary">{n + 1}</span>
                <span className="flex-grow-1">{teks(i)}</span>
                <button type="button" className="btn btn-outline-secondary" disabled={n === 0} onClick={() => geser(n, n - 1)} aria-label={`Naikkan ${teks(i)}`}><i className="bi bi-arrow-up"></i></button>
                <button type="button" className="btn btn-outline-secondary" disabled={n === urutan.length - 1} onClick={() => geser(n, n + 1)} aria-label={`Turunkan ${teks(i)}`}><i className="bi bi-arrow-down"></i></button>
              </li>
            ))}
          </ol>
          {!Array.isArray(nilai) && <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => ubah(urutan)}><i className="bi bi-check2 me-1"></i>Urutan ini sudah benar</button>}
        </>
      );
    }
    case "LENGKAPI_GAMBAR": {
      const j = Array.isArray(nilai) ? nilai : Array.from({ length: soal.jumlah_bagian }, () => null);
      const set = (i, v) => ubah(Array.from({ length: soal.jumlah_bagian }, (_, k) => (k === i ? v || null : j[k] ?? null)));
      return (
        <div className="d-flex flex-column gap-2">
          <div className="small text-muted">Lengkapi bagian bernomor pada gambar.</div>
          {Array.from({ length: soal.jumlah_bagian }, (_, i) => (
            <div key={i} className="input-group input-group-lg">
              <span className="input-group-text fw-bold">{i + 1}</span>
              {soal.bank_kata?.length ? (
                <select className="form-select" aria-label={`Bagian ${i + 1}`} value={j[i] ?? ""} onChange={(e) => set(i, e.target.value)}>
                  <option value="">— pilih —</option>
                  {soal.bank_kata.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              ) : (
                <input className="form-control" aria-label={`Bagian ${i + 1}`} value={j[i] ?? ""} onChange={(e) => set(i, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}
