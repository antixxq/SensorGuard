import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type {
  AlertPage,
  Current,
  History,
  Period,
  Settings,
  Stats,
} from "./types";

interface MonitoringData {
  current: Current;
  history: History;
  stats: Stats;
  alerts: AlertPage;
  settings: Settings;
}

/** Own polling and event notifications independently from dashboard rendering. */
export function useMonitoring(
  period: Period,
  alertPage: boolean,
  offset: number,
  notify: (message: string, error?: boolean) => void,
) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const lastAlert = useRef<number | null>(null);
  const activeSource = useRef("");
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const [current, history, stats, alerts, settings] = await Promise.all([
        api<Current>("/current"),
        api<History>(`/measurements?period=${period}`),
        api<Stats>(`/stats?period=${period}`),
        api<AlertPage>(
          `/alerts?period=${alertPage ? period : "7d"}&limit=${alertPage ? 20 : 5}&offset=${alertPage ? offset : 0}`,
        ),
        api<Settings>("/settings"),
      ]);
      if (id !== requestId.current) return;
      // A mode change from another tab can occur between these independent reads.
      if (
        [history.source, stats.source, settings.mode].some(
          (s) => s !== current.mode,
        )
      )
        return;
      const newest = alerts.items[0];
      if (activeSource.current !== current.mode) {
        lastAlert.current = null;
        activeSource.current = current.mode;
      }
      if (
        newest &&
        lastAlert.current !== null &&
        newest.id > lastAlert.current &&
        !newest.read
      ) {
        notify(`${newest.severity.toUpperCase()} · ${newest.message}`);
      }
      if (newest)
        lastAlert.current = Math.max(lastAlert.current ?? 0, newest.id);
      else if (lastAlert.current === null) lastAlert.current = 0;
      setData({ current, history, stats, alerts, settings });
      setUpdated(new Date().toISOString());
      setError("");
    } catch (cause) {
      if (id === requestId.current) {
        setError(cause instanceof Error ? cause.message : "Connection failed");
      }
    }
  }, [period, alertPage, offset, notify]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      await refresh();
      // Do not overlap slow requests: a timeout must reach the visible error state.
      if (!cancelled) timer = window.setTimeout(() => void poll(), 5000);
    }
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      requestId.current++;
    };
  }, [refresh]);

  return { data, error, updated, refresh };
}
