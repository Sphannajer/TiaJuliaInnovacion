// Utilidades de accesibilidad (sección 37)

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function focusFirstElement(container: HTMLElement): void {
  const first = container.querySelector<HTMLElement>(FOCUSABLE);
  first?.focus();
}

let lastFocused: HTMLElement | null = null;

export function rememberFocus(): void {
  lastFocused = document.activeElement as HTMLElement | null;
}

export function restoreFocus(): void {
  lastFocused?.focus();
  lastFocused = null;
}
