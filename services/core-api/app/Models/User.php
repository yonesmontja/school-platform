<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use App\Support\Administrasi;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'username', 'password', 'role', 'id_guru', 'id_siswa', 'id_ortu', 'id_wali', 'aktif', 'wajib_ganti_password', 'login_terakhir'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLES = ['admin', 'kepsek', 'guru', 'siswa', 'ortu', 'wakakur', 'wakasis', 'yayasan', 'operator'];
    /** Peninjau (wakasek kurikulum, wakasek kesiswaan, yayasan): melihat seluruh data seperti kepala sekolah, tanpa mengubah. */
    public const PENINJAU = ['wakakur', 'wakasis', 'yayasan'];
    public const STAF = ['admin', 'kepsek', 'guru'];
    public const PORTAL = ['siswa', 'ortu'];
    /** Operator Sekolah (staf TU bukan guru): hanya membuka submodul Administrasi yang diberikan kepala sekolah. */
    public const OPERATOR = 'operator';

    private ?array $cacheKelasBinaan = null;
    private ?array $cacheMapelDiampu = null;
    private ?array $cacheSiswaTerjangkau = null;
    private ?array $cacheAdministrasi = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'login_terakhir' => 'datetime',
            'password' => 'hashed',
            'aktif' => 'boolean',
            'wajib_ganti_password' => 'boolean',
        ];
    }

    public function guru(): BelongsTo { return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru'); }
    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function ortu(): BelongsTo { return $this->belongsTo(MasterOrtu::class, 'id_ortu', 'id_ortu'); }
    public function wali(): BelongsTo { return $this->belongsTo(MasterWali::class, 'id_wali', 'id_wali'); }
    public function penunjukanOperator(): HasOne { return $this->hasOne(OperatorSekolah::class, 'id_user'); }

    public function isAdmin(): bool { return $this->role === 'admin'; }
    public function isKepsek(): bool { return $this->role === 'kepsek'; }
    public function isGuru(): bool { return $this->role === 'guru'; }
    public function isStaf(): bool { return in_array($this->role, self::STAF, true); }
    public function isPortal(): bool { return in_array($this->role, self::PORTAL, true); }
    public function isPeninjau(): bool { return in_array($this->role, self::PENINJAU, true); }
    public function isOperator(): bool { return $this->role === self::OPERATOR; }

    /**
     * Kode submodul Administrasi yang boleh dibuka akun ini. Admin, kepala sekolah, dan peninjau (baca saja) melihat semua;
     * guru dan operator hanya yang ditunjuk kepala sekolah; akun portal tidak pernah.
     */
    public function submodulAdministrasi(): array
    {
        if ($this->cacheAdministrasi !== null) return $this->cacheAdministrasi;
        if ($this->isPengelola()) return $this->cacheAdministrasi = Administrasi::kode();
        if (!$this->isGuru() && !$this->isOperator()) return $this->cacheAdministrasi = [];
        return $this->cacheAdministrasi = Administrasi::rapikan((array) ($this->penunjukanOperator?->submodul ?? []));
    }

    public function bolehAdministrasi(?string $kode = null): bool
    {
        $daftar = $this->submodulAdministrasi();
        return $kode === null ? $daftar !== [] : in_array($kode, $daftar, true);
    }

    // Admin & kepsek mengelola seluruh data akademik tanpa batasan kelas/mapel. Peninjau ikut melihat seluruh data;
    // perubahan oleh peninjau sudah ditolak middleware 'role' sebelum sampai ke controller.
    public function isPengelola(): bool { return $this->isAdmin() || $this->isKepsek() || $this->isPeninjau(); }

    /** Kelas yang wali kelasnya adalah guru akun ini */
    public function kelasBinaan(): array
    {
        if (!$this->id_guru) return [];
        return $this->cacheKelasBinaan ??= Classes::where('wali_kelas', $this->id_guru)->pluck('id_kelas')->all();
    }

    /** Mapel yang diampu guru akun ini */
    public function mapelDiampu(): array
    {
        if (!$this->id_guru) return [];
        return $this->cacheMapelDiampu ??= Subject::where('id_guru', $this->id_guru)->pluck('id_mapel')->all();
    }

    /** Siswa yang datanya boleh dilihat akun portal: dirinya sendiri (siswa) atau anaknya (ortu/wali) */
    public function siswaTerjangkau(): array
    {
        return $this->cacheSiswaTerjangkau ??= match ($this->role) {
            'siswa' => array_filter([$this->id_siswa]),
            'ortu' => Student::where(function ($q) {
                if ($this->id_ortu) $q->orWhere('id_ortu', $this->id_ortu);
                if ($this->id_wali) $q->orWhere('id_wali', $this->id_wali);
                if (!$this->id_ortu && !$this->id_wali) $q->whereRaw('1 = 0');
            })->pluck('id_siswa')->all(),
            default => [],
        };
    }

    /**
     * Boleh membuka data portal siswa ini: akun portalnya sendiri (siswa/ortu), atau sebagai "dashboard pribadi siswa"
     * oleh admin, kepala sekolah (semua siswa), dan wali kelas (siswa di kelas binaannya). Peninjau tidak.
     */
    public function bolehDashboardSiswa(Student $siswa): bool
    {
        if ($this->isPortal()) return in_array($siswa->id_siswa, $this->siswaTerjangkau(), true);
        if ($this->isAdmin() || $this->isKepsek()) return true;
        return $this->isGuru() && $siswa->id_kelas && in_array($siswa->id_kelas, $this->kelasBinaan(), true);
    }

    /** Boleh mengelola rapor, catatan wali, & P5 kelas ini (pengelola atau wali kelasnya) */
    public function bolehKelolaKelas(?string $idKelas): bool
    {
        return $this->isPengelola() || ($this->isGuru() && $idKelas && in_array($idKelas, $this->kelasBinaan(), true));
    }

    /** Boleh menginput nilai mapel ini (pengelola atau guru pengampunya) */
    public function bolehNilaiMapel(?string $idMapel): bool
    {
        return $this->isPengelola() || ($this->isGuru() && $idMapel && in_array($idMapel, $this->mapelDiampu(), true));
    }

    /** Ringkasan akses yang dikirim ke frontend untuk menyusun menu & tombol */
    public function profilAkses(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'username' => $this->username,
            'role' => $this->role,
            'id_guru' => $this->id_guru,
            'id_siswa' => $this->id_siswa,
            'wajib_ganti_password' => $this->wajib_ganti_password,
            'kelas_binaan' => $this->kelasBinaan(),
            'mapel_diampu' => $this->mapelDiampu(),
            'siswa_terjangkau' => $this->siswaTerjangkau(),
            'peninjau' => $this->isPeninjau(),
            // Submodul Administrasi Sekolah yang boleh dibuka (Fase 26)
            'administrasi' => $this->submodulAdministrasi(),
            // Studio Rakit Video: hanya satu pengguna yang ditunjuk admin
            'studio_video' => $this->isStaf() && SchoolSetting::query()->value('id_pembuat_video') === $this->id,
        ];
    }
}
