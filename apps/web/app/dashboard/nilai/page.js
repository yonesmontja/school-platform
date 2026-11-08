"use client";
import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Swal from "sweetalert2";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import ModalTindakLanjut, { STATUS_RENCANA, buktiRencana } from "@/components/nilai/ModalTindakLanjut";
import PanelWaOrtu from "@/components/nilai/PanelWaOrtu";
import { API_URL } from "@/app/lib/config";
import { useAkses } from "@/app/lib/akses";
import { tingkatKktp, tingkatNilai } from "@/app/lib/kktp";
import { galatJaringan, swalGagalMuat, sedangOffline, tambahAntrean } from "@/app/lib/antrean";
import { MenuAksi, aksiHapus, aksiUbah } from "@/components/dashboard/menuAksi";

const getToken = () => localStorage.getItem("token");

const DEFAULT_KKM = 75;
const ROWS_PER_PAGE = 10;

// Urutan pengisian filter, sekaligus daftar periksa saat lembar nilai belum tampil
const FILTER_FIELDS = [
  { key: "id_kelas", label: "Kelas", icon: "bi-building" },
  { key: "id_mapel", label: "Mata Pelajaran", icon: "bi-book" },
  { key: "id_periode", label: "Periode Akademik", icon: "bi-calendar3" },
  { key: "id_jenis", label: "Jenis Penilaian", icon: "bi-tag" },
  { key: "id_materi", label: "Topik / Materi", icon: "bi-list-check" },
  // Tanggal berbeda = penilaian berbeda (mis. ulangan harian minggu 1 dan minggu 2 untuk materi yang sama)
  { key: "tanggal", label: "Tanggal Penilaian", icon: "bi-calendar-event" },
];

// Reguler: penilaian biasa. Remedial: nilai perbaikan bagi siswa yang punya rencana tindak lanjut.
const TIPE_PENILAIAN = [
  { key: "NORMAL", label: "Reguler", icon: "bi-pencil-square" },
  { key: "REMEDIAL", label: "Remedial", icon: "bi-life-preserver" },
];


// Tanggal lokal (YYYY-MM-DD); toISOString() memakai UTC sehingga pagi hari di WIB/WIT masih tanggal kemarin
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const emptyFilters = () => ({ id_kelas: "", id_mapel: "", id_periode: "", id_jenis: "", id_materi: "", tanggal: todayLocal(), tipe: "NORMAL" });

const formatTanggal = (str) => {
  if (!str) return "-";
  // Parse sebagai tanggal lokal agar tidak bergeser zona waktu
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

const formatAngka = (v) => (Number.isInteger(v) ? v : Number(v).toFixed(1));
const kkmMapel = (mapel) => Number(mapel?.kkm ?? DEFAULT_KKM);

// "" = kosong (tidak dinilai), null = tidak valid, angka = valid
const parseNilai = (raw) => {
  const str = String(raw ?? "").trim();
  if (str === "") return "";
  const v = Number(str.replace(",", "."));
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
};

const labelMapel = (m) => `${m.nama_mapel}${m.guru?.nama_guru ? ` — ${m.guru.nama_guru}` : ""} (KKM ${kkmMapel(m)})`;
const labelMateri = (m) => `${m.nama_materi}${m.kategori?.nama_kategori ? ` [${m.kategori.nama_kategori}]` : ""}`;
// Nilai per indikator yang terisi (angka) → { id_indikator: nilai }
const petaIndikator = (input, ids) => Object.fromEntries(ids.map((id) => [id, parseNilai(input?.[id])]).filter(([, v]) => typeof v === "number"));
const samaPeta = (a = {}, b = {}) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Number(a[k]) === Number(b[k]));
};
// Guru penilai (Master Guru); nama akun pengisi disebut bila berbeda, mis. admin yang mengisi atas nama guru
const namaGuru = (r) => r.guru?.nama_guru || r.id_guru || "-";
const pengisiLain = (r) => (r.pengisi?.name && r.pengisi.name !== r.guru?.nama_guru ? r.pengisi.name : null);
const singkat = (teks, n = 28) => (teks.length > n ? `${teks.slice(0, n - 1)}…` : teks);
const labelPeriode = (p) => (p ? `${p.tahun_ajaran} (${p.semester})` : "-");

// --- KOMPONEN KECIL ---
const InfoBox = ({ icon, color, label, children }) => (
  <div className="col-6 col-xl-3">
    <div className="info-box shadow-sm mb-0 h-100">
      <span className={`info-box-icon text-bg-${color} shadow-sm`}><i className={`bi ${icon}`}></i></span>
      <div className="info-box-content">
        <span className="info-box-text small text-truncate">{label}</span>
        {children}
      </div>
    </div>
  </div>
);

// Tingkat capaian mengikuti KKTP sekolah; tuntas mengikuti KKM mapel
const StatusBadge = ({ nilai, kkm, tingkat }) => {
  if (nilai === "") return <span className="badge text-bg-light border text-muted">Belum dinilai</span>;
  if (nilai === null) return <span className="badge text-bg-danger"><i className="bi bi-exclamation-circle me-1"></i>Tidak valid</span>;
  const kat = tingkatNilai(nilai, tingkat);
  return (
    <div className="d-flex flex-wrap justify-content-center gap-1">
      <span className={`badge bg-${kat.color}-subtle text-${kat.color}-emphasis border border-${kat.color}-subtle`}>{kat.label}</span>
      {nilai >= kkm
        ? <span className="badge text-bg-success"><i className="bi bi-check-lg me-1"></i>Tuntas</span>
        : <span className="badge text-bg-danger"><i className="bi bi-x-lg me-1"></i>Belum Tuntas</span>}
    </div>
  );
};

// Status tindak lanjut sebuah nilai: rencana yang sedang berjalan / sudah selesai beserta nilai remedialnya
const RencanaBadge = ({ rencana, kkm }) => {
  const st = STATUS_RENCANA[rencana.status] || STATUS_RENCANA.DIRENCANAKAN;
  const rem = rencana.nilai_remedial;
  return (
    <div className="d-flex flex-column align-items-center gap-1">
      <span className={`badge text-bg-${st.warna}`}>
        <i className={`bi ${st.ikon} me-1`}></i>{st.label}
        {buktiRencana(rencana) && <i className="bi bi-paperclip ms-1" title="Ada bukti pelaksanaan" aria-label="Ada bukti pelaksanaan"></i>}
      </span>
      <small className="text-muted lh-sm text-center">
        {rencana.opsi_tindakan} · {formatTanggal(rencana.tanggal_rencana)}
        {rem && <> · nilai <b className={Number(rem.nilai) >= kkm ? "text-success" : "text-danger"}>{formatAngka(Number(rem.nilai))}</b></>}
      </small>
    </div>
  );
};

export default function InputNilaiPageBungkus() {
  // useSearchParams perlu Suspense; tautan "Buka" dari Perlu Tindakan membawa parameter lembar & siswa
  return <Suspense fallback={null}><InputNilaiPage /></Suspense>;
}

