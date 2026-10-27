# Research: GeoSnap

**Date**: 2026-10-27  
**Scope**: Browser capabilities and architecture decisions for a client-only photo capture and voice-control experience.

## Browser Permissions and Secure Contexts

**Decision**: Require a secure context for production camera and location features. Begin camera access only after a visitor action. Request location separately and allow capture to proceed without coordinates. Explain permission failures and provide retry/settings guidance.

**Rationale**: Browser media capture and geolocation are permission-controlled secure-context features. Camera permissions, device availability, and deployment policies can independently prevent access. Treating location as optional preserves the primary photo workflow when location is denied.

**Alternatives considered**:

- Require both camera and location before showing the capture workflow: rejected because a denied location permission should not block photo capture.
- Re-prompt continuously after denial: rejected because it is disruptive and does not resolve a browser/device permission setting.

**References**:

- [MDN: `MediaDevices.getUserMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [MDN: Geolocation Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation)

## Camera Selection and Fallback

**Decision**: Prefer the mobile rear-facing camera as a preference, not an absolute requirement. Fall back to an available camera if the preference cannot be satisfied. Do not retry camera selection to mask a permission denial. If access remains unavailable, explain how to retry or change browser/device settings.

**Rationale**: Requiring an exact outward-facing camera can make otherwise supported devices unusable. Separating a selection failure from a permission failure leads to more useful recovery messages.

**Alternatives considered**:

- Require a rear-facing camera: rejected because some devices lack one and the specification explicitly requires a fallback.
- Automatically retry all camera errors with relaxed constraints: rejected because permission denials should be reported rather than disguised as camera-selection failures.

**Reference**: [MDN: `MediaDevices.getUserMedia()` and constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

## Speech Recognition Support and Privacy

**Decision**: Treat voice control as an optional progressive enhancement. Feature-detect browser speech recognition (including prefixed implementations), require an explicit visitor action to start listening, and keep equivalent visible controls available in all browsers. Before enabling voice, disclose that recognition and audio handling are browser-provided and can vary; do not claim audio is processed only on-device.

**Rationale**: Speech recognition is not consistently supported, and standard Web Speech implementations may use a browser/vendor service for recognition. The app can avoid adding its own speech provider or directly storing/sending audio, but it cannot promise how a browser handles audio. A clear disclosure resolves this boundary without making voice a prerequisite for core functionality.

**Alternatives considered**:

- Integrate a separate speech or AI service: rejected because the initial version must not require external AI services or paid APIs.
- Promise local-only audio processing for all supported browsers: rejected because browser implementations differ and do not universally provide on-device-only recognition.
- Remove voice control: rejected because the specification requires Web Speech API voice control where supported.

**References**:

- [MDN: `SpeechRecognition`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [MDN: Using the Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [MDN: `SpeechRecognition.processLocally`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)
- [Can I Use: Speech Recognition](https://caniuse.com/speech-recognition) (support matrix checked 2026-10-27; recheck target browsers during implementation)

## Recognition Results and Command Safety

**Decision**: Process only final recognition results, normalize text conservatively, and match a small explicit command allowlist. Reject unclear, unknown, duplicate, or current-state-invalid results without executing an action. Show the recognized text and a status/error message. Keep command actions aligned with their visible controls.

**Rationale**: Interim transcripts can change as recognition proceeds. Restricting execution to final, allowlisted intents avoids triggering actions from partial or unrelated speech, while state gating prevents actions that cannot safely apply.

**Alternatives considered**:

- Execute on interim transcripts or fuzzy natural-language interpretation: rejected because a changing or ambiguous phrase could trigger an unintended capture, retake, or download.
- Let voice control bypass workflow state: rejected because, for example, there is no image to download before a preview exists.

**References**:

- [MDN: `SpeechRecognitionResult.isFinal`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionResult/isFinal)
- [MDN: `SpeechRecognitionEvent.results`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionEvent/results)

## Accessible Manual Controls and Feedback

**Decision**: Provide labeled, keyboard-operable visible controls for every supported voice action. Present listening state, recognized text, permission outcomes, and failures as visible status messages that assistive technology can discover without focus being moved.

**Rationale**: Voice cannot be the sole input mechanism, especially where speech recognition is unavailable or inaccessible. Status changes need to be perceivable without relying on sound or visual changes alone.

**Alternatives considered**:

- Voice-only operation: rejected because browser support is inconsistent and the feature specification requires button fallbacks.
- Communicate errors only through speech or transient visual styling: rejected because visitors may not hear or perceive them.

**References**:

- [WCAG 2.2: Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
- [WAI: Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/)
- [WCAG 2.2: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

## Architecture and Dependencies

**Decision**: Implement as a static client-only page using plain HTML, CSS, and vanilla JavaScript with browser-native camera, geolocation, speech-recognition, and image-rendering capabilities. Keep photo and metadata state in memory and provide no application backend or persistence.

**Rationale**: This meets the explicit scope while minimizing dependencies, data exposure, setup complexity, and deployment requirements.

**Alternatives considered**:

- Add a frontend framework, application API, database, or external image/location/speech service: rejected because none is required for the initial workflow and each adds cost or complexity.

**Dependencies**:

- A current browser that supports camera and geolocation APIs, secure-context deployment, and visitor permission.
- Web Speech API support and microphone permission only for voice control; their absence must not prevent use of visible controls.
- Browser support for rendering and saving the labelled image.
