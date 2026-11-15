"use client";
// Editor catatan kaya yang bisa dipakai menu lain: format dasar, daftar, daftar centang (checklist), tautan,
// foto (pilih berkas atau langsung dari kamera HP), video, "Sisipkan data" dari sumber yang diberikan induk, dan tombol AI.
// Nilai berupa HTML; server membersihkannya lagi (App\Support\HtmlAman) sebelum disimpan.
import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { API_URL } from "@/app/lib/config";

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const MAKS_VIDEO = 45 * 1024 * 1024;

/** HTML catatan → teks polos (daftar centang [x]/[ ], daftar "- ", foto/video ditandai). Selaras dengan HtmlAman::teks. */
export function teksDariHtml(html) {
  if (!html) return "";
  if (!/<[a-z][^>]*>/i.test(html) || typeof DOMParser === "undefined") return String(html).trim();
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const baris = [];
  const jalan = (n, awalan = "") => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { if (c.textContent.trim()) baris.push(awalan + c.textContent.replace(/\s+/g, " ").trim()); continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.tagName.toLowerCase();
      if (tag === "li") {
        const cek = c.parentElement?.classList.contains("cek") ? (c.getAttribute("data-cek") === "1" ? "[x] " : "[ ] ") : c.parentElement?.tagName === "OL" ? `${[...c.parentElement.children].indexOf(c) + 1}. ` : "- ";
        baris.push(cek + c.textContent.replace(/\s+/g, " ").trim());
      } else if (tag === "img") baris.push("[foto]");
      else if (tag === "video") baris.push("[video]");
      else if (tag === "tr") baris.push([...c.children].map((td) => td.textContent.trim()).join(" | "));
      else if (["p", "h3", "h4", "blockquote", "div", "span", "strong", "b", "em", "i", "u", "s", "a"].includes(tag) && !c.querySelector("li, img, video, tr, p")) {
        const t = c.textContent.replace(/\s+/g, " ").trim();
        if (t) baris.push(awalan + t);
      } else jalan(c, awalan);
    }
  };
  jalan(doc.body.firstChild);
  return baris.join("\n").trim();
}

