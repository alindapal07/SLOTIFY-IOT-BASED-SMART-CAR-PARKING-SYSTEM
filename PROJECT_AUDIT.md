# Smart Parking Project Audit

This document serves as the Lead Software Architect's complete analysis and source of truth for the AI Smart Parking Marketplace application.

---

## 1. Existing Project Architecture
The project is built as a decoupled client-server web application:
- **Backend**: Monolithic Node.js and Express server. It exposes REST API endpoints for user authentication, parking slots management, wallet billing, vehicle management, and mock AI/IoT features. It supports real-time dual-communication via Socket.io.
- **Frontend**: A React Single Page Application (SPA) bundled with Vite. It communicates with the backend via Axios and integrates Leaflet for interactive map rendering.
- **Background Tasks**: Employs Inngest for asynchronous, event-driven background job processing (such as sending verification emails via Nodemailer).

---

## 2. Folder Structure
```
Smart Parking/
├── backend/
│   ├── config/            # Mongoose and Database configurations
│   ├── controllers/       # Controller logic separating Express routing from business logic
│   ├── inngest/           # Event-driven background tasks (client setup)
│   ├── middleware/        # Authentication and authorization guards
│   ├── models/            # Mongoose Schemas (User, ParkingZone, ParkingSlot, Booking, etc.)
│   ├── routes/            # Express router definitions
│   ├── services/          # Supporting services (Nodemailer, etc.)
│   ├── sockets/           # Socket.io connection and real-time event definitions
│   ├── server.js          # Entry point for the Express backend
│   └── seed.js            # Initial mock database seed script
├── frontend/
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── assets/        # Visual design assets and styles
│   │   ├── components/    # Reusable UI component blocks (Navbar, BottomNav)
│   │   ├── i18n/          # Translation assets (JSON) and custom translation context
│   │   ├── pages/         # Page components grouped by role (driver, provider, admin, public)
│   │   ├── services/      # Axios API instance and Socket client definition
│   │   ├── store/         # Zustand global state store
│   │   ├── App.jsx        # Routing and layout initialization
│   │   └── main.jsx       # React DOM entry point
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
```

---

## 3. Tech Stack
- **Backend Runtime**: Node.js
- **Backend Framework**: Express.js
- **Database**: MongoDB (via Mongoose ODM)
- **Real-Time Communication**: Socket.io
- **Background Job Orchestration**: Inngest
- **E-Mail Services**: Nodemailer
- **Frontend library**: React.js (v19)
- **Frontend Build Tool**: Vite (v8)
- **Styling**: Tailwind CSS (v3) & Framer Motion
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Maps**: Leaflet & React-Leaflet

---

## 4. Existing Modules
1. **Authentication**: Password registration, credentials login, 2FA, OTP verification, and MPIN verification.
2. **Parking Zone/Slot Marketplace**: Geolocation-based searching, zone listings, and live maps.
3. **Booking Flow**: Slot reservations, payments, and checkout calculations.
4. **IoT Integrations**: Simulation of boom barrier gate scanning.
5. **AI Predictions & Analytics**: Occupancy forecasting, pricing recommendations, sentiment checks, and scoring.
6. **Wallet**: Top-ups and debit transactions.
7. **Vehicle Management**: Adding and tracking driver vehicle plates.
8. **Feedback**: Rating zones and posting reviews.
9. **Admin Panel**: Role management and slot approval dashboard.
10. **Localization (i18n)**: Translation mapping for 10 languages (English, Hindi, Bengali, Marathi, Punjabi, Tamil, Telugu, Kannada, Gujarati, Malayalam).

---

## 5. Completed Modules
- **Wallet & Transactions**: Top-up system, balance management, and transaction history tracking.
- **Vehicle Profiles**: Fully functional adding, removing, and listing of driver vehicles.
- **Internationalization (i18n)**: Reusable language switcher supporting 10 languages via a simple Context Provider.
- **Admin Actions**: Role management, zone listings, and approval buttons.

---

## 6. Partially Completed Modules
- **Provider Dashboard**: Sidebar tabs are set up (Overview, My Zones, Earnings History, IoT Devices), but most tabs display the generic zone lists; no separate dashboard view exists for tracking IoT devices or details.
- **Mobile Navigation**: The `BottomNav.jsx` component has a menu item for "AI Intelligence" but is missing its Lucide icon.

---

## 7. Missing Modules
- **Real IoT hardware interface**: Built exclusively on mock Socket.io intervals.
- **Production Payment Gateway**: Recharges and bookings are settled against dummy wallet credits (INR) stored inside MongoDB.
- **Refresh Token mechanism**: JWT authentication uses only a 30-day access token without a refresh model.

---

## 8. Broken Modules
- **AI Global Endpoint Crashes**: The endpoints `/ai/forecast/global`, `/ai/traffic/global`, and `/ai/parking-score/global` are broken. The backend expects a valid 24-character Mongoose ObjectId for `zoneId`, but the client passes the string `"global"`. This triggers a CastError (`Cast to ObjectId failed`) and returns 500 status codes.

