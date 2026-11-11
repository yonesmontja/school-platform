"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { MenuAksi, aksiHapus, aksiUbah } from "@/components/dashboard/menuAksi";

const WARNA = { NASIONAL: "danger", CUTI_BERSAMA: "warning", SEKOLAH: "info" };
const JENIS = { NASIONAL: "Libur nasional", CUTI_BERSAMA: "Cuti bersama", SEKOLAH: "Libur sekolah" };
const fmt = (t, opsi) => new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", opsi);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Kalender hari libur selain Minggu: ditolak untuk jadwal, presensi, nilai, jurnal; dilewati jadwal berulang. */
export default function HariLiburPage() {
  const akses = useAkses();
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [res, setRes] = useState(null);

  // Respons tahun lama yang datang belakangan tidak boleh menimpa tahun yang sedang dipilih
  const urutan = useRef(0);
  const muat = useCallback(() => {
    const ke = ++urutan.current;
    minta("GET", `/hari-libur?tahun=${tahun}`).then((r) => ke === urutan.current && setRes(r)).catch((e) => Swal.fire("Gagal memuat", e.message, "error"));
  }, [tahun]);
  useEffect(() => { muat(); }, [muat]);

  const perBulan = useMemo(() => {
    const g = new Map();
    (res?.data || []).forEach((h) => {
      const b = h.tanggal.slice(0, 7);
      if (!g.has(b)) g.set(b, []);
      g.get(b).push(h);
    });
    return [...g.entries()];
  }, [res]);
  const perluCek = (res?.data || []).filter((h) => h.perlu_cek).length;
  const daftarTahun = [...new Set([...(res?.tahun || []), new Date().getFullYear(), new Date().getFullYear() + 1, tahun])].sort();

  const form = async (h) => {
    const jenis = res?.jenis || JENIS;
    const r = await Swal.fire({
      title: h ? "Ubah hari libur" : "Tambah hari libur",
      html: `<div class="text-start">
        <label class="form-label small mb-1" for="hlTgl">Tanggal</label><input id="hlTgl" type="date" class="form-control mb-2" value="${esc(h?.tanggal || "")}">
        <label class="form-label small mb-1" for="hlNama">Nama</label><input id="hlNama" class="form-control mb-2" maxlength="120" placeholder="mis. HUT Sekolah" value="${esc(h?.nama || "")}">
        <label class="form-label small mb-1" for="hlJenis">Jenis</label><select id="hlJenis" class="form-select">${Object.entries(jenis).map(([k, l]) => `<option value="${k}"${(h?.jenis || "SEKOLAH") === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>`,
      showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      preConfirm: () => {
        const v = { tanggal: document.getElementById("hlTgl").value, nama: document.getElementById("hlNama").value.trim(), jenis: document.getElementById("hlJenis").value };
        if (!v.tanggal || !v.nama) { Swal.showValidationMessage("Isi tanggal dan nama."); return false; }
        return v;
      },
    });
    if (!r.isConfirmed) return;
    try {
      const x = await minta(h ? "PUT" : "POST", h ? `/hari-libur/${h.id}` : "/hari-libur", r.value);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: x.message, showConfirmButton: false, timer: 2500 });
      const t = Number(r.value.tanggal.slice(0, 4));
      if (t !== tahun) setTahun(t); else muat();
    } catch (e) { Swal.fire("Belum bisa", e.message, "warning"); }
  };
  const hapus = async (h) => {
    if (!(await Swal.fire({ title: `Hapus ${h.nama}?`, text: "Tanggal ini kembali menjadi hari sekolah.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545" })).isConfirmed) return;
    try { await minta("DELETE", `/hari-libur/${h.id}`); muat(); } catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };
  const tandaiCek = async () => {
    if (!(await Swal.fire({ title: `Tandai libur ${tahun} sudah dicek?`, text: "Lakukan setelah mencocokkan daftar ini dengan dokumen SKB 3 Menteri resmi.", icon: "question", showCancelButton: true, confirmButtonText: "Sudah dicek", cancelButtonText: "Batal" })).isConfirmed) return;
    try { const x = await minta("POST", "/hari-libur/tandai-cek", { tahun }); Swal.fire({ toast: true, position: "top-end", icon: "success", title: x.message, showConfirmButton: false, timer: 2500 }); muat(); }
    catch (e) { Swal.fire("Gagal", e.message, "error"); }
  };

  return (
    <div className="container-fluid mt-3 mb-5" style={{ maxWidth: 900 }}>
      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <div className="me-auto">
          <h3 className="fw-bold text-primary mb-1"><i className="bi bi-calendar-x me-2"></i>Hari Libur</h3>
          <p className="text-muted small mb-0">Selain hari Minggu, tanggal di sini tidak bisa dipakai untuk jadwal, presensi, nilai, dan jurnal. Jadwal berulang otomatis melewatinya.</p>
        </div>
        {akses.isPengelola && <button className="btn btn-primary" onClick={() => form(null)}><i className="bi bi-plus-lg me-1"></i>Tambah hari libur</button>}
      </div>

      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Pilih tahun">
          {daftarTahun.map((t) => <button key={t} className={`btn ${t === tahun ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setTahun(t)}>{t}</button>)}
        </div>
        {res && <span className="small text-muted">{res.data.length} tanggal libur</span>}
      </div>

      {perluCek > 0 && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2 py-2 small">
          <i className="bi bi-exclamation-triangle"></i>
          <span className="me-auto">{perluCek} tanggal tahun {tahun} disalin dari ringkasan, belum dicocokkan dengan dokumen SKB 3 Menteri resmi.</span>
          {akses.isPengelola && <button className="btn btn-sm btn-outline-dark" onClick={tandaiCek}>Tandai sudah dicek</button>}
        </div>
      )}

      {!res ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !res.data.length ? <div className="text-center text-muted py-5"><i className="bi bi-calendar-x fs-1 d-block mb-2"></i>Belum ada hari libur untuk tahun {tahun}.{akses.isPengelola && <> Tekan <b>Tambah hari libur</b>.</>}</div>
        : perBulan.map(([bulan, daftar]) => (
          <div key={bulan} className="mb-3">
            <div className="small fw-semibold text-muted text-uppercase mb-1">{fmt(`${bulan}-01`, { month: "long", year: "numeric" })}</div>
            <div className="list-group">
              {daftar.map((h) => (
                <div key={h.id} className="list-group-item d-flex align-items-center gap-2 kartu-libur">
                  <div className="text-center" style={{ width: 52 }}>
                    <div className="fs-5 fw-bold lh-1">{h.tanggal.slice(8)}</div>
                    <div className="small text-muted">{fmt(h.tanggal, { weekday: "short" })}</div>
                  </div>
                  <div className="me-auto min-w-0">
                    <div className="fw-semibold text-truncate">{h.nama}</div>
                    <span className={`badge text-bg-${WARNA[h.jenis]} fw-normal`}>{(res.jenis || JENIS)[h.jenis]}</span>
                    {h.perlu_cek && <span className="badge text-bg-light border fw-normal ms-1">perlu dicek</span>}
                  </div>
                  {akses.isPengelola && <MenuAksi label={`Aksi untuk ${h.nama}`} items={[aksiUbah(() => form(h)), aksiHapus(() => hapus(h))]} />}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
