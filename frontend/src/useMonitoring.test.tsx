import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { useMonitoring } from "./useMonitoring";

vi.mock("./api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("surfaces slow connection failures without overlapping polling requests", async () => {
  vi.useFakeTimers();
  vi.mocked(api).mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error("Connection timed out")), 10000);
      }),
  );
  const notify = vi.fn();
  const { result } = renderHook(() => useMonitoring("24h", false, 0, notify));
  expect(api).toHaveBeenCalledTimes(5);
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(api).toHaveBeenCalledTimes(5);
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(result.current.error).toBe("Connection timed out");
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(api).toHaveBeenCalledTimes(10);
});
