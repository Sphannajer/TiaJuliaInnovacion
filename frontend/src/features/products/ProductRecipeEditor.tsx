import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Eraser, Minus, Plus, Search, Trash2 } from "lucide-react";
import { behaviorIncrements } from "../../lib/stock";
import type { Ingredient, Option, OptionGroup, RecipeComponent } from "../../types";

interface ProductRecipeEditorProps {
  /** Tamaños (personal / pareja / familiar). Vacío = producto sin tamaños. */
  sizeOptions: Option[];
  /** Grupos de opciones del producto, SIN el grupo de tamaño. */
  optionGroups: OptionGroup[];
  ingredients: Ingredient[];
  components: RecipeComponent[];
  onChange: (components: RecipeComponent[]) => void;
  /** Oculta la leyenda cuando el modal ya puso un título propio. */
  showLegend?: boolean;
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = parseFloat(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Redondea a 3 decimales y evita colas infinitas de coma flotante. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function trimNumber(value: number): string {
  if (value <= 0) return "";
  return String(round3(value));
}

function formatQty(value: number): string {
  return round3(value).toLocaleString("es-PE", { maximumFractionDigits: 3 });
}

/**
 * Ensamblador producto ↔ insumos (sección 24.1).
 *
 * En vez de elegir insumos en una lista, el usuario ve los MISMOS cuadros que
 * al vender (fruta, base, endulzante…) y presiona cuántas unidades naturales
 * lleva: 3 fresas, 3 vasos de agua. El sistema convierte a la unidad base
 * usando `unit_weight`, así todo es medible y controlable sin pesar a mano.
 */
export function ProductRecipeEditor({
  sizeOptions,
  optionGroups,
  ingredients,
  components,
  onChange,
  showLegend = true,
}: ProductRecipeEditorProps) {
  const sizeIds = useMemo(() => new Set(sizeOptions.map((o) => o.id)), [sizeOptions]);
  const [activeSizeId, setActiveSizeId] = useState<number | null>(
    sizeOptions[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");

  // Si cambian los tamaños, asegura que el tamaño activo siga existiendo.
  useEffect(() => {
    if (sizeOptions.length === 0) {
      if (activeSizeId !== null) setActiveSizeId(null);
      return;
    }
    if (activeSizeId === null || !sizeIds.has(activeSizeId)) {
      setActiveSizeId(sizeOptions[0].id);
    }
  }, [sizeOptions, sizeIds, activeSizeId]);

  // Convierte recetas antiguas (size_multiplier) a filas explícitas por tamaño.
  const normalized = useRef(false);
  useEffect(() => {
    if (normalized.current) return;
    const hasLegacy = components.some(
      (c) => c.size_multiplier != null && c.size_option_id == null,
    );
    if (!hasLegacy) {
      normalized.current = true;
      return;
    }
    if (sizeOptions.length === 0) {
      normalized.current = true;
      onChange(
        components.map((c) => ({ ...c, size_multiplier: null, size_option_id: null })),
      );
      return;
    }
    const expanded: RecipeComponent[] = [];
    for (const component of components) {
      if (component.size_multiplier != null && component.size_option_id == null) {
        const base = toNumber(component.quantity_per_unit);
        for (const size of sizeOptions) {
          const factor = component.size_multiplier[size.name] ?? 1;
          expanded.push({
            ...component,
            size_option_id: size.id,
            size_multiplier: null,
            quantity_per_unit: String(round3(base * factor)),
          });
        }
      } else {
        expanded.push(component);
      }
    }
    normalized.current = true;
    onChange(expanded);
  }, [components, sizeOptions, onChange]);

  const ingredientById = useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients],
  );

  const rowFor = (
    ingredientId: number,
    optionId: number | null,
    sizeOptionId: number | null,
  ) =>
    components.find(
      (c) =>
        c.ingredient_id === ingredientId &&
        (c.option_id ?? null) === optionId &&
        (c.size_option_id ?? null) === sizeOptionId,
    );

  const upsert = (
    ingredientId: number,
    optionId: number | null,
    sizeOptionId: number | null,
    quantity: number,
  ) => {
    const existing = rowFor(ingredientId, optionId, sizeOptionId);
    if (quantity <= 0) {
      if (existing) onChange(components.filter((c) => c !== existing));
      return;
    }
    const value = String(round3(quantity));
    if (existing) {
      onChange(
        components.map((c) =>
          c === existing
            ? { ...c, quantity_per_unit: value, size_multiplier: null, size_option_id: sizeOptionId }
            : c,
        ),
      );
      return;
    }
    onChange([
      ...components,
      {
        ingredient_id: ingredientId,
        option_id: optionId,
        size_option_id: sizeOptionId,
        quantity_per_unit: value,
        size_multiplier: null,
      },
    ]);
  };

  const addUnit = (
    ingredient: Ingredient,
    optionId: number | null,
    delta: number,
  ) => {
    const weight = toNumber(ingredient.unit_weight);
    const row = rowFor(ingredient.id, optionId, activeSizeId);
    const currentUnits = weight > 0 ? toNumber(row?.quantity_per_unit) / weight : 0;
    const nextUnits = Math.max(0, Math.round((currentUnits + delta) * 1000) / 1000);
    upsert(ingredient.id, optionId, activeSizeId, nextUnits * weight);
  };

  /** Suma un salto del comportamiento (sección 6) a la cantidad acumulada. */
  const addAmount = (ingredient: Ingredient, optionId: number | null, amount: number) => {
    const row = rowFor(ingredient.id, optionId, activeSizeId);
    const current = toNumber(row?.quantity_per_unit);
    upsert(ingredient.id, optionId, activeSizeId, Math.max(0, round3(current + amount)));
  };

  /** Botones de incremento táctil según el behavioral_type del insumo. */
  const renderIncrements = (ingredient: Ingredient, optionId: number | null) => {
    const buttons = behaviorIncrements(
      ingredient.behavioral_type,
      ingredient.base_unit,
      ingredient.increments,
    );
    return (
      <div className="assembler-increments" role="group" aria-label={`Incrementos de ${ingredient.name}`}>
        {buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            className="assembler-increment"
            aria-label={`Agregar ${button.label.slice(2)} a ${ingredient.name}`}
            onClick={() => addAmount(ingredient, optionId, button.amountInBase)}
          >
            {button.label}
          </button>
        ))}
      </div>
    );
  };

