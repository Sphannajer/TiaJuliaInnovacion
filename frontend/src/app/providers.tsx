import { Component, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Error Boundary (sección 40): nunca borra el carrito por un error de API. */
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error("Error de pantalla:", error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="card error-screen">
          <h2>Algo salió mal en esta pantalla.</h2>
          <p className="mt-4">
            La venta que estabas preparando no se borró. Puedes intentar nuevamente o volver al
            inicio.
          </p>
          <div className="row mt-4">
            <button className="btn btn-primary" onClick={() => this.setState({ hasError: false })}>
              Intentar nuevamente
            </button>
            <a className="btn btn-secondary" href="/">
              Volver al inicio
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </QueryClientProvider>
  );
}
