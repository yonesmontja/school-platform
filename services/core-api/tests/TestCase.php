<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * Pengaman: RefreshDatabase mengosongkan database. Tes hanya boleh jalan di database
     * yang namanya berakhiran _test, agar data sekolah tidak pernah ikut terhapus.
     */
    protected function setUpTraits()
    {
        $koneksi = config('database.default');
        $nama = (string) config("database.connections.$koneksi.database");
        if (!str_ends_with($nama, '_test')) {
            throw new RuntimeException("Tes dibatalkan: database '$nama' bukan database tes (harus berakhiran _test).");
        }

        return parent::setUpTraits();
    }
}
