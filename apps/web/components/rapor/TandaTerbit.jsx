"use client";
// Blok keaslian di rapor resmi: QR ke halaman verifikasi publik + keterangan tanda tangan elektronik.
import { useEffect, useState } from "react";
import QRCode from "qrcode";

const waktu = (v) => (v ? new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "");

export const tautanVerifikasiRapor = (kode) => `${typeof window !== "undefined" ? window.location.origin : ""}/verifikasi/rapor/${kode}`;

export default function TandaTerbit({ terbit }) {
  const [svg, setSvg] = useState("");
  const tautan = terbit ? tautanVerifikasiRapor(terbit.kode_verifikasi) : "";
  useEffect(() => {
    if (!tautan) return;
    let batal = false;
    QRCode.toString(tautan, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then((s) => { if (!batal) setSvg(s); }).catch(() => {});
    return () => { batal = true; };
  }, [tautan]);
  if (!terbit) return null;
  return (
    <table className="rp-terbit"><tbody><tr>
      <td style={{ width: 66 }}><div className="rp-terbit-qr" dangerouslySetInnerHTML={{ __html: svg }} /></td>
      <td>
        Rapor resmi ini ditandatangani secara elektronik oleh Wali Kelas <b>{terbit.nama_wali || "-"}</b> pada {waktu(terbit.diterbitkan_pada)}
        {terbit.disahkan_pada ? <> dan disahkan Kepala Sekolah <b>{terbit.nama_kepsek}</b> pada {waktu(terbit.disahkan_pada)}</> : null}.
        {" "}Pindai QR atau buka <span className="rp-terbit-url">{tautan}</span> untuk memeriksa keaslian dan isinya.
        {" "}Kode: <b>{terbit.kode_verifikasi}</b>{terbit.versi > 1 ? ` (versi ${terbit.versi})` : ""}.
      </td>
    </tr></tbody></table>
  );
}
