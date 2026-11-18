"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { MenuAksi } from "@/components/dashboard/menuAksi";
import Pengisi from "@/components/dashboard/Pengisi";
import { cetakKas, cetakKuitansi, METODE, rp } from "./cetak";

const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2800 });
const tgl = (t) => (t ? new Date(`${String(t).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const WARNA = { BELUM: "secondary", SEBAGIAN: "warning", LUNAS: "success", BATAL: "dark" };
const NAMA_STATUS = { BELUM: "Belum dibayar", SEBAGIAN: "Sebagian", LUNAS: "Lunas", BATAL: "Dibatalkan" };
const TAB = [
  { id: "ringkasan", label: "Ringkasan", ikon: "bi-speedometer2" },
  { id: "siswa", label: "Siswa & Bayar", ikon: "bi-person-vcard" },
  { id: "tagihan", label: "Tagihan", ikon: "bi-receipt" },
  { id: "tunggakan", label: "Tunggakan", ikon: "bi-exclamation-diamond" },
  { id: "kas", label: "Kas", ikon: "bi-journal-bookmark" },
  { id: "pengaturan", label: "Jenis Biaya & Beasiswa", ikon: "bi-sliders" },
];
const gagal = (e) => Swal.fire("Belum bisa", e.message, "warning");
const nilai = (id) => document.getElementById(id)?.value?.trim() ?? "";

/** Daftar bulan "YYYY-MM" dari a sampai b (maks. 12). */
function rentangBulan(a, b) {
  if (!a || !b || a > b) return [];
  const hasil = [];
  let [th, bl] = a.split("-").map(Number);
  while (hasil.length < 12) {
    const kode = `${th}-${String(bl).padStart(2, "0")}`;
    hasil.push(kode);
    if (kode === b) break;
    bl += 1; if (bl > 12) { bl = 1; th += 1; }
  }
  return hasil;
}

/**
 * Keuangan & Pembayaran (Administrasi Sekolah Tahap C): jenis biaya, beasiswa, tagihan massal, pembayaran + kuitansi,
 * tunggakan + pengingat WhatsApp, dan laporan kas. Pembayaran daring (payment gateway) belum tersedia.
 */
export default function KeuanganPage() {
  const akses = useAkses();
  const bolehUbah = !akses.isPeninjau;
  const [tab, setTab] = useState("ringkasan");
  const [pilihan, setPilihan] = useState(null);
  const [galat, setGalat] = useState("");
  const [idSiswa, setIdSiswa] = useState(null);

  const muatPilihan = useCallback(() => minta("GET", "/administrasi/keuangan/pilihan").then((r) => setPilihan(r.data)).catch((e) => setGalat(e.message)), []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (TAB.some((t) => t.id === q.get("tab"))) setTab(q.get("tab"));
    if (q.get("siswa")) { setTab("siswa"); setIdSiswa(q.get("siswa")); }
    muatPilihan();
  }, [muatPilihan]);

  const pindah = (t) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t); url.searchParams.delete("siswa");
    window.history.replaceState(null, "", url);
  };
  const bukaSiswa = (id) => { setIdSiswa(id); setTab("siswa"); };

  if (galat) return <div className="container-fluid py-3"><div className="alert alert-warning">{galat}</div></div>;
  if (!pilihan) return <div className="container-fluid py-3 text-muted">Memuat…</div>;

  const props = { pilihan, bolehUbah, muatPilihan, bukaSiswa };
  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1250 }}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <div className="small text-muted"><Link href="/dashboard/administrasi">Administrasi Sekolah</Link></div>
          <h3 className="fw-bold mb-0"><i className="bi bi-cash-coin text-primary me-2"></i>Keuangan & Pembayaran</h3>
        </div>
        {!bolehUbah && <span className="badge text-bg-secondary">Mode lihat saja</span>}
      </div>
      <ul className="nav nav-pills flex-nowrap overflow-auto gap-1 mb-3" role="tablist">
        {TAB.map((t) => (
          <li key={t.id} className="nav-item">
            <button type="button" role="tab" aria-selected={tab === t.id} className={`nav-link text-nowrap ${tab === t.id ? "active" : ""}`} onClick={() => pindah(t.id)}>
              <i className={`bi ${t.ikon} me-1`}></i>{t.label}
            </button>
          </li>
        ))}
      </ul>
      {tab === "ringkasan" && <Ringkasan {...props} pindah={pindah} />}
      {tab === "siswa" && <SiswaBayar {...props} idSiswa={idSiswa} setIdSiswa={setIdSiswa} />}
      {tab === "tagihan" && <Tagihan {...props} />}
      {tab === "tunggakan" && <Tunggakan {...props} />}
      {tab === "kas" && <Kas {...props} />}
      {tab === "pengaturan" && <Pengaturan {...props} />}
    </div>
  );
}

function Kartu({ judul, nilai: isi, ikon, warna = "primary", sub }) {
  return (
    <div className="col-6 col-lg-3">
      <div className="card h-100"><div className="card-body py-2">
        <div className="small text-muted"><i className={`bi ${ikon} text-${warna} me-1`}></i>{judul}</div>
        <div className="fs-5 fw-bold">{isi}</div>
        {sub && <div className="small text-muted">{sub}</div>}
      </div></div>
    </div>
  );
}

// ===================== RINGKASAN =====================
function Ringkasan({ pilihan, pindah, bukaSiswa }) {
  const [d, setD] = useState(null);
  useEffect(() => { minta("GET", "/administrasi/keuangan/ringkasan").then((r) => setD(r.data)).catch(gagal); }, []);
  if (!d) return <div className="text-muted">Memuat…</div>;
  const kosong = !pilihan.jenis_biaya.length;
  return (
    <>
      {kosong && (
        <div className="alert alert-info d-flex flex-wrap align-items-center gap-2">
          <span className="me-auto"><b>Mulai di sini:</b> buat jenis biaya (misalnya SPP bulanan), lalu buat tagihan untuk siswa.</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => pindah("pengaturan")}>Atur jenis biaya</button>
        </div>
      )}
      <div className="row g-2 mb-3" data-ringkasan>
        <Kartu judul="Penerimaan hari ini" nilai={rp(d.penerimaan_hari_ini)} ikon="bi-cash" warna="success" />
        <Kartu judul="Penerimaan bulan ini" nilai={rp(d.penerimaan_bulan_ini)} ikon="bi-calendar-check" warna="success" />
        <Kartu judul="Sisa tagihan aktif" nilai={rp(d.sisa_tagihan)} ikon="bi-receipt" sub={`${d.tagihan_aktif} tagihan`} />
        <Kartu judul="Tunggakan" nilai={rp(d.tunggakan)} ikon="bi-exclamation-diamond" warna="danger" sub={`${d.siswa_menunggak} siswa lewat jatuh tempo`} />
      </div>
      <div className="row g-3">
        <div className="col-lg-7">
          <div className="card"><div className="card-header fw-semibold">Pembayaran terakhir</div>
            <ul className="list-group list-group-flush">
              {d.pembayaran_terakhir.length === 0 && <li className="list-group-item text-muted">Belum ada pembayaran.</li>}
              {d.pembayaran_terakhir.map((p) => (
                <li key={p.id} className="list-group-item d-flex align-items-center gap-2">
                  <button type="button" className="btn btn-link p-0 text-start me-auto" onClick={() => bukaSiswa(p.id_siswa)}>{p.siswa?.nama_siswa}</button>
                  <span className="small text-muted d-none d-sm-inline">{p.nomor_kuitansi} · {tgl(p.tanggal)}</span>
                  <b>{rp(p.jumlah)}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card"><div className="card-body">
            <div className="fw-semibold mb-2">Pekerjaan rutin</div>
            <div className="d-grid gap-2">
              <button type="button" className="btn btn-outline-primary text-start" onClick={() => pindah("siswa")}><i className="bi bi-cash-stack me-2"></i>Catat pembayaran siswa</button>
              <button type="button" className="btn btn-outline-primary text-start" onClick={() => pindah("tagihan")}><i className="bi bi-receipt me-2"></i>Buat tagihan bulan baru</button>
              <button type="button" className="btn btn-outline-danger text-start" onClick={() => pindah("tunggakan")}><i className="bi bi-whatsapp me-2"></i>Ingatkan orang tua yang menunggak</button>
              <button type="button" className="btn btn-outline-secondary text-start" onClick={() => pindah("kas")}><i className="bi bi-printer me-2"></i>Laporan kas</button>
            </div>
            <div className="small text-muted mt-3"><i className="bi bi-info-circle me-1"></i>Pembayaran dicatat oleh petugas (tunai atau transfer). Pembayaran daring lewat QRIS/VA belum tersedia.</div>
          </div></div>
        </div>
      </div>
    </>
  );
}

// ===================== SISWA & BAYAR =====================
function SiswaBayar({ pilihan, bolehUbah, idSiswa, setIdSiswa }) {
  const [daftar, setDaftar] = useState(null);
  const [cari, setCari] = useState("");
  const [kelas, setKelas] = useState("");
  const muat = useCallback(() => {
    const q = new URLSearchParams({ ...(kelas && { id_kelas: kelas }) });
    minta("GET", `/administrasi/keuangan/siswa?${q}`).then((r) => setDaftar(r.data)).catch(gagal);
  }, [kelas]);
  useEffect(() => { muat(); }, [muat]);
  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return (daftar || []).filter((s) => !k || s.nama_siswa.toLowerCase().includes(k) || String(s.nisn || "").includes(k));
  }, [daftar, cari]);

  return (
    <div className="row g-3">
      <div className={`col-lg-4 ${idSiswa ? "d-none d-lg-block" : ""}`}>
        <div className="card">
          <div className="card-body pb-2 d-flex gap-2">
            <input className="form-control form-control-sm" placeholder="Cari nama atau NISN…" aria-label="Cari siswa" value={cari} onChange={(e) => setCari(e.target.value)} />
            <select className="form-select form-select-sm" style={{ maxWidth: 120 }} aria-label="Saring kelas" value={kelas} onChange={(e) => setKelas(e.target.value)}>
              <option value="">Semua kelas</option>
              {pilihan.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
            </select>
          </div>
          <div className="list-group list-group-flush" style={{ maxHeight: "65vh", overflowY: "auto" }}>
            {!daftar && <div className="list-group-item text-muted">Memuat…</div>}
            {daftar && tampil.length === 0 && <div className="list-group-item text-muted">Tidak ada siswa.</div>}
            {tampil.map((s) => (
              <button key={s.id_siswa} type="button" data-siswa-keu={s.id_siswa} onClick={() => setIdSiswa(s.id_siswa)}
                className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${idSiswa === s.id_siswa ? "active" : ""}`}>
                <span className="me-auto text-start"><span className="fw-semibold">{s.nama_siswa}</span><br /><span className="small opacity-75">{s.kelas?.nama_kelas || "Tanpa kelas"}</span></span>
                {s.tunggakan > 0 ? <span className="badge text-bg-danger">{rp(s.tunggakan)}</span>
                  : s.sisa > 0 ? <span className="badge text-bg-warning">{rp(s.sisa)}</span>
                  : <span className="badge text-bg-success">Lunas</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        {idSiswa ? <DetailSiswa key={idSiswa} id={idSiswa} pilihan={pilihan} bolehUbah={bolehUbah} onTutup={() => setIdSiswa(null)} onBerubah={muat} />
          : <div className="card"><div className="card-body text-muted text-center py-5"><i className="bi bi-person-vcard fs-1 d-block mb-2"></i>Pilih siswa untuk melihat tagihan dan mencatat pembayaran.</div></div>}
      </div>
    </div>
  );
}