/** Perkecil foto di browser (sisi terpanjang 1600 px, JPEG) agar hemat kuota internet sekolah. GIF dikirim apa adanya. */
export async function kecilkanFoto(file, maks = 1600) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const skala = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    if (skala === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.round(bmp.width * skala); kanvas.height = Math.round(bmp.height * skala);
    kanvas.getContext("2d").drawImage(bmp, 0, 0, kanvas.width, kanvas.height);
    const blob = await new Promise((ok) => kanvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch (e) { return file; }
}

/** Unggah satu foto/video ke /lampiran dengan kemajuan (0–100). @returns {Promise<{url, jenis, nama}>} */
export function unggahLampiran(file, entitas, onKemajuan) {
  return new Promise((ok, gagal) => {
    const fd = new FormData();
    fd.append("berkas", file); fd.append("entitas", entitas);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/lampiran`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onKemajuan?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let j = {};
      try { j = JSON.parse(xhr.responseText); } catch (e) { /* abaikan */ }
      if (xhr.status >= 200 && xhr.status < 300) ok(j.data);
      else gagal(new Error((j.errors && Object.values(j.errors)[0]?.[0]) || j.message || (xhr.status === 413 ? "Berkas terlalu besar." : "Unggahan gagal.")));
    };
    xhr.onerror = () => gagal(new Error("Koneksi terputus saat mengunggah."));
    xhr.send(fd);
  });
}

const ALAT = [
  { cmd: "bold", ikon: "bi-type-bold", label: "Tebal" },
  { cmd: "italic", ikon: "bi-type-italic", label: "Miring" },
  { cmd: "underline", ikon: "bi-type-underline", label: "Garis bawah" },
  { cmd: "formatBlock", arg: "h4", ikon: "bi-type-h3", label: "Subjudul" },
  { pisah: true },
  { cmd: "insertUnorderedList", ikon: "bi-list-ul", label: "Daftar berbutir" },
  { cmd: "insertOrderedList", ikon: "bi-list-ol", label: "Daftar bernomor" },
  { cmd: "cek", ikon: "bi-check2-square", label: "Daftar centang (checklist)" },
  { cmd: "formatBlock", arg: "blockquote", ikon: "bi-quote", label: "Kutipan" },
  { cmd: "link", ikon: "bi-link-45deg", label: "Tautan" },
  { cmd: "removeFormat", ikon: "bi-eraser", label: "Hapus format" },
];

/**
 * props: value (HTML), onChange(html), label (nama untuk pembaca layar), placeholder, entitas ('pembinaan' | 'jurnal'),
 *        sisipan: [{ label, keterangan?, ikon?, html: () => string | Promise<string> }], onAi?: () => void, aiSibuk?
 */
export default function EditorKaya({ value, onChange, label, placeholder, entitas, sisipan = [], onAi, aiSibuk = false, labelAi = "Bantu AI" }) {
  const tulis = useRef(null);
  const terakhir = useRef(null);  // HTML terakhir yang dikirim ke induk (cegah kursor melompat)
  const rentang = useRef(null);   // posisi kursor terakhir di dalam editor
  const masukan = { foto: useRef(null), kamera: useRef(null), video: useRef(null), rekam: useRef(null) };
  const [menu, setMenu] = useState(null); // 'media' | 'data'
  const [unggah, setUnggah] = useState(null); // { nama, persen }

  useEffect(() => {
    if (tulis.current && value !== terakhir.current) { tulis.current.innerHTML = value || ""; terakhir.current = value; }
  }, [value]);

  useEffect(() => {
    const simpan = () => {
      const sel = window.getSelection();
      if (sel?.rangeCount && tulis.current?.contains(sel.anchorNode)) rentang.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", simpan);
    return () => document.removeEventListener("selectionchange", simpan);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const tutup = (e) => { if (!e.target.closest?.(".editor-kaya-menu, [data-buka-menu]")) setMenu(null); };
    document.addEventListener("mousedown", tutup);
    return () => document.removeEventListener("mousedown", tutup);
  }, [menu]);

  const kirim = () => {
    const el = tulis.current;
    if (!el) return;
    el.querySelectorAll("ul.cek > li:not([data-cek])").forEach((li) => li.setAttribute("data-cek", "0"));
    const html = el.innerHTML.replace(/^(<br>|<p><br><\/p>)$/, "");
    terakhir.current = html;
    onChange(html);
  };

  const pulihkan = () => {
    const el = tulis.current;
    el.focus();
    const sel = window.getSelection();
    if (rentang.current && el.contains(rentang.current.startContainer)) { sel.removeAllRanges(); sel.addRange(rentang.current); }
    else { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  };

  const sisipkanHtml = (html) => {
    pulihkan();
    document.execCommand("insertHTML", false, html);
    kirim();
  };

  const ulAktif = () => {
    let n = window.getSelection()?.anchorNode;
    while (n && n !== tulis.current) { if (n.nodeName === "UL") return n; n = n.parentNode; }
    return null;
  };

  const jalankan = async (a) => {
    pulihkan();
    if (a.cmd === "link") {
      const r = rentang.current?.cloneRange();
      const { value: url } = await Swal.fire({ title: "Sisipkan tautan", input: "url", inputPlaceholder: "https://…", showCancelButton: true, confirmButtonText: "Sisipkan", cancelButtonText: "Batal" });
      if (!url) return;
      rentang.current = r; pulihkan();
      if (window.getSelection().isCollapsed) document.execCommand("insertHTML", false, `<a href="${esc(url)}">${esc(url)}</a>`);
      else document.execCommand("createLink", false, url);
    } else if (a.cmd === "cek") {
      const ul = ulAktif();
      if (ul?.classList.contains("cek")) {
        ul.classList.remove("cek"); ul.removeAttribute("class");
        ul.querySelectorAll("li").forEach((li) => li.removeAttribute("data-cek"));
      } else {
        if (!ul) document.execCommand("insertUnorderedList");
        const baru = ulAktif();
        if (baru) { baru.className = "cek"; baru.querySelectorAll("li").forEach((li) => li.setAttribute("data-cek", li.getAttribute("data-cek") === "1" ? "1" : "0")); }
      }
    } else if (a.cmd === "formatBlock") {
      // Tekan lagi untuk kembali ke paragraf biasa
      const sekarang = document.queryCommandValue("formatBlock")?.toLowerCase();
      document.execCommand("formatBlock", false, sekarang === a.arg ? "p" : a.arg);
    } else {
      document.execCommand(a.cmd, false, a.arg);
    }
    kirim();
  };

  // Klik kotak centang (area kiri butir) → centang/hapus centang
  const klik = (e) => {
    const li = e.target.closest?.("ul.cek > li");
    if (!li || !tulis.current.contains(li)) return;
    const kiri = e.clientX - li.getBoundingClientRect().left;
    if (kiri <= 22) { e.preventDefault(); li.setAttribute("data-cek", li.getAttribute("data-cek") === "1" ? "0" : "1"); kirim(); }
  };

  const tombol = (e) => {
    // Butir centang baru (Enter) selalu belum dicentang
    if (e.key === "Enter") setTimeout(() => {
      let n = window.getSelection()?.anchorNode;
      while (n && n !== tulis.current && n.nodeName !== "LI") n = n.parentNode;
      if (n?.nodeName === "LI" && n.parentNode?.classList?.contains("cek") && !n.textContent.trim()) { n.setAttribute("data-cek", "0"); kirim(); }
    }, 0);
  };

  const unggahBerkas = async (files) => {
    for (const asli of Array.from(files || [])) {
      const video = asli.type.startsWith("video/");
      if (!video && !asli.type.startsWith("image/")) { Swal.fire("Berkas tidak didukung", "Sisipkan foto atau video.", "warning"); continue; }
      if (video && asli.size > MAKS_VIDEO) { Swal.fire("Video terlalu besar", "Ukuran video maksimal 45 MB. Rekam lebih singkat atau kecilkan kualitasnya.", "warning"); continue; }
      const file = video ? asli : await kecilkanFoto(asli);
      setUnggah({ nama: asli.name || (video ? "video" : "foto"), persen: 0 });
      try {
        const d = await unggahLampiran(file, entitas, (persen) => setUnggah((u) => u && { ...u, persen }));
        sisipkanHtml(video
          ? `<figure><video src="${esc(d.url)}" controls preload="metadata"></video></figure><p><br></p>`
          : `<figure><img src="${esc(d.url)}" alt="${esc(asli.name || "foto")}"></figure><p><br></p>`);
      } catch (err) { Swal.fire("Unggahan gagal", err.message, "error"); }
      finally { setUnggah(null); }
    }
  };

  const tempel = (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => /^(image|video)\//.test(f.type));
    e.preventDefault();
    if (files.length) return unggahBerkas(files);
    // Teks tempelan dari Word/web dijadikan teks polos agar format tetap rapi
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    kirim();
  };

  const pilihSisipan = async (s) => {
    setMenu(null);
    try {
      const html = await s.html();
      if (html) sisipkanHtml(html);
      else Swal.fire({ toast: true, position: "top-end", icon: "info", title: "Belum ada data untuk disisipkan", showConfirmButton: false, timer: 2000 });
    } catch (err) { Swal.fire("Gagal mengambil data", err.message, "error"); }
  };

  const tahan = (e) => e.preventDefault(); // tombol alat tidak mencuri kursor dari editor

  return (
    <div className="editor-kaya">
      <div className="editor-kaya-alat" role="toolbar" aria-label={`Alat ${label}`}>
        {ALAT.map((a, i) => a.pisah ? <span key={i} className="pemisah" /> : (
          <button key={a.label} type="button" className="btn btn-sm btn-light" title={a.label} aria-label={a.label} onMouseDown={tahan} onClick={() => jalankan(a)}><i className={`bi ${a.ikon}`}></i></button>
        ))}
        <span className="pemisah" />
        <button type="button" className="btn btn-sm btn-light" data-buka-menu onMouseDown={tahan} onClick={() => setMenu(menu === "media" ? null : "media")} aria-haspopup="menu" aria-expanded={menu === "media"} title="Foto & video">
          <i className="bi bi-camera me-1"></i><span className="d-none d-sm-inline">Foto/Video</span>
        </button>
        {sisipan.length > 0 && (
          <button type="button" className="btn btn-sm btn-light" data-buka-menu onMouseDown={tahan} onClick={() => setMenu(menu === "data" ? null : "data")} aria-haspopup="menu" aria-expanded={menu === "data"} title="Sisipkan data terkait">
            <i className="bi bi-database-add me-1"></i><span className="d-none d-sm-inline">Sisipkan data</span>
          </button>
        )}
        {onAi && (
          <button type="button" className="btn btn-sm btn-outline-primary ms-auto" onMouseDown={tahan} onClick={onAi} disabled={aiSibuk}>
            {aiSibuk ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-stars me-1"></i>}{labelAi}
          </button>
        )}
        {menu === "media" && (
          <div className="editor-kaya-menu" role="menu" style={{ left: 4 }}>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); masukan.kamera.current.click(); }}><i className="bi bi-camera me-2"></i>Ambil foto dengan kamera<small>Di HP membuka kamera langsung</small></button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); masukan.foto.current.click(); }}><i className="bi bi-image me-2"></i>Pilih foto/gambar<small>JPG, PNG, WEBP, GIF; diperkecil otomatis</small></button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); masukan.rekam.current.click(); }}><i className="bi bi-camera-video me-2"></i>Rekam video<small>Di HP membuka perekam video</small></button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); masukan.video.current.click(); }}><i className="bi bi-film me-2"></i>Pilih video<small>MP4, WEBM, MOV, 3GP; maks. 45 MB</small></button>
          </div>
        )}
        {menu === "data" && (
          <div className="editor-kaya-menu" role="menu" style={{ right: 4 }}>
            {sisipan.map((s) => (
              <button key={s.label} type="button" role="menuitem" onClick={() => pilihSisipan(s)}><i className={`bi ${s.ikon || "bi-plus-square"} me-2`}></i>{s.label}{s.keterangan && <small>{s.keterangan}</small>}</button>
            ))}
          </div>
        )}
      </div>
      <div ref={tulis} className="editor-kaya-tulis isi-kaya" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
        data-placeholder={placeholder} onInput={kirim} onBlur={kirim} onClick={klik} onKeyDown={tombol} onPaste={tempel}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); unggahBerkas(e.dataTransfer.files); } }} />
      {unggah && (
        <div className="editor-kaya-unggah" role="status">
          <span className="spinner-border spinner-border-sm me-2"></span>Mengunggah {unggah.nama}… {unggah.persen}%
          <div className="progress mt-1" style={{ height: 4 }}><div className="progress-bar" style={{ width: `${unggah.persen}%` }}></div></div>
        </div>
      )}
      <input ref={masukan.kamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { unggahBerkas(e.target.files); e.target.value = ""; }} aria-label="Ambil foto dengan kamera" />
      <input ref={masukan.foto} type="file" accept="image/*" multiple hidden onChange={(e) => { unggahBerkas(e.target.files); e.target.value = ""; }} aria-label="Pilih foto" />
      <input ref={masukan.rekam} type="file" accept="video/*" capture="environment" hidden onChange={(e) => { unggahBerkas(e.target.files); e.target.value = ""; }} aria-label="Rekam video" />
      <input ref={masukan.video} type="file" accept="video/*" hidden onChange={(e) => { unggahBerkas(e.target.files); e.target.value = ""; }} aria-label="Pilih video" />
    </div>
  );
}
