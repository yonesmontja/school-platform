"use client";
import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import TableWrapper from "@/components/TableWrapper";
import { useTableLogic } from "@/hooks/useTableLogic";
import { generateProfessionalPDF } from "@/utils/pdfExport";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

export default function MasterKategoriPage() {
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

  const fetchKategoriData = useCallback(async () => {
    const [resKategori, resSettings] = await Promise.all([
      safeFetch(`${API_URL}/kategori-penilaian`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      safeFetch(`${API_URL}/settings`, { headers: { Authorization: `Bearer ${getToken()}` } }),
    ]);
    setSchoolSettings(resSettings || null);
    return resKategori.data || [];
  }, []);

  const COLUMNS_DEF = [
    { title: "ID Kategori", field: "id_kategori", width: 150, headerHozAlign: "center", hozAlign: "center", formatter: (cell) => `<span class="text-muted small">${cell.getValue()}</span>` },
    { title: "Nama Kategori", field: "nama_kategori", minWidth: 180, widthGrow: 2, headerHozAlign: "center", formatter: (cell) => `<strong class="text-dark">${cell.getValue()}</strong>` },
    { title: "Keterangan", field: "keterangan", minWidth: 250, widthGrow: 3, headerHozAlign: "center", formatter: (cell) => cell.getValue() || `<span class="text-muted fst-italic">-</span>` },
    {
      title: "Aksi", field: "action", width: 100, hozAlign: "center", headerHozAlign: "center",
      formatter: () => `<button class="btn btn-sm btn-primary me-1 btn-edit"><i class="bi bi-pencil-square"></i></button><button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>`,
      cellClick: (e, cell) => {
        if (e.target.closest(".btn-edit")) openModal(cell.getRow().getData());
        if (e.target.closest(".btn-delete")) handleDelete(cell.getRow().getData().id_kategori);
      },
    },
  ];

  const { tableRef, loading, searchQuery, setSearchQuery, visibleColumns, toggleColumn, getFilteredData, refresh } = 
    useTableLogic(fetchKategoriData, COLUMNS_DEF, ["nama_kategori", "keterangan"]);

  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const fileName = imageUrl.split("/").pop();
      const response = await fetch(`http://localhost:8000/api/signature/${fileName}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); });
    } catch (error) { return null; }
  };

  const handleExportExcel = () => {
    const data = getFilteredData().map(row => ({ "ID": row.id_kategori, "Nama Kategori": row.nama_kategori, "Keterangan": row.keterangan || "-" }));
    if (data.length === 0) return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Kategori");
    XLSX.writeFile(wb, `Data_Kategori_${new Date().getTime()}.xlsx`);
    Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Excel diunduh", showConfirmButton: false, timer: 2000 });
  };

  const handleExportCSV = () => {
    const data = getFilteredData().map(row => ({ "ID": row.id_kategori, "Nama Kategori": row.nama_kategori, "Keterangan": row.keterangan || "-" }));
    if (data.length === 0) return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `Data_Kategori_${new Date().getTime()}.csv`; link.click();
    Swal.fire({ toast: true, position: "top-end", icon: "success", title: "CSV diunduh", showConfirmButton: false, timer: 2000 });
  };

  const handleExportPDF = async () => {
    const data = getFilteredData().map(row => ({ "Nama Kategori": row.nama_kategori, "Keterangan": row.keterangan || "-" }));
    if (data.length === 0) return Swal.fire("Kosong", "Tidak ada data", "warning");
    Swal.fire({ title: "Menyiapkan PDF...", allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    await generateProfessionalPDF(data, "Laporan Data Kategori Penilaian", schoolSettings, getBase64ImageFromUrl);
    Swal.close();
  };

  const openModal = (kategori = null) => {
    setFormData(kategori || {});
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({ title: "Menyimpan...", allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const method = formData.id_kategori ? "PUT" : "POST";
    const url = formData.id_kategori ? `${API_URL}/kategori-penilaian/${formData.id_kategori}` : `${API_URL}/kategori-penilaian`;
    try {
      await safeFetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(formData) });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Data Disimpan!", showConfirmButton: false, timer: 2000 });
      setShowModal(false); refresh();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); } 
    finally { setIsSubmitting(false); }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({ title: "Hapus Kategori?", text: "Data ini akan dihapus permanen.", icon: "warning", showCancelButton: true, confirmButtonColor: "#d33", confirmButtonText: "Ya, Hapus!" });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/kategori-penilaian/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Dihapus!", showConfirmButton: false, timer: 2000 });
        refresh();
      } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    }
  };

  return (
    <>
      <TableWrapper
        title="Master Kategori Penilaian"
        icon="bi-tags"
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
                <h5 className="modal-title fw-bold"><i className="bi bi-tags me-2"></i>{formData.id_kategori ? "Edit Kategori" : "Tambah Kategori Baru"}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowModal(false)}></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body p-4 bg-white">
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">Nama Kategori (Topik STNKM) *</label>
                    <input type="text" className="form-control" required value={formData.nama_kategori || ""} onChange={(e) => setFormData({ ...formData, nama_kategori: e.target.value })} placeholder="Contoh: Skill, Teori, Nalar, Karakter, Minat" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">Keterangan</label>
                    <textarea className="form-control" rows="3" value={formData.keterangan || ""} onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })} placeholder="Deskripsi singkat tentang kategori ini..."></textarea>
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