import { useEffect, useRef } from "react";

export default function DashboardTabs({ tabs, active, onChange }) {
  const barRef = useRef(null);

  useEffect(() => {
    const activeBtn = barRef.current?.querySelector('[aria-selected="true"]');
    activeBtn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <div className="tab-bar" role="tablist" aria-label="Dashboard sections" ref={barRef}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`tab-btn ${active === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-label">{tab.label}</span>
          {typeof tab.count === "number" && (
            <span className="tab-count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
