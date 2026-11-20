"use client";
import { cetakKartuUjian } from "@/components/siswa/cetakKartu";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";
import { useAkses } from "@/app/lib/akses";
import { esc } from "@/app/lib/dokumenResmi";

// <input type="datetime-local"> memakai waktu lokal tanpa zona; server menerima ISO dengan zona
const keLokal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const keIso = (lokal) => (lokal ? new Date(lokal).toISOString() : null);
const tokenAcak = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
const waktu = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");
const jam = (iso) => (iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-");
const menit = (detik) => (detik == null ? "–" : `${Math.floor(detik / 60)}:${String(detik % 60).padStart(2, "0")}`);

const STATUS_SESI = { TERJADWAL: ["Terjadwal", "info"], BERLANGSUNG: ["Berlangsung", "success"], SELESAI: ["Selesai", "secondary"], NONAKTIF: ["Nonaktif", "light"] };
const STATUS_SISWA = {
  BELUM: ["Belum masuk", "secondary"], MENGERJAKAN: ["Mengerjakan", "primary"], OFFLINE: ["Offline", "warning"],
  TERKUNCI: ["Terkunci", "danger"], SELESAI: ["Selesai", "success"], SESI_LAIN: ["Sesi lain", "light"],
};
const PERISTIWA = {
  MASUK: "Masuk ujian", KELUAR_TAB: "Keluar dari halaman", KELUAR_LAYAR_PENUH: "Keluar layar penuh", OFFLINE: "Sinyal putus", ONLINE: "Sinyal kembali",
  PERANGKAT_LAIN: "Mencoba dari perangkat lain", TERKUNCI: "Terkunci", DIIZINKAN: "Diizinkan masuk ulang", TAMBAH_WAKTU: "Tambah waktu", DIAKHIRI: "Diakhiri pengawas",
};

export default function Halaman() {
  return <Suspense fallback={null}><SesiUjianPage /></Suspense>;
}

/** Sesi ujian CBT/ANBK: jadwalkan paket untuk beberapa kelas, token sesi, pantau pengawas langsung, kartu peserta. */
function SesiUjianPage() {
  const akses = useAkses();
  const cari = useSearchParams();
  const [daftar, setDaftar] = useState(null);
  const [ref, setRef] = useState(null);
  const [form, setForm] = useState(null); // null | {} (baru) | sesi (ubah)
  const [buka, setBuka] = useState(cari.get("sesi"));

  const muat = useCallback(() => {
    minta("GET", "/sesi-ujian").then((r) => setDaftar(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
  }, []);
  useEffect(() => { muat(); }, [muat]);
  const muatRef = useCallback(async () => {
    if (ref) return ref;
    const r = await minta("GET", "/sesi-ujian/referensi");
    setRef(r);
    return r;
  }, [ref]);

  const bukaForm = async (sesi = {}) => {
    try { await muatRef(); setForm(sesi); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  if (buka) return <DetailSesi id={buka} akses={akses} onKembali={() => { setBuka(null); muat(); }} onUbah={(s) => bukaForm(s)} formEl={form && <FormSesi awal={form} ref_={ref} onTutup={() => setForm(null)} onSimpan={() => { setForm(null); setBuka(null); setTimeout(() => setBuka(buka), 0); muat(); }} />} />;

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <h4 className="fw-bold mb-0"><i className="bi bi-pc-display me-2 text-primary"></i>Sesi Ujian (CBT)</h4>
          <div className="small text-muted">Satu paket soal untuk beberapa kelas sekaligus, token sesi, mode ujian (layar penuh, satu perangkat), dan pantauan pengawas langsung.</div>
        </div>
        {!akses.isPeninjau && <button className="btn btn-primary" onClick={() => bukaForm({})}><i className="bi bi-plus-lg me-1"></i>Sesi baru</button>}
      </div>
      {!daftar ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !daftar.length ? (
          <div className="text-center text-muted py-5"><i className="bi bi-pc-display fs-1 d-block mb-2"></i>Belum ada sesi ujian. Siapkan paket soal di <b>Bank Soal → Paket</b>, lalu tekan <b>Sesi baru</b>.</div>
        ) : (
          <div className="row g-2">
            {daftar.map((s) => {
              const [label, warna] = STATUS_SESI[s.status];
              return (
                <div key={s.id_sesi} className="col-md-6 col-xl-4">
                  <div className="card shadow-sm h-100 kartu-sesi" role="button" tabIndex={0} onClick={() => setBuka(s.id_sesi)} onKeyDown={(e) => { if (e.key === "Enter") setBuka(s.id_sesi); }}>
                    <div className="card-body py-2">
                      <div className="d-flex gap-2 align-items-start">
                        <div className="me-auto min-w-0">
                          <div className="fw-semibold">{s.nama}</div>
                          <div className="small text-muted text-truncate">{s.paket} · {s.mapel}</div>
                        </div>
                        <span className={`badge text-bg-${warna} ${warna === "light" ? "border" : ""}`}>{label}</span>
                      </div>
                      <div className="small mt-1"><i className="bi bi-clock me-1"></i>{waktu(s.mulai)} – {jam(s.selesai)}{s.durasi_menit && ` · ${s.durasi_menit} menit`}</div>
                      <div className="small text-muted">{s.ruang && <><i className="bi bi-door-open me-1"></i>{s.ruang} · </>}{s.pengawas ? <>Pengawas {s.pengawas}</> : "Pengawas belum ditentukan"}</div>
                      <div className="d-flex flex-wrap gap-1 mt-2">
                        {s.nama_kelas.map((k) => <span key={k} className="badge text-bg-light border fw-normal">{k}</span>)}
                        <span className="badge text-bg-primary fw-normal ms-auto">{s.jumlah_mulai}/{s.jumlah_peserta} masuk</span>
                        {s.jumlah_terkunci > 0 && <span className="badge text-bg-danger fw-normal">{s.jumlah_terkunci} terkunci</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {form && <FormSesi awal={form} ref_={ref} onTutup={() => setForm(null)} onSimpan={(d) => { setForm(null); muat(); setBuka(d.id_sesi); }} />}
    </div>
  );
}

function FormSesi({ awal, ref_, onTutup, onSimpan }) {
  const baru = !awal.id_sesi;
  const kini = new Date();
  const [f, setF] = useState(() => ({
    nama: awal.nama || "", id_paket: awal.id_paket || "", kelas: awal.kelas || [],
    mulai: keLokal(awal.mulai) || keLokal(new Date(kini.getTime() + 15 * 60000).toISOString()),
    selesai: keLokal(awal.selesai) || keLokal(new Date(kini.getTime() + 135 * 60000).toISOString()),
    durasi_menit: awal.durasi_menit ?? "", token: awal.token_dasar || tokenAcak(), token_ganti_menit: awal.token_ganti_menit ?? "",
    ruang: awal.ruang || "", id_pengawas: awal.id_pengawas || "",
    acak_soal: awal.acak_soal ?? true, acak_pilihan: awal.acak_pilihan ?? true, tampilkan_nilai: awal.tampilkan_nilai ?? false,
    wajib_layar_penuh: awal.wajib_layar_penuh ?? true, kunci_perangkat: awal.kunci_perangkat ?? true,
    batas_pelanggaran: awal.batas_pelanggaran ?? (baru ? 3 : ""), aktif: awal.aktif ?? true,
  }));
  const [proses, setProses] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const paket = ref_.paket.find((p) => p.id_paket === f.id_paket);
  const pilihPaket = (id) => {
    const p = ref_.paket.find((x) => x.id_paket === id);
    setF((x) => ({ ...x, id_paket: id, durasi_menit: x.durasi_menit || p?.durasi_menit || "", kelas: x.kelas.length ? x.kelas : (p?.id_kelas ? [p.id_kelas] : []),
      nama: x.nama || (p ? `${p.judul} Sesi 1` : "") }));
  };

  const simpan = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const body = { ...f, mulai: keIso(f.mulai), selesai: keIso(f.selesai), durasi_menit: f.durasi_menit ? Number(f.durasi_menit) : null,
        token_ganti_menit: f.token_ganti_menit ? Number(f.token_ganti_menit) : null, batas_pelanggaran: f.batas_pelanggaran ? Number(f.batas_pelanggaran) : null,
        id_pengawas: f.id_pengawas || null, ruang: f.ruang || null };
      const r = await minta(baru ? "POST" : "PUT", baru ? "/sesi-ujian" : `/sesi-ujian/${awal.id_sesi}`, body);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message, showConfirmButton: false, timer: 2000 });
      onSimpan(r.data);
    } catch (err) { Swal.fire("Belum bisa disimpan", err.message, "warning"); }
    finally { setProses(false); }
  };

  return (
    <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={baru ? "Sesi ujian baru" : "Ubah sesi ujian"} style={{ background: "rgba(15,23,42,.45)" }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <form className="modal-content" onSubmit={simpan}>
          <div className="modal-header"><h5 className="modal-title">{baru ? "Sesi ujian baru" : "Ubah sesi ujian"}</h5><button type="button" className="btn-close" aria-label="Tutup" onClick={onTutup}></button></div>
          <div className="modal-body row g-2 small">
            <div className="col-md-7">
              <label className="form-label mb-0 fw-semibold" htmlFor="sesiPaket">Paket soal</label>
              <select id="sesiPaket" className="form-select form-select-sm" required value={f.id_paket} onChange={(e) => pilihPaket(e.target.value)}>
                <option value="">— pilih paket —</option>
                {ref_.paket.map((p) => <option key={p.id_paket} value={p.id_paket}>{p.judul} · {p.mapel} · {p.jumlah_soal} soal</option>)}
              </select>
              {!ref_.paket.length && <div className="form-text text-danger">Belum ada paket soal berisi soal. Susun dulu di Bank Soal → Paket.</div>}
            </div>
            <div className="col-md-5">
              <label className="form-label mb-0 fw-semibold" htmlFor="sesiNama">Nama sesi</label>
              <input id="sesiNama" className="form-control form-control-sm" required maxLength={150} placeholder="mis. PTS Matematika Sesi 1" value={f.nama} onChange={(e) => set("nama", e.target.value)} />
            </div>
            <div className="col-12">
              <div className="fw-semibold">Kelas peserta</div>
              <div className="d-flex flex-wrap gap-2" role="group" aria-label="Kelas peserta">
                {ref_.kelas.map((k) => (
                  <label key={k.id_kelas} className="form-check-label border rounded px-2 py-1">
                    <input type="checkbox" className="form-check-input me-1" checked={f.kelas.includes(k.id_kelas)}
                      onChange={(e) => set("kelas", e.target.checked ? [...f.kelas, k.id_kelas] : f.kelas.filter((x) => x !== k.id_kelas))} />{k.nama_kelas}
                  </label>
                ))}
              </div>
            </div>
            <div className="col-md-4"><label className="form-label mb-0" htmlFor="sesiMulai">Dibuka</label><input id="sesiMulai" type="datetime-local" className="form-control form-control-sm" required value={f.mulai} onChange={(e) => set("mulai", e.target.value)} /></div>
            <div className="col-md-4"><label className="form-label mb-0" htmlFor="sesiSelesai">Ditutup</label><input id="sesiSelesai" type="datetime-local" className="form-control form-control-sm" required value={f.selesai} onChange={(e) => set("selesai", e.target.value)} /></div>
            <div className="col-md-4"><label className="form-label mb-0" htmlFor="sesiDurasi">Waktu mengerjakan (menit)</label><input id="sesiDurasi" type="number" min={5} max={600} className="form-control form-control-sm" value={f.durasi_menit} onChange={(e) => set("durasi_menit", e.target.value)} placeholder={paket?.durasi_menit || "sampai ditutup"} /></div>
            <div className="col-md-4">
              <label className="form-label mb-0" htmlFor="sesiToken">Token sesi</label>
              <div className="input-group input-group-sm">
                <input id="sesiToken" className="form-control text-uppercase font-monospace" required minLength={4} maxLength={12} value={f.token} onChange={(e) => set("token", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} />
                <button type="button" className="btn btn-outline-secondary" onClick={() => set("token", tokenAcak())} aria-label="Buat token acak"><i className="bi bi-shuffle"></i></button>
              </div>
            </div>
            <div className="col-md-4">
              <label className="form-label mb-0" htmlFor="sesiGanti">Pergantian token</label>
              <select id="sesiGanti" className="form-select form-select-sm" value={f.token_ganti_menit} onChange={(e) => set("token_ganti_menit", e.target.value)}>
                <option value="">Tetap selama sesi</option>
                {[5, 10, 15, 20, 30, 60].map((m) => <option key={m} value={m}>Berganti tiap {m} menit</option>)}
              </select>
            </div>
            <div className="col-md-4"><label className="form-label mb-0" htmlFor="sesiRuang">Ruang</label><input id="sesiRuang" className="form-control form-control-sm" maxLength={80} placeholder="mis. Lab Komputer 1" value={f.ruang} onChange={(e) => set("ruang", e.target.value)} /></div>
            <div className="col-md-6">
              <label className="form-label mb-0" htmlFor="sesiPengawas">Pengawas</label>
              <select id="sesiPengawas" className="form-select form-select-sm" value={f.id_pengawas} onChange={(e) => set("id_pengawas", e.target.value)}>
                <option value="">— belum ditentukan —</option>
                {ref_.guru.map((g) => <option key={g.id_guru} value={g.id_guru}>{g.nama_guru}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label mb-0" htmlFor="sesiBatas">Kunci setelah pelanggaran ke-</label>
              <input id="sesiBatas" type="number" min={1} max={50} className="form-control form-control-sm" placeholder="kosong = tidak dikunci" value={f.batas_pelanggaran} onChange={(e) => set("batas_pelanggaran", e.target.value)} />
            </div>
            <div className="col-12 d-flex flex-wrap gap-3 mt-2">
              {[["wajib_layar_penuh", "Wajib layar penuh"], ["kunci_perangkat", "Satu perangkat per siswa"], ["acak_soal", "Acak urutan soal"], ["acak_pilihan", "Acak pilihan jawaban"],
                ["tampilkan_nilai", "Siswa melihat nilai setelah selesai"], ["aktif", "Sesi aktif"]].map(([k, l]) => (
                <div key={k} className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" id={`sesi_${k}`} checked={f[k]} onChange={(e) => set(k, e.target.checked)} />
                  <label className="form-check-label" htmlFor={`sesi_${k}`}>{l}</label>
                </div>
              ))}
            </div>
            <div className="col-12 form-text">Siswa masuk dengan akun siswa → menu <b>Tes Online</b>, lalu mengetik token yang ditampilkan pengawas. Keluar halaman atau layar penuh tercatat; setelah batas pelanggaran ujian terkunci sampai pengawas mengizinkan masuk ulang.</div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onTutup}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={proses || !f.kelas.length}>{proses && <span className="spinner-border spinner-border-sm me-1"></span>}Simpan sesi</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailSesi({ id, akses, onKembali, onUbah, formEl }) {
  const [sesi, setSesi] = useState(null);
  const [pantau, setPantau] = useState(null);
  const [saring, setSaring] = useState("");
  const [detik, setDetik] = useState(null);

  const muatPantau = useCallback(async () => {
    try {
      const r = await minta("GET", `/sesi-ujian/${id}/pantau`);
      setPantau(r);
      setDetik(r.token_ganti_detik);
    } catch (err) { /* abaikan saat pemantauan berkala */ }
  }, [id]);
  useEffect(() => {
    minta("GET", `/sesi-ujian/${id}`).then((r) => setSesi(r.data)).catch((err) => Swal.fire("Gagal memuat", err.message, "error"));
    muatPantau();
    const t = setInterval(muatPantau, 10000);
    return () => clearInterval(t);
  }, [id, muatPantau]);
  // Hitung mundur pergantian token; saat habis muat ulang agar token baru tampil
  useEffect(() => {
    if (detik == null) return;
    const t = setInterval(() => setDetik((d) => { if (d <= 1) { muatPantau(); return null; } return d - 1; }), 1000);
    return () => clearInterval(t);
  }, [detik != null, muatPantau]); // eslint-disable-line react-hooks/exhaustive-deps

  const baris = useMemo(() => (pantau?.data || []).filter((s) => !saring || s.status === saring), [pantau, saring]);
  if (!sesi) return <div className="container-fluid py-3 text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat sesi…</div>;
  const bolehUbah = !akses.isPeninjau && (akses.isAdmin || akses.isKepsek || sesi.boleh_ubah);

  const izinkan = async (s) => {
    const r = await Swal.fire({
      title: `Izinkan ${s.nama_siswa} masuk ulang?`,
      html: `<div class="small text-start">${s.alasan_kunci ? `<div class="mb-2">${esc(s.alasan_kunci)}</div>` : ""}Kunci dibuka dan siswa boleh melanjutkan di perangkat mana pun (perangkat baru tercatat saat dipakai). Jawaban yang sudah tersimpan tetap ada.</div>`
        + `<label class="form-label small mt-2 mb-0" for="tambahMenit">Tambah waktu (menit)</label><input id="tambahMenit" type="number" min="0" max="120" value="0" class="form-control">`,
      showCancelButton: true, confirmButtonText: "Izinkan", cancelButtonText: "Batal",
      preConfirm: () => Number(document.getElementById("tambahMenit").value) || 0,
    });
    if (!r.isConfirmed) return;
    try { const h = await minta("POST", `/sesi-ujian/${id}/siswa/${s.id_siswa}/izinkan`, { tambah_menit: r.value }); Swal.fire({ toast: true, position: "top-end", icon: "success", title: h.message, showConfirmButton: false, timer: 2500 }); muatPantau(); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const akhiri = async (s) => {
    const ok = await Swal.fire({ title: `Akhiri sesi ${s.nama_siswa}?`, text: "Jawaban yang sudah tersimpan dikumpulkan dan dinilai.", icon: "question", showCancelButton: true, confirmButtonText: "Akhiri", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    try { await minta("POST", `/sesi-ujian/${id}/siswa/${s.id_siswa}/akhiri`); muatPantau(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const lihatLog = async (s) => {
    try {
      const r = await minta("GET", `/sesi-ujian/${id}/siswa/${s.id_siswa}/log`);
      Swal.fire({ title: `Log ${s.nama_siswa}`, width: 560, html: r.data.length
        ? `<ul class="list-unstyled small text-start mb-0">${r.data.map((e) => `<li class="border-bottom py-1"><span class="text-muted">${esc(new Date(e.t).toLocaleTimeString("id-ID"))}</span> · <b>${esc(PERISTIWA[e.jenis] || e.jenis)}</b>${e.ket ? ` <span class="text-muted">${esc(e.ket)}</span>` : ""}</li>`).join("")}</ul>`
        : "<div class='small text-muted'>Belum ada peristiwa.</div>" });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };
  const hapus = async () => {
    const ok = await Swal.fire({ title: "Hapus sesi ini?", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await minta("DELETE", `/sesi-ujian/${id}`); onKembali(); } catch (err) { Swal.fire("Belum bisa", err.message, "warning"); }
  };
  // Kartu peserta berfoto & ber-QR (QR membuka halaman masuk dengan NISN terisi)
  const kartu = () => cetakKartuUjian(id, { waktu, jam });

  const [labelSesi, warnaSesi] = STATUS_SESI[sesi.status];
  const r = pantau?.ringkasan || {};
  return (
    <div className="container-fluid py-3 detail-sesi">
      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={onKembali} aria-label="Kembali ke daftar sesi"><i className="bi bi-arrow-left"></i></button>
        <div className="me-auto min-w-0">
          <div className="fw-bold fs-5">{sesi.nama} <span className={`badge text-bg-${warnaSesi} fs-6 align-middle ${warnaSesi === "light" ? "border" : ""}`}>{labelSesi}</span></div>
          <div className="small text-muted">{sesi.paket} · {sesi.mapel} · {waktu(sesi.mulai)} – {jam(sesi.selesai)}{sesi.durasi_menit && ` · ${sesi.durasi_menit} menit`}{sesi.ruang && ` · ${sesi.ruang}`} · Pengawas {sesi.pengawas || "-"}</div>
          <div className="d-flex flex-wrap gap-1 mt-1">
            {sesi.nama_kelas.map((k) => <span key={k} className="badge text-bg-light border fw-normal">{k}</span>)}
            {sesi.wajib_layar_penuh && <span className="badge text-bg-light border fw-normal"><i className="bi bi-arrows-fullscreen me-1"></i>Layar penuh</span>}
            {sesi.kunci_perangkat && <span className="badge text-bg-light border fw-normal"><i className="bi bi-phone me-1"></i>Satu perangkat</span>}
            {sesi.batas_pelanggaran && <span className="badge text-bg-light border fw-normal"><i className="bi bi-lock me-1"></i>Kunci setelah {sesi.batas_pelanggaran} pelanggaran</span>}
          </div>
        </div>
        <div className="d-flex flex-wrap gap-1">
          <button className="btn btn-sm btn-outline-primary" onClick={kartu}><i className="bi bi-person-badge me-1"></i>Kartu peserta</button>
          {bolehUbah && <button className="btn btn-sm btn-outline-secondary" onClick={() => onUbah(sesi)}><i className="bi bi-pencil me-1"></i>Ubah</button>}
          {bolehUbah && <button className="btn btn-sm btn-outline-danger" onClick={hapus} aria-label="Hapus sesi"><i className="bi bi-trash"></i></button>}
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-3">
          <div className="card shadow-sm text-center mb-3" data-token-sesi>
            <div className="card-body">
              <div className="small text-muted">Token sesi</div>
              <div className="display-5 fw-bold font-monospace text-primary" style={{ letterSpacing: ".12em" }}>{pantau?.token || sesi.token}</div>
              {detik != null ? <div className="small text-muted">berganti dalam {menit(detik)}</div> : <div className="small text-muted">tetap selama sesi</div>}
              <div className="small mt-2">Tulis di papan atau tampilkan layar ini ke peserta.</div>
            </div>
          </div>
          <div className="card shadow-sm">
            <div className="card-body small">
              {Object.entries(STATUS_SISWA).map(([k, [l, w]]) => (
                <button key={k} type="button" className={`d-flex w-100 align-items-center btn btn-sm text-start ${saring === k ? "btn-light border" : "btn-link text-decoration-none text-body"}`} onClick={() => setSaring(saring === k ? "" : k)}>
                  <span className={`badge text-bg-${w} me-2 ${w === "light" ? "border" : ""}`}>{r[k] || 0}</span>{l}
                </button>
              ))}
              <div className="text-muted mt-2">Total {r.total || 0} peserta · diperbarui tiap 10 detik</div>
            </div>
          </div>
        </div>
        <div className="col-lg-9">
          {!pantau ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat pantauan…</div> : (
            <div className="table-responsive">
              <table className="table table-sm align-middle small mb-0 pantau-sesi">
                <thead><tr><th>Siswa</th><th>Kelas</th><th>Status</th><th className="text-center">Terjawab</th><th className="text-center">Sisa</th><th className="text-center" title="Pelanggaran sejak terakhir diizinkan">Langgar</th><th>Peristiwa terakhir</th><th></th></tr></thead>
                <tbody>
                  {baris.map((s) => {
                    const [l, w] = STATUS_SISWA[s.status];
                    const jalan = ["MENGERJAKAN", "OFFLINE", "TERKUNCI"].includes(s.status);
                    return (
                      <tr key={s.id_siswa} data-siswa={s.id_siswa} className={s.status === "TERKUNCI" ? "table-danger" : s.status === "OFFLINE" ? "table-warning" : ""}>
                        <td>{s.nama_siswa}{s.alasan_kunci && <div className="text-danger">{s.alasan_kunci}</div>}</td>
                        <td>{s.kelas}</td>
                        <td><span className={`badge text-bg-${w} ${w === "light" ? "border" : ""}`}>{l}</span>{s.tambahan_menit > 0 && <span className="badge text-bg-light border fw-normal ms-1">+{s.tambahan_menit}m</span>}</td>
                        <td className="text-center">{s.status === "BELUM" ? "–" : `${s.terjawab}/${s.jumlah_soal}`}</td>
                        <td className="text-center font-monospace">{jalan ? menit(s.sisa_detik) : s.status === "SELESAI" && s.nilai != null ? <span title="Nilai">{s.nilai}</span> : "–"}</td>
                        <td className="text-center">{s.pelanggaran > 0 ? <span className="badge text-bg-warning">{s.pelanggaran}×</span> : "–"}</td>
                        <td className="text-muted">{s.peristiwa_terakhir ? <>{PERISTIWA[s.peristiwa_terakhir.jenis] || s.peristiwa_terakhir.jenis} · {jam(s.peristiwa_terakhir.t)}</> : "–"}</td>
                        <td className="text-end text-nowrap">
                          {s.jumlah_peristiwa > 0 && <button className="btn btn-sm btn-link px-1" onClick={() => lihatLog(s)} aria-label={`Log ${s.nama_siswa}`}><i className="bi bi-list-ul"></i></button>}
                          {jalan && <button className={`btn btn-sm ${s.status === "TERKUNCI" ? "btn-danger" : "btn-outline-secondary"}`} onClick={() => izinkan(s)}>{s.status === "TERKUNCI" ? "Izinkan masuk" : "Izinkan / waktu"}</button>}
                          {jalan && <button className="btn btn-sm btn-outline-primary ms-1" onClick={() => akhiri(s)}>Akhiri</button>}
                        </td>
                      </tr>
                    );
                  })}
                  {!baris.length && <tr><td colSpan={8} className="text-center text-muted py-3">Tidak ada peserta dengan status ini.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {formEl}
    </div>
  );
}
