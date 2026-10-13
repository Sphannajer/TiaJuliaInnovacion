import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Minus, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import "./ProductRecipeEditor.css";
import { behaviorIncrements, convertToBaseUnit } from "../../lib/stock";
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

function canonicalUnit(unit: string): string {
  const value = unit.trim().toLowerCase();
  if (["g", "gramo", "gramos"].includes(value)) return "g";
  if (["kg", "kilogramo", "kilogramos", "kilo", "kilos"].includes(value)) return "kg";
  if (value === "ml" || value === "mililitro" || value === "mililitros") return "ml";
  if (["l", "litro", "litros"].includes(value)) return "l";
  return unit;
}

function convertIngredientQuantity(amount: number, from: string, to: string): number {
  return convertToBaseUnit(amount, canonicalUnit(from), canonicalUnit(to));
}

function minimumUnitFor(ingredient: Ingredient): string {
  const base = canonicalUnit(ingredient.consumption_unit || ingredient.base_unit);
  if (["kg", "kilogramo", "kilogramos", "kilo", "kilos"].includes(base)) return "g";
  if (["l", "litro", "litros"].includes(base)) return "ml";
  return base;
}

function recipeEquivalence(ingredient: Ingredient, quantity: number): string | null {
  const minimumUnit = minimumUnitFor(ingredient);
  const largeUnit = minimumUnit === "ml" ? "l" : minimumUnit === "g" ? "kg" : null;
  if (!largeUnit) return null;

  const minimumAmount = convertIngredientQuantity(quantity, ingredient.base_unit, minimumUnit);
  const largeAmount = convertIngredientQuantity(minimumAmount, minimumUnit, largeUnit);
  const naturalAmount = convertIngredientQuantity(
    toNumber(ingredient.unit_weight),
    ingredient.base_unit,
    minimumUnit,
  );
  const naturalCount = naturalAmount > 0
    ? minimumAmount / naturalAmount
    : minimumAmount;
  const naturalUnit = naturalAmount > 0 ? ingredient.unit_name || minimumUnit : minimumUnit;
  return `${formatQty(naturalCount)} ${naturalUnit} = ${formatQty(largeAmount)} ${largeUnit}`;
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
  const [activeView, setActiveView] = useState<"choices" | "always">("choices");
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
        {buttons.slice(0, 2).map((button) => (
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
    const minimumUnit = minimumUnitFor(ingredient);
    const displayedQuantity = convertIngredientQuantity(quantity, ingredient.base_unit, minimumUnit);

    if (weight <= 0) {
      const firstIncrement = behaviorIncrements(
        ingredient.behavioral_type,
        ingredient.base_unit,
        ingredient.increments,
      )[0]?.amountInBase ?? 1;
      return (
        <div className="assembler-qty-block">
          <span className="assembler-qty__label">Cantidad por venta</span>
          <div className="assembler-qty">
            <button
              type="button"
              className="assembler-qty__btn"
              aria-label={`Disminuir cantidad de ${ingredient.name}`}
              disabled={quantity <= 0}
              onClick={() => addAmount(ingredient, optionId, -firstIncrement)}
            >
              <Minus size={20} aria-hidden />
            </button>
            <div className="assembler-qty__natural">
              <input
                aria-label={`Cantidad de ${ingredient.name} en ${minimumUnit}`}
                inputMode="decimal"
                value={row?.quantity_per_unit ? trimNumber(displayedQuantity) : ""}
                placeholder="0"
                onChange={(e) =>
                  upsert(
                    ingredient.id,
                    optionId,
                    activeSizeId,
                    convertIngredientQuantity(toNumber(e.target.value), minimumUnit, ingredient.base_unit),
                  )
                }
              />
              <span className="assembler-qty__unit">{minimumUnit}</span>
            </div>
            <button
              type="button"
              className="assembler-qty__btn"
              aria-label={`Aumentar cantidad de ${ingredient.name}`}
              onClick={() => addAmount(ingredient, optionId, firstIncrement)}
            >
              <Plus size={20} aria-hidden />
            </button>
          </div>
          <span className="assembler-increments__label">Ajuste rápido</span>
          {renderIncrements(ingredient, optionId)}
          <button
            type="button"
            className="assembler-clear"
            aria-label={`Quitar cantidad de ${ingredient.name}`}
            disabled={quantity <= 0}
            onClick={() => upsert(ingredient.id, optionId, activeSizeId, 0)}
          >
            <RotateCcw size={16} aria-hidden /> Quitar cantidad
          </button>
        </div>
      );
    }

    return (
      <div className="assembler-qty-block">
        <span className="assembler-qty__label">Cantidad por venta</span>
        <div className="assembler-qty">
          <button
            type="button"
            className="assembler-qty__btn"
            aria-label={`Disminuir cantidad de ${ingredient.name}`}
            disabled={quantity <= 0}
            onClick={() => addUnit(ingredient, optionId, -1)}
          >
            <Minus size={18} aria-hidden />
          </button>
          <div className="assembler-qty__natural">
            <input
              aria-label={`Cantidad de ${ingredient.name} en ${minimumUnit}`}
              inputMode="decimal"
              value={row?.quantity_per_unit ? trimNumber(displayedQuantity) : ""}
              placeholder="0"
              onChange={(e) => upsert(
                ingredient.id,
                optionId,
                activeSizeId,
                convertIngredientQuantity(toNumber(e.target.value), minimumUnit, ingredient.base_unit),
              )}
            />
            <span className="assembler-qty__unit">{minimumUnit}</span>
          </div>
          <button
            type="button"
            className="assembler-qty__btn"
            aria-label={`Aumentar cantidad de ${ingredient.name} en una ${unitName}`}
            onClick={() => addUnit(ingredient, optionId, 1)}
          >
            <Plus size={18} aria-hidden />
          </button>
        </div>
        <span className="assembler-increments__label">Ajuste rápido</span>
        {renderIncrements(ingredient, optionId)}
        <button
          type="button"
          className="assembler-clear"
          aria-label={`Limpiar cantidad de ${ingredient.name}`}
          disabled={quantity <= 0}
          onClick={() => upsert(ingredient.id, optionId, activeSizeId, 0)}
        >
          <RotateCcw size={16} aria-hidden /> Quitar cantidad
        </button>
      </div>
    );
  };

  return (
    <fieldset className={showLegend ? "fieldset recipe-editor" : "fieldset-clean recipe-editor"}>
      {showLegend && <legend>Qué insumos descuenta</legend>}
      <p className="recipe-editor__intro">Indica cuánto usa una venta. Estas cantidades se descontarán del inventario.</p>

      {sizeOptions.length > 0 && (
        <div className="recipe-editor__sizes">
          <div className="recipe-editor__sizes-head">
            <span>Tamaño que estás editando</span>
            {sizeOptions.length > 1 && activeSizeId != null && (
              <label className="recipe-copy">
                <Copy size={16} aria-hidden />
                <span>Copiar receta</span>
                <select
                  aria-label="Copiar cantidades de otro tamaño"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) copyFromSize(Number(e.target.value));
                  }}
                >
                  <option value="">Desde otro tamaño…</option>
                  {sizeOptions.filter((s) => s.id !== activeSizeId).map((size) => (
                    <option key={size.id} value={size.id}>{size.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="recipe-tabs" role="tablist" aria-label="Tamaño de la receta">
            {sizeOptions.map((size) => (
              <button
                key={size.id}
                type="button"
                role="tab"
                aria-selected={size.id === activeSizeId}
                aria-pressed={size.id === activeSizeId}
                className="recipe-tab"
                onClick={() => setActiveSizeId(size.id)}
              >
                {size.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="recipe-editor__views" role="tablist" aria-label="Tipo de insumos">
        <button type="button" role="tab" aria-selected={activeView === "choices"} aria-pressed={activeView === "choices"} className={`recipe-view-tab${activeView === "choices" ? " recipe-view-tab--active" : ""}`} onClick={() => setActiveView("choices")}>
          <span>Según la elección del cliente</span><strong>{triggerGroups.reduce((total, group) => total + group.options.length, 0)}</strong>
        </button>
        <button type="button" role="tab" aria-selected={activeView === "always"} aria-pressed={activeView === "always"} className={`recipe-view-tab${activeView === "always" ? " recipe-view-tab--active" : ""}`} onClick={() => setActiveView("always")}>
          <span>Siempre lleva</span><strong>{alwaysRows.length}</strong>
        </button>
      </div>

      {activeView === "choices" ? (
        <div className="recipe-view">
          {triggerGroups.length === 0 ? (
            <p className="recipe-empty">Este producto no tiene opciones con insumo ligado.</p>
          ) : triggerGroups.map((group) => (
            <div key={group.id} className="recipe-option-group">
              <h4>{group.name}</h4>
              <div className="recipe-ingredient-list recipe-ingredient-list--choices">
                {group.options.map((option) => {
                  const ingredient = ingredientById.get(option.linked_ingredient_id as number);
                  if (!ingredient) return null;
                  const quantity = toNumber(rowFor(ingredient.id, option.id, activeSizeId)?.quantity_per_unit);
                  return (
                      <div key={option.id} className="recipe-ingredient-row recipe-ingredient-row--choice">
                      <div className="recipe-ingredient-row__head">
                        <strong className="recipe-ingredient-row__name">{option.name}</strong>
                        <span className="recipe-ingredient-row__linked">{ingredient.name}</span>
                      </div>
                      {recipeEquivalence(ingredient, quantity) && <p className="recipe-quantity__natural">{recipeEquivalence(ingredient, quantity)}</p>}
                      {renderCount(ingredient, option.id)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="recipe-view__summary">{activeRows.filter((row) => row.option_id != null).length} ingredientes configurados</p>
        </div>
      ) : (
      <div className="recipe-view">
        <div className="recipe-view__heading">
          <h3>Ingredientes que siempre lleva</h3>
        </div>
        {alwaysRows.length === 0 && (
          <p className="recipe-empty">No hay otros insumos agregados.</p>
        )}
        <div className="recipe-ingredient-list recipe-ingredient-list--always">
          {alwaysRows.map((row) => {
            const ingredient = ingredientById.get(row.ingredient_id);
            if (!ingredient) return null;
            const quantity = toNumber(row.quantity_per_unit);
            return (
              <div key={`always-${row.ingredient_id}`} className="recipe-ingredient-row recipe-ingredient-row--always">
                <div className="recipe-ingredient-row__head">
                  <strong className="recipe-ingredient-row__name">{ingredient.name}</strong>
                  <button
                    type="button"
                    className="recipe-remove-ingredient"
                    aria-label={`Quitar ${ingredient.name} de la receta`}
                    onClick={() => upsert(ingredient.id, null, activeSizeId, 0)}
                  >
                    <Trash2 size={16} aria-hidden />
                    <span>Eliminar</span>
                  </button>
                </div>
                {recipeEquivalence(ingredient, quantity) && <p className="recipe-quantity__natural">{recipeEquivalence(ingredient, quantity)}</p>}
                {renderCount(ingredient, null)}
              </div>
            );
          })}
        </div>

        <label className="recipe-search">
          <Search size={18} className="text-ink-soft" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo…"
            aria-label="Buscar insumo para agregar a la receta"
          />
        </label>

        {search.trim() && <div className="recipe-search-results">
          {candidates.map((ingredient) => (
            <button
              key={`cand-${ingredient.id}`}
              type="button"
              className="recipe-search-result"
              onClick={() => {
                const weight = toNumber(ingredient.unit_weight);
                upsert(ingredient.id, null, activeSizeId, weight > 0 ? weight : 1);
              }}
            >
              <span>
                <Plus size={16} aria-hidden /> {ingredient.name}
              </span>
            </button>
          ))}
          {candidates.length === 0 && (
            <p className="recipe-empty">
              No hay más insumos para agregar.
            </p>
          )}
        </div>}
        <p className="recipe-view__summary">{alwaysRows.length} ingredientes configurados</p>
      </div>
      )}
    </fieldset>
  );
}
