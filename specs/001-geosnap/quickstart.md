# GeoSnap Quickstart and Validation

This guide is for validating the planned application after implementation. It contains no application implementation code.

## Prerequisites

- A current mobile or desktop browser.
- A secure origin for camera and location access: use `localhost` for local development and HTTPS for deployed testing.
- A camera for capture testing; location permission and a location-capable device for GPS testing.
- A browser with Web Speech API support and a microphone for voice tests. Speech support is optional; visible controls must remain usable without it.
- Test browser/device settings that allow camera, location, and microphone permission denial and reset.

## Run Locally

1. From the repository root, serve the static application on localhost using an available static file server. For example:

   ```sh
   python3 -m http.server 8000
   ```

2. Open `http://localhost:8000` in the browser.
3. Grant or deny each requested permission as prompted, then follow the validation scenarios below.
4. For testing on a separate mobile device, use an HTTPS preview/deployment; a plain HTTP LAN address may not be treated as a secure context.

No build, package installation, login, backend, or external API key should be required.

## End-to-End Validation

Validate in the following order: complete the manual photo workflow first, then validate voice as an enhancement over those same actions.

1. **Camera permission and recovery**
   - In browser site settings, deny camera permission (or reset it and deny the prompt). Choose **Open Camera**.
   - Verify GeoSnap reports the denial and settings/retry guidance, does not present a live feed, and leaves location and other unaffected controls available.
   - Restore camera permission in site settings and choose **Open Camera** again. Verify the camera starts and **Capture Photo** becomes available only when the feed is ready.
   - On mobile with a rear camera, verify it is preferred; if it cannot be used, verify another camera is tried or clear recovery guidance is shown.
2. **Capture time and independent location timing**
   - Before capture, choose **Refresh Location** and allow the request to complete. Capture a photo and record its displayed date/time.
   - Verify the capture timestamp corresponds to the instant the photo was taken, not the earlier location request time.
   - Choose **Refresh Location** again after capture. When a valid fix is returned, verify the preview and its embedded label include the location while the original capture date/time remains unchanged.
   - To verify late resolution, capture a photo while a location request is pending, let the preview become ready first, then allow the location result to arrive. Verify both the visible preview and the subsequently downloaded image label update with the location and retain the original capture date/time.
3. **Location denied or unavailable**
   - Deny location permission, dismiss its prompt, or disable device location services, then capture a photo.
   - Verify a helpful status identifies the limitation; the label indicates missing location without fabricated coordinates.
   - Verify capture, date/time composition, preview, retake, and download remain usable without location.
   - Restore permission/services and choose **Refresh Location** to verify retry is possible. Any successful later location result must not alter capture date/time.
4. **Retake and embedded download**
   - With a labelled preview, choose **Retake Photo** and capture a different image.
   - Verify the prior preview is replaced and the replacement photo has its own capture timestamp.
   - Choose **Download Image**, then open the downloaded file outside GeoSnap. Verify the photo, date, local time, and available location (or explicit unavailable-location text) are embedded and readable at normal viewing size.
   - Treat the app's “Download initiated” message as confirmation only that the browser download was initiated, not proof the file was saved.
5. **Lifecycle state guards**
   - Before capture, verify preview, retake, and download are unavailable or clearly inactive.
   - After capture but before composition completes, verify the photo is represented as captured but not preview-ready or downloadable.
   - After preview composition, verify retake and download are available.
   - After successful download, verify the photo is represented as downloaded while the preview remains available for another download or retake.
6. **Voice commands (after core workflow validation)**
   - In a supported browser, read the voice-processing disclosure and explicitly start voice control.
   - Test “take photo”, “refresh location”, “retake photo”, and “download image” in their valid workflow states.
   - Verify each voice command invokes the same underlying action and state handling as its visible button; final recognized text is displayed and the action occurs only once.
   - Speak an unclear or unsupported phrase and a supported but state-invalid phrase; verify feedback appears and no unrelated action occurs.
7. **Unsupported speech and microphone permission**
   - Test in a browser without Web Speech recognition, if available. Verify the unsupported message appears and visible controls remain usable.
   - In a supported browser, deny microphone permission and start voice recognition. Verify GeoSnap reports the permission error, offers a retry/settings route, returns voice controls to a usable state, and leaves manual controls working.
   - If practical, revoke microphone access or interrupt recognition while it is active and verify the interruption is reported and voice can be retried.
