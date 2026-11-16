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
    text: "A ridge can be in sunlight while the crater next to it is dark. Pick a landing date and see how the terrain affects power and contact with Earth.",
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
    title: "A closer look at Connecting ridge B",
    text: "The Site panel shows how high the Sun and Earth are, when they come into view or disappear, and when a Deep Space Network station can see the Moon. On a phone, tap Site to reopen it.",
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
    text: "Yellow traces the Sun. Blue traces Earth. Where the dots fade, the terrain blocks the view. Near the pole, even a low ridge can make the difference.",
    enter: () => {
      closePanels();
      st().select("connecting-ridge-b");
      st().setSkylineOpen(true);
    },
  },
  {
    title: "Compare possible landing dates",
    text: "Each row is a site. Pick a cell to see the landing time and when the battery would hit its reserve. Green means the model gives the lander enough power for the whole mission.",
    enter: () => {
      closePanels();
      st().setPorkchopOpen(true);
    },
  },
  {
    title: "Find a site for your mission",
    text: "Set a landing time in UTC and tell the finder how much flat ground you need and how long the lander can go without sunlight. Rank landing sites sorts the area by how well each spot fits your mission.",
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
    text: "Both sites share the same clock, with separate rows for sunlight, Earth and DSN contact. Use Add site to pick another candidate or Side by side to see both in 3D. On a phone, tap Time for the timeline.",
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
    title: "Where could ice stick around?",
    text: "A sunlit ridge can power a lander. The crater floor below may stay cold enough for ice to persist. The ice map needs a full year of data. Use Layers to switch back to sunlight or slope.",
    enter: () => {
      clearTools();
      st().setRangeDays(365);
      st().setLayer("ice");
      poleView();
    },
  },
  {
    title: "Compare the 2024 Artemis III candidates",
    text: "The report compares areas from NASA's October 2024 list for the dates you've picked. Choose Analyze area to load a finer grid and look more closely at one region.",
    enter: () => {
      closePanels();
      st().setRover(null);
      st().requestOrbit();
      st().setReportOpen(true);
    },
  },
  {
    title: "How we checked the model",
    text: "Validation shows how our estimates compare with JPL Horizons, published sunlight studies and Diviner temperature measurements. When you find a view you want to keep, use Share view in Settings.",
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
          Pick a site on NASA terrain, then move the clock to see when the Sun and Earth clear the local horizon. This timeline covers {years}.
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
