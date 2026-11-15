import Icon from "./Icon";
import { useEffect, useState } from "react";
import { DEFAULT_WEIGHTS, findBestSpots, fitsFinderMission } from "../gpu/finder";
import { getEngine } from "../gpu/useFieldMetrics";
import { currentScene, openedFromLink } from "../state/share";
import { useApp } from "../state/store";
import { ephemYears } from "../lib/years";

interface Step {
  title: string;
  text: string;
  enter: () => void;
}

const st = () => useApp.getState();

// Counts every step change (including closing the tour), so async work started by a step can tell whether the
// visit that started it is still the current one.
let stepVisit = 0;

function closePanels() {
  const s = st();
  s.setFinderOpen(false);
  s.setLanderOpen(false);
  s.setRoverOpen(false);
  s.setValidationOpen(false);
  s.setReportOpen(false);
  s.setSkylineOpen(false);
  s.setCompareOpen(false);
  s.setPorkchopOpen(false);
  // On phones and tablets a tool opens the Sites sheet; close it too, so it doesn't linger under later steps.
  s.setMobilePanel("none");
  if (s.playing) s.togglePlaying();
}

// Keep every step independent when reached with Back or Next.
function clearTools() {
  closePanels();
  st().setRover(null);
  st().setFinder(null);
}

function poleView() {
  currentScene()?.flyToLatLon(-89.45, -140, 55);
}

const STEPS: Step[] = [
  {
    title: "Choose where and when to land",
    text: "A useful landing site needs sunlight for power, a clear view of Earth for communication, and suitable terrain. This tour follows that decision using NASA terrain and the selected UTC date.",
    enter: () => {
      clearTools();
      const s = st();
      if (s.poleField) s.setActiveField(s.poleField);
      // Keep enough data ahead for the example mission and annual layers.
      if (s.data && s.hour + 395 * 24 >= s.data.ephem.count) s.setHour(Math.max(0, Math.min(90 * 24, s.data.ephem.count - 395 * 24)));
      s.setView("3d");
      s.setLayer("terrain");
      s.requestOrbit();
    },
  },
  {
    title: "Read a site's power and communications",
    text: "Connecting ridge B is one candidate near the south pole. Sun and Earth elevations, time to the next visibility change, and Deep Space Network contact are shown in Site. On a phone, use the Site tab to return here.",
    enter: () => {
      clearTools();
      st().setLayer("terrain");
      st().select("connecting-ridge-b");
      st().setMobilePanel("site");
      poleView();
    },
  },
  {
    title: "See what the terrain blocks",
    text: "The horizon chart plots the Sun and Earth against this site's terrain skyline. Faded dots are hidden behind terrain. At the pole, small changes in elevation can decide whether a site has power or a direct view of Earth.",
    enter: () => {
      closePanels();
      st().select("connecting-ridge-b");
      st().setSkylineOpen(true);
    },
  },
  {
    title: "Compare possible landing dates",
    text: "Each row is a site and each column is a landing time. Colors show how much of the mission the selected lander's battery survives. Tap a date to select it. These are model estimates for this lander, not guaranteed landing windows.",
    enter: () => {
      closePanels();
      st().setPorkchopOpen(true);
    },
  },
  {
    title: "Find a site for your mission",
    text: "Set the UTC landing time, mission length, night tolerance and terrain limits. Rank landing sites searches the loaded area. The score balances your chosen priorities; it does not certify that a location is safe to land on.",
    enter: () => {
      closePanels();
      const s = st();
      s.setRover(null);
      if (s.field && s.data && getEngine() && fitsFinderMission(Math.floor(s.hour), 14, s.data.ephem.count)) {
        s.setFinder(findBestSpots(s.field, { startHour: Math.floor(s.hour), missionDays: 14, maxNightHours: 50, minSafePct: 50, weights: DEFAULT_WEIGHTS }));
      }
      s.setFinderOpen(true);
      s.setMobilePanel("sites");
    },
  },
  {
    title: "Compare sites at the same time",
    text: "Compare sites puts candidates on the same UTC timeline, with separate Sun, Earth and DSN signals for each one. Add site changes the shortlist. Side by side opens two 3D views. On a phone, switch between the comparison table and Time.",
    enter: () => {
      closePanels();
      const s = st();
      for (const site of [...s.pinned]) s.togglePin(site);
      s.setFinder(null);
      s.setLayer("terrain");
      s.select("connecting-ridge-b");
      for (const id of ["connecting-ridge-b", "shackleton-a"]) {
        const site = s.data?.sites.find((candidate) => candidate.id === id);
        if (site) s.togglePin(site);
      }
      s.setCompareOpen(true);
    },
  },
  {
    title: "Explore the power and ice tradeoff",
    text: "Layers shows sunlight, Earth visibility, terrain slope and modeled ice stability. Sunlit ridges can provide power while shadowed floors may retain ice. Ice estimates require a full year of data. Advanced mission tools are available in Tools.",
    enter: () => {
      clearTools();
      st().setRangeDays(365);
      st().setLayer("ice");
      poleView();
    },
  },
  {
    title: "Evaluate Artemis III candidate regions",
    text: "This report compares NASA's candidate regions for the selected dates. It shows the same power, communication, night and ice tradeoffs at a wider scale. Analyze area loads a more detailed terrain field for a region.",
    enter: () => {
      closePanels();
      st().setRover(null);
      st().requestOrbit();
      st().setReportOpen(true);
    },
  },
  {
    title: "Check the evidence and model limits",
    text: "Validation lists the data sources, comparisons with JPL Horizons and published sunlight research, temperature checks, and model limits. Settings also has Share view. Finish the tour, then try your own site, date and mission constraints.",
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
  const ephem = useApp((s) => s.data?.ephem);
  const years = ephem ? ephemYears(ephem).label : "the loaded years";
  const [offer, setOffer] = useState(false);
  const [card, setCard] = useState<HTMLDivElement | null>(null);

  // The card's height, for styles.css to keep an open window (report, validation) clear of it.
  useEffect(() => {
    if (!card) return;
    const ro = new ResizeObserver(() => document.body.style.setProperty("--tour-h", `${card.offsetHeight}px`));
    ro.observe(card);
    return () => {
      ro.disconnect();
      document.body.style.removeProperty("--tour-h");
    };
  }, [card]);

  // first visit (not via a shared link): offer the tour once the Moon has loaded
  useEffect(() => {
    if (!globe || openedFromLink() || alreadyWelcomed()) return;
    const id = setTimeout(() => setOffer(true), 2500);
    return () => clearTimeout(id);
  }, [globe]);

  useEffect(() => {
    stepVisit++;
    if (step === null) return;
    STEPS[step]?.enter();
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setStep(null);
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
          Real NASA terrain, the real Sun and Earth for any hour of {years}, and GPU models of sunlight, radio contact, temperature and ice. New here? The
          guided tour walks through the landing decision.
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
            <Icon name="play" /> Take the tour
          </button>
        </div>
      </div>
    );
  }
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div ref={setCard} className="glass tour-card" role="dialog" aria-label="Guided tour">
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
