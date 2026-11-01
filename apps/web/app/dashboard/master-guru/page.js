"use client";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import TableWrapper from "@/components/TableWrapper";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

export default function MasterGuruPage() {
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [ttdPreview, setTtdPreview] = useState(null);
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
  const fetchGuruData = useCallback(async () => {
    const [resTeachers, resSettings] = await Promise.all([
      safeFetch(`${API_URL}/teachers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
    ]);
    setSchoolSettings(resSettings || null);
    return resTeachers.data || [];
  }, []);

  // 2. Definisi Kolom
  const COLUMNS_DEF = [
    {
      title: "ID Guru",
      field: "id_guru",
      width: 120,
      headerHozAlign: "center",
      hozAlign: "center",
    },
    {
      title: "Nama Lengkap",
      field: "nama_guru",
      minWidth: 200,
      widthGrow: 2,
      headerHozAlign: "center",
      formatter: (cell) =>
        `<span class="fw-bold text-dark">${cell.getValue()}</span>`,
    },
    {
      title: "NIP / NIK",
      field: "nip_nik",
      width: 150,
      headerHozAlign: "center",
      hozAlign: "center",
    },
    {
      title: "Tanda Tangan",
      field: "ttd_guru_url",
      width: 150,
      hozAlign: "center",
      headerHozAlign: "center",
      formatter: (cell) =>
        cell.getValue()
          ? `<span class="badge bg-success">Tersedia</span>`
          : `<span class="badge bg-secondary">Kosong</span>`,
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
          handleDelete(cell.getRow().getData().id_guru);
      },
    },
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
  } = useTableLogic(fetchGuruData, COLUMNS_DEF, [
    "nama_guru",
    "nip_nik",
    "id_guru",
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

  // --- FUNGSI EKSPOR ---
  const handleExportExcel = () => {
    const data = getFilteredData().map((row) => ({
      "ID Guru": row.id_guru,
      "Nama Lengkap": row.nama_guru,
      "NIP/NIK": row.nip_nik || "-",
      "Status TTD": row.ttd_guru_url ? "Tersedia" : "Kosong",
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Guru");
    XLSX.writeFile(wb, `Data_Guru_${new Date().getTime()}.xlsx`);
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
      "ID Guru": row.id_guru,
      "Nama Lengkap": row.nama_guru,
      "NIP/NIK": row.nip_nik || "-",
      "Status TTD": row.ttd_guru_url ? "Tersedia" : "Kosong",
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data_Guru_${new Date().getTime()}.csv`;
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
      "ID Guru": row.id_guru,
      "Nama Lengkap": row.nama_guru,
      "NIP / NIK": row.nip_nik || "-",
      "Status TTD": row.ttd_guru_url ? "Tersedia" : "Kosong",
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
      "Laporan Data Guru",
      schoolSettings,
      getBase64ImageFromUrl,
    );
    Swal.close();
  };

  // --- FUNGSI CRUD ---
  const openModal = (teacher = null) => {
    setFormData(teacher || {});
    setTtdPreview(
      teacher?.ttd_guru_url
        ? `http://localhost:8000${teacher.ttd_guru_url}`
        : null,
    );
    setShowModal(true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024)
      return Swal.fire("File Terlalu Besar", "Maksimal 2MB", "warning");
    const reader = new FileReader();
    reader.onload = (event) => {
      setTtdPreview(event.target.result);
      setFormData({ ...formData, ttd_guru_base64: event.target.result });
    };
    reader.readAsDataURL(file);
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
    const method = formData.id_guru ? "PUT" : "POST";
    const url = formData.id_guru
      ? `${API_URL}/teachers/${formData.id_guru}`
      : `${API_URL}/teachers`;
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
      title: "Hapus Guru?",
      text: "Data ini akan dihapus permanen.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Ya, Hapus!",
    });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/teachers/${id}`, {
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
        title="Master Data Guru"
        icon="bi-person-video3"
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
                  <i className="bi bi-person-badge me-2"></i>
                  {formData.id_guru ? "Edit Data Guru" : "Tambah Guru Baru"}
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
                      Nama Lengkap *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={formData.nama_guru || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nama_guru: e.target.value })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      NIP / NIK
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.nip_nik || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, nip_nik: e.target.value })
                      }
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      No. WhatsApp
                    </label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="08xxxxxxxxxx"
                      maxLength={20}
                      value={formData.no_wa || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, no_wa: e.target.value })
                      }
                    />
                    <div className="form-text">Dipakai untuk pengingat jadwal mengajar.</div>
                  </div>
                  <div className="mb-3 border p-3 rounded bg-light">
                    <label className="form-label fw-bold small text-muted d-block">
                      Tanda Tangan (PNG)
                    </label>
                    {ttdPreview && (
                      <img
                        src={ttdPreview}
                        alt="TTD"
                        className="d-block mb-2 border bg-white"
                        style={{ maxHeight: "80px" }}
                      />
                    )}
                    <input
                      type="file"
                      className="form-control form-control-sm"
                      accept="image/png"
                      onChange={handleFileChange}
                    />
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
