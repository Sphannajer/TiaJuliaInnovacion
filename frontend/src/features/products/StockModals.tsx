import { useMemo, useState } from "react";
import { Check, Droplets, PackageCheck, PackagePlus, Scale } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { api } from "../../lib/api";
import { formatStock, convertToBaseUnit, toNumber } from "../../lib/stock";
import { INGREDIENT_CATEGORIES, findCategory } from "../../lib/ingredients";
import type { BehavioralType, Ingredient } from "../../types";

type EntryMode = "existing" | "new";

type Behavior = {
  value: BehavioralType;
  label: string;
  help: string;
  baseUnit: string;
  consumptionUnit: string;
  icon: typeof Scale;
};

const BEHAVIORS: Behavior[] = [
  { value: "frutas_verduras", label: "Por peso", help: "Harina, fruta, carne…", baseUnit: "kg", consumptionUnit: "g", icon: Scale },
  { value: "liquidos", label: "Por volumen", help: "Leche, agua, bebidas…", baseUnit: "ml", consumptionUnit: "ml", icon: Droplets },
  { value: "unidades", label: "Por unidades", help: "Huevos, panes, botellas…", baseUnit: "unidad", consumptionUnit: "unidad", icon: PackageCheck },
];

const WEIGHT_UNITS = ["kg", "g"];
const VOLUME_UNITS = ["L", "ml"];
const COUNT_UNITS = ["unidad", "docena"];

function behaviorFor(value: BehavioralType) {
  return BEHAVIORS.find((item) => item.value === value) ?? BEHAVIORS[0];
}

function initialBehavior(category: string): BehavioralType {
  if (category === "Bebida" || category === "Lácteo") return "liquidos";
  if (category === "Panadería" || category === "Otro") return "unidades";
  return category === "Fruta/Verdura" ? "frutas_verduras" : "frutas_verduras";
}

