"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, STATUS, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { minta } from "@/components/banksoal/api";
import { BAGIAN_RPM, LANGKAH_RPM, isiKosong } from "./rpm";
import { cetakModul, unduhWord } from "./cetakModul";
import { VideoTertaut } from "@/components/video/video";

/** Daftar modul ajar RPM; dibuat dari ATP yang disetujui atau dari TP langsung. */
export default function TabModul({ referensi, akses, statusAwal, atpAwal, modulAwal }) {
  const [daftar, setDaftar] = useState(null);
  const [status, setStatus] = useState(statusAwal || "");
  const [buka, setBuka] = useState(modulAwal || null);
  const [baru, setBaru] = useState(!!atpAwal);

  const muat = useCallback(() => {
    minta("GET", `/perangkat-ajar/modul${status ? `?status=${status}` : ""}`).then((r) => setDaftar(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [status]);
  useEffect(() => { muat(); }, [muat]);

  if (buka) return <EditorModul id={buka} referensi={referensi} akses={akses} onKembali={() => { setBuka(null); muat(); }} />;

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Saring status modul">
          {[["", "Semua"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k} className={`btn ${status === k ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setStatus(k)}>{label}</button>
          ))}
        </div>
        {!akses.isKepsek && <button className="btn btn-sm btn-primary ms-auto" onClick={() => setBaru(true)} disabled={!referensi.mapel.length}><i className="bi bi-plus-lg me-1"></i>Modul baru</button>}
      </div>
      {!daftar ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !daftar.length ? (
          <div className="text-center text-muted py-5"><i className="bi bi-journal-richtext fs-1 d-block mb-2"></i>
            {status ? "Tidak ada modul dengan status ini." : <>Belum ada modul ajar. Tekan <b>Modul baru</b>, pilih ATP yang sudah disetujui dan TP-nya, lalu <b>Susun dengan AI</b>.</>}</div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {daftar.map((m) => {
              const st = STATUS[m.status];
              return (
                <div key={m.id_modul} className="card shadow-sm kartu-modul" role="button" tabIndex={0} onClick={() => setBuka(m.id_modul)} onKeyDown={(e) => e.key === "Enter" && setBuka(m.id_modul)}>
                  <div className="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
                    <div className="me-auto min-w-0">
                      <div className="fw-semibold">{m.judul}</div>
                      <div className="small text-muted">{m.mapel?.nama_mapel}{m.kelas && ` · ${m.kelas.nama_kelas}`}{m.materi && ` · ${m.materi.nama_materi}`} · {m.jumlah_pertemuan} pertemuan · {(m.tp || []).length} TP · {m.pembuat?.name}</div>
                      {m.pertemuan_selesai > 0 && (
                        <div className="progress mt-1" style={{ height: 6, maxWidth: 220 }} title={`${m.pertemuan_selesai} dari ${m.jumlah_pertemuan} pertemuan selesai menurut Jadwal`}>
                          <div className="progress-bar bg-success" style={{ width: `${Math.min(100, (m.pertemuan_selesai / m.jumlah_pertemuan) * 100)}%` }}></div>
                        </div>
                      )}
                      {m.status === "REVISI" && m.catatan_revisi && <div className="small text-danger"><i className="bi bi-chat-left-text me-1"></i>{m.catatan_revisi}</div>}
                    </div>
                    {m.sumber === "AI" && <span className="badge text-bg-light border fw-normal"><i className="bi bi-magic me-1"></i>AI</span>}
                    <span className={`badge text-bg-${st.warna}`}><i className={`bi ${st.icon} me-1`}></i>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {baru && <ModalModulBaru referensi={referensi} atpAwal={atpAwal} onTutup={() => setBaru(false)} onDibuat={(id) => { setBaru(false); setBuka(id); }} />}
    </div>
  );
}

function ModalModulBaru({ referensi, atpAwal, onTutup, onDibuat }) {
  const [daftarAtp, setDaftarAtp] = useState([]);
  const [idAtp, setIdAtp] = useState(atpAwal || "");
  const [atp, setAtp] = useState(null);
  const [f, setF] = useState({ judul: "", id_mapel: referensi.mapel[0]?.id_mapel || "", id_kelas: "", id_materi: "", tp: [], jumlah_pertemuan: 1, jp_per_pertemuan: "" });
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { minta("GET", "/perangkat-ajar/atp?status=DISETUJUI").then((r) => setDaftarAtp(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!idAtp) return setAtp(null);
    let batal = false;
    minta("GET", `/perangkat-ajar/atp/${idAtp}`).then((r) => {
      if (batal) return;
      setAtp(r.data);
      // Pertahankan TP yang sudah dicentang bila masih ada di ATP ini (jangan hapus pilihan guru saat data dimuat ulang)
      const ada = new Set(r.data.baris.map((b) => b.id_indikator));
      setF((x) => ({ ...x, id_mapel: r.data.id_mapel, id_kelas: r.data.id_kelas || "", tp: x.tp.filter((t) => ada.has(t)) }));
    }).catch((err) => !batal && Swal.fire("Gagal", err.message, "error"));
    return () => { batal = true; };
  }, [idAtp]);

  // Pilihan TP: baris ATP (urutan ATP) atau TP materi yang dipilih
  const pilihanTp = useMemo(() => {
    if (atp) return atp.baris.filter((b) => b.indikator).map((b) => ({ id: b.id_indikator, teks: b.indikator.deskripsi, materi: b.materi?.nama_materi, jp: b.alokasi_jp }));
    const m = referensi.materi.find((x) => x.id_materi === f.id_materi);
    return (m?.indikator || []).map((i) => ({ id: i.id_indikator, teks: i.deskripsi, materi: m.nama_materi }));
  }, [atp, f.id_materi, referensi.materi]);
  const jpTerpilih = pilihanTp.filter((t) => f.tp.includes(t.id)).reduce((s, t) => s + (Number(t.jp) || 0), 0);

  const toggleTp = (t) => setF((x) => {
    const tp = x.tp.includes(t.id) ? x.tp.filter((y) => y !== t.id) : [...x.tp, t.id];
    const pertama = pilihanTp.find((p) => p.id === tp[0]);
    return { ...x, tp, judul: x.judulDiketik ? x.judul : (pertama ? pertama.teks.slice(0, 120) : "") };
  });

  const simpan = async (e) => {
    e.preventDefault();
    if (!f.tp.length) return Swal.fire("Pilih TP", "Centang minimal satu tujuan pembelajaran yang dicakup modul ini.", "info");
    setProses(true);
    try {
      const r = await minta("POST", "/perangkat-ajar/modul", { judul: f.judul.trim() || "Modul ajar", id_mapel: f.id_mapel, id_kelas: f.id_kelas || null,
        id_periode: atp?.id_periode || null, id_atp: idAtp || null, id_materi: f.id_materi || null, tp: f.tp,
        jumlah_pertemuan: Number(f.jumlah_pertemuan) || 1, jp_per_pertemuan: f.jp_per_pertemuan ? Number(f.jp_per_pertemuan) : null });
      onDibuat(r.data.id_modul);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Modul ajar baru">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header"><h5 className="modal-title fw-bold">Modul ajar baru</h5><button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button></div>
            <div className="modal-body">
              <label className="form-label small mb-1" htmlFor="mdAtp">Dari ATP yang disetujui</label>
              <select id="mdAtp" className="form-select mb-2" value={idAtp} onChange={(e) => setIdAtp(e.target.value)}>
                <option value="">Tanpa ATP (pilih materi & TP langsung)</option>
                {daftarAtp.map((a) => <option key={a.id_atp} value={a.id_atp}>{a.judul}</option>)}
              </select>
              {!idAtp && (
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <label className="form-label small mb-1" htmlFor="mdMapel">Mata pelajaran</label>
                    <select id="mdMapel" className="form-select" value={f.id_mapel} onChange={(e) => { set("id_mapel", e.target.value); set("id_materi", ""); set("tp", []); }}>
                      {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="form-label small mb-1" htmlFor="mdKelas">Kelas</label>
                    <select id="mdKelas" className="form-select" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                      <option value="">—</option>
                      {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
                    </select>
                  </div>
                  <div className="col-md-5">
                    <label className="form-label small mb-1" htmlFor="mdMateri">Materi</label>
                    <select id="mdMateri" className="form-select" value={f.id_materi} onChange={(e) => { set("id_materi", e.target.value); set("tp", []); }}>
                      <option value="">Pilih materi…</option>
                      {referensi.materi.filter((m) => m.id_mapel === f.id_mapel && (!f.id_kelas || !m.id_kelas || m.id_kelas === f.id_kelas)).map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="form-label small mb-1">Tujuan pembelajaran yang dicakup</div>
              <div className="border rounded p-2 mb-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                {!pilihanTp.length ? <div className="small text-muted">{idAtp ? "ATP ini belum berisi TP." : "Pilih materi dulu."}</div>
                  : pilihanTp.map((t) => (
                    <div key={t.id} className="form-check">
                      <input className="form-check-input" type="checkbox" id={`tp-${t.id}`} checked={f.tp.includes(t.id)} onChange={() => toggleTp(t)} />
                      <label className="form-check-label small" htmlFor={`tp-${t.id}`}>{t.teks} <span className="text-muted">{t.materi && `· ${t.materi}`}{t.jp ? ` · ${t.jp} JP` : ""}</span></label>
                    </div>
                  ))}
              </div>
              <div className="row g-2">
                <div className="col-6 col-md-3">
                  <label className="form-label small mb-1" htmlFor="mdPertemuan">Jumlah pertemuan</label>
                  <input id="mdPertemuan" type="number" min={1} max={12} className="form-control" value={f.jumlah_pertemuan} onChange={(e) => set("jumlah_pertemuan", e.target.value)} />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label small mb-1" htmlFor="mdJp">JP per pertemuan</label>
                  <input id="mdJp" type="number" min={1} max={12} className="form-control" value={f.jp_per_pertemuan} onChange={(e) => set("jp_per_pertemuan", e.target.value)} />
                </div>
                <div className="col-md-6">
                  <label className="form-label small mb-1" htmlFor="mdJudul">Judul</label>
                  <input id="mdJudul" className="form-control" maxLength={200} value={f.judul} onChange={(e) => setF((x) => ({ ...x, judul: e.target.value, judulDiketik: true }))} />
                </div>
              </div>
              {jpTerpilih > 0 && <div className="form-text">Alokasi di ATP untuk TP terpilih: {jpTerpilih} JP.</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup}>Batal</button>
              <button className="btn btn-primary" disabled={proses}><i className="bi bi-check2 me-1"></i>Buat modul</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

const Teks = ({ label, bantuan, nilai, ubah, baris = 3, bisa }) => (
  <div className="mb-2">
    <label className="form-label small fw-semibold mb-0">{label}</label>
    {bantuan && <div className="form-text mt-0 mb-1">{bantuan}</div>}
    <textarea className="form-control form-control-sm" rows={baris} aria-label={label} value={nilai || ""} readOnly={!bisa} onChange={(e) => ubah(e.target.value)} />
  </div>
);

function EditorModul({ id, referensi, akses, onKembali }) {
  const [m, setM] = useState(null);
  const [isi, setIsi] = useState(isiKosong());
  const [paket, setPaket] = useState([]);
  const [video, setVideo] = useState([]);
  const muatVideo = useCallback(() => minta("GET", `/video-belajar/tautan?jenis=MODUL&id_target=${id}`).then((r) => setVideo(r.data)).catch(() => {}), [id]);
  useEffect(() => { muatVideo(); }, [muatVideo]);
  const [kotor, setKotor] = useState(false);
  const [proses, setProses] = useState(null);
  const [pakaiAi, setPakaiAi] = useState(null); // ai_mode bila isi berasal dari AI

  const terima = useCallback((d) => { setM(d); setIsi(d.isi); setKotor(false); }, []);
  useEffect(() => {
    minta("GET", `/perangkat-ajar/modul/${id}`).then((r) => terima(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
    minta("GET", `/perangkat-ajar/modul/${id}/paket`).then((r) => setPaket(r.data)).catch(() => {});
  }, [id, terima]);
  useEffect(() => {
    if (!kotor) return;
    const tahan = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [kotor]);

  if (!m) return <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat modul…</div>;
  const bisa = akses.isAdmin || m.dibuat_oleh === akses.user?.id;
  const st = STATUS[m.status];
  const ubahBagian = (kunci, k, v) => { setIsi((x) => ({ ...x, [kunci]: { ...x[kunci], [k]: v } })); setKotor(true); };
  const ubahPertemuan = (i, k, v) => { setIsi((x) => ({ ...x, pertemuan: x.pertemuan.map((p, j) => (j === i ? { ...p, [k]: v } : p)) })); setKotor(true); };
  const ubahIsi = (k, v) => { setIsi((x) => ({ ...x, [k]: v })); setKotor(true); };

  const simpan = async (extra = {}) => {
    if (["DISETUJUI", "DIAJUKAN"].includes(m.status)) {
      const ok = await Swal.fire({ title: "Simpan perubahan?", text: "Modul ini akan kembali menjadi draf dan perlu diajukan ulang.", icon: "question", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return false;
    }
    setProses("simpan");
    try {
      const r = await minta("PUT", `/perangkat-ajar/modul/${id}`, { isi, ...(pakaiAi ? { sumber: "AI", ai_mode: pakaiAi } : {}), ...extra });
      terima(r.data); setPakaiAi(null);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Modul disimpan", showConfirmButton: false, timer: 1500 });
      return true;
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); return false; }
    finally { setProses(null); }
  };

  const susunAi = async () => {
    const pilihan = await Swal.fire({
      title: "Susun modul dengan AI",
      html: `AI menyusun modul RPM untuk <b>${(m.tp || []).length} TP</b> dalam <b>${m.jumlah_pertemuan} pertemuan</b>, memakai CP dan data kelas (gaya belajar, minat, capaian TP, siswa yang perlu pendampingan; tanpa nama siswa).${kotor || isi.desain?.tujuan ? "<br><b>Isi sekarang akan diganti</b> (belum tersimpan sampai Anda menekan Simpan)." : ""}`
        + `<select id="aiMode" class="form-select mt-3">${AI_MODES.map((x) => `<option value="${x.value}"${x.value === bacaAiMode() ? " selected" : ""}>${x.label}</option>`).join("")}</select>`
        + `<textarea id="aiCatatan" class="form-control mt-2" rows="3" placeholder="Catatan untuk AI (opsional), mis. pakai permainan tradisional atau kebun sekolah"></textarea>`,
      showCancelButton: true, confirmButtonText: "Susun", cancelButtonText: "Batal",
      preConfirm: () => ({ mode: document.getElementById("aiMode").value, catatan: document.getElementById("aiCatatan").value }),
    });
    if (!pilihan.isConfirmed) return;
    simpanAiMode(pilihan.value.mode);
    setProses("ai");
    Swal.fire({ title: "AI sedang menyusun modul…", html: "Biasanya 30–120 detik.", allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    try {
      const r = await minta("POST", `/perangkat-ajar/modul/${id}/ai`, { ai_mode: pilihan.value.mode, catatan: pilihan.value.catatan || null });
      setIsi(r.isi); setKotor(true); setPakaiAi(pilihan.value.mode);
      Swal.fire({ icon: "success", title: "Draf modul siap", text: r.message });
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(null); }
  };

  const aksi = async (jalur, konfirmasi, body) => {
    if (kotor && !(await simpan())) return;
    if (konfirmasi) {
      const ok = await Swal.fire({ title: konfirmasi, icon: "question", showCancelButton: true, confirmButtonText: "Ya", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return;
    }
    setProses(jalur);
    try {
      const r = await minta("POST", `/perangkat-ajar/modul/${id}/${jalur}`, body);
      Swal.fire({ icon: "success", title: r.message, timer: 2500, showConfirmButton: false });
      terima((await minta("GET", `/perangkat-ajar/modul/${id}`)).data);
    } catch (err) { Swal.fire("Belum bisa", err.message, "warning"); }
    finally { setProses(null); }
  };
  const kembalikan = async () => {
    const r = await Swal.fire({ title: "Kembalikan ke guru", input: "textarea", inputLabel: "Catatan perbaikan", inputValidator: (v) => (!v?.trim() ? "Tulis catatan perbaikannya." : undefined), showCancelButton: true, confirmButtonText: "Kembalikan", cancelButtonText: "Batal" });
    if (r.isConfirmed) aksi("revisi", null, { catatan: r.value });
  };
  const hapus = async () => {
    const ok = await Swal.fire({ title: "Hapus modul ini?", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/perangkat-ajar/modul/${id}`); onKembali(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const tutup = async () => {
    if (kotor) {
      const ok = await Swal.fire({ title: "Perubahan belum disimpan", text: "Tinggalkan tanpa menyimpan?", icon: "warning", showCancelButton: true, confirmButtonText: "Tinggalkan", cancelButtonText: "Kembali" });
      if (!ok.isConfirmed) return;
    }
    onKembali();
  };
  const dokumen = { ...m, isi, paket: paket.find((p) => p.id_paket === m.id_paket) || m.paket };

  const bagian = (b) => (
    <div className="card shadow-sm mb-3" key={b.kunci}>
      <div className="card-header fw-semibold">{b.judul}</div>
      <div className="card-body">
        {b.isian.map((x) => <Teks key={x.k} label={x.label} bantuan={x.bantuan} nilai={isi[b.kunci]?.[x.k]} ubah={(v) => ubahBagian(b.kunci, x.k, v)} bisa={bisa} baris={x.k === "peserta_didik" ? 4 : 2} />)}
        {b.kunci === "identifikasi" && (
          <div>
            <div className="form-label small fw-semibold mb-1">Dimensi profil lulusan</div>
            <div className="d-flex flex-wrap gap-1">
              {referensi.profil_lulusan.map((p) => {
                const on = (isi.identifikasi?.profil_lulusan || []).includes(p);
                return <button key={p} type="button" disabled={!bisa} aria-pressed={on} className={`btn btn-sm py-0 px-2 ${on ? "btn-info" : "btn-outline-secondary"}`} style={{ fontSize: ".75rem" }}
                  onClick={() => ubahBagian("identifikasi", "profil_lulusan", on ? isi.identifikasi.profil_lulusan.filter((x) => x !== p) : [...(isi.identifikasi?.profil_lulusan || []), p])}>{p}</button>;
              })}
            </div>
          </div>
        )}
        {b.kunci === "asesmen" && (
          <div>
            <label className="form-label small fw-semibold mb-1" htmlFor="mdPaket">Paket soal untuk asesmen akhir</label>
            <select id="mdPaket" className="form-select form-select-sm" disabled={!bisa} value={m.id_paket || ""} onChange={(e) => { setM((x) => ({ ...x, id_paket: e.target.value || null })); simpan({ id_paket: e.target.value || null }); }}>
              <option value="">— tidak ditautkan —</option>
              {paket.map((p) => <option key={p.id_paket} value={p.id_paket}>{p.judul}{p.tanggal ? ` (${p.tanggal})` : ""}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="editor-modul">
      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={tutup} aria-label="Kembali ke daftar modul"><i className="bi bi-arrow-left"></i></button>
        <div className="me-auto min-w-0">
          <div className="fw-bold fs-5">{m.judul}</div>
          <div className="small text-muted">{m.mapel?.nama_mapel}{m.kelas && ` · ${m.kelas.nama_kelas}`}{m.fase && ` · Fase ${m.fase}`}{m.materi && ` · ${m.materi.nama_materi}`} · {m.jumlah_pertemuan} pertemuan{m.jp_per_pertemuan ? ` × ${m.jp_per_pertemuan} JP` : ""}
            {" "}<span className={`badge text-bg-${st.warna} ms-1`}>{st.label}</span>{m.versi > 1 && <span className="badge text-bg-light border ms-1">v{m.versi}</span>}</div>
          {m.status === "REVISI" && m.catatan_revisi && <div className="alert alert-danger py-1 px-2 small mt-1 mb-0"><b>Catatan kepala sekolah:</b> {m.catatan_revisi}</div>}
        </div>
        <div className="d-flex flex-wrap gap-1">
          {bisa && <button className="btn btn-sm btn-outline-primary" onClick={susunAi} disabled={!!proses}><i className="bi bi-stars me-1"></i>Susun dengan AI</button>}
          {bisa && <button className="btn btn-sm btn-primary" onClick={() => simpan()} disabled={!kotor || !!proses}><i className="bi bi-save me-1"></i>Simpan</button>}
          {bisa && ["DRAF", "REVISI"].includes(m.status) && <button className="btn btn-sm btn-success" onClick={() => aksi("ajukan", "Ajukan modul ke kepala sekolah?")} disabled={!!proses}><i className="bi bi-send me-1"></i>Ajukan</button>}
          {bisa && m.status === "DIAJUKAN" && <button className="btn btn-sm btn-outline-secondary" onClick={() => aksi("tarik")} disabled={!!proses}>Tarik</button>}
          {akses.isKepsek && m.status === "DIAJUKAN" && <>
            <button className="btn btn-sm btn-success" onClick={() => aksi("setujui", "Setujui modul ajar ini?")} disabled={!!proses}><i className="bi bi-patch-check me-1"></i>Setujui</button>
            <button className="btn btn-sm btn-outline-danger" onClick={kembalikan} disabled={!!proses}><i className="bi bi-arrow-counterclockwise me-1"></i>Kembalikan</button>
          </>}
          <button className="btn btn-sm btn-outline-secondary" onClick={() => cetakModul(dokumen, referensi.sekolah) || Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini.", "info")}><i className="bi bi-printer me-1"></i>Cetak</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => unduhWord(dokumen, referensi.sekolah)}><i className="bi bi-file-earmark-word me-1"></i>Word</button>
          {bisa && <button className="btn btn-sm btn-outline-danger" onClick={hapus} disabled={!!proses} aria-label="Hapus modul"><i className="bi bi-trash"></i></button>}
        </div>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body py-2 small">
          <b>Tujuan pembelajaran yang dicakup:</b>
          <ol className="mb-0">{(m.tp_detail || []).map((t) => <li key={t.id_indikator}>{t.deskripsi} <span className="text-muted">· {t.materi?.nama_materi}</span></li>)}</ol>
          {m.atp && <div className="text-muted mt-1"><i className="bi bi-diagram-3 me-1"></i>Dari {m.atp.judul}</div>}
        </div>
      </div>

      {bagian(BAGIAN_RPM[0])}
      {bagian(BAGIAN_RPM[1])}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-semibold">C. Pengalaman Belajar</div>
        <div className="card-body">
          {isi.pertemuan.map((p, i) => (
            <div key={i} className="border rounded p-2 mb-2 pertemuan-modul">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <b>Pertemuan {p.ke}</b>
                {(m.jadwal || []).filter((j) => j.pertemuan_ke === p.ke).map((j) => (
                  <span key={j.id_jadwal} className={`badge ${j.status_sesi === "Selesai" ? "text-bg-success" : "text-bg-light border"} fw-normal`}>
                    <i className={`bi ${j.status_sesi === "Selesai" ? "bi-check2-circle" : "bi-calendar-event"} me-1`}></i>
                    {new Date(j.mulai).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}{j.status_sesi === "Selesai" ? " · selesai" : ""}
                  </span>
                ))}
                <input type="number" min={0} max={40} className="form-control form-control-sm" style={{ width: 80 }} aria-label={`JP pertemuan ${p.ke}`} placeholder="JP" readOnly={!bisa} value={p.jp ?? ""} onChange={(e) => ubahPertemuan(i, "jp", e.target.value === "" ? null : Number(e.target.value))} />
                <span className="small text-muted">JP</span>
              </div>
              {LANGKAH_RPM.map((l) => <Teks key={l.k} label={l.label} bantuan={i === 0 ? l.bantuan : undefined} nilai={p[l.k]} ubah={(v) => ubahPertemuan(i, l.k, v)} bisa={bisa} baris={["memahami", "mengaplikasi"].includes(l.k) ? 4 : 2} />)}
              <div className="small fw-semibold mb-1"><i className="bi bi-play-btn me-1"></i>Video belajar pertemuan {p.ke}</div>
              <VideoTertaut jenis="MODUL" idTarget={id} pertemuanKe={p.ke} idMapel={m.id_mapel} bisa={bisa} data={video} onBerubah={muatVideo} />
            </div>
          ))}
        </div>
      </div>
      {bagian(BAGIAN_RPM[2])}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-semibold">Diferensiasi dan LKPD</div>
        <div className="card-body">
          <Teks label="Diferensiasi" bantuan="Dukungan untuk siswa yang belum mencapai TP prasyarat dan tantangan untuk yang sudah mahir" nilai={isi.diferensiasi} ubah={(v) => ubahIsi("diferensiasi", v)} bisa={bisa} baris={3} />
          <Teks label="Lembar kerja peserta didik (LKPD)" nilai={isi.lkpd} ubah={(v) => ubahIsi("lkpd", v)} bisa={bisa} baris={6} />
        </div>
      </div>
    </div>
  );
}
