interface StatusBadgeProps {
  state: "BIEN" | "BAJO" | "CRITICO" | string;
}

/** Badge de estado con TEXTO siempre visible (sección 26.6: nunca solo color). */
export function StatusBadge({ state }: StatusBadgeProps) {
  const cls = state === "BIEN" ? "badge-ok" : state === "BAJO" ? "badge-warn" : "badge-danger";
  return <span className={`badge ${cls}`}>{state}</span>;
}
