# Data Model: GeoSnap

GeoSnap handles one active capture workflow at a time. The following entities describe transient browser-session state; none is persisted by the application. The photo capture time is fixed when the still image is taken. Location acquisition is independent and can finish before or after capture; a location result must never alter the photo's capture timestamp.

## Captured Photo

Represents one still image captured from the active camera.

| Field | Description | Validation / rules |
|---|---|---|
| `imageData` | Captured source image data held for the active workflow | Required before a labelled preview can be created |
| `orientation` | Orientation of the captured image | Preserve source orientation when rendering the preview and output |
| `capturedAt` | Instant the still image is captured | Set atomically with the capture; immutable when location resolves or refreshes |

## Capture Metadata

Represents date/time and the best available location associated with the active photo.

| Field | Description | Validation / rules |
|---|---|---|
| `capturedAt` | Capture instant | Required; copied from the photo at capture and never derived from location result timing |
| `localDate` | Human-readable local calendar date | Derived from `capturedAt` |
| `localTime` | Human-readable local time | Derived from `capturedAt`; retain local time zone context |
| `locationStatus` | `not-requested`, `pending`, `available`, `denied`, or `unavailable` | Must distinguish missing data from a valid location |
| `latitude` | GPS latitude | Present only when `locationStatus` is `available`; valid range −90 to 90 |
| `longitude` | GPS longitude | Present only when `locationStatus` is `available`; valid range −180 to 180 |
| `locationUpdatedAt` | Time the most recent location fix was measured/received | May be later than `capturedAt`; refresh may update this value without changing `capturedAt` |
| `labelText` | Readable date, time, and location/status text | Must not invent a location; includes date/time and an explicit unavailable-location indication when no fix is available |

Location may be requested separately from capture. A location fix is associated with a photo only if available for that active capture workflow; the label must not imply that a later location fix was measured at the exact capture instant. If permission is denied or GPS is unavailable, the visitor may continue with date/time and a clear indication that location is unavailable. Refreshing location while a preview exists may update the preview's location information on success, but never changes the original capture instant.

## Labelled Preview

Represents the visitor-visible final composition before download.

| Field | Description | Validation / rules |
|---|---|---|
| `photo` | Associated captured photo | Required |
| `metadata` | Metadata used to compose the label | Required |
| `renderedImage` | Composited image shown in the preview | Must visually include the source photo and readable bottom label |
| `status` | `preview-ready` or `render-error` | A rendering error preserves the captured photo and allows retry |

## Downloadable Image

Represents the visitor-initiated saved output.

| Field | Description | Validation / rules |
|---|---|---|
| `preview` | Labelled preview used as the download source | Required before download is enabled |
| `imageFormat` | Browser-supported downloadable image format | Must match the produced image |
| `downloadStatus` | `not-downloaded`, `in-progress`, `downloaded`, or `failed` | A successful visitor-initiated save marks the active photo downloaded; failure reports an actionable message and preserves the preview |

## Voice Interaction

Represents a visitor-initiated voice-recognition session and its latest result.

| Field | Description | Validation / rules |
|---|---|---|
| `recognitionStatus` | `unsupported`, `idle`, `listening`, `recognized`, `unclear`, or `error` | Listening begins only after explicit visitor action |
| `recognizedText` | Final recognized phrase when supplied by the browser | Show to the visitor; do not execute interim text |
| `commandIntent` | One supported intent or no match | Only exact normalized allowlisted phrases map to an intent |
| `executionStatus` | `not-executed`, `executed`, or `rejected` | Execute at most once and only when valid in the current workflow state |

Voice result state is transient. GeoSnap does not retain or transmit raw audio; browser-managed recognition processing may vary and must be disclosed.

## Workflow State Transitions

```text
no-photo
  -> requesting-camera
  -> live-camera
  -> capturing
  -> captured-photo
  -> composing-preview
  -> preview-ready
  -> downloading
  -> downloaded-photo

requesting-camera -> camera-error -> requesting-camera
live-camera -> camera-error
capturing -> capture-error -> live-camera
captured-photo -> composing-error -> captured-photo (retry composition)
preview-ready -> requesting-camera (retake; discard prior active photo/preview)
downloaded-photo -> requesting-camera (retake; begin a new photo workflow)
downloading -> download-error -> preview-ready (retry download)

voice: unsupported | idle -> listening -> recognized | unclear | error -> idle
```

`no-photo` means there is no active captured image. `captured-photo` means image data and its immutable capture timestamp exist, but the final labelled composition is not yet ready. `preview-ready` means the visitor can review the fully composed image. `downloaded-photo` means the visitor initiated a download for that active preview; the preview remains available and can be downloaded again or retaken.

Location permission/status is independent of the photo lifecycle. A denial or unavailable fix does not block capture, composition, preview, retake, or download; the label clearly identifies the missing location. Voice actions are permitted only when their matching visible action is valid in the current state. Permission or capability failures must leave unaffected controls usable.
