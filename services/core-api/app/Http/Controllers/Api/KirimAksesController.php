<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\KirimAkses;
use App\Models\SchoolSetting;
use App\Models\User;
use App\Services\WhatsAppService;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Pesan akses aplikasi lewat WhatsApp (khusus Admin): salam hormat, username, kata sandi, dan alamat aplikasi.
 * - Hanya bisa disiapkan pada jam efektif belajar (Senin–Jumat 07:30–12:00 waktu sekolah, bawaan WIT).
 * - Kata sandi diketik Admin dan dicocokkan dengan akun; bila tidak cocok pesan ditolak, kecuali Admin memilih
 *   menetapkannya sebagai kata sandi baru (pemilik akun lalu wajib menggantinya saat login).
 * - Pesan disalin Admin atau dibuka di aplikasi WhatsApp; riwayat dicatat tanpa kata sandi dan tanpa isi pesan.
 */
class KirimAksesController extends Controller
{
    public const JAM_MULAI = '07:30';
    public const JAM_SELESAI = '12:00';
    private const NAMA_HARI = [1 => 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

    /** Status jam kirim saat ini beserta kapan dibuka berikutnya. */
    public static function jendela(?CarbonImmutable $sekarang = null): array
    {
        $zona = config('app.zona_sekolah', 'Asia/Jayapura');
        $now = ($sekarang ?? CarbonImmutable::now())->setTimezone($zona);
        $hariKerja = fn (CarbonImmutable $t) => $t->dayOfWeekIso <= 5;
        $mulai = fn (CarbonImmutable $t) => $t->setTimeFromTimeString(self::JAM_MULAI);
        $selesai = fn (CarbonImmutable $t) => $t->setTimeFromTimeString(self::JAM_SELESAI);
        $buka = config('app.akses_wa_selalu_buka') || ($hariKerja($now) && $now->gte($mulai($now)) && $now->lt($selesai($now)));

        $berikut = null;
        if (!$buka) {
            $t = $hariKerja($now) && $now->lt($mulai($now)) ? $mulai($now) : $mulai($now->addDay());
            while (!$hariKerja($t)) $t = $t->addDay();
            $berikut = $t;
        }
        $label = ['Asia/Jayapura' => 'WIT', 'Asia/Makassar' => 'WITA', 'Asia/Jakarta' => 'WIB', 'Asia/Pontianak' => 'WIB'][$zona] ?? $now->format('T');

        return [
            'buka' => $buka,
            'mulai' => self::JAM_MULAI, 'selesai' => self::JAM_SELESAI, 'zona' => $label,
            'sekarang' => $now->format('H:i'),
            'berikutnya' => $berikut?->toIso8601String(),
            'keterangan' => $buka
                ? 'Jam kirim akses sedang dibuka sampai ' . self::JAM_SELESAI . " {$label}."
                : 'Pesan akses hanya bisa disiapkan Senin–Jumat pukul ' . self::JAM_MULAI . '–' . self::JAM_SELESAI . " {$label}. Dibuka lagi "
                    . self::NAMA_HARI[$berikut->dayOfWeekIso] . ' ' . $berikut->format('d/m') . ' pukul ' . self::JAM_MULAI . " {$label}.",
        ];
    }

    /** Nomor WA bawaan: data guru untuk staf, nomor siswa/orang tua untuk akun siswa, data ortu/wali untuk akun orang tua. */
    public static function nomorBawaan(User $user): ?string
    {
        $user->loadMissing(['guru:id_guru,no_wa', 'siswa:id_siswa,no_wa,id_ortu,id_wali', 'siswa.ortu:id_ortu,no_wa', 'siswa.wali:id_wali,no_wa', 'ortu:id_ortu,no_wa', 'wali:id_wali,no_wa']);
        $calon = match ($user->role) {
            'siswa' => [$user->siswa?->no_wa, $user->siswa?->ortu?->no_wa, $user->siswa?->wali?->no_wa],
            'ortu' => [$user->ortu?->no_wa, $user->wali?->no_wa],
            default => [$user->guru?->no_wa],
        };
        foreach ($calon as $n) if (trim((string) $n) !== '') return trim($n);
        return null;
    }

    public function show($id)
    {
        $user = User::findOrFail($id);
        return response()->json([
            'nomor' => self::nomorBawaan($user),
            'login' => $user->username ?: $user->email,
            'aktif' => (bool) $user->aktif,
            'jendela' => self::jendela(),
            'terakhir' => KirimAkses::where('user_id', $user->id)->latest('id')->first(['created_at', 'tindakan']),
        ]);
    }

    public function siapkan(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $request->validate([
            'no_wa' => ['required', 'string', 'max:30', 'regex:/^[0-9+\-\s().]{8,30}$/'],
            'password' => 'required|string|max:100',
            'tetapkan' => 'nullable|boolean',
        ], ['no_wa.regex' => 'Nomor WhatsApp tidak valid.', 'password.required' => 'Ketik kata sandi akun ini.']);

        $jendela = self::jendela();
        if (!$jendela['buka']) throw ValidationException::withMessages(['jam' => $jendela['keterangan']]);
        if (!$user->aktif) throw ValidationException::withMessages(['akun' => 'Akun ini nonaktif. Aktifkan dulu sebelum mengirim akses.']);
        $login = $user->username ?: $user->email;
        if (!$login) throw ValidationException::withMessages(['akun' => 'Akun ini belum punya username atau email.']);

        $tetapkan = $request->boolean('tetapkan');
        if ($tetapkan) {
            if (mb_strlen($request->password) < 8) throw ValidationException::withMessages(['password' => 'Kata sandi baru minimal 8 karakter.']);
            $user->forceFill(['password' => $request->password, 'wajib_ganti_password' => true])->save();
        } elseif (!Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages(['password' => 'Kata sandi tidak cocok dengan akun ini. Periksa lagi, atau centang "Jadikan kata sandi baru".']);
        }

        $nomor = WhatsAppService::formatNomor($request->no_wa);
        $catatan = KirimAkses::create([
            'user_id' => $user->id, 'nama_penerima' => $user->name, 'role' => $user->role, 'login' => $login,
            'no_wa' => $nomor, 'sandi' => $tetapkan ? 'BARU' : 'COCOK', 'tindakan' => 'DISIAPKAN', 'dikirim_oleh' => $request->user()->id,
        ]);
        $teks = $this->teksPesan($user->fresh(), $login, $request->password, $request->user());

        return response()->json([
            'id' => $catatan->id,
            'nomor' => $nomor,
            'teks' => $teks,
            'tautan_wa' => 'https://wa.me/' . $nomor . '?text=' . rawurlencode($teks),
        ]);
    }

    public function tindakan(Request $request, $id)
    {
        $request->validate(['tindakan' => ['required', Rule::in(['DISALIN', 'WHATSAPP'])]]);
        $catatan = KirimAkses::findOrFail($id);
        // WHATSAPP lebih kuat daripada DISALIN: jangan turunkan bila sudah dibuka di WhatsApp
        if (!($catatan->tindakan === 'WHATSAPP' && $request->tindakan === 'DISALIN')) $catatan->update(['tindakan' => $request->tindakan]);
        return response()->json(['success' => true, 'tindakan' => $catatan->tindakan]);
    }

    public function riwayat(Request $request)
    {
        $q = KirimAkses::with(['pengirim:id,name,id_guru', 'penerima:id,name,aktif,login_terakhir'])->latest('id');
        if ($cari = trim((string) $request->query('cari'))) {
            $q->where(fn ($w) => $w->where('nama_penerima', 'ilike', "%{$cari}%")->orWhere('login', 'ilike', "%{$cari}%")->orWhere('no_wa', 'like', "%{$cari}%"));
        }
        if ($role = $request->query('role')) $q->where('role', $role);
        return response()->json(['data' => $q->limit(500)->get(), 'jendela' => self::jendela()]);
    }

    private function teksPesan(User $user, string $login, string $password, User $admin): string
    {
        $sekolah = SchoolSetting::query()->value('nama_sekolah') ?: config('app.name', 'Sekolah');
        $alamat = rtrim(config('app.url_publik', 'https://web.saprapor.com'), '/') . '/';
        $sapaan = $user->role === 'siswa' ? 'Ananda' : 'Bapak/Ibu';

        $baris = [
            "Salam hormat, {$sapaan} *{$user->name}*.",
            '',
            "Berikut akses aplikasi *SAPrapor* {$sekolah}:",
            "🌐 Alamat: {$alamat}",
            "👤 Username: *{$login}*",
            "🔑 Kata sandi: *{$password}*",
            '',
        ];
        if ($user->wajib_ganti_password) $baris[] = 'Saat masuk pertama kali, Anda akan diminta mengganti kata sandi dengan yang baru.';
        array_push($baris,
            'Mohon jaga kerahasiaan akun ini dan jangan dibagikan kepada orang lain.',
            '',
            'Terima kasih.',
            'Hormat kami,',
            $admin->name,
            "Admin SAPrapor {$sekolah}",
        );
        return implode("\n", $baris);
    }
}
