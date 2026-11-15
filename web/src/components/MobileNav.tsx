import { useEffect } from "react";
import { currentScene } from "../state/share";
import { useApp } from "../state/store";

// Bottom tab bar for phones: the side panels and the timeline become sheets that slide up.
export type MobilePanel = "none" | "sites" | "site" | "time";

export default function MobileNav() {
  const panel = useApp((s) => s.mobilePanel);
  const setPanel = useApp((s) => s.setMobilePanel);
  const playing = useApp((s) => s.playing);
  const toolOpen = useApp((s) => s.finderOpen || s.landerOpen || s.roverOpen);
  const touring = useApp((s) => s.tourStep !== null);

  useEffect(() => {
    if (toolOpen) setPanel("sites");
  }, [toolOpen, setPanel]);

  // The landing dates chart and the compare table take the sheet area on phones and are hidden while a sheet is open
  // (styles.css), so opening one closes the sheet.
  const midOpen = useApp((s) => s.porkchopOpen || s.compareOpen);
  useEffect(() => {
    if (midOpen) setPanel("none");
  }, [midOpen, setPanel]);

  // Hidden while a sheet, the chart / compare table or the tour card covers that corner; release both if they hide
  // while one is held.
  const showLift = panel === "none" && !touring && !midOpen;
  useEffect(() => {
    if (!showLift) return;
    return () => {
      currentScene()?.setHeld("r", false);
      currentScene()?.setHeld("f", false);
    };
  }, [showLift]);

  const tab = (id: MobilePanel, label: string) => (
    <button className={`m-tab ${panel === id ? "sel" : ""}`} onClick={() => setPanel(panel === id ? "none" : id)}>
      {label}
    </button>
  );

  // Held like the R / F keys: the camera keeps moving until the finger lifts, even if it slides off the button.
  const lift = (key: "r" | "f", label: string, glyph: string) => (
    <button
      className="m-lift-btn"
      aria-label={label}
      onPointerDown={(e) => {
        currentScene()?.setHeld(key, true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // no capture: onPointerLeave below releases instead
        }
      }}
      onPointerUp={() => currentScene()?.setHeld(key, false)}
      onPointerCancel={() => currentScene()?.setHeld(key, false)}
      onLostPointerCapture={() => currentScene()?.setHeld(key, false)}
      onPointerLeave={() => currentScene()?.setHeld(key, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {glyph}
    </button>
  );

  return (
    <>
      {showLift && (
        <div className="m-lift">
          {lift("r", "Move the camera up", "▲")}
          {lift("f", "Move the camera down", "▼")}
        </div>
      )}
      <nav className="glass mobile-nav" aria-label="Panels">
        {tab("sites", toolOpen ? "Tools" : "Sites")}
        {tab("site", "Site")}
        {tab("time", "Time")}
        <button className="m-tab play" onClick={() => useApp.getState().togglePlaying()}>
          {playing ? "❚❚" : "▶"}
        </button>
      </nav>
    </>
  );
}
