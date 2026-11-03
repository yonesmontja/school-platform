<?php

namespace App\Services;

use App\Models\SchoolSetting;
use App\Models\TransRencanaRemedial;
use App\Models\User;
use Carbon\Carbon;

/**
 * Pesan WhatsApp untuk orang tua/wali tentang tindak lanjut remedial:
 * RENCANA saat rencana dibuat, HASIL setelah nilai remedialnya dicatat.
 */
class PesanRemedialService
{
    public const RELASI = [
        'siswa:id_siswa,nama_siswa,no_wa,id_ortu,id_wali',
        'siswa.ortu:id_ortu,nama_ayah,nama_ibu,no_wa',
        'siswa.wali:id_wali,nama_wali,no_wa',
        'mapel:id_mapel,nama_mapel,kkm',
        'nilaiAsal:id_nilai,id_materi,nilai',
        'nilaiAsal.materi:id_materi,nama_materi',
        'nilaiAsal.nilaiIndikator.indikator:id_indikator,deskripsi,urutan',
        'nilaiRemedial:id_nilai,id_rencana,nilai,tanggal',
        'jadwal:id_jadwal,mulai,selesai,id_ruangan',
        'jadwal.ruangan:id_ruangan,nama_ruangan',
    ];

    public function __construct(private ?SchoolSetting $settings = null)
    {
        $this->settings ??= SchoolSetting::first();
    }

    /** @return array{id_rencana: string, nama_siswa: string, nomor: string, message: string} */
    public function susun(TransRencanaRemedial $r, string $jenis, User $pengirim): array
    {
        $siswa = $r->siswa;
        $ortu = $siswa?->ortu;
        $wali = $siswa?->wali;
        $namaOrtu = $ortu?->nama_ayah ?: ($ortu?->nama_ibu ?: $wali?->nama_wali);
        $nama = $siswa?->nama_siswa ?? $r->id_siswa;
        $sapaan = $namaOrtu ? "Bapak/Ibu {$namaOrtu}" : "Bapak/Ibu Orang Tua/Wali dari {$nama}";
        $sekolah = $this->settings?->nama_sekolah ?: 'sekolah';
        $kkm = (float) ($r->mapel?->kkm ?? 75);
        $asal = (float) $r->nilaiAsal?->nilai;
        $guru = $pengirim->guru?->nama_guru ?: $pengirim->name;

        $konteks = "👦 Siswa: *{$nama}*\n"
            . "📚 Mata pelajaran: {$r->mapel?->nama_mapel}\n"
            . "📖 Materi: " . ($r->nilaiAsal?->materi?->nama_materi ?? '-') . "\n";

        if ($jenis === 'HASIL') {
            $rem = (float) $r->nilaiRemedial?->nilai;
            $dibatasi = $rem > $kkm && ($this->settings?->batas_nilai_remedial ?? 'KKM') === 'KKM';
            $isi = "Kami dari *{$sekolah}* menyampaikan hasil remedial ananda:\n\n{$konteks}"
                . "📝 Nilai awal: {$this->angka($asal)} → nilai remedial: *{$this->angka($rem)}* (KKM {$this->angka($kkm)})\n"
                . ($dibatasi ? "ℹ️ Sesuai ketentuan sekolah, nilai remedial dicatat {$this->angka($kkm)} pada rapor.\n" : '')
                . "\n" . ($rem >= $kkm
                    ? "✅ Ananda sudah *tuntas*. Terima kasih atas dukungan Bapak/Ibu mendampingi ananda belajar."
                    : "⚠️ Ananda *belum tuntas*. Guru akan menyiapkan tindak lanjut berikutnya; mohon dukungan Bapak/Ibu mendampingi ananda belajar di rumah.");
        } else {
            $belum = $r->nilaiAsal?->nilaiIndikator
                ->filter(fn($ni) => (float) $ni->nilai < $kkm)
                ->sortBy(fn($ni) => $ni->indikator?->urutan)
                ->map(fn($ni) => "  • {$ni->indikator?->deskripsi}")
                ->implode("\n");
            $tanggal = Carbon::parse($r->tanggal_rencana)->locale('id')->translatedFormat('l, j F Y');
            $waktu = $r->jadwal ? ", pukul {$r->jadwal->mulai->format('H:i')}–{$r->jadwal->selesai->format('H:i')}" : '';
            $ruang = $r->jadwal?->ruangan ? " di {$r->jadwal->ruangan->nama_ruangan}" : '';
            $isi = "Kami dari *{$sekolah}* menginformasikan bahwa ananda perlu mengikuti tindak lanjut pembelajaran:\n\n{$konteks}"
                . "📝 Nilai: {$this->angka($asal)} (KKM {$this->angka($kkm)})\n"
                . ($belum ? "🎯 Yang perlu diperkuat:\n{$belum}\n" : '')
                . "\n🗓️ Tindak lanjut: *{$r->opsi_tindakan}* pada {$tanggal}{$waktu}{$ruang}.\n"
                . ($r->catatan ? "📌 Catatan guru: {$r->catatan}\n" : '')
                . "\nMohon dukungan Bapak/Ibu untuk menyemangati dan mendampingi ananda belajar di rumah.";
        }

        return [
            'id_rencana' => $r->id_rencana,
            'nama_siswa' => $nama,
            'nomor' => WhatsAppService::formatNomor($ortu?->no_wa ?: ($wali?->no_wa ?: $siswa?->no_wa)),
            'message' => "Selamat pagi/siang {$sapaan},\n\n{$isi}\n\nTerima kasih.\n\nSalam,\n*{$guru}*",
        ];
    }

    private function angka(float $v): string
    {
        return fmod($v, 1.0) == 0.0 ? (string) (int) $v : number_format($v, 1, ',', '');
    }
}
