import { useMemo, useState } from "react";
import { Modal } from "../../components/ui/Modal";
import { formatMoney } from "../../lib/currency";
import type { OptionGroup, Product } from "../../types";

export interface AssemblerResult {
  product: Product;
  quantity: number;
  option_ids: number[];
  options: { id: number; name: string; extra_cost: number; group_name: string }[];
}

interface ProductAssemblerModalProps {
  product: Product;
  groups: OptionGroup[];
  allowsMultipleIngredients: boolean;
  onAdd: (result: AssemblerResult) => void;
  onClose: () => void;
}

/**
 * Ensamblador universal (sección 12): tamaño, frutas (múltiple),
 * base y endulzante. Resumen fijo con precio en vivo. Validación
 * con mensaje junto al grupo que falta.
 */
export function ProductAssemblerModal({
  product,
  groups,
  allowsMultipleIngredients,
  onAdd,
  onClose,
}: ProductAssemblerModalProps) {
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [missingGroup, setMissingGroup] = useState<string | null>(null);

  const toggle = (groupId: number, optionId: number, multiple: boolean) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (multiple) {
        return {
          ...prev,
          [groupId]: current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId],
        };
      }
      return { ...prev, [groupId]: [optionId] };
    });
    setMissingGroup(null);
  };

  const isMulti = (groupName: string) => multipleGroupNames.includes(groupName);
  const multipleGroupNames: string[] = allowsMultipleIngredients ? ["Fruta"] : [];

  const price = useMemo(() => {
    const extras = Object.values(selected)
      .flat()
      .reduce((sum) => sum, 0);
    let extraTotal = 0;
    for (const group of groups) {
      for (const optionId of selected[group.id] ?? []) {
        const option = group.options.find((o) => o.id === optionId);
        if (option) extraTotal += parseFloat(option.extra_cost);
      }
    }
    void extras;
    return product.base_price ? parseFloat(product.base_price) + extraTotal : extraTotal;
  }, [selected, groups, product.base_price]);

  const summaryLines = groups
    .map((group) => {
      const chosen = (selected[group.id] ?? [])
        .map((id) => group.options.find((o) => o.id === id)?.name)
        .filter(Boolean)
        .join(" + ");
      return chosen;
    })
    .filter(Boolean);

  const handleAdd = () => {
    // Validación: los grupos presentes deben tener selección
    for (const group of groups) {
      const chosen = selected[group.id] ?? [];
      if (chosen.length === 0) {
        setMissingGroup(group.name);
        return;
      }
    }
    const option_ids = Object.values(selected).flat();
    const options = groups.flatMap((group) =>
      (selected[group.id] ?? []).map((id) => ({
        id,
        name: group.options.find((o) => o.id === id)?.name ?? "",
        extra_cost: parseFloat(group.options.find((o) => o.id === id)?.extra_cost ?? "0"),
        group_name: group.name,
      })),
    );
    onAdd({ product, quantity, option_ids, options });
  };

  return (
    <Modal title={`Preparar ${product.name}`} subtitle="Elige tamaño, frutas y base." onClose={onClose} wide>
      <div className="stack gap-5">
        {groups.map((group) => (
          <fieldset key={group.id} className="fieldset-clean">
            <legend className="fieldset-legend">
              {group.name}
            </legend>
            {isMulti(group.name) && (
              <p className="field-help mb-2">
                Puedes elegir más de una.
              </p>
            )}
            <div className="row gap-2.5 flex-wrap">
              {group.options
                .filter((o) => o.is_active)
                .map((option) => {
                  const chosen = (selected[group.id] ?? []).includes(option.id);
                  const extra = parseFloat(option.extra_cost);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={chosen}
                      className={`${chosen ? "btn btn-primary" : "btn btn-secondary"} touch-lg`}
                      onClick={() => toggle(group.id, option.id, isMulti(group.name))}
                    >
                      {chosen && <span aria-hidden>✓ </span>}
                      {option.name}
                      {extra > 0 && <span> +{formatMoney(extra)}</span>}
                    </button>
                  );
                })}
            </div>
            {missingGroup === group.name && (
              <p className="field-error mt-2" role="alert">
                Elige {group.name.toLowerCase()} para continuar.
              </p>
            )}
          </fieldset>
        ))}

        {/* Resumen fijo en el modal (12.2) */}
        <div
          className="summary-sticky"
          aria-live="polite"
        >
          <h3>Tu {product.name.toLowerCase()}</h3>
          {summaryLines.length === 0 ? (
            <p className="text-secondary">Aún no has elegido nada.</p>
          ) : (
            summaryLines.map((line) => (
              <p key={line} className="summary-line">
                {line}
              </p>
            ))
          )}
          <p className="kpi-value">
            Precio: {formatMoney(price)}
          </p>
        </div>

        {/* Cantidad (12.3) */}
        <div className="row gap-4">
          <span className="text-important-bold">Cantidad</span>
          <button
            className="btn btn-secondary qty-btn--lg text-2xl"
            aria-label="Quitar uno"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          <span aria-live="polite" className="qty-display--lg">
            {quantity}
          </span>
          <button
            className="btn btn-secondary qty-btn--lg text-2xl"
            aria-label="Agregar uno"
            onClick={() => setQuantity((q) => Math.min(99, q + 1))}
          >
            +
          </button>
        </div>

        {/* Botones (12.4): primario abajo a la derecha */}
        <div className="row-between modal-actions gap-3">
          <button className="btn btn-secondary btn-large" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-large" onClick={handleAdd}>
            Agregar al pedido · {formatMoney(price * quantity)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
