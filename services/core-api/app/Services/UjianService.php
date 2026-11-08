<?php

namespace App\Services;

use App\Models\PaketSoal;
use App\Models\PaketSoalJawaban;
use Illuminate\Support\Carbon;

/**
 * Sesi tes online siswa: urutan acak per siswa, batas waktu dari server, soal tanpa kunci,
 * dan penutupan otomatis sesi yang waktunya habis.
 */
class UjianService
{
    // Kelonggaran jaringan setelah waktu habis: jawaban yang terkirim dalam selang ini masih diterima
    public const TOLERANSI_DETIK = 30;

    /** Batas waktu sesi: mulai + durasi, tidak melewati jadwal tutup paket. */
    public static function batas(PaketSoal $paket, PaketSoalJawaban $j): ?Carbon
    {
        $batas = $paket->durasi_menit && $j->mulai_pada ? $j->mulai_pada->copy()->addMinutes($paket->durasi_menit) : null;
        if ($paket->online_selesai && (!$batas || $paket->online_selesai->lt($batas))) $batas = $paket->online_selesai->copy();
        return $batas;
    }

    public static function habis(PaketSoal $paket, PaketSoalJawaban $j, int $toleransi = 0): bool
    {
        $batas = self::batas($paket, $j);
        return $batas !== null && now()->gt($batas->copy()->addSeconds($toleransi));
    }

    /** Status paket untuk satu siswa: BELUM_DIBUKA | TERSEDIA | MENGERJAKAN | SELESAI | DITUTUP. */
    public static function status(PaketSoal $paket, ?PaketSoalJawaban $j): string
    {
        if ($j && ($j->selesai_pada || $j->sumber === 'KERTAS')) return 'SELESAI';
        if ($j && $j->mulai_pada) return 'MENGERJAKAN';
        if ($paket->online_mulai && now()->lt($paket->online_mulai)) return 'BELUM_DIBUKA';
        if ($paket->online_selesai && now()->gte($paket->online_selesai)) return 'DITUTUP';
        return 'TERSEDIA';
    }

    /** Urutan butir dan pilihan acak untuk satu siswa (disimpan agar tetap sama saat halaman dibuka ulang). */
    public static function buatUrutan(PaketSoal $paket): array
    {
        $acak = function (int $n) {
            $i = range(0, max(0, $n - 1));
            if ($n) shuffle($i);
            return $n ? $i : [];
        };
        $butir = $paket->butir->pluck('id')->all();
        if ($paket->acak_soal) shuffle($butir);
        $pilihan = [];
        foreach ($paket->butir as $b) {
            $isi = $b->soal['isi'] ?? [];
            $pilihan[$b->id] = match ($b->soal['bentuk']) {
                'PG', 'PG_KOMPLEKS' => $paket->acak_pilihan ? $acak(count($isi['pilihan'] ?? [])) : range(0, max(0, count($isi['pilihan'] ?? []) - 1)),
                // Kolom kanan, langkah, dan bank kata selalu diacak: urutan aslinya adalah kuncinya
                'MENJODOHKAN' => $acak(count($isi['pasangan'] ?? [])),
                'MENGURUTKAN' => self::acakBeda($acak, count($isi['urutan'] ?? [])),
                'LENGKAPI_GAMBAR' => $acak(count($isi['bank_kata'] ?? [])),
                default => [],
            };
        }
        return ['butir' => $butir, 'pilihan' => $pilihan];
    }

    // Untuk mengurutkan, hindari urutan acak yang kebetulan sudah benar
    private static function acakBeda(callable $acak, int $n): array
    {
        $hasil = $acak($n);
        for ($coba = 0; $n > 1 && $hasil === range(0, $n - 1) && $coba < 5; $coba++) $hasil = $acak($n);
        return $hasil;
    }

    /** Soal untuk siswa sesuai urutannya, tanpa kunci, rubrik, maupun pembahasan. */
    public static function soalSiswa(PaketSoal $paket, PaketSoalJawaban $j): array
    {
        $urutan = $j->urutan ?? self::buatUrutan($paket);
        $perId = $paket->butir->keyBy('id');
        $ids = array_values(array_filter($urutan['butir'] ?? [], fn($id) => $perId->has($id)));
        foreach ($perId->keys() as $id) if (!in_array($id, $ids, true)) $ids[] = $id; // butir yang ditambahkan belakangan

        return array_map(function ($id) use ($perId, $urutan) {
            $b = $perId[$id];
            $s = $b->soal;
            $isi = $s['isi'] ?? [];
            $susun = fn(array $daftar, $kunciIsi) => array_map(fn($i) => ['i' => $i, 'teks' => $kunciIsi($daftar[$i])],
                self::urutanSah($urutan['pilihan'][$id] ?? $urutan['pilihan'][(string) $id] ?? [], count($daftar)));
            $data = [
                'id' => $b->id, 'bentuk' => $s['bentuk'], 'pertanyaan' => $s['pertanyaan'], 'skor_maks' => $b->skor_maks,
                'gambar_svg' => $s['gambar_svg'] ?? null, 'gambar_url' => $s['gambar_url'] ?? null,
                'video' => isset($s['video']['file_url']) ? array_intersect_key($s['video'], array_flip(['judul', 'file_url', 'poster_url', 'durasi_detik'])) : null,
            ];
            return $data + match ($s['bentuk']) {
                'PG', 'PG_KOMPLEKS' => ['pilihan' => $susun($isi['pilihan'] ?? [], fn($t) => $t)],
                'BENAR_SALAH' => ['pernyataan' => $isi['pernyataan'] ?? []],
                'MENJODOHKAN' => ['kiri' => array_column($isi['pasangan'] ?? [], 'kiri'), 'kanan' => $susun($isi['pasangan'] ?? [], fn($p) => $p['kanan'])],
                'MENGURUTKAN' => ['langkah' => $susun($isi['urutan'] ?? [], fn($t) => $t)],
                'MEMBACA_NYARING' => ['teks' => $isi['teks'] ?? ''],
                'LENGKAPI_GAMBAR' => ['jumlah_bagian' => count($s['kunci']['jawaban'] ?? []), 'bank_kata' => array_column($susun($isi['bank_kata'] ?? [], fn($t) => $t), 'teks')],
                default => [],
            };
        }, $ids);
    }

    private static function urutanSah(array $urutan, int $n): array
    {
        $urutan = array_values(array_filter(array_map('intval', $urutan), fn($i) => $i >= 0 && $i < $n));
        return count(array_unique($urutan)) === $n ? $urutan : range(0, max(0, $n - 1));
    }

    /** Tutup sesi: catat waktu selesai dan hitung skornya. */
    public static function selesaikan(PaketSoal $paket, PaketSoalJawaban $j, ?Carbon $pada = null): void
    {
        if ($j->selesai_pada) return;
        $j->selesai_pada = $pada ?? now();
        PaketSoalService::hitung($j, $paket->butir);
        $j->save();
    }

    /** Tutup semua sesi paket ini yang waktunya sudah habis (dipanggil saat guru membuka koreksi/pantau/analisis). */
    public static function tutupKedaluwarsa(PaketSoal $paket): void
    {
        $paket->loadMissing('butir');
        $paket->jawaban()->where('sumber', 'ONLINE')->whereNull('selesai_pada')->get()
            ->each(function ($j) use ($paket) {
                if (self::habis($paket, $j, self::TOLERANSI_DETIK)) self::selesaikan($paket, $j, self::batas($paket, $j));
            });
    }
}
