"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { API_URL, authHeaders } from "@/app/lib/akses";
import { minta } from "@/components/banksoal/api";

const WARNA = { GET: "success", POST: "primary", PUT: "warning", PATCH: "info", DELETE: "danger" };

/** Contoh panggilan curl untuk satu endpoint. */
const curl = (e) => {
  const baris = [`curl -X ${e.metode} "${API_URL}${e.uri}"`, `  -H "Accept: application/json"`];
  if (e.butuh_login) baris.push(`  -H "Authorization: Bearer <TOKEN>"`);
  if (["POST", "PUT", "PATCH"].includes(e.metode)) baris.push(`  -H "Content-Type: application/json"`, `  -d '{ }'`);
  return baris.join(" \\\n");
};

/** Dokumentasi endpoint API: dibaca langsung dari router backend sehingga selalu sesuai versi terpasang. */
export default function DokumentasiApi() {
  const [data, setData] = useState(null);
  const [cari, setCari] = useState("");
  const [peran, setPeran] = useState("");
  const [terbuka, setTerbuka] = useState(null);

  useEffect(() => { minta("GET", "/dokumentasi").then(setData).catch((err) => Swal.fire("Gagal memuat", err.message, "error")); }, []);

  const tersaring = useMemo(() => {
    if (!data) return [];
    const q = cari.trim().toLowerCase();
    return data.data.map((g) => ({
      ...g,
      endpoint: g.endpoint.filter((e) => (!q || `${e.metode} ${e.uri} ${e.deskripsi} ${e.aksi}`.toLowerCase().includes(q))
        && (!peran || (peran === "publik" ? !e.butuh_login : e.peran.includes(peran)))),
    })).filter((g) => g.endpoint.length);
  }, [data, cari, peran]);
  const jumlah = tersaring.reduce((s, g) => s + g.endpoint.length, 0);

  const unduhOpenApi = async () => {
    try {
      const res = await fetch(`${API_URL}/dokumentasi/openapi.json`, { headers: authHeaders(false) });
      if (!res.ok) throw new Error(`Gagal (status ${res.status}).`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = "edurapor-openapi.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { Swal.fire("Gagal mengunduh", err.message, "error"); }
  };
  const salin = async (teks) => {
    try { await navigator.clipboard.writeText(teks); Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Disalin", showConfirmButton: false, timer: 1200 }); }
    catch { Swal.fire("Tidak bisa menyalin", "Salin manual dari kotak contoh.", "info"); }
  };

  return (
    <div className="container-fluid mt-3 mb-5">
      <div className="d-flex flex-wrap align-items-start gap-2 mb-2">
        <div className="me-auto">
          <h3 className="fw-bold text-primary mb-1"><i className="bi bi-braces me-2"></i>Dokumentasi API</h3>
          <p className="text-muted small mb-0">Daftar endpoint dibaca langsung dari server, jadi selalu sesuai versi yang terpasang{data ? ` (${data.jumlah} endpoint)` : ""}.</p>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={unduhOpenApi}><i className="bi bi-download me-1"></i>Unduh OpenAPI (JSON)</button>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body small">
          <div className="row g-3">
            <div className="col-md-6">
              <div className="fw-semibold mb-1"><i className="bi bi-key me-1"></i>Autentikasi</div>
              <ol className="mb-0 ps-3">
                <li><code>POST {API_URL}/login</code> dengan <code>{"{ \"username\": \"…\", \"password\": \"…\" }"}</code> mengembalikan <code>token</code>.</li>
                <li>Kirim header <code>Authorization: Bearer &lt;token&gt;</code> dan <code>Accept: application/json</code> pada setiap permintaan.</li>
                <li><code>POST /logout</code> mencabut token. Token juga berakhir bila kata sandi diganti.</li>
              </ol>
            </div>
            <div className="col-md-6">
              <div className="fw-semibold mb-1"><i className="bi bi-info-circle me-1"></i>Tanggapan & galat</div>
              <ul className="mb-0 ps-3">
                <li>Semua tanggapan berformat JSON; data biasanya di <code>data</code>, pesan di <code>message</code>.</li>
                <li><b>401</b> belum masuk/token habis · <b>403</b> peran tidak berhak · <b>404</b> tidak ditemukan · <b>422</b> data tidak valid (rincian di <code>errors</code>) · <b>429</b> terlalu banyak permintaan.</li>
                <li>Akses di bawah adalah batas peran di rute; controller dapat membatasi lebih jauh (mis. guru hanya mapel yang diampu).</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <div className="input-group input-group-sm" style={{ maxWidth: 420 }}>
          <span className="input-group-text"><i className="bi bi-search"></i></span>
          <input className="form-control" aria-label="Cari endpoint" placeholder="Cari jalur, keterangan, atau aksi…" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <select className="form-select form-select-sm" style={{ maxWidth: 200 }} aria-label="Saring peran" value={peran} onChange={(e) => setPeran(e.target.value)}>
          <option value="">Semua peran</option>
          <option value="publik">Publik (tanpa login)</option>
          <option value="admin">Admin</option>
          <option value="kepsek">Kepala sekolah</option>
          <option value="guru">Guru</option>
          <option value="siswa">Siswa</option>
          <option value="ortu">Orang tua</option>
        </select>
        {data && <span className="small text-muted align-self-center">{jumlah} endpoint</span>}
      </div>

      {!data ? <div className="text-muted small"><span className="spinner-border spinner-border-sm me-2"></span>Memuat…</div>
        : !tersaring.length ? <div className="text-center text-muted py-5">Tidak ada endpoint yang cocok.</div>
        : tersaring.map((g) => (
          <div key={g.kelompok} className="mb-3 kelompok-api">
            <h6 className="fw-bold text-body-secondary text-uppercase small">{g.kelompok} <span className="fw-normal">({g.endpoint.length})</span></h6>
            <div className="list-group shadow-sm">
              {g.endpoint.map((e) => {
                const kunci = `${e.metode} ${e.uri}`;
                const buka = terbuka === kunci;
                return (
                  <div key={kunci} className="list-group-item endpoint-api">
                    <button type="button" className="btn btn-link p-0 text-start text-decoration-none w-100 d-flex flex-wrap gap-2 align-items-center text-body" onClick={() => setTerbuka(buka ? null : kunci)} aria-expanded={buka}>
                      <span className={`badge text-bg-${WARNA[e.metode] || "secondary"} font-monospace`} style={{ minWidth: 62 }}>{e.metode}</span>
                      <code className="text-body">{e.uri}</code>
                      <span className="small text-muted me-auto">{e.deskripsi}</span>
                      <span className={`badge ${e.butuh_login ? "text-bg-light border" : "text-bg-success-subtle text-success-emphasis"} fw-normal`}>{e.akses_label}</span>
                    </button>
                    {buka && (
                      <div className="mt-2 small">
                        <div className="text-muted mb-1">Aksi: <code>{e.aksi}</code>{e.batas && <> · Batas laju: {e.batas}</>}</div>
                        <div className="position-relative">
                          <pre className="bg-body-tertiary border rounded p-2 mb-0" style={{ whiteSpace: "pre-wrap" }}>{curl(e)}</pre>
                          <button className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-1" onClick={() => salin(curl(e))} aria-label="Salin contoh curl"><i className="bi bi-clipboard"></i></button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
