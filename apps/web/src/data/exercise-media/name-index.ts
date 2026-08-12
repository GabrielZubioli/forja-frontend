/**
 * Índice de nomes → pasta na free-exercise-db.
 *
 * ## O que ele resolve
 *
 * Exercícios sem identificador externo: os criados pelo próprio usuário, e os
 * que o seed antigo gravou só com nome. Para esses não existe `external_id`
 * nem `media_id` — sobra o nome, e é sobre o nome que este índice trabalha.
 *
 * A correspondência é por nome normalizado (sem acento, sem caixa, sem
 * pontuação) para sobreviver a "Leg Press 45°" × "Leg press 45". Quando o nome
 * exato não casa, as palavras-chave pegam o movimento genérico: uma foto de
 * supino reto ao lado de "supino declinado" comunica o movimento; nenhuma foto
 * não comunica nada.
 *
 * Vive dentro de `exercise-media/` porque é detalhe de um provedor, não
 * conhecimento geral do app — nenhum componente deveria importá-lo direto.
 */

/** Nome em pt-BR → pasta na base de origem. */
const SLUG_BY_NAME: readonly (readonly [string, string])[] = [
  ["Supino Reto com Barra", "Barbell_Bench_Press_-_Medium_Grip"],
  ["Supino Inclinado com Barra", "Barbell_Incline_Bench_Press_-_Medium_Grip"],
  ["Supino Reto com Halteres", "Dumbbell_Bench_Press"],
  ["Supino Inclinado com Halteres", "Incline_Dumbbell_Press"],
  ["Crucifixo com Halteres", "Dumbbell_Flyes"],
  ["Crossover no Cabo", "Cable_Crossover"],
  ["Peck Deck", "Butterfly"],
  ["Flexão de Braço", "Pushups"],
  ["Mergulho no Paralelo", "Dips_-_Chest_Version"],
  ["Agachamento Livre", "Barbell_Squat"],
  ["Agachamento Frontal", "Front_Barbell_Squat"],
  ["Leg Press 45°", "Leg_Press"],
  ["Cadeira Extensora", "Leg_Extensions"],
  ["Cadeira Flexora", "Seated_Leg_Curl"],
  ["Mesa Flexora", "Lying_Leg_Curls"],
  ["Stiff", "Stiff-Legged_Barbell_Deadlift"],
  ["Levantamento Terra", "Barbell_Deadlift"],
  ["Terra Romeno", "Romanian_Deadlift"],
  ["Avanço", "Dumbbell_Lunges"],
  ["Búlgaro", "Split_Squat_with_Dumbbells"],
  ["Hip Thrust", "Barbell_Hip_Thrust"],
  ["Elevação Pélvica", "Butt_Lift_Bridge"],
  ["Panturrilha em Pé", "Standing_Calf_Raises"],
  ["Panturrilha Sentado", "Seated_Calf_Raise"],
  ["Barra Fixa (Pull-up)", "Pullups"],
  ["Barra Fixa Pegada Supinada", "Chin-Up"],
  ["Puxada na Frente", "Wide-Grip_Lat_Pulldown"],
  ["Puxada Aberta", "Wide-Grip_Rear_Pull-Up"],
  ["Remada Curvada com Barra", "Bent_Over_Barbell_Row"],
  ["Remada Cavalinho", "T-Bar_Row_with_Handle"],
  ["Remada Baixa Cabo", "Seated_Cable_Rows"],
  ["Remada Unilateral com Halter", "One-Arm_Dumbbell_Row"],
  ["Pullover com Halter", "Straight-Arm_Dumbbell_Pullover"],
  ["Encolhimento com Halteres", "Dumbbell_Shrug"],
  ["Encolhimento com Barra", "Barbell_Shrug"],
  ["Face Pull", "Face_Pull"],
  ["Desenvolvimento com Barra", "Barbell_Shoulder_Press"],
  ["Desenvolvimento com Halteres", "Dumbbell_Shoulder_Press"],
  ["Desenvolvimento Arnold", "Arnold_Dumbbell_Press"],
  ["Elevação Lateral", "Side_Lateral_Raise"],
  ["Elevação Frontal", "Front_Dumbbell_Raise"],
  ["Crucifixo Invertido", "Reverse_Flyes"],
  ["Rosca Direta com Barra", "Barbell_Curl"],
  ["Rosca Direta com Halteres", "Dumbbell_Bicep_Curl"],
  ["Rosca Alternada", "Alternate_Incline_Dumbbell_Curl"],
  ["Rosca Martelo", "Hammer_Curls"],
  ["Rosca Scott", "Preacher_Curl"],
  ["Rosca Concentrada", "Concentration_Curls"],
  ["Tríceps Testa", "Lying_Triceps_Press"],
  ["Tríceps Corda", "Triceps_Pushdown_-_Rope_Attachment"],
  ["Tríceps Barra", "Triceps_Pushdown"],
  ["Tríceps Francês", "Seated_Triceps_Press"],
  ["Mergulho entre Bancos", "Bench_Dips"],
  ["Abdominal Supra", "Crunches"],
  ["Abdominal Infra", "Flat_Bench_Lying_Leg_Raise"],
  ["Prancha", "Plank"],
  ["Prancha Lateral", "Side_Bridge"],
  ["Russian Twist", "Russian_Twist"],
  ["Elevação de Pernas", "Hanging_Leg_Raise"],
  ["Ab Wheel", "Barbell_Ab_Rollout_-_On_Knees"],
  ["Rosca de Punho", "Palms-Up_Barbell_Wrist_Curl_Over_A_Bench"],
];

