import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { api } from "../../lib/api";
import { formatStock, convertToBaseUnit, toNumber } from "../../lib/stock";
import { INGREDIENT_CATEGORIES } from "../../lib/ingredients";
import type { BehavioralType, Ingredient } from "../../types";
import "../products/ProductFormModal.css";

type Behavior = {
  value: BehavioralType;
  label: string;
  help: string;
  baseUnit: string;
  consumptionUnit: string;
};

const BEHAVIORS: Behavior[] = [
  {
    value: "liquidos",
    label: "Líquido",
    help: "Leche, agua, jugo preparado",
    baseUnit: "ml",
    consumptionUnit: "ml",
  },
  {
    value: "solidos",
    label: "Sólido por peso",
    help: "Harina, azúcar, queso, carne",
    baseUnit: "kg",
    consumptionUnit: "g",
  },
  {
    value: "frutas_verduras",
    label: "Fruta / verdura",
    help: "Papaya, mango, fresa",
    baseUnit: "kg",
    consumptionUnit: "g",
  },
  {
    value: "unidades",
    label: "Por unidades",
    help: "Pan, huevos, botellas",
    baseUnit: "unidad",
    consumptionUnit: "unidad",
  },
];
const STEPS = [
  "¿Qué insumo es?",
  "¿Cómo lo controlas?",
  "¿Cómo lo compras?",
  "Stock inicial",
];

function behaviorFor(value: BehavioralType) {
  return BEHAVIORS.find((item) => item.value === value) ?? BEHAVIORS[2];
}

function initialBehavior(category: string): BehavioralType {
  if (category === "Bebida" || category === "Lácteo") return "liquidos";
  if (category === "Panadería" || category === "Otro") return "unidades";
  return category === "Fruta/Verdura" ? "frutas_verduras" : "solidos";
}

function validConversion(ingredient: Ingredient) {
  return Boolean(
    ingredient.purchase_unit &&
    toNumber(ingredient.conversion_factor) > 0 &&
    ingredient.consumption_unit &&
    ingredient.base_unit,
  );
}

