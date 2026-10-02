import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IceCreamSticker } from "./components/IceCreamSticker";
import { MeltingIceBar } from "./components/MeltingIceBar";
import { MeltingIceCream } from "./components/MeltingIceCream";

type Item = "cone" | "bar";
type Screen = "onboarding" | "start" | "route" | "journey" | "result" | "records" | "challenge";

const WALK_SECONDS = 200;
const SAFE_SECONDS: Record<Item, number> = { cone: 255, bar: 330 };
const DEMO_SPEED = 15;

const DESTINATIONS = ["Home · Dogok Raemian", "Yangjae Stream", "Maebong Station"];

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function formatWords(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${remainder} sec`;
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    if (new URLSearchParams(window.location.search).has("challenge")) return "challenge";
    return localStorage.getItem("melt-before-demo-onboarded") === "true" ? "start" : "onboarding";
  });
  const [item, setItem] = useState<Item>("cone");
  const [destination, setDestination] = useState(DESTINATIONS[0]);
  const [elapsed, setElapsed] = useState(0);
  const [recordCount, setRecordCount] = useState(() =>
    Number(localStorage.getItem("melt-before-demo-records") ?? 12),
  );
  const [shareMessage, setShareMessage] = useState("");

  const safeSeconds = SAFE_SECONDS[item];
  const margin = safeSeconds - WALK_SECONDS;
  const meltProgress = Math.min(1, elapsed / (safeSeconds * 2));

  useEffect(() => {
    if (screen !== "journey") return;
    const timer = window.setInterval(() => {
      setElapsed((current) => Math.min(safeSeconds * 2, current + DEMO_SPEED));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, safeSeconds]);

  const finishJourney = () => {
    setRecordCount((current) => {
      const next = current + 1;
      localStorage.setItem("melt-before-demo-records", String(next));
      return next;
    });
    setScreen("result");
  };

  const reset = () => {
    setElapsed(0);
    setScreen("start");
  };

  const shareDemo = async (text: string, query = "") => {
    const shareUrl = `${window.location.origin}${window.location.pathname}${query}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Melt Before", text, url: shareUrl });
        setShareMessage("Share sheet opened");
      } else {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
        setShareMessage("Share text copied");
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setShareMessage("Sharing is unavailable in this browser");
    }
  };

  useEffect(() => {
    if (!shareMessage) return;
    const timer = window.setTimeout(() => setShareMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [shareMessage]);

  return (
    <div className="site-shell">
      <aside className="portfolio-note">
        <div className="brand-lockup">
          <img src="./app-icon.png" alt="" />
          <div><strong>Melt Before</strong><span>Interactive portfolio demo</span></div>
        </div>
        <h1>Bring your ice cream home before it melts.</h1>
        <p>
          This demo recreates the core Apps-in-Toss experience with fixed sample data. No location,
          weather, or map API is called.
        </p>
        <div className="demo-facts">
          <span>31.3°C</span><span>Sunny</span><span>Dogok-dong, Seoul</span>
        </div>
        <small>Journey time is accelerated 15× for reviewers.</small>
      </aside>

      <main className="phone-frame" aria-live="polite">
        <div className="phone-status"><span>9:41</span><span>●●●</span></div>
        <div className="toss-nav"><span className="nav-back">‹</span><img src="./app-icon.png" alt="" /><strong>Melt Before</strong><span className="nav-actions">••• &nbsp; ×</span></div>
        {screen === "onboarding" && (
          <OnboardingScreen onStart={() => { localStorage.setItem("melt-before-demo-onboarded", "true"); setScreen("start"); }} />
        )}
        {screen === "start" && (
          <StartScreen item={item} onItemChange={setItem} onNext={() => setScreen("route")} onRecords={() => setScreen("records")} />
        )}
        {screen === "route" && (
          <RouteScreen item={item} destination={destination} onDestinationChange={setDestination} safeSeconds={safeSeconds} margin={margin} onBack={() => setScreen("start")} onStart={() => { setElapsed(0); setScreen("journey"); }} />
        )}
        {screen === "journey" && (
          <JourneyScreen item={item} elapsed={elapsed} safeSeconds={safeSeconds} progress={meltProgress} onArrive={finishJourney} />
        )}
        {screen === "result" && (
          <ResultScreen item={item} elapsed={elapsed || WALK_SECONDS} safeSeconds={safeSeconds} recordCount={recordCount} onRecords={() => setScreen("records")} onReset={reset} onShare={() => shareDemo("I brought my ice cream home before it melted. Could you make it in time?", `?challenge=1&item=${item}`)} />
        )}
        {screen === "records" && (
          <RecordsScreen recordCount={recordCount} onBack={() => setScreen("start")} onReset={reset} onShare={() => shareDemo(`I saved ${recordCount} ice creams this summer. How does your freezer look?`)} />
        )}
        {screen === "challenge" && (
          <ChallengeScreen onStart={() => { window.history.replaceState({}, "", window.location.pathname); setScreen("start"); }} />
        )}
        {shareMessage && <div className="demo-toast" role="status">{shareMessage}</div>}
      </main>
    </div>
  );
}

function Header({ title, subtitle, onBack, action }: { title: string; subtitle?: string; onBack?: () => void; action?: ReactNode }) {
  return (
    <header className="screen-header">
      <div className="header-row">
        {onBack && <button className="icon-button" onClick={onBack} aria-label="Go back">‹</button>}
        <div className="header-copy"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action}
      </div>
    </header>
  );
}

