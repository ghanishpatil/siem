# Phase 6 — Attack Simulation Lab

## 1. Overview & Architecture

The **Attack Simulation Lab** is a controlled testing and demonstration environment integrated into the SentinelX SIEM platform. It allows security analysts and operators to generate deterministic synthetic security events that exercise the five built-in detection rules:
- **AUTH-001**: Brute Force Authentication
- **AUTH-002**: Password Spraying
- **AUTH-003**: Authentication Failures Followed by Success
- **NET-001**: Potential Port Scan
- **PRIV-001**: Privilege Escalation

### Non-Negotiable Pipeline Integrity
The simulator strictly complies with real SIEM architecture:
1. **No direct database insertions**: The lab never writes directly to SQLite or manipulates alert tables.
2. **No manufactured alerts**: Internal detection classes are never invoked out-of-band to fabricate alerts.
3. **No relaxed thresholds**: Built-in rule thresholds and time windows are strictly preserved.
4. **Honest states**: Scenarios are marked `DETECTED` only after the backend correlation engine evaluates stored events and `GET /api/alerts` confirms a persisted alert supported by genuine evidence event IDs.

```
+-------------------------------------------------------------------+
|                        ATTACK SIMULATION LAB                      |
+-------------------------------------------------------------------+
  1. Scenario Selection (AUTH-001, AUTH-002, AUTH-003, NET-001, PRIV-001)
         |
         v
  2. Deterministic Synthetic Event Generation (Client-side, RFC 5737 IPs, is_synthetic: true)
         |
         v
  3. POST /api/events/ingest (Standard public ingestion endpoint)
         |
         v
  4. Database Persistence (Stored in SQLite via standard normalization pipeline)
         |
         v
  5. User Explicitly Clicks "RUN CORRELATION"
         |
         v
  6. POST /api/alerts/evaluate (Sliding-window correlation engine runs)
         |
         v
  7. GET /api/alerts (Queries confirmed alerts & resolves evidence event IDs)
         |
         v
  8. Verified Alert & Evidence Inspection (Links to Incident Details Drawer)
```

---

## 2. Detection Scenarios & Generated Event Patterns

Each scenario generates a precise, ordered sequence of synthetic events strictly within the rule's operational window:

| Scenario | Rule ID | Severity | Window | Threshold Constraint | Generated Sequence Pattern |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Brute Force** | `AUTH-001` | HIGH | 60s | $\ge 10$ failures from same `source_ip` within 60s | 10 $\times$ `authentication_failure` from single RFC 5737 origin IP spaced 2s apart (18s duration) against port 22 |
| **Password Spraying** | `AUTH-002` | HIGH | 300s | $\ge 5$ distinct accounts from same `source_ip` within 300s | 6 $\times$ `authentication_failure` from single origin IP targeting 6 distinct usernames spaced 4s apart (20s duration) |
| **Failures Followed by Success** | `AUTH-003` | CRITICAL | 300s | $\ge 5$ failures before 1 success for same `(source_ip, username)` within 300s | 5 $\times$ `authentication_failure` followed by 1 $\times$ `authentication_success` for the exact same source IP and username |
| **Potential Port Scan** | `NET-001` | MEDIUM | 60s | $\ge 15$ distinct `destination_ports` from same `source_ip` within 60s | 16 $\times$ `network_connection` from single origin IP targeting 16 distinct ports (21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 1433, 3306, 3389, 8080) in 27s |
| **Privilege Escalation** | `PRIV-001` | HIGH | 300s | 1 `privilege_escalation` followed by $\ge 1$ sensitive action (process or file) within 300s | 1 $\times$ `privilege_escalation` (`sudo su`) followed by 1 $\times$ `process_creation` (`nc -e /bin/sh`) and 1 $\times$ `file_access` (`/etc/shadow`) by the same account within 8s |

---

## 3. Public API Integration Flow

The simulator communicates solely through standard REST endpoints exposed by FastAPI via the Vite proxy (`/api`):

1. **Ingest Events**:
   - `POST /api/events/ingest`
   - Content-Type: `application/json`
   - Payload: Array of `SyntheticEvent` objects conforming to Pydantic normalization schema.
   - Response: Returns `IngestSummary` (`received_count`, `accepted_count`, `rejected_count`, `duplicate_count`, `accepted` list with primary key `id`s).

2. **Explicit Correlation Evaluation**:
   - `POST /api/alerts/evaluate`
   - Invoked strictly on explicit user action ("RUN CORRELATION" button).
   - Never auto-triggered on page load, scenario selection, ingestion completion, or navigation.
   - Response: Returns `EvaluateSummary` (`events_evaluated`, `detections`, `alerts_created`, `alerts_unchanged`, `alerts` list).

3. **Verify Persisted Alert & Evidence**:
   - `GET /api/alerts?limit=50`
   - Matches alerts where `rule_id` equals the scenario rule, and either:
     - An evidence event ID belongs to the current run's `accepted` list, or
     - The correlation entity (`source_ip` or `username`) matches the run's isolated entity.
   - Deep links directly to the alert in the Alerts & Incidents view.

---

## 4. Scenario Lifecycle States

The UI maintains clear, decoupled operational states:

