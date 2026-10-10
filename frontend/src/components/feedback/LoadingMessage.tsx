interface LoadingMessageProps {
  message?: string;
}

/** Estados de carga legibles (sección 39): spinner animado + mensaje. */
export function LoadingMessage({ message = "Cargando…" }: LoadingMessageProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="loading-message w-full"
    >
      <span className="spinner" aria-hidden />
      <span className="loading-text">{message}</span>
    </div>
  );
}
