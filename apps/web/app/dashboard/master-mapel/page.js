"use client";
import { useState, useEffect, useCallback } from "react"; // Tambahkan useCallback
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import TableWrapper from "@/components/TableWrapper";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { API_URL } from "@/app/lib/config";

// Pindahkan API_URL dan getToken ke luar komponen agar referensinya stabil
const getToken = () => localStorage.getItem("token");

export default function MasterMapelPage() {
  const [teachers, setTeachers] = useState([]);
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // 1. Bungkus Fungsi Fetch dengan useCallback agar stabil
  const fetchMapelData = useCallback(async () => {
    const [resSubjects, resTeachers, resSettings] = await Promise.all([
      safeFetch(`${API_URL}/subjects`, {
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
    return resSubjects.data || [];
  }, []); // Dependency array kosong

  // 2. Definisi Kolom Tabulator
  const COLUMNS_DEF = [
    {
      title: "Kode Mapel",
      field: "id_mapel",
      width: 120,
      headerHozAlign: "center",
      hozAlign: "center",
    },
    {
      title: "Nama Mata Pelajaran",
      field: "nama_mapel",
      minWidth: 200,
      widthGrow: 2,
      headerHozAlign: "center",
      formatter: (cell) =>
        `<strong class="text-dark">${cell.getValue()}</strong>`,
    },
    {
      title: "Kelompok",
      field: "kelompok",
      width: 150,
      headerHozAlign: "center",
      hozAlign: "center",
      formatter: (cell) =>
        cell.getValue()
          ? `<span class="badge bg-light text-dark border">${cell.getValue()}</span>`
          : "-",
    },
    {
      title: "KKM",
      field: "kkm",
      width: 90,
      headerHozAlign: "center",
      hozAlign: "center",
      formatter: (cell) =>
        `<span class="badge text-bg-secondary">${cell.getValue() ?? 75}</span>`,
    },
    {
      title: "Guru Pengampu",
      field: "guru.nama_guru",
      width: 250,
      headerHozAlign: "center",
      formatter: (cell) =>
        cell.getValue() ||
        `<span class="text-muted fst-italic">Belum diatur</span>`,
    },
    {
      title: "Aksi",
      field: "action",
      width: 100,
      hozAlign: "center",
      headerHozAlign: "center",
      formatter: () =>
        `<button class="btn btn-sm btn-primary me-1 btn-edit"><i class="bi bi-pencil-square"></i></button><button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>`,
      cellClick: (e, cell) => {
        if (e.target.closest(".btn-edit")) openModal(cell.getRow().getData());
        if (e.target.closest(".btn-delete"))
          handleDelete(cell.getRow().getData().id_mapel);
      },
    },
  ];

  // 3. Panggil Custom Hook
  const {
    tableRef,
    loading,
    searchQuery,
    setSearchQuery,
    visibleColumns,
    toggleColumn,
    getFilteredData,
    refresh,
  } = useTableLogic(fetchMapelData, COLUMNS_DEF, [
    "nama_mapel",
    "id_mapel",
    "guru.nama_guru",
  ]);

  // Helper Konversi Gambar
  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const fileName = imageUrl.split("/").pop();
      const response = await fetch(
        `${API_URL}/signature/${fileName}`,
      );
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
      Kode: row.id_mapel,
      "Nama Mapel": row.nama_mapel,
      Kelompok: row.kelompok || "-",
      KKM: row.kkm ?? 75,
      Guru: row.guru?.nama_guru || "-",
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapel");
    XLSX.writeFile(wb, `Data_Mapel_${new Date().getTime()}.xlsx`);
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
      Kode: row.id_mapel,
      "Nama Mapel": row.nama_mapel,
      Kelompok: row.kelompok || "-",
      KKM: row.kkm ?? 75,
      Guru: row.guru?.nama_guru || "-",
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data_Mapel_${new Date().getTime()}.csv`;
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
      Kode: row.id_mapel,
      "Nama Mata Pelajaran": row.nama_mapel,
      Kelompok: row.kelompok || "-",
      KKM: row.kkm ?? 75,
      "Guru Pengampu": row.guru?.nama_guru || "-",
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
      "Laporan Data Mata Pelajaran",
      schoolSettings,
      getBase64ImageFromUrl,
    );
    Swal.close();
  };

  // --- FUNGSI CRUD ---
  const openModal = (subj = null) => {
    setFormData(subj || {});
    setShowModal(true);
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
    const method = formData.id_mapel ? "PUT" : "POST";
    const url = formData.id_mapel
      ? `${API_URL}/subjects/${formData.id_mapel}`
      : `${API_URL}/subjects`;
    try {
      await safeFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formData),
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
      refresh(); // Refresh data di hook
    } catch (err) {
      Swal.fire("Gagal", err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Hapus Mapel?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Ya, Hapus!",
    });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/subjects/${id}`, {
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
        title="Master Mata Pelajaran"
        icon="bi-book-half"
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
                  <i className="bi bi-book me-2"></i>
                  {formData.id_mapel ? "Edit Mapel" : "Tambah Mapel"}
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
                      Nama Mata Pelajaran *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={formData.nama_mapel || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nama_mapel: e.target.value })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      Kelompok
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.kelompok || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, kelompok: e.target.value })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      KKM (Kriteria Ketuntasan Minimal)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="form-control"
                      placeholder="75"
                      value={formData.kkm ?? ""}
                      onChange={(e) =>
                        setFormData({ ...formData, kkm: e.target.value })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      Guru Pengampu
                    </label>
                    <select
                      className="form-select"
                      value={formData.id_guru || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, id_guru: e.target.value })
                      }
                    >
                      <option value="">-- Pilih Guru --</option>
                      {teachers.map((t) => (
                        <option key={t.id_guru} value={t.id_guru}>
                          {t.nama_guru}
                        </option>
                      ))}
                    </select>
                  </div>
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