  const triggerGroups = useMemo(
    () =>
      optionGroups
        .map((group) => ({
          ...group,
          options: group.options.filter(
            (option) => option.is_active && option.linked_ingredient_id != null,
          ),
        }))
        .filter((group) => group.options.length > 0),
    [optionGroups],
  );

  const linkedIngredientIds = useMemo(() => {
    const ids = new Set<number>();
    for (const group of optionGroups) {
      for (const option of group.options) {
        if (option.is_active && option.linked_ingredient_id != null) {
          ids.add(option.linked_ingredient_id);
        }
      }
    }
    return ids;
  }, [optionGroups]);

  const matchesSize = (component: RecipeComponent) =>
    sizeOptions.length > 0
      ? component.size_option_id === activeSizeId
      : component.size_option_id == null;

  const alwaysRows = components.filter((c) => c.option_id == null && matchesSize(c));

  const candidates = useMemo(() => {
    const usedHere = new Set(alwaysRows.map((c) => c.ingredient_id));
    const term = search.trim().toLowerCase();
    return ingredients
      .filter((i) => !linkedIngredientIds.has(i.id) && !usedHere.has(i.id))
      .filter((i) => !term || i.name.toLowerCase().includes(term));
  }, [ingredients, linkedIngredientIds, alwaysRows, search]);

  const activeRows = components.filter((c) => matchesSize(c));

  const copyFromSize = (sourceId: number) => {
    const source = components.filter((c) => c.size_option_id === sourceId);
    if (source.length === 0) return;
    const target = activeSizeId;
    const withoutTarget = components.filter((c) => c.size_option_id !== target);
    const cloned = source.map((c) => ({
      ...c,
      id: undefined,
      size_option_id: target,
      size_multiplier: null,
    }));
    onChange([...withoutTarget, ...cloned]);
  };

