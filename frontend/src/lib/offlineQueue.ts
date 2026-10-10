// Cola offline en IndexedDB (sección 33).
// - FIFO estricto; no se elimina una acción hasta confirmación 2xx.
// - Idempotency-Key en cada intento para evitar duplicados (24.2).
// - Errores de validación (4xx excepto 408/429) -> needs_attention.

import { openDB, type IDBPDatabase } from "idb";
import { api, uuid } from "./api";

const DB_NAME = "tia-julia";
const STORE_ACTIONS = "pending_actions";
const STORE_META = "meta";

export type ActionType = "CREATE_ORDER";

export interface PendingAction {
  id: string;
  type: ActionType;
  payload: unknown;
  created_at: string;
  attempts: number;
  status: "pending" | "needs_attention";
  last_error?: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_ACTIONS)) {
          const store = db.createObjectStore(STORE_ACTIONS, { keyPath: "id" });
          store.createIndex("created_at", "created_at");
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META);
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueAction(type: ActionType, payload: unknown): Promise<PendingAction> {
  const db = await getDB();
  const action: PendingAction = {
    id: uuid(),
    type,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  };
  await db.put(STORE_ACTIONS, action);
  return action;
}

export async function listPending(): Promise<PendingAction[]> {
  const db = await getDB();
  const all = (await db.getAll(STORE_ACTIONS)) as PendingAction[];
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function pendingCount(): Promise<number> {
  return (await listPending()).filter((a) => a.status === "pending").length;
}

async function removeAction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_ACTIONS, id);
}

async function updateAction(action: PendingAction): Promise<void> {
  const db = await getDB();
  await db.put(STORE_ACTIONS, action);
}

export async function setLastSync(iso: string): Promise<void> {
  const db = await getDB();
  await db.put(STORE_META, iso, "last_sync_at");
}

export async function getLastSync(): Promise<string | null> {
  const db = await getDB();
  return (await db.get(STORE_META, "last_sync_at")) ?? null;
}

export interface SyncResult {
  synced: number;
  needsAttention: number;
  stillPending: number;
}

/** Non-transient status codes that will never succeed by retrying. */
const NON_RETRYABLE = new Set([400, 404, 409, 422]);

export async function syncQueue(): Promise<SyncResult> {
  const actions = await listPending();
  let synced = 0;
  let needsAttention = 0;
  for (const action of actions) {
    if (action.status === "needs_attention") {
      needsAttention += 1;
      continue;
    }
    try {
      await api.post("/orders", action.payload, action.id);
      await removeAction(action.id);
      synced += 1;
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      if (status > 0 && NON_RETRYABLE.has(status)) {
        action.status = "needs_attention";
        action.last_error = (error as Error).message;
        action.attempts += 1;
        await updateAction(action);
        needsAttention += 1;
      } else {
        // Network error or transient server error: stop FIFO and retry later with backoff.
        action.attempts += 1;
        await updateAction(action);
        break;
      }
    }
  }
  if (synced > 0) {
    await setLastSync(new Date().toISOString());
  }
  const still = await pendingCount();
  return { synced, needsAttention, stillPending: still };
}

export async function discardAction(id: string): Promise<void> {
  await removeAction(id);
}

export async function retryAction(id: string): Promise<boolean> {
  const actions = await listPending();
  const action = actions.find((a) => a.id === id);
  if (!action) return false;
  action.status = "pending";
  await updateAction(action);
  return true;
}

export async function cacheCatalog(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put(STORE_META, value, `catalog_${key}`);
}

export async function readCatalog<T>(key: string): Promise<T | null> {
  const db = await getDB();
  return ((await db.get(STORE_META, `catalog_${key}`)) as T) ?? null;
}
