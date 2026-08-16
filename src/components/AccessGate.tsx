export type AccessGateKind = "unknown" | "pendente" | "inativo" | "expired";

const CONTENT: Record<AccessGateKind, { icon: string; title: string; text: string }> = {
  unknown: {
    icon: "🔒",
    title: "Acesso não liberado",
    text: "Seu e-mail ainda não foi cadastrado no Binho Play. Peça ao vendedor ou administrador para ativar sua conta — assim que for aprovada, você entra normalmente.",
  },
  pendente: {
    icon: "⏳",
    title: "Aguardando aprovação",
    text: "Um administrador precisa aprovar o seu acesso antes de liberar o conteúdo. Assim que for aprovado, atualize a página para começar a assistir.",
  },
  inativo: {
    icon: "⛔",
    title: "Acesso desativado",
    text: "Sua conta foi desativada pelo administrador. Fale com ele para reativar o seu acesso.",
  },
  expired: {
    icon: "⏰",
    title: "Teste expirado",
    text: "Sua conta de teste terminou. Fale com o vendedor ou administrador para renovar o acesso.",
  },
};

export default function AccessGate({
  kind,
  onLogout,
}: {
  kind: AccessGateKind;
  onLogout: () => void;
}) {
  const c = CONTENT[kind];
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-5 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[440px] w-[680px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute -bottom-32 -right-24 h-[360px] w-[360px] rounded-full bg-accent-600/15 blur-[100px]" />
      </div>

      <div className="w-full max-w-md text-center">
        <img
          src="/addons/repo/Plugins/plugin.video.BrazucaPlay/icon.png"
          alt="Logo Binho Play"
          className="mx-auto h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <p className="mt-4 text-5xl">{c.icon}</p>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-white">{c.title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{c.text}</p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5 hover:text-white"
          >
            Sair e trocar de conta
          </button>
          <p className="text-[11px] text-slate-600">
            Binho Play · acesso gerenciado pelo administrador
          </p>
        </div>
      </div>
    </div>
  );
}
