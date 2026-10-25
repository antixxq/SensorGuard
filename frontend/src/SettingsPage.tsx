import { useState } from "react";
import { Save, Radio, SlidersHorizontal } from "lucide-react";
import type { Current, Settings } from "./types";
import { Badge } from "./components";

type Threshold =
  "temperature_min" | "temperature_max" | "humidity_min" | "humidity_max";
type DraftSettings = Omit<Settings, Threshold> & Record<Threshold, number | "">;

export default function SettingsPage({
  settings,
  current,
  onSave,
  busy,
}: {
  settings: Settings;
  current: Current;
  onSave: (s: Settings) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<DraftSettings>(settings);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const values: Settings = {
      ...draft,
      temperature_min: Number(draft.temperature_min),
      temperature_max: Number(draft.temperature_max),
      humidity_min: Number(draft.humidity_min),
      humidity_max: Number(draft.humidity_max),
    };
    if (
      Object.values(draft).some((value) => value === "") ||
      [
        values.temperature_min,
        values.temperature_max,
        values.humidity_min,
        values.humidity_max,
      ].some((value) => !Number.isFinite(value))
    ) {
      setError("Enter a finite number for every threshold.");
      return;
    }
    if (
      values.temperature_min >= values.temperature_max ||
      values.humidity_min >= values.humidity_max
    ) {
      setError("Each minimum must be lower than its maximum.");
      return;
    }
    await onSave(values);
  }
  return (
    <form onSubmit={submit} className="settings-grid">
      <section className="panel settings-panel">
        <div className="section-title">
          <SlidersHorizontal size={19} />
          <h2>Monitoring thresholds</h2>
        </div>
        <p className="muted">
          Readings inside these limits are Normal. Changes apply immediately.
        </p>
        {(["temperature", "humidity"] as const).map((metric) => (
          <fieldset key={metric}>
            <legend>
              {metric === "temperature"
                ? "Temperature · °C"
                : "Relative humidity · %"}
            </legend>
            <div className="input-pair">
              {(["min", "max"] as const).map((bound) => (
                <label key={bound}>
                  {bound === "min" ? "Minimum" : "Maximum"}
                  <input
                    required
                    type="number"
                    step="0.1"
                    min={metric === "temperature" ? -40 : 0}
                    max={metric === "temperature" ? 80 : 100}
                    value={draft[`${metric}_${bound}`]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [`${metric}_${bound}`]:
                          e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="rule-note">
          <strong>How severity works</strong>
          <p>
            Outside a limit: Warning. At least 3°C or 10 percentage points
            beyond a limit: Critical. Back inside the limits: Normal. Repeated
            readings in the same state do not create duplicate alerts.
          </p>
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy} type="submit">
          <Save size={16} />
          {busy ? "Saving…" : "Save settings"}
        </button>
      </section>
      <section className="panel settings-panel">
        <div className="section-title">
          <Radio size={19} />
          <h2>Data source</h2>
        </div>
        <p className="muted">
          One active source. Demo and hardware histories stay separate.
        </p>
        <div className="source-options">
          {(["demo", "hardware"] as const).map((mode) => (
            <label className={draft.mode === mode ? "active" : ""} key={mode}>
              <input
                type="radio"
                name="mode"
                checked={draft.mode === mode}
                onChange={() => setDraft({ ...draft, mode })}
              />
              <span>
                <strong>
                  {mode === "demo" ? "Demo simulator" : "ESP32 + DHT11"}
                </strong>
                <small>
                  {mode === "demo"
                    ? "Synthetic readings · no equipment needed"
                    : "Real readings over your local network"}
                </small>
              </span>
            </label>
          ))}
        </div>
        <label className="toggle-row">
          <span>
            Enable demo simulation
            <small>New readings every 5 seconds in Demo mode</small>
          </span>
          <input
            type="checkbox"
            checked={draft.simulation_enabled}
            onChange={(e) =>
              setDraft({ ...draft, simulation_enabled: e.target.checked })
            }
          />
        </label>
        <div className="connection-row">
          <span>Current connection</span>
          <Badge status={current.device_status} />
        </div>
        <div className="rule-note">
          <strong>Hardware setup</strong>
          <p>
            {current.hardware_configured
              ? "Device API key is configured."
              : "Device API key is not configured. Set SENSORGUARD_DEVICE_KEY in your local .env file and restart the backend."}{" "}
            See the repository README for wiring and firmware setup. A device is
            Offline after 20 seconds without readings.
          </p>
        </div>
      </section>
    </form>
  );
}
