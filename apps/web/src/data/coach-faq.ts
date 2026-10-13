/**
 * Perguntas prontas do Treinador, respondidas com os dados da própria pessoa.
 *
 * Não passam pelo modelo de linguagem: cada resposta é montada aqui, na hora,
 * a partir do perfil, do plano, dos treinos e das pesagens. Por isso respondem
 * instantaneamente, sem custo e mesmo com o treinador de IA desligado.
 */
import { addDays, startOfWeek } from "date-fns";
import { WEEKDAY_LABELS, weekdayOf, weeklyStreak } from "@forja/domain";
import { supabase } from "@/integrations/supabase/client";
import { num, unwrapMaybe } from "@/data/supabase-helpers";
import { fetchWorkoutWeek } from "@/data/workout-week";
import { fetchCompletedWorkouts } from "@/data/routines";
import { fetchWeighIns } from "@/data/body";
import { fetchPersonalRecords } from "@/data/workouts";
import { toISODate, todayISO } from "@/lib/date";

export type FaqKey =
  "calorias" | "proteina" | "treino-hoje" | "semana" | "peso" | "agua" | "recordes" | "carga";

export const COACH_FAQ: { key: FaqKey; pergunta: string }[] = [
  { key: "treino-hoje", pergunta: "Qual é o meu treino de hoje?" },
  { key: "semana", pergunta: "Como está minha semana de treinos?" },
  { key: "calorias", pergunta: "Quantas calorias devo comer por dia?" },
  { key: "proteina", pergunta: "Quanto de proteína eu preciso?" },
  { key: "peso", pergunta: "Como está a evolução do meu peso?" },
  { key: "agua", pergunta: "Quanta água devo beber?" },
  { key: "recordes", pergunta: "Quais são meus recordes?" },
  { key: "carga", pergunta: "Quando devo aumentar a carga?" },
];

const OBJETIVO: Record<string, string> = {
  lose: "perder gordura",
  maintain: "manter o peso",
  gain: "ganhar massa",
};

const n = (v: number, casas = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

async function perfil() {
  return unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle());
}

async function ultimoPeso(): Promise<number | null> {
  const p = await fetchWeighIns(365);
  return p.length ? p[p.length - 1]!.kg : null;
}

