"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { minta } from "@/components/banksoal/api";
import { muatNotifikasi } from "@/app/lib/notifikasi";

const jamTanggal = (t) => {
  const d = new Date(t);
  const hariIni = new Date().toDateString() === d.toDateString();
  return hariIni ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Utas pesan satu siswa (wali kelas ↔ orang tua/siswa). Dipakai halaman Pesan staf, portal, dan dashboard pribadi.
 * Memuat ulang tiap 20 detik selama terbuka; membuka utas menandai pesan sudah dibaca.
 */
export default function UtasPesan({ idSiswa, tinggi = 420, onBerubah }) {
  const [data, setData] = useState(null);
  const [isi, setIsi] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState("");
  const bawahRef = useRef(null);
  const jumlahRef = useRef(0);

  const muat = useCallback(async () => {
    try {
      const r = await minta("GET", `/pesan/${encodeURIComponent(idSiswa)}`);
      setData(r); setGalat("");
      if (r.data.length !== jumlahRef.current) { jumlahRef.current = r.data.length; onBerubah?.(); muatNotifikasi?.(); }
    } catch (e) { setGalat(e.message); }
  }, [idSiswa, onBerubah]);

  useEffect(() => {
    setData(null); jumlahRef.current = 0; muat();
    const t = setInterval(() => { if (document.visibilityState === "visible") muat(); }, 20000);
    return () => clearInterval(t);
  }, [muat]);
  useEffect(() => { bawahRef.current?.scrollIntoView({ block: "end" }); }, [data?.data?.length]);

  const kirimPesan = async (e) => {
    e?.preventDefault();
    const teks = isi.trim();
    if (!teks) return;
    setKirim(true);
    try {
      const r = await minta("POST", `/pesan/${encodeURIComponent(idSiswa)}`, { isi: teks });
      setIsi("");
      setData((d) => ({ ...d, data: [...(d?.data || []), r.data] }));
      jumlahRef.current += 1;
      onBerubah?.();
    } catch (err) { setGalat(err.message); }
    finally { setKirim(false); }
  };

  if (galat && !data) return <div className="alert alert-warning small mb-0">{galat}</div>;
  if (!data) return <div className="text-body-secondary small p-3"><span className="spinner-border spinner-border-sm me-2"></span>Memuat pesan…</div>;

  return (
    <div className="d-flex flex-column" data-utas-pesan={data.siswa.nama_siswa}>
      <div className="small text-body-secondary mb-2">
        <i className="bi bi-shield-lock me-1"></i>Utas {data.siswa.nama_siswa} ({data.siswa.nama_kelas || "-"}) · wali kelas {data.wali_kelas || "-"}.
        Dibaca orang tua/wali, wali kelas, kepala sekolah, dan admin.
      </div>
      <div className="border rounded bg-body-tertiary p-2 overflow-auto" style={{ height: tinggi }}>
        {data.data.length === 0 && <div className="text-center text-body-secondary small py-5"><i className="bi bi-chat-dots fs-3 d-block mb-1"></i>Belum ada pesan. Tulis pesan pertama di bawah.</div>}
        {data.data.map((p) => (
          <div key={p.id} className={`d-flex mb-2 ${p.saya ? "justify-content-end" : ""}`} data-pesan={p.saya ? "saya" : "lain"}>
            <div className={`rounded-3 px-3 py-2 shadow-sm ${p.saya ? "bg-primary text-white" : "bg-body"}`} style={{ maxWidth: "80%" }}>
              {!p.saya && <div className="small fw-semibold text-primary">{p.pengirim} <span className="fw-normal text-body-secondary">· {p.peran}</span></div>}
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{p.isi}</div>
              <div className={`text-end ${p.saya ? "text-white-50" : "text-body-secondary"}`} style={{ fontSize: ".7rem" }}>{jamTanggal(p.pada)}</div>
            </div>
          </div>
        ))}
        <div ref={bawahRef}></div>
      </div>
      {galat && <div className="text-danger small mt-1">{galat}</div>}
      <form className="d-flex gap-2 mt-2" onSubmit={kirimPesan}>
        <textarea className="form-control" rows={2} maxLength={2000} placeholder="Tulis pesan…" value={isi} aria-label="Tulis pesan"
          onChange={(e) => setIsi(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) kirimPesan(e); }} />
        <button type="submit" className="btn btn-primary align-self-end" disabled={kirim || !isi.trim()} aria-label="Kirim pesan">
          {kirim ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-send"></i>}
        </button>
      </form>
      <div className="small text-body-secondary mt-1">Ctrl+Enter untuk mengirim. Pesan tersimpan sebagai arsip sekolah.</div>
    </div>
  );
}
