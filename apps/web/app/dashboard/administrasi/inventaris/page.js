"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";
import { useAkses } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";
import { MenuAksi } from "@/components/dashboard/menuAksi";
import Pengisi from "@/components/dashboard/Pengisi";
import { esc, judulHtml, kopHtml, muatSekolah, siapkanJendela, tulisJendela, ttdHtml, tanggalPanjang } from "@/app/lib/dokumenResmi";
import { gagal, gantiTabUrl, mintaAlasan, nilai, rp, tgl, toast, useTerbaru, yakin } from "../bantu";

const TAB = [
  { id: "aset", label: "Aset", ikon: "bi-box-seam" },
  { id: "pinjam", label: "Peminjaman", ikon: "bi-arrow-left-right" },
  { id: "stok", label: "Stok Habis Pakai", ikon: "bi-basket" },
  { id: "pengadaan", label: "Pengadaan", ikon: "bi-cart-check" },
];
const WARNA_KONDISI = { BAIK: "success", RUSAK_RINGAN: "warning", RUSAK_BERAT: "danger", HILANG: "dark" };
const WARNA_ADA = { DIAJUKAN: "warning", DISETUJUI: "info", DITOLAK: "danger", SELESAI: "success" };
const NAMA_ADA = { DIAJUKAN: "Menunggu keputusan", DISETUJUI: "Disetujui", DITOLAK: "Ditolak", SELESAI: "Selesai" };

/** Inventaris (Administrasi Sekolah Tahap E): aset per ruang, peminjaman, stok habis pakai, pengadaan. */
export default function InventarisPage() {
  const akses = useAkses();
  const bolehUbah = !akses.isPeninjau;
  const [tab, setTab] = useState("aset");
  const [pilihan, setPilihan] = useState(null);
  const [ringkas, setRingkas] = useState(null);
  const [galat, setGalat] = useState("");

  const muatRingkas = useCallback(() => minta("GET", "/administrasi/inventaris/ringkasan").then((r) => setRingkas(r.data)).catch(() => {}), []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (TAB.some((t) => t.id === q.get("tab"))) setTab(q.get("tab"));
    minta("GET", "/administrasi/inventaris/pilihan").then((r) => setPilihan(r.data)).catch((e) => setGalat(e.message));
    muatRingkas();
  }, [muatRingkas]);
  const pindah = (t) => { setTab(t); gantiTabUrl(t); muatRingkas(); };

  if (galat) return <div className="container-fluid py-3"><div className="alert alert-warning">{galat}</div></div>;
  if (!pilihan) return <div className="container-fluid py-3 text-muted">Memuat…</div>;
  const props = { pilihan, bolehUbah, isKepsek: akses.isKepsek, segarkan: muatRingkas };
  return (
    <div className="container-fluid py-3" style={{ maxWidth: 1250 }}>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <div className="small text-muted"><Link href="/dashboard/administrasi">Administrasi Sekolah</Link></div>
          <h3 className="fw-bold mb-0"><i className="bi bi-box-seam text-primary me-2"></i>Inventaris</h3>
        </div>
        {!bolehUbah && <span className="badge text-bg-secondary">Mode lihat saja</span>}
      </div>
      {ringkas && (
        <div className="row g-2 mb-3" data-ringkasan-inventaris>
          {[
            ["Aset tercatat", `${ringkas.unit} unit`, `${ringkas.jenis_barang} jenis barang`, "bi-box-seam", "primary"],
            ["Nilai buku", rp(ringkas.nilai_buku), `perolehan ${rp(ringkas.nilai_perolehan)}`, "bi-graph-down", "info"],
            ["Sedang dipinjam", `${ringkas.dipinjam}`, ringkas.terlambat ? `${ringkas.terlambat} lewat tanggal kembali` : "tidak ada yang terlambat", "bi-arrow-left-right", ringkas.terlambat ? "danger" : "success"],
            ["Perlu perhatian", `${ringkas.stok_menipis} stok menipis`, `${ringkas.pengadaan_diajukan} pengadaan menunggu`, "bi-exclamation-triangle", "warning"],
          ].map(([j, n, sub, ikon, w]) => (
            <div key={j} className="col-6 col-lg-3"><div className="card h-100"><div className="card-body py-2">
              <div className="small text-muted"><i className={`bi ${ikon} text-${w} me-1`}></i>{j}</div><div className="fs-5 fw-bold">{n}</div><div className="small text-muted">{sub}</div>
            </div></div></div>
          ))}
        </div>
      )}
      <ul className="nav nav-pills flex-nowrap overflow-auto gap-1 mb-3" role="tablist">
        {TAB.map((t) => (
          <li key={t.id} className="nav-item">
            <button type="button" role="tab" aria-selected={tab === t.id} className={`nav-link text-nowrap ${tab === t.id ? "active" : ""}`} onClick={() => pindah(t.id)}>
              <i className={`bi ${t.ikon} me-1`}></i>{t.label}
            </button>
          </li>
        ))}
      </ul>
      {tab === "aset" && <Aset {...props} />}
      {tab === "pinjam" && <Peminjaman {...props} />}
      {tab === "stok" && <Stok {...props} />}
      {tab === "pengadaan" && <Pengadaan {...props} />}
    </div>
  );
}

const opsiKondisi = (pilihan, terpilih) => pilihan.kondisi.map((k) => `<option value="${k.kode}" ${terpilih === k.kode ? "selected" : ""}>${k.nama}</option>`).join("");
const namaKondisi = (pilihan, kode) => pilihan.kondisi.find((k) => k.kode === kode)?.nama || kode;

