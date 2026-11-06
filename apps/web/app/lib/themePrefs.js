"use client";
import { useEffect, useState } from "react";
import { KEY_MODE, KEY_ACCENT, KEY_GAYA } from "./themeScript";

// Tema (terang/gelap/otomatis) dan warna aksen aplikasi, disimpan per browser
export const THEME_EVENT = "app-theme-change";

export const ACCENTS = [
  { id: "biru", label: "Biru", c1: "#3b82f6", c2: "#6366f1" },
  { id: "indigo", label: "Indigo", c1: "#6366f1", c2: "#8b5cf6" },
  { id: "ungu", label: "Ungu", c1: "#8b5cf6", c2: "#d946ef" },
  { id: "hijau", label: "Hijau", c1: "#10b981", c2: "#14b8a6" },
  { id: "teal", label: "Teal", c1: "#0d9488", c2: "#0ea5e9" },
  { id: "oranye", label: "Oranye", c1: "#f97316", c2: "#f59e0b" },
  { id: "rose", label: "Rose", c1: "#e11d48", c2: "#f43f5e" },
];
export const THEME_MODES = [
  { id: "light", label: "Terang", icon: "bi-sun" },
  { id: "dark", label: "Gelap", icon: "bi-moon-stars" },
  { id: "auto", label: "Otomatis", icon: "bi-circle-half" },
];

// Gaya tampilan: Tabler (bawaan) atau Klasik (AdminLTE apa adanya)
export const GAYA = [
  { id: "tabler", label: "Tabler", icon: "bi-grid-1x2" },
  { id: "klasik", label: "Klasik", icon: "bi-window" },
];

const baca = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
};
const sistemGelap = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
export const resolveMode = (mode) => (mode === "auto" ? (sistemGelap() ? "dark" : "light") : mode);

export const applyTheme = () => {
  const mode = baca(KEY_MODE, "light");
  const accent = baca(KEY_ACCENT, "biru");
  document.documentElement.setAttribute("data-gaya", baca(KEY_GAYA, "tabler") === "klasik" ? "klasik" : "tabler");
  document.documentElement.setAttribute("data-bs-theme", resolveMode(mode));
  document.documentElement.setAttribute("data-accent", ACCENTS.some((a) => a.id === accent) ? accent : "biru");
};

const simpan = (key, value) => {
  try { localStorage.setItem(key, value); } catch (e) { /* storage diblokir */ }
  applyTheme();
  window.dispatchEvent(new Event(THEME_EVENT));
};
export const setThemeMode = (mode) => simpan(KEY_MODE, mode);
export const setAccent = (id) => simpan(KEY_ACCENT, id);
export const setGaya = (id) => simpan(KEY_GAYA, id);


export function useAppTheme() {
  const [state, setState] = useState({ mode: "light", accent: "biru", gaya: "tabler", resolved: "light" });
  useEffect(() => {
    const sync = () => {
      const mode = baca(KEY_MODE, "light");
      setState({ mode, accent: baca(KEY_ACCENT, "biru"), gaya: baca(KEY_GAYA, "tabler"), resolved: resolveMode(mode) });
    };
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => { applyTheme(); sync(); };
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", onSystem);
    mq.addEventListener("change", onSystem);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", onSystem);
      mq.removeEventListener("change", onSystem);
    };
  }, []);
  return state;
}
