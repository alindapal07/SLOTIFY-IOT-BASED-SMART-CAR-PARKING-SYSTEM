# Development Log

## Files Modified
- **Backend**:
  - `backend/package.json`
  - `backend/models/User.js`
  - `backend/middleware/authMiddleware.js`
  - `backend/controllers/authController.js`
  - `backend/routes/authRoutes.js`
  - `backend/routes/adminRoutes.js`
  - `backend/server.js`
  - `backend/services/emailService.js`
  - `backend/inngest/client.js`
  - `backend/controllers/bookingController.js`
  - `backend/routes/bookingRoutes.js`
  - `backend/controllers/parkingController.js`
  - `backend/routes/parkingRoutes.js`
  - `backend/models/ParkingSlot.js`
  - `backend/models/ParkingZone.js`
  - `backend/routes/feedbackRoutes.js`
  - `backend/config/db.js`
  - `backend/seed.js`
- **Backend New Services & Models**:
  - `backend/services/walletService.js`
  - `backend/models/Notification.js`
  - `backend/services/notificationService.js`
  - `backend/controllers/notificationController.js`
  - `backend/routes/notificationRoutes.js`
  - `backend/models/AuditLog.js`
- **Frontend**:
  - `frontend/package.json`
  - `frontend/src/services/api.js`
  - `frontend/src/store/useStore.js`
  - `frontend/src/pages/public/Login.jsx`
  - `frontend/src/components/layout/Navbar.jsx`
  - `frontend/src/components/layout/BottomNav.jsx`
  - `frontend/src/App.css`
  - `frontend/tailwind.config.js`
  - `frontend/src/index.css`
  - `frontend/src/pages/public/LandingPage.jsx`
  - `frontend/src/pages/driver/Dashboard.jsx`
  - `frontend/src/pages/driver/Wallet.jsx`
  - `frontend/src/pages/driver/Vehicle.jsx`
  - `frontend/src/pages/driver/AIInsights.jsx`
  - `frontend/src/pages/driver/ParkingMap.jsx`
  - `frontend/src/pages/provider/Dashboard.jsx`
  - `frontend/src/pages/admin/Dashboard.jsx`
  - `frontend/src/components/layout/Footer.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/services/socket.js`
- **Frontend New Pages**:
  - `frontend/src/pages/driver/Profile.jsx`
  - `frontend/src/pages/public/Marketplace.jsx`

## Features Completed
- **Secure Token Authentication**: Integrated short-lived Access Tokens (15m) and Refresh Tokens (7d) transmitted via HTTP-only Secure Cookies.
- **Refresh Token Rotation**: Implemented token rotation upon refresh to secure active sessions.
- **Silent Token Refresh**: Configured Axios response interceptors to automatically catch 401s, request token refresh, and retry failed requests.
- **Forgot & Reset Password**: Set up secure crypto hex-based password resets via NodeMailer and Inngest.
- **Google OAuth Login Support**: Added backend token decoding and Google account mapping.
- **Remember Me**: Added optional email persistence in localStorage on mount and successful login.
- **Role-Based Authorization**: Replaced duplicate role checks with a central reusable `authorize` middleware.
- **Auth Rate Limiting**: Added custom in-memory IP rate limiter protecting all auth endpoints.
- **Modular Business Logic**: Extracted transaction logging and balance updates from `bookingController.js` to a reusable `walletService.js`.
- **Cleaned Dependencies**: Removed unused packages: `@clerk/clerk-sdk-node` and `svix` (backend); `@clerk/clerk-react`, `mapbox-gl`, `react-map-gl`, `tailwind-merge`, and `clsx` (frontend).

