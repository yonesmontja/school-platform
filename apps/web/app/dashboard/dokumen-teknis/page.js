"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { minta } from "@/components/banksoal/api";
import "./dokumen-teknis.css";

const tanggal = (iso) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" }) : "-");
const angka = (n) => Number(n || 0).toLocaleString("id-ID");

/**
 * Dokumen Teknis SAPrapor (khusus Admin): naskah bergaya tesis yang isinya dibaca dari repo
 * (services/core-api/resources/dokumen-teknis), lengkap dengan diagram dan data yang dihitung dari sistem berjalan.
 */
export default function DokumenTeknis() {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState("");
  const [cari, setCari] = useState("");
  const [aktif, setAktif] = useState("");
  const kertas = useRef(null);

  const muat = () => {
    setGalat("");
    minta("GET", "/dokumen-teknis").then(setData).catch((e) => setGalat(e.message || "Gagal memuat dokumen."));
  };
  useEffect(muat, []);

  // Sorot entri daftar isi sesuai bagian yang sedang dibaca
  useEffect(() => {
    if (!data || !kertas.current) return undefined;
    const judul = kertas.current.querySelectorAll("[data-bab], .dt-isi h2[id], .dt-isi h3[id]");
    const amati = new IntersectionObserver((entri) => {
      const terlihat = entri.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (terlihat[0]) setAktif(terlihat[0].target.id);
    }, { rootMargin: "-70px 0px -70% 0px" });
    judul.forEach((el) => amati.observe(el));
    return () => amati.disconnect();
  }, [data]);

  const daftarIsi = useMemo(() => {
    if (!data) return [];
    const q = cari.trim().toLowerCase();
    return data.bab.map((b) => ({
      ...b,
      bagian: b.bagian.filter((s) => !q || s.judul.toLowerCase().includes(q) || b.judul.toLowerCase().includes(q)),
    })).filter((b) => !q || b.judul.toLowerCase().includes(q) || b.bagian.length);
  }, [data, cari]);

  const ke = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setAktif(id);
  };

  if (galat) {
    return (
      <div className="container-fluid mt-3">
        <div className="alert alert-warning d-flex align-items-center gap-2">
          <i className="bi bi-shield-lock fs-4"></i>
          <div><b>Dokumen Teknis tidak dapat dibuka.</b><div className="small">{galat}</div></div>
          <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={muat}>Coba lagi</button>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="container-fluid mt-4 text-muted"><span className="spinner-border spinner-border-sm me-2"></span>Menyusun dokumen dari repo…</div>;
  }

  const meta = data.meta || {};
  return (
    <div className="dt" data-dokumen-teknis>
      <div className="dt-alat">
        <div className="me-auto">
          <h3 className="fw-bold text-primary mb-0"><i className="bi bi-journal-richtext me-2"></i>Dokumen Teknis</h3>
          <div className="small text-muted">
            Isi diperbarui dari repo: <b data-diperbarui>{tanggal(data.diperbarui)}</b> · data sistem dihitung {tanggal(data.dihitung)}
          </div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={muat}><i className="bi bi-arrow-clockwise me-1"></i>Muat ulang</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => window.print()}><i className="bi bi-printer me-1"></i>Cetak / PDF</button>
      </div>

      <div className="dt-kartu-angka" data-statistik>
        {(data.statistik || []).slice(0, 10).map((s) => (
          <div key={s.label}><b>{angka(s.nilai)}</b><span>{s.label}</span></div>
        ))}
      </div>

      <div className="dt-tata">
        <nav className="dt-samping" aria-label="Daftar isi">
          <input type="search" className="form-control form-control-sm dt-cari" placeholder="Cari bagian…" value={cari} onChange={(e) => setCari(e.target.value)} />
          <h6>Daftar isi</h6>
          <a href="#dt-sampul" onClick={ke("dt-sampul")} className={aktif === "dt-sampul" ? "aktif" : ""}>Halaman judul</a>
          {daftarIsi.map((b) => (
            <div key={b.slug}>
              <a href={`#bab-${b.slug}`} onClick={ke(`bab-${b.slug}`)} className={aktif === `bab-${b.slug}` ? "aktif fw-semibold" : "fw-semibold"}>{b.judul}</a>
              {b.bagian.map((s) => (
                <a key={s.id} href={`#${s.id}`} onClick={ke(s.id)} className={`dt-sub ${s.level === 3 ? "l3" : ""} ${aktif === s.id ? "aktif" : ""}`}>{s.judul}</a>
              ))}
            </div>
          ))}
        </nav>

        <article className="dt-kertas" ref={kertas}>
          <header className="dt-sampul" id="dt-sampul" data-bab>
            <div className="dt-jenis">{meta.jenis || "Dokumen Teknis Sistem"}</div>
            <h1>{meta.judul || "SAPrapor"}</h1>
            {meta.subjudul && <div className="dt-subjudul">{meta.subjudul}</div>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/ikon-aplikasi/icon-192.png" alt="" />
            <div className="dt-penyusun">Disusun oleh<br /><b>{meta.penyusun || "Tim Pengembang SAPrapor"}</b></div>
            <div className="dt-institusi">{meta.institusi}</div>
            <div className="dt-kota">{[meta.kota, meta.tahun].filter(Boolean).join(", ")}{meta.versi ? ` · Versi ${meta.versi}` : ""}</div>
            {meta.catatan && <p className="dt-catatan-hidup">{meta.catatan}</p>}
          </header>

          {data.bab.map((b) => (
            <section key={b.slug} className="dt-bab" id={`bab-${b.slug}`} data-bab>
              <h2 className="dt-judul-bab">{b.judul}</h2>
              <div className="dt-isi" dangerouslySetInnerHTML={{ __html: b.html }} />
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
