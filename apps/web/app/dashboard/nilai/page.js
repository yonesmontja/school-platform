"use client";
import { useState, useEffect } from "react";
import Swal from "sweetalert2";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

export default function InputNilaiPage() {
  const [filters, setFilters] = useState({
    id_periode: "", id_kelas: "", id_mapel: "", id_jenis: "", id_materi: "",
    tanggal: new Date().toISOString().slice(0, 10),
  });
  
  const [options, setOptions] = useState({ periodes: [], classes: [], subjects: [], mbks: [], materis: [] });
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const safeFetch = async (url, opts = {}) => {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error("Respon server tidak valid"); }
    if (!res.ok) throw new Error(data.message || "Terjadi kesalahan");
    return data;
  };

  useEffect(() => {
    const fetchOpts = async () => {
      try {
        const data = await safeFetch(`${API_URL}/nilai/filters`, {
          headers: { Authorization: `Bearer ${getToken()}` }
        });
        setOptions(prev => ({ ...prev, periodes: data.periodes, classes: data.classes, subjects: data.subjects, mbks: data.mbks }));
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    };
    fetchOpts();
  }, []);

  useEffect(() => {
    if (filters.id_kelas && filters.id_mapel && filters.id_periode) {
      const fetchMateris = async () => {
        try {
          const params = new URLSearchParams({ 
            id_kelas: filters.id_kelas, id_mapel: filters.id_mapel, id_periode: filters.id_periode 
          });
          const data = await safeFetch(`${API_URL}/nilai/materi?${params}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
          });
          setOptions(prev => ({ ...prev, materis: data.data || [] }));
        } catch (err) { console.error(err); }
      };
      fetchMateris();
    } else {
      setOptions(prev => ({ ...prev, materis: [] }));
    }
  }, [filters.id_kelas, filters.id_mapel, filters.id_periode]);

  const handleShowStudents = async () => {
    if (!filters.id_kelas || !filters.id_materi || !filters.id_periode || !filters.tanggal) {
      return Swal.fire("Lengkapi Filter", "Pilih Periode, Kelas, Mapel, Materi, dan Tanggal terlebih dahulu.", "warning");
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        id_kelas: filters.id_kelas, id_materi: filters.id_materi, 
        id_periode: filters.id_periode, tanggal: filters.tanggal,
      });
      const data = await safeFetch(`${API_URL}/nilai/students?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setStudents((data.students || []).map(s => ({ ...s, inputNilai: s.nilai ?? "" })));
    } catch (err) { Swal.fire("Error", err.message, "error"); } 
    finally { setLoading(false); }
  };

  const handleInputChange = (id_siswa, val) => {
    setStudents(prev => prev.map(s => s.id_siswa === id_siswa ? { ...s, inputNilai: val } : s));
  };

  const handleSaveBatch = async () => {
    if (!filters.id_jenis) return Swal.fire("Jenis Ujian Kosong", "Pilih Jenis Ujian (MBK) terlebih dahulu.", "warning");

    const records = students.filter(s => s.inputNilai !== "" && s.inputNilai !== null).map(s => ({
      id_siswa: s.id_siswa, id_mapel: filters.id_mapel, id_periode: filters.id_periode,
      id_jenis: filters.id_jenis, id_materi: filters.id_materi, id_kelas: filters.id_kelas,
      nilai: parseFloat(s.inputNilai), tanggal: filters.tanggal,
    }));
    if (records.length === 0) return Swal.fire("Kosong", "Isi minimal satu nilai siswa.", "warning");

    setSaving(true);
    Swal.fire({ title: "Menyimpan...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const data = await safeFetch(`${API_URL}/nilai/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ records }),
      });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2500 });
      handleShowStudents();
    } catch (err) { Swal.fire("Gagal", err.message, "error"); } 
    finally { setSaving(false); }
  };

  return (
    <div className="container-fluid mt-4 mb-5">
      <h3 className="fw-bold text-primary mb-4"><i className="bi bi-pencil-square me-2"></i>Input Nilai Siswa</h3>

      <div className="card border-0 shadow-sm p-4 mb-4">
        <h5 className="fw-bold mb-3 text-secondary">Filter Penilaian</h5>
        <div className="row g-3">
          <div className="col-md-3">
            <label className="form-label fw-bold small">Periode</label>
            <select className="form-select" value={filters.id_periode} onChange={(e) => setFilters({...filters, id_periode: e.target.value})}>
              <option value="">-- Pilih Periode --</option>
              {options.periodes.map(p => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester})</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label fw-bold small">Kelas</label>
            <select className="form-select" value={filters.id_kelas} onChange={(e) => setFilters({...filters, id_kelas: e.target.value})}>
              <option value="">-- Pilih Kelas --</option>
              {options.classes.map(c => <option key={c.id_kelas} value={c.id_kelas}>{c.nama_kelas}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label fw-bold small">Mata Pelajaran</label>
            <select className="form-select" value={filters.id_mapel} onChange={(e) => setFilters({...filters, id_mapel: e.target.value})}>
              <option value="">-- Pilih Mapel --</option>
              {options.subjects.map(s => <option key={s.id_mapel} value={s.id_mapel}>{s.nama_mapel}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label fw-bold small">Jenis Ujian (MBK)</label>
            <select className="form-select" value={filters.id_jenis} onChange={(e) => setFilters({...filters, id_jenis: e.target.value})}>
              <option value="">-- Pilih Jenis --</option>
              {options.mbks.map(m => <option key={m.id_jenis} value={m.id_jenis}>{m.kategori_penilaian}</option>)}
            </select>
          </div>
          <div className="col-md-5">
            <label className="form-label fw-bold small">Materi / Topik</label>
            <select className="form-select" value={filters.id_materi} onChange={(e) => setFilters({...filters, id_materi: e.target.value})}>
              <option value="">-- Pilih Materi --</option>
              {options.materis.map(m => <option key={m.id_materi} value={m.id_materi}>{m.nama_materi} {m.kategori ? `(${m.kategori.nama_kategori})` : ''}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label fw-bold small">Tanggal Penilaian</label>
            <input type="date" className="form-control" value={filters.tanggal} onChange={(e) => setFilters({...filters, tanggal: e.target.value})} />
          </div>
          <div className="col-md-4 d-flex align-items-end">
            <button className="btn btn-primary w-100 fw-bold" onClick={handleShowStudents} disabled={loading}>
              <i className="bi bi-eye me-1"></i> {loading ? 'Memuat...' : 'Tampilkan Siswa'}
            </button>
          </div>
        </div>
      </div>

      {students.length > 0 && (
        <div className="card border-0 shadow-sm p-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="fw-bold m-0">Daftar Siswa ({students.length})</h5>
            <button className="btn btn-success fw-bold" onClick={handleSaveBatch} disabled={saving}>
              <i className="bi bi-save me-1"></i> {saving ? 'Menyimpan...' : 'Simpan Semua Nilai'}
            </button>
          </div>
          <div className="table-responsive">
            <table className="table table-bordered table-striped">
              <thead className="table-dark">
                <tr>
                  <th width="5%" className="text-center">No</th>
                  <th width="15%">NISN</th>
                  <th width="40%">Nama Siswa</th>
                  <th width="20%" className="text-center">Nilai (0-100)</th>
                  <th width="20%" className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => (
                  <tr key={s.id_siswa}>
                    <td className="text-center">{idx + 1}</td>
                    <td>{s.nisn || s.id_siswa}</td>
                    <td className="fw-bold">{s.nama_siswa}</td>
                    <td className="text-center">
                      <input type="number" min="0" max="100" className="form-control text-center fw-bold"
                        value={s.inputNilai} onChange={(e) => handleInputChange(s.id_siswa, e.target.value)} placeholder="0-100" />
                    </td>
                    <td className="text-center">
                      {s.nilai !== null && s.nilai !== "" ? 
                        <span className="badge bg-info">Sudah dinilai: {s.nilai}</span> : 
                        <span className="badge bg-warning text-dark">Belum diisi</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}