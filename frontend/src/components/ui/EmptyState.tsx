import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Estado vacío con lenguaje del negocio y acción clara (sección 10.4). */
export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="card empty-state flex flex-col items-center gap-3">
      <span className="rounded-full bg-brand-beige p-4 text-brand-red" aria-hidden>
        <Inbox size={34} />
      </span>
      <h3>{title}</h3>
      {description && <p className="text-secondary max-w-[46ch]">{description}</p>}
      {actionLabel && onAction && (
        <button className="btn btn-primary btn-large" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
