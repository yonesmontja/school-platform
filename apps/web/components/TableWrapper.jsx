"use client";
import { useState } from "react";

export default function TableWrapper({
  title,
  icon,
  loading,
  searchQuery,
  setSearchQuery,
  tableRef,
  columns,
  visibleColumns,
  toggleColumn,
  onAdd,
  onExportExcel,
  onExportCSV,
  onExportPDF,
}) {
  return (
    <div className="container-fluid mt-4 mb-5">
      <style jsx>{`
        :global(.tabulator) {
          font-size: 13px !important;
        }
        :global(.tabulator .tabulator-header) {
          font-size: 12px !important;
          font-weight: 700 !important;
          background-color: #f4f6f9 !important;
        }
        :global(.tabulator .tabulator-cell) {
          padding: 4px 8px !important;
          vertical-align: middle;
        }
      `}</style>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-2">
        <h3 className="fw-bold text-primary m-0">
          <i className={`bi ${icon} me-2`}></i>
          {title}
        </h3>
        <div className="d-flex gap-2 flex-wrap">
          <div className="dropdown">
            <button
              className="btn btn-outline-secondary fw-bold dropdown-toggle"
              type="button"
              data-bs-toggle="dropdown"
            >
              <i className="bi bi-gear me-1"></i> Atur Kolom
            </button>
            <ul
              className="dropdown-menu shadow-sm"
              style={{ maxHeight: "300px", overflowY: "auto" }}
            >
              {columns
                .filter((c) => c.field !== "action")
                .map((col) => (
                  <li key={col.field || col.title}>
                    <label
                      className="dropdown-item d-flex align-items-center gap-2"
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={visibleColumns.includes(col.field)}
                        onChange={() => toggleColumn(col.field)}
                      />
                      {col.title}
                    </label>
                  </li>
                ))}
            </ul>
          </div>

          <div className="btn-group">
            <button className="btn btn-success fw-bold" onClick={onExportExcel}>
              <i className="bi bi-file-earmark-excel"></i> XLSX
            </button>
            <button
              className="btn btn-info text-white fw-bold"
              onClick={onExportCSV}
            >
              <i className="bi bi-filetype-csv"></i> CSV
            </button>
            <button className="btn btn-danger fw-bold" onClick={onExportPDF}>
              <i className="bi bi-file-earmark-pdf"></i> PDF
            </button>
          </div>

          <button className="btn btn-primary fw-bold shadow-sm" onClick={onAdd}>
            <i className="bi bi-plus-lg me-2"></i>Tambah Data
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm p-3 p-md-4">
        <div className="row mb-3 g-2">
          <div className="col-12">
            <input
              type="text"
              className="form-control border-primary form-control-sm"
              placeholder="Cari data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        {loading && (
          <div className="text-center text-muted mb-2">
            <span className="spinner-border spinner-border-sm me-2"></span>
            Memuat data...
          </div>
        )}
        <div className="table-responsive">
          <div ref={tableRef}></div>
        </div>
      </div>
    </div>
  );
}
