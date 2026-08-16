import { catalog } from "../catalog";

export function LogoMarquee() {
  const logos = catalog.logos;
  if (logos.length === 0) return null;
  const row = [...logos, ...logos];

  return (
    <section className="border-y border-white/5 bg-ink-900/60 py-8">
      <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
        Canais organizados pelo addon
      </p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="animate-marquee flex w-max gap-8">
          {row.map((logo, i) => (
            <img
              key={`${logo.name}-${i}`}
              src={logo.url}
              alt={logo.name}
              loading="lazy"
              className="h-10 w-16 shrink-0 rounded-md object-contain opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
