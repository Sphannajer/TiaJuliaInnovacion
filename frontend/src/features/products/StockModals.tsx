import { useMemo, useState } from "react";
import { Check, PackagePlus, Search } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";
import { formatMoney } from "../../lib/currency";
import { INGREDIENT_CATEGORIES, INGREDIENT_UNITS, findCategory } from "../../lib/ingredients";
import { toNumber } from "../../lib/stock";
import type { Ingredient } from "../../types";

type EntryMode = "existing" | "new";

interface StockEntryModalProps {
  ingredients: Ingredient[];
  initial: Ingredient | null;
  startInNewMode?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Registrar entrada de mercadería (sección 17.4).
 * Permite elegir un insumo existente en cuadros o crear uno nuevo con la
 * categoría como cuadros seleccionables (que fija la unidad: Fruta/Verdura → kg).
 */
export function StockEntryModal({
  ingredients,
  initial,
  startInNewMode = false,
  onClose,
  onSaved,
}: StockEntryModalProps) {
  const [mode, setMode] = useState<EntryMode>(startInNewMode ? "new" : "existing");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initial?.id ?? ingredients[0]?.id ?? null);

  // Nuevo insumo
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [newUnit, setNewUnit] = useState<string>("kg");
  const [newUnitName, setNewUnitName] = useState<string>("");
  const [newMinStock, setNewMinStock] = useState<string>("");

  // Entrada
  const [quantity, setQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  // Contar por unidades naturales (fresas, vasos…) en vez de pesar/medir.
  const [unitCount, setUnitCount] = useState("");
  const [unitName, setUnitName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = ingredients.find((i) => i.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return ingredients;
    return ingredients.filter((i) => i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term));
  }, [ingredients, search]);

  const activeUnit = mode === "new" ? newUnit : selected?.base_unit ?? "";
  const activeUnitName =
    mode === "new" ? newUnitName.trim() : unitName.trim() || selected?.unit_name || "";
  const unitCost =
    quantity && totalCost && parseFloat(quantity) > 0
      ? (parseFloat(totalCost) / parseFloat(quantity)).toFixed(3)
      : null;
  // Lo que pesará/contendrá una unidad natural según lo que llegó.
  const derivedUnitWeight =
    quantity && unitCount && parseFloat(unitCount) > 0
      ? (parseFloat(quantity) / parseFloat(unitCount)).toFixed(3)
      : null;

  // Detección reactiva de duplicados (sección 7.2): si el nombre ya existe,
  // el registro se convierte en una pantalla de REABASTECIMIENTO.
  const normalizedNewName = newName.trim().toLowerCase();
  const duplicate =
    mode === "new" && normalizedNewName
      ? ingredients.find((i) => i.name.toLowerCase() === normalizedNewName) ?? null
      : null;
  const [restocking, setRestocking] = useState(false);

  const restock = async () => {
    if (!duplicate) return;
    const factor = toNumber(duplicate.conversion_factor) || 1;
    setRestocking(true);
    setError(null);
    try {
      await api.post("/inventory/entries", { ingredient_id: duplicate.id, quantity: factor });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestocking(false);
    }
  };

  const chooseCategory = (value: string) => {
    setNewCategory(value);
    const tile = findCategory(value);
    if (tile) setNewUnit(tile.defaultUnit);
    setError(null);
  };

