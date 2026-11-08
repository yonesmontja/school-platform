"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import TabCp from "@/components/perangkatajar/TabCp";
import TabAtp from "@/components/perangkatajar/TabAtp";
import TabModul from "@/components/perangkatajar/TabModul";

const TAB = [
  { id: "atp", label: "ATP", icon: "bi-diagram-3" },
  { id: "modul", label: "Modul Ajar", icon: "bi-journal-richtext" },
  { id: "cp", label: "Capaian Pembelajaran", icon: "bi-journal-bookmark" },
];

/** Perangkat ajar (Fase 17): CP per mapel & fase, ATP disusun bersama AI lalu disetujui kepala sekolah. */
function PerangkatAjar() {
  const akses = useAkses();
  const cari = useSearchParams();
  const [tab, setTab] = useState(["cp", "modul"].includes(cari.get("tab")) ? cari.get("tab") : "atp");
  const [atpModul, setAtpModul] = useState(null); // ATP yang dipilih untuk modul baru
  const [referensi, setReferensi] = useState(null);
  const [galat, setGalat] = useState(null);

  useEffect(() => { minta("GET", "/perangkat-ajar/referensi").then(setReferensi).catch((err) => setGalat(err.message)); }, []);

  return (
    <div className="container-fluid mt-3 mb-5">
      <h3 className="fw-bold text-primary mb-1"><i className="bi bi-journal-richtext me-2"></i>Perangkat Ajar</h3>
      <p className="text-muted small mb-3">Capaian Pembelajaran, Alur Tujuan Pembelajaran, dan modul ajar (Perencanaan Pembelajaran Mendalam): disusun bersama AI, disetujui kepala sekolah, dan langsung tersambung ke TP di Input Nilai dan Bank Soal.</p>
      <ul className="nav nav-tabs mb-3">
        {TAB.map((t) => (
          <li key={t.id} className="nav-item">
            <button className={`nav-link ${tab === t.id ? "active" : ""}`} onClick={() => { setTab(t.id); setAtpModul(null); }}><i className={`bi ${t.icon} me-1`}></i>{t.label}</button>
          </li>
        ))}
      </ul>
      {galat ? <div className="alert alert-warning">{galat}</div>
        : !referensi || !akses.user ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : tab === "cp" ? <TabCp referensi={referensi} />
        : tab === "modul" ? <TabModul key={atpModul || "modul"} referensi={referensi} akses={akses} statusAwal={cari.get("tab") === "modul" ? cari.get("status") || "" : ""} atpAwal={atpModul} modulAwal={cari.get("modul")} />
        : <TabAtp referensi={referensi} akses={akses} statusAwal={cari.get("tab") ? "" : cari.get("status") || ""} onBuatModul={(id) => { setAtpModul(id); setTab("modul"); }} />}
    </div>
  );
}

export default function Halaman() {
  return <Suspense fallback={null}><PerangkatAjar /></Suspense>;
}
