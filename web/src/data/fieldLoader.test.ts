import { describe, expect, it, vi } from "vitest";
import { loadField } from "./field";
import { createFieldLoader, type FieldLoaderStore } from "./fieldLoader";

function fakeStore() {
  const st = { error: null as string | null, field: null as unknown, progress: -1, errors: [] as (string | null)[] };
  const store: FieldLoaderStore<unknown> = {
    setFieldProgress: (p) => { st.progress = p; },
    setField: (f) => { st.field = f; },
    setFieldError: (e) => { st.error = e; st.errors.push(e); },
  };
  return { st, store };
}

describe("createFieldLoader", () => {
  it("sets the error when the load fails, then retry clears it and loads the field", async () => {
    const { st, store } = fakeStore();
    const load = vi.fn().mockRejectedValueOnce(new Error("HTTP 404")).mockResolvedValueOnce("FIELD");
    const loader = createFieldLoader(load, () => store);
    await loader.start();
    expect(st.error).toBe("HTTP 404");
    expect(st.field).toBeNull();
    const p = loader.retry();
    expect(st.error).toBeNull(); // cleared immediately
    expect(st.progress).toBe(0);
    await p;
    expect(st.field).toBe("FIELD");
    expect(st.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not load twice on repeated start() or while a load is running", async () => {
    const { store } = fakeStore();
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const loader = createFieldLoader(load, () => store);
    const a = loader.start();
    loader.start();
    loader.retry();
    expect(load).toHaveBeenCalledTimes(1);
    resolve("F");
    await a;
    loader.start();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("ignores retry() after a successful load", async () => {
    const { store } = fakeStore();
    const load = vi.fn().mockResolvedValue("F");
    const loader = createFieldLoader(load, () => store);
    await loader.start();
    await loader.retry();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("passes progress through to the store", async () => {
    const { st, store } = fakeStore();
    const loader = createFieldLoader(async (onProgress) => { onProgress(0.5); return "F"; }, () => store);
    await loader.start();
    expect(st.progress).toBe(0.5);
  });

  it("cancels sibling terrain downloads before exposing an error for retry", async () => {
    const { st, store } = fakeStore();
    const cancelled: string[] = [];
    vi.stubGlobal("fetch", (url: string, options?: RequestInit) => {
      if (url.endsWith("/field_pole.json")) {
        return Promise.resolve(Response.json({
          horizon: { file: "horizon.bin" },
          heights: { file: "heights.bin" },
          slope: { file: "slope.bin" },
        }));
      }
      if (url.endsWith("/horizon.bin")) return Promise.resolve(new Response(null, { status: 503 }));
      return new Promise<Response>((_, reject) => {
        options?.signal?.addEventListener("abort", () => {
          cancelled.push(url);
          reject(options.signal?.reason);
        }, { once: true });
      });
    });
    try {
      await createFieldLoader(loadField, () => store).start();
      expect(st.error).toContain("horizon.bin (503)");
      expect(cancelled.map((url) => url.split("/").pop())).toEqual(["heights.bin", "slope.bin"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
