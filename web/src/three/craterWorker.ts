import { buildCraterLevels } from "./craterData";

// Builds the crater detail tile off the main thread (see craterTexture.ts).
const levels = buildCraterLevels();
(self as unknown as Worker).postMessage(levels, levels.map((l) => l.buffer));
