import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, num, unwrapList } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProgressOverview } from "@/components/progress/progress-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmButton } from "@/components/confirm-button";
import {
  ChartSkeleton,
  EmptyState,
  ErrorState,
  ListSkeleton,
  QueryBoundary,
} from "@/components/query-boundary";
import { Trash2, ImageIcon, Scale, Ruler, Camera, LineChart } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { ema } from "@forja/domain";
import { LazyMeasurementSparkline, LazyWeightChart } from "@/components/charts/lazy-chart";
import { subDays } from "date-fns";
import { formatDayMonth, formatShortDate, toISODate, todayISO } from "@/lib/date";
import { PHOTOS_BUCKET, usePhotoSessions, useSignedPhotoUrls } from "@/data/progress-photos";
import { NewProgressDialog } from "@/components/progress/new-progress-dialog";
import { PhotoCompare } from "@/components/progress/photo-compare";
import { PhotoTimeline } from "@/components/progress/photo-timeline";

export const Route = createFileRoute("/_authenticated/body")({
  head: () => ({
    meta: [
      { title: "Corpo — Forja" },
      { name: "description", content: "Peso, medidas e progresso corporal." },
      { property: "og:title", content: "Corpo — Forja" },
      { property: "og:description", content: "Peso e medidas com média móvel." },
    ],
  }),
  component: BodyPage,
});

const HISTORY_DAYS = 180;

/** Faixa plausível de peso corporal — evita erros de digitação virarem dados. */
const WEIGHT_RANGE = { min: 20, max: 400 };

/**
 * Progresso corporal.
 *
 * A aba "Resumo" vem primeiro e é a padrão porque as outras três mostram dados
 * brutos — peso, medidas, fotos — e nenhuma delas responde sozinha à pergunta
 * que traz a pessoa aqui: "estou indo bem?". O resumo faz a leitura; as demais
 * ficam para quem quer o detalhe ou vem registrar.
 */
