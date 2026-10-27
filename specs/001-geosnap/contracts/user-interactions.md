# User Interaction Contract: GeoSnap

GeoSnap exposes a browser user interface only. It has no application API, server endpoint, account interface, or persistent data contract. The visible controls define the canonical user actions; voice commands dispatch those same actions and do not implement a separate path or bypass validation.

## Required Controls

- **Open camera**: After a visitor action, requests camera access and displays the live camera feed when available. It does not capture a still image.
- **Capture photo**: Captures a still image from the live camera feed. The capture date and time are recorded when the still image is taken.
- **Refresh location**: Requests or refreshes the current position independently of opening the camera or capturing a photo; it may complete before or after capture. A successful result updates location information only; it must never change the timestamp recorded at capture or imply that a later fix was measured at capture time. If a location result arrives after the labelled preview is ready, update both the visible preview and its embedded label with the location result while preserving the original capture timestamp. If denied or unavailable, the visitor can continue without location and receives a clear status.
- **Retake**: Discards the active labelled preview and returns to camera capture.
- **Download image**: Available only when a labelled preview is ready; saves the composed image.
- **Start voice control**: Requests microphone/speech recognition only after a visitor action. It communicates that browser speech recognition may process audio through a browser/vendor service and that processing varies by browser. It never silently listens.
- **Stop voice control**: Stops the active recognition session.

Every action available through voice also has a visible, keyboard-operable control. Both input methods invoke the same underlying action and share its state guards, progress, and error handling. Control names and status/error content must be understandable without relying on iconography or audio.

## Voice Command Grammar

Recognize only final results. Normalize casing, surrounding whitespace, and terminal punctuation, then match the complete phrase against this allowlist:

| Canonical phrase | Intent | Valid state |
|---|---|---|
| “take photo” | Capture photo | Live camera is open and no capture is in progress |
| “refresh location” | Refresh location | Capture workflow is active and no location request is in progress |
| “retake photo” | Retake | A preview-ready or downloaded photo exists and no capture transition is in progress |
| “download image” | Download | A labelled preview is ready or the active photo is already downloaded; no download is in progress |

Do not use open-ended intent classification, fuzzy matching, or interim transcripts to trigger an action. Do not execute duplicate result events more than once. If text is unclear, unlisted, duplicated, or invalid in the current state, show the recognized text when available, explain the reason, and execute no action. The voice feature is introduced only after the complete visible-control capture-to-download workflow is implemented and validated.

## Photo Lifecycle

| State | Meaning | Available actions |
|---|---|---|
| `no-photo` | No active captured image | Open camera; refresh location if desired |
| `captured-photo` | Image data and immutable capture date/time exist; final labelled composition is pending | Compose/retry preview; refresh location; retake |
| `preview-ready` | Labelled image is composed and visible | Refresh location; retake; download |
| `downloaded-photo` | Download was initiated successfully for the active preview | Download again; retake |

A failed or denied location request is a location status, not a blocking photo lifecycle state. Continue with a date/time label and explicitly indicate unavailable location. Captured date/time is recorded at capture and remains invariant as location moves from pending to available, denied, or unavailable.

## State and Error Feedback

- Show camera, location, microphone, and recognition status in visible text.
- On denied or unavailable camera access, explain the limitation and offer retry/settings guidance.
- On denied or unavailable location, allow the photo workflow to continue and identify location as unavailable in the label.
- On unsupported speech recognition or microphone denial, explain the issue and retain all manual controls.
- On rendering/download failure, preserve the preview and provide a retry action.
- Expose important status changes programmatically for assistive technology without unexpectedly moving keyboard focus.
- Never represent a missing location or unrecognized command as successful.
