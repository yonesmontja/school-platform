"use client";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import TableWrapper from "@/components/TableWrapper";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { API_URL } from "@/app/lib/config";
import { aksiHapus, aksiUbah, kolomAksi } from "@/components/dashboard/menuAksi";
import { aksesDari, bacaUser } from "@/app/lib/akses";
import { ambilTtd } from "@/app/lib/ttd";

const getToken = () => localStorage.getItem("token");

export default function MasterKelasPage() {
  const [teachers, setTeachers] = useState([]);
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [periodeAktif, setPeriodeAktif] = useState(null);

  const safeFetch = async (url, options = {}) => {
    const res = await fetch(url, options);
    const textData = await res.text();
    let data = {};
    try {
      data = textData ? JSON.parse(textData) : {};
    } catch (e) {
      throw new Error(`Respon server tidak valid.`);
    }
    if (!res.ok)
      throw new Error(
        data.message || data.error || "Terjadi kesalahan pada server",
      );
    return data;
  };

  // 1. Bungkus Fungsi Fetch dengan useCallback
  const fetchKelasData = useCallback(async () => {
    const [resClasses, resTeachers, resSettings] = await Promise.all([
      safeFetch(`${API_URL}/classes`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/teachers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
    ]);
    setTeachers(resTeachers.data || []);
    setSchoolSettings(resSettings || null);
    setPeriodeAktif(resClasses.periode_aktif || null);
    return resClasses.data || [];
  }, []);

  // 2. Definisi Kolom
  const COLUMNS_DEF = [
    {
      title: "ID Kelas",
      field: "id_kelas",
      width: 120,
      headerHozAlign: "center",
      hozAlign: "center",
    },
    {
      title: "Nama Kelas",
      field: "nama_kelas",
      minWidth: 200,
      widthGrow: 2,
      headerHozAlign: "center",
      formatter: (cell) => `<strong>${cell.getValue()}</strong>`,
    },
    {
      title: "Tingkat",
      field: "tingkat",
      width: 100,
      hozAlign: "center",
      headerHozAlign: "center",
      formatter: (cell) => cell.getValue() || `<span class="text-muted">–</span>`,
    },
    {
      title: "Wali Kelas",
      field: "wali_kelas.nama_guru",
      width: 250,
      headerHozAlign: "center",
      formatter: (cell) =>
        cell.getValue() ||
        `<span class="text-muted fst-italic">Belum diatur</span>`,
    },
    {
      title: "Semester Aktif",
      field: "aktif_semester",
      width: 170,
      headerHozAlign: "center",
      hozAlign: "center",
      headerTooltip: "Rombel aktif di semester yang sedang berjalan. Nonaktif hanya menyembunyikannya dari pilihan dan peta kerja guru; data lama tetap.",
      formatter: (cell) => {
        const aktif = cell.getValue() !== false;
        const bisa = aksesDari(bacaUser()).isAdmin;
        return `<div class="d-inline-flex align-items-center gap-2" data-aktif-kelas="${cell.getRow().getData().id_kelas}">
          <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" ${aktif ? "checked" : ""} ${bisa ? "" : "disabled"}
            aria-label="Aktif di semester ini" style="cursor:${bisa ? "pointer" : "default"}"></div>
          <span class="badge ${aktif ? "bg-success-subtle text-success-emphasis" : "bg-secondary-subtle text-secondary-emphasis"} border">${aktif ? "Aktif" : "Tidak aktif"}</span>
        </div>`;
      },
      cellClick: (e, cell) => {
        if (!aksesDari(bacaUser()).isAdmin) return;
        e.preventDefault();
        ubahAktif(cell.getRow().getData(), cell.getValue() === false);
      },
    },
    kolomAksi((r) => [aksiUbah(() => openModal(r)), aksiHapus(() => handleDelete(r.id_kelas))]),
  ];

  // 3. Gunakan Custom Hook
  const {
    tableRef,
    loading,
    searchQuery,
    setSearchQuery,
    visibleColumns,
    toggleColumn,
    getFilteredData,
    refresh,
  } = useTableLogic(fetchKelasData, COLUMNS_DEF, [
    "nama_kelas",
    "id_kelas",
    "wali_kelas.nama_guru",
  ]);

  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const fileName = imageUrl.split("/").pop();
      const response = await ambilTtd(fileName);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      return null;
    }
  };

  // --- FUNGSI EKSPOR ---
  const handleExportExcel = () => {
    const data = getFilteredData().map((row) => ({
      "ID Kelas": row.id_kelas,
      "Nama Kelas": row.nama_kelas,
      "Wali Kelas": row.wali_kelas?.nama_guru || "Belum diatur",
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kelas");
    XLSX.writeFile(wb, `Data_Kelas_${new Date().getTime()}.xlsx`);
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Excel diunduh",
      showConfirmButton: false,
      timer: 2000,
    });
  };

  const handleExportCSV = () => {
    const data = getFilteredData().map((row) => ({
      "ID Kelas": row.id_kelas,
      "Nama Kelas": row.nama_kelas,
      "Wali Kelas": row.wali_kelas?.nama_guru || "Belum diatur",
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data_Kelas_${new Date().getTime()}.csv`;
    link.click();
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "CSV diunduh",
      showConfirmButton: false,
      timer: 2000,
    });
  };

  const handleExportPDF = async () => {
    const data = getFilteredData().map((row) => ({
      "ID Kelas": row.id_kelas,
      "Nama Kelas": row.nama_kelas,
      "Wali Kelas": row.wali_kelas?.nama_guru || "Belum diatur",
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    Swal.fire({
      title: "Menyiapkan PDF...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
    await generateProfessionalPDF(
      data,
      "Laporan Data Kelas",
      schoolSettings,
      getBase64ImageFromUrl,
    );
    Swal.close();
  };

  // --- FUNGSI CRUD ---
  const openModal = (cls = null) => {
    // Relasi wali kelas ikut terkirim sebagai objek; form cukup menyimpan id gurunya
    setFormData(cls ? { ...cls, wali_kelas: cls.wali_kelas?.id_guru ?? cls.wali_kelas ?? "", aktif_semester: cls.aktif_semester !== false } : { aktif_semester: true });
    setShowModal(true);
  };

  /** Aktif/nonaktifkan rombel untuk semester aktif. Nonaktif tidak menghapus apa pun. */
  const ubahAktif = async (kelas, aktif) => {
    const semester = periodeAktif?.nama || "semester aktif";
    const ok = await Swal.fire({
      title: aktif ? `Aktifkan ${kelas.nama_kelas}?` : `Nonaktifkan ${kelas.nama_kelas}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: aktif ? "Ya, aktifkan" : "Ya, nonaktifkan",
      cancelButtonText: "Batal",
      html: aktif
        ? `<div class="text-start small">Rombel ini muncul lagi di pilihan kelas guru pengampu, peta kerja, dan pengingat untuk <b>${semester}</b>.</div>`
        : `<div class="text-start small">Untuk <b>${semester}</b>, rombel ini tidak muncul di pilihan kelas guru dan tidak dihitung di peta kerja maupun pengingat presensi.<br>Data lama (siswa, nilai, jadwal, rapor) <b>tidak diubah</b>.</div>`,
    });
    if (!ok.isConfirmed) return;
    try {
      const r = await safeFetch(`${API_URL}/classes/${kelas.id_kelas}/aktif-semester`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ aktif }),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: r.message, showConfirmButton: false, timer: 3000 });
      refresh();
    } catch (err) {
      Swal.fire("Gagal", err.message, "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({
      title: "Menyimpan...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
    const method = formData.id_kelas ? "PUT" : "POST";
    const url = formData.id_kelas
      ? `${API_URL}/classes/${formData.id_kelas}`
      : `${API_URL}/classes`;
    try {
      await safeFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        // aktif_semester hanya dikirim bila ada semester aktif (disimpan per semester di server)
        body: JSON.stringify(periodeAktif ? formData : { ...formData, aktif_semester: undefined }),
      });
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Data Disimpan!",
        showConfirmButton: false,
        timer: 2000,
      });
      setShowModal(false);
      refresh();
    } catch (err) {
      Swal.fire("Gagal", err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Hapus Kelas?",
      text: "Data ini akan dihapus permanen.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Ya, Hapus!",
    });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/classes/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Dihapus!",
          showConfirmButton: false,
          timer: 2000,
        });
        refresh();
      } catch (err) {
        Swal.fire("Gagal", err.message, "error");
      }
    }
  };

  return (
    <>
      <TableWrapper
        title="Master Rombongan Belajar (Kelas)"
        icon="bi-door-open-fill"
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        tableRef={tableRef}
        columns={COLUMNS_DEF}
        visibleColumns={visibleColumns}
        toggleColumn={toggleColumn}
        onAdd={() => openModal()}
        onExportExcel={handleExportExcel}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
      />

      {showModal && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-door-open me-2"></i>
                  {formData.id_kelas ? "Edit Data Kelas" : "Tambah Kelas Baru"}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body p-4 bg-white">
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      Nama Kelas *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={formData.nama_kelas || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nama_kelas: e.target.value })
                      }
                      placeholder="Contoh: Kelas 1A"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted" htmlFor="kelasTingkat">
                      Tingkat
                    </label>
                    <select
                      id="kelasTingkat"
                      className="form-select"
                      value={formData.tingkat || ""}
                      onChange={(e) => setFormData({ ...formData, tingkat: e.target.value })}
                    >
                      <option value="">Otomatis dari nama kelas</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((t) => (
                        <option key={t} value={t}>Tingkat {t}</option>
                      ))}
                    </select>
                    <div className="form-text">Dipakai untuk kenaikan kelas. Rombel 2A, 2B, dan 2C sama-sama tingkat 2.</div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      Wali Kelas
                    </label>
                    <select
                      className="form-select"
                      value={formData.wali_kelas || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, wali_kelas: e.target.value })
                      }
                    >
                      <option value="">-- Pilih Wali Kelas --</option>
                      {teachers.map((t) => (
                        <option key={t.id_guru} value={t.id_guru}>
                          {t.nama_guru}
                        </option>
                      ))}
                    </select>
                  </div>
                  {periodeAktif && (
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="kelasAktifSemester"
                        checked={formData.aktif_semester !== false}
                        onChange={(e) => setFormData({ ...formData, aktif_semester: e.target.checked })}
                      />
                      <label className="form-check-label small" htmlFor="kelasAktifSemester">
                        Aktif di semester {periodeAktif.nama}
                      </label>
                      <div className="form-text">
                        Nonaktif: rombel disembunyikan dari pilihan kelas guru, peta kerja, dan pengingat semester ini. Data lama tidak berubah.
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer bg-white border-top">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowModal(false)}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn-success fw-bold px-4"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
