# Offline-Capable Mobile Conversation

## Project Purpose
This is an engineering assessment project designed to demonstrate robust offline message synchronization. 
The core problem is ensuring that mobile conversation messages are never lost during offline states, connectivity changes, app backgrounding/termination, and backend acknowledgement failures.

## Technology Stack
- **Mobile**: React Native with Expo (JavaScript)
- **Backend**: Node.js + Express (ES Modules)
- **Database**: MongoDB (Mongoose)
- **Local Storage**: AsyncStorage (Mobile)

## Current Architecture
The repository consists of:
- `/mobile`: The Expo React Native application
- `/backend`: The Node.js Express server
- `/tests`: Test directory for root-level orchestration tests

## Durable Outbox
The mobile application implements a durable local outbox using AsyncStorage. 
This outbox is the single source of truth for unsynchronized outgoing messages. 
By persisting messages before any network request is made, we ensure that no outgoing message is lost if the application is reloaded, terminated, or if the device goes offline. The UI reads directly from this outbox rather than relying solely on ephemeral React state.


### Synchronization Architecture
The mobile application synchronizes messages using a dedicated `Sync Engine` completely separate from the UI.

**Architecture Layers:**
1. **UI**: Displays messages/state and allows simulation controls/manual retry.
2. **Durable Outbox**: Persistent local source of truth that survives application restart (via AsyncStorage).
3. **Sync Engine**: Handles strict ordering, state transitions (`pending` → `sending` → `delivered` / `failed`), bounded retry policy, and concurrency protection.
4. **API Client**: Handles HTTP communication and backend simulation toggles.
5. **Backend (Express)**: Validates incoming payloads, persists messages, and strictly enforces `messageId` uniqueness/idempotency.
6. **MongoDB**: Provides the durable server-side message storage and unique index constraints.

### Ordering Policy
- Pending messages are always synchronized in strict FIFO order, based on the local creation timestamp.
- **Trade-off**: Strict FIFO means an earlier failed message can temporarily block later messages. This simplifies ordering guarantees but can reduce throughput when one message repeatedly fails.
- **Why**: This policy ensures conversational context and temporal ordering are strictly maintained without risking causality breaks. 
- **Production Evolution**: A production system could allow later messages to progress while retaining per-message ordering metadata, but that would require a more complex ordering/reconciliation policy.

### Bounded Automatic Retry & Recovery
- The client retains the message in the durable outbox and retries boundedly up to 3 automatic attempts (`MAX_AUTO_RETRIES = 3`) with simple backoff.
- Automatic retry is bounded. After the configured limit, the message remains failed and requires manual retry via the "Retry" button.
- **Stable ID**: Manual retry and automatic retry ALWAYS reuse the original `messageId`.
- **Lost ACK Recovery**: If the backend accepts the message but the acknowledgement is lost, the client eventually retries. The backend uses the stable `messageId` as an idempotency key so repeated requests do not create duplicate logical messages, and successfully returns a duplicate/success response.

## Backend Idempotency
The backend incorporates strict server-side idempotency using the client-generated `messageId`.
- **Client owns the ID**: Generating the `messageId` locally allows the client to retry requests safely.
- **Unique MongoDB Index**: The `messageId` field in the `Message` model has a strict unique constraint.
- **Handling Duplicates**: If a message with the same ID arrives twice (e.g., due to an uncertain network acknowledgement where the first request succeeded but the client never got the response), the backend intercepts the MongoDB duplicate-key error (code 11000). It avoids inserting a duplicate document and safely returns the existing logical message to the client. The system provides idempotent logical message creation for repeated requests with the same messageId.

## How to Run Mobile
1. Navigate to the mobile directory: `cd mobile`
2. Install dependencies: `npm install`
3. Start the Expo development server: `npm start`
4. Use the Expo Go app on a physical device or a simulator to scan the QR code.
5. To run the application in a desktop web browser for testing, use: `npm run web` (or press `w` in the Expo terminal).

### Simulation Testing (Reviewer)
Use the UI controls to simulate network/backend state:
- **Go Offline / Go Online**: Verifies offline queuing and FIFO sync triggers.
- **Toggle Sim**: Rotates between `NORMAL`, `SLOW`, `TEMPORARY_FAILURE`, and `LOST_ACK`.
  - `NORMAL`: Normal successful backend behavior.
  - `SLOW`: Introduces approximately 3 seconds of artificial delay. The message remains visibly in the `sending` state before the normal response.
  - `TEMPORARY_FAILURE`: Simulates a temporary backend/network failure, demonstrating bounded automatic retry and recovery.
  - `LOST_ACK`: The backend successfully accepts the message, but the client intentionally treats the initial acknowledgement as lost. The retry uses the same `messageId`, the backend returns the idempotent duplicate response, and the client eventually marks the message `delivered`. Only one logical backend message exists.

## How to Run Backend
1. Navigate to the backend directory: `cd backend`
2. Install dependencies: `npm install`
3. Start the server: `node server.js`
4. Check health at http://localhost:3000/health

## How to Run Tests
### Mobile Tests
```sh
cd mobile
npx jest --verbose
```
*Final Result*: 2 suites, 16 tests passed.

### Backend Tests
```sh
cd backend
npm test
```
*Final Result*: 1 suite, 5 tests passed.

## Assumptions
- The assessment uses a simulated online/offline state rather than depending on physical network changes.
- `AsyncStorage` is the durable local outbox for the mobile client.
- The backend uses MongoDB and a unique index on `messageId` for idempotency.
- Authentication is intentionally out of scope.
- Only outgoing text messages are required.
- Background execution while the app is terminated is out of scope.
- FIFO synchronization is based on local `createdAt` ordering.
- A permanently failing earlier message can block later messages under the current strict FIFO policy.

## Limitations
- No production authentication/profile system.
- No push notifications.
- No attachments/audio/images.
- No background sync while the app is terminated.
- No production-grade network connectivity listener; the assessment uses simulated connectivity.
- No production observability/metrics infrastructure.
- UI is intentionally minimal and assessment-focused.
- OS-level force-close automation was not performed; durable persistence is covered through `AsyncStorage`, automated persistence/domain tests, and browser reload verification.

## AI Usage Disclosure
AI tools were used during development for implementation assistance, debugging, test generation/review, documentation assistance, and verification guidance. The repository was reviewed and tested by the candidate. The candidate is responsible for the submitted implementation and can fully explain the architecture and design decisions.

## Credibility Note

### Vehicle Rental Booking Platform

- **Problem:** Built a full-stack vehicle rental platform that allows users to browse vehicles, view vehicle details, select rental dates, and create bookings while preventing conflicting bookings. The platform also includes administrative vehicle and booking management.

- **My personal contribution:** I worked across the full stack, including the React/Tailwind frontend, Node.js/Express backend, MongoDB data models, authentication, booking logic, API integration, and deployment configuration. I was also responsible for debugging integration issues between the frontend, backend, database, and deployed services.

- **Scale / operational complexity:** This was a portfolio-level full-stack application rather than a production system with large-scale traffic. The main engineering complexity was coordinating multiple application layers and maintaining consistent booking state between the frontend, backend, and database.

- **Difficult engineering decision:** One important decision was implementing server-side date-conflict validation for bookings rather than relying only on the frontend. This was necessary because the frontend cannot reliably prevent two clients from attempting conflicting bookings at the same time.

- **Evidence:** The project source code is available in my GitHub repository:
  https://github.com/srj-sooraj/Vehicle-Rental-Platform
