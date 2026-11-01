// Dipakai bersama oleh root layout (server) dan themePrefs (client)
export const KEY_MODE = "app_theme_mode";
export const KEY_ACCENT = "app_accent";

// Dijalankan di <head> sebelum halaman tampil agar tidak berkedip terang → gelap
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${KEY_MODE}')||'light';var a=localStorage.getItem('${KEY_ACCENT}')||'biru';
if(m==='auto'){m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
var d=document.documentElement;d.setAttribute('data-bs-theme',m);d.setAttribute('data-accent',a);}catch(e){}})();`;
