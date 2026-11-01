"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import { generateProfessionalPDF } from "@/utils/pdfExport";

const API_URL = "http://localhost:8000/api";
const getToken = () => localStorage.getItem("token");

const DIMENSI = [
  { key: "S", label: "Skill", color: "#0d6efd" },
  { key: "T", label: "Teori", color: "#198754" },
  { key: "N", label: "Nalar", color: "#0dcaf0" },
  { key: "K", label: "Karakter", color: "#fd7e14" },
  { key: "M", label: "Minat", color: "#dc3545" },
];
const MAPEL_KHUSUS = [
  { key: "BIndo", label: "B. Indonesia", color: "#6f42c1", cocok: (n) => n.includes("indonesia") },
  { key: "Math", label: "Matematika", color: "#495057", cocok: (n) => n.includes("matematika") || n.includes("math") },
];
const PALET_SISWA = ["#0d6efd", "#dc3545", "#198754", "#fd7e14", "#6f42c1", "#20c997", "#d63384", "#0dcaf0", "#6c757d", "#ffc107"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const ROWS_PER_PAGE = 10;
const MAX_SISWA_INDIVIDU = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// --- UTIL TANGGAL (semua tanggal lokal, tanpa jam) ---
const parseYmd = (str) => {
  const [y, m, d] = String(str).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const seninDari = (d) => {
  const hari = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (hari === 0 ? 6 : hari - 1));
};
// Selisih hari dihitung dari tanggal kalender agar tidak terganggu pergantian jam musim panas
const selisihHari = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
// Label bulan diambil dari hari Kamis minggu tersebut (acuan ISO 8601), seperti di GAS
const labelBulanMinggu = (senin, wk) => {
  const kamis = new Date(senin.getFullYear(), senin.getMonth(), senin.getDate() + (wk - 1) * 7 + 3);
  return `${BULAN[kamis.getMonth()]}-${String(kamis.getFullYear()).slice(-2)}`;
};
const rentangMinggu = (senin, wk) => {
  const awal = new Date(senin.getFullYear(), senin.getMonth(), senin.getDate() + (wk - 1) * 7);
  const akhir = new Date(awal.getFullYear(), awal.getMonth(), awal.getDate() + 6);
  const f = (d) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return `${f(awal)} – ${f(akhir)}`;
};

// Tanggal mulai semester bawaan: Ganjil pertengahan Juli tahun pertama, Genap awal Januari tahun kedua
const tanggalMulaiDefault = (periode) => {
  const tahun = parseInt(String(periode?.tahun_ajaran || "").split("/")[0], 10) || new Date().getFullYear();
  return /genap/i.test(periode?.semester || "") ? `${tahun + 1}-01-05` : `${tahun}-07-13`;
};

const num = (v) => parseFloat(v) || 0;
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(d));
const rata = (sum, count) => (count > 0 ? Math.round((sum / count) * 10) / 10 : null);

// Label bulan di bawah sumbu X, di tengah kelompok minggunya
const monthBandPlugin = {
  id: "monthBand",
  afterDraw(chart, _args, opts) {
    const labels = opts?.labels;
    const x = chart.scales.x;
    if (!labels?.length || !x) return;
    const { ctx } = chart;
    ctx.save();
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#6c757d";
    ctx.strokeStyle = "rgba(0,0,0,.15)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const y = x.bottom + 2;
    const half = labels.length > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 : 20;
    let start = 0;
    for (let i = 1; i <= labels.length; i++) {
      if (i === labels.length || labels[i] !== labels[start]) {
        const kiri = x.getPixelForValue(start) - half;
        const kanan = x.getPixelForValue(i - 1) + half;
        ctx.fillText(labels[start], (kiri + kanan) / 2, y + 4);
        if (i < labels.length) {
          ctx.beginPath(); ctx.moveTo(kanan, x.top); ctx.lineTo(kanan, y + 16); ctx.stroke();
        }
        start = i;
      }
    }
    ctx.restore();
  },
};

// Latar putih agar PNG hasil unduhan tidak transparan
const whiteBgPlugin = {
  id: "whiteBg",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

// Chart.js dimuat saat dibutuhkan saja agar tidak memperbesar bundle halaman lain
const useChart = (canvasRef, config) => {
  const chartRef = useRef(null);
  useEffect(() => {
    if (!config || !canvasRef.current) return;
    let batal = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (batal || !canvasRef.current) return;
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current, config);
    })();
    return () => { batal = true; };
  }, [config]);
  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);
  return chartRef;
};

