import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export default function Player({ url, title }: { url: string; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    video.removeAttribute("src");
    video.load();
    setError(null);

    const isHls = /\.m3u8($|\?)/i.test(url);
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError("Não foi possível carregar o stream HLS.");
      });
    } else {
      video.src = url;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [url]);

  return (
    <div className="w-full">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50">
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full"
          onError={() => setError("Não foi possível reproduzir este link.")}
        />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-950/95 px-6 text-center">
            <p className="text-sm font-semibold text-amber-300">{error}</p>
            <p className="text-xs text-slate-500">Confira o link ou tente outro stream.</p>
          </div>
        )}
      </div>
      {title && <p className="mt-3 text-sm font-medium text-slate-300">{title}</p>}
    </div>
  );
}
