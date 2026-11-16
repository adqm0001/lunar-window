// Loads the terrain field once, and lets the UI retry after a failure. Pure (no store import) so it can be tested in node.
export interface FieldLoaderStore<F> {
  setFieldProgress: (p: number) => void;
  setField: (f: F) => void;
  setFieldError: (e: string | null) => void;
}

export function createFieldLoader<F>(
  load: (onProgress: (p: number) => void) => Promise<F>,
  getStore: () => FieldLoaderStore<F>,
) {
  let state: "idle" | "loading" | "failed" | "done" = "idle";

  function run(): Promise<void> {
    state = "loading";
    const s = getStore();
    s.setFieldError(null);
    s.setFieldProgress(0);
    return load(s.setFieldProgress)
      .then((f) => {
        state = "done";
        s.setField(f);
      })
      .catch((e: Error) => {
        state = "failed";
        s.setFieldError(e.message || "unknown error");
      });
  }

  return {
    /** First load; a no-op once any load has been started. */
    start: (): Promise<void> => (state === "idle" ? run() : Promise.resolve()),
    /** Load again after a failure; a no-op while loading or once loaded. */
    retry: (): Promise<void> => (state === "failed" ? run() : Promise.resolve()),
  };
}
