"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { API_URL, authHeaders, useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { MenuAksi } from "@/components/dashboard/menuAksi";
import Pengisi from "@/components/dashboard/Pengisi";

const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const toast = (title) => Swal.fire({ toast: true, position: "top-end", icon: "success", title, showConfirmButton: false, timer: 2500 });
const tgl = (t) => (t ? new Date(`${String(t).slice(0, 10)}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-");
const WARNA = {
  DIAJUKAN: "secondary", PERLU_PERBAIKAN: "warning", TERVERIFIKASI: "info", DITERIMA: "success",
  CADANGAN: "warning", TIDAK_DITERIMA: "danger", DAFTAR_ULANG: "primary", SELESAI: "success",
};
const BOLEH_VERIFIKASI = ["DIAJUKAN", "PERLU_PERBAIKAN", "TERVERIFIKASI"];
const BOLEH_HASIL = ["TERVERIFIKASI", "DITERIMA", "CADANGAN", "TIDAK_DITERIMA"];

/**
 * SPMB (Administrasi Sekolah Tahap B): gelombang, verifikasi berkas, hasil seleksi, pengumuman,
 * dan penyelesaian daftar ulang yang otomatis membuat data siswa + orang tua/wali.
 */
export default function SpmbPage() {
  const akses = useAkses();
  const bolehUbah = !akses.isPeninjau;
  const [pilihan, setPilihan] = useState(null);
  const [gelombang, setGelombang] = useState(null);
  const [idG, setIdG] = useState("");
  const [status, setStatus] = useState("");
  const [cari, setCari] = useState("");
  const [daftar, setDaftar] = useState(null);
  const [idPilih, setIdPilih] = useState(null);
  const [galat, setGalat] = useState("");

  const muatGelombang = useCallback(async () => {
    const r = await minta("GET", "/administrasi/spmb/gelombang");
    setGelombang(r.data);
    setIdG((x) => x || (r.data[0]?.id ? String(r.data[0].id) : ""));
  }, []);

  useEffect(() => {
    const st = new URLSearchParams(window.location.search).get("status");
    if (st) setStatus(st);
    Promise.all([minta("GET", "/administrasi/spmb/pilihan").then((r) => setPilihan(r.data)), muatGelombang()]).catch((e) => setGalat(e.message));
  }, [muatGelombang]);

  const muatDaftar = useCallback(async () => {
    if (!idG) { setDaftar([]); return; }
    try { setDaftar((await minta("GET", `/administrasi/spmb/pendaftar?id_gelombang=${idG}`)).data); }
    catch (e) { setGalat(e.message); }
  }, [idG]);
  useEffect(() => { muatDaftar(); }, [muatDaftar]);

  const segarkan = () => { muatDaftar(); muatGelombang(); };
  const g = gelombang?.find((x) => String(x.id) === idG);
  const namaStatus = Object.fromEntries((pilihan?.status || []).map((s) => [s.kode, s.nama]));
  const namaBerkas = Object.fromEntries((pilihan?.jenis_berkas || []).map((s) => [s.kode, s.nama]));

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return (daftar || []).filter((p) => (!status || p.status === status)
      && (!kata || p.nama_siswa.toLowerCase().includes(kata) || p.nomor_daftar.toLowerCase().includes(kata) || (p.nisn || "").includes(kata)));
  }, [daftar, status, cari]);
  const hitung = useMemo(() => (daftar || []).reduce((a, p) => ({ ...a, [p.status]: (a[p.status] || 0) + 1 }), {}), [daftar]);

  // ===== Gelombang =====
  const formGelombang = async (lama) => {
    const wajib = lama?.berkas_wajib ?? ["AKTA", "KK", "FOTO"];
    const r = await Swal.fire({
      title: lama ? `Ubah ${esc(lama.nama)}` : "Gelombang baru", width: 640, focusConfirm: false,
      html: `<div class="text-start row g-2">
        <div class="col-8"><label class="form-label small mb-1" for="gNama">Nama</label><input id="gNama" class="form-control" maxlength="100" value="${esc(lama?.nama || "Gelombang 1")}"></div>
        <div class="col-4"><label class="form-label small mb-1" for="gTahun">Tahun ajaran</label><input id="gTahun" class="form-control" placeholder="2027/2028" value="${esc(lama?.tahun_ajaran || "")}"></div>
        <div class="col-4"><label class="form-label small mb-1" for="gBuka">Dibuka</label><input id="gBuka" type="date" class="form-control" value="${esc(lama?.tgl_buka || "")}"></div>
        <div class="col-4"><label class="form-label small mb-1" for="gTutup">Ditutup</label><input id="gTutup" type="date" class="form-control" value="${esc(lama?.tgl_tutup || "")}"></div>
        <div class="col-4"><label class="form-label small mb-1" for="gUmum">Pengumuman</label><input id="gUmum" type="date" class="form-control" value="${esc(lama?.tgl_pengumuman || "")}"></div>
        <div class="col-4"><label class="form-label small mb-1" for="gKuota">Kuota (opsional)</label><input id="gKuota" type="number" min="1" class="form-control" value="${esc(lama?.kuota ?? "")}"></div>
        <div class="col-12"><div class="form-label small mb-1">Berkas wajib</div>
          ${(pilihan?.jenis_berkas || []).filter((b) => b.kode !== "LAINNYA").map((b) => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" id="gB${b.kode}" value="${b.kode}"${wajib.includes(b.kode) ? " checked" : ""}><label class="form-check-label small" for="gB${b.kode}">${esc(b.nama)}</label></div>`).join("")}</div>
        <div class="col-12"><label class="form-label small mb-1" for="gInfo">Informasi untuk pendaftar (opsional)</label><textarea id="gInfo" class="form-control" rows="3" maxlength="2000" placeholder="mis. usia minimal 6 tahun per 1 Juli; biaya pendaftaran gratis">${esc(lama?.info || "")}</textarea></div></div>`,
      showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal",
      preConfirm: () => {
        const v = (id) => document.getElementById(id).value.trim();
        return {
          nama: v("gNama"), tahun_ajaran: v("gTahun"), tgl_buka: v("gBuka"), tgl_tutup: v("gTutup"), tgl_pengumuman: v("gUmum") || null,
          kuota: v("gKuota") ? Number(v("gKuota")) : null, info: v("gInfo") || null,
          berkas_wajib: (pilihan?.jenis_berkas || []).map((b) => b.kode).filter((k) => document.getElementById(`gB${k}`)?.checked),
        };
      },
    });
    if (!r.isConfirmed) return;
    try {
      const x = await minta(lama ? "PUT" : "POST", lama ? `/administrasi/spmb/gelombang/${lama.id}` : "/administrasi/spmb/gelombang", r.value);
      toast(x.message);
      if (!lama) setIdG(String(x.data.id));
      muatGelombang();
    } catch (e) { Swal.fire("Belum bisa disimpan", e.message, "warning"); }
  };

  const hapusGelombang = async (x) => {
    const ok = await Swal.fire({ title: `Hapus ${x.nama}?`, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { toast((await minta("DELETE", `/administrasi/spmb/gelombang/${x.id}`)).message); setIdG(""); muatGelombang(); }
    catch (e) { Swal.fire("Tidak bisa dihapus", e.message, "warning"); }
  };

  const umumkan = async (x, nilai) => {
    const ok = await Swal.fire({
      title: nilai ? `Umumkan hasil ${x.nama}?` : "Tarik pengumuman?",
      text: nilai ? "Pendaftar akan melihat hasil seleksi (diterima/cadangan/tidak diterima) lewat Cek Status dan yang diterima bisa daftar ulang." : "Hasil seleksi disembunyikan lagi dari pendaftar.",
      icon: "question", showCancelButton: true, confirmButtonText: nilai ? "Umumkan" : "Tarik", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    try { toast((await minta("POST", `/administrasi/spmb/gelombang/${x.id}/umumkan`, { umumkan: nilai })).message); muatGelombang(); }
    catch (e) { Swal.fire("Belum bisa diumumkan", e.message, "warning"); }
  };

  if (galat) {
    return <div className="container-fluid mt-3"><div className="text-center text-muted py-5"><i className="bi bi-lock fs-1 d-block mb-2"></i>{galat}</div></div>;
  }

  return (
    <div className="container-fluid mt-3 mb-5">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <div className="small"><Link href="/dashboard/administrasi" className="text-decoration-none">Administrasi Sekolah</Link> /</div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-person-plus me-2"></i>SPMB</h3>
        </div>
        <a href="/spmb" target="_blank" rel="noopener" className="btn btn-outline-secondary btn-sm"><i className="bi bi-box-arrow-up-right me-1"></i>Halaman pendaftaran</a>
        {bolehUbah && <button className="btn btn-primary btn-sm" onClick={() => formGelombang(null)} disabled={!pilihan}><i className="bi bi-plus-lg me-1"></i>Gelombang baru</button>}
      </div>

      {!gelombang ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !gelombang.length ? (
          <div className="text-center text-muted py-5 border rounded">
            <i className="bi bi-calendar-plus fs-1 d-block mb-2"></i>Belum ada gelombang pendaftaran.
            {bolehUbah && <> Tekan <b>Gelombang baru</b> untuk membuka formulir SPMB di <a href="/spmb" target="_blank" rel="noopener">halaman publik</a>.</>}
          </div>
        ) : (
          <>
            <div className="card mb-3"><div className="card-body py-2 d-flex flex-wrap align-items-center gap-2">
              <select className="form-select form-select-sm w-auto" value={idG} onChange={(e) => { setIdG(e.target.value); setIdPilih(null); }} aria-label="Gelombang">
                {gelombang.map((x) => <option key={x.id} value={x.id}>{x.nama} · {x.tahun_ajaran}</option>)}
              </select>
              {g && (
                <>
                  <span className={`badge ${g.buka ? "text-bg-success" : "text-bg-light border"} fw-normal`}>{g.buka ? "Formulir dibuka" : "Formulir ditutup"}</span>
                  <span className="small text-muted">{tgl(g.tgl_buka)} – {tgl(g.tgl_tutup)}{g.kuota ? ` · kuota ${g.kuota}` : ""}
                    {g.kuota ? ` · diterima ${(g.jumlah.DITERIMA || 0) + (g.jumlah.DAFTAR_ULANG || 0) + (g.jumlah.SELESAI || 0)}` : ""}</span>
                  {g.diumumkan_at
                    ? <span className="badge text-bg-primary fw-normal" data-diumumkan>Hasil diumumkan</span>
                    : <span className="badge text-bg-light border fw-normal">Hasil belum diumumkan</span>}
                  <span className="ms-auto"></span>
                  {bolehUbah && (g.diumumkan_at
                    ? <button className="btn btn-outline-secondary btn-sm" onClick={() => umumkan(g, false)}>Tarik pengumuman</button>
                    : <button className="btn btn-success btn-sm" onClick={() => umumkan(g, true)}><i className="bi bi-megaphone me-1"></i>Umumkan hasil</button>)}
                  {bolehUbah && <MenuAksi label={`Aksi untuk ${g.nama}`} items={[
                    { label: "Ubah gelombang", ikon: "bi-pencil-square", onClick: () => formGelombang(g) },
                    { label: "Hapus gelombang", ikon: "bi-trash", onClick: () => hapusGelombang(g), bahaya: true, pemisah: true },
                  ]} />}
                </>
              )}
            </div></div>

            <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Saring status">
              <button className={`btn btn-sm ${!status ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => setStatus("")}>Semua <span className="badge text-bg-light ms-1">{daftar?.length ?? 0}</span></button>
              {(pilihan?.status || []).map((s) => (
                <button key={s.kode} className={`btn btn-sm ${status === s.kode ? "btn-dark" : "btn-outline-secondary"}`} onClick={() => setStatus(status === s.kode ? "" : s.kode)} data-saring={s.kode}>
                  {s.nama} <span className="badge text-bg-light ms-1">{hitung[s.kode] || 0}</span></button>
              ))}
            </div>

            <div className="row g-3">
              <div className={idPilih ? "col-lg-5" : "col-12"}>
                <input className="form-control form-control-sm mb-2" placeholder="Cari nama, nomor, atau NISN…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari pendaftar" />
                {!daftar ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
                  : !tampil.length ? <div className="text-center text-muted py-4 border rounded">{daftar.length ? "Tidak ada pendaftar yang cocok." : "Belum ada pendaftar di gelombang ini."}</div>
                  : (
                    <div className="list-group">
                      {tampil.map((p) => (
                        <button key={p.id} type="button" className={`list-group-item list-group-item-action d-flex align-items-center gap-2 ${idPilih === p.id ? "active" : ""}`}
                          onClick={() => setIdPilih(p.id)} data-pendaftar={p.nomor_daftar}>
                          <div className="me-auto min-w-0 text-start">
                            <div className="fw-semibold text-truncate">{p.nama_siswa}</div>
                            <div className={`small ${idPilih === p.id ? "" : "text-muted"}`}>{p.nomor_daftar} · {p.jenis_kelamin} · {tgl(p.tgl_lahir)} · {p.berkas_count} berkas</div>
                          </div>
                          <span className={`badge text-bg-${WARNA[p.status]} fw-normal`}>{namaStatus[p.status] || p.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
              </div>
              {idPilih && (
                <div className="col-lg-7">
                  <Detail key={idPilih} id={idPilih} pilihan={pilihan} namaStatus={namaStatus} namaBerkas={namaBerkas} bolehUbah={bolehUbah}
                    onTutup={() => setIdPilih(null)} onBerubah={segarkan} onHapus={() => { setIdPilih(null); segarkan(); }} />
                </div>
              )}
            </div>
          </>
        )}
    </div>
  );
}

/* ================= Detail pendaftar ================= */

function Detail({ id, pilihan, namaStatus, namaBerkas, bolehUbah, onTutup, onBerubah, onHapus }) {
  const [p, setP] = useState(null);
  const [cek, setCek] = useState({});
  const [galat, setGalat] = useState("");

  const muat = useCallback(async () => {
    try {
      const r = (await minta("GET", `/administrasi/spmb/pendaftar/${id}`)).data;
      setP(r);
      setCek(Object.fromEntries(r.berkas.map((b) => [b.id, { status: b.status, catatan: b.catatan || "" }])));
    } catch (e) { setGalat(e.message); }
  }, [id]);
  useEffect(() => { muat(); }, [muat]);

  if (galat) return <div className="alert alert-danger">{galat}</div>;
  if (!p) return <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>;

  const nama = (daftar, kunci, label, nilai) => (daftar || []).find((x) => x[kunci] === nilai)?.[label] || "-";
  const kerja = (k) => nama(pilihan?.pekerjaan, "id_pekerjaan", "nama_pekerjaan", p[k]);
  const bisaVerifikasi = bolehUbah && BOLEH_VERIFIKASI.includes(p.status);
  const bisaHasil = bolehUbah && BOLEH_HASIL.includes(p.status);
  const bisaSelesai = bolehUbah && (p.status === "DAFTAR_ULANG" || (p.status === "DITERIMA" && p.gelombang?.diumumkan_at));

  const jalankan = async (fn) => {
    try { toast((await fn()).message); await muat(); onBerubah(); }
    catch (e) { Swal.fire("Belum bisa", e.message, "warning"); await muat(); }
  };
  const berkasDikirim = () => p.berkas.map((b) => ({ id: b.id, status: cek[b.id]?.status || "MENUNGGU", catatan: cek[b.id]?.catatan || null }));

  const verifikasi = async (keputusan) => {
    let catatan = null;
    if (keputusan === "PERLU_PERBAIKAN") {
      const r = await Swal.fire({
        title: "Minta perbaikan", input: "textarea", inputLabel: "Apa yang perlu diperbaiki pendaftar?", inputValue: p.catatan_verifikasi || "",
        inputAttributes: { maxlength: 1000, "aria-label": "Catatan perbaikan" }, showCancelButton: true, confirmButtonText: "Kirim", cancelButtonText: "Batal",
        inputValidator: (v) => (!v.trim() ? "Tulis catatan perbaikannya." : null),
      });
      if (!r.isConfirmed) return;
      catatan = r.value.trim();
    }
    jalankan(() => minta("POST", `/administrasi/spmb/pendaftar/${p.id}/verifikasi`, { keputusan, catatan, berkas: berkasDikirim() }));
  };

  const hasil = async (nilai) => {
    if (!nilai) return jalankan(() => minta("POST", `/administrasi/spmb/pendaftar/${p.id}/hasil`, { hasil: null }));
    const r = await Swal.fire({
      title: namaStatus[nilai], focusConfirm: false,
      html: `<div class="text-start"><label class="form-label small mb-1" for="hSkor">Skor / nilai seleksi (opsional)</label>
        <input id="hSkor" type="number" step="0.01" min="0" class="form-control mb-2" value="${esc(p.skor ?? "")}">
        <label class="form-label small mb-1" for="hCatatan">Pesan untuk pendaftar (opsional)</label>
        <textarea id="hCatatan" class="form-control" rows="2" maxlength="1000" placeholder="${nilai === "DITERIMA" ? "mis. Daftar ulang 1–5 Juli membawa berkas asli" : ""}">${esc(p.catatan_verifikasi || "")}</textarea></div>`,
      showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal",
      preConfirm: () => ({ hasil: nilai, skor: document.getElementById("hSkor").value || null, catatan: document.getElementById("hCatatan").value.trim() || null }),
    });
    if (r.isConfirmed) jalankan(() => minta("POST", `/administrasi/spmb/pendaftar/${p.id}/hasil`, r.value));
  };

  const selesaikan = async () => {
    const r = await Swal.fire({
      title: "Selesaikan daftar ulang",
      html: `<p class="small text-start">Data <b>${esc(p.nama_siswa)}</b> akan dibuat di Master Siswa, beserta orang tua/wali (bila nomor WA dan nama sama dengan data keluarga yang sudah ada, dihubungkan ke data itu).</p>
        <div class="text-start"><label class="form-label small mb-1" for="sKelas">Masuk kelas (bisa diatur nanti)</label>
        <select id="sKelas" class="form-select"><option value="">— Belum ditentukan —</option>${(pilihan?.kelas || []).map((k) => `<option value="${esc(k.id_kelas)}">${esc(k.nama_kelas)}</option>`).join("")}</select></div>`,
      showCancelButton: true, confirmButtonText: "Jadikan siswa", cancelButtonText: "Batal", focusConfirm: false,
      preConfirm: () => ({ id_kelas: document.getElementById("sKelas").value || null }),
    });
    if (r.isConfirmed) jalankan(() => minta("POST", `/administrasi/spmb/pendaftar/${p.id}/selesaikan`, r.value));
  };

  const ubahData = async () => {
    const f = (k, label, tipe = "text", lebar = "col-6") => `<div class="${lebar}"><label class="form-label small mb-1" for="e_${k}">${label}</label><input id="e_${k}" type="${tipe}" class="form-control form-control-sm" value="${esc(p[k] ?? "")}"></div>`;
    const r = await Swal.fire({
      title: "Rapikan data", width: 640, focusConfirm: false,
      html: `<div class="row g-2 text-start">${f("nama_siswa", "Nama lengkap", "text", "col-8")}${f("panggilan", "Panggilan", "text", "col-4")}
        ${f("nisn", "NISN", "text", "col-4")}${f("tempat_lahir", "Tempat lahir", "text", "col-4")}${f("tgl_lahir", "Tanggal lahir", "date", "col-4")}
        ${f("nama_ayah", "Nama ayah")}${f("nama_ibu", "Nama ibu")}${f("nama_wali", "Nama wali")}${f("no_wa", "No. WhatsApp")}
        ${f("sekolah_asal", "Sekolah asal", "text", "col-12")}
        <div class="col-12"><label class="form-label small mb-1" for="e_alamat">Alamat</label><textarea id="e_alamat" class="form-control form-control-sm" rows="2">${esc(p.alamat)}</textarea></div></div>`,
      showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal",
      preConfirm: () => Object.fromEntries(["nama_siswa", "panggilan", "nisn", "tempat_lahir", "tgl_lahir", "nama_ayah", "nama_ibu", "nama_wali", "no_wa", "sekolah_asal", "alamat"]
        .map((k) => [k, document.getElementById(`e_${k}`).value.trim() || null])),
    });
    if (r.isConfirmed) jalankan(() => minta("PUT", `/administrasi/spmb/pendaftar/${p.id}`, r.value));
  };

  const hapus = async () => {
    const ok = await Swal.fire({ title: `Hapus pendaftaran ${p.nomor_daftar}?`, text: "Data dan berkasnya dihapus permanen (mis. pendaftaran ganda).", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" });
    if (!ok.isConfirmed) return;
    try { toast((await minta("DELETE", `/administrasi/spmb/pendaftar/${p.id}`)).message); onHapus(); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };

  // Pendaftar lupa kode akses: kode baru ditampilkan sekali untuk disampaikan langsung/lewat WA
  const kodeBaru = async () => {
    const ok = await Swal.fire({ title: "Buat kode akses baru?", text: "Kode lama tidak berlaku lagi. Pastikan yang meminta benar orang tua/wali pendaftar.", icon: "question", showCancelButton: true, confirmButtonText: "Buat kode", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    try {
      const r = (await minta("POST", `/administrasi/spmb/pendaftar/${p.id}/kode-baru`)).data;
      Swal.fire({ title: "Kode akses baru", icon: "success",
        html: `<p class="mb-1">Nomor pendaftaran <b>${esc(r.nomor_daftar)}</b></p><p class="fs-3 fw-bold font-monospace mb-1" data-kode-baru>${esc(r.kode_akses)}</p><p class="small text-muted mb-0">Sampaikan kepada pendaftar. Kode ini tidak bisa dilihat lagi.</p>` });
    } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };

  // Berkas disimpan di disk privat: diambil dengan token lalu dibuka di tab baru
  const lihat = async (b) => {
    const tab = window.open("", "_blank");
    try {
      const res = await fetch(`${API_URL}/administrasi/spmb/berkas/${b.id}`, { headers: authHeaders(false) });
      if (!res.ok) throw new Error("Berkas tidak dapat dibuka.");
      const url = URL.createObjectURL(await res.blob());
      if (tab) tab.location.href = url; else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { tab?.close(); Swal.fire("Gagal", e.message, "error"); }
  };

  const baris = (label, isi) => <><dt className="col-5 col-sm-4 fw-normal text-muted">{label}</dt><dd className="col-7 col-sm-8 mb-1">{isi || "-"}</dd></>;

  return (
    <div className="card" data-detail={p.nomor_daftar}>
      <div className="card-header d-flex align-items-center gap-2">
        <div className="me-auto">
          <div className="fw-semibold">{p.nama_siswa}</div>
          <div className="small text-muted">{p.nomor_daftar} · dikirim {tgl(p.created_at)}</div>
        </div>
        <span className={`badge text-bg-${WARNA[p.status]}`} data-status-detail>{namaStatus[p.status] || p.status}</span>
        {bolehUbah && <MenuAksi label={`Aksi untuk ${p.nama_siswa}`} items={[
          { label: "Rapikan data", ikon: "bi-pencil-square", onClick: ubahData, tampil: p.status !== "SELESAI" },
          { label: "Buat kode akses baru", ikon: "bi-key", onClick: kodeBaru },
          { label: "Hapus pendaftaran", ikon: "bi-trash", onClick: hapus, bahaya: true, pemisah: true, tampil: p.status !== "SELESAI" },
        ]} />}
        <button type="button" className="btn-close" aria-label="Tutup detail" onClick={onTutup}></button>
      </div>
      <div className="card-body">
        {p.catatan_verifikasi && <div className="alert alert-light border small py-2"><b>Catatan untuk pendaftar:</b> {p.catatan_verifikasi}</div>}
        <dl className="row small mb-3">
          {baris("Jenis kelamin", p.jenis_kelamin === "L" ? "Laki-laki" : "Perempuan")}
          {baris("Tempat, tgl lahir", `${p.tempat_lahir}, ${tgl(p.tgl_lahir)}`)}
          {baris("NISN", p.nisn)}
          {baris("Agama / suku", [nama(pilihan?.agama, "id_agama", "nama_agama", p.id_agama), nama(pilihan?.suku, "id_suku", "nama_suku", p.id_suku)].join(" / "))}
          {baris("Sekolah asal", p.sekolah_asal)}
          {baris("Alamat", p.alamat)}
          {baris("Ayah", p.nama_ayah && `${p.nama_ayah} (${kerja("id_pekerjaan_ayah")})`)}
          {baris("Ibu", p.nama_ibu && `${p.nama_ibu} (${kerja("id_pekerjaan_ibu")})`)}
          {p.nama_wali && baris("Wali", `${p.nama_wali} (${kerja("id_pekerjaan_wali")})`)}
          {baris("WhatsApp", p.no_wa && <a href={`https://wa.me/${p.no_wa.replace(/^0/, "62").replace(/^\+/, "")}`} target="_blank" rel="noopener">{p.no_wa}</a>)}
          {p.skor != null && baris("Skor seleksi", p.skor)}
          {p.verifikator && baris("Diverifikasi", <><Pengisi pengisi={p.verifikator.name} sebaris /> <span className="text-muted">{tgl(p.diverifikasi_at)}</span></>)}
          {p.siswa && baris("Siswa", <>{p.siswa.nama_siswa} · <Link href="/dashboard/master-siswa">Master Siswa</Link></>)}
        </dl>

        <h4 className="h6 fw-semibold">Berkas</h4>
        {!p.berkas.length && <div className="small text-muted mb-2">Belum ada berkas diunggah.</div>}
        {(p.berkas_wajib || []).filter((j) => !p.berkas.some((b) => b.jenis === j)).map((j) => (
          <div key={j} className="small text-danger mb-1"><i className="bi bi-exclamation-circle me-1"></i>{namaBerkas[j] || j} (wajib) belum diunggah</div>
        ))}
        <div className="list-group mb-3">
          {p.berkas.map((b) => (
            <div key={b.id} className="list-group-item" data-berkas-operator={b.jenis}>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <div className="me-auto">
                  <span className="fw-semibold">{namaBerkas[b.jenis] || b.jenis}</span>{(p.berkas_wajib || []).includes(b.jenis) && <span className="text-danger"> *</span>}
                  <div className="small text-muted">{b.nama_asli} · {Math.max(1, Math.round(b.ukuran / 1024))} KB</div>
                </div>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => lihat(b)}><i className="bi bi-eye me-1"></i>Lihat</button>
                {bisaVerifikasi ? (
                  <select className="form-select form-select-sm w-auto" value={cek[b.id]?.status || "MENUNGGU"} aria-label={`Status ${namaBerkas[b.jenis]}`}
                    onChange={(e) => setCek((x) => ({ ...x, [b.id]: { ...x[b.id], status: e.target.value } }))}>
                    <option value="MENUNGGU">Belum diperiksa</option><option value="SAH">Sah</option><option value="DITOLAK">Ditolak</option>
                  </select>
                ) : <span className={`badge ${b.status === "SAH" ? "text-bg-success" : b.status === "DITOLAK" ? "text-bg-danger" : "text-bg-light border"} fw-normal`}>{{ SAH: "Sah", DITOLAK: "Ditolak" }[b.status] || "Belum diperiksa"}</span>}
              </div>
              {bisaVerifikasi && cek[b.id]?.status === "DITOLAK" && (
                <input className="form-control form-control-sm mt-2" placeholder="Alasan ditolak (terlihat oleh pendaftar)" maxLength={300} value={cek[b.id]?.catatan || ""}
                  onChange={(e) => setCek((x) => ({ ...x, [b.id]: { ...x[b.id], catatan: e.target.value } }))} />
              )}
              {!bisaVerifikasi && b.catatan && <div className="small text-danger mt-1">{b.catatan}</div>}
            </div>
          ))}
        </div>

        <div className="d-flex flex-wrap gap-2">
          {bisaVerifikasi && <>
            <button className="btn btn-success btn-sm" onClick={() => verifikasi("TERVERIFIKASI")}><i className="bi bi-patch-check me-1"></i>Tandai terverifikasi</button>
            <button className="btn btn-outline-warning btn-sm" onClick={() => verifikasi("PERLU_PERBAIKAN")}><i className="bi bi-arrow-return-left me-1"></i>Minta perbaikan</button>
          </>}
          {bisaHasil && <>
            <span className="vr mx-1"></span>
            {["DITERIMA", "CADANGAN", "TIDAK_DITERIMA"].map((h) => (
              <button key={h} className={`btn btn-sm ${p.status === h ? `btn-${WARNA[h]}` : `btn-outline-${WARNA[h]}`}`} onClick={() => hasil(h)}>{namaStatus[h]}</button>
            ))}
            {p.status !== "TERVERIFIKASI" && <button className="btn btn-sm btn-link" onClick={() => hasil(null)}>Batalkan hasil</button>}
          </>}
          {bisaSelesai && <button className="btn btn-primary btn-sm" onClick={selesaikan}><i className="bi bi-person-check me-1"></i>Selesaikan daftar ulang</button>}
        </div>
        {p.status === "DITERIMA" && !p.gelombang?.diumumkan_at && <p className="small text-muted mt-2 mb-0">Daftar ulang dapat diselesaikan setelah hasil gelombang ini diumumkan.</p>}
      </div>
    </div>
  );
}
