// Daftar video. Setiap <Composition> muncul di Studio dan bisa dirender menjadi MP4.
import { Composition } from "remotion";
import { PecahanKue, type PecahanKueProps } from "./PecahanKue";

const awal: PecahanKueProps = { bagian: 4, diambil: 1, warna: "#f59e0b" };

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Contoh media belajar: pecahan dengan kue (kelas 3–4, fase B). 16:9 agar enak di proyektor maupun HP mendatar. */}
      <Composition
        id="PecahanKue"
        component={PecahanKue}
        durationInFrames={330}
        fps={30}
        width={1280}
        height={720}
        defaultProps={awal}
      />
    </>
  );
};
