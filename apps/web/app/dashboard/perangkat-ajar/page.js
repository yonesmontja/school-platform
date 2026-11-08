"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import TabCp from "@/components/perangkatajar/TabCp";
import TabAtp from "@/components/perangkatajar/TabAtp";

const TAB = [
  { id: "atp", label: "ATP", icon: "bi-diagram-3" },
  { id: "cp", label: "Capaian Pembelajaran", icon: "bi-journal-bookmark" },
];

/** Perangkat ajar (Fase 17): CP per mapel & fase, ATP disusun bersama AI lalu disetujui kepala sekolah. */
function PerangkatAjar() {
  const akses = useAkses();
  const cari = useSearchParams();
  const [tab, setTab] = useState(cari.get("tab") === "cp" ? "cp" : "atp");
  const [referensi, setReferensi] = useState(null);
  const [galat, setGalat] = useState(null);

  useEffect(() => { minta("GET", "/perangkat-ajar/referensi").then(setReferensi).catch((err) => setGalat(err.message)); }, []);

  return (
    <div className="container-fluid mt-3 mb-5">
      <h3 className="fw-bold text-primary mb-1"><i className="bi bi-journal-richtext me-2"></i>Perangkat Ajar</h3>
      <p className="text-muted small mb-3">Capaian Pembelajaran, Alur Tujuan Pembelajaran, dan (menyusul) modul ajar: disusun bersama AI, disetujui kepala sekolah, dan langsung tersambung ke TP di Input Nilai dan Bank Soal.</p>
      <ul className="nav nav-tabs mb-3">
        {TAB.map((t) => (
          <li key={t.id} className="nav-item">
            <button className={`nav-link ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}><i className={`bi ${t.icon} me-1`}></i>{t.label}</button>
          </li>
        ))}
      </ul>
      {galat ? <div className="alert alert-warning">{galat}</div>
        : !referensi || !akses.user ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : tab === "cp" ? <TabCp referensi={referensi} />
        : <TabAtp referensi={referensi} akses={akses} statusAwal={cari.get("status") || ""} />}
    </div>
  );
}

export default function Halaman() {
  return <Suspense fallback={null}><PerangkatAjar /></Suspense>;
}
