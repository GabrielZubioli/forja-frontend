import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { ArrowUpRight, BarChart3, BookOpen, ChevronRight, HeartPulse, List, LogOut } from "lucide-react";
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
import { cn } from "@/lib/utils";

type Icone = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * O Menu da barra inferior.
 *
 * Em cima, o cartão verde da pessoa (leva ao Perfil). Os atalhos são um
 * mosaico com o verde em três intensidades — o destaque sólido, o tom suave e
 * o contorno —, para o painel ter hierarquia em vez de seis caixas cinzas
 * iguais. Depois o interruptor do modo escuro, as configurações e o sair.
 */
const ATALHOS: { to: string; label: string; hint: string; icon: Icone; estilo: Estilo }[] = [
  { to: "/exercises", label: "Exercícios", hint: "Biblioteca com demonstrações", icon: List, estilo: "solido" },
  { to: "/stats", label: "Estatísticas", hint: "Sua evolução", icon: BarChart3, estilo: "suave" },
  { to: "/coach", label: "Treinador", hint: "Tire dúvidas", icon: CoachIcon, estilo: "contorno" },
  { to: "/body", label: "Corpo", hint: "Peso e fotos", icon: HeartPulse, estilo: "suave" },
  { to: "/recipes", label: "Receitas", hint: "Prontas e suas", icon: BookOpen, estilo: "contorno" },
];

type Estilo = "solido" | "suave" | "contorno";

const ESTILOS: Record<Estilo, { tile: string; icone: string; hint: string }> = {
  solido: {
    tile: "bg-[#01D798] text-[#020306] shadow-lg shadow-[#01D798]/25",
    icone: "bg-[#020306]/12 text-[#020306]",
    hint: "text-[#020306]/70",
  },
  suave: {
    tile: "bg-primary/15 text-foreground",
    icone: "bg-primary text-primary-foreground",
    hint: "text-muted-foreground",
  },
  contorno: {
    tile: "border border-primary/35 bg-card text-foreground",
    icone: "bg-primary/15 text-primary",
    hint: "text-muted-foreground",
  },
};

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
  const [destaque, ...outros] = ATALHOS;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Menu</DrawerTitle>
          <DrawerDescription>Outras telas e configurações</DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[80vh] overflow-y-auto px-4 pb-5 pt-2">
          <CartaoPerfil onNavigate={fechar} />

          {/* Atalhos: o destaque ocupa a linha toda; os demais, metade. */}
          <ul className="mt-3 grid grid-cols-2 gap-2.5">
            {[destaque!, ...outros].map((a, i) => {
              const e = ESTILOS[a.estilo];
              return (
                <li
                  key={a.to}
                  className={cn(
                    i === 0 && "col-span-2",
                    "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-300",
                  )}
                  style={{ animationDelay: `${60 + i * 45}ms` }}
                >
                  <Link
                    to={a.to}
                    onClick={fechar}
                    aria-current={isActive(a.to) ? "page" : undefined}
                    className={cn(
                      "flex h-full items-center gap-3 rounded-[1.25rem] p-3.5 transition-transform active:scale-[0.97]",
                      e.tile,
                    )}
                  >
                    <span
                      className={cn(
                        "grid shrink-0 place-items-center rounded-xl",
                        i === 0 ? "size-12" : "size-10",
                        e.icone,
                      )}
                    >
                      <a.icon className={i === 0 ? "size-6" : "size-5"} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block font-bold", i === 0 ? "text-lg" : "text-[0.95rem]")}>
                        {a.label}
                      </span>
                      <span className={cn("block truncate text-xs", e.hint)}>{a.hint}</span>
                    </span>
                    {i === 0 && <ArrowUpRight className="size-5 shrink-0" aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 rounded-[1.25rem] bg-card p-3.5">
            <ThemeSwitch />
          </div>

          <h2 className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Configurações
          </h2>
          <ul className="overflow-hidden rounded-[1.25rem] bg-card">
            {SETTINGS_SECTIONS.map((sec) => (
              <li key={sec.key} className="border-b border-border/60 last:border-b-0">
                <Link
                  to="/settings"
                  search={{ secao: sec.key }}
                  onClick={fechar}
                  className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-primary/8"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                    <sec.icon className="size-[1.1rem]" aria-hidden />
                  </span>
                  <span className="flex-1 font-medium">{sec.title}</span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => {
              fechar();
              onSignOut();
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-destructive/30 px-3 py-3 font-semibold text-destructive transition-colors hover:bg-destructive/10"
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