  const renderCount = (ingredient: Ingredient, optionId: number | null) => {
    const weight = toNumber(ingredient.unit_weight);
    const row = rowFor(ingredient.id, optionId, activeSizeId);
    const quantity = toNumber(row?.quantity_per_unit);
    const unitName = ingredient.unit_name || "unidad";

    if (weight <= 0) {
      // Sin unidad natural definida: se escribe la cantidad en unidad base.
      return (
        <div className="assembler-qty">
          <input
            aria-label={`Cantidad de ${ingredient.name} en ${ingredient.base_unit}`}
            inputMode="decimal"
            value={row?.quantity_per_unit ? trimNumber(quantity) : ""}
            placeholder="0"
            onChange={(e) =>
              upsert(ingredient.id, optionId, activeSizeId, toNumber(e.target.value))
            }
          />
          <span className="assembler-qty__unit">{ingredient.base_unit}</span>
        </div>
      );
    }

    const units = Math.round((quantity / weight) * 1000) / 1000;
    return (
      <div className="assembler-qty-block">
        <div className="assembler-qty">
          <button
            type="button"
            className="btn btn-secondary assembler-qty__btn"
            aria-label={`Quitar una ${unitName} de ${ingredient.name}`}
            disabled={units <= 0}
            onClick={() => addUnit(ingredient, optionId, -1)}
          >
            <Minus size={18} aria-hidden />
          </button>
          <span className="assembler-count" aria-live="polite">
            {formatQty(units)} {unitName}
          </span>
          <button
            type="button"
            className="btn btn-primary assembler-qty__btn"
            aria-label={`Agregar una ${unitName} de ${ingredient.name}`}
            onClick={() => addUnit(ingredient, optionId, 1)}
          >
            <Plus size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="assembler-clear"
            aria-label={`Limpiar cantidad de ${ingredient.name}`}
            disabled={quantity <= 0}
            onClick={() => upsert(ingredient.id, optionId, activeSizeId, 0)}
          >
            <Eraser size={16} aria-hidden /> Limpiar
          </button>
        </div>
        {renderIncrements(ingredient, optionId)}
      </div>
    );
  };

