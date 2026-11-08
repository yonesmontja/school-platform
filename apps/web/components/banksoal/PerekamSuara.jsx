"use client";
import { useEffect, useRef, useState } from "react";
import { srcGambar } from "./PratinjauSoal";
import { bacaBerkas, minta } from "./api";

const MAKS_DETIK = 180;
// Chrome/Android merekam webm, Safari/iPhone merekam mp4
const JENIS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
const fmt = (d) => `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;

/**
 * Rekam suara siswa membaca nyaring (tes online). Rekaman langsung diunggah setelah berhenti;
 * bila gagal (sinyal putus), rekaman disimpan di memori dan bisa dikirim ulang.
 */
export default function PerekamSuara({ idPaket, idButir, url, onTersimpan }) {
  const [tahap, setTahap] = useState("siap"); // siap | merekam | mengunggah | gagal
  const [detik, setDetik] = useState(0);
  const [pratinjau, setPratinjau] = useState(null); // object URL rekaman terakhir
  const [galat, setGalat] = useState(null);
  const perekam = useRef(null);
  const aliran = useRef(null);
  const potongan = useRef([]);
  const blob = useRef(null);
  const pewaktu = useRef(null);

  const lepasMikrofon = () => {
    clearInterval(pewaktu.current);
    aliran.current?.getTracks().forEach((t) => t.stop());
    aliran.current = null;
  };
  // Pindah soal saat merekam: rekaman dibuang dan mikrofon dilepas
  useEffect(() => () => {
    if (perekam.current?.state === "recording") { perekam.current.onstop = null; perekam.current.stop(); }
    lepasMikrofon();
  }, []);
  useEffect(() => () => { if (pratinjau) URL.revokeObjectURL(pratinjau); }, [pratinjau]);

  const unggah = async () => {
    if (!blob.current) return;
    setTahap("mengunggah"); setGalat(null);
    try {
      const data = await bacaBerkas(blob.current);
      const res = await minta("POST", `/ujian/${idPaket}/rekaman`, { id_butir: idButir, audio_base64: data });
      blob.current = null;
      onTersimpan(res.url, res.sisa_detik);
      setTahap("siap");
    } catch (err) { setGalat(err.message); setTahap("gagal"); }
  };

  const mulai = async () => {
    setGalat(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setGalat("HP atau browser ini tidak bisa merekam suara. Pakai Chrome atau Safari terbaru."); return;
    }
    try {
      aliran.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setGalat(err.name === "NotAllowedError" ? "Mikrofon belum diizinkan. Ketuk ikon gembok di alamat situs, izinkan Mikrofon, lalu coba lagi." : "Mikrofon tidak bisa dipakai. Tutup aplikasi lain yang memakai mikrofon, lalu coba lagi.");
      return;
    }
    const jenis = JENIS.find((j) => MediaRecorder.isTypeSupported?.(j));
    const r = new MediaRecorder(aliran.current, jenis ? { mimeType: jenis } : undefined);
    potongan.current = [];
    r.ondataavailable = (e) => { if (e.data.size) potongan.current.push(e.data); };
    r.onstop = () => {
      lepasMikrofon();
      blob.current = new Blob(potongan.current, { type: r.mimeType || jenis || "audio/webm" });
      setPratinjau(URL.createObjectURL(blob.current));
      unggah();
    };
    perekam.current = r;
    r.start(1000);
    setDetik(0);
    setTahap("merekam");
    const awal = Date.now();
    pewaktu.current = setInterval(() => {
      const d = Math.floor((Date.now() - awal) / 1000);
      setDetik(d);
      if (d >= MAKS_DETIK && r.state === "recording") r.stop();
    }, 250);
  };

  const berhenti = () => { if (perekam.current?.state === "recording") perekam.current.stop(); };

  return (
    <div className="perekam-suara border rounded-3 p-3 text-center bg-body-tertiary">
      {tahap === "merekam" ? (
        <>
          <div className="text-danger fw-semibold fs-5 mb-2"><span className="spinner-grow spinner-grow-sm me-2"></span>Merekam… {fmt(detik)}</div>
          <button type="button" className="btn btn-danger btn-lg" onClick={berhenti}><i className="bi bi-stop-fill me-1"></i>Selesai membaca</button>
          <div className="small text-muted mt-2">Rekaman berhenti sendiri setelah {MAKS_DETIK / 60} menit.</div>
        </>
      ) : (
        <>
          {(url || pratinjau) && (
            <div className="mb-2">
              <audio controls src={pratinjau || srcGambar(url)} className="w-100" aria-label="Rekaman bacaanmu" />
              {tahap === "siap" && url && <div className="small text-success"><i className="bi bi-cloud-check me-1"></i>Rekaman tersimpan</div>}
            </div>
          )}
          {tahap === "mengunggah" && <div className="small text-muted mb-2"><span className="spinner-border spinner-border-sm me-1"></span>Mengirim rekaman…</div>}
          {tahap === "gagal" && (
            <div className="alert alert-warning small py-2">
              Rekaman belum terkirim: {galat}
              <button type="button" className="btn btn-sm btn-warning ms-2" onClick={unggah}><i className="bi bi-arrow-repeat me-1"></i>Kirim lagi</button>
            </div>
          )}
          {tahap !== "gagal" && galat && <div className="alert alert-warning small py-2">{galat}</div>}
          <button type="button" className={`btn btn-lg ${url ? "btn-outline-danger" : "btn-danger"}`} onClick={mulai} disabled={tahap === "mengunggah"}>
            <i className="bi bi-mic-fill me-1"></i>{url || pratinjau ? "Rekam ulang" : "Mulai merekam"}
          </button>
          {!url && !pratinjau && <div className="small text-muted mt-2">Tekan Mulai merekam, bacakan teks dengan suara jelas, lalu tekan Selesai membaca.</div>}
        </>
      )}
    </div>
  );
}
