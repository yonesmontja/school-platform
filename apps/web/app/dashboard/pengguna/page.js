"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, PENINJAU, ROLE_LABEL, ROLE_WARNA, authHeaders, useAkses } from "@/app/lib/akses";
import { MenuAksi, aksiHapus, aksiUbah } from "@/components/dashboard/menuAksi";
import { cetakSuratAkun } from "@/components/pengguna/cetakAkun";

const ROLES = ["admin", "kepsek", "wakakur", "wakasis", "yayasan", "guru", "siswa", "ortu"];
// Kartu ringkasan: tiga peran peninjau digabung dalam satu kartu "Peninjau"
const KARTU = ["admin", "kepsek", "peninjau", "guru", "siswa", "ortu"];
const LABEL_KARTU = { ...ROLE_LABEL, peninjau: "Peninjau (lihat saja)" };
const WARNA_KARTU = { ...ROLE_WARNA, peninjau: "dark" };
const cocokPeran = (role, filter) => !filter || role === filter || (filter === "peninjau" && PENINJAU.includes(role));
const FORM_KOSONG = { name: "", role: "guru", email: "", username: "", password: "", id_guru: "", id_siswa: "", id_ortu: "", id_wali: "", aktif: true, wajib_ganti_password: true };

const pesanGalat = (data, fallback) => (data?.errors && Object.values(data.errors)[0]?.[0]) || data?.message || fallback;

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(pesanGalat(data, `Gagal (status ${res.status}).`));
  return data;
}

const tautanAkun = (u) =>
  u.guru?.nama_guru ? `Guru: ${u.guru.nama_guru}`
    : u.siswa?.nama_siswa ? `Siswa: ${u.siswa.nama_siswa}${u.siswa.nisn ? ` (${u.siswa.nisn})` : ""}`
      : u.ortu ? `Ortu: ${u.ortu.nama_ayah || u.ortu.nama_ibu || u.id_ortu}`
        : u.wali?.nama_wali ? `Wali: ${u.wali.nama_wali}` : "";

