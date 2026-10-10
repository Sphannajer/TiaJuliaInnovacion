import { useEffect, useState } from "react";

interface LiveMessageProps {
  message: string | null;
  politeness?: "polite" | "assertive";
}

/** Región aria-live para confirmaciones de guardado y sincronización (sección 37). */
export function LiveMessage({ message, politeness = "polite" }: LiveMessageProps) {
  const [rendered, setRendered] = useState<string | null>(null);

  useEffect(() => {
    if (message) setRendered(message);
  }, [message]);

  if (!rendered) return null;
  return (
    <div
      role="status"
      aria-live={politeness}
      className="live-toast"
    >
      {rendered}
    </div>
  );
}
