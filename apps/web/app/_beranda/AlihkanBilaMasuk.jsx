"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { bacaUser, halamanAwal } from "../lib/akses";

/** Pengguna yang sudah masuk (token tersimpan) langsung diteruskan ke halaman awal perannya; beranda hanya untuk tamu. */
export default function AlihkanBilaMasuk() {
  const router = useRouter();
  useEffect(() => {
    let token = null;
    try { token = localStorage.getItem("token"); } catch { /* penyimpanan diblokir: tetap di beranda */ }
    if (!token) return;
    const user = bacaUser();
    router.replace(user ? halamanAwal(user) : "/dashboard");
  }, [router]);
  return null;
}
