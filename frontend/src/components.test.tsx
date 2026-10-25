import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertList, PeriodPicker } from "./components";
import SettingsPage from "./SettingsPage";
import { formatValue } from "./api";
import type { Current, Settings } from "./types";
afterEach(cleanup);
describe("monitoring controls", () => {
  it("switches period", () => {
    const change = vi.fn();
    render(<PeriodPicker value="24h" onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "7D" }));
    expect(change).toHaveBeenCalledWith("7d");
  });
  it("shows empty history honestly", () => {
    render(<AlertList items={[]} onRead={() => {}} busy={false} />);
    expect(screen.getByText("All clear")).toBeInTheDocument();
  });
  it("acknowledges an actual alert id", () => {
    const read = vi.fn();
    render(
      <AlertList
        items={[
          {
            id: 42,
            timestamp: "2026-10-25T10:00:00Z",
            resolved_at: null,
            source: "demo",
            metric: "temperature",
            severity: "critical",
            message: "Above limit",
            read: false,
          },
        ]}
        onRead={read}
        busy={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mark alert 42 as read" }),
    );
    expect(read).toHaveBeenCalledWith(42);
  });
  it("renders unavailable values and zero correctly", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue(0)).toBe("0.0");
  });
  it("rejects inverted thresholds before saving", () => {
    const save = vi.fn();
    const settings: Settings = {
      temperature_min: 18,
      temperature_max: 28,
      humidity_min: 30,
      humidity_max: 65,
      mode: "demo",
      simulation_enabled: true,
    };
    const current: Current = {
      measurement: null,
      device_status: "demo",
      fresh: false,
      levels: { temperature: "unknown", humidity: "unknown" },
      mode: "demo",
      simulation_enabled: true,
      hardware_configured: false,
      server_time: "",
    };
    render(
      <SettingsPage
        settings={settings}
        current={current}
        busy={false}
        onSave={save}
      />,
    );
    fireEvent.change(screen.getAllByLabelText("Minimum")[0], {
      target: { value: "35" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "minimum must be lower",
    );
    expect(save).not.toHaveBeenCalled();
  });
});
