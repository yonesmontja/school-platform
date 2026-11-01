"use client";
import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { useAppTheme } from "@/app/lib/themePrefs";
import { eksporCSV, eksporPDF, eksporPNG } from "./chartExport";

// Warna teks & garis grafik mengikuti tema terang/gelap
const WARNA_TEMA = {
  light: { color: "#495057", borderColor: "rgba(0,0,0,0.08)" },
  dark: { color: "#adb5bd", borderColor: "rgba(255,255,255,0.1)" },
};

// Kanvas Chart.js; dimuat dinamis agar tidak memperbesar bundle halaman lain
export function ChartCanvas({ config, height = 300 }) {
  const { resolved } = useAppTheme();
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!config || !canvasRef.current) return;
    let batal = false;
    (async () => {
      const { default: Chart } = await import("chart.js/auto");
      if (batal || !canvasRef.current) return;
      Object.assign(Chart.defaults, WARNA_TEMA[resolved] || WARNA_TEMA.light);
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current, {
        ...config,
        data: { ...config.data, datasets: config.data.datasets.map((d) => ({ ...d, data: [...d.data] })) },
      });
    })();
    return () => { batal = true; };
  }, [config, resolved]);
  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  return <div style={{ position: "relative", height }}><canvas ref={canvasRef}></canvas></div>;
}

const TabelData = ({ table }) => (
  <div className="table-responsive">
    <table className="table table-sm table-hover align-middle mb-0 small">
      <thead className="table-light">
        <tr><th className="text-center" style={{ width: 40 }}>No</th>{table.headers.map((h) => <th key={h} className="text-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((r, i) => (
          <tr key={i}><td className="text-center text-muted">{i + 1}</td>{r.map((c, j) => <td key={j} className={j === 0 ? "fw-semibold" : ""}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const MenuEkspor = ({ onPNG, onCSV, onPDF, disabled }) => (
  <div className="dropdown">
    <button type="button" className="btn btn-sm btn-tool-dash dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" disabled={disabled} title="Simpan / cetak">
      <i className="bi bi-download"></i>
    </button>
    <ul className="dropdown-menu dropdown-menu-end shadow-sm">
      <li><button type="button" className="dropdown-item small" onClick={onPNG}><i className="bi bi-image text-primary me-2"></i>Gambar (.PNG)</button></li>
      <li><button type="button" className="dropdown-item small" onClick={onCSV}><i className="bi bi-filetype-csv text-success me-2"></i>Data tabel (.CSV)</button></li>
      <li><button type="button" className="dropdown-item small" onClick={onPDF}><i className="bi bi-file-earmark-pdf text-danger me-2"></i>Laporan resmi (.PDF)</button></li>
    </ul>
  </div>
);

/**
 * Kartu grafik dasbor: bisa dilipat, diperbesar (dengan tabel rincian), dan diekspor PNG/CSV/PDF.
 * `hasil` = { config, table } dari modul analitik, atau { kosong: "pesan" } bila belum ada data.
 */
export default function ChartCard({
  title, subtitle, icon = "bi-bar-chart", variant = "primary", collapsed = false, onToggle,
  tools, hasil, height = 300, exportCtx = {}, actions, badge,
}) {
  const [zoom, setZoom] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const adaData = hasil && !hasil.kosong;
  const namaFile = `${title}_${new Date().toISOString().slice(0, 10)}`;

  const jalankan = async (fn) => {
    if (!adaData) return Swal.fire("Belum Ada Data", "Grafik ini belum memiliki data untuk diekspor.", "info");
    setSibuk(true);
    try { await fn(); } catch (e) { Swal.fire("Gagal Ekspor", e.message, "error"); } finally { setSibuk(false); }
  };
  const ekspor = {
    onPNG: () => jalankan(() => eksporPNG({ config: hasil.config, judul: title, konteks: exportCtx.konteks || "", sekolah: exportCtx.sekolah, namaFile })),
    onCSV: () => jalankan(() => eksporCSV({ table: hasil.table, namaFile })),
    onPDF: () => jalankan(() => eksporPDF({ config: hasil.config, judul: title, konteks: exportCtx.konteks || "", table: hasil.table, sekolah: exportCtx.sekolah, petugas: exportCtx.petugas, namaFile })),
  };

  return (
    <div className={`card dash-card card-outline card-${variant} h-100${collapsed ? " is-collapsed" : ""}`}>
      <div className="card-header dash-card-header">
        <span className={`dash-card-icon text-bg-${variant}`}><i className={`bi ${icon}`}></i></span>
        <div className="me-auto min-w-0">
          <h3 className="card-title dash-card-title text-truncate">{title}{badge}</h3>
          {subtitle && <div className="dash-card-subtitle text-truncate">{subtitle}</div>}
        </div>
        <div className="d-flex align-items-center gap-1 flex-shrink-0">
          {sibuk && <span className="spinner-border spinner-border-sm text-secondary me-1"></span>}
          {actions}
          <button type="button" className="btn btn-sm btn-tool-dash" onClick={() => setZoom(true)} disabled={!adaData} title="Perbesar & lihat tabel"><i className="bi bi-arrows-fullscreen"></i></button>
          <MenuEkspor {...ekspor} disabled={!adaData || sibuk} />
          <button type="button" className="btn btn-sm btn-tool-dash" onClick={onToggle} title={collapsed ? "Buka" : "Lipat"} aria-expanded={!collapsed}>
            <i className="bi bi-chevron-up dash-collapse-icon"></i>
          </button>
        </div>
      </div>
      <div className="dash-collapse">
        <div className="dash-collapse-inner">
          <div className="card-body">
            {tools && <div className="d-flex flex-wrap align-items-center gap-2 mb-3">{tools}</div>}
            {adaData
              ? <ChartCanvas config={hasil.config} height={height} />
              : <div className="dash-empty" style={{ minHeight: height }}><i className="bi bi-inbox fs-2 d-block mb-2 opacity-50"></i>{hasil?.kosong || "Memuat..."}</div>}
          </div>
        </div>
      </div>

      {zoom && adaData && (
        <>
          <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setZoom(false)}>
            <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content border-0 shadow rounded-4">
                <div className="modal-header">
                  <h5 className="modal-title fw-bold"><i className={`bi ${icon} text-${variant} me-2`}></i>{title}</h5>
                  <button type="button" className="btn-close" onClick={() => setZoom(false)} aria-label="Tutup"></button>
                </div>
                <div className="modal-body">
                  {exportCtx.konteks && <div className="small text-body-secondary mb-2">{exportCtx.konteks}</div>}
                  <ChartCanvas config={hasil.config} height={420} />
                  <h6 className="fw-semibold mt-4 mb-2"><i className="bi bi-table me-1"></i>Tabel Rincian</h6>
                  <TabelData table={hasil.table} />
                </div>
                <div className="modal-footer justify-content-between">
                  <small className="text-body-secondary">Format ekspor mengikuti standar laporan sekolah.</small>
                  <div className="btn-group btn-group-sm">
                    <button type="button" className="btn btn-outline-primary" onClick={ekspor.onPNG}><i className="bi bi-image me-1"></i>PNG</button>
                    <button type="button" className="btn btn-outline-success" onClick={ekspor.onCSV}><i className="bi bi-filetype-csv me-1"></i>CSV</button>
                    <button type="button" className="btn btn-outline-danger" onClick={ekspor.onPDF}><i className="bi bi-file-earmark-pdf me-1"></i>PDF</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setZoom(false)}>Tutup</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}
