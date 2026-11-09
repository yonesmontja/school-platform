"use client";
// Panel properti Studio Rakit Video: elemen terpilih, adegan, dan merek sekolah.
import { BENTUK, GERAK, HURUF, MASUK, TRANSISI } from "../templat/rakitan.jsx";

export const EMOJI_STUDIO = ["⭐", "🏫", "📚", "✏️", "🎨", "🎉", "👍", "❤️", "🌟", "🏆", "🎓", "⚽", "🎵", "🌳", "🌺", "☀️", "🐟", "🍌", "🥥", "🐦", "🛶", "⛰️", "💡", "📣", "✅", "👋", "😊", "🤝", "🧒", "👩‍🏫"];

const Label = ({ children, htmlFor }) => <label className="form-label small mb-1 fw-semibold" htmlFor={htmlFor}>{children}</label>;

export function InputWarna({ id, label, nilai, onUbah, palet = [], bolehKosong = false }) {
  return (
    <div className="mb-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="d-flex align-items-center gap-1 flex-wrap">
        <input id={id} type="color" className="form-control form-control-color form-control-sm" value={nilai || "#ffffff"} onChange={(e) => onUbah(e.target.value)} aria-label={label} />
        {palet.map((w) => <button key={w} type="button" className="studio-swatch" style={{ background: w }} title={w} aria-label={`Warna ${w}`} onClick={() => onUbah(w)} />)}
        {["#ffffff", "#1f2937"].filter((w) => !palet.includes(w)).map((w) => <button key={w} type="button" className="studio-swatch" style={{ background: w }} title={w} aria-label={`Warna ${w}`} onClick={() => onUbah(w)} />)}
        {bolehKosong && <button type="button" className={`btn btn-sm ${nilai ? "btn-outline-secondary" : "btn-secondary"} py-0`} onClick={() => onUbah(null)}>Tanpa</button>}
      </div>
    </div>
  );
}

function Angka({ id, label, nilai, min, max, step = 1, onUbah, satuan }) {
  return (
    <div className="mb-2">
      <Label htmlFor={id}>{label}{satuan && <span className="fw-normal text-body-secondary"> ({satuan})</span>}</Label>
      <div className="d-flex align-items-center gap-2">
        <input type="range" className="form-range" min={min} max={max} step={step} value={nilai ?? min} onChange={(e) => onUbah(Number(e.target.value))} aria-label={label} />
        <input id={id} type="number" className="form-control form-control-sm" style={{ width: 72 }} min={min} max={max} step={step} value={nilai ?? ""} onChange={(e) => onUbah(e.target.value === "" ? min : Number(e.target.value))} />
      </div>
    </div>
  );
}

