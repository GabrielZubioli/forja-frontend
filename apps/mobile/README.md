# @forja/mobile

App Expo (React Native) do Forja — destino de publicação nas lojas.

## Stack

- **Expo SDK 57** + **Expo Router** (navegação file-based, `app/`).
- **NativeWind 4** (Tailwind em RN) com tokens de tema âmbar (light/dark).
- **@forja/domain** — lógica de negócio pura compartilhada com a web.
- **@forja/db** — schema local do PowerSync + sync rules.
- **PowerSync** — offline-first (SQLite local + fila de sync com o Supabase).
- **Supabase** — auth e backend de upload.

## Primeiro setup (ambiente de dev)

> Pré-requisito: este pacote está no monorepo. Rode `npm install` na **raiz** uma
> vez. Depois, dentro de `apps/mobile`, fixe as versões nativas alinhadas ao SDK:

```sh
cd apps/mobile
npx expo install --fix     # alinha react-native, expo-*, reanimated etc. ao SDK 57
cp .env.example .env        # preencha as chaves
npx expo start             # ou: npm run ios / npm run android
```

Rodar em device/simulador exige Xcode (iOS) ou Android Studio. A primeira build
nativa usa `npx expo run:ios` / `run:android` (New Architecture habilitada).

## Estrutura

```
app/                 # rotas (Expo Router)
  _layout.tsx        # shell: providers (tema, safe area, gestures)
  index.tsx          # tela de verificação do scaffold (temporária)
src/
  theme/theme.tsx    # tema sistema + override manual (persistido)
  lib/supabase.ts    # client Supabase (auth) para RN
global.css           # tokens de tema (âmbar) light/dark
tailwind.config.js   # mapeia tokens → cores NativeWind
metro.config.js      # resolução de workspace (monorepo) + NativeWind
```

## Próximos passos (milestones)

1. **Schema+RLS+Seeds+Auth**: migrations novas, PowerSync ligado, telas de login
   (email+senha, Google via expo-auth-session), bootstrap do SQLite local.
2. **Design System + Shell**: componentes base (Screen, Card, Button, Input,
   estados de loading/erro/vazio), navegação por abas.
3. **Treino** → 4. **Dieta** → 5. **Corpo + Dashboard**.

## Notas

- A tela `app/index.tsx` é só de verificação e será substituída pela navegação real.
- O adaptador de sessão em `src/lib/supabase.ts` usa SecureStore; trocar por
  LargeSecureStore antes de produção (limite de 2 KB) — ver comentário no arquivo.