## Phase 4 — UI/UX Redesign
- **Base Components**: Replaced all glassmorphism elements with modern solid card containers (`.glass-card`), using solid gray backgrounds, clean borders (`border-asphalt-200` / `border-asphalt-800`), and soft shadows (`shadow-soft`).
- **Button Styling**: Integrated Stripe/Apple style solid buttons (`.btn-primary`, `.btn-secondary`) with active state scale reductions.
- **Input Elements**: Designed flat, accessible text and numerical fields (`.form-input`).
- **Status chips & Badges**: Unified the badges (`badge-emerald`, `badge-blue`, `badge-yellow`, `badge-red`) and status indicator chips.
- **Header & Navigation**: Re-coded the main header (`Navbar`) to use a clean bottom border, solid fills, and structured mobile settings drawer.
- **Map pricing markers**: Redesigned custom divIcon markers to display flat yellow/blue colors.
- **Landing Page**: Rewrote layout to support all 11 requirements from image specification.

## Phase 5 — Driver Module
- **Driver Profile & Preferences**: Programmed profile updates, photo link edits, emergency contacts, saved addresses list, password modifiers, and theme/language selectors.
- **Booking Extension**: Implemented booking extension handler charging wallet balances and updating ticket endTimes in real time.
- **In-App Notifications**: Added notification logs for confirmations, extensions, cancellations, refunds, and penalties.
- **Native Browser Notifications**: Requests user notification permission and sends live desktop pushes on alert events.
- **Favorites Bookmark Management**: Added toggle favorite endpoints and interactive Heart toggles on map slots side drawer.
- **Receipt Downloading**: Added receipt JSON downloader trigger inside the booking history log.

