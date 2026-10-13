import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent,
  ChefHat,
  Check,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  Info,
  PackagePlus,
  Sparkles,
  Tag,
  Wand2,
} from "lucide-react";
import { api } from "../../lib/api";
import { Modal } from "../../components/ui/Modal";
import { formatMoney } from "../../lib/currency";
import { isCountUnit } from "../../lib/stock";
import { DEFAULT_MARGIN_PCT, MARGIN_CHOICES, marginOf, suggestPrice } from "../../lib/pricing";
import { ProductRecipeEditor } from "./ProductRecipeEditor";
import type { Category, Ingredient, OptionGroup, Product, RecipeComponent } from "../../types";

// Mismo patrón que el backend (sección 5.A): nombre solo con letras y espacios.
const TEXT_ONLY_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface ProductFormModalProps {
  product: Product | null;
  /** Catálogo completo (para comparar precios de la misma categoría). */
  products?: Product[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal de alta/edición de producto (sección 7).
 *
 * Organizado en pasos numerados: tipo, datos, precio (con sugerencia),
 * receta y opciones. Valida en vivo y muestra siempre qué se va a guardar.
 */
export function ProductFormModal({ product, products = [], onClose, onSaved }: ProductFormModalProps) {
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const groups = useQuery({ queryKey: ["option-groups"], queryFn: () => api.get<OptionGroup[]>("/option-groups") });
  const ingredients = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => api.get<Ingredient[]>("/ingredients"),
  });

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState<number>(product?.category_id ?? categories.data?.[0]?.id ?? 0);
  const [basePrice, setBasePrice] = useState(product?.base_price ?? "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [selectedGroups, setSelectedGroups] = useState<number[]>(product?.option_group_ids ?? []);
  const [components, setComponents] = useState<RecipeComponent[]>(product?.recipe_components ?? []);
  const [kind, setKind] = useState<"producto" | "jugo">("producto");
  const [marginPct, setMarginPct] = useState(DEFAULT_MARGIN_PCT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [touched, setTouched] = useState<{ name?: boolean; price?: boolean }>({});

  const sizeGroup = useMemo(
    () => (groups.data ?? []).find((g) => g.name.trim().toLowerCase() === "tamaño"),
    [groups.data],
  );

  // Si las categorías cargan después de abrir el modal, fija la primera.
  useEffect(() => {
    if (!product && categoryId === 0 && categories.data && categories.data.length > 0) {
      setCategoryId(categories.data[0].id);
    }
  }, [categories.data, categoryId, product]);

  // En jugos, el grupo de tamaño debe aplicarse al producto para poder elegir
  // personal / pareja / familiar al vender.
  useEffect(() => {
    if (!sizeGroup) return;
    if ((product?.option_group_ids ?? []).includes(sizeGroup.id)) setKind("jugo");
  }, [sizeGroup, product]);

  const sizeOptions = useMemo(() => {
    if (!sizeGroup || kind !== "jugo") return [];
    return sizeGroup.options.filter((o) => o.is_active);
  }, [sizeGroup, kind]);

  // Grupos del producto sin el de tamaño (el tamaño se maneja aparte).
  const nonSizeGroups = useMemo(
    () => (groups.data ?? []).filter((g) => selectedGroups.includes(g.id) && g.id !== sizeGroup?.id),
    [groups.data, selectedGroups, sizeGroup],
  );

  const cleanComponents = useMemo<RecipeComponent[]>(
    () =>
      components
        .filter((c) => c.ingredient_id > 0 && String(c.quantity_per_unit ?? "").trim() !== "")
        .map((c) => ({
          ingredient_id: c.ingredient_id,
          option_id: c.option_id ?? null,
          size_option_id: c.size_option_id ?? null,
          quantity_per_unit: String(c.quantity_per_unit).trim(),
          size_multiplier: c.size_multiplier ?? null,
        })),
    [components],
  );

  const suggestion = useMemo(
    () =>
      suggestPrice({
        components: cleanComponents,
        ingredients: ingredients.data ?? [],
        optionGroups: nonSizeGroups,
        sizes: sizeOptions,
        products,
        categoryId,
        excludeProductId: product?.id ?? null,
        marginPct,
      }),
    [cleanComponents, ingredients.data, nonSizeGroups, sizeOptions, products, categoryId, product, marginPct],
  );

  const price = toNumber(basePrice);
  const currentMargin = marginOf(price, suggestion.cost);

  // --- Validación en vivo -------------------------------------------------
  const trimmedName = name.trim();
  const nameError = !trimmedName
    ? "Escribe el nombre del producto."
    : TEXT_ONLY_RE.test(trimmedName)
      ? null
      : "Usa solo letras y espacios para el nombre.";

  const priceError =
    basePrice === "" || Number.isNaN(toNumber(basePrice)) ? "Escribe un precio válido." : null;

  const decimalRecipeError = useMemo(() => {
    const ingredientById = new Map((ingredients.data ?? []).map((i) => [i.id, i]));
    for (const row of cleanComponents) {
      const ingredient = ingredientById.get(row.ingredient_id);
      if (!ingredient) continue;
      const unit = ingredient.consumption_unit ?? ingredient.base_unit;
      const quantity = Number(row.quantity_per_unit);
      if (isCountUnit(unit) && !Number.isInteger(quantity)) {
        return `"${ingredient.name}" solo se cuenta por piezas enteras (sin decimales).`;
      }
    }
    return null;
  }, [cleanComponents, ingredients.data]);

  const save = async () => {
    setTouched({ name: true, price: true });
    if (nameError) {
      setError(nameError);
      return;
    }
    if (priceError) {
      setError(priceError);
      return;
    }
    if (cleanComponents.some((c) => Number.isNaN(parseFloat(c.quantity_per_unit)))) {
      setError("Revisa las cantidades de la receta: deben ser números válidos.");
      return;
    }
    if (decimalRecipeError) {
      setError(decimalRecipeError);
      return;
    }
    setSaving(true);
    setError(null);
    const groupIds =
      kind === "jugo" && sizeGroup && !selectedGroups.includes(sizeGroup.id)
        ? [...selectedGroups, sizeGroup.id]
        : selectedGroups;
    const payload = {
      name: trimmedName.toLowerCase(),
      category_id: categoryId,
      base_price: price,
      is_active: isActive,
      option_group_ids: groupIds,
      recipe_components: cleanComponents,
    };
    try {
      if (product) {
        await api.put(`/products/${product.id}`, payload);
      } else {
        await api.post("/products", payload);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changeKind = (next: "producto" | "jugo") => {
    if (next === kind) return;
    setKind(next);
    if (next === "jugo" && sizeGroup) {
      setSelectedGroups((prev) => (prev.includes(sizeGroup.id) ? prev : [...prev, sizeGroup.id]));
    }
    if (next === "producto" && sizeGroup) {
      setSelectedGroups((prev) => prev.filter((id) => id !== sizeGroup.id));
      // El tamaño deja de aplicar; el disparador (fruta/base) se conserva.
      setComponents((prev) => prev.map((c) => ({ ...c, size_option_id: null, size_multiplier: null })));
    }
  };

  const applySuggestion = () => setBasePrice(String(suggestion.suggested.toFixed(2)));

  const goNext = () => {
    if (step === 1) {
      setTouched((current) => ({ ...current, name: true }));
      if (nameError) {
        setError(nameError);
        return;
      }
    }
    if (step === 3 && decimalRecipeError) {
      setError(decimalRecipeError);
      return;
    }
    setError(null);
    setStep((current) => (current < 4 ? (current + 1) as 1 | 2 | 3 | 4 : current));
  };

  const goPrevious = () => {
    setError(null);
    setStep((current) => (current > 1 ? (current - 1) as 1 | 2 | 3 | 4 : current));
  };

  const namePreview = trimmedName ? trimmedName.toLowerCase() : "";

  return (
    <Modal
      wide
      title={product ? `Editar ${product.name}` : "Nuevo producto"}
      subtitle="Completa un paso a la vez."
      onClose={onClose}
      headerContent={
        <nav className="product-stepper" aria-label="Pasos del producto">
          {[
            [1, "Producto"],
            [2, "Cómo se vende"],
            [3, "Qué descuenta"],
            [4, "Precio y confirmar"],
          ].map(([value, label]) => {
            const number = value as 1 | 2 | 3 | 4;
            const complete = number < step;
            return (
              <button
                key={number}
                type="button"
                className={`product-stepper__step${number === step ? " product-stepper__step--current" : ""}${complete ? " product-stepper__step--complete" : ""}`}
                aria-current={number === step ? "step" : undefined}
                onClick={() => number <= step && setStep(number)}
                disabled={number > step}
              >
                <span className="product-stepper__marker">
                  {complete ? <Check size={18} aria-hidden /> : number}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      }
      footer={
        <>
          <span className="modal-footer__summary">
            {step === 4 && price > 0 ? (
              <>
                Precio base: <strong>{formatMoney(price)}</strong>
              </>
            ) : (
              `Paso ${step} de 4`
            )}
          </span>
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          {step > 1 && (
            <button type="button" className="btn btn-secondary btn-large" onClick={goPrevious}>
              <ChevronLeft size={20} aria-hidden /> Anterior
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="btn btn-primary btn-large" onClick={goNext}>
              Siguiente <ChevronRight size={20} aria-hidden />
            </button>
          ) : (
            <button className="btn btn-primary btn-large" disabled={saving} onClick={() => void save()}>
              {saving ? "Guardando…" : product ? "Guardar cambios" : "Crear producto"}
            </button>
          )}
        </>
      }
    >
      <div className="stack-lg">
        <div hidden={step !== 1} className="product-wizard-step">
          {/* ===== 1. Producto ===== */}
          <section className="form-section">
          <header className="form-section__head">
            <span className="form-section__num">1</span>
            <div className="min-w-0">
              <h3 className="form-section__title">¿Qué vas a crear?</h3>
              <p className="form-section__hint">
                {kind === "jugo"
                  ? "Puede cambiar según el tamaño y las opciones."
                  : "Lleva una receta fija."}
              </p>
            </div>
          </header>
          <div className="segmented-control segmented-control--large">
            <button
              type="button"
              aria-pressed={kind === "producto"}
              className={kind === "producto" ? "btn btn-primary btn-large flex-1" : "btn btn-secondary btn-large flex-1"}
              onClick={() => changeKind("producto")}
            >
              <PackagePlus size={24} aria-hidden />
              <span className="product-kind-choice__copy">
                <strong>Producto</strong>
                <small>Producto con una receta fija</small>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={kind === "jugo"}
              className={kind === "jugo" ? "btn btn-primary btn-large flex-1" : "btn btn-secondary btn-large flex-1"}
              disabled={!sizeGroup}
              title={!sizeGroup ? "No hay un grupo de opciones llamado “tamaño”." : undefined}
              onClick={() => changeKind("jugo")}
            >
              <ChefHat size={24} aria-hidden />
              <span className="product-kind-choice__copy">
                <strong>Jugo</strong>
                <small>Puede cambiar según tamaño y opciones</small>
              </span>
            </button>
          </div>
          {!sizeGroup && (
            <p className="form-section__hint mt-2">
              Para crear jugos con tamaños, primero define un grupo de opciones llamado “tamaño”.
            </p>
          )}
          </section>

          {/* ===== Datos básicos ===== */}
          <section className="form-section">
          <header className="form-section__head">
            <span className="form-section__num form-section__num--sub" aria-hidden>•</span>
            <div className="min-w-0">
              <h3 className="form-section__title">Datos del producto</h3>
              <p className="form-section__hint">Cómo se llama, en qué categoría va y si ya se puede vender.</p>
            </div>
          </header>

          <div className="field">
            <label htmlFor="p-name">Nombre del producto</label>
            <input
              id="p-name"
              value={name}
              aria-invalid={Boolean((touched.name || name === "") && nameError)}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="jugo de papaya"
            />
            {(touched.name && nameError) ? (
              <span className="field-error" role="alert">
                {nameError}
              </span>
            ) : namePreview && namePreview !== trimmedName ? (
              <span className="field-help">
                Se guardará como <strong>{namePreview}</strong> (en minúsculas, sin espacios de sobra).
              </span>
            ) : (
            <span className="field-help">Ejemplo: jugo de papaya.</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="p-category">Categoría</label>
            <select id="p-category" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="field-help">Elige dónde lo encontrarás en el catálogo.</span>
          </div>

          <label className={isActive ? "checkbox-field" : "checkbox-field checkbox-field--off"}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="checkbox--lg"
            />
            {isActive ? (
              <span>
                <strong>Producto activo</strong>
                <span className="form-section__hint block">Aparecerá disponible al registrar una venta.</span>
              </span>
            ) : (
              <span>
                <strong>Producto inactivo</strong>
                <span className="form-section__hint block">Se guarda, pero no se puede vender por ahora.</span>
              </span>
            )}
          </label>
          </section>
        </div>

        {step === 4 && <section className="form-section">
          <header className="form-section__head">
            <span className="form-section__num">4</span>
            <div className="min-w-0">
              <h3 className="form-section__title">Precio y confirmar</h3>
              <p className="form-section__hint">
                Revisa el precio y confirma el producto.
              </p>
            </div>
          </header>

          <div className="price-layout">
            <div className="field mb-0">
              <label htmlFor="p-price">¿Cuánto vas a cobrar?</label>
              <div className="price-input">
                <span className="price-input__prefix" aria-hidden>
                  S/
                </span>
                <input
                  id="p-price"
                  inputMode="decimal"
                  value={basePrice}
                  aria-invalid={Boolean((touched.price || basePrice !== "") && priceError)}
                  onChange={(e) => setBasePrice(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, price: true }))}
                  placeholder="0.00"
                />
              </div>
              {touched.price && priceError ? (
                <span className="field-error" role="alert">
                  {priceError}
                </span>
              ) : (
                <span className="field-help">Puedes usar la sugerencia de la derecha.</span>
              )}
            </div>

            <PriceSuggestionCard
              suggestion={suggestion}
              marginPct={marginPct}
              onMarginChange={setMarginPct}
              onApply={applySuggestion}
              currentMargin={currentMargin}
            />
          </div>
        </section>}

        {step === 3 && <section className="form-section">
          <header className="form-section__head">
            <span className="form-section__num">3</span>
            <div className="min-w-0">
              <h3 className="form-section__title">Qué insumos descuenta</h3>
              <p className="form-section__hint">
                Indica cuánto usa una venta. Estas cantidades se descontarán del inventario.
              </p>
            </div>
          </header>
          <ProductRecipeEditor
            showLegend={false}
            sizeOptions={sizeOptions}
            optionGroups={nonSizeGroups}
            ingredients={ingredients.data ?? []}
            components={components}
            onChange={setComponents}
          />
          {decimalRecipeError && (
            <p className="field-error mt-3" role="alert">
              {decimalRecipeError}
            </p>
          )}
        </section>}

        {step === 2 && <section className="form-section">
          <header className="form-section__head">
            <span className="form-section__num">2</span>
            <div className="min-w-0">
              <h3 className="form-section__title">¿Qué puede elegir el cliente?</h3>
              <p className="form-section__hint">
                Marca las opciones que aparecerán al registrar la venta.
              </p>
            </div>
          </header>
          <div className="option-group-picker">
            {(groups.data ?? []).map((group) => {
              const checked = selectedGroups.includes(group.id);
              const isSize = group.id === sizeGroup?.id;
              return (
                <label
                  key={group.id}
                  className={[
                    "option-chip",
                    checked ? "option-chip--on" : "",
                    isSize ? "option-chip--locked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    // El grupo de tamaño se activa desde el paso 1 (Jugo).
                    disabled={isSize}
                    onChange={() =>
                      setSelectedGroups((prev) =>
                        checked ? prev.filter((id) => id !== group.id) : [...prev, group.id],
                      )
                    }
                    className="checkbox-hidden"
                  />
                  <span className="option-chip__name">
                    {checked ? <Check size={18} aria-hidden /> : <Tag size={16} aria-hidden />} {group.name}
                  </span>
                  <span className="option-chip__meta">
                    {group.options.filter((o) => o.is_active).length} opciones
                  </span>
                </label>
              );
            })}
            {(groups.data ?? []).length === 0 && (
              <p className="text-secondary text-aux">Todavía no hay grupos de opciones creados.</p>
            )}
          </div>
        </section>}

        {error && (
          <p className="field-error" role="alert">
            <CircleAlert size={18} aria-hidden /> {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ===================== Tarjeta de precio sugerido ===================== */

function PriceSuggestionCard({
  suggestion,
  marginPct,
  onMarginChange,
  onApply,
  currentMargin,
}: {
  suggestion: ReturnType<typeof suggestPrice>;
  marginPct: number;
  onMarginChange: (value: number) => void;
  onApply: () => void;
  currentMargin: number | null;
}) {
  const { cost, suggested, complete, missing, comparables, basis } = suggestion;

  return (
    <div className={complete ? "price-suggestion" : "price-suggestion price-suggestion--soft"}>
      <div className="price-suggestion__head">
        <div className="min-w-0">
          <p className="price-suggestion__label">
            <Sparkles size={16} aria-hidden /> Precio sugerido
          </p>
          <p className="price-suggestion__value">{suggested > 0 ? formatMoney(suggested) : "—"}</p>
          <p className="price-suggestion__meta">
            {basis === "receta" && (
              <>
                Costo de insumos {formatMoney(cost)} + {marginPct}% de ganancia
              </>
            )}
            {basis === "comparables" && comparables && (
              <>Según la mediana de {comparables.count} productos parecidos.</>
            )}
            {basis === "none" && "Agrega la receta o crea productos parecidos para poder estimarlo."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-large"
          disabled={suggested <= 0}
          onClick={onApply}
        >
          <Wand2 size={20} aria-hidden /> Usar este precio
        </button>
      </div>

      {cost > 0 && (
        <div className="margin-chips" role="group" aria-label="Margen de ganancia">
          {MARGIN_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="margin-chip"
              aria-pressed={marginPct === choice.value}
              onClick={() => onMarginChange(choice.value)}
            >
              <span className="margin-chip__value">{choice.label}</span>
              <span className="margin-chip__hint">{choice.hint}</span>
            </button>
          ))}
        </div>
      )}

      {currentMargin != null && currentMargin > 0 && (
        <p className="price-suggestion__margin">
          <BadgePercent size={16} aria-hidden /> Con el precio escrito ganas{" "}
          <strong>{currentMargin}%</strong> sobre el costo.
        </p>
      )}

      {missing.length > 0 && (
        <p className="price-suggestion__warn">
          <Info size={16} aria-hidden /> Sin costo registrado: {missing.join(", ")}. Registra una
          entrada de esos insumos para afinar la sugerencia.
        </p>
      )}

      {comparables && (
        <p className="price-suggestion__compare">
          {comparables.count === 1 ? "Otro producto parecido" : `${comparables.count} productos parecidos`} de esta
          categoría están entre <strong>{formatMoney(comparables.min)}</strong> y{" "}
          <strong>{formatMoney(comparables.max)}</strong> (mediana {formatMoney(comparables.median)}).
        </p>
      )}

      {suggestion.lines.length > 0 && (
        <details className="price-breakdown">
          <summary>Ver el detalle del costo ({suggestion.lines.length} insumos)</summary>
          <ul className="price-breakdown__list">
            {suggestion.lines.map((line, index) => (
              <li key={`${line.ingredientId}-${line.source}-${index}`}>
                <span>
                  {line.source === "opcion" ? `${line.groupName ?? "opción"}: ` : ""}
                  <strong>{line.name}</strong>
                  <span className="text-aux">
                    {" "}
                    · {line.quantity.toLocaleString("es-PE")} {line.unit}
                  </span>
                </span>
                <span>{line.unitCost != null ? formatMoney(line.subtotal) : "sin costo"}</span>
              </li>
            ))}
          </ul>
          <p className="price-suggestion__meta">
            <Check size={14} aria-hidden /> Los insumos que elige el cliente se promedian por grupo.
          </p>
        </details>
      )}
    </div>
  );
}
