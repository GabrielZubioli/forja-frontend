import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage } from "@/data/supabase-helpers";
import {
  PHOTOS_BUCKET,
  photoStoragePath,
  validatePhotoFile,
  type ProgressPhoto,
} from "@/data/progress-photos";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhotoCapture } from "@/components/progress/photo-capture";
import { PHOTO_ANGLE_OPTIONS, type PhotoAngleValue } from "@/lib/labels";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * Registrar uma evolução.
 *
 * ## A sessão, não a foto
 *
 * O fluxo antigo registrava **uma** foto por vez: escolher ângulo, escolher
 * arquivo, enviar; repetir quatro vezes, reabrindo o formulário e reescolhendo
 * a data a cada volta. Ninguém faz isso quatro vezes — e é por isso que
 * praticamente todo mundo tinha só fotos de frente.
 *
 * Aqui a unidade é a **sessão**: escolhe-se os ângulos uma vez, fotografa-se
 * todos em sequência, confere-se o conjunto e salva-se de uma vez, com o peso
 * do dia junto. É a mesma quantidade de fotos com um quarto das decisões.
 *
 * ## Nada é enviado antes de confirmar
 *
 * As fotos ficam em memória (como `File`) até a etapa final. Enviar cada uma no
 * momento da captura seria mais simples de programar e deixaria lixo no bucket
 * a cada desistência no meio do caminho — e desistir no meio do caminho é o
 * comportamento normal de quem está tirando foto do próprio corpo.
 */

type Etapa = "angulos" | "captura" | "revisao";

/** Uma foto capturada, ainda não enviada. */
type Captura = {
  angle: PhotoAngleValue;
  file: File;
  /** `blob:` para a pré-visualização. Precisa ser revogado ao descartar. */
  previewUrl: string;
};