  return (
    <fieldset className={showLegend ? "fieldset recipe-editor" : "fieldset-clean recipe-editor"}>
      {showLegend && <legend>Receta: qué insumos se descuentan</legend>}
      <p className="field-help mb-3">
        Presiona los cuadros para decir cuánto lleva. Cuenta en unidades naturales
        (fresas, vasos) y el sistema lo convierte solo a kilos o mililitros.
      </p>

      {sizeOptions.length > 0 && (
        <div className="recipe-tabs" role="tablist" aria-label="Tamaño de la receta">
          {sizeOptions.map((size) => (
            <button
              key={size.id}
              type="button"
              role="tab"
              aria-pressed={size.id === activeSizeId}
              className="recipe-tab"
              onClick={() => setActiveSizeId(size.id)}
            >
              {size.name}
            </button>
          ))}
        </div>
      )}

      <div className="recipe-editor__split">
      <div className="recipe-editor__catalog">
      {/* ===== Lo que eligen tus clientes (fruta, base, endulzante…) ===== */}
      {triggerGroups.length > 0 && (
        <div className="assembler-section">
          <p className="assembler-section__title">Según lo que elige el cliente</p>
          {triggerGroups.map((group) => (
            <div key={group.id} className="assembler-block">
              <p className="assembler-block__title">{group.name}</p>
              <div className="assembler-grid">
                {group.options.map((option) => {
                  const ingredient = ingredientById.get(option.linked_ingredient_id as number);
                  if (!ingredient) return null;
                  const row = rowFor(ingredient.id, option.id, activeSizeId);
                  const quantity = toNumber(row?.quantity_per_unit);
                  const selected = quantity > 0;
                  const weight = toNumber(ingredient.unit_weight);
                  const units = weight > 0 ? round3(quantity / weight) : 0;
                  return (
                    <div
                      key={option.id}
                      className={`assembler-tile${selected ? " assembler-tile--active" : ""}`}
                    >
                      <div className="assembler-tile__head">
                        <span className="assembler-tile__name">
                          {selected && <Check size={16} aria-hidden />} {option.name}
                        </span>
                        <span className="badge badge-neutral">{ingredient.name}</span>
                      </div>
                      {weight > 0 && (
                        <p className="assembler-tile__meta">
                          1 {ingredient.unit_name || "unidad"} = {formatQty(weight)} {ingredient.base_unit}
                        </p>
                      )}
                      {selected && (
                        <p className="assembler-tile__meta">
                          {formatQty(quantity)} {ingredient.base_unit}
                          {weight > 0 ? ` · ${formatQty(units)} ${ingredient.unit_name || "unidad"}` : ""}
                        </p>
                      )}
                      {renderCount(ingredient, option.id)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {triggerGroups.length === 0 && (
        <p className="text-secondary text-aux">Este producto no tiene opciones con insumo ligado.</p>
      )}
      </div>

      {/* ===== Insumos que siempre lleva (constructor) ===== */}
      <div className="recipe-editor__builder assembler-section">
        <p className="assembler-section__title">Siempre lleva</p>
        {alwaysRows.length === 0 && (
          <p className="text-secondary text-aux">
            Aún no hay insumos fijos. Agrega uno abajo.
          </p>
        )}
        <div className="assembler-grid">
          {alwaysRows.map((row) => {
            const ingredient = ingredientById.get(row.ingredient_id);
            if (!ingredient) return null;
            const weight = toNumber(ingredient.unit_weight);
            const quantity = toNumber(row.quantity_per_unit);
            const units = weight > 0 ? round3(quantity / weight) : 0;
            return (
              <div key={`always-${row.ingredient_id}`} className="assembler-tile assembler-tile--active">
                <div className="assembler-tile__head">
                  <span className="assembler-tile__name">
                    <Check size={16} aria-hidden /> {ingredient.name}
                  </span>
                  <button
                    type="button"
                    className="assembler-tile__remove"
                    aria-label={`Quitar ${ingredient.name} de la receta`}
                    onClick={() => upsert(ingredient.id, null, activeSizeId, 0)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
                <p className="assembler-tile__meta">
                  {weight > 0
                    ? `${formatQty(units)} ${ingredient.unit_name || "unidad"} = ${formatQty(quantity)} ${ingredient.base_unit}`
                    : `${formatQty(quantity)} ${ingredient.base_unit}`}
                </p>
                {renderCount(ingredient, null)}
              </div>
            );
          })}
        </div>

        <label className="assembler-search">
          <Search size={18} className="text-ink-soft" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo para agregar…"
            aria-label="Buscar insumo para agregar a la receta"
          />
        </label>

        <div className="assembler-grid">
          {candidates.map((ingredient) => (
            <button
              key={`cand-${ingredient.id}`}
              type="button"
              className="assembler-tile assembler-tile--add"
              onClick={() => {
                const weight = toNumber(ingredient.unit_weight);
                upsert(ingredient.id, null, activeSizeId, weight > 0 ? weight : 1);
              }}
            >
              <span className="assembler-tile__name">
                <Plus size={16} aria-hidden /> {ingredient.name}
              </span>
              <span className="assembler-tile__meta">
                {ingredient.unit_weight
                  ? `1 ${ingredient.unit_name || "unidad"} = ${formatQty(toNumber(ingredient.unit_weight))} ${ingredient.base_unit}`
                  : `en ${ingredient.base_unit}`}
              </span>
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="text-secondary text-aux col-span-2">
              No hay más insumos para agregar.
            </p>
          )}
        </div>
      </div>
      </div>

      {/* ===== Resumen en vivo ===== */}
      <div className="assembler-summary">
        <p className="assembler-section__title">Resumen de la receta</p>
        {activeRows.length === 0 ? (
          <p className="text-secondary text-aux">Todavía no agregaste insumos.</p>
        ) : (
          <ul className="assembler-summary__list">
            {activeRows.map((row) => {
              const ingredient = ingredientById.get(row.ingredient_id);
              const option = optionGroups
                .flatMap((g) => g.options)
                .find((o) => o.id === row.option_id);
              const quantity = toNumber(row.quantity_per_unit);
              const weight = toNumber(ingredient?.unit_weight);
              const units = weight > 0 ? round3(quantity / weight) : 0;
              return (
                <li key={`sum-${row.ingredient_id}-${row.option_id ?? "x"}`}>
                  <span>
                    {option ? `${option.name}: ` : ""}
                    <strong>{ingredient?.name ?? "insumo"}</strong>
                  </span>
                  <span>
                    {weight > 0
                      ? `${formatQty(units)} ${ingredient?.unit_name || "unidad"} · ${formatQty(quantity)} ${ingredient?.base_unit}`
                      : `${formatQty(quantity)} ${ingredient?.base_unit}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {sizeOptions.length > 1 && activeSizeId != null && (
          <div className="recipe-actions">
            <label className="recipe-copy">
              <Copy size={16} aria-hidden />
              <select
                aria-label="Copiar cantidades de otro tamaño"
                value=""
                onChange={(e) => {
                  if (e.target.value) copyFromSize(Number(e.target.value));
                }}
              >
                <option value="">Copiar cantidades de…</option>
                {sizeOptions
                  .filter((s) => s.id !== activeSizeId)
                  .map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </fieldset>
  );
}