function InputNilaiPage() {
  const router = useRouter();
  const params = useSearchParams();

  // --- DATA REFERENSI ---
  const [options, setOptions] = useState({ periodes: [], classes: [], subjects: [], mbks: [] });
  const [materis, setMateris] = useState([]);
  const [settings, setSettings] = useState(null);
  const KATEGORI = useMemo(() => tingkatKktp(settings), [settings]);

  // --- LEMBAR NILAI ---
  const [filters, setFilters] = useState(emptyFilters);
  const [students, setStudents] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [tanggalTersedia, setTanggalTersedia] = useState([]);
  const [tindakLanjut, setTindakLanjut] = useState(null); // target ModalTindakLanjut
  const [panelWa, setPanelWa] = useState(null); // { jenis, idRencana, catatan } untuk PanelWaOrtu
  const [kabariHasil, setKabariHasil] = useState(true);
  // Indikator (IKTP) yang dinilai pada lembar reguler; kosong = nilai diisi langsung
  const [indikatorDipilih, setIndikatorDipilih] = useState([]);
  const [indikatorSesi, setIndikatorSesi] = useState([]);
  const [terisiOtomatis, setTerisiOtomatis] = useState(null); // { jadwal, mulai } bila parameter diisi dari jadwal/mapel guru
  // Dari Perlu Tindakan: siswa yang disorot di lembar, atau nilai yang ditampilkan di Riwayat bila lembarnya tidak tunggal
  const [sorot, setSorot] = useState(null); // { siswa: Set, nilai: Set, lembar: bool, digulir: bool }
  const riwayatRef = useRef(null);
  const { isAdmin, isGuru } = useAkses();
  const filterCardRef = useRef(null);

  // --- RIWAYAT ---
  const [riwayat, setRiwayat] = useState([]);
  const [loadingRiwayat, setLoadingRiwayat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState("tanggal");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const safeFetch = async (url, opts = {}) => {
    const res = await fetch(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } });
    if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan login ulang."); }
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error(`Respon server tidak valid. Status: ${res.status}`); }
    if (!res.ok) {
      const firstError = data.errors ? Object.values(data.errors)[0]?.[0] : null;
      throw new Error(firstError || data.message || "Terjadi kesalahan pada server");
    }
    return data;
  };

  const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

  // --- TURUNAN ---
  const mapelTerpilih = options.subjects.find((m) => m.id_mapel === filters.id_mapel);
  // Aktivitas berjenis Diagnostik: pemetaan kemampuan awal, tidak masuk rapor dan tidak ditindaklanjuti remedial
  const diagnostik = options.mbks.find((m) => m.id_jenis === filters.id_jenis)?.jenis_asesmen === "DIAGNOSTIK";
  const kelasTerpilih = options.classes.find((k) => k.id_kelas === filters.id_kelas);
  const periodeTerpilih = options.periodes.find((p) => p.id_periode === filters.id_periode);
  const kkm = kkmMapel(mapelTerpilih);
  const filterLengkap = FILTER_FIELDS.every((f) => filters[f.key]);
  const modeRemedial = filters.tipe === "REMEDIAL";
  // Hanya lembar reguler yang dibuka per tanggal; di lembar remedial tanggal = tanggal pelaksanaan saat disimpan
  const tanggalLembar = modeRemedial ? "" : filters.tanggal;

  // Indikator materi terpilih: yang aktif + yang pernah dinilai di sesi ini (walau kini nonaktif)
  const materiTerpilih = materis.find((m) => m.id_materi === filters.id_materi);
  const daftarIndikator = useMemo(() => {
    const peta = new Map();
    [...(materiTerpilih?.indikator || []), ...indikatorSesi].forEach((i) => { if (!peta.has(i.id_indikator)) peta.set(i.id_indikator, i); });
    return [...peta.values()].sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
  }, [materiTerpilih, indikatorSesi]);
  // Lembar remedial: kolom untuk indikator yang belum mencapai KKM pada nilai asal siswa mana pun
  const indikatorRemedial = useMemo(() => {
    if (!modeRemedial) return [];
    const peta = new Map();
    students.filter((s) => s.tipe === "REMEDIAL").forEach((s) => (s.asalIndikator || []).forEach((i) => {
      if (Number(i.nilai) < kkm && !peta.has(i.id_indikator)) {
        peta.set(i.id_indikator, { id_indikator: i.id_indikator, deskripsi: i.indikator?.deskripsi || i.id_indikator, urutan: i.indikator?.urutan ?? 0 });
      }
    }));
    return [...peta.values()].sort((a, b) => a.urutan - b.urutan);
  }, [students, modeRemedial, kkm]);
  const pakaiIndikator = modeRemedial ? indikatorRemedial.length > 0 : indikatorDipilih.length > 0;
  const kolomIndikator = modeRemedial ? indikatorRemedial : daftarIndikator.filter((i) => indikatorDipilih.includes(i.id_indikator));
  const nomorIndikator = (id) => (daftarIndikator.findIndex((i) => i.id_indikator === id) + 1) || (kolomIndikator.findIndex((i) => i.id_indikator === id) + 1);

  // Baris lembar mode lain (sebelum data mode baru selesai dimuat) tidak ditampilkan
  const rows = useMemo(() => students.filter((s) => s.tipe === filters.tipe).map((s) => {
    const awalIndikator = s.nilai_indikator || {};
    if (s.tipe === "REMEDIAL" && s.asalIndikator?.length) {
      // Indikator yang diulang menggantikan nilai asalnya; nilai remedial = rata-rata seluruh indikator setelah perbaikan
      const asal = Object.fromEntries(s.asalIndikator.map((i) => [i.id_indikator, Number(i.nilai)]));
      const lemah = s.asalIndikator.filter((i) => Number(i.nilai) < kkm).map((i) => i.id_indikator);
      const isian = lemah.map((id) => [id, parseNilai(s.inputIndikator?.[id])]);
      const salah = isian.some(([, v]) => v === null);
      const peta = petaIndikator(s.inputIndikator, lemah);
      const gabungan = Object.values({ ...asal, ...peta });
      const nilai = salah ? null : Object.keys(peta).length ? Math.round((gabungan.reduce((a, b) => a + b, 0) / gabungan.length) * 100) / 100 : "";
      return { ...s, parsed: nilai, petaIndikator: peta, lemah, asalPeta: asal,
        salahIndikator: Object.fromEntries(isian.filter(([, v]) => v === null)),
        berubah: !salah && Object.keys(peta).length > 0 && !samaPeta(peta, awalIndikator) };
    }
    if (pakaiIndikator && s.tipe === "NORMAL") {
      // Nilai materi = rata-rata indikator yang diisi
      const isian = indikatorDipilih.map((id) => [id, parseNilai(s.inputIndikator?.[id])]);
      const salah = isian.some(([, v]) => v === null);
      const peta = petaIndikator(s.inputIndikator, indikatorDipilih);
      const angka = Object.values(peta);
      const nilai = salah ? null : angka.length ? Math.round((angka.reduce((a, b) => a + b, 0) / angka.length) * 100) / 100 : "";
      return { ...s, parsed: nilai, petaIndikator: peta, salahIndikator: Object.fromEntries(isian.filter(([, v]) => v === null)),
        berubah: !salah && (angka.length > 0 || !!s.id_nilai) && !samaPeta(peta, awalIndikator) };
    }
    const nilai = parseNilai(s.inputNilai);
    const awal = s.nilai === null ? "" : s.nilai;
    // Beralih dari nilai per indikator ke nilai langsung juga dihitung perubahan (data indikator akan dibuang)
    return { ...s, parsed: nilai, berubah: nilai !== awal || (typeof nilai === "number" && Object.keys(awalIndikator).length > 0) };
  }), [students, filters.tipe, pakaiIndikator, indikatorDipilih, kkm]);

  const jumlahBerubah = rows.filter((r) => r.berubah).length;
  const adaTidakValid = rows.some((r) => r.parsed === null);
  const jumlahTercatat = rows.filter((s) => s.id_nilai).length;
  // Nilai tersimpan di bawah KKM yang belum punya rencana tindak lanjut
  const perluTindakLanjut = modeRemedial || diagnostik ? [] : rows.filter((r) => r.id_nilai && !r.berubah && r.nilai < kkm && !r.rencana);

  // --- FETCH ---
  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    (async () => {
      try {
        const [resF, resS] = await Promise.all([
          safeFetch(`${API_URL}/nilai/filters`, { headers: authHeader() }),
          safeFetch(`${API_URL}/settings`, { headers: authHeader() }),
        ]);
        setOptions({ periodes: resF.periodes || [], classes: resF.classes || [], subjects: resF.subjects || [], mbks: resF.mbks || [] });
        setSettings(resS || null);
        const aktif = (resF.periodes || []).find((p) => p.status_aktif === "AKTIF");
        if (aktif) setFilters((f) => ({ ...f, id_periode: f.id_periode || aktif.id_periode }));
        // Guru: kelas, mapel & materi dari jadwalnya hari ini; bila tidak ada, mapel satu-satunya yang diampu
        const mapel = resF.subjects || [];
        const saran = resF.saran && mapel.some((m) => m.id_mapel === resF.saran.id_mapel) ? resF.saran : null;
        const isi = saran ? { id_kelas: saran.id_kelas, id_mapel: saran.id_mapel, id_materi: saran.id_materi || "" }
          : mapel.length === 1 ? { id_mapel: mapel[0].id_mapel } : null;
        if (isi) {
          setFilters((f) => (f.id_kelas || f.id_mapel ? f : { ...f, ...isi }));
          setTerisiOtomatis(saran ? { jadwal: true, mulai: saran.mulai, materi: !!saran.id_materi } : { jadwal: false });
        }
      } catch (err) { swalGagalMuat(err); }
    })();
  }, []);

  // Tautan langsung (?id_kelas=&id_mapel=&...&siswa=&nilai=): buka lembarnya, lalu sorot siswanya
  useEffect(() => {
    if (!options.periodes.length || !params.get("id_kelas")) return;
    const patch = {};
    ["id_kelas", "id_mapel", "id_periode", "id_jenis", "id_materi", "tanggal"].forEach((k) => { if (params.get(k)) patch[k] = params.get(k); });
    patch.tipe = params.get("tipe") === "REMEDIAL" ? "REMEDIAL" : "NORMAL";
    const daftar = (k) => new Set((params.get(k) || "").split(",").filter(Boolean));
    setEditId(null);
    setTerisiOtomatis(null);
    setFilters((f) => ({ ...emptyFilters(), id_periode: f.id_periode, ...patch }));
    // Lembar tunggal: periode boleh dari periode aktif, dan lembar remedial tidak bergantung tanggal
    const lembar = FILTER_FIELDS.every((f) => patch[f.key] || f.key === "id_periode" || (f.key === "tanggal" && patch.tipe === "REMEDIAL"));
    setSorot({ siswa: daftar("siswa"), nilai: daftar("nilai"), lembar, digulir: false });
  }, [params, options.periodes.length]);

  // Materi bergantung pada kelas + mapel + periode
  useEffect(() => {
    const { id_kelas, id_mapel, id_periode } = filters;
    if (!id_kelas || !id_mapel) { setMateris([]); return; }
    let batal = false;
    (async () => {
      try {
        const params = new URLSearchParams({ id_kelas, id_mapel, ...(id_periode && { id_periode }) });
        const data = await safeFetch(`${API_URL}/nilai/materi?${params}`, { headers: authHeader() });
        if (batal) return;
        const list = data.data || [];
        setMateris(list);
        setFilters((f) => (f.id_materi && !list.some((m) => m.id_materi === f.id_materi) ? { ...f, id_materi: "" } : f));
      } catch (err) { if (!batal) setMateris([]); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_mapel, filters.id_periode]);

  // Lembar reguler: baris per siswa (key = id_siswa). Lembar remedial: baris per rencana tindak lanjut (key = id_rencana),
  // nilai yang diisi adalah nilai remedialnya.
  // Pilihan bisa berganti sebelum lembar sebelumnya selesai dimuat: hanya jawaban permintaan terakhir yang dipakai
  const permintaanLembar = useRef(0);
  const permintaanRiwayat = useRef(0);

  const fetchStudents = useCallback(async () => {
    const ke = ++permintaanLembar.current;
    const usang = () => ke !== permintaanLembar.current;
    if (!FILTER_FIELDS.every((f) => filters[f.key])) { setStudents([]); setTanggalTersedia([]); setLoadingSheet(false); return; }
    setLoadingSheet(true);
    try {
      const params = new URLSearchParams({
        id_kelas: filters.id_kelas, id_mapel: filters.id_mapel, id_periode: filters.id_periode,
        id_jenis: filters.id_jenis, id_materi: filters.id_materi,
      });
      if (filters.tipe === "REMEDIAL") {
        const data = await safeFetch(`${API_URL}/nilai/remedial?${params}`, { headers: authHeader() });
        if (usang()) return;
        setStudents((data.data || []).map((r) => {
          const rem = r.nilai_remedial;
          return {
            tipe: "REMEDIAL", key: r.id_rencana, id_siswa: r.id_siswa, nisn: r.siswa?.nisn, nama_siswa: r.siswa?.nama_siswa || r.id_siswa,
            rencana: r, nilaiAsal: r.nilai_asal,
            // Nilai indikator asal (detail) dan nilai indikator remedial yang sudah tercatat
            asalIndikator: r.nilai_asal?.nilai_indikator || [],
            nilai_indikator: Object.fromEntries((rem?.nilai_indikator || []).map((i) => [i.id_indikator, Number(i.nilai)])),
            inputIndikator: Object.fromEntries((rem?.nilai_indikator || []).map((i) => [i.id_indikator, Number(i.nilai)])),
            id_nilai: rem?.id_nilai || null, nilai: rem ? Number(rem.nilai) : null, tanggal: rem?.tanggal?.slice(0, 10) || null,
            inputNilai: rem ? Number(rem.nilai) : "",
          };
        }));
        setTanggalTersedia([]);
      } else {
        params.set("tanggal", tanggalLembar);
        const data = await safeFetch(`${API_URL}/nilai/students?${params}`, { headers: authHeader() });
        if (usang()) return;
        setStudents((data.students || []).map((s) => ({
          ...s, tipe: "NORMAL", key: s.id_siswa, inputNilai: s.nilai ?? "", inputIndikator: { ...(s.nilai_indikator || {}) },
        })));
        setTanggalTersedia(data.tanggal_tersedia || []);
        // Penilaian tersimpan membuka kembali indikator yang dipakainya; penilaian baru mulai tanpa indikator
        setIndikatorSesi(data.indikator_sesi || []);
        setIndikatorDipilih((data.indikator_sesi || []).map((i) => i.id_indikator));
      }
    } catch (err) { if (!usang()) swalGagalMuat(err); }
    finally { if (!usang()) setLoadingSheet(false); }
  }, [filters.id_kelas, filters.id_mapel, filters.id_periode, filters.id_jenis, filters.id_materi, tanggalLembar, filters.tipe]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const fetchRiwayat = useCallback(async () => {
    const ke = ++permintaanRiwayat.current;
    const usang = () => ke !== permintaanRiwayat.current;
    if (!filters.id_kelas || !filters.id_periode) { setRiwayat([]); setLoadingRiwayat(false); return; }
    setLoadingRiwayat(true);
    try {
      const params = new URLSearchParams({ id_kelas: filters.id_kelas, id_periode: filters.id_periode });
      const data = await safeFetch(`${API_URL}/nilai?${params}`, { headers: authHeader() });
      if (!usang()) setRiwayat(data.data || []);
    } catch (err) { if (!usang()) swalGagalMuat(err); }
    finally { if (!usang()) setLoadingRiwayat(false); }
  }, [filters.id_kelas, filters.id_periode]);

  useEffect(() => { fetchRiwayat(); setPage(1); }, [fetchRiwayat]);

  useEffect(() => {
    if (!sorot || sorot.digulir) return;
    if (sorot.lembar ? loadingSheet || !students.length : loadingRiwayat || !riwayat.length) return;
    const el = sorot.lembar ? document.querySelector("tr.nilai-sorot") : riwayatRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: sorot.lembar ? "center" : "start" });
    setSorot((x) => ({ ...x, digulir: true }));
  }, [sorot, loadingSheet, students.length, loadingRiwayat, riwayat.length]);

  // Peringatan saat meninggalkan halaman dengan nilai yang belum disimpan
  useEffect(() => {
    if (jumlahBerubah === 0) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    // Link Next.js (menu sidebar) tidak memicu beforeunload; klik dicegat di fase capture sebelum sampai ke React
    const onLinkClick = async (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      if (await konfirmasiBuangPerubahan()) router.push(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", handler);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handler);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [jumlahBerubah]);

  // --- FILTER ---
  const konfirmasiBuangPerubahan = async () => {
    if (jumlahBerubah === 0) return true;
    const res = await Swal.fire({
      title: "Buang perubahan?",
      text: `${jumlahBerubah} nilai belum disimpan dan akan hilang.`,
      icon: "warning", showCancelButton: true,
      confirmButtonText: "Ya, buang", cancelButtonText: "Kembali", confirmButtonColor: "#dc3545",
    });
    return res.isConfirmed;
  };

  const ubahFilter = async (patch) => {
    // Lembar reguler bergantung pada tanggal; di lembar remedial tanggal hanya menjadi tanggal pelaksanaan
    const memuatUlang = Object.keys(patch).some((k) => k !== "tanggal" || filters.tipe === "NORMAL");
    if (memuatUlang && !(await konfirmasiBuangPerubahan())) return;
    // Mengganti parameter berarti membuka lembar lain, bukan lagi penilaian yang sedang diedit
    if (memuatUlang) { setEditId(null); setSorot(null); }
    if ("id_kelas" in patch || "id_mapel" in patch) setTerisiOtomatis(null);
    setFilters((f) => ({ ...f, ...patch }));
  };

  // --- LEMBAR NILAI ---
  const handleInput = (key, val) => {
    setStudents((prev) => prev.map((s) => (s.key === key ? { ...s, inputNilai: val } : s)));
  };
  const handleInputIndikator = (key, id, val) => {
    setStudents((prev) => prev.map((s) => (s.key === key ? { ...s, inputIndikator: { ...s.inputIndikator, [id]: val } } : s)));
  };

  const pilihIndikator = (id) =>
    setIndikatorDipilih((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Tambah indikator "sambil jalan" ke materi terpilih, lalu langsung dinilai
  const tambahIndikator = async () => {
    const { value: deskripsi } = await Swal.fire({
      title: "Indikator baru", input: "textarea", inputLabel: materiTerpilih?.nama_materi,
      inputPlaceholder: "Contoh: Peserta didik dapat membandingkan dua pecahan berpenyebut beda",
      showCancelButton: true, confirmButtonText: "Tambah & nilai", cancelButtonText: "Batal",
      inputValidator: (v) => (!v?.trim() ? "Tulis deskripsi indikator" : undefined),
    });
    if (!deskripsi) return;
    try {
      const data = await safeFetch(`${API_URL}/indikator`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ id_materi: filters.id_materi, deskripsi }),
      });
      const baru = data.data;
      setMateris((prev) => prev.map((m) => (m.id_materi === filters.id_materi ? { ...m, indikator: [...(m.indikator || []), baru] } : m)));
      setIndikatorDipilih((prev) => [...prev, baru.id_indikator]);
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const bukaTindakLanjut = (items, kkmTarget = kkm) => setTindakLanjut({ mode: "baru", items, kkm: kkmTarget });
  const ubahTindakLanjut = (rencana, item, kkmTarget = kkm) => setTindakLanjut({ mode: "ubah", rencana, item, kkm: kkmTarget });
  const selesaiTindakLanjut = (notifikasi) => {
    setTindakLanjut(null);
    if (notifikasi?.idRencana?.length) setPanelWa(notifikasi);
    fetchStudents();
    fetchRiwayat();
  };

  // Enter / panah bawah pindah ke siswa berikutnya, panah atas ke sebelumnya
  const handleKeyDown = (e, idx, kolom = 0) => {
    const arah = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!arah) return;
    e.preventDefault();
    const next = document.querySelector(`input[data-nilai-idx="${kolom}-${idx + arah}"]`);
    if (next) { next.focus(); next.select(); }
  };

  const handleReset = () => {
    setStudents((prev) => prev.map((s) => ({ ...s, inputNilai: s.nilai ?? "", inputIndikator: { ...(s.nilai_indikator || {}) } })));
    setIndikatorDipilih(indikatorSesi.map((i) => i.id_indikator));
  };

  const statistik = useMemo(() => {
    const terisi = rows.map((r) => r.parsed).filter((v) => typeof v === "number");
    const n = terisi.length;
    const tuntas = terisi.filter((v) => v >= kkm).length;
    const distribusi = Object.fromEntries(KATEGORI.map((k) => [k.key, 0]));
    terisi.forEach((v) => { distribusi[tingkatNilai(v, KATEGORI).key]++; });
    return {
      total: rows.length, terisi: n, tuntas, distribusi,
      rata: n ? terisi.reduce((a, b) => a + b, 0) / n : 0,
      max: n ? Math.max(...terisi) : 0,
      min: n ? Math.min(...terisi) : 0,
      persenTuntas: n ? Math.round((tuntas / n) * 100) : 0,
      persenTerisi: rows.length ? Math.round((n / rows.length) * 100) : 0,
    };
  }, [rows, kkm, KATEGORI]);

  const cancelEdit = () => {
    setEditId(null);
    setFilters((f) => ({ ...f, id_materi: "", tanggal: todayLocal(), tipe: "NORMAL" }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    if (!filters.tanggal) return Swal.fire("Perhatian", "Tanggal penilaian wajib diisi.", "warning");
    if (adaTidakValid) return Swal.fire("Nilai Tidak Valid", "Periksa kembali isian bertanda merah. Nilai harus berupa angka 0 – 100.", "warning");
    const indikatorDibuang = !modeRemedial && rows.some((r) => r.id_nilai && Object.keys(r.nilai_indikator || {}).some((id) => !indikatorDipilih.includes(id)));
    if (indikatorDibuang) {
      const res = await Swal.fire({
        title: "Ada indikator yang tidak lagi dinilai",
        html: "Nilai indikator yang tidak dipilih akan <b>dihapus</b> dari penilaian ini, dan nilai siswa dihitung ulang dari indikator yang tersisa.",
        icon: "warning", showCancelButton: true, confirmButtonText: "Lanjut simpan", cancelButtonText: "Kembali",
      });
      if (!res.isConfirmed) return;
    }

    // Remedial hanya mengirim baris yang diubah, agar tanggal nilai remedial lain tidak ikut tergeser
    const records = rows
      .filter((r) => typeof r.parsed === "number" && (!modeRemedial || r.berubah))
      .map((r) => ({
        id_siswa: r.id_siswa, nilai: r.parsed,
        ...(modeRemedial && { id_rencana: r.key }),
        ...(r.petaIndikator && Object.keys(r.petaIndikator).length > 0 && { nilai_indikator: r.petaIndikator }),
      }));
    if (records.length === 0) {
      return Swal.fire("Kosong", modeRemedial ? "Belum ada nilai remedial yang diisi atau diubah." : pakaiIndikator ? "Isi minimal satu nilai indikator." : "Isi minimal satu nilai siswa.", "warning");
    }

    const dikosongkan = rows.filter((r) => r.parsed === "" && r.id_nilai).length;
    if (dikosongkan > 0) {
      const res = await Swal.fire({
        title: "Ada nilai yang dikosongkan",
        html: `${dikosongkan} siswa sudah punya nilai tetapi kini dikosongkan. Nilai lama mereka <b>tidak</b> ikut terhapus; gunakan tombol hapus di riwayat bila perlu.`,
        icon: "info", showCancelButton: true, confirmButtonText: "Lanjut simpan", cancelButtonText: "Kembali",
      });
      if (!res.isConfirmed) return;
    }

    const body = {
      id_kelas: filters.id_kelas, id_mapel: filters.id_mapel, id_periode: filters.id_periode,
      id_jenis: filters.id_jenis, id_materi: filters.id_materi, tanggal: filters.tanggal, tipe_nilai: filters.tipe, records,
    };
    // Tanpa sinyal: simpan di HP, dikirim otomatis saat tersambung (app/lib/antrean.js)
    const simpanOffline = async () => {
      await tambahAntrean({
        jenis: "nilai", url: `${API_URL}/nilai/batch`, body,
        label: `Nilai ${modeRemedial ? "remedial " : ""}${mapelTerpilih?.nama_mapel || ""} ${kelasTerpilih?.nama_kelas || ""} · ${records.length} siswa`,
      });
      // Isian yang sudah diantrekan dianggap tersimpan agar tidak diperingatkan sebagai perubahan
      const tersimpan = new Map(rows.filter((r) => typeof r.parsed === "number").map((r) => [r.key, r]));
      setStudents((prev) => prev.map((s) => {
        const r = tersimpan.get(s.key);
        return r ? { ...s, nilai: r.parsed, nilai_indikator: r.petaIndikator || s.nilai_indikator, menunggu: true } : s;
      }));
      Swal.fire({
        icon: "info", title: "Disimpan di HP",
        html: "Anda sedang offline. Nilai disimpan di perangkat ini dan <b>dikirim otomatis</b> saat tersambung lagi. Lihat ikon <i class=\"bi bi-cloud-upload\"></i> di atas.",
        confirmButtonText: "Mengerti",
      });
    };
    if (sedangOffline()) return simpanOffline();

    setSaving(true);
    try {
      let data;
      try {
        data = await safeFetch(`${API_URL}/nilai/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify(body),
        });
      } catch (err) {
        if (galatJaringan(err)) return await simpanOffline();
        throw err;
      }
      const belumTuntas = data.perlu_tindak_lanjut > 0
        ? `${data.perlu_tindak_lanjut} siswa masih di bawah KKM ${kkm}; atur tindak lanjut berikutnya lewat lembar nilai reguler atau riwayat.` : "";
      if (modeRemedial && kabariHasil) {
        setPanelWa({ jenis: "HASIL", idRencana: records.map((r) => r.id_rencana), catatan: `${data.message} ${belumTuntas}`.trim() });
      } else if (data.perlu_tindak_lanjut > 0) {
        Swal.fire({
          icon: "info", title: data.message,
          html: `<b>${data.perlu_tindak_lanjut}</b> siswa ${modeRemedial ? "masih" : ""} di bawah KKM ${kkm}. Atur rencana tindak lanjutnya lewat tombol <b>Tindak Lanjut</b> pada lembar nilai${modeRemedial ? " reguler atau riwayat" : ""}.`,
          confirmButtonText: "Mengerti",
        });
      } else {
        Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2500 });
      }
      if (editId) setEditId(null);
      await Promise.all([fetchStudents(), fetchRiwayat()]);
    } catch (err) { Swal.fire("Gagal Menyimpan", err.message, "error"); }
    finally { setSaving(false); }
  };

  // --- RIWAYAT ---
  const handleEdit = async (r) => {
    if (!(await konfirmasiBuangPerubahan())) return;
    setEditId(r.id_nilai);
    setTerisiOtomatis(null);
    setFilters({
      id_kelas: r.id_kelas, id_mapel: r.id_mapel, id_periode: r.id_periode,
      id_jenis: r.id_jenis, id_materi: r.id_materi, tanggal: String(r.tanggal).slice(0, 10),
      tipe: r.tipe_nilai === "REMEDIAL" ? "REMEDIAL" : "NORMAL",
    });
    filterCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (r) => {
    const res = await Swal.fire({
      title: "Hapus nilai ini?",
      html: `<b>${r.siswa?.nama_siswa || r.id_siswa}</b> — ${r.mapel?.nama_mapel || ""}, ${r.materi?.nama_materi || ""} (nilai ${formatAngka(Number(r.nilai))}).<br>${r.rencana ? "Rencana tindak lanjutnya ikut terhapus. " : ""}${r.tipe_nilai === "REMEDIAL" ? "Rencana remedialnya kembali berstatus Dalam Remedial. " : ""}Data yang dihapus tidak dapat dikembalikan.`,
      icon: "warning", showCancelButton: true,
      confirmButtonText: "Ya, hapus", cancelButtonText: "Batal", confirmButtonColor: "#dc3545",
    });
    if (!res.isConfirmed) return;
    try {
      const data = await safeFetch(`${API_URL}/nilai/${r.id_nilai}`, { method: "DELETE", headers: authHeader() });
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: data.message, showConfirmButton: false, timer: 2000 });
      if (editId === r.id_nilai) setEditId(null);
      fetchRiwayat();
      if (students.some((s) => s.id_nilai === r.id_nilai)) {
        // Pertahankan isian lain; siswa ini kembali berstatus belum dinilai
        setStudents((prev) => prev.map((s) => (s.id_nilai === r.id_nilai ? { ...s, id_nilai: null, nilai: null, inputNilai: "", rencana: modeRemedial ? s.rencana : null } : s)));
      }
    } catch (err) { Swal.fire("Gagal Menghapus", err.message, "error"); }
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col !== "tanggal" && col !== "nilai"); }
  };

  const filteredRiwayat = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cocok = (r) => [r.siswa?.nama_siswa, r.siswa?.nisn, r.mapel?.nama_mapel, r.jenis?.kategori_penilaian, r.materi?.nama_materi, r.materi?.kategori?.nama_kategori, r.guru?.nama_guru, r.pengisi?.name]
      .some((v) => String(v ?? "").toLowerCase().includes(q));
    const nilaiSort = {
      tanggal: (r) => String(r.tanggal),
      siswa: (r) => (r.siswa?.nama_siswa || "").toLowerCase(),
      mapel: (r) => (r.mapel?.nama_mapel || "").toLowerCase(),
      jenis: (r) => (r.jenis?.kategori_penilaian || "").toLowerCase(),
      nilai: (r) => Number(r.nilai),
      guru: (r) => namaGuru(r).toLowerCase(),
    }[sortCol];
    const dariTautan = sorot && !sorot.lembar && sorot.nilai.size ? (r) => sorot.nilai.has(r.id_nilai) : () => true;
    return riwayat.filter((r) => (!q || cocok(r)) && dariTautan(r)).sort((a, b) => {
      const va = nilaiSort(a), vb = nilaiSort(b);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [riwayat, searchQuery, sortCol, sortAsc, sorot]);

  const totalPages = Math.max(1, Math.ceil(filteredRiwayat.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRiwayat.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  // --- EKSPOR ---
  const namaKelas = kelasTerpilih?.nama_kelas || "Kelas";
  const namaFileEkspor = `Rekap_Nilai_${namaKelas.replace(/\s+/g, "_")}_${todayLocal()}`;

  const exportRows = () => filteredRiwayat.map((r, i) => {
    const kkmR = kkmMapel(r.mapel);
    const v = Number(r.nilai);
    return {
      "No": i + 1,
      "Tanggal": formatTanggal(r.tanggal),
      "NISN": r.siswa?.nisn || r.id_siswa,
      "Nama Siswa": r.siswa?.nama_siswa || r.id_siswa,
      "Mata Pelajaran": r.mapel?.nama_mapel || r.id_mapel,
      "Jenis": r.jenis?.kategori_penilaian || r.id_jenis,
      "Materi": r.materi?.nama_materi || r.id_materi,
      "High Level": r.materi?.kategori?.nama_kategori || "-",
      "Nilai Indikator": (r.nilai_indikator || []).map((i) => `${i.indikator?.deskripsi || i.id_indikator}: ${formatAngka(Number(i.nilai))}`).join("; ") || "-",
      "KKM": kkmR,
      "Nilai": formatAngka(v),
      "Ketuntasan": v >= kkmR ? "TUNTAS" : "BELUM TUNTAS",
      "Tipe": r.tipe_nilai === "REMEDIAL" ? "Remedial" : "Reguler",
      "Tindak Lanjut": r.rencana ? `${r.rencana.opsi_tindakan} (${STATUS_RENCANA[r.rencana.status]?.label || r.rencana.status})` : "-",
      "Guru": namaGuru(r),
      "Diisi Oleh": r.pengisi?.name || "-",
    };
  });

  const adaData = () => {
    if (!filters.id_kelas) { Swal.fire("Pilih Kelas", "Pilih kelas terlebih dahulu untuk mengekspor riwayat nilai.", "info"); return false; }
    if (filteredRiwayat.length === 0) { Swal.fire("Kosong", "Belum ada data nilai untuk diekspor.", "info"); return false; }
    return true;
  };

  const handleExportExcel = async () => {
    if (!adaData()) return;
    // Dimuat saat dibutuhkan agar halaman ringan di sinyal lemah
    const XLSX = await import("xlsx").catch(() => null);
    if (!XLSX) return Swal.fire("Perlu sinyal", "Ekspor Excel perlu sinyal internet saat pertama kali dipakai di perangkat ini.", "info");
    const ws = XLSX.utils.json_to_sheet(exportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai");
    XLSX.writeFile(wb, `${namaFileEkspor}.xlsx`);
  };

  const handleExportCSV = () => {
    if (!adaData()) return;
    const data = exportRows();
    const headers = Object.keys(data[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...data.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
    // BOM agar Excel membaca UTF-8 dengan benar
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${namaFileEkspor}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const getBase64ImageFromUrl = async (imageUrl) => {
    if (!imageUrl) return null;
    try {
      const response = await fetch(`${API_URL}/signature/${imageUrl.split("/").pop()}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (error) { return null; }
  };

  const handleExportPDF = async () => {
    if (!adaData()) return;
    const data = exportRows().map((r) => ({
      "No": r.No,
      "Tanggal": r.Tanggal,
      "Nama Siswa": r["Nama Siswa"],
      "Mapel": r["Mata Pelajaran"],
      "Jenis": r.Jenis,
      "Materi (High Level)": `${r.Materi}${r["High Level"] !== "-" ? ` (${r["High Level"]})` : ""}`,
      "KKM": r.KKM,
      "Nilai": r.Nilai,
      "Ketuntasan": r.Ketuntasan,
      "Pengisi": r.Pengisi,
    }));
    await generateProfessionalPDF(data, `Rekap Nilai ${namaKelas} - ${labelPeriode(periodeTerpilih)}`, settings, getBase64ImageFromUrl);
  };

  // --- RENDER HELPERS ---
  const sortHeader = (col, label, className = "") => (
    <th role="button" className={`text-nowrap user-select-none ${className}`} onClick={() => handleSort(col)}>
      {label}{" "}
      <i className={`bi ${sortCol === col ? (sortAsc ? "bi-sort-up text-primary" : "bi-sort-down text-primary") : "bi-arrow-down-up text-muted opacity-50"}`}></i>
    </th>
  );

  const selectField = (key, label, icon, list, valueKey, labelFn, placeholder, disabled = false) => (
    <div className="col-12 col-sm-6 col-lg-4">
      <label className="form-label fw-semibold small mb-1"><i className={`bi ${icon} text-primary me-1`}></i>{label}</label>
      <select className="form-select" value={filters[key]} disabled={disabled} onChange={(e) => ubahFilter({ [key]: e.target.value })}>
        <option value="">{placeholder}</option>
        {list.map((o) => <option key={o[valueKey]} value={o[valueKey]}>{labelFn(o)}</option>)}
      </select>
    </div>
  );

  const placeholderMateri = !filters.id_kelas ? "— Pilih kelas dulu —"
    : !filters.id_mapel ? "— Pilih mapel dulu —"
    : materis.length === 0 ? "— Belum ada materi untuk mapel ini —"
    : "— Pilih Materi —";

  const maxDistribusi = Math.max(1, ...Object.values(statistik.distribusi));

  return (
    <div className="container-fluid mb-5">
      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-pencil-square me-2"></i>Input Nilai Kelas</h3>
          <small className="text-muted">Pencatatan capaian akademik siswa berbasis materi dan dimensi STNKM</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><a href="/dashboard">Dashboard</a></li>
          <li className="breadcrumb-item">TDU - Jadwal</li>
          <li className="breadcrumb-item active" aria-current="page">Input Nilai</li>
        </ol>
      </div>

      {/* PARAMETER PENILAIAN */}
      <div ref={filterCardRef} className={`card card-outline ${editId ? "card-warning" : "card-primary"} shadow-sm mb-3`} style={{ scrollMarginTop: "1rem" }}>
        <div className="card-header">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <h3 className="card-title fw-semibold mb-0 me-auto">
              <i className="bi bi-funnel me-2"></i>Parameter Penilaian
            </h3>
            <div className="btn-group btn-group-sm" role="group" aria-label="Tipe penilaian">
              {TIPE_PENILAIAN.map((t) => (
                <button key={t.key} type="button"
                  className={`btn ${filters.tipe === t.key ? (t.key === "REMEDIAL" ? "btn-danger" : "btn-primary") : "btn-outline-secondary"}`}
                  onClick={() => filters.tipe !== t.key && ubahFilter({ tipe: t.key })}>
                  <i className={`bi ${t.icon} me-1`}></i>{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card-body">
          {terisiOtomatis && (
            <div className="small text-body-secondary mb-3" role="status">
              <i className="bi bi-magic text-primary me-1"></i>
              {terisiOtomatis.jadwal
                ? `Kelas, mapel${terisiOtomatis.materi ? ", dan materi" : ""} diisi dari jadwal Anda hari ini (pukul ${terisiOtomatis.mulai}). Ubah bila perlu.`
                : "Mata pelajaran diisi otomatis karena hanya satu mapel yang Anda ampu."}
            </div>
          )}
          <div className="row g-3">
            {selectField("id_kelas", "Kelas", "bi-building", options.classes, "id_kelas", (k) => k.nama_kelas, "— Pilih Kelas —")}
            {selectField("id_mapel", "Mata Pelajaran", "bi-book", options.subjects, "id_mapel", labelMapel, "— Pilih Mata Pelajaran —")}
            {selectField("id_periode", "Periode Akademik", "bi-calendar3", options.periodes, "id_periode",
              (p) => `${labelPeriode(p)}${p.status_aktif === "AKTIF" ? " • Aktif" : ""}`, "— Pilih Periode —")}
            {selectField("id_jenis", "Jenis Penilaian", "bi-tag", options.mbks, "id_jenis", (j) => j.kategori_penilaian, "— Pilih Jenis —")}
            {selectField("id_materi", "Topik / Materi", "bi-list-check", materis, "id_materi", labelMateri, placeholderMateri, materis.length === 0)}
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">
                <i className="bi bi-calendar-event text-primary me-1"></i>{modeRemedial ? "Tanggal Pelaksanaan Remedial" : "Tanggal Penilaian"}
              </label>
              <input type="date" className="form-control" value={filters.tanggal} required
                onChange={(e) => ubahFilter({ tanggal: e.target.value })} />
            </div>
          </div>
          {!modeRemedial && tanggalTersedia.length > 0 && (
            // Penilaian lain pada kombinasi yang sama; tanggal berbeda tersimpan sebagai data nilai tersendiri
            <div className="d-flex flex-wrap align-items-center gap-1 mt-3 small">
              <span className="text-muted me-1"><i className="bi bi-clock-history me-1"></i>Penilaian tersimpan:</span>
              {tanggalTersedia.map((t) => (
                <button key={t.tanggal} type="button" onClick={() => ubahFilter({ tanggal: t.tanggal })}
                  className={`btn btn-sm rounded-pill py-0 ${t.tanggal === filters.tanggal ? "btn-primary" : "btn-outline-primary"}`}>
                  {formatTanggal(t.tanggal)} <span className="opacity-75">({t.jumlah})</span>
                </button>
              ))}
              {!tanggalTersedia.some((t) => t.tanggal === filters.tanggal) && (
                <span className="badge text-bg-success ms-1"><i className="bi bi-plus-lg me-1"></i>Penilaian baru {formatTanggal(filters.tanggal)}</span>
              )}
            </div>
          )}
          {!modeRemedial && diagnostik && (
            <div className="alert alert-info small mt-3 mb-0 py-2">
              <i className="bi bi-clipboard2-pulse me-1"></i>
              <b>Asesmen diagnostik</b>: nilai ini memetakan kemampuan awal siswa, sehingga tidak masuk rapor, laporan, maupun remedial.
              Lihat pengelompokan siswa dan rekomendasi pembelajarannya di menu <Link href="/dashboard/diagnostik">Asesmen Diagnostik</Link>.
            </div>
          )}
          {modeRemedial && (
            <div className="alert alert-danger-subtle bg-danger-subtle border-danger-subtle small mt-3 mb-0 py-2">
              <i className="bi bi-life-preserver me-1"></i>
              Mode remedial memuat siswa yang punya rencana tindak lanjut pada penilaian ini. Nilai yang diisi dicatat sebagai nilai remedial,
              menuntaskan rencananya, dan menggantikan nilai asal pada rapor serta laporan.
              {pakaiIndikator && " Bila nilai asal dinilai per indikator, cukup isi indikator yang belum mencapai KKM; indikator yang sudah tuntas tetap memakai nilai asalnya."}
              <div className="form-check form-switch mt-2 mb-0">
                <input className="form-check-input" type="checkbox" id="kabariHasil" checked={kabariHasil} onChange={(e) => setKabariHasil(e.target.checked)} />
                <label className="form-check-label fw-semibold" htmlFor="kabariHasil">
                  <i className="bi bi-whatsapp text-success me-1"></i>Kabari orang tua/wali hasil remedialnya lewat WhatsApp setelah disimpan
                </label>
              </div>
            </div>
          )}
        </div>
        {editId && (
          <div className="card-footer bg-warning-subtle d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span className="fw-semibold text-warning-emphasis small">
              <i className="bi bi-pencil-square me-1"></i>Mode Edit: lembar di bawah memuat penilaian lama. Ubah nilainya, lalu simpan.
              {!modeRemedial && " Memilih tanggal lain membuka penilaian tanggal tersebut."}
            </span>
            <button type="button" className="btn btn-sm btn-outline-dark" onClick={cancelEdit}>
              <i className="bi bi-x-lg me-1"></i>Batalkan Edit
            </button>
          </div>
        )}
      </div>

      {!filterLengkap ? (
        // DAFTAR PERIKSA FILTER
        <div className="card shadow-sm mb-3">
          <div className="card-body text-center py-5">
            <i className="bi bi-clipboard-data display-5 text-primary opacity-50"></i>
            <h5 className="fw-semibold mt-3">Lengkapi parameter untuk membuka lembar nilai</h5>
            <div className="d-flex flex-wrap justify-content-center gap-2 mt-3">
              {FILTER_FIELDS.map((f) => (
                <span key={f.key} className={`badge rounded-pill px-3 py-2 ${filters[f.key] ? "text-bg-success" : "bg-body-secondary text-body-secondary border"}`}>
                  <i className={`bi ${filters[f.key] ? "bi-check-circle-fill" : f.icon} me-1`}></i>{f.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* PANEL ANALITIK */}
          <div className="card card-outline card-info shadow-sm mb-3">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-pie-chart me-2"></i>Analitik Kelas</h3>
              <span className="badge text-bg-secondary">KKM {kkm}</span>
              <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle">
                <i className="bi bi-lightning-charge-fill me-1"></i>Dihitung langsung
              </span>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <InfoBox icon="bi-graph-up" color="primary" label="Rata-rata Kelas">
                  <span className="info-box-number fs-5">{statistik.terisi ? statistik.rata.toFixed(1) : "–"}</span>
                  {statistik.terisi > 0 && (
                    <small className={statistik.rata >= kkm ? "text-success" : "text-danger"}>
                      {statistik.rata >= kkm ? "Di atas KKM" : "Di bawah KKM"}
                    </small>
                  )}
                </InfoBox>
                <InfoBox icon="bi-arrows-expand" color="info" label="Rentang Nilai">
                  <span className="info-box-number fs-6">
                    {statistik.terisi ? (
                      <>
                        <span className="text-success" title="Tertinggi"><i className="bi bi-caret-up-fill"></i>{formatAngka(statistik.max)}</span>
                        <span className="text-muted mx-1">/</span>
                        <span className="text-danger" title="Terendah"><i className="bi bi-caret-down-fill"></i>{formatAngka(statistik.min)}</span>
                      </>
                    ) : "–"}
                  </span>
                </InfoBox>
                <InfoBox icon="bi-patch-check" color="success" label="Ketuntasan KKM">
                  <span className="info-box-number fs-5">{statistik.persenTuntas}%</span>
                  <small className="text-muted">{statistik.tuntas} / {statistik.terisi} siswa tuntas</small>
                </InfoBox>
                <InfoBox icon="bi-hourglass-split" color="warning" label="Progres Input">
                  <span className="info-box-number fs-5">{statistik.terisi}/{statistik.total}</span>
                  <div className="progress mt-1" style={{ height: 4 }} role="progressbar" aria-valuenow={statistik.persenTerisi} aria-valuemin="0" aria-valuemax="100">
                    <div className="progress-bar bg-warning" style={{ width: `${statistik.persenTerisi}%` }}></div>
                  </div>
                </InfoBox>
              </div>

              <div className="row g-3 align-items-center mt-1 pt-3 border-top">
                <div className="col-12 col-md-7">
                  <small className="fw-semibold text-muted d-block mb-2"><i className="bi bi-layers me-1"></i>Distribusi Kategori Capaian</small>
                  <div className="d-flex flex-wrap gap-2">
                    {KATEGORI.map((k) => (
                      <span key={k.key} className={`badge text-bg-${k.color} p-2 fw-normal`}>
                        {k.label} ({k.range}): <b>{statistik.distribusi[k.key]}</b>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-md-5">
                  <div className="d-flex align-items-end justify-content-around gap-2 border-bottom" style={{ height: 110 }}>
                    {[...KATEGORI].reverse().map((k) => (
                      <div key={k.key} className="d-flex flex-column align-items-center justify-content-end h-100 flex-fill" style={{ maxWidth: 56 }}
                        title={`${k.label}: ${statistik.distribusi[k.key]} siswa`}>
                        <small className="fw-semibold">{statistik.distribusi[k.key]}</small>
                        <div className={`w-100 rounded-top bg-${k.color}`}
                          style={{ height: `${(statistik.distribusi[k.key] / maxDistribusi) * 80}%`, minHeight: 2, opacity: 0.8, transition: "height .3s ease" }}></div>
                      </div>
                    ))}
                  </div>
                  <div className="d-flex justify-content-around gap-2 mt-1">
                    {[...KATEGORI].reverse().map((k) => (
                      <small key={k.key} className="text-muted fw-semibold text-center flex-fill" style={{ maxWidth: 56, fontSize: 11 }}>{k.range}</small>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LEMBAR NILAI */}
          <form onSubmit={handleSave} className="card card-outline card-success shadow-sm mb-3">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto">
                <i className={`bi ${modeRemedial ? "bi-life-preserver text-danger" : "bi-people"} me-2`}></i>{modeRemedial ? "Lembar Nilai Remedial" : "Lembar Nilai"}
                <span className="text-muted fw-normal small ms-2">{mapelTerpilih?.nama_mapel} · {namaKelas}{!modeRemedial && ` · ${formatTanggal(filters.tanggal)}`}</span>
              </h3>
              {jumlahTercatat > 0 && (
                <span className="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle">
                  <i className="bi bi-database-check me-1"></i>{jumlahTercatat} nilai {modeRemedial ? "remedial " : ""}sudah tercatat
                </span>
              )}
              {perluTindakLanjut.length > 1 && (
                <button type="button" className="btn btn-sm btn-danger"
                  onClick={() => bukaTindakLanjut(perluTindakLanjut.map((r) => ({ id_nilai: r.id_nilai, nama_siswa: r.nama_siswa, nilai: r.nilai })))}>
                  <i className="bi bi-people-fill me-1"></i>Tindak Lanjut Kelompok ({perluTindakLanjut.length})
                </button>
              )}
            </div>
            {!modeRemedial && (
              // Indikator (IKTP) yang dinilai pada sesi ini; satu kolom nilai per indikator
              <div className="px-3 py-2 border-bottom bg-body-tertiary">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <small className="fw-semibold text-muted me-1"><i className="bi bi-list-check me-1"></i>Indikator dinilai:</small>
                  {daftarIndikator.length === 0 && <small className="text-muted fst-italic">Materi ini belum punya indikator; nilai diisi langsung.</small>}
                  {daftarIndikator.map((i) => {
                    const dipilih = indikatorDipilih.includes(i.id_indikator);
                    return (
                      <button key={i.id_indikator} type="button" title={i.deskripsi} onClick={() => pilihIndikator(i.id_indikator)}
                        className={`btn btn-sm rounded-pill text-start ${dipilih ? "btn-primary" : "btn-outline-secondary"}${i.aktif === false ? " opacity-75" : ""}`}>
                        <i className={`bi ${dipilih ? "bi-check2-square" : "bi-square"} me-1`}></i>
                        <b>{nomorIndikator(i.id_indikator)}.</b> {singkat(i.deskripsi, 40)}{i.aktif === false && " (nonaktif)"}
                      </button>
                    );
                  })}
                  {(isAdmin || isGuru) && filters.id_materi && (
                    <button type="button" className="btn btn-sm btn-outline-primary rounded-pill" onClick={tambahIndikator}>
                      <i className="bi bi-plus-lg me-1"></i>Indikator baru
                    </button>
                  )}
                </div>
                {pakaiIndikator && (
                  <small className="d-block text-muted mt-1">Nilai siswa = rata-rata indikator yang diisi. Kosongkan indikator yang tidak dinilai untuk siswa tertentu.</small>
                )}
              </div>
            )}
            <div className="card-body p-0">
              {loadingSheet ? (
                <div className="text-center py-5 text-muted"><div className="spinner-border text-success mb-2"></div><div>Memuat daftar siswa...</div></div>
              ) : rows.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  {modeRemedial ? (
                    <><i className="bi bi-emoji-smile fs-1 d-block mb-2"></i>Belum ada rencana tindak lanjut untuk penilaian ini.
                      <div className="small mt-1">Rencana dibuat dari tombol <b>Tindak Lanjut</b> pada lembar reguler bagi siswa yang belum mencapai KKM.</div></>
                  ) : (
                    <><i className="bi bi-person-x fs-1 d-block mb-2"></i>Belum ada siswa terdaftar pada kelas ini.</>
                  )}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="text-center" style={{ width: 56 }}>No</th>
                        <th>Nama Siswa</th>
                        {modeRemedial && <th className="text-center" style={{ width: 110 }}>Nilai Asal</th>}
                        {pakaiIndikator && kolomIndikator.map((i) => (
                          <th key={i.id_indikator} className="text-center" style={{ minWidth: 96 }} title={i.deskripsi}>
                            <span className="badge text-bg-primary">{nomorIndikator(i.id_indikator)}</span>
                            <div className="fw-normal small text-muted text-truncate" style={{ maxWidth: 120 }}>{singkat(i.deskripsi, 18)}</div>
                          </th>
                        ))}
                        <th className="text-center" style={{ width: pakaiIndikator ? 110 : 160 }}>
                          {modeRemedial ? "Nilai Remedial" : pakaiIndikator ? "Rata-rata" : "Nilai"} <span className="fw-normal text-muted">(0 – 100)</span>
                        </th>
                        <th className="text-center" style={{ minWidth: 190 }}>Predikat & Status</th>
                        {!modeRemedial && <th className="text-center" style={{ minWidth: 170 }}>Tindak Lanjut</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={r.key} className={r.berubah ? "table-warning" : sorot?.lembar && sorot.siswa.has(r.id_siswa) ? "table-info nilai-sorot" : ""}>
                          <td className="text-center fw-semibold text-muted">{idx + 1}</td>
                          <td>
                            <div className="fw-semibold">{r.nama_siswa}</div>
                            <small className="text-muted">NISN: {r.nisn || r.id_siswa}</small>
                            {r.menunggu && <small className="d-block text-warning-emphasis"><i className="bi bi-cloud-upload me-1"></i>Menunggu dikirim</small>}
                            {modeRemedial ? (
                              <small className="d-block text-danger-emphasis">
                                <i className="bi bi-signpost-split me-1"></i>{r.rencana.opsi_tindakan} · {formatTanggal(r.rencana.tanggal_rencana)}
                                {r.tanggal && <span className="text-muted"> · dicatat {formatTanggal(r.tanggal)}</span>}
                              </small>
                            ) : r.id_nilai && r.tanggal && r.tanggal !== filters.tanggal && (
                              <small className="text-muted d-block"><i className="bi bi-clock-history me-1"></i>Tercatat {formatTanggal(r.tanggal)}</small>
                            )}
                          </td>
                          {modeRemedial && (
                            <td className="text-center">
                              <span className="badge text-bg-danger">{formatAngka(Number(r.nilaiAsal?.nilai))}</span>
                              <small className="d-block text-muted">{formatTanggal(r.nilaiAsal?.tanggal)}</small>
                            </td>
                          )}
                          {pakaiIndikator && kolomIndikator.map((i, k) => (
                            <td key={i.id_indikator}>
                              {r.tipe === "REMEDIAL" && !r.lemah?.includes(i.id_indikator) ? (
                                // Indikator yang sudah tuntas atau tidak dinilai pada nilai asal tidak diulang
                                <div className="text-center small text-muted" title="Tidak diulang">
                                  {r.asalPeta?.[i.id_indikator] !== undefined ? <>{formatAngka(r.asalPeta[i.id_indikator])} <i className="bi bi-check2"></i></> : "–"}
                                </div>
                              ) : (
                              <input type="number" step="any" min="0" max="100" inputMode="decimal"
                                data-nilai-idx={`${k}-${idx}`}
                                className={`form-control form-control-sm text-center ${i.id_indikator in (r.salahIndikator || {}) ? "is-invalid" : ""}`}
                                value={r.inputIndikator?.[i.id_indikator] ?? ""} placeholder="–"
                                onChange={(e) => handleInputIndikator(r.key, i.id_indikator, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, idx, k)}
                                onFocus={(e) => e.target.select()}
                                aria-label={`Indikator ${nomorIndikator(i.id_indikator)} ${r.nama_siswa}`} />
                              )}
                            </td>
                          ))}
                          <td>
                            {pakaiIndikator && (r.tipe === "NORMAL" || r.asalIndikator?.length) ? (
                              <div className="text-center fw-bold fs-6" aria-label={`Nilai ${r.nama_siswa}`}>
                                {typeof r.parsed === "number" ? formatAngka(r.parsed) : <span className="text-muted fw-normal">–</span>}
                              </div>
                            ) : (
                              <input type="number" step="any" min="0" max="100" inputMode="decimal"
                                data-nilai-idx={`0-${idx}`}
                                className={`form-control text-center fw-bold ${r.parsed === null ? "is-invalid" : ""}`}
                                value={r.inputNilai} placeholder="Kosong"
                                onChange={(e) => handleInput(r.key, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, idx)}
                                onFocus={(e) => e.target.select()}
                                aria-label={`Nilai ${r.nama_siswa}`} />
                            )}
                          </td>
                          <td className="text-center"><StatusBadge nilai={r.parsed} kkm={kkm} tingkat={KATEGORI} /></td>
                          {!modeRemedial && (
                            <td className="text-center">
                              {r.rencana ? (
                                <button type="button" className="btn btn-link p-0 text-decoration-none" title="Lihat / ubah rencana"
                                  onClick={() => ubahTindakLanjut(r.rencana, { nama_siswa: r.nama_siswa, nilai: r.nilai })}>
                                  <RencanaBadge rencana={r.rencana} kkm={kkm} />
                                </button>
                              ) : typeof r.parsed === "number" && r.parsed < kkm && !diagnostik ? (
                                // Aktif setelah nilainya tersimpan, karena rencana ditautkan ke data nilai
                                <button type="button" className="btn btn-sm btn-outline-danger"
                                  disabled={!r.id_nilai || r.berubah}
                                  title={!r.id_nilai || r.berubah ? "Simpan nilai terlebih dahulu" : "Atur rencana tindak lanjut"}
                                  onClick={() => bukaTindakLanjut([{ id_nilai: r.id_nilai, nama_siswa: r.nama_siswa, nilai: r.nilai }])}>
                                  <i className="bi bi-life-preserver me-1"></i>Tindak Lanjut
                                </button>
                              ) : (
                                <span className="text-muted small">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {rows.length > 0 && (
              <div className="card-footer bg-body position-sticky bottom-0 d-flex flex-wrap align-items-center gap-2 border-top shadow-sm" style={{ zIndex: 2 }}>
                <small className="text-muted me-auto">
                  {jumlahBerubah > 0
                    ? <span className="text-warning-emphasis fw-semibold"><i className="bi bi-pencil me-1"></i>{jumlahBerubah} perubahan belum disimpan</span>
                    : <><i className="bi bi-keyboard me-1"></i>Kosongkan jika siswa tidak hadir. Tekan Enter untuk pindah ke siswa berikutnya.</>}
                </small>
                {jumlahBerubah > 0 && (
                  <button type="button" className="btn btn-outline-secondary" onClick={handleReset} disabled={saving}>
                    <i className="bi bi-arrow-counterclockwise me-1"></i>Reset
                  </button>
                )}
                <button type="submit" className="btn btn-success fw-semibold px-4" disabled={saving}>
                  {saving
                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Menyimpan...</>
                    : <><i className="bi bi-floppy me-1"></i>{modeRemedial ? "Simpan Nilai Remedial" : "Simpan Nilai Kelas"}</>}
                </button>
              </div>
            )}
          </form>
        </>
      )}

      {/* RIWAYAT INPUT NILAI */}
      <div ref={riwayatRef} className="card card-outline card-secondary shadow-sm" style={{ scrollMarginTop: "1rem" }}>
        <div className="card-header d-flex flex-wrap align-items-center gap-2">
          <h3 className="card-title fw-semibold mb-0 me-auto">
            <i className="bi bi-clock-history me-2"></i>Riwayat Input Nilai
            {filters.id_kelas && <span className="text-muted fw-normal small ms-2">{namaKelas} · {labelPeriode(periodeTerpilih)}</span>}
          </h3>
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-outline-success" onClick={handleExportExcel}><i className="bi bi-file-earmark-excel me-1"></i>Excel</button>
            <button type="button" className="btn btn-outline-secondary" onClick={handleExportCSV}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
            <button type="button" className="btn btn-outline-danger" onClick={handleExportPDF}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
          </div>
        </div>
        <div className="card-body">
          {!filters.id_kelas || !filters.id_periode ? (
            <div className="text-center text-muted py-4"><i className="bi bi-info-circle me-1"></i>Pilih kelas dan periode untuk melihat riwayat nilai.</div>
          ) : (
            <>
              <div className="row g-2 mb-3">
                <div className="col-12 col-md-6">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-body"><i className="bi bi-search"></i></span>
                    <input type="search" className="form-control" placeholder="Cari siswa, mapel, materi, pengisi..."
                      value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
                  </div>
                </div>
                <div className="col-12 col-md-6 text-md-end align-self-center">
                  <small className="text-muted">{filteredRiwayat.length} entri{(searchQuery || (sorot && !sorot.lembar && sorot.nilai.size > 0)) && ` dari ${riwayat.length}`}</small>
                </div>
                {sorot && !sorot.lembar && sorot.nilai.size > 0 && (
                  <div className="col-12">
                    <div className="alert alert-info py-2 mb-0 small d-flex flex-wrap align-items-center gap-2">
                      <i className="bi bi-bell"></i>
                      <span className="me-auto">Menampilkan nilai dari Perlu Tindakan. Tekan <b>Tindak Lanjut</b> pada barisnya untuk membuat atau melihat rencana.</span>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setSorot(null)}>Tampilkan semua</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      {sortHeader("tanggal", "Tanggal")}
                      {sortHeader("siswa", "Siswa")}
                      {sortHeader("mapel", "Mapel")}
                      {sortHeader("jenis", "Jenis")}
                      <th>Materi & High Level</th>
                      {sortHeader("nilai", "Nilai", "text-center")}
                      {sortHeader("guru", "Guru")}
                      <th className="text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingRiwayat ? (
                      <tr><td colSpan="8" className="text-center py-4 text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Memuat riwayat...</td></tr>
                    ) : pageRows.length === 0 ? (
                      <tr><td colSpan="8" className="text-center py-4 text-muted">Tidak ada riwayat nilai yang ditemukan.</td></tr>
                    ) : pageRows.map((r) => {
                      const v = Number(r.nilai);
                      const tuntas = v >= kkmMapel(r.mapel);
                      return (
                        <tr key={r.id_nilai} className={editId === r.id_nilai ? "table-warning" : sorot?.nilai.has(r.id_nilai) ? "table-info" : ""}>
                          <td className="text-nowrap">{formatTanggal(r.tanggal)}</td>
                          <td>
                            <div className="fw-semibold">{r.siswa?.nama_siswa || r.id_siswa}</div>
                            <small className="text-muted">{r.siswa?.nisn || r.id_siswa}</small>
                          </td>
                          <td>{r.mapel?.nama_mapel || r.id_mapel}</td>
                          <td>
                            <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle">{r.jenis?.kategori_penilaian || r.id_jenis}</span>
                            {r.tipe_nilai === "REMEDIAL" && (
                              <div><span className="badge text-bg-danger fw-normal" title={r.rencana_asal?.opsi_tindakan}><i className="bi bi-life-preserver me-1"></i>Remedial</span></div>
                            )}
                          </td>
                          <td>
                            {r.materi?.nama_materi || r.id_materi}
                            {r.materi?.kategori?.nama_kategori && (
                              <div><span className="badge text-bg-secondary fw-normal text-wrap">{r.materi.kategori.nama_kategori}</span></div>
                            )}
                            {r.nilai_indikator?.length > 0 && (
                              <div className="small text-muted mt-1" title={r.nilai_indikator.map((i) => `${i.indikator?.deskripsi}: ${formatAngka(Number(i.nilai))}`).join("\n")}>
                                <i className="bi bi-list-check me-1"></i>{r.nilai_indikator.length} indikator
                              </div>
                            )}
                          </td>
                          <td className="text-center">
                            <span className={`badge fs-6 ${tuntas ? "text-bg-success" : "text-bg-danger"}`} title={tuntas ? "Tuntas" : "Belum tuntas"}>{formatAngka(v)}</span>
                            {r.rencana && (
                              <div className="mt-1">
                                <span className={`badge bg-${STATUS_RENCANA[r.rencana.status]?.warna || "warning"}-subtle text-${STATUS_RENCANA[r.rencana.status]?.warna || "warning"}-emphasis border fw-normal`}>
                                  {STATUS_RENCANA[r.rencana.status]?.label}
                                  {r.rencana.nilai_remedial && ` → ${formatAngka(Number(r.rencana.nilai_remedial.nilai))}`}
                                  {buktiRencana(r.rencana) && <i className="bi bi-paperclip ms-1" title="Ada bukti pelaksanaan" aria-label="Ada bukti pelaksanaan"></i>}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge bg-body-secondary text-body-secondary border fw-normal">{namaGuru(r)}</span>
                            {pengisiLain(r) && <small className="d-block text-muted" title="Akun yang menginput">diisi {pengisiLain(r)}</small>}
                          </td>
                          <td className="text-center">
                            <div className="btn-group btn-group-sm">
                              {r.jenis?.jenis_asesmen === "DIAGNOSTIK" ? (
                                // Asesmen diagnostik (mis. Tes Pemetaan Awal) memetakan kemampuan awal, tidak diremedial
                                <span className="d-inline-block" tabIndex={0} title="Asesmen diagnostik untuk pemetaan, tidak ditindaklanjuti remedial">
                                  <button type="button" className="btn btn-outline-secondary btn-sm rounded-end-0" disabled aria-label="Remedial tidak berlaku untuk asesmen diagnostik" style={{ pointerEvents: "none" }}>
                                    <i className="bi bi-life-preserver"></i>
                                  </button>
                                </span>
                              ) : (r.rencana || !tuntas) && (
                                <button type="button" className={`btn ${r.rencana ? "btn-outline-warning" : "btn-outline-danger"}`}
                                  title={r.rencana ? "Lihat / ubah rencana tindak lanjut" : "Atur rencana tindak lanjut"}
                                  onClick={() => (r.rencana
                                    ? ubahTindakLanjut(r.rencana, { nama_siswa: r.siswa?.nama_siswa || r.id_siswa, nilai: v }, kkmMapel(r.mapel))
                                    : bukaTindakLanjut([{ id_nilai: r.id_nilai, nama_siswa: r.siswa?.nama_siswa || r.id_siswa, nilai: v }], kkmMapel(r.mapel)))}>
                                  <i className="bi bi-life-preserver"></i>
                                </button>
                              )}
                            </div>
                            <MenuAksi className="ms-1" label={`Aksi nilai ${r.siswa?.nama_siswa || r.id_siswa}`} items={[
                              aksiUbah(() => handleEdit(r)),
                              {
                                label: r.rencana ? "Lihat / ubah rencana tindak lanjut" : "Atur rencana tindak lanjut", ikon: "bi-life-preserver",
                                tampil: r.jenis?.jenis_asesmen !== "DIAGNOSTIK" && (!!r.rencana || !tuntas),
                                onClick: () => (r.rencana
                                  ? ubahTindakLanjut(r.rencana, { nama_siswa: r.siswa?.nama_siswa || r.id_siswa, nilai: v }, kkmMapel(r.mapel))
                                  : bukaTindakLanjut([{ id_nilai: r.id_nilai, nama_siswa: r.siswa?.nama_siswa || r.id_siswa, nilai: v }], kkmMapel(r.mapel))),
                              },
                              aksiHapus(() => handleDelete(r)),
                            ]} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        {filters.id_kelas && filters.id_periode && totalPages > 1 && (
          <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
            <small className="text-muted">Halaman {currentPage} dari {totalPages}</small>
            <ul className="pagination pagination-sm mb-0">
              <li className={`page-item ${currentPage === 1 ? "disabled" : ""}`}>
                <button type="button" className="page-link" onClick={() => setPage(currentPage - 1)}><i className="bi bi-chevron-left"></i></button>
              </li>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .flatMap((p, i, arr) => [
                  i > 0 && p - arr[i - 1] > 1 && <li key={`gap-${p}`} className="page-item disabled"><span className="page-link">…</span></li>,
                  <li key={p} className={`page-item ${p === currentPage ? "active" : ""}`}>
                    <button type="button" className="page-link" onClick={() => setPage(p)}>{p}</button>
                  </li>,
                ])}
              <li className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}>
                <button type="button" className="page-link" onClick={() => setPage(currentPage + 1)}><i className="bi bi-chevron-right"></i></button>
              </li>
            </ul>
          </div>
        )}
      </div>

      {tindakLanjut && (
        <ModalTindakLanjut target={tindakLanjut} kkm={tindakLanjut.kkm} onTutup={() => setTindakLanjut(null)} onTersimpan={selesaiTindakLanjut} />
      )}
      {panelWa && (
        <PanelWaOrtu jenis={panelWa.jenis} idRencana={panelWa.idRencana} catatan={panelWa.catatan} onTutup={() => setPanelWa(null)} />
      )}
    </div>
  );
}
