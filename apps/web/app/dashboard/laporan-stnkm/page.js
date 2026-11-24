"use client";
import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { generateProfessionalPDF } from "@/utils/pdfExport";
import { ChartCanvas } from "@/components/dashboard/ChartCard";
import { renderGrafikStatis } from "@/components/dashboard/chartExport";
import { API_URL } from "@/app/lib/config";
import {
  DIMENSI, MAPEL_KHUSUS, DIMENSI_JURNAL, KUNCI_JURNAL, SUMBER, CARA_LENGKAP, sumberValid, caraValid, labelSumber, skalaJurnal, pakaiDuaSumbu,
  parseYmd, toYmd, seninDari, tanggalMulaiDefault, rataKunci, rataGabungan, rataJurnal, normalisasi, saring, bangunHarian, rekapSiswa,
  kolomTampil, fmt, angkaEkspor,
} from "@/components/laporan/stnkmHitung";

const getToken = () => localStorage.getItem("token");

const JUDUL_GRAFIK = "Progres STNKM-B.Ind-Math";
const PALET_SISWA = ["#0d6efd", "#dc3545", "#198754", "#fd7e14", "#6f42c1", "#20c997", "#d63384", "#0dcaf0", "#6c757d", "#ffc107"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const ROWS_PER_PAGE = 10;
const MAX_SISWA_INDIVIDU = 10;

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

// Ruang di bawah label minggu: pita label bulan, lalu jarak sebelum legend
const MONTH_BAND_H = 20;
const LEGEND_GAP = 14;

// Sumbu X dipertinggi agar pita bulan tidak bertumpuk dengan legend di bawahnya
const sumbuX = (denganPitaBulan) => ({
  grid: { display: false },
  afterFit: (scale) => { scale.height += (denganPitaBulan ? MONTH_BAND_H : 0) + LEGEND_GAP; },
});

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
    // Pita bulan menempati ruang tambahan dari sumbuX(), tepat di bawah label minggu
    const y = x.bottom - LEGEND_GAP - MONTH_BAND_H;
    const half = labels.length > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 : 20;
    let start = 0;
    for (let i = 1; i <= labels.length; i++) {
      if (i === labels.length || labels[i] !== labels[start]) {
        const kiri = x.getPixelForValue(start) - half;
        const kanan = x.getPixelForValue(i - 1) + half;
        ctx.fillText(labels[start], (kiri + kanan) / 2, y + 5);
        if (i < labels.length) {
          ctx.beginPath(); ctx.moveTo(kanan, x.top); ctx.lineTo(kanan, y + MONTH_BAND_H); ctx.stroke();
        }
        start = i;
      }
    }
    ctx.restore();
  },
};

const labelKelasResmi = (nama) => (/^kelas\b/i.test(nama) ? nama : `Kelas ${nama}`);


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

// Grafik di layar mengikuti tema; latar putih hanya dipakai saat ekspor (renderGrafikStatis)
const Grafik = ({ config, height }) => {
  const tampil = useMemo(() => (config ? { ...config, plugins: (config.plugins || []).filter((p) => p.id !== "whiteBg") } : null), [config]);
  return <ChartCanvas config={tampil} height={height} />;
};

// Garis grafik menurut sumber STNKM: S–M (+ B.Ind & Math putus-putus bila akademik), jurnal titik-titik di sumbu kanan
const seriUntuk = (sumber, cara) => {
  const dim = DIMENSI.map((d) => ({ ...d, nama: d.label, label: d.key, dash: [], sumbu: "y" }));
  if (sumber === "JURNAL") return dim;
  const khusus = MAPEL_KHUSUS.map((k) => ({ ...k, dash: [6, 4], sumbu: "y" }));
  const jurnal = pakaiDuaSumbu(sumber, cara) ? DIMENSI_JURNAL.map((d) => ({ ...d, dash: [2, 3], sumbu: "y1" })) : [];
  return [...dim, ...khusus, ...jurnal];
};
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

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

const LABEL_MODE = { HARIAN: "Harian", MINGGUAN: "Mingguan", BULANAN: "Bulanan" };

export default function LaporanStnkmPage() {
  return <Suspense fallback={null}><LaporanStnkm /></Suspense>;
}

