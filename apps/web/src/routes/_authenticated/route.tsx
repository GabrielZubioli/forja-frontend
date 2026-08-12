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
  Dumbbell,
  LayoutDashboard,
  Utensils,
  HeartPulse,
  User,
  LogOut,
  BookOpen,
  Bot,
} from "lucide-react";
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
 * Navegação principal.
 *
 * Cinco itens, não sete. Receitas saiu da barra (continua acessível pelo perfil
 * e pela busca ⌘K) e o treinador entrou: numa barra inferior de celular, cada
 * item a mais estreita todos os alvos de toque, e "Receitas" era o menos usado
 * dos sete.
 */
const NAV_ITEMS = [
  { to: "/dashboard", label: "Hoje", icon: LayoutDashboard },
  { to: "/workouts", label: "Treino", icon: Dumbbell },
  { to: "/diet", label: "Dieta", icon: Utensils },
  { to: "/coach", label: "Treinador", icon: Bot },
  { to: "/body", label: "Progresso", icon: HeartPulse },
] as const;

/** Itens fora da barra, presentes no menu lateral do desktop. */
const SECONDARY_NAV = [
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

      {/* Cabeçalho mobile — dá acesso ao tema e a sair, antes só disponíveis no desktop. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span
            className="grid size-8 place-items-center rounded-lg"
            style={{ background: "var(--gradient-primary)" }}
            aria-hidden
          >
            <Dumbbell className="size-4 text-primary-foreground" />
          </span>
          <span className="font-semibold tracking-tight">Forja</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Perfil saiu da barra inferior para dar espaço aos alvos de toque;
              precisa continuar alcançável em um gesto no celular. */}
          <Button variant="ghost" size="icon" asChild aria-label="Abrir perfil">
            <Link to="/profile">
              <User className="size-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair da conta">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {/*
        Navegação inferior (mobile). Antes era `grid-cols-6` com rótulo de 12px:
        em telas de 320px os alvos ficavam apertados e o texto truncava. Agora
        rola horizontalmente com largura mínima por item e respeita a área
        segura do iOS.
      */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navegação principal"
      >
        <ul className="flex overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.to);
            return (
              <li key={item.to} className="min-w-[4rem] flex-1">
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] transition-colors",
                    active ? "font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <main id="conteudo" className="min-h-screen pb-24 md:pb-0 md:pl-60">
        <Outlet />
      </main>

      <CommandPalette />
    </div>
  );
}