function OnboardingScreen({ onStart }: { onStart: () => void }) {
  const items = [
    ["temperature", "See how long it can hold up", "We estimate how long it can keep its shape using the current temperature and ice cream type."],
    ["pin", "Compare it with your route", "We compare the walking time with the recommended time and tell you whether you can make it."],
    ["timer", "Watch it change on the way", "The 3D ice cream changes according to the time elapsed after you leave."],
  ];
  return (
    <section className="screen">
      <Header title="Before your ice cream melts" subtitle="We estimate how long it can hold up in today's weather." />
      <div className="content onboarding-content">
        {items.map(([icon, title, description]) => (
          <section className="onboarding-card" key={icon}>
            <span className="onboarding-icon">{icon === "temperature" ? "♨" : icon === "pin" ? "⌖" : "◷"}</span>
            <div><strong>{title}</strong><p>{description}</p></div>
          </section>
        ))}
        <p className="privacy-note">Location is only used to calculate weather and travel time. This demo uses sample data instead.</p>
      </div>
      <BottomButton onClick={onStart}>Get started</BottomButton>
    </section>
  );
}

function StartScreen({ item, onItemChange, onNext, onRecords }: { item: Item; onItemChange: (item: Item) => void; onNext: () => void; onRecords: () => void }) {
  return (
    <section className="screen">
      <Header title="Arrive before it melts" subtitle="We estimate how long your ice cream can hold up in today's weather." />
      <div className="content start-content">
        <div className="weather-card">
          <div className="weather-icon">☀</div>
          <div><span>Now in Dogok-dong</span><strong>31.3°C</strong><small>Clear · Strong sunlight</small></div>
        </div>

        <div className="section-title"><h3>What kind of ice cream did you buy?</h3></div>
        <div className="item-grid">
          {(["cone", "bar"] as Item[]).map((choice) => (
            <button key={choice} className={`item-card ${item === choice ? "selected" : ""}`} onClick={() => onItemChange(choice)}>
              {choice === "cone" ? <MeltingIceCream progress={0} size={150} autoRotate frostEffect={false} /> : <MeltingIceBar progress={0} size={150} autoRotate frostEffect={false} />}
              <strong>{choice === "cone" ? "Cone" : "Ice bar"}</strong>
              <span>{formatWords(SAFE_SECONDS[choice])}</span>
              {item === choice && <b className="check">✓</b>}
            </button>
          ))}
        </div>
        <p className="estimate-note">This is a conservative estimate set before it fully melts.<br />Actual melting speed may vary by product and storage conditions.</p>
        <button className="records-link" onClick={onRecords}>My freezer <span>›</span></button>
      </div>
      <BottomButton onClick={onNext}>Choose a destination</BottomButton>
    </section>
  );
}

