/**
 * The colour map the globe starts with. The small preview is tried first so the Moon appears sooner; `full` is the
 * full-size map still to fetch afterwards, or null when the first image already is it. The preview is optional:
 * if it fails, the full map is loaded instead (once), and only if that fails too does this reject.
 */
export async function firstColorMap<T>(
  color: { file: string; preview?: string },
  load: (path: string) => Promise<T>,
  warn: (msg: string) => void = console.warn,
): Promise<{ image: T; full: string | null }> {
  if (color.preview && color.preview !== color.file) {
    try {
      return { image: await load(color.preview), full: color.file };
    } catch (e) {
      warn(`Preview colour map failed to load, using the full map: ${(e as Error).message}`);
    }
  }
  return { image: await load(color.file), full: null };
}
