# Submission Details

## Demo Video
Demo video: [Watch the demo video](https://drive.google.com/file/d/11xvngSgGIeXkQ7HfxbooZgDf290aQeUr/view?usp=sharing)

## Implementation Status
- [x] Initialized Project Foundation
- [x] Offline Message Queue
- [x] Synchronization Engine
- [x] Idempotency Handling
- [x] Retry Mechanism (Bounded Auto & Manual)
- [x] Network Simulation Mode (Offline, Slow, Temporary Failure, Lost ACK)

## Status
Implementation is complete. The project implements a durable local outbox, strict FIFO synchronization, stable client-generated message IDs, server-side idempotency, bounded automatic retry, manual retry, deterministic failure simulation, and recovery from uncertain acknowledgements. Focused mobile and backend test suites pass successfully.

## Required Design Decisions
1. **Durable outbox owner**: Client controls the lifecycle via AsyncStorage, persisting messages before network synchronization attempts.
2. **Delivery state transitions**: Pending → Sending → Delivered or Failed. A failed message can be manually retried by transitioning back to Pending and then Sending.
3. **Ordering policy**: Strict FIFO by local creation timestamp.
4. **Ordering trade-off**: Strict FIFO blocks later messages if earlier ones fail permanently, maintaining causality but reducing throughput.
5. **Connectivity-triggered synchronization**: Automatically attempts sync when the network goes online.
6. **Retryable failure policy**: Network failures increment retryCount up to a maximum limit, retaining the stable `messageId`.
7. **Retry limit**: Bound to 3 automatic retries. 
8. **Manual retry**: Resets retryCount to 0 and re-triggers the engine using the same `messageId`.
9. **Idempotency enforcement**: Server relies on MongoDB unique index `11000` collisions, treating duplicates as success.
10. **Concurrency control**: An in-memory boolean flag prevents overlapping sync loops.
11. **Production background-sync changes**: This challenge intentionally excludes OS-level background execution while the app is terminated; production apps would require OS background tasks.

## Failure Model & Phase 5 Behaviors
- **Retry Limit**: Automatic retry limit: bounded to a maximum of 3 automatic retry attempts (`MAX_AUTO_RETRIES = 3`).
- **Retryable failure policy**: Temporary network failures increment the message's `retryCount`. The engine automatically attempts a backoff retry until the limit is reached. After the limit, the state stays `failed`.
- **Manual retry behavior**: A failed message displays a `Retry` button. Pressing it resets the `retryCount` to 0, transitions the status to `pending`, and immediately re-triggers the sync engine. Critically, it sends the SAME `messageId` and does NOT create a new message.
- **Idempotency behavior**: The MongoDB backend uses the `messageId` as a strict unique index. Repeated identical IDs cause a `11000` collision which the Express server intercepts and returns as a successful duplicate, ensuring repeated requests with the same messageId resolve to a single logical database record.
- **Lost-ACK behavior**: If a message reaches the backend but the network drops the acknowledgement response, the client eventually retries. The backend's idempotency guard prevents duplication and signals success, allowing the client to safely mark it `delivered`.

## Simulation Modes
The application provides four simulation modes to verify edge cases without needing physical network manipulation. The reviewer can switch the simulation mode using the "Toggle Sim" button in the app UI.

- **NORMAL**: Normal successful backend behavior.
- **SLOW**: Introduces approximately 3 seconds of artificial delay. The message remains visibly in the `sending` state before the normal response.
- **TEMPORARY_FAILURE**: Simulates a temporary backend/network failure, demonstrating bounded automatic retry and recovery.
- **LOST_ACK**: The backend successfully accepts the message, but the client intentionally treats the initial acknowledgement as lost. The retry uses the same `messageId`, the backend returns the idempotent duplicate response, and the client eventually marks the message `delivered`. Only one logical backend message exists.

## Reviewer Demo Instructions
To test the deterministic failure simulator:
1. Tap the **Toggle Sim** button under "Backend" to cycle through the simulation modes (`NORMAL` → `SLOW` → `TEMPORARY_FAILURE` → `LOST_ACK`).
2. Observe `SLOW` mode by sending a message and watching it remain in `Sending` for 3 seconds before delivery.
3. Observe `TEMPORARY_FAILURE` by sending a message and watching it bounce through bounded retries and halt at `Failed`. Restore to `NORMAL` and tap the manual **Retry** button to see it successfully deliver.
4. Observe `LOST_ACK` by sending a message and observing it automatically recover via the duplicate handling.

## Acceptance Criteria Verification

AC1 Offline send
Result: Pass
Evidence: Verified manually in browser UI and programmatically in `syncEngine.test.js` (offline mode prevents synchronization test).

AC2 Force-close durability
Result: Pass — persistence behavior verified; OS-level force-close automation was not performed.
Evidence: Verified manually via browser reload/reopen and programmatically through outboxStorage.test.js, which verifies persistence through AsyncStorage.

AC3 Reconnection synchronization
Result: Pass
Evidence: Verified through the application simulation by queuing messages while offline, restoring online mode, and observing synchronization. The corresponding syncEngine.test.js test verifies that transitioning to online triggers synchronization.

AC4 Temporary failure/retry
Result: Pass
Evidence: Verified manually using TEMPORARY_FAILURE simulation and programmatically in syncEngine.test.js. Automatic retry is bounded and the message remains recoverable through manual retry after reaching the configured limit.

AC5 Uncertain acknowledgement/idempotent retry
Result: Pass
Evidence: Verified manually using the LOST_ACK simulation and programmatically through backend idempotency tests. The backend accepts the original message, the client simulates a lost acknowledgement, and the retry with the same messageId resolves to the existing logical message.

## Verification Benchmark

1. Start MongoDB.
2. Start the backend (`node server.js`).
3. Start the Expo web application (`npm run web`).
4. Ensure the simulation mode is set to **NORMAL** initially.
5. Toggle the network mode to **OFFLINE** in the UI.
6. Send at least 10 messages.
7. Verify all 10 appear immediately and are marked **Pending**.
8. Reload/reopen the browser application while still offline.
9. Verify all 10 messages and their **Pending** states are restored from AsyncStorage.
10. Toggle the simulation mode to **TEMPORARY_FAILURE**.
11. Toggle the network mode to **ONLINE**.
12. Observe the temporary failure and bounded automatic retry behavior across the queued messages, noting that strict FIFO prevents later queued messages from bypassing an earlier failed message.
13. Restore simulation mode to **NORMAL** and allow synchronization to complete.
14. Toggle the simulation mode to **LOST_ACK**.
15. Send one new message while online.
16. Observe the initial acknowledgement-lost failure.
17. Observe automatic retry after the configured retry delay.
18. Verify the same message becomes **Delivered**.
19. Verify the backend contains exactly one logical record for that `messageId`.
20. Verify the 10 queued messages were synchronized in documented FIFO order using their client creation timestamps and backend records.
21. Confirm no duplicate logical records exist for the benchmark messages.

*(Note: Browser reload/reopen was manually verified; OS-level force-close automation was not performed. Durable persistence is covered by the persistence tests. The benchmark can be performed directly through the application's simulation controls without physically disconnecting the computer's network.)*

## Key Files Created / Modified
- `/mobile/src/sync/syncEngine.js` (NEW)
- `/mobile/src/services/messageApi.js` (NEW)
- `/mobile/src/config.js` (NEW)
- `/mobile/src/__tests__/syncEngine.test.js` (NEW)
- `/mobile/src/storage/outboxStorage.js` (MODIFIED)
- `/mobile/src/services/messageService.js` (NEW)
- `/mobile/src/__tests__/outboxStorage.test.js` (NEW)
- `/mobile/App.js` (MODIFIED)
- `/mobile/jest.config.js` and `babel.config.js` (NEW)

## Dependencies Installed
- Backend runtime: express, cors, dotenv, mongoose
- Backend testing: jest, supertest, mongodb-memory-server
- Mobile runtime: Expo, React Native, @react-native-async-storage/async-storage, uuid, react-native-get-random-values
- Mobile testing/build: Jest and the Expo/Babel Jest configuration packages defined in package.json

## Commands to Run
**Mobile**:
```sh
cd mobile
npm start
```

**Mobile Tests**:
```sh
cd mobile
npx jest --verbose
```
*(Result: 2 suites, 16 tests passed)*

**Backend**:
```sh
cd backend
node server.js
```

**Backend Tests**:
```sh
cd backend
npm test
```
*(Result: 1 suite, 5 tests passed)*

## Setup Issues
None encountered so far.

## Architecture Decisions Made (Foundation)
- Separate `/mobile` and `/backend` directories for clean separation of concerns.
- Use ES Modules for the backend to maintain consistency with the JavaScript ecosystem used in React Native.
- Basic health endpoint to verify backend connectivity.
- Minimal bare Expo template to avoid unnecessary complexity, adhering to assessment guidelines.
