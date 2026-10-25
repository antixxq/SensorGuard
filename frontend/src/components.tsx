import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Check,
  Droplets,
  Thermometer,
  AlertTriangle,
  CheckCheck,
} from "lucide-react";
import type {
  Alert,
  Measurement,
  MetricStats,
  Period,
  Severity,
} from "./types";
import { formatValue, localDate } from "./api";

export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}
export function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="period-picker" aria-label="History period">
      {(["1h", "6h", "24h", "7d"] as Period[]).map((p) => (
        <button
          key={p}
          className={value === p ? "selected" : ""}
          aria-pressed={value === p}
          onClick={() => onChange(p)}
        >
          {p.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
export function MetricCard({
  metric,
  value,
  status,
  stats,
  min,
  max,
  fresh,
}: {
  metric: "temperature" | "humidity";
  value?: number;
  status: Severity;
  stats?: MetricStats;
  min: number;
  max: number;
  fresh: boolean;
}) {
  const temperature = metric === "temperature";
  const Icon = temperature ? Thermometer : Droplets;
  const unit = temperature ? "°C" : "%";
  return (
    <section className={`panel metric ${temperature ? "cyan" : "blue"}`}>
      <div className="card-label">
        <span className="flex items-center gap-2">
          <Icon size={18} />
          {temperature ? "Temperature" : "Relative humidity"}
        </span>
        <Badge status={status} />
      </div>
      <div className="metric-value">
        {formatValue(value)}
        <span>{unit}</span>
      </div>
      <div className="metric-caption">
        {fresh ? "Latest reading" : "Last known reading · stale or unavailable"}
        <span>
          Range {min}–{max}
          {unit}
        </span>
      </div>
      <div className="range-track">
        <span
          style={{
            width: `${value == null ? 0 : Math.max(2, Math.min(100, ((value - min) / (max - min)) * 100))}%`,
          }}
        />
      </div>
      <div className="metric-stats">
        <span>
          MIN{" "}
          <b>
            {formatValue(stats?.min)}
            {unit}
          </b>
        </span>
        <span>
          AVG{" "}
          <b>
            {formatValue(stats?.average)}
            {unit}
          </b>
        </span>
        <span>
          MAX{" "}
          <b>
            {formatValue(stats?.max)}
            {unit}
          </b>
        </span>
      </div>
    </section>
  );
}
export function Chart({
  data,
  metric,
  min,
  max,
  period,
}: {
  data: Measurement[];
  metric: "temperature" | "humidity";
  min: number;
  max: number;
  period: Period;
}) {
  const temp = metric === "temperature";
  const color = temp ? "#39d9c4" : "#5c9cff";
  return (
    <div
      className="chart"
      role="img"
      aria-label={`${metric} history chart, ${data.length} averaged time buckets. Exact summary values appear in the cards.`}
    >
      {data.length === 0 ? (
        <div className="empty">
          <span>No measurements in this period</span>
          <small>
            Start the simulator or connect your ESP32 to see readings.
          </small>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="#2a3039"
              vertical={false}
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) =>
                new Date(String(v)).toLocaleString(
                  [],
                  period === "7d"
                    ? { month: "short", day: "numeric" }
                    : { hour: "2-digit", minute: "2-digit" },
                )
              }
              minTickGap={65}
              tick={{ fill: "#8a96a7", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#8a96a7", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}${temp ? "°" : "%"}`}
            />
            <Tooltip
              labelFormatter={(v) => localDate(String(v))}
              formatter={(v) => [
                `${Number(v).toFixed(1)} ${temp ? "°C" : "%"}`,
                temp ? "Temperature" : "Humidity",
              ]}
              contentStyle={{
                background: "#1b222b",
                border: "1px solid #39424e",
                borderRadius: 10,
                color: "#eef5ff",
              }}
            />
            <ReferenceLine y={min} stroke="#b98a45" strokeDasharray="4 6" />
            <ReferenceLine y={max} stroke="#b98a45" strokeDasharray="4 6" />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={color}
              strokeWidth={2}
              fill={`url(#fill-${metric})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
export function AlertList({
  items,
  onRead,
  busy,
}: {
  items: Alert[];
  onRead: (id: number) => void;
  busy: boolean;
}) {
  return (
    <div className="alert-list">
      {items.length === 0 ? (
        <div className="empty">
          <CheckCheck size={28} />
          <strong>All clear</strong>
          <small>
            No alerts in this period. Threshold violations will appear here.
          </small>
        </div>
      ) : (
        items.map((a) => (
          <article
            className={`alert-row ${a.read ? "is-read" : ""}`}
            key={a.id}
          >
            <div className={`alert-icon ${a.severity}`}>
              <AlertTriangle size={18} />
            </div>
            <div className="alert-copy">
              <div>
                <strong>
                  {a.metric === "temperature" ? "Temperature" : "Humidity"} out
                  of range
                </strong>
                <Badge status={a.severity} />
              </div>
              <p>{a.message}</p>
              <small>
                {localDate(a.timestamp)} · {a.source.toUpperCase()} ·{" "}
                {a.resolved_at
                  ? `Resolved ${localDate(a.resolved_at)}`
                  : "Unresolved · awaiting normal reading"}
              </small>
            </div>
            <button
              className="icon-button"
              disabled={a.read || busy}
              onClick={() => onRead(a.id)}
              title={a.read ? "Read" : "Mark as read"}
              aria-label={a.read ? "Alert read" : `Mark alert ${a.id} as read`}
            >
              <Check size={18} />
            </button>
          </article>
        ))
      )}
    </div>
  );
}
