# Implementation Plan: GeoSnap

**Branch**: `001-geosnap` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-geosnap/spec.md`

## Summary

GeoSnap is a mobile-friendly, client-only web application for capturing a photo, recording its capture date and time at the instant of capture, associating an optional GPS result that may arrive separately, composing metadata into a bottom-of-image label, previewing and downloading the result, and optionally controlling the same actions by voice. A denied permission or unavailable GPS fix leaves the visitor able to continue without location, with that absence clearly indicated. Build and validate the complete photo workflow first: capture, timestamp and optional location handling, canvas composition, preview, retake, and download. Add voice recognition only after those button-driven actions work, and route voice intents through the same action logic. Retain the client-only architecture and use plain HTML, CSS, and vanilla JavaScript; no framework, backend, paid API, or app-operated external service is needed. Browser speech recognition may process audio through a browser/vendor service, so disclose this variability before voice recognition is enabled.

## Technical Context

**Language/Version**: HTML Living Standard, CSS, and vanilla JavaScript (ES modules where useful; no build-time framework).

**Primary Dependencies**: Browser capabilities only: `MediaDevices.getUserMedia` for camera access, Geolocation for coordinates, Web Speech API when available, and browser image rendering/download capabilities. Speech recognition is optional and feature-detected at runtime.

**Storage**: In-memory state for the active capture and metadata; no accounts, server storage, or persistent browser storage. The visitor explicitly initiates any image download.

**Testing**: Manual browser/device validation using the scenarios in [quickstart.md](./quickstart.md). No test runner or application source exists in the repository at planning time; avoid adding tooling until implementation requirements justify it.

**Target Platform**: Current mainstream desktop and mobile browsers in a secure context (HTTPS in deployment; localhost for development). Camera and location capability depends on browser, device, permission, and deployment policy. Speech recognition has limited and inconsistent browser support.

**Project Type**: Static, client-side web application.

**Performance Goals**: Meet the specification outcomes: display completed voice recognition text within 3 seconds after speech ends in at least 95% of tested interactions; show permission or availability failures within 5 seconds; maintain usable layout at widths of 320 CSS pixels and above. Image capture and rendering should remain responsive for typical device camera output.

**Constraints**: Prefer the mobile rear camera without making it mandatory; explain and handle permission denial and unavailable APIs; use explicit user actions for camera/location/voice; accept only final, allowlisted, state-valid voice commands; provide equivalent visible controls; embed the label in the downloaded image; do not add application-operated data or speech services. Browser speech recognition may send audio to a browser/vendor service outside GeoSnap's control, so disclose this before voice use and do not claim on-device-only processing. No frontend framework, login, backend, paid APIs, or external AI service integration.

**Scale/Scope**: Single visitor and one active photo workflow per browser session. Prioritize a complete photo workflow before adding four voice command intents that reuse its actions. No user accounts, shared data, or server APIs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The repository's constitution file contains only unfilled template placeholders; it defines no ratified project principles, gates, or governance constraints to enforce. Apply the explicit feature constraints instead: keep the solution client-only and framework-free, preserve privacy boundaries, and avoid unnecessary complexity.

**Pre-research gate**: PASS — no actionable constitutional rules are present, and the feature constraints are internally implementable.

**Post-design gate**: PASS — the design uses browser-native capabilities and one static application, has no backend or persistence layer, and keeps voice optional with manual controls available. The speech privacy disclosure addresses variability in browser-managed recognition without adding a remote service.

## Project Structure

### Documentation (this feature)

```text
specs/001-geosnap/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── user-interactions.md
└── tasks.md              # Created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
index.html                # Accessible page structure and user controls
styles.css                # Responsive visual presentation
src/
└── app.js                # Camera, location, composition, download, and voice workflow
```

**Structure Decision**: The repository currently contains only Spec Kit configuration, skills, and feature documents; there is no existing application structure or dependency manifest. Use a minimal static web application at the repository root with one JavaScript entry point. Keep the application cohesive and split files only if implementation or testing demonstrates a clear need. No server, API contract, framework, or build system is planned.

## Delivery Order

1. Implement and validate the visible-control photo workflow end to end: camera capture; immutable capture date/time; optional, separately resolving GPS location; canvas composition; labelled preview; retake; and downloaded image.
2. Verify denied or unavailable location produces a clearly labelled no-location result and does not block preview, retake, or download.
3. Add optional voice recognition only after the core flow is complete. Voice commands must call the same underlying action functions as the visible controls and must be gated by the current workflow state.
4. Validate permission/error recovery, responsive behavior, accessibility, and voice fallback across supported and unsupported browsers.

## Complexity Tracking

No constitution violations or additional projects are proposed; no complexity justification is required.
