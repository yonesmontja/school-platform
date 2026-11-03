// Audit trail di sisi browser: tindakan yang tidak melewati server (buka halaman, unduh berkas, cetak,
// buka chat WhatsApp, salin teks) dikirim ke /log-aktivitas/event. Perubahan data dicatat server sendiri.
import { API_URL, authHeaders } from "@/app/lib/akses";

export function catatAktivitas({ aksi, modul, deskripsi, rute, meta }) {
  if (typeof window === "undefined" || !localStorage.getItem("token")) return;
  try {
    // keepalive: tetap terkirim meski halaman langsung berpindah/ditutup (mis. jendela cetak)
    fetch(`${API_URL}/log-aktivitas/event`, {
      method: "POST", headers: authHeaders(), keepalive: true,
      body: JSON.stringify({ aksi, modul, deskripsi: String(deskripsi).slice(0, 500), rute: rute ?? window.location.pathname, meta }),
    }).catch(() => {});
  } catch (e) { /* audit tidak boleh mengganggu pengguna */ }
}

const FORMAT = { xlsx: "Excel", xls: "Excel", csv: "CSV", pdf: "PDF", png: "gambar PNG", jpg: "gambar", zip: "ZIP", json: "JSON" };
const cuplikan = (teks, n = 160) => { const t = String(teks || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/**
 * Pasang pelacak output sekali untuk seluruh dashboard. Menangkap:
 * - unduhan berkas (Excel/CSV/PDF/PNG dari XLSX, jsPDF, atau tautan download) → EKSPOR
 * - jendela cetak (window.open kosong lalu print) → CETAK
 * - chat WhatsApp (wa.me / api.whatsapp.com) → KIRIM_WA
 * - salin ke clipboard → SALIN
 * konteks() mengembalikan { modul } halaman yang sedang dibuka. Mengembalikan fungsi pelepas.
 */
export function pasangPelacakOutput(konteks) {
  if (typeof window === "undefined" || window.__pelacakOutput) return () => {};
  window.__pelacakOutput = true;
  let terakhir = { kunci: "", waktu: 0 };
  const catat = (aksi, deskripsi, meta) => {
    // Satu klik bisa memicu dua jalur (click() + dispatchEvent); catat sekali saja
    const kunci = `${aksi}|${deskripsi}`;
    if (kunci === terakhir.kunci && Date.now() - terakhir.waktu < 1500) return;
    terakhir = { kunci, waktu: Date.now() };
    catatAktivitas({ aksi, modul: konteks().modul, deskripsi, meta });
  };

  const unduhan = (a) => {
    if (!(a instanceof HTMLAnchorElement) || !a.hasAttribute("download")) return;
    const nama = a.getAttribute("download") || "berkas";
    const ext = nama.split(".").pop().toLowerCase();
    catat("EKSPOR", `Mengunduh ${FORMAT[ext] || "berkas"}: ${nama}`, { berkas: nama, format: ext });
  };

  const asliClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...args) { unduhan(this); return asliClick.apply(this, args); };
  const asliDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) { if (ev?.type === "click") unduhan(this); return asliDispatch.call(this, ev); };
  const klikDokumen = (e) => { const a = e.target?.closest?.("a[download]"); if (a) unduhan(a); };
  document.addEventListener("click", klikDokumen, true);

  const asliOpen = window.open;
  window.open = function (url, ...rest) {
    const u = String(url || "");
    if (/wa\.me|api\.whatsapp\.com/.test(u)) {
      let nomor = "", teks = "";
      try { const p = new URL(u); nomor = p.pathname.replace(/\D/g, ""); teks = p.searchParams.get("text") || ""; } catch (e) { /* abaikan */ }
      catat("KIRIM_WA", `Membuka chat WhatsApp${nomor ? ` ke ${nomor}` : " (pilih kontak)"}: “${cuplikan(teks, 90)}”`, { nomor, pesan: cuplikan(teks, 400) });
    } else if (!u || u === "about:blank") {
      catat("CETAK", `Membuka jendela cetak dari ${konteks().modul}`);
    }
    return asliOpen.call(window, url, ...rest);
  };

  const asliPrint = window.print;
  window.print = function () { catat("CETAK", `Mencetak halaman ${konteks().modul}`); return asliPrint.call(window); };

  const clip = navigator.clipboard;
  const asliTulis = clip?.writeText?.bind(clip);
  if (asliTulis) clip.writeText = (teks) => { catat("SALIN", `Menyalin teks: “${cuplikan(teks, 90)}”`, { panjang: String(teks || "").length }); return asliTulis(teks); };

  return () => {
    HTMLAnchorElement.prototype.click = asliClick;
    EventTarget.prototype.dispatchEvent = asliDispatch;
    document.removeEventListener("click", klikDokumen, true);
    window.open = asliOpen;
    window.print = asliPrint;
    if (asliTulis) clip.writeText = asliTulis;
    window.__pelacakOutput = false;
  };
}
