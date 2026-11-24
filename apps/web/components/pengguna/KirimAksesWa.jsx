"use client";
// Pesan akses aplikasi lewat WhatsApp (khusus Admin): salam hormat, username, kata sandi, alamat aplikasi.
// Disiapkan hanya pada jam efektif (Senin–Jumat 07:30–12:00 WIT, dicek server). Kata sandi diketik Admin dan dicocokkan
// dengan akun (atau ditetapkan sebagai kata sandi baru). Pesan disalin / dibuka di WhatsApp; riwayat tanpa kata sandi.
import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, ROLE_LABEL, ROLE_WARNA, authHeaders } from "@/app/lib/akses";
import Pengisi from "@/components/dashboard/Pengisi";

const pesanGalat = (data, fallback) => (data?.errors && Object.values(data.errors)[0]?.[0]) || data?.message || fallback;
async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(pesanGalat(data, `Gagal (status ${res.status}).`));
  return data;
}

const LABEL_TINDAKAN = { DISIAPKAN: ["Disiapkan", "secondary"], DISALIN: ["Disalin", "info"], WHATSAPP: ["Dibuka di WhatsApp", "success"] };
const LABEL_SANDI = { COCOK: ["Sandi dicocokkan", "light"], BARU: ["Sandi baru ditetapkan", "warning"] };
const waktu = (v) => (v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");
const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 1600 });

function JamKirim({ jendela }) {
  if (!jendela) return null;
  return (
    <div className={`alert ${jendela.buka ? "alert-success" : "alert-warning"} small py-2 mb-3`} data-jam-kirim={jendela.buka ? "buka" : "tutup"}>
      <i className={`bi ${jendela.buka ? "bi-clock-history" : "bi-clock"} me-1`}></i>
      {jendela.keterangan} <span className="text-muted">(sekarang {jendela.sekarang} {jendela.zona})</span>
    </div>
  );
}

