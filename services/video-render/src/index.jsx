// Titik masuk bundel Remotion layanan render: semua templat video belajar (sumber: apps/web/components/video/templat,
// disalin ke /app/templat saat build image).
import React from "react";
import { Composition, registerRoot } from "remotion";
import { FPS, LEBAR, TINGGI, TEMPLAT, hitungDurasi } from "../templat/index.js";

const Root = () => (
  <>
    {TEMPLAT.map((t) => (
      <Composition key={t.id} id={t.id} component={t.komponen} fps={FPS} width={LEBAR} height={TINGGI}
        durationInFrames={hitungDurasi(t.contoh)} defaultProps={t.contoh}
        calculateMetadata={({ props }) => (t.komponen.metadata ? t.komponen.metadata(props) : { durationInFrames: hitungDurasi(props) })} />
    ))}
  </>
);

registerRoot(Root);