function BodyPage() {
  return (
    <>
      <PageHeader title="Progresso" description="Onde você está e para onde está indo." />
      <PageBody>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              <LineChart className="mr-1.5 size-4" aria-hidden />
              Resumo
            </TabsTrigger>
            <TabsTrigger value="weight">
              <Scale className="mr-1.5 size-4" aria-hidden />
              Peso
            </TabsTrigger>
            <TabsTrigger value="measures">
              <Ruler className="mr-1.5 size-4" aria-hidden />
              Medidas
            </TabsTrigger>
            <TabsTrigger value="photos">
              <Camera className="mr-1.5 size-4" aria-hidden />
              Fotos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <ProgressOverview />
          </TabsContent>
          <TabsContent value="weight" className="mt-4">
            <WeightPanel />
          </TabsContent>
          <TabsContent value="measures" className="mt-4">
            <MeasurementsPanel />
          </TabsContent>
          <TabsContent value="photos" className="mt-4">
            <PhotosPanel />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

function WeightPanel() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const [weight, setWeight] = useState("");
  const [logDate, setLogDate] = useState(todayISO());

  const weights = useQuery({
    queryKey: queryKeys.body.weights(HISTORY_DAYS),
    queryFn: async () => {
      const from = toISODate(subDays(new Date(), HISTORY_DAYS));
      return unwrapList(
        "carregar histórico de peso",
        await supabase
          .from("body_weights")
          .select("log_date, weight_kg")
          .gte("log_date", from)
          .order("log_date"),
      );
    },
  });

  const value = Number(weight);
  const invalid =
    weight === "" ||
    !Number.isFinite(value) ||
    value < WEIGHT_RANGE.min ||
    value > WEIGHT_RANGE.max;

  const save = useMutation({
    mutationFn: async () => {
      if (invalid)
        throw new Error(`Informe um peso entre ${WEIGHT_RANGE.min} e ${WEIGHT_RANGE.max} kg.`);
      assertOk(
        "registrar peso",
        await supabase
          .from("body_weights")
          .upsert(
            { user_id: userId, log_date: logDate, weight_kg: value },
            { onConflict: "user_id,log_date" },
          ),
      );
    },
    onSuccess: () => {
      toast.success("Peso registrado");
      setWeight("");
      // Invalida toda a árvore de corpo: histórico, último peso e a janela do dashboard.
      void qc.invalidateQueries({ queryKey: queryKeys.body.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const chart = useMemo(() => {
    const rows = weights.data ?? [];
    const series = rows.map((w) => num(w.weight_kg));
    const smoothed = ema(series, 0.2);
    return rows.map((w, i) => ({
      date: formatDayMonth(w.log_date),
      peso: num(w.weight_kg),
      tendencia: Number((smoothed[i] ?? 0).toFixed(2)),
    }));
  }, [weights.data]);

  const ultimo = chart.at(-1);
  const anterior = chart.at(-2);
  const delta = ultimo && anterior ? ultimo.tendencia - anterior.tendencia : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Registrar peso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/*
            O peso atual antes do formulário.
            A tela abria direto num campo vazio — para saber quanto pesava na
            última vez era preciso ler o gráfico ao lado, que mostra a
            tendência, não a última medição. O número que a pessoa quer conferir
            antes de digitar o de hoje agora é a primeira coisa que ela vê.
          */}
          {ultimo && (
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Último registro
              </p>
              <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums tracking-tight">
                  {ultimo.peso.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                </span>
                <span className="text-sm text-muted-foreground">kg · {ultimo.date}</span>
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="weight-date">Data</Label>
            <Input
              id="weight-date"
              type="date"
              value={logDate}
              max={todayISO()}
              onChange={(e) => e.target.value && setLogDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weight-value">Peso (kg)</Label>
            <Input
              id="weight-value"
              type="number"
              step="0.1"
              min={WEIGHT_RANGE.min}
              max={WEIGHT_RANGE.max}
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !invalid) save.mutate();
              }}
              placeholder="Ex: 75,4"
              aria-invalid={weight !== "" && invalid}
              aria-describedby="weight-hint"
            />
            <p id="weight-hint" className="text-xs text-muted-foreground">
              Registrar de novo no mesmo dia atualiza o valor.
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => save.mutate()}
            loading={save.isPending}
            loadingLabel="Salvando peso"
            disabled={invalid}
          >
            Adicionar peso
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-baseline justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Histórico — {HISTORY_DAYS} dias</CardTitle>
          {delta !== null && (
            <span className="text-xs text-muted-foreground">
              tendência {delta >= 0 ? "+" : ""}
              {delta.toFixed(2)} kg
            </span>
          )}
        </CardHeader>
        <CardContent className="h-72">
          <QueryBoundary
            query={weights}
            skeleton={<ChartSkeleton />}
            empty={
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Registre seu primeiro peso para ver a tendência.
              </div>
            }
          >
            {() => <LazyWeightChart data={chart} showDots />}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

type MeasureKey =
  | "shoulder_cm"
  | "chest_cm"
  | "waist_cm"
  | "abdomen_cm"
  | "hip_cm"
  | "arm_cm"
  | "forearm_cm"
  | "thigh_cm"
  | "calf_cm"
  | "neck_cm"
  | "body_fat_pct";

/**
 * As medidas acompanhadas.
 *
 * A tabela `body_measurements` sempre teve onze colunas; a tela mostrava sete.
 * Ombro e panturrilha — duas das medidas que mais mudam com hipertrofia —
 * existiam no banco e não tinham como ser preenchidas por ninguém.
 *
 * `grupo` existe para os onze campos não virarem uma coluna única de onze
 * caixas iguais: separados por região, dá para preencher só o bloco que
 * interessa. Quase ninguém mede tudo toda vez.
 *
 * As faixas não são validação teatral: são o que impede um `180` digitado no
 * campo de braço (a altura, por reflexo) de entrar como circunferência e
 * arruinar a escala do gráfico para sempre.
 */
const MEASURE_FIELDS: {
  key: MeasureKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  grupo: "Tronco" | "Braços" | "Pernas" | "Composição";
}[] = [
  { key: "shoulder_cm", label: "Ombro", unit: "cm", min: 60, max: 200, grupo: "Tronco" },
  { key: "chest_cm", label: "Peito", unit: "cm", min: 30, max: 250, grupo: "Tronco" },
  { key: "waist_cm", label: "Cintura", unit: "cm", min: 30, max: 250, grupo: "Tronco" },
  { key: "abdomen_cm", label: "Abdômen", unit: "cm", min: 30, max: 250, grupo: "Tronco" },
  { key: "hip_cm", label: "Quadril", unit: "cm", min: 30, max: 250, grupo: "Tronco" },
  { key: "neck_cm", label: "Pescoço", unit: "cm", min: 20, max: 80, grupo: "Tronco" },
  { key: "arm_cm", label: "Braço", unit: "cm", min: 10, max: 100, grupo: "Braços" },
  { key: "forearm_cm", label: "Antebraço", unit: "cm", min: 10, max: 80, grupo: "Braços" },
  { key: "thigh_cm", label: "Coxa", unit: "cm", min: 20, max: 150, grupo: "Pernas" },
  { key: "calf_cm", label: "Panturrilha", unit: "cm", min: 15, max: 100, grupo: "Pernas" },
  { key: "body_fat_pct", label: "% Gordura", unit: "%", min: 1, max: 70, grupo: "Composição" },
];

/** Regiões na ordem em que aparecem no formulário, de cima para baixo do corpo. */
const MEASURE_GROUPS = ["Tronco", "Braços", "Pernas", "Composição"] as const;

function MeasurementsPanel() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const [logDate, setLogDate] = useState(todayISO());
  const [values, setValues] = useState<Partial<Record<MeasureKey, string>>>({});

  const measurements = useQuery({
    queryKey: queryKeys.body.measurements(),
    queryFn: async () => {
      const from = toISODate(subDays(new Date(), HISTORY_DAYS));
      return unwrapList(
        "carregar medidas",
        await supabase
          .from("body_measurements")
          .select("*")
          .gte("log_date", from)
          .order("log_date"),
      );
    },
  });

  const preenchidos = MEASURE_FIELDS.filter((f) => (values[f.key] ?? "") !== "");
  const invalidos = preenchidos.filter((f) => {
    const v = Number(values[f.key]);
    return !Number.isFinite(v) || v < f.min || v > f.max;
  });

  const save = useMutation({
    mutationFn: async () => {
      if (preenchidos.length === 0) throw new Error("Preencha ao menos uma medida.");
      if (invalidos.length > 0) {
        throw new Error(`${invalidos[0].label}: valor fora da faixa esperada.`);
      }
      const payload: Record<string, number | string> = { user_id: userId, log_date: logDate };
      for (const f of preenchidos) payload[f.key] = Number(values[f.key]);
      assertOk(
        "registrar medidas",
        await supabase.from("body_measurements").insert(payload as never),
      );
    },
    onSuccess: () => {
      toast.success("Medidas registradas");
      setValues({});
      void qc.invalidateQueries({ queryKey: queryKeys.body.measurements() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertOk("excluir medida", await supabase.from("body_measurements").delete().eq("id", id));
    },
    onSuccess: () => {
      toast.success("Registro excluído");
      void qc.invalidateQueries({ queryKey: queryKeys.body.measurements() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const seriesFor = (key: MeasureKey) =>
    (measurements.data ?? [])
      .filter((m) => (m as Record<string, unknown>)[key] != null)
      .map((m) => ({
        date: formatDayMonth(m.log_date),
        v: num((m as Record<string, unknown>)[key]),
      }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registrar medidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="measure-date">Data</Label>
            <Input
              id="measure-date"
              type="date"
              value={logDate}
              max={todayISO()}
              onChange={(e) => e.target.value && setLogDate(e.target.value)}
            />
          </div>
          {/* Agrupado por região: onze caixas iguais em coluna única viram um
              formulário de censo. Separadas, dá para preencher só o bloco que
              interessa — que é o que acontece na prática. */}
          {MEASURE_GROUPS.map((grupo) => (
            <fieldset key={grupo} className="space-y-3">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {grupo}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {MEASURE_FIELDS.filter((f) => f.grupo === grupo).map((f) => {
                  const raw = values[f.key] ?? "";
                  const v = Number(raw);
                  const bad = raw !== "" && (!Number.isFinite(v) || v < f.min || v > f.max);
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={f.key}>
                        {f.label} ({f.unit})
                      </Label>
                      <Input
                        id={f.key}
                        type="number"
                        step="0.1"
                        min={f.min}
                        max={f.max}
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                        aria-invalid={bad}
                        aria-describedby={bad ? `${f.key}-error` : undefined}
                      />
                      {bad && (
                        <p id={`${f.key}-error`} className="text-xs text-destructive">
                          Esperado entre {f.min} e {f.max} {f.unit}.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <Button
            className="w-full"
            onClick={() => save.mutate()}
            loading={save.isPending}
            loadingLabel="Salvando medidas"
            disabled={preenchidos.length === 0 || invalidos.length > 0}
          >
            Salvar
          </Button>
          <p className="text-xs text-muted-foreground">Preencha só o que quiser acompanhar.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendências</CardTitle>
          </CardHeader>
          <CardContent>
            <QueryBoundary
              query={measurements}
              skeleton={
                <div className="grid gap-3 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-lg" />
                  ))}
                </div>
              }
              empty={
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Registre suas medidas para ver a evolução.
                </p>
              }
            >
              {() => (
                <div className="grid gap-3 sm:grid-cols-2">
                  {MEASURE_FIELDS.map((f) => {
                    const data = seriesFor(f.key);
                    if (data.length === 0) return null;
                    const atual = data.at(-1)?.v ?? 0;
                    const inicial = data[0]?.v ?? atual;
                    const diff = atual - inicial;
                    return (
                      <div key={f.key} className="rounded-lg border border-border p-3">
                        <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                        <p className="mb-2 flex items-baseline gap-2">
                          <span className="text-lg font-semibold">
                            {atual} {f.unit}
                          </span>
                          {data.length > 1 && (
                            <span className="text-xs text-muted-foreground">
                              {diff >= 0 ? "+" : ""}
                              {diff.toFixed(1)} {f.unit}
                            </span>
                          )}
                        </p>
                        <div className="h-16">
                          <LazyMeasurementSparkline data={data} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </QueryBoundary>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <QueryBoundary
              query={measurements}
              skeleton={<ListSkeleton rows={3} />}
              empty={
                <p className="py-8 text-center text-sm text-muted-foreground">Sem registros.</p>
              }
            >
              {(rows) => (
                <ul className="divide-y divide-border">
                  {[...rows].reverse().map((m) => {
                    const resumo = MEASURE_FIELDS.filter(
                      (f) => (m as Record<string, unknown>)[f.key] != null,
                    )
                      .map((f) => `${f.label} ${(m as Record<string, unknown>)[f.key]}${f.unit}`)
                      .join(" · ");
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-medium">{formatShortDate(m.log_date)}</p>
                          <p className="text-xs text-muted-foreground">{resumo || "—"}</p>
                        </div>
                        <ConfirmButton
                          aria-label={`Excluir medidas de ${formatShortDate(m.log_date)}`}
                          title="Excluir este registro?"
                          description="As medidas desta data são removidas permanentemente."
                          onConfirm={() => remove.mutate(m.id)}
                        >
                          <Trash2 className="size-4" />
                        </ConfirmButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </QueryBoundary>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Registro fotográfico da evolução.
 *
 * ## O que mudou em relação ao formulário anterior
 *
 * Antes: um cartão fixo com data, ângulo e seletor de arquivo, mais uma grade
 * de miniaturas em que se marcava duas fotos quaisquer para ver lado a lado.
 * Registrar os quatro ângulos de um dia custava quatro passagens pelo mesmo
 * formulário — e comparar permitia colocar a frente de agosto ao lado da
 * lateral de outubro, o que produz uma diferença enorme e sem nenhum
 * significado.
 *
 * Agora a unidade é a **sessão** (as fotos de um dia, com o peso daquele dia),
 * a leitura é uma **linha do tempo**, e a comparação é entre duas datas — com
 * o ângulo escolhido igual dos dois lados.
 */
function PhotosPanel() {
  const qc = useQueryClient();
  const [novaAberta, setNovaAberta] = useState(false);
  const [selecao, setSelecao] = useState<string[]>([]);

  const photos = useQuery({
    queryKey: queryKeys.body.photos(),
    queryFn: async () =>
      unwrapList(
        "carregar fotos",
        await supabase
          .from("progress_photos")
          .select("id, log_date, angle, storage_path, weight_kg, notes")
          .order("log_date", { ascending: false }),
      ),
  });

  const lista = useMemo(() => photos.data ?? [], [photos.data]);
  const caminhos = useMemo(() => lista.map((p) => p.storage_path), [lista]);
  const urls = useSignedPhotoUrls(caminhos);
  const sessoes = usePhotoSessions(lista);

  const remover = useMutation({
    mutationFn: async (p: { id: string; storage_path: string }) => {
      await supabase.storage.from(PHOTOS_BUCKET).remove([p.storage_path]);
      assertOk("excluir foto", await supabase.from("progress_photos").delete().eq("id", p.id));
    },
    onSuccess: () => {
      toast.success("Foto excluída");
      void qc.invalidateQueries({ queryKey: queryKeys.body.photos() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  /**
   * Alterna uma data na comparação, mantendo no máximo duas.
   *
   * Ao escolher uma terceira, a mais antiga da seleção sai. É o comportamento
   * que dispensa "limpar seleção": continuar tocando datas sempre compara as
   * duas últimas escolhidas.
   */
  const alternarSelecao = (date: string) => {
    setSelecao((atual) => {
      if (atual.includes(date)) return atual.filter((d) => d !== date);
      return atual.length < 2 ? [...atual, date] : [atual[1], date];
    });
  };

  // A ordem cronológica manda no "antes" e no "depois", não a ordem em que as
  // datas foram tocadas — senão a comparação inverteria conforme o toque.
  const [antes, depois] = useMemo(() => {
    const escolhidas = selecao
      .map((d) => sessoes.find((s) => s.date === d))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => a.date.localeCompare(b.date));
    return [escolhidas[0], escolhidas[1]];
  }, [selecao, sessoes]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Registro fotográfico</h2>
          <p className="text-sm text-muted-foreground">
            Suas fotos são privadas — visíveis só para você.
          </p>
        </div>
        <Button onClick={() => setNovaAberta(true)}>
          <Camera aria-hidden />
          Nova evolução
        </Button>
      </div>

      {antes && depois && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {formatShortDate(antes.date)} <span className="text-muted-foreground">vs.</span>{" "}
              {formatShortDate(depois.date)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoCompare before={antes} after={depois} urls={urls} />
          </CardContent>
        </Card>
      )}

      {selecao.length === 1 && (
        <p className="rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
          Escolha uma segunda data na linha do tempo para comparar.
        </p>
      )}

      <QueryBoundary
        query={photos}
        skeleton={
          <div className="space-y-6">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2 pl-7">
                <Skeleton className="h-5 w-40" />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[0, 1, 2, 3].map((j) => (
                    <Skeleton key={j} className="aspect-[3/4] w-full rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        }
        empty={
          <EmptyState
            icon={<ImageIcon className="size-6" />}
            title="Nenhuma foto ainda"
            description="Fotos de progresso mostram mudanças que a balança não captura. O app ajuda a manter o mesmo enquadramento entre elas, para a comparação valer alguma coisa."
            action={
              <Button onClick={() => setNovaAberta(true)}>
                <Camera aria-hidden />
                Registrar a primeira
              </Button>
            }
          />
        }
      >
        {() => (
          <PhotoTimeline
            sessions={sessoes}
            urls={urls}
            selection={selecao}
            onToggleSelect={alternarSelecao}
            onDelete={(foto) => remover.mutate(foto)}
          />
        )}
      </QueryBoundary>

      <NewProgressDialog
        open={novaAberta}
        onOpenChange={setNovaAberta}
        existingPhotos={lista}
        referenceUrls={urls}
      />
    </div>
  );
}
