import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plano alimentar sem geração, contra um Supabase em memória.
 *
 * O fake cobre só o que `meal-plans.ts` usa: filtros `eq`/`is`/`in`, `insert`,
 * `update`, `delete`, `upsert` e o embed `meal_plan_items(...)`.
 */
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
let falhar: { table: string; op: string } | null = null;
let seq = 0;

function query(table: string) {
  const filtros: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  let payload: Row[] = [];
  let patch: Row = {};
  let colunas = "";
  let unico: "single" | "maybe" | null = null;

  const rows = () => (db[table] ??= []);
  const executar = () => {
    if (falhar && falhar.table === table && falhar.op === op) {
      return { data: null, error: { message: "falha simulada", code: "XX000" } };
    }
    let out: Row[] = [];
    if (op === "insert" || op === "upsert") {
      out = payload.map((r) => ({ id: `id${++seq}`, ...r }));
      rows().push(...out);
    } else if (op === "update") {
      out = rows().filter((r) => filtros.every((f) => f(r)));
      for (const r of out) Object.assign(r, patch);
    } else if (op === "delete") {
      db[table] = rows().filter((r) => !filtros.every((f) => f(r)));
    } else {
      out = rows()
        .filter((r) => filtros.every((f) => f(r)))
        .map((r) =>
          colunas.includes("meal_plan_items(")
            ? {
                ...r,
                meal_plan_items: (db.meal_plan_items ?? []).filter((i) => i.meal_id === r.id),
              }
            : r,
        );
    }
    if (unico) return { data: out[0] ?? null, error: null };
    return { data: out, error: null, count: out.length };
  };

  const b = {
    select(c = "") {
      colunas = c;
      return b;
    },
    insert(v: Row | Row[]) {
      op = "insert";
      payload = Array.isArray(v) ? v : [v];
      return b;
    },
    upsert(v: Row | Row[]) {
      op = "upsert";
      payload = Array.isArray(v) ? v : [v];
      return b;
    },
    update(v: Row) {
      op = "update";
      patch = v;
      return b;
    },
    delete() {
      op = "delete";
      return b;
    },
    eq(k: string, v: unknown) {
      filtros.push((r) => r[k] === v);
      return b;
    },
    is(k: string, v: unknown) {
      filtros.push((r) => (r[k] ?? null) === v);
      return b;
    },
    in(k: string, vs: unknown[]) {
      filtros.push((r) => vs.includes(r[k]));
      return b;
    },
    gte: () => b,
    order: () => b,
    limit: () => b,
    single() {
      unico = "single";
      return b;
    },
    maybeSingle() {
      unico = "maybe";
      return b;
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      return Promise.resolve(executar()).then(res, rej);
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: query } }));

const { createEmptyMealPlan, ensureActiveMealPlan } = await import("./meal-plans");

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  falhar = null;
});

describe("ensureActiveMealPlan", () => {
  it("sem plano, cria um vazio com as refeições do questionário — sem alimentos, horários nem metas", async () => {
    db.profiles = [{ id: "u1", meals_per_day: 4 }];
    const plano = await ensureActiveMealPlan("u1");

    expect(plano?.meals).toHaveLength(4);
    expect(plano?.meals.every((m) => m.items.length === 0 && !m.targetTime)).toBe(true);
    expect(plano?.kcalTarget).toBe(0);
    expect(db.meal_plans).toHaveLength(1);
    expect(db.meal_plans![0]).toMatchObject({ source: "custom", is_active: true });
    expect(db.meal_plan_items ?? []).toHaveLength(0);
  });

  it("plano existente — mesmo vazio — volta como está, sem gerar nem gravar nada", async () => {
    db.profiles = [{ id: "u1", meals_per_day: 3 }];
    await ensureActiveMealPlan("u1");
    const antes = JSON.stringify(db);
    await ensureActiveMealPlan("u1");
    await ensureActiveMealPlan("u1");
    expect(JSON.stringify(db)).toBe(antes);
  });

  it("plano antigo com alimentos é preservado", async () => {
    db.meal_plans = [
      { id: "antigo", user_id: "u1", is_active: true, deleted_at: null, name: "Cardápio" },
    ];
    db.meal_plan_meals = [{ id: "m1", plan_id: "antigo", slot: "lunch", position: 0 }];
    db.meal_plan_items = [{ id: "i1", meal_id: "m1", food_id: "f1", grams: 150, position: 0 }];
    const plano = await ensureActiveMealPlan("u1");
    expect(plano?.id).toBe("antigo");
    expect(plano?.meals[0]?.items).toHaveLength(1);
    expect(db.meal_plans).toHaveLength(1);
  });
});

describe("createEmptyMealPlan", () => {
  it("falha ao criar as refeições não deixa um plano sem refeições", async () => {
    falhar = { table: "meal_plan_meals", op: "insert" };
    await expect(createEmptyMealPlan("u1", 5)).rejects.toThrow();
    expect(db.meal_plans ?? []).toHaveLength(0);
  });
});
