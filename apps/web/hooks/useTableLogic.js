import { useState, useEffect, useCallback, useRef } from "react";
import Swal from "sweetalert2";
import { bacaUser } from "@/app/lib/akses";

// Data master hanya diubah peran "pengubah" (bawaan admin); peran lain melihat tabel tanpa kolom aksi
const kolomUntukPeran = (columnsDef, pengubah) =>
  pengubah.includes(bacaUser()?.role) ? columnsDef : columnsDef.filter((c) => c.field !== "action");

export const useTableLogic = (fetchDataFunction, columnsDef, searchFields, { pengubah = ["admin"] } = {}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleColumns, setVisibleColumns] = useState(
    columnsDef.map((c) => c.field),
  );

  const tableRef = useRef(null);
  const tabulatorInstance = useRef(null);
  // Data & kolom terbaru untuk handler "tableBuilt": data bisa tiba sebelum Tabulator selesai dibuat,
  // sedangkan closure inisialisasi hanya memegang nilai awal (kosong)
  const dataTerbaru = useRef(data);
  dataTerbaru.current = data;
  const kolomTampil = useRef(visibleColumns);
  kolomTampil.current = visibleColumns;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchDataFunction();
      setData(res || []);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [fetchDataFunction]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Inisialisasi Tabulator
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (tableRef.current && !tabulatorInstance.current) {
        const { TabulatorFull } = await import("tabulator-tables");
        if (!isMounted) return;

        tabulatorInstance.current = new TabulatorFull(tableRef.current, {
          layout: "fitColumns",
          responsiveLayout: "collapse",
          pagination: true,
          paginationSize: 10,
          placeholder: "Data tidak ditemukan.",
          cssClass: "table table-sm table-bordered table-hover table-striped",
          columns: kolomUntukPeran(columnsDef, pengubah),
        });

        tabulatorInstance.current.on("tableBuilt", () => {
          if (isMounted && tabulatorInstance.current) {
            tabulatorInstance.current.replaceData(dataTerbaru.current);
            applyColumnVisibility(kolomTampil.current);
          }
        });
      }
    };
    init();
    return () => {
      isMounted = false;
      if (tabulatorInstance.current) {
        tabulatorInstance.current.destroy();
        tabulatorInstance.current = null;
      }
    };
  }, []);

  // Update Data
  useEffect(() => {
    if (tabulatorInstance.current) {
      setTimeout(() => {
        if (tabulatorInstance.current) {
          tabulatorInstance.current.replaceData(data);
          applyFilters();
        }
      }, 50);
    }
  }, [data]);

  // Filter
  const applyFilters = () => {
    if (!tabulatorInstance.current) return;
    let filters = [];
    if (searchQuery.trim() !== "") {
      let q = searchQuery.toLowerCase();
      let orFilters = searchFields.map((field) => ({
        field,
        type: "like",
        value: q,
      }));
      filters.push(orFilters);
    }
    tabulatorInstance.current.setFilter(filters);
  };
  useEffect(() => {
    applyFilters();
  }, [searchQuery]);

  // Toggle Kolom
  const toggleColumn = (field) => {
    setVisibleColumns((prev) => {
      const newVals = prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field];
      applyColumnVisibility(newVals);
      return newVals;
    });
  };

  const applyColumnVisibility = (cols) => {
    if (!tabulatorInstance.current) return;
    kolomUntukPeran(columnsDef, pengubah).forEach((col) => {
      if (cols.includes(col.field))
        tabulatorInstance.current.showColumn(col.field);
      else tabulatorInstance.current.hideColumn(col.field);
    });
    setTimeout(() => {
      if (tabulatorInstance.current) tabulatorInstance.current.redraw();
    }, 50);
  };

  const getFilteredData = () => {
    return tabulatorInstance.current.getData("active");
  };

  return {
    tableRef,
    data,
    loading,
    searchQuery,
    setSearchQuery,
    visibleColumns,
    toggleColumn,
    getFilteredData,
    refresh: fetchData,
  };
};