- **IDLE**: No active simulation scenario selected.
- **GENERATED**: Synthetic events created in client-side memory with unique UIDs and isolated entity tokens.
- **INGESTING**: Submitting batch payload to `POST /api/events/ingest`.
- **INGESTION COMPLETED**: Backend confirmed events were validated, normalized, and committed to SQLite (`HTTP 200` or `201`).
- **INGESTION PARTIAL / FAILED**: Backend returned rejected count or validation error (`HTTP 422` or `207`).
- **AWAITING CORRELATION**: Events are persisted in database; waiting for explicit analyst trigger.
- **EVALUATING**: Correlation engine currently executing window queries and rule evaluations.
- **DETECTED**: Backend returned a confirmed alert backed by actual evidence event IDs.
- **NOT DETECTED**: Correlation finished without producing a matching alert (e.g., if threshold was not satisfied).

---

## 5. Safety Boundaries & Anti-Contamination

1. **Synthetic Tagging**: Every event generated includes `is_synthetic: true` at root and in `raw_event`.
2. **Reserved IP Ranges**: All source IPs are dynamically derived from RFC 5737 `TEST-NET-2` (`198.51.100.0/24`), ensuring zero overlap with live production subnets or internal RFC 1918 networks.
3. **Run Isolation**: Every execution generates a randomized 6-character alphanumeric `runId` (e.g. `OM73SC`). This `runId` seeds the IP address octet and appends unique username suffixes, preventing deduplication suppression across consecutive simulation runs.
4. **Safety Banner**: The UI prominently features an amber safety warning:
   > **SIMULATION MODE — Synthetic events only. No real systems are attacked.** Telemetry is explicitly tagged with `is_synthetic: true` and uses reserved RFC 5737 test-net IP ranges.

---

## 6. Landing Page Integrity (Step 10)

The public landing page was updated to maintain honest framing:
- `LiveThreatTicker`: Changed label from `LIVE TELEMETRY / STREAM` to `SAMPLE TELEMETRY / ILLUSTRATIVE STREAM`.
- `RadarScanWidget`: Changed label from `RADAR THREAT SWEEP / 360° CONTINUOUS` to `RADAR THREAT SWEEP (SAMPLE) / ILLUSTRATIVE DATA`.

---

## 7. Verification Results

### A. Backend Pytest Suite
Ran `pytest -v` across all test modules including the new Phase 6 scenario tests (`test_simulation_scenarios.py`):
```powershell
.\.venv\Scripts\pytest -v
```
**Results**:
- **67 passed, 1 warning in 8.69s**
  - `test_simulation_scenario_auth_001_brute_force`: **PASS**
  - `test_simulation_scenario_auth_002_password_spray`: **PASS**
  - `test_simulation_scenario_auth_003_failures_then_success`: **PASS**
  - `test_simulation_scenario_net_001_port_scan`: **PASS**
  - `test_simulation_scenario_priv_001_privilege_escalation`: **PASS**
  - `test_simulation_duplicate_handling`: **PASS**
  - `test_simulation_malformed_event_rejection`: **PASS**
  - 60 existing regression tests: **ALL PASS**

### B. Client-Side Scenario Generator Unit Tests
Ran Node.js contract verification (`node test_scenario_generator.mjs`):
- `AUTH-001`: 10 failures in 18s (window 60s) — **PASS**
- `AUTH-002`: 6 events across 6 distinct users in 20s (window 300s) — **PASS**
- `AUTH-003`: 5 failures followed by 1 success for same user/IP — **PASS**
- `NET-001`: 16 connections across 16 distinct ports in 27s (window 60s) — **PASS**
- `PRIV-001`: `privilege_escalation` followed by `process_creation` & `file_access` — **PASS**
- Entity isolation: Unique UIDs, RFC 5737 range validation — **PASS**

### C. Frontend Production Build
Ran `npm run build` (`tsc --noEmit && vite build`):
- TypeScript compilation: 0 errors
- Vite build: Succeeded (`dist/` emitted in 1.15s)

### D. Live Browser End-to-End Verification (Playwright)
1. **Landing Page**: Verified updated `SAMPLE TELEMETRY` and `ILLUSTRATIVE STREAM` badges.
2. **Navigation**: Navigated to `/dashboard` $\rightarrow$ clicked `Simulation Lab (5)` in sidebar.
3. **Scenario A (Brute Force)**:
   - Clicked "Generate Scenario": 10 events generated in memory with run ID `#PYZRQX`, source IP `198.51.100.76`.
   - Clicked "Ingest Events to API": 10 accepted (`HTTP 201`).
   - Verified verdict remained "Awaiting" until explicit correlation.
   - Clicked "RUN CORRELATION": Evaluated 50 events, created Alert `#6` (`Brute Force Authentication`, `HIGH`).
   - Clicked "Open Incident Details": Navigated to Alert drawer, verified all 10 evidence event IDs correctly linked.
4. **Scenario D (Port Scan)**:
   - Generated 16 events with run ID `#OM73SC`, source IP `198.51.100.166`.
   - Ingested 16 accepted (`HTTP 201`).
   - Clicked "RUN CORRELATION": Created Alert `#7` (`Potential Port Scan`, `MEDIUM`).
   - Inspected JSON modal: Verified `is_synthetic: true`, `simulation_meta`, and RFC 5737 IP.

---

## 8. Known Limitations

1. **Client-Side Event Timestamp Alignment**: Timestamps are generated relative to client clock (`Date.now() - 40s`). If the client machine clock is significantly skewed from the backend server clock, sliding-window queries could be affected.
2. **Deduplication on Repeated Runs**: SentinelX alerts use deterministic fingerprinting (`rule_id` + entity hash). If a user manually re-ingests the exact same scenario with an identical entity hash within the active window, the correlation engine will flag `unchanged` rather than creating a duplicate alert row. The UI displays this behavior accurately.
