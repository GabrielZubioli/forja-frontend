# habitual-fit-frontend

Os apps do Forja — web (TanStack Start) e mobile (Expo) — e a lógica de negócio
pura que os dois compartilham.

```
packages/domain/   @forja/domain — regras de treino, dieta e corpo. Sem DOM.
apps/web/          @forja/web    — app web (TanStack Start + Tailwind + shadcn)
apps/mobile/       @forja/mobile — app Expo / React Native
```

O schema do banco, as migrations, o RLS e as Edge Functions vivem no repositório
**[habitual-fit-backend](https://github.com/GabrielZubioli/habitual-fit-backend)**. A única coisa que atravessa a fronteira é
o contrato de dados, consumido como o pacote `@gabrielzubioli/db`.

## Setup

```bash
npm install
cp .env.example apps/web/.env    # preencha as chaves do Supabase
npm run verify
```

## Scripts

| Script                     | O que faz                              |
| -------------------------- | -------------------------------------- |
| `npm run dev`              | Sobe o app web                         |
| `npm run mobile`           | Sobe o Expo                            |
| `npm run typecheck`        | Typecheck de todos os workspaces       |
| `npm run test:all`         | Testes do domínio + do web             |
| `npm run lint`             | ESLint em todo o repo                  |
| `npm run build`            | Build de produção do web               |
| `npm run verify`           | typecheck + lint + testes + build      |
| `npm run catalog:body-map` | Regenera `muscle-paths.ts` do body map |

## `@forja/domain` é puro, e isso é uma regra

Nada de `window`, `document`, `localStorage`, React ou I/O. O pacote é a mesma
lógica rodando no navegador, no React Native e nos testes — qualquer dependência
de ambiente quebra um dos três, e normalmente o que quebra é o mobile, tarde.

É também o que permite que treino, dieta e progressão sejam calculados
**offline e sem chamar modelo nenhum**. A IA no `coach` conversa sobre os
números que este pacote produziu; ela não os inventa.

Toda regra aqui tem teste (`npm run test:domain`, 206 hoje).

## O contrato: `@gabrielzubioli/db`

Os tipos do Postgres vêm de fora, gerados no backend a partir do schema real.

```
apps/web/src/integrations/supabase/types.ts   ← shim, reexporta de @gabrielzubioli/db/types
apps/mobile                                    ← importa @gabrielzubioli/db direto
```

O shim existe porque `client.ts`, `client.server.ts` e `auth-middleware.ts` são
**gerados** e importam `./types`. Editá-los seria desfeito na próxima
regeneração; o shim sobrevive.

Importe de `@gabrielzubioli/db/types`, não de `@gabrielzubioli/db`: o barrel também exporta o
`AppSchema` do PowerSync, que traria `@powersync/common` para o bundle web sem
necessidade.

### Autenticação no registry

`@gabrielzubioli/db` é privado, no GitHub Packages. Antes do primeiro `npm install`:

```bash
npm config set //npm.pkg.github.com/:_authToken <PAT com read:packages>
```

O `.npmrc` versionado mapeia o escopo mas **não** contém a linha do token — com
`${NODE_AUTH_TOKEN}` lá dentro, o npm aborta em qualquer máquina onde a variável
não exista, mesmo num install que nem consulta o registry.

### Mexendo no contrato e no app ao mesmo tempo

Esperar publicar uma versão a cada tentativa é insuportável. Para trabalhar nos
dois repos de uma vez, use um link local e desfaça no fim:

```bash
cd ../forja-backend/packages/db && npm run build && npm link
cd ../../../forja-frontend && npm link @gabrielzubioli/db
# ao terminar:
npm unlink @gabrielzubioli/db && npm install
```

O link é local e não aparece no `package.json` — o que entra no commit continua
sendo a versão publicada.

## Variáveis de ambiente

As chaves `publishable` do Supabase são seguras no cliente: quem protege os
dados é o RLS do Postgres, não o segredo da chave. **Nunca** coloque uma
`service_role` em variável com prefixo `VITE_` ou `EXPO_PUBLIC_` — esse prefixo
é exatamente o que injeta o valor no bundle que vai para o navegador.

## Lovable

O app web é editável pelo [Lovable](https://lovable.dev) (ver `AGENTS.md`).
Arquivos marcados como _"automatically generated. Do not edit it directly"_ são
reescritos por ele — não os edite à mão.