export function PanelElemen({ e, palet, onUbah, onUnggah }) {
  const g = e.gaya || {};
  const gaya = (x) => onUbah({ gaya: { ...g, ...x } });
  const masuk = (x) => onUbah({ masuk: { ...e.masuk, ...x } });
  return (
    <div>
      <div className="small text-uppercase text-body-secondary fw-bold mb-2">{{ teks: "Teks", emoji: "Emoji", gambar: "Gambar", bentuk: "Bentuk" }[e.tipe]}</div>
      {e.tipe === "teks" && (
        <div className="mb-2"><Label htmlFor="stIsi">Isi teks</Label>
          <textarea id="stIsi" className="form-control form-control-sm" rows={2} maxLength={300} value={e.isi} onChange={(x) => onUbah({ isi: x.target.value })} /></div>
      )}
      {e.tipe === "emoji" && (
        <div className="mb-2"><Label htmlFor="stEmoji">Emoji</Label>
          <input id="stEmoji" className="form-control form-control-sm mb-1" maxLength={16} value={e.isi} onChange={(x) => onUbah({ isi: x.target.value })} />
          <div className="d-flex flex-wrap gap-1">{EMOJI_STUDIO.map((m) => <button key={m} type="button" className="btn btn-sm btn-light px-1 py-0 fs-5" onClick={() => onUbah({ isi: m })} aria-label={`Emoji ${m}`}>{m}</button>)}</div></div>
      )}
      {e.tipe === "gambar" && (
        <div className="mb-2"><Label htmlFor="stGambar">Gambar (PNG/JPG/WebP, maks. 5 MB)</Label>
          <input id="stGambar" type="file" className="form-control form-control-sm" accept="image/png,image/jpeg,image/webp" onChange={async (x) => { const f = x.target.files?.[0]; if (f) { const url = await onUnggah(f); if (url) onUbah({ isi: url }); } }} />
          <div className="form-text">Pakai foto siswa hanya bila orang tua sudah memberi izin.</div></div>
      )}
      {e.tipe === "bentuk" && (
        <div className="mb-2"><Label htmlFor="stBentuk">Bentuk</Label>
          <select id="stBentuk" className="form-select form-select-sm" value={e.isi} onChange={(x) => onUbah({ isi: x.target.value })}>{BENTUK.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      )}
      {(e.tipe === "teks" || e.tipe === "emoji") && <Angka id="stUkuran" label="Ukuran huruf" nilai={g.ukuran} min={10} max={400} onUbah={(v) => gaya({ ukuran: v })} />}
      {e.tipe !== "gambar" && <InputWarna id="stWarna" label={e.tipe === "bentuk" ? "Warna isi" : "Warna"} nilai={g.warna} palet={palet} onUbah={(v) => gaya({ warna: v })} />}
      {e.tipe === "teks" && (
        <>
          <div className="btn-group btn-group-sm mb-2 me-2" role="group" aria-label="Gaya teks">
            <button type="button" className={`btn ${g.tebal ? "btn-primary" : "btn-outline-primary"}`} onClick={() => gaya({ tebal: !g.tebal })} aria-label="Tebal"><b>B</b></button>
            <button type="button" className={`btn ${g.miring ? "btn-primary" : "btn-outline-primary"}`} onClick={() => gaya({ miring: !g.miring })} aria-label="Miring"><i>I</i></button>
          </div>
          <div className="btn-group btn-group-sm mb-2" role="group" aria-label="Rata teks">
            {[["kiri", "bi-text-left"], ["tengah", "bi-text-center"], ["kanan", "bi-text-right"]].map(([v, ik]) => (
              <button key={v} type="button" className={`btn ${g.rata === v ? "btn-primary" : "btn-outline-primary"}`} onClick={() => gaya({ rata: v })} aria-label={`Rata ${v}`}><i className={`bi ${ik}`}></i></button>
            ))}
          </div>
          <InputWarna id="stLatar" label="Latar teks" nilai={g.latar} palet={palet} bolehKosong onUbah={(v) => gaya({ latar: v })} />
        </>
      )}
      {(e.tipe === "teks" || e.tipe === "bentuk") && <InputWarna id="stGaris" label="Garis tepi" nilai={g.garis} palet={palet} bolehKosong onUbah={(v) => gaya({ garis: v })} />}
      {e.tipe !== "emoji" && <Angka id="stSudut" label="Sudut membulat" nilai={g.sudut} min={0} max={50} onUbah={(v) => gaya({ sudut: v })} />}
      <div className="form-check form-switch mb-2">
        <input className="form-check-input" type="checkbox" role="switch" id="stBayang" checked={!!g.bayangan} onChange={(x) => gaya({ bayangan: x.target.checked })} />
        <label className="form-check-label small" htmlFor="stBayang">Bayangan</label>
      </div>
      <Angka id="stBuram" label="Kejelasan" nilai={g.buram ?? 1} min={0.1} max={1} step={0.05} onUbah={(v) => gaya({ buram: v })} />
      <Angka id="stRot" label="Putaran" nilai={e.rot} min={-180} max={180} onUbah={(v) => onUbah({ rot: v })} satuan="°" />

      <hr className="my-2" />
      <div className="small text-uppercase text-body-secondary fw-bold mb-2">Animasi</div>
      <div className="mb-2"><Label htmlFor="stMasuk">Masuk</Label>
        <select id="stMasuk" className="form-select form-select-sm" value={e.masuk?.preset} onChange={(x) => masuk({ preset: x.target.value })}>{MASUK.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="row g-2">
        <div className="col-6"><Label htmlFor="stMulai">Mulai (detik)</Label><input id="stMulai" type="number" className="form-control form-control-sm" min={0} max={30} step={0.1} value={e.masuk?.mulai ?? 0} onChange={(x) => masuk({ mulai: Number(x.target.value) })} /></div>
        <div className="col-6"><Label htmlFor="stLama">Lama (detik)</Label><input id="stLama" type="number" className="form-control form-control-sm" min={0.1} max={5} step={0.1} value={e.masuk?.durasi ?? 0.6} onChange={(x) => masuk({ durasi: Number(x.target.value) })} /></div>
      </div>
      <div className="mt-2"><Label htmlFor="stGerak">Gerak setelah muncul</Label>
        <select id="stGerak" className="form-select form-select-sm" value={e.gerak} onChange={(x) => onUbah({ gerak: x.target.value })}>{GERAK.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
    </div>
  );
}

export function PanelAdegan({ a, nomor, palet, onUbah, onUnggah }) {
  const l = a.latar || {};
  const latar = (x) => onUbah({ latar: { ...l, ...x } });
  return (
    <div>
      <div className="small text-uppercase text-body-secondary fw-bold mb-2">Adegan {nomor}</div>
      <div className="mb-2"><Label htmlFor="stNarasi">Narasi (dibacakan suara AI & jadi subtitle)</Label>
        <textarea id="stNarasi" className="form-control form-control-sm" rows={3} maxLength={600} value={a.narasi} onChange={(x) => onUbah({ narasi: x.target.value })} placeholder="Tulis kalimat yang dibacakan pada adegan ini…" /></div>
      <Angka id="stDurasi" label="Lama adegan" nilai={a.durasi ?? 4} min={2} max={30} step={0.5} satuan="detik; diperpanjang otomatis bila narasi lebih lama" onUbah={(v) => onUbah({ durasi: v })} />
      <div className="mb-2"><Label htmlFor="stTransisi">Transisi masuk</Label>
        <select id="stTransisi" className="form-select form-select-sm" value={a.transisi} onChange={(x) => onUbah({ transisi: x.target.value })}>{TRANSISI.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}</select></div>
      <hr className="my-2" />
      <div className="small text-uppercase text-body-secondary fw-bold mb-2">Latar</div>
      <div className="btn-group btn-group-sm w-100 mb-2" role="group" aria-label="Jenis latar">
        {[["warna", "Warna"], ["gradien", "Gradien"], ["gambar", "Gambar"]].map(([v, lb]) => (
          <button key={v} type="button" className={`btn ${l.tipe === v ? "btn-primary" : "btn-outline-primary"}`} onClick={() => latar({ tipe: v })}>{lb}</button>
        ))}
      </div>
      {l.tipe !== "gambar" && <InputWarna id="stLatar1" label={l.tipe === "gradien" ? "Warna 1" : "Warna latar"} nilai={l.warna} palet={palet} onUbah={(v) => latar({ warna: v })} />}
      {l.tipe === "gradien" && <InputWarna id="stLatar2" label="Warna 2" nilai={l.warna2} palet={palet} onUbah={(v) => latar({ warna2: v })} />}
      {l.tipe === "gambar" && (
        <>
          <div className="mb-2"><Label htmlFor="stLatarGambar">Gambar latar</Label>
            <input id="stLatarGambar" type="file" className="form-control form-control-sm" accept="image/png,image/jpeg,image/webp" onChange={async (x) => { const f = x.target.files?.[0]; if (f) { const url = await onUnggah(f); if (url) latar({ gambar: url }); } }} /></div>
          <Angka id="stRedup" label="Gelapkan gambar" nilai={l.redup ?? 0} min={0} max={0.8} step={0.05} onUbah={(v) => latar({ redup: v })} />
        </>
      )}
    </div>
  );
}

export function PanelMerek({ merek, onUbah, onUnggah, onSimpanSekolah, bolehSimpan }) {
  const warna = merek.warna || [];
  return (
    <div>
      <div className="small text-uppercase text-body-secondary fw-bold mb-2">Merek sekolah</div>
      <div className="mb-2"><Label htmlFor="stLogo">Logo (tampil di semua adegan)</Label>
        <input id="stLogo" type="file" className="form-control form-control-sm" accept="image/png,image/jpeg,image/webp" onChange={async (x) => { const f = x.target.files?.[0]; if (f) { const url = await onUnggah(f); if (url) onUbah({ logo: url }); } }} />
        {merek.logo && <button type="button" className="btn btn-link btn-sm px-0" onClick={() => onUbah({ logo: null })}>Hapus logo</button>}</div>
      <div className="mb-2"><Label htmlFor="stPosLogo">Posisi logo</Label>
        <select id="stPosLogo" className="form-select form-select-sm" value={merek.posisi_logo} onChange={(x) => onUbah({ posisi_logo: x.target.value })}>
          {[["kanan-atas", "Kanan atas"], ["kiri-atas", "Kiri atas"], ["kanan-bawah", "Kanan bawah"], ["kiri-bawah", "Kiri bawah"], ["tidak", "Sembunyikan"]].map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
        </select></div>
      <div className="mb-2"><Label htmlFor="stHuruf">Huruf</Label>
        <select id="stHuruf" className="form-select form-select-sm" value={merek.huruf} onChange={(x) => onUbah({ huruf: x.target.value })}>{Object.keys(HURUF).map((h) => <option key={h} value={h} style={{ fontFamily: HURUF[h] }}>{h}</option>)}</select></div>
      <Label>Palet warna sekolah</Label>
      <div className="d-flex gap-2 mb-2 flex-wrap">
        {[0, 1, 2, 3].map((i) => (
          <input key={i} type="color" className="form-control form-control-color form-control-sm" value={warna[i] || "#ffffff"} aria-label={`Warna merek ${i + 1}`}
            onChange={(x) => { const w = [...warna]; w[i] = x.target.value; onUbah({ warna: w.filter(Boolean) }); }} />
        ))}
      </div>
      {bolehSimpan && <button type="button" className="btn btn-sm btn-outline-primary" onClick={onSimpanSekolah}><i className="bi bi-bookmark-check me-1"></i>Jadikan merek bawaan sekolah</button>}
    </div>
  );
}