function RouteScreen({ item, destination, onDestinationChange, safeSeconds, margin, onBack, onStart }: { item: Item; destination: string; onDestinationChange: (value: string) => void; safeSeconds: number; margin: number; onBack: () => void; onStart: () => void }) {
  const [originQuery, setOriginQuery] = useState("Dogok Market");
  const [destinationQuery, setDestinationQuery] = useState(destination);
  const [searchTarget, setSearchTarget] = useState<"origin" | "destination" | null>(null);
  const suggestions = searchTarget === "origin"
    ? ["Dogok Market", "Dogok Station", "Maebong Station"]
    : DESTINATIONS;
  const visibleSuggestions = suggestions.filter((place) => place.toLowerCase().includes((searchTarget === "origin" ? originQuery : destinationQuery).toLowerCase()));
  return (
    <section className="screen">
      <Header title="Where are you taking it?" subtitle="Search for a place or choose it on the map." onBack={onBack} />
      <div className="content route-content">
        <div className="route-fields">
          <div><i className="dot pink" /><label><small>Where you bought it</small><span className="route-input-wrap"><input aria-label="Search where you bought it" value={originQuery} onFocus={() => setSearchTarget("origin")} onChange={(event) => { setOriginQuery(event.target.value); setSearchTarget("origin"); }} /><b>⌕</b></span></label></div>
          <div><i className="connector" /><i className="dot blue" /><label><small>Destination</small><span className="route-input-wrap"><input aria-label="Search destination" value={destinationQuery} onFocus={() => setSearchTarget("destination")} onChange={(event) => { setDestinationQuery(event.target.value); setSearchTarget("destination"); }} /><b>⌕</b></span></label></div>
        </div>
        {searchTarget && visibleSuggestions.length > 0 && (
          <div className="search-results"><strong>Search results</strong>{visibleSuggestions.map((place) => <button key={place} onClick={() => { if (searchTarget === "origin") setOriginQuery(place); else { setDestinationQuery(place); onDestinationChange(place); } setSearchTarget(null); }}>{place}<small>Sample location · Seoul</small></button>)}</div>
        )}
        <MockMap item={item} />
        <p className="map-note">The shop starts at the sample current location.<br />To change it, search above or move a pin on the map.</p>
        <div className="route-result">
          <div className="result-heading"><span className="status-check">✓</span><div><strong>You can arrive with time to spare</strong><p>Follow the suggested route to arrive before it melts.</p></div></div>
          <div className="margin-block"><small>Time left after arrival</small><strong>{formatWords(margin)}</strong></div>
          <div className="comparison"><div><small>To destination</small><strong>{formatWords(WALK_SECONDS)}</strong><span>Walking route</span></div><div><small>Recommended time</small><strong>{formatWords(safeSeconds)}</strong><span>Current weather</span></div></div>
        </div>
      </div>
      <BottomButton onClick={onStart}>Start journey</BottomButton>
    </section>
  );
}