function unitChoices(behavioralType: BehavioralType) {
  if (behavioralType === "liquidos") return VOLUME_UNITS;
  if (behavioralType === "unidades") return COUNT_UNITS;
  return WEIGHT_UNITS;
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

function EntryStepper({ step, labels, onStepChange }: { step: number; labels: string[]; onStepChange: (step: number) => void }) {
  return (
    <nav className="product-stepper" aria-label="Pasos de la entrada">
      {labels.map((label, index) => {
        const number = index + 1;
        const complete = number < step;
        return (
          <button
            key={label}
            type="button"
            className={`product-stepper__step${number === step ? " product-stepper__step--current" : ""}${complete ? " product-stepper__step--complete" : ""}`}
            aria-current={number === step ? "step" : undefined}
            onClick={() => number <= step && onStepChange(number)}
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
  );
}

export function StockEntryModal({
  ingredients,
  initial,
  startInNewMode = false,
  onClose,
  onSaved,
}: StockEntryModalProps) {
  const [mode, setMode] = useState<EntryMode>(startInNewMode ? "new" : "existing");
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(initial?.id ?? null);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [behavioralType, setBehavioralType] = useState<BehavioralType>("frutas_verduras");
  const [newUnit, setNewUnit] = useState("kg");
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [conversionFactor, setConversionFactor] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [newMinStock, setNewMinStock] = useState("");
  const [countByPiece, setCountByPiece] = useState(Boolean(initial?.unit_name));

  const [quantity, setQuantity] = useState("");
  const [presentations, setPresentations] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [unitCount, setUnitCount] = useState("");
  const [unitName, setUnitName] = useState(initial?.unit_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restocking, setRestocking] = useState(false);

  const selected = ingredients.find((item) => item.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ingredients.filter((item) => !term || item.name.toLowerCase().includes(term) || item.category.toLowerCase().includes(term));
  }, [ingredients, search]);
  const behavior = behaviorFor(behavioralType);
  const existingCanUsePackage = selected ? validConversion(selected) : false;
  const activeUnit = mode === "new" ? newUnit : selected?.base_unit ?? "";
  const activeUnitName = mode === "new" ? (countByPiece ? newUnitName.trim() : "") : countByPiece ? unitName.trim() || selected?.unit_name || "" : "";
  const entryQuantity = mode === "new"
    ? toNumber(quantity)
    : presentations && existingCanUsePackage
      ? convertToBaseUnit(toNumber(presentations) * toNumber(selected?.conversion_factor), selected?.consumption_unit ?? "", selected?.base_unit ?? "")
      : toNumber(quantity);
  const entryUnitLabel = existingCanUsePackage ? selected?.base_unit ?? "" : activeUnit;
  const newStock = toNumber(selected?.current_stock) + entryQuantity;
  const normalizedNewName = newName.trim().toLowerCase();
  const duplicate = mode === "new" && normalizedNewName
    ? ingredients.find((item) => item.name.toLowerCase() === normalizedNewName) ?? null
    : null;
  const maxStep = mode === "new" ? 4 : 3;
  const labels = mode === "new" ? ["Insumo", "Cómo se controla", "Entrada", "Confirmar"] : ["Insumo", "Entrada", "Confirmar"];

  const selectExisting = (item: Ingredient) => {
    setSelectedId(item.id);
    setUnitName(item.unit_name ?? "");
    setUnitCount("");
    setCountByPiece(Boolean(item.unit_name));
    setError(null);
  };

  const chooseCategory = (value: string) => {
    setNewCategory(value);
    const tile = findCategory(value);
    const nextBehavior = initialBehavior(value);
    setBehavioralType(nextBehavior);
    setNewUnit(tile?.defaultUnit ?? behaviorFor(nextBehavior).baseUnit);
    setError(null);
  };

  const next = () => {
    setError(null);
    if (step === 1 && mode === "existing" && !selected) {
      setError("Elige un insumo de la lista.");
      return;
    }
    if (step === 1 && mode === "new" && (!newName.trim() || !newCategory)) {
      setError("Escribe el nombre y elige una categoría.");
      return;
    }
    setStep((current) => Math.min(maxStep, current + 1));
  };

  const restock = async () => {
    if (!duplicate) return;
    setRestocking(true);
    setError(null);
    try {
      await api.post("/inventory/entries", {
        ingredient_id: duplicate.id,
        quantity: toNumber(duplicate.conversion_factor) || 1,
      });
      onSaved();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setRestocking(false);
    }
  };

  const save = async () => {
    if (mode === "new" && duplicate) {
      setError("Este insumo ya existe: usa el reabastecimiento.");
      return;
    }
    if (mode === "existing" && !quantity && !presentations) {
      setError("Escribe la cantidad que llegó.");
      return;
    }
    if (quantity && entryQuantity <= 0) {
      setError("La cantidad debe ser mayor que cero.");
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
          consumption_unit: behavior.consumptionUnit,
          behavioral_type: behavioralType,
          purchase_unit: purchaseUnit.trim() || undefined,
          conversion_factor: conversionFactor ? toNumber(conversionFactor) : undefined,
          current_stock: 0,
          min_stock_alert: newMinStock ? toNumber(newMinStock) : 0,
          unit_name: activeUnitName || undefined,
        });
        ingredientId = created.id;
      }
      if (entryQuantity > 0) {
        await api.post("/inventory/entries", {
          ingredient_id: ingredientId,
          quantity: entryQuantity,
          total_cost: totalCost ? toNumber(totalCost) : undefined,
          unit_count: unitCount ? toNumber(unitCount) : undefined,
          unit_name: activeUnitName || undefined,
        });
      } else if (activeUnitName && ingredientId) {
        await api.put(`/ingredients/${ingredientId}`, { unit_name: activeUnitName });
      }
      onSaved();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title="Registrar entrada de mercadería"
      subtitle="Completa un paso a la vez."
      onClose={onClose}
      headerContent={<EntryStepper step={step} labels={labels} onStepChange={setStep} />}
      footer={
        <>
          <span className="modal-footer__summary">Paso {step} de {maxStep}</span>
          <button className="btn btn-secondary btn-large" onClick={onClose}>Cancelar</button>
          {step > 1 && <button className="btn btn-secondary btn-large" onClick={() => setStep((current) => current - 1)}>Anterior</button>}
          <button className="btn btn-primary btn-large" disabled={saving} onClick={() => (step === maxStep ? void save() : next())}>
            {saving ? "Guardando…" : step === maxStep ? (mode === "new" ? (entryQuantity > 0 ? "Crear y registrar" : "Crear insumo") : "Registrar entrada") : "Siguiente"}
          </button>
        </>
      }
    >
      <div className="mb-5">
        <SegmentedControl
          ariaLabel="Cómo registrar el insumo"
          options={[{ value: "existing", label: "Insumo existente" }, { value: "new", label: "Crear nuevo insumo" }]}
          value={mode}
          onChange={(value) => {
            setMode(value as EntryMode);
            setStep(1);
            setError(null);
          }}
        />
      </div>

      {mode === "existing" && step === 1 && (
        <section className="stack">
          <h3>¿Qué insumo llegó?</h3>
          <p className="field-help">Busca y selecciona el insumo que recibiste.</p>
          <div className="field">
            <label htmlFor="entry-search">Buscar insumo por nombre o categoría</label>
            <input id="entry-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Agua, fruta…" />
          </div>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
            {filtered.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <button key={item.id} type="button" aria-pressed={isSelected} onClick={() => selectExisting(item)} className={`flex min-h-[88px] flex-col items-start justify-between rounded-brand border-2 p-4 text-left transition-colors ${isSelected ? "border-brand-red bg-brand-beige" : "border-line bg-surface hover:border-ink-soft"}`}>
                  <span className="flex w-full items-center justify-between gap-2">
                    <strong className="text-important">{item.name}</strong>
                    {isSelected && <Check size={20} className="text-brand-red" aria-hidden />}
                  </span>
                  <span className="flex w-full items-center justify-between gap-2 text-aux text-secondary">
                    <span>{item.category} · {formatStock(toNumber(item.current_stock), item.base_unit)}</span>
                    <StatusBadge state={item.state} />
                  </span>
                </button>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-secondary">No encontramos ese insumo.</p>}
        </section>
      )}

      {mode === "existing" && step === 2 && selected && (
        <EntryStep
          title="¿Cuánto llegó?"
          subtitle={`${selected.name} · Stock actual: ${formatStock(toNumber(selected.current_stock), selected.base_unit)}`}
          quantity={quantity}
          setQuantity={setQuantity}
          unit={selected.base_unit}
          totalCost={totalCost}
          setTotalCost={setTotalCost}
          presentations={presentations}
          setPresentations={setPresentations}
          purchaseUnit={selected.purchase_unit}
          canUsePackage={existingCanUsePackage}
          countByPiece={countByPiece}
          setCountByPiece={setCountByPiece}
          unitCount={unitCount}
          setUnitCount={setUnitCount}
          unitName={unitName}
          setUnitName={setUnitName}
          knownUnitName={selected.unit_name}
          unitWeight={selected.unit_weight}
        />
      )}

      {mode === "existing" && step === 3 && selected && (
        <ConfirmStep name={selected.name} category={selected.category} stock={toNumber(selected.current_stock)} stockUnit={selected.base_unit} quantity={entryQuantity} quantityUnit={entryUnitLabel} totalCost={totalCost} unitCount={unitCount} unitName={activeUnitName} />
      )}

      {mode === "new" && step === 1 && (
        <section className="stack">
          <h3>¿Qué insumo estás registrando?</h3>
          <div className="field">
            <label htmlFor="new-insumo-name">Nombre del insumo</label>
            <input id="new-insumo-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Mango" />
          </div>
          {duplicate && (
            <div className="card bg-brand-bone" role="status">
              <strong>Este insumo ya existe</strong>
              <p className="text-secondary">Puedes agregar una presentación de {duplicate.purchase_unit || "unidad"} sin crear otro registro.</p>
              <button type="button" className="btn btn-secondary mt-3" disabled={restocking} onClick={() => void restock()}>
                <PackagePlus size={20} aria-hidden /> {restocking ? "Agregando…" : `Agregar 1 ${duplicate.purchase_unit || "unidad"}`}
              </button>
            </div>
          )}
          <div className="field">
            <span className="text-base font-bold text-ink" id="category-label">Categoría</span>
            <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="category-label">
              {INGREDIENT_CATEGORIES.map((item) => {
                const Icon = item.icon;
                const selectedCategory = newCategory === item.value;
                return (
                  <button key={item.value} type="button" role="radio" aria-checked={selectedCategory} onClick={() => chooseCategory(item.value)} className={`flex min-h-[92px] flex-col items-start gap-1 rounded-brand border-2 p-3 text-left ${selectedCategory ? "border-brand-red bg-brand-beige" : "border-line bg-surface"}`}>
                    <span className="flex w-full justify-between"><Icon size={24} className="text-brand-orange" aria-hidden />{selectedCategory && <Check size={20} className="text-brand-red" aria-hidden />}</span>
                    <strong>{item.label}</strong>
                    <span className="text-aux text-secondary">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {mode === "new" && step === 2 && (
        <section className="stack">
          <h3>¿Cómo quieres controlar este insumo?</h3>
          <p className="field-help">Selecciona cómo normalmente lo cuentas o lo pesas.</p>
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-3">
            {BEHAVIORS.map((item) => {
              const Icon = item.icon;
              const active = behavioralType === item.value;
              return <button key={item.value} type="button" aria-pressed={active} onClick={() => { setBehavioralType(item.value); setNewUnit(item.baseUnit); }} className={`flex min-h-[112px] flex-col items-start gap-2 rounded-brand border-2 p-4 text-left ${active ? "border-brand-red bg-brand-beige" : "border-line bg-surface"}`}><Icon size={28} className="text-brand-orange" aria-hidden /><strong>{item.label}</strong><span className="text-aux text-secondary">{item.help}</span></button>;
            })}
          </div>
          <fieldset className="fieldset">
            <legend>Unidad de medida</legend>
            <div className="flex flex-wrap gap-2.5">{unitChoices(behavioralType).map((unit) => <button key={unit} type="button" aria-pressed={newUnit === unit} onClick={() => setNewUnit(unit)} className={newUnit === unit ? "btn btn-primary" : "btn btn-secondary"}>{unit}</button>)}</div>
          </fieldset>
          <label className="checkbox-field"><input type="checkbox" checked={countByPiece} onChange={(event) => setCountByPiece(event.target.checked)} /> También lo cuento por piezas</label>
          {countByPiece && <div className="field"><label htmlFor="new-unit-name">Nombre de la pieza</label><input id="new-unit-name" value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} placeholder="fresa, vaso, cucharada…" /></div>}
          <div className="grid gap-3 tablet:grid-cols-2">
            <div className="field"><label htmlFor="new-min-stock">Avísame cuando queden menos de ({newUnit})</label><input id="new-min-stock" inputMode="decimal" value={newMinStock} onChange={(event) => setNewMinStock(event.target.value)} placeholder="5" /></div>
            <div className="field"><label htmlFor="purchase-unit">Presentación de compra (opcional)</label><input id="purchase-unit" value={purchaseUnit} onChange={(event) => setPurchaseUnit(event.target.value)} placeholder="Saco de 5 kg" /></div>
          </div>
          {purchaseUnit && <div className="field"><label htmlFor="conversion-factor">Contenido de la presentación ({behavior.consumptionUnit})</label><input id="conversion-factor" inputMode="decimal" value={conversionFactor} onChange={(event) => setConversionFactor(event.target.value)} placeholder="5000" /></div>}
        </section>
      )}

      {mode === "new" && step === 3 && (
        <EntryStep title="¿Llegó mercadería ahora?" subtitle="Indica la entrada inicial si corresponde." quantity={quantity} setQuantity={setQuantity} unit={newUnit} totalCost={totalCost} setTotalCost={setTotalCost} countByPiece={countByPiece} setCountByPiece={setCountByPiece} unitCount={unitCount} setUnitCount={setUnitCount} unitName={newUnitName} setUnitName={setNewUnitName} knownUnitName={null} unitWeight={null} />
      )}

      {mode === "new" && step === 4 && (
        <ConfirmStep name={newName || "Nuevo insumo"} category={newCategory} stock={0} stockUnit={newUnit} quantity={entryQuantity} quantityUnit={newUnit} totalCost={totalCost} unitCount={unitCount} unitName={activeUnitName} minStock={newMinStock} />
      )}

      {error && <p className="field-error mt-4" role="alert">{error}</p>}
    </Modal>
  );
}

function EntryStep({
  title, subtitle, quantity, setQuantity, unit, totalCost, setTotalCost, presentations, setPresentations, purchaseUnit, canUsePackage = false, countByPiece, setCountByPiece, unitCount, setUnitCount, unitName, setUnitName, knownUnitName, unitWeight,
}: {
  title: string; subtitle: string; quantity: string; setQuantity: (value: string) => void; unit: string; totalCost: string; setTotalCost: (value: string) => void; presentations?: string; setPresentations?: (value: string) => void; purchaseUnit?: string | null; canUsePackage?: boolean; countByPiece: boolean; setCountByPiece: (value: boolean) => void; unitCount: string; setUnitCount: (value: string) => void; unitName: string; setUnitName: (value: string) => void; knownUnitName?: string | null; unitWeight?: string | null;
}) {
  const derivedWeight = quantity && unitCount && toNumber(unitCount) > 0 ? (toNumber(quantity) / toNumber(unitCount)).toFixed(3) : null;
  return (
    <section className="stack">
      <h3>{title}</h3>
      <p className="text-secondary">{subtitle}</p>
      <div className="card bg-brand-bone">
        <div className="field"><label htmlFor="entry-quantity">Cantidad que llegó</label><div className="flex items-end gap-3"><input id="entry-quantity" autoFocus inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="5.500" /><span className="unit-suffix">{unit}</span></div></div>
        {canUsePackage && presentations !== undefined && setPresentations && <div className="field"><label htmlFor="entry-presentations">O por presentación: {purchaseUnit}</label><input id="entry-presentations" inputMode="decimal" value={presentations} onChange={(event) => setPresentations(event.target.value)} placeholder="2" /></div>}
        <div className="field"><label htmlFor="entry-cost">Costo total (opcional)</label><input id="entry-cost" inputMode="decimal" value={totalCost} onChange={(event) => setTotalCost(event.target.value)} placeholder="S/ 25.00" /></div>
        <label className="checkbox-field"><input type="checkbox" checked={countByPiece} onChange={(event) => setCountByPiece(event.target.checked)} /> También lo cuento por piezas</label>
        {countByPiece && <div className="grid gap-3 tablet:grid-cols-2"><div className="field"><label htmlFor="entry-unit-count">Piezas recibidas</label><input id="entry-unit-count" inputMode="numeric" value={unitCount} onChange={(event) => setUnitCount(event.target.value)} placeholder="40" /></div><div className="field"><label htmlFor="entry-unit-name">Nombre de pieza</label><input id="entry-unit-name" value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="fresas" /></div></div>}
        {(derivedWeight || unitWeight) && <p className="text-important-bold">1 {unitName || knownUnitName || "unidad"} ≈ {derivedWeight || unitWeight} {unit}</p>}
      </div>
      <p className="field-help">Si no ingresas cantidad, solo crearemos el insumo.</p>
    </section>
  );
}

function ConfirmStep({ name, category, stock, stockUnit, quantity, quantityUnit, totalCost, unitCount, unitName, minStock }: { name: string; category?: string; stock: number; stockUnit: string; quantity: number; quantityUnit: string; totalCost: string; unitCount: string; unitName: string; minStock?: string }) {
  return (
    <section className="stack">
      <h3>Revisa la entrada</h3>
      <div className="card bg-brand-bone stack gap-2">
        <p><span className="text-secondary">Insumo</span><br /><strong className="text-important-bold">{name}</strong></p>
        {category && <p><span className="text-secondary">Categoría</span><br /><strong>{category}</strong></p>}
        {stock > 0 && <p><span className="text-secondary">Stock actual</span><br /><strong>{formatStock(stock, stockUnit)}</strong></p>}
        {quantity > 0 && <p><span className="text-secondary">Cantidad recibida</span><br /><strong>{formatStock(quantity, quantityUnit)}</strong></p>}
        {stock + quantity > 0 && <p><span className="text-secondary">Nuevo stock</span><br /><strong>{formatStock(stock + quantity, stockUnit)}</strong></p>}
        {minStock && <p><span className="text-secondary">Stock mínimo</span><br /><strong>{minStock} {stockUnit}</strong></p>}
        {unitCount && unitName && <p><span className="text-secondary">Piezas</span><br /><strong>{unitCount} {unitName}</strong></p>}
        {totalCost && <p><span className="text-secondary">Costo</span><br /><strong>S/ {totalCost}</strong></p>}
      </div>
    </section>
  );
}

interface StockAdjustModalProps {
  ingredient: Ingredient;
  onClose: () => void;
  onSaved: () => void;
}

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
      await api.post("/inventory/adjustments", { ingredient_id: ingredient.id, new_stock: value, reason: reason || "Conteo físico" });
      onSaved();
    } catch (requestError) {
      setError((requestError as Error).message);
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
          <button className="btn btn-secondary btn-large" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-large" disabled={saving} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar ajuste"}
          </button>
        </>
      }
    >
      <div className="stack">
        <p>Stock actual: <strong>{formatStock(toNumber(ingredient.current_stock), ingredient.base_unit)}</strong></p>
        <div className="field">
          <label htmlFor="adjust-new">Nuevo stock ({ingredient.base_unit})</label>
          <input id="adjust-new" inputMode="decimal" value={newStock} onChange={(event) => setNewStock(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="adjust-reason">Motivo</label>
          <input id="adjust-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Conteo físico" />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
