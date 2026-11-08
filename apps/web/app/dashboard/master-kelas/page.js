"use client";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import TableWrapper from "@/components/TableWrapper";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { API_URL } from "@/app/lib/config";
import { aksiHapus, aksiUbah, kolomAksi } from "@/components/dashboard/menuAksi";

const getToken = () => localStorage.getItem("token");

export default function MasterKelasPage() {
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
      title: "Wali Kelas",
      field: "wali_kelas.nama_guru",
      width: 250,
      headerHozAlign: "center",
      formatter: (cell) =>
        cell.getValue() ||
        `<span class="text-muted fst-italic">Belum diatur</span>`,
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
    setFormData(cls || {});
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
