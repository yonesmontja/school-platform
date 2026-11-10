// Proyek Revideo layanan render: satu scene "rakitan" yang membaca naskah dari variabel `naskah`.
// Ukuran bingkai diatur per render oleh worker (projectSettings.size) sesuai rasio naskah.
import { makeProject } from "@revideo/core";
import rakitan from "./rakitan.js";

export default makeProject({
  scenes: [rakitan],
  settings: { shared: { size: { x: 1280, y: 720 }, background: "#000000" }, rendering: { fps: 30 } },
});
