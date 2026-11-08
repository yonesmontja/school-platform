"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, DIMENSI, STATUS, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { minta } from "@/components/banksoal/api";
import { cetakAtp } from "./cetakAtp";

const barisKosong = () => ({ id_cp: "", id_materi: "", materi_usulan: "", id_indikator: "", tp_usulan: "", alokasi_jp: "", minggu: "", dimensi: "", profil_lulusan: [], catatan: "" });
const keEditor = (b) => ({ ...barisKosong(), ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ?? (k === "profil_lulusan" ? [] : "")])) });
const periodeLabel = (p) => (p ? `${p.tahun_ajaran} ${p.semester}` : "");

/** Daftar ATP; kartu dibuka ke editor. Kepala sekolah menyetujui atau mengembalikan dengan catatan. */
export default function TabAtp({ referensi, akses, statusAwal, onBuatModul }) {
  const [daftar, setDaftar] = useState(null);
  const [status, setStatus] = useState(statusAwal || "");
  const [buka, setBuka] = useState(null); // id_atp
  const [baru, setBaru] = useState(false);

  const muat = useCallback(() => {
    minta("GET", `/perangkat-ajar/atp${status ? `?status=${status}` : ""}`).then((r) => setDaftar(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [status]);
  useEffect(() => { muat(); }, [muat]);

  if (buka) return <EditorAtp id={buka} referensi={referensi} akses={akses} onBuatModul={onBuatModul} onKembali={() => { setBuka(null); muat(); }} />;

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Saring status">
          {[["", "Semua"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k} className={`btn ${status === k ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setStatus(k)}>{label}</button>
          ))}
        </div>
        {!akses.isKepsek && <button className="btn btn-sm btn-primary ms-auto" onClick={() => setBaru(true)} disabled={!referensi.mapel.length}><i className="bi bi-plus-lg me-1"></i>ATP baru</button>}
      </div>
      {!daftar ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !daftar.length ? (
          <div className="text-center text-muted py-5"><i className="bi bi-diagram-3 fs-1 d-block mb-2"></i>
            {status ? "Tidak ada ATP dengan status ini." : <>Belum ada ATP. Isi CP mapel di tab CP, lalu tekan <b>ATP baru</b> dan <b>Susun dengan AI</b>.</>}</div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {daftar.map((a) => {
              const st = STATUS[a.status];
              return (
                <div key={a.id_atp} className="card shadow-sm kartu-atp" role="button" tabIndex={0} onClick={() => setBuka(a.id_atp)} onKeyDown={(e) => e.key === "Enter" && setBuka(a.id_atp)}>
                  <div className="card-body py-2 d-flex flex-wrap gap-2 align-items-center">
                    <div className="me-auto min-w-0">
                      <div className="fw-semibold">{a.judul}</div>
                      <div className="small text-muted">{a.mapel?.nama_mapel}{a.kelas && ` · ${a.kelas.nama_kelas}`}{a.fase && ` · Fase ${a.fase}`}{a.periode && ` · ${periodeLabel(a.periode)}`} · {a.baris_count} TP · {a.pembuat?.name}</div>
                      {a.status === "REVISI" && a.catatan_revisi && <div className="small text-danger"><i className="bi bi-chat-left-text me-1"></i>{a.catatan_revisi}</div>}
                    </div>
                    <span className={`badge text-bg-${st.warna}`}><i className={`bi ${st.icon} me-1`}></i>{st.label}</span>
                    {a.versi > 1 && <span className="badge text-bg-light border">v{a.versi}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {baru && <ModalAtpBaru referensi={referensi} onTutup={() => setBaru(false)} onDibuat={(id) => { setBaru(false); setBuka(id); }} />}
    </div>
  );
}

function ModalAtpBaru({ referensi, onTutup, onDibuat }) {
  const aktif = referensi.periode.find((p) => p.status_aktif === "AKTIF");
  const [f, setF] = useState({ judul: "", id_mapel: referensi.mapel[0]?.id_mapel || "", id_kelas: "", id_periode: aktif?.id_periode || "", jp_per_minggu: "", minggu_efektif: 18 });
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  // Judul otomatis dari mapel & kelas selama guru belum mengetik sendiri
  const judulOtomatis = useMemo(() => {
    const m = referensi.mapel.find((x) => x.id_mapel === f.id_mapel)?.nama_mapel || "";
    const k = referensi.kelas.find((x) => x.id_kelas === f.id_kelas)?.nama_kelas;
    const p = referensi.periode.find((x) => x.id_periode === f.id_periode);
    return `ATP ${m}${k ? ` Kelas ${k}` : ""}${p ? ` ${p.semester} ${p.tahun_ajaran}` : ""}`;
  }, [f.id_mapel, f.id_kelas, f.id_periode, referensi]);

  const simpan = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const r = await minta("POST", "/perangkat-ajar/atp", { ...f, judul: f.judul.trim() || judulOtomatis, id_kelas: f.id_kelas || null, id_periode: f.id_periode || null,
        jp_per_minggu: f.jp_per_minggu || null, minggu_efektif: f.minggu_efektif || null });
      onDibuat(r.data.id_atp);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); setProses(false); }
  };

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="ATP baru">
        <div className="modal-dialog">
          <form className="modal-content border-0 shadow" onSubmit={simpan}>
            <div className="modal-header"><h5 className="modal-title fw-bold">ATP baru</h5><button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button></div>
            <div className="modal-body">
              <label className="form-label small mb-1" htmlFor="atpMapel">Mata pelajaran</label>
              <select id="atpMapel" className="form-select mb-2" value={f.id_mapel} onChange={(e) => set("id_mapel", e.target.value)}>
                {referensi.mapel.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
              </select>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label small mb-1" htmlFor="atpKelas">Kelas</label>
                  <select id="atpKelas" className="form-select" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                    <option value="">Semua kelas</option>
                    {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}{k.fase ? ` (Fase ${k.fase})` : ""}</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1" htmlFor="atpPeriode">Periode</label>
                  <select id="atpPeriode" className="form-select" value={f.id_periode} onChange={(e) => set("id_periode", e.target.value)}>
                    {referensi.periode.map((p) => <option key={p.id_periode} value={p.id_periode}>{periodeLabel(p)}{p.status_aktif === "AKTIF" ? " (aktif)" : ""}</option>)}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1" htmlFor="atpJp">JP per minggu</label>
                  <input id="atpJp" type="number" min={1} max={60} className="form-control" value={f.jp_per_minggu} onChange={(e) => set("jp_per_minggu", e.target.value)} />
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1" htmlFor="atpMinggu">Minggu efektif</label>
                  <input id="atpMinggu" type="number" min={1} max={40} className="form-control" value={f.minggu_efektif} onChange={(e) => set("minggu_efektif", e.target.value)} />
                </div>
              </div>
              <label className="form-label small mb-1" htmlFor="atpJudul">Judul</label>
              <input id="atpJudul" className="form-control" maxLength={200} value={f.judul} onChange={(e) => set("judul", e.target.value)} placeholder={judulOtomatis} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onTutup}>Batal</button>
              <button className="btn btn-primary" disabled={proses}><i className="bi bi-check2 me-1"></i>Buat ATP</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

/** Editor ATP: baris TP berurutan; AI menyusun draf; ajukan, setujui, kembalikan, cetak. */
function EditorAtp({ id, referensi, akses, onBuatModul, onKembali }) {
  const [atp, setAtp] = useState(null);
  const [baris, setBaris] = useState([]);
  const [kotor, setKotor] = useState(false);
  const [proses, setProses] = useState(null);
  const [cp, setCp] = useState([]);

  const terima = useCallback((a) => { setAtp(a); setBaris((a.baris || []).map(keEditor)); setKotor(false); }, []);
  useEffect(() => {
    minta("GET", `/perangkat-ajar/atp/${id}`).then((r) => {
      terima(r.data);
      return minta("GET", `/perangkat-ajar/cp?id_mapel=${r.data.id_mapel}${r.data.fase ? `&fase=${r.data.fase}` : ""}`);
    }).then((r) => setCp(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [id, terima]);

  useEffect(() => {
    if (!kotor) return;
    const tahan = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [kotor]);

  const materi = useMemo(() => referensi.materi.filter((m) => atp && m.id_mapel === atp.id_mapel && (!atp.id_kelas || !m.id_kelas || m.id_kelas === atp.id_kelas)), [referensi.materi, atp]);
  // TP dari referensi, ditambah TP yang baru dibuat saat ATP ini disetujui (belum ada di referensi halaman)
  const semuaTp = useMemo(() => ({
    ...Object.fromEntries((atp?.baris || []).filter((b) => b.indikator).map((b) => [b.id_indikator, b.indikator])),
    ...Object.fromEntries(materi.flatMap((m) => m.indikator.map((i) => [i.id_indikator, { ...i, nama_materi: m.nama_materi }]))),
  }), [materi, atp]);

  if (!atp) return <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat ATP…</div>;

  // Kepala sekolah meninjau (baca saja) kecuali ATP buatannya sendiri
  const bisaUbah = akses.isAdmin || atp.dibuat_oleh === akses.user?.id;
  const st = STATUS[atp.status];
  const totalJp = baris.reduce((t, b) => t + (Number(b.alokasi_jp) || 0), 0);
  const targetJp = atp.jp_per_minggu && atp.minggu_efektif ? atp.jp_per_minggu * atp.minggu_efektif : null;

  const ubah = (i, k, v) => { setBaris((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b))); setKotor(true); };
  const geser = (i, d) => { setBaris((bs) => { const n = [...bs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; }); setKotor(true); };

  const simpan = async () => {
    if (atp.status === "DISETUJUI" || atp.status === "DIAJUKAN") {
      const ok = await Swal.fire({ title: "Simpan perubahan?", text: "ATP ini akan kembali menjadi draf dan perlu diajukan ulang.", icon: "question", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return false;
    }
    setProses("simpan");
    try {
      const r = await minta("PUT", `/perangkat-ajar/atp/${id}`, { baris: baris.map((b) => ({ ...b, id_cp: b.id_cp || null, id_materi: b.id_materi || null, id_indikator: b.id_indikator || null,
        alokasi_jp: b.alokasi_jp === "" ? null : Number(b.alokasi_jp), dimensi: b.dimensi || null })) });
      terima(r.data);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "ATP disimpan", showConfirmButton: false, timer: 1500 });
      return true;
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); return false; }
    finally { setProses(null); }
  };

  const susunAi = async () => {
    const pilihan = await Swal.fire({
      title: "Susun ATP dengan AI",
      html: `AI menurunkan TP dari <b>${cp.length} elemen CP</b>${atp.fase ? ` fase ${atp.fase}` : ""}, memakai TP sekolah yang sudah ada, dan menyesuaikan alokasi dengan capaian siswa.${baris.length ? "<br><b>Baris yang ada sekarang akan diganti</b> (belum tersimpan sampai Anda menekan Simpan)." : ""}`
        + `<select id="aiMode" class="form-select mt-3">${AI_MODES.map((m) => `<option value="${m.value}"${m.value === bacaAiMode() ? " selected" : ""}>${m.label}</option>`).join("")}</select>`
        + `<textarea id="aiCatatan" class="form-control mt-2" rows="3" placeholder="Catatan untuk AI (opsional), mis. awali dengan pengukuran karena dekat dengan kehidupan siswa"></textarea>`,
      showCancelButton: true, confirmButtonText: "Susun", cancelButtonText: "Batal",
      preConfirm: () => ({ mode: document.getElementById("aiMode").value, catatan: document.getElementById("aiCatatan").value }),
    });
    if (!pilihan.isConfirmed) return;
    simpanAiMode(pilihan.value.mode);
    setProses("ai");
    try {
      const r = await minta("POST", `/perangkat-ajar/atp/${id}/ai`, { ai_mode: pilihan.value.mode, catatan: pilihan.value.catatan || null });
      setBaris(r.baris.map(keEditor)); setKotor(true);
      Swal.fire({ icon: "success", title: "Draf ATP siap", text: r.message });
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(null); }
  };

  const aksi = async (jalur, pesanKonfirmasi, body) => {
    if (kotor && !(await simpan())) return;
    if (pesanKonfirmasi) {
      const ok = await Swal.fire({ title: pesanKonfirmasi, icon: "question", showCancelButton: true, confirmButtonText: "Ya", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return;
    }
    setProses(jalur);
    try {
      const r = await minta("POST", `/perangkat-ajar/atp/${id}/${jalur}`, body);
      Swal.fire({ icon: "success", title: r.message, timer: 2500, showConfirmButton: false });
      terima((await minta("GET", `/perangkat-ajar/atp/${id}`)).data);
    } catch (err) { Swal.fire("Belum bisa", err.message, "warning"); }
    finally { setProses(null); }
  };
  const kembalikan = async () => {
    const r = await Swal.fire({ title: "Kembalikan ke guru", input: "textarea", inputLabel: "Catatan perbaikan", inputValidator: (v) => (!v?.trim() ? "Tulis catatan perbaikannya." : undefined), showCancelButton: true, confirmButtonText: "Kembalikan", cancelButtonText: "Batal" });
    if (r.isConfirmed) aksi("revisi", null, { catatan: r.value });
  };
  const hapus = async () => {
    const ok = await Swal.fire({ title: "Hapus ATP ini?", text: "TP yang sudah dibuat dari ATP ini tetap ada.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/perangkat-ajar/atp/${id}`); onKembali(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const tutup = async () => {
    if (kotor) {
      const ok = await Swal.fire({ title: "Perubahan belum disimpan", text: "Tinggalkan tanpa menyimpan?", icon: "warning", showCancelButton: true, confirmButtonText: "Tinggalkan", cancelButtonText: "Kembali" });
      if (!ok.isConfirmed) return;
    }
    onKembali();
  };

  return (
    <div className="editor-atp">
      <div className="d-flex flex-wrap align-items-start gap-2 mb-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={tutup} aria-label="Kembali ke daftar ATP"><i className="bi bi-arrow-left"></i></button>
        <div className="me-auto min-w-0">
          <div className="fw-bold fs-5">{atp.judul}</div>
          <div className="small text-muted">{atp.mapel?.nama_mapel}{atp.kelas && ` · ${atp.kelas.nama_kelas}`}{atp.fase && ` · Fase ${atp.fase}`}{atp.periode && ` · ${periodeLabel(atp.periode)}`} · {atp.pembuat?.name}
            {" "}<span className={`badge text-bg-${st.warna} ms-1`}>{st.label}</span>{atp.versi > 1 && <span className="badge text-bg-light border ms-1">v{atp.versi}</span>}</div>
          {atp.status === "REVISI" && atp.catatan_revisi && <div className="alert alert-danger py-1 px-2 small mt-1 mb-0"><b>Catatan kepala sekolah:</b> {atp.catatan_revisi}</div>}
        </div>
        <div className="d-flex flex-wrap gap-1">
          {bisaUbah && <button className="btn btn-sm btn-outline-primary" onClick={susunAi} disabled={!!proses}>{proses === "ai" ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}Susun dengan AI</button>}
          {bisaUbah && <button className="btn btn-sm btn-primary" onClick={simpan} disabled={!kotor || !!proses}><i className="bi bi-save me-1"></i>Simpan</button>}
          {bisaUbah && ["DRAF", "REVISI"].includes(atp.status) && <button className="btn btn-sm btn-success" onClick={() => aksi("ajukan", "Ajukan ATP ke kepala sekolah?")} disabled={!!proses || !baris.length}><i className="bi bi-send me-1"></i>Ajukan</button>}
          {bisaUbah && atp.status === "DIAJUKAN" && <button className="btn btn-sm btn-outline-secondary" onClick={() => aksi("tarik")} disabled={!!proses}>Tarik</button>}
          {akses.isKepsek && atp.status === "DIAJUKAN" && <>
            <button className="btn btn-sm btn-success" onClick={() => aksi("setujui", "Setujui ATP ini? TP baru akan ditambahkan ke Referensi Penilaian.")} disabled={!!proses}><i className="bi bi-patch-check me-1"></i>Setujui</button>
            <button className="btn btn-sm btn-outline-danger" onClick={kembalikan} disabled={!!proses}><i className="bi bi-arrow-counterclockwise me-1"></i>Kembalikan</button>
          </>}
          {atp.status === "DISETUJUI" && !akses.isKepsek && onBuatModul && <button className="btn btn-sm btn-outline-success" onClick={() => onBuatModul(atp.id_atp)}><i className="bi bi-journal-plus me-1"></i>Buat modul ajar</button>}
          <button className="btn btn-sm btn-outline-secondary" onClick={() => cetakAtp({ ...atp, baris: kotor ? baris.map((b) => ({ ...b, cp: cp.find((c) => c.id_cp === b.id_cp), materi: materi.find((m) => m.id_materi === b.id_materi), indikator: semuaTp[b.id_indikator] })) : atp.baris, total_jp: totalJp }, referensi.sekolah)
            || Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini.", "info")}><i className="bi bi-printer me-1"></i>Cetak</button>
          {bisaUbah && <button className="btn btn-sm btn-outline-danger" onClick={hapus} disabled={!!proses} aria-label="Hapus ATP"><i className="bi bi-trash"></i></button>}
        </div>
      </div>

      <div className="small mb-2 d-flex flex-wrap gap-3">
        <span><i className="bi bi-clock me-1"></i>Total <b>{totalJp} JP</b>{targetJp && <> dari {targetJp} JP ({atp.jp_per_minggu} JP × {atp.minggu_efektif} minggu){totalJp > targetJp && <span className="text-danger ms-1">melebihi</span>}</>}</span>
        <span><i className="bi bi-journal-bookmark me-1"></i>{cp.length} elemen CP{!cp.length && <span className="text-danger ms-1">— isi dulu di tab CP</span>}</span>
        {baris.some((b) => !b.id_indikator) && <span className="text-primary"><i className="bi bi-plus-circle me-1"></i>{baris.filter((b) => !b.id_indikator).length} TP baru dibuat saat disetujui</span>}
      </div>

      {!baris.length ? (
        <div className="text-center text-muted py-5 border rounded"><i className="bi bi-list-ol fs-1 d-block mb-2"></i>
          Belum ada TP. {bisaUbah && <>Tekan <b>Susun dengan AI</b>, atau <button className="btn btn-link p-0 align-baseline" onClick={() => { setBaris([barisKosong()]); setKotor(true); }}>tambah baris</button>.</>}</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {baris.map((b, i) => {
            const tpMateri = materi.find((m) => m.id_materi === b.id_materi)?.indikator || [];
            return (
              <div key={i} className="card shadow-sm baris-atp">
                <div className="card-body py-2">
                  <div className="d-flex gap-2 align-items-start">
                    <div className="d-flex flex-column align-items-center">
                      <button className="btn btn-sm btn-link p-0" disabled={!bisaUbah || i === 0} onClick={() => geser(i, -1)} aria-label={`Naikkan baris ${i + 1}`}><i className="bi bi-chevron-up"></i></button>
                      <b>{i + 1}</b>
                      <button className="btn btn-sm btn-link p-0" disabled={!bisaUbah || i === baris.length - 1} onClick={() => geser(i, 1)} aria-label={`Turunkan baris ${i + 1}`}><i className="bi bi-chevron-down"></i></button>
                    </div>
                    <fieldset className="flex-grow-1 min-w-0" disabled={!bisaUbah}>
                      <div className="row g-2">
                        <div className="col-md-3">
                          <select className="form-select form-select-sm" aria-label={`Elemen CP baris ${i + 1}`} value={b.id_cp} onChange={(e) => ubah(i, "id_cp", e.target.value)}>
                            <option value="">Elemen CP…</option>
                            {cp.map((c) => <option key={c.id_cp} value={c.id_cp}>{c.elemen}</option>)}
                          </select>
                        </div>
                        <div className="col-md-3">
                          {b.id_materi || !b.materi_usulan ? (
                            <select className="form-select form-select-sm" aria-label={`Materi baris ${i + 1}`} value={b.id_materi}
                              onChange={(e) => { if (e.target.value === "__baru") { ubah(i, "id_materi", ""); ubah(i, "materi_usulan", "Materi baru"); ubah(i, "id_indikator", ""); } else { ubah(i, "id_materi", e.target.value); ubah(i, "id_indikator", ""); } }}>
                              <option value="">Materi…</option>
                              {materi.map((m) => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi}</option>)}
                              <option value="__baru">+ Materi baru…</option>
                            </select>
                          ) : (
                            <div className="input-group input-group-sm">
                              <span className="input-group-text text-primary" title="Materi baru, dibuat saat ATP disetujui"><i className="bi bi-plus-circle"></i></span>
                              <input className="form-control" aria-label={`Materi baru baris ${i + 1}`} value={b.materi_usulan} onChange={(e) => ubah(i, "materi_usulan", e.target.value)} />
                              <button className="btn btn-outline-secondary" onClick={() => ubah(i, "materi_usulan", "")} aria-label="Pilih materi yang ada"><i className="bi bi-x"></i></button>
                            </div>
                          )}
                        </div>
                        <div className="col-md-6">
                          {b.id_indikator ? (
                            <div className="input-group input-group-sm">
                              <span className="form-control text-truncate" title={semuaTp[b.id_indikator]?.deskripsi}>{semuaTp[b.id_indikator]?.deskripsi || "TP"}</span>
                              <button className="btn btn-outline-secondary" onClick={() => { ubah(i, "id_indikator", ""); ubah(i, "tp_usulan", semuaTp[b.id_indikator]?.deskripsi || ""); }} title="Ubah menjadi TP baru">Ubah</button>
                            </div>
                          ) : (
                            <div className="input-group input-group-sm">
                              {tpMateri.length > 0 && (
                                <select className="form-select" style={{ maxWidth: 130 }} aria-label={`Pilih TP yang ada baris ${i + 1}`} value="" onChange={(e) => e.target.value && ubah(i, "id_indikator", e.target.value)}>
                                  <option value="">TP ada…</option>
                                  {tpMateri.map((t) => <option key={t.id_indikator} value={t.id_indikator}>{t.deskripsi}</option>)}
                                </select>
                              )}
                              <input className="form-control" aria-label={`TP baru baris ${i + 1}`} placeholder="Tulis tujuan pembelajaran baru" value={b.tp_usulan} onChange={(e) => ubah(i, "tp_usulan", e.target.value)} />
                              <span className="input-group-text text-primary" title="TP baru, dibuat saat ATP disetujui"><i className="bi bi-plus-circle"></i></span>
                            </div>
                          )}
                        </div>
                        <div className="col-4 col-md-1">
                          <input type="number" min={0} className="form-control form-control-sm" aria-label={`JP baris ${i + 1}`} placeholder="JP" value={b.alokasi_jp} onChange={(e) => ubah(i, "alokasi_jp", e.target.value)} />
                        </div>
                        <div className="col-4 col-md-2">
                          <input className="form-control form-control-sm" aria-label={`Minggu baris ${i + 1}`} placeholder="Minggu, mis. 1-2" value={b.minggu} onChange={(e) => ubah(i, "minggu", e.target.value)} />
                        </div>
                        <div className="col-4 col-md-2">
                          <select className="form-select form-select-sm" aria-label={`Dimensi STNKM baris ${i + 1}`} value={b.dimensi} onChange={(e) => ubah(i, "dimensi", e.target.value)}>
                            <option value="">STNKM…</option>
                            {DIMENSI.map((d) => <option key={d.key} value={d.key}>{d.key} · {d.label}</option>)}
                          </select>
                        </div>
                        <div className="col-md-7 d-flex flex-wrap gap-1 align-items-center">
                          {referensi.profil_lulusan.map((p) => {
                            const on = b.profil_lulusan.includes(p);
                            return <button key={p} type="button" className={`btn btn-sm py-0 px-2 ${on ? "btn-info" : "btn-outline-secondary"}`} style={{ fontSize: ".75rem" }}
                              aria-pressed={on} onClick={() => ubah(i, "profil_lulusan", on ? b.profil_lulusan.filter((x) => x !== p) : [...b.profil_lulusan, p].slice(0, 4))}>{p}</button>;
                          })}
                        </div>
                        {(b.catatan || bisaUbah) && (
                          <div className="col-12">
                            <input className="form-control form-control-sm border-0 bg-body-tertiary" aria-label={`Catatan baris ${i + 1}`} placeholder="Catatan (opsional)" value={b.catatan} onChange={(e) => ubah(i, "catatan", e.target.value)} />
                          </div>
                        )}
                      </div>
                    </fieldset>
                    {bisaUbah && <button className="btn btn-sm btn-outline-danger" onClick={() => { setBaris((bs) => bs.filter((_, j) => j !== i)); setKotor(true); }} aria-label={`Hapus baris ${i + 1}`}><i className="bi bi-x-lg"></i></button>}
                  </div>
                </div>
              </div>
            );
          })}
          {bisaUbah && <button className="btn btn-sm btn-outline-primary align-self-start" onClick={() => { setBaris((bs) => [...bs, barisKosong()]); setKotor(true); }}><i className="bi bi-plus-lg me-1"></i>Tambah baris</button>}
        </div>
      )}
    </div>
  );
}
