// app/layout.js
import '@adminlte/react/css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'tabulator-tables/dist/css/tabulator_bootstrap5.min.css';
import './globals.css';
import './dashboard-saas.css';
import './theme-dark.css';
import './jadwal.css';
import './mobile.css';
import Script from 'next/script';
import { THEME_INIT_SCRIPT } from './lib/themeScript';

export const metadata = {
  title: 'EduRapor - School Platform',
  description: 'Sistem Informasi Manajemen Sekolah',
  applicationName: 'EduRapor',
  // PWA: dipasang ke layar utama (manifest dari app/manifest.js)
  appleWebApp: { capable: true, title: 'EduRapor', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)', color: '#1e293b' },
  ],
};

export default function RootLayout({ children }) {
  return (
    // data-bs-theme & data-accent diisi skrip tema sebelum halaman tampil
    <html lang="id" data-bs-theme="light" data-accent="biru" suppressHydrationWarning>
      <head>
        {/* beforeInteractive: disisipkan Next.js sebelum hidrasi, bukan dirender React (tag <script> biasa
            memicu peringatan saat pohon dibangun ulang di klien) */}
        <Script id="tema-awal" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="layout-fixed sidebar-expand-lg bg-body-tertiary">
        {children}
        {/* Script Bootstrap JS untuk dropdown, modal, dll */}
        <Script
          src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
