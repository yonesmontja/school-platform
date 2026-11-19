<?php

namespace App\Models;

use App\Services\SoalAIService;
use Illuminate\Database\Eloquent\Model;

/** Catatan riset dalam notebook: jawaban AI lintas dokumen (TANYA) atau tulisan guru sendiri (MANUAL). */
class NotebookCatatan extends Model
{
    protected $table = 'notebook_catatan';

    public const JENIS = ['TANYA', 'MANUAL'];

    protected $fillable = ['id_notebook', 'jenis', 'judul', 'isi', 'rujukan', 'ai_mode', 'dibuat_oleh'];
    protected $casts = ['rujukan' => 'array'];

    public function notebook() { return $this->belongsTo(Notebook::class, 'id_notebook', 'id_notebook'); }

    /** Catatan milik akun ini (notebook pribadi), atau 404. */
    public static function milik(int $id, User $u): self
    {
        return self::with('notebook.dokumen:id_dokumen,judul')->whereHas('notebook', fn($q) => $q->where('dibuat_oleh', $u->id))->findOrFail($id);
    }

    /** Catatan sebagai teks polos untuk bahan AI lain, dengan bagian dokumen yang dirujuk. */
    public function keTeks(int $maks = 12000): string
    {
        $baris = ["Catatan riset: {$this->judul}", $this->isi];
        foreach ($this->rujukan ?? [] as $b) $baris[] = "[B{$b['no']} · {$b['judul']}] " . ($b['teks'] ?? '');
        return mb_substr(trim(implode("\n", $baris)), 0, $maks);
    }

    /** Label sumber untuk pesan dan bahan rujukan AI. */
    public function label(): string
    {
        $dok = $this->notebook?->dokumen?->pluck('judul')->implode('; ');
        return "Notebook \"{$this->notebook?->judul}\"" . ($dok ? " ({$dok})" : '');
    }

    /**
     * Tambahkan catatan notebook ke bahan rujukan AI (dipakai Jadikan… ATP, modul ajar, peta tema, soal).
     * @return string|null kalimat penutup pesan
     */
    public static function pasang(SoalAIService $ai, mixed $id, User $u): ?string
    {
        if (!$id) return null;
        $c = self::milik((int) $id, $u);
        $ai->tambahRujukan("[{$c->label()}]\n" . $c->keTeks()
            . "\n(Bahan utama dari catatan riset guru: jadikan dasar isi yang disusun, tanpa mengarang hal di luar bahan dan data sekolah.)");
        return " Bahan dari catatan Notebook \"{$c->judul}\".";
    }
}