/** Kartu Inventaris Ruangan (KIR) untuk dicetak dan ditempel di ruangan. */
async function cetakKir(barang, ruangNama, pilihan) {
  const w = siapkanJendela();
  const sek = await muatSekolah(null);
  const baris = barang.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.kode)}</td><td>${esc(b.nama)}${b.merek ? `<br><small>${esc(b.merek)}</small>` : ""}</td><td>${esc(b.kategori)}</td>
    <td class="angka">${b.jumlah} ${esc(b.satuan)}</td><td>${esc(namaKondisi(pilihan, b.kondisi))}</td><td>${b.tanggal_perolehan ? esc(String(b.tanggal_perolehan).slice(0, 4)) : "-"}</td>
    <td class="angka">${rp(b.harga_perolehan * b.jumlah)}</td><td>${esc(b.keterangan || "")}</td></tr>`).join("");
  const gaya = `@page { size: A4 landscape; margin: 12mm; } table.data { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 8px; }
    table.data th, table.data td { border: 1px solid #94a3b8; padding: 3px 5px; text-align: left; vertical-align: top; } table.data .angka { text-align: right; white-space: nowrap; }`;
  const isi = `${kopHtml(sek)}${judulHtml("KARTU INVENTARIS RUANGAN", `${ruangNama} · per ${tanggalPanjang()}`)}
    <table class="data"><thead><tr><th>No</th><th>Kode</th><th>Nama barang</th><th>Kategori</th><th class="angka">Jumlah</th><th>Kondisi</th><th>Tahun</th><th class="angka">Nilai perolehan</th><th>Keterangan</th></tr></thead>
    <tbody>${baris || `<tr><td colspan="9">Belum ada barang di ruangan ini.</td></tr>`}</tbody></table>
    ${ttdHtml(sek, { kanan: { jabatan: "Penanggung jawab ruangan" } })}`;
  if (!tulisJendela(w, `KIR ${ruangNama}`, gaya, isi)) Swal.fire("Jendela cetak diblokir", "Izinkan pop-up untuk situs ini.", "info");
}