export function NewProgressDialog({
  open,
  onOpenChange,
  /** Fotos já existentes, para oferecer a anterior de cada ângulo como guia. */
  existingPhotos,
  referenceUrls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPhotos: readonly ProgressPhoto[];
  referenceUrls: Record<string, string>;
}) {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const [etapa, setEtapa] = useState<Etapa>("angulos");
  const [logDate, setLogDate] = useState(todayISO());
  const [angulos, setAngulos] = useState<PhotoAngleValue[]>(["front"]);
  const [capturas, setCapturas] = useState<Captura[]>([]);
  const [peso, setPeso] = useState("");

  /**
   * Última foto de cada ângulo — a referência do fantasma na câmera.
   *
   * `existingPhotos` chega ordenada da mais recente para a mais antiga, então a
   * primeira ocorrência de cada ângulo já é a mais recente.
   */
  const referenciaPorAngulo = useMemo(() => {
    const mapa: Partial<Record<string, string>> = {};
    for (const foto of existingPhotos) {
      if (!foto.angle || mapa[foto.angle]) continue;
      const url = referenceUrls[foto.storage_path];
      if (url) mapa[foto.angle] = url;
    }
    return mapa;
  }, [existingPhotos, referenceUrls]);

  const proximoAngulo = angulos.find((a) => !capturas.some((c) => c.angle === a)) ?? null;

  // Objetos `blob:` vivem até serem revogados explicitamente; sem esta limpeza
  // cada abertura do diálogo vazaria as imagens da anterior.
  const descartarTudo = () => {
    setCapturas((atuais) => {
      atuais.forEach((c) => URL.revokeObjectURL(c.previewUrl));
      return [];
    });
  };

  useEffect(() => {
    if (open) return;
    // Fechou: volta ao começo e libera a memória das pré-visualizações.
    descartarTudo();
    setEtapa("angulos");
    setAngulos(["front"]);
    setPeso("");
    setLogDate(todayISO());
  }, [open]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (capturas.length === 0) throw new Error("Nenhuma foto para salvar.");

      const pesoNum = peso.trim() === "" ? null : Number(peso);
      if (pesoNum !== null && (!Number.isFinite(pesoNum) || pesoNum < 20 || pesoNum > 400)) {
        throw new Error("Informe um peso entre 20 e 400 kg.");
      }

      const enviados: string[] = [];

      try {
        for (const captura of capturas) {
          validatePhotoFile(captura.file);
          const path = photoStoragePath(userId, captura.angle, captura.file.name);

          const { error } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .upload(path, captura.file, { upsert: false, contentType: captura.file.type });
          if (error) throw new Error(error.message);
          enviados.push(path);

          const insert = await supabase.from("progress_photos").insert({
            user_id: userId,
            storage_path: path,
            angle: captura.angle,
            log_date: logDate,
            weight_kg: pesoNum,
          });
          assertOk("salvar foto", insert);
        }
      } catch (e) {
        // Uma falha no meio deixaria arquivos sem linha de metadados — órfãos
        // que ninguém consegue ver nem apagar pela interface. Desfaz o que
        // subiu antes de propagar o erro.
        if (enviados.length > 0) {
          await supabase.storage.from(PHOTOS_BUCKET).remove(enviados);
        }
        throw e;
      }

      // O peso da sessão também vira registro de peso: quem fotografa e informa
      // o peso não deveria precisar digitá-lo de novo na aba ao lado.
      if (pesoNum !== null) {
        assertOk(
          "registrar peso",
          await supabase
            .from("body_weights")
            .upsert(
              { user_id: userId, log_date: logDate, weight_kg: pesoNum },
              { onConflict: "user_id,log_date" },
            ),
        );
      }
    },
    onSuccess: () => {
      toast.success("Evolução registrada", {
        description: `${capturas.length} ${capturas.length === 1 ? "foto salva" : "fotos salvas"}.`,
      });
      void qc.invalidateQueries({ queryKey: queryKeys.body.all });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            {etapa !== "angulos" && (
              <button
                type="button"
                onClick={() => setEtapa(etapa === "revisao" ? "captura" : "angulos")}
                className="press-feedback -ml-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Voltar"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            Nova evolução
          </DialogTitle>
          <DialogDescription>
            {etapa === "angulos" && "Escolha os ângulos que quer registrar hoje."}
            {etapa === "captura" && `Foto ${capturas.length + 1} de ${angulos.length}.`}
            {etapa === "revisao" && "Confira as fotos e salve."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {etapa === "angulos" && (
            <EscolhaDeAngulos
              logDate={logDate}
              onLogDateChange={setLogDate}
              angulos={angulos}
              onAngulosChange={setAngulos}
              onAvancar={() => setEtapa("captura")}
            />
          )}

          {etapa === "captura" &&
            (proximoAngulo ? (
              <PhotoCapture
                key={proximoAngulo}
                angleLabel={PHOTO_ANGLE_OPTIONS.find((o) => o.value === proximoAngulo)?.label ?? ""}
                referenceUrl={referenciaPorAngulo[proximoAngulo] ?? null}
                onCapture={(file) => {
                  setCapturas((atuais) => [
                    ...atuais,
                    { angle: proximoAngulo, file, previewUrl: URL.createObjectURL(file) },
                  ]);
                }}
                onCancel={() => setEtapa("angulos")}
              />
            ) : (
              // Todos os ângulos capturados: a etapa de captura não tem mais o
              // que fazer e a revisão é o passo natural.
              <TodosCapturados onRevisar={() => setEtapa("revisao")} total={capturas.length} />
            ))}

          {etapa === "revisao" && (
            <Revisao
              capturas={capturas}
              peso={peso}
              onPesoChange={setPeso}
              onRemover={(angle) =>
                setCapturas((atuais) => {
                  const alvo = atuais.find((c) => c.angle === angle);
                  if (alvo) URL.revokeObjectURL(alvo.previewUrl);
                  return atuais.filter((c) => c.angle !== angle);
                })
              }
              onSalvar={() => salvar.mutate()}
              salvando={salvar.isPending}
            />
          )}
        </div>

        {/* Atalho para revisar antes de completar todos os ângulos escolhidos —
            tirar duas das quatro fotos e salvar é um caso legítimo. */}
        {etapa === "captura" && proximoAngulo && capturas.length > 0 && (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => setEtapa("revisao")}>
            Revisar {capturas.length} {capturas.length === 1 ? "foto" : "fotos"} e salvar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EscolhaDeAngulos({
  logDate,
  onLogDateChange,
  angulos,
  onAngulosChange,
  onAvancar,
}: {
  logDate: string;
  onLogDateChange: (v: string) => void;
  angulos: PhotoAngleValue[];
  onAngulosChange: (v: PhotoAngleValue[]) => void;
  onAvancar: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="evolucao-data">Data</Label>
        <Input
          id="evolucao-data"
          type="date"
          value={logDate}
          max={todayISO()}
          onChange={(e) => e.target.value && onLogDateChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Ângulos</p>
        <div role="group" aria-label="Ângulos a registrar" className="grid grid-cols-2 gap-2">
          {PHOTO_ANGLE_OPTIONS.map((opcao) => {
            const ativo = angulos.includes(opcao.value);
            return (
              <button
                key={opcao.value}
                type="button"
                aria-pressed={ativo}
                onClick={() =>
                  onAngulosChange(
                    ativo
                      ? angulos.filter((a) => a !== opcao.value)
                      : [
                          // Mantém a ordem canônica dos ângulos em vez da ordem
                          // em que foram tocados — fotografar de frente depois
                          // de costas confunde a sequência.
                          ...PHOTO_ANGLE_OPTIONS.filter(
                            (o) => angulos.includes(o.value) || o.value === opcao.value,
                          ).map((o) => o.value),
                        ],
                  )
                }
                className={cn(
                  "press-feedback flex items-center gap-2 rounded-lg border p-3 text-left text-sm font-medium cursor-pointer",
                  ativo
                    ? "border-primary bg-primary-soft text-primary-soft-foreground"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border",
                    ativo ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                  aria-hidden
                >
                  {ativo && <Check className="size-3" />}
                </span>
                {opcao.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Quatro ângulos mostram assimetrias que a foto de frente esconde. Dá para escolher menos.
        </p>
      </div>

      <Button className="w-full" onClick={onAvancar} disabled={angulos.length === 0}>
        <Camera aria-hidden />
        Começar
      </Button>
    </div>
  );
}

function TodosCapturados({ onRevisar, total }: { onRevisar: () => void; total: number }) {
  return (
    <div className="space-y-4 py-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success animate-pop">
        <Check className="size-6" aria-hidden />
      </span>
      <p className="text-sm">
        {total} {total === 1 ? "foto capturada" : "fotos capturadas"}.
      </p>
      <Button className="w-full" onClick={onRevisar}>
        Revisar e salvar
      </Button>
    </div>
  );
}

function Revisao({
  capturas,
  peso,
  onPesoChange,
  onRemover,
  onSalvar,
  salvando,
}: {
  capturas: Captura[];
  peso: string;
  onPesoChange: (v: string) => void;
  onRemover: (angle: PhotoAngleValue) => void;
  onSalvar: () => void;
  salvando: boolean;
}) {
  return (
    <div className="space-y-4">
      {capturas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma foto. Volte e capture ao menos uma.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {capturas.map((captura) => (
            <figure
              key={captura.angle}
              className="relative overflow-hidden rounded-lg border border-border"
            >
              <img
                src={captura.previewUrl}
                alt={`Prévia — ${PHOTO_ANGLE_OPTIONS.find((o) => o.value === captura.angle)?.label}`}
                className="aspect-[3/4] w-full object-cover"
              />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-foreground/70 px-2 py-1 text-xs text-background">
                <span className="truncate">
                  {PHOTO_ANGLE_OPTIONS.find((o) => o.value === captura.angle)?.label}
                </span>
                <button
                  type="button"
                  onClick={() => onRemover(captura.angle)}
                  className="press-feedback shrink-0 rounded p-0.5"
                  aria-label={`Descartar foto de ${PHOTO_ANGLE_OPTIONS.find((o) => o.value === captura.angle)?.label}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="evolucao-peso">
          Peso de hoje <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id="evolucao-peso"
          type="number"
          step="0.1"
          min={20}
          max={400}
          inputMode="decimal"
          placeholder="Ex: 75,4"
          value={peso}
          onChange={(e) => onPesoChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Fica junto das fotos na linha do tempo e também entra no histórico de peso.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="soft">Privado</Badge>
          Suas fotos ficam num espaço acessível só pela sua conta.
        </p>
      </div>

      <Button
        className="w-full"
        onClick={onSalvar}
        disabled={capturas.length === 0}
        loading={salvando}
        loadingLabel="Salvando evolução"
      >
        <Plus aria-hidden />
        Salvar evolução
      </Button>
    </div>
  );
}
