# Verification record

Verified on **25 October 2026**, on Windows with Python **3.14.6** and Node.js **24.18.0**. These results describe checks actually executed, not planned checks.

| Check | Result |
|---|---|
| `python -m pytest backend/tests -q` | **14 passed** |
| `npm.cmd test` | **6 passed**, 2 test files, Vitest 5.0.5 |
| `npm.cmd run build` | **Passed** TypeScript checks and Vite production build |
| `python -m pip check` | No broken requirements |
| `npm.cmd audit --json` | 0 reported vulnerabilities at verification time |
| Backend `/api/health` | HTTP 200 |
| Built frontend served by `npm.cmd run preview` | HTTP 200 |
| Preview `/api/current` proxy | HTTP 200 |
| Preview CSV endpoint | Source-labeled CSV header confirmed |
| Production browser console | No errors or warnings captured |

The Python TestClient emitted one upstream deprecation warning about Starlette's `httpx` compatibility. All tests passed; the warning was not suppressed.

## Automated coverage

Backend tests use isolated temporary SQLite databases and cover:

- Initial 24-hour DEMO seed, UTC serialization, bounded history, and statistics.
- Inclusive limits and exact Warning/Critical transition boundaries.
- Duplicate suppression, acknowledgment, normalization, and a new anomaly after recovery.
- API-key enforcement, missing-key behavior, mode conflicts, and invalid readings.
- DEMO/hardware history isolation, empty hardware statistics, and current device status.
- Threshold validation, persistence, and immediate re-evaluation of fresh readings.
- Paused simulation, stale/Offline readings, and concurrent tick serialization.
- CSV source/timestamp columns and empty-source export.
- Humidity anomalies, pagination, and impossible anomaly rejection.
- Database restart with retained thresholds, disabled simulation, events, and readings.

Frontend tests cover period selection, alert acknowledgment, honest empty state, zero/missing value formatting, inverted threshold rejection, and slow-network polling/error handling without overlapping requests.

## Browser walkthrough actually performed

1. Opened the local application and observed measurements and timestamps update automatically.
2. Created a temperature anomaly using **Demo Anomaly**; saw 32°C, Critical status, toast, and a real alert record.
3. Opened Alerts and marked the event read; observed its later recovery timestamp and Normal status.
4. Changed the temperature maximum from 28 to 29, saved, reloaded the page, and verified the retained limit. Restored 28 afterward.
5. Selected 7D, opened Analytics, and triggered Export CSV; the interface reported the completed download. CSV content was separately checked in API tests and through the running preview proxy.
6. Switched to Hardware without a sensor and observed Offline, absent current values, zero measurements, and empty charts. Returned to Demo afterward.
7. Paused simulation; after more than 20 seconds the interface showed Offline and labeled last-known readings as stale. Resumed it afterward.
8. Inspected the 390px mobile layout and checked that no main content extended beyond the viewport. Captured a genuine full-page mobile screenshot.
9. Loaded the production build through Vite preview and inspected a 1280px desktop layout. Captured the genuine dashboard screenshot used in the README.

The local demo database retains the labeled test alert from this walkthrough. It is excluded from the source archive and Git. A clean installation starts with synthetic history and no alert events.

## Verification limits

- ESP32 firmware was reviewed against the DHT library interface and Espressif HTTPClient documentation, but **not compiled, flashed, or tested on physical hardware**. No device was attached.
- Windows installation was exercised on this development machine, not on a separate clean Windows virtual machine. The archive excludes dependencies and runtime data and documents a clean installation procedure.
- The UI was checked in the embedded Chromium browser at desktop and mobile widths, not across every browser/device or using a screen reader.
- This is a single-device, single-user local application. No cloud deployment, GitHub push, authentication system, automatic retention, or database migration system was performed or added.

The development sandbox blocked Windows asyncio loopback sockets, so Python tests and local preview servers required an approved execution context with loopback access. System firewall and PowerShell execution policies were not changed. Direct PowerShell commands are documented for machines where `.ps1` execution is restricted.