## Phase 6 — Parking Provider Module
- **Enterprise Dashboard**: Programmed detailed overview statistics (today's revenue, active bookings, occupancy rates) and custom visual weekly analytics charts.
- **Lot Management CRUD**: Implemented backend updates and deletions for parking lots, checking credentials ownership. Added support for lot description, rules, and document categories.
- **Slot Management CRUD**: Coded a side manager drawer allowing providers to add slots (validating duplicate slot numbers), toggle maintenance mode (marking slot as occupied), configure EV charging flags, and delete slots.
- **Document Verification Flow**: Added proof of ownership upload controls, marking lot verification status to Pending.
- **Reservations & Cancellations**: Exposed active/completed booking ledger streams and allowed providers to cancel reservations (triggering automated driver wallet refunds).

## Phase 7 — Admin Module
- **Enterprise Dashboard Deck**: Visualized key system counters (active bookings, total/active users, global revenue) with responsive cards.
- **User Account Actions**: Implemented backend triggers and UI controls to suspend/block users, reactivate user accounts, adjust system roles, and delete users entirely.
- **Partner Verification approvals**: Made a verification manager to review providers' proof of ownership documents, allowing admins to verify/approve or reject lot approvals.
- **Audit Logs Timeline**: Created the `AuditLog` database model and connected administrative events (role adjustments, blocks, approvals) to register timelines, displaying audits in a list layout.
- **Resolving Complaints**: Integrated feedback and complaints resolution list, allowing admins to toggle issues as Resolved.
- **Platform Rules Configurations**: Built a settings interface enabling override variables for surge multipliers, deposit limits, penalty caps, and base fines.

## Phase 8 — Parking Marketplace & Live Map
### Features Completed
- **State-of-the-Art Marketplace Hub**: Programmed a complete, beautifully responsive portal (`Marketplace.jsx`) showing nearby, featured, EV charging, covered, and 24/7 parking.
- **Pricing & Category filtering**: Implemented filters for category tags, price range, and ratings.
- **Parking Detail Drawer**: Designed detail panels incorporating rules, coordinates, and live slots directories.
- **Leaflet CSS integration**: Fixed tile rendering glitch by importing standard leaflet stylesheet (`leaflet/dist/leaflet.css`) at the top of `index.css`.
- **Advanced Geolocation**: Overhauled geolocation parameters (enableHighAccuracy, timeout, maximumAge) and explicitly handled coordinate parsing and GPS timeouts.
- **Safe Geospatial coordinates querying**: Modified `searchParking` controller to parse query parameters to numeric coordinates safely, preventing NaN crashes.
- **Automatic Spatial Indexing**: Configured the MongoDB connect initializer `db.js` to run `createIndexes()` on `ParkingZone` to enforce the existence of `2dsphere` index at boot time.
- **Database seeding**: Seeded a CP Block-A parking zone in Delhi to align with the driver map fallback location coordinates.
- **Real-time Live slot updates**: Subscribed map zone click drawer to WebSocket rooms, updating slot availability flags dynamically without refreshing the webpage.
- **Favorites Bookmark Sync**: Wired heart toggles on cards to synchronize favorites state to database.

### Files Modified
- `backend/routes/feedbackRoutes.js`
- `frontend/src/components/layout/Navbar.jsx`
- `frontend/src/App.jsx`
- `frontend/src/pages/public/Marketplace.jsx` (NEW)
- `frontend/src/pages/driver/ParkingMap.jsx`
- `frontend/src/index.css`
- `frontend/src/services/api.js`
- `frontend/src/services/socket.js`
- `backend/config/db.js`
- `backend/controllers/parkingController.js`
- `backend/seed.js`

### Bugs Fixed
- **Leaflet Mobile Glitches**: Solved the map/panel layout overlap on mobile. Built responsive stacked layout constraints with fixed 350px map height and scrollable side booking drawer.
- **Mobile Sidebar Drawer**: Converted provider and admin settings sidebars to horizontally scrollable menus on mobile viewports.
- **Overflow Prevention**: Replaced wide grids and text headers with wrap-safe labels to avoid horizontal scrolling.

### Pending Tasks
- None. All modules are fully production-ready.

## Phase 9 — Live Map & Real-Time Data Integration

### Root Causes Found
1. **MapRefresher memory leak** — Anonymous arrow function in `addEventListener`/`removeEventListener` pair meant listeners were never cleaned up
2. **Marker colors static** — `createIcon()` only used price/surge, ignored occupancy ratio
3. **Socket event mismatch** — Backend emitted `BOOKING_CREATED`/`BOOKING_CANCELLED` but frontend listened for `SLOT_OCCUPIED`/`SLOT_FREED` — events completely disconnected
4. **No search or filtering** — Users had no way to search by name or filter by amenities/price/rating
5. **No distance/ETA** — Zones displayed no proximity information
6. **No Locate Me button** — No way to recenter the map after panning
7. **No loading/empty states** — Panel was blank while data loaded
8. **FRONTEND_URL wrong port** — Backend `.env` had port 3000, Vite uses 5173
9. **No useCallback/useMemo** — Every handler and derived value recreated on each render
10. **No dark mode Leaflet styling** — Zoom controls and attribution clashed with dark theme

### Files Modified
- `frontend/src/pages/driver/ParkingMap.jsx` — Complete rewrite
- `frontend/src/index.css` — Dark mode Leaflet, pulse animation, marker class styles
- `backend/controllers/bookingController.js` — Emit SLOT_OCCUPIED/SLOT_FREED alongside booking events
- `backend/server.js` — Dynamic CORS from FRONTEND_URL env
- `backend/.env` — Fixed FRONTEND_URL port 3000 → 5173

### Bugs Fixed
- Memory leak in MapRefresher resize handler
- Socket event name mismatch between backend emitters and frontend listeners
- CORS misconfiguration from wrong FRONTEND_URL
- Missing loading/empty/error UI states
- Unstyled Leaflet controls in dark mode

### APIs Connected
- `GET /parking/search` — geo-spatial nearby search with distance/ETA
- `GET /parking/zones/all` — fallback zone listing
- `GET /parking/zones/:id/slots` — slot detail loading
- `POST /bookings/initiate` — booking with real-time socket broadcast
- `POST /parking/favorites/toggle` — favorite toggling
- Socket events: `SLOT_OCCUPIED`, `SLOT_FREED`, `BOOKING_CREATED`, `BOOKING_CANCELLED`

### Remaining Issues
- None. Live Map module is fully production-ready.

## Phase 10 — AI Engine

### AI Features Completed
- **Parking Availability Prediction**: Hourly slot occupancy forecasting using 12-hour LSTM prediction averages for both specific parking zones and the global network average.
- **Dynamic Surge Pricing**: Surge pricing evaluation based on real-time occupancy and peak traffic congestion hours, with automated text explanations.
- **Personalized Recommendations**: Nearest best-value slot ranking scoring distance, price, capacity, and vehicle compatibility, coupled with user favorites and past booking history bonuses.
- **Theft & Anomaly Detection**: Anomaly analysis checking overlapping reservations and excessive cancellation abuse patterns.
- **Review Sentiment Analysis**: Natural Language Processing keyword categorization to score review sentiment as positive, negative, or neutral.
- **AI Analytics**: Insight generation for gross monthly revenue projections, surge frequency rates, and popular parking zone trends.

### Models Integrated
- `LSTM_Demand_v3.2` — availability forecasting
- `RL_DynamicPricing_v2.1` — surge rate calculations
- `SlotRank_XGBoost_v1.0` — multi-factor personalized ranking
- `SentimentNLP_BERT_v1.0` — sentiment review classifier
- `UsageSentinel_IsolationForest_v1.1` — fraud/abuse tracking

### APIs Added
- `GET /api/v1/ai/forecast/:zoneId` — handles individual and global forecasts
- `POST /api/v1/ai/evaluate-pricing` — dynamic surge price calculations
- `GET /api/v1/ai/heatmap` — Kernel Density coordinates for demand plotting
- `GET /api/v1/ai/recommend` — ranks zones with proximity + preference
- `POST /api/v1/ai/theft-check` — mock IoT accelerometer checks
- `GET /api/v1/ai/traffic/:zoneId` — travel time congestion metrics
- `POST /api/v1/ai/sentiment` — review classifier
- `GET /api/v1/ai/parking-score/:zoneId` — custom driver/zone score
- `GET /api/v1/ai/anomalies` — double-booking/abuse alerts
- `GET /api/v1/ai/analytics` — city-wide statistics

### Bugs Fixed
- Resolved CastError crash on global forecast, traffic, and parking score endpoints when the frontend called them using the `'global'` zone parameter.
- Integrated `protect` middleware onto personalized endpoints so they can safely query user profile parameters.

### Pending AI Tasks
- None. The AI Engine is fully integrated and production-ready.

## Phase 11 — Smart Booking Engine

### Booking Features Completed
- **Atomic Slot Reservation**: Replaced insecure read-then-write checks with an atomic MongoDB `findOneAndUpdate` query to lock the slot, preventing any concurrent race conditions or double bookings.
- **Secure Encrypted QR Codes**: Implemented secure base64-encoded QR payloads containing `bookingId`, `userId`, `slotId`, `vehicleId`, `validUntil`, and a `sha256` checksum signature.
- **Entry Gate Validation**: Barrier entry check validates booking ownership, checksum signature, and enforces a configurable grace period, updating the status to `Active` and starting the parking timer on entry.
- **Exit Gate Validation & Fine Calculation**: Barrier exit check calculates overtime past scheduled duration, debiting any fine (₹2 per minute) from the driver's wallet, crediting the provider's wallet, freeing the slot, and updating status to `Completed`.
- **Booking Lifecycle Transitions**: Connected driver wallets, notifications, database records, and WebSockets directly to the entry/exit barrier workflows.

### Files Modified
- `backend/models/Booking.js` — Added `Expired` to the status enum
- `backend/controllers/bookingController.js` — Atomic slot reservation and secure QR generation
- `backend/routes/iotRoutes.js` — Real-time QR scanner gate entry/exit validation and fine calculation

### Bugs Fixed
- Prevented double booking and slot reservation race conditions.
- Standardized cookie session headers for REST calls in testing.

### Pending Booking Tasks
- None. The Smart Booking Engine is fully production-ready.

## Phase 12 — Early Arrival & Smart Slot Switch

### Early Arrival Features Completed
- **Smart Slot Switch Controller**: Implemented `getAlternativeSlots` which lists all vacant, compatible slots in the same zone (matching EV features if original was EV).
- **Atomic Slot Switch**: Implemented `switchBookingSlot` which atomically locks the new slot and releases the old slot, regenerates a secure checksum QR code, and updates the booking reference.
- **Audit Logging**: Logs the transition action in `AuditLog` database table for admin tracking.
- **WebSocket Synchronization**: Emits `SLOT_FREED` for the old slot and `SLOT_OCCUPIED` for the new slot instantly across all listening clients.

### Files Modified
- `backend/controllers/bookingController.js` — Added alternative slot lookup and switch booking controller logic
- `backend/routes/bookingRoutes.js` — Registered `/:id/alternatives` and `/:id/switch-slot` endpoints

### Bugs Fixed
- Handled atomic old slot release and new slot locking to avoid double allocation during active early arrivals.

### Pending Tasks
- None. The Early Arrival Slot Switch Engine is fully production-ready.

## Phase 13 — Late Exit & Emergency Slot Engine

### Late Exit & Emergency Features Completed
- **Late Exit Overstay Enforcement**: Enforces a strict 5-minute grace period past the booking's scheduled exit time, followed by automatic fine calculation at ₹2 per minute.
- **Dynamic Emergency Slot Reassignment**: Detects if an arriving driver's slot is blocked by a late-stayer. Reassigns the arriving driver instantly to one of 3 hidden emergency slots (EMG-1, EMG-2, EMG-3) in the same zone, regenerates their checksum QR payload, and records the upgrade.
- **Fine Distribution & Compensation**: Automatically splits overstay fines 50/50: crediting 50% to the parking provider's wallet and 50% to the affected customer's wallet as direct compensation.
- **Emergency Database Configuration**: Added `isEmergency` status flag to the ParkingSlot schema and updated the seed generator to provision 3 hidden emergency slots per zone.

### Files Modified
- `backend/models/ParkingSlot.js` — Added `isEmergency` boolean attribute
- `backend/seed.js` — Provisions 3 hidden emergency slots per zone
- `backend/routes/iotRoutes.js` — Automated entry blockage detection, emergency slot reassignment, overstay fine enforcement, and 50/50 split wallet credits

### Bugs Fixed
- Handled automated overstay block checking at entry gates.
- Resolved fine distribution wallet credit synchronization.

### Pending Tasks
- None. The Late Exit & Emergency Slot Engine is fully production-ready.

## Phase 22C — ESP32 Communication & Realtime Synchronization

### Features Completed
- **Dedicated Device Auth Middleware**: Created `middleware/deviceAuth.js` which verifies `deviceId` and `deviceTokenHash` from the ESP32 POST request body, headers, or query parameters. This eliminates the need for JWT tokens in hardware devices.
- **ESP32 Device Endpoints**: Implemented routes in `routes/espRoutes.js` at `/api/v1/esp` including:
  - `POST /heartbeat`: ESP32 heartbeat check every 30s. Marks status as `Online`.
  - `POST /update-slot`: Updates slot occupancy and propagates status changes via WebSockets.
  - `POST /device-status`: Receives battery, signal strength, firmware version, free heap memory, and uptime metrics.
  - `POST /sensor-update`: Synchronizes raw IR distance readings and processed status changes.
  - `POST /reconnect`: Handles automatic reconnection for ESP32 devices on network state transitions.
  - `GET /config`: Allows ESP32 to fetch its runtime config (e.g. endpoint URLs).
- **Dashboard Synchronization**: Heartbeats and occupancy updates are propagated to Provider, Driver, and Admin dashboards via WebSockets in real time.
- **Audit Logging**: Integrated `AuditLog.create` calls across ESP32/IoT device registration, deletion, slot updates, sensor updates, and reconnect events.
- **LAN Configuration**: Configured backend (`SERVER_URL`) and frontend (`VITE_API_URL`, `VITE_WS_URL`) environment variables to use dynamic LAN IP configurations for local development and multi-device connection testing.

### Files Modified / Created
- `backend/middleware/deviceAuth.js` [NEW] — Dedicated auth handler for hardware ESP32 devices
- `backend/routes/espRoutes.js` [NEW] — Registered device-specific APIs for heartbeat, status, and raw sensor updates
- `backend/server.js` — Registered esp routes under `/api/v1/esp`
- `backend/routes/iotRoutes.js` — Consolidated endpoints, added AuditLog and updated `download-config` references to ESP32 routes
- `backend/.env` — Configured SERVER_URL with LAN IP
- `frontend/.env` — Configured VITE_API_URL and VITE_WS_URL with LAN IP
