"use client";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import TableWrapper from "@/components/TableWrapper";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

const MATRIX_LABELS = [
  { key: "mat_S", label: "Skill (S)", color: "primary" },
  { key: "mat_T", label: "Teori (T)", color: "success" },
  { key: "mat_N", label: "Nalar (N)", color: "info" },
  { key: "mat_K", label: "Karakter (K)", color: "warning" },
  { key: "mat_M", label: "Minat (M)", color: "danger" },
];

// Helper untuk badge matrix di tabel
const getMatrixBadges = (data) => {
  const toPercent = (v) => Math.round((parseFloat(v) || 0) * 100);
  return `<div class="d-flex flex-wrap gap-1 justify-content-center">
    <span class="badge bg-primary" title="Skill">${toPercent(data.mat_S)}%S</span>
    <span class="badge bg-success" title="Teori">${toPercent(data.mat_T)}%T</span>
    <span class="badge bg-info text-dark" title="Nalar">${toPercent(data.mat_N)}%N</span>
    <span class="badge bg-warning text-dark" title="Karakter">${toPercent(data.mat_K)}%K</span>
    <span class="badge bg-danger" title="Minat">${toPercent(data.mat_M)}%M</span>
  </div>`;
};

export default function MasterMBKPage() {
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

  const fetchMBKData = useCallback(async () => {
    const [resMBK, resSettings] = await Promise.all([
      safeFetch(`${API_URL}/mbk`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
    ]);
    setSchoolSettings(resSettings || null);
    return resMBK.data || [];
  }, []);

  const COLUMNS_DEF = [
    {
      title: "ID",
      field: "id_jenis",
      width: 120,
      headerHozAlign: "center",
      hozAlign: "center",
      formatter: (cell) =>
        `<span class="text-muted small">${cell.getValue()}</span>`,
    },
    {
      title: "Kategori Penilaian",
      field: "kategori_penilaian",
      minWidth: 160,
      widthGrow: 2,
      headerHozAlign: "center",
      formatter: (cell) =>
        `<strong class="text-dark">${cell.getValue()}</strong>`,
    },
    {
      title: "Keterangan",
      field: "keterangan",
      minWidth: 150,
      widthGrow: 1,
      headerHozAlign: "center",
      formatter: (cell) =>
        `<span class="text-muted">${cell.getValue() || "-"}</span>`,
    },
    {
      title: "Matriks STNKM",
      field: "matrix_display",
      width: 200,
      headerHozAlign: "center",
      hozAlign: "center",
      formatter: (cell) => getMatrixBadges(cell.getRow().getData()),
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
          handleDelete(cell.getRow().getData().id_jenis);
      },
    },
  ];

  const {
    tableRef,
    loading,
    searchQuery,
    setSearchQuery,
    visibleColumns,
    toggleColumn,
    getFilteredData,
    refresh,
  } = useTableLogic(fetchMBKData, COLUMNS_DEF, [
    "kategori_penilaian",
    "keterangan",
  ]);

  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const fileName = imageUrl.split("/").pop();
      const response = await fetch(
        `http://localhost:8000/api/signature/${fileName}`,
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

  const handleExportExcel = () => {
    const data = getFilteredData().map((row) => ({
      Kategori: row.kategori_penilaian,
      Keterangan: row.keterangan || "-",
      "Matriks S": row.mat_S,
      "Matriks T": row.mat_T,
      "Matriks N": row.mat_N,
      "Matriks K": row.mat_K,
      "Matriks M": row.mat_M,
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MBK");
    XLSX.writeFile(wb, `Data_MBK_${new Date().getTime()}.xlsx`);
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
      Kategori: row.kategori_penilaian,
      Keterangan: row.keterangan || "-",
      "Matriks S": row.mat_S,
      "Matriks T": row.mat_T,
      "Matriks N": row.mat_N,
      "Matriks K": row.mat_K,
      "Matriks M": row.mat_M,
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data_MBK_${new Date().getTime()}.csv`;
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
      "Kategori Penilaian": row.kategori_penilaian,
      Keterangan: row.keterangan || "-",
      S: row.mat_S,
      T: row.mat_T,
      N: row.mat_N,
      K: row.mat_K,
      M: row.mat_M,
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
      "Laporan Data MBK (Jenis Penilaian)",
      schoolSettings,
      getBase64ImageFromUrl,
    );
    Swal.close();
  };

  const openModal = (mbk = null) => {
    const defaults = { mat_S: 1, mat_T: 1, mat_N: 1, mat_K: 1, mat_M: 1 };
    const data = mbk ? { ...defaults, ...mbk } : defaults;
    setFormData({
      ...data,
      mat_S: parseFloat(data.mat_S) || 1,
      mat_T: parseFloat(data.mat_T) || 1,
      mat_N: parseFloat(data.mat_N) || 1,
      mat_K: parseFloat(data.mat_K) || 1,
      mat_M: parseFloat(data.mat_M) || 1,
    });
    setShowModal(true);
  };

  const handleSliderChange = (key, percentValue) => {
    setFormData({ ...formData, [key]: parseInt(percentValue) / 100 });
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
    const method = formData.id_jenis ? "PUT" : "POST";
    const url = formData.id_jenis
      ? `${API_URL}/mbk/${formData.id_jenis}`
      : `${API_URL}/mbk`;
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
      refresh();
    } catch (err) {
      Swal.fire("Gagal", err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Hapus MBK?",
      text: "Data ini akan dihapus permanen.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Ya, Hapus!",
    });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/mbk/${id}`, {
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
        title="Master MBK (Jenis Penilaian)"
        icon="bi-list-check"
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
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-list-check me-2"></i>
                  {formData.id_jenis ? "Edit MBK" : "Tambah MBK Baru"}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body p-4 bg-white">
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label fw-bold small text-muted">
                        Kategori Penilaian *
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        value={formData.kategori_penilaian || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            kategori_penilaian: e.target.value,
                          })
                        }
                        placeholder="Contoh: Proses/Harian"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold small text-muted">
                        Keterangan
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.keterangan || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            keterangan: e.target.value,
                          })
                        }
                        placeholder="Deskripsi singkat"
                      />
                    </div>
                  </div>

                  <div className="border-top pt-3">
                    <h6 className="fw-bold text-secondary mb-3">
                      <i className="bi bi-sliders me-2"></i>Matriks Bobot STNKM
                    </h6>
                    <p className="small text-muted mb-3">
                      Bobot 0-100%. Nilai akhir akan dikalikan dengan matriks
                      ini saat kalkulasi otomatis.
                    </p>

                    {MATRIX_LABELS.map((m) => (
                      <div key={m.key} className="mb-3">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <label
                            className={`fw-bold small text-${m.color} mb-0`}
                          >
                            {m.label}
                          </label>
                          <span className={`badge bg-${m.color}`}>
                            {Math.round((formData[m.key] || 0) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          className="form-range"
                          min="0"
                          max="100"
                          step="5"
                          value={Math.round((formData[m.key] || 0) * 100)}
                          onChange={(e) =>
                            handleSliderChange(m.key, e.target.value)
                          }
                        />
                      </div>
                    ))}
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
