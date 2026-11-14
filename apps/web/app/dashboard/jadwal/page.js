"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import idLocale from "@fullcalendar/core/locales/id";
import MiniKalender from "@/components/jadwal/MiniKalender";
import DetailSesi from "@/components/jadwal/DetailSesi";
import PaketJadwal from "@/components/jadwal/PaketJadwal";
import EksporJadwal from "@/components/jadwal/EksporJadwal";
import FormJadwal, { kirimAPI, konfirmasiBentrok, pesanGalat, tanyaModeBerantai } from "@/components/jadwal/FormJadwal";
import {
  PALET_GURU, PREFS_DEFAULT, STATUS_MAP, STATUS_SESI, TAMPILAN,
  adalahMinggu, judulSesi, parseLokal, pesanMinggu, rentangJam, susunPesanWA, ymd,
} from "./_lib/jadwal";

const KEY_PREFS = "jadwal_prefs_v1";
const WARNA_STATUS = { Menunggu: "#f6bf26", Berlangsung: "#33b679", Selesai: "#616161", Batal: "#d50000" };
const HARI_TERSEMBUNYI = { "senin-jumat": [0, 6], "senin-sabtu": [0], semua: [] };
const JAM_PILIHAN = Array.from({ length: 19 }, (_, i) => `${String(i + 5).padStart(2, "0")}:00`);
const toast = (title, icon = "success") => Swal.fire({ toast: true, position: "top-end", icon, title, showConfirmButton: false, timer: 2200 });