/**
 * Palavras-chave → pasta, para exercícios fora do núcleo.
 *
 * Última tentativa antes de desistir da imagem: pega o movimento genérico
 * ("qualquer supino", "qualquer rosca") em vez do exercício exato. Uma foto de
 * supino reto ao lado de "supino declinado" comunica o movimento; nenhuma foto
 * não comunica nada.
 */
const SLUG_BY_KEYWORD: readonly (readonly [string, string])[] = [
  ["supino", "Barbell_Bench_Press_-_Medium_Grip"],
  ["crucifixo invertido", "Reverse_Flyes"],
  ["crucifixo", "Dumbbell_Flyes"],
  ["flexao", "Pushups"],
  ["mergulho", "Bench_Dips"],
  ["agachamento", "Barbell_Squat"],
  ["leg press", "Leg_Press"],
  ["extensora", "Leg_Extensions"],
  ["flexora", "Lying_Leg_Curls"],
  ["stiff", "Stiff-Legged_Barbell_Deadlift"],
  ["terra", "Barbell_Deadlift"],
  ["avanco", "Dumbbell_Lunges"],
  ["afundo", "Dumbbell_Lunges"],
  ["bulgaro", "Split_Squat_with_Dumbbells"],
  ["hip thrust", "Barbell_Hip_Thrust"],
  ["pelvica", "Butt_Lift_Bridge"],
  ["panturrilha", "Standing_Calf_Raises"],
  ["barra fixa", "Pullups"],
  ["puxada", "Wide-Grip_Lat_Pulldown"],
  ["remada", "Bent_Over_Barbell_Row"],
  ["pullover", "Straight-Arm_Dumbbell_Pullover"],
  ["encolhimento", "Dumbbell_Shrug"],
  ["face pull", "Face_Pull"],
  ["desenvolvimento", "Barbell_Shoulder_Press"],
  ["elevacao lateral", "Side_Lateral_Raise"],
  ["elevacao frontal", "Front_Dumbbell_Raise"],
  ["rosca martelo", "Hammer_Curls"],
  ["rosca", "Barbell_Curl"],
  ["triceps", "Triceps_Pushdown"],
  ["abdominal", "Crunches"],
  ["prancha", "Plank"],
  ["elevacao de pernas", "Hanging_Leg_Raise"],
  ["agachamento sumo", "Barbell_Squat"],
];

/** Sem acento, sem caixa, sem pontuação — para a comparação sobreviver a variações. */
function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const POR_NOME = new Map(SLUG_BY_NAME.map(([nome, slug]) => [normalizar(nome), slug]));

/**
 * Pasta da free-exercise-db correspondente ao nome, ou `null`.
 *
 * As palavras-chave são testadas da mais longa para a mais curta, para
 * "crucifixo invertido" casar antes de "crucifixo" e "rosca martelo" antes de
 * "rosca". Sem essa ordenação o resultado dependeria da ordem de declaração,
 * que é exatamente o tipo de acoplamento invisível que quebra ao editar a
 * lista.
 */
export function exerciseSlugByName(name: string): string | null {
  const normalizado = normalizar(name);

  const exato = POR_NOME.get(normalizado);
  if (exato) return exato;

  const porPalavra = [...SLUG_BY_KEYWORD]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([termo]) => normalizado.includes(termo));

  return porPalavra ? porPalavra[1] : null;
}