---

## 9. Dummy APIs
All AI-labeled features are mocked:
- `/api/v1/ai/forecast/:zoneId`: Random number predictions.
- `/api/v1/ai/evaluate-pricing`: Hardcoded demand pricing updates generated via `Math.random()`.
- `/api/v1/ai/heatmap`: Simple capacity ratio calculation.
- `/api/v1/ai/recommend`: Scoring zones via an arbitrary mathematical equation.
- `/api/v1/ai/theft-check`: Anomaly score simulated using random variables.
- `/api/v1/ai/traffic/:zoneId`: Returns mock traffic levels (`GRIDLOCK`, `HIGH`, etc.) using random indexes.
- `/api/v1/ai/sentiment`: Standard list of positive/negative keywords checked via Javascript string includes (BERT model details are a placeholder).
- `/api/v1/ai/ev-slots/:zoneId`: Returns random arrays.
- `/api/v1/ai/parking-score/:zoneId`: Generates random scores.
- `/api/v1/iot/scan-qr`: Returns hardcoded barrier open command (`OPEN_BARRIER`).

---

## 10. Mock Data
- **Seeding script (`seed.js`) discrepancy**: The seed script registers zones stating `totalSlots: 50` or `100`, but inserts exactly 10 slots per zone into the database, leading to potential data inconsistency issues.
- **Dummy IoT client intervals**: Simulated Socket.io intervals emit random slots changing occupancy state every 10 seconds.

---

## 11. Backend Routes
- **Auth**: `/api/v1/auth` (`/register`, `/login`, `/set-mpin`, `/verify-mpin`, `/forgot-password`, `/reset-password`, `/send-2fa`, `/verify-2fa`, `/upgrade`)
- **Parking**: `/api/v1/parking` (`/search`, `/zones/all`, `/zones/me`, `/zones/:id/slots`, `/zones` [POST])
- **Bookings**: `/api/v1/bookings` (`/my`, `/active`, `/initiate`, `/:id/cancel`, `/:id/complete`)
- **Wallet**: `/api/v1/wallet` (`/`, `/transactions`, `/topup`)
- **Vehicles**: `/api/v1/vehicles` (`/`, `/` [POST], `/:id` [DELETE])
- **Admin**: `/api/v1/admin` (`/stats`, `/users`, `/users/:id/role` [PUT], `/zones/pending`, `/zones`, `/zones/:id/approve` [POST], `/zones/:id` [DELETE], `/zones/:id/pricing` [PUT], `/bookings`)
- **AI**: `/api/v1/ai` (`/forecast/:zoneId`, `/evaluate-pricing`, `/heatmap`, `/recommend`, `/theft-check`, `/traffic/:zoneId`, `/sentiment`, `/ev-slots/:zoneId`, `/parking-score/:zoneId`)
- **Feedback**: `/api/v1/feedback` (`/`, `/zone/:zoneId`)
- **IoT**: `/api/v1/iot` (`/scan-qr` [POST])

---

## 12. Database Schemas
1. **User**: `fullName` (str), `email` (str, unique), `password` (str, hashed), `role` (enum: DRIVER, PROVIDER, ADMIN), `isPremium` (bool), `walletId` (ref), `score` (num), `mPin` (str), `mPinExpires` (date), `twoFactorEnabled` (bool), `twoFactorCode` (str), `twoFactorExpires` (date), `resetPasswordOtp` (str), `resetPasswordExpires` (date).
2. **ParkingZone**: `providerId` (ref), `name` (str), `address` (str), `location` (Point [lng, lat]), `basePricePerHour` (num), `dynamicPricingMultiplier` (num), `totalSlots` (num), `availableSlots` (num), `vehicleTypesAllowed` (arr), `isApproved` (bool), `rating` (num), `totalRatings` (num), `amenities` (arr), `operatingHours` (str). Index: `2dsphere` on location.
3. **ParkingSlot**: `zoneId` (ref), `slotIdentifier` (str), `isOccupied` (bool), `isEV` (bool), `currentBookingId` (ref).
4. **Booking**: `userId` (ref), `zoneId` (ref), `slotId` (ref), `vehicleId` (ref), `vehiclePlate` (str), `status` (enum: Pending, Confirmed, Active, Completed, Cancelled), `startTime` (date), `endTime` (date), `actualEndTime` (date), `totalCost` (num), `fineAmount` (num), `qrCodeData` (str), `hours` (num).
5. **Wallet**: `ownerId` (ref), `ownerType` (enum: User, Provider), `balance` (num), `currency` (str).
6. **Transaction**: `walletId` (ref), `userId` (ref), `type` (enum: credit, debit), `category` (enum: booking_payment, fine, refund, topup, reward, provider_earning, system), `amount` (num), `description` (str), `balanceAfter` (num), `relatedBookingId` (ref).
7. **Vehicle**: `userId` (ref), `make` (str), `model` (str), `licensePlate` (str, unique), `vehicleType` (enum: Car, SUV, EV, Motorcycle, Truck), `isEV` (bool), `color` (str).
8. **Feedback**: `bookingId` (ref), `userId` (ref), `zoneId` (ref), `rating` (num), `comments` (str), `sentimentLabel` (str).

