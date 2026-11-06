// Dipakai bersama oleh root layout (server) dan themePrefs (client)
export const KEY_MODE = "app_theme_mode";
export const KEY_ACCENT = "app_accent";
export const KEY_GAYA = "app_gaya";

// Dijalankan di <head> sebelum halaman tampil agar tidak berkedip terang → gelap
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${KEY_MODE}')||'light';var a=localStorage.getItem('${KEY_ACCENT}')||'biru';var g=localStorage.getItem('${KEY_GAYA}')==='klasik'?'klasik':'tabler';
if(m==='auto'){m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
var d=document.documentElement;d.setAttribute('data-bs-theme',m);d.setAttribute('data-accent',a);d.setAttribute('data-gaya',g);}catch(e){}})();`;
