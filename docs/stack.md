# Stack, frameworks e libs

Fonte: [package.json](../../package.json). Versões são as declaradas (semver `^`).

## Runtime / gerenciador de pacotes

- **Bun** — há `bun.lock` e `bunfig.toml`. Também existe `package-lock.json` (npm),
  então npm funciona. O README oficial sugere `npm i && npm run dev`.
- **TypeScript** `~5.8.3`, `strict: true`, `moduleResolution: Bundler`,
  target `ES2022`. Alias `@/*` → `./src/*` ([tsconfig.json](../../tsconfig.json)).

## Framework de aplicação

| Lib                                 | Versão     | Papel                                                                           |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `@tanstack/react-start`             | ^1.168     | Framework full-stack (SSR + server functions)                                   |
| `@tanstack/react-router`            | ^1.170     | Roteamento file-based e type-safe                                               |
| `@tanstack/router-plugin`           | ^1.168     | Gera `routeTree.gen.ts`                                                         |
| `react` / `react-dom`               | ^19.2      | UI                                                                              |
| `nitro`                             | 3.0.x beta | Servidor/bundling de produção (via config Lovable)                              |
| `vite`                              | ^8.0       | Dev server e build                                                              |
| `@lovable.dev/vite-tanstack-config` | ^2.7       | Config Vite pré-montada do Lovable (ver [vite.config.ts](../../vite.config.ts)) |

## Dados e estado

- `@tanstack/react-query` ^5.101 — cache/estado de servidor (todo fetch passa por aqui).
- `@supabase/supabase-js` ^2.110 — client do banco/Auth/Storage.
- `@lovable.dev/cloud-auth-js` ^1.1 — OAuth (Google) via Lovable Cloud.
- `zod` ^3.24 — validação (ex.: schemas de email/senha no login).
- `react-hook-form` ^7.71 + `@hookform/resolvers` ^5.2 — instalados; uso pontual
  (a maioria dos forms usa `useState` controlado direto).

## UI

- **Tailwind CSS v4** (`tailwindcss` + `@tailwindcss/vite` ^4.2) — config via CSS
  em [src/styles.css](../../src/styles.css) (design tokens como CSS variables),
  não em `tailwind.config`.
- **shadcn/ui** estilo `new-york`, base `slate` ([components.json](../../components.json)).
  Componentes em [src/components/ui/](../../src/components/ui/).
- **Radix UI** (`@radix-ui/react-*`) — primitivos acessíveis por trás do shadcn.
- `lucide-react` — ícones.
- `sonner` — toasts (`toast.success/error`).
- `recharts` ^2.15 — gráficos (peso, medidas no dashboard/corpo).
- `date-fns` ^4.1 — datas/formatação (locale usado é o default; textos em pt-BR).
- Utilitários: `class-variance-authority`, `clsx`, `tailwind-merge` (`cn()` em
  [lib/utils.ts](../../src/lib/utils.ts)), `tw-animate-css`.
- Extras instalados (uso pontual/futuro): `cmdk`, `embla-carousel-react`,
  `input-otp`, `react-day-picker`, `react-resizable-panels`, `vaul`.

## Backend

- **Supabase** (Postgres gerenciado) — projeto `nursxzqagxmeiucsaqzm`
  ([supabase/config.toml](../../supabase/config.toml)). Auth, Storage e RLS.

## Ferramentas de dev

- ESLint 9 (flat config, [eslint.config.js](../../eslint.config.js)) +
  `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`,
  `eslint-plugin-prettier`.
- Prettier ^3.7 (`.prettierrc`).

## Scripts (`package.json`)

| Script      | Comando                         |
| ----------- | ------------------------------- |
| `dev`       | `vite dev`                      |
| `build`     | `vite build`                    |
| `build:dev` | `vite build --mode development` |
| `preview`   | `vite preview`                  |
| `lint`      | `eslint .`                      |
| `format`    | `prettier --write .`            |

> Nota: `package.json` tem `"name": "tanstack_start_ts"` (nome do template), não "forja".