---

## 13. Authentication Flow
Currently:
1. User enters Email + Password.
2. If credentials match, backend initiates a 2FA flow, generates a code, saves it to database with an expiry, sends it via Inngest + Nodemailer, and informs client.
3. Client displays 2FA verification panel.
4. User enters 2FA OTP.
5. If OTP is correct and not expired, backend issues a JWT token.
6. Local storage stores user details and the token. JWT token is passed in the authorization header (`Bearer <token>`).
7. MPIN can also be registered to skip password login but currently handles authentication by directly checking the hashed MPIN.

---

## 14. Dashboard Status
- **Driver**: Fully operational dashboard displaying active bookings, live remaining hours, navigation triggers, wallet stats, recent history, and a premium banner.
- **Provider**: Basic list of zones and earnings, but has visual placeholders and non-working navigation tabs.
- **Admin**: Functional tables listing all registered users and pending zones.

---

## 15. Marketplace Status
- Displays live Leaflet map.
- Automatically queries location coordinates (with a fallback).
- Fetches nearby zones using a `$near` geospatial query.
- Places pricing markers on the map, including a surge icon overlay.
- Opens detail sidebars to specify hours and select slots.

---

## 16. Booking Flow
1. Geolocation search on Leaflet Map.
2. Select Zone -> Select Slot -> Set Booking Hours.
3. Call `/bookings/initiate`:
   - Checks if slot is free.
   - Calculates dynamic/surge costs.
   - Validates that wallet balance contains sufficient funds.
   - Generates Base64 QR code data payload.
   - Freezes slot (`isOccupied` -> true, `currentBookingId` set).
   - Deducts funds from driver's wallet and logs debit transaction.
   - Decrements `availableSlots` on zone.
   - Fires Socket.io real-time update.
4. Call `/bookings/:id/complete` (Checkout):
   - Computes overtime fees (₹2/minute past target).
   - Frees slot and increments `availableSlots` on zone.
   - Credits provider's wallet and logs credit transaction.
   - Fires Socket.io update.

---

## 17. QR System
A mock validation system. Booking metadata is stringified and encoded into a Base64 string (`qrCodeData`). This string is verified at simulated IoT scanner endpoint `/iot/scan-qr`.

---

## 18. AI Implementation
No real machine learning models exist. Simple mathematical functions and random outputs emulate prediction pipelines.

---

## 19. IoT Implementation
A simulated socket protocol. The server listens for `IOT_DEVICE_CONNECT` and `START_DUMMY_DATA` to simulate random slot toggles.

---

## 20. Responsiveness Issues
- **Map Page Side Panel**: Pushed to the bottom of the screen on mobile, resulting in overlap with the leaflet view and scroll glitches.
- **Vite Boilerplate Elements**: Dead CSS rules inside `App.css` cause margin problems and styling inconsistencies.

---

## 21. Performance Bottlenecks
- **No Pagination**: Admin collections `/admin/users` and `/admin/bookings` fetch entire datasets on load, causing potential scaling bottlenecks.
- **Dynamic Pricing Engine Loops**: Loops through all registered zones on demand rather than caching calculations.

---

## 22. Security Issues
- **Hardcoded email credentials**: NodeMailer transporter contains a plaintext Gmail username and app password (`hfvr dsgo toiw vaoc`).
- **Authorization tokens stored in LocalStorage**: Exposed to Cross-Site Scripting (XSS) attacks.
- **IoT Endpoint Vulnerabilities**: `/iot/scan-qr` accepts public posts without checking authentication headers or device security keys.

---

## 23. Duplicate Components
- Manual updates of `localStorage` state are written throughout various component handlers (like `Login.jsx` and `App.jsx`) rather than using Zustand setters exclusively.

---

## 24. Dead Code
- Unused template classes in `App.css`.
- Legacy unused route `confirmBooking` in `bookingController.js`.

---

## 25. Unused Packages
- **Backend**: `@clerk/clerk-sdk-node`, `svix`
- **Frontend**: `@clerk/clerk-react`, `mapbox-gl`, `react-map-gl`, `tailwind-merge`, `clsx`

---

## 26. Suggested Architecture Improvements
1. **Move Secret Credentials to Environment Variables**: Centralize e-mail passwords in `.env` immediately.
2. **Refactor Auth Flow for Cookie-Based Security**: Move JWT tokens to `httpOnly` secure cookies.
3. **Resolve Global Cast Errors**: Catch non-ObjectId parameters in routing params and abort cast.
4. **Implement Global Error Handling Middleware**: Decouple error responses from controllers.
5. **Decouple Payments Logic**: Move transaction/ledger updates to a modular payment service.