interface StockEntryModalProps {
  ingredients: Ingredient[];
  initial: Ingredient | null;
  startInNewMode?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function StockEntryModal({
  ingredients,
  initial,
  startInNewMode = false,
  onClose,
  onSaved,
}: StockEntryModalProps) {
  const isNew = startInNewMode;
  const [step, setStep] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(
    initial?.id ?? ingredients[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [behavioralType, setBehavioralType] =
    useState<BehavioralType>("frutas_verduras");
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [conversionFactor, setConversionFactor] = useState("");
  const [quantity, setQuantity] = useState("");
  const [presentations, setPresentations] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [minStock, setMinStock] = useState("");
  const [unitCount, setUnitCount] = useState("");
  const [unitName, setUnitName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selected = ingredients.find((item) => item.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ingredients.filter(
      (item) =>
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term),
    );
  }, [ingredients, search]);
  const behavior = behaviorFor(behavioralType);
  const existingCanUsePackage = selected ? validConversion(selected) : false;
  const entryBaseUnit = isNew ? behavior.baseUnit : (selected?.base_unit ?? "");
  const entryQuantity = isNew
    ? toNumber(quantity)
    : presentations && existingCanUsePackage
      ? convertToBaseUnit(
          toNumber(presentations) * toNumber(selected?.conversion_factor),
          selected?.consumption_unit ?? "",
          selected?.base_unit ?? "",
        )
      : toNumber(quantity);
  const entryLabel = existingCanUsePackage
    ? `${selected?.purchase_unit} · ${selected?.conversion_factor} ${selected?.consumption_unit}`
    : entryBaseUnit;

  const next = () => {
    setError(null);
    if (step === 1 && isNew && (!name.trim() || !category)) {
      setError("Escribe el nombre y elige una categoría.");
      return;
    }
    if (step === 2 && isNew && !behavioralType) {
      setError("Elige cómo controlarás este insumo.");
      return;
    }
    if (
      step === 3 &&
      isNew &&
      (!purchaseUnit.trim() || toNumber(conversionFactor) <= 0)
    ) {
      setError("Indica la presentación y cuántas unidades de uso contiene.");
      return;
    }
    if (step === 1 && !isNew && !selected) {
      setError("Elige un insumo de la lista.");
      return;
    }
    setStep((current) => Math.min(isNew ? 4 : 3, current + 1));
  };
  const save = async () => {
    if (entryQuantity <= 0) {
      setError("Escribe una cantidad mayor que cero.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let ingredientId = selected?.id;
      if (isNew) {
        const created = await api.post<Ingredient>("/ingredients", {
          name: name.trim(),
          category,
          base_unit: behavior.baseUnit,
          consumption_unit: behavior.consumptionUnit,
          behavioral_type: behavioralType,
          purchase_unit: purchaseUnit.trim(),
          conversion_factor: toNumber(conversionFactor),
          current_stock: 0,
          min_stock_alert: minStock ? toNumber(minStock) : 0,
          unit_name: unitName.trim() || undefined,
        });
        ingredientId = created.id;
      }
      await api.post("/inventory/entries", {
        ingredient_id: ingredientId,
        quantity: entryQuantity,
        total_cost: totalCost ? toNumber(totalCost) : undefined,
        unit_count: unitCount ? toNumber(unitCount) : undefined,
        unit_name: unitName.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const maxStep = isNew ? 4 : 3;
  return (
    <Modal
      wide
      title={isNew ? "Nuevo insumo" : "Registrar entrada de mercadería"}
      subtitle="Una etapa = una decisión. Puedes volver sin perder lo escrito."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          {step > 1 && (
            <button
              className="btn btn-secondary btn-large"
              onClick={() => setStep((current) => current - 1)}
            >
              Anterior
            </button>
          )}
          <button
            className="btn btn-primary btn-large"
            disabled={saving}
            onClick={() => (step === maxStep ? void save() : next())}
          >
            {saving
              ? "Guardando…"
              : step === maxStep
                ? isNew
                  ? "Crear insumo y registrar"
                  : "Registrar entrada"
                : "Siguiente"}
          </button>
        </>
      }
    >
      <nav className="product-stepper mb-5" aria-label="Pasos del insumo">
        {(isNew ? STEPS : ["Elegir insumo", "Cuánto llegó", "Confirmar"]).map(
          (label, index) => {
            const number = index + 1;
            const completed = number < step;
            return (
              <button
                type="button"
                role="tab"
                key={label}
                className={`product-stepper__step ${completed ? "product-stepper__step--completed" : ""} ${step === number ? "product-stepper__step--current" : "product-stepper__step--future"}`}
                aria-selected={step === number}
                onClick={() => number <= step && setStep(number)}
              >
                <span className="product-stepper__indicator">
                  {completed ? (
                    <Check size={18} strokeWidth={3} aria-hidden />
                  ) : (
                    <span aria-hidden>{number}</span>
                  )}
                </span>
                <span className="product-stepper__label">{label}</span>
              </button>
            );
          },
        )}
      </nav>
      {step === 1 && (
        <section className="stack">
          <h3>{isNew ? "¿Qué insumo es?" : "Elige el insumo"}</h3>
          {isNew ? (
            <>
              <div className="field">
                <label htmlFor="new-insumo-name">Nombre</label>
                <input
                  id="new-insumo-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mango"
                />
              </div>
              <div
                className="grid grid-cols-2 gap-3"
                role="radiogroup"
                aria-label="Categoría del insumo"
              >
                {INGREDIENT_CATEGORIES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={category === item.value}
                    className={
                      category === item.value
                        ? "btn btn-primary btn-large"
                        : "btn btn-secondary btn-large"
                    }
                    onClick={() => {
                      setCategory(item.value);
                      setBehavioralType(initialBehavior(item.value));
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <input
                aria-label="Buscar insumo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar insumo"
              />
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={
                      selectedId === item.id
                        ? "btn btn-primary btn-large"
                        : "btn btn-secondary btn-large"
                    }
                    onClick={() => setSelectedId(item.id)}
                  >
                    {selectedId === item.id && <Check size={18} aria-hidden />}{" "}
                    {item.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {step === 2 && (
        <section className="stack">
          <h3>
            {isNew
              ? "¿Cómo lo controlas?"
              : `¿Cuánto llegó de ${selected?.name ?? "este insumo"}?`}
          </h3>
          {isNew ? (
            <>
              <p className="field-help">
                La categoría sugiere una opción, pero puedes cambiarla.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {BEHAVIORS.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    className={
                      behavioralType === item.value
                        ? "btn btn-primary btn-large"
                        : "btn btn-secondary btn-large"
                    }
                    onClick={() => setBehavioralType(item.value)}
                  >
                    <strong>{item.label}</strong>
                    <span className="block text-aux">{item.help}</span>
                  </button>
                ))}
              </div>
              <p className="card bg-brand-bone">
                Lo guardaremos en: <strong>{behavior.baseUnit}</strong>
                <br />
                Lo usarás en recetas por:{" "}
                <strong>{behavior.consumptionUnit}</strong>
              </p>
            </>
          ) : (
            <>
              {!existingCanUsePackage && (
                <p className="card bg-brand-bone" role="status">
                  Este insumo no tiene una presentación segura configurada.
                  Registra la cantidad exacta en {selected?.base_unit}; no
                  usaremos el factor de compra.
                </p>
              )}
              <EntryFields
                quantity={quantity}
                setQuantity={setQuantity}
                presentations={presentations}
                setPresentations={setPresentations}
                selected={selected}
                canUsePackage={existingCanUsePackage}
                entryLabel={entryLabel}
                totalCost={totalCost}
                setTotalCost={setTotalCost}
              />
            </>
          )}
        </section>
      )}
      {step === 3 && (
        <section className="stack">
          {isNew ? (
            <>
              <h3>¿Cómo lo compras?</h3>
              <p className="field-help">
                El factor indica cuántas unidades de consumo trae una
                presentación.
              </p>
              <div className="field">
                <label htmlFor="purchase-unit">Presentación habitual</label>
                <input
                  id="purchase-unit"
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value)}
                  placeholder="Saco de 5 kg"
                />
              </div>
              <div className="field">
                <label htmlFor="conversion-factor">
                  Contenido de la presentación ({behavior.consumptionUnit})
                </label>
                <input
                  id="conversion-factor"
                  inputMode="decimal"
                  value={conversionFactor}
                  onChange={(e) => setConversionFactor(e.target.value)}
                  placeholder="5000"
                />
              </div>
              <p>
                Ejemplo: 1 {purchaseUnit || "saco"} = {conversionFactor || "…"}{" "}
                {behavior.consumptionUnit}
              </p>
            </>
          ) : (
            <>
              <h3>Confirma la entrada</h3>
              <EntryFields
                quantity={quantity}
                setQuantity={setQuantity}
                presentations={presentations}
                setPresentations={setPresentations}
                selected={selected}
                canUsePackage={existingCanUsePackage}
                entryLabel={entryLabel}
                totalCost={totalCost}
                setTotalCost={setTotalCost}
              />
              <Summary
                name={selected?.name ?? ""}
                stock={entryQuantity}
                unit={entryBaseUnit}
              />
            </>
          )}
        </section>
      )}
      {step === 4 && (
        <section className="stack">
          <h3>Stock inicial</h3>
          <EntryFields
            quantity={quantity}
            setQuantity={setQuantity}
            presentations=""
            setPresentations={() => undefined}
            selected={null}
            canUsePackage={false}
            entryLabel={behavior.baseUnit}
            totalCost={totalCost}
            setTotalCost={setTotalCost}
          />
          <div className="field">
            <label htmlFor="min-stock">
              Stock mínimo ({behavior.baseUnit})
            </label>
            <input
              id="min-stock"
              inputMode="decimal"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              placeholder="2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="field">
              <label htmlFor="unit-count">Conteo opcional</label>
              <input
                id="unit-count"
                inputMode="numeric"
                value={unitCount}
                onChange={(e) => setUnitCount(e.target.value)}
                placeholder="40"
              />
            </div>
            <div className="field">
              <label htmlFor="unit-name">Nombre de pieza</label>
              <input
                id="unit-name"
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="fresa"
              />
            </div>
          </div>
          <Summary
            name={name || "Nuevo insumo"}
            stock={entryQuantity}
            unit={behavior.baseUnit}
            category={category}
          />
        </section>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

function EntryFields({
  quantity,
  setQuantity,
  presentations,
  setPresentations,
  selected,
  canUsePackage,
  entryLabel,
  totalCost,
  setTotalCost,
}: {
  quantity: string;
  setQuantity: (value: string) => void;
  presentations: string;
  setPresentations: (value: string) => void;
  selected: Ingredient | null;
  canUsePackage: boolean;
  entryLabel: string;
  totalCost: string;
  setTotalCost: (value: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="entry-quantity">
          Cantidad exacta que llegó (
          {canUsePackage ? selected?.base_unit : entryLabel})
        </label>
        <input
          id="entry-quantity"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="5.500"
        />
      </div>
      {canUsePackage && (
        <div className="field">
          <label htmlFor="entry-presentations">
            O por presentación: {selected?.purchase_unit}
          </label>
          <input
            id="entry-presentations"
            inputMode="decimal"
            value={presentations}
            onChange={(e) => setPresentations(e.target.value)}
            placeholder="2"
          />
          <span className="field-help">
            Entrarán{" "}
            {toNumber(presentations) * toNumber(selected?.conversion_factor)}{" "}
            {selected?.consumption_unit}, convertidos a {selected?.base_unit}{" "}
            antes de guardar.
          </span>
        </div>
      )}
      <div className="field">
        <label htmlFor="entry-cost">Costo total</label>
        <input
          id="entry-cost"
          inputMode="decimal"
          value={totalCost}
          onChange={(e) => setTotalCost(e.target.value)}
          placeholder="S/ 25.00"
        />
      </div>
    </>
  );
}
function Summary({
  name,
  stock,
  unit,
  category,
}: {
  name: string;
  stock: number;
  unit: string;
  category?: string;
}) {
  return (
    <div className="card bg-brand-bone">
      <strong>{name}</strong>
      {category && <p>{category}</p>}
      <p>Entrarán {formatStock(stock, unit)} al inventario.</p>
    </div>
  );
}

interface StockAdjustModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onSaved: () => void;
}
export function StockAdjustModal({
  ingredient,
  onClose,
  onSaved,
}: StockAdjustModalProps) {
  const [step, setStep] = useState(1);
  const [newStock, setNewStock] = useState(ingredient.current_stock);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = toNumber(ingredient.current_stock);
  const nextStock = toNumber(newStock);
  const difference = nextStock - current;
  const save = async () => {
    if (Number.isNaN(nextStock) || nextStock < 0) {
      setError("Escribe un stock válido.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/inventory/adjustments", {
        ingredient_id: ingredient.id,
        new_stock: nextStock,
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
      subtitle="Primero indica el nuevo conteo, luego confirma."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          {step === 2 && (
            <button
              className="btn btn-secondary btn-large"
              onClick={() => setStep(1)}
            >
              Anterior
            </button>
          )}
          <button
            className="btn btn-primary btn-large"
            disabled={saving}
            onClick={() => (step === 1 ? setStep(2) : void save())}
          >
            {saving
              ? "Guardando…"
              : step === 1
                ? "Revisar ajuste"
                : "Guardar ajuste"}
          </button>
        </>
      }
    >
      <nav className="report-tabs mb-5" aria-label="Pasos del ajuste">
        <button type="button" className="report-tab" aria-selected={step === 1}>
          1 Nuevo stock
        </button>
        <button type="button" className="report-tab" aria-selected={step === 2}>
          2 Confirmar
        </button>
      </nav>
      {step === 1 ? (
        <div className="stack">
          <p>
            Stock actual:{" "}
            <strong>{formatStock(current, ingredient.base_unit)}</strong>
          </p>
          <div className="field">
            <label htmlFor="adjust-new">
              Nuevo stock ({ingredient.base_unit})
            </label>
            <input
              id="adjust-new"
              inputMode="decimal"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
            />
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
        </div>
      ) : (
        <div className="card bg-brand-bone">
          <p>
            Stock actual:{" "}
            <strong>{formatStock(current, ingredient.base_unit)}</strong>
          </p>
          <p>
            Nuevo stock:{" "}
            <strong>{formatStock(nextStock, ingredient.base_unit)}</strong>
          </p>
          <p>
            {difference >= 0 ? "Aumentará" : "Disminuirá"}:{" "}
            <strong>
              {formatStock(Math.abs(difference), ingredient.base_unit)}
            </strong>
          </p>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
