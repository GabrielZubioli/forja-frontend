import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  HeartPulse,
  Home,
  List,
  LogOut,
  Menu,
  Settings,
  User,
  Utensils,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/data/query-keys";
import { fetchOpenSession } from "@/data/workout-session";
import { BrandSymbol } from "@/components/brand-logo";
import {
  TERMINAR_TREINO_EVENT,
  TrainFab,
  TrainLaunchOverlay,
  useTrainLaunch,
} from "@/components/train-launch";
import { Button } from "@/components/ui/button";
import { ThemeSwitch } from "@/components/theme-switch";
import { AppMenu } from "@/components/app-menu";
import { CommandPalette, CommandPaletteTrigger } from "@/components/command-palette";
import { CoachIcon } from "@/components/coach/coach-icon";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // `getSession` lê do storage local (sem round-trip). `getUser` valida o
    // token no servidor — necessário porque um JWT expirado ainda estaria no
    // storage. A checagem barata primeiro evita a chamada de rede quando não
    // há sessão alguma.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw redirect({ to: "/auth" });

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

/**
 * Navegação principal, no formato das apps de academia que funcionam bem com
 * uma mão: Início, Plano, Dieta e Menu e, no centro, o botão de treinar — a
 * ação que a pessoa abre o app para fazer. Durante um treino ele fica laranja
 * e leva de volta à sessão.
 */
const NAV_ITEMS = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/plan", label: "Plano", icon: CalendarDays },
  { to: "/diet", label: "Dieta", icon: Utensils },
] as const;

/** O resto: no Menu (painel de baixo) no celular, abaixo da barra lateral no desktop. */
const SECONDARY_NAV = [
  { to: "/exercises", label: "Exercícios", icon: List },
  { to: "/stats", label: "Estatísticas", icon: BarChart3 },
  { to: "/coach", label: "Treinador", icon: CoachIcon },
  { to: "/body", label: "Corpo", icon: HeartPulse },
  { to: "/recipes", label: "Receitas", icon: BookOpen },
  { to: "/profile", label: "Perfil", icon: User },
] as const;

function AuthLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        qc.clear();
        void navigate({ to: "/auth", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, qc]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const sessaoAberta = useQuery({
    queryKey: [...queryKeys.workouts.all, "open-session-info"],
    queryFn: fetchOpenSession,
  });
  const sessao = sessaoAberta.data ?? null;
  const emTreino = Boolean(sessao);
  const { fase, cor, lancar } = useTrainLaunch();
  /** Está na tela do próprio treino em andamento: o botão vira "terminar". */
  const naSessao = Boolean(sessao) && pathname === `/workouts/session/${sessao?.id}`;
  /**
   * Treinar: sem treino, a transição do punho; com treino, vai a ele; dentro
   * dele, termina — a tela do treino escuta o evento e roda o mesmo fluxo do ✓
   * (confirma se houver séries pendentes).
   */
  const aoTocarTreinar = (e: React.MouseEvent) => {
    if (naSessao) {
      e.preventDefault();
      window.dispatchEvent(new Event(TERMINAR_TREINO_EVENT));
      return;
    }
    if (sessao) {
      // Volta ao treino em andamento: o mesmo punho, em laranja.
      e.preventDefault();
      lancar(
        () => void navigate({ to: "/workouts/session/$id", params: { id: sessao.id } }),
        "laranja",
      );
      return;
    }
    if (pathname === "/train") return;
    e.preventDefault();
    lancar(() => void navigate({ to: "/train" }), "verde");
  };
  const [menuAberto, setMenuAberto] = useState(false);
  const menuAtivo = [...SECONDARY_NAV.map((i) => i.to), "/settings"].some(isActive);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Permite pular a navegação com o teclado — exigência básica de a11y. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      {/* Barra lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Link to="/dashboard" className="flex items-center" aria-label="Habitual Fit — início">
            <BrandLogo className="h-9" />
          </Link>
          <ThemeSwitch compacto />
        </div>

        <div className="px-3 pb-3">
          <CommandPaletteTrigger className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent" />
        </div>

        <nav className="flex-1 space-y-1 px-3" aria-label="Navegação principal">
          <Link
            to={sessao ? "/workouts/session/$id" : "/train"}
            params={sessao ? { id: sessao.id } : undefined}
            onClick={aoTocarTreinar}
            className={cn(
              "mb-2 flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-bold transition-colors",
              emTreino ? "bg-(--treino) text-(--treino-ink)" : "bg-[#01D798] text-[#020306]",
            )}
          >
            {emTreino ? (
              <span className="size-3 rounded-[3px] bg-current" aria-hidden />
            ) : (
              <BrandSymbol escuro className="w-5" />
            )}
            {emTreino ? "Voltar ao treino" : "Treinar"}
          </Link>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}

          <span className="my-2 block h-px bg-sidebar-border" aria-hidden />

          {SECONDARY_NAV.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive("/settings")
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent",
            )}
          >
            <Settings className="size-4" aria-hidden />
            Configurações
          </Link>
        </nav>

        <div className="p-3">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={signOut}>
            <LogOut className="size-4" aria-hidden />
            Sair
          </Button>
        </div>
      </aside>

      {/* Barra inferior (celular): três destinos, o botão central de treinar e o Menu. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Navegação principal"
      >
        <ul className="grid grid-cols-5 items-end">
          {[NAV_ITEMS[0], NAV_ITEMS[1], null, NAV_ITEMS[2]].map((item) => {
            if (!item) {
              return (
                <li key="treinar" className="flex justify-center">
                  <Link
                    to={sessao ? "/workouts/session/$id" : "/train"}
                    params={sessao ? { id: sessao.id } : undefined}
                    onClick={aoTocarTreinar}
                    aria-label={
                      naSessao ? "Terminar treino" : emTreino ? "Voltar ao treino" : "Treinar"
                    }
                    className={cn(
                      "flex flex-col items-center gap-1 pb-2",
                      // O botão "gravando" é 12 px maior: sobe junto para a barra não crescer.
                      sessao ? "-mt-10" : "-mt-7",
                    )}
                  >
                    <TrainFab sessao={sessao} naSessao={naSessao} />
                  </Link>
                </li>
              );
            }
            const active = isActive(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[3.75rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[12px] transition-colors",
                    active ? "font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-6" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              aria-haspopup="dialog"
              aria-expanded={menuAberto}
              className={cn(
                "flex min-h-[3.75rem] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[12px] transition-colors",
                menuAtivo ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              <Menu className="size-6" aria-hidden />
              <span>Menu</span>
            </button>
          </li>
        </ul>
      </nav>

      <AppMenu
        open={menuAberto}
        onOpenChange={setMenuAberto}
        onSignOut={() => void signOut()}
        isActive={isActive}
      />

      <main id="conteudo" className="min-h-screen pb-28 md:pb-0 md:pl-60">
        <Outlet />
      </main>

      <CommandPalette />
      <TrainLaunchOverlay fase={fase} cor={cor} />
    </div>
  );
}
