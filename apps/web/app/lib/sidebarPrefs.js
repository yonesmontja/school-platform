// Preferensi tampilan sidebar, disimpan per browser (localStorage)
export const SIDEBAR_PREF_EVENT = "sidebar-pref-change";
export const KEY_ACCORDION = "sidebar_accordion";

export const bacaAccordion = () => {
  try { return localStorage.getItem(KEY_ACCORDION) !== "false"; } catch (e) { return true; }
};

// Simpan lalu beri tahu sidebar yang sedang tampil agar langsung menyesuaikan
export const simpanAccordion = (aktif) => {
  try { localStorage.setItem(KEY_ACCORDION, JSON.stringify(aktif)); } catch (e) { /* storage diblokir */ }
  window.dispatchEvent(new Event(SIDEBAR_PREF_EVENT));
};
