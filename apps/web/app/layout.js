// app/layout.js
import '@adminlte/react/css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'tabulator-tables/dist/css/tabulator_bootstrap5.min.css';
import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'EduRapor - School Platform',
  description: 'Sistem Informasi Manajemen Sekolah',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
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