8. **Keyboard, assistive technology, and responsive layout**
   - Use only the keyboard to traverse the page. Verify every enabled button and the disclosure checkbox can be reached and operated; disabled controls are skipped or clearly unavailable.
   - Verify focus remains visible and usable after capture, retake, camera/voice errors, and other actions; actions should not unexpectedly move focus.
   - With a screen reader, verify status/error announcements and the labelled preview's alternative text include the capture date/time and available location or its unavailable status.
   - Test portrait and landscape at 320 CSS pixels and wider. Check document `scrollWidth` against viewport `clientWidth` (or equivalent browser tooling) to confirm no horizontal overflow.
9. **Client-only privacy boundary**
   - Inspect browser network traffic during camera, location, voice, preview, and download operations. Verify application code sends no photo, coordinates, or other capture data to an application endpoint.
   - Verify photo and metadata are held only in the active page session and are not written to local/session storage, IndexedDB, cookies, or another persistent store by GeoSnap.
   - Verify the visible voice disclosure appears before voice recognition is enabled and explains that speech may be processed by the browser or its vendor and may require an internet connection. Browser/vendor-managed recognition is separate from application-operated services and may transmit audio according to that provider's behavior.

## Manual Validation Record

**Status: Partially validated.** Results marked “Passed — user-reported manual test” are confirmed by the user and were not independently observed in this workspace. “Reviewed — user-reported” records a review, not a live network or storage test. Unknown test-environment details and unconfirmed checks remain explicitly unreported or untested.

| Record field | Result |
|---|---|
| Test date | Earlier manual tests; exact date not provided |
| Browser and version | Google Chrome 156.0.8078.73 (Official Build) (x86_64) |
| Device, OS, and viewport(s) | Device model not provided; Ubuntu 24.04.5 LTS; mobile-width responsive check reported below |
| Origin (localhost or HTTPS) | `http://localhost:8000` |
| Camera allowed; capture and timestamp | Passed — user-reported manual test |
| Camera denied; recovery message; access restored and retried | Passed — user-reported manual test |
| Rear-camera preference/fallback | Not reported |
| Location refresh before and after capture | Passed — user-reported manual test |
| Late location result updates preview and embedded label without changing original timestamp | Passed — user-reported manual test |
| Location permission blocked message; photo capture remains usable | Passed — user-reported manual test |
| Location services unavailable/timeout and retry | Not reported |
| Retake and recapture | Passed — user-reported manual test |
| Download initiated; downloaded PNG opened; embedded label readable | Passed — user-reported manual test |
| Four supported voice commands and voice feedback | Passed — user-reported manual test |
| Unsupported speech-recognition browser | Not tested/reported |
| Microphone permission blocked; denial message shown | Passed — user-reported manual test: “Microphone permission was denied. Allow microphone access for this site in browser settings, then start voice recognition again or use the manual controls.” |
| Microphone permission restored; recognition retry | Passed — user-reported manual test: “Voice recognition is listening.” |
| Keyboard navigation and visible focus indicators | Passed — user-reported manual test |
| Screen-reader announcements and preview alternative text | Not tested/reported |
| Responsive layout, including mobile-width check | Passed — user-reported manual test |
| Client-only privacy boundary | Reviewed — user-reported; live network/persistent-storage inspection method not provided |
| Speech-processing disclosure | Not separately reported |
| Notes or observed failures | Not provided |

**Additional checks not reported (not required to complete T019):** device model, rear-camera preference/fallback, location services unavailable/timeout and retry, unsupported-browser behavior, screen-reader announcements/alternative text, and a separate speech-disclosure check. Keep these marked as untested unless confirmed.

## Expected Outcome

All supported manual photo workflows complete without login or backend access. Voice control works only where the browser supports it and permission is granted; otherwise, the application explains the limitation and the visible controls continue to work. Any failed operation preserves unaffected workflow state and gives a clear next action.

For detailed transient entities and state transitions, see [data-model.md](./data-model.md). For exact voice intents and UI behavior, see [contracts/user-interactions.md](./contracts/user-interactions.md).
