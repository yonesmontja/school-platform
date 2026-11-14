"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import ChartCard, {
  ChartCanvas,
  MenuEkspor,
} from "@/components/dashboard/ChartCard";
import { OPSI_TINDAK_LANJUT } from "@/components/nilai/ModalTindakLanjut";
import {
  eksporCSV,
  eksporPDFEws,
  eksporPNGEws,
} from "@/components/dashboard/chartExport";
import {
  ACCENTS,
  THEME_MODES,
  setAccent,
  setThemeMode,
  useAppTheme,
} from "@/app/lib/themePrefs";
import {
  DIMENSI,
  EWS_DEFAULT,
  KELOMPOK,
  METRIK,
  MODE_WAKTU,
  PALET,
  PRESET_KUSTOM,
  TIPE_GRAFIK,
  buatKonteks,
  fmt,
  grafikDistribusi,
  grafikJenis,
  grafikKehadiran,
  grafikKorelasi,
  grafikMapel,
  grafikProgres,
  grafikRadar,
  hitungEfektivitas,
  hitungEWS,
  hitungIndikator,
  hitungKPI,
  hitungKustom,
  tanggalMulaiSemester,
} from "./_lib/analitik";
import { API_URL } from "@/app/lib/config";
import { MenuAksi } from "@/components/dashboard/menuAksi";

const getToken = () => localStorage.getItem("token");
const KEY_PREFS = "dashboard_prefs_v1";
const EWS_PER_PAGE = 8;

// Grafik bawaan; urutan, ukuran, dan visibilitasnya bisa diatur pengguna
const WIDGETS = [
  {
    id: "progres",
    title: "Progres Capaian STNKM",
    subtitle:
      "Pergerakan S-T-N-K-M, Teori B.Ind & Math sepanjang waktu (minggu dihitung dari awal semester)",
    icon: "bi-graph-up-arrow",
    variant: "primary",
    size: "full",
    height: 320,
  },
  {
    id: "radar",
    title: "Profil Radar STNKM",
    subtitle: "Rata-rata poin 5 dimensi kelas (dan siswa terpilih)",
    icon: "bi-hexagon",
    variant: "info",
    size: "half",
  },
  {
    id: "mapel",
    title: "Capaian Rata-rata per Mapel",
    subtitle: "Rata-rata nilai terhadap KKM tiap mapel",
    icon: "bi-bar-chart",
    variant: "success",
    size: "half",
  },
  {
    id: "distribusi",
    title: "Distribusi Nilai",
    subtitle: "Sebaran nilai per rentang",
    icon: "bi-bar-chart-steps",
    variant: "warning",
    size: "half",
  },
  {
    id: "jenis",
    title: "Proporsi Jenis Penilaian",
    subtitle: "Sebaran entri per jenis asesmen",
    icon: "bi-pie-chart",
    variant: "secondary",
    size: "half",
  },
  {
    id: "kehadiran",
    title: "Komposisi Kehadiran",
    subtitle: "Hadir, sakit, izin, dan alpa pada periode ini",
    icon: "bi-calendar-check",
    variant: "success",
    size: "half",
  },
  {
    id: "korelasi",
    title: "Korelasi Nilai, Kehadiran & Karakter",
    subtitle:
      "Indeks karakter = skor jurnal Karakter (−5..5) dipetakan ke 0–100",
    icon: "bi-people",
    variant: "info",
    size: "full",
  },
];
const PREFS_DEFAULT = {
  hidden: {},
  collapsed: {},
  order: WIDGETS.map((w) => w.id),
  size: {},
  ews: EWS_DEFAULT,
  waktu: "monthly",
  custom: [],
};
const SPEC_BARU = {
  judul: "",
  tipe: "bar",
  metrik: ["nilai_avg"],
  kelompok: "siswa",
  urut: "desc",
  batas: 10,
  warna: "palet",
  ukuran: "half",
};

const bacaPrefs = () => {
  try {
    const p = JSON.parse(localStorage.getItem(KEY_PREFS) || "null");
    return p
      ? { ...PREFS_DEFAULT, ...p, ews: { ...EWS_DEFAULT, ...(p.ews || {}) } }
      : PREFS_DEFAULT;
  } catch (e) {
    return PREFS_DEFAULT;
  }
};
const sapaan = () => {
  const j = new Date().getHours();
  return j < 11
    ? "Selamat pagi"
    : j < 15
      ? "Selamat siang"
      : j < 19
        ? "Selamat sore"
        : "Selamat malam";
};

// Garis tren mini untuk kartu KPI
const Sparkline = ({ data, color = "var(--app-accent)" }) => {
  const nilai = data.filter((v) => v !== null);
  if (nilai.length < 2) return null;
  const min = Math.min(...nilai),
    max = Math.max(...nilai),
    rentang = max - min || 1;
  const titik = data
    .map((v, i) =>
      v === null
        ? null
        : [(i / (data.length - 1)) * 100, 28 - ((v - min) / rentang) * 24],
    )
    .filter(Boolean);
  const d = titik
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="dash-spark"
      aria-hidden="true"
    >
      <path d={`${d} L100,30 L0,30 Z`} fill={color} opacity="0.12" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
};

const StatCard = ({ icon, label, value, color, hint }) => (
  <div className="col-6 col-md-4 col-xl-2">
    <div className="dash-stat h-100">
      <span className={`dash-stat-icon text-bg-${color}`}>
        <i className={`bi ${icon}`}></i>
      </span>
      <div className="min-w-0">
        <div className="dash-stat-value">{value}</div>
        <div className="dash-stat-label text-truncate">{label}</div>
        {hint && <div className="dash-stat-hint text-truncate">{hint}</div>}
      </div>
    </div>
  </div>
);

const Offcanvas = ({ show, title, onClose, children }) => {
  if (!show) return null;
  return (
    <>
      <div
        className="offcanvas offcanvas-end show dash-offcanvas"
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        style={{ visibility: "visible" }}
      >
        <div className="offcanvas-header border-bottom">
          <h5 className="offcanvas-title fw-bold">
            <i className="bi bi-sliders me-2 text-primary"></i>
            {title}
          </h5>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Tutup"
          ></button>
        </div>
        <div className="offcanvas-body">{children}</div>
      </div>
      <div className="offcanvas-backdrop fade show" onClick={onClose}></div>
    </>
  );
};

