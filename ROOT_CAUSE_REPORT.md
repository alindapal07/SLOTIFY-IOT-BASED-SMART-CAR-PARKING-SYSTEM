# Root Cause Report — IoT Infrastructure

This report diagnoses the root causes of the IoT stability, communication, and management issues in the Smart Parking system.

---

## 1. Network & Connection Issues

### HTTP Response Code -1 & Connection Refused
* **Root Cause**: The `/api/v1/iot/download-config` endpoint uses `req.get('host')` to generate the `apiEndpoint` inside the device configuration JSON. When downloaded from a local browser, this defaults to `localhost:5000` or `127.0.0.1:5000`. When loaded on an ESP32, `localhost` resolves to the ESP32 itself, causing connection failure (HTTP Code -1) or connection refused.
* **Secondary Cause**: In `server.js`, the printed network address `http://192.168.1.3:5000` is hardcoded. If the server is on a different subnet/LAN IP, this message is misleading.
* **Impact**: ESP32 devices cannot reach the backend API when configured with loopback addresses.

---

## 2. Device Authentication & Database Constraints

### Device Authentication Failure & Mongoose Cast/Validation Errors
* **Root Cause 1 (Status Enum)**: The `IoTDevice` model restricts the `status` field to the enum `['Online', 'Offline', 'Disconnected', 'Connecting']`. However, Step 4/5 requires statuses: `Online`, `Offline`, `Disabled`, `Maintenance`, and `Error`. Setting these statuses triggers a Mongoose validation exception, crashing backend updates or returning 500 errors.
* **Root Cause 2 (DeviceLog Type Enum)**: The `DeviceLog` model restricts the log `type` to `['heartbeat', 'slot_update', 'test_connection']`. Step 12 demands logging of `connection`, `disconnection`, `http_error`, `auth_failure`, `restart`, `enable`, and `disable`. Any attempt to log these events triggers a Mongoose validation exception.
* **Root Cause 3 (Missing Properties)**: The `IoTDevice` model is missing fields requested by the Admin Dashboard: `sensorType` (defaults to `'IR Sensor'`) and `healthStatus` (enum: `['Healthy', 'Faulty', 'Maintenance', 'Unknown']`).
* **Impact**: Database writes fail, device logging is broken, and status updates throw unhandled exceptions.

---

## 3. Simulator & Route Issues

### Missing Sensor Updates & Offline Devices
* **Root Cause**: The `realtimeSimulator.js` script simulates real-time parking spot changes by making `POST` requests to `http://127.0.0.1:PORT/api/v1/iot/simulate-update`. However, `/simulate-update` does not exist in `iotRoutes.js`. 
* **Impact**: All simulated ticks fail with 404 errors, resulting in zero occupancy updates for active zones.

---

## 4. WebSocket & Dashboard Communication

### Broken WebSocket Events & Non-Functional Enable/Disable Switch
* **Root Cause 1 (Enable/Disable Switch)**: The dashboard toggle for enabling/disabling devices modifies the database (`isActive: true/false`) but does not broadcast this change to the device or real-time UI. 
* **Root Cause 2 (No Real-Time Device Updates)**: There is no WebSocket room or handler for devices to receive configurations or events (such as `CONFIG_UPDATE`, `SYNC_DEVICE`, or `RESTART_DEVICE`).
* **Root Cause 3 (Unsecured socket)**: `ioEvents.js` listens to `IOT_DEVICE_CONNECT` but does not perform token verification.
* **Impact**: Devices do not pause/resume when toggled, and the dashboard does not update in real time without a manual page refresh.

---

## 5. Late Exit & Fine Calculation Engine (Phase 20B.1)

### Incorrect Fine Calculation
* **Root Cause**: The backend code calculates the overstay fine by multiplying the total overtime minutes directly by ₹2 (`overtimeMin * 2`), without subtracting the 5-minute grace period.
* **Impact**: Drivers are overcharged by ₹10 (the 5 minutes of grace is billed instead of waived).

### Inconsistent Billing Timer Start
* **Root Cause**: The billing timer starts immediately at QR Entry scan regardless of whether the slot has an active IR sensor enabled. The requirement demands that if an IR sensor is enabled, billing starts ONLY after the IR sensor detects the vehicle presence in the slot.
* **Impact**: False charging of drivers before their vehicle is physically in the slot.

### Missing Base Charge Standard Pricing
* **Root Cause**: The base cost calculation uses `basePricePerHour * hours * multiplier` from the start, missing the standard pricing rule of exactly ₹40 for the first hour and configured rates thereafter.
* **Impact**: Pricing model mismatch with marketplace policy.

### Lack of Real-Time Dashboard Updates
* **Root Cause**: Driver and provider dashboards calculate remaining durations and fines only once upon API load, without a live background interval ticker.
* **Impact**: Users must refresh the browser page to see live fine accumulation or remaining grace time.

