export type Period = "1h" | "6h" | "24h" | "7d";
export type Severity = "normal" | "warning" | "critical" | "unknown";
export interface Settings {
  temperature_min: number;
  temperature_max: number;
  humidity_min: number;
  humidity_max: number;
  mode: "demo" | "hardware";
  simulation_enabled: boolean;
}
export interface Measurement {
  timestamp: string;
  temperature: number;
  humidity: number;
  source: "demo" | "hardware";
  samples?: number;
}
export interface Current {
  measurement: Measurement | null;
  device_status: "online" | "offline" | "demo";
  fresh: boolean;
  levels: { temperature: Severity; humidity: Severity };
  mode: "demo" | "hardware";
  simulation_enabled: boolean;
  hardware_configured: boolean;
  server_time: string;
}
export interface MetricStats {
  average: number | null;
  min: number | null;
  max: number | null;
}
export interface Stats {
  temperature: MetricStats;
  humidity: MetricStats;
  count: number;
  alert_count: number;
  source: string;
}
export interface Alert {
  id: number;
  timestamp: string;
  resolved_at: string | null;
  source: string;
  metric: string;
  severity: Severity;
  message: string;
  read: boolean;
}
export interface AlertPage {
  items: Alert[];
  total: number;
}
export interface History {
  items: Measurement[];
  source: string;
  aggregation: string;
  bucket_seconds: number;
}
