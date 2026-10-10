interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: "normal" | "large";
}

/** Control segmentado grande: activo con borde + fondo, nunca solo color (7.x). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "normal",
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={`segmented-control${size === "large" ? " segmented-control--large" : ""}`.trim()}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={active ? "btn btn-primary" : "btn btn-secondary"}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