function DetailSiswa({ id, pilihan, bolehUbah, onTutup, onBerubah }) {
  const [d, setD] = useState(null);
  const [pilih, setPilih] = useState({}); // id_tagihan → jumlah
  const [form, setForm] = useState({ tanggal: pilihan.hari_ini, metode: "TUNAI", penyetor: "", keterangan: "" });
  const [menyimpan, setMenyimpan] = useState(false);
  const muat = useCallback(() => minta("GET", `/administrasi/keuangan/siswa/${id}`).then((r) => setD(r.data)).catch(gagal), [id]);
  useEffect(() => { muat(); }, [muat]);
  if (!d) return <div className="card"><div className="card-body text-muted">Memuat…</div></div>;

  const aktif = d.tagihan.filter((t) => ["BELUM", "SEBAGIAN"].includes(t.status));
  const total = Object.values(pilih).reduce((a, b) => a + (Number(b) || 0), 0);
  const alih = (t) => setPilih((p) => { const n = { ...p }; if (t.id in n) delete n[t.id]; else n[t.id] = t.sisa; return n; });

  const simpan = async () => {
    const rincian = Object.entries(pilih).map(([id_tagihan, jumlah]) => ({ id_tagihan: Number(id_tagihan), jumlah: Number(jumlah) }));
    if (!rincian.length) return Swal.fire("Pilih tagihan", "Centang tagihan yang dibayar.", "info");
    setMenyimpan(true);
    try {
      const r = await minta("POST", "/administrasi/keuangan/pembayaran", { id_siswa: id, ...form, rincian });
      setPilih({}); setForm((f) => ({ ...f, penyetor: "", keterangan: "" }));
      muat(); onBerubah();
      const k = await Swal.fire({ icon: "success", title: "Pembayaran dicatat", html: `Kuitansi <b>${esc(r.data.nomor_kuitansi)}</b> · ${rp(r.data.jumlah)}`, showCancelButton: true, confirmButtonText: "Cetak kuitansi", cancelButtonText: "Tutup" });
      if (k.isConfirmed) cetakKuitansi(r.data.id);
    } catch (e) { gagal(e); } finally { setMenyimpan(false); }
  };

  const batal = async (p) => {
    const r = await Swal.fire({ title: `Batalkan ${p.nomor_kuitansi}?`, text: "Tagihannya kembali terbuka. Kuitansi tetap tersimpan dengan tanda dibatalkan.", input: "text", inputLabel: "Alasan pembatalan", inputValidator: (v) => (!v?.trim() ? "Tulis alasannya." : null), showCancelButton: true, confirmButtonText: "Batalkan pembayaran", cancelButtonText: "Kembali", confirmButtonColor: "#d33" });
    if (!r.isConfirmed) return;
    try { const x = await minta("POST", `/administrasi/keuangan/pembayaran/${p.id}/batal`, { alasan: r.value }); toast(x.message); muat(); onBerubah(); } catch (e) { gagal(e); }
  };

  const k = d.kontak;
  return (
    <div className="card" data-detail-siswa={id}>
      <div className="card-header d-flex align-items-center gap-2">
        <button type="button" className="btn btn-sm btn-light d-lg-none" onClick={onTutup} aria-label="Kembali ke daftar"><i className="bi bi-arrow-left"></i></button>
        <div className="me-auto">
          <div className="fw-bold">{d.siswa.nama_siswa}</div>
          <div className="small text-muted">{d.siswa.kelas?.nama_kelas || "Tanpa kelas"}{d.siswa.nisn ? ` · NISN ${d.siswa.nisn}` : ""}{k?.no_wa ? ` · ${k.hubungan}: ${k.nama || "-"} (${k.no_wa})` : " · Belum ada nomor WA orang tua"}</div>
        </div>
      </div>
      <div className="card-body">
        {d.beasiswa.filter((b) => b.aktif).map((b) => (
          <span key={b.id} className="badge text-bg-info me-1 mb-2"><i className="bi bi-award me-1"></i>{b.nama}: {b.bentuk === "PERSEN" ? `${b.nilai}%` : rp(b.nilai)} {b.jenis_biaya ? `(${b.jenis_biaya.nama})` : "(semua biaya)"}</span>
        ))}
        <h6 className="fw-semibold">Tagihan belum lunas</h6>
        {aktif.length === 0 ? <div className="text-muted small mb-3">Tidak ada tagihan yang perlu dibayar.</div> : (
          <div className="table-responsive mb-2">
            <table className="table table-sm align-middle mb-0">
              <thead><tr>{bolehUbah && <th style={{ width: 32 }}></th>}<th>Tagihan</th><th>Jatuh tempo</th><th className="text-end">Sisa</th>{bolehUbah && <th style={{ width: 150 }}>Dibayar</th>}</tr></thead>
              <tbody>
                {aktif.map((t) => {
                  const lewat = t.jatuh_tempo < pilihan.hari_ini;
                  return (
                    <tr key={t.id} data-tagihan={t.judul}>
                      {bolehUbah && <td><input type="checkbox" className="form-check-input" aria-label={`Bayar ${t.judul}`} checked={t.id in pilih} onChange={() => alih(t)} /></td>}
                      <td>{t.judul}{t.potongan > 0 && <div className="small text-info">Potongan {rp(t.potongan)} · {t.keterangan_potongan}</div>}</td>
                      <td className={lewat ? "text-danger" : ""}>{tgl(t.jatuh_tempo)}{lewat && <i className="bi bi-exclamation-circle ms-1" title="Lewat jatuh tempo"></i>}</td>
                      <td className="text-end">{rp(t.sisa)}{t.status === "SEBAGIAN" && <div className="small text-muted">dari {rp(t.nominal - t.potongan)}</div>}</td>
                      {bolehUbah && <td>{t.id in pilih && <input type="number" min="1" max={t.sisa} className="form-control form-control-sm" aria-label={`Jumlah ${t.judul}`} value={pilih[t.id]} onChange={(e) => setPilih((p) => ({ ...p, [t.id]: e.target.value }))} />}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {bolehUbah && aktif.length > 0 && (
          <div className="border rounded p-2 mb-3 bg-body-tertiary">
            <div className="row g-2">
              <div className="col-6 col-md-3"><label className="form-label small mb-0" htmlFor="bayarTanggal">Tanggal</label>
                <input id="bayarTanggal" type="date" className="form-control form-control-sm" max={pilihan.hari_ini} value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} /></div>
              <div className="col-6 col-md-3"><label className="form-label small mb-0" htmlFor="bayarMetode">Cara bayar</label>
                <select id="bayarMetode" className="form-select form-select-sm" value={form.metode} onChange={(e) => setForm({ ...form, metode: e.target.value })}>
                  {pilihan.metode.map((m) => <option key={m.kode} value={m.kode}>{m.nama}</option>)}
                </select></div>
              <div className="col-12 col-md-6"><label className="form-label small mb-0" htmlFor="bayarPenyetor">Penyetor (opsional)</label>
                <input id="bayarPenyetor" className="form-control form-control-sm" placeholder="Nama orang tua/wali yang membayar" value={form.penyetor} onChange={(e) => setForm({ ...form, penyetor: e.target.value })} /></div>
              <div className="col-12"><input className="form-control form-control-sm" aria-label="Keterangan pembayaran" placeholder="Keterangan (opsional), misalnya nomor referensi transfer" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></div>
            </div>
            <div className="d-flex align-items-center gap-2 mt-2">
              <span className="me-auto">Total: <b data-total-bayar>{rp(total)}</b></span>
              <button type="button" className="btn btn-success btn-sm" disabled={!total || menyimpan} onClick={simpan}><i className="bi bi-cash-stack me-1"></i>Catat pembayaran</button>
            </div>
          </div>
        )}

        <h6 className="fw-semibold">Riwayat pembayaran</h6>
        {d.pembayaran.length === 0 ? <div className="text-muted small mb-3">Belum ada pembayaran.</div> : (
          <ul className="list-group mb-3">
            {d.pembayaran.map((p) => (
              <li key={p.id} className={`list-group-item ${p.dibatalkan_at ? "text-muted" : ""}`} data-kuitansi={p.nomor_kuitansi}>
                <div className="d-flex align-items-center gap-2">
                  <span className="me-auto"><b className={p.dibatalkan_at ? "text-decoration-line-through" : ""}>{rp(p.jumlah)}</b> <span className="small">· {p.nomor_kuitansi} · {tgl(p.tanggal)} · {METODE[p.metode]}</span></span>
                  {p.dibatalkan_at && <span className="badge text-bg-dark">Dibatalkan</span>}
                  <MenuAksi label={`Aksi untuk ${p.nomor_kuitansi}`} items={[
                    { label: "Cetak kuitansi", ikon: "bi-printer", onClick: () => cetakKuitansi(p.id) },
                    { label: "Batalkan pembayaran", ikon: "bi-x-circle", bahaya: true, pemisah: true, onClick: () => batal(p), tampil: bolehUbah && !p.dibatalkan_at },
                  ]} />
                </div>
                <div className="small text-muted">{p.rincian.map((r) => `${r.tagihan?.judul} (${rp(r.jumlah)})`).join(", ")}</div>
                <div className="small d-flex flex-wrap gap-1 align-items-center">Dicatat <Pengisi pengisi={p.pencatat?.name} sebaris />{p.penyetor && <span className="text-muted">· disetor {p.penyetor}</span>}{p.dibatalkan_at && <span className="text-danger">· alasan batal: {p.alasan_batal}</span>}</div>
              </li>
            ))}
          </ul>
        )}

        <details>
          <summary className="small text-muted">Semua tagihan ({d.tagihan.length}), termasuk yang lunas dan dibatalkan</summary>
          <table className="table table-sm mt-2 small">
            <tbody>
              {d.tagihan.map((t) => (
                <tr key={t.id}><td>{t.judul}</td><td>{tgl(t.jatuh_tempo)}</td><td className="text-end">{rp(t.nominal - t.potongan)}</td>
                  <td><span className={`badge text-bg-${WARNA[t.status]}`}>{NAMA_STATUS[t.status]}</span>{t.alasan_batal && <span className="text-muted"> {t.alasan_batal}</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}

// ===================== TAGIHAN =====================
function Tagihan({ pilihan, bolehUbah, bukaSiswa }) {
  const [saring, setSaring] = useState({ status: "AKTIF", id_jenis_biaya: "", id_kelas: "", search: "" });
  const [hasil, setHasil] = useState(null);
  const muat = useCallback(() => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(saring).filter(([, v]) => v)));
    minta("GET", `/administrasi/keuangan/tagihan?${q}`).then(setHasil).catch(gagal);
  }, [saring]);
  useEffect(() => { const t = setTimeout(muat, 250); return () => clearTimeout(t); }, [muat]);

  const jenisAktif = pilihan.jenis_biaya.filter((j) => j.aktif);

  const buat = async () => {
    if (!jenisAktif.length) return Swal.fire("Belum ada jenis biaya", "Buat jenis biaya dulu di tab Jenis Biaya & Beasiswa.", "info");
    const siswa = (await minta("GET", "/administrasi/keuangan/siswa")).data;
    const bulanIni = pilihan.hari_ini.slice(0, 7);
    const opsiKelas = pilihan.kelas.map((k) => `<label class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name="tKelas" value="${esc(k.id_kelas)}"> ${esc(k.nama_kelas)}</label>`).join("");
    const opsiSiswa = siswa.map((s) => `<option value="${esc(s.id_siswa)}">${esc(s.nama_siswa)}${s.kelas ? ` · ${esc(s.kelas.nama_kelas)}` : ""}</option>`).join("");
    const r = await Swal.fire({
      title: "Buat tagihan", width: 640, showCancelButton: true, confirmButtonText: "Buat tagihan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <label class="form-label mb-0" for="tJenis">Jenis biaya</label>
        <select id="tJenis" class="form-select form-select-sm mb-2">${jenisAktif.map((j) => `<option value="${j.id}" data-periode="${j.periode}" data-nominal="${j.nominal}">${esc(j.nama)} · ${j.periode === "BULANAN" ? "bulanan" : "sekali bayar"}</option>`).join("")}</select>
        <div id="tBulanan" class="row g-2 mb-2">
          <div class="col-6 col-sm-4"><label class="form-label mb-0" for="tDari">Dari bulan</label><input id="tDari" type="month" class="form-control form-control-sm" value="${bulanIni}"></div>
          <div class="col-6 col-sm-4"><label class="form-label mb-0" for="tSampai">Sampai bulan</label><input id="tSampai" type="month" class="form-control form-control-sm" value="${bulanIni}"></div>
          <div class="col-12 col-sm-4"><label class="form-label mb-0" for="tHari">Jatuh tempo tanggal</label><input id="tHari" type="number" min="1" max="28" class="form-control form-control-sm" value="10"></div>
        </div>
        <div id="tSekali" class="row g-2 mb-2" style="display:none">
          <div class="col-6"><label class="form-label mb-0" for="tLabel">Label</label><input id="tLabel" class="form-control form-control-sm" placeholder="${esc(pilihan.tahun_ajaran || "2027/2028")}"></div>
          <div class="col-6"><label class="form-label mb-0" for="tTempo">Jatuh tempo</label><input id="tTempo" type="date" class="form-control form-control-sm"></div>
        </div>
        <label class="form-label mb-0" for="tNominal">Nominal per siswa (Rp)</label>
        <input id="tNominal" type="number" min="1" class="form-control form-control-sm mb-2">
        <label class="form-label mb-0" for="tSasaran">Untuk</label>
        <select id="tSasaran" class="form-select form-select-sm mb-2"><option value="SEMUA">Semua siswa yang punya kelas</option><option value="KELAS">Kelas tertentu</option><option value="SISWA">Siswa tertentu</option></select>
        <div id="tKelasBox" class="mb-2" style="display:none">${opsiKelas}</div>
        <select id="tSiswa" multiple class="form-select form-select-sm mb-2" size="6" aria-label="Pilih siswa" style="display:none">${opsiSiswa}</select>
        <div class="text-muted">Beasiswa/potongan aktif langsung dipotongkan. Tagihan yang sudah ada untuk periode yang sama dilewati.</div>
      </div>`,
      didOpen: () => {
        const jenis = document.getElementById("tJenis");
        const sasaran = document.getElementById("tSasaran");
        const atur = () => {
          const o = jenis.selectedOptions[0];
          const bulanan = o.dataset.periode === "BULANAN";
          document.getElementById("tBulanan").style.display = bulanan ? "" : "none";
          document.getElementById("tSekali").style.display = bulanan ? "none" : "";
          document.getElementById("tNominal").value = o.dataset.nominal;
        };
        const aturSasaran = () => {
          document.getElementById("tKelasBox").style.display = sasaran.value === "KELAS" ? "" : "none";
          document.getElementById("tSiswa").style.display = sasaran.value === "SISWA" ? "" : "none";
        };
        jenis.addEventListener("change", atur); sasaran.addEventListener("change", aturSasaran); atur();
      },
      preConfirm: async () => {
        const o = document.getElementById("tJenis").selectedOptions[0];
        const bulanan = o.dataset.periode === "BULANAN";
        const sasaran = nilai("tSasaran");
        const kirim = {
          id_jenis_biaya: Number(o.value), nominal: Number(nilai("tNominal")) || null, sasaran,
          ...(bulanan ? { bulan: rentangBulan(nilai("tDari"), nilai("tSampai")), hari_jatuh_tempo: Number(nilai("tHari")) || 10 }
            : { label: nilai("tLabel") || null, jatuh_tempo: nilai("tTempo") || null }),
          ...(sasaran === "KELAS" && { id_kelas: [...document.querySelectorAll("input[name=tKelas]:checked")].map((x) => x.value) }),
          ...(sasaran === "SISWA" && { id_siswa: [...document.getElementById("tSiswa").selectedOptions].map((x) => x.value) }),
        };
        if (bulanan && !kirim.bulan.length) { Swal.showValidationMessage("Bulan sampai harus sama atau setelah bulan dari."); return false; }
        try { return await minta("POST", "/administrasi/keuangan/tagihan/buat", kirim); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message, r.value.dibuat ? "success" : "info"); muat(); }
  };

  const ubah = async (t) => {
    const r = await Swal.fire({
      title: "Ubah tagihan", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <div class="mb-2">${esc(t.siswa?.nama_siswa)} · terbayar ${rp(t.terbayar)}</div>
        <label class="form-label mb-0" for="uJudul">Judul</label><input id="uJudul" class="form-control form-control-sm mb-2" value="${esc(t.judul)}">
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="uNominal">Nominal</label><input id="uNominal" type="number" class="form-control form-control-sm" value="${t.nominal}"></div>
        <div class="col-6"><label class="form-label mb-0" for="uPotongan">Potongan</label><input id="uPotongan" type="number" class="form-control form-control-sm" value="${t.potongan}"></div></div>
        <label class="form-label mb-0" for="uKet">Keterangan potongan</label><input id="uKet" class="form-control form-control-sm mb-2" value="${esc(t.keterangan_potongan || "")}">
        <label class="form-label mb-0" for="uTempo">Jatuh tempo</label><input id="uTempo" type="date" class="form-control form-control-sm" value="${t.jatuh_tempo}"></div>`,
      preConfirm: async () => {
        try {
          return await minta("PUT", `/administrasi/keuangan/tagihan/${t.id}`, {
            judul: nilai("uJudul"), nominal: Number(nilai("uNominal")), potongan: Number(nilai("uPotongan")) || 0, keterangan_potongan: nilai("uKet") || null, jatuh_tempo: nilai("uTempo"),
          });
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); }
  };

  const batal = async (t) => {
    const r = await Swal.fire({ title: `Batalkan ${t.judul}?`, text: t.siswa?.nama_siswa, input: "text", inputLabel: "Alasan pembatalan", inputValidator: (v) => (!v?.trim() ? "Tulis alasannya." : null), showCancelButton: true, confirmButtonText: "Batalkan tagihan", cancelButtonText: "Kembali", confirmButtonColor: "#d33" });
    if (!r.isConfirmed) return;
    try { const x = await minta("POST", `/administrasi/keuangan/tagihan/${t.id}/batal`, { alasan: r.value }); toast(x.message); muat(); } catch (e) { gagal(e); }
  };

  const set = (k) => (e) => setSaring((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="card">
      <div className="card-body d-flex flex-wrap gap-2 align-items-center">
        <select className="form-select form-select-sm w-auto" aria-label="Saring status tagihan" value={saring.status} onChange={set("status")}>
          <option value="AKTIF">Belum lunas</option><option value="TERTUNGGAK">Lewat jatuh tempo</option><option value="LUNAS">Lunas</option><option value="">Semua (kecuali batal)</option><option value="BATAL">Dibatalkan</option>
        </select>
        <select className="form-select form-select-sm w-auto" aria-label="Saring jenis biaya" value={saring.id_jenis_biaya} onChange={set("id_jenis_biaya")}>
          <option value="">Semua jenis</option>{pilihan.jenis_biaya.map((j) => <option key={j.id} value={j.id}>{j.nama}</option>)}
        </select>
        <select className="form-select form-select-sm w-auto" aria-label="Saring kelas tagihan" value={saring.id_kelas} onChange={set("id_kelas")}>
          <option value="">Semua kelas</option>{pilihan.kelas.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
        </select>
        <input className="form-control form-control-sm" style={{ maxWidth: 220 }} placeholder="Cari siswa…" aria-label="Cari siswa di tagihan" value={saring.search} onChange={set("search")} />
        {bolehUbah && <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => buat().catch(gagal)}><i className="bi bi-plus-lg me-1"></i>Buat tagihan</button>}
      </div>
      {hasil && <div className="px-3 pb-2 small text-muted">{hasil.data.length} tagihan · harus dibayar {rp(hasil.total.nominal)} · terbayar {rp(hasil.total.terbayar)} · sisa <b>{rp(hasil.total.sisa)}</b></div>}
      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle mb-0">
          <thead><tr><th>Siswa</th><th>Tagihan</th><th>Jatuh tempo</th><th className="text-end">Harus dibayar</th><th className="text-end">Sisa</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {!hasil && <tr><td colSpan={7} className="text-muted">Memuat…</td></tr>}
            {hasil?.data.length === 0 && <tr><td colSpan={7} className="text-muted">Tidak ada tagihan.</td></tr>}
            {hasil?.data.map((t) => (
              <tr key={t.id} data-baris-tagihan={`${t.siswa?.nama_siswa} · ${t.judul}`}>
                <td><button type="button" className="btn btn-link p-0 text-start" onClick={() => bukaSiswa(t.id_siswa)}>{t.siswa?.nama_siswa}</button><div className="small text-muted">{t.siswa?.kelas?.nama_kelas}</div></td>
                <td>{t.judul}{t.potongan > 0 && <div className="small text-info">Potongan {rp(t.potongan)}</div>}</td>
                <td className={t.sisa > 0 && t.jatuh_tempo < pilihan.hari_ini ? "text-danger" : ""}>{tgl(t.jatuh_tempo)}</td>
                <td className="text-end">{rp(t.nominal - t.potongan)}</td>
                <td className="text-end fw-semibold">{rp(t.sisa)}</td>
                <td><span className={`badge text-bg-${WARNA[t.status]}`}>{NAMA_STATUS[t.status]}</span></td>
                <td className="text-end">{bolehUbah && t.status !== "BATAL" && <MenuAksi label={`Aksi untuk ${t.judul} ${t.siswa?.nama_siswa}`} items={[
                  { label: "Ubah", ikon: "bi-pencil-square", onClick: () => ubah(t) },
                  { label: "Batalkan tagihan", ikon: "bi-x-circle", bahaya: true, pemisah: true, onClick: () => batal(t), tampil: t.terbayar === 0 },
                ]} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===================== TUNGGAKAN =====================
function Tunggakan({ pilihan, bolehUbah, bukaSiswa }) {
  const [hasil, setHasil] = useState(null);
  const [pilih, setPilih] = useState(new Set());
  const muat = useCallback(() => minta("GET", "/administrasi/keuangan/tunggakan").then(setHasil).catch(gagal), []);
  useEffect(() => { muat(); }, [muat]);

  const chat = async (s) => {
    const w = window.open("", "_blank");
    try {
      const r = await minta("POST", "/administrasi/keuangan/pengingat", { id_siswa: [s.id_siswa], mode: "siapkan" });
      const p = r.data[0];
      if (!p?.tautan) { w?.close(); return Swal.fire("Belum ada nomor WA", "Isi nomor WhatsApp orang tua/wali di Data Orang Tua & Wali.", "info"); }
      if (w) w.location.href = p.tautan; else window.location.href = p.tautan;
      await minta("POST", `/administrasi/keuangan/pengingat/${s.id_siswa}/catat`);
      muat();
    } catch (e) { w?.close(); gagal(e); }
  };

  const kirimOtomatis = async () => {
    const id = [...pilih];
    const k = await Swal.fire({ title: `Kirim pengingat ke ${id.length} orang tua?`, text: "Pesan WhatsApp dikirim otomatis berisi daftar tagihan yang lewat jatuh tempo.", icon: "question", showCancelButton: true, confirmButtonText: "Kirim", cancelButtonText: "Batal" });
    if (!k.isConfirmed) return;
    try { const r = await minta("POST", "/administrasi/keuangan/pengingat", { id_siswa: id, mode: "kirim" }); toast(r.message); setPilih(new Set()); muat(); } catch (e) { gagal(e); }
  };

  if (!hasil) return <div className="text-muted">Memuat…</div>;
  const semua = hasil.data.length > 0 && hasil.data.every((s) => pilih.has(s.id_siswa));
  return (
    <div className="card">
      <div className="card-body d-flex flex-wrap align-items-center gap-2">
        <div className="me-auto"><b>{hasil.data.length} siswa</b> menunggak, total <b className="text-danger" data-total-tunggakan>{rp(hasil.total)}</b></div>
        {bolehUbah && pilihan.wa_otomatis && <button type="button" className="btn btn-success btn-sm" disabled={!pilih.size} onClick={kirimOtomatis}><i className="bi bi-whatsapp me-1"></i>Kirim pengingat otomatis ({pilih.size})</button>}
        {bolehUbah && !pilihan.wa_otomatis && <span className="small text-muted"><i className="bi bi-info-circle me-1"></i>WhatsApp otomatis belum aktif; gunakan tombol Chat WA per siswa.</span>}
      </div>
      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead><tr>
            {bolehUbah && pilihan.wa_otomatis && <th style={{ width: 32 }}><input type="checkbox" className="form-check-input" aria-label="Pilih semua" checked={semua} onChange={() => setPilih(semua ? new Set() : new Set(hasil.data.map((s) => s.id_siswa)))} /></th>}
            <th>Siswa</th><th>Tagihan lewat jatuh tempo</th><th className="text-end">Total</th><th>Kontak</th><th></th>
          </tr></thead>
          <tbody>
            {hasil.data.length === 0 && <tr><td colSpan={6} className="text-muted text-center py-4"><i className="bi bi-emoji-smile me-1"></i>Tidak ada tunggakan.</td></tr>}
            {hasil.data.map((s) => (
              <tr key={s.id_siswa} data-tunggakan={s.nama_siswa}>
                {bolehUbah && pilihan.wa_otomatis && <td><input type="checkbox" className="form-check-input" aria-label={`Pilih ${s.nama_siswa}`} checked={pilih.has(s.id_siswa)} onChange={() => setPilih((p) => { const n = new Set(p); n.has(s.id_siswa) ? n.delete(s.id_siswa) : n.add(s.id_siswa); return n; })} /></td>}
                <td><button type="button" className="btn btn-link p-0 text-start" onClick={() => bukaSiswa(s.id_siswa)}>{s.nama_siswa}</button><div className="small text-muted">{s.kelas}</div></td>
                <td className="small">{s.tagihan.map((t) => <div key={t.judul}>{t.judul}: {rp(t.sisa)} <span className="text-danger">({tgl(t.jatuh_tempo)})</span></div>)}</td>
                <td className="text-end fw-semibold">{rp(s.total)}</td>
                <td className="small">{s.kontak?.no_wa ? <>{s.kontak.nama || s.kontak.hubungan}<br /><span className="text-muted">{s.kontak.no_wa}</span></> : <span className="text-muted">Belum ada nomor WA</span>}
                  {s.pengingat_terakhir && <div className="text-success" data-diingatkan><i className="bi bi-check2 me-1"></i>Diingatkan {tgl(s.pengingat_terakhir)}</div>}</td>
                <td className="text-end">{bolehUbah && <button type="button" className="btn btn-outline-success btn-sm text-nowrap" disabled={!s.kontak?.no_wa} onClick={() => chat(s)}><i className="bi bi-whatsapp me-1"></i>Chat WA</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===================== KAS =====================
function Kas({ pilihan, bolehUbah }) {
  const [rentang, setRentang] = useState({ dari: `${pilihan.hari_ini.slice(0, 7)}-01`, sampai: pilihan.hari_ini });
  const [d, setD] = useState(null);
  const muat = useCallback(() => minta("GET", `/administrasi/keuangan/kas?${new URLSearchParams(rentang)}`).then((r) => setD(r.data)).catch(gagal), [rentang]);
  useEffect(() => { muat(); }, [muat]);

  const catat = async (arah) => {
    const kategori = pilihan.kategori_kas[arah];
    const r = await Swal.fire({
      title: arah === "MASUK" ? "Catat pemasukan" : "Catat pengeluaran", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <label class="form-label mb-0" for="kTanggal">Tanggal</label><input id="kTanggal" type="date" max="${pilihan.hari_ini}" class="form-control form-control-sm mb-2" value="${pilihan.hari_ini}">
        <label class="form-label mb-0" for="kKategori">Kategori</label><input id="kKategori" list="kDaftar" class="form-control form-control-sm mb-2" value="${esc(kategori[0])}">
        <datalist id="kDaftar">${kategori.map((k) => `<option value="${esc(k)}">`).join("")}</datalist>
        <label class="form-label mb-0" for="kJumlah">Jumlah (Rp)</label><input id="kJumlah" type="number" min="1" class="form-control form-control-sm mb-2">
        <label class="form-label mb-0" for="kKet">Keterangan</label><input id="kKet" class="form-control form-control-sm"></div>`,
      preConfirm: async () => {
        try { return await minta("POST", "/administrasi/keuangan/kas", { tanggal: nilai("kTanggal"), arah, kategori: nilai("kKategori"), jumlah: Number(nilai("kJumlah")), keterangan: nilai("kKet") || null }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); }
  };

  const hapus = async (b) => {
    const k = await Swal.fire({ title: "Hapus catatan kas?", text: `${b.kategori} · ${rp(b.jumlah)}`, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#d33" });
    if (!k.isConfirmed) return;
    try { const r = await minta("DELETE", `/administrasi/keuangan/kas/${b.id}`); toast(r.message); muat(); } catch (e) { gagal(e); }
  };

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        <div><label className="form-label small mb-0" htmlFor="kasDari">Dari</label><input id="kasDari" type="date" className="form-control form-control-sm" value={rentang.dari} onChange={(e) => setRentang({ ...rentang, dari: e.target.value })} /></div>
        <div><label className="form-label small mb-0" htmlFor="kasSampai">Sampai</label><input id="kasSampai" type="date" className="form-control form-control-sm" value={rentang.sampai} onChange={(e) => setRentang({ ...rentang, sampai: e.target.value })} /></div>
        <div className="ms-auto d-flex flex-wrap gap-2">
          {bolehUbah && <button type="button" className="btn btn-outline-success btn-sm" onClick={() => catat("MASUK")}><i className="bi bi-plus-circle me-1"></i>Catat pemasukan</button>}
          {bolehUbah && <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => catat("KELUAR")}><i className="bi bi-dash-circle me-1"></i>Catat pengeluaran</button>}
          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={!d} onClick={() => cetakKas(d)}><i className="bi bi-printer me-1"></i>Cetak laporan</button>
        </div>
      </div>
      {!d ? <div className="text-muted">Memuat…</div> : (
        <>
          <div className="row g-2 mb-3" data-kas>
            <Kartu judul="Saldo awal" nilai={rp(d.saldo_awal)} ikon="bi-wallet2" />
            <Kartu judul="Pemasukan" nilai={rp(d.masuk)} ikon="bi-arrow-down-circle" warna="success" />
            <Kartu judul="Pengeluaran" nilai={rp(d.keluar)} ikon="bi-arrow-up-circle" warna="danger" />
            <Kartu judul="Saldo akhir" nilai={<span data-saldo-akhir>{rp(d.saldo_akhir)}</span>} ikon="bi-safe" />
          </div>
          <div className="card mb-3">
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead><tr><th>Tanggal</th><th>Kategori</th><th>Uraian</th><th className="text-end">Masuk</th><th className="text-end">Keluar</th><th className="text-end">Saldo</th><th></th></tr></thead>
                <tbody>
                  {d.baris.length === 0 && <tr><td colSpan={7} className="text-muted">Tidak ada transaksi di rentang ini.</td></tr>}
                  {d.baris.map((b) => (
                    <tr key={`${b.sumber}-${b.id}`}>
                      <td className="text-nowrap">{tgl(b.tanggal)}</td><td>{b.kategori}</td>
                      <td className="small">{b.uraian}{b.pencatat && <div className="d-flex gap-1 align-items-center text-muted">Dicatat <Pengisi pengisi={b.pencatat.name} sebaris /></div>}</td>
                      <td className="text-end text-success">{b.arah === "MASUK" ? rp(b.jumlah) : ""}</td>
                      <td className="text-end text-danger">{b.arah === "KELUAR" ? rp(b.jumlah) : ""}</td>
                      <td className="text-end">{rp(b.saldo)}</td>
                      <td className="text-end">{bolehUbah && b.sumber === "KAS" && <MenuAksi label={`Aksi untuk ${b.kategori}`} items={[{ label: "Hapus", ikon: "bi-trash", bahaya: true, onClick: () => hapus(b) }]} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {d.per_jenis.length > 0 && (
            <div className="card" style={{ maxWidth: 480 }}><div className="card-header fw-semibold">Penerimaan per jenis biaya</div>
              <ul className="list-group list-group-flush">{d.per_jenis.map((j) => <li key={j.nama} className="list-group-item d-flex"><span className="me-auto">{j.nama}</span><b>{rp(j.jumlah)}</b></li>)}</ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ===================== JENIS BIAYA & BEASISWA =====================
function Pengaturan({ pilihan, bolehUbah, muatPilihan }) {
  const [beasiswa, setBeasiswa] = useState(null);
  const muatBeasiswa = useCallback(() => minta("GET", "/administrasi/keuangan/beasiswa").then((r) => setBeasiswa(r.data)).catch(gagal), []);
  useEffect(() => { muatBeasiswa(); }, [muatBeasiswa]);

  const formJenis = async (j) => {
    const r = await Swal.fire({
      title: j ? "Ubah jenis biaya" : "Jenis biaya baru", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <label class="form-label mb-0" for="jNama">Nama</label><input id="jNama" class="form-control form-control-sm mb-2" placeholder="SPP, Uang pangkal, Kegiatan…" value="${esc(j?.nama || "")}">
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="jPeriode">Periode</label>
          <select id="jPeriode" class="form-select form-select-sm">${pilihan.periode.map((p) => `<option value="${p.kode}" ${j?.periode === p.kode ? "selected" : ""}>${p.nama}</option>`).join("")}</select></div>
        <div class="col-6"><label class="form-label mb-0" for="jNominal">Nominal (Rp)</label><input id="jNominal" type="number" min="0" class="form-control form-control-sm" value="${j?.nominal ?? ""}"></div></div>
        <label class="form-label mb-0" for="jKet">Keterangan</label><input id="jKet" class="form-control form-control-sm mb-2" value="${esc(j?.keterangan || "")}">
        <label class="form-check"><input id="jAktif" type="checkbox" class="form-check-input" ${!j || j.aktif ? "checked" : ""}> Aktif (muncul saat membuat tagihan)</label></div>`,
      preConfirm: async () => {
        const isi = { nama: nilai("jNama"), periode: nilai("jPeriode"), nominal: Number(nilai("jNominal")) || 0, keterangan: nilai("jKet") || null, aktif: document.getElementById("jAktif").checked };
        try { return await minta(j ? "PUT" : "POST", `/administrasi/keuangan/jenis-biaya${j ? `/${j.id}` : ""}`, isi); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muatPilihan(); }
  };

  const hapusJenis = async (j) => {
    const k = await Swal.fire({ title: `Hapus ${j.nama}?`, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#d33" });
    if (!k.isConfirmed) return;
    try { const r = await minta("DELETE", `/administrasi/keuangan/jenis-biaya/${j.id}`); toast(r.message); muatPilihan(); } catch (e) { gagal(e); }
  };

  const formBeasiswa = async (b) => {
    const siswa = (await minta("GET", "/administrasi/keuangan/siswa")).data;
    const r = await Swal.fire({
      title: b ? "Ubah beasiswa/potongan" : "Beasiswa/potongan baru", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <label class="form-label mb-0" for="bSiswa">Siswa</label>
        <select id="bSiswa" class="form-select form-select-sm mb-2">${siswa.map((s) => `<option value="${esc(s.id_siswa)}" ${b?.id_siswa === s.id_siswa ? "selected" : ""}>${esc(s.nama_siswa)}${s.kelas ? ` · ${esc(s.kelas.nama_kelas)}` : ""}</option>`).join("")}</select>
        <label class="form-label mb-0" for="bJenis">Berlaku untuk</label>
        <select id="bJenis" class="form-select form-select-sm mb-2"><option value="">Semua jenis biaya</option>${pilihan.jenis_biaya.map((j) => `<option value="${j.id}" ${b?.id_jenis_biaya === j.id ? "selected" : ""}>${esc(j.nama)}</option>`).join("")}</select>
        <label class="form-label mb-0" for="bNama">Nama</label><input id="bNama" class="form-control form-control-sm mb-2" placeholder="Beasiswa prestasi, keringanan saudara kandung…" value="${esc(b?.nama || "")}">
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="bBentuk">Bentuk</label>
          <select id="bBentuk" class="form-select form-select-sm"><option value="PERSEN" ${b?.bentuk !== "NOMINAL" ? "selected" : ""}>Persen</option><option value="NOMINAL" ${b?.bentuk === "NOMINAL" ? "selected" : ""}>Nominal (Rp)</option></select></div>
        <div class="col-6"><label class="form-label mb-0" for="bNilai">Nilai</label><input id="bNilai" type="number" min="1" class="form-control form-control-sm" value="${b?.nilai ?? ""}"></div></div>
        <label class="form-check"><input id="bAktif" type="checkbox" class="form-check-input" ${!b || b.aktif ? "checked" : ""}> Aktif</label>
        <div class="text-muted">Dipotongkan otomatis pada tagihan yang dibuat sesudah ini; tagihan lama tidak berubah.</div></div>`,
      preConfirm: async () => {
        const isi = { id_siswa: nilai("bSiswa"), id_jenis_biaya: Number(nilai("bJenis")) || null, nama: nilai("bNama"), bentuk: nilai("bBentuk"), nilai: Number(nilai("bNilai")), aktif: document.getElementById("bAktif").checked };
        try { return await minta(b ? "PUT" : "POST", `/administrasi/keuangan/beasiswa${b ? `/${b.id}` : ""}`, isi); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muatBeasiswa(); }
  };

  const hapusBeasiswa = async (b) => {
    const k = await Swal.fire({ title: `Hapus ${b.nama}?`, text: b.siswa?.nama_siswa, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#d33" });
    if (!k.isConfirmed) return;
    try { const r = await minta("DELETE", `/administrasi/keuangan/beasiswa/${b.id}`); toast(r.message); muatBeasiswa(); } catch (e) { gagal(e); }
  };

  return (
    <div className="row g-3">
      <div className="col-lg-6">
        <div className="card">
          <div className="card-header d-flex align-items-center"><span className="fw-semibold me-auto">Jenis biaya</span>
            {bolehUbah && <button type="button" className="btn btn-primary btn-sm" onClick={() => formJenis(null)}><i className="bi bi-plus-lg me-1"></i>Jenis biaya baru</button>}</div>
          <ul className="list-group list-group-flush">
            {pilihan.jenis_biaya.length === 0 && <li className="list-group-item text-muted">Belum ada jenis biaya.</li>}
            {pilihan.jenis_biaya.map((j) => (
              <li key={j.id} className={`list-group-item d-flex align-items-center gap-2 ${j.aktif ? "" : "text-muted"}`} data-jenis-biaya={j.nama}>
                <span className="me-auto"><b>{j.nama}</b> · {j.periode === "BULANAN" ? "bulanan" : "sekali bayar"}{!j.aktif && " · nonaktif"}{j.keterangan && <div className="small text-muted">{j.keterangan}</div>}</span>
                <span>{rp(j.nominal)}</span>
                {bolehUbah && <MenuAksi label={`Aksi untuk ${j.nama}`} items={[
                  { label: "Ubah", ikon: "bi-pencil-square", onClick: () => formJenis(j) },
                  { label: "Hapus", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapusJenis(j) },
                ]} />}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card">
          <div className="card-header d-flex align-items-center"><span className="fw-semibold me-auto">Beasiswa & potongan</span>
            {bolehUbah && <button type="button" className="btn btn-primary btn-sm" onClick={() => formBeasiswa(null).catch(gagal)}><i className="bi bi-plus-lg me-1"></i>Beasiswa baru</button>}</div>
          <ul className="list-group list-group-flush">
            {!beasiswa && <li className="list-group-item text-muted">Memuat…</li>}
            {beasiswa?.length === 0 && <li className="list-group-item text-muted">Belum ada beasiswa atau potongan.</li>}
            {beasiswa?.map((b) => (
              <li key={b.id} className={`list-group-item d-flex align-items-center gap-2 ${b.aktif ? "" : "text-muted"}`}>
                <span className="me-auto"><b>{b.siswa?.nama_siswa}</b> <span className="small text-muted">{b.siswa?.kelas?.nama_kelas}</span>
                  <div className="small">{b.nama} · {b.jenis_biaya ? b.jenis_biaya.nama : "semua biaya"}{!b.aktif && " · nonaktif"}</div></span>
                <span className="badge text-bg-info">{b.bentuk === "PERSEN" ? `${b.nilai}%` : rp(b.nilai)}</span>
                {bolehUbah && <MenuAksi label={`Aksi untuk beasiswa ${b.siswa?.nama_siswa}`} items={[
                  { label: "Ubah", ikon: "bi-pencil-square", onClick: () => formBeasiswa(b).catch(gagal) },
                  { label: "Hapus", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapusBeasiswa(b) },
                ]} />}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