const formatWaktu = (v) => (v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Belum pernah");

export default function ManajemenPenggunaPage() {
  const { user: saya } = useAkses();
  const [data, setData] = useState([]);
  const [ref, setRef] = useState({ teachers: [], students: [], ortu: [], wali: [] });
  const [loading, setLoading] = useState(true);
  const [cari, setCari] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [form, setForm] = useState(null); // null = tertutup; {id?} = tambah/ubah
  const [menyimpan, setMenyimpan] = useState(false);
  const [kredensial, setKredensial] = useState(null); // { judul, daftar: [{nama, role?, login, password}] }

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/users");
      setData(d.data || []);
      setRef(d.referensi || {});
    } catch (err) {
      Swal.fire("Gagal memuat", err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const jumlah = useMemo(() => Object.fromEntries(KARTU.map((r) => [r, data.filter((u) => cocokPeran(u.role, r)).length])), [data]);
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.filter((u) => cocokPeran(u.role, filterRole)
      && (!q || [u.name, u.username, u.email, tautanAkun(u)].some((v) => (v || "").toLowerCase().includes(q))));
  }, [data, cari, filterRole]);

  const bukaForm = (u = null) => setForm(u ? {
    id: u.id, name: u.name || "", role: u.role, email: u.email || "", username: u.username || "", password: "",
    id_guru: u.id_guru || "", id_siswa: u.id_siswa || "", id_ortu: u.id_ortu || "", id_wali: u.id_wali || "",
    aktif: !!u.aktif, wajib_ganti_password: !!u.wajib_ganti_password,
  } : { ...FORM_KOSONG });
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const simpan = async (e) => {
    e.preventDefault();
    setMenyimpan(true);
    try {
      // Tautan yang tidak relevan untuk peran terpilih dikosongkan
      const body = {
        ...form,
        id_guru: ["guru", "kepsek"].includes(form.role) ? form.id_guru || null : null,
        id_siswa: form.role === "siswa" ? form.id_siswa || null : null,
        id_ortu: form.role === "ortu" ? form.id_ortu || null : null,
        id_wali: form.role === "ortu" ? form.id_wali || null : null,
        email: form.email.trim() || null,
        username: form.username.trim() || null,
        password: form.password || null,
      };
      const d = await api(form.id ? `/users/${form.id}` : "/users", { method: form.id ? "PUT" : "POST", body: JSON.stringify(body) });
      setForm(null);
      await muat();
      if (d.kredensial) setKredensial({ judul: form.id ? "Kata sandi diperbarui" : "Akun dibuat", daftar: [d.kredensial] });
      else Swal.fire({ toast: true, position: "top-end", icon: "success", title: d.message, showConfirmButton: false, timer: 1800 });
    } catch (err) {
      Swal.fire("Gagal menyimpan", err.message, "error");
    } finally {
      setMenyimpan(false);
    }
  };

  const hapus = async (u) => {
    const ok = await Swal.fire({ icon: "warning", title: `Hapus akun ${u.name}?`, text: "Data guru/siswa yang terkait tidak ikut terhapus.", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { await api(`/users/${u.id}`, { method: "DELETE" }); muat(); } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const resetPassword = async (u) => {
    const ok = await Swal.fire({ icon: "question", title: `Reset kata sandi ${u.name}?`, text: "Kata sandi sementara baru dibuat dan pemilik akun wajib menggantinya saat login.", showCancelButton: true, confirmButtonText: "Reset", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    try {
      const d = await api(`/users/${u.id}/reset-password`, { method: "POST" });
      setKredensial({ judul: "Kata sandi direset", daftar: [d.kredensial] });
      muat();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const toggleAktif = async (u) => {
    try {
      await api(`/users/${u.id}`, { method: "PUT", body: JSON.stringify({ ...u, email: u.email || null, username: u.username || null, password: null, aktif: !u.aktif }) });
      muat();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const generate = async (jenis) => {
    const label = { guru: "semua guru", siswa: "semua siswa", ortu: "semua orang tua/wali" }[jenis];
    const ok = await Swal.fire({
      icon: "question", title: `Buat akun untuk ${label}?`,
      html: "Hanya data yang <b>belum punya akun</b> yang dibuatkan. Kata sandi acak ditampilkan <b>sekali saja</b>; simpan atau unduh daftarnya.",
      showCancelButton: true, confirmButtonText: "Buat akun", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    Swal.fire({ title: "Membuat akun...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const d = await api("/users/generate", { method: "POST", body: JSON.stringify({ jenis }) });
      Swal.close();
      await muat();
      if (d.kredensial?.length) setKredensial({ judul: d.message, daftar: d.kredensial });
      else Swal.fire("Selesai", d.message, "info");
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  return (
    <div className="container-fluid mt-4 mb-5">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-2">
        <h3 className="fw-bold text-primary m-0"><i className="bi bi-people me-2"></i>Manajemen Pengguna</h3>
        <div className="d-flex gap-2 flex-wrap">
          <div className="dropdown">
            <button className="btn btn-outline-primary fw-bold dropdown-toggle" type="button" data-bs-toggle="dropdown">
              <i className="bi bi-magic me-1"></i> Buat Akun Massal
            </button>
            <ul className="dropdown-menu dropdown-menu-end shadow-sm">
              <li><button className="dropdown-item" onClick={() => generate("guru")}><i className="bi bi-person-video3 me-2"></i>Semua guru <small className="text-muted">(username NIP/NIK)</small></button></li>
              <li><button className="dropdown-item" onClick={() => generate("siswa")}><i className="bi bi-mortarboard me-2"></i>Semua siswa <small className="text-muted">(username NISN)</small></button></li>
              <li><button className="dropdown-item" onClick={() => generate("ortu")}><i className="bi bi-house-heart me-2"></i>Semua orang tua/wali <small className="text-muted">(ortu.NISN)</small></button></li>
            </ul>
          </div>
          <button className="btn btn-primary fw-bold shadow-sm" onClick={() => bukaForm()}><i className="bi bi-plus-lg me-2"></i>Tambah Akun</button>
        </div>
      </div>

      {/* RINGKASAN PER PERAN (klik untuk menyaring) */}
      <div className="row g-3 mb-4">
        {KARTU.map((r) => (
          <div className="col-6 col-md" key={r}>
            <button type="button" onClick={() => setFilterRole((f) => (f === r ? "" : r))}
              className={`card border-0 shadow-sm w-100 text-start p-3 ${filterRole === r ? `border-start border-4 border-${WARNA_KARTU[r]}` : ""}`}>
              <div className="small text-muted fw-semibold">{LABEL_KARTU[r]}</div>
              <div className={`fs-3 fw-bold text-${WARNA_KARTU[r]}`}>{jumlah[r] || 0}</div>
            </button>
          </div>
        ))}
      </div>

      <div className="card border-0 shadow-sm p-3 p-md-4">
        <div className="row g-2 mb-3">
          <div className="col-md-8">
            <input type="search" className="form-control form-control-sm" placeholder="Cari nama, username, email, atau data terkait..." value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <div className="col-md-4">
            <select className="form-select form-select-sm" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="">Semua peran</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead className="table-light">
              <tr><th>Nama</th><th>Login</th><th>Peran</th><th>Terhubung ke</th><th>Login terakhir</th><th className="text-center">Status</th><th className="text-end">Aksi</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted py-4"><span className="spinner-border spinner-border-sm me-2"></span>Memuat...</td></tr>
              ) : tampil.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">Tidak ada akun.</td></tr>
              ) : tampil.map((u) => (
                <tr key={u.id} className={u.aktif ? "" : "opacity-50"}>
                  <td className="fw-semibold">
                    {u.name}
                    {u.id === saya?.id && <span className="badge text-bg-secondary ms-2">Anda</span>}
                    {u.wajib_ganti_password && <i className="bi bi-shield-exclamation text-warning ms-2" title="Wajib ganti kata sandi saat login"></i>}
                  </td>
                  <td className="small"><div className="font-monospace">{u.username || "-"}</div><div className="text-muted">{u.email}</div></td>
                  <td><span className={`badge rounded-pill text-bg-${ROLE_WARNA[u.role] || "secondary"}`}>{ROLE_LABEL[u.role] || u.role}</span></td>
                  <td className="small">{tautanAkun(u) || <span className="text-muted">-</span>}</td>
                  <td className="small text-muted">{formatWaktu(u.login_terakhir)}</td>
                  <td className="text-center">
                    <div className="form-check form-switch d-inline-block m-0" title={u.aktif ? "Aktif: klik untuk menonaktifkan" : "Nonaktif: klik untuk mengaktifkan"}>
                      <input className="form-check-input" type="checkbox" role="switch" checked={!!u.aktif} disabled={u.id === saya?.id} onChange={() => toggleAktif(u)} />
                    </div>
                  </td>
                  <td className="text-end text-nowrap">
                    <MenuAksi label={`Aksi untuk ${u.name || u.username}`} items={[
                      aksiUbah(() => bukaForm(u)),
                      { label: "Reset kata sandi", ikon: "bi-key", onClick: () => resetPassword(u) },
                      { label: u.aktif ? "Nonaktifkan akun" : "Aktifkan akun", ikon: u.aktif ? "bi-person-slash" : "bi-person-check", onClick: () => toggleAktif(u), tampil: u.id !== saya?.id },
                      aksiHapus(() => hapus(u), u.id !== saya?.id),
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && <FormAkun form={form} setF={setF} refData={ref} menyimpan={menyimpan} onSimpan={simpan} onTutup={() => setForm(null)} />}
      {kredensial && <DaftarKredensial {...kredensial} onTutup={() => setKredensial(null)} />}
    </div>
  );
}

function Modal({ judul, ikon, onTutup, children, footer, lebar = "modal-lg" }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTutup]);
  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${lebar}`}>
          <div className="modal-content border-0 shadow">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className={`bi ${ikon} me-2 text-primary`}></i>{judul}</h5>
              <button type="button" className="btn-close" onClick={onTutup} aria-label="Tutup"></button>
            </div>
            {children}
            {footer}
          </div>
        </div>
      </div>
      <div className="modal-backdrop show"></div>
    </>
  );
}

function FormAkun({ form, setF, refData, menyimpan, onSimpan, onTutup }) {
  const isSiswa = form.role === "siswa";
  const isOrtu = form.role === "ortu";
  const bisaGuru = form.role === "guru" || form.role === "kepsek";

  // Pilih data terkait sekaligus mengisi nama & username bila masih kosong
  const pilih = (k, v, nama, username) => {
    setF(k, v);
    if (v && !form.name) setF("name", nama || "");
    if (v && !form.username && username) setF("username", username);
  };

  return (
    <Modal judul={form.id ? "Ubah Akun" : "Tambah Akun"} ikon="bi-person-plus" onTutup={onTutup}>
      <form onSubmit={onSimpan}>
        <div className="modal-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-semibold">Peran *</label>
              <select className="form-select" value={form.role} onChange={(e) => setF("role", e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}{PENINJAU.includes(r) ? " (lihat saja)" : ""}</option>)}
              </select>
              {PENINJAU.includes(form.role) && <div className="form-text">Peninjau dapat membuka semua menu dan melihat seluruh data, tetapi tidak dapat mengubah data apa pun.</div>}
            </div>

            {bisaGuru && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Data guru {form.role === "guru" ? "*" : "(opsional)"}</label>
                <select className="form-select" value={form.id_guru} required={form.role === "guru"}
                  onChange={(e) => { const t = refData.teachers.find((x) => x.id_guru === e.target.value); pilih("id_guru", e.target.value, t?.nama_guru, t?.nip_nik); }}>
                  <option value="">— Pilih guru —</option>
                  {refData.teachers.map((t) => <option key={t.id_guru} value={t.id_guru}>{t.nama_guru}{t.nip_nik ? ` · ${t.nip_nik}` : ""}</option>)}
                </select>
                <div className="form-text">Menentukan mapel diampu & kelas binaan.</div>
              </div>
            )}
            {isSiswa && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Data siswa *</label>
                <select className="form-select" value={form.id_siswa} required
                  onChange={(e) => { const s = refData.students.find((x) => x.id_siswa === e.target.value); pilih("id_siswa", e.target.value, s?.nama_siswa, s?.nisn); }}>
                  <option value="">— Pilih siswa —</option>
                  {refData.students.map((s) => <option key={s.id_siswa} value={s.id_siswa}>{s.nama_siswa}{s.nisn ? ` · ${s.nisn}` : ""}{s.kelas ? ` · ${s.kelas.nama_kelas}` : ""}</option>)}
                </select>
              </div>
            )}
            {isOrtu && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Data orang tua / wali *</label>
                <select className="form-select mb-2" value={form.id_ortu}
                  onChange={(e) => { const o = refData.ortu.find((x) => x.id_ortu === e.target.value); pilih("id_ortu", e.target.value, o?.nama_ayah || o?.nama_ibu); }}>
                  <option value="">— Orang tua —</option>
                  {refData.ortu.map((o) => <option key={o.id_ortu} value={o.id_ortu}>{[o.nama_ayah, o.nama_ibu].filter(Boolean).join(" & ") || o.id_ortu}</option>)}
                </select>
                <select className="form-select" value={form.id_wali}
                  onChange={(e) => { const w = refData.wali.find((x) => x.id_wali === e.target.value); pilih("id_wali", e.target.value, w?.nama_wali); }}>
                  <option value="">— atau Wali —</option>
                  {refData.wali.map((w) => <option key={w.id_wali} value={w.id_wali}>{w.nama_wali}</option>)}
                </select>
              </div>
            )}

            <div className="col-12">
              <label className="form-label small fw-semibold">Nama tampilan *</label>
              <input className="form-control" value={form.name} onChange={(e) => setF("name", e.target.value)} required maxLength={255} />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold">Username</label>
              <input className="form-control font-monospace" value={form.username} onChange={(e) => setF("username", e.target.value)} maxLength={50} placeholder="huruf, angka, . _ -" />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold">Email</label>
              <input type="email" className="form-control" value={form.email} onChange={(e) => setF("email", e.target.value)} maxLength={255} />
              <div className="form-text">Isi minimal salah satu: username atau email.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold">{form.id ? "Kata sandi baru (opsional)" : "Kata sandi"}</label>
              <input type="text" className="form-control font-monospace" value={form.password} onChange={(e) => setF("password", e.target.value)} minLength={8} maxLength={100} autoComplete="new-password"
                placeholder={form.id ? "Kosongkan bila tidak diubah" : "Kosongkan untuk dibuat acak"} />
            </div>
            <div className="col-md-6 d-flex flex-column justify-content-end gap-2">
              <div className="form-check form-switch m-0">
                <input className="form-check-input" type="checkbox" role="switch" id="f_aktif" checked={form.aktif} onChange={(e) => setF("aktif", e.target.checked)} />
                <label className="form-check-label small" htmlFor="f_aktif">Akun aktif</label>
              </div>
              <div className="form-check form-switch m-0">
                <input className="form-check-input" type="checkbox" role="switch" id="f_wajib" checked={form.wajib_ganti_password} onChange={(e) => setF("wajib_ganti_password", e.target.checked)} />
                <label className="form-check-label small" htmlFor="f_wajib">Wajib ganti kata sandi saat login</label>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-light" onClick={onTutup}>Batal</button>
          <button type="submit" className="btn btn-primary fw-bold" disabled={menyimpan}>
            {menyimpan && <span className="spinner-border spinner-border-sm me-2"></span>}Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Kata sandi hanya tampil sekali; sediakan salin, unduh CSV, dan cetak surat akun berkop sekolah
function DaftarKredensial({ judul, daftar, onTutup }) {
  const teks = daftar.map((k) => `${k.nama}\t${k.login}\t${k.password}`).join("\n");
  const salin = async () => {
    try { await navigator.clipboard.writeText(teks); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Disalin", showConfirmButton: false, timer: 1400 }); }
    catch (e) { Swal.fire("Gagal menyalin", "Salin manual dari tabel.", "warning"); }
  };
  const unduhCSV = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["Nama,Peran,Login,Kata Sandi", ...daftar.map((k) => [k.nama, ROLE_LABEL[k.role] || k.role || "", k.login, k.password].map(esc).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `akun-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const [mode, setMode] = useState(daftar.length > 1 ? "ringkas" : "pribadi");
  const cetak = async () => {
    if (!(await cetakSuratAkun(daftar, { mode }))) Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini, lalu coba lagi.", "warning");
  };

  return (
    <Modal judul={judul} ikon="bi-key-fill" onTutup={onTutup}
      footer={(
        <div className="modal-footer">
          <button className="btn btn-outline-secondary" onClick={salin}><i className="bi bi-clipboard me-1"></i>Salin</button>
          <button className="btn btn-outline-success" onClick={unduhCSV}><i className="bi bi-filetype-csv me-1"></i>Unduh CSV</button>
          {daftar.length > 1 && (
            <select className="form-select w-auto" value={mode} onChange={(e) => setMode(e.target.value)} title="Tata letak surat akun">
              <option value="pribadi">1 akun per halaman</option>
              <option value="ringkas">4 akun per halaman</option>
            </select>
          )}
          <button className="btn btn-outline-primary" onClick={cetak}><i className="bi bi-file-earmark-pdf me-1"></i>Cetak Surat Akun (PDF)</button>
          <button className="btn btn-primary fw-bold" onClick={onTutup}>Selesai</button>
        </div>
      )}>
      <div className="modal-body">
        <div className="alert alert-warning small py-2"><i className="bi bi-exclamation-triangle me-1"></i>Kata sandi ini <b>hanya ditampilkan sekali</b>. Simpan atau bagikan sekarang; pemilik akun akan diminta menggantinya saat login.</div>
        <div className="table-responsive" style={{ maxHeight: 420 }}>
          <table className="table table-sm align-middle mb-0">
            <thead className="table-light"><tr><th>Nama</th><th>Login</th><th>Kata sandi</th></tr></thead>
            <tbody>
              {daftar.map((k, i) => (
                <tr key={i}><td>{k.nama}</td><td className="font-monospace">{k.login}</td><td className="font-monospace fw-bold">{k.password}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
