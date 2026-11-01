"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { API_URL, ROLE_LABEL, ROLE_WARNA, authHeaders, simpanUser, halamanAwal, useAkses } from "@/app/lib/akses";
import { ACCENTS, THEME_MODES, setAccent, setThemeMode, useAppTheme } from "@/app/lib/themePrefs";
import { bacaAccordion, simpanAccordion } from "@/app/lib/sidebarPrefs";

const SYARAT = [
  { uji: (p) => p.length >= 8, label: "Minimal 8 karakter" },
  { uji: (p) => /[a-zA-Z]/.test(p), label: "Mengandung huruf" },
  { uji: (p) => /\d/.test(p), label: "Mengandung angka" },
];

export default function AkunSayaPage() {
  const router = useRouter();
  const { user, role, isGuru, isPortal, kelasBinaan, mapelDiampu } = useAkses();
  const tema = useAppTheme();
  const [accordion, setAccordion] = useState(true);
  const [form, setForm] = useState({ password_lama: "", password_baru: "", password_baru_confirmation: "" });
  const [lihat, setLihat] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => { setAccordion(bacaAccordion()); }, []);

  const ubahAccordion = (aktif) => { setAccordion(aktif); simpanAccordion(aktif); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const syaratOk = SYARAT.every((s) => s.uji(form.password_baru));
  const cocok = form.password_baru && form.password_baru === form.password_baru_confirmation;

  const gantiPassword = async (e) => {
    e.preventDefault();
    if (!syaratOk || !cocok) return;
    setMenyimpan(true);
    try {
      const res = await fetch(`${API_URL}/akun/password`, { method: "POST", headers: authHeaders(), body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || "Gagal mengganti kata sandi.");
      const wajibSebelumnya = user?.wajib_ganti_password;
      simpanUser(data.data);
      setForm({ password_lama: "", password_baru: "", password_baru_confirmation: "" });
      await Swal.fire({ icon: "success", title: "Kata sandi diganti", text: "Sesi di perangkat lain telah dikeluarkan.", timer: 2200, showConfirmButton: false });
      if (wajibSebelumnya) router.replace(halamanAwal(data.data));
    } catch (err) {
      Swal.fire("Gagal", err.message, "error");
    } finally {
      setMenyimpan(false);
    }
  };

  if (!user) return null;

  return (
    <div className="container-fluid mt-4 mb-5" style={{ maxWidth: 1100 }}>
      <h3 className="fw-bold text-primary mb-4"><i className="bi bi-person-gear me-2"></i>Akun Saya</h3>

      {user.wajib_ganti_password && (
        <div className="alert alert-warning d-flex align-items-center gap-2 shadow-sm">
          <i className="bi bi-shield-lock-fill fs-4"></i>
          <div><b>Ganti kata sandi dulu.</b> Akun Anda masih memakai kata sandi awal dari admin. Halaman lain terbuka setelah kata sandi diganti.</div>
        </div>
      )}

      <div className="row g-4">
        {/* PROFIL */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-4">
              <div className="d-flex align-items-center gap-3 mb-4">
                <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0"
                  style={{ width: 64, height: 64, fontSize: 26, background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-2))" }}>
                  {(user.name || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h5 className="fw-bold mb-1 text-truncate">{user.name}</h5>
                  <span className={`badge rounded-pill text-bg-${ROLE_WARNA[role] || "secondary"}`}>{ROLE_LABEL[role] || role}</span>
                </div>
              </div>
              <dl className="row small mb-0 gy-2">
                <dt className="col-5 text-muted fw-semibold">Username</dt><dd className="col-7 mb-0 font-monospace">{user.username || "-"}</dd>
                <dt className="col-5 text-muted fw-semibold">Email</dt><dd className="col-7 mb-0 text-break">{user.email || "-"}</dd>
                {isGuru && <>
                  <dt className="col-5 text-muted fw-semibold">Data guru</dt>
                  <dd className="col-7 mb-0">{user.id_guru ? <span className="text-success"><i className="bi bi-link-45deg"></i> Terhubung</span> : <span className="text-danger">Belum terhubung, hubungi admin</span>}</dd>
                  <dt className="col-5 text-muted fw-semibold">Kelas binaan</dt><dd className="col-7 mb-0">{kelasBinaan.length ? `${kelasBinaan.length} kelas (wali kelas)` : "Bukan wali kelas"}</dd>
                  <dt className="col-5 text-muted fw-semibold">Mapel diampu</dt><dd className="col-7 mb-0">{mapelDiampu.length} mata pelajaran</dd>
                </>}
                {isPortal && <>
                  <dt className="col-5 text-muted fw-semibold">Siswa terhubung</dt><dd className="col-7 mb-0">{(user.siswa_terjangkau || []).length} siswa</dd>
                </>}
              </dl>
              <hr />
              <p className="small text-muted mb-0">
                <i className="bi bi-info-circle me-1"></i>
                {role === "admin" && "Admin mengelola seluruh data, pengguna, dan pengaturan sistem."}
                {role === "kepsek" && "Kepala sekolah memantau semua data serta mengelola jadwal dan transaksi akademik. Data master, pengaturan, dan akun dikelola admin."}
                {role === "guru" && "Guru mengisi nilai mapel yang diampu, jurnal & presensi semua kelas (mengubah milik sendiri), rapor & P5 kelas binaan, serta jadwal sendiri."}
                {isPortal && "Akun portal hanya dapat melihat data siswa yang terhubung. Perubahan data dilakukan oleh guru/admin sekolah."}
              </p>
            </div>
          </div>
        </div>

        {/* GANTI KATA SANDI */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-4">
              <h5 className="fw-bold mb-3"><i className="bi bi-key me-2 text-primary"></i>Ganti Kata Sandi</h5>
              <form onSubmit={gantiPassword} autoComplete="off">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Kata sandi saat ini</label>
                  <input type={lihat ? "text" : "password"} className="form-control" value={form.password_lama} onChange={set("password_lama")} autoComplete="current-password" required />
                </div>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Kata sandi baru</label>
                    <input type={lihat ? "text" : "password"} className="form-control" value={form.password_baru} onChange={set("password_baru")} autoComplete="new-password" required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Ulangi kata sandi baru</label>
                    <input type={lihat ? "text" : "password"}
                      className={`form-control${form.password_baru_confirmation ? (cocok ? " is-valid" : " is-invalid") : ""}`}
                      value={form.password_baru_confirmation} onChange={set("password_baru_confirmation")} autoComplete="new-password" required />
                    <div className="invalid-feedback">Belum sama dengan kata sandi baru.</div>
                  </div>
                </div>
                <ul className="list-unstyled small mt-3 mb-3 d-flex flex-wrap gap-3">
                  {SYARAT.map((s) => {
                    const ok = s.uji(form.password_baru);
                    return <li key={s.label} className={ok ? "text-success" : "text-muted"}><i className={`bi ${ok ? "bi-check-circle-fill" : "bi-circle"} me-1`}></i>{s.label}</li>;
                  })}
                </ul>
                <div className="d-flex justify-content-between align-items-center">
                  <div className="form-check m-0">
                    <input className="form-check-input" type="checkbox" id="lihat_pw" checked={lihat} onChange={(e) => setLihat(e.target.checked)} />
                    <label className="form-check-label small" htmlFor="lihat_pw">Tampilkan kata sandi</label>
                  </div>
                  <button type="submit" className="btn btn-primary fw-bold" disabled={menyimpan || !syaratOk || !cocok || !form.password_lama}>
                    {menyimpan ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-check2-circle me-2"></i>}
                    Simpan Kata Sandi
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* PREFERENSI TAMPILAN */}
        <div className="col-12">
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h5 className="fw-bold mb-1"><i className="bi bi-palette me-2 text-primary"></i>Preferensi Tampilan</h5>
              <p className="small text-muted mb-4">Berlaku untuk browser ini dan langsung diterapkan.</p>
              <div className="row g-4">
                <div className="col-md-4">
                  <div className="small fw-semibold mb-2">Tema</div>
                  <div className="btn-group w-100" role="group">
                    {THEME_MODES.map((m) => (
                      <button key={m.id} type="button" className={`btn btn-sm ${tema.mode === m.id ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setThemeMode(m.id)}>
                        <i className={`bi ${m.icon} me-1`}></i>{m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="small fw-semibold mb-2">Warna aksen</div>
                  <div className="d-flex flex-wrap gap-2">
                    {ACCENTS.map((a) => (
                      <button key={a.id} type="button" title={a.label} aria-label={a.label} onClick={() => setAccent(a.id)}
                        className="rounded-circle border-0 p-0 d-flex align-items-center justify-content-center"
                        style={{ width: 30, height: 30, background: `linear-gradient(135deg, ${a.c1}, ${a.c2})`, boxShadow: tema.accent === a.id ? `0 0 0 3px var(--bs-body-bg), 0 0 0 5px ${a.c1}` : "none" }}>
                        {tema.accent === a.id && <i className="bi bi-check-lg text-white"></i>}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="small fw-semibold mb-2">Sidebar</div>
                  <div className="form-check form-switch m-0">
                    <input className="form-check-input" type="checkbox" role="switch" id="pref_accordion" checked={accordion} onChange={(e) => ubahAccordion(e.target.checked)} />
                    <label className="form-check-label small" htmlFor="pref_accordion">
                      Mode accordion
                      <span className="d-block text-muted">{accordion ? "Membuka satu grup menutup grup lain" : "Beberapa grup boleh terbuka bersamaan"}</span>
                    </label>
                  </div>
                  <div className="small text-muted mt-2">Tips: <kbd>Ctrl</kbd>+<kbd>K</kbd> atau <kbd>/</kbd> untuk mencari menu.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
