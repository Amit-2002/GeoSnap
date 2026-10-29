# Tasks: GeoSnap

**Input**: Design documents from `/specs/001-geosnap/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: No automated test tasks are included because the specification does not request a test-first workflow or a test framework. Each story includes a manual independent validation criterion; finish with the scenarios in `quickstart.md`.

**Organization**: Tasks are grouped by user story. The planned dependency order places User Story 3 before User Story 2: despite voice being P2 and retake/download P3 in the specification, voice is explicitly planned only after the full capture-to-download workflow is complete.

## Phase 1: Setup

**Purpose**: Initialize the minimal static client-only application structure.

- [ ] T001 Create the static application entry files `index.html`, `styles.css`, and `src/app.js` at the repository root, with no framework, build dependency, backend, or package manifest.

---

## Phase 2: Foundational

**Purpose**: Establish the shared accessible page shell and workflow state used by every story.

- [ ] T002 Add the semantic GeoSnap page shell, explicit camera/capture/location/retake/download controls, live-preview and labelled-preview regions, and a programmatically announced status/error region in `index.html`; link `styles.css` and load `src/app.js` as a browser module.
- [ ] T003 Define the single-active-photo state and shared guarded action/status handling in `src/app.js`, using the lifecycle states `no-photo`, `captured-photo`, `preview-ready`, and `downloaded-photo` plus transient operation/error states described in `specs/001-geosnap/data-model.md`.

**Checkpoint**: The static page loads without a build step, and the shared state can represent the complete planned photo lifecycle.

---

## Phase 3: User Story 1 - Capture and Label a Photo (Priority: P1)

**Goal**: Capture a still photo, fix its capture timestamp at capture time, associate optional location independently, and produce a labelled preview.

**Independent Test**: In a secure-context browser with camera and location available, open the live camera, capture a photo, and verify a preview with its capture date/time and readable GPS coordinates. Also let a GPS result arrive after preview creation and verify both the visible preview and embedded label update while the original capture date/time remains unchanged.

### Implementation for User Story 1

- [ ] T004 [US1] Implement the visitor-triggered Open camera and Capture photo controls in `index.html`, ensuring camera opening only displays the live feed and Capture photo remains unavailable until the feed is ready.
- [ ] T005 [US1] Implement camera permission and live-feed startup in `src/app.js`, preferring the rear-facing camera on mobile while allowing a generic-camera fallback when that preference is unavailable.
- [X] T006 [US1] Implement still capture in `src/app.js`, recording `capturedAt` at the instant the photo is taken and transitioning to `captured-photo`; do not derive or reset this timestamp from any location request/result.
- [ ] T007 [US1] Implement visitor-triggered location refresh in `src/app.js` so it can start and complete before or after capture, records location status and result time separately, and allows the photo workflow to continue when permission is denied or GPS is unavailable.
- [X] T008 [US1] Compose the photo and bottom metadata label into a canvas-backed preview in `src/app.js`; display the capture date/time and available coordinates, clearly label unavailable location, and recompose both preview and embedded label if a location result arrives after preview readiness without changing `capturedAt`.
- [X] T009 [P] [US1] Implement the clean responsive camera and labelled-preview layout in `styles.css`, supporting portrait/landscape and viewport widths from 320 CSS pixels without horizontal overflow.

**Checkpoint**: Camera capture, immutable capture time, optional asynchronous GPS, canvas composition, and the labelled preview work through visible controls without voice recognition.

---

## Phase 4: User Story 3 - Review, Retake, and Download a Photo (Priority: P3; prerequisite to voice)

**Goal**: Let the visitor discard a preview, capture a replacement, and save the complete composed image.

**Independent Test**: With a labelled preview, retake and capture a different photo, then download it. Verify the old preview is replaced, the new timestamp belongs to the new capture, and the downloaded image visibly contains the same complete label.

### Implementation for User Story 3

- [X] T010 [US3] Implement Retake in `src/app.js` and expose its state-guarded control in `index.html`, discarding the active photo and labelled preview and returning to live camera capture.
- [X] T011 [US3] Implement Download image in `src/app.js` and `index.html`, initiating a browser download of the composed preview with its label embedded; transition to `downloaded-photo` when the browser download is initiated (do not represent this as confirmation that the file was saved), and preserve the preview with actionable retry feedback if initiation fails.

**Checkpoint**: The complete visible-control capture-to-download journey, including retake, is functional and validated before voice work begins.

---

## Phase 5: User Story 2 - Control GeoSnap with Voice (Priority: P2; starts after User Story 3)

**Goal**: Add optional browser speech commands that display recognized text and invoke the same guarded actions as visible controls.

**Independent Test**: After the manual photo workflow is complete, use a supported browser with microphone permission to issue all four supported commands in valid states. Verify displayed recognition and exactly one corresponding action; unclear, unsupported, duplicate, or state-invalid input performs no action.

### Implementation for User Story 2

- [X] T012 [US2] Add explicit Start voice control and Stop voice control actions in `index.html` and `src/app.js`, feature-detecting supported Web Speech recognition implementations and displaying the browser/vendor audio-processing disclosure before listening begins.
- [X] T013 [US2] Implement final-result-only voice normalization and the existing full-phrase allowlist (`take photo`, `refresh location`, `retake photo`, `download image`) in `src/app.js`; route each intent through the same action functions as its visible control, reject duplicate results, and enforce the contract's current-state guards.
- [X] T014 [US2] Display recognized text and listening/unclear/unsupported/permission/error statuses through the shared status region in `src/app.js`; ensure unclear, unsupported, duplicate, or state-invalid speech never triggers an unrelated action.

**Checkpoint**: Voice is an optional enhancement over the completed manual workflow and cannot bypass its action validation or error handling.

---

## Phase 6: User Story 4 - Recover from Unavailable Features (Priority: P4)

**Goal**: Keep GeoSnap understandable and usable when device permissions, browser capabilities, or operations fail.

**Independent Test**: Deny or simulate unavailable camera, location, microphone, speech recognition, and download capabilities. Verify each failure is explained with a retry or alternative where appropriate, and unaffected visible controls remain usable.

### Implementation for User Story 4

- [X] T015 [US4] Complete camera and location denial, unavailable-device, cancellation, and retry messaging in `src/app.js` and `index.html`; never present a fabricated location and never block date/time capture, preview, retake, or download when location is missing.
- [X] T016 [US4] Complete unsupported speech, microphone denial, unclear-command, and interrupted-recognition recovery in `src/app.js` and `index.html`, retaining visible manual controls in every case.
- [X] T017 [US4] Complete accessible status/error presentation and keyboard operation for all controls in `index.html` and `styles.css`, including responsive feedback at narrow/mobile viewports and without unexpected focus movement.

**Checkpoint**: Camera, location, microphone, speech, composition, and download failures provide clear feedback while preserving unaffected workflows.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the privacy boundary and validate the integrated experience.

- [X] T018 [P] Confirm the client-only implementation in `src/app.js` and `index.html` stores photo/metadata only for the active page session and does not send captured photos, location, or raw audio to an application-operated service.
- [X] T019 Run and record manual validation results in `specs/001-geosnap/quickstart.md`, noting the browser and device, camera/location/microphone permission outcomes and failures, a GPS refresh completing after preview creation (verify both preview and embedded label update without changing capture date/time), and readability of the label in the downloaded image; record download initiation rather than claiming the browser confirmed the file was saved.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; creates the static entry files.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user-story implementation.
- **User Story 1 (Phase 3)**: Depends on Foundation; establishes the camera, capture, metadata, and preview actions.
- **User Story 3 (Phase 4)**: Depends on User Story 1; completes the core retake/download workflow.
- **User Story 2 (Phase 5)**: Depends on User Stories 1 and 3. This deliberate dependency overrides numeric priority order because the plan requires voice only after the complete photo workflow is ready.
- **User Story 4 (Phase 6)**: Depends on the underlying camera/location/download/voice paths being present; recovery work can then be checked across those capabilities.
- **Polish (Phase 7)**: Depends on all desired stories being integrated.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundation; no story dependency.
- **User Story 3 (P3)**: Requires User Story 1's captured image and labelled preview.
- **User Story 2 (P2)**: Requires the complete User Story 1 and User Story 3 action paths so voice can invoke the same actions.
- **User Story 4 (P4)**: Applies across the completed workflows and follows their core functionality.

### Parallel Opportunities

- T009 (responsive styling in `styles.css`) can proceed alongside the independent `src/app.js` workflow tasks after the page shell exists.
- Privacy review T018 can proceed in parallel with the final manual validation T019 after all stories are integrated.
- Most application behavior tasks touch the shared `src/app.js` state and should remain sequential to avoid conflicting edits.

---

## Parallel Example: User Story 1

```text
After T002 establishes the page shell:
Task: T009 responsive camera and preview styling in styles.css
Task: Implement camera, capture, location, and composition sequentially in src/app.js (T005-T008)
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundation.
2. Complete User Story 1: open camera, capture with immutable date/time, resolve optional GPS independently, compose canvas label, and preview.
3. Stop and validate with location both available and unavailable, including a delayed location result.
4. Add User Story 3 retake and download to complete the essential visitor journey.
5. Add User Story 2 voice only after the complete manual capture-to-download path is working.
6. Complete User Story 4 recovery/accessibility coverage and run the full quickstart.

### Incremental Delivery

1. Setup + Foundation → static page and lifecycle state ready.
2. User Story 1 → photo with capture-time label and optional location; validate independently.
3. User Story 3 → retake and downloadable embedded label; validate core workflow.
4. User Story 2 → optional voice commands using the same actions.
5. User Story 4 + Polish → denied/unavailable capability handling, accessibility, privacy, and full validation.

## Notes

- Every task uses the required checkbox, sequential ID, optional `[P]`, story label for story phases, and explicit file path.
- Automated test tasks are omitted because tests are optional and were not explicitly requested; validation is specified in each story and in `quickstart.md`.
- Do not add a package manifest, framework, backend, external paid API, or app-operated speech service.
- Voice recognition is added only after the complete manual capture, metadata, canvas composition, preview, retake, and download workflow.
