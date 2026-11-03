"use client";
import { useState } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders, useAkses } from "@/app/lib/akses";

/**
 * Daftar Indikator Ketercapaian TP (IKTP) di dalam form Materi.
 * Perubahan disimpan bersama materi; hanya penghapusan indikator tersimpan yang langsung ke server
 * (khusus admin, dan ditolak server bila indikator sudah dipakai menilai).
 * Item: { id_indikator?, deskripsi, aktif }
 */
export default function DaftarIndikator({ daftar, onChange }) {
  const { isAdmin } = useAkses();
  const [baru, setBaru] = useState("");

  const ubahItem = (i, patch) => onChange(daftar.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const geser = (i, arah) => {
    const j = i + arah;
    if (j < 0 || j >= daftar.length) return;
    const salin = [...daftar];
    [salin[i], salin[j]] = [salin[j], salin[i]];
    onChange(salin);
  };
  const tambah = () => {
    const teks = baru.trim();
    if (!teks) return;
    onChange([...daftar, { deskripsi: teks, aktif: true }]);
    setBaru("");
  };

  const hapus = async (i) => {
    const item = daftar[i];
    if (!item.id_indikator) return onChange(daftar.filter((_, j) => j !== i));

    const ok = await Swal.fire({
      title: "Hapus indikator?", text: item.deskripsi, icon: "warning",
      showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Ya, hapus", cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    const res = await fetch(`${API_URL}/indikator/${item.id_indikator}`, { method: "DELETE", headers: authHeaders(false) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return Swal.fire("Tidak dapat dihapus", json.message || "Terjadi kesalahan pada server", "warning");
    onChange(daftar.filter((_, j) => j !== i));
  };

  return (
    <div className="border-top pt-3 mb-3">
      <h6 className="fw-bold text-secondary mb-1">
        <i className="bi bi-list-check me-2"></i>Indikator Ketercapaian TP (IKTP)
      </h6>
      <p className="small text-muted mb-2">
        Rincian kemampuan yang menandai TP tercapai. Dipilih saat menilai; satu sesi penilaian bisa memakai beberapa indikator.
        Indikator yang sudah dipakai menilai cukup dinonaktifkan.
      </p>

      {daftar.length === 0 && <div className="small text-muted fst-italic mb-2">Belum ada indikator.</div>}

      <ol className="list-unstyled mb-2 d-flex flex-column gap-2">
        {daftar.map((it, i) => (
          <li key={it.id_indikator || `baru-${i}`} className={`d-flex gap-2 align-items-start${it.aktif === false ? " opacity-50" : ""}`}>
            <span className="badge text-bg-light border mt-2" style={{ minWidth: 28 }}>{i + 1}</span>
            <textarea
              className="form-control form-control-sm"
              rows={1}
              value={it.deskripsi}
              onChange={(e) => ubahItem(i, { deskripsi: e.target.value })}
              aria-label={`Indikator ${i + 1}`}
            />
            <div className="btn-group btn-group-sm flex-shrink-0">
              <button type="button" className="btn btn-outline-secondary" onClick={() => geser(i, -1)} disabled={i === 0} title="Naikkan"><i className="bi bi-arrow-up"></i></button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => geser(i, 1)} disabled={i === daftar.length - 1} title="Turunkan"><i className="bi bi-arrow-down"></i></button>
              {it.id_indikator && (
                <button type="button" className={`btn ${it.aktif === false ? "btn-outline-success" : "btn-outline-warning"}`}
                  onClick={() => ubahItem(i, { aktif: it.aktif === false })}
                  title={it.aktif === false ? "Aktifkan lagi" : "Nonaktifkan (tidak muncul saat menilai)"}>
                  <i className={`bi ${it.aktif === false ? "bi-eye" : "bi-eye-slash"}`}></i>
                </button>
              )}
              {(!it.id_indikator || isAdmin) && (
                <button type="button" className="btn btn-outline-danger" onClick={() => hapus(i)} title="Hapus"><i className="bi bi-trash"></i></button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="input-group input-group-sm">
        <input
          type="text"
          className="form-control"
          placeholder="Tulis indikator baru, lalu tekan Enter atau Tambah"
          value={baru}
          onChange={(e) => setBaru(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tambah(); } }}
        />
        <button type="button" className="btn btn-outline-primary" onClick={tambah} disabled={!baru.trim()}>
          <i className="bi bi-plus-lg me-1"></i>Tambah
        </button>
      </div>
    </div>
  );
}
