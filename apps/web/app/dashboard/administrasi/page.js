"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { ROLE_LABEL, ROLE_WARNA, useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { MenuAksi } from "@/components/dashboard/menuAksi";

const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Halaman submodul yang sudah dibangun (Tahap B–E menambah barisnya)
const HALAMAN = { SPMB: "/dashboard/administrasi/spmb", KEUANGAN: "/dashboard/administrasi/keuangan" };
const toast = (title) => Swal.fire({ toast: true, position: "top-end", icon: "success", title, showConfirmButton: false, timer: 2500 });

/**
 * Administrasi Sekolah (Fase 26 Tahap A): submodul tata usaha yang boleh dibuka akun ini, dan penunjukan operator.
 * Kepala sekolah menunjuk akun guru/operator dan memilih submodulnya; admin & peninjau hanya melihat daftarnya.
 */
export default function AdministrasiPage() {
  const akses = useAkses();
  const [res, setRes] = useState(null);
  const [galat, setGalat] = useState("");
  const [operator, setOperator] = useState(null);

  const muat = useCallback(async () => {
    try {
      const r = await minta("GET", "/administrasi");
      setRes(r.data);
      setGalat("");
      if (r.data.lihat_operator) setOperator((await minta("GET", "/administrasi/operator")).data);
    } catch (e) { setGalat(e.message); }
  }, []);
  useEffect(() => { muat(); }, [muat]);

  const submodul = res?.submodul || [];
  const namaSub = Object.fromEntries(submodul.map((s) => [s.kode, s.nama]));

  // Formulir tunjuk/ubah: pilih akun (baru saja), centang submodul, catatan tugas
  const formOperator = async (op) => {
    let kandidat = [];
    if (!op) {
      try { kandidat = (await minta("GET", "/administrasi/kandidat")).data; } catch (e) { Swal.fire("Gagal memuat akun", e.message, "error"); return; }
      if (!kandidat.length) {
        Swal.fire("Belum ada akun yang bisa ditunjuk", "Operator dipilih dari akun guru atau akun ber-peran Operator Sekolah yang aktif. Minta admin membuat akun staf tata usaha di Manajemen Pengguna.", "info");
        return;
      }
    }
    const dipilih = op?.submodul || [];
    const r = await Swal.fire({
      title: op ? `Submodul ${esc(op.user?.name)}` : "Tunjuk operator",
      html: `<div class="text-start">
        ${op ? "" : `<label class="form-label small mb-1" for="opAkun">Akun</label>
        <select id="opAkun" class="form-select mb-3"><option value="">— Pilih akun —</option>${kandidat.map((k) => `<option value="${k.id}">${esc(k.name)} · ${esc(ROLE_LABEL[k.role] || k.role)}${k.username ? ` · ${esc(k.username)}` : ""}</option>`).join("")}</select>`}
        <div class="form-label small mb-1">Submodul yang boleh dibuka</div>
        ${submodul.map((s) => `<div class="form-check mb-1"><input class="form-check-input" type="checkbox" id="opSub${s.kode}" value="${s.kode}"${dipilih.includes(s.kode) ? " checked" : ""}>
          <label class="form-check-label" for="opSub${s.kode}"><b>${esc(s.nama)}</b> <span class="text-muted small">${esc(s.uraian)}</span></label></div>`).join("")}
        <label class="form-label small mb-1 mt-2" for="opCatatan">Catatan tugas (opsional)</label>
        <textarea id="opCatatan" class="form-control" rows="2" maxlength="500" placeholder="mis. Bendahara sekolah, mengurus SPP">${esc(op?.catatan || "")}</textarea></div>`,
      showCancelButton: true, confirmButtonText: op ? "Simpan" : "Tunjuk", cancelButtonText: "Batal", focusConfirm: false,
      preConfirm: () => {
        const v = {
          submodul: submodul.map((s) => s.kode).filter((k) => document.getElementById(`opSub${k}`).checked),
          catatan: document.getElementById("opCatatan").value.trim() || null,
        };
        if (!op) v.id_user = Number(document.getElementById("opAkun").value) || null;
        if (!op && !v.id_user) { Swal.showValidationMessage("Pilih akun yang ditunjuk."); return false; }
        if (!v.submodul.length) { Swal.showValidationMessage("Pilih minimal satu submodul."); return false; }
        return v;
      },
    });
    if (!r.isConfirmed) return;
    try {
      const x = await minta(op ? "PUT" : "POST", op ? `/administrasi/operator/${op.id}` : "/administrasi/operator", r.value);
      toast(x.message);
      muat();
    } catch (e) { Swal.fire("Belum bisa", e.message, "warning"); }
  };

  const cabut = async (op) => {
    const ok = await Swal.fire({
      title: `Cabut ${op.user?.name}?`, text: "Akun ini tidak lagi bisa membuka submodul administrasi. Datanya tetap ada dan bisa ditunjuk lagi.",
      icon: "warning", showCancelButton: true, confirmButtonText: "Cabut", cancelButtonText: "Batal", confirmButtonColor: "#dc3545",
    });
    if (!ok.isConfirmed) return;
    try { toast((await minta("DELETE", `/administrasi/operator/${op.id}`)).message); muat(); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };

  if (galat) {
    return (
      <div className="container-fluid mt-3 mb-5" style={{ maxWidth: 900 }}>
        <h3 className="fw-bold text-primary mb-3"><i className="bi bi-briefcase me-2"></i>Administrasi Sekolah</h3>
        <div className="text-center text-muted py-5"><i className="bi bi-lock fs-1 d-block mb-2"></i>{galat}</div>
      </div>
    );
  }

  const tampil = res ? (res.lihat_operator ? submodul : submodul.filter((s) => s.boleh)) : [];

  return (
    <div className="container-fluid mt-3 mb-5" style={{ maxWidth: 1000 }}>
      <div className="mb-3">
        <h3 className="fw-bold text-primary mb-1"><i className="bi bi-briefcase me-2"></i>Administrasi Sekolah</h3>
        <p className="text-muted small mb-0">Urusan tata usaha sekolah, terpisah dari menu pembelajaran. Setiap perubahan tercatat di Log Aktivitas.</p>
      </div>

      {!res ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div> : (
        <>
          {res.penunjukan && (
            <div className="alert alert-info d-flex gap-2 py-2 small" data-penunjukan>
              <i className="bi bi-person-badge"></i>
              <div>
                Anda ditunjuk sebagai operator untuk <b>{(res.penunjukan.submodul || []).map((k) => namaSub[k] || k).join(", ")}</b>
                {res.penunjukan.penunjuk?.name && <> oleh {res.penunjukan.penunjuk.name}</>}.
                {res.penunjukan.catatan && <div className="mt-1">Catatan: {res.penunjukan.catatan}</div>}
              </div>
            </div>
          )}

          <h2 className="h6 fw-semibold text-muted text-uppercase mb-2">Submodul</h2>
          <div className="row g-3 mb-4">
            {tampil.map((s) => (
              <div key={s.kode} className="col-sm-6 col-lg-3">
                <div className={`card h-100 ${s.boleh ? "" : "opacity-75"}`} data-submodul={s.kode}>
                  <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span className="fs-4 text-primary"><i className={`bi ${s.ikon}`}></i></span>
                      <span className="fw-semibold">{s.nama}</span>
                    </div>
                    <p className="small text-muted mb-2">{s.uraian}</p>
                    {s.tersedia
                      ? (s.boleh && HALAMAN[s.kode]
                        ? <Link href={HALAMAN[s.kode]} className="btn btn-sm btn-primary stretched-link">Buka {s.nama}</Link>
                        : <span className="badge text-bg-success fw-normal">Tersedia</span>)
                      : <span className="badge text-bg-light border fw-normal">Tahap {s.tahap} · belum tersedia</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {res.lihat_operator && (
            <section aria-labelledby="judul-operator">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <h2 id="judul-operator" className="h6 fw-semibold text-muted text-uppercase mb-0 me-auto">Operator sekolah</h2>
                {res.kelola_operator && <button className="btn btn-primary btn-sm" onClick={() => formOperator(null)}><i className="bi bi-person-plus me-1"></i>Tunjuk operator</button>}
              </div>
              <p className="small text-muted">
                Operator hanya melihat submodul yang dicentang. Pilih dari akun guru (merangkap) atau akun ber-peran <b>Operator Sekolah</b> untuk staf tata usaha.
                {!res.kelola_operator && <> Hanya kepala sekolah yang dapat menunjuk atau mencabut operator.</>}
                {akses.isAdmin && <> Akun staf baru dibuat di <Link href="/dashboard/pengguna">Manajemen Pengguna</Link>.</>}
              </p>

              {!operator ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
                : !operator.length ? (
                  <div className="text-center text-muted py-4 border rounded"><i className="bi bi-people fs-2 d-block mb-1"></i>Belum ada operator.{res.kelola_operator && <> Tekan <b>Tunjuk operator</b>.</>}</div>
                ) : (
                  <div className="list-group">
                    {operator.map((op) => (
                      <div key={op.id} className="list-group-item d-flex align-items-start gap-2" data-operator={op.user?.username || op.id_user}>
                        <div className="me-auto min-w-0">
                          <div className="fw-semibold">
                            {op.user?.name}
                            <span className={`badge rounded-pill text-bg-${ROLE_WARNA[op.user?.role] || "secondary"} fw-normal ms-2 border`}>{ROLE_LABEL[op.user?.role] || op.user?.role}</span>
                            {op.user && !op.user.aktif && <span className="badge text-bg-danger fw-normal ms-1">akun nonaktif</span>}
                          </div>
                          <div className="d-flex flex-wrap gap-1 my-1">
                            {op.submodul.map((k) => <span key={k} className="badge text-bg-primary fw-normal">{namaSub[k] || k}</span>)}
                          </div>
                          {op.catatan && <div className="small">{op.catatan}</div>}
                          <div className="small text-muted">
                            {op.penunjuk ? `Ditunjuk oleh ${op.penunjuk}` : "Ditunjuk"}
                            {op.diperbarui && ` · ${new Date(op.diperbarui).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`}
                          </div>
                        </div>
                        {res.kelola_operator && (
                          <MenuAksi label={`Aksi untuk ${op.user?.name}`} items={[
                            { label: "Ubah submodul", ikon: "bi-pencil-square", onClick: () => formOperator(op) },
                            { label: "Cabut penunjukan", ikon: "bi-person-x", onClick: () => cabut(op), bahaya: true, pemisah: true },
                          ]} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
