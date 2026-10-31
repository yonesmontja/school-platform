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

export default function MasterMateriPage() {
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [mapels, setMapels] = useState([]);
  const [kelas, setKelas] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [kategoris, setKategoris] = useState([]);

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

  const fetchMateriData = useCallback(async () => {
    const [
      resMateri,
      resMapel,
      resKelas,
      resPeriode,
      resKategori,
      resSettings,
    ] = await Promise.all([
      safeFetch(`${API_URL}/materi`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/subjects`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/classes`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/periodes`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/kategori-penilaian`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
      safeFetch(`${API_URL}/settings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }),
    ]);
    setMapels(resMapel.data || []);
    setKelas(resKelas.data || []);
    setPeriodes(resPeriode.data || []);
    setKategoris(resKategori.data || []);
    setSchoolSettings(resSettings || null);
    return resMateri.data || [];
  }, []);

  const COLUMNS_DEF = [
    {
      title: "Nama Materi",
      field: "nama_materi",
      minWidth: 180,
      widthGrow: 2,
      headerHozAlign: "center",
      formatter: (cell) =>
        `<strong class="text-dark">${cell.getValue()}</strong>`,
    },
    {
      title: "Mapel",
      field: "mapel.nama_mapel",
      width: 130,
      headerHozAlign: "center",
      formatter: (cell) => cell.getValue() || "-",
    },
    {
      title: "Kelas",
      field: "kelas.nama_kelas",
      width: 100,
      headerHozAlign: "center",
      hozAlign: "center",
      formatter: (cell) =>
        cell.getValue()
          ? `<span class="badge bg-light text-dark border">${cell.getValue()}</span>`
          : "-",
    },
    {
      title: "Kategori",
      field: "kategori.nama_kategori",
      width: 120,
      headerHozAlign: "center",
      hozAlign: "center",
      formatter: (cell) =>
        cell.getValue()
          ? `<span class="badge bg-secondary">${cell.getValue()}</span>`
          : "-",
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
          handleDelete(cell.getRow().getData().id_materi);
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
  } = useTableLogic(fetchMateriData, COLUMNS_DEF, [
    "nama_materi",
    "deskripsi_kompetensi",
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
      "Nama Materi": row.nama_materi,
      Mapel: row.mapel?.nama_mapel || "-",
      Kelas: row.kelas?.nama_kelas || "-",
      Kategori: row.kategori?.nama_kategori || "-",
      S: row.mat_S,
      T: row.mat_T,
      N: row.mat_N,
      K: row.mat_K,
      M: row.mat_M,
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materi");
    XLSX.writeFile(wb, `Data_Materi_${new Date().getTime()}.xlsx`);
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
      "Nama Materi": row.nama_materi,
      Mapel: row.mapel?.nama_mapel || "-",
      Kelas: row.kelas?.nama_kelas || "-",
      Kategori: row.kategori?.nama_kategori || "-",
      S: row.mat_S,
      T: row.mat_T,
      N: row.mat_N,
      K: row.mat_K,
      M: row.mat_M,
    }));
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data_Materi_${new Date().getTime()}.csv`;
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
      "Nama Materi": row.nama_materi,
      Mapel: row.mapel?.nama_mapel || "-",
      Kelas: row.kelas?.nama_kelas || "-",
      Kategori: row.kategori?.nama_kategori || "-",
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
      "Laporan Data Materi Pembelajaran",
      schoolSettings,
      getBase64ImageFromUrl,
    );
    Swal.close();
  };

  const openModal = (materi = null) => {
    const defaults = { mat_S: 1, mat_T: 1, mat_N: 1, mat_K: 1, mat_M: 1 };
    const data = materi
      ? { ...defaults, ...materi }
      : {
          ...defaults,
          id_periode:
            periodes.find((p) => p.status_aktif === "AKTIF")?.id_periode || "",
        };
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
    const method = formData.id_materi ? "PUT" : "POST";
    const url = formData.id_materi
      ? `${API_URL}/materi/${formData.id_materi}`
      : `${API_URL}/materi`;
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
      title: "Hapus Materi?",
      text: "Data ini akan dihapus permanen.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Ya, Hapus!",
    });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/materi/${id}`, {
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
        title="Master Materi Pembelajaran"
        icon="bi-journal-bookmark"
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
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-journal-bookmark me-2"></i>
                  {formData.id_materi ? "Edit Materi" : "Tambah Materi Baru"}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body p-4 bg-white">
                  <h6 className="fw-bold text-secondary mb-3">
                    <i className="bi bi-info-circle me-2"></i>Identitas Materi
                  </h6>
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label fw-bold small text-muted">
                        Mata Pelajaran *
                      </label>
                      <select
                        className="form-select"
                        required
                        value={formData.id_mapel || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, id_mapel: e.target.value })
                        }
                      >
                        <option value="">-- Pilih Mapel --</option>
                        {mapels.map((m) => (
                          <option key={m.id_mapel} value={m.id_mapel}>
                            {m.nama_mapel}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold small text-muted">
                        Kelas *
                      </label>
                      <select
                        className="form-select"
                        required
                        value={formData.id_kelas || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, id_kelas: e.target.value })
                        }
                      >
                        <option value="">-- Pilih Kelas --</option>
                        {kelas.map((k) => (
                          <option key={k.id_kelas} value={k.id_kelas}>
                            {k.nama_kelas}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold small text-muted">
                        Periode *
                      </label>
                      <select
                        className="form-select"
                        required
                        value={formData.id_periode || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            id_periode: e.target.value,
                          })
                        }
                      >
                        <option value="">-- Pilih Periode --</option>
                        {periodes.map((p) => (
                          <option key={p.id_periode} value={p.id_periode}>
                            {p.tahun_ajaran} ({p.semester}){" "}
                            {p.status_aktif === "AKTIF" ? "⭐" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold small text-muted">
                        Kategori STNKM *
                      </label>
                      <select
                        className="form-select"
                        required
                        value={formData.id_kategori || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            id_kategori: e.target.value,
                          })
                        }
                      >
                        <option value="">-- Pilih Kategori --</option>
                        {kategoris.map((k) => (
                          <option key={k.id_kategori} value={k.id_kategori}>
                            {k.nama_kategori}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      Nama Materi *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={formData.nama_materi || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          nama_materi: e.target.value,
                        })
                      }
                      placeholder="Contoh: Sistem Tata Surya"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-bold small text-muted">
                      Deskripsi Kompetensi / Tujuan Pembelajaran
                    </label>
                    <textarea
                      className="form-control"
                      rows="2"
                      value={formData.deskripsi_kompetensi || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          deskripsi_kompetensi: e.target.value,
                        })
                      }
                      placeholder="Apa yang akan dicapai siswa?"
                    ></textarea>
                  </div>

                  <div className="border-top pt-3">
                    <h6 className="fw-bold text-secondary mb-3">
                      <i className="bi bi-sliders me-2"></i>Matriks Bobot STNKM
                    </h6>
                    <p className="small text-muted mb-3">
                      Bobot 0-100%. Nilai akhir akan dikalikan dengan matriks
                      ini saat kalkulasi otomatis.
                    </p>

                    <div className="row">
                      {MATRIX_LABELS.map((m) => (
                        <div key={m.key} className="col-md-6 mb-3">
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
