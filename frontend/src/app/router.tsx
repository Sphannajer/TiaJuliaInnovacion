import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { NewSalePage } from "../features/sales/NewSalePage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { ProductsPage } from "../features/products/ProductsPage";
import { ReportsPage } from "../features/reports/ReportsPage";

/** Pantalla de error amigable (sección 40): sin datos técnicos para la usuaria. */
function RouteErrorScreen() {
  return (
    <div className="card error-screen">
      <h2>Algo salió mal en esta pantalla.</h2>
      <p className="mt-4">
        La venta que estabas preparando no se borró. Puedes intentar nuevamente o volver al inicio.
      </p>
      <div className="row mt-4">
        <a className="btn btn-primary" href="/dashboard">
          Volver al inicio
        </a>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "sales/new", element: <NewSalePage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "products", element: <ProductsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
