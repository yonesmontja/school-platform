<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\PengampuMapel;
use App\Models\Subject;

/**
 * Pembagian mengajar per semester. Untuk satu rombel × mapel, guru yang berlaku adalah guru di pengampu_mapel
 * pada semester itu; bila belum diatur, guru bawaan di Mata Pelajaran (subjects.id_guru).
 * Sekolah yang belum mengatur pembagian apa pun berperilaku persis seperti sebelumnya.
 */
class Pengampu
{
    /** Guru yang mengampu mapel di rombel itu pada semester tersebut (bawaan: semester aktif). */
    public static function guru(string $idKelas, string $idMapel, ?string $idPeriode = null): ?string
    {
        $idPeriode ??= RiwayatRombel::periodeAktif();
        return ($idPeriode ? PengampuMapel::where(['id_periode' => $idPeriode, 'id_kelas' => $idKelas, 'id_mapel' => $idMapel])->value('id_guru') : null)
            ?? Subject::whereKey($idMapel)->value('id_guru');
    }

    /** Apakah guru mengampu mapel ini di rombel ini pada semester tersebut. */
    public static function mengampu(string $idGuru, string $idMapel, string $idKelas, ?string $idPeriode = null): bool
    {
        return self::guru($idKelas, $idMapel, $idPeriode) === $idGuru;
    }

    /**
     * Mapel yang diampu guru pada semester itu: mapel yang dibagikan kepadanya, ditambah mapel bawaannya
     * selama masih ada rombel aktif yang belum dibagikan ke guru lain.
     */
    public static function mapelGuru(string $idGuru, ?string $idPeriode = null): array
    {
        $idPeriode ??= RiwayatRombel::periodeAktif();
        $bawaan = Subject::where('id_guru', $idGuru)->pluck('id_mapel')->all();
        if (!$idPeriode) return $bawaan;

        $baris = PengampuMapel::where('id_periode', $idPeriode)->get(['id_kelas', 'id_mapel', 'id_guru']);
        if ($baris->isEmpty()) return $bawaan;

        $dibagi = $baris->where('id_guru', $idGuru)->pluck('id_mapel')->all();
        $jumlahKelas = Classes::aktifSemester($idPeriode)->count();
        $perMapel = $baris->groupBy('id_mapel');
        // Mapel bawaan tetap miliknya bila sebagian rombel belum dibagikan, atau ada rombel yang dibagikan kepadanya
        $sisaBawaan = array_filter($bawaan, fn($m) => !isset($perMapel[$m]) || $perMapel[$m]->count() < $jumlahKelas);
        return array_values(array_unique([...$dibagi, ...$sisaBawaan]));
    }

    /** Rombel tempat guru mengampu mapel itu pada semester tersebut. */
    public static function kelasGuru(string $idGuru, string $idMapel, ?string $idPeriode = null): array
    {
        $idPeriode ??= RiwayatRombel::periodeAktif();
        $baris = $idPeriode ? PengampuMapel::where(['id_periode' => $idPeriode, 'id_mapel' => $idMapel])->pluck('id_guru', 'id_kelas') : collect();
        $bawaan = Subject::whereKey($idMapel)->value('id_guru');
        return Classes::aktifSemester($idPeriode)->pluck('id_kelas')
            ->filter(fn($k) => ($baris[$k] ?? $bawaan) === $idGuru)->values()->all();
    }

    /**
     * Bekukan pengampu sebuah semester: setiap rombel × mapel yang belum punya pembagian dicatat dengan guru bawaan
     * saat ini. Dipanggil saat semester ditutup, agar mengganti guru bawaan di Mata Pelajaran kelak tidak mengubah
     * keterangan pengampu semester yang sudah lewat.
     */
    public static function bekukan(string $idPeriode): int
    {
        $now = now();
        $ada = PengampuMapel::where('id_periode', $idPeriode)->get(['id_kelas', 'id_mapel'])->map(fn($r) => "{$r->id_kelas}|{$r->id_mapel}")->flip();
        $mapel = Subject::whereNotNull('id_guru')->pluck('id_guru', 'id_mapel');
        $baru = [];
        foreach (Classes::aktifSemester($idPeriode)->pluck('id_kelas') as $k) {
            foreach ($mapel as $m => $g) {
                if (!$ada->has("$k|$m")) $baru[] = ['id_periode' => $idPeriode, 'id_kelas' => $k, 'id_mapel' => $m, 'id_guru' => $g, 'created_at' => $now, 'updated_at' => $now];
            }
        }
        foreach (array_chunk($baru, 500) as $c) PengampuMapel::insert($c);
        return count($baru);
    }

    /**
     * Ganti relasi mapel.guru pada data berperiode & berombel (ATP, modul ajar, paket soal, kisi-kisi) dengan pengampu
     * pada semester & rombel data itu, bukan guru bawaan sekarang. Model mapel di-clone agar data lain tidak ikut berubah.
     */
    public static function terapkanPadaMapel(iterable|\Illuminate\Database\Eloquent\Model $items): void
    {
        $items = collect($items instanceof \Illuminate\Database\Eloquent\Model ? [$items] : $items)
            // Lewat getAttributes: model tanpa kolom periode/rombel (atau kolom tidak dipilih) dilewati tanpa galat mode ketat
            ->filter(fn($i) => $i && $i->relationLoaded('mapel') && $i->mapel
                && !empty($i->getAttributes()['id_kelas']) && !empty($i->getAttributes()['id_periode']) && !empty($i->getAttributes()['id_mapel']));
        if ($items->isEmpty()) return;
        $baris = PengampuMapel::with('guru:id_guru,nama_guru')->whereIn('id_periode', $items->pluck('id_periode')->unique())
            ->whereIn('id_mapel', $items->pluck('id_mapel')->unique())->get()
            ->keyBy(fn($r) => "{$r->id_periode}|{$r->id_kelas}|{$r->id_mapel}");
        foreach ($items as $i) {
            $r = $baris["{$i->id_periode}|{$i->id_kelas}|{$i->id_mapel}"] ?? null;
            if (!$r) continue;
            $mapel = (clone $i->mapel)->setAttribute('id_guru', $r->id_guru)->setRelation('guru', $r->guru);
            $i->setRelation('mapel', $mapel);
        }
    }

    /** Salin pembagian mengajar dari satu semester ke semester lain (baris yang sudah ada tidak ditimpa). */
    public static function salin(string $dari, string $ke): int
    {
        $now = now();
        $ada = PengampuMapel::where('id_periode', $ke)->get(['id_kelas', 'id_mapel'])->map(fn($r) => "{$r->id_kelas}|{$r->id_mapel}")->flip();
        $baru = PengampuMapel::where('id_periode', $dari)->get()
            ->reject(fn($r) => $ada->has("{$r->id_kelas}|{$r->id_mapel}"))
            ->map(fn($r) => ['id_periode' => $ke, 'id_kelas' => $r->id_kelas, 'id_mapel' => $r->id_mapel, 'id_guru' => $r->id_guru, 'created_at' => $now, 'updated_at' => $now]);
        foreach ($baru->chunk(500) as $c) PengampuMapel::insert($c->values()->all());
        return $baru->count();
    }
}
