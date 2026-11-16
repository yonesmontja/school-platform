"use client";
import { useState } from "react";
import Swal from "sweetalert2";
import { minta } from "@/components/banksoal/api";

export const HARI_SLOT = [[1, "Senin"], [2, "Selasa"], [3, "Rabu"], [4, "Kamis"], [5, "Jumat"], [6, "Sabtu"]];
const ULANG = [["MINGGUAN", "Tiap minggu"], ["GANJIL", "Minggu ganjil"], ["GENAP", "Minggu genap"]];
export const FREKUENSI = [["PILIH", "Hari pilihan"], ["HARIAN", "Setiap hari"], ["DUA_MINGGU", "Dua minggu sekali"]];
const idAcak = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const menit = (j) => { const [h, m] = String(j || "0:0").split(":").map(Number); return h * 60 + m; };

/** JP per minggu (rata-rata) tiap mapel dari slot; slot minggu ganjil/genap dihitung setengah. */
export function jpDariSlot(pola) {
  const jp = Math.max(20, Number(pola?.menit_jp) || 35);
  const hasil = {};
  for (const s of pola?.slot || []) {
    if (!s.id_mapel) continue;
    const n = (menit(s.selesai) - menit(s.mulai)) / jp;
    hasil[s.id_mapel] = (hasil[s.id_mapel] || 0) + (s.ulang === "MINGGUAN" ? n : n / 2);
  }
  return Object.fromEntries(Object.entries(hasil).map(([k, v]) => [k, Math.round(v * 10) / 10]));
}
export const targetJp = (c) => (c.frekuensi === "DUA_MINGGU" ? (Number(c.jp_minggu) || 0) / 2 : Number(c.jp_minggu) || 0);

/**
 * Pola mingguan terstruktur (slot jam per hari & mapel) yang menggerakkan Jadwal kelas: susun dari JP per minggu atau dari teks
 * rekomendasi, Buat Jadwal, status sinkron & batas perubahan, riwayat perubahan, buka kunci. Guru melihat saja.
 */
