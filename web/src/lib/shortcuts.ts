export interface ShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}
export interface ShortcutEvent {
  key: string;
  target: EventTarget | ShortcutTarget | null;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

const TYPING = "input, select, textarea, [contenteditable=true], [contenteditable='']";
const PRESSABLE = "button, a, [role=button]";

/** True when the target is (or is inside) a control that uses these keys itself. */
export function isTypingTarget(target: ShortcutEvent["target"]): boolean {
  const t = target as ShortcutTarget | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return true;
  return !!t.closest?.(TYPING);
}

/**
 * Whether the global H / Space / arrow-key shortcuts should act on this keydown.
 * Ignored in typing targets and with ctrl/alt/meta held (browser and OS shortcuts); the toggle keys
 * (H, Space) ignore auto-repeat; Space is left to a focused button, link or [role=button].
 */
export function shouldHandleShortcut(e: ShortcutEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (isTypingTarget(e.target)) return false;
  const toggle = e.key === " " || e.key === "h" || e.key === "H";
  if (toggle && e.repeat) return false;
  if (e.key === " " && (e.target as ShortcutTarget | null)?.closest?.(PRESSABLE)) return false;
  return true;
}
