import { useEffect, useMemo, useState } from "react";
import { Banknote, Smartphone, CheckCircle2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { formatMoney } from "../../lib/currency";
import { ApiError } from "../../lib/api";
import type { Order } from "../../types";

interface PaymentModalProps {
  total: number;
  onConfirm: (paymentMethodId: number) => Promise<Order | null>;
  onClose: () => void;
  onRegisterAnother?: () => void;
  onWatchOrder?: (orderId: number) => void;
}

type Step = "choose" | "cash" | "yape" | "done";

/**
 * Modal de pago (sección 13): Efectivo con vuelto opcional,
 * Yape con verificación obligatoria, resultado con orden generada.
 */
export function PaymentModal({ total, onConfirm, onClose, onRegisterAnother, onWatchOrder }: PaymentModalProps) {
  const [step, setStep] = useState<Step>("choose");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [yapeChecked, setYapeChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidOrder, setPaidOrder] = useState<Order | null>(null);

  const change = useMemo(() => {
    const received = parseFloat(cashReceived.replace(",", "."));
    if (Number.isNaN(received) || received < total) return null;
    return received - total;
  }, [cashReceived, total]);

  const confirm = async (methodId: number) => {
    setSaving(true);
    setError(null);
    try {
      const order = await onConfirm(methodId);
      if (order) {
        setPaidOrder(order);
        setStep("done");
      }
    } catch (e) {
      setError(e instanceof ApiError && e.code === "INVALID_ORDER_STATE"
        ? "La orden fue actualizada."
        : "No se pudo registrar el pago. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  if (step === "done" && paidOrder) {
    return (
      <Modal title="Pago registrado correctamente" onClose={onClose}>
        <div className="stack-center">
          <CheckCircle2 size={64} color="var(--brand-green)" aria-hidden />
          <p className="text-important-bold">
            Orden #{String(paidOrder.id).padStart(3, "0")} · {formatMoney(paidOrder.total_amount)} ·{" "}
            {paidOrder.payment_method_name}
          </p>
          <div className="row mt-4">
            <button
              className="btn btn-primary btn-large"
              onClick={() => {
                onRegisterAnother?.();
                onClose();
              }}
            >
              Registrar otra venta
            </button>
            <button className="btn btn-secondary btn-large" onClick={() => onWatchOrder?.(paidOrder.id)}>
              Ver orden
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Cobrar pedido" onClose={onClose}>
      <p className="kpi-label">Total a cobrar</p>
      <p className="kpi-value mb-4">
        {formatMoney(total)}
      </p>

      {error && (
        <p className="field-error mb-4" role="alert">
          {error}
        </p>
      )}

      {step === "choose" && (
        <>
          <p className="font-bold mb-2">¿Cómo pagó el cliente?</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              className="card flex flex-col items-center gap-2 border-2 transition-colors hover:border-brand-green hover:bg-success-bg"
              onClick={() => setStep("cash")}
            >
              <Banknote size={44} className="text-brand-green" aria-hidden />
              <span className="text-important-bold">Efectivo</span>
              <span className="text-aux text-secondary">Calcula el vuelto solo</span>
            </button>
            <button
              className="card flex flex-col items-center gap-2 border-2 transition-colors hover:border-brand-red hover:bg-danger-bg"
              onClick={() => setStep("yape")}
            >
              <Smartphone size={44} className="text-brand-red" aria-hidden />
              <span className="text-important-bold">Yape</span>
              <span className="text-aux text-secondary">Verifica el pago</span>
            </button>
          </div>
        </>
      )}

      {step === "cash" && (
        <div className="stack">
          <div className="field">
            <label htmlFor="cash-received">Monto recibido (opcional)</label>
            <input
              id="cash-received"
              inputMode="decimal"
              placeholder="S/ 50.00"
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
            />
          </div>
          {change !== null && (
            <div
              className="change-calculator"
            >
              Vuelto: {formatMoney(change)}
            </div>
          )}
          <button className="btn btn-primary btn-large btn-block" disabled={saving} onClick={() => confirm(1)}>
            {saving ? "Guardando venta…" : "Confirmar pago en efectivo"}
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setStep("choose")}>
            Elegir otro medio de pago
          </button>
        </div>
      )}

      {step === "yape" && (
        <div className="stack">
          <p>Confirma que el pago ya aparece en el Yape del negocio.</p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={yapeChecked}
              onChange={(e) => setYapeChecked(e.target.checked)}
              className="checkbox--xl"
            />
            Sí, ya verifiqué el pago
          </label>
          <button
            className="btn btn-primary btn-large btn-block"
            disabled={!yapeChecked || saving}
            onClick={() => confirm(2)}
          >
            {saving ? "Guardando venta…" : "Confirmar pago por Yape"}
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => setStep("choose")}>
            Elegir otro medio de pago
          </button>
        </div>
      )}
    </Modal>
  );
}