  const save = async () => {
    const qty = parseFloat(quantity);
    if (mode === "new") {
      if (!newName.trim()) {
        setError("Escribe el nombre del insumo.");
        return;
      }
      if (duplicate) {
        setError("Este insumo ya existe: usa los botones de reabastecimiento.");
        return;
      }
      if (!newCategory) {
        setError("Elige una categoría para el insumo.");
        return;
      }
    } else if (!selected) {
      setError("Elige un insumo de la lista.");
      return;
    }
    if (mode === "existing" && !quantity) {
      setError("Escribe la cantidad que llegó.");
      return;
    }
    if (quantity && qty <= 0) {
      setError("La cantidad debe ser mayor a cero.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let ingredientId = selected?.id ?? 0;
      if (mode === "new") {
        const created = await api.post<Ingredient>("/ingredients", {
          name: newName.trim(),
          category: newCategory,
          base_unit: newUnit,
          unit_name: newUnitName.trim() || undefined,
          current_stock: 0,
          min_stock_alert: newMinStock ? parseFloat(newMinStock) : 0,
        });
        ingredientId = created.id;
      }
      // Registra la entrada sólo si se indicó cantidad.
      if (quantity && qty > 0) {
        await api.post("/inventory/entries", {
          ingredient_id: ingredientId,
          quantity: qty,
          total_cost: totalCost ? parseFloat(totalCost) : undefined,
          unit_count: unitCount ? parseFloat(unitCount) : undefined,
          unit_name: activeUnitName || undefined,
        });
      } else if (activeUnitName && ingredientId) {
        // Sin movimiento, pero guarda cómo contar el insumo.
        await api.put(`/ingredients/${ingredientId}`, { unit_name: activeUnitName });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const primaryLabel = mode === "new"
    ? quantity
      ? "Crear insumo y registrar entrada"
      : "Crear insumo"
    : "Registrar entrada";

  return (
    <Modal
      title="Registrar entrada de mercadería"
      subtitle="Elige un insumo o crea uno nuevo, luego indica cuánto llegó."
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-large"
            disabled={saving || (mode === "new" && duplicate !== null)}
            onClick={() => void save()}
          >
            {saving ? "Guardando…" : mode === "new" && duplicate ? "Insumo ya existe" : primaryLabel}
          </button>
        </>
      }
    >
      <div className="grid gap-6 tablet:grid-cols-[1.35fr_1fr]">
        {/* ===== Columna izquierda: elegir o crear insumo ===== */}
        <section aria-label="Insumo">
          <SegmentedControl
            ariaLabel="Cómo registrar el insumo"
            options={[
              { value: "existing", label: "Insumo existente" },
              { value: "new", label: "Crear nuevo insumo" },
            ]}
            value={mode}
            onChange={(value) => {
              setMode(value as EntryMode);
              setError(null);
            }}
          />

          {mode === "existing" ? (
            <div className="mt-4">
              <label className="flex items-center gap-2.5 rounded-brand border-2 border-line bg-surface px-3 py-2">
                <Search size={20} className="text-ink-soft" aria-hidden />
                <input
                  className="w-full border-none bg-transparent text-base outline-none"
                  placeholder="Buscar insumo por nombre o categoría…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>

              <div className="mt-3 grid max-h-[46vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
                {filtered.map((ingredient) => {
                  const isSelected = ingredient.id === selectedId;
                  return (
                    <button
                      key={ingredient.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedId(ingredient.id);
                        setUnitName(ingredient.unit_name ?? "");
                        setUnitCount("");
                      }}
                      className={`flex flex-col items-start gap-1 rounded-brand border-2 p-3 text-left transition-colors ${
                        isSelected
                          ? "border-brand-red bg-brand-beige"
                          : "border-line bg-surface hover:border-ink-soft"
                      }`}
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <span className="text-base font-extrabold text-ink">{ingredient.name}</span>
                        {isSelected && <Check size={20} className="text-brand-red" aria-hidden />}
                      </span>
                      <span className="text-aux text-secondary">{ingredient.category}</span>
                      <span className="flex w-full items-center justify-between gap-2 text-aux">
                        <span>
                          {parseFloat(ingredient.current_stock).toLocaleString("es-PE")} {ingredient.base_unit}
                        </span>
                        <StatusBadge state={ingredient.state} />
                      </span>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="col-span-2 text-secondary p-4">
                    No encontramos insumos con ese nombre. Créalo con “Crear nuevo insumo”.
                  </p>
                )}
              </div>
            </div>
          ) : duplicate ? (
            <div className="mt-4 flex flex-col gap-3" role="status">
              <p className="restock-alert">
                ¡Este insumo ya existe en tu inventario! Usa los botones de abajo para añadir stock rápidamente.
              </p>
              <div className="card bg-brand-bone">
                <p className="kpi-label">Insumo encontrado</p>
                <p className="text-important-bold">{duplicate.name}</p>
                <p className="text-aux text-secondary">
                  Quedan {parseFloat(duplicate.current_stock).toLocaleString("es-PE")} {duplicate.base_unit}
                </p>
              </div>
              <button
                type="button"
                className="restock-package"
                disabled={restocking}
                onClick={() => void restock()}
              >
                <span>{restocking ? "Agregando…" : `+ 1 ${duplicate.purchase_unit || "unidad"}`}</span>
                <span className="text-aux font-bold">
                  ({toNumber(duplicate.conversion_factor) || 1} {duplicate.consumption_unit || duplicate.base_unit})
                </span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-large"
                onClick={() => setNewName("")}
              >
                Buscar otro nombre
              </button>
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <div className="field">
                <label htmlFor="new-insumo-name">Nombre del insumo</label>
                <input
                  id="new-insumo-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Mango"
                />
              </div>

              <div className="field">
                <span className="text-base font-bold text-ink" id="cat-label">
                  Categoría
                </span>
                <p className="field-help">Elige el cuadro que corresponda. La unidad se ajusta sola.</p>
                <div className="mt-1 grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="cat-label">
                  {INGREDIENT_CATEGORIES.map((cat) => {
                    const isSelected = cat.value === newCategory;
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => chooseCategory(cat.value)}
                        className={`flex flex-col items-start gap-1 rounded-brand border-2 p-3 text-left transition-colors ${
                          isSelected
                            ? "border-brand-red bg-brand-beige"
                            : "border-line bg-surface hover:border-ink-soft"
                        }`}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <Icon size={26} className={isSelected ? "text-brand-red" : "text-brand-orange"} aria-hidden />
                          {isSelected && <Check size={20} className="text-brand-red" aria-hidden />}
                        </span>
                        <span className="text-base font-extrabold text-ink">{cat.label}</span>
                        <span className="text-aux text-secondary">{cat.hint}</span>
                        <span className="badge badge-neutral mt-1">{cat.defaultUnit}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <fieldset className="fieldset">
                <legend>Unidad de medida</legend>
                <div className="flex flex-wrap gap-2.5">
                  {INGREDIENT_UNITS.map((unit) => {
                    const isSelected = unit.value === newUnit;
                    return (
                      <button
                        key={unit.value}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setNewUnit(unit.value)}
                        className={isSelected ? "btn btn-primary" : "btn btn-secondary"}
                      >
                        {unit.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="field field--wide">
                <label htmlFor="new-insumo-unitname">¿Cómo lo cuentas? (opcional)</label>
                <input
                  id="new-insumo-unitname"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="fresa, vaso, cucharada…"
                />
                <span className="field-help">
                  Así podrás decir “3 {newUnitName.trim() || "fresas"}” en la receta en vez de pesar.
                </span>
              </div>

              <div className="field field--wide">
                <label htmlFor="new-insumo-min">Aviso de stock mínimo (opcional)</label>
                <input
                  id="new-insumo-min"
                  inputMode="decimal"
                  value={newMinStock}
                  onChange={(e) => setNewMinStock(e.target.value)}
                  placeholder="Ej. 5"
                />
                <span className="field-help">Te avisaremos cuando baje de esta cantidad.</span>
              </div>
            </div>
          )}
        </section>

        {/* ===== Columna derecha: datos de la entrada ===== */}
        <aside aria-label="Datos de la entrada" className="flex flex-col gap-4">
          <div className="card bg-brand-bone">
            <p className="kpi-label">Insumo seleccionado</p>
            {mode === "new" ? (
              <>
                <p className="text-important-bold">{newName.trim() || "Nuevo insumo"}</p>
                <p className="text-aux text-secondary">
                  {newCategory || "Sin categoría"} · Unidad: {newUnit}
                </p>
              </>
            ) : selected ? (
              <>
                <p className="text-important-bold">{selected.name}</p>
                <p className="text-aux text-secondary">
                  {selected.category} · Quedan {parseFloat(selected.current_stock).toLocaleString("es-PE")}{" "}
                  {selected.base_unit}
                </p>
              </>
            ) : (
              <p className="text-secondary">Elige un insumo de la izquierda.</p>
            )}
          </div>

          <div className="row items-end gap-3">
            <div className="field mb-0 flex-1">
              <label htmlFor="entry-qty">Cantidad que llegó</label>
              <input
                id="entry-qty"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="5.500"
              />
            </div>
            <div className="unit-suffix">{activeUnit}</div>
          </div>

          <div className="field mb-0">
            <label htmlFor="entry-cost">Costo total (opcional)</label>
            <input
              id="entry-cost"
              inputMode="decimal"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              placeholder="S/ 25.00"
            />
          </div>

          {unitCost && (
            <p className="text-important-bold">
              Costo por {activeUnit}: S/ {unitCost}{" "}
              <span className="text-secondary text-aux font-medium">(calculado automáticamente)</span>
            </p>
          )}

          {/* Contar por unidades: el sistema aprende cuánto pesa 1 unidad. */}
          <fieldset className="fieldset">
            <legend>¿Cuántas piezas llegaron? (opcional)</legend>
            <p className="field-help mb-3">
              Si lo cuentas, el sistema aprende cuánto pesa una unidad y ya no tendrás que pesar
              ni medir a mano.
            </p>
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div className="field field--compact">
                <label htmlFor="entry-unit-count">Piezas</label>
                <input
                  id="entry-unit-count"
                  inputMode="numeric"
                  value={unitCount}
                  onChange={(e) => setUnitCount(e.target.value)}
                  placeholder="40"
                />
              </div>
              <div className="field field--compact">
                <label htmlFor="entry-unit-name">Nombre de la pieza</label>
                <input
                  id="entry-unit-name"
                  value={activeUnitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="fresa"
                />
              </div>
            </div>
            {(derivedUnitWeight || (mode === "existing" && selected?.unit_weight)) && (
              <p className="text-important-bold mt-2">
                1 {activeUnitName || "unidad"} = {derivedUnitWeight ?? selected?.unit_weight} {activeUnit}{" "}
                <span className="text-secondary text-aux font-medium">
                  {derivedUnitWeight ? "(aprendido de esta entrada)" : "(ya registrado)"}
                </span>
              </p>
            )}
          </fieldset>

          {mode === "new" && !quantity && (
            <p className="field-help flex items-center gap-2">
              <PackagePlus size={18} aria-hidden /> Si dejas la cantidad vacía, solo se crea el insumo (sin movimiento).
            </p>
          )}

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </aside>
      </div>
    </Modal>
  );
}

interface StockAdjustModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onSaved: () => void;
}

/** Conteo físico / ajuste de stock. */
export function StockAdjustModal({ ingredient, onClose, onSaved }: StockAdjustModalProps) {
  const [newStock, setNewStock] = useState(ingredient.current_stock);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = parseFloat(newStock);
    if (Number.isNaN(value) || value < 0) {
      setError("Escribe un stock válido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/inventory/adjustments", {
        ingredient_id: ingredient.id,
        new_stock: value,
        reason: reason || "Conteo físico",
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Ajustar stock de ${ingredient.name}`}
      subtitle="Corrige la cantidad real que contaste."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-large" disabled={saving} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar ajuste"}
          </button>
        </>
      }
    >
      <div className="stack">
        <p>
          Stock actual:{" "}
          <strong>
            {parseFloat(ingredient.current_stock).toLocaleString("es-PE")} {ingredient.base_unit}
          </strong>
        </p>
        <div className="field">
          <label htmlFor="adjust-new">Nuevo stock ({ingredient.base_unit})</label>
          <input id="adjust-new" inputMode="decimal" value={newStock} onChange={(e) => setNewStock(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="adjust-reason">Motivo</label>
          <input
            id="adjust-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Conteo físico"
          />
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
