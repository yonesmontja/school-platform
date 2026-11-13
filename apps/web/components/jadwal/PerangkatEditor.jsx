"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { minta } from "@/components/banksoal/api";
import { JENIS_MAP, JENIS_PERANGKAT } from "./perangkat";

const cacheData = new Map(); // id_mapel|id_kelas → isi panel (sekali muat per form)
const cocok = (teks, q) => !q || String(teks || "").toLowerCase().includes(q);
const durasi = (d) => (d ? `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}` : "");

/**
 * Ruang isian sesi jadwal bergaya editor: toolbar perangkat ajar (ATP/TP, modul, CP, indikator, materi, bank soal, video),
 * kartu perangkat yang tertaut, dan catatan persiapan. Mengetik "/" di catatan membuka menu tautan cepat.
 * Klik satu jenis → panel kanan berisi perangkat mapel sesi ini (kosong bila memang belum disusun).
 */
export default function PerangkatEditor({ f, ubah, refData }) {
  const [panel, setPanel] = useState(null);
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState(null);
  const [cari, setCari] = useState("");
  const [menuSlash, setMenuSlash] = useState(false);
  const teksRef = useRef(null);
  const kunci = `${f.id_mapel}|${f.id_kelas}`;
  const namaMapel = refData?.subjects?.find((s) => s.id_mapel === f.id_mapel)?.nama_mapel;
  const bisa = f.jenis === "kbm" && !!f.id_mapel;

  // Isi panel dimuat di latar begitu mapel/kelas dipilih, agar panel langsung terbuka saat diklik
  useEffect(() => {
    if (!bisa) return;
    let aktif = true;
    const q = new URLSearchParams({ id_mapel: f.id_mapel, ...(f.id_kelas ? { id_kelas: f.id_kelas } : {}) });
    if (!cacheData.has(kunci)) cacheData.set(kunci, minta("GET", `/jadwal/perangkat?${q}`).catch((e) => { cacheData.delete(kunci); throw e; }));
    setData(null); setGalat(null); setMemuat(true);
    cacheData.get(kunci)
      .then((r) => aktif && setData(r))
      .catch((e) => aktif && setGalat(e.message))
      .finally(() => aktif && setMemuat(false));
    return () => { aktif = false; };
  }, [bisa, kunci, f.id_mapel, f.id_kelas]);

  useEffect(() => {
    if (!panel) return;
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setPanel(null); } };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [panel]);

  const buka = (jenis) => { setCari(""); setPanel(jenis); setMenuSlash(false); };

  // ---- pilihan ----
  const terpilih = (jenis, id) => (f.perangkat || []).some((p) => p.jenis === jenis && String(p.id) === String(id));
  const toggle = (jenis, id, label, ekstra = {}) => {
    const ada = terpilih(jenis, id);
    ubah({ perangkat: ada ? f.perangkat.filter((p) => !(p.jenis === jenis && String(p.id) === String(id))) : [...(f.perangkat || []), { jenis, id: String(id), label, ...ekstra }] });
  };
  const videoIds = f.video_ids || [];
  const toggleVideo = (v) => ubah({
    video_ids: videoIds.includes(v.id_video) ? videoIds.filter((x) => x !== v.id_video) : [...videoIds, v.id_video],
    videoInfo: { ...(f.videoInfo || {}), [v.id_video]: v.judul },
  });
  const pilihModul = (m) => ubah(f.id_modul === m.id_modul
    ? { id_modul: "", pertemuan_ke: "" }
    : { id_modul: m.id_modul, pertemuan_ke: f.pertemuan_ke || "1", ...(m.id_materi ? { id_materi: m.id_materi } : {}) });
  const pilihMateri = (m) => ubah({ id_materi: f.id_materi === m.id_materi ? "" : m.id_materi });

  // ---- kartu tertaut (urut seperti toolbar) ----
  const namaModul = (refData?.modul || []).find((m) => m.id_modul === f.id_modul)?.judul || data?.modul?.find((m) => m.id_modul === f.id_modul)?.judul;
  const namaMateri = (refData?.materi || []).find((m) => m.id_materi === f.id_materi)?.nama_materi;
  const kartu = [
    ...(f.perangkat || []).filter((p) => p.jenis === "ATP"),
    ...(f.id_modul ? [{ jenis: "MODUL", id: f.id_modul, label: `${namaModul || "Modul ajar"}${f.pertemuan_ke ? ` · pertemuan ${f.pertemuan_ke}` : ""}` }] : []),
    ...(f.perangkat || []).filter((p) => p.jenis === "CP"),
    ...(f.perangkat || []).filter((p) => p.jenis === "INDIKATOR"),
    ...(f.id_materi ? [{ jenis: "MATERI", id: f.id_materi, label: namaMateri || "Materi" }] : []),
    ...(f.perangkat || []).filter((p) => p.jenis === "SOAL"),
    ...(f.perangkat || []).filter((p) => p.jenis === "TEMA"),
    ...videoIds.map((id) => ({ jenis: "VIDEO", id, label: f.videoInfo?.[id] || "Video belajar" })),
  ];
  const lepas = (k) => {
    if (k.jenis === "MODUL") return ubah({ id_modul: "", pertemuan_ke: "" });
    if (k.jenis === "MATERI") return ubah({ id_materi: "" });
    if (k.jenis === "VIDEO") return ubah({ video_ids: videoIds.filter((x) => x !== k.id) });
    toggle(k.jenis, k.id);
  };
  const jumlah = (jenis) => kartu.filter((k) => k.jenis === jenis).length;

  // ---- "/" membuka menu tautan cepat ----
  const ketik = (e) => {
    const v = e.target.value;
    const pos = e.target.selectionStart;
    if (bisa && v[pos - 1] === "/" && (pos === 1 || /\s/.test(v[pos - 2]))) setMenuSlash(true);
    else if (menuSlash) setMenuSlash(false);
    ubah({ catatan: v });
  };
  const pilihSlash = (jenis) => {
    const el = teksRef.current;
    const pos = el?.selectionStart ?? f.catatan.length;
    if (f.catatan[pos - 1] === "/") ubah({ catatan: f.catatan.slice(0, pos - 1) + f.catatan.slice(pos) });
    buka(jenis);
  };

  const q = cari.trim().toLowerCase();
  const info = panel ? JENIS_MAP[panel] : null;

  const isiPanel = useMemo(() => {
    if (!data || !panel) return null;
    if (panel === "ATP") return data.atp.map((a) => ({ ...a, baris: a.baris.filter((b) => cocok(`${b.tp} ${b.materi}`, q)) })).filter((a) => a.baris.length || cocok(a.judul, q));
    if (panel === "CP") return data.cp.filter((c) => cocok(`${c.elemen} ${c.teks}`, q));
    if (panel === "INDIKATOR") {
      const g = {};
      data.indikator.filter((i) => cocok(`${i.deskripsi} ${i.nama_materi}`, q)).forEach((i) => { (g[i.nama_materi || "Tanpa materi"] ||= []).push(i); });
      return Object.entries(g);
    }
    if (panel === "MATERI") return data.materi.filter((m) => cocok(m.nama_materi, q));
    if (panel === "MODUL") return data.modul.filter((m) => cocok(m.judul, q));
    if (panel === "SOAL") return data.soal.filter((s) => cocok(`${s.pertanyaan} ${s.nama_materi}`, q));
    if (panel === "VIDEO") return data.video.filter((v) => cocok(v.judul, q));
    if (panel === "TEMA") return (data.tema || []).filter((t) => cocok(`${t.judul} ${t.kategori || ""}`, q));
    return null;
  }, [data, panel, q]);
  const kosong = isiPanel && (Array.isArray(isiPanel) ? isiPanel.length === 0 : false);

  const Cek = ({ aktif, radio }) => <span className={`pa-cek${radio ? " radio" : ""}${aktif ? " on" : ""}`} aria-hidden="true">{aktif && <i className="bi bi-check-lg"></i>}</span>;
  const Draf = ({ status }) => (status && status !== "DISETUJUI" ? <span className="badge text-bg-light border ms-1 fw-normal">{status === "DIAJUKAN" ? "diajukan" : "draf"}</span> : null);

  return (
    <>
      <div className={`pa-editor${bisa ? "" : " is-off"}`}>
        <div className="pa-toolbar" role="toolbar" aria-label="Tautkan perangkat ajar">
          {JENIS_PERANGKAT.map((j) => (
            <button key={j.id} type="button" className={`pa-tool${panel === j.id ? " active" : ""}`} style={{ "--pa": j.warna }} disabled={!bisa}
              onClick={() => (panel === j.id ? setPanel(null) : buka(j.id))} title={bisa ? `Tautkan ${j.label}` : "Pilih mata pelajaran (KBM) lebih dulu"}>
              <i className={`bi ${j.ikon}`}></i><span>{j.singkat || j.label}</span>{jumlah(j.id) > 0 && <b className="pa-count">{jumlah(j.id)}</b>}
            </button>
          ))}
        </div>

        {kartu.length > 0 && (
          <div className="pa-cards">
            {kartu.map((k) => {
              const j = JENIS_MAP[k.jenis];
              return (
                <span key={`${k.jenis}-${k.id}`} className="pa-chip" style={{ "--pa": j.warna }} title={k.label}>
                  <i className={`bi ${j.ikon}`}></i><span className="pa-chip-jenis">{j.singkat || j.label}</span><span className="pa-chip-label">{k.label}</span>
                  <button type="button" onClick={() => lepas(k)} aria-label={`Lepas ${j.label}: ${k.label}`}><i className="bi bi-x"></i></button>
                </span>
              );
            })}
          </div>
        )}

        <div className="position-relative">
          <textarea ref={teksRef} className="pa-text" rows="4" maxLength={3000} value={f.catatan} onChange={ketik}
            aria-label="Persiapan alat, keselamatan & catatan guru"
            placeholder={bisa ? "Persiapan alat, keselamatan & catatan guru… Ketik / untuk menautkan perangkat ajar." : "Persiapan alat, keselamatan & catatan…"} />
          {menuSlash && (
            <div className="pa-slash shadow" role="menu">
              <div className="small text-body-secondary px-2 pb-1">Tautkan perangkat ajar</div>
              {JENIS_PERANGKAT.map((j) => (
                <button key={j.id} type="button" role="menuitem" onMouseDown={(e) => { e.preventDefault(); pilihSlash(j.id); }}>
                  <i className={`bi ${j.ikon}`} style={{ color: j.warna }}></i>{j.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!bisa && <div className="pa-hint"><i className="bi bi-info-circle me-1"></i>Pilih mata pelajaran untuk menautkan ATP, modul ajar, CP, indikator, materi, bank soal, dan video.</div>}
      </div>

      {panel && info && (
        <aside className="pa-panel" aria-label={`Panel ${info.label}`} style={{ "--pa": info.warna }}>
          <div className="pa-panel-head">
            <div className="d-flex align-items-center gap-2 min-w-0">
              <span className="pa-panel-ikon"><i className={`bi ${info.ikon}`}></i></span>
              <div className="min-w-0">
                <div className="fw-bold">{info.label}</div>
                <div className="small text-body-secondary text-truncate">{namaMapel}{f.id_kelas ? ` · ${refData?.classes?.find((k) => k.id_kelas === f.id_kelas)?.nama_kelas || ""}` : ""}</div>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={() => setPanel(null)} aria-label="Tutup panel"></button>
          </div>
          <div className="px-3 pb-2">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><i className="bi bi-search"></i></span>
              <input type="search" className="form-control" placeholder={`Cari ${info.label.toLowerCase()}…`} value={cari} onChange={(e) => setCari(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="pa-panel-body">
            {memuat ? <div className="text-body-secondary small p-3"><span className="spinner-border spinner-border-sm me-2"></span>Memuat {info.label.toLowerCase()}…</div>
              : galat ? <div className="alert alert-warning small m-3">{galat}</div>
              : kosong ? (
                <div className="pa-kosong">
                  <i className={`bi ${info.ikon}`}></i>
                  <div className="fw-semibold">{q ? "Tidak ada yang cocok." : info.kosong}</div>
                  {!q && <Link href={info.buat} target="_blank" className="btn btn-sm btn-outline-primary mt-2"><i className="bi bi-plus-lg me-1"></i>Susun di halaman {info.label}</Link>}
                </div>
              )
              : panel === "ATP" ? isiPanel?.map((a) => (
                <div key={a.id_atp} className="mb-3">
                  <div className="pa-grup">{a.judul}<Draf status={a.status} />{a.periode && <span className="text-body-secondary fw-normal"> · {a.periode}</span>}</div>
                  {a.baris.map((b) => {
                    const label = `TP ${b.urutan || ""}: ${b.tp || b.materi || "(tanpa TP)"}`.replace("TP : ", "TP: ");
                    return (
                      <button key={b.id} type="button" className={`pa-item${terpilih("ATP", b.id) ? " on" : ""}`} onClick={() => toggle("ATP", b.id, label, { atp: a.id_atp })}>
                        <Cek aktif={terpilih("ATP", b.id)} />
                        <span className="min-w-0"><span className="d-block">{b.tp || <i>TP belum diisi</i>}</span>
                          <small className="text-body-secondary">{[b.materi, b.alokasi_jp ? `${b.alokasi_jp} JP` : null, b.minggu ? `minggu ${b.minggu}` : null].filter(Boolean).join(" · ")}</small></span>
                      </button>
                    );
                  })}
                </div>
              ))
              : panel === "CP" ? isiPanel?.map((c) => (
                <button key={c.id_cp} type="button" className={`pa-item${terpilih("CP", c.id_cp) ? " on" : ""}`} onClick={() => toggle("CP", c.id_cp, `${c.elemen} (Fase ${c.fase})`)}>
                  <Cek aktif={terpilih("CP", c.id_cp)} />
                  <span className="min-w-0"><span className="d-block fw-semibold">{c.elemen} <span className="badge text-bg-light border fw-normal">Fase {c.fase}</span></span>
                    <small className="text-body-secondary pa-clamp">{c.teks}</small></span>
                </button>
              ))
              : panel === "INDIKATOR" ? isiPanel?.map(([materi, daftar]) => (
                <div key={materi} className="mb-3">
                  <div className="pa-grup">{materi}</div>
                  {daftar.map((i) => (
                    <button key={i.id_indikator} type="button" className={`pa-item${terpilih("INDIKATOR", i.id_indikator) ? " on" : ""}`} onClick={() => toggle("INDIKATOR", i.id_indikator, i.deskripsi)}>
                      <Cek aktif={terpilih("INDIKATOR", i.id_indikator)} /><span>{i.deskripsi}</span>
                    </button>
                  ))}
                </div>
              ))
              : panel === "MATERI" ? isiPanel?.map((m) => (
                <button key={m.id_materi} type="button" className={`pa-item${f.id_materi === m.id_materi ? " on" : ""}`} onClick={() => pilihMateri(m)}>
                  <Cek aktif={f.id_materi === m.id_materi} radio /><span>{m.nama_materi}</span>
                </button>
              ))
              : panel === "MODUL" ? (
                <>
                  {isiPanel?.map((m) => (
                    <button key={m.id_modul} type="button" className={`pa-item${f.id_modul === m.id_modul ? " on" : ""}`} onClick={() => pilihModul(m)}>
                      <Cek aktif={f.id_modul === m.id_modul} radio />
                      <span className="min-w-0"><span className="d-block">{m.judul}<Draf status={m.status} /></span><small className="text-body-secondary">{m.jumlah_pertemuan} pertemuan</small></span>
                    </button>
                  ))}
                  {f.id_modul && <div className="small text-body-secondary px-2 mt-2"><i className="bi bi-info-circle me-1"></i>Atur pertemuan ke berapa di bagian atas formulir.</div>}
                </>
              )
              : panel === "SOAL" ? isiPanel?.map((s) => (
                <button key={s.id_soal} type="button" className={`pa-item${terpilih("SOAL", s.id_soal) ? " on" : ""}`} onClick={() => toggle("SOAL", s.id_soal, s.pertanyaan)}>
                  <Cek aktif={terpilih("SOAL", s.id_soal)} />
                  <span className="min-w-0"><span className="d-block pa-clamp">{s.pertanyaan}</span>
                    <small className="text-body-secondary">{[s.bentuk?.replaceAll("_", " ").toLowerCase(), s.level_kognitif, s.tingkat_kesulitan?.toLowerCase(), s.nama_materi].filter(Boolean).join(" · ")}</small><Draf status={s.status} /></span>
                </button>
              ))
              : panel === "TEMA" ? isiPanel?.map((t) => (
                <button key={t.id_peta} type="button" className={`pa-item${terpilih("TEMA", t.id_peta) ? " on" : ""}`} onClick={() => toggle("TEMA", t.id_peta, t.judul)}>
                  <Cek aktif={terpilih("TEMA", t.id_peta)} />
                  <span className="min-w-0"><span className="d-block">{t.kategori ? <b className="text-uppercase small me-1">{t.kategori}</b> : null}{t.judul}<Draf status={t.status} /></span>
                    <small className="text-body-secondary">{[`${t.jumlah_minggu} minggu`, t.tanggal_mulai ? `mulai ${t.tanggal_mulai}` : null, t.punya_mapel ? "mapel ini termasuk cabangnya" : null].filter(Boolean).join(" · ")}</small></span>
                </button>
              ))
              : panel === "VIDEO" ? isiPanel?.map((v) => (
                <button key={v.id_video} type="button" className={`pa-item${videoIds.includes(v.id_video) ? " on" : ""}`} onClick={() => toggleVideo(v)}>
                  <Cek aktif={videoIds.includes(v.id_video)} />
                  {v.poster_url ? <img src={v.poster_url} alt="" className="pa-poster" /> : <span className="pa-poster"><i className="bi bi-play-fill"></i></span>}
                  <span className="min-w-0"><span className="d-block text-truncate">{v.judul}</span><small className="text-body-secondary">{durasi(v.durasi_detik)}</small><Draf status={v.status} /></span>
                </button>
              ))
              : null}
          </div>
          <div className="pa-panel-foot">
            <small className="text-body-secondary">{jumlah(panel)} dipilih</small>
            <button type="button" className="btn btn-sm btn-primary px-3" onClick={() => setPanel(null)}>Selesai</button>
          </div>
        </aside>
      )}
    </>
  );
}
