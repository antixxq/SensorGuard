export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: init?.signal ?? AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const detail =
      data && typeof data === "object" && "detail" in data ? data.detail : null;
    throw new Error(
      typeof detail === "string"
        ? detail
        : `Request failed (${response.status}). Check your values and backend connection.`,
    );
  }
  return response.json() as Promise<T>;
}
export const formatValue = (value: number | null | undefined) =>
  value == null ? "—" : value.toFixed(1);
export const localTime = (time: string) =>
  new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export const localDate = (time: string) =>
  new Date(time).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
