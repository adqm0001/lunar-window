import { useEffect, useState } from "react";
import { fieldCell } from "../data/field";
import { DEFAULT_WEIGHTS, findBestSpots } from "../gpu/finder";
import { getEngine } from "../gpu/useFieldMetrics";
import { isRoute, planRoute } from "../lib/rover";
import { currentScene, openedFromLink } from "../state/share";
import { SPEEDS, useApp } from "../state/store";

interface Step {
  title: string;
  text: string;
  enter: () => void;
}

const st = () => useApp.getState();

function closePanels() {
  const s = st();
  s.setFinderOpen(false);
  s.setLanderOpen(false);
  s.setRoverOpen(false);
  s.setValidationOpen(false);
  s.setPorkchopOpen(false);
  if (s.playing) s.togglePlaying();
}

function poleView() {
  currentScene()?.flyToLatLon(-89.45, -140, 55);
}

const STEPS: Step[] = [
  {
    title: "This is the real Moon, right now",
    text: "Lit by the Sun where it really is today (NASA JPL ephemeris) and shaped by NASA's laser altimeter (LOLA). Drag to spin it, scroll to zoom, WASD to fly.",
    enter: () => {
      closePanels();
      st().setView("3d");
      st().setLayer("terrain");
      st().requestOrbit();
    },
  },
  {
    title: "The south pole: where Artemis is landing",
    text: "Here the Sun never climbs more than 1.6° above the horizon. Mountains cast shadows tens of kilometres long, and some crater floors have not seen sunlight in billions of years. Every shadow you see is computed from the real terrain.",
    enter: () => {
      closePanels();
      st().setLayer("terrain");
      poleView();
    },
  },
  {
    title: "Where is the light?",
    text: "Share of the next year that each 250 m spot is in sunlight. Your GPU works it out from 102,400 terrain horizons in a few milliseconds. Bright rims are the 'peaks of light'; black discs never see the Sun.",
    enter: () => {
      st().setRangeDays(365);
      st().setLayer("sun");
    },
  },
  {
    title: "Cold traps hold water ice",
    text: "A heat-flow model of the soil runs for every point: sunlight on the real slope, heat soaking into the ground, glowing back to space. Blue is where water ice survives, the main reason everyone is going to the pole.",
    enter: () => st().setLayer("ice"),
  },
  {
    title: "A peak of light",
    text: "Connecting ridge: sunlit about 89% of the year. The right panel counts down to the next sunset, Earth-set and Deep Space Network pass, and shows the ground temperature hour by hour.",
    enter: () => {
      st().setLayer("terrain");
      st().select("connecting-ridge-b");
    },
  },
  {
    title: "Find the best landing spot",
    text: "Pick a landing date and how long the mission lasts. The GPU scores every spot for sunlight, contact with Earth, darkness and flat ground, and ranks the top 10.",
    enter: () => {
      const s = st();
      s.setRoverOpen(false);
      s.setFinderOpen(true);
      if (s.field) {
        const r = findBestSpots(s.field, { startHour: Math.floor(s.hour), missionDays: 14, maxNightHours: 50, minSafePct: 50, weights: DEFAULT_WEIGHTS });
        s.setFinder(r);
      }
    },
  },
  {
    title: "Drive a rover through moving shadows",
    text: "Shadows move every hour, so the best path depends on when you drive. The planner keeps the rover in sunlight on gentle slopes, waiting out shadows when it must. Watch it drive.",
    enter: () => {
      const s = st();
      s.setFinder(null);
      s.setFinderOpen(false);
      s.select("connecting-ridge-b");
      s.setRoverOpen(true);
      const f = s.field;
      const data = s.data;
      const e = getEngine();
      const a = data?.sites.find((x) => x.id === "connecting-ridge-b");
      const b = data?.sites.find((x) => x.id === "shackleton-a");
      if (!f || !e || !a || !b) return;
      const A = fieldCell(f, a.lat, a.lon);
      const B = fieldCell(f, b.lat, b.lon);
      if (!A || !B) return;
      const bits = e.visibilityBits(Math.floor(s.hour), 14 * 24);
      const r = planRoute(f, bits, { start: A, goal: B, speedKmh: 0.4, maxSlopeDeg: 20, needLink: false });
      if (isRoute(r)) r.gpuMillis = bits.millis;
      s.setRover(r);
      if (isRoute(r)) {
        s.setSpeedIndex(Math.max(0, SPEEDS.findIndex((x) => x.hoursPerSecond === 6)));
        if (!s.playing) s.togglePlaying();
      }
      currentScene()?.flyToLatLon(-89.55, -150, 28);
    },
  },
  {
    title: "Checked against NASA",
    text: "Sun positions match JPL Horizons to 0.00003°, sunlight matches published research within 3.7 points, temperatures match NASA's Diviner instrument. Use Share view to send anyone this exact scene.",
    enter: () => {
      closePanels();
      st().setRover(null);
      st().setValidationOpen(true);
    },
  },
];

const SEEN_KEY = "lw-welcomed";

function alreadyWelcomed() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // private browsing: nothing to remember
  }
}

export default function Tour() {
  const step = useApp((s) => s.tourStep);
  const setStep = useApp((s) => s.setTourStep);
  const globe = useApp((s) => s.globe);
  const [offer, setOffer] = useState(false);

  // first visit (not via a shared link): offer the tour once the Moon has loaded
  useEffect(() => {
    if (!globe || openedFromLink() || alreadyWelcomed()) return;
    const id = setTimeout(() => setOffer(true), 2500);
    return () => clearTimeout(id);
  }, [globe]);

  useEffect(() => {
    if (step === null) return;
    STEPS[step]?.enter();
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStep(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, setStep]);

  if (step === null) {
    if (!offer) return null;
    return (
      <div className="glass tour-card welcome" role="dialog" aria-label="Welcome">
        <div className="tour-title">Plan a landing at the Moon's south pole</div>
        <div className="tour-text">
          Real NASA terrain, the real Sun and Earth for any hour of 2026–2028, and GPU models of sunlight, radio contact, temperature and ice. New here? The
          one-minute tour shows what it can do.
        </div>
        <div className="tour-nav">
          <button
            className="btn"
            onClick={() => {
              markWelcomed();
              setOffer(false);
            }}
          >
            Explore on my own
          </button>
          <span style={{ flex: 1 }} />
          <button
            className="btn primary"
            onClick={() => {
              markWelcomed();
              setOffer(false);
              setStep(0);
            }}
          >
            ▶ Take the tour
          </button>
        </div>
      </div>
    );
  }
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="glass tour-card" role="dialog" aria-label="Guided tour">
      <div className="tour-count">
        {step + 1} / {STEPS.length}
      </div>
      <div className="tour-title">{s.title}</div>
      <div className="tour-text">{s.text}</div>
      <div className="tour-nav">
        <button className="btn" onClick={() => setStep(null)}>
          Exit
        </button>
        <span style={{ flex: 1 }} />
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            ← Back
          </button>
        )}
        <button
          className="btn primary"
          onClick={() => {
            if (last) {
              setStep(null);
              st().setValidationOpen(false);
            } else setStep(step + 1);
          }}
        >
          {last ? "Finish" : "Next →"}
        </button>
      </div>
    </div>
  );
}
