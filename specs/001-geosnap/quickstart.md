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

1. **Core workflow: capture, metadata, composition, preview, retake, and download**
   - Open the camera using the visible control and grant camera access.
   - On a mobile device with a rear camera, verify that it is preferred; verify that an alternate camera or clear recovery is available if that camera cannot be used.
   - Capture a photo and record the displayed capture date/time. Verify that this timestamp corresponds to the photo capture, not to the start or completion of GPS retrieval.
   - Grant location access. Verify a successful location fix can be added independently without changing the captured date/time.
   - Check that the canvas-composed preview displays the captured date, local time, and readable location along the bottom.
   - Retake and capture another photo; verify the prior photo/preview is replaced and the new capture time is recorded.
   - Download the labelled preview and open the saved image outside the application. Verify the label is embedded and readable.
2. **Location denied or GPS unavailable**
   - Deny location access or disable location services, then capture a photo.
   - Verify capture, composition, preview, retake, and download remain available without location.
   - Verify the label/status clearly says that location is unavailable and that any later location attempt does not alter capture date/time.
3. **Lifecycle state guards**
   - Before capture, verify preview, retake, and download are unavailable or clearly inactive.
   - After capture but before composition completes, verify the photo is represented as captured but not preview-ready or downloadable.
   - After preview composition, verify retake and download are available.
   - After successful download, verify the photo is represented as downloaded while the preview remains available for another download or retake.
4. **Embedded image download**
   - Download a labelled preview and open the saved image outside the application.
   - Verify the label is part of the image and remains readable.
5. **Voice commands (after core workflow validation)**
   - In a supported browser, read the voice-processing disclosure and explicitly start voice control.
   - Test “take photo”, “refresh location”, “retake photo”, and “download image” in their valid workflow states.
   - Verify each voice command invokes the same underlying action and state handling as its visible button; final recognized text is displayed and the action occurs only once.
   - Speak an unclear or unsupported phrase and a supported but state-invalid phrase; verify feedback appears and no unrelated action occurs.
6. **Speech unsupported or microphone denied**
   - Test in a browser without speech recognition or deny microphone permission.
   - Verify a helpful message appears and visible controls still complete the photo workflow.
7. **Camera denied or unavailable**
   - Deny camera permission or test without a camera.
   - Verify clear settings/retry guidance is shown and the page does not appear to be capturing.
8. **Responsive and accessible controls**
   - Test portrait and landscape layouts at 320 CSS pixels and wider.
   - Verify no horizontal overflow, controls are keyboard-operable and labeled, and status/error changes are announced or otherwise available to assistive technology.
9. **Privacy boundary**
   - Inspect application network traffic during capture and location use; confirm no application-operated endpoint receives photos or coordinates.
   - Verify the app does not directly store or upload raw audio. Browser/vendor-managed Web Speech processing is outside the app's network boundary and may differ by browser; ensure the disclosure is visible before voice use.

## Expected Outcome

All supported manual photo workflows complete without login or backend access. Voice control works only where the browser supports it and permission is granted; otherwise, the application explains the limitation and the visible controls continue to work. Any failed operation preserves unaffected workflow state and gives a clear next action.

For detailed transient entities and state transitions, see [data-model.md](./data-model.md). For exact voice intents and UI behavior, see [contracts/user-interactions.md](./contracts/user-interactions.md).
