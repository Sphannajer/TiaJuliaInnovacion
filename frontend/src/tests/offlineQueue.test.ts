import { describe, expect, it, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { enqueueAction, listPending, syncQueue, pendingCount } from "../lib/offlineQueue";
import * as apiModule from "../lib/api";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      post: vi.fn(),
    },
  };
});

describe("offlineQueue (sección 33)", () => {
  beforeEach(async () => {
    for (const action of await listPending()) {
      await import("fake-indexeddb").then(() => undefined);
      void action;
    }
    // clear the store by deleting all
    const { openDB } = await import("idb");
    const db = await openDB("tia-julia", 1);
    await db.clear("pending_actions");
    vi.clearAllMocks();
  });

  it("encola acciones en orden FIFO", async () => {
    await enqueueAction("CREATE_ORDER", { order_type: "mostrador", items: [{ product_id: 1 }] });
    await enqueueAction("CREATE_ORDER", { order_type: "mostrador", items: [{ product_id: 2 }] });
    const actions = await listPending();
    expect(actions.length).toBe(2);
    expect(actions[0].created_at <= actions[1].created_at).toBe(true);
    expect(await pendingCount()).toBe(2);
  });

  it("sincroniza y elimina al confirmarse 2xx (33.4)", async () => {
    await enqueueAction("CREATE_ORDER", { order_type: "mostrador" });
    (apiModule.api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ order: { id: 1 } });
    const result = await syncQueue();
    expect(result.synced).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it("marca needs_attention en error de validación sin perder datos (33.4)", async () => {
    await enqueueAction("CREATE_ORDER", { order_type: "mesa" });
    (apiModule.api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new apiModule.ApiError("VALIDATION_ERROR", "Escribe la mesa.", 422),
    );
    const result = await syncQueue();
    expect(result.needsAttention).toBe(1);
    const actions = await listPending();
    expect(actions.length).toBe(1); // no se pierde el dato
    expect(actions[0].status).toBe("needs_attention");
  });

  it("detiene la sincronización FIFO ante error de red", async () => {
    await enqueueAction("CREATE_ORDER", { items: [1] });
    await enqueueAction("CREATE_ORDER", { items: [2] });
    (apiModule.api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new apiModule.ApiError("NETWORK_ERROR", "Sin conexión.", 0),
    );
    const result = await syncQueue();
    expect(result.synced).toBe(0);
    expect(await pendingCount()).toBe(2);
  });
});