/** Modal menyiapkan pesan akses untuk satu akun. Komponen Modal dipinjam dari halaman Pengguna agar tampilannya seragam. */
export function ModalKirimAkses({ user, Modal, onTutup, onTercatat }) {
  const [info, setInfo] = useState(null);
  const [nomor, setNomor] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [tetapkan, setTetapkan] = useState(false);
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState(null); // { id, nomor, teks, tautan_wa }
  const [teks, setTeks] = useState("");

  useEffect(() => {
    api(`/users/${user.id}/akses-wa`).then((d) => { setInfo(d); setNomor(d.nomor || ""); })
      .catch((e) => Swal.fire("Gagal memuat", e.message, "error"));
  }, [user.id]);

  const siapkan = async (e) => {
    e.preventDefault();
    setProses(true);
    try {
      const d = await api(`/users/${user.id}/akses-wa`, { method: "POST", body: JSON.stringify({ no_wa: nomor, password: sandi, tetapkan }) });
      setHasil(d);
      setTeks(d.teks);
      setSandi("");
      onTercatat?.();
    } catch (err) {
      Swal.fire("Belum bisa disiapkan", err.message, "warning");
    } finally {
      setProses(false);
    }
  };

  const catat = (tindakan) => api(`/akses-wa/${hasil.id}/tindakan`, { method: "POST", body: JSON.stringify({ tindakan }) }).then(() => onTercatat?.()).catch(() => {});
  const salin = async () => {
    try { await navigator.clipboard.writeText(teks); toast("Pesan disalin"); catat("DISALIN"); }
    catch { Swal.fire("Gagal menyalin", "Pilih teks pesan lalu salin manual (Ctrl+C).", "warning"); }
  };
  const bukaWa = () => {
    window.open(`https://wa.me/${hasil.nomor}?text=${encodeURIComponent(teks)}`, "_blank", "noopener");
    catat("WHATSAPP");
  };

  const footer = hasil ? (
    <div className="modal-footer">
      <button type="button" className="btn btn-outline-secondary" onClick={salin} data-salin-akses><i className="bi bi-clipboard me-1"></i>Salin pesan</button>
      <button type="button" className="btn btn-success fw-bold" onClick={bukaWa} data-buka-wa><i className="bi bi-whatsapp me-1"></i>Buka WhatsApp</button>
      <button type="button" className="btn btn-light" onClick={onTutup}>Selesai</button>
    </div>
  ) : (
    <div className="modal-footer">
      <button type="button" className="btn btn-light" onClick={onTutup}>Batal</button>
      <button type="submit" form="form-kirim-akses" className="btn btn-success fw-bold" disabled={proses || !info || !info.jendela?.buka || !info.aktif}>
        {proses && <span className="spinner-border spinner-border-sm me-2"></span>}<i className="bi bi-whatsapp me-1"></i>Siapkan pesan
      </button>
    </div>
  );

  return (
    <Modal judul={`Kirim akses via WhatsApp: ${user.name}`} ikon="bi-whatsapp" onTutup={onTutup} footer={footer}>
      <div className="modal-body" data-kirim-akses>
        {!info ? (
          <div className="text-muted py-3"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        ) : hasil ? (
          <>
            <div className="alert alert-success small py-2"><i className="bi bi-check-circle me-1"></i>Pesan siap dan sudah <b>tercatat di riwayat</b> (tanpa kata sandi). Salin lalu teruskan, atau buka langsung di WhatsApp ke <b className="font-monospace">+{hasil.nomor}</b>.</div>
            <label className="form-label small fw-semibold" htmlFor="teks-akses">Isi pesan (boleh diubah sebelum dikirim)</label>
            <textarea id="teks-akses" className="form-control font-monospace small" rows={14} value={teks} onChange={(e) => setTeks(e.target.value)} data-teks-akses />
            <div className="form-text">Pesan ini memuat kata sandi. Tutup jendela setelah dikirim; kata sandi tidak disimpan aplikasi.</div>
          </>
        ) : (
          <form id="form-kirim-akses" onSubmit={siapkan}>
            <JamKirim jendela={info.jendela} />
            {!info.aktif && <div className="alert alert-danger small py-2">Akun ini nonaktif. Aktifkan dulu sebelum mengirim akses.</div>}
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Penerima</label>
                <div className="form-control-plaintext py-1">
                  <span className={`badge rounded-pill text-bg-${ROLE_WARNA[user.role] || "secondary"} me-2`}>{ROLE_LABEL[user.role] || user.role}</span>
                  <span className="font-monospace small">{info.login || "-"}</span>
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold" htmlFor="akses-nomor">Nomor WhatsApp</label>
                <input id="akses-nomor" className="form-control" inputMode="tel" placeholder="08xx atau 62xx" value={nomor} onChange={(e) => setNomor(e.target.value)} required />
                <div className="form-text">{info.nomor ? "Diambil dari data guru/siswa/orang tua; boleh diubah." : "Nomor belum tercatat di data induk; ketik manual."}</div>
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold" htmlFor="akses-sandi">Kata sandi akun</label>
                <div className="input-group">
                  <input id="akses-sandi" className="form-control font-monospace" type={lihat ? "text" : "password"} autoComplete="new-password" value={sandi} onChange={(e) => setSandi(e.target.value)} required />
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan" : "Tampilkan"}><i className={`bi ${lihat ? "bi-eye-slash" : "bi-eye"}`}></i></button>
                </div>
                <div className="form-check mt-2">
                  <input className="form-check-input" type="checkbox" id="akses-tetapkan" checked={tetapkan} onChange={(e) => setTetapkan(e.target.checked)} />
                  <label className="form-check-label small" htmlFor="akses-tetapkan">Jadikan kata sandi baru akun ini <span className="text-muted">(min. 8 karakter; pemilik akun wajib menggantinya saat login)</span></label>
                </div>
                <div className="form-text">{tetapkan ? "Kata sandi lama tidak berlaku lagi setelah pesan disiapkan." : "Sistem mencocokkan kata sandi dengan akun; bila tidak cocok, pesan tidak dibuat."}</div>
              </div>
            </div>
            {info.terakhir && <div className="small text-muted mt-3"><i className="bi bi-clock-history me-1"></i>Terakhir disiapkan {waktu(info.terakhir.created_at)} · {LABEL_TINDAKAN[info.terakhir.tindakan]?.[0]}</div>}
          </form>
        )}
      </div>
    </Modal>
  );
}