const InfoBox = ({ icon, color, label, value, sub }) => (
  <div className="col-6 col-xl-3">
    <div className="info-box shadow-sm mb-0 h-100">
      <span className={`info-box-icon text-bg-${color} shadow-sm`}><i className={`bi ${icon}`}></i></span>
      <div className="info-box-content">
        <span className="info-box-text small text-truncate">{label}</span>
        <span className="info-box-number fs-5">{value}</span>
        {sub && <small className="text-muted text-truncate">{sub}</small>}
      </div>
    </div>
  </div>
);

export default function LaporanStnkmPage() {
  // --- REFERENSI ---
  const [classes, setClasses] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [settings, setSettings] = useState(null);

  // --- FILTER UTAMA ---
  const [filters, setFilters] = useState({ id_kelas: "", id_periode: "", tanggal_mulai: "" });
  const [laporan, setLaporan] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- FILTER TAMPILAN ---
  const [modeWaktu, setModeWaktu] = useState("MINGGUAN");
  const [wkRange, setWkRange] = useState({ dari: 1, sampai: 1 });
  const [mapelFilter, setMapelFilter] = useState("");
  const [siswaTerpilih, setSiswaTerpilih] = useState([]);
  const [cariSiswa, setCariSiswa] = useState("");
  const [dimensiIndividu, setDimensiIndividu] = useState("TOTAL");

  // --- TABEL ---
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState("nama_siswa");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const chartKelasCanvas = useRef(null);
  const chartIndividuCanvas = useRef(null);

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

  useEffect(() => {
    if (!getToken()) { window.location.href = "/login"; return; }
    (async () => {
      try {
        const [resF, resS] = await Promise.all([
          safeFetch(`${API_URL}/nilai/filters`, { headers: authHeader() }),
          safeFetch(`${API_URL}/settings`, { headers: authHeader() }),
        ]);
        setClasses(resF.classes || []);
        setPeriodes(resF.periodes || []);
        setSettings(resS || null);
        const aktif = (resF.periodes || []).find((p) => p.status_aktif === "AKTIF");
        if (aktif) setFilters((f) => ({ ...f, id_periode: aktif.id_periode, tanggal_mulai: tanggalMulaiDefault(aktif) }));
      } catch (err) { Swal.fire("Error", err.message, "error"); }
    })();
  }, []);

  const ubahPeriode = (id_periode) => {
    const p = periodes.find((x) => x.id_periode === id_periode);
    setFilters((f) => ({ ...f, id_periode, tanggal_mulai: p ? tanggalMulaiDefault(p) : f.tanggal_mulai }));
  };

  // Data mentah dimuat ulang hanya saat kelas/periode berubah; filter lain dihitung di browser
  useEffect(() => {
    const { id_kelas, id_periode } = filters;
    if (!id_kelas || !id_periode) { setLaporan(null); return; }
    let batal = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ id_kelas, id_periode });
        const data = await safeFetch(`${API_URL}/laporan/stnkm?${params}`, { headers: authHeader() });
        if (batal) return;
        setLaporan(data);
        setMapelFilter("");
        setSiswaTerpilih([]);
        setPage(1);
      } catch (err) { if (!batal) Swal.fire("Error", err.message, "error"); }
      finally { if (!batal) setLoading(false); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_periode]);

  // --- NORMALISASI ENTRI KE MINGGU ---
  const senin = useMemo(() => (filters.tanggal_mulai ? seninDari(parseYmd(filters.tanggal_mulai)) : null), [filters.tanggal_mulai]);

  const basis = useMemo(() => {
    if (!laporan || !senin) return null;
    const mapelKhusus = {};
    (laporan.mapels || []).forEach((m) => {
      const nama = m.nama_mapel.toLowerCase();
      MAPEL_KHUSUS.forEach((k) => { if (!mapelKhusus[k.key] && k.cocok(nama)) mapelKhusus[k.key] = m.id_mapel; });
    });
    const mingguKe = (tanggal) => Math.floor(selisihHari(senin, parseYmd(tanggal)) / 7) + 1;

    let sebelumMulai = 0;
    const nilai = [], jurnal = [];
    (laporan.nilai || []).forEach((r) => {
      const wk = mingguKe(r.tanggal);
      if (wk < 1) { sebelumMulai++; return; }
      const poin = Object.fromEntries(DIMENSI.map((d) => [d.key, num(r[`poin_${d.key}`])]));
      nilai.push({
        ...poin, wk, id_siswa: r.id_siswa, id_mapel: r.id_mapel, tanggal: r.tanggal, nilai: num(r.nilai),
        isStnkm: DIMENSI.some((d) => poin[d.key] !== 0),
        ...Object.fromEntries(MAPEL_KHUSUS.map((k) => [`is${k.key}`, r.id_mapel === mapelKhusus[k.key]])),
      });
    });
    (laporan.jurnal || []).forEach((j) => {
      const wk = mingguKe(j.tanggal);
      if (wk < 1) { sebelumMulai++; return; }
      jurnal.push({ wk, id_siswa: j.id_siswa, tanggal: j.tanggal, ...Object.fromEntries(DIMENSI.map((d) => [d.key, num(j[`val_${d.key}`])])) });
    });

    // Kerangka minggu utuh sampai minggu data terakhir atau minggu berjalan
    const maxWk = Math.max(1, mingguKe(toYmd(new Date())), ...nilai.map((n) => n.wk), ...jurnal.map((j) => j.wk));
    return { nilai, jurnal, maxWk, sebelumMulai, mapelKhusus };
  }, [laporan, senin]);

  // Rentang minggu di-reset saat kerangka berubah
  useEffect(() => { if (basis) setWkRange({ dari: 1, sampai: basis.maxWk }); }, [basis?.maxWk, filters.tanggal_mulai, laporan]);

  // --- FILTER TAMPILAN ---
  const terfilter = useMemo(() => {
    if (!basis) return null;
    const dalam = (e) => e.wk >= wkRange.dari && e.wk <= wkRange.sampai;
    const nilai = basis.nilai.filter((n) => dalam(n) && (!mapelFilter || n.id_mapel === mapelFilter));
    const jurnal = basis.jurnal.filter(dalam);
    return { nilai, jurnal };
  }, [basis, wkRange, mapelFilter]);

  // Ember waktu: per minggu, atau per bulan (dari label bulan tiap minggu)
  const ember = useMemo(() => {
    if (!basis || !senin) return [];
    const list = [];
    for (let wk = wkRange.dari; wk <= wkRange.sampai; wk++) {
      const bulan = labelBulanMinggu(senin, wk);
      if (modeWaktu === "MINGGUAN") list.push({ key: wk, label: `Wk.${wk}`, bulan, title: rentangMinggu(senin, wk), weeks: [wk] });
      else {
        const last = list[list.length - 1];
        if (last && last.key === bulan) last.weeks.push(wk);
        else list.push({ key: bulan, label: bulan, bulan, title: bulan, weeks: [wk] });
      }
    }
    return list;
  }, [basis, senin, wkRange, modeWaktu]);

  const emberIndex = useMemo(() => {
    const map = new Map();
    ember.forEach((e, i) => e.weeks.forEach((wk) => map.set(wk, i)));
    return map;
  }, [ember]);

  // Agregasi rata-rata per ember (logika GAS: nilai ber-poin STNKM + jurnal digabung)
  const agregasi = (nilai, jurnal) => {
    const acc = ember.map(() => ({ ...Object.fromEntries(DIMENSI.map((d) => [d.key, 0])), c: 0, BIndo: 0, cBIndo: 0, Math: 0, cMath: 0 }));
    nilai.forEach((n) => {
      const a = acc[emberIndex.get(n.wk)];
      if (!a) return;
      if (n.isStnkm) { DIMENSI.forEach((d) => { a[d.key] += n[d.key]; }); a.c++; }
      MAPEL_KHUSUS.forEach((k) => { if (n[`is${k.key}`]) { a[k.key] += n.nilai; a[`c${k.key}`]++; } });
    });
    jurnal.forEach((j) => {
      const a = acc[emberIndex.get(j.wk)];
      if (!a) return;
      DIMENSI.forEach((d) => { a[d.key] += j[d.key]; });
      a.c++;
    });
    return acc.map((a) => ({
      ...Object.fromEntries(DIMENSI.map((d) => [d.key, rata(a[d.key], a.c)])),
      ...Object.fromEntries(MAPEL_KHUSUS.map((k) => [k.key, rata(a[k.key], a[`c${k.key}`])])),
      count: a.c,
    }));
  };

  const trenKelas = useMemo(() => (terfilter ? agregasi(terfilter.nilai, terfilter.jurnal) : []), [terfilter, ember, emberIndex]);

  // --- CHART KELAS ---
  const configKelas = useMemo(() => {
    if (!terfilter || ember.length === 0) return null;
    const lines = [
      ...DIMENSI.map((d) => ({ key: d.key, label: `${d.key} · ${d.label}`, color: d.color, dash: [] })),
      ...MAPEL_KHUSUS.filter((k) => basis.mapelKhusus[k.key] && (!mapelFilter || mapelFilter === basis.mapelKhusus[k.key]))
        .map((k) => ({ key: k.key, label: k.label, color: k.color, dash: [6, 4] })),
    ];
    return {
      type: "line",
      data: {
        labels: ember.map((e) => e.label),
        datasets: lines.map((l) => ({
          label: l.label, data: trenKelas.map((t) => t[l.key]),
          borderColor: l.color, backgroundColor: l.color, borderDash: l.dash,
          tension: 0.3, spanGaps: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { bottom: modeWaktu === "MINGGUAN" ? 18 : 0 } },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: { title: (items) => `${items[0].label} (${ember[items[0].dataIndex]?.title || ""})` } },
          monthBand: { labels: modeWaktu === "MINGGUAN" ? ember.map((e) => e.bulan) : [] },
        },
        scales: { y: { grid: { color: "rgba(0,0,0,.05)" } }, x: { grid: { display: false } } },
      },
      plugins: [monthBandPlugin, whiteBgPlugin],
    };
  }, [terfilter, ember, trenKelas, basis, mapelFilter, modeWaktu]);

  const chartKelas = useChart(chartKelasCanvas, configKelas);

  // --- CHART INDIVIDU ---
  const configIndividu = useMemo(() => {
    if (!terfilter || siswaTerpilih.length === 0 || ember.length === 0) return null;
    const namaSiswa = new Map((laporan.students || []).map((s) => [s.id_siswa, s.nama_siswa]));
    const nilaiDari = (t) => (dimensiIndividu === "TOTAL"
      ? (DIMENSI.every((d) => t[d.key] === null) ? null : Math.round(DIMENSI.reduce((s, d) => s + (t[d.key] || 0), 0) * 10) / 10)
      : t[dimensiIndividu]);
    return {
      type: "line",
      data: {
        labels: ember.map((e) => e.label),
        datasets: siswaTerpilih.slice(0, MAX_SISWA_INDIVIDU).map((id, i) => {
          const tren = agregasi(terfilter.nilai.filter((n) => n.id_siswa === id), terfilter.jurnal.filter((j) => j.id_siswa === id));
          const color = PALET_SISWA[i % PALET_SISWA.length];
          return {
            label: namaSiswa.get(id) || id, data: tren.map(nilaiDari),
            borderColor: color, backgroundColor: color, tension: 0.3, spanGaps: true, pointRadius: 3, borderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { bottom: modeWaktu === "MINGGUAN" ? 18 : 0 } },
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } },
          monthBand: { labels: modeWaktu === "MINGGUAN" ? ember.map((e) => e.bulan) : [] },
        },
        scales: { y: { grid: { color: "rgba(0,0,0,.05)" } }, x: { grid: { display: false } } },
      },
      plugins: [monthBandPlugin, whiteBgPlugin],
    };
  }, [terfilter, siswaTerpilih, ember, emberIndex, dimensiIndividu, laporan, modeWaktu]);

  const chartIndividu = useChart(chartIndividuCanvas, configIndividu);

  // --- REKAP PER SISWA (akumulasi seperti GAS) ---
  const rekap = useMemo(() => {
    if (!terfilter || !laporan) return [];
    return (laporan.students || []).map((s) => {
      const nilai = terfilter.nilai.filter((n) => n.id_siswa === s.id_siswa);
      const jurnal = terfilter.jurnal.filter((j) => j.id_siswa === s.id_siswa);
      const sum = Object.fromEntries(DIMENSI.map((d) => [d.key, [...nilai, ...jurnal].reduce((a, e) => a + e[d.key], 0)]));
      const avgMapel = (k) => {
        const arr = nilai.filter((n) => n[`is${k}`]).map((n) => n.nilai);
        return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      };
      return {
        id_siswa: s.id_siswa, nisn: s.nisn, nama_siswa: s.nama_siswa,
        ...sum, total: DIMENSI.reduce((a, d) => a + sum[d.key], 0),
        BIndo: avgMapel("BIndo"), Math: avgMapel("Math"),
        entri: nilai.length + jurnal.length,
      };
    });
  }, [terfilter, laporan]);

  const rekapTampil = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = rekap.filter((r) => (siswaTerpilih.length === 0 || siswaTerpilih.includes(r.id_siswa))
      && (!q || r.nama_siswa.toLowerCase().includes(q) || String(r.nisn || "").includes(q)));
    return list.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === "nama_siswa") { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      else { va = va ?? -Infinity; vb = vb ?? -Infinity; }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rekap, searchQuery, sortCol, sortAsc, siswaTerpilih]);

  const totalPages = Math.max(1, Math.ceil(rekapTampil.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rekapTampil.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const ringkasan = useMemo(() => {
    if (!terfilter) return null;
    const rataDim = DIMENSI.map((d) => {
      const vals = trenKelas.map((t) => t[d.key]).filter((v) => v !== null);
      return { ...d, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
    }).filter((d) => d.avg !== null);
    const tertinggi = rataDim.sort((a, b) => b.avg - a.avg)[0];
    return { nilai: terfilter.nilai.length, jurnal: terfilter.jurnal.length, tertinggi };
  }, [terfilter, trenKelas]);

  // --- EKSPOR ---
  const namaKelas = laporan?.kelas?.nama_kelas || "Kelas";
  const labelPeriode = laporan?.periode ? `${laporan.periode.tahun_ajaran} (${laporan.periode.semester})` : "";
  const labelRentang = `Wk.${wkRange.dari}–Wk.${wkRange.sampai}`;
  const namaFile = `Laporan_STNKM_${namaKelas.replace(/\s+/g, "_")}_${toYmd(new Date())}`;

  const rekapRows = () => rekapTampil.map((r, i) => ({
    "No": i + 1, "NISN": r.nisn || r.id_siswa, "Nama Siswa": r.nama_siswa,
    ...Object.fromEntries(DIMENSI.map((d) => [d.key, Number(fmt(r[d.key]))])),
    "Total": Number(fmt(r.total)),
    "Rata B. Indonesia": r.BIndo === null ? "-" : Number(fmt(r.BIndo)),
    "Rata Matematika": r.Math === null ? "-" : Number(fmt(r.Math)),
    "Jumlah Entri": r.entri,
  }));

  const adaData = () => {
    if (!laporan) { Swal.fire("Pilih Kelas", "Pilih kelas dan periode terlebih dahulu.", "info"); return false; }
    if (rekapTampil.length === 0) { Swal.fire("Kosong", "Tidak ada data untuk diekspor.", "info"); return false; }
    return true;
  };

  const handleExportExcel = () => {
    if (!adaData()) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekapRows()), "Rekap Siswa");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ember.map((e, i) => ({
      [modeWaktu === "MINGGUAN" ? "Minggu" : "Bulan"]: e.label, "Rentang": e.title,
      ...Object.fromEntries(DIMENSI.map((d) => [d.key, trenKelas[i][d.key] ?? ""])),
      "B. Indonesia": trenKelas[i].BIndo ?? "", "Matematika": trenKelas[i].Math ?? "", "Jumlah Entri": trenKelas[i].count,
    }))), "Tren Kelas");
    // Data mentah sesuai filter, untuk diolah lebih lanjut
    const namaSiswa = new Map(laporan.students.map((s) => [s.id_siswa, s.nama_siswa]));
    const namaMapel = new Map(laporan.mapels.map((m) => [m.id_mapel, m.nama_mapel]));
    const mentah = [
      ...terfilter.nilai.map((n) => ({ Sumber: "Nilai", Tanggal: n.tanggal, Minggu: n.wk, Siswa: namaSiswa.get(n.id_siswa) || n.id_siswa, Mapel: namaMapel.get(n.id_mapel) || n.id_mapel, Nilai: n.nilai, ...Object.fromEntries(DIMENSI.map((d) => [d.key, n[d.key]])) })),
      ...terfilter.jurnal.map((j) => ({ Sumber: "Jurnal", Tanggal: j.tanggal, Minggu: j.wk, Siswa: namaSiswa.get(j.id_siswa) || j.id_siswa, Mapel: "-", Nilai: "", ...Object.fromEntries(DIMENSI.map((d) => [d.key, j[d.key]])) })),
    ].filter((r) => siswaTerpilih.length === 0 || siswaTerpilih.some((id) => namaSiswa.get(id) === r.Siswa))
      .sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mentah.length ? mentah : [{ Keterangan: "Tidak ada data" }]), "Data Mentah");
    XLSX.writeFile(wb, `${namaFile}.xlsx`);
  };

  const handleExportCSV = () => {
    if (!adaData()) return;
    const rows = rekapRows();
    const headers = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
    // BOM agar Excel membaca UTF-8 dengan benar
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${namaFile}.csv`;
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
    await generateProfessionalPDF(rekapRows(), `Laporan STNKM ${namaKelas} - ${labelPeriode} (${labelRentang})`, settings, getBase64ImageFromUrl);
  };

  const handleExportPNG = (chartRef, suffix) => {
    if (!chartRef.current) return Swal.fire("Belum Ada Grafik", "Grafik belum tampil.", "info");
    const link = document.createElement("a");
    link.href = chartRef.current.toBase64Image("image/png", 1);
    link.download = `${namaFile}_${suffix}.png`;
    link.click();
  };

  // --- RENDER HELPERS ---
  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col === "nama_siswa"); }
  };
  const sortHeader = (col, label, className = "text-center") => (
    <th key={col} role="button" className={`text-nowrap user-select-none ${className}`} onClick={() => handleSort(col)}>
      {label}{" "}
      <i className={`bi ${sortCol === col ? (sortAsc ? "bi-sort-up text-primary" : "bi-sort-down text-primary") : "bi-arrow-down-up text-muted opacity-50"}`}></i>
    </th>
  );
  const warnaSkor = (v) => (v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted");

  const toggleSiswa = (id) => setSiswaTerpilih((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const siswaDaftar = (laporan?.students || []).filter((s) => !cariSiswa || s.nama_siswa.toLowerCase().includes(cariSiswa.toLowerCase()));
  const opsiMinggu = basis ? Array.from({ length: basis.maxWk }, (_, i) => i + 1) : [];
  const adaDataTren = trenKelas.some((t) => t.count > 0 || t.BIndo !== null || t.Math !== null);

  return (
    <div className="container-fluid mb-5">
      {/* HEADER HALAMAN */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-graph-up-arrow me-2"></i>Laporan STNKM</h3>
          <small className="text-muted">Tren perkembangan Skill, Teori, Nalar, Karakter, dan Minat siswa</small>
        </div>
        <ol className="breadcrumb mb-0 small">
          <li className="breadcrumb-item"><Link href="/dashboard">Dashboard</Link></li>
          <li className="breadcrumb-item">Laporan</li>
          <li className="breadcrumb-item active" aria-current="page">Laporan STNKM</li>
        </ol>
      </div>

      {/* FILTER UTAMA */}
      <div className="card card-outline card-primary shadow-sm mb-3">
        <div className="card-header"><h3 className="card-title fw-semibold mb-0"><i className="bi bi-funnel me-2"></i>Parameter Laporan</h3></div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Kelas</label>
              <select className="form-select" value={filters.id_kelas} onChange={(e) => setFilters((f) => ({ ...f, id_kelas: e.target.value }))}>
                <option value="">— Pilih Kelas —</option>
                {classes.map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
              </select>
            </div>
            <div className="col-12 col-sm-6 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Periode Akademik</label>
              <select className="form-select" value={filters.id_periode} onChange={(e) => ubahPeriode(e.target.value)}>
                <option value="">— Pilih Periode —</option>
                {periodes.map((p) => <option key={p.id_periode} value={p.id_periode}>{p.tahun_ajaran} ({p.semester}){p.status_aktif === "AKTIF" ? " • Aktif" : ""}</option>)}
              </select>
            </div>
            <div className="col-12 col-lg-4">
              <label className="form-label fw-semibold small mb-1">Tanggal Mulai Semester (Minggu 1)</label>
              <input type="date" className="form-control" value={filters.tanggal_mulai}
                onChange={(e) => e.target.value && setFilters((f) => ({ ...f, tanggal_mulai: e.target.value }))} />
              {senin && <small className="text-muted">Minggu 1 dimulai Senin, {senin.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</small>}
            </div>
          </div>
        </div>
      </div>

      {!filters.id_kelas || !filters.id_periode ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <i className="bi bi-bar-chart-line display-5 text-primary opacity-50"></i>
          <h5 className="fw-semibold mt-3">Pilih kelas dan periode untuk menampilkan laporan</h5>
        </div></div>
      ) : loading || !basis ? (
        <div className="card shadow-sm"><div className="card-body text-center py-5 text-muted">
          <div className="spinner-border text-primary mb-2"></div><div>Memuat data laporan...</div>
        </div></div>
      ) : (
        <>
          {/* RINGKASAN */}
          <div className="row g-3 mb-3">
            <InfoBox icon="bi-people" color="primary" label="Jumlah Siswa" value={laporan.students.length} sub={namaKelas} />
            <InfoBox icon="bi-pencil-square" color="success" label="Entri Nilai" value={ringkasan.nilai} sub={labelRentang} />
            <InfoBox icon="bi-journal-text" color="warning" label="Entri Jurnal" value={ringkasan.jurnal} sub={labelRentang} />
            <InfoBox icon="bi-trophy" color="info" label="Dimensi Tertinggi"
              value={ringkasan.tertinggi ? `${ringkasan.tertinggi.key} · ${ringkasan.tertinggi.label}` : "–"}
              sub={ringkasan.tertinggi ? `Rata-rata ${fmt(ringkasan.tertinggi.avg)}` : "Belum ada data"} />
          </div>

          {/* FILTER TAMPILAN */}
          <div className="card shadow-sm mb-3">
            <div className="card-body py-3">
              <div className="row g-3 align-items-end">
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label fw-semibold small mb-1">Mode Waktu</label>
                  <div className="btn-group w-100" role="group">
                    {[["MINGGUAN", "Mingguan", "bi-calendar-week"], ["BULANAN", "Bulanan", "bi-calendar-month"]].map(([v, l, ic]) => (
                      <button key={v} type="button" className={`btn btn-sm ${modeWaktu === v ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setModeWaktu(v)}>
                        <i className={`bi ${ic} me-1`}></i>{l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label fw-semibold small mb-1">Rentang Minggu</label>
                  <div className="input-group input-group-sm">
                    <select className="form-select" value={wkRange.dari} onChange={(e) => setWkRange((r) => ({ dari: +e.target.value, sampai: Math.max(+e.target.value, r.sampai) }))}>
                      {opsiMinggu.map((w) => <option key={w} value={w}>Wk.{w}</option>)}
                    </select>
                    <span className="input-group-text">s/d</span>
                    <select className="form-select" value={wkRange.sampai} onChange={(e) => setWkRange((r) => ({ sampai: +e.target.value, dari: Math.min(+e.target.value, r.dari) }))}>
                      {opsiMinggu.map((w) => <option key={w} value={w}>Wk.{w}</option>)}
                    </select>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label fw-semibold small mb-1">Mata Pelajaran (nilai)</label>
                  <select className="form-select form-select-sm" value={mapelFilter} onChange={(e) => setMapelFilter(e.target.value)}>
                    <option value="">Semua Mapel</option>
                    {laporan.mapels.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-6 col-xl-3">
                  <label className="form-label fw-semibold small mb-1">Siswa</label>
                  <div className="dropdown">
                    <button className="btn btn-sm btn-outline-secondary dropdown-toggle w-100 text-start d-flex justify-content-between align-items-center" type="button"
                      data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
                      <span className="text-truncate">{siswaTerpilih.length === 0 ? "Semua siswa" : `${siswaTerpilih.length} siswa dipilih`}</span>
                    </button>
                    <div className="dropdown-menu shadow p-2 w-100" style={{ minWidth: 260 }}>
                      <input type="search" className="form-control form-control-sm mb-2" placeholder="Cari nama..." value={cariSiswa} onChange={(e) => setCariSiswa(e.target.value)} />
                      <div className="d-flex justify-content-between mb-1 px-1">
                        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setSiswaTerpilih(siswaDaftar.map((s) => s.id_siswa))}>Pilih semua</button>
                        <button type="button" className="btn btn-link btn-sm p-0 text-danger" onClick={() => setSiswaTerpilih([])}>Hapus pilihan</button>
                      </div>
                      <div style={{ maxHeight: 240, overflowY: "auto" }}>
                        {siswaDaftar.map((s) => (
                          <label key={s.id_siswa} className="dropdown-item d-flex align-items-center gap-2 rounded small" role="button">
                            <input type="checkbox" className="form-check-input mt-0" checked={siswaTerpilih.includes(s.id_siswa)} onChange={() => toggleSiswa(s.id_siswa)} />
                            <span className="text-truncate">{s.nama_siswa}</span>
                          </label>
                        ))}
                        {siswaDaftar.length === 0 && <div className="text-muted small px-2 py-1">Tidak ditemukan.</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {basis.sebelumMulai > 0 && (
                <small className="text-muted d-block mt-2">
                  <i className="bi bi-info-circle me-1"></i>{basis.sebelumMulai} entri bertanggal sebelum Minggu 1 tidak dihitung. Ubah tanggal mulai semester bila perlu.
                </small>
              )}
            </div>
          </div>

          {/* GRAFIK KELAS */}
          <div className="card card-outline card-info shadow-sm mb-3">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto">
                <i className="bi bi-graph-up me-2"></i>Tren Rata-rata Kelas
                <span className="text-muted fw-normal small ms-2">{modeWaktu === "MINGGUAN" ? "per minggu" : "per bulan"} · {labelRentang}</span>
              </h3>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleExportPNG(chartKelas, "Kelas")}>
                <i className="bi bi-image me-1"></i>PNG
              </button>
            </div>
            <div className="card-body">
              {adaDataTren ? (
                <div style={{ position: "relative", height: 340 }}><canvas ref={chartKelasCanvas}></canvas></div>
              ) : (
                <div className="text-center text-muted py-5"><i className="bi bi-inbox fs-1 d-block mb-2"></i>Belum ada nilai atau jurnal pada rentang ini.</div>
              )}
              <small className="text-muted d-block mt-2">
                <i className="bi bi-info-circle me-1"></i>Titik STNKM adalah rata-rata poin nilai (nilai × matriks) dan skor jurnal pada periode tersebut; garis putus-putus adalah rata-rata nilai mapel.
              </small>
            </div>
          </div>

          {/* GRAFIK INDIVIDU */}
          {siswaTerpilih.length > 0 && (
            <div className="card card-outline card-warning shadow-sm mb-3">
              <div className="card-header d-flex flex-wrap align-items-center gap-2">
                <h3 className="card-title fw-semibold mb-0 me-auto">
                  <i className="bi bi-person-lines-fill me-2"></i>Perbandingan Individu
                  {siswaTerpilih.length > MAX_SISWA_INDIVIDU && <span className="text-muted fw-normal small ms-2">({MAX_SISWA_INDIVIDU} siswa pertama)</span>}
                </h3>
                <select className="form-select form-select-sm w-auto" value={dimensiIndividu} onChange={(e) => setDimensiIndividu(e.target.value)}>
                  <option value="TOTAL">Total STNKM</option>
                  {DIMENSI.map((d) => <option key={d.key} value={d.key}>{d.key} · {d.label}</option>)}
                </select>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleExportPNG(chartIndividu, "Individu")}>
                  <i className="bi bi-image me-1"></i>PNG
                </button>
              </div>
              <div className="card-body">
                <div style={{ position: "relative", height: 300 }}><canvas ref={chartIndividuCanvas}></canvas></div>
              </div>
            </div>
          )}

          {/* TABEL REKAP */}
          <div className="card card-outline card-secondary shadow-sm">
            <div className="card-header d-flex flex-wrap align-items-center gap-2">
              <h3 className="card-title fw-semibold mb-0 me-auto"><i className="bi bi-table me-2"></i>Rekapitulasi per Siswa</h3>
              <div className="btn-group btn-group-sm">
                <button type="button" className="btn btn-outline-success" onClick={handleExportExcel} title="Rekap, tren, dan data mentah"><i className="bi bi-file-earmark-excel me-1"></i>Excel</button>
                <button type="button" className="btn btn-outline-secondary" onClick={handleExportCSV}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
                <button type="button" className="btn btn-outline-danger" onClick={handleExportPDF}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
              </div>
            </div>
            <div className="card-body">
              <div className="row g-2 mb-3">
                <div className="col-12 col-md-6">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-body"><i className="bi bi-search"></i></span>
                    <input type="search" className="form-control" placeholder="Cari nama atau NISN..." value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} />
                  </div>
                </div>
                <div className="col-12 col-md-6 text-md-end align-self-center">
                  <small className="text-muted">Akumulasi poin {labelRentang}{mapelFilter ? ` · ${laporan.mapels.find((m) => m.id_mapel === mapelFilter)?.nama_mapel}` : ""}</small>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th className="text-center">No</th>
                      {sortHeader("nama_siswa", "Nama Siswa", "")}
                      {DIMENSI.map((d) => sortHeader(d.key, d.key))}
                      {sortHeader("total", "Total")}
                      {sortHeader("BIndo", "B. Indo")}
                      {sortHeader("Math", "Mat")}
                      {sortHeader("entri", "Entri")}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr><td colSpan="11" className="text-center text-muted py-4">Tidak ada data siswa.</td></tr>
                    ) : pageRows.map((r, i) => (
                      <tr key={r.id_siswa}>
                        <td className="text-center text-muted">{(currentPage - 1) * ROWS_PER_PAGE + i + 1}</td>
                        <td>
                          <div className="fw-semibold">{r.nama_siswa}</div>
                          <small className="text-muted">{r.nisn || r.id_siswa}</small>
                        </td>
                        {DIMENSI.map((d) => <td key={d.key} className={`text-center ${warnaSkor(r[d.key])}`}>{fmt(r[d.key])}</td>)}
                        <td className={`text-center fw-bold ${warnaSkor(r.total)}`}>{fmt(r.total)}</td>
                        <td className="text-center">{fmt(r.BIndo)}</td>
                        <td className="text-center">{fmt(r.Math)}</td>
                        <td className="text-center"><span className="badge bg-body-secondary text-body-secondary border">{r.entri}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="card-footer d-flex justify-content-between align-items-center">
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><i className="bi bi-chevron-left"></i></button>
                <small className="text-muted">Halaman {currentPage} dari {totalPages}</small>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><i className="bi bi-chevron-right"></i></button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