export async function answerFaq(key: FaqKey): Promise<string> {
  switch (key) {
    case "calorias": {
      const p = await perfil();
      const kcal = num(p?.daily_kcal_target);
      const naoPrescreve =
        "O Habitual Fit não calcula nem prescreve calorias: quanto comer depende de você e deve ser orientado por um nutricionista.";
      if (!kcal) {
        return [
          naoPrescreve,
          "Se você já tem metas definidas com o seu nutricionista, registre-as em Configurações → Metas nutricionais para acompanhar o dia a dia na Dieta.",
        ].join("\n\n");
      }
      return [`A meta que você registrou é de ${n(kcal)} kcal por dia.`, naoPrescreve].join("\n\n");
    }
    case "proteina": {
      const p = await perfil();
      const g = num(p?.protein_g_target);
      const naoPrescreve =
        "A quantidade de proteína ideal é individual — defina-a com um nutricionista.";
      if (!g) {
        return `${naoPrescreve}\n\nSe já tiver uma meta, registre em Configurações → Metas nutricionais e acompanhe o consumo na Dieta.`;
      }
      return `A meta que você registrou é de ${n(g)} g de proteína por dia.\n\n${naoPrescreve}`;
    }
    case "treino-hoje": {
      const semana = await fetchWorkoutWeek();
      if (!semana)
        return "Você ainda não tem um plano de treino. Monte um na tela Plano e eu passo a te dizer o treino de cada dia.";
      const hoje = weekdayOf(todayISO());
      const doDia = semana.splits.filter((s) => s.weekdays.includes(hoje));
      if (doDia.length === 0) {
        const proximo = [1, 2, 3, 4, 5, 6, 7]
          .map((d) => (hoje + d) % 7)
          .find((d) => semana.splits.some((s) => s.weekdays.includes(d)));
        return `Hoje (${WEEKDAY_LABELS[hoje].toLowerCase()}) é dia de descanso no seu plano. Descansar também é treino: é quando o músculo se recupera e cresce.${proximo !== undefined ? `\n\nO próximo treino é ${WEEKDAY_LABELS[proximo as 0].toLowerCase()}.` : ""}`;
      }
      return doDia
        .map((s) => {
          const nomes = s.exercises
            .slice(0, 6)
            .map((e) => `• ${e.name} — ${e.targetSets}×${e.targetReps}`);
          return `Hoje é ${s.name.replace(/^[A-Z]\s*—\s*/, "")}:\n${nomes.join("\n")}`;
        })
        .join("\n\n")
        .concat("\n\nPara começar, toque no botão Treinar.");
    }
    case "semana": {
      const inicio = startOfWeek(new Date(), { weekStartsOn: 1 });
      const [semana, treinos] = await Promise.all([
        fetchWorkoutWeek(),
        fetchCompletedWorkouts(toISODate(addDays(inicio, -7 * 25)), todayISO()),
      ]);
      const meta = semana?.daysPerWeek ?? 0;
      const nestaSemana = treinos.filter((t) => t.date >= toISODate(inicio)).length;
      const seq = meta
        ? weeklyStreak(
            treinos.map((t) => t.date),
            meta,
            todayISO(),
          )
        : 0;
      const falta = Math.max(0, meta - nestaSemana);
      return [
        `Esta semana você fez ${nestaSemana} de ${meta || "?"} treinos${falta === 0 && meta ? " — meta batida! 🎉" : "."}`,
        falta > 0 ? `Faltam ${falta} para fechar a semana.` : null,
        seq > 0
          ? `Você está há ${seq} ${seq === 1 ? "semana" : "semanas"} seguidas cumprindo a meta.`
          : "Cumpra a meta desta semana para começar uma sequência.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    case "peso": {
      const [pesos, p] = await Promise.all([fetchWeighIns(60), perfil()]);
      if (pesos.length === 0)
        return "Você ainda não registrou nenhum peso. Registre em Corpo — com 2 ou mais pesagens eu te mostro a tendência.";
      const ultimo = pesos[pesos.length - 1]!;
      const linhas = [`Seu último registro: ${n(ultimo.kg, 1)} kg.`];
      if (pesos.length >= 2) {
        const dif = ultimo.kg - pesos[0]!.kg;
        linhas.push(
          `Nos últimos 60 dias: ${dif > 0 ? "+" : ""}${n(dif, 1)} kg (${pesos.length} pesagens).`,
        );
      }
      const alvo = num(p?.goal_weight_kg);
      if (alvo) {
        const falta = alvo - ultimo.kg;
        linhas.push(
          Math.abs(falta) < 0.3
            ? `Você está na sua meta de ${n(alvo, 1)} kg. 👏`
            : `Faltam ${n(Math.abs(falta), 1)} kg para a meta de ${n(alvo, 1)} kg.`,
        );
      }
      linhas.push(
        "Dica: pese-se sempre no mesmo horário, de manhã, em jejum — e olhe a tendência, não o dia.",
      );
      return linhas.join("\n\n");
    }
    case "agua": {
      const [p, kg] = await Promise.all([perfil(), ultimoPeso()]);
      const ml = p?.water_ml_target ?? (kg ? Math.round((kg * 35) / 250) * 250 : null);
      if (!ml)
        return "Registre seu peso em Corpo e eu calculo sua meta de água (cerca de 35 ml por kg).";
      return `Sua meta é de ${n(ml / 1000, 2)} L por dia — uns ${Math.round(ml / 250)} copos de 250 ml.${p?.water_ml_target ? "" : ` Calculei pelo seu peso (${n(kg ?? 0, 1)} kg × 35 ml).`}\n\nNos dias de treino, some mais 500 ml a 1 L.`;
    }
    case "recordes": {
      const rs = await fetchPersonalRecords(5);
      if (rs.length === 0)
        return "Você ainda não tem recordes. Eles aparecem depois do primeiro treino com carga registrada.";
      return `Seus melhores (1RM estimado):\n${rs
        .map(
          (r) =>
            `• ${r.exerciseName}: ${n(r.weightKg, 1)} kg × ${r.reps} (≈ ${Math.round(r.e1rm)} kg)`,
        )
        .join("\n")}`;
    }
    case "carga":
      return [
        "Use a progressão dupla: cada exercício tem uma faixa de repetições (por exemplo, 8–12).",
        "Quando você completar todas as séries no topo da faixa com boa execução, suba a carga (2–2,5 kg em compostos, 1–2 kg em isolados) e volte para o início da faixa.",
        "O app já faz essa conta por você: na tela do treino, a sugestão de carga muda sozinha quando você bate o topo.",
      ].join("\n\n");
  }
}
