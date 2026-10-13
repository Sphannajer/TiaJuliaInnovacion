import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { trapFocus, focusFirstElement, rememberFocus, restoreFocus } from "../../lib/accessibility";

interface ModalProps {
  title: string;
  subtitle?: string;
  /** Contenido fijo entre la cabecera y el cuerpo desplazable. */
  headerContent?: ReactNode;
  /** Contenido opcional mostrado como franja inferior fija (acciones). */
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/**
 * Modal accesible (sección 37): focus trap, Escape cierra (no destructivo),
 * retorno de foco y panel amplio pensado para tablet horizontal (1024×768).
 * Cabecera con acento de marca, cierre táctil de 48px y cuerpo con scroll.
 */
export function Modal({ title, subtitle, headerContent, footer, onClose, children, wide }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rememberFocus();
    const panel = panelRef.current;
    if (panel) focusFirstElement(panel);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "Tab" && panel) {
        trapFocus(panel, event);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      restoreFocus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel ${wide ? "modal-panel--wide" : ""}`.trim()}
      >
        {/* Franja de acento de marca */}
        <div
          aria-hidden
          className="h-[6px] w-full bg-[linear-gradient(90deg,var(--brand-red),var(--brand-orange),var(--brand-green))]"
        />

        <div className="modal-header">
          <div className="min-w-0">
            <h2 className="brand-title">{title}</h2>
            {subtitle && <p className="text-secondary text-aux mt-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="btn btn-secondary modal-close"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X size={24} aria-hidden />
          </button>
        </div>

        {headerContent}
        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