// ===================== ASET =====================
function Aset({ pilihan, bolehUbah, segarkan }) {
  const [saring, setSaring] = useState({ id_ruangan: "", kategori: "", kondisi: "", search: "", dihapus: "" });
  const [daftar, setDaftar] = useState(null);
  const [detail, setDetail] = useState(null);
  const terbaru = useTerbaru();
  const muat = useCallback(() => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(saring).filter(([, v]) => v)));
    terbaru(minta("GET", `/administrasi/inventaris/barang?${q}`)).then((r) => setDaftar(r.data)).catch(gagal);
  }, [saring, terbaru]);
  useEffect(() => { const t = setTimeout(muat, 250); return () => clearTimeout(t); }, [muat]);
  const segar = () => { muat(); segarkan(); if (detail) bukaDetail(detail.id); };
  const bukaDetail = (id) => minta("GET", `/administrasi/inventaris/barang/${id}`).then((r) => setDetail(r.data)).catch(gagal);

  const form = async (b) => {
    const r = await Swal.fire({
      title: b ? "Ubah aset" : "Aset baru", width: 640, showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small">
        <div class="row g-2 mb-2"><div class="col-8"><label class="form-label mb-0" for="iNama">Nama barang</label><input id="iNama" class="form-control form-control-sm" value="${esc(b?.nama || "")}"></div>
        <div class="col-4"><label class="form-label mb-0" for="iKategori">Kategori</label><input id="iKategori" list="iDaftar" class="form-control form-control-sm" value="${esc(b?.kategori || pilihan.kategori[0])}">
          <datalist id="iDaftar">${pilihan.kategori.map((k) => `<option value="${esc(k)}">`).join("")}</datalist></div></div>
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="iRuang">Ruangan</label>
          <select id="iRuang" class="form-select form-select-sm"><option value="">Belum ditempatkan</option>${pilihan.ruangan.map((x) => `<option value="${esc(x.id_ruangan)}" ${b?.id_ruangan === x.id_ruangan ? "selected" : ""}>${esc(x.nama_ruangan)}</option>`).join("")}</select></div>
        <div class="col-6"><label class="form-label mb-0" for="iMerek">Merek / tipe</label><input id="iMerek" class="form-control form-control-sm" value="${esc(b?.merek || "")}"></div></div>
        <div class="row g-2 mb-2"><div class="col-4"><label class="form-label mb-0" for="iJumlah">Jumlah</label><input id="iJumlah" type="number" min="1" class="form-control form-control-sm" value="${b?.jumlah ?? 1}"></div>
        <div class="col-4"><label class="form-label mb-0" for="iSatuan">Satuan</label><input id="iSatuan" class="form-control form-control-sm" value="${esc(b?.satuan || "unit")}"></div>
        <div class="col-4"><label class="form-label mb-0" for="iKondisi">Kondisi</label><select id="iKondisi" class="form-select form-select-sm">${opsiKondisi(pilihan, b?.kondisi || "BAIK")}</select></div></div>
        <div class="row g-2 mb-2"><div class="col-4"><label class="form-label mb-0" for="iTanggal">Tanggal perolehan</label><input id="iTanggal" type="date" class="form-control form-control-sm" value="${b?.tanggal_perolehan || ""}"></div>
        <div class="col-4"><label class="form-label mb-0" for="iHarga">Harga per satuan (Rp)</label><input id="iHarga" type="number" min="0" class="form-control form-control-sm" value="${b?.harga_perolehan ?? ""}"></div>
        <div class="col-4"><label class="form-label mb-0" for="iUmur">Umur ekonomis (tahun)</label><input id="iUmur" type="number" min="1" class="form-control form-control-sm" placeholder="mis. 5" value="${b?.umur_ekonomis ?? ""}"></div></div>
        <div class="row g-2 mb-2"><div class="col-5"><label class="form-label mb-0" for="iSumber">Sumber dana</label><input id="iSumber" list="iSumberDaftar" class="form-control form-control-sm" value="${esc(b?.sumber_dana || "")}">
          <datalist id="iSumberDaftar">${pilihan.sumber_dana.map((k) => `<option value="${esc(k)}">`).join("")}</datalist></div>
        <div class="col-7"><label class="form-label mb-0" for="iKet">Keterangan</label><input id="iKet" class="form-control form-control-sm" value="${esc(b?.keterangan || "")}"></div></div>
        <div class="text-muted">Umur ekonomis dipakai menghitung penyusutan garis lurus (nilai buku turun rata tiap tahun).</div></div>`,
      preConfirm: async () => {
        const isi = { nama: nilai("iNama"), kategori: nilai("iKategori"), id_ruangan: nilai("iRuang") || null, merek: nilai("iMerek") || null, jumlah: Number(nilai("iJumlah")),
          satuan: nilai("iSatuan"), kondisi: nilai("iKondisi"), tanggal_perolehan: nilai("iTanggal") || null, harga_perolehan: Number(nilai("iHarga")) || 0,
          umur_ekonomis: Number(nilai("iUmur")) || null, sumber_dana: nilai("iSumber") || null, keterangan: nilai("iKet") || null };
        try { return await minta(b ? "PUT" : "POST", `/administrasi/inventaris/barang${b ? `/${b.id}` : ""}`, isi); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); segar(); }
  };
  const periksa = async (b) => {
    const r = await Swal.fire({
      title: `Periksa ${b.nama}`, showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><label class="form-label mb-0" for="pTanggal">Tanggal</label><input id="pTanggal" type="date" max="${pilihan.hari_ini}" class="form-control form-control-sm mb-2" value="${pilihan.hari_ini}">
        <label class="form-label mb-0" for="pKondisi">Kondisi</label><select id="pKondisi" class="form-select form-select-sm mb-2">${opsiKondisi(pilihan, b.kondisi)}</select>
        <label class="form-label mb-0" for="pCatatan">Catatan</label><input id="pCatatan" class="form-control form-control-sm"></div>`,
      preConfirm: async () => {
        try { return await minta("POST", `/administrasi/inventaris/barang/${b.id}/periksa`, { tanggal: nilai("pTanggal"), kondisi: nilai("pKondisi"), catatan: nilai("pCatatan") || null }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); segar(); }
  };
  const hapus = async (b) => {
    const alasan = await mintaAlasan(`Hapus ${b.nama} dari buku inventaris?`, { text: "Riwayat aset tetap tersimpan dan bisa dilihat di daftar aset dihapus.", tombol: "Hapus dari buku" });
    if (!alasan) return;
    try { const r = await minta("POST", `/administrasi/inventaris/barang/${b.id}/hapus`, { alasan }); toast(r.message); setDetail(null); segar(); } catch (e) { gagal(e); }
  };
  const kir = () => {
    const ruang = pilihan.ruangan.find((x) => x.id_ruangan === saring.id_ruangan);
    cetakKir(daftar || [], ruang?.nama_ruangan || (saring.id_ruangan === "TANPA" ? "Belum ditempatkan" : "Semua ruangan"), pilihan);
  };
  const set = (k) => (e) => setSaring((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="row g-3">
      <div className={detail ? "col-lg-7" : "col-12"}>
        <div className="card">
          <div className="card-body d-flex flex-wrap gap-2 align-items-center">
            <select className="form-select form-select-sm w-auto" aria-label="Saring ruangan" value={saring.id_ruangan} onChange={set("id_ruangan")}>
              <option value="">Semua ruangan</option>{pilihan.ruangan.map((x) => <option key={x.id_ruangan} value={x.id_ruangan}>{x.nama_ruangan}</option>)}<option value="TANPA">Belum ditempatkan</option>
            </select>
            <select className="form-select form-select-sm w-auto" aria-label="Saring kondisi" value={saring.kondisi} onChange={set("kondisi")}>
              <option value="">Semua kondisi</option>{pilihan.kondisi.map((k) => <option key={k.kode} value={k.kode}>{k.nama}</option>)}
            </select>
            <input className="form-control form-control-sm" style={{ maxWidth: 200 }} placeholder="Cari nama, kode, merek…" aria-label="Cari aset" value={saring.search} onChange={set("search")} />
            <label className="form-check small mb-0"><input type="checkbox" className="form-check-input" checked={!!saring.dihapus} onChange={(e) => setSaring((s) => ({ ...s, dihapus: e.target.checked ? "1" : "" }))} /> Aset dihapus</label>
            <div className="ms-auto d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={kir} disabled={!daftar}><i className="bi bi-printer me-1"></i>Cetak KIR</button>
              {bolehUbah && <button type="button" className="btn btn-primary btn-sm" onClick={() => form(null)}><i className="bi bi-plus-lg me-1"></i>Aset baru</button>}
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead><tr><th>Barang</th><th>Ruangan</th><th className="text-end">Jumlah</th><th>Kondisi</th><th className="text-end">Nilai buku</th><th></th></tr></thead>
              <tbody>
                {!daftar && <tr><td colSpan={6} className="text-muted">Memuat…</td></tr>}
                {daftar?.length === 0 && <tr><td colSpan={6} className="text-muted">Belum ada aset.</td></tr>}
                {daftar?.map((b) => (
                  <tr key={b.id} data-aset={b.nama} className={detail?.id === b.id ? "table-active" : ""}>
                    <td><button type="button" className="btn btn-link p-0 text-start" onClick={() => bukaDetail(b.id)}>{b.nama}</button><div className="small text-muted">{b.kode} · {b.kategori}{b.merek ? ` · ${b.merek}` : ""}</div></td>
                    <td className="small">{b.ruangan?.nama_ruangan || <span className="text-muted">-</span>}</td>
                    <td className="text-end text-nowrap">{b.jumlah} {b.satuan}{b.dipinjam > 0 && <div className="small text-warning">{b.dipinjam} dipinjam</div>}</td>
                    <td><span className={`badge text-bg-${WARNA_KONDISI[b.kondisi]}`} data-kondisi>{namaKondisi(pilihan, b.kondisi)}</span></td>
                    <td className="text-end small">{rp(b.nilai_buku)}</td>
                    <td className="text-end">{bolehUbah && !b.dihapus_at && <MenuAksi label={`Aksi untuk ${b.nama}`} items={[
                      { label: "Ubah", ikon: "bi-pencil-square", onClick: () => form(b) },
                      { label: "Catat pemeriksaan", ikon: "bi-clipboard-check", onClick: () => periksa(b) },
                      { label: "Hapus dari buku inventaris", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapus(b) },
                    ]} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {detail && (
        <div className="col-lg-5">
          <div className="card" data-detail-aset={detail.nama}>
            <div className="card-header d-flex align-items-center"><span className="fw-semibold me-auto">{detail.nama}</span>
              <button type="button" className="btn-close" aria-label="Tutup detail" onClick={() => setDetail(null)}></button></div>
            <div className="card-body small">
              <div className="mb-2">{detail.kode} · {detail.kategori} · {detail.ruangan?.nama_ruangan || "belum ditempatkan"}</div>
              <div className="mb-2">Perolehan {detail.tanggal_perolehan ? tgl(detail.tanggal_perolehan) : "-"} · {rp(detail.harga_perolehan)}/{detail.satuan}{detail.sumber_dana ? ` · ${detail.sumber_dana}` : ""}
                <br />Nilai buku sekarang <b>{rp(detail.nilai_buku)}</b>{detail.umur_ekonomis ? ` (umur ekonomis ${detail.umur_ekonomis} tahun)` : " (tanpa penyusutan)"}</div>
              {detail.dihapus_at && <div className="alert alert-secondary py-1">Dihapus dari buku: {detail.alasan_hapus}</div>}
              <div className="fw-semibold mt-2">Riwayat kondisi</div>
              {detail.pemeriksaan.length === 0 ? <div className="text-muted">Belum ada pemeriksaan.</div> : (
                <ul className="list-unstyled mb-2">{detail.pemeriksaan.map((p) => (
                  <li key={p.id} className="border-bottom py-1"><span className={`badge text-bg-${WARNA_KONDISI[p.kondisi]} me-1`}>{namaKondisi(pilihan, p.kondisi)}</span>{tgl(p.tanggal)}
                    {p.catatan && <span> · {p.catatan}</span>} <span className="d-inline-flex gap-1 align-items-center text-muted">· <Pengisi pengisi={p.pemeriksa?.name} sebaris /></span></li>
                ))}</ul>
              )}
              <div className="fw-semibold mt-2">Riwayat peminjaman</div>
              {detail.peminjaman.length === 0 ? <div className="text-muted">Belum pernah dipinjam.</div> : (
                <ul className="list-unstyled mb-0">{detail.peminjaman.map((p) => (
                  <li key={p.id} className="border-bottom py-1"><b>{p.peminjam}</b> · {p.jumlah} {detail.satuan} · {tgl(p.tgl_pinjam)} → {p.tgl_kembali ? tgl(p.tgl_kembali) : <span className="text-warning">belum kembali</span>}
                    {p.keperluan && <div className="text-muted">{p.keperluan}</div>}</li>
                ))}</ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== PEMINJAMAN =====================
function Peminjaman({ pilihan, bolehUbah, segarkan }) {
  const [status, setStatus] = useState("DIPINJAM");
  const [hasil, setHasil] = useState(null);
  const terbaru = useTerbaru();
  const muat = useCallback(() => terbaru(minta("GET", `/administrasi/inventaris/peminjaman${status ? `?status=${status}` : ""}`)).then(setHasil).catch(gagal), [status, terbaru]);
  useEffect(() => { muat(); }, [muat]);

  const pinjam = async () => {
    const barang = (await minta("GET", "/administrasi/inventaris/barang")).data.filter((b) => !["RUSAK_BERAT", "HILANG"].includes(b.kondisi) && b.jumlah - b.dipinjam > 0);
    if (!barang.length) return Swal.fire("Tidak ada aset tersedia", "Semua aset sedang dipinjam atau belum ada aset yang bisa dipinjam.", "info");
    const r = await Swal.fire({
      title: "Catat peminjaman", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><label class="form-label mb-0" for="jBarang">Barang</label>
        <select id="jBarang" class="form-select form-select-sm mb-2">${barang.map((b) => `<option value="${b.id}">${esc(b.nama)} (${esc(b.kode)}) · tersedia ${b.jumlah - b.dipinjam} ${esc(b.satuan)}</option>`).join("")}</select>
        <div class="row g-2 mb-2"><div class="col-4"><label class="form-label mb-0" for="jJumlah">Jumlah</label><input id="jJumlah" type="number" min="1" value="1" class="form-control form-control-sm"></div>
        <div class="col-8"><label class="form-label mb-0" for="jPeminjam">Peminjam</label><input id="jPeminjam" class="form-control form-control-sm" placeholder="Nama guru/siswa/panitia"></div></div>
        <label class="form-label mb-0" for="jKeperluan">Keperluan</label><input id="jKeperluan" class="form-control form-control-sm mb-2">
        <div class="row g-2"><div class="col-6"><label class="form-label mb-0" for="jTgl">Tanggal pinjam</label><input id="jTgl" type="date" max="${pilihan.hari_ini}" value="${pilihan.hari_ini}" class="form-control form-control-sm"></div>
        <div class="col-6"><label class="form-label mb-0" for="jRencana">Rencana kembali</label><input id="jRencana" type="date" class="form-control form-control-sm"></div></div></div>`,
      preConfirm: async () => {
        try {
          return await minta("POST", "/administrasi/inventaris/peminjaman", { id_barang: Number(nilai("jBarang")), jumlah: Number(nilai("jJumlah")), peminjam: nilai("jPeminjam"),
            keperluan: nilai("jKeperluan") || null, tgl_pinjam: nilai("jTgl"), rencana_kembali: nilai("jRencana") || null });
        } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); segarkan(); }
  };
  const kembali = async (p) => {
    const r = await Swal.fire({
      title: `Pengembalian ${p.barang?.nama}`, text: `${p.peminjam} · ${p.jumlah} ${p.barang?.satuan}`, showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><label class="form-label mb-0" for="kTgl">Tanggal kembali</label><input id="kTgl" type="date" max="${pilihan.hari_ini}" value="${pilihan.hari_ini}" class="form-control form-control-sm mb-2">
        <label class="form-label mb-0" for="kKondisi">Kondisi saat kembali</label><select id="kKondisi" class="form-select form-select-sm mb-2">${opsiKondisi(pilihan, "BAIK")}</select>
        <label class="form-label mb-0" for="kCatatan">Catatan</label><input id="kCatatan" class="form-control form-control-sm"></div>`,
      preConfirm: async () => {
        try { return await minta("POST", `/administrasi/inventaris/peminjaman/${p.id}/kembali`, { tgl_kembali: nilai("kTgl"), kondisi_kembali: nilai("kKondisi"), catatan_kembali: nilai("kCatatan") || null }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); segarkan(); }
  };

  return (
    <div className="card">
      <div className="card-body d-flex flex-wrap gap-2 align-items-center">
        <select className="form-select form-select-sm w-auto" aria-label="Saring status peminjaman" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="DIPINJAM">Sedang dipinjam</option><option value="KEMBALI">Sudah kembali</option><option value="">Semua</option>
        </select>
        {bolehUbah && <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => pinjam().catch(gagal)}><i className="bi bi-plus-lg me-1"></i>Catat peminjaman</button>}
      </div>
      <div className="list-group list-group-flush">
        {!hasil && <div className="list-group-item text-muted">Memuat…</div>}
        {hasil?.data.length === 0 && <div className="list-group-item text-muted">Tidak ada peminjaman.</div>}
        {hasil?.data.map((p) => {
          const telat = p.status === "DIPINJAM" && p.rencana_kembali && p.rencana_kembali < hasil.hari_ini;
          return (
            <div key={p.id} className="list-group-item d-flex align-items-center gap-2" data-pinjam={`${p.barang?.nama} · ${p.peminjam}`}>
              <div className="me-auto">
                <div className="fw-semibold">{p.barang?.nama} <span className="text-muted small">{p.barang?.kode}</span> · {p.jumlah} {p.barang?.satuan}
                  {p.status === "KEMBALI" ? <span className="badge text-bg-success ms-1">Kembali {tgl(p.tgl_kembali)}</span> : telat ? <span className="badge text-bg-danger ms-1">Terlambat</span> : <span className="badge text-bg-warning ms-1">Dipinjam</span>}</div>
                <div className="small text-muted">{p.peminjam}{p.keperluan ? ` · ${p.keperluan}` : ""} · {tgl(p.tgl_pinjam)}{p.rencana_kembali ? ` → rencana ${tgl(p.rencana_kembali)}` : ""}</div>
                {p.catatan_kembali && <div className="small">Catatan kembali: {p.catatan_kembali}</div>}
              </div>
              {bolehUbah && p.status === "DIPINJAM" && <button type="button" className="btn btn-sm btn-outline-success text-nowrap" onClick={() => kembali(p)}><i className="bi bi-box-arrow-in-left me-1"></i>Kembalikan</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================== STOK HABIS PAKAI =====================
function Stok({ pilihan, bolehUbah, segarkan }) {
  const [daftar, setDaftar] = useState(null);
  const [detail, setDetail] = useState(null);
  const muat = useCallback(() => minta("GET", "/administrasi/inventaris/stok").then((r) => setDaftar(r.data)).catch(gagal), []);
  useEffect(() => { muat(); }, [muat]);
  const bukaDetail = (id) => minta("GET", `/administrasi/inventaris/stok/${id}`).then((r) => setDetail(r.data)).catch(gagal);

  const form = async (s) => {
    const r = await Swal.fire({
      title: s ? "Ubah barang habis pakai" : "Barang habis pakai baru", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><label class="form-label mb-0" for="sNama">Nama barang</label><input id="sNama" class="form-control form-control-sm mb-2" placeholder="Spidol, kertas HVS, kapur, sabun…" value="${esc(s?.nama || "")}">
        <div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="sKategori">Kategori</label><input id="sKategori" class="form-control form-control-sm" placeholder="ATK, kebersihan…" value="${esc(s?.kategori || "")}"></div>
        <div class="col-6"><label class="form-label mb-0" for="sSatuan">Satuan</label><input id="sSatuan" class="form-control form-control-sm" value="${esc(s?.satuan || "pcs")}"></div></div>
        <div class="row g-2 mb-2">${s ? "" : `<div class="col-6"><label class="form-label mb-0" for="sAwal">Stok awal</label><input id="sAwal" type="number" min="0" value="0" class="form-control form-control-sm"></div>`}
        <div class="col-6"><label class="form-label mb-0" for="sMin">Stok minimum</label><input id="sMin" type="number" min="0" class="form-control form-control-sm" value="${s?.stok_minimum ?? 0}"></div></div>
        <div class="text-muted">Saat stok sampai batas minimum, pengingat muncul di Perlu Tindakan.</div></div>`,
      preConfirm: async () => {
        const isi = { nama: nilai("sNama"), kategori: nilai("sKategori") || null, satuan: nilai("sSatuan"), stok_minimum: Number(nilai("sMin")) || 0, aktif: true, ...(s ? {} : { stok_awal: Number(nilai("sAwal")) || 0 }) };
        try { return await minta(s ? "PUT" : "POST", `/administrasi/inventaris/stok${s ? `/${s.id}` : ""}`, isi); } catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); muat(); segarkan(); }
  };
  const mutasi = async (s, arah) => {
    const r = await Swal.fire({
      title: `${arah === "MASUK" ? "Barang masuk" : "Barang keluar"}: ${s.nama}`, text: `Stok sekarang ${s.stok} ${s.satuan}`, showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><div class="row g-2 mb-2"><div class="col-6"><label class="form-label mb-0" for="mJumlah">Jumlah (${esc(s.satuan)})</label><input id="mJumlah" type="number" min="1" class="form-control form-control-sm"></div>
        <div class="col-6"><label class="form-label mb-0" for="mTgl">Tanggal</label><input id="mTgl" type="date" max="${pilihan.hari_ini}" value="${pilihan.hari_ini}" class="form-control form-control-sm"></div></div>
        <label class="form-label mb-0" for="mKet">${arah === "MASUK" ? "Sumber (toko, sumbangan…)" : "Untuk siapa / keperluan"}</label><input id="mKet" class="form-control form-control-sm"></div>`,
      preConfirm: async () => {
        try { return await minta("POST", `/administrasi/inventaris/stok/${s.id}/mutasi`, { arah, jumlah: Number(nilai("mJumlah")), tanggal: nilai("mTgl"), keterangan: nilai("mKet") || null }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message, r.value.data.stok_minimum > 0 && r.value.data.stok <= r.value.data.stok_minimum ? "warning" : "success"); muat(); segarkan(); if (detail?.id === s.id) bukaDetail(s.id); }
  };

  return (
    <div className="row g-3">
      <div className={detail ? "col-lg-7" : "col-12"}>
        <div className="card">
          <div className="card-body d-flex align-items-center">
            <span className="small text-muted me-auto">ATK, kertas, kapur, bahan kebersihan, dan barang lain yang habis dipakai.</span>
            {bolehUbah && <button type="button" className="btn btn-primary btn-sm" onClick={() => form(null)}><i className="bi bi-plus-lg me-1"></i>Barang baru</button>}
          </div>
          <div className="list-group list-group-flush">
            {!daftar && <div className="list-group-item text-muted">Memuat…</div>}
            {daftar?.length === 0 && <div className="list-group-item text-muted">Belum ada barang habis pakai.</div>}
            {daftar?.map((s) => {
              const tipis = s.stok_minimum > 0 && s.stok <= s.stok_minimum;
              return (
                <div key={s.id} className={`list-group-item d-flex align-items-center gap-2 ${s.aktif ? "" : "text-muted"}`} data-stok={s.nama}>
                  <div className="me-auto"><button type="button" className="btn btn-link p-0 fw-semibold" onClick={() => bukaDetail(s.id)}>{s.nama}</button>
                    <div className="small text-muted">{s.kategori || "Tanpa kategori"} · minimum {s.stok_minimum} {s.satuan}</div></div>
                  <span className={`badge ${tipis ? "text-bg-danger" : "text-bg-light border"} fs-6`} data-jumlah-stok>{s.stok} {s.satuan}</span>
                  {bolehUbah && <>
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => mutasi(s, "MASUK")} title="Barang masuk" aria-label={`Barang masuk ${s.nama}`}><i className="bi bi-plus-lg"></i></button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => mutasi(s, "KELUAR")} title="Barang keluar" aria-label={`Barang keluar ${s.nama}`} disabled={s.stok <= 0}><i className="bi bi-dash-lg"></i></button>
                    <MenuAksi label={`Aksi untuk ${s.nama}`} items={[{ label: "Ubah", ikon: "bi-pencil-square", onClick: () => form(s) }]} />
                  </>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {detail && (
        <div className="col-lg-5">
          <div className="card">
            <div className="card-header d-flex align-items-center"><span className="fw-semibold me-auto">Riwayat {detail.nama}</span>
              <button type="button" className="btn-close" aria-label="Tutup riwayat" onClick={() => setDetail(null)}></button></div>
            <ul className="list-group list-group-flush small">
              {detail.mutasi.length === 0 && <li className="list-group-item text-muted">Belum ada catatan.</li>}
              {detail.mutasi.map((m) => (
                <li key={m.id} className="list-group-item d-flex gap-2">
                  <span className={`fw-bold ${m.arah === "MASUK" ? "text-success" : "text-danger"}`}>{m.arah === "MASUK" ? "+" : "−"}{m.jumlah}</span>
                  <span className="me-auto">{m.keterangan || "-"}<div className="text-muted d-flex gap-1 align-items-center">{tgl(m.tanggal)} · <Pengisi pengisi={m.pencatat?.name} sebaris /></div></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== PENGADAAN =====================
function Pengadaan({ pilihan, bolehUbah, isKepsek, segarkan }) {
  const [status, setStatus] = useState("");
  const [daftar, setDaftar] = useState(null);
  const terbaru = useTerbaru();
  const muat = useCallback(() => terbaru(minta("GET", `/administrasi/inventaris/pengadaan${status ? `?status=${status}` : ""}`)).then((r) => setDaftar(r.data)).catch(gagal), [status, terbaru]);
  useEffect(() => { muat(); }, [muat]);
  const segar = () => { muat(); segarkan(); };

  const barisRincian = (r = {}) => `<div class="row g-1 mb-1 baris-rincian"><div class="col-5"><input class="form-control form-control-sm r-nama" placeholder="Nama barang" aria-label="Nama barang" value="${esc(r.nama || "")}"></div>
    <div class="col-2"><input type="number" min="1" class="form-control form-control-sm r-jumlah" placeholder="Jml" aria-label="Jumlah" value="${r.jumlah ?? 1}"></div>
    <div class="col-2"><input class="form-control form-control-sm r-satuan" placeholder="Satuan" aria-label="Satuan" value="${esc(r.satuan || "pcs")}"></div>
    <div class="col-3"><input type="number" min="0" class="form-control form-control-sm r-harga" placeholder="Harga satuan" aria-label="Harga satuan" value="${r.harga ?? ""}"></div></div>`;

  const form = async (p) => {
    const r = await Swal.fire({
      title: p ? "Ubah pengajuan" : "Ajukan pengadaan", width: 680, showCancelButton: true, confirmButtonText: p ? "Simpan" : "Ajukan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><div class="row g-2 mb-2"><div class="col-8"><label class="form-label mb-0" for="aJudul">Judul</label><input id="aJudul" class="form-control form-control-sm" placeholder="mis. ATK semester ganjil" value="${esc(p?.judul || "")}"></div>
        <div class="col-4"><label class="form-label mb-0" for="aTanggal">Tanggal</label><input id="aTanggal" type="date" class="form-control form-control-sm" value="${p?.tanggal || pilihan.hari_ini}"></div></div>
        <div class="fw-semibold mb-1">Barang yang diajukan</div><div id="aRincian">${(p?.rincian || [{}]).map(barisRincian).join("")}</div>
        <button type="button" id="aTambah" class="btn btn-sm btn-light mb-2"><i class="bi bi-plus"></i> Tambah barang</button>
        <label class="form-label mb-0" for="aAlasan">Alasan / kebutuhan</label><textarea id="aAlasan" rows="2" class="form-control form-control-sm">${esc(p?.alasan || "")}</textarea></div>`,
      didOpen: () => document.getElementById("aTambah").addEventListener("click", () => document.getElementById("aRincian").insertAdjacentHTML("beforeend", barisRincian())),
      preConfirm: async () => {
        const rincian = [...document.querySelectorAll(".baris-rincian")].map((b) => ({
          nama: b.querySelector(".r-nama").value.trim(), jumlah: Number(b.querySelector(".r-jumlah").value), satuan: b.querySelector(".r-satuan").value.trim(), harga: Number(b.querySelector(".r-harga").value) || 0,
        })).filter((x) => x.nama);
        try { return await minta(p ? "PUT" : "POST", `/administrasi/inventaris/pengadaan${p ? `/${p.id}` : ""}`, { judul: nilai("aJudul"), tanggal: nilai("aTanggal"), alasan: nilai("aAlasan") || null, rincian }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); segar(); }
  };
  const putuskan = async (p, keputusan) => {
    const r = await Swal.fire({ title: keputusan === "DISETUJUI" ? "Setujui pengadaan?" : "Tolak pengadaan?", text: `${p.judul} · ${rp(p.total)}`, input: "text",
      inputLabel: keputusan === "DISETUJUI" ? "Catatan (opsional)" : "Alasan penolakan", inputValidator: (v) => (keputusan === "DITOLAK" && !v?.trim() ? "Tulis alasannya." : null),
      showCancelButton: true, confirmButtonText: keputusan === "DISETUJUI" ? "Setujui" : "Tolak", cancelButtonText: "Batal" });
    if (!r.isConfirmed) return;
    try { const x = await minta("POST", `/administrasi/inventaris/pengadaan/${p.id}/putuskan`, { keputusan, catatan: r.value || null }); toast(x.message); segar(); } catch (e) { gagal(e); }
  };
  const selesaikan = async (p) => {
    const stok = (await minta("GET", "/administrasi/inventaris/stok")).data;
    const opsiStok = (nama) => `<option value="">Barang stok baru</option>${stok.map((s) => `<option value="${s.id}" ${s.nama.toLowerCase() === nama.toLowerCase() ? "selected" : ""}>${esc(s.nama)}</option>`).join("")}`;
    const r = await Swal.fire({
      title: "Barang sudah diterima", width: 720, showCancelButton: true, confirmButtonText: "Selesaikan", cancelButtonText: "Batal", focusConfirm: false,
      html: `<div class="text-start small"><label class="form-label mb-0" for="zTgl">Tanggal diterima</label><input id="zTgl" type="date" max="${pilihan.hari_ini}" value="${pilihan.hari_ini}" class="form-control form-control-sm mb-2" style="max-width:200px">
        <div class="fw-semibold mb-1">Masukkan barang ke</div>
        ${p.rincian.map((x, i) => `<div class="row g-1 mb-1 align-items-center z-baris" data-i="${i}"><div class="col-4">${esc(x.nama)} <span class="text-muted">(${x.jumlah} ${esc(x.satuan)})</span></div>
          <div class="col-3"><select class="form-select form-select-sm z-ke" aria-label="Tujuan ${esc(x.nama)}"><option value="ASET">Aset</option><option value="STOK">Stok habis pakai</option><option value="TIDAK">Tidak dicatat</option></select></div>
          <div class="col-5"><select class="form-select form-select-sm z-ruang" aria-label="Ruangan ${esc(x.nama)}"><option value="">Belum ditempatkan</option>${pilihan.ruangan.map((g) => `<option value="${esc(g.id_ruangan)}">${esc(g.nama_ruangan)}</option>`).join("")}</select>
            <select class="form-select form-select-sm z-stok d-none" aria-label="Stok ${esc(x.nama)}">${opsiStok(x.nama)}</select></div></div>`).join("")}
        <label class="form-check mt-2"><input id="zKas" type="checkbox" class="form-check-input" checked> Catat pengeluaran ${rp(p.total)} di kas Keuangan</label></div>`,
      didOpen: () => document.querySelectorAll(".z-baris").forEach((b) => b.querySelector(".z-ke").addEventListener("change", (e) => {
        b.querySelector(".z-ruang").classList.toggle("d-none", e.target.value !== "ASET");
        b.querySelector(".z-stok").classList.toggle("d-none", e.target.value !== "STOK");
      })),
      preConfirm: async () => {
        const masuk = [...document.querySelectorAll(".z-baris")].map((b) => {
          const ke = b.querySelector(".z-ke").value;
          return { indeks: Number(b.dataset.i), ke, id_ruangan: ke === "ASET" ? b.querySelector(".z-ruang").value || null : null, id_stok: ke === "STOK" ? Number(b.querySelector(".z-stok").value) || null : null };
        });
        try { return await minta("POST", `/administrasi/inventaris/pengadaan/${p.id}/selesaikan`, { tanggal: nilai("zTgl"), catat_kas: document.getElementById("zKas").checked, masuk }); }
        catch (e) { Swal.showValidationMessage(e.message); return false; }
      },
    });
    if (r.isConfirmed) { toast(r.value.message); segar(); }
  };
  const hapus = async (p) => {
    if (!(await yakin("Hapus pengajuan ini?", p.judul))) return;
    try { const r = await minta("DELETE", `/administrasi/inventaris/pengadaan/${p.id}`); toast(r.message); segar(); } catch (e) { gagal(e); }
  };

  return (
    <div className="card">
      <div className="card-body d-flex flex-wrap gap-2 align-items-center">
        <select className="form-select form-select-sm w-auto" aria-label="Saring status pengadaan" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>{Object.entries(NAMA_ADA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        {bolehUbah && <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => form(null)}><i className="bi bi-plus-lg me-1"></i>Ajukan pengadaan</button>}
      </div>
      <div className="list-group list-group-flush">
        {!daftar && <div className="list-group-item text-muted">Memuat…</div>}
        {daftar?.length === 0 && <div className="list-group-item text-muted">Belum ada pengajuan pengadaan.</div>}
        {daftar?.map((p) => (
          <div key={p.id} className="list-group-item" data-pengadaan={p.judul}>
            <div className="d-flex align-items-center gap-2">
              <div className="me-auto">
                <div className="fw-semibold">{p.judul} <span className={`badge text-bg-${WARNA_ADA[p.status]} ms-1`} data-status-pengadaan>{NAMA_ADA[p.status]}</span></div>
                <div className="small text-muted">{tgl(p.tanggal)} · {p.rincian.length} barang · <b>{rp(p.total)}</b></div>
                <div className="small">{p.rincian.map((x) => `${x.nama} ${x.jumlah} ${x.satuan}`).join(", ")}</div>
                <div className="small d-flex flex-wrap gap-1 align-items-center">Diajukan <Pengisi pengisi={p.pengaju?.name} sebaris />{p.pemutus && <span className="text-muted">· diputuskan {p.pemutus.name}</span>}{p.catatan_keputusan && <span>· “{p.catatan_keputusan}”</span>}</div>
              </div>
              {isKepsek && p.status === "DIAJUKAN" && <>
                <button type="button" className="btn btn-sm btn-success" onClick={() => putuskan(p, "DISETUJUI")}>Setujui</button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => putuskan(p, "DITOLAK")}>Tolak</button>
              </>}
              {bolehUbah && p.status === "DISETUJUI" && <button type="button" className="btn btn-sm btn-primary text-nowrap" onClick={() => selesaikan(p).catch(gagal)}><i className="bi bi-box-arrow-in-down me-1"></i>Barang diterima</button>}
              {bolehUbah && ["DIAJUKAN", "DITOLAK"].includes(p.status) && <MenuAksi label={`Aksi untuk ${p.judul}`} items={[
                { label: "Ubah", ikon: "bi-pencil-square", onClick: () => form(p), tampil: p.status === "DIAJUKAN" },
                { label: "Hapus", ikon: "bi-trash", bahaya: true, pemisah: true, onClick: () => hapus(p) },
              ]} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