function MockMap({ item }: { item: Item }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [pins, setPins] = useState({ origin: { x: 19, y: 76 }, destination: { x: 76, y: 33 } });
  const [dragging, setDragging] = useState<"origin" | "destination" | null>(null);
  const movePin = (clientX: number, clientY: number) => {
    if (!dragging || !mapRef.current) return;
    const bounds = mapRef.current.getBoundingClientRect();
    const x = Math.max(6, Math.min(94, ((clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(10, Math.min(90, ((clientY - bounds.top) / bounds.height) * 100));
    setPins((current) => ({ ...current, [dragging]: { x, y } }));
  };
  return (
    <div ref={mapRef} className="mock-map" aria-label="Sample walking route from Dogok Market to home" onPointerMove={(event) => movePin(event.clientX, event.clientY)} onPointerUp={() => setDragging(null)} onPointerLeave={() => setDragging(null)}>
      <div className="map-road road-a" /><div className="map-road road-b" /><div className="map-road road-c" />
      <div className="park">DOGOK<br />PARK</div>
      <svg className="route-line" viewBox="0 0 340 220" preserveAspectRatio="none"><path d="M64 168 L120 166 L151 128 L216 128 L258 75" /></svg>
      <button aria-label="Move ice cream shop pin" className="map-pin origin" style={{ left: `${pins.origin.x}%`, top: `${pins.origin.y}%` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging("origin"); }}><IceCreamSticker item={item} size={48} showShadow={false} /></button>
      <button aria-label="Move destination pin" className="map-pin destination" style={{ left: `${pins.destination.x}%`, top: `${pins.destination.y}%` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging("destination"); }}><span /></button>
      <div className="map-badge">Demo route · 0.8 km</div>
    </div>
  );
}

function JourneyScreen({ item, elapsed, safeSeconds, progress, onArrive }: { item: Item; elapsed: number; safeSeconds: number; progress: number; onArrive: () => void }) {
  const remaining = Math.max(0, safeSeconds - elapsed);
  const message = remaining > 120 ? "Still firm. You're doing great." : remaining > 45 ? "A little softer, but still in good shape." : remaining > 0 ? "Almost there — keep moving safely." : "Recommended time has passed.";
  return (
    <section className="screen journey-screen">
      <Header title="Recommended time left" subtitle="The ice cream changes as time passes." />
      <div className="content journey-content">
        <div className="countdown">{remaining > 0 ? formatTime(remaining) : `+${formatTime(elapsed - safeSeconds)}`}</div>
        <div className="journey-model">{item === "cone" ? <MeltingIceCream progress={progress} size={310} journeyMotion /> : <MeltingIceBar progress={progress} size={310} journeyMotion />}</div>
        <div className="journey-status"><strong>{message}</strong><div className="progress-track"><span style={{ width: `${Math.min(100, (elapsed / safeSeconds) * 100)}%` }} /></div><div><span>Started</span><span>Recommended arrival</span><span>Fully melted</span></div></div>
      </div>
      <BottomButton onClick={onArrive}>I've arrived</BottomButton>
    </section>
  );
}

function ResultScreen({ item, elapsed, safeSeconds, recordCount, onRecords, onReset, onShare }: { item: Item; elapsed: number; safeSeconds: number; recordCount: number; onRecords: () => void; onReset: () => void; onShare: () => void }) {
  const remaining = Math.max(0, safeSeconds - elapsed);
  const actualProgress = Math.min(0.72, elapsed / (safeSeconds * 2));
  const [displayProgress, setDisplayProgress] = useState(actualProgress);
  const [showHint, setShowHint] = useState(true);
  const [simulated, setSimulated] = useState(false);
  useEffect(() => {
    const hintTimer = window.setTimeout(() => setShowHint(false), 3000);
    return () => window.clearTimeout(hintTimer);
  }, []);
  const toggleMelt = () => {
    setShowHint(false);
    if (simulated) {
      setDisplayProgress(actualProgress);
      setSimulated(false);
      return;
    }
    setSimulated(true);
    const started = performance.now();
    const initial = displayProgress;
    const animate = (now: number) => {
      const ratio = Math.min(1, (now - started) / 2600);
      setDisplayProgress(initial + (1 - initial) * ratio);
      if (ratio < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  };
  return (
    <section className="screen">
      <Header title="Journey result" subtitle="See how your ice cream arrived." />
      <div className="content result-content">
        <div className="result-hero">
          <button className="result-model" onClick={toggleMelt} aria-label={simulated ? "Return to the arrival state" : "See it fully melted"}>{showHint && <span className="melt-hint">Tap the ice cream</span>}{item === "cone" ? <MeltingIceCream progress={displayProgress} size={198} autoRotate={false} /> : <MeltingIceBar progress={displayProgress} size={198} autoRotate={false} />}</button>
          <h3>Your ice cream made it home in good shape</h3>
          <p>{formatWords(remaining)} to spare</p>
        </div>
        <div className="stats-card"><div><span>Starting temperature</span><strong>31.3°C</strong></div><div><span>Journey time</span><strong>{formatWords(elapsed)}</strong></div></div>
        <button className="secondary-button" onClick={onShare}>Share with a friend</button>
        <button className="records-cta" onClick={onRecords}><IceCreamSticker item="cone" size={34} showShadow={false} /><span>View my summer record <small>{recordCount} ice creams saved</small></span><b>›</b></button>
      </div>
      <BottomButton onClick={onReset}>Start a new timer</BottomButton>
    </section>
  );
}

function RecordsScreen({ recordCount, onBack, onReset, onShare }: { recordCount: number; onBack: () => void; onReset: () => void; onShare: () => void }) {
  const stickers = useMemo(() => Array.from({ length: Math.min(recordCount, 18) }, (_, index) => ({ item: (index % 4 === 1 ? "bar" : "cone") as Item, state: index === 8 ? "soft" as const : "good" as const })), [recordCount]);
  const [selectedRecord, setSelectedRecord] = useState<number | null>(null);
  return (
    <section className="screen">
      <Header title="My summer record" subtitle="A freezer full of ice creams you brought home." onBack={onBack} />
      <div className="content records-content">
        <div className="summary-card"><h3>{recordCount} ice creams saved</h3><p>{Math.max(0, recordCount - 1)} arrived before they fully melted · 96% success</p><div><span><IceCreamSticker item="cone" size={48} showShadow={false} /><b>Cone</b><small>{Math.ceil(recordCount * 0.72)} trips</small></span><span><IceCreamSticker item="bar" size={48} showShadow={false} /><b>Ice bar</b><small>{Math.floor(recordCount * 0.28)} trips</small></span></div></div>
        <div className="freezer-card"><h3>My freezer</h3><p>Tap an ice cream to revisit that day.</p><div className="freezer"><div className="freezer-label"><i /> FREEZER</div><div className="freezer-vents"><i /><i /><i /><i /></div><div className="freezer-grid">{stickers.map((sticker, index) => <button key={index} title={`Journey ${index + 1}`} onClick={() => setSelectedRecord(index)}><IceCreamSticker item={sticker.item} state={sticker.state} size={48} showShadow={false} /></button>)}</div><div className="freezer-shelf" /></div></div>
        <button className="share-card" onClick={onShare}><span><strong>Show off my freezer</strong><small>Share this summer's record with friends.</small></span><b>⌯</b></button>
      </div>
      <BottomButton onClick={onReset}>Start a new timer</BottomButton>
      {selectedRecord != null && (
        <div className="record-sheet-backdrop" onClick={() => setSelectedRecord(null)}>
          <section className="record-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="sheet-close" onClick={() => setSelectedRecord(null)}>×</button>
            <IceCreamSticker item={stickers[selectedRecord].item} state={stickers[selectedRecord].state} size={76} showShadow={false} />
            <h3>{stickers[selectedRecord].state === "good" ? "Arrived in good shape" : "Arrived a little soft"}</h3>
            <p>July {25 - (selectedRecord % 12)} · 31.3°C</p>
            <div><span>Journey time</span><strong>2 min 49 sec</strong></div>
          </section>
        </div>
      )}
    </section>
  );
}

function ChallengeScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="screen">
      <Header title="A friend sent you a challenge" subtitle="Can you bring yours home before it melts?" />
      <div className="content challenge-content">
        <div className="challenge-visual"><IceCreamSticker item="cone" size={110} showShadow /><span>VS</span><div className="empty-sticker">?</div></div>
        <section className="challenge-card"><p>Your friend saved</p><strong>14 ice creams</strong><span>96% arrived before fully melting</span></section>
        <p className="challenge-copy">Check today's weather, choose your ice cream, and see whether you can make it in time.</p>
      </div>
      <BottomButton onClick={onStart}>Make my own record</BottomButton>
    </section>
  );
}

function BottomButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <div className="bottom-area"><button className="primary-button" onClick={onClick}>{children}</button></div>;
}

export default App;
