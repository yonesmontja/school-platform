"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { DIMENSI, LEVEL, labelBentuk } from "./konstanta";
import PratinjauSoal, { LencanaStnkm } from "./PratinjauSoal";
import EditorPaket from "./EditorPaket";
import PilihSoal from "./PilihSoal";
import KoreksiPaket from "./KoreksiPaket";
import AnalisisPaket from "./AnalisisPaket";
import { cetakPaket } from "./cetakPaket";
import { minta } from "./api";

const BAGIAN = [
  { id: "susun", label: "Susun", icon: "bi-list-ol" },
  { id: "koreksi", label: "Koreksi", icon: "bi-check2-square" },
  { id: "analisis", label: "Analisis", icon: "bi-graph-up" },
];

/** Tab Paket Soal: daftar paket guru, lalu susun naskah, cetak, koreksi, kirim nilai, dan analisis butir. */
export default function PaketSoal({ referensi }) {
  const [daftar, setDaftar] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [paket, setPaket] = useState(null);
  const [bagian, setBagian] = useState("susun");
  const [editor, setEditor] = useState(null); // { paket } untuk EditorPaket
  const [pilih, setPilih] = useState(false);

  const muat = useCallback(async () => {
    try { setDaftar((await minta("GET", "/paket-soal")).data); }
    catch (err) { Swal.fire("Gagal memuat", err.message, "error"); }
    finally { setMemuat(false); }
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const buka = async (id, ke = "susun") => {
    try { setPaket((await minta("GET", `/paket-soal/${id}`)).data); setBagian(ke); }
    catch (err) { Swal.fire("Gagal memuat", err.message, "error"); }
  };
  const segarkan = () => paket && minta("GET", `/paket-soal/${paket.id_paket}`).then((r) => setPaket(r.data)).catch(() => {});

  const hapus = async (p) => {
    const ok = await Swal.fire({ title: "Hapus paket soal?", text: "Jawaban dan foto lembar jawaban ikut terhapus. Soal di bank dan nilai yang sudah dikirim ke Input Nilai tetap ada.",
      icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/paket-soal/${p.id_paket}`); setPaket(null); muat(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const cetak = (jenis) => {
    if (!paket.butir?.length) return Swal.fire("Paket masih kosong", "Tambahkan soal dulu.", "info");
    if (!cetakPaket(paket, jenis)) Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini, lalu coba lagi.", "warning");
  };

  if (paket) {
    return (
      <div className="card shadow-sm">
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => { setPaket(null); muat(); }} aria-label="Kembali ke daftar paket"><i className="bi bi-arrow-left"></i></button>
          <div className="me-auto min-w-0 d-block">
            <div className="fw-semibold fs-5 text-truncate">{paket.judul}</div>
            <div className="small text-muted">
              {paket.mapel?.nama_mapel} · {paket.kelas?.nama_kelas || "kelas belum dipilih"}{paket.tanggal && ` · ${new Date(paket.tanggal + "T00:00:00").toLocaleDateString("id-ID")}`}
              {paket.jenis && ` · ${paket.jenis.kategori_penilaian}`}{paket.kisi && ` · kisi-kisi: ${paket.kisi.judul}`}
            </div>
          </div>
          <div className="dropdown">
            <button className="btn btn-sm btn-outline-primary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"><i className="bi bi-printer me-1"></i>Cetak</button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li><button className="dropdown-item" onClick={() => cetak("lengkap")}><i className="bi bi-files me-2"></i>Naskah + lembar jawaban</button></li>
              <li><button className="dropdown-item" onClick={() => cetak("naskah")}><i className="bi bi-file-text me-2"></i>Naskah siswa</button></li>
              <li><button className="dropdown-item" onClick={() => cetak("lembar")}><i className="bi bi-ui-radios-grid me-2"></i>Lembar jawaban</button></li>
              <li><hr className="dropdown-divider" /></li>
              <li><button className="dropdown-item" onClick={() => cetak("kunci")}><i className="bi bi-key me-2"></i>Kunci & rubrik (guru)</button></li>
            </ul>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditor({ paket })} aria-label="Ubah pengaturan paket"><i className="bi bi-gear me-1"></i>Ubah</button>
          <button className="btn btn-sm btn-outline-danger" onClick={() => hapus(paket)} aria-label="Hapus paket"><i className="bi bi-trash"></i></button>
        </div>
        <div className="card-body">
          <ul className="nav nav-tabs mb-3">
            {BAGIAN.map((b) => (
              <li key={b.id} className="nav-item">
                <button type="button" className={`nav-link ${bagian === b.id ? "active" : ""}`} onClick={() => setBagian(b.id)}><i className={`bi ${b.icon} me-1`}></i>{b.label}</button>
              </li>
            ))}
          </ul>
          {bagian === "susun" ? <SusunPaket paket={paket} onPaket={setPaket} onTambah={() => setPilih(true)} />
            : bagian === "koreksi" ? <KoreksiPaket paket={paket} onBerubah={segarkan} />
            : <AnalisisPaket paket={paket} />}
        </div>
        {editor && <EditorPaket paket={editor.paket} referensi={referensi} onTutup={() => setEditor(null)} onTersimpan={(p) => { setEditor(null); setPaket(p); }} />}
        {pilih && <PilihSoal paket={paket} referensi={referensi} onTutup={() => setPilih(false)} onTersimpan={(p) => { setPilih(false); setPaket(p); }} />}
      </div>
    );
  }

  return (
    <div className="card shadow-sm">
      <div className="card-header d-flex flex-wrap align-items-center gap-2">
        <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-journal-text me-2"></i>Paket Soal</h3>
        <button className="btn btn-sm btn-primary" onClick={() => setEditor({ paket: null })}><i className="bi bi-plus-lg me-1"></i>Paket baru</button>
      </div>
      <div className="card-body">
        {memuat ? <div className="text-muted small py-3"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
          : !daftar.length ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-journal-text fs-1 d-block mb-2"></i>
              Belum ada paket soal. Buat paket dari kisi-kisi atau pilih soal yang sudah disetujui, lalu cetak, koreksi, dan kirim nilainya ke Input Nilai.
            </div>
          ) : (
            <div className="list-group">
              {daftar.map((p) => (
                <div key={p.id_paket} className="list-group-item d-flex flex-wrap align-items-center gap-2 kartu-paket">
                  <button type="button" className="btn btn-link p-0 text-start text-decoration-none flex-grow-1 min-w-0" onClick={() => buka(p.id_paket)}>
                    <div className="fw-semibold text-truncate">{p.judul}</div>
                    <div className="small text-muted">
                      {p.mapel?.nama_mapel} · {p.kelas?.nama_kelas || "-"}{p.tanggal && ` · ${new Date(p.tanggal + "T00:00:00").toLocaleDateString("id-ID")}`} · {p.butir_count} soal
                      {p.pembuat && ` · ${p.pembuat.name}`}
                    </div>
                  </button>
                  <span className="badge text-bg-light border">{p.jawaban_lengkap_count}/{p.jawaban_count} dikoreksi</span>
                  {p.terkirim_pada && <span className="badge text-bg-success"><i className="bi bi-send-check me-1"></i>Nilai terkirim</span>}
                  <button className="btn btn-sm btn-outline-primary" onClick={() => buka(p.id_paket, "koreksi")}><i className="bi bi-check2-square me-1"></i>Koreksi</button>
                </div>
              ))}
            </div>
          )}
      </div>
      {editor && <EditorPaket paket={null} referensi={referensi} onTutup={() => setEditor(null)} onTersimpan={(p) => { setEditor(null); muat(); setPaket(p); setBagian("susun"); }} />}
    </div>
  );
}

/** Susun naskah: urutan, skor maksimal, hapus butir, tambah soal, isi dari kisi-kisi, dan ringkasan sebaran. */
function SusunPaket({ paket, onPaket, onTambah }) {
  const [butir, setButir] = useState(paket.butir || []);
  const [berubah, setBerubah] = useState(false);
  const [lihat, setLihat] = useState({});
  const [proses, setProses] = useState(false);
  useEffect(() => { setButir(paket.butir || []); setBerubah(false); }, [paket]);

  const geser = (i, arah) => {
    const j = i + arah;
    if (j < 0 || j >= butir.length) return;
    const b = [...butir];
    [b[i], b[j]] = [b[j], b[i]];
    setButir(b);
    setBerubah(true);
  };
  const ubahSkor = (id, v) => { setButir((bs) => bs.map((b) => (b.id === id ? { ...b, skor_maks: Math.min(Math.max(Number(v) || 1, 1), 100) } : b))); setBerubah(true); };

  const simpan = async () => {
    setProses(true);
    try {
      const res = await minta("PUT", `/paket-soal/${paket.id_paket}/butir`, { butir: butir.map((b) => ({ id: b.id, skor_maks: b.skor_maks })) });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: res.message, showConfirmButton: false, timer: 1800 });
      onPaket(res.data);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(false); }
  };

  const hapus = async (b) => {
    const ok = await Swal.fire({ title: "Keluarkan soal dari paket?", text: "Soal tetap ada di bank soal. Skor jawaban siswa dihitung ulang.", icon: "question", showCancelButton: true, confirmButtonText: "Keluarkan", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    try { onPaket((await minta("DELETE", `/paket-soal/${paket.id_paket}/butir/${b.id}`)).data); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const isiKisi = async () => {
    setProses(true);
    try {
      const res = await minta("POST", `/paket-soal/${paket.id_paket}/isi-kisi`);
      Swal.fire({ icon: res.kurang ? "info" : "success", title: "Dari kisi-kisi", text: res.message });
      onPaket(res.data);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(false); }
  };

  const sebaran = useMemo(() => {
    const level = {}, bentuk = {}, dim = Object.fromEntries(DIMENSI.map((d) => [d.key, 0]));
    butir.forEach((b) => {
      level[b.soal.level_kognitif] = (level[b.soal.level_kognitif] || 0) + 1;
      bentuk[b.soal.bentuk] = (bentuk[b.soal.bentuk] || 0) + 1;
      DIMENSI.forEach((d) => { dim[d.key] += Number(b.soal[`dim_${d.key}`]) || 0; });
    });
    return { level, bentuk, dim, skor: butir.reduce((a, b) => a + b.skor_maks, 0) };
  }, [butir]);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <button className="btn btn-sm btn-primary" onClick={onTambah}><i className="bi bi-plus-lg me-1"></i>Tambah soal</button>
        {paket.id_kisi && <button className="btn btn-sm btn-outline-primary" onClick={isiKisi} disabled={proses}><i className="bi bi-grid-3x3 me-1"></i>Isi dari kisi-kisi</button>}
        {berubah && <button className="btn btn-sm btn-success" onClick={simpan} disabled={proses}><i className="bi bi-save me-1"></i>Simpan susunan</button>}
        <span className="small text-muted ms-auto">{butir.length} soal · skor maksimal {sebaran.skor}</span>
      </div>

      {butir.length > 0 && (
        <div className="d-flex flex-wrap gap-1 small mb-3">
          {LEVEL.filter((l) => sebaran.level[l.value]).map((l) => <span key={l.value} className="badge text-bg-light border fw-normal">{l.value}: {sebaran.level[l.value]}</span>)}
          <span className="mx-1 text-muted">|</span>
          {Object.entries(sebaran.bentuk).map(([k, v]) => <span key={k} className="badge text-bg-light border fw-normal">{labelBentuk(k)}: {v}</span>)}
          <span className="mx-1 text-muted">|</span>
          {DIMENSI.filter((d) => sebaran.dim[d.key] > 0).map((d) => (
            <span key={d.key} className={`badge bg-${d.warna}-subtle text-${d.warna}-emphasis border border-${d.warna}-subtle fw-normal`} title={d.label}>{d.key} {sebaran.dim[d.key].toFixed(1)}</span>
          ))}
        </div>
      )}

      {!butir.length ? (
        <div className="text-center text-muted py-5"><i className="bi bi-journal-plus fs-1 d-block mb-2"></i>Paket masih kosong. Tambahkan soal yang sudah disetujui{paket.id_kisi ? " atau isi dari kisi-kisi" : ""}.</div>
      ) : (
        <div className="d-flex flex-column gap-2">
          {butir.map((b, i) => (
            <div key={b.id} className="border rounded p-2 butir-paket">
              <div className="d-flex gap-2 align-items-start">
                <div className="d-flex flex-column">
                  <button className="btn btn-sm btn-link p-0" disabled={i === 0} onClick={() => geser(i, -1)} aria-label={`Naikkan soal ${i + 1}`}><i className="bi bi-chevron-up"></i></button>
                  <b className="text-center">{i + 1}</b>
                  <button className="btn btn-sm btn-link p-0" disabled={i === butir.length - 1} onClick={() => geser(i, 1)} aria-label={`Turunkan soal ${i + 1}`}><i className="bi bi-chevron-down"></i></button>
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex flex-wrap gap-1 small mb-1">
                    <span className="badge text-bg-light border">{labelBentuk(b.soal.bentuk)}</span>
                    <span className="badge text-bg-light border">{b.soal.level_kognitif}</span>
                    <LencanaStnkm soal={b.soal} />
                  </div>
                  {lihat[b.id] ? <PratinjauSoal soal={b.soal} /> : <div className="text-truncate">{b.soal.pertanyaan}</div>}
                  <div className="small text-muted">{b.soal.indikator?.deskripsi || b.soal.materi?.nama_materi || "TP belum dipilih"}</div>
                </div>
                <div className="d-flex flex-column align-items-end gap-1">
                  <div className="input-group input-group-sm" style={{ width: 110 }}>
                    <span className="input-group-text">Skor</span>
                    <input type="number" min={1} max={100} className="form-control" value={b.skor_maks} onChange={(e) => ubahSkor(b.id, e.target.value)} aria-label={`Skor maksimal soal ${i + 1}`} />
                  </div>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setLihat((l) => ({ ...l, [b.id]: !l[b.id] }))} aria-label={lihat[b.id] ? "Tutup pratinjau" : "Lihat soal"}><i className={`bi ${lihat[b.id] ? "bi-eye-slash" : "bi-eye"}`}></i></button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => hapus(b)} aria-label={`Keluarkan soal ${i + 1}`}><i className="bi bi-x-lg"></i></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
