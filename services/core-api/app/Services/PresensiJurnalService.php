<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\TransJurnal;
use Illuminate\Support\Str;

/**
 * Keterangan presensi (mis. "sakit demam") tercatat otomatis ke jurnal sebagai catatan terpisah (mode PISAH, tidak
 * masuk nilai rapor) dengan skor STNKM kosong. Satu baris presensi = satu jurnal: diperbarui bila keterangan berubah,
 * dihapus bila keterangan dikosongkan.
 */
class PresensiJurnalService
{
    public const AWALAN = '[Presensi]';
    private const LABEL = ['HADIR' => 'Hadir', 'SAKIT' => 'Sakit', 'IZIN' => 'Izin', 'ALPA' => 'Alpa'];

    /**
     * @param array{tanggal: string, id_siswa: string, id_kelas: string, status: string, keterangan: ?string, sumber: string, id_guru: ?string} $d
     * @return string|null id jurnal yang kini tertaut (null bila tidak ada keterangan)
     */
    public function sinkron(?string $idJurnal, array $d): ?string
    {
        $jurnal = $idJurnal ? TransJurnal::find($idJurnal) : null;
        $keterangan = trim((string) ($d['keterangan'] ?? ''));

        if ($keterangan === '') {
            // Hanya jurnal yang dibuat otomatis dari presensi yang ikut terhapus
            if ($jurnal && str_starts_with((string) $jurnal->narasi_kejadian, self::AWALAN)) $jurnal->delete();
            return null;
        }

        $narasi = Str::limit(self::AWALAN . " {$d['sumber']}: " . (self::LABEL[$d['status']] ?? $d['status']) . " — {$keterangan}", 2000, '');
        $data = [
            'tanggal' => $d['tanggal'],
            'id_siswa' => $d['id_siswa'],
            'id_kelas' => $d['id_kelas'],
            'id_guru' => $d['id_guru'] ?? Classes::whereKey($d['id_kelas'])->value('wali_kelas'),
            'narasi_kejadian' => $narasi,
            'mode_dampak' => 'PISAH',
            'val_S' => 0, 'val_T' => 0, 'val_N' => 0, 'val_K' => 0, 'val_M' => 0,
            'ai_mode' => 'HEURISTIK',
        ];
        if ($jurnal) {
            // Skor STNKM yang sudah dianalisis guru di menu Jurnal tidak ditimpa
            $jurnal->update(array_diff_key($data, array_flip(['val_S', 'val_T', 'val_N', 'val_K', 'val_M', 'ai_mode'])));
            return $jurnal->id_jurnal;
        }
        return TransJurnal::create(['id_jurnal' => 'JRN-' . Str::uuid(), ...$data])->id_jurnal;
    }
}