const Modal = ({
  show,
  title,
  icon,
  onClose,
  children,
  footer,
  size = "modal-xl",
}) => {
  if (!show) return null;
  return (
    <>
      <div
        className="modal fade show d-block"
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          className={`modal-dialog ${size} modal-dialog-centered modal-dialog-scrollable`}
        >
          <div className="modal-content border-0 shadow rounded-4">
            <div className="modal-header">
              <h5 className="modal-title fw-bold">
                <i className={`bi ${icon} text-primary me-2`}></i>
                {title}
              </h5>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
                aria-label="Tutup"
              ></button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
};

export default function DashboardPage() {
  const router = useRouter();
  const tema = useAppTheme();
  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [periodes, setPeriodes] = useState([]);
  const [sekolah, setSekolah] = useState(null);
  const [filter, setFilter] = useState({ id_kelas: "ALL", id_periode: "" });
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("memuat"); // memuat | menunggu | gagal | ok
  const [percobaan, setPercobaan] = useState(0);
  const [muatUlang, setMuatUlang] = useState(0);

  const [prefs, setPrefs] = useState(PREFS_DEFAULT);
  const [prefsSiap, setPrefsSiap] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editSpec, setEditSpec] = useState(null);

  // Kontrol grafik progres
  const [progres, setProgres] = useState({
    sumber: "AKADEMIK",
    siswa: "ALL",
    mode: "monthly",
  });
  const [batasKorelasi, setBatasKorelasi] = useState(15);

  // EWS
  const [ewsFilter, setEwsFilter] = useState("ALL");
  const [ewsCari, setEwsCari] = useState("");
  const [ewsSort, setEwsSort] = useState({ col: "skor", asc: false });
  const [ewsPage, setEwsPage] = useState(1);
  const [ewsZoom, setEwsZoom] = useState(false);
  // Indikator perlu perhatian
  const [indMapel, setIndMapel] = useState("ALL");
  const [indSemua, setIndSemua] = useState(false);
  const [indLengkap, setIndLengkap] = useState(false);

  const fetchJSON = async (url) => {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: "application/json",
      },
    });
    if (res.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      router.push("/login");
      throw new Error("Sesi berakhir.");
    }
    const json = await res.json();
    if (!res.ok)
      throw new Error(json.message || "Terjadi kesalahan pada server");
    return json;
  };

  // --- PREFERENSI DASBOR ---
  useEffect(() => {
    const p = bacaPrefs();
    setPrefs(p);
    setProgres((s) => ({ ...s, mode: p.waktu || "monthly" }));
    setPrefsSiap(true);
  }, []);
  useEffect(() => {
    if (!prefsSiap) return;
    try {
      localStorage.setItem(KEY_PREFS, JSON.stringify(prefs));
    } catch (e) {
      /* storage diblokir */
    }
  }, [prefs, prefsSiap]);
  const ubahPrefs = (fn) => setPrefs((p) => fn(p));

  // --- REFERENSI (sekali) ---
  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData || !getToken()) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(userData));
  }, [router]);

  // --- DATA DASBOR; mencoba ulang otomatis bila server API belum bisa dihubungi ---
  useEffect(() => {
    if (!getToken()) return;
    let batal = false,
      timer = null;
    const MAX_COBA = 6;
    const muat = async (ke = 1) => {
      try {
        let idPeriode = filter.id_periode;
        if (!periodes.length) {
          const [ref, set] = await Promise.all([
            fetchJSON(`${API_URL}/nilai/filters`),
            fetchJSON(`${API_URL}/settings`),
          ]);
          if (batal) return;
          setClasses(ref.classes || []);
          setPeriodes(ref.periodes || []);
          setSekolah(set);
          idPeriode =
            idPeriode ||
            (
              ref.periodes.find((p) => p.status_aktif === "AKTIF") ||
              ref.periodes[0]
            )?.id_periode ||
            "";
          if (idPeriode !== filter.id_periode) {
            setFilter((f) => ({ ...f, id_periode: idPeriode }));
            return;
          }
        }
        if (!idPeriode) {
          setStatus("ok");
          setData(null);
          return;
        }
        const res = await fetchJSON(
          `${API_URL}/dashboard?${new URLSearchParams({ id_periode: idPeriode, id_kelas: filter.id_kelas })}`,
        );
        if (batal) return;
        setData(res);
        setStatus("ok");
        setEwsPage(1);
      } catch (err) {
        if (batal) return;
        if (err instanceof TypeError && ke < MAX_COBA) {
          setStatus("menunggu");
          setPercobaan(ke);
          timer = setTimeout(() => muat(ke + 1), Math.min(2000 * ke, 8000));
        } else {
          setStatus("gagal");
        }
      }
    };
    setStatus((s) => (s === "ok" ? "memuat" : s));
    muat();
    return () => {
      batal = true;
      clearTimeout(timer);
    };
  }, [filter.id_kelas, filter.id_periode, muatUlang]);

  const ctx = useMemo(() => (data ? buatKonteks(data) : null), [data]);
  const kpi = useMemo(() => (data ? hitungKPI(data, ctx) : null), [data, ctx]);
  const ews = useMemo(
    () => (data ? hitungEWS(data, ctx, prefs.ews) : []),
    [data, ctx, prefs.ews],
  );
  const indikator = useMemo(
    () => (data ? hitungIndikator(data, ctx) : []),
    [data, ctx],
  );
  // Bawaan: hanya indikator yang punya siswa belum tuntas; 8 teratas kecuali diperluas
  const indikatorTampil = indikator.filter(
    (i) =>
      (indMapel === "ALL" || i.id_mapel === indMapel) &&
      (indSemua || i.belum.length > 0),
  );
  const mapelIndikator = [
    ...new Map(indikator.map((i) => [i.id_mapel, i.mapel])).entries(),
  ];
  const efektivitas = useMemo(
    () => (data ? hitungEfektivitas(data, ctx) : null),
    [data, ctx],
  );

  // Siswa terpilih di grafik progres di-reset bila tidak ada di konteks baru
  useEffect(() => {
    if (
      data &&
      progres.siswa !== "ALL" &&
      !data.students.some((s) => s.id_siswa === progres.siswa)
    )
      setProgres((p) => ({ ...p, siswa: "ALL" }));
  }, [data]);

  // Wk.1 = minggu pertama semester, sama dengan Laporan STNKM
  const tanggalMulai = tanggalMulaiSemester(
    periodes.find((p) => p.id_periode === filter.id_periode),
  );

  const hasil = useMemo(() => {
    if (!data) return {};
    return {
      progres: grafikProgres(data, ctx, { ...progres, tanggalMulai }),
      radar: grafikRadar(data, ctx, { siswa: progres.siswa }),
      mapel: grafikMapel(data, ctx),
      distribusi: grafikDistribusi(data),
      jenis: grafikJenis(data, ctx),
      kehadiran: grafikKehadiran(data),
      korelasi: grafikKorelasi(data, ctx, { batas: batasKorelasi }),
      ...Object.fromEntries(
        prefs.custom.map((c) => [c.id, hitungKustom(data, ctx, c)]),
      ),
    };
  }, [data, ctx, progres, tanggalMulai, batasKorelasi, prefs.custom]);

  const namaKelas =
    filter.id_kelas === "ALL"
      ? "Seluruh Kelas"
      : classes.find((k) => k.id_kelas === filter.id_kelas)?.nama_kelas || "-";
  const periodeObj = periodes.find((p) => p.id_periode === filter.id_periode);
  const labelPeriode = periodeObj
    ? `${periodeObj.tahun_ajaran} (${periodeObj.semester})`
    : "-";
  const exportCtx = {
    konteks: `${namaKelas} • ${labelPeriode}`,
    sekolah,
    petugas: user?.name,
  };

  // --- URUTAN WIDGET (bawaan + kustom) ---
  const semuaWidget = useMemo(() => {
    const kustom = prefs.custom.map((c) => ({
      id: c.id,
      title: c.judul || "Grafik kustom",
      subtitle: `${METRIK.filter((m) => c.metrik.includes(m.id))
        .map((m) => m.label)
        .join(
          ", ",
        )} per ${KELOMPOK.find((k) => k.id === c.kelompok)?.label.toLowerCase()}`,
      icon: TIPE_GRAFIK.find((t) => t.id === c.tipe)?.icon || "bi-bar-chart",
      variant: "primary",
      size: c.ukuran || "half",
      custom: true,
    }));
    const daftar = [...WIDGETS, ...kustom];
    const urut = [
      ...prefs.order.filter((id) => daftar.some((w) => w.id === id)),
      ...daftar.filter((w) => !prefs.order.includes(w.id)).map((w) => w.id),
    ];
    return urut.map((id) => daftar.find((w) => w.id === id));
  }, [prefs.order, prefs.custom]);

  const pindahWidget = (id, arah) =>
    ubahPrefs((p) => {
      const order = semuaWidget.map((w) => w.id);
      const i = order.indexOf(id),
        j = i + arah;
      if (j < 0 || j >= order.length) return p;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...p, order };
    });
  const ukuranWidget = (w) => prefs.size[w.id] || w.size;

  // --- GRAFIK KUSTOM ---
  const simpanKustom = () => {
    const spec = {
      ...editSpec,
      judul: editSpec.judul.trim() || "Grafik kustom",
    };
    if (!spec.metrik.length)
      return Swal.fire("Perhatian", "Pilih minimal satu metrik.", "warning");
    ubahPrefs((p) => {
      const ada = p.custom.some((c) => c.id === spec.id);
      return {
        ...p,
        custom: ada
          ? p.custom.map((c) => (c.id === spec.id ? spec : c))
          : [...p.custom, spec],
        order: ada ? p.order : [...p.order, spec.id],
        hidden: { ...p.hidden, [spec.id]: false },
      };
    });
    setEditSpec(null);
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: "Grafik disimpan di dasbor",
      showConfirmButton: false,
      timer: 1800,
    });
  };
  const hapusKustom = async (id) => {
    const ok = await Swal.fire({
      title: "Hapus grafik ini?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      confirmButtonText: "Ya, Hapus",
      cancelButtonText: "Batal",
    });
    if (!ok.isConfirmed) return;
    ubahPrefs((p) => ({
      ...p,
      custom: p.custom.filter((c) => c.id !== id),
      order: p.order.filter((o) => o !== id),
    }));
  };
  const previewKustom = useMemo(
    () => (editSpec && data ? hitungKustom(data, ctx, editSpec) : null),
    [editSpec, data, ctx],
  );
  const tipeMelingkar =
    editSpec && ["doughnut", "pie", "polarArea"].includes(editSpec.tipe);

  // --- EWS ---
  const ewsHitung = { ALL: ews.length, AKADEMIK: 0, PRESENSI: 0, KARAKTER: 0 };
  ews.forEach((r) =>
    r.kategori.forEach((k) => {
      ewsHitung[k]++;
    }),
  );
  const ewsTampil = useMemo(() => {
    const q = ewsCari.trim().toLowerCase();
    const list = ews.filter(
      (r) =>
        (ewsFilter === "ALL" || r.kategori.includes(ewsFilter)) &&
        (!q ||
          [
            r.nama_siswa,
            r.nisn,
            r.id_siswa,
            r.kelas,
            r.kategori.join(" "),
            ...r.issues.map((i) => i.deskripsi),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    const { col, asc } = ewsSort;
    return [...list].sort((a, b) => {
      const va =
        col === "skor"
          ? a.skor
          : col === "kategori"
            ? a.kategori.join(",")
            : a.nama_siswa.toLowerCase();
      const vb =
        col === "skor"
          ? b.skor
          : col === "kategori"
            ? b.kategori.join(",")
            : b.nama_siswa.toLowerCase();
      return (va < vb ? -1 : va > vb ? 1 : 0) * (asc ? 1 : -1);
    });
  }, [ews, ewsFilter, ewsCari, ewsSort]);
  const ewsPages = Math.max(1, Math.ceil(ewsTampil.length / EWS_PER_PAGE));
  const ewsHal = Math.min(ewsPage, ewsPages);
  const ewsBaris = ewsTampil.slice(
    (ewsHal - 1) * EWS_PER_PAGE,
    ewsHal * EWS_PER_PAGE,
  );
  const judulFilterEws =
    ewsFilter === "ALL"
      ? "Seluruh indikator risiko"
      : `Indikator: ${ewsFilter}`;
  const sortEws = (col) =>
    setEwsSort((s) =>
      s.col === col ? { col, asc: !s.asc } : { col, asc: col !== "skor" },
    );
  const ikonSort = (col) =>
    ewsSort.col === col
      ? ewsSort.asc
        ? "bi-sort-up"
        : "bi-sort-down"
      : "bi-arrow-down-up opacity-50";
  const eksporEws = {
    onPNG: () =>
      ewsTampil.length
        ? eksporPNGEws({
            records: ewsTampil,
            judulFilter: judulFilterEws,
            konteks: exportCtx.konteks,
            sekolah,
            namaFile: `EWS_${ewsFilter}`,
          })
        : Swal.fire(
            "Kosong",
            "Tidak ada siswa berisiko pada filter ini.",
            "info",
          ),
    onCSV: () =>
      ewsTampil.length
        ? eksporCSV({
            table: {
              headers: [
                "NISN",
                "Nama Siswa",
                "Kelas",
                "Tingkat Risiko",
                "Kategori",
                "Detail Temuan",
              ],
              rows: ewsTampil.map((r) => [
                r.nisn || r.id_siswa,
                r.nama_siswa,
                r.kelas,
                r.tingkatan,
                r.kategori.join("; "),
                r.issues
                  .map((i) => `[${i.kategori}] ${i.deskripsi}`)
                  .join(" | "),
              ]),
            },
            namaFile: `EWS_${ewsFilter}`,
          })
        : Swal.fire(
            "Kosong",
            "Tidak ada siswa berisiko pada filter ini.",
            "info",
          ),
    onPDF: () =>
      ewsTampil.length
        ? eksporPDFEws({
            records: ewsTampil,
            judulFilter: judulFilterEws,
            konteks: exportCtx.konteks,
            sekolah,
            petugas: user?.name,
            namaFile: `Laporan_EWS_${ewsFilter}`,
          })
        : Swal.fire(
            "Kosong",
            "Tidak ada siswa berisiko pada filter ini.",
            "info",
          ),
  };

  const toggleCollapse = useCallback(
    (id) =>
      ubahPrefs((p) => ({
        ...p,
        collapsed: { ...p.collapsed, [id]: !p.collapsed[id] },
      })),
    [],
  );

  // Alat tambahan di dalam kartu grafik bawaan
  const toolsWidget = (id) => {
    if (id === "progres")
      return (
        <>
          <select
            className="form-select form-select-sm w-auto"
            value={progres.siswa}
            onChange={(e) =>
              setProgres((p) => ({ ...p, siswa: e.target.value }))
            }
          >
            <option value="ALL">
              Rata-rata {filter.id_kelas === "ALL" ? "seluruh kelas" : "kelas"}
            </option>
            {(data?.students || []).map((s) => (
              <option key={s.id_siswa} value={s.id_siswa}>
                {s.nama_siswa}
              </option>
            ))}
          </select>
          <div className="btn-group btn-group-sm">
            {[
              ["AKADEMIK", "Akademik"],
              ["JURNAL", "Observasi Jurnal"],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`btn ${progres.sumber === v ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setProgres((p) => ({ ...p, sumber: v }))}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="btn-group btn-group-sm">
            {MODE_WAKTU.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`btn ${progres.mode === m.id ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setProgres((p) => ({ ...p, mode: m.id }))}
              >
                {m.label.replace("Per ", "")}
              </button>
            ))}
          </div>
        </>
      );
    if (id === "radar" && progres.siswa !== "ALL")
      return (
        <small className="text-body-secondary">
          <i className="bi bi-person me-1"></i>Dibandingkan dengan{" "}
          {ctx?.namaSiswa(progres.siswa)} (pilih siswa di grafik Progres)
        </small>
      );
    if (id === "korelasi")
      return (
        <div className="d-flex align-items-center gap-2 small">
          <span className="text-body-secondary">Tampilkan</span>
          <select
            className="form-select form-select-sm w-auto"
            value={batasKorelasi}
            onChange={(e) => setBatasKorelasi(+e.target.value)}
          >
            {[10, 15, 25, 40].map((n) => (
              <option key={n} value={n}>
                {n} siswa
              </option>
            ))}
          </select>
        </div>
      );
    return null;
  };

  const tampilKpi = !prefs.hidden.kpi;
  const tampilEws = !prefs.hidden.ews;
  const tampilIndikator = !prefs.hidden.indikator;
  const tampilEfektivitas = !prefs.hidden.efektivitas;

  return (
    <div className="container-fluid mb-5 dash-root">
      {/* HERO */}
      <div className="dash-hero mb-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
          <div className="min-w-0">
            <div className="dash-hero-date">
              <i className="bi bi-calendar3 me-1"></i>
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
            <h3 className="dash-hero-title">
              {sapaan()}, {user?.name || "Admin"}{" "}
              <span className="wave">👋</span>
            </h3>
            <div className="dash-hero-sub">
              Dasbor analitik & mutu pembelajaran ·{" "}
              {sekolah?.nama_sekolah || "SAPrapor"}
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-light btn-sm fw-semibold"
              onClick={() => setMuatUlang((n) => n + 1)}
              disabled={status === "memuat"}
            >
              <i
                className={`bi bi-arrow-repeat me-1${status === "memuat" ? " dash-spin" : ""}`}
              ></i>
              Sinkron
            </button>
            <button
              type="button"
              className="btn btn-light btn-sm fw-semibold"
              onClick={() =>
                setEditSpec({ ...SPEC_BARU, id: `c_${Date.now()}` })
              }
              disabled={!data}
            >
              <i className="bi bi-plus-circle me-1"></i>Grafik Kustom
            </button>
            <button
              type="button"
              className="btn btn-light btn-sm fw-semibold"
              onClick={() => setShowSettings(true)}
            >
              <i className="bi bi-gear me-1"></i>Pengaturan
            </button>
          </div>
        </div>
      </div>

      {/* FILTER KONTEKS */}
      <div className="dash-filter mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold mb-1">
              <i className="bi bi-door-open me-1"></i>Konteks Kelas
            </label>
            <select
              className="form-select"
              value={filter.id_kelas}
              onChange={(e) =>
                setFilter((f) => ({ ...f, id_kelas: e.target.value }))
              }
            >
              <option value="ALL">Seluruh Kelas (analisis komparatif)</option>
              {classes.map((k) => (
                <option key={k.id_kelas} value={k.id_kelas}>
                  {k.nama_kelas}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold mb-1">
              <i className="bi bi-calendar-week me-1"></i>Periode Akademik
            </label>
            <select
              className="form-select"
              value={filter.id_periode}
              onChange={(e) =>
                setFilter((f) => ({ ...f, id_periode: e.target.value }))
              }
            >
              {periodes.map((p) => (
                <option key={p.id_periode} value={p.id_periode}>
                  {p.tahun_ajaran} ({p.semester})
                  {p.status_aktif === "AKTIF" ? " • Aktif" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-4 d-flex justify-content-md-end">
            <span
              className={`dash-ews-chip${ews.length ? " ada" : ""}`}
              title={`${ews.length} siswa perlu perhatian`}
            >
              <i className="bi bi-funnel"></i>
              <span className="dash-ews-teks">
                <b>{ews.length}</b> siswa perlu perhatian
              </span>
            </span>
          </div>
        </div>
      </div>

      {status === "menunggu" && (
        <div className="alert alert-info d-flex align-items-center gap-2 py-2">
          <span className="spinner-border spinner-border-sm"></span>Server API
          belum bisa dihubungi, mungkin masih menyala. Mencoba lagi otomatis
          (percobaan {percobaan})...
        </div>
      )}
      {status === "gagal" && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2 py-2">
          <i className="bi bi-wifi-off"></i>
          <span className="me-auto">
            Gagal memuat data dasbor. Pastikan container{" "}
            <code>school_core_api</code> berjalan.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-warning"
            onClick={() => setMuatUlang((n) => n + 1)}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>Coba lagi
          </button>
        </div>
      )}

      {!data ? (
        status === "ok" ? (
          <div className="dash-empty py-5">
            <i className="bi bi-calendar-x fs-2 d-block mb-2"></i>Belum ada
            periode akademik. Tambahkan dulu di{" "}
            <Link href="/dashboard/master-periode">Semester</Link>.
          </div>
        ) : (
          status !== "gagal" && (
            <div className="dash-empty py-5">
              <div className="spinner-border text-primary mb-2"></div>
              <div>Menyiapkan dasbor mutu akademik...</div>
            </div>
          )
        )
      ) : (
        <>
          {/* KPI */}
          {tampilKpi && kpi && (
            <>
              <div className="row g-3 mb-3">
                <StatCard
                  icon="bi-mortarboard"
                  label="Total Siswa"
                  value={data.students.length}
                  color="primary"
                  hint={namaKelas}
                />
                <StatCard
                  icon="bi-person-video3"
                  label="Guru"
                  value={data.jumlah_guru}
                  color="success"
                />
                <StatCard
                  icon="bi-book"
                  label="Mata Pelajaran"
                  value={data.subjects.length}
                  color="info"
                />
                <StatCard
                  icon="bi-pencil-square"
                  label="Entri Nilai"
                  value={data.nilai.length}
                  color="warning"
                  hint={labelPeriode}
                />
                <StatCard
                  icon="bi-chat-square-text"
                  label="Entri Jurnal"
                  value={data.jurnal.length}
                  color="secondary"
                />
                <StatCard
                  icon="bi-person-check"
                  label="Kehadiran"
                  value={
                    kpi.hadirPct === null ? "–" : `${fmt(kpi.hadirPct, 0)}%`
                  }
                  color="danger"
                  hint={`${data.presensi.length} catatan presensi`}
                />
              </div>
              <div className="row g-3 mb-3">
                <div className="col-12 col-lg-4">
                  <div className="dash-metric h-100">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="dash-metric-label">
                        <i className="bi bi-bullseye me-1"></i>Rata-rata Nilai
                      </div>
                      <span
                        className={`badge rounded-pill ${kpi.avgNilai !== null && kpi.avgNilai >= kpi.kkmRata ? "text-bg-success" : "text-bg-danger"}`}
                      >
                        KKM {fmt(kpi.kkmRata, 0)}
                      </span>
                    </div>
                    <div className="d-flex align-items-end gap-2">
                      <div className="dash-metric-value">
                        {fmt(kpi.avgNilai)}
                      </div>
                      {kpi.delta !== null && (
                        <span
                          className={`dash-delta ${kpi.delta >= 0 ? "is-up" : "is-down"}`}
                        >
                          <i
                            className={`bi ${kpi.delta >= 0 ? "bi-arrow-up-right" : "bi-arrow-down-right"}`}
                          ></i>
                          {fmt(Math.abs(kpi.delta))} vs bulan lalu
                        </span>
                      )}
                    </div>
                    <Sparkline data={kpi.sparkline} />
                    <div className="d-flex justify-content-between small text-body-secondary mt-1">
                      <span>Ketuntasan</span>
                      <span className="fw-semibold">
                        {kpi.tuntas === null
                          ? "–"
                          : `${fmt(kpi.tuntas * 100, 0)}%`}
                      </span>
                    </div>
                    <div className="progress dash-progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${(kpi.tuntas || 0) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-4">
                  <div className="dash-metric h-100">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="dash-metric-label">
                        <i className="bi bi-mortarboard me-1"></i>STNKM Akademik
                      </div>
                      <span className="badge rounded-pill text-bg-primary">
                        Poin nilai
                      </span>
                    </div>
                    <div className="dash-metric-value">
                      {fmt(kpi.akaKomposit)}
                    </div>
                    {(() => {
                      const maks = Math.max(
                        1,
                        ...DIMENSI.map((d) => kpi.aka[d.key] || 0),
                      );
                      return DIMENSI.map((d) => (
                        <div key={d.key} className="dash-dim">
                          <span
                            className="dash-dim-key"
                            style={{ color: d.color }}
                          >
                            {d.key}
                          </span>
                          <div className="dash-dim-bar">
                            <div
                              style={{
                                width: `${((kpi.aka[d.key] || 0) / maks) * 100}%`,
                                background: d.color,
                              }}
                            ></div>
                          </div>
                          <span className="dash-dim-val">
                            {fmt(kpi.aka[d.key])}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-4">
                  <div className="dash-metric h-100">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="dash-metric-label">
                        <i className="bi bi-search-heart me-1"></i>STNKM
                        Observasi
                      </div>
                      <span className="badge rounded-pill text-bg-success">
                        Jurnal
                      </span>
                    </div>
                    <div className="dash-metric-value">
                      {kpi.jurKomposit === null
                        ? "–"
                        : `${kpi.jurKomposit > 0 ? "+" : ""}${fmt(kpi.jurKomposit, 2)}`}
                      <small className="fs-6 text-body-secondary ms-1">
                        pts
                      </small>
                    </div>
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      {DIMENSI.map((d) => {
                        const v = kpi.jur[d.key];
                        return (
                          <div key={d.key} className="dash-chip" title={d.full}>
                            <span
                              style={{ color: d.color }}
                              className="fw-bold"
                            >
                              {d.key}
                            </span>
                            <span
                              className={
                                v > 0
                                  ? "text-success"
                                  : v < 0
                                    ? "text-danger"
                                    : "text-body-secondary"
                              }
                            >
                              {v === null
                                ? "–"
                                : `${v > 0 ? "+" : ""}${fmt(v)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="small text-body-secondary mt-2">
                      Skala jurnal −5 sampai +5 per dimensi.
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* EARLY WARNING SYSTEM */}
          {tampilEws && (
            <div
              className={`card dash-card card-outline card-danger mb-3${prefs.collapsed.ews ? " is-collapsed" : ""}`}
            >
              <div className="card-header dash-card-header flex-wrap">
                <span className="dash-card-icon text-bg-danger">
                  <i className="bi bi-exclamation-triangle"></i>
                </span>
                <div className="me-auto min-w-0">
                  <h3 className="card-title dash-card-title">
                    Sistem Peringatan Dini (EWS)
                  </h3>
                  <div className="dash-card-subtitle">
                    Siswa yang butuh intervensi akademik, presensi, atau
                    pembinaan karakter
                  </div>
                </div>
                <div className="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-tool-dash"
                    onClick={() => setEwsZoom(true)}
                    title="Perbesar"
                  >
                    <i className="bi bi-arrows-fullscreen"></i>
                  </button>
                  <MenuEkspor {...eksporEws} />
                  <button
                    type="button"
                    className="btn btn-sm btn-tool-dash"
                    onClick={() => toggleCollapse("ews")}
                    title={prefs.collapsed.ews ? "Buka" : "Lipat"}
                  >
                    <i className="bi bi-chevron-up dash-collapse-icon"></i>
                  </button>
                </div>
              </div>
              <div className="dash-collapse">
                <div className="dash-collapse-inner">
                  <div className="card-body">
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                      <div className="dash-segment">
                        {[
                          ["ALL", "Semua"],
                          ["AKADEMIK", "Akademik"],
                          ["PRESENSI", "Presensi"],
                          ["KARAKTER", "Karakter"],
                        ].map(([v, l]) => (
                          <button
                            key={v}
                            type="button"
                            className={ewsFilter === v ? "active" : ""}
                            onClick={() => {
                              setEwsFilter(v);
                              setEwsPage(1);
                            }}
                          >
                            {l}{" "}
                            <span className="dash-segment-count">
                              {ewsHitung[v]}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div
                        className="input-group input-group-sm ms-md-auto"
                        style={{ maxWidth: 320 }}
                      >
                        <span className="input-group-text bg-body">
                          <i className="bi bi-search"></i>
                        </span>
                        <input
                          type="search"
                          className="form-control"
                          placeholder="Cari nama, NISN, atau temuan..."
                          value={ewsCari}
                          onChange={(e) => {
                            setEwsCari(e.target.value);
                            setEwsPage(1);
                          }}
                        />
                      </div>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0 small dash-table">
                        <thead>
                          <tr>
                            <th className="text-center" style={{ width: 44 }}>
                              No
                            </th>
                            <th role="button" onClick={() => sortEws("nama")}>
                              Peserta Didik{" "}
                              <i className={`bi ${ikonSort("nama")}`}></i>
                            </th>
                            <th
                              role="button"
                              className="text-center"
                              onClick={() => sortEws("skor")}
                            >
                              Risiko{" "}
                              <i className={`bi ${ikonSort("skor")}`}></i>
                            </th>
                            <th
                              role="button"
                              onClick={() => sortEws("kategori")}
                            >
                              Kategori{" "}
                              <i className={`bi ${ikonSort("kategori")}`}></i>
                            </th>
                            <th>Temuan</th>
                            <th className="text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ewsBaris.length === 0 && (
                            <tr>
                              <td
                                colSpan="6"
                                className="text-center text-success fw-semibold py-4"
                              >
                                <i className="bi bi-patch-check fs-3 d-block mb-1"></i>
                                Tidak ada siswa terdeteksi pada kriteria ini.
                              </td>
                            </tr>
                          )}
                          {ewsBaris.map((r, i) => (
                            <tr key={r.id_siswa}>
                              <td className="text-center text-body-secondary">
                                {(ewsHal - 1) * EWS_PER_PAGE + i + 1}
                              </td>
                              <td>
                                <div className="fw-semibold">
                                  {r.nama_siswa}
                                </div>
                                <small className="text-body-secondary">
                                  {r.nisn || r.id_siswa} · {r.kelas}
                                </small>
                              </td>
                              <td className="text-center">
                                <span
                                  className={`badge rounded-pill text-bg-${r.warna}`}
                                >
                                  {r.tingkatan}
                                </span>
                              </td>
                              <td>
                                {r.kategori.map((k) => (
                                  <span
                                    key={k}
                                    className="badge text-bg-dark me-1"
                                  >
                                    {k}
                                  </span>
                                ))}
                              </td>
                              <td>
                                {r.issues.map((x, j) => (
                                  <div key={j} className="mb-1">
                                    • {x.deskripsi}
                                  </div>
                                ))}
                              </td>
                              <td className="text-center text-nowrap">
                                <MenuAksi label={`Aksi untuk ${r.nama_siswa}`} items={[
                                  { label: "Catat pembinaan di Jurnal", ikon: "bi-journal-plus", onClick: () => router.push("/dashboard/jurnal") },
                                  { label: "Lihat riwayat nilai", ikon: "bi-clipboard-data", onClick: () => router.push("/dashboard/nilai") },
                                  { label: "Lihat presensi", ikon: "bi-calendar-check", onClick: () => router.push("/dashboard/presensi") },
                                ]} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {ewsPages > 1 && (
                      <div className="d-flex justify-content-between align-items-center mt-3">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={ewsHal === 1}
                          onClick={() => setEwsPage(ewsHal - 1)}
                        >
                          <i className="bi bi-chevron-left"></i>
                        </button>
                        <small className="text-body-secondary">
                          Halaman {ewsHal} dari {ewsPages} · {ewsTampil.length}{" "}
                          siswa
                        </small>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={ewsHal === ewsPages}
                          onClick={() => setEwsPage(ewsHal + 1)}
                        >
                          <i className="bi bi-chevron-right"></i>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* INDIKATOR PERLU PERHATIAN */}
          {tampilIndikator && (
            <div
              className={`card dash-card card-outline card-warning mb-3${prefs.collapsed.indikator ? " is-collapsed" : ""}`}
            >
              <div className="card-header dash-card-header flex-wrap">
                <span className="dash-card-icon text-bg-warning">
                  <i className="bi bi-list-check"></i>
                </span>
                <div className="me-auto min-w-0">
                  <h3 className="card-title dash-card-title">
                    Indikator Perlu Perhatian
                  </h3>
                  <div className="dash-card-subtitle">
                    Indikator ketercapaian TP dengan siswa belum tuntas
                    terbanyak, sebagai dasar remedial kelompok atau pengulangan
                    materi
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-tool-dash"
                  onClick={() => toggleCollapse("indikator")}
                  title={prefs.collapsed.indikator ? "Buka" : "Lipat"}
                >
                  <i className="bi bi-chevron-up dash-collapse-icon"></i>
                </button>
              </div>
              <div className="dash-collapse">
                <div className="dash-collapse-inner">
                  <div className="card-body">
                    {indikator.length === 0 ? (
                      <div className="text-center text-body-secondary py-4">
                        <i className="bi bi-list-check fs-3 d-block mb-1"></i>
                        Belum ada penilaian per indikator pada konteks ini.
                        <div className="small">
                          Pilih indikator saat mengisi{" "}
                          <Link href="/dashboard/nilai">Input Nilai</Link> agar
                          analisis ini terisi.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                          <select
                            className="form-select form-select-sm w-auto"
                            value={indMapel}
                            onChange={(e) => setIndMapel(e.target.value)}
                          >
                            <option value="ALL">Semua mapel</option>
                            {mapelIndikator.map(([id, nama]) => (
                              <option key={id} value={id}>
                                {nama}
                              </option>
                            ))}
                          </select>
                          <div className="form-check form-switch mb-0 ms-md-auto">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id="ind_semua"
                              checked={indSemua}
                              onChange={(e) => setIndSemua(e.target.checked)}
                            />
                            <label
                              className="form-check-label small"
                              htmlFor="ind_semua"
                            >
                              Tampilkan juga indikator yang sudah tuntas semua
                            </label>
                          </div>
                        </div>
                        <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0 small dash-table">
                            <thead>
                              <tr>
                                <th>Indikator</th>
                                <th
                                  className="text-center"
                                  style={{ width: 90 }}
                                >
                                  Rata-rata
                                </th>
                                <th style={{ minWidth: 150 }}>Ketuntasan</th>
                                <th>Belum tuntas</th>
                              </tr>
                            </thead>
                            <tbody>
                              {indikatorTampil.length === 0 && (
                                <tr>
                                  <td
                                    colSpan="4"
                                    className="text-center text-success fw-semibold py-4"
                                  >
                                    <i className="bi bi-patch-check fs-3 d-block mb-1"></i>
                                    Semua siswa sudah tuntas pada indikator yang
                                    dinilai.
                                  </td>
                                </tr>
                              )}
                              {(indLengkap
                                ? indikatorTampil
                                : indikatorTampil.slice(0, 8)
                              ).map((i) => (
                                <tr key={i.id_indikator}>
                                  <td>
                                    <div className="fw-semibold">
                                      {i.deskripsi}
                                    </div>
                                    <small className="text-body-secondary">
                                      {i.nama_materi} · {i.mapel} · {i.kelas}
                                    </small>
                                  </td>
                                  <td className="text-center">
                                    <span
                                      className={`badge ${i.rata >= i.kkm ? "text-bg-success" : "text-bg-danger"}`}
                                    >
                                      {fmt(i.rata)}
                                    </span>
                                    <div
                                      className="text-body-secondary"
                                      style={{ fontSize: 11 }}
                                    >
                                      KKM {i.kkm}
                                    </div>
                                  </td>
                                  <td>
                                    <div className="d-flex justify-content-between">
                                      <span>
                                        {i.tuntas}/{i.jumlah} siswa
                                      </span>
                                      <b>{i.persenTuntas}%</b>
                                    </div>
                                    <div
                                      className="progress"
                                      style={{ height: 6 }}
                                      role="progressbar"
                                      aria-valuenow={i.persenTuntas}
                                      aria-valuemin="0"
                                      aria-valuemax="100"
                                    >
                                      <div
                                        className={`progress-bar ${i.persenTuntas >= 75 ? "bg-success" : i.persenTuntas >= 50 ? "bg-warning" : "bg-danger"}`}
                                        style={{ width: `${i.persenTuntas}%` }}
                                      ></div>
                                    </div>
                                  </td>
                                  <td>
                                    {i.belum.length === 0 ? (
                                      <span className="text-success">—</span>
                                    ) : (
                                      <div className="d-flex flex-wrap gap-1">
                                        {i.belum.slice(0, 6).map((s) => (
                                          <span
                                            key={s.id_siswa}
                                            className="badge bg-danger-subtle text-danger-emphasis border border-danger-subtle fw-normal"
                                          >
                                            {s.nama} · {fmt(s.nilai)}
                                          </span>
                                        ))}
                                        {i.belum.length > 6 && (
                                          <span
                                            className="badge text-bg-light border fw-normal"
                                            title={i.belum
                                              .slice(6)
                                              .map(
                                                (s) =>
                                                  `${s.nama} (${fmt(s.nilai)})`,
                                              )
                                              .join(", ")}
                                          >
                                            +{i.belum.length - 6} lainnya
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {indikatorTampil.length > 8 && (
                          <div className="text-center mt-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-link"
                              onClick={() => setIndLengkap((v) => !v)}
                            >
                              {indLengkap
                                ? "Tampilkan lebih sedikit"
                                : `Tampilkan semua (${indikatorTampil.length})`}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EFEKTIVITAS TINDAK LANJUT REMEDIAL */}
          {tampilEfektivitas && efektivitas && (
            <div
              className={`card dash-card card-outline card-success mb-3${prefs.collapsed.efektivitas ? " is-collapsed" : ""}`}
            >
              <div className="card-header dash-card-header flex-wrap">
                <span className="dash-card-icon text-bg-success">
                  <i className="bi bi-life-preserver"></i>
                </span>
                <div className="me-auto min-w-0">
                  <h3 className="card-title dash-card-title">
                    Efektivitas Tindak Lanjut
                  </h3>
                  <div className="dash-card-subtitle">
                    Bentuk tindak lanjut remedial yang paling berhasil
                    menuntaskan siswa pada konteks ini
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-tool-dash"
                  onClick={() => toggleCollapse("efektivitas")}
                  title={prefs.collapsed.efektivitas ? "Buka" : "Lipat"}
                >
                  <i className="bi bi-chevron-up dash-collapse-icon"></i>
                </button>
              </div>
              <div className="dash-collapse">
                <div className="dash-collapse-inner">
                  <div className="card-body">
                    {efektivitas.baris.length === 0 ? (
                      <div className="text-center text-body-secondary py-4">
                        <i className="bi bi-life-preserver fs-3 d-block mb-1"></i>
                        Belum ada rencana tindak lanjut pada konteks ini.
                        <div className="small">
                          Rencana dibuat lewat tombol <b>Tindak Lanjut</b> di{" "}
                          <Link href="/dashboard/nilai">Input Nilai</Link> untuk
                          siswa di bawah KKM.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="d-flex flex-wrap gap-2 mb-3 small">
                          <span className="badge text-bg-light border fw-normal">
                            {efektivitas.total.rencana} rencana
                          </span>
                          <span className="badge text-bg-light border fw-normal">
                            {efektivitas.total.selesai} sudah dilaksanakan
                          </span>
                          {efektivitas.total.persenTuntas != null && (
                            <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle fw-normal">
                              {efektivitas.total.persenTuntas}% tuntas setelah
                              remedial
                            </span>
                          )}
                          {efektivitas.total.menunggu > 0 && (
                            <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fw-normal">
                              {efektivitas.total.menunggu} menunggu pelaksanaan
                            </span>
                          )}
                          {efektivitas.total.terlambat > 0 && (
                            <span className="badge text-bg-danger fw-normal">
                              <i className="bi bi-alarm me-1"></i>
                              {efektivitas.total.terlambat} lewat tanggal
                              rencana
                            </span>
                          )}
                        </div>
                        <div className="table-responsive">
                          <table className="table table-hover align-middle mb-0 small dash-table">
                            <thead>
                              <tr>
                                <th>Bentuk tindak lanjut</th>
                                <th className="text-center">Dilaksanakan</th>
                                <th style={{ minWidth: 150 }}>
                                  Tuntas setelahnya
                                </th>
                                <th className="text-center">
                                  Rata-rata kenaikan
                                </th>
                                <th className="text-center">Menunggu</th>
                              </tr>
                            </thead>
                            <tbody>
                              {efektivitas.baris.map((o) => (
                                <tr key={o.opsi}>
                                  <td className="fw-semibold text-nowrap">
                                    <i
                                      className={`bi ${OPSI_TINDAK_LANJUT.find((x) => x.nama === o.opsi)?.ikon || "bi-signpost-split"} text-primary me-1`}
                                    ></i>
                                    {o.opsi}
                                  </td>
                                  <td className="text-center">
                                    {o.selesai}/{o.rencana}
                                  </td>
                                  <td>
                                    {o.persenTuntas == null ? (
                                      <span className="text-body-secondary">
                                        Belum ada hasil
                                      </span>
                                    ) : (
                                      <>
                                        <div className="d-flex justify-content-between">
                                          <span>
                                            {o.tuntas}/{o.selesai} siswa
                                          </span>
                                          <b>{o.persenTuntas}%</b>
                                        </div>
                                        <div
                                          className="progress"
                                          style={{ height: 6 }}
                                          role="progressbar"
                                          aria-valuenow={o.persenTuntas}
                                          aria-valuemin="0"
                                          aria-valuemax="100"
                                        >
                                          <div
                                            className={`progress-bar ${o.persenTuntas >= 75 ? "bg-success" : o.persenTuntas >= 50 ? "bg-warning" : "bg-danger"}`}
                                            style={{
                                              width: `${o.persenTuntas}%`,
                                            }}
                                          ></div>
                                        </div>
                                      </>
                                    )}
                                  </td>
                                  <td className="text-center">
                                    {o.kenaikan == null ? (
                                      "–"
                                    ) : (
                                      <span
                                        className={`fw-semibold ${o.kenaikan > 0 ? "text-success" : "text-danger"}`}
                                      >
                                        {o.kenaikan > 0 ? "+" : ""}
                                        {fmt(o.kenaikan)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="text-center">
                                    {o.menunggu || "–"}
                                    {o.terlambat > 0 && (
                                      <span
                                        className="badge text-bg-danger ms-1 fw-normal"
                                        title="Rencana yang sudah lewat tanggalnya tetapi belum ada nilai remedial"
                                      >
                                        {o.terlambat} terlambat
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="small text-body-secondary mt-2">
                          <i className="bi bi-info-circle me-1"></i>Dihitung
                          dari nilai remedial sebenarnya, sebelum dibatasi KKM,
                          karena yang diukur adalah hasil belajar siswa.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GRAFIK */}
          <div className="row g-3">
            {semuaWidget
              .filter((w) => !prefs.hidden[w.id])
              .map((w) => (
                <div
                  key={w.id}
                  className={
                    ukuranWidget(w) === "full" ? "col-12" : "col-12 col-xl-6"
                  }
                >
                  <ChartCard
                    title={w.title}
                    subtitle={w.subtitle}
                    icon={w.icon}
                    variant={w.variant}
                    height={w.height || 280}
                    hasil={hasil[w.id]}
                    collapsed={!!prefs.collapsed[w.id]}
                    onToggle={() => toggleCollapse(w.id)}
                    tools={toolsWidget(w.id)}
                    exportCtx={exportCtx}
                    badge={
                      w.custom ? (
                        <span
                          className="badge rounded-pill text-bg-light border ms-2 fw-normal align-middle"
                          style={{ fontSize: 10 }}
                        >
                          Kustom
                        </span>
                      ) : null
                    }
                    actions={
                      w.custom ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-tool-dash"
                            title="Ubah grafik"
                            onClick={() =>
                              setEditSpec(
                                prefs.custom.find((c) => c.id === w.id),
                              )
                            }
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-tool-dash text-danger"
                            title="Hapus grafik"
                            onClick={() => hapusKustom(w.id)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </>
                      ) : null
                    }
                  />
                </div>
              ))}
            <div className="col-12 col-xl-6">
              <button
                type="button"
                className="dash-add-card w-100 h-100"
                onClick={() =>
                  setEditSpec({ ...SPEC_BARU, id: `c_${Date.now()}` })
                }
              >
                <i className="bi bi-plus-circle-dotted fs-2 d-block mb-2"></i>
                <span className="fw-semibold">Tambah grafik kustom</span>
                <small className="d-block text-body-secondary">
                  Pilih metrik, pengelompokan, dan jenis grafik sesuai kebutuhan
                </small>
              </button>
            </div>
          </div>
        </>
      )}

      {/* MODAL EWS DIPERBESAR */}
      <Modal
        show={ewsZoom}
        title="Sistem Peringatan Dini — Tinjauan Mendalam"
        icon="bi-exclamation-triangle"
        onClose={() => setEwsZoom(false)}
        footer={
          <>
            <small className="text-body-secondary me-auto">
              {judulFilterEws} · {ewsTampil.length} siswa · siap untuk rapat
              pleno & bimbingan konseling
            </small>
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={eksporEws.onPNG}
              >
                <i className="bi bi-image me-1"></i>PNG
              </button>
              <button
                type="button"
                className="btn btn-outline-success"
                onClick={eksporEws.onCSV}
              >
                <i className="bi bi-filetype-csv me-1"></i>CSV
              </button>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={eksporEws.onPDF}
              >
                <i className="bi bi-file-earmark-pdf me-1"></i>PDF
              </button>
            </div>
          </>
        }
      >
        <div className="table-responsive">
          <table className="table table-bordered align-middle small mb-0">
            <thead className="table-danger">
              <tr>
                <th className="text-center">No</th>
                <th>Peserta Didik</th>
                <th>Kelas</th>
                <th className="text-center">Risiko</th>
                <th>Kategori</th>
                <th>Detail Temuan</th>
              </tr>
            </thead>
            <tbody>
              {ewsTampil.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center text-success py-4">
                    Tidak ada siswa berisiko pada filter ini.
                  </td>
                </tr>
              )}
              {ewsTampil.map((r, i) => (
                <tr key={r.id_siswa}>
                  <td className="text-center">{i + 1}</td>
                  <td>
                    <strong>{r.nama_siswa}</strong>
                    <br />
                    <small className="text-body-secondary">
                      NISN: {r.nisn || r.id_siswa}
                    </small>
                  </td>
                  <td>{r.kelas}</td>
                  <td className="text-center">
                    <span className={`badge text-bg-${r.warna}`}>
                      {r.tingkatan}
                    </span>
                  </td>
                  <td>{r.kategori.join(", ")}</td>
                  <td>
                    {r.issues.map((x, j) => (
                      <div key={j}>
                        • <b>[{x.kategori}]</b> {x.deskripsi}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* PEMBUAT GRAFIK KUSTOM */}
      <Modal
        show={!!editSpec}
        title={
          prefs.custom.some((c) => c.id === editSpec?.id)
            ? "Ubah Grafik Kustom"
            : "Grafik Kustom Baru"
        }
        icon="bi-magic"
        onClose={() => setEditSpec(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditSpec(null)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn btn-primary fw-semibold"
              onClick={simpanKustom}
            >
              <i className="bi bi-check2-circle me-1"></i>Simpan ke Dasbor
            </button>
          </>
        }
      >
        {editSpec && (
          <div className="row g-4">
            <div className="col-12 col-lg-5">
              <label className="form-label small fw-semibold mb-1">
                Mulai dari templat
              </label>
              <select
                className="form-select form-select-sm mb-3"
                value=""
                onChange={(e) => {
                  const p = PRESET_KUSTOM[+e.target.value];
                  if (p)
                    setEditSpec((s) => ({
                      ...s,
                      ...p,
                      warna: s.warna,
                      ukuran: s.ukuran,
                    }));
                }}
              >
                <option value="">— Pilih templat (opsional) —</option>
                {PRESET_KUSTOM.map((p, i) => (
                  <option key={p.judul} value={i}>
                    {p.judul}
                  </option>
                ))}
              </select>

              <label className="form-label small fw-semibold mb-1">
                Judul grafik
              </label>
              <input
                type="text"
                className="form-control form-control-sm mb-3"
                maxLength={80}
                placeholder="mis. Rata-rata nilai per siswa"
                value={editSpec.judul}
                onChange={(e) =>
                  setEditSpec((s) => ({ ...s, judul: e.target.value }))
                }
              />

              <label className="form-label small fw-semibold mb-1">
                Jenis grafik
              </label>
              <div className="dash-type-grid mb-3">
                {TIPE_GRAFIK.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`dash-type${editSpec.tipe === t.id ? " active" : ""}`}
                    onClick={() => setEditSpec((s) => ({ ...s, tipe: t.id }))}
                  >
                    <i className={`bi ${t.icon}`}></i>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              <label className="form-label small fw-semibold mb-1">
                Metrik{" "}
                {tipeMelingkar
                  ? "(grafik lingkaran memakai metrik pertama)"
                  : "(maks. 3)"}
              </label>
              <div className="dash-metric-list mb-3">
                {METRIK.map((m) => {
                  const dipilih = editSpec.metrik.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`dash-metric-opt${dipilih ? " active" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input me-2"
                        checked={dipilih}
                        onChange={() =>
                          setEditSpec((s) => ({
                            ...s,
                            metrik: dipilih
                              ? s.metrik.filter((x) => x !== m.id)
                              : [...s.metrik, m.id].slice(-3),
                          }))
                        }
                      />
                      {m.label}
                      <span className="badge text-bg-light border ms-auto">
                        {m.sumber}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1">
                    Kelompokkan per
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={editSpec.kelompok}
                    onChange={(e) =>
                      setEditSpec((s) => ({ ...s, kelompok: e.target.value }))
                    }
                  >
                    {KELOMPOK.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1">
                    Urutkan
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={editSpec.urut}
                    disabled={
                      !!KELOMPOK.find((k) => k.id === editSpec.kelompok)?.waktu
                    }
                    onChange={(e) =>
                      setEditSpec((s) => ({ ...s, urut: e.target.value }))
                    }
                  >
                    <option value="desc">Nilai tertinggi</option>
                    <option value="asc">Nilai terendah</option>
                    <option value="label">Abjad</option>
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1">
                    Tampilkan maks.
                  </label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    min="1"
                    max="100"
                    value={editSpec.batas}
                    onChange={(e) =>
                      setEditSpec((s) => ({ ...s, batas: e.target.value }))
                    }
                    disabled={
                      !!KELOMPOK.find((k) => k.id === editSpec.kelompok)?.waktu
                    }
                  />
                </div>
                <div className="col-6">
                  <label className="form-label small fw-semibold mb-1">
                    Lebar kartu
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={editSpec.ukuran}
                    onChange={(e) =>
                      setEditSpec((s) => ({ ...s, ukuran: e.target.value }))
                    }
                  >
                    <option value="half">Setengah</option>
                    <option value="full">Penuh</option>
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold mb-1">
                    Warna utama
                  </label>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`theme-swatch${editSpec.warna === "palet" ? " is-active" : ""}`}
                      title="Palet otomatis"
                      style={{
                        background: `conic-gradient(${PALET.slice(0, 6).join(",")})`,
                      }}
                      onClick={() =>
                        setEditSpec((s) => ({ ...s, warna: "palet" }))
                      }
                    ></button>
                    {PALET.slice(0, 9).map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`theme-swatch${editSpec.warna === c ? " is-active" : ""}`}
                        style={{ background: c }}
                        title={c}
                        onClick={() => setEditSpec((s) => ({ ...s, warna: c }))}
                      ></button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-7">
              <div className="dash-preview">
                <div className="small fw-semibold text-body-secondary mb-2">
                  <i className="bi bi-eye me-1"></i>Pratinjau langsung ·{" "}
                  {exportCtx.konteks}
                </div>
                <div className="fw-bold mb-2">
                  {editSpec.judul || "Grafik kustom"}
                </div>
                {previewKustom && !previewKustom.kosong ? (
                  <ChartCanvas config={previewKustom.config} height={340} />
                ) : (
                  <div className="dash-empty" style={{ minHeight: 340 }}>
                    <i className="bi bi-info-circle fs-3 d-block mb-2 opacity-50"></i>
                    {previewKustom?.kosong}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* PENGATURAN DASBOR */}
      <Offcanvas
        show={showSettings}
        title="Pengaturan Dasbor"
        onClose={() => setShowSettings(false)}
      >
        <div className="dash-set-section">
          <div className="dash-set-title">Tampilan</div>
          <div className="btn-group w-100 mb-3">
            {THEME_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`btn btn-sm ${tema.mode === m.id ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setThemeMode(m.id)}
              >
                <i className={`bi ${m.icon} me-1`}></i>
                {m.label}
              </button>
            ))}
          </div>
          <div className="d-flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`theme-swatch${tema.accent === a.id ? " is-active" : ""}`}
                title={a.label}
                style={{
                  background: `linear-gradient(135deg, ${a.c1}, ${a.c2})`,
                }}
                onClick={() => setAccent(a.id)}
              ></button>
            ))}
          </div>
        </div>

        <div className="dash-set-section">
          <div className="dash-set-title">Panel Utama</div>
          {[
            ["kpi", "Kartu metrik (KPI)"],
            ["ews", "Sistem Peringatan Dini (EWS)"],
            ["indikator", "Indikator perlu perhatian"],
            ["efektivitas", "Efektivitas tindak lanjut"],
          ].map(([id, l]) => (
            <div key={id} className="form-check form-switch mb-2">
              <input
                className="form-check-input"
                type="checkbox"
                id={`show_${id}`}
                checked={!prefs.hidden[id]}
                onChange={(e) =>
                  ubahPrefs((p) => ({
                    ...p,
                    hidden: { ...p.hidden, [id]: !e.target.checked },
                  }))
                }
              />
              <label className="form-check-label small" htmlFor={`show_${id}`}>
                {l}
              </label>
            </div>
          ))}
        </div>

        <div className="dash-set-section">
          <div className="dash-set-title d-flex align-items-center">
            Grafik & Urutan
            <button
              type="button"
              className="btn btn-sm btn-link ms-auto p-0"
              onClick={() => {
                setShowSettings(false);
                setEditSpec({ ...SPEC_BARU, id: `c_${Date.now()}` });
              }}
            >
              <i className="bi bi-plus-lg me-1"></i>Grafik baru
            </button>
          </div>
          <ul className="list-group list-group-flush dash-set-list">
            {semuaWidget.map((w, i) => (
              <li
                key={w.id}
                className="list-group-item d-flex align-items-center gap-2 px-0"
              >
                <input
                  className="form-check-input mt-0"
                  type="checkbox"
                  checked={!prefs.hidden[w.id]}
                  title="Tampilkan"
                  onChange={(e) =>
                    ubahPrefs((p) => ({
                      ...p,
                      hidden: { ...p.hidden, [w.id]: !e.target.checked },
                    }))
                  }
                />
                <i className={`bi ${w.icon} text-body-secondary`}></i>
                <span className="small text-truncate me-auto">
                  {w.title}
                  {w.custom && (
                    <span
                      className="badge text-bg-light border ms-1"
                      style={{ fontSize: 9 }}
                    >
                      kustom
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-tool-dash"
                  title={
                    ukuranWidget(w) === "full"
                      ? "Jadikan setengah lebar"
                      : "Jadikan lebar penuh"
                  }
                  onClick={() =>
                    ubahPrefs((p) => ({
                      ...p,
                      size: {
                        ...p.size,
                        [w.id]: ukuranWidget(w) === "full" ? "half" : "full",
                      },
                    }))
                  }
                >
                  <i
                    className={`bi ${ukuranWidget(w) === "full" ? "bi-arrows-angle-contract" : "bi-arrows-angle-expand"}`}
                  ></i>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-tool-dash"
                  disabled={i === 0}
                  onClick={() => pindahWidget(w.id, -1)}
                  title="Naikkan"
                >
                  <i className="bi bi-arrow-up"></i>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-tool-dash"
                  disabled={i === semuaWidget.length - 1}
                  onClick={() => pindahWidget(w.id, 1)}
                  title="Turunkan"
                >
                  <i className="bi bi-arrow-down"></i>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="dash-set-section">
          <div className="dash-set-title">Ambang EWS</div>
          {[
            ["belowKkmKritis", "Nilai di bawah KKM → risiko tinggi", 1, 20],
            ["alpaKritis", "Jumlah alpa → risiko tinggi", 1, 30],
            ["absenPantau", "Alpa + sakit/izin → perlu dipantau", 1, 60],
            ["jurnalNegKritis", "Jurnal negatif → risiko tinggi", 1, 20],
          ].map(([key, label, min, max]) => (
            <div key={key} className="d-flex align-items-center gap-2 mb-2">
              <label className="small me-auto" htmlFor={`ews_${key}`}>
                {label}
              </label>
              <input
                id={`ews_${key}`}
                type="number"
                className="form-control form-control-sm"
                style={{ width: 72 }}
                min={min}
                max={max}
                value={prefs.ews[key]}
                onChange={(e) =>
                  ubahPrefs((p) => ({
                    ...p,
                    ews: {
                      ...p.ews,
                      [key]: Math.max(
                        min,
                        Math.min(max, parseInt(e.target.value, 10) || min),
                      ),
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>

        <div className="dash-set-section">
          <div className="dash-set-title">Bawaan Grafik Progres</div>
          <select
            className="form-select form-select-sm"
            value={prefs.waktu}
            onChange={(e) => {
              const v = e.target.value;
              ubahPrefs((p) => ({ ...p, waktu: v }));
              setProgres((s) => ({ ...s, mode: v }));
            }}
          >
            {MODE_WAKTU.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn btn-outline-danger btn-sm w-100"
          onClick={async () => {
            const ok = await Swal.fire({
              title: "Kembalikan dasbor ke bawaan?",
              text: "Urutan, visibilitas, ambang EWS, dan grafik kustom akan direset.",
              icon: "warning",
              showCancelButton: true,
              confirmButtonText: "Ya, Reset",
              cancelButtonText: "Batal",
            });
            if (ok.isConfirmed) {
              setPrefs(PREFS_DEFAULT);
              setProgres((s) => ({ ...s, mode: "monthly" }));
            }
          }}
        >
          <i className="bi bi-arrow-counterclockwise me-1"></i>Kembalikan ke
          Bawaan
        </button>
        <p className="small text-body-secondary mt-3 mb-0">
          <i className="bi bi-info-circle me-1"></i>Pengaturan dasbor disimpan
          di browser ini.
        </p>
      </Offcanvas>
    </div>
  );
}