/** Riwayat pesan akses yang pernah disiapkan (tanpa kata sandi). */
export function RiwayatKirimAkses({ segar }) {
  const [data, setData] = useState([]);
  const [jendela, setJendela] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cari, setCari] = useState("");
  const [role, setRole] = useState("");

  const muat = useCallback(async () => {
    setLoading(true);
    try { const d = await api("/akses-wa/riwayat"); setData(d.data || []); setJendela(d.jendela); }
    catch (e) { Swal.fire("Gagal memuat riwayat", e.message, "error"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { muat(); }, [muat, segar]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.filter((r) => (!role || r.role === role) && (!q || [r.nama_penerima, r.login, r.no_wa, r.pengirim?.name].some((v) => (v || "").toLowerCase().includes(q))));
  }, [data, cari, role]);

  const unduhCSV = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const baris = tampil.map((r) => [waktu(r.created_at), r.nama_penerima, ROLE_LABEL[r.role] || r.role, r.login, r.no_wa, LABEL_SANDI[r.sandi]?.[0], LABEL_TINDAKAN[r.tindakan]?.[0], r.pengirim?.name].map(esc).join(","));
    const csv = ["Waktu,Penerima,Peran,Login,Nomor WA,Kata Sandi,Tindakan,Dikirim oleh", ...baris].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `riwayat-kirim-akses-${new Date().toISOString().slice(0, 10)}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  const peran = [...new Set(data.map((r) => r.role))];
  return (
    <div className="card border-0 shadow-sm p-3 p-md-4 mt-4" data-riwayat-akses>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h5 className="fw-bold m-0"><i className="bi bi-whatsapp text-success me-2"></i>Riwayat Kirim Akses <span className="badge text-bg-light border ms-1">{data.length}</span></h5>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={muat} title="Muat ulang"><i className="bi bi-arrow-clockwise"></i></button>
          <button className="btn btn-sm btn-outline-success" onClick={unduhCSV} disabled={!tampil.length}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
        </div>
      </div>
      <JamKirim jendela={jendela} />
      <div className="row g-2 mb-3">
        <div className="col-md-8"><input type="search" className="form-control form-control-sm" placeholder="Cari penerima, login, nomor, atau pengirim…" value={cari} onChange={(e) => setCari(e.target.value)} /></div>
        <div className="col-md-4">
          <select className="form-select form-select-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Semua peran</option>
            {peran.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
          </select>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle mb-0">
          <thead className="table-light"><tr><th>Waktu</th><th>Penerima</th><th>Login</th><th>Nomor WA</th><th>Kata sandi</th><th>Tindakan</th><th>Dikirim oleh</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-muted py-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</td></tr>
            ) : tampil.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted py-4">Belum ada pesan akses yang disiapkan.</td></tr>
            ) : tampil.map((r) => (
              <tr key={r.id}>
                <td className="small text-nowrap">{waktu(r.created_at)}</td>
                <td>
                  <div className="fw-semibold">{r.nama_penerima}</div>
                  <span className={`badge rounded-pill text-bg-${ROLE_WARNA[r.role] || "secondary"}`}>{ROLE_LABEL[r.role] || r.role}</span>
                  {r.penerima?.login_terakhir && <div className="small text-muted">Login terakhir {waktu(r.penerima.login_terakhir)}</div>}
                </td>
                <td className="small font-monospace">{r.login}</td>
                <td className="small font-monospace">+{r.no_wa}</td>
                <td><span className={`badge text-bg-${LABEL_SANDI[r.sandi]?.[1] || "light"} border fw-normal`}>{LABEL_SANDI[r.sandi]?.[0] || r.sandi}</span></td>
                <td><span className={`badge text-bg-${LABEL_TINDAKAN[r.tindakan]?.[1] || "secondary"}`}>{LABEL_TINDAKAN[r.tindakan]?.[0] || r.tindakan}</span></td>
                <td className="small"><Pengisi pengisi={r.pengirim?.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
