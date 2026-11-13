"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { AI_MODES, STATUS, bacaAiMode, simpanAiMode } from "@/components/banksoal/konstanta";
import { minta } from "@/components/banksoal/api";
import { MenuAksi, aksiHapus } from "@/components/dashboard/menuAksi";
import { hapusDariKartu, itemPersetujuan, tombolKartu } from "@/components/dashboard/aksiKartu";
import { WARNA_CABANG, diagramPeta } from "./jaring";
import { cetakPetaTema, unduhPngPetaTema, unduhWordPetaTema } from "./cetakPetaTema";

const HARI = [["senin", "Senin"], ["selasa", "Selasa"], ["rabu", "Rabu"], ["kamis", "Kamis"], ["jumat", "Jumat"], ["sabtu", "Sabtu"]];
const KOLOM_MINGGU = [
  ["realita", "Realita", "Yang dialami anak"],
  ["imajinasi", "Imajinasi", "Yang dibuat anak"],
  ["makna", "Makna", "Nilai yang ditemukan anak"],
  ["produk", "Produk anak", "Tanpa peringkat"],
];
const idAcak = () => Math.random().toString(36).slice(2, 10);
const mingguKosong = (ke) => ({ ke, judul: "", realita: "", imajinasi: "", makna: "", produk: "" });

