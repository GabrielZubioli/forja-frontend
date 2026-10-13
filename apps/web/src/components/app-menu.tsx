import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { BarChart3, BookOpen, ChevronRight, Compass, HeartPulse, List, LogOut } from "lucide-react";
import { TUTORIAL_EVENT } from "@/components/tutorial";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { unwrapMaybe } from "@/data/supabase-helpers";
import { initialsFrom, resolveAvatarUrl } from "@/data/avatar";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CoachIcon } from "@/components/coach/coach-icon";
import { ThemeSwitch } from "@/components/theme-switch";
import { SETTINGS_SECTIONS } from "@/components/profile/settings-sections";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * O Menu da barra inferior.
 *
 * Em cima, o cartão da pessoa (leva ao Perfil). Só duas telas ganham destaque —
 * Estatísticas e Corpo, as que respondem "estou evoluindo?" —; todo o resto,
 * telas e ajustes, fica numa lista única e limpa. Destacar tudo é não destacar
 * nada.
 */
const DESTAQUES: { to: string; label: string; hint: string; icon: Icone }[] = [
  { to: "/stats", label: "Estatísticas", hint: "Sua evolução", icon: BarChart3 },
  { to: "/body", label: "Corpo", hint: "Peso, medidas e fotos", icon: HeartPulse },
];

type Item = { label: string; icon: Icone } & (
  | { to: string; secao?: undefined }
  | { to: "/settings"; secao: (typeof SETTINGS_SECTIONS)[number]["key"] }
);

const ITENS: Item[] = [
  { to: "/exercises", label: "Exercícios", icon: List },
  { to: "/coach", label: "Treinador", icon: CoachIcon },
  { to: "/recipes", label: "Receitas", icon: BookOpen },
  ...SETTINGS_SECTIONS.map((s) => ({
    to: "/settings" as const,
    secao: s.key,
    label: s.title,
    icon: s.icon as Icone,
  })),
];

export function AppMenu({
  open,
  onOpenChange,
  onSignOut,
  isActive,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSignOut: () => void;
  isActive: (to: string) => boolean;
}) {
  const fechar = () => onOpenChange(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Menu</DrawerTitle>
          <DrawerDescription>Outras telas e ajustes</DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[80vh] overflow-y-auto px-4 pb-5 pt-2">
          <CartaoPerfil onNavigate={fechar} />

          <ul className="mt-3 grid grid-cols-2 gap-2.5">
            {DESTAQUES.map((d) => (
              <li key={d.to}>
                <Link
                  to={d.to}
                  onClick={fechar}
                  aria-current={isActive(d.to) ? "page" : undefined}
                  className="flex h-full flex-col gap-3 rounded-[1.25rem] border border-border bg-card p-4 transition-colors hover:border-primary/40 active:scale-[0.98]"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                    <d.icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-bold">{d.label}</span>
                    <span className="block text-xs text-muted-foreground">{d.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="mt-3 overflow-hidden rounded-[1.25rem] border border-border bg-card">
            {ITENS.map((it) => (
              <li key={it.label} className="border-b border-border/60 last:border-b-0">
                <Link
                  to={it.to}
                  search={it.secao ? { secao: it.secao } : undefined}
                  onClick={fechar}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated"
                >
                  <it.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1 font-medium">{it.label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
            <li className="border-b border-border/60">
              <button
                type="button"
                onClick={() => {
                  fechar();
                  // Depois de o painel fechar, para o tour medir a tela final.
                  window.setTimeout(() => window.dispatchEvent(new Event(TUTORIAL_EVENT)), 350);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated"
              >
                <Compass className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1 font-medium">Ver tutorial</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
            <li className="px-4 py-2.5">
              <ThemeSwitch />
            </li>
          </ul>

          <button
            type="button"
            onClick={() => {
              fechar();
              onSignOut();
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[1.25rem] px-3 py-3 font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut className="size-5" aria-hidden />
            Sair da conta
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** O cartão verde do topo: foto (ou iniciais), nome e o atalho para o Perfil. */
function CartaoPerfil({ onNavigate }: { onNavigate: () => void }) {
  const user = useCurrentUser();
  const perfil = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });
  const nome = perfil.data?.display_name?.trim() || "Seu perfil";
  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void resolveAvatarUrl(perfil.data?.avatar_url ?? null).then((u) => ativo && setFoto(u));
    return () => {
      ativo = false;
    };
  }, [perfil.data?.avatar_url]);

  return (
    <Link
      to="/profile"
      onClick={onNavigate}
      className="relative flex items-center gap-4 overflow-hidden rounded-[1.5rem] bg-[#01D798] p-4 text-[#020306] animate-in fade-in zoom-in-95 duration-300"
    >
      <span className="absolute -right-8 -top-10 size-32 rounded-full bg-white/20" aria-hidden />
      <span className="absolute -bottom-12 right-16 size-24 rounded-full bg-black/10" aria-hidden />
      <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#020306] text-lg font-bold text-[#01D798] ring-4 ring-white/40">
        {foto ? (
          <img src={foto} alt="" className="size-full object-cover" onError={() => setFoto(null)} />
        ) : (
          initialsFrom(perfil.data?.display_name, user.email)
        )}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-xl font-extrabold">{nome}</span>
        <span className="block text-sm font-medium text-[#020306]/70">Ver perfil</span>
      </span>
      <ChevronRight className="relative size-6 shrink-0" aria-hidden />
    </Link>
  );
}
