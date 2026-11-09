// Timeline klip EduRapor dari folder Downloads (6–8 Nov 2026), diputar berurutan dalam bingkai tegak 9:16.
// File ada di public/klip/ (tidak ikut git). Klip mendatar ditaruh di tengah dengan latar versi buram dirinya sendiri.
// Durasi diambil dari ffprobe; ubah urutan atau hapus baris di KLIP untuk menyunting timeline.
import { AbsoluteFill, Series, staticFile } from "remotion";
import { Video } from "@remotion/media";

export const FPS = 30;

type Klip = { file: string; detik: number; tegak: boolean };

export const KLIP: Klip[] = [
  { file: "01-recording-2026-11-01-204456-trim.mp4", detik: 11.68, tegak: false },
  { file: "02-recording2020445620trim-8e5e270d-1080p.mp4", detik: 7.08, tegak: false },
  { file: "03-menjelaskan-fitur-web-aplikasi-6d8570a0-1080p.mp4", detik: 7.08, tegak: true },
  { file: "04-aktor-berbicara-latar-belakang-v-53273ef8-1080p.mp4", detik: 7.08, tegak: true },
  { file: "05-untitled-scene-11-06-15-39-08-44b23549.mp4", detik: 17.19, tegak: true },
  { file: "06-selecting-class-on-computer-screen-50c1f47b-1080p.mp4", detik: 7.93, tegak: true },
  { file: "07-automated-student-score-data-pro-c3790092-1080p.mp4", detik: 7.93, tegak: true },
  { file: "08-presenter-introducing-edurapor-d-23acb0ec-1080p.mp4", detik: 5.97, tegak: true },
  { file: "10-selecting-smart-filter-and-class-aa605409-1080p.mp4", detik: 7.93, tegak: true },
  { file: "11-automated-data-processing-and-re-6d06376f-1080p.mp4", detik: 7.93, tegak: true },
  { file: "12-exporting-report-and-logo-branding-06de9c0f-1080p.mp4", detik: 7.93, tegak: true },
  { file: "15-educator-overwhelmed-by-manual-p-baa9568a.mp4", detik: 15.04, tegak: true },
  { file: "17-presenter-introducing-dashboard-e72da2a1.mp4", detik: 15.04, tegak: true },
  { file: "18-presenter-explaining-edurapor-da-6d733469.mp4", detik: 15.04, tegak: true },
  { file: "19-presenter-speaking-in-modern-studio-938a4a33-1080p.mp4", detik: 9.96, tegak: true },
  { file: "21-screen202025-08-11-213722-623e0271.mp4", detik: 15.04, tegak: false },
  { file: "22-presenter-menjelaskan-fitur-apli-52158e89-1080p.mp4", detik: 9.96, tegak: true },
  { file: "23-vid-75691473de34968c495e.mp4", detik: 38.4, tegak: false },
];

// Dibulatkan ke bawah agar tidak ada frame kosong/beku di ujung klip.
const frameKlip = (k: Klip) => Math.floor(k.detik * FPS);
export const TOTAL_FRAME = KLIP.reduce((n, k) => n + frameKlip(k), 0);

const SatuKlip: React.FC<{ klip: Klip }> = ({ klip }) => {
  const src = staticFile(`klip/${klip.file}`);
  if (klip.tegak) {
    return (
      <AbsoluteFill style={{ backgroundColor: "black" }}>
        <Video src={src} objectFit="cover" style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Latar: klip yang sama, diperbesar dan diburamkan, tanpa suara. */}
      <Video
        src={src}
        muted
        objectFit="cover"
        style={{ width: "100%", height: "100%", filter: "blur(40px) brightness(0.6)", transform: "scale(1.15)" }}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Video src={src} objectFit="contain" style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const TimelineKlip: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {KLIP.map((k) => (
          <Series.Sequence key={k.file} name={k.file} durationInFrames={frameKlip(k)}>
            <SatuKlip klip={k} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