/** Peta Tema / spider web kurikulum PBPM: tema lintas mapel per kelas, disusun bersama AI, disetujui kepala sekolah. */
export default function TabPetaTema({ referensi, akses, statusAwal, temaAwal }) {
  const [daftar, setDaftar] = useState(null);
  const [status, setStatus] = useState(statusAwal || "");
  const [buka, setBuka] = useState(temaAwal || null);
  const [baru, setBaru] = useState(false);

  const muat = useCallback(() => {
    minta("GET", `/perangkat-ajar/tema${status ? `?status=${status}` : ""}`).then((r) => setDaftar(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, [status]);
  useEffect(() => { muat(); }, [muat]);

  if (buka) return <EditorTema id={buka} referensi={referensi} akses={akses} onKembali={() => { setBuka(null); muat(); }} />;

  const itemTema = (t) => {
    const bisaUbah = akses.isAdmin || t.dibuat_oleh === akses.user?.id;
    return [
      { label: "Buka", ikon: "bi-box-arrow-up-right", onClick: () => setBuka(t.id_peta) },
      ...itemPersetujuan({ dasar: `/perangkat-ajar/tema/${t.id_peta}`, status: t.status, bisaUbah, isKepsek: akses.isKepsek, selesai: muat,
        pesanAjukan: "Ajukan peta tema ke kepala sekolah?", pesanSetujui: "Setujui peta tema ini?" }),
      aksiHapus(() => hapusDariKartu(`/perangkat-ajar/tema/${t.id_peta}`, { judul: "Hapus peta tema ini?", selesai: muat }), bisaUbah),
    ];
  };

  return (
    <div>
      <div className="alert alert-light border small py-2 mb-3">
        <i className="bi bi-bezier2 me-1 text-primary"></i>
        <b>Peta Tema (spider web)</b> menghubungkan satu tema dari realita anak Papua ke semua mata pelajaran: jaring mata pelajaran dengan
        kalibrasi, jaring konsep, dan peta mingguan <i>Realita → Imajinasi → Makna → Produk anak</i> (kurikulum PBPM).
      </div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Saring status peta tema">
          {[["", "Semua"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k} className={`btn ${status === k ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setStatus(k)}>{label}</button>
          ))}
        </div>
        {!akses.isKepsek && <button className="btn btn-sm btn-primary ms-auto" onClick={() => setBaru(true)}><i className="bi bi-plus-lg me-1"></i>Peta tema baru</button>}
      </div>
      {!daftar ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !daftar.length ? (
          <div className="text-center text-muted py-5"><i className="bi bi-bezier2 fs-1 d-block mb-2"></i>
            {status ? "Tidak ada peta tema dengan status ini." : <>Belum ada peta tema. Tekan <b>Peta tema baru</b>, tulis temanya (mis. <i>Aku dan Sukuku</i>), lalu <b>Susun dengan AI</b>.</>}</div>
        ) : (
          <div className="row g-2">
            {daftar.map((t) => {
              const st = STATUS[t.status];
              return (
                <div key={t.id_peta} className="col-md-6 col-xl-4">
                  <div className="card shadow-sm h-100 kartu-tema" role="button" tabIndex={0} onClick={() => setBuka(t.id_peta)} onKeyDown={tombolKartu(() => setBuka(t.id_peta))}>
                    <div className="card-body py-2">
                      <div className="d-flex gap-2 align-items-start">
                        <div className="me-auto min-w-0">
                          {t.jaring?.kategori && <div className="small text-primary fw-semibold text-uppercase" style={{ letterSpacing: ".06em" }}>{t.jaring.kategori}</div>}
                          <div className="fw-semibold">{t.judul}</div>
                          <div className="small text-muted">{t.kelas?.nama_kelas || "Semua kelas"} · {t.jumlah_minggu} minggu · {t.jumlah_mapel} mapel · {t.jumlah_konsep} konsep · {t.pembuat?.name}</div>
                        </div>
                        <MenuAksi label={`Aksi untuk ${t.judul}`} items={itemTema(t)} />
                      </div>
                      <div className="d-flex flex-wrap gap-1 mt-2">
                        <span className={`badge text-bg-${st.warna}`}><i className={`bi ${st.icon} me-1`}></i>{st.label}</span>
                        {t.sumber === "AI" && <span className="badge text-bg-light border fw-normal"><i className="bi bi-magic me-1"></i>AI</span>}
                        {(t.jaring?.mapel || []).slice(0, 6).map((c, i) => <span key={c.id} className="badge fw-normal" style={{ background: `${WARNA_CABANG[i % WARNA_CABANG.length]}1f`, color: WARNA_CABANG[i % WARNA_CABANG.length] }}>{c.nama}</span>)}
                      </div>
                      {t.status === "REVISI" && t.catatan_revisi && <div className="small text-danger mt-1"><i className="bi bi-chat-left-text me-1"></i>{t.catatan_revisi}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {baru && <ModalTemaBaru referensi={referensi} onTutup={() => setBaru(false)} onDibuat={(id) => { setBaru(false); setBuka(id); }} />}
    </div>
  );
}

function ModalTemaBaru({ referensi, onTutup, onDibuat }) {
  const aktif = referensi.periode.find((p) => p.status_aktif === "AKTIF");
  const [f, setF] = useState({ judul: "", id_kelas: "", id_periode: aktif?.id_periode || "", tanggal_mulai: "", jumlah_minggu: 3 });
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const simpan = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const r = await minta("POST", "/perangkat-ajar/tema", { ...f, id_kelas: f.id_kelas || null, tanggal_mulai: f.tanggal_mulai || null, jumlah_minggu: Number(f.jumlah_minggu) || 3 });
      onDibuat(r.data.id_peta);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); setProses(false); }
  };
  return (
    <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label="Peta tema baru" style={{ background: "rgba(15,23,42,.45)" }}>
      <div className="modal-dialog modal-dialog-centered">
        <form className="modal-content" onSubmit={simpan}>
          <div className="modal-header"><h5 className="modal-title"><i className="bi bi-bezier2 me-2"></i>Peta tema baru</h5><button type="button" className="btn-close" aria-label="Tutup" onClick={onTutup}></button></div>
          <div className="modal-body row g-2">
            <div className="col-12">
              <label className="form-label small fw-semibold" htmlFor="ptJudul">Tema</label>
              <input id="ptJudul" className="form-control" required maxLength={200} placeholder="mis. Aku dan Sukuku, Main Bola, Kebun Sagu" value={f.judul} onChange={(e) => set("judul", e.target.value)} autoFocus />
            </div>
            <div className="col-sm-6">
              <label className="form-label small fw-semibold" htmlFor="ptKelas">Kelas</label>
              <select id="ptKelas" className="form-select" value={f.id_kelas} onChange={(e) => set("id_kelas", e.target.value)}>
                <option value="">— semua kelas —</option>
                {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}{k.fase ? ` (Fase ${k.fase})` : ""}</option>)}
              </select>
            </div>
            <div className="col-sm-6">
              <label className="form-label small fw-semibold" htmlFor="ptPeriode">Semester</label>
              <select id="ptPeriode" className="form-select" value={f.id_periode} onChange={(e) => set("id_periode", e.target.value)}>
                {referensi.periode.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.semester} {p.tahun_ajaran}</option>)}
              </select>
            </div>
            <div className="col-sm-6">
              <label className="form-label small fw-semibold" htmlFor="ptMulai">Tanggal mulai (opsional)</label>
              <input id="ptMulai" type="date" className="form-control" value={f.tanggal_mulai} onChange={(e) => set("tanggal_mulai", e.target.value)} />
            </div>
            <div className="col-sm-6">
              <label className="form-label small fw-semibold" htmlFor="ptMinggu">Lama (minggu)</label>
              <input id="ptMinggu" type="number" min={1} max={12} className="form-control" value={f.jumlah_minggu} onChange={(e) => set("jumlah_minggu", e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onTutup}>Batal</button>
            <button className="btn btn-primary" disabled={proses}>{proses ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-plus-lg me-1"></i>}Buat peta tema</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const Teks = ({ label, nilai, ubah, bisa, baris = 2, placeholder, id }) => (
  <textarea id={id} className="form-control form-control-sm" rows={baris} aria-label={label} placeholder={placeholder} value={nilai || ""} readOnly={!bisa} onChange={(e) => ubah(e.target.value)} />
);

/** Diagram SVG (dibuat jaring.js: sama persis dengan hasil cetak). */
function Diagram({ svg, label }) {
  return <div className="pt-diagram" role="figure" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function EditorTema({ id, referensi, akses, onKembali }) {
  const [p, setP] = useState(null);
  const [ref, setRef] = useState(null); // mapel + TP untuk kelas peta ini
  const [kotor, setKotor] = useState(false);
  const [proses, setProses] = useState(null);
  const [pakaiAi, setPakaiAi] = useState(null);
  const [tpTerbuka, setTpTerbuka] = useState(null);

  const terima = useCallback((d) => { setP(d); setKotor(false); }, []);
  useEffect(() => { minta("GET", `/perangkat-ajar/tema/${id}`).then((r) => terima(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error")); }, [id, terima]);
  useEffect(() => {
    if (!p) return;
    minta("GET", `/perangkat-ajar/tema/referensi${p.id_kelas ? `?id_kelas=${p.id_kelas}` : ""}`).then(setRef).catch(() => setRef({ mapel: [] }));
  }, [p?.id_kelas]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!kotor) return;
    const tahan = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [kotor]);

  const diagram = useMemo(() => (p ? diagramPeta(p) : null), [p]);
  if (!p) return <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat peta tema…</div>;

  const bisa = akses.isAdmin || p.dibuat_oleh === akses.user?.id;
  const st = STATUS[p.status];
  const ubah = (patch) => { setP((x) => ({ ...x, ...patch })); setKotor(true); };
  const ubahJaring = (patch) => ubah({ jaring: { ...p.jaring, ...patch } });
  const ubahCabang = (jenis, i, patch) => ubahJaring({ [jenis]: p.jaring[jenis].map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const geser = (jenis, i, arah) => {
    const d = [...p.jaring[jenis]];
    const j = i + arah;
    if (j < 0 || j >= d.length) return;
    [d[i], d[j]] = [d[j], d[i]];
    ubahJaring({ [jenis]: d });
  };
  const hapusCabang = (jenis, i) => ubahJaring({ [jenis]: p.jaring[jenis].filter((_, j) => j !== i) });
  const ubahJumlahMinggu = (n) => {
    const jumlah = Math.max(1, Math.min(12, Number(n) || 1));
    ubah({ jumlah_minggu: jumlah, minggu: Array.from({ length: jumlah }, (_, i) => p.minggu[i] || mingguKosong(i + 1)) });
  };
  const ubahMinggu = (i, k, v) => ubah({ minggu: p.minggu.map((m, j) => (j === i ? { ...m, [k]: v } : m)) });
  const mapelRef = ref?.mapel || [];
  const tpMapel = (idMapel) => mapelRef.find((m) => m.id_mapel === idMapel)?.tp || [];
  const namaTp = (t) => p.tp_detail?.[t] || mapelRef.flatMap((m) => m.tp).find((x) => x.id_indikator === t)?.deskripsi || t;

  const payload = () => ({
    judul: p.judul, id_kelas: p.id_kelas || null, id_periode: p.id_periode || null, tanggal_mulai: p.tanggal_mulai || null,
    jumlah_minggu: p.jumlah_minggu, pendekatan: p.pendekatan, konteks_lokal: p.konteks_lokal, jaring: p.jaring, minggu: p.minggu, pola: p.pola,
  });
  const simpan = async () => {
    if (!p.judul?.trim()) { Swal.fire("Tema kosong", "Tulis tema peta ini dulu.", "info"); return false; }
    if (["DISETUJUI", "DIAJUKAN"].includes(p.status)) {
      const ok = await Swal.fire({ title: "Simpan perubahan?", text: "Peta tema ini akan kembali menjadi draf dan perlu diajukan ulang.", icon: "question", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return false;
    }
    setProses("simpan");
    try {
      const r = await minta("PUT", `/perangkat-ajar/tema/${id}`, { ...payload(), ...(pakaiAi ? { sumber: "AI", ai_mode: pakaiAi } : {}) });
      terima(r.data); setPakaiAi(null);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Peta tema disimpan", showConfirmButton: false, timer: 1500 });
      return true;
    } catch (err) { Swal.fire("Gagal menyimpan", err.message, "error"); return false; }
    finally { setProses(null); }
  };

  const pilihMode = () => `<select id="aiMode" class="form-select mt-3" aria-label="Penyedia AI">${AI_MODES.map((x) => `<option value="${x.value}"${x.value === bacaAiMode() ? " selected" : ""}>${x.label}</option>`).join("")}</select>`;
  const jalankanAi = async (bagian, body, judulTunggu) => {
    simpanAiMode(body.ai_mode);
    setProses("ai");
    Swal.fire({ title: judulTunggu, html: "Biasanya 20–90 detik.", allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    try {
      const r = await minta("POST", `/perangkat-ajar/tema/${id}/ai`, { bagian, judul: p.judul, jaring: p.jaring, konteks_lokal: p.konteks_lokal, ...body });
      ubah({ jaring: r.jaring, ...(r.minggu ? { minggu: r.minggu } : {}) });
      setPakaiAi(body.ai_mode);
      Swal.fire({ icon: "success", title: bagian === "kalibrasi" ? "Kalibrasi siap" : "Draf peta tema siap", text: r.message });
    } catch (err) { Swal.fire("AI belum berhasil", err.message, "warning"); }
    finally { setProses(null); }
  };
  const susunAi = async () => {
    const terpilih = new Set(p.jaring.mapel.map((c) => c.id_mapel).filter(Boolean));
    const r = await Swal.fire({
      title: "Susun peta tema dengan AI",
      width: 640,
      html: `<div class="text-start small">AI menyusun <b>jaring mata pelajaran</b> beserta kalibrasinya, <b>jaring konsep</b>, dan <b>peta mingguan</b> (${p.jumlah_minggu} minggu) untuk tema <b>${p.judul.replace(/</g, "&lt;")}</b>, memakai CP dan TP tiap mapel.`
        + `${p.jaring.mapel.length || p.jaring.konsep.length ? " <b>Jaring & peta mingguan sekarang akan diganti</b> (belum tersimpan sampai Anda menekan Simpan)." : ""}</div>`
        + `<div class="text-start fw-semibold small mt-3 mb-1">Mata pelajaran yang menjadi cabang</div><div class="text-start d-flex flex-wrap gap-2" id="aiMapel">`
        + mapelRef.map((m) => `<label class="form-check-label small border rounded px-2 py-1"><input type="checkbox" class="form-check-input me-1" value="${m.id_mapel}"${terpilih.has(m.id_mapel) ? " checked" : ""}>${m.nama_mapel.replace(/</g, "&lt;")}</label>`).join("")
        + `</div><textarea id="aiKonteks" class="form-control mt-3" rows="2" placeholder="Konteks lokal (opsional), mis. anak dari suku Dani dan Mee, kampung dekat kebun sagu">${(p.konteks_lokal || "").replace(/</g, "&lt;")}</textarea>`
        + `<textarea id="aiCatatan" class="form-control mt-2" rows="2" placeholder="Catatan untuk AI (opsional), mis. tonjolkan kerja sama dan bahasa ibu"></textarea>${pilihMode()}`,
      showCancelButton: true, confirmButtonText: "Susun", cancelButtonText: "Batal",
      preConfirm: () => {
        const mapel = [...document.querySelectorAll("#aiMapel input:checked")].map((x) => x.value);
        if (!mapel.length) { Swal.showValidationMessage("Centang minimal satu mata pelajaran."); return false; }
        return { mapel, konteks: document.getElementById("aiKonteks").value, catatan: document.getElementById("aiCatatan").value, mode: document.getElementById("aiMode").value };
      },
    });
    if (!r.isConfirmed) return;
    if (r.value.konteks !== (p.konteks_lokal || "")) ubah({ konteks_lokal: r.value.konteks });
    // Cabang yang dicentang tapi belum ada ikut dikirim agar AI mengisinya
    const nama = Object.fromEntries(mapelRef.map((m) => [m.id_mapel, m.nama_mapel]));
    const jaring = { ...p.jaring, mapel: r.value.mapel.map((idm) => p.jaring.mapel.find((c) => c.id_mapel === idm) || { id: idAcak(), id_mapel: idm, nama: nama[idm], kalibrasi: "", tp: [] }) };
    jalankanAi("semua", { ai_mode: r.value.mode, mapel: r.value.mapel, catatan: r.value.catatan || null, konteks_lokal: r.value.konteks || null, jaring }, "AI sedang menyusun peta tema…");
  };
  const kalibrasiAi = async () => {
    if (!p.jaring.mapel.length) return Swal.fire("Belum ada cabang", "Tambahkan cabang mata pelajaran dulu, lalu kalibrasi.", "info");
    const r = await Swal.fire({
      title: "Kalibrasi dengan AI",
      html: `<div class="small">AI mengisi isi konkret tiap cabang mata pelajaran (${p.jaring.mapel.length} cabang) sesuai tema, fase, CP, dan TP-nya. Konsep dan peta mingguan tidak diubah.</div>`
        + `<textarea id="aiCatatan" class="form-control mt-3" rows="2" placeholder="Catatan (opsional), mis. Math fokus pengukuran"></textarea>${pilihMode()}`,
      showCancelButton: true, confirmButtonText: "Kalibrasi", cancelButtonText: "Batal",
      preConfirm: () => ({ catatan: document.getElementById("aiCatatan").value, mode: document.getElementById("aiMode").value }),
    });
    if (r.isConfirmed) jalankanAi("kalibrasi", { ai_mode: r.value.mode, catatan: r.value.catatan || null }, "AI sedang mengkalibrasi cabang…");
  };

  const ambilPola = async () => {
    if (kotor && !(await simpan())) return;
    try {
      const r = await minta("GET", `/perangkat-ajar/tema/${id}/pola-jadwal`);
      if (!r.jumlah_sesi) return Swal.fire("Jadwal kosong", `Belum ada sesi di Jadwal kelas ini untuk minggu mulai ${r.minggu_mulai}.`, "info");
      ubah({ pola: r.data });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: `${r.jumlah_sesi} sesi diambil dari Jadwal`, showConfirmButton: false, timer: 2000 });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const aksi = async (jalur, konfirmasi, body) => {
    if (kotor && !(await simpan())) return;
    if (konfirmasi) {
      const ok = await Swal.fire({ title: konfirmasi, icon: "question", showCancelButton: true, confirmButtonText: "Ya", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return;
    }
    setProses(jalur);
    try {
      const r = await minta("POST", `/perangkat-ajar/tema/${id}/${jalur}`, body);
      Swal.fire({ icon: "success", title: r.message, timer: 2500, showConfirmButton: false });
      terima((await minta("GET", `/perangkat-ajar/tema/${id}`)).data);
    } catch (err) { Swal.fire("Belum bisa", err.message, "warning"); }
    finally { setProses(null); }
  };
  const kembalikan = async () => {
    const r = await Swal.fire({ title: "Kembalikan ke guru", input: "textarea", inputLabel: "Catatan perbaikan", inputValidator: (v) => (!v?.trim() ? "Tulis catatan perbaikannya." : undefined), showCancelButton: true, confirmButtonText: "Kembalikan", cancelButtonText: "Batal" });
    if (r.isConfirmed) aksi("revisi", null, { catatan: r.value });
  };
  const hapus = async () => {
    const ok = await Swal.fire({ title: "Hapus peta tema ini?", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/perangkat-ajar/tema/${id}`); onKembali(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const tutup = async () => {
    if (kotor) {
      const ok = await Swal.fire({ title: "Perubahan belum disimpan", text: "Tinggalkan tanpa menyimpan?", icon: "warning", showCancelButton: true, confirmButtonText: "Tinggalkan", cancelButtonText: "Kembali" });
      if (!ok.isConfirmed) return;
    }
    onKembali();
  };
  const ekspor = async (fn) => { try { const hasil = await fn(); if (hasil === false) Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini.", "info"); } catch (err) { Swal.fire("Gagal", err.message, "error"); } };

  return (
    <div className="editor-tema">
      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={tutup} aria-label="Kembali ke daftar peta tema"><i className="bi bi-arrow-left"></i></button>
        <div className="me-auto min-w-0">
          <div className="fw-bold fs-5">{p.jaring.kategori ? <span className="text-primary text-uppercase small me-2" style={{ letterSpacing: ".06em" }}>{p.jaring.kategori}</span> : null}{p.judul || "Tanpa tema"}</div>
          <div className="small text-muted">{p.kelas?.nama_kelas || "Semua kelas"}{p.fase && ` · Fase ${p.fase}`}{p.periode && ` · ${p.periode.semester} ${p.periode.tahun_ajaran}`} · {p.jumlah_minggu} minggu
            {" "}<span className={`badge text-bg-${st.warna} ms-1`}>{st.label}</span>{p.versi > 1 && <span className="badge text-bg-light border ms-1">v{p.versi}</span>}{kotor && <span className="badge text-bg-warning ms-1">belum disimpan</span>}</div>
          {p.status === "REVISI" && p.catatan_revisi && <div className="alert alert-danger py-1 px-2 small mt-1 mb-0"><b>Catatan kepala sekolah:</b> {p.catatan_revisi}</div>}
        </div>
        <div className="d-flex flex-wrap gap-1">
          {bisa && <button className="btn btn-sm btn-outline-primary" onClick={susunAi} disabled={!!proses || !ref}><i className="bi bi-stars me-1"></i>Susun dengan AI</button>}
          {bisa && <button className="btn btn-sm btn-outline-primary" onClick={kalibrasiAi} disabled={!!proses || !ref}><i className="bi bi-sliders me-1"></i>Kalibrasi AI</button>}
          {bisa && <button className="btn btn-sm btn-primary" onClick={() => simpan()} disabled={!kotor || !!proses}><i className="bi bi-save me-1"></i>Simpan</button>}
          {bisa && ["DRAF", "REVISI"].includes(p.status) && <button className="btn btn-sm btn-success" onClick={() => aksi("ajukan", "Ajukan peta tema ke kepala sekolah?")} disabled={!!proses}><i className="bi bi-send me-1"></i>Ajukan</button>}
          {bisa && p.status === "DIAJUKAN" && <button className="btn btn-sm btn-outline-secondary" onClick={() => aksi("tarik")} disabled={!!proses}>Tarik</button>}
          {akses.isKepsek && p.status === "DIAJUKAN" && <>
            <button className="btn btn-sm btn-success" onClick={() => aksi("setujui", "Setujui peta tema ini?")} disabled={!!proses}><i className="bi bi-patch-check me-1"></i>Setujui</button>
            <button className="btn btn-sm btn-outline-danger" onClick={kembalikan} disabled={!!proses}><i className="bi bi-arrow-counterclockwise me-1"></i>Kembalikan</button>
          </>}
          <div className="dropdown">
            <button className="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i className="bi bi-download me-1"></i>Ekspor</button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><button className="dropdown-item" onClick={() => ekspor(() => cetakPetaTema(p, referensi.sekolah))}><i className="bi bi-file-earmark-pdf me-2 text-danger"></i>Cetak / PDF resmi</button></li>
              <li><button className="dropdown-item" onClick={() => ekspor(() => unduhWordPetaTema(p, referensi.sekolah))}><i className="bi bi-file-earmark-word me-2 text-primary"></i>Word</button></li>
              <li><hr className="dropdown-divider" /></li>
              <li><button className="dropdown-item" onClick={() => ekspor(() => unduhPngPetaTema(p, "mapel"))}><i className="bi bi-image me-2"></i>PNG spider web mapel</button></li>
              <li><button className="dropdown-item" onClick={() => ekspor(() => unduhPngPetaTema(p, "konsep"))}><i className="bi bi-image me-2"></i>PNG spider web konsep</button></li>
            </ul>
          </div>
          {bisa && <button className="btn btn-sm btn-outline-danger" onClick={hapus} disabled={!!proses} aria-label="Hapus peta tema"><i className="bi bi-trash"></i></button>}
        </div>
      </div>

      {/* Identitas */}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-semibold">Identitas tema</div>
        <div className="card-body row g-2">
          <div className="col-md-5">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptTema">Tema</label>
            <input id="ptTema" className="form-control form-control-sm" maxLength={200} readOnly={!bisa} value={p.judul} onChange={(e) => ubah({ judul: e.target.value })} />
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptKategori">Kategori pusat</label>
            <input id="ptKategori" className="form-control form-control-sm" maxLength={40} placeholder="mis. HOBI, BUDAYA, ALAM" readOnly={!bisa} value={p.jaring.kategori || ""} onChange={(e) => ubahJaring({ kategori: e.target.value })} />
          </div>
          <div className="col-md-2">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptKelasE">Kelas</label>
            <select id="ptKelasE" className="form-select form-select-sm" disabled={!bisa} value={p.id_kelas || ""} onChange={(e) => ubah({ id_kelas: e.target.value || null })}>
              <option value="">— semua —</option>
              {referensi.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptJml">Lama (minggu)</label>
            <input id="ptJml" type="number" min={1} max={12} className="form-control form-control-sm" readOnly={!bisa} value={p.jumlah_minggu} onChange={(e) => ubahJumlahMinggu(e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptPeriodeE">Semester</label>
            <select id="ptPeriodeE" className="form-select form-select-sm" disabled={!bisa} value={p.id_periode || ""} onChange={(e) => ubah({ id_periode: e.target.value || null })}>
              {referensi.periode.map((x) => <option key={x.id_periode} value={x.id_periode}>{x.semester} {x.tahun_ajaran}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptMulaiE">Tanggal mulai</label>
            <input id="ptMulaiE" type="date" className="form-control form-control-sm" readOnly={!bisa} value={p.tanggal_mulai || ""} onChange={(e) => ubah({ tanggal_mulai: e.target.value || null })} />
          </div>
          <div className="col-md-6">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptKonteks">Konteks lokal</label>
            <Teks id="ptKonteks" label="Konteks lokal" bisa={bisa} nilai={p.konteks_lokal} ubah={(v) => ubah({ konteks_lokal: v })} placeholder="Suku, kampung, alam, atau kebiasaan anak yang menjadi titik berangkat" />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold mb-0" htmlFor="ptPendekatan">Pendekatan</label>
            <Teks id="ptPendekatan" label="Pendekatan" bisa={bisa} nilai={p.pendekatan} ubah={(v) => ubah({ pendekatan: v })} />
          </div>
        </div>
      </div>

      {/* Jaring mapel */}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-semibold d-flex align-items-center gap-2">
          <i className="bi bi-bezier2 text-primary"></i>Spider web mata pelajaran
          <span className="badge text-bg-light border fw-normal">{p.jaring.mapel.length} cabang</span>
        </div>
        <div className="card-body row g-3">
          <div className="col-xl-7"><Diagram svg={diagram.mapel.svg} label="Spider web mata pelajaran" /></div>
          <div className="col-xl-5">
            <div className="pt-cabang-list">
              {p.jaring.mapel.map((c, i) => {
                const warna = WARNA_CABANG[i % WARNA_CABANG.length];
                const pilihan = tpMapel(c.id_mapel);
                return (
                  <div key={c.id} className="pt-cabang" style={{ borderLeftColor: warna }}>
                    <div className="d-flex gap-1 align-items-center mb-1">
                      <select className="form-select form-select-sm fw-semibold" aria-label={`Mata pelajaran cabang ${i + 1}`} disabled={!bisa} value={c.id_mapel || ""}
                        onChange={(e) => ubahCabang("mapel", i, { id_mapel: e.target.value || null, nama: mapelRef.find((m) => m.id_mapel === e.target.value)?.nama_mapel || c.nama, tp: [] })}>
                        {!c.id_mapel && <option value="">{c.nama || "— pilih mapel —"}</option>}
                        {mapelRef.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                      </select>
                      {bisa && <>
                        <button type="button" className="btn btn-sm btn-light" aria-label={`Naikkan ${c.nama}`} disabled={i === 0} onClick={() => geser("mapel", i, -1)}><i className="bi bi-arrow-up"></i></button>
                        <button type="button" className="btn btn-sm btn-light" aria-label={`Turunkan ${c.nama}`} disabled={i === p.jaring.mapel.length - 1} onClick={() => geser("mapel", i, 1)}><i className="bi bi-arrow-down"></i></button>
                        <button type="button" className="btn btn-sm btn-light text-danger" aria-label={`Hapus cabang ${c.nama}`} onClick={() => hapusCabang("mapel", i)}><i className="bi bi-x-lg"></i></button>
                      </>}
                    </div>
                    <Teks label={`Kalibrasi ${c.nama}`} bisa={bisa} nilai={c.kalibrasi} ubah={(v) => ubahCabang("mapel", i, { kalibrasi: v })} placeholder="Isi konkret mapel ini untuk tema, mis. hitung skor & ukuran lapangan" />
                    <div className="d-flex flex-wrap gap-1 align-items-center mt-1">
                      {(c.tp || []).map((t) => (
                        <span key={t} className="badge text-bg-light border fw-normal text-wrap text-start pt-tp">{namaTp(t)}
                          {bisa && <button type="button" className="btn-close ms-1" style={{ fontSize: ".5rem" }} aria-label="Lepas TP" onClick={() => ubahCabang("mapel", i, { tp: c.tp.filter((x) => x !== t) })}></button>}</span>
                      ))}
                      {bisa && c.id_mapel && <button type="button" className="btn btn-sm btn-link p-0 small" onClick={() => setTpTerbuka(tpTerbuka === c.id ? null : c.id)}><i className="bi bi-link-45deg"></i> Tautkan TP</button>}
                    </div>
                    {tpTerbuka === c.id && (
                      <div className="border rounded p-2 mt-1 bg-body-tertiary pt-tp-pilih">
                        {!pilihan.length ? <div className="small text-muted">Belum ada TP untuk {c.nama} di kelas ini.</div>
                          : pilihan.map((t) => {
                            const on = (c.tp || []).includes(t.id_indikator);
                            return (
                              <label key={t.id_indikator} className="form-check small mb-1">
                                <input type="checkbox" className="form-check-input" checked={on} onChange={() => ubahCabang("mapel", i, { tp: on ? c.tp.filter((x) => x !== t.id_indikator) : [...(c.tp || []), t.id_indikator] })} />
                                <span className="form-check-label">{t.deskripsi} <span className="text-muted">· {t.nama_materi}</span></span>
                              </label>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
              {bisa && p.jaring.mapel.length < 12 && (
                <button type="button" className="btn btn-sm btn-outline-primary w-100" disabled={!ref}
                  onClick={() => { const sisa = mapelRef.find((m) => !p.jaring.mapel.some((c) => c.id_mapel === m.id_mapel)); ubahJaring({ mapel: [...p.jaring.mapel, { id: idAcak(), id_mapel: sisa?.id_mapel || null, nama: sisa?.nama_mapel || "Mata pelajaran", kalibrasi: "", tp: [] }] }); }}>
                  <i className="bi bi-plus-lg me-1"></i>Tambah cabang mata pelajaran
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Jaring konsep */}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-semibold d-flex align-items-center gap-2">
          <i className="bi bi-diagram-2 text-primary"></i>Spider web konsep
          <span className="badge text-bg-light border fw-normal">{p.jaring.konsep.length} konsep</span>
        </div>
        <div className="card-body row g-3">
          <div className="col-xl-7"><Diagram svg={diagram.konsep.svg} label="Spider web konsep" /></div>
          <div className="col-xl-5">
            <div className="pt-cabang-list">
              {p.jaring.konsep.map((c, i) => (
                <div key={c.id} className="pt-cabang" style={{ borderLeftColor: WARNA_CABANG[i % WARNA_CABANG.length] }}>
                  <div className="d-flex gap-1 align-items-center mb-1">
                    <input className="form-control form-control-sm fw-semibold" maxLength={60} aria-label={`Konsep ${i + 1}`} placeholder="Nama konsep, mis. Aturan Permainan" readOnly={!bisa} value={c.label} onChange={(e) => ubahCabang("konsep", i, { label: e.target.value })} />
                    {bisa && <>
                      <button type="button" className="btn btn-sm btn-light" aria-label={`Naikkan konsep ${c.label}`} disabled={i === 0} onClick={() => geser("konsep", i, -1)}><i className="bi bi-arrow-up"></i></button>
                      <button type="button" className="btn btn-sm btn-light" aria-label={`Turunkan konsep ${c.label}`} disabled={i === p.jaring.konsep.length - 1} onClick={() => geser("konsep", i, 1)}><i className="bi bi-arrow-down"></i></button>
                      <button type="button" className="btn btn-sm btn-light text-danger" aria-label={`Hapus konsep ${c.label}`} onClick={() => hapusCabang("konsep", i)}><i className="bi bi-x-lg"></i></button>
                    </>}
                  </div>
                  <Teks label={`Rincian ${c.label}`} bisa={bisa} nilai={c.detail} ubah={(v) => ubahCabang("konsep", i, { detail: v })} placeholder="Rincian, mis. jumlah pemain, waktu, wasit, skor" />
                </div>
              ))}
              {bisa && p.jaring.konsep.length < 12 && (
                <button type="button" className="btn btn-sm btn-outline-primary w-100" onClick={() => ubahJaring({ konsep: [...p.jaring.konsep, { id: idAcak(), label: "", detail: "" }] })}>
                  <i className="bi bi-plus-lg me-1"></i>Tambah konsep
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Peta mingguan */}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-semibold"><i className="bi bi-calendar-week me-1 text-primary"></i>Peta mingguan: Realita → Imajinasi → Makna → Produk anak</div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-sm align-top pt-minggu mb-0">
              <thead><tr><th style={{ minWidth: 150 }}>Minggu</th>{KOLOM_MINGGU.map(([k, l, b]) => <th key={k} style={{ minWidth: 190 }}>{l}<div className="small fw-normal text-muted">{b}</div></th>)}</tr></thead>
              <tbody>
                {p.minggu.map((m, i) => (
                  <tr key={m.ke}>
                    <td><div className="small fw-semibold mb-1">Minggu {m.ke}</div><input className="form-control form-control-sm" maxLength={80} aria-label={`Judul minggu ${m.ke}`} placeholder="mis. Aku" readOnly={!bisa} value={m.judul} onChange={(e) => ubahMinggu(i, "judul", e.target.value)} /></td>
                    {KOLOM_MINGGU.map(([k, l]) => <td key={k}><Teks label={`${l} minggu ${m.ke}`} bisa={bisa} baris={3} nilai={m[k]} ubah={(v) => ubahMinggu(i, k, v)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pola mingguan */}
      <div className="card shadow-sm mb-3">
        <div className="card-header fw-semibold d-flex flex-wrap align-items-center gap-2">
          <span><i className="bi bi-clock me-1 text-primary"></i>Pola mingguan</span>
          {bisa && p.id_kelas && <button className="btn btn-sm btn-outline-primary ms-auto" onClick={ambilPola} disabled={!!proses}><i className="bi bi-calendar3 me-1"></i>Ambil dari Jadwal</button>}
        </div>
        <div className="card-body row g-2">
          {HARI.map(([k, l]) => (
            <div key={k} className="col-md-4 col-xl-2">
              <label className="form-label small fw-semibold mb-0" htmlFor={`ptPola-${k}`}>{l}</label>
              <Teks id={`ptPola-${k}`} label={`Kegiatan ${l}`} bisa={bisa} baris={4} nilai={p.pola?.[k]} ubah={(v) => ubah({ pola: { ...p.pola, [k]: v } })} placeholder={k === "sabtu" ? "Opsional" : "Jam 1: …"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
