"use client";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import TableWrapper from "@/components/TableWrapper";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { API_URL } from "@/app/lib/config";

const getToken = () => localStorage.getItem("token");

export default function MasterPeriodePage() {
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeFetch = async (url, options = {}) => {
    const res = await fetch(url, options);
    const textData = await res.text();
    let data = {};
    try { data = textData ? JSON.parse(textData) : {}; } 
    catch (e) { throw new Error(`Respon server tidak valid.`); }
    if (!res.ok) throw new Error(data.message || data.error || "Terjadi kesalahan pada server");
    return data;
  };

  const fetchPeriodeData = useCallback(async () => {
    const [resPeriode, resSettings] = await Promise.all([
      safeFetch(`${API_URL}/periodes`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      safeFetch(`${API_URL}/settings`, { headers: { Authorization: `Bearer ${getToken()}` } }),
    ]);
    setSchoolSettings(resSettings || null);
    return resPeriode.data || [];
  }, []);

  const COLUMNS_DEF = [
    { title: "ID Periode", field: "id_periode", width: 130, headerHozAlign: "center", hozAlign: "center", formatter: (cell) => `<span class="text-muted small">${cell.getValue()}</span>` },
    { title: "Tahun Ajaran", field: "tahun_ajaran", minWidth: 150, widthGrow: 2, headerHozAlign: "center", formatter: (cell) => `<strong class="text-dark">${cell.getValue()}</strong>` },
    { title: "Semester", field: "semester", width: 120, headerHozAlign: "center", hozAlign: "center", formatter: (cell) => `<span class="badge bg-info text-dark">${cell.getValue()}</span>` },
    { 
      title: "Status", field: "status_aktif", width: 120, headerHozAlign: "center", hozAlign: "center",
      formatter: (cell) => {
        const val = cell.getValue();
        return val === 'AKTIF' 
          ? `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>AKTIF</span>` 
          : `<span class="badge bg-secondary">TUTUP</span>`;
      }
    },
    {
      title: "Aksi", field: "action", width: 100, hozAlign: "center", headerHozAlign: "center",
      formatter: () => `<button class="btn btn-sm btn-primary me-1 btn-edit"><i class="bi bi-pencil-square"></i></button><button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>`,
      cellClick: (e, cell) => {
        if (e.target.closest(".btn-edit")) openModal(cell.getRow().getData());
        if (e.target.closest(".btn-delete")) handleDelete(cell.getRow().getData().id_periode);
      },
    },
  ];

  const { tableRef, loading, searchQuery, setSearchQuery, visibleColumns, toggleColumn, getFilteredData, refresh } = 
    useTableLogic(fetchPeriodeData, COLUMNS_DEF, ["tahun_ajaran", "semester", "status_aktif", "id_periode"]);

  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const fileName = imageUrl.split("/").pop();
      const response = await fetch(`${API_URL}/signature/${fileName}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); });
    } catch (error) { return null; }
  };

  const handleExportExcel = () => {
    const data = getFilteredData().map(row => ({ "ID": row.id_periode, "Tahun Ajaran": row.tahun_ajaran, "Semester": row.semester, "Status": row.status_aktif }));
    if (data.length === 0) return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Periode");
    XLSX.writeFile(wb, `Data_Periode_${new Date().getTime()}.xlsx`);
    Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Excel diunduh", showConfirmButton: false, timer: 2000 });
  };

  const handleExportCSV = () => {
    const data = getFilteredData().map(row => ({ "ID": row.id_periode, "Tahun Ajaran": row.tahun_ajaran, "Semester": row.semester, "Status": row.status_aktif }));
    if (data.length === 0) return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `Data_Periode_${new Date().getTime()}.csv`; link.click();
    Swal.fire({ toast: true, position: "top-end", icon: "success", title: "CSV diunduh", showConfirmButton: false, timer: 2000 });
  };

  const handleExportPDF = async () => {
    const data = getFilteredData().map(row => ({ "Tahun Ajaran": row.tahun_ajaran, "Semester": row.semester, "Status": row.status_aktif }));
    if (data.length === 0) return Swal.fire("Kosong", "Tidak ada data", "warning");
    Swal.fire({ title: "Menyiapkan PDF...", allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    await generateProfessionalPDF(data, "Laporan Data Semester", schoolSettings, getBase64ImageFromUrl);
    Swal.close();
  };

  const openModal = (periode = null) => {
    setFormData(periode || { semester: 'Ganjil', status_aktif: 'TUTUP' });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({ title: "Menyimpan...", allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const method = formData.id_periode ? "PUT" : "POST";
    const url = formData.id_periode ? `${API_URL}/periodes/${formData.id_periode}` : `${API_URL}/periodes`;
    try {
      await safeFetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(formData) });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Data Disimpan!", showConfirmButton: false, timer: 2000 });
      setShowModal(false); refresh();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); } 
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({ title: "Hapus Semester?", text: "Data ini akan dihapus permanen.", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Ya, Hapus!" });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/periodes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Dihapus!", showConfirmButton: false, timer: 2000 });
        refresh();
      } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    }
  };

  return (
    <>
      <TableWrapper
        title="Semester"
        icon="bi-calendar-week"
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
        <div className="modal fade show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold"><i className="bi bi-calendar-week me-2"></i>{formData.id_periode ? "Edit Semester" : "Tambah Semester Baru"}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body p-4 bg-white">
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">Tahun Ajaran *</label>
                    <input type="text" className="form-control" required value={formData.tahun_ajaran || ""} onChange={(e) => setFormData({ ...formData, tahun_ajaran: e.target.value })} placeholder="Contoh: 2026/2027" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">Semester *</label>
                    <select className="form-select" required value={formData.semester || "Ganjil"} onChange={(e) => setFormData({ ...formData, semester: e.target.value })}>
                      <option value="Ganjil">Ganjil</option>
                      <option value="Genap">Genap</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">Status *</label>
                    <select className="form-select" required value={formData.status_aktif || "TUTUP"} onChange={(e) => setFormData({ ...formData, status_aktif: e.target.value })}>
                      <option value="TUTUP">TUTUP</option>
                      <option value="AKTIF">AKTIF</option>
                    </select>
                    <small className="text-muted">Hanya boleh ada 1 periode AKTIF. Periode lain akan otomatis menjadi TUTUP.</small>
                  </div>
                </div>
                <div className="modal-footer bg-white border-top">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                  <button type="submit" className="btn btn-success fw-bold px-4" disabled={isSubmitting}>{isSubmitting ? "Menyimpan..." : "Simpan"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}