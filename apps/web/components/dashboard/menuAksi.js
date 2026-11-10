"use client";
// Menu aksi baris "tiga titik" (⋮) yang seragam untuk semua tabel: Tabulator (HTML string) maupun JSX.
// Menu ditempel ke <body> agar tidak terpotong overflow sel tabel; tertutup saat klik di luar, Esc, gulir, atau ubah ukuran.
import { createElement } from "react";

let menuAktif = null;

function tutup() {
  if (!menuAktif) return;
  const { el, anchor, lepas } = menuAktif;
  menuAktif = null;
  lepas();
  el.remove();
  anchor.setAttribute("aria-expanded", "false");
}

/**
 * Buka menu di bawah tombol.
 * @param {HTMLElement} anchor tombol ⋮
 * @param {{label: string, ikon?: string, onClick: Function, bahaya?: boolean, pemisah?: boolean, tampil?: boolean}[]} items
 */
export function bukaMenuAksi(anchor, items) {
  const sama = menuAktif?.anchor === anchor;
  tutup();
  if (sama || !anchor) return;
  const daftar = items.filter((i) => i && i.tampil !== false);
  const el = document.createElement("div");
  el.className = "menu-aksi dropdown-menu show shadow";
  el.setAttribute("role", "menu");
  if (!daftar.length) {
    el.innerHTML = `<span class="dropdown-item-text small text-body-secondary">Tidak ada aksi</span>`;
  }
  daftar.forEach((it) => {
    if (it.pemisah) el.appendChild(Object.assign(document.createElement("hr"), { className: "dropdown-divider" }));
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.className = `dropdown-item d-flex align-items-center gap-2${it.bahaya ? " text-danger" : ""}`;
    b.innerHTML = `<i class="bi ${it.ikon || "bi-dot"}"></i><span></span>`;
    b.querySelector("span").textContent = it.label;
    b.addEventListener("click", (e) => { e.stopPropagation(); tutup(); it.onClick?.(); });
    el.appendChild(b);
  });
  document.body.appendChild(el);

  // Posisi: di bawah tombol, rata kanan; naik ke atas bila tidak muat
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const kiri = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
  const atas = r.bottom + h + 8 > window.innerHeight && r.top - h - 4 > 0 ? r.top - h - 4 : r.bottom + 4;
  Object.assign(el.style, { position: "fixed", left: `${kiri}px`, top: `${atas}px`, zIndex: 1080, minWidth: "11rem" });

  const luar = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) tutup(); };
  const tombol = (e) => {
    const item = [...el.querySelectorAll("[role=menuitem]")];
    const i = item.indexOf(document.activeElement);
    if (e.key === "Escape") { tutup(); anchor.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); item[(i + 1) % item.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); item[(i - 1 + item.length) % item.length]?.focus(); }
    else if (e.key === "Tab") tutup();
  };
  const geser = (e) => { if (!el.contains(e.target)) tutup(); };
  // Didengar di window fase capture (lebih dulu dari handler delegasi Bootstrap yang juga capture di document).
  // Tombol di dalam menu tidak diteruskan: Bootstrap akan mencari tombol data-bs-toggle untuk .dropdown-menu ini,
  // yang tidak ada, lalu melempar error.
  const tombolLuar = (e) => {
    if (el.contains(e.target) && ["Escape", "ArrowDown", "ArrowUp", "Tab"].includes(e.key)) e.stopPropagation();
    tombol(e);
  };
  setTimeout(() => document.addEventListener("mousedown", luar), 0);
  window.addEventListener("keydown", tombolLuar, true);
  window.addEventListener("scroll", geser, true);
  window.addEventListener("resize", tutup);
  menuAktif = {
    el, anchor,
    lepas: () => {
      document.removeEventListener("mousedown", luar);
      window.removeEventListener("keydown", tombolLuar, true);
      window.removeEventListener("scroll", geser, true);
      window.removeEventListener("resize", tutup);
    },
  };
  anchor.setAttribute("aria-expanded", "true");
  el.querySelector("[role=menuitem]")?.focus({ preventScroll: true });
}

export const TOMBOL_KEBAB = `<button type="button" class="btn btn-sm btn-kebab" aria-label="Aksi baris" aria-haspopup="menu" aria-expanded="false" title="Aksi"><i class="bi bi-three-dots-vertical"></i></button>`;

/**
 * Kolom "Aksi" Tabulator dengan menu ⋮.
 * @param {(data: object) => Array} itemsDari fungsi data baris → daftar item menu
 */
export function kolomAksi(itemsDari, opsi = {}) {
  return {
    title: "Aksi", field: "action", width: 70, hozAlign: "center", headerHozAlign: "center", headerSort: false, ...opsi,
    formatter: (cell) => (itemsDari(cell.getRow().getData()).some((i) => i && i.tampil !== false) ? TOMBOL_KEBAB : `<span class="text-muted small">-</span>`),
    cellClick: (e, cell) => {
      const b = e.target.closest(".btn-kebab");
      if (b) bukaMenuAksi(b, itemsDari(cell.getRow().getData()));
    },
  };
}

/** Versi JSX: <MenuAksi items={[...]} label="Aksi untuk Budi" /> */
export function MenuAksi({ items, label = "Aksi baris", className = "" }) {
  return createElement("button", {
    type: "button", className: `btn btn-sm btn-kebab ${className}`, "aria-label": label, "aria-haspopup": "menu", "aria-expanded": "false", title: "Aksi",
    onClick: (e) => { e.stopPropagation(); bukaMenuAksi(e.currentTarget, items); },
  }, createElement("i", { className: "bi bi-three-dots-vertical" }));
}

/** Item standar */
export const aksiUbah = (onClick, tampil = true) => ({ label: "Ubah", ikon: "bi-pencil-square", onClick, tampil });
export const aksiHapus = (onClick, tampil = true) => ({ label: "Hapus", ikon: "bi-trash", onClick, bahaya: true, pemisah: true, tampil });