export default function PolaJadwalTema({ id, p, ubah, bisa, kotor, simpan, proses, setProses, terima, rekomendasiPola, ambilPola, Teks, HARI }) {
  const [riwayat, setRiwayat] = useState(false);
  const pola = p.pola_slot || { menit_jp: 35, jam_masuk: "07:30", jam_pulang: "12:30", slot: [] };
  const slot = pola.slot || [];
  const cabang = p.jaring.mapel.filter((c) => c.id_mapel);
  const nama = Object.fromEntries(cabang.map((c) => [c.id_mapel, c.nama]));
  const jp = jpDariSlot(pola);
  const adaJadwal = !!p.jadwal_dibuat_pada;
  const kunci = p.terkunci;
  const batas = p.batas_perubahan || 3;
  const bisaSlot = bisa && !(adaJadwal && kunci);

  const ubahPola = (patch) => ubah({ pola_slot: { ...pola, ...patch } });
  const ubahSlot = (i, patch) => ubahPola({ slot: slot.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const tambahSlot = () => {
    const akhir = slot[slot.length - 1];
    const mulai = akhir?.selesai || pola.jam_masuk || "07:30";
    const [h, m] = mulai.split(":").map(Number);
    const t = h * 60 + m + 2 * (pola.menit_jp || 35);
    ubahPola({ slot: [...slot, { id: idAcak(), hari: akhir?.hari || 1, mulai, selesai: `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, id_mapel: cabang[0]?.id_mapel || null, kegiatan: "", ulang: "MINGGUAN" }] });
  };

  const susunSlot = async (sumber) => {
    if (sumber === "teks" && !HARI.some(([k]) => String(p.pola?.[k] || "").trim())) {
      return Swal.fire("Teks pola masih kosong", "Tekan Rekomendasi AI atau Ambil dari Jadwal dulu, lalu jadikan slot.", "info");
    }
    const r = await Swal.fire({
      title: sumber === "jp" ? "Susun slot dari JP per minggu" : "Jadikan slot dari teks pola",
      width: 520,
      html: `<div class="small text-start">${sumber === "jp"
        ? "JP per minggu tiap cabang dibagi ke hari yang mengikuti pola (setiap hari, hari pilihan, atau dua minggu sekali), blok 2 JP, istirahat 30 menit setelah 09:30."
        : "Baris berawalan jam (mis. <code>08:05 Matematika: …</code>) dijadikan slot; nama mapel dicocokkan ke cabang spider web, baris lain menjadi kegiatan kelas."}`
        + `${slot.length ? " <b>Slot sekarang akan diganti</b> (belum tersimpan sampai Anda menekan Simpan)." : ""}</div>`
        + `<div class="row g-2 mt-2 text-start">`
        + `<div class="col-4"><label class="form-label small mb-0" for="slMasuk">Jam masuk</label><input id="slMasuk" type="time" class="form-control form-control-sm" value="${pola.jam_masuk || "07:30"}"></div>`
        + `<div class="col-4"><label class="form-label small mb-0" for="slPulang">Jam pulang</label><input id="slPulang" type="time" class="form-control form-control-sm" value="${pola.jam_pulang || "12:30"}"></div>`
        + `<div class="col-4"><label class="form-label small mb-0" for="slJp">Menit per JP</label><input id="slJp" type="number" min="20" max="60" class="form-control form-control-sm" value="${pola.menit_jp || 35}"></div></div>`
        + (sumber === "jp" ? `<div class="form-check text-start mt-2"><input class="form-check-input" type="checkbox" id="slSabtu"><label class="form-check-label small" for="slSabtu">"Setiap hari" termasuk Sabtu</label></div>` : ""),
      showCancelButton: true, confirmButtonText: "Susun slot", cancelButtonText: "Batal",
      preConfirm: () => {
        const v = (x) => document.getElementById(x);
        if (v("slMasuk").value >= v("slPulang").value) { Swal.showValidationMessage("Jam pulang harus setelah jam masuk."); return false; }
        return { jam_masuk: v("slMasuk").value, jam_pulang: v("slPulang").value, menit_jp: Number(v("slJp").value) || 35, sabtu: !!v("slSabtu")?.checked };
      },
    });
    if (!r.isConfirmed) return;
    setProses("slot");
    try {
      const h = await minta("POST", `/perangkat-ajar/tema/${id}/slot`, { sumber, ...r.value, jaring: p.jaring, pola: p.pola });
      ubah({ pola_slot: h.data });
      Swal.fire({ icon: h.tidak_muat?.length ? "warning" : "success", title: "Slot pola siap", html: `${esc(h.message)}${h.tidak_muat?.length ? `<div class="small text-start mt-2">Tidak muat: ${h.tidak_muat.map(esc).join("; ")}</div>` : ""}` });
    } catch (err) { Swal.fire("Belum bisa", err.message, "warning"); }
    finally { setProses(null); }
  };

  const buatJadwal = async () => {
    if (kotor && !(await simpan())) return;
    setProses("jadwal");
    let pr;
    try { pr = await minta("GET", `/perangkat-ajar/tema/${id}/jadwal`); } catch (err) { setProses(null); return Swal.fire("Belum bisa", err.message, "warning"); }
    setProses(null);
    const r = pr.ringkasan || {};
    const bentrok = pr.sesi.filter((s) => s.status === "BENTROK");
    const ok = await Swal.fire({
      title: adaJadwal ? "Lengkapi jadwal tema" : "Buat jadwal dari pola mingguan",
      width: 620,
      html: `<div class="text-start small">`
        + `<div class="d-flex flex-wrap gap-2 mb-2"><span class="badge text-bg-success">${r.BARU || 0} sesi baru</span><span class="badge text-bg-danger">${r.BENTROK || 0} bentrok (dilewati)</span><span class="badge text-bg-secondary">${r.SUDAH_ADA || 0} sudah ada</span></div>`
        + `<div>${p.jumlah_minggu} minggu mulai ${esc(p.tanggal_mulai)}, kelas ${esc(p.kelas?.nama_kelas || "")}. Sesi tertaut ke peta tema & TP cabang, sehingga terhitung di Promes/Prota. Guru menerima sesi ini di Jadwal.</div>`
        + (pr.jadwal_manual ? `<div class="alert alert-warning py-1 px-2 mt-2 mb-0">Kelas ini sudah punya <b>${pr.jadwal_manual}</b> sesi manual di rentang tema; slot yang bentrok tidak dibuat.</div>` : "")
        + (pr.tanpa_guru?.length ? `<div class="text-danger mt-1">Belum ada guru pengampu/wali kelas: ${pr.tanpa_guru.map(esc).join(", ")}.</div>` : "")
        + (pr.libur?.length ? `<div class="text-muted mt-1">Hari libur dilewati: ${pr.libur.map(esc).join(", ")}.</div>` : "")
        + (bentrok.length ? `<ul class="mt-2 mb-0 ps-3">${bentrok.slice(0, 8).map((s) => `<li>${esc(s.tanggal)} ${esc(s.mulai)} ${esc(s.mapel)}: ${esc(s.keterangan)}</li>`).join("")}${bentrok.length > 8 ? `<li>… ${bentrok.length - 8} lagi</li>` : ""}</ul>` : "")
        + `</div>`,
      showCancelButton: true, confirmButtonText: `Buat ${r.BARU || 0} sesi`, cancelButtonText: "Batal",
      showConfirmButton: (r.BARU || 0) > 0,
    });
    if (!ok.isConfirmed) return;
    setProses("jadwal");
    try {
      const h = await minta("POST", `/perangkat-ajar/tema/${id}/jadwal`, {});
      terima(h.data);
      Swal.fire({ icon: "success", title: "Jadwal tema dibuat", text: h.message });
    } catch (err) { Swal.fire("Gagal", err.message, "error"); }
    finally { setProses(null); }
  };

  const bukaKunci = async () => {
    const r = await Swal.fire({ title: "Buka kunci pola?", input: "text", inputLabel: "Alasan (tercatat di riwayat)", inputValidator: (v) => (!v?.trim() ? "Tulis alasannya." : undefined),
      text: `Pola boleh diubah lagi ${batas} kali, oleh kepala sekolah di sini maupun oleh guru lewat Jadwal.`, showCancelButton: true, confirmButtonText: "Buka kunci", cancelButtonText: "Batal" });
    if (!r.isConfirmed) return;
    try { const h = await minta("POST", `/perangkat-ajar/tema/${id}/buka-kunci`, { alasan: r.value }); terima(h.data); Swal.fire({ icon: "success", title: h.message, timer: 2500, showConfirmButton: false }); }
    catch (err) { Swal.fire("Gagal", err.message, "error"); }
  };

  const riwayatPola = p.riwayat_pola || [];
  return (
    <div className="card shadow-sm mb-3" data-pola-jadwal>
      <div className="card-header fw-semibold d-flex flex-wrap align-items-center gap-2">
        <span><i className="bi bi-clock me-1 text-primary"></i>Pola mingguan & jadwal tema</span>
        {adaJadwal && <span className="badge text-bg-primary fw-normal" data-jadwal-tema><i className="bi bi-calendar-check me-1"></i>{p.jumlah_sesi_jadwal} sesi di Jadwal</span>}
        {adaJadwal && <span className={`badge fw-normal ${kunci ? "text-bg-danger" : "text-bg-light border"}`} data-perubahan>{kunci ? <><i className="bi bi-lock-fill me-1"></i>Terkunci</> : <>Perubahan {p.jumlah_perubahan || 0}/{batas}</>}</span>}
        {bisa && (
          <div className="ms-auto d-flex flex-wrap gap-2">
            {p.id_kelas && <button className="btn btn-sm btn-outline-primary" onClick={ambilPola} disabled={!!proses || !bisaSlot}><i className="bi bi-calendar3 me-1"></i>Ambil dari Jadwal</button>}
            <button className="btn btn-sm btn-outline-success" onClick={rekomendasiPola} disabled={!!proses || !bisaSlot} title="Untuk kelas yang jadwalnya belum disusun atau masih kosong"><i className="bi bi-stars me-1"></i>Rekomendasi AI</button>
            <div className="dropdown">
              <button className="btn btn-sm btn-outline-primary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" disabled={!!proses || !bisaSlot}><i className="bi bi-grid-3x3-gap me-1"></i>Susun slot</button>
              <ul className="dropdown-menu dropdown-menu-end">
                <li><button className="dropdown-item" onClick={() => susunSlot("jp")}><i className="bi bi-123 me-2"></i>Dari JP per minggu tiap mapel</button></li>
                <li><button className="dropdown-item" onClick={() => susunSlot("teks")}><i className="bi bi-text-left me-2"></i>Dari teks pola (hasil Rekomendasi AI)</button></li>
              </ul>
            </div>
            {p.status === "DISETUJUI" && <button className="btn btn-sm btn-primary" onClick={buatJadwal} disabled={!!proses || !slot.some((s) => s.id_mapel)}><i className="bi bi-calendar-plus me-1"></i>{adaJadwal ? "Lengkapi Jadwal" : "Buat Jadwal"}</button>}
            {adaJadwal && kunci && <button className="btn btn-sm btn-outline-danger" onClick={bukaKunci}><i className="bi bi-unlock me-1"></i>Buka kunci</button>}
          </div>
        )}
      </div>
      <div className="card-body">
        {!bisa && <div className="small text-muted mb-2"><i className="bi bi-info-circle me-1"></i>Pola ini ditetapkan kepala sekolah. Sesi tema muncul di Jadwal Anda; menggeser satu rangkaian sesi di Jadwal ikut mengubah pola ini dan dihitung sebagai perubahan (maks. {batas} kali).</div>}
        {bisa && p.status !== "DISETUJUI" && <div className="small text-muted mb-2"><i className="bi bi-info-circle me-1"></i>Tetapkan peta tema dulu, lalu <b>Buat Jadwal</b> untuk menjadikan slot ini sesi di Jadwal kelas.</div>}
        {adaJadwal && kunci && <div className="alert alert-danger py-1 px-2 small"><i className="bi bi-lock-fill me-1"></i>Pola sudah diubah {batas} kali sejak jadwal dibuat. Guru tidak bisa lagi menggeser sesi tema; kepala sekolah bisa membuka kunci.</div>}

        {/* JP per minggu tiap mapel: target cabang vs pola */}
        {cabang.length > 0 && (
          <div className="d-flex flex-wrap gap-1 mb-2" aria-label="JP per minggu tiap mapel">
            {cabang.map((c) => {
              const t = targetJp(c);
              const ada = jp[c.id_mapel] || 0;
              const pas = !t || Math.abs(t - ada) < 0.5;
              return <span key={c.id} className={`badge fw-normal border ${pas ? "text-bg-light" : "text-bg-warning"}`} data-jp-mapel={c.id_mapel}>{c.nama}: {ada}{t ? ` / ${t}` : ""} JP</span>;
            })}
          </div>
        )}

        {slot.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-2 pt-slot">
              <thead><tr><th style={{ minWidth: 110 }}>Hari</th><th>Mulai</th><th>Selesai</th><th style={{ minWidth: 170 }}>Mapel</th><th style={{ minWidth: 200 }}>Kegiatan</th><th style={{ minWidth: 130 }}>Ulang</th>{bisaSlot && <th></th>}</tr></thead>
              <tbody>
                {slot.map((s, i) => (
                  <tr key={s.id} className={i > 0 && slot[i - 1].hari !== s.hari ? "border-top border-2" : ""}>
                    <td><select className="form-select form-select-sm" aria-label={`Hari slot ${i + 1}`} disabled={!bisaSlot} value={s.hari} onChange={(e) => ubahSlot(i, { hari: Number(e.target.value) })}>{HARI_SLOT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                    <td><input type="time" className="form-control form-control-sm" aria-label={`Jam mulai slot ${i + 1}`} disabled={!bisaSlot} value={s.mulai} onChange={(e) => ubahSlot(i, { mulai: e.target.value })} /></td>
                    <td><input type="time" className="form-control form-control-sm" aria-label={`Jam selesai slot ${i + 1}`} disabled={!bisaSlot} value={s.selesai} onChange={(e) => ubahSlot(i, { selesai: e.target.value })} /></td>
                    <td><select className="form-select form-select-sm" aria-label={`Mapel slot ${i + 1}`} disabled={!bisaSlot} value={s.id_mapel || ""} onChange={(e) => ubahSlot(i, { id_mapel: e.target.value || null })}>
                      <option value="">— kegiatan kelas —</option>
                      {cabang.map((c) => <option key={c.id} value={c.id_mapel}>{c.nama}</option>)}
                      {s.id_mapel && !nama[s.id_mapel] && <option value={s.id_mapel}>{s.id_mapel}</option>}
                    </select></td>
                    <td><input className="form-control form-control-sm" maxLength={300} aria-label={`Kegiatan slot ${i + 1}`} placeholder={s.id_mapel ? "opsional" : "mis. Istirahat, Pembukaan"} disabled={!bisaSlot} value={s.kegiatan} onChange={(e) => ubahSlot(i, { kegiatan: e.target.value })} /></td>
                    <td><select className="form-select form-select-sm" aria-label={`Ulang slot ${i + 1}`} disabled={!bisaSlot} value={s.ulang} onChange={(e) => ubahSlot(i, { ulang: e.target.value })}>{ULANG.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                    {bisaSlot && <td><button type="button" className="btn btn-sm btn-light text-danger" aria-label={`Hapus slot ${i + 1}`} onClick={() => ubahPola({ slot: slot.filter((_, j) => j !== i) })}><i className="bi bi-x-lg"></i></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="small text-muted mb-2">{bisa ? <>Belum ada slot jam. Isi <b>JP per minggu</b> & hari di tiap cabang mapel lalu <b>Susun slot → Dari JP</b>, atau minta <b>Rekomendasi AI</b> lalu <b>Susun slot → Dari teks pola</b>.</> : "Belum ada slot jam di pola ini."}</div>
            <div className="row g-2 mb-2">
              {HARI.map(([k, l]) => (
                <div key={k} className="col-md-4 col-xl-2">
                  <label className="form-label small fw-semibold mb-0" htmlFor={`ptPola-${k}`}>{l}</label>
                  <Teks id={`ptPola-${k}`} label={`Kegiatan ${l}`} bisa={bisa} baris={4} nilai={p.pola?.[k]} ubah={(v) => ubah({ pola: { ...p.pola, [k]: v } })} placeholder={k === "sabtu" ? "Opsional" : "07:30 Matematika: …"} />
                </div>
              ))}
            </div>
          </>
        )}
        {bisaSlot && <button type="button" className="btn btn-sm btn-outline-primary" onClick={tambahSlot}><i className="bi bi-plus-lg me-1"></i>Tambah slot</button>}

        {riwayatPola.length > 0 && (
          <div className="mt-3">
            <button type="button" className="btn btn-sm btn-link px-0 text-decoration-none" onClick={() => setRiwayat((x) => !x)} aria-expanded={riwayat}>
              <i className={`bi ${riwayat ? "bi-chevron-up" : "bi-chevron-down"} me-1`}></i>Riwayat perubahan pola ({riwayatPola.length})
            </button>
            {riwayat && (
              <ul className="list-unstyled small mb-0" data-riwayat-pola>
                {[...riwayatPola].reverse().map((r, i) => (
                  <li key={i} className="border-start border-3 ps-2 mb-1" style={{ borderColor: r.sumber === "JADWAL" ? "#0d6efd" : r.sumber === "KUNCI" ? "#dc3545" : "#6c757d" }}>
                    <span className="text-muted">{r.waktu}</span> · <b>{r.nama || "?"}</b> <span className="badge text-bg-light border fw-normal">{r.sumber === "JADWAL" ? "dari Jadwal" : r.sumber === "KUNCI" ? "buka kunci" : "di Peta Tema"}</span>
                    <div>{r.ringkas}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const WARNA = { bahaya: "danger", peringatan: "warning", info: "secondary" };
const IKON = { bahaya: "bi-x-octagon", peringatan: "bi-exclamation-triangle", info: "bi-info-circle" };
const STATUS_TP = { SELARAS: ["success", "selaras"], BEDA_MINGGU: ["warning", "beda minggu"], SUDAH_TUNTAS: ["warning", "sudah tuntas"], TIDAK_DI_ATP: ["secondary", "tidak di ATP"] };

/** Cek keselarasan peta tema dengan ATP, Promes/Prota, CP+TP tiap mapel, dan jadwal. */
export function CekKeselarasan({ id, kotor, simpan }) {
  const [hasil, setHasil] = useState(null);
  const [muat, setMuat] = useState(false);
  const periksa = async () => {
    if (kotor && !(await simpan())) return;
    setMuat(true);
    try { setHasil(await minta("GET", `/perangkat-ajar/tema/${id}/cek`)); } catch (err) { Swal.fire("Gagal memeriksa", err.message, "error"); }
    finally { setMuat(false); }
  };
  return (
    <div className="card shadow-sm mb-3" data-keselarasan>
      <div className="card-header fw-semibold d-flex flex-wrap align-items-center gap-2">
        <span><i className="bi bi-clipboard2-check me-1 text-primary"></i>Keselarasan TP & CP</span>
        {hasil && Object.entries(hasil.ringkasan || {}).map(([k, n]) => <span key={k} className={`badge text-bg-${WARNA[k]} fw-normal`}>{n} {k}</span>)}
        <button className="btn btn-sm btn-outline-primary ms-auto" onClick={periksa} disabled={muat}>{muat ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="bi bi-search me-1"></i>}Periksa keselarasan</button>
      </div>
      <div className="card-body">
        {!hasil ? <div className="small text-muted">Bandingkan JP per minggu (target cabang, pola, ATP), TP cabang dengan rencana Promes/Prota, TP yang dipakai tema lain di kelas yang sama, dan elemen CP yang tersentuh.</div> : (
          <>
            {!hasil.masalah.length ? <div className="alert alert-success py-1 px-2 small mb-2"><i className="bi bi-check2-circle me-1"></i>Tidak ditemukan bentrok.</div> : (
              <ul className="list-unstyled small mb-3">
                {hasil.masalah.map((m, i) => <li key={i} className={`text-${m.tingkat === "info" ? "body-secondary" : WARNA[m.tingkat] + "-emphasis"} mb-1`} data-masalah={m.tingkat}><i className={`bi ${IKON[m.tingkat]} me-1`}></i>{m.teks}</li>)}
              </ul>
            )}
            {hasil.minggu_efektif?.length > 0 && <div className="small text-muted mb-2">Tema berjalan di minggu efektif {hasil.minggu_efektif.join(", ")}.</div>}
            <div className="table-responsive">
              <table className="table table-sm small align-top mb-0">
                <thead><tr><th>Mapel</th><th className="text-center">JP target</th><th className="text-center">JP pola</th><th className="text-center">JP ATP</th><th>TP cabang</th><th>Elemen CP</th></tr></thead>
                <tbody>
                  {hasil.mapel.map((m) => (
                    <tr key={m.id_mapel}>
                      <td className="fw-semibold">{m.nama}{m.atp && <div className="fw-normal text-muted">ATP: {m.atp.judul}</div>}</td>
                      <td className="text-center">{m.jp_target || "-"}</td>
                      <td className={`text-center ${m.jp_target && Math.abs(m.jp_target - m.jp_pola) >= 0.5 ? "text-danger fw-semibold" : ""}`}>{m.jp_pola}</td>
                      <td className="text-center">{m.jp_atp ?? "-"}</td>
                      <td>{!m.tp.length ? <span className="text-muted">belum ada TP</span> : m.tp.map((t) => (
                        <div key={t.id_indikator} className="mb-1"><span className={`badge text-bg-${STATUS_TP[t.status][0]} fw-normal me-1`}>{STATUS_TP[t.status][1]}</span>{t.deskripsi}{t.rencana && <span className="text-muted"> · Promes {t.rencana}</span>}</div>
                      ))}</td>
                      <td>{m.elemen_cp.length ? <>{m.elemen_tersentuh.length}/{m.elemen_cp.length} tersentuh<div className="text-muted">{m.elemen_cp.map((e) => (m.elemen_tersentuh.includes(e) ? `✓ ${e}` : e)).join(" · ")}</div></> : <span className="text-muted">CP fase belum diisi</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