function LaporanStnkm() {
  const router = useRouter();
  const params = useSearchParams();
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
  const [dimensiIndividu, setDimensiIndividu] = useState("RATA");
  // Sumber STNKM: akademik (bawaan), jurnal, atau lengkap (dua sumbu / konversi 0–100)
  const [sumber, setSumber] = useState(() => sumberValid(params.get("sumber")));
  const [caraLengkap, setCaraLengkap] = useState(() => caraValid(params.get("cara")));
  // Kembali dari halaman rincian siswa: pulihkan filter tampilan setelah data kelas termuat
  const pulih = useRef(params.get("id_kelas") ? { mapel: params.get("mapel") || "", dari: +params.get("dari") || 0, sampai: +params.get("sampai") || 0 } : null);

  // --- TABEL ---
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState("nama_siswa");
  const [sortAsc, setSortAsc] = useState(true);
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
        const dariTautan = (resF.periodes || []).find((p) => p.id_periode === params.get("id_periode"));
        if (dariTautan) {
          setFilters({ id_kelas: params.get("id_kelas") || "", id_periode: dariTautan.id_periode, tanggal_mulai: params.get("mulai") || tanggalMulaiDefault(dariTautan) });
        } else if (aktif) setFilters((f) => ({ ...f, id_periode: aktif.id_periode, tanggal_mulai: tanggalMulaiDefault(aktif) }));
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
        setMapelFilter(pulih.current?.mapel || "");
        setSiswaTerpilih([]);
        setPage(1);
      } catch (err) { if (!batal) Swal.fire("Error", err.message, "error"); }
      finally { if (!batal) setLoading(false); }
    })();
    return () => { batal = true; };
  }, [filters.id_kelas, filters.id_periode]);

  // --- NORMALISASI ENTRI KE MINGGU ---
  const senin = useMemo(() => (filters.tanggal_mulai ? seninDari(parseYmd(filters.tanggal_mulai)) : null), [filters.tanggal_mulai]);

  const basis = useMemo(() => (laporan && senin ? normalisasi(laporan, senin) : null), [laporan, senin]);

  // Rentang minggu di-reset saat kerangka berubah
  useEffect(() => {
    if (!basis) return;
    const p = pulih.current;
    pulih.current = null;
    const batas = (v, cadangan) => (v >= 1 && v <= basis.maxWk ? v : cadangan);
    setWkRange(p ? { dari: batas(p.dari, 1), sampai: Math.max(batas(p.dari, 1), batas(p.sampai, basis.maxWk)) } : { dari: 1, sampai: basis.maxWk });
  }, [basis?.maxWk, filters.tanggal_mulai, laporan]);
  // Pilihan dimensi grafik perbandingan bisa tidak berlaku lagi setelah sumber berganti
  useEffect(() => { setDimensiIndividu("RATA"); }, [sumber, caraLengkap]);

  // --- FILTER TAMPILAN ---
  const terfilter = useMemo(() => (basis ? saring(basis, { dari: wkRange.dari, sampai: wkRange.sampai, mapel: mapelFilter }) : null), [basis, wkRange, mapelFilter]);

  // Record rata-rata harian per siswa menurut sumber STNKM (nol/kosong diabaikan per dimensi)
  const { harian, entri: entriDipakai } = useMemo(
    () => (terfilter ? bangunHarian(terfilter, sumber, caraLengkap) : { harian: [], entri: [] }),
    [terfilter, sumber, caraLengkap],
  );

  // Ember waktu: per minggu, atau per bulan (dari label bulan tiap minggu)
  const ember = useMemo(() => {
    if (!basis || !senin) return [];
    if (modeWaktu === "HARIAN") {
      // Satu titik per hari yang punya nilai pada sumber terpilih
      const tgl = [...new Set(harian.map((h) => h.tanggal))].sort();
      return tgl.map((t) => {
        const d = new Date(`${t}T00:00:00`);
        return { key: t, label: d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }), bulan: d.toLocaleDateString("id-ID", { month: "long" }),
          title: d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), tanggal: t, weeks: [] };
      });
    }
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
  }, [basis, senin, wkRange, modeWaktu, harian]);

  // Kunci ember sebuah record harian: tanggalnya (mode harian) atau minggunya
  const emberIndex = useMemo(() => {
    const map = new Map();
    ember.forEach((e, i) => (e.tanggal ? map.set(e.tanggal, i) : e.weeks.forEach((wk) => map.set(wk, i))));
    return map;
  }, [ember]);
  const kunciEmber = (h) => (modeWaktu === "HARIAN" ? h.tanggal : h.wk);

  // Rata-rata mingguan/bulanan tiap siswa = rata-rata record hariannya di ember tersebut
  const trenPerSiswa = useMemo(() => {
    const kelompok = new Map();
    harian.forEach((h) => {
      const i = emberIndex.get(kunciEmber(h));
      if (i === undefined) return;
      if (!kelompok.has(h.id_siswa)) kelompok.set(h.id_siswa, ember.map(() => []));
      kelompok.get(h.id_siswa)[i].push(h);
    });
    const hasil = new Map();
    kelompok.forEach((ems, id) => hasil.set(id, ems.map((rows) => ({ ...rataKunci(rows), hari: rows.length }))));
    return hasil;
  }, [harian, ember, emberIndex, modeWaktu]);

  const trenSiswa = (id) => trenPerSiswa.get(id) || ember.map(() => ({ ...rataKunci([]), hari: 0 }));

  // Rata-rata kelas = rata-rata dari rata-rata tiap siswa yang punya data di ember tersebut
  const trenKelas = useMemo(() => ember.map((_, i) => {
    const rows = [...trenPerSiswa.values()].map((t) => t[i]).filter((t) => t.hari > 0);
    return { ...rataKunci(rows), siswa: rows.length };
  }), [trenPerSiswa, ember]);

  // --- KONFIGURASI GRAFIK ---
  const jurnalUtama = skalaJurnal(sumber);
  const duaSumbu = pakaiDuaSumbu(sumber, caraLengkap);
  const seri = useMemo(() => seriUntuk(sumber, caraLengkap), [sumber, caraLengkap]);
  const sumbuY = (jurnal) => (jurnal
    ? { suggestedMin: -5, suggestedMax: 5, grid: { color: "rgba(0,0,0,.05)" }, title: { display: true, text: "Skor jurnal (−5..+5)" } }
    : { suggestedMin: 0, suggestedMax: 100, grid: { color: "rgba(0,0,0,.05)" }, title: { display: duaSumbu, text: "Akademik (0–100)" } });
  const configGaris = (datasets, { jurnal = jurnalUtama, kanan = false } = {}) => ({
    type: "line",
    data: { labels: ember.map((e) => e.label), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: legendGaris },
        tooltip: {
          callbacks: {
            title: (items) => `${items[0].label} (${ember[items[0].dataIndex]?.title || ""})`,
            label: (item) => ` ${item.dataset.label}${item.dataset.nama ? ` · ${item.dataset.nama}` : ""}: ${fmt(item.raw)}`,
          },
        },
        monthBand: { labels: modeWaktu !== "BULANAN" ? ember.map((e) => e.bulan) : [] },
      },
      scales: {
        y: sumbuY(jurnal),
        ...(kanan ? { y1: { ...sumbuY(true), position: "right", grid: { drawOnChartArea: false } } } : {}),
        x: sumbuX(modeWaktu !== "BULANAN"),
      },
    },
    plugins: [monthBandPlugin, whiteBgPlugin],
  });
  // Legend berupa potongan garis kecil yang meniru gaya garisnya (penuh / putus-putus), bukan bulatan besar
  const legendGaris = {
    usePointStyle: true, pointStyleWidth: 20, boxHeight: 6, padding: 12, font: { size: 11 },
    generateLabels: (chart) => chart.data.datasets.map((ds, i) => ({
      text: ds.label, datasetIndex: i, hidden: !chart.isDatasetVisible(i),
      pointStyle: "line", strokeStyle: ds.borderColor, fillStyle: ds.borderColor,
      lineWidth: 2.5, lineDash: ds.borderDash || [], fontColor: chart.options.color,
    })),
  };
  const gayaGaris = (color, dash = []) => ({
    borderColor: color, backgroundColor: color, borderDash: dash,
    tension: 0.3, spanGaps: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2,
  });
  // Tujuh garis S-T-N-K-M-B.Ind-Math dari satu deret tren (kelas atau satu siswa)
  const configStnkm = (tren) => configGaris(seri.map((s) => ({
    label: s.label, nama: s.nama, data: tren.map((t) => r1(t[s.key])), yAxisID: s.sumbu,
    ...gayaGaris(s.color, s.dash), ...(s.sumbu === "y1" ? { borderWidth: 1.5, pointRadius: 2 } : {}),
  })), { kanan: duaSumbu });

  const configKelas = useMemo(() => (terfilter && ember.length ? configStnkm(trenKelas) : null), [terfilter, ember, trenKelas, modeWaktu, seri]);

  // --- GRAFIK INDIVIDU ---
  const siswaGrafik = useMemo(() => {
    if (!laporan) return [];
    const daftar = new Map(laporan.students.map((s) => [s.id_siswa, s]));
    return siswaTerpilih.slice(0, MAX_SISWA_INDIVIDU).map((id) => daftar.get(id)).filter(Boolean);
  }, [siswaTerpilih, laporan]);

  const labelDimensi = (key) => (key === "RATA" ? (jurnalUtama ? "Rata-rata skor jurnal" : "Rata-rata STNKM-B.Ind-Math") : seri.find((s) => s.key === key)?.nama);

  // Perbandingan: satu garis per siswa dalam satu plot
  const configPerbandingan = useMemo(() => {
    if (!terfilter || siswaGrafik.length === 0 || ember.length === 0) return null;
    const nilaiDari = (t) => r1(dimensiIndividu === "RATA" ? rataGabungan(t) : t[dimensiIndividu]);
    return configGaris(siswaGrafik.map((s, i) => ({
      label: s.nama_siswa, data: trenSiswa(s.id_siswa).map(nilaiDari), ...gayaGaris(PALET_SISWA[i % PALET_SISWA.length]),
    })), { jurnal: jurnalUtama || KUNCI_JURNAL.includes(dimensiIndividu) });
  }, [terfilter, siswaGrafik, trenPerSiswa, ember, dimensiIndividu, modeWaktu, seri]);

  // Detail: satu grafik S-T-N-K-M-B.Ind-Math untuk tiap siswa
  const configDetail = useMemo(() => {
    if (!terfilter || ember.length === 0) return [];
    return siswaGrafik.map((s) => ({ siswa: s, config: configStnkm(trenSiswa(s.id_siswa)) }));
  }, [terfilter, siswaGrafik, trenPerSiswa, ember, modeWaktu, seri]);

  // --- REKAP PER SISWA: rata-rata seluruh record harian pada rentang terpilih ---
  const rekap = useMemo(() => {
    if (!terfilter || !laporan) return [];
    const perSiswa = new Map();
    harian.forEach((h) => { if (!perSiswa.has(h.id_siswa)) perSiswa.set(h.id_siswa, []); perSiswa.get(h.id_siswa).push(h); });
    return (laporan.students || []).map((s) => ({ id_siswa: s.id_siswa, nisn: s.nisn, nama_siswa: s.nama_siswa, ...rekapSiswa(perSiswa.get(s.id_siswa) || []) }));
  }, [terfilter, laporan, harian]);
  const kolom = useMemo(() => kolomTampil(sumber, caraLengkap), [sumber, caraLengkap]);

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
  const teksSumber = `STNKM ${labelSumber(sumber, caraLengkap)}`;
  const namaFile = `Laporan_STNKM_${namaKelas.replace(/\s+/g, "_")}_${toYmd(new Date())}`;

  // Kolom angka ekspor mengikuti sumber STNKM; mode dua sumbu menambah skor jurnal per dimensi
  const kolomRata = (r) => ({
    ...Object.fromEntries(kolom.filter((c) => c.key !== "rataJurnal").map((c) => [c.ekspor || c.label, angkaEkspor(c.key === "rata" ? rataGabungan(r) : r[c.key])])),
    ...(duaSumbu ? Object.fromEntries([...DIMENSI_JURNAL.map((d) => [d.label, angkaEkspor(r[d.key])]), ["Rata-rata Jurnal", angkaEkspor(rataJurnal(r))]]) : {}),
  });

  const rekapRows = () => rekapTampil.map((r, i) => ({
    "No": i + 1, "NISN": r.nisn || r.id_siswa, "Nama Siswa": r.nama_siswa,
    ...kolomRata(r), "Hari Berdata": r.hari, "Jumlah Entri": r.entri,
  }));

  const adaData = () => {
    if (!laporan) { Swal.fire("Pilih Kelas", "Pilih kelas dan periode terlebih dahulu.", "info"); return false; }
    if (rekapTampil.length === 0) { Swal.fire("Kosong", "Tidak ada data untuk diekspor.", "info"); return false; }
    return true;
  };

  const handleExportExcel = () => {
    if (!adaData()) return;
    const wb = XLSX.utils.book_new();
    const namaSiswa = new Map(laporan.students.map((s) => [s.id_siswa, s.nama_siswa]));
    const pilihSiswa = (id) => siswaTerpilih.length === 0 || siswaTerpilih.includes(id);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekapRows()), "Rekap Siswa");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ember.map((e, i) => ({
      [{ HARIAN: "Tanggal", MINGGUAN: "Minggu", BULANAN: "Bulan" }[modeWaktu]]: e.label, "Rentang": e.title,
      ...kolomRata(trenKelas[i]), "Siswa Berdata": trenKelas[i].siswa,
    }))), `Tren Kelas ${LABEL_MODE[modeWaktu]}`);
    // Tren tiap siswa per hari/minggu/bulan (mengikuti mode waktu terpilih), lengkap S-T-N-K-M
    const trenSiswaRows = laporan.students.filter((s) => pilihSiswa(s.id_siswa)).flatMap((s) => trenSiswa(s.id_siswa)
      .map((t, i) => ({ t, e: ember[i] })).filter(({ t }) => t.hari > 0)
      .map(({ t, e }) => ({ Siswa: s.nama_siswa, NISN: s.nisn || s.id_siswa, [{ HARIAN: "Tanggal", MINGGUAN: "Minggu", BULANAN: "Bulan" }[modeWaktu]]: e.label, Rentang: e.title, ...kolomRata(t), "Hari Berdata": t.hari })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trenSiswaRows.length ? trenSiswaRows : [{ Keterangan: "Tidak ada data" }]), `Tren Siswa ${LABEL_MODE[modeWaktu]}`);
    // Record rata-rata harian per siswa: dasar seluruh perhitungan mingguan/bulanan
    const perHari = harian.filter((h) => pilihSiswa(h.id_siswa)).map((h) => ({
      Tanggal: h.tanggal, Minggu: h.wk, Siswa: namaSiswa.get(h.id_siswa) || h.id_siswa, ...kolomRata(h),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perHari.length ? perHari : [{ Keterangan: "Tidak ada data" }]), "Rata Harian Siswa");
    // Data mentah sesuai filter, untuk diolah lebih lanjut
    const namaMapel = new Map(laporan.mapels.map((m) => [m.id_mapel, m.nama_mapel]));
    const mentah = [
      ...terfilter.nilai.filter((n) => pilihSiswa(n.id_siswa)).map((n) => ({ Sumber: "Nilai", Tanggal: n.tanggal, Minggu: n.wk, Siswa: namaSiswa.get(n.id_siswa) || n.id_siswa, Mapel: namaMapel.get(n.id_mapel) || n.id_mapel, Materi: n.materi || "-", Jenis: n.jenis || "-", Tipe: n.tipe === "REMEDIAL" ? "Remedial" : "Reguler", Nilai: n.nilai, ...Object.fromEntries(DIMENSI.map((d) => [d.key, n[d.key]])), "Metode STNKM": n.metode === "MANUAL" ? "Manual" : "Otomatis" })),
      ...terfilter.jurnal.filter((j) => pilihSiswa(j.id_siswa)).map((j) => ({ Sumber: "Jurnal", Tanggal: j.tanggal, Minggu: j.wk, Siswa: namaSiswa.get(j.id_siswa) || j.id_siswa, Mapel: "-", Materi: "-", Jenis: "Jurnal", Tipe: "-", Nilai: "", ...Object.fromEntries(DIMENSI.map((d) => [d.key, j[d.key]])), "Metode STNKM": "Jurnal" })),
    ].sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mentah.length ? mentah : [{ Keterangan: "Tidak ada data" }]), "Data Mentah");
    XLSX.writeFile(wb, `${namaFile}_${labelSumber(sumber, caraLengkap).replace(/[^\w]+/g, "_")}_${LABEL_MODE[modeWaktu]}.xlsx`);
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
    await generateProfessionalPDF(rekapRows(), `Laporan STNKM ${namaKelas} - ${labelPeriode} (${labelRentang})`, settings, getBase64ImageFromUrl,
      { sub: `${teksSumber}${mapelFilter ? ` · ${laporan.mapels.find((m) => m.id_mapel === mapelFilter)?.nama_mapel}` : " · Semua mapel"} · ${rekapTampil.length} siswa` });
  };

  // --- EKSPOR GRAFIK: tiap halaman berkop judul resmi, kelas, lalu keterangan isi grafik ---
  const halamanGrafik = (jenis) => {
    const waktu = `${{ HARIAN: "Per hari", MINGGUAN: "Per minggu", BULANAN: "Per bulan" }[modeWaktu]} ${labelRentang}`;
    const mapel = mapelFilter ? laporan.mapels.find((m) => m.id_mapel === mapelFilter)?.nama_mapel : null;
    const ket = (...bagian) => [...bagian, teksSumber, labelPeriode, waktu, mapel].filter(Boolean).join(" · ");
    if (jenis === "Kelas") {
      return configKelas ? [{ config: configKelas, keterangan: ket("Rata-rata kelas"), file: "Kelas" }] : [];
    }
    const halaman = [];
    if (configPerbandingan) {
      halaman.push({ config: configPerbandingan, keterangan: ket(`Perbandingan ${siswaGrafik.length} siswa`, labelDimensi(dimensiIndividu)), file: "Perbandingan" });
    }
    configDetail.forEach(({ siswa, config }) => halaman.push({
      config, keterangan: ket(`${siswa.nama_siswa}${siswa.nisn ? ` (NISN ${siswa.nisn})` : ""}`, "Detail S-T-N-K-M-B.Ind-Math"),
      file: `Detail_${siswa.nama_siswa.replace(/[^\w]+/g, "_")}`,
    }));
    return halaman;
  };

  const eksporGrafik = async (jenis, buat) => {
    const halaman = halamanGrafik(jenis);
    if (halaman.length === 0) return Swal.fire("Belum Ada Grafik", "Grafik belum tampil.", "info");
    Swal.fire({ title: "Menyiapkan ekspor...", text: `${halaman.length} halaman grafik`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      await buat(halaman);
      Swal.close();
    } catch (err) { Swal.fire("Gagal Ekspor", err.message, "error"); }
  };

  const NAMA_SISTEM = "Sistem Informasi Akademik & Analitik STNKM";

  const gambarHalaman = async ({ config, keterangan }, nomor, total) => {
    const W = 1200, PAD = 32, KOP = 112, CH = 600, KAKI = 40, S = 2;
    const grafik = await renderGrafikStatis(config, W - PAD * 2, CH, S);
    const canvas = document.createElement("canvas");
    canvas.width = W * S;
    canvas.height = (KOP + CH + KAKI) * S;
    const ctx = canvas.getContext("2d");
    ctx.scale(S, S);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, KOP + CH + KAKI);

    ctx.textAlign = "center";
    ctx.fillStyle = "#212529";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText(JUDUL_GRAFIK, W / 2, 42);
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText(labelKelasResmi(namaKelas), W / 2, 70);
    ctx.fillStyle = "#6c757d";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(keterangan, W / 2, 94);

    ctx.drawImage(grafik, PAD, KOP, W - PAD * 2, CH);

    ctx.strokeStyle = "#dee2e6";
    ctx.beginPath(); ctx.moveTo(PAD, KOP + CH + 8); ctx.lineTo(W - PAD, KOP + CH + 8); ctx.stroke();
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(settings?.nama_sekolah || NAMA_SISTEM, PAD, KOP + CH + 26);
    ctx.textAlign = "center";
    if (total > 1) ctx.fillText(`Halaman ${nomor} dari ${total}`, W / 2, KOP + CH + 26);
    ctx.textAlign = "right";
    ctx.fillText(`Dicetak: ${new Date().toLocaleString("id-ID")}`, W - PAD, KOP + CH + 26);
    return canvas;
  };

  // Satu file PNG per halaman, diunduh berurutan
  const handleExportPNG = (jenis) => eksporGrafik(jenis, async (halaman) => {
    for (let i = 0; i < halaman.length; i++) {
      const canvas = await gambarHalaman(halaman[i], i + 1, halaman.length);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = halaman.length > 1
        ? `${namaFile}_${String(i + 1).padStart(2, "0")}_${halaman[i].file}.png`
        : `${namaFile}_Grafik_${halaman[i].file}.png`;
      link.click();
      if (i < halaman.length - 1) await jeda(400);
    }
  });

  // A4 landscape, satu grafik per halaman; grafik mengisi sisa halaman di bawah kop dengan proporsi tetap
  const handleExportGrafikPDF = (jenis) => eksporGrafik(jenis, async (halaman) => {
    const doc = new jsPDF("landscape", "mm", "a4");
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    const M = 12, atas = 40, bawah = ph - 14;
    const lebarMm = pw - M * 2, tinggiMm = bawah - atas;
    const PX_PER_MM = 4; // label grafik 12px ≈ 8,5pt di kertas
    const dicetak = new Date().toLocaleString("id-ID");

    for (let i = 0; i < halaman.length; i++) {
      if (i > 0) doc.addPage();
      const grafik = await renderGrafikStatis(halaman[i].config, Math.round(lebarMm * PX_PER_MM), Math.round(tinggiMm * PX_PER_MM), 3);

      doc.setTextColor(33, 37, 41);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(JUDUL_GRAFIK, pw / 2, 17, { align: "center" });
      doc.setFontSize(13);
      doc.text(labelKelasResmi(namaKelas), pw / 2, 25, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(108, 117, 125);
      doc.text(halaman[i].keterangan, pw / 2, 31, { align: "center" });
      doc.setDrawColor(173, 181, 189);
      doc.setLineWidth(0.4);
      doc.line(M, 35, pw - M, 35);

      doc.addImage(grafik.toDataURL("image/png"), "PNG", M, atas, lebarMm, tinggiMm);

      doc.setFontSize(8);
      doc.text(settings?.nama_sekolah || NAMA_SISTEM, M, ph - 7);
      if (halaman.length > 1) doc.text(`Halaman ${i + 1} dari ${halaman.length}`, pw / 2, ph - 7, { align: "center" });
      doc.text(`Dicetak pada: ${dicetak}`, pw - M, ph - 7, { align: "right" });
    }
    doc.save(`${namaFile}_Grafik_${jenis}.pdf`);
  });

  const tombolEksporGrafik = (jenis, judul) => (
    <div className="btn-group btn-group-sm">
      <button type="button" className="btn btn-outline-secondary" onClick={() => handleExportPNG(jenis)} title={`Unduh PNG berkop: ${judul}`}>
        <i className="bi bi-image me-1"></i>PNG
      </button>
      <button type="button" className="btn btn-outline-danger" onClick={() => handleExportGrafikPDF(jenis)} title={`Unduh PDF: ${judul}`}>
        <i className="bi bi-file-earmark-pdf me-1"></i>PDF
      </button>
    </div>
  );

  // --- RINCIAN SISWA: halaman baru dengan filter yang sedang aktif ---
  const tautanRincian = (idSiswa) => `/dashboard/laporan-stnkm/siswa?${new URLSearchParams({
    id_kelas: filters.id_kelas, id_periode: filters.id_periode, id_siswa: idSiswa, mulai: filters.tanggal_mulai,
    dari: wkRange.dari, sampai: wkRange.sampai, ...(mapelFilter && { mapel: mapelFilter }), sumber, ...(sumber === "LENGKAP" && { cara: caraLengkap }),
  })}`;

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
  const adaDataTren = trenKelas.some((t) => t.siswa > 0);

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
                <div className="col-12 col-xl-6">
                  <label className="form-label fw-semibold small mb-1">Sumber STNKM</label>
                  <div className="btn-group w-100" role="group" aria-label="Sumber STNKM" data-sumber-stnkm>
                    {SUMBER.map((o) => (
                      <button key={o.value} type="button" title={o.ket} aria-pressed={sumber === o.value}
                        className={`btn text-nowrap ${sumber === o.value ? "btn-primary" : "btn-outline-primary"}`} onClick={() => { setSumber(o.value); setPage(1); }}>
                        <i className={`bi ${o.icon} me-1 d-none d-sm-inline`}></i>{o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <label className="form-label fw-semibold small mb-1">Mode Waktu</label>
                  <div className="btn-group w-100" role="group" aria-label="Mode waktu">
                    {[["HARIAN", "Harian", "bi-calendar-day"], ["MINGGUAN", "Mingguan", "bi-calendar-week"], ["BULANAN", "Bulanan", "bi-calendar-month"]].map(([v, l, ic]) => (
                      <button key={v} type="button" aria-pressed={modeWaktu === v}
                        className={`btn text-nowrap ${modeWaktu === v ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setModeWaktu(v)}>
                        <i className={`bi ${ic} me-1 d-none d-sm-inline`}></i>{l}
                      </button>
                    ))}
                  </div>
                </div>
                {sumber === "LENGKAP" && (
                  <div className="col-12">
                    <div className="d-flex flex-wrap align-items-center gap-2 p-2 rounded border bg-body-tertiary" data-cara-lengkap>
                      <span className="small fw-semibold text-muted me-1">Tampilan Lengkap:</span>
                      <div className="btn-group btn-group-sm" role="group" aria-label="Cara menampilkan akademik + jurnal">
                        {CARA_LENGKAP.map((c) => (
                          <button key={c.value} type="button" aria-pressed={caraLengkap === c.value}
                            className={`btn text-nowrap ${caraLengkap === c.value ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => setCaraLengkap(c.value)}>
                            <i className={`bi ${c.icon} me-1`}></i>{c.label}
                          </button>
                        ))}
                      </div>
                      <small className="text-muted flex-grow-1" style={{ minWidth: 220 }}>{CARA_LENGKAP.find((c) => c.value === caraLengkap)?.ket}</small>
                    </div>
                  </div>
                )}
                <div className="col-12 col-md-4">
                  <label className="form-label fw-semibold small mb-1">Rentang Minggu</label>
                  <div className="input-group">
                    <select className="form-select" aria-label="Dari minggu" value={wkRange.dari} onChange={(e) => setWkRange((r) => ({ dari: +e.target.value, sampai: Math.max(+e.target.value, r.sampai) }))}>
                      {opsiMinggu.map((w) => <option key={w} value={w}>Wk.{w}</option>)}
                    </select>
                    <span className="input-group-text px-2">s/d</span>
                    <select className="form-select" aria-label="Sampai minggu" value={wkRange.sampai} onChange={(e) => setWkRange((r) => ({ sampai: +e.target.value, dari: Math.min(+e.target.value, r.dari) }))}>
                      {opsiMinggu.map((w) => <option key={w} value={w}>Wk.{w}</option>)}
                    </select>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label fw-semibold small mb-1">Mata Pelajaran (nilai)</label>
                  <select className="form-select" value={mapelFilter} onChange={(e) => setMapelFilter(e.target.value)} disabled={sumber === "JURNAL"}
                    title={sumber === "JURNAL" ? "Jurnal tidak terikat mapel" : undefined}>
                    <option value="">Semua Mapel</option>
                    {laporan.mapels.map((m) => <option key={m.id_mapel} value={m.id_mapel}>{m.nama_mapel}</option>)}
                  </select>
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label fw-semibold small mb-1">Siswa</label>
                  <div className="dropdown">
                    <button className="btn btn-outline-secondary dropdown-toggle w-100 text-start d-flex justify-content-between align-items-center" type="button"
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
                <span className="text-muted fw-normal small ms-2">{{ HARIAN: "per hari", MINGGUAN: "per minggu", BULANAN: "per bulan" }[modeWaktu]} · {labelRentang}</span>
              </h3>
              {tombolEksporGrafik("Kelas", "grafik rata-rata kelas")}
            </div>
            <div className="card-body">
              {adaDataTren ? (
                <Grafik config={configKelas} height={380} />
              ) : (
                <div className="text-center text-muted py-5"><i className="bi bi-inbox fs-1 d-block mb-2"></i>Belum ada data {teksSumber} pada rentang ini.</div>
              )}
              <small className="text-muted d-block mt-2">
                <i className="bi bi-info-circle me-1"></i>Semua titik adalah nilai rata-rata: entri satu siswa di hari yang sama dirata-rata menjadi satu record harian, lalu record harian dirata-rata per minggu/bulan, dan rata-rata kelas adalah rata-rata dari siswa yang punya data. Nilai nol atau kosong tidak dihitung, sehingga hanya nilai yang ada yang tampil.{" "}
                {sumber === "AKADEMIK" && "S–M dari poin nilai (diisi manual oleh guru, atau dihitung nilai × matriks), skala 0–100; garis putus-putus B.Ind dan Math adalah poin aspek Teori mapel Bahasa Indonesia dan Matematika."}
                {sumber === "JURNAL" && "S–M dari skor jurnal anekdotal, skala −5 sampai +5. Skor negatif tetap dihitung."}
                {sumber === "LENGKAP" && caraLengkap === "DUA_SUMBU" && "Garis tegas: poin akademik (sumbu kiri, 0–100). Garis titik-titik J·S–J·M: skor jurnal (sumbu kanan, −5..+5). Keduanya tidak dicampur karena skalanya berbeda."}
                {sumber === "LENGKAP" && caraLengkap === "KONVERSI" && "S–M menggabungkan poin akademik dengan skor jurnal yang dikonversi ke 0–100 ((skor + 5) × 10: −5 → 0, 0 → 50, +5 → 100)."}
              </small>
            </div>
          </div>

          {/* GRAFIK INDIVIDU */}
          {siswaGrafik.length > 0 && (
            <div className="card card-outline card-warning shadow-sm mb-3">
              <div className="card-header d-flex flex-wrap align-items-center gap-2">
                <h3 className="card-title fw-semibold mb-0 me-auto">
                  <i className="bi bi-person-lines-fill me-2"></i>Grafik Individu Siswa
                  {siswaTerpilih.length > MAX_SISWA_INDIVIDU && <span className="text-muted fw-normal small ms-2">({MAX_SISWA_INDIVIDU} siswa pertama)</span>}
                </h3>
                {tombolEksporGrafik("Individu", `perbandingan + detail ${siswaGrafik.length} siswa (${siswaGrafik.length + 1} halaman)`)}
              </div>
              <div className="card-body">
                {/* 1. PERBANDINGAN */}
                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                  <h6 className="fw-semibold mb-0 me-auto"><i className="bi bi-people me-1 text-warning"></i>Perbandingan Rata-rata Siswa</h6>
                  <select className="form-select form-select-sm w-auto" value={dimensiIndividu} onChange={(e) => setDimensiIndividu(e.target.value)}>
                    <option value="RATA">{labelDimensi("RATA")}</option>
                    {seri.map((s) => <option key={s.key} value={s.key}>{s.label} · {s.nama}</option>)}
                  </select>
                </div>
                <Grafik config={configPerbandingan} height={330} />

                {/* 2. DETAIL PER SISWA */}
                <h6 className="fw-semibold mt-4 mb-2"><i className="bi bi-person-badge me-1 text-warning"></i>Detail S-T-N-K-M-B.Ind-Math per Siswa</h6>
                <div className="row g-3">
                  {configDetail.map(({ siswa, config }) => (
                    <div key={siswa.id_siswa} className={configDetail.length > 1 ? "col-12 col-xxl-6" : "col-12"}>
                      <div className="border rounded p-2 h-100">
                        <div className="small fw-semibold mb-1">{siswa.nama_siswa}<span className="text-muted fw-normal ms-2">{siswa.nisn || siswa.id_siswa}</span></div>
                        <Grafik config={config} height={320} />
                      </div>
                    </div>
                  ))}
                </div>
                <small className="text-muted d-block mt-2">
                  <i className="bi bi-info-circle me-1"></i>Ekspor PNG/PDF menghasilkan halaman 1 untuk perbandingan, lalu satu halaman detail untuk tiap siswa.
                </small>
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
                  <small className="text-muted">{teksSumber} · rata-rata dari record harian {labelRentang}{mapelFilter && sumber !== "JURNAL" ? ` · ${laporan.mapels.find((m) => m.id_mapel === mapelFilter)?.nama_mapel}` : ""}</small>
                  <small className="text-muted d-block"><i className="bi bi-hand-index me-1"></i>Klik baris siswa untuk melihat rincian hari dan entri.</small>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th className="text-center">No</th>
                      {sortHeader("nama_siswa", "Nama Siswa", "")}
                      {kolom.map((c) => sortHeader(c.key, c.label))}
                      {sortHeader("hari", "Hari")}
                      {sortHeader("entri", "Entri")}
                      <th aria-hidden="true"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr><td colSpan={kolom.length + 5} className="text-center text-muted py-4">Tidak ada data siswa.</td></tr>
                    ) : pageRows.map((r, i) => (
                      <tr key={r.id_siswa} role="link" tabIndex={0} style={{ cursor: "pointer" }} data-rincian-siswa={r.id_siswa}
                        title={`Lihat rincian ${r.hari} hari dan ${r.entri} entri ${r.nama_siswa}`}
                        onClick={() => router.push(tautanRincian(r.id_siswa))}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(tautanRincian(r.id_siswa)); } }}>
                        <td className="text-center text-muted">{(currentPage - 1) * ROWS_PER_PAGE + i + 1}</td>
                        <td>
                          <div className="fw-semibold">{r.nama_siswa}</div>
                          <small className="text-muted">{r.nisn || r.id_siswa}</small>
                        </td>
                        {kolom.map((c) => <td key={c.key} className={`text-center ${c.kuat ? "fw-bold" : ""} ${warnaSkor(r[c.key])}`}>{fmt(r[c.key])}</td>)}
                        <td className="text-center text-muted">{r.hari}</td>
                        <td className="text-center"><span className="badge bg-body-secondary text-body-secondary border">{r.entri}</span></td>
                        <td className="text-end text-muted"><i className="bi bi-chevron-right"></i></td>
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
