import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, RefreshCw, SwitchCamera, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/**
 * Captura da foto de evolução, com guia de enquadramento.
 *
 * ## O problema que o guia resolve
 *
 * Uma sequência de fotos de evolução só vale alguma coisa se as fotos forem
 * comparáveis. Meio metro a mais de distância, o celular dois palmos mais alto,
 * o corpo virado 15° — qualquer um desses muda a silhueta mais do que três
 * meses de treino mudam. A pessoa então olha duas fotos e não sabe se mudou o
 * corpo ou mudou a câmera.
 *
 * ## Duas ajudas, uma bem melhor que a outra
 *
 * 1. **Silhueta de referência** — linhas de terço e um contorno humano. Ajuda
 *    na primeira foto, quando não há com o que comparar.
 * 2. **Fantasma da foto anterior** — a última foto do *mesmo ângulo*
 *    sobreposta, com opacidade ajustável. Esta é a que realmente funciona:
 *    alinhar ombros e cintura com a própria foto de dois meses atrás é preciso
 *    de um jeito que nenhuma silhueta genérica consegue ser, porque a
 *    referência é o corpo certo, na distância certa, no enquadramento certo.
 *
 * O controle de opacidade existe porque o valor útil muda com a foto: sobre um
 * fundo claro, 30% já orienta; sobre um escuro, some.
 *
 * ## Degradação
 *
 * Câmera é um recurso que falha de muitas formas — sem permissão, sem
 * dispositivo, contexto não seguro (HTTP), aba sem foco. Em todas elas o
 * componente cai no seletor de arquivos, que funciona em qualquer lugar e no
 * celular abre a câmera nativa de qualquer jeito. Nunca fica sem saída.
 */
export function PhotoCapture({
  angleLabel,
  referenceUrl,
  onCapture,
  onCancel,
}: {
  /** Nome do ângulo sendo fotografado, exibido no topo. */
  angleLabel: string;
  /** Foto anterior do mesmo ângulo, usada como fantasma. */
  referenceUrl?: string | null;
  onCapture: (file: File) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<"iniciando" | "ativa" | "indisponivel">("iniciando");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [ghostOpacity, setGhostOpacity] = useState(35);

  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      // `mediaDevices` só existe em contexto seguro (HTTPS ou localhost).
      // Checar antes evita um `TypeError` cru no console em HTTP.
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("indisponivel");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1440 } },
          audio: false,
        });

        // A permissão pode voltar depois de o componente ter sido desmontado.
        // Sem esta guarda a câmera ficaria ligada, com a luz acesa e sem
        // ninguém para desligá-la.
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("ativa");
      } catch {
        // Permissão negada, sem câmera, ou dispositivo em uso por outro app.
        // Os três levam ao mesmo lugar útil: o seletor de arquivos.
        if (!cancelado) setStatus("indisponivel");
      }
    }

    void iniciar();
    return () => {
      cancelado = true;
      pararCamera();
    };
  }, [facingMode, pararCamera]);

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A câmera frontal é exibida espelhada (é o que se espera de um espelho),
    // mas gravar espelhado inverteria a foto em relação à realidade e faria
    // "lado esquerdo" virar o direito na comparação. O desespelhamento acontece
    // aqui, no arquivo, não na exibição.
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `evolucao-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border bg-foreground">
        <div className="relative aspect-[3/4] w-full">
          {status === "ativa" ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "size-full object-cover",
                // Espelhado só na exibição — ver-se invertido é desorientador.
                facingMode === "user" && "-scale-x-100",
              )}
            />
          ) : (
            <div className="grid size-full place-items-center p-6 text-center">
              {status === "iniciando" ? (
                <p className="text-sm text-background/80">Abrindo a câmera…</p>
              ) : (
                <div className="space-y-3">
                  <ImageIcon className="mx-auto size-8 text-background/60" aria-hidden />
                  <p className="text-sm text-background/80">
                    Câmera indisponível neste aparelho ou sem permissão.
                    <br />
                    Escolha uma foto da galeria.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Fantasma da foto anterior, por cima do vídeo. */}
          {referenceUrl && status === "ativa" && (
            <img
              src={referenceUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full object-cover"
              style={{ opacity: ghostOpacity / 100 }}
            />
          )}

          {status === "ativa" && <FramingGuide />}

          {status === "ativa" && (
            <p className="absolute inset-x-0 top-0 bg-gradient-to-b from-foreground/70 to-transparent p-3 text-center text-sm font-medium text-background">
              {angleLabel}
            </p>
          )}
        </div>
      </div>

      {referenceUrl && status === "ativa" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="ghost-opacity" className="text-sm font-medium">
              Foto anterior sobreposta
            </label>
            <span className="text-sm tabular-nums text-muted-foreground">{ghostOpacity}%</span>
          </div>
          <Slider
            id="ghost-opacity"
            value={[ghostOpacity]}
            onValueChange={([v]) => setGhostOpacity(v ?? 0)}
            min={0}
            max={80}
            step={5}
            aria-label="Opacidade da foto anterior"
          />
          <p className="text-xs text-muted-foreground">
            Alinhe ombros e cintura com a imagem de fundo para as fotos ficarem comparáveis.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "ativa" ? (
          <>
            <Button className="flex-1" onClick={capturar}>
              <Camera aria-hidden />
              Tirar foto
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
              aria-label="Alternar entre câmera frontal e traseira"
            >
              <SwitchCamera aria-hidden />
            </Button>
          </>
        ) : (
          <Button className="flex-1" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon aria-hidden />
            Escolher da galeria
          </Button>
        )}

        {status === "ativa" && (
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Escolher foto da galeria"
          >
            <ImageIcon aria-hidden />
            Galeria
          </Button>
        )}

        {status === "indisponivel" && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStatus("iniciando")}
            aria-label="Tentar abrir a câmera de novo"
          >
            <RefreshCw aria-hidden />
          </Button>
        )}

        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancelar">
          <X aria-hidden />
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        // `capture` não é usado: forçá-lo tiraria da pessoa a opção de escolher
        // uma foto que ela já tem, que é metade dos casos.
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCapture(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Guia de enquadramento.
 *
 * Linhas de terço para a altura da câmera e uma silhueta central para a
 * distância. Traço fino e translúcido: um guia que compete com a imagem atrapalha
 * mais do que ajuda a enquadrar.
 *
 * `vectorEffect="non-scaling-stroke"` mantém a espessura constante quando o SVG
 * é esticado pelo `viewBox` — sem isso o traço engrossaria junto com a caixa.
 */
function FramingGuide() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox="0 0 300 400"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g stroke="white" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke">
        <line x1="100" y1="0" x2="100" y2="400" />
        <line x1="200" y1="0" x2="200" y2="400" />
        <line x1="0" y1="133" x2="300" y2="133" />
        <line x1="0" y1="267" x2="300" y2="267" />
      </g>

      {/* Silhueta: cabeça, tronco e pernas. Proporções aproximadas de um corpo
          em pé ocupando a altura útil do quadro. */}
      <g
        fill="none"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeDasharray="6 5"
        vectorEffect="non-scaling-stroke"
      >
        <circle cx="150" cy="72" r="26" />
        <path d="M150 98 L150 250" />
        <path d="M108 140 L150 118 L192 140" />
        <path d="M124 250 L150 250 L176 250" />
        <path d="M132 250 L128 340" />
        <path d="M168 250 L172 340" />
      </g>
    </svg>
  );
}
