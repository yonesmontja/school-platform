"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function MasterSiswaPage() {
  const [students, setStudents] = useState([]);
  const [masterData, setMasterData] = useState({
    classes: [],
    agama: [],
    suku: [],
    sekolahAsal: [],
    wilayah: [],
    ortu: [],
    wali: [],
  });
  const [schoolSettings, setSchoolSettings] = useState(null); // State untuk menampung setting sekolah

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({});
  const [activeTab, setActiveTab] = useState("identitas");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterKelas, setFilterKelas] = useState("ALL");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tableRef = useRef(null);
  const tabulatorInstance = useRef(null);

  const API_URL = "http://localhost:8000/api";
  const getToken = () => localStorage.getItem("token");

  // Definisi Kolom Tabulator
  const COLUMNS_DEF = [
    {
      title: "No",
      formatter: "rownum",
      width: 60,
      headerHozAlign: "center",
      field: "row_num",
    },
    {
      title: "NISN / ID",
      field: "nisn",
      minWidth: 100,
      widthGrow: 1,
      headerHozAlign: "center",
      hozAlign: "center",
      formatter: (cell) =>
        `<span class="fw-bold text-primary">${cell.getValue() || cell.getRow().getData().id_siswa}</span>`,
    },
    {
      title: "Nama Lengkap",
      field: "nama_siswa",
      minWidth: 200,
      widthGrow: 2,
      hozAlign: "left",
      headerHozAlign: "center",
      formatter: (cell) => {
        const data = cell.getRow().getData();
        return `<span class="fw-bold text-dark">${data.nama_siswa}</span><br><small class="text-muted">${data.panggilan ? `Panggilan: ${data.panggilan}` : ""}</small>`;
      },
    },
    {
      title: "Kelas",
      field: "kelas.nama_kelas",
      minWidth: 80,
      widthGrow: 1,
      hozAlign: "center",
      headerHozAlign: "center",
    },
    {
      title: "L/P",
      field: "jenis_kelamin",
      minWidth: 60,
      widthGrow: 1,
      headerHozAlign: "center",
      hozAlign: "center",
    },
    {
      title: "Agama & Suku",
      field: "agama.nama_agama",
      minWidth: 150,
      widthGrow: 2,
      hozAlign: "center",
      headerHozAlign: "center",
      formatter: (cell) => {
        const data = cell.getRow().getData();
        return `<div class="d-flex flex-column align-items-center gap-1">
                  <span class="badge bg-info text-dark" style="min-width: 80px;">${data.agama?.nama_agama || "-"}</span>
                  <span class="badge bg-secondary" style="min-width: 80px;">${data.suku?.nama_suku || "-"}</span>
                </div>`;
      },
    },
    {
      title: "Status Tinggal",
      field: "status_tempat_tinggal",
      minWidth: 120,
      widthGrow: 1,
      hozAlign: "center",
      headerHozAlign: "center",
      formatter: (cell) =>
        `<small class="text-muted">${cell.getValue() || "-"}</small>`,
    },
    {
      title: "Aksi",
      field: "action",
      width: 100,
      hozAlign: "center",
      formatter: () =>
        `<button class="btn btn-sm btn-primary me-1 btn-edit"><i class="bi bi-pencil-square"></i></button><button class="btn btn-sm btn-outline-danger btn-delete"><i class="bi bi-trash"></i></button>`,
      cellClick: (e, cell) => {
        if (e.target.closest(".btn-edit")) openModal(cell.getRow().getData());
        if (e.target.closest(".btn-delete"))
          handleDelete(cell.getRow().getData().id_siswa);
      },
    },
  ];

  const [visibleColumns, setVisibleColumns] = useState(
    COLUMNS_DEF.map((c) => c.field),
  );

  const safeFetch = async (url, options = {}) => {
    const res = await fetch(url, options);
    const textData = await res.text();
    let data = {};
    try {
      data = textData ? JSON.parse(textData) : {};
    } catch (e) {
      throw new Error(`Respon server tidak valid. Status: ${res.status}`);
    }
    if (!res.ok)
      throw new Error(
        data.message || data.error || "Terjadi kesalahan pada server",
      );
    return data;
  };

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await safeFetch(`${API_URL}/students`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          Accept: "application/json",
        },
      });
      setStudents(data.data || []);
    } catch (err) {
      Swal.fire("Error Data Siswa", err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMasterData = useCallback(async () => {
    try {
      const data = await safeFetch(`${API_URL}/students/master-data`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          Accept: "application/json",
        },
      });
      setMasterData({
        classes: data.classes || [],
        agama: data.agama || [],
        suku: data.suku || [],
        sekolahAsal: data.sekolahAsal || [],
        wilayah: data.wilayah || [],
        ortu: data.ortu || [],
        wali: data.wali || [],
      });
    } catch (err) {
      console.error("Error Master:", err);
    }
  }, []);

  // Ambil Data Pengaturan Sekolah (TTD & Profil)
  const fetchSchoolSettings = useCallback(async () => {
    try {
      const data = await safeFetch(`${API_URL}/settings`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          Accept: "application/json",
        },
      });
      setSchoolSettings(data);
    } catch (err) {
      console.error("Error Settings:", err);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    fetchStudents();
    fetchMasterData();
    fetchSchoolSettings();
  }, [fetchStudents, fetchMasterData, fetchSchoolSettings]);

  // INISIALISASI TABULATOR
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (tableRef.current && !tabulatorInstance.current) {
        const { TabulatorFull } = await import("tabulator-tables");
        if (!isMounted) return;

        tabulatorInstance.current = new TabulatorFull(tableRef.current, {
          layout: "fitColumns",
          responsiveLayout: "collapse",
          pagination: true,
          paginationSize: 10,
          placeholder: "Data siswa tidak ditemukan.",
          cssClass: "table table-sm table-bordered table-hover table-striped",
          columns: COLUMNS_DEF,
        });

        tabulatorInstance.current.on("tableBuilt", () => {
          if (isMounted && tabulatorInstance.current) {
            tabulatorInstance.current.replaceData(students);
            applyColumnVisibility(visibleColumns);
          }
        });
      }
    };
    init();
    return () => {
      isMounted = false;
      if (tabulatorInstance.current) {
        tabulatorInstance.current.destroy();
        tabulatorInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (tabulatorInstance.current) {
      setTimeout(() => {
        if (tabulatorInstance.current) {
          tabulatorInstance.current.replaceData(students);
          applyFilters();
        }
      }, 50);
    }
  }, [students]);

  const applyFilters = () => {
    if (!tabulatorInstance.current) return;
    let filters = [];
    if (filterKelas !== "ALL")
      filters.push({ field: "id_kelas", type: "=", value: filterKelas });
    if (searchQuery.trim() !== "") {
      let q = searchQuery.toLowerCase();
      filters.push([
        { field: "nama_siswa", type: "like", value: q },
        { field: "nisn", type: "like", value: q },
        { field: "id_siswa", type: "like", value: q },
      ]);
    }
    tabulatorInstance.current.setFilter(filters);
  };
  useEffect(() => {
    applyFilters();
  }, [searchQuery, filterKelas]);

  const toggleColumn = (field) => {
    setVisibleColumns((prev) => {
      const newVals = prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field];
      applyColumnVisibility(newVals);
      return newVals;
    });
  };

  const applyColumnVisibility = (cols) => {
    if (!tabulatorInstance.current) return;
    COLUMNS_DEF.forEach((col) => {
      if (cols.includes(col.field))
        tabulatorInstance.current.showColumn(col.field);
      else tabulatorInstance.current.hideColumn(col.field);
    });
    setTimeout(() => {
      if (tabulatorInstance.current) tabulatorInstance.current.redraw();
    }, 50);
  };

  // --- LOGIKA EKSPOR (XLSX, CSV, PDF) ---
  const getFilteredData = () => {
    return tabulatorInstance.current.getData("active").map((row) => {
      return {
        "NISN / ID": row.nisn || row.id_siswa,
        "Nama Lengkap": row.nama_siswa,
        Panggilan: row.panggilan || "-",
        Kelas: row.kelas?.nama_kelas || "-",
        "L/P": row.jenis_kelamin,
        Agama: row.agama?.nama_agama || "-",
        Suku: row.suku?.nama_suku || "-",
        "Status Tinggal": row.status_tempat_tinggal,
        "Tempat Lahir": row.tempat_lahir || "-",
        "Tanggal Lahir": row.tgl_lahir || "-",
      };
    });
  };

  // Helper: Konversi URL Gambar ke Base64 (Menggunakan API Proxy)
  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      // Ambil nama file dari URL
      // Contoh: "/storage/signatures/ttd_kepsek_123.png" -> "ttd_kepsek_123.png"
      const fileName = imageUrl.split("/").pop();

      // Panggil route proxy yang baru kita buat di Laravel
      const proxyUrl = `http://localhost:8000/api/signature/${fileName}`;

      console.log("Sedang memuat TTD dari:", proxyUrl); // Untuk debugging

      const response = await fetch(proxyUrl);

      if (!response.ok) {
        console.warn(`Gambar TTD gagal dimuat. Status: ${response.status}`);
        return null; // Kembalikan null jika 404 (file tidak ada)
      }

      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Error jaringan saat mengambil TTD:", error);
      return null; // Jangan hentikan proses PDF
    }
  };

  const exportExcel = () => {
    const data = getFilteredData();
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data untuk diekspor", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data_Siswa");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data_Siswa_${new Date().getTime()}.xlsx`;
    link.click();
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Excel berhasil diunduh",
      showConfirmButton: false,
      timer: 2000,
    });
  };

  const exportCSV = () => {
    const data = getFilteredData();
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data untuk diekspor", "warning");
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Data_Siswa_${new Date().getTime()}.csv`;
    link.click();
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "CSV berhasil diunduh",
      showConfirmButton: false,
      timer: 2000,
    });
  };

  const exportPDF = async () => {
    const data = getFilteredData();
    if (data.length === 0)
      return Swal.fire("Kosong", "Tidak ada data untuk diekspor", "warning");

    Swal.fire({
      title: "Menyiapkan PDF...",
      text: "Memuat data tanda tangan...",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const headers = Object.keys(data[0]);
    const rows = data.map((obj) => Object.values(obj));
    const doc = new jsPDF("landscape", "mm", "a4");

    // 1. Ambil Data Dinamis untuk TTD
    const namaKepsek =
      schoolSettings?.nama_kepsek || "..............................";
    const nipKepsek =
      schoolSettings?.nip_kepsek || "..............................";
    const kota = schoolSettings?.kota || "....................";

    // Cari Wali Kelas berdasarkan filterKelas yang dipilih
    let namaWali = "..............................";
    let nipWali = "..............................";
    let waliKelasData = null;

    if (filterKelas !== "ALL") {
      const selectedClass = masterData.classes.find(
        (c) => String(c.id_kelas) === String(filterKelas),
      );
      // Tambahkan pengecekan tipe data
      if (selectedClass && selectedClass.wali_kelas && typeof selectedClass.wali_kelas === 'object') {
        waliKelasData = selectedClass.wali_kelas;
        namaWali = waliKelasData.nama_guru || namaWali;
        nipWali = waliKelasData.nip_nik || nipWali;
        console.log("Data Wali Kelas ditemukan:", waliKelasData);
      } else {
        console.warn("Wali Kelas belum diatur atau relasi API tidak terbaca.");
      }
    } else {
      console.warn("Filter Kelas masih 'Semua Kelas'. Pilih kelas spesifik agar TTD Wali Kelas muncul.");
    }

    // 2. Ambil Gambar TTD sebagai Base64 (Menggunakan Promise.all agar parallel)
    const [ttdKepsekBase64, ttdWaliBase64] = await Promise.all([
      getBase64ImageFromUrl(schoolSettings?.ttd_kepsek_url),
      getBase64ImageFromUrl(waliKelasData?.ttd_guru_url),
    ]);

    // --- KOP SURAT ---
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("LAPORAN DATA SISWA", 148, 15, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Sistem Informasi Akademik & Analitik STNKM", 148, 21, {
      align: "center",
    });
    doc.text(`Dicetak pada: ${new Date().toLocaleString("id-ID")}`, 148, 26, {
      align: "center",
    });
    doc.setLineWidth(0.5);
    doc.line(14, 29, 283, 29);

    autoTable(doc, {
      head: [headers],
      body: rows,
      startY: 33,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [63, 81, 181],
        textColor: 255,
        halign: "center",
        fontStyle: "bold",
      },
      columnStyles: {
        0: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
      },
      margin: { bottom: 60 },

      didDrawPage: function (data) {
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;

        // FOOTER
        let str = "Halaman " + doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.text(str, pageWidth - 20, pageHeight - 8);
        doc.text(
          "Dokumen ini dihasilkan secara otomatis oleh sistem.",
          14,
          pageHeight - 8,
        );

        // RUANG TANDA TANGAN (KIRI: KEPSEK)
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Mengetahui,", 20, pageHeight - 50);
        doc.text("Kepala Sekolah", 20, pageHeight - 45);

        // Sisipkan Gambar TTD Kepsek (Jika ada)
        if (ttdKepsekBase64) {
          // Parameter: base64, format, x, y, width, height
          doc.addImage(ttdKepsekBase64, "PNG", 20, pageHeight - 42, 30, 15);
          // Catatan: sesuaikan X dan Y agar posisinya pas di atas garis
        }

        doc.text(
          "........................................",
          20,
          pageHeight - 25,
        );
        doc.text(`( ${namaKepsek} )`, 20, pageHeight - 20);
        doc.text(`NIP. ${nipKepsek}`, 20, pageHeight - 15);

        // RUANG TANDA TANGAN (KANAN: WALI KELAS)
        doc.text(
          `${kota}, ${new Date().toLocaleDateString("id-ID")}`,
          pageWidth - 80,
          pageHeight - 50,
        );
        doc.text("Wali Kelas", pageWidth - 80, pageHeight - 45);

        // Sisipkan Gambar TTD Wali Kelas (Jika ada)
        if (ttdWaliBase64) {
          doc.addImage(
            ttdWaliBase64,
            "PNG",
            pageWidth - 80,
            pageHeight - 42,
            30,
            15,
          );
        }

        doc.text(
          "........................................",
          pageWidth - 80,
          pageHeight - 25,
        );
        doc.text(`( ${namaWali} )`, pageWidth - 80, pageHeight - 20);
        doc.text(`NIP. ${nipWali}`, pageWidth - 80, pageHeight - 15);
      },
    });

    const pdfBlobUrl = doc.output("bloburl");
    window.open(pdfBlobUrl, "_blank");

    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "PDF berhasil dibuat",
      showConfirmButton: false,
      timer: 2000,
    });
  };

  // --- FUNGSI CRUD & MODAL (Sama seperti sebelumnya, tidak diubah) ---
  const openModal = (student = null) => {
    setEditingStudent(student);
    const defaultData = {
      jenis_kelamin: "L",
      status_tempat_tinggal: "Bersama Orang Tua",
      id_agama: "",
      id_suku: "",
      id_sekolah_asal: "",
      id_wilayah_siswa: "",
      id_ortu: "",
      id_wali: "",
      tempat_lahir: "",
      tgl_lahir: "",
      jalan_siswa: "",
      no_wa: "",
    };
    setFormData(student ? { ...defaultData, ...student } : defaultData);
    setActiveTab("identitas");
    setShowModal(true);
  };

  const handleInputChange = (field, value) =>
    setFormData({ ...formData, [field]: value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({
      title: "Menyimpan Data...",
      text: "Sistem sedang memproses data ke database.",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
    const method = editingStudent ? "PUT" : "POST";
    const url = editingStudent
      ? `${API_URL}/students/${editingStudent.id_siswa}`
      : `${API_URL}/students`;
    try {
      await safeFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
          Accept: "application/json",
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
      fetchStudents();
    } catch (err) {
      Swal.fire("Validasi Gagal", err.message, "warning");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Hapus Permanen?",
      text: "Menghapus siswa dapat merusak relasi nilai akademik anak ini.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Ya, Hapus!",
    });
    if (confirm.isConfirmed) {
      try {
        await safeFetch(`${API_URL}/students/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            Accept: "application/json",
          },
        });
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "success",
          title: "Data Dihapus!",
          showConfirmButton: false,
          timer: 2000,
        });
        fetchStudents();
      } catch (err) {
        Swal.fire("Gagal Menghapus", err.message, "error");
      }
    }
  };

  const isAlamatDisabled =
    formData.status_tempat_tinggal === "Bersama Orang Tua" ||
    formData.status_tempat_tinggal === "Bersama Wali";

  return (
    <div className="container-fluid mt-4 mb-5">
      <style jsx>{`
        :global(.tabulator) {
          font-size: 13px !important;
        }
        :global(.tabulator .tabulator-header) {
          font-size: 12px !important;
          font-weight: 700 !important;
          background-color: #f4f6f9 !important;
        }
        :global(.tabulator .tabulator-cell) {
          padding: 4px 8px !important;
          vertical-align: middle;
        }
      `}</style>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-2">
        <h3 className="fw-bold text-primary m-0">
          <i className="bi bi-people-fill me-2"></i>Grand Master Data Siswa
        </h3>
        <div className="d-flex gap-2 flex-wrap">
          <div className="dropdown">
            <button
              className="btn btn-outline-secondary fw-bold dropdown-toggle"
              type="button"
              data-bs-toggle="dropdown"
            >
              <i className="bi bi-gear me-1"></i> Atur Kolom
            </button>
            <ul
              className="dropdown-menu shadow-sm"
              style={{ maxHeight: "300px", overflowY: "auto" }}
            >
              {COLUMNS_DEF.filter((c) => c.field !== "action").map((col) => (
                <li key={col.field}>
                  <label
                    className="dropdown-item d-flex align-items-center gap-2"
                    style={{ cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      className="form-check-input mt-0"
                      checked={visibleColumns.includes(col.field)}
                      onChange={() => toggleColumn(col.field)}
                    />
                    {col.title}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="btn-group">
            <button className="btn btn-success fw-bold" onClick={exportExcel}>
              <i className="bi bi-file-earmark-excel"></i> XLSX
            </button>
            <button
              className="btn btn-info text-white fw-bold"
              onClick={exportCSV}
            >
              <i className="bi bi-filetype-csv"></i> CSV
            </button>
            <button className="btn btn-danger fw-bold" onClick={exportPDF}>
              <i className="bi bi-file-earmark-pdf"></i> PDF
            </button>
          </div>
          <button
            className="btn btn-primary fw-bold shadow-sm"
            onClick={() => openModal()}
          >
            <i className="bi bi-person-plus me-2"></i>Tambah Siswa
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm p-3 p-md-4">
        <div className="row mb-3 g-2">
          <div className="col-12 col-md-3">
            <select
              className="form-select border-primary fw-bold form-select-sm"
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
            >
              <option value="ALL">-- Semua Kelas --</option>
              {masterData.classes.map((k) => (
                <option key={k.id_kelas} value={k.id_kelas}>
                  {k.nama_kelas}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-9">
            <input
              type="text"
              className="form-control border-primary form-control-sm"
              placeholder="Cari nama atau NISN siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading && (
          <div className="text-center text-muted mb-2">
            <span className="spinner-border spinner-border-sm me-2"></span>
            Memuat data...
          </div>
        )}
        <div className="table-responsive">
          <div ref={tableRef}></div>
        </div>
      </div>

      {/* MODAL FORM (Sama persis seperti kode Anda sebelumnya) */}
      {showModal && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }}
          tabIndex="-1"
        >
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-person-badge me-2"></i>
                  {editingStudent
                    ? "Edit Data Peserta Didik"
                    : "Formulir Peserta Didik Baru"}
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowModal(false)}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body p-0 bg-light">
                  <ul className="nav nav-tabs px-3 pt-3 bg-white border-bottom-0">
                    <li className="nav-item">
                      <button
                        className={`nav-link ${activeTab === "identitas" ? "active fw-bold" : ""}`}
                        type="button"
                        onClick={() => setActiveTab("identitas")}
                      >
                        <i className="bi bi-person-vcard me-1"></i> Identitas
                        Utama
                      </button>
                    </li>
                    <li className="nav-item">
                      <button
                        className={`nav-link ${activeTab === "domisili" ? "active fw-bold" : ""}`}
                        type="button"
                        onClick={() => setActiveTab("domisili")}
                      >
                        <i className="bi bi-geo-alt me-1"></i> Domisili &
                        Riwayat
                      </button>
                    </li>
                    <li className="nav-item">
                      <button
                        className={`nav-link ${activeTab === "keluarga" ? "active fw-bold" : ""}`}
                        type="button"
                        onClick={() => setActiveTab("keluarga")}
                      >
                        <i className="bi bi-people me-1"></i> Relasi Keluarga
                      </button>
                    </li>
                  </ul>
                  <div className="p-4 bg-white">
                    {activeTab === "identitas" && (
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label fw-bold small text-muted">
                            NISN *
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            value={formData.nisn || ""}
                            onChange={(e) =>
                              handleInputChange("nisn", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-5">
                          <label className="form-label fw-bold small text-muted">
                            Nama Lengkap *
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            required
                            value={formData.nama_siswa || ""}
                            onChange={(e) =>
                              handleInputChange("nama_siswa", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label fw-bold small text-muted">
                            Nama Panggilan
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            value={formData.panggilan || ""}
                            onChange={(e) =>
                              handleInputChange("panggilan", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label fw-bold small text-muted">
                            Kelas *
                          </label>
                          <select
                            className="form-select"
                            required
                            value={formData.id_kelas || ""}
                            onChange={(e) =>
                              handleInputChange("id_kelas", e.target.value)
                            }
                          >
                            <option value="">-- Pilih Kelas --</option>
                            {masterData.classes.map((k) => (
                              <option key={k.id_kelas} value={k.id_kelas}>
                                {k.nama_kelas}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-2">
                          <label className="form-label fw-bold small text-muted">
                            L/P
                          </label>
                          <select
                            className="form-select"
                            value={formData.jenis_kelamin || "L"}
                            onChange={(e) =>
                              handleInputChange("jenis_kelamin", e.target.value)
                            }
                          >
                            <option value="L">Laki-Laki</option>
                            <option value="P">Perempuan</option>
                          </select>
                        </div>
                        <div className="col-md-3">
                          <label className="form-label fw-bold small text-muted">
                            Tempat Lahir
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            value={formData.tempat_lahir || ""}
                            onChange={(e) =>
                              handleInputChange("tempat_lahir", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label fw-bold small text-muted">
                            Tanggal Lahir
                          </label>
                          <input
                            type="date"
                            className="form-control"
                            value={
                              formData.tgl_lahir
                                ? formData.tgl_lahir.split("T")[0]
                                : ""
                            }
                            onChange={(e) =>
                              handleInputChange("tgl_lahir", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-bold small text-muted">
                            Agama
                          </label>
                          <select
                            className="form-select"
                            value={formData.id_agama || ""}
                            onChange={(e) =>
                              handleInputChange("id_agama", e.target.value)
                            }
                          >
                            <option value="">-- Pilih Agama --</option>
                            {masterData.agama.map((a) => (
                              <option key={a.id_agama} value={a.id_agama}>
                                {a.nama_agama}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-bold small text-muted">
                            Suku Bangsa
                          </label>
                          <select
                            className="form-select"
                            value={formData.id_suku || ""}
                            onChange={(e) =>
                              handleInputChange("id_suku", e.target.value)
                            }
                          >
                            <option value="">-- Pilih Suku --</option>
                            {masterData.suku.map((s) => (
                              <option key={s.id_suku} value={s.id_suku}>
                                {s.nama_suku}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                    {activeTab === "domisili" && (
                      <div className="row g-3">
                        <div className="col-md-12">
                          <label className="form-label fw-bold small text-muted">
                            Sekolah Asal
                          </label>
                          <select
                            className="form-select"
                            value={formData.id_sekolah_asal || ""}
                            onChange={(e) =>
                              handleInputChange(
                                "id_sekolah_asal",
                                e.target.value,
                              )
                            }
                          >
                            <option value="">
                              -- Tidak Diketahui / Baru --
                            </option>
                            {masterData.sekolahAsal.map((sa) => (
                              <option
                                key={sa.id_sekolah_asal}
                                value={sa.id_sekolah_asal}
                              >
                                [{sa.jenjang_sekolah}] {sa.nama_sekolah}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label fw-bold small text-muted">
                            Status Tempat Tinggal
                          </label>
                          <select
                            className="form-select"
                            value={formData.status_tempat_tinggal || ""}
                            onChange={(e) =>
                              handleInputChange(
                                "status_tempat_tinggal",
                                e.target.value,
                              )
                            }
                          >
                            <option value="Bersama Orang Tua">
                              Bersama Orang Tua
                            </option>
                            <option value="Bersama Wali">Bersama Wali</option>
                            <option value="Asrama / Kost">Asrama / Kost</option>
                            <option value="Mandiri">Mandiri</option>
                          </select>
                        </div>
                        <div className="col-md-8">
                          <label className="form-label fw-bold small text-muted">
                            Alamat Jalan
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            disabled={isAlamatDisabled}
                            value={formData.jalan_siswa || ""}
                            onChange={(e) =>
                              handleInputChange("jalan_siswa", e.target.value)
                            }
                          />
                        </div>
                        <div className="col-md-12">
                          <label className="form-label fw-bold small text-muted">
                            Wilayah Kependudukan
                          </label>
                          <select
                            className="form-select"
                            disabled={isAlamatDisabled}
                            value={formData.id_wilayah_siswa || ""}
                            onChange={(e) =>
                              handleInputChange(
                                "id_wilayah_siswa",
                                e.target.value,
                              )
                            }
                          >
                            <option value="">-- Pilih Wilayah --</option>
                            {masterData.wilayah.map((w) => (
                              <option key={w.id_wilayah} value={w.id_wilayah}>
                                {w.kecamatan}, {w.kabupaten_kota}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                    {activeTab === "keluarga" && (
                      <div className="row g-4">
                        <div className="col-md-6">
                          <div className="card border-primary h-100">
                            <div className="card-header bg-primary text-white fw-bold">
                              Relasi Orang Tua Kandung
                            </div>
                            <div className="card-body">
                              <select
                                className="form-select border-primary"
                                value={formData.id_ortu || ""}
                                onChange={(e) =>
                                  handleInputChange("id_ortu", e.target.value)
                                }
                              >
                                <option value="">-- Tidak Terhubung --</option>
                                {masterData.ortu.map((o) => (
                                  <option key={o.id_ortu} value={o.id_ortu}>
                                    Ayah: {o.nama_ayah} & Ibu: {o.nama_ibu}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="card border-secondary h-100">
                            <div className="card-header bg-secondary text-white fw-bold">
                              Relasi Wali Peserta Didik
                            </div>
                            <div className="card-body">
                              <select
                                className="form-select border-secondary"
                                value={formData.id_wali || ""}
                                onChange={(e) =>
                                  handleInputChange("id_wali", e.target.value)
                                }
                              >
                                <option value="">-- Tidak Terhubung --</option>
                                {masterData.wali.map((w) => (
                                  <option key={w.id_wali} value={w.id_wali}>
                                    Wali: {w.nama_wali}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer bg-white">
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
                    <i className="bi bi-save me-2"></i>
                    {isSubmitting ? "Menyimpan..." : "Simpan Data Siswa"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
