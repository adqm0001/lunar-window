import { useApp } from "../state/store";
import { loadField } from "./field";
import { createFieldLoader } from "./fieldLoader";

/** The app's single terrain-field loader; start() runs once, retry() re-runs it after a failure. */
export const fieldLoader = createFieldLoader(loadField, () => useApp.getState());
