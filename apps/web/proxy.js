import { NextResponse } from "next/server";

// Akses publik lewat Cloudflare (tunnel) wajib HTTPS. Cloudflare mengirim header cf-visitor berisi
// skema asli pengunjung; X-Forwarded-Proto tidak bisa dipakai karena Next.js sendiri mengisinya "http"
// untuk akses langsung ke localhost.
export function proxy(request) {
  if (/"scheme":\s*"http"/.test(request.headers.get("cf-visitor") || "")) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    return NextResponse.redirect(`https://${host}${request.nextUrl.pathname}${request.nextUrl.search}`, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
