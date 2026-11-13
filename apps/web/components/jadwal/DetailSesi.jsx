"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RencanaSesi from "@/components/perangkatajar/RencanaSesi";
import { VideoTertaut } from "@/components/video/video";
import { minta } from "@/components/banksoal/api";

/** Video yang ditautkan langsung ke sesi ini (diputar di kelas lewat proyektor/HP). */
function VideoSesi({ jadwal, bolehUbah }) {
  const [data, setData] = useState([]);
  const muat = useCallback(() => minta("GET", `/video-belajar/tautan?jenis=JADWAL&id_target=${jadwal.id_jadwal}`).then((r) => setData(r.data)).catch(() => {}), [jadwal.id_jadwal]);
  useEffect(() => { muat(); }, [muat]);
  if (!bolehUbah && !data.length) return null;
  return (
    <div className="detail-row"><i className="bi bi-play-btn"></i><div className="min-w-0">
      <div className="small fw-semibold text-body-secondary mb-1">Video untuk sesi ini</div>
      <VideoTertaut jenis="JADWAL" idTarget={jadwal.id_jadwal} idMapel={jadwal.id_mapel} bisa={bolehUbah} data={data} onBerubah={muat} />
    </div></div>
  );
}
import { kelompokPerangkat } from "./perangkat";
import { STATUS_MAP, parseLokal, rentangJam, tanggalPanjang, targetStnkm, urlLampiran, judulSesi } from "@/app/dashboard/jadwal/_lib/jadwal";

const WARNA_DIM = { S: "primary", T: "success", N: "info", K: "warning", M: "danger" };

const Baris = ({ icon, children }) => (
  <div className="detail-row"><i className={`bi ${icon}`}></i><div className="min-w-0">{children}</div></div>
);

/**
 * Panel kanan detail sesi (mirip kartu acara Google Calendar) beserta aksi cepat.
 */
