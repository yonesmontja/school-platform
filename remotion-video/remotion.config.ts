// Konfigurasi Remotion untuk video media belajar sekolah.
// Studio: npm run studio → http://localhost:3003 (3000/3001 dipakai aplikasi, 3002 dipakai uji saat terbit).
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setStudioPort(3003);
