// Daftar video. Setiap <Composition> muncul di Studio dan bisa dirender menjadi MP4.
// - Video khusus buatan Claude (jalur A): PecahanKue, SiklusAir
// - Templat bersama aplikasi (jalur B, sumber di apps/web/components/video/templat): sama persis dengan yang dipakai
//   guru di menu Video Belajar dan layanan render di server
import { Composition } from "remotion";
import { PecahanKue, type PecahanKueProps } from "./PecahanKue";
import { SiklusAir, TOTAL as TOTAL_SIKLUS } from "./SiklusAir";
import { FPS, LEBAR, TINGGI, TEMPLAT, hitungDurasi } from "../../apps/web/components/video/templat/index.js";

const awal: PecahanKueProps = { bagian: 4, diambil: 1, warna: "#f59e0b" };

type Templat = { id: string; komponen: React.FC<Record<string, unknown>>; contoh: Record<string, unknown> };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="PecahanKue" component={PecahanKue} durationInFrames={330} fps={30} width={1280} height={720} defaultProps={awal} />
      <Composition id="SiklusAir" component={SiklusAir} durationInFrames={TOTAL_SIKLUS} fps={30} width={1280} height={720} />
      {(TEMPLAT as Templat[]).map((t) => (
        <Composition key={t.id} id={`Templat-${t.id}`} component={t.komponen} fps={FPS} width={LEBAR} height={TINGGI}
          durationInFrames={hitungDurasi(t.contoh)} defaultProps={t.contoh}
          calculateMetadata={({ props }) => ({ durationInFrames: hitungDurasi(props) })} />
      ))}
    </>
  );
};
