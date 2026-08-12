# Módulo: Corpo (peso, medidas, fotos)

Tela única com abas: `/body` — [body.tsx](../../src/routes/_authenticated/body.tsx).
Três painéis (Tabs): **Peso**, **Medidas**, **Fotos**.

## Tabelas / Storage

- `body_weights` — 1 registro por dia (`UNIQUE(user_id, log_date)`).
- `body_measurements` — medidas corporais e % de gordura.
- `progress_photos` — metadados; o arquivo fica no **Storage bucket `progress-photos`** (privado).

## Aba Peso

- Registrar: `upsert` em `body_weights` com `onConflict: "user_id,log_date"` →
  registrar de novo no mesmo dia **atualiza** em vez de duplicar.
- Gráfico (recharts): série dos últimos **180 dias**, com duas linhas:
  - `peso` (valor bruto);
  - `tendencia` = **média móvel exponencial** `ema(series, 0.2)` (ver [dominio/formulas.md](../dominio/formulas.md)).
- Invalida `["weights_all"]` **e** `["weights_30"]` (esta última alimenta o dashboard).

## Aba Medidas (`MeasurementsPanel`)

Campos (`MEASURE_FIELDS`): `chest_cm`, `waist_cm`, `hip_cm`, `arm_cm`, `thigh_cm`,
`neck_cm`, `body_fat_pct`.

- Salvar: `insert` em `body_measurements` só com os campos preenchidos (não é upsert;
  permite vários registros por dia).
- "Tendências": um mini-gráfico por medida com valor atual.
- "Histórico": lista com resumo textual e exclusão por linha.

## Aba Fotos (`PhotosPanel`)

- Upload: envia o arquivo para `progress-photos/<user_id>/<timestamp>-<angle>.<ext>`
  e insere metadados em `progress_photos` (`storage_path`, `angle`, `log_date`).
  - `angle` ∈ `front | side | back` (definido na UI; coluna é `TEXT` livre).
- **URLs assinadas**: como o bucket é privado, a galeria gera signed URLs
  (`storage.createSignedUrls(paths, 3600)`) e guarda em estado local `urls`.
- **Comparar**: seleciona até 2 fotos (`compare` = tupla) para ver lado a lado.
- Excluir: remove o objeto do Storage **e** a linha da tabela.

### Segurança das fotos

Policies de Storage restringem leitura/escrita/exclusão a objetos cujo **primeiro
segmento do path seja o `auth.uid()`** — por isso o path começa com `<user_id>/`.
Ver [banco-de-dados/rls.md](../banco-de-dados/rls.md).

## Relação com metas

O **último peso** registrado alimenta o cálculo de metas no perfil
(`bmrMifflin` usa peso). Ver [modulos/perfil-e-metas.md](perfil-e-metas.md).

## ⚠️ A confirmar

- O bucket `progress-photos` precisa existir no projeto Supabase. As **policies** de
  `storage.objects` são criadas na migration, mas **a criação do bucket em si não
  aparece nas migrations** — provavelmente criado pelo painel/Lovable. ⚠️ confirmar.