export default function JadwalPage() {
  const calRef = useRef(null);
  const cariRef = useRef(null);
  const api = () => calRef.current?.getApi();

  const [refData, setRefData] = useState(null);
  const [paket, setPaket] = useState(false);
  const [ekspor, setEkspor] = useState(false);
  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(false);
  const [rentang, setRentang] = useState(null);
  const [judul, setJudul] = useState("");
  const [tanggalAktif, setTanggalAktif] = useState(new Date());
  const [viewAktif, setViewAktif] = useState(PREFS_DEFAULT.view);
  const [muatUlang, setMuatUlang] = useState(0);

  const [prefs, setPrefs] = useState(PREFS_DEFAULT);
  const [prefsSiap, setPrefsSiap] = useState(false);
  const [guruTersembunyi, setGuruTersembunyi] = useState(new Set());
  const [statusTersembunyi, setStatusTersembunyi] = useState(new Set());
  const [filterKelas, setFilterKelas] = useState("");
  const [cari, setCari] = useState("");

  const [detailId, setDetailId] = useState(null);
  const [formAwal, setFormAwal] = useState(null);
  const [waPanel, setWaPanel] = useState(null);
  const [showRuangan, setShowRuangan] = useState(false);
  // Guru hanya menggeser/mengubah sesi miliknya; ruangan dikelola admin & kepsek
  const { isPengelola, milikSendiri } = useAkses();
  const [showSetelan, setShowSetelan] = useState(false);
  const [panelKiriHp, setPanelKiriHp] = useState(false);

  // --- PREFERENSI ---
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY_PREFS) || "null");
      if (p) { setPrefs({ ...PREFS_DEFAULT, ...p }); setViewAktif(p.view || PREFS_DEFAULT.view); }
    } catch (e) { /* abaikan */ }
    setPrefsSiap(true);
  }, []);
  useEffect(() => {
    if (prefsSiap) try { localStorage.setItem(KEY_PREFS, JSON.stringify(prefs)); } catch (e) { /* storage diblokir */ }
  }, [prefs, prefsSiap]);
  // FullCalendar hanya membaca initialView saat pertama dipasang; terapkan tampilan tersimpan setelah preferensi termuat.
  // changeView memanggil flushSync, jadi ditunda ke microtask agar tidak berjalan di tengah render React.
  useEffect(() => {
    if (!prefsSiap) return;
    queueMicrotask(() => {
      const kal = api();
      if (kal && kal.view.type !== prefs.view) kal.changeView(prefs.view);
    });
  }, [prefsSiap]);
  const ubahPrefs = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  // --- DATA ---
  const muatReferensi = useCallback(async () => {
    const res = await kirimAPI("GET", "/jadwal/referensi");
    if (res.ok) setRefData(res.json);
    else Swal.fire("Gagal memuat referensi", pesanGalat(res.json), "error");
  }, []);
  useEffect(() => {
    if (!localStorage.getItem("token")) { window.location.href = "/login"; return; }
    muatReferensi().catch((e) => Swal.fire("Gagal", e.message, "error"));
  }, [muatReferensi]);

  useEffect(() => {
    if (!rentang) return;
    let batal = false;
    (async () => {
      setMemuat(true);
      try {
        const res = await kirimAPI("GET", `/jadwal?${new URLSearchParams({ start: ymd(rentang.start), end: ymd(rentang.end) })}`);
        if (!batal) {
          if (res.ok) setRows(res.json.data || []);
          else Swal.fire("Gagal memuat jadwal", pesanGalat(res.json), "error");
        }
      } catch (e) {
        if (!batal) toast("Server API belum bisa dihubungi", "warning");
      } finally {
        if (!batal) setMemuat(false);
      }
    })();
    return () => { batal = true; };
  }, [rentang?.start?.getTime(), rentang?.end?.getTime(), muatUlang]);
  const segarkan = () => setMuatUlang((n) => n + 1);

  // Hari libur (selain Minggu): diarsir di kalender dan ditandai namanya; jadwal di tanggal ini ditolak server
  const [libur, setLibur] = useState(new Map());
  useEffect(() => {
    kirimAPI("GET", "/hari-libur").then((r) => r.ok && setLibur(new Map((r.json.data || []).map((h) => [h.tanggal, h.nama])))).catch(() => {});
  }, []);

  // --- WARNA & FILTER ---
  const warnaGuru = useMemo(() => new Map((refData?.teachers || []).map((t, i) => [t.id_guru, PALET_GURU[i % PALET_GURU.length]])), [refData]);
  const warnaSesi = useCallback((r) => (
    prefs.warnaiBerdasar === "guru" ? warnaGuru.get(r.id_guru) || "#9e9e9e"
      : prefs.warnaiBerdasar === "status" ? WARNA_STATUS[r.status_sesi] || r.warna
        : r.warna || "#3f51b5"
  ), [prefs.warnaiBerdasar, warnaGuru]);

  const rowsTampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return rows.filter((r) => !guruTersembunyi.has(r.id_guru || "tanpa")
      && !statusTersembunyi.has(r.status_sesi)
      && (!filterKelas || r.id_kelas === filterKelas)
      && (!q || [judulSesi(r), r.materi?.nama_materi, r.guru?.nama_guru, r.kelas?.nama_kelas, r.ruangan?.nama_ruangan, r.catatan].join(" ").toLowerCase().includes(q)));
  }, [rows, guruTersembunyi, statusTersembunyi, filterKelas, cari]);

  const sekarang = Date.now();
  const eventLibur = useMemo(() => [...libur].map(([tgl, nama]) => ({
    id: `libur-${tgl}`, start: tgl, allDay: true, display: "background", title: nama, classNames: ["gc-libur"], editable: false,
  })), [libur]);
  const events = useMemo(() => rowsTampil.map((r) => {
    const warna = warnaSesi(r);
    return {
      id: r.id_jadwal, title: judulSesi(r), start: r.mulai, end: r.selesai,
      backgroundColor: warna, borderColor: warna,
      classNames: [`st-${r.status_sesi.toLowerCase()}`, parseLokal(r.selesai).getTime() < sekarang ? "is-past" : ""],
      editable: milikSendiri(r.id_guru),
      extendedProps: { row: r },
    };
  }).concat(eventLibur), [rowsTampil, warnaSesi, milikSendiri, eventLibur]);

  const tanggalBerisi = useMemo(() => new Set(rows.map((r) => r.mulai.slice(0, 10))), [rows]);
  const detail = rows.find((r) => r.id_jadwal === detailId) || null;
  const hariIni = ymd(new Date());
  const agendaHariIni = rows.filter((r) => r.mulai.startsWith(hariIni) && r.status_sesi !== "Batal").sort((a, b) => a.mulai.localeCompare(b.mulai));

  // --- NAVIGASI ---
  const navigasi = (aksi) => { const a = api(); if (!a) return; if (aksi === "today") a.today(); else if (aksi === "prev") a.prev(); else a.next(); };
  const gantiView = (v) => { api()?.changeView(v); setViewAktif(v); ubahPrefs({ view: v }); };
  const onDatesSet = (arg) => {
    setRentang({ start: arg.start, end: arg.end });
    setJudul(arg.view.title);
    setViewAktif(arg.view.type);
    setTanggalAktif(api()?.getDate() || arg.start);
  };

  const bukaBaru = (mulai, selesai) => {
    const m = mulai || (() => { const d = new Date(tanggalAktif); d.setHours(7, 30, 0, 0); return d; })();
    setFormAwal({ mode: "baru", mulai: m, selesai });
  };

  // --- INTERAKSI KALENDER ---
  const onSelect = (info) => {
    api()?.unselect();
    if (adalahMinggu(info.start)) return Swal.fire("Hari Minggu", pesanMinggu(info.start), "info");
    if (libur.has(ymd(info.start))) return Swal.fire("Hari libur", `${libur.get(ymd(info.start))}. Pilih hari sekolah lain, atau ubah daftar di menu Hari Libur.`, "info");
    if (info.allDay) {
      const m = new Date(info.start); m.setHours(7, 30, 0, 0);
      bukaBaru(m);
    } else {
      bukaBaru(info.start, info.end);
    }
  };

  const geser = async (info, deltaMulai, deltaSelesai) => {
    const r = info.event.extendedProps.row;
    if (adalahMinggu(info.event.start)) { info.revert(); return Swal.fire("Hari Minggu", pesanMinggu(info.event.start), "info"); }
    let mode = "only_this";
    if (r.id_group) {
      mode = await tanyaModeBerantai("Pindahkan jadwal berulang", "Pindahkan");
      if (!mode) return info.revert();
    }
    const body = { mode, delta_mulai: deltaMulai, delta_selesai: deltaSelesai };
    let res = await kirimAPI("PATCH", `/jadwal/${r.id_jadwal}/geser`, body);
    if (res.status === 409) {
      if (!(await konfirmasiBentrok(res.json))) return info.revert();
      res = await kirimAPI("PATCH", `/jadwal/${r.id_jadwal}/geser`, { ...body, abaikan_bentrok: true });
    }
    if (!res.ok) { info.revert(); return Swal.fire("Gagal", pesanGalat(res.json), "error"); }
    toast(res.json.message);
    segarkan();
  };
  const menit = (dur) => (dur.days || 0) * 1440 + Math.round((dur.milliseconds || 0) / 60000);
  const onDrop = (info) => { const d = menit(info.delta); geser(info, d, d); };
  const onResize = (info) => geser(info, menit(info.startDelta), menit(info.endDelta));

  const isiEvent = (arg) => {
    const r = arg.event.extendedProps.row;
    // Kotak pratinjau saat memblok jam (selectMirror) belum punya data sesi
    if (!r) {
      return (
        <div className="fc-ev-card">
          <div className="fc-ev-title">Sesi baru</div>
          <div className="fc-ev-meta">{arg.timeText}</div>
        </div>
      );
    }
    const st = STATUS_MAP[r.status_sesi] || STATUS_MAP.Menunggu;
    const lokasi = [r.kelas?.nama_kelas, r.ruangan?.nama_ruangan].filter(Boolean).join(" · ");
    if (arg.view.type === "dayGridMonth") {
      return (
        <div className="fc-ev-month">
          <span className="fc-ev-dot" style={{ background: arg.event.backgroundColor }}></span>
          <span className="fc-ev-time">{arg.timeText}</span>
          <span className="fc-ev-title">{arg.event.title}</span>
        </div>
      );
    }
    if (arg.view.type.startsWith("list")) {
      return (
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="fw-semibold">{arg.event.title}</span>
          {r.materi?.nama_materi && <span className="text-body-secondary small">· {r.materi.nama_materi}</span>}
          {lokasi && <span className="text-body-secondary small"><i className="bi bi-geo-alt me-1"></i>{lokasi}</span>}
          {r.guru && <span className="text-body-secondary small"><i className="bi bi-person me-1"></i>{r.guru.nama_guru}</span>}
          <span className={`badge rounded-pill text-bg-${st.color} ms-auto`}>{st.label}</span>
        </div>
      );
    }
    return (
      <div className="fc-ev-card">
        <div className="fc-ev-title">{r.status_sesi === "Selesai" && <i className="bi bi-check2-circle me-1"></i>}{arg.event.title}</div>
        <div className="fc-ev-meta">{arg.timeText}{lokasi ? `, ${lokasi}` : ""}</div>
        {r.guru && <div className="fc-ev-meta"><i className="bi bi-person me-1"></i>{r.guru.nama_guru}</div>}
        {r.lampiran_url && <i className="bi bi-paperclip fc-ev-clip"></i>}
      </div>
    );
  };

  // --- AKSI DETAIL ---
  const ubahStatus = async (status) => {
    const res = await kirimAPI("PATCH", `/jadwal/${detail.id_jadwal}/status`, { status_sesi: status });
    if (!res.ok) return Swal.fire("Gagal", pesanGalat(res.json), "error");
    const baru = res.json.status_sesi || status;
    setRows((rs) => rs.map((r) => (r.id_jadwal === detail.id_jadwal ? { ...r, status_sesi: baru } : r)));
    toast(res.json.message);
  };

  const hapus = async (r) => {
    let mode = "only_this";
    if (r.id_group) {
      mode = await tanyaModeBerantai("Hapus jadwal berulang", "Hapus");
      if (!mode) return;
    } else {
      const ok = await Swal.fire({ title: "Hapus jadwal ini?", text: `${judulSesi(r)} · ${parseLokal(r.mulai).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}`, icon: "warning", showCancelButton: true, confirmButtonColor: "#d50000", confirmButtonText: "Hapus", cancelButtonText: "Batal" });
      if (!ok.isConfirmed) return;
    }
    const res = await kirimAPI("DELETE", `/jadwal/${r.id_jadwal}?mode=${mode}`);
    if (!res.ok) return Swal.fire("Gagal", pesanGalat(res.json), "error");
    setDetailId(null);
    toast(res.json.message);
    segarkan();
  };

  // --- WHATSAPP ---
  const waApiAktif = !!refData?.settings?.status_wa_api && !!refData?.settings?.has_wa_api_token;
  const kirimWAOtomatis = async (pesan) => {
    const antrean = [
      pesan.idGrup && { target: pesan.idGrup, message: pesan.pesanGrup },
      pesan.nomorKepsek && { target: pesan.nomorKepsek, message: pesan.pesanGrup },
      pesan.nomorGuru && { target: pesan.nomorGuru, message: pesan.pesanGuru },
    ].filter(Boolean);
    if (!antrean.length) return { sent: false, reason: "Nomor guru, nomor kepsek, dan ID grup belum diisi." };
    const res = await kirimAPI("POST", "/whatsapp", { daftar_pesan: antrean });
    return res.ok ? res.json : { sent: false, reason: pesanGalat(res.json) };
  };
  const bukaWA = (r) => setWaPanel({ pesan: susunPesanWA(r, { sekolah: refData?.settings }), api: null });
  const bukaChat = (nomor, teks) => window.open(nomor ? `https://wa.me/${nomor}?text=${encodeURIComponent(teks)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(teks)}`, "_blank", "noopener");
  const salin = async (teks) => {
    try { await navigator.clipboard.writeText(teks); toast("Teks disalin, siap ditempel ke WA"); } catch (e) { Swal.fire("Gagal menyalin", "Browser menolak akses clipboard.", "error"); }
  };

  const setelahSimpan = async ({ pesan, contoh, jumlah, sampai, waOtomatis, waPanel: buka }) => {
    setFormAwal(null);
    toast(pesan);
    segarkan();
    const wa = susunPesanWA(contoh, { sekolah: refData?.settings, jumlahSesi: jumlah, sampai });
    let hasilApi = null;
    if (waOtomatis && waApiAktif) hasilApi = await kirimWAOtomatis(wa);
    if (buka) setWaPanel({ pesan: wa, api: hasilApi });
    else if (hasilApi?.sent) toast(`${hasilApi.count} pengingat WA terkirim otomatis`);
  };

  // --- PINTASAN KEYBOARD (ala Google Calendar) ---
  useEffect(() => {
    const onKey = (e) => {
      const mengetik = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (mengetik || e.ctrlKey || e.metaKey || e.altKey || formAwal || waPanel || showRuangan) return;
      const peta = { t: () => navigasi("today"), j: () => navigasi("next"), n: () => navigasi("next"), k: () => navigasi("prev"), p: () => navigasi("prev"), c: () => bukaBaru(), "/": () => cariRef.current?.focus(), Escape: () => setDetailId(null) };
      TAMPILAN.forEach((v) => { peta[v.tombol] = () => gantiView(v.id); });
      if (peta[e.key]) { e.preventDefault(); peta[e.key](); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleSet = (setter, key) => setter((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const daftarGuru = [...(refData?.teachers || []), { id_guru: "tanpa", nama_guru: "Tanpa guru" }];

  return (
    <div className={`jadwal-shell${prefs.panelKiri ? "" : " no-left"}${detail ? " has-detail" : ""}`}>
      {/* TOOLBAR */}
      <div className="jadwal-toolbar">
        <button type="button" className="btn btn-icon-cal" onClick={() => (window.innerWidth < 992 ? setPanelKiriHp((v) => !v) : ubahPrefs({ panelKiri: !prefs.panelKiri }))} title="Tampilkan/sembunyikan panel"><i className="bi bi-list fs-5"></i></button>
        <div className="jadwal-brand d-none d-md-flex"><i className="bi bi-calendar3-week"></i><span>Jadwal</span></div>
        <button type="button" className="btn btn-outline-secondary btn-sm rounded-pill px-3 fw-semibold" onClick={() => navigasi("today")} title="Hari ini (T)">Hari ini</button>
        <div className="d-flex">
          <button type="button" className="btn btn-icon-cal" onClick={() => navigasi("prev")} title="Sebelumnya (K)"><i className="bi bi-chevron-left"></i></button>
          <button type="button" className="btn btn-icon-cal" onClick={() => navigasi("next")} title="Berikutnya (J)"><i className="bi bi-chevron-right"></i></button>
        </div>
        <h2 className="jadwal-title">{judul}</h2>
        {memuat && <span className="spinner-border spinner-border-sm text-secondary"></span>}
        <div className="ms-auto d-flex align-items-center gap-2">
          <div className="jadwal-search d-none d-lg-flex">
            <i className="bi bi-search"></i>
            <input ref={cariRef} type="search" placeholder="Cari jadwal (/)" value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <div className="jadwal-segment d-none d-sm-inline-flex">
            {TAMPILAN.map((v) => <button key={v.id} type="button" className={viewAktif === v.id ? "active" : ""} onClick={() => gantiView(v.id)} title={`${v.label} (${v.tombol.toUpperCase()})`}>{v.label}</button>)}
          </div>
          <select className="form-select form-select-sm d-sm-none w-auto" value={viewAktif} onChange={(e) => gantiView(e.target.value)}>
            {TAMPILAN.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <button type="button" className="btn btn-icon-cal" onClick={() => setEkspor(true)} title="Ekspor jadwal resmi (PDF / PNG)" aria-label="Ekspor jadwal"><i className="bi bi-file-earmark-arrow-down"></i></button>
          <div className="position-relative">
            <button type="button" className="btn btn-icon-cal" onClick={() => setShowSetelan((v) => !v)} title="Setelan kalender"><i className="bi bi-gear"></i></button>
            {showSetelan && (
              <div className="jadwal-popover" onMouseLeave={() => setShowSetelan(false)}>
                <div className="small fw-bold mb-2">Setelan Kalender</div>
                <label className="form-label small mb-1">Jam tampil</label>
                <div className="d-flex gap-2 mb-2">
                  <select className="form-select form-select-sm" value={prefs.jamMulai} onChange={(e) => ubahPrefs({ jamMulai: e.target.value })}>{JAM_PILIHAN.slice(0, -1).map((j) => <option key={j} value={j}>{j}</option>)}</select>
                  <select className="form-select form-select-sm" value={prefs.jamSelesai} onChange={(e) => ubahPrefs({ jamSelesai: e.target.value })}>{JAM_PILIHAN.slice(1).filter((j) => j > prefs.jamMulai).map((j) => <option key={j} value={j}>{j}</option>)}</select>
                </div>
                <label className="form-label small mb-1">Hari ditampilkan</label>
                <select className="form-select form-select-sm mb-2" value={prefs.hari} onChange={(e) => ubahPrefs({ hari: e.target.value })}>
                  <option value="senin-jumat">Senin – Jumat</option>
                  <option value="senin-sabtu">Senin – Sabtu</option>
                  <option value="semua">Semua hari</option>
                </select>
                <label className="form-label small mb-1">Warnai sesi berdasarkan</label>
                <div className="btn-group btn-group-sm w-100 mb-2">
                  {[["jadwal", "Jadwal"], ["guru", "Guru"], ["status", "Status"]].map(([v, l]) => (
                    <button key={v} type="button" className={`btn ${prefs.warnaiBerdasar === v ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => ubahPrefs({ warnaiBerdasar: v })}>{l}</button>
                  ))}
                </div>
                <div className="small text-body-secondary border-top pt-2">
                  Pintasan: <kbd>C</kbd> buat · <kbd>T</kbd> hari ini · <kbd>J</kbd>/<kbd>K</kbd> maju/mundur · <kbd>D</kbd> <kbd>W</kbd> <kbd>M</kbd> <kbd>A</kbd> tampilan · <kbd>/</kbd> cari
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PANEL KIRI */}
      <aside className={`jadwal-left${panelKiriHp ? " show" : ""}`}>
        <button type="button" className="jadwal-create" onClick={() => { setPanelKiriHp(false); bukaBaru(); }}>
          <i className="bi bi-plus-lg"></i><span>Buat</span>
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary w-100 mb-2" onClick={() => { setPanelKiriHp(false); setPaket(true); }} title="Susun sesi semester otomatis dari ATP & Prota/Promes">
          <i className="bi bi-box-seam me-1"></i>Paket dari Promes
        </button>
        <MiniKalender tanggalAktif={tanggalAktif} rentangAktif={rentang} tanggalBerisi={tanggalBerisi} onPilih={(d) => { api()?.gotoDate(d); setTanggalAktif(d); setPanelKiriHp(false); }} />

        <div className="jadwal-search d-lg-none my-2">
          <i className="bi bi-search"></i>
          <input type="search" placeholder="Cari jadwal" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>

        {agendaHariIni.length > 0 && (
          <div className="jadwal-section">
            <div className="jadwal-section-title">Hari ini</div>
            {agendaHariIni.slice(0, 5).map((r) => (
              <button key={r.id_jadwal} type="button" className="jadwal-today" onClick={() => setDetailId(r.id_jadwal)}>
                <span className="jadwal-today-bar" style={{ background: warnaSesi(r) }}></span>
                <span className="min-w-0 text-start">
                  <span className="d-block text-truncate fw-semibold">{judulSesi(r)}</span>
                  <span className="d-block small text-body-secondary">{rentangJam(parseLokal(r.mulai), parseLokal(r.selesai))}{r.kelas ? ` · ${r.kelas.nama_kelas}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="jadwal-section">
          <div className="jadwal-section-title d-flex align-items-center">Guru
            <button type="button" className="btn btn-link btn-sm p-0 ms-auto" onClick={() => setGuruTersembunyi(new Set())}>Semua</button>
          </div>
          {daftarGuru.map((g) => {
            const warna = g.id_guru === "tanpa" ? "#9e9e9e" : prefs.warnaiBerdasar === "guru" ? warnaGuru.get(g.id_guru) : "var(--app-accent)";
            const aktif = !guruTersembunyi.has(g.id_guru);
            return (
              <label key={g.id_guru} className="jadwal-check">
                <input type="checkbox" checked={aktif} onChange={() => toggleSet(setGuruTersembunyi, g.id_guru)} style={{ "--warna": warna }} />
                <span className="text-truncate">{g.nama_guru}</span>
              </label>
            );
          })}
        </div>

        <div className="jadwal-section">
          <div className="jadwal-section-title">Kelas</div>
          <select className="form-select form-select-sm" value={filterKelas} onChange={(e) => setFilterKelas(e.target.value)}>
            <option value="">Semua kelas</option>
            {(refData?.classes || []).map((k) => <option key={k.id_kelas} value={k.id_kelas}>{k.nama_kelas}</option>)}
          </select>
        </div>

        <div className="jadwal-section">
          <div className="jadwal-section-title">Status</div>
          <div className="d-flex flex-wrap gap-1">
            {STATUS_SESI.map((s) => (
              <button key={s.id} type="button" className={`jadwal-chip${statusTersembunyi.has(s.id) ? " off" : ""}`} onClick={() => toggleSet(setStatusTersembunyi, s.id)}>
                <span className="dot" style={{ background: WARNA_STATUS[s.id] }}></span>{s.label}
              </button>
            ))}
          </div>
        </div>

        {isPengelola && <button type="button" className="btn btn-sm btn-outline-secondary w-100 mt-2" onClick={() => setShowRuangan(true)}><i className="bi bi-door-open me-1"></i>Kelola Ruangan</button>}
      </aside>
      {panelKiriHp && <div className="jadwal-scrim" onClick={() => setPanelKiriHp(false)}></div>}

      {/* KALENDER */}
      <main className="jadwal-main">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={idLocale}
          initialView={prefsSiap ? prefs.view : PREFS_DEFAULT.view}
          headerToolbar={false}
          height="100%"
          firstDay={1}
          hiddenDays={HARI_TERSEMBUNYI[prefs.hari]}
          slotMinTime={`${prefs.jamMulai}:00`}
          slotMaxTime={`${prefs.jamSelesai}:00`}
          slotDuration="00:30:00"
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          allDaySlot={false}
          nowIndicator
          selectable
          selectMirror
          editable
          dayMaxEvents
          businessHours={{ daysOfWeek: [1, 2, 3, 4, 5, 6], startTime: "07:00", endTime: "15:00" }}
          dayCellClassNames={(arg) => (arg.date.getDay() === 0 || libur.has(ymd(arg.date)) ? ["gc-minggu"] : [])}
          events={events}
          datesSet={onDatesSet}
          select={onSelect}
          eventClick={(info) => setDetailId(info.event.id)}
          eventDrop={onDrop}
          eventResize={onResize}
          eventContent={isiEvent}
          dayHeaderContent={(arg) => (arg.view.type.startsWith("timeGrid") ? (
            <div className={`gc-head${arg.isToday ? " is-today" : ""}`}>
              <span className="gc-dow">{arg.date.toLocaleDateString("id-ID", { weekday: "short" })}</span>
              <span className="gc-num">{arg.date.getDate()}</span>
            </div>
          ) : arg.text)}
          noEventsContent="Tidak ada jadwal pada rentang ini"
          navLinks
          navLinkDayClick={(d) => { api()?.changeView("timeGridDay", d); setViewAktif("timeGridDay"); }}
        />
      </main>

      {/* PANEL DETAIL */}
      {detail && (
        <DetailSesi
          jadwal={detail}
          bolehUbah={milikSendiri(detail.id_guru)}
          onClose={() => setDetailId(null)}
          onEdit={() => setFormAwal({ mode: "edit", jadwal: detail })}
          onDuplikat={() => setFormAwal({ mode: "duplikat", jadwal: detail })}
          onHapus={() => hapus(detail)}
          onStatus={ubahStatus}
          onWA={() => bukaWA(detail)}
        />
      )}

      <FormJadwal awal={formAwal} refData={refData} onClose={() => setFormAwal(null)} onSaved={setelahSimpan} />
      {ekspor && <EksporJadwal refData={refData} tanggalAwal={tanggalAktif} rentangTampil={rentang} kelasAwal={filterKelas} onClose={() => setEkspor(false)} />}
      {paket && <PaketJadwal onClose={() => setPaket(false)} onSelesai={(r) => { setPaket(false); toast(r.message); segarkan(); }} />}

      {/* PANEL WHATSAPP */}
      {waPanel && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setWaPanel(null)}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow rounded-4">
                <div className="modal-header bg-success text-white rounded-top-4">
                  <h5 className="modal-title fw-bold"><i className="bi bi-whatsapp me-2"></i>Pengingat Sesi & To-Do STNKM</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setWaPanel(null)} aria-label="Tutup"></button>
                </div>
                <div className="modal-body">
                  {waPanel.api?.sent && <div className="alert alert-success py-2 small"><i className="bi bi-robot me-1"></i>{waPanel.api.count} pengingat terkirim otomatis via Fonnte.</div>}
                  {waPanel.api && !waPanel.api.sent && <div className="alert alert-warning py-2 small">Kirim otomatis gagal: {waPanel.api.reason}</div>}
                  <div className="fw-bold text-primary mb-3"><i className="bi bi-easel me-1"></i>{waPanel.pesan.judul}</div>
                  <label className="small fw-semibold text-body-secondary mb-1">1. Grup WA guru / kepala sekolah</label>
                  <div className="d-flex gap-2 mb-3">
                    <button type="button" className="btn btn-success btn-sm flex-grow-1" onClick={() => bukaChat(waPanel.pesan.nomorKepsek, waPanel.pesan.pesanGrup)}><i className="bi bi-whatsapp me-1"></i>Bagikan ke grup / kepsek</button>
                    <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => salin(waPanel.pesan.pesanGrup)}><i className="bi bi-clipboard me-1"></i>Salin</button>
                  </div>
                  <label className="small fw-semibold text-body-secondary mb-1">2. Japri guru: {waPanel.pesan.namaGuru} {waPanel.pesan.nomorGuru ? `(${waPanel.pesan.nomorGuru})` : "(nomor belum diisi)"}</label>
                  <div className="d-flex gap-2 mb-3">
                    <button type="button" className="btn btn-outline-success btn-sm flex-grow-1" onClick={() => bukaChat(waPanel.pesan.nomorGuru, waPanel.pesan.pesanGuru)}><i className="bi bi-whatsapp me-1"></i>Chat {waPanel.pesan.namaGuru}</button>
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => salin(waPanel.pesan.pesanGuru)}><i className="bi bi-clipboard me-1"></i>Salin</button>
                  </div>
                  <details>
                    <summary className="small text-body-secondary">Lihat isi pesan grup</summary>
                    <pre className="small bg-body-tertiary border rounded p-2 mt-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>{waPanel.pesan.pesanGrup}</pre>
                  </details>
                  <button type="button" className="btn btn-dark btn-sm w-100 mt-3" disabled={!waApiAktif}
                    onClick={async () => { const r = await kirimWAOtomatis(waPanel.pesan); setWaPanel((w) => ({ ...w, api: r })); }}>
                    <i className="bi bi-send me-1"></i>Kirim otomatis via Fonnte
                  </button>
                  {!waApiAktif && <small className="text-body-secondary d-block mt-1">Aktifkan token Fonnte di Pengaturan Sekolah untuk kirim otomatis.</small>}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {showRuangan && <KelolaRuangan ruangan={refData?.ruangan || []} onClose={() => setShowRuangan(false)} onChanged={muatReferensi} />}
    </div>
  );
}

// Modal kelola master ruangan (tambah, ubah, hapus) tanpa meninggalkan kalender
function KelolaRuangan({ ruangan, onClose, onChanged }) {
  const [form, setForm] = useState({ id_ruangan: null, nama_ruangan: "", kapasitas: "", keterangan: "" });
  const [sibuk, setSibuk] = useState(false);

  const simpan = async (e) => {
    e.preventDefault();
    if (!form.nama_ruangan.trim()) return;
    setSibuk(true);
    const body = { nama_ruangan: form.nama_ruangan.trim(), kapasitas: form.kapasitas || null, keterangan: form.keterangan || null };
    const res = form.id_ruangan ? await kirimAPI("PUT", `/ruangan/${form.id_ruangan}`, body) : await kirimAPI("POST", "/ruangan", body);
    setSibuk(false);
    if (!res.ok) return Swal.fire("Gagal", pesanGalat(res.json), "error");
    setForm({ id_ruangan: null, nama_ruangan: "", kapasitas: "", keterangan: "" });
    toast(res.json.message);
    onChanged();
  };
  const hapus = async (r) => {
    const ok = await Swal.fire({ title: `Hapus ${r.nama_ruangan}?`, text: "Jadwal yang memakai ruangan ini akan menjadi tanpa ruangan.", icon: "warning", showCancelButton: true, confirmButtonColor: "#d50000", confirmButtonText: "Hapus", cancelButtonText: "Batal" });
    if (!ok.isConfirmed) return;
    const res = await kirimAPI("DELETE", `/ruangan/${r.id_ruangan}`);
    if (!res.ok) return Swal.fire("Gagal", pesanGalat(res.json), "error");
    toast(res.json.message);
    onChanged();
  };

  return (
    <>
      <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div className="modal-content border-0 shadow rounded-4">
            <div className="modal-header">
              <h5 className="modal-title fw-bold"><i className="bi bi-door-open text-primary me-2"></i>Kelola Ruangan</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Tutup"></button>
            </div>
            <div className="modal-body">
              <form className="row g-2 mb-3" onSubmit={simpan}>
                <div className="col-12 col-sm-5"><input className="form-control form-control-sm" placeholder="Nama ruangan" maxLength={150} value={form.nama_ruangan} onChange={(e) => setForm({ ...form, nama_ruangan: e.target.value })} required /></div>
                <div className="col-4 col-sm-2"><input type="number" className="form-control form-control-sm" placeholder="Kap." min="1" max="1000" value={form.kapasitas} onChange={(e) => setForm({ ...form, kapasitas: e.target.value })} /></div>
                <div className="col-8 col-sm-5 d-flex gap-1">
                  <button type="submit" className="btn btn-primary btn-sm flex-grow-1" disabled={sibuk}><i className={`bi ${form.id_ruangan ? "bi-check2" : "bi-plus-lg"} me-1`}></i>{form.id_ruangan ? "Simpan" : "Tambah"}</button>
                  {form.id_ruangan && <button type="button" className="btn btn-light btn-sm" onClick={() => setForm({ id_ruangan: null, nama_ruangan: "", kapasitas: "", keterangan: "" })}>Batal</button>}
                </div>
                <div className="col-12"><input className="form-control form-control-sm" placeholder="Keterangan (opsional), mis. Lantai 2, ada proyektor" maxLength={255} value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></div>
              </form>
              <ul className="list-group list-group-flush">
                {ruangan.length === 0 && <li className="list-group-item text-body-secondary small text-center">Belum ada ruangan.</li>}
                {ruangan.map((r) => (
                  <li key={r.id_ruangan} className="list-group-item d-flex align-items-center gap-2 px-0">
                    <i className="bi bi-door-closed text-body-secondary"></i>
                    <div className="me-auto min-w-0">
                      <div className="fw-semibold text-truncate">{r.nama_ruangan}{r.kapasitas ? <span className="text-body-secondary fw-normal small"> · {r.kapasitas} orang</span> : null}</div>
                      {r.keterangan && <div className="small text-body-secondary text-truncate">{r.keterangan}</div>}
                    </div>
                    <button type="button" className="btn btn-icon-cal" onClick={() => setForm({ id_ruangan: r.id_ruangan, nama_ruangan: r.nama_ruangan, kapasitas: r.kapasitas || "", keterangan: r.keterangan || "" })} title="Ubah"><i className="bi bi-pencil"></i></button>
                    <button type="button" className="btn btn-icon-cal text-danger" onClick={() => hapus(r)} title="Hapus"><i className="bi bi-trash"></i></button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
}