export default function DetailSesi({ jadwal, bolehUbah = true, onClose, onEdit, onDuplikat, onHapus, onStatus, onWA }) {
  if (!jadwal) return null;
  const mulai = parseLokal(jadwal.mulai);
  const selesai = parseLokal(jadwal.selesai);
  const target = targetStnkm(jadwal.materi);
  const lampiran = urlLampiran(jadwal.lampiran_url);

  return (
    <aside className="jadwal-detail" aria-label="Detail sesi">
      <div className="jadwal-detail-head" style={{ "--warna": jadwal.warna }}>
        <div className="d-flex justify-content-end gap-1">
          {bolehUbah && <button type="button" className="btn btn-icon-cal" onClick={onEdit} title="Ubah"><i className="bi bi-pencil"></i></button>}
          <button type="button" className="btn btn-icon-cal" onClick={onDuplikat} title="Duplikat"><i className="bi bi-copy"></i></button>
          {bolehUbah && <button type="button" className="btn btn-icon-cal" onClick={onHapus} title="Hapus"><i className="bi bi-trash"></i></button>}
          <button type="button" className="btn btn-icon-cal" onClick={onClose} title="Tutup (Esc)"><i className="bi bi-x-lg"></i></button>
        </div>
        <div className="d-flex gap-2 align-items-start mt-1">
          <span className="jadwal-detail-swatch"></span>
          <div className="min-w-0">
            <h5 className={`fw-bold mb-0${jadwal.status_sesi === "Batal" ? " text-decoration-line-through" : ""}`}>{judulSesi(jadwal)}</h5>
            {jadwal.materi?.nama_materi && <div className="small text-primary fw-semibold">{jadwal.materi.nama_materi}</div>}
            <div className="small text-body-secondary mt-1">{tanggalPanjang(mulai)} · {rentangJam(mulai, selesai)}</div>
            {jadwal.id_group && <div className="small text-body-secondary"><i className="bi bi-arrow-repeat me-1"></i>Bagian dari jadwal berulang</div>}
          </div>
        </div>
      </div>

      <div className="jadwal-detail-body">
        {/* Status berjalan sendiri mengikuti jam sesi; guru hanya membatalkan atau memulihkan */}
        <div className="jadwal-status-oto mb-3">
          <div className="d-flex align-items-center gap-2 min-w-0">
            <span className={`jadwal-status is-${(STATUS_MAP[jadwal.status_sesi] || STATUS_MAP.Menunggu).color} active m-0`}>
              <i className={`bi ${(STATUS_MAP[jadwal.status_sesi] || STATUS_MAP.Menunggu).icon}`}></i>{jadwal.status_sesi}
            </span>
            <small className="text-body-secondary">{jadwal.status_sesi === "Batal" ? "Dibatalkan guru" : "Otomatis mengikuti jam sesi"}</small>
          </div>
          {bolehUbah && (jadwal.status_sesi === "Batal"
            ? <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onStatus("Menunggu")}><i className="bi bi-arrow-counterclockwise me-1"></i>Pulihkan</button>
            : <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onStatus("Batal")}><i className="bi bi-x-circle me-1"></i>Batalkan</button>)}
        </div>
        {!bolehUbah && <div className="small text-body-secondary mb-3"><i className="bi bi-lock me-1"></i>Jadwal guru lain: hanya dapat dilihat.</div>}

        {jadwal.guru && <Baris icon="bi-person">{jadwal.guru.nama_guru}</Baris>}
        {(jadwal.kelas || jadwal.ruangan) && (
          <Baris icon="bi-geo-alt">{[jadwal.kelas?.nama_kelas, jadwal.ruangan?.nama_ruangan].filter(Boolean).join(" · ")}</Baris>
        )}
        {jadwal.id_modul && (
          <Baris icon="bi-journal-richtext">
            <div className="small fw-semibold text-body-secondary">Rencana dari modul ajar</div>
            <RencanaSesi idJadwal={jadwal.id_jadwal} />
          </Baris>
        )}
        {kelompokPerangkat(jadwal.perangkat).length > 0 && (
          <Baris icon="bi-diagram-3">
            <div className="small fw-semibold text-body-secondary mb-1">Perangkat ajar tertaut</div>
            {kelompokPerangkat(jadwal.perangkat).map((g) => (
              <div key={g.id} className="pa-detail-chips mb-1">
                {g.item.map((p) => (
                  <span key={p.id} className="pa-chip" style={{ "--pa": g.warna }} title={p.label}>
                    <i className={`bi ${g.ikon}`}></i><span className="pa-chip-jenis">{g.singkat || g.label}</span><span className="pa-chip-label">{p.label}</span>
                  </span>
                ))}
              </div>
            ))}
          </Baris>
        )}
        {jadwal.id_mapel && (
          <Baris icon="bi-bar-chart-steps">
            <Link href={`/dashboard/program-ajar?mapel=${encodeURIComponent(jadwal.id_mapel)}${jadwal.id_kelas ? `&kelas=${encodeURIComponent(jadwal.id_kelas)}` : ""}`} className="small">
              Lihat posisi sesi ini di Prota &amp; Promes
            </Link>
          </Baris>
        )}
        <VideoSesi jadwal={jadwal} bolehUbah={bolehUbah} />
        <Baris icon="bi-box-seam">
          <div className="small fw-semibold text-body-secondary">Persiapan & catatan</div>
          <div className="jadwal-note">{jadwal.catatan || <i className="text-body-secondary">Tidak ada catatan persiapan khusus.</i>}</div>
        </Baris>
        {lampiran && (
          <Baris icon="bi-paperclip">
            <a href={lampiran} target="_blank" rel="noopener noreferrer" className="text-truncate d-inline-block" style={{ maxWidth: "100%" }}>{jadwal.lampiran_nama || "Buka lampiran"}</a>
          </Baris>
        )}

        {target && (
          <div className="jadwal-stnkm">
            <div className="d-flex align-items-center mb-2"><i className="bi bi-list-check text-primary me-2"></i><span className="fw-semibold small">Target Observasi STNKM</span></div>
            <div className="d-flex flex-wrap gap-1 mb-2">
              {Object.entries(target.persen).map(([k, v]) => <span key={k} className={`badge text-bg-${WARNA_DIM[k]}`}>{k}: {v}%</span>)}
            </div>
            {target.todo.length ? target.todo.map((t) => (
              <div key={t.dim} className={`jadwal-todo is-${t.prioritas}`}>
                <div className="fw-semibold small">{t.judul}</div>
                <div className="text-body-secondary" style={{ fontSize: 12 }}>{t.saran}</div>
              </div>
            )) : <div className="small text-success"><i className="bi bi-check-circle me-1"></i>Seluruh bobot STNKM optimal. Lanjutkan penguatan materi.</div>}
          </div>
        )}

        <button type="button" className="btn btn-success w-100 fw-semibold mt-3" onClick={onWA}><i className="bi bi-whatsapp me-1"></i>Bagikan pengingat ke WA guru / grup</button>

        <div className="mt-3">
          <div className="small fw-semibold text-body-secondary mb-2"><i className="bi bi-lightning-charge text-warning me-1"></i>Aksi cepat sesi ini</div>
          <div className="d-grid gap-2">
            <Link href="/dashboard/presensi" className="btn btn-outline-secondary btn-sm text-start"><i className="bi bi-calendar-check me-2"></i>Isi presensi kelas</Link>
            <Link href="/dashboard/nilai" className="btn btn-outline-secondary btn-sm text-start"><i className="bi bi-pencil-square me-2"></i>Input nilai</Link>
            <Link href="/dashboard/jurnal" className="btn btn-outline-secondary btn-sm text-start"><i className="bi bi-journal-text me-2"></i>Tulis jurnal observasi</Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
