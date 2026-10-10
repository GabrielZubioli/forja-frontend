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
  Bot,
  CalendarDays,
  Dumbbell,
  HeartPulse,
  Home,
  List,
  LogOut,
  User,
  Utensils,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/data/query-keys";
import { fetchOpenSessionId } from "@/data/workout-session";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette, CommandPaletteTrigger } from "@/components/command-palette";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

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
 * uma mão: quatro destinos e, no centro, o botão de treinar — a ação que a
 * pessoa abre o app para fazer. Durante um treino ele fica laranja e leva de
 * volta à sessão.
 */
const NAV_ITEMS = [
  { to: "/dashboard", label: "Início", icon: Home },
  { to: "/plan", label: "Plano", icon: CalendarDays },
  { to: "/stats", label: "Estatísticas", icon: BarChart3 },
  { to: "/exercises", label: "Exercícios", icon: List },
] as const;

/** Itens fora da barra, presentes no menu lateral do desktop e nos cards da Início. */
const SECONDARY_NAV = [
  { to: "/diet", label: "Dieta", icon: Utensils },
  { to: "/coach", label: "Treinador", icon: Bot },
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
    queryKey: [...queryKeys.workouts.all, "open-session"],
    queryFn: fetchOpenSessionId,
  });
  const emTreino = Boolean(sessaoAberta.data) || pathname.startsWith("/workouts/session/");

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
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span
              className="grid size-9 place-items-center rounded-xl"
              style={{ background: "var(--gradient-primary)" }}
              aria-hidden
            >
              <Dumbbell className="size-5 text-primary-foreground" />
            </span>
            <span className="font-semibold tracking-tight">Forja</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="px-3 pb-3">
          <CommandPaletteTrigger className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent" />
        </div>

        <nav className="flex-1 space-y-1 px-3" aria-label="Navegação principal">
          <Link
            to="/train"
            className={cn(
              "mb-2 flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-bold transition-colors",
              emTreino
                ? "bg-warning text-warning-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            <Dumbbell className="size-4" aria-hidden />
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
        </nav>

        <div className="p-3">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={signOut}>
            <LogOut className="size-4" aria-hidden />
            Sair
          </Button>
        </div>
      </aside>

      {/* Barra inferior (celular): quatro destinos e o botão central de treinar. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Navegação principal"
      >
        <ul className="grid grid-cols-5 items-end">
          {[NAV_ITEMS[0], NAV_ITEMS[1], null, NAV_ITEMS[2], NAV_ITEMS[3]].map((item) => {
            if (!item) {
              return (
                <li key="treinar" className="flex justify-center">
                  <Link
                    to="/train"
                    aria-label={emTreino ? "Voltar ao treino" : "Treinar"}
                    className="-mt-7 flex flex-col items-center gap-1 pb-2"
                  >
                    <span
                      className={cn(
                        "grid size-16 place-items-center rounded-full shadow-lg transition-colors",
                        emTreino
                          ? "bg-warning text-warning-foreground shadow-warning/30"
                          : "bg-primary text-primary-foreground shadow-primary/30",
                      )}
                    >
                      <Dumbbell className="size-7" aria-hidden />
                    </span>
                    <span
                      className={cn(
                        "text-[12px] font-bold",
                        emTreino ? "text-warning" : "text-primary",
                      )}
                    >
                      {emTreino ? "Treino" : "Treinar"}
                    </span>
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
        </ul>
      </nav>

      <main id="conteudo" className="min-h-screen pb-28 md:pb-0 md:pl-60">
        <Outlet />
      </main>

      <CommandPalette />
    </div>
  );
}
