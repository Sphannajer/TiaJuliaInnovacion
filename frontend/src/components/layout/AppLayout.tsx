import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  CreditCard,
  Home,
  Package,
  BarChart3,
  ChevronDown,
  WifiOff,
  RefreshCw,
  User as UserIcon,
} from "lucide-react";
import { api } from "../../lib/api";
import type { User } from "../../types";
import { useSync } from "../../hooks/useSync";
import { Modal } from "../ui/Modal";
import { LiveMessage } from "../ui/LiveMessage";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Inicio", icon: Home, emphasized: false },
  { to: "/sales/new", label: "Registrar venta", icon: CreditCard, emphasized: true },
  { to: "/orders", label: "Órdenes", icon: ClipboardList, emphasized: false },
  { to: "/products", label: "Productos", icon: Package, emphasized: false },
  { to: "/reports", label: "Reportes", icon: BarChart3, emphasized: false },
];

function loadActiveUser(): User | null {
  try {
    const raw = localStorage.getItem("active_user");
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AppLayout() {
  const [user, setUser] = useState<User | null>(loadActiveUser);
  const [users, setUsers] = useState<User[]>([]);
  const [pickerOpen, setPickerOpen] = useState(!loadActiveUser());
  const [message, setMessage] = useState<string | null>(null);
  const sync = useSync();
  const navigate = useNavigate();

  useEffect(() => {
    api.get<User[]>("/users").then(setUsers).catch(() => setUsers([]));
  }, []);

  // Mensaje temporal tras sincronizar
  useEffect(() => {
    if (sync.lastResult && sync.lastResult.synced > 0) {
      setMessage(`Sincronizadas ${sync.lastResult.synced} venta(s).`);
      const timer = setTimeout(() => setMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [sync.lastResult]);

  const chooseUser = (selected: User) => {
    setUser(selected);
    localStorage.setItem("active_user", JSON.stringify(selected));
    setPickerOpen(false);
  };

  const syncLabel = !sync.online
    ? "Sin internet"
    : sync.pending > 0
      ? `${sync.pending} pendiente${sync.pending === 1 ? "" : "s"}`
      : "Sincronizado";

  const syncColorClass = !sync.online
    ? "sync-indicator--offline"
    : sync.pending > 0
      ? "sync-indicator--warning"
      : "sync-indicator--online";

  const attentionCount = sync.needsAttention;

  return (
    <div>
      {!sync.online && (
        <div className="offline-banner" role="status">
          Sin internet. Puedes seguir registrando ventas; se sincronizarán después.
        </div>
      )}

      <header className="tia-header" role="banner">
        <div className="header-inner">
          <NavLink to="/dashboard" className="nav-brand" aria-label="Tía Julia — Ir a inicio">
            <img src="/logotiajulia.webp" alt="Tía Julia" className="header-logo" />
          </NavLink>

          <nav aria-label="Navegación principal" className="desktop-nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-item${item.emphasized ? " nav-item--primary" : ""}${isActive ? " nav-item-active" : ""}`
                }
              >
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="header-tools">
            <button
              type="button"
              className={`sync-indicator ${syncColorClass}`}
              onClick={() => void sync.syncNow()}
              aria-label="Estado de sincronización"
              title="Toca para sincronizar ahora"
            >
              {sync.syncing ? (
                <RefreshCw size={16} className="spin" aria-hidden />
              ) : (
                <span aria-hidden>●</span>
              )}
              {syncLabel}
            </button>

            <button
              type="button"
              className="user-picker"
              onClick={() => setPickerOpen(true)}
              aria-label={`Atendiendo: ${user?.name ?? "sin usuario"}. Cambiar usuario.`}
            >
              <UserIcon size={20} aria-hidden className="user-picker__icon" />
              <span className="user-picker__name">{user?.name ?? "—"}</span>
              <ChevronDown size={18} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet context={{ activeUser: user, setActiveUser: chooseUser }} />
      </main>

      {/* Barra inferior móvil: 5 destinos, icono + texto (2.1) */}
      <nav className="mobile-bottom-bar" aria-label="Navegación principal móvil">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
            <item.icon size={24} aria-hidden />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {pickerOpen && (
        <Modal title="¿Quién está atendiendo hoy?" onClose={() => users.length > 0 && setPickerOpen(false)}>
          <div className="stack">
            {users.length === 0 && <p className="text-secondary">Cargando usuarios…</p>}
            {users.map((option) => (
              <button
                key={option.id}
                className={option.id === user?.id ? "btn btn-primary btn-block" : "btn btn-secondary btn-block"}
                onClick={() => chooseUser(option)}
              >
                {option.name}
              </button>
            ))}
            <button
              className="btn btn-primary btn-block btn-large"
              disabled={!user}
              onClick={() => setPickerOpen(false)}
            >
              Continuar
            </button>
          </div>
        </Modal>
      )}

      {attentionCount > 0 && (
        <div
          role="alert"
          className="attention-toast"
        >
          <WifiOff size={20} aria-hidden />
          <span>
            {attentionCount} venta{attentionCount === 1 ? "" : "s"} necesita{attentionCount === 1 ? "" : "n"} revisión antes de
            sincronizar.
          </span>
          <button className="btn btn-danger" onClick={() => navigate("/orders")}>
            Revisar
          </button>
        </div>
      )}

      <LiveMessage message={message} />
    </div>
  );
}
