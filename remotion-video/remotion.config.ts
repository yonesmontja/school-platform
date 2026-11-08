// Konfigurasi Remotion untuk video media belajar sekolah.
// Studio: npm run studio → http://localhost:3003 (3000/3001 dipakai aplikasi, 3002 dipakai uji saat terbit).
import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setStudioPort(3003);

// Templat bersama diimpor dari apps/web: pastikan React & Remotion yang dipakai hanya satu salinan (milik folder ini)
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    alias: {
      ...(c.resolve?.alias as Record<string, string>),
      react: path.resolve("node_modules/react"),
      "react-dom": path.resolve("node_modules/react-dom"),
      remotion: path.resolve("node_modules/remotion"),
    },
  },
}));
