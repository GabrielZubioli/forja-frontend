import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/theme-provider";
import { ErrorScreen, NotFoundScreen, OfflineBanner } from "@/components/status-screen";

function NotFoundComponent() {
  return <NotFoundScreen />;
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <ErrorScreen
      error={error}
      onRetry={() => {
        void router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Habitual Fit — Treino, Dieta e Progresso" },
      {
        name: "description",
        content:
          "Registre treinos, monitore macros e acompanhe seu progresso corporal em um só app.",
      },
      { property: "og:title", content: "Habitual Fit — Treino, Dieta e Progresso" },
      {
        property: "og:description",
        content: "Registre treinos, monitore macros e acompanhe seu progresso corporal.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/og-image.png" },
      { property: "og:site_name", content: "Habitual Fit" },
      { name: "twitter:card", content: "summary_large_image" },
      // PWA: um app usado na academia precisa abrir da tela inicial, em tela
      // cheia, sem a barra do navegador roubando espaço vertical.
      //
      // A cor da barra do sistema acompanha o tema — sem os dois `media`, o
      // celular pinta a barra clara sobre um app escuro, e a moldura entrega
      // que a identidade parou na borda da página. São os valores literais de
      // `--background`: esta tag é lida antes de qualquer CSS.
      { name: "theme-color", content: "#f6faf8", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#070d0b", media: "(prefers-color-scheme: dark)" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Habitual Fit" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      // Evita que o iOS transforme números em links de telefone nas tabelas de séries.
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Aplica o tema antes da primeira pintura, evitando flash branco. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {/* Toaster global: disponível em todas as rotas (login, landing e área logada). */}
        <Toaster position="top-right" richColors closeButton />
        <OfflineBanner />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
