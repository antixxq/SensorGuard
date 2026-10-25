import { useCallback, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  ChevronRight,
  Cpu,
  FlaskConical,
  LayoutDashboard,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { api, localTime } from "./api";
import type { Period } from "./types";
import { useMonitoring } from "./useMonitoring";
import {
  AlertList,
  Badge,
  Chart,
  MetricCard,
  PeriodPicker,
} from "./components";
import SettingsPage from "./SettingsPage";

type Page = "Dashboard" | "Analytics" | "Alerts" | "Settings";
interface Toast {
  id: number;
  message: string;
  error: boolean;
}
const navigation = [
  { page: "Dashboard", icon: LayoutDashboard },
  { page: "Analytics", icon: ChartNoAxesCombined },
  { page: "Alerts", icon: Bell },
  { page: "Settings", icon: SettingsIcon },
] as const;

export default function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [period, setPeriod] = useState<Period>("24h");
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [metric, setMetric] = useState<"temperature" | "humidity">(
    "temperature",
  );
  const [direction, setDirection] = useState<"high" | "low">("high");
  const notify = useCallback((message: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, error }]);
    window.setTimeout(
      () => setToasts((t) => t.filter((v) => v.id !== id)),
      6500,
    );
  }, []);
  const { data, error, updated, refresh } = useMonitoring(
    period,
    page === "Alerts",
    offset,
    notify,
  );
  async function action(work: () => Promise<unknown>, message?: string) {
    setBusy(true);
    try {
      await work();
      if (message) notify(message);
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Action failed", true);
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    setBusy(true);
    try {
      const response = await fetch(`/api/export/csv?period=${period}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(
          "Export failed. Try a shorter period or check the backend.",
        );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sensorguard-${data?.current.mode}-${period}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify("CSV exported with UTC timestamps and source labels.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Export failed", true);
    } finally {
      setBusy(false);
    }
  }
  const read = (id: number) =>
    void action(() => api(`/alerts/${id}/read`, { method: "PATCH" }));
  const choosePeriod = (p: Period) => {
    setPeriod(p);
    setOffset(0);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#dashboard"
          onClick={() => setPage("Dashboard")}
        >
          <div className="brand-mark">
            <ShieldCheck size={23} />
          </div>
          <span>
            Sensor<span className="brand-light">Guard</span>
            <small>MONITORING PLATFORM</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Cpu size={18} />
          </span>
          <div>
            Local workspace<small>Single-device monitoring</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {navigation.map(({ page: p, icon: Icon }) => (
            <button
              className={page === p ? "active" : ""}
              onClick={() => {
                setPage(p);
                setOffset(0);
              }}
              key={p}
              aria-current={page === p ? "page" : undefined}
            >
              <Icon size={19} />
              {p}
              {p === "Alerts" && !!data?.stats.alert_count && (
                <span className="nav-count">{data.stats.alert_count}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="status-dot" />
            <strong>Local by design</strong>
            <p>
              Your sensor data stays
              <br />
              on this machine.
            </p>
          </div>
          <span className="footer-note">
            Built for IoT Monitoring
            <br />
            <b>SensorGuard v1.0</b>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{page}</span>
          </div>
          <div className="topbar-status">
            <span className={`status-dot ${error ? "red" : ""}`} />
            <span>{error ? "Connection lost" : "Local system"}</span>
            <span className="topbar-divider" />
            <span className="last-update">
              {updated ? `Updated ${localTime(updated)}` : "Connecting…"}
            </span>
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label="Refresh data"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">ENVIRONMENT INTELLIGENCE</div>
              <h1>
                {page === "Dashboard"
                  ? "Overview"
                  : page === "Analytics"
                    ? "Historical analytics"
                    : page === "Alerts"
                      ? "Alert center"
                      : "Settings"}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "A clear view of your environment. Every reading, in real time."
                  : page === "Analytics"
                    ? "Understand your environment with measured statistics."
                    : page === "Alerts"
                      ? "Track threshold events, acknowledge them, and see recovery."
                      : "Configure your environment and connected data source."}
              </p>
            </div>
            {page !== "Settings" && (
              <button
                className="secondary"
                disabled={busy || !data}
                onClick={() => void exportCsv()}
              >
                <ArrowDownToLine size={16} />
                Export CSV
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <strong>Unable to refresh data.</strong> {error}{" "}
              {data &&
                "Showing cached readings; connection status may be stale."}
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {!data ? (
            <div className="panel loading" role="status">
              <LoaderCircle className="spin" />
              <h2>
                {error ? "Backend unavailable" : "Connecting to SensorGuard"}
              </h2>
              <p>
                Start the FastAPI backend on port 8000. Your local workspace
                will appear here.
              </p>
            </div>
          ) : (
            <>
              <div className={`mode-banner ${data.current.mode}`}>
                <div>
                  <FlaskConical size={18} />
                  <strong>
                    {data.current.mode === "demo"
                      ? "DEMO WORKSPACE"
                      : "HARDWARE WORKSPACE"}
                  </strong>
                  <span>
                    {data.current.mode === "demo"
                      ? "All readings are synthetic. Explore freely, no hardware required."
                      : "Live readings from your ESP32. Stored locally."}
                  </span>
                </div>
                <span className="banner-meta">
                  {data.current.mode === "demo"
                    ? data.settings.simulation_enabled
                      ? "SIMULATOR ENABLED"
                      : "SIMULATOR PAUSED"
                    : "ESP32 / DHT11"}
                </span>
              </div>
              {page === "Settings" ? (
                <SettingsPage
                  key={data.settings.mode}
                  settings={data.settings}
                  current={data.current}
                  busy={busy}
                  onSave={(s) =>
                    action(
                      () =>
                        api("/settings", {
                          method: "PUT",
                          body: JSON.stringify(s),
                        }),
                      "Settings saved.",
                    )
                  }
                />
              ) : (
                <>
                  <div className="overview-toolbar">
                    <div className="section-title">
                      <span className="status-dot" />
                      <h2>
                        {page === "Dashboard"
                          ? "Environment monitor"
                          : page === "Analytics"
                            ? "Period summary"
                            : "Event history"}
                      </h2>
                      <span className="subtle-label">
                        {data.current.mode.toUpperCase()}
                      </span>
                    </div>
                    <PeriodPicker value={period} onChange={choosePeriod} />
                  </div>
                  {page !== "Alerts" && (
                    <>
                      <div className="metrics-grid">
                        <MetricCard
                          metric="temperature"
                          value={data.current.measurement?.temperature}
                          status={data.current.levels.temperature}
                          stats={data.stats.temperature}
                          min={data.settings.temperature_min}
                          max={data.settings.temperature_max}
                          fresh={data.current.fresh && !error}
                        />
                        <MetricCard
                          metric="humidity"
                          value={data.current.measurement?.humidity}
                          status={data.current.levels.humidity}
                          stats={data.stats.humidity}
                          min={data.settings.humidity_min}
                          max={data.settings.humidity_max}
                          fresh={data.current.fresh && !error}
                        />
                        <section className="panel device-card">
                          <div className="card-label">
                            <span className="flex items-center gap-2">
                              <Radio size={18} />
                              Device connection
                            </span>
                            <Wifi size={17} />
                          </div>
                          <div className="device-state">
                            <div
                              className={`device-orb ${data.current.device_status}`}
                            >
                              <Cpu size={30} />
                            </div>
                            <div>
                              <h2>
                                {data.current.mode === "demo"
                                  ? "Virtual sensor"
                                  : "ESP32 sensor"}
                              </h2>
                              <Badge
                                status={
                                  error ? "offline" : data.current.device_status
                                }
                              />
                            </div>
                          </div>
                          <div className="device-details">
                            <span>
                              Source
                              <b>
                                {data.current.mode === "demo"
                                  ? "DEMO · synthetic"
                                  : "DHT11 · physical"}
                              </b>
                            </span>
                            <span>
                              Last reading
                              <b>
                                {data.current.measurement
                                  ? localTime(
                                      data.current.measurement.timestamp,
                                    )
                                  : "Awaiting data"}
                              </b>
                            </span>
                            <span>
                              Update interval<b>5 seconds</b>
                            </span>
                          </div>
                        </section>
                      </div>
                      <section className="panel history-panel">
                        <div className="panel-heading">
                          <div>
                            <h2>
                              <Activity size={18} />
                              Environment history
                            </h2>
                            <p>
                              {data.stats.count.toLocaleString()} measurements ·{" "}
                              {period.toUpperCase()} window · browser local time
                            </p>
                          </div>
                          <span className="live-label">
                            <span
                              className={`status-dot ${!data.current.fresh ? "red" : ""}`}
                            />
                            {error
                              ? "DISCONNECTED"
                              : !data.current.fresh
                                ? "STALE"
                                : data.current.mode === "demo"
                                  ? "DEMO FEED"
                                  : "LIVE FEED"}
                          </span>
                        </div>
                        <div className="chart-columns">
                          <div>
                            <div className="chart-label">
                              <span className="legend-dot cyan-bg" />
                              Temperature <span>°C</span>
                            </div>
                            <Chart
                              data={data.history.items}
                              metric="temperature"
                              min={data.settings.temperature_min}
                              max={data.settings.temperature_max}
                              period={period}
                            />
                          </div>
                          <div>
                            <div className="chart-label">
                              <span className="legend-dot blue-bg" />
                              Relative humidity <span>%</span>
                            </div>
                            <Chart
                              data={data.history.items}
                              metric="humidity"
                              min={data.settings.humidity_min}
                              max={data.settings.humidity_max}
                              period={period}
                            />
                          </div>
                        </div>
                        <div className="chart-footnote">
                          Bucket averages · up to {data.history.bucket_seconds}s
                          per point{" "}
                          <span>
                            Dashed lines show configured limits · summary
                            statistics use raw readings
                          </span>
                        </div>
                      </section>
                    </>
                  )}
                  {page === "Analytics" && (
                    <section className="panel analytics-summary">
                      <div>
                        <span className="eyebrow">IN THIS PERIOD</span>
                        <h2>{data.stats.alert_count} threshold events</h2>
                        <p>
                          Includes Warning and Critical transitions from{" "}
                          {data.current.mode.toUpperCase()} readings.
                        </p>
                      </div>
                      <div>
                        <span className="eyebrow">DATA COVERAGE</span>
                        <h2>{data.stats.count.toLocaleString()} readings</h2>
                        <p>
                          First-run history uses 5-minute samples. Live
                          simulation records every 5 seconds. No predictions or
                          estimates.
                        </p>
                      </div>
                    </section>
                  )}
                  {(page === "Dashboard" || page === "Alerts") && (
                    <div className={page === "Dashboard" ? "bottom-grid" : ""}>
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h2>
                              <Bell size={18} />
                              {page === "Dashboard"
                                ? "Recent alerts"
                                : "Threshold events"}
                            </h2>
                            <p>
                              {page === "Dashboard"
                                ? "Latest 5 events · past 7 days"
                                : `${data.alerts.total} events in selected period`}
                            </p>
                          </div>
                          {page === "Dashboard" && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setPage("Alerts");
                                setOffset(0);
                              }}
                            >
                              View all <ArrowUpRight size={15} />
                            </button>
                          )}
                        </div>
                        <AlertList
                          items={data.alerts.items}
                          onRead={read}
                          busy={busy}
                        />
                        {page === "Alerts" && (
                          <div className="pagination">
                            <button
                              className="secondary"
                              disabled={offset === 0}
                              onClick={() =>
                                setOffset(Math.max(0, offset - 20))
                              }
                            >
                              Previous
                            </button>
                            <span>
                              {data.alerts.total === 0
                                ? "0 events"
                                : `${offset + 1}–${Math.min(offset + 20, data.alerts.total)} of ${data.alerts.total}`}
                            </span>
                            <button
                              className="secondary"
                              disabled={offset + 20 >= data.alerts.total}
                              onClick={() => setOffset(offset + 20)}
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </section>
                      {page === "Dashboard" && (
                        <section className="panel simulator-panel">
                          <div className="panel-heading">
                            <div>
                              <h2>
                                <FlaskConical size={18} />
                                Demo lab
                              </h2>
                              <p>Put your monitoring rules to the test.</p>
                            </div>
                            <span className="demo-chip">DEMO</span>
                          </div>
                          <div className="simulator-body">
                            <div className="simulator-control">
                              <div>
                                <strong>Sensor simulation</strong>
                                <small>
                                  {data.current.mode === "hardware"
                                    ? "Switch to Demo in Settings"
                                    : data.settings.simulation_enabled
                                      ? "Generating readings every 5s"
                                      : "Paused · history is preserved"}
                                </small>
                              </div>
                              <button
                                className="icon-button bordered"
                                disabled={busy || data.current.mode !== "demo"}
                                aria-label={
                                  data.settings.simulation_enabled
                                    ? "Pause simulation"
                                    : "Resume simulation"
                                }
                                onClick={() =>
                                  void action(
                                    () =>
                                      api("/settings", {
                                        method: "PUT",
                                        body: JSON.stringify({
                                          ...data.settings,
                                          simulation_enabled:
                                            !data.settings.simulation_enabled,
                                        }),
                                      }),
                                    data.settings.simulation_enabled
                                      ? "Simulation paused."
                                      : "Simulation resumed.",
                                  )
                                }
                              >
                                {data.settings.simulation_enabled ? (
                                  <Pause size={16} />
                                ) : (
                                  <Play size={16} />
                                )}
                              </button>
                            </div>
                            <div className="anomaly-selects">
                              <label>
                                Parameter
                                <select
                                  value={metric}
                                  onChange={(e) =>
                                    setMetric(e.target.value as typeof metric)
                                  }
                                >
                                  <option value="temperature">
                                    Temperature
                                  </option>
                                  <option value="humidity">Humidity</option>
                                </select>
                              </label>
                              <label>
                                Threshold
                                <select
                                  value={direction}
                                  onChange={(e) =>
                                    setDirection(
                                      e.target.value as typeof direction,
                                    )
                                  }
                                >
                                  <option value="high">Above maximum</option>
                                  <option value="low">Below minimum</option>
                                </select>
                              </label>
                            </div>
                            <button
                              className="anomaly-button"
                              disabled={busy || data.current.mode !== "demo"}
                              onClick={() =>
                                void action(
                                  () =>
                                    api("/demo/anomaly", {
                                      method: "POST",
                                      body: JSON.stringify({
                                        metric,
                                        direction,
                                      }),
                                    }),
                                  "Synthetic anomaly injected. Normal simulation resumes in about 15 seconds.",
                                )
                              }
                            >
                              <Zap size={16} />
                              Demo Anomaly
                              <ArrowUpRight size={15} />
                            </button>
                            <p className="small-note">
                              Injects a labeled synthetic reading beyond your
                              selected limit.
                            </p>
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                </>
              )}
              <footer>
                <span>
                  <ShieldCheck size={14} /> Local storage. Clear signals. Better
                  decisions.
                </span>
                <span>Built for IoT Monitoring</span>
              </footer>
            </>
          )}
        </main>
      </div>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.error ? "toast-error" : ""}`}
            role={t.error ? "alert" : "status"}
          >
            <span>{t.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((v) => v.filter((item) => item.id !== t.id))
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
