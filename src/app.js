export const workflowStates = Object.freeze({
  noPhoto: "no-photo",
  capturedPhoto: "captured-photo",
  previewReady: "preview-ready",
  downloadedPhoto: "downloaded-photo",
});

export const appState = {
  workflowState: workflowStates.noPhoto,
  activePhoto: null,
  captureTimestamp: null,
  locationStatus: "not-requested",
  latitude: null,
  longitude: null,
  locationUpdatedAt: null,
  locationRequestInProgress: false,
  labelledPreview: null,
  currentOperation: null,
  statusMessage: "Ready.",
  statusType: "status",
};

const allowedTransitions = {
  [workflowStates.noPhoto]: [workflowStates.capturedPhoto],
  [workflowStates.capturedPhoto]: [
    workflowStates.noPhoto,
    workflowStates.previewReady,
  ],
  [workflowStates.previewReady]: [
    workflowStates.noPhoto,
    workflowStates.downloadedPhoto,
  ],
  [workflowStates.downloadedPhoto]: [
    workflowStates.noPhoto,
    workflowStates.downloadedPhoto,
  ],
};

export function updateStatus(message, type = "status") {
  appState.statusMessage = message;
  appState.statusType = type;
}

export function transitionWorkflow(nextState) {
  const validNextStates = allowedTransitions[appState.workflowState];

  if (!validNextStates || !validNextStates.includes(nextState)) {
    updateStatus(
      `Cannot change workflow from "${appState.workflowState}" to "${nextState}".`,
      "error",
    );
    return false;
  }

  appState.workflowState = nextState;
  return true;
}

let activeCameraStream = null;

function showStatus(message, type = "status") {
  updateStatus(message, type);

  const statusElement = globalThis.document?.getElementById("app-status");
  if (statusElement) {
    statusElement.textContent = message;
  }
}

function getCameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Camera access was denied. Allow camera access in your browser settings, then try again.";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No camera was found on this device.";
  }

  return "The camera could not be started. Check your camera connection and browser permissions, then try again.";
}

function shouldRetryWithoutRearCamera(error) {
  return [
    "OverconstrainedError",
    "ConstraintNotSatisfiedError",
    "NotFoundError",
    "DevicesNotFoundError",
  ].includes(error?.name);
}

function stopStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) {
    track.stop();
  }
}

function getOrCreateVideo(previewRegion) {
  let video = previewRegion.querySelector("video");
  if (!video) {
    video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-label", "Live camera feed");
    previewRegion.replaceChildren(video);
  }

  return video;
}

function waitForVideoReady(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Camera feed did not become ready in time."));
    }, 10000);

    function cleanup() {
      clearTimeout(timeoutId);
      video.removeEventListener("canplay", checkReady);
      video.removeEventListener("error", handleError);
    }

    function checkReady() {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    }

    function handleError() {
      cleanup();
      reject(new Error("The browser could not display the camera feed."));
    }

    video.addEventListener("canplay", checkReady);
    video.addEventListener("error", handleError, { once: true });
    checkReady();
  });
}

async function openCamera() {
  const openCameraButton = document.getElementById("open-camera-button");
  const capturePhotoButton = document.getElementById("capture-photo-button");
  const previewRegion = document.getElementById("live-camera-preview");

  if (appState.currentOperation === "opening-camera") {
    return;
  }

  if (!previewRegion || !capturePhotoButton) {
    showStatus("The camera preview is unavailable on this page.", "error");
    return;
  }

  const mediaDevices = globalThis.navigator?.mediaDevices;
  const getUserMedia = mediaDevices?.getUserMedia;
  if (typeof getUserMedia !== "function") {
    if (globalThis.isSecureContext === false) {
      showStatus(
        "Camera access requires a secure page. Use HTTPS or localhost, then try again.",
        "error",
      );
    } else {
      showStatus("Camera access is unavailable in this browser or page context.", "error");
    }
    return;
  }

  appState.currentOperation = "opening-camera";
  if (openCameraButton) {
    openCameraButton.disabled = true;
  }
  capturePhotoButton.disabled = true;
  showStatus("Requesting camera access...");

  let stream = activeCameraStream;

  try {
    if (!stream || !stream.getTracks().some((track) => track.readyState === "live")) {
      try {
        stream = await getUserMedia.call(mediaDevices, {
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (error) {
        if (
          error?.name === "NotAllowedError" ||
          error?.name === "PermissionDeniedError" ||
          !shouldRetryWithoutRearCamera(error)
        ) {
          throw error;
        }

        showStatus("Rear camera unavailable; trying another camera...");
        stream = await getUserMedia.call(mediaDevices, {
          video: true,
          audio: false,
        });
      }

      activeCameraStream = stream;
    }

    const video = getOrCreateVideo(previewRegion);
    video.srcObject = stream;
    await video.play();
    await waitForVideoReady(video);

    if (activeCameraStream !== stream) {
      return;
    }

    capturePhotoButton.disabled = false;
    showStatus("Camera is ready. You can capture a photo.");

    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (activeCameraStream !== stream) {
          return;
        }

        activeCameraStream = null;
        capturePhotoButton.disabled = true;
        showStatus("The camera feed ended. Open the camera to try again.", "error");
      }, { once: true });
    }
  } catch (error) {
    if (stream && stream !== activeCameraStream) {
      stopStream(stream);
    }
    if (activeCameraStream === stream) {
      stopStream(activeCameraStream);
      activeCameraStream = null;
    }

    showStatus(getCameraErrorMessage(error), "error");
  } finally {
    appState.currentOperation = null;
    if (openCameraButton) {
      openCameraButton.disabled = false;
    }
  }
}

function formatLocalTimestamp(date) {
  const localDateTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  ).toISOString().slice(0, -1);
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0");
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");

  return `${localDateTime}${offsetSign}${offsetHours}:${offsetRemainder}`;
}

function isVideoCaptureReady(video, stream) {
  return Boolean(
    stream &&
    stream.getVideoTracks().some((track) => track.readyState === "live") &&
    video?.srcObject === stream &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0,
  );
}

function getPreviewMetadata() {
  const timestamp = appState.captureTimestamp;
  const capturedAt = new Date(timestamp);
  if (!timestamp || Number.isNaN(capturedAt.getTime())) {
    throw new Error("The photo capture date and time are unavailable.");
  }

  const hasLocation =
    appState.locationStatus === "available" &&
    Number.isFinite(appState.latitude) &&
    appState.latitude >= -90 &&
    appState.latitude <= 90 &&
    Number.isFinite(appState.longitude) &&
    appState.longitude >= -180 &&
    appState.longitude <= 180;
  const locationText = hasLocation
    ? `Location: ${appState.latitude.toFixed(6)}, ${appState.longitude.toFixed(6)}`
    : {
        "not-requested": "Location: Not requested",
        loading: "Location: Getting location...",
        denied: "Location: Permission denied",
        "timed-out": "Location: Request timed out",
        unavailable: "Location: Unavailable",
      }[appState.locationStatus] ?? "Location: Unavailable";

  return {
    capturedAt: timestamp,
    localDate: new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(capturedAt),
    localTime: new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(capturedAt),
    locationStatus: appState.locationStatus,
    latitude: hasLocation ? appState.latitude : null,
    longitude: hasLocation ? appState.longitude : null,
    locationUpdatedAt: appState.locationUpdatedAt,
    locationText,
  };
}

function loadPhotoImage(imageData) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The captured photo could not be loaded."));
    image.src = imageData;
  });
}

let previewRenderVersion = 0;
let previewResizeObserver = null;
let lastPreviewWidth = 0;

function observePreviewResize(previewRegion) {
  if (typeof globalThis.ResizeObserver !== "function" || previewResizeObserver) {
    return;
  }

  previewResizeObserver = new ResizeObserver((entries) => {
    const width = Math.round(entries[0]?.contentRect.width ?? 0);
    if (!width || width === lastPreviewWidth) {
      return;
    }

    lastPreviewWidth = width;
    if (appState.labelledPreview?.status === "preview-ready") {
      void composeLabelledPreview(undefined, "status", { silent: true });
    }
  });
  previewResizeObserver.observe(previewRegion);
}

function wrapCanvasText(context, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

async function composeLabelledPreview(
  completionMessage,
  completionType = "status",
  { silent = false } = {},
) {
  if (
    !appState.activePhoto ||
    !appState.captureTimestamp ||
    ![workflowStates.capturedPhoto, workflowStates.previewReady].includes(
      appState.workflowState,
    )
  ) {
    return false;
  }

  const previewRegion = document.getElementById("labelled-photo-preview");
  if (!previewRegion) {
    showStatus("The labelled photo preview is unavailable on this page.", "error");
    return false;
  }

  observePreviewResize(previewRegion);
  const renderVersion = ++previewRenderVersion;
  const existingPreview = appState.workflowState === workflowStates.previewReady;
  if (!silent) {
    showStatus(
      existingPreview
        ? "Updating the labelled photo preview..."
        : "Composing the labelled photo preview...",
    );
  }

  try {
    const metadata = getPreviewMetadata();
    const image = await loadPhotoImage(appState.activePhoto);
    const photoWidth = image.naturalWidth;
    const photoHeight = image.naturalHeight;
    if (!photoWidth || !photoHeight) {
      throw new Error("The captured photo has invalid dimensions.");
    }

    const previewWidth = Math.max(1, previewRegion.clientWidth || photoWidth);
    const fontSize = Math.max(1, Math.round((16 * photoWidth) / previewWidth));
    const lineHeight = Math.ceil(fontSize * 1.45);
    const padding = Math.ceil(fontSize * 0.8);
    const canvas = document.createElement("canvas");
    canvas.width = photoWidth;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("A canvas rendering context is unavailable.");
    }

    context.font = `600 ${fontSize}px system-ui, sans-serif`;
    const maxTextWidth = photoWidth - padding * 2;
    const labelLines = [
      `Date: ${metadata.localDate}`,
      `Time: ${metadata.localTime}`,
      metadata.locationText,
    ].flatMap((text) => wrapCanvasText(context, text, maxTextWidth));
    const labelHeight = padding * 2 + lineHeight * labelLines.length;
    canvas.height = photoHeight + labelHeight;

    context.drawImage(image, 0, 0, photoWidth, photoHeight);
    context.fillStyle = "#111827";
    context.fillRect(0, photoHeight, photoWidth, labelHeight);
    context.fillStyle = "#ffffff";
    context.textBaseline = "top";
    labelLines.forEach((line, index) => {
      context.fillText(line, padding, photoHeight + padding + lineHeight * index);
    });

    const renderedImage = canvas.toDataURL("image/png");
    if (renderVersion !== previewRenderVersion) {
      return false;
    }

    const previewImage = document.createElement("img");
    previewImage.src = renderedImage;
    previewImage.alt = `Photo captured on ${metadata.localDate} at ${metadata.localTime}. ${metadata.locationText}.`;
    previewImage.style.maxWidth = "100%";
    previewImage.style.height = "auto";
    previewImage.style.display = "block";

    if (appState.workflowState === workflowStates.capturedPhoto) {
      if (!transitionWorkflow(workflowStates.previewReady)) {
        throw new Error(appState.statusMessage);
      }
    } else if (appState.workflowState !== workflowStates.previewReady) {
      return false;
    }

    previewRegion.replaceChildren(previewImage);

    appState.labelledPreview = {
      photo: appState.activePhoto,
      metadata,
      renderedImage,
      status: "preview-ready",
    };
    const downloadImageButton = document.getElementById("download-image-button");
    if (downloadImageButton) {
      downloadImageButton.disabled = false;
    }
    if (!silent) {
      showStatus(completionMessage ?? "Labelled photo preview is ready.", completionType);
    }
    return true;
  } catch (error) {
    if (renderVersion === previewRenderVersion) {
      console.error("Labelled photo preview failed:", error);
      showStatus(
        "The labelled photo preview could not be created. The captured photo is still available; try refreshing location to rebuild the preview.",
        "error",
      );
    }
    return false;
  }
}

function updatePreviewForLocationStatus(message, type = "status") {
  if (
    appState.activePhoto &&
    [workflowStates.capturedPhoto, workflowStates.previewReady].includes(
      appState.workflowState,
    )
  ) {
    void composeLabelledPreview(message, type);
    return true;
  }

  return false;
}

function capturePhoto() {
  const capturePhotoButton = document.getElementById("capture-photo-button");
  const retakePhotoButton = document.getElementById("retake-photo-button");
  const previewRegion = document.getElementById("live-camera-preview");
  const video = previewRegion?.querySelector("video");

  if (appState.currentOperation || appState.workflowState !== workflowStates.noPhoto) {
    showStatus("A photo cannot be captured in the current workflow state.", "error");
    return;
  }

  if (!isVideoCaptureReady(video, activeCameraStream)) {
    if (capturePhotoButton) {
      capturePhotoButton.disabled = true;
    }
    showStatus(
      "The camera feed is not ready. Open the camera and wait for the live preview before capturing.",
      "error",
    );
    return;
  }

  appState.currentOperation = "capturing-photo";
  if (capturePhotoButton) {
    capturePhotoButton.disabled = true;
  }
  showStatus("Capturing photo...");

  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("A canvas rendering context is unavailable.");
    }

    const captureTimestamp = formatLocalTimestamp(new Date());
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/png");

    if (!transitionWorkflow(workflowStates.capturedPhoto)) {
      showStatus(appState.statusMessage, "error");
      return;
    }

    appState.activePhoto = imageData;
    appState.captureTimestamp = captureTimestamp;
    if (retakePhotoButton) {
      retakePhotoButton.disabled = false;
    }
    showStatus("Photo captured. Composing labelled preview...");
    void composeLabelledPreview("Photo captured. Labelled preview is ready.");
  } catch (error) {
    console.error("Photo capture failed:", error);
    showStatus(
      "The photo could not be captured. Check that the live camera feed is still active, then try again.",
      "error",
    );
  } finally {
    appState.currentOperation = null;
    if (
      appState.workflowState === workflowStates.noPhoto &&
      capturePhotoButton &&
      isVideoCaptureReady(video, activeCameraStream)
    ) {
      capturePhotoButton.disabled = false;
    }
  }
}

function retakePhoto() {
  const retakePhotoButton = document.getElementById("retake-photo-button");
  const capturePhotoButton = document.getElementById("capture-photo-button");
  const downloadImageButton = document.getElementById("download-image-button");
  const livePreviewRegion = document.getElementById("live-camera-preview");
  const video = livePreviewRegion?.querySelector("video");
  const canCaptureImmediately = isVideoCaptureReady(video, activeCameraStream);

  if (
    appState.currentOperation ||
    !appState.activePhoto ||
    ![
      workflowStates.capturedPhoto,
      workflowStates.previewReady,
      workflowStates.downloadedPhoto,
    ].includes(appState.workflowState)
  ) {
    showStatus("There is no captured photo available to retake.", "error");
    return;
  }

  if (!transitionWorkflow(workflowStates.noPhoto)) {
    showStatus(appState.statusMessage, "error");
    return;
  }

  previewRenderVersion += 1;
  appState.activePhoto = null;
  appState.captureTimestamp = null;
  appState.labelledPreview = null;
  if (retakePhotoButton) {
    retakePhotoButton.disabled = true;
  }
  if (downloadImageButton) {
    downloadImageButton.disabled = true;
  }
  if (capturePhotoButton) {
    capturePhotoButton.disabled = !canCaptureImmediately;
  }

  try {
    if (!document.getElementById("labelled-photo-preview")) {
      throw new Error("The labelled photo preview is unavailable on this page.");
    }

    const emptyPreview = document.createElement("p");
    emptyPreview.textContent = "Your labelled photo will appear here.";
    document.getElementById("labelled-photo-preview").replaceChildren(emptyPreview);

    showStatus(
      canCaptureImmediately
        ? "Photo cleared. You can take another photo."
        : "Photo cleared. Open the camera to take another photo.",
    );
  } catch (error) {
    console.error("Photo retake failed:", error);
    showStatus(
      "The photo was cleared, but the labelled preview could not be reset. Open the camera to take another photo.",
      "error",
    );
  }
}

function downloadImage() {
  const downloadImageButton = document.getElementById("download-image-button");
  const preview = appState.labelledPreview;
  const timestamp = appState.captureTimestamp;
  const timestampParts = timestamp?.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );
  const previewIsValid = Boolean(
    preview?.status === "preview-ready" &&
    preview.photo === appState.activePhoto &&
    preview.metadata?.capturedAt === timestamp &&
    typeof preview.renderedImage === "string" &&
    preview.renderedImage.startsWith("data:image/png;base64,") &&
    timestampParts &&
    !Number.isNaN(new Date(timestamp).getTime()),
  );

  if (
    appState.currentOperation ||
    ![workflowStates.previewReady, workflowStates.downloadedPhoto].includes(
      appState.workflowState,
    ) ||
    !previewIsValid
  ) {
    showStatus(
      "A completed labelled preview is required before downloading. Capture a photo or wait for its preview to finish.",
      "error",
    );
    return;
  }

  const [, date, hours, minutes, seconds] = timestampParts;
  const anchor = document.createElement("a");
  anchor.href = preview.renderedImage;
  anchor.download = `geosnap-${date}-${hours}-${minutes}-${seconds}.png`;

  appState.currentOperation = "downloading-image";
  if (downloadImageButton) {
    downloadImageButton.disabled = true;
  }

  try {
    document.body.append(anchor);
    anchor.click();

    if (!transitionWorkflow(workflowStates.downloadedPhoto)) {
      throw new Error(appState.statusMessage);
    }

    showStatus("Download initiated. Check your browser's downloads for the labelled image.");
  } catch (error) {
    console.error("Image download could not be initiated:", error);
    showStatus(
      "The download could not be initiated. Your labelled preview is still available; try downloading again.",
      "error",
    );
  } finally {
    anchor.remove();
    appState.currentOperation = null;
    if (downloadImageButton) {
      downloadImageButton.disabled = false;
    }
  }
}

let locationRequestId = 0;

function finishLocationRequest(requestId) {
  if (requestId !== locationRequestId) {
    return false;
  }

  appState.locationRequestInProgress = false;
  const refreshLocationButton = document.getElementById("refresh-location-button");
  if (refreshLocationButton) {
    refreshLocationButton.disabled = false;
  }
  return true;
}

function refreshLocation() {
  if (appState.locationRequestInProgress) {
    return;
  }

  const geolocation = globalThis.navigator?.geolocation;
  if (typeof geolocation?.getCurrentPosition !== "function") {
    appState.locationStatus = "unavailable";
    appState.latitude = null;
    appState.longitude = null;
    appState.locationUpdatedAt = null;
    if (
      !updatePreviewForLocationStatus(
        "Location is unavailable; the preview was updated without coordinates.",
        "error",
      )
    ) {
      showStatus(
        "Location is unavailable because geolocation is not supported in this browser.",
        "error",
      );
    }
    return;
  }

  const refreshLocationButton = document.getElementById("refresh-location-button");
  const requestId = ++locationRequestId;
  appState.locationRequestInProgress = true;
  appState.locationStatus = "loading";
  appState.latitude = null;
  appState.longitude = null;
  appState.locationUpdatedAt = null;
  if (refreshLocationButton) {
    refreshLocationButton.disabled = true;
  }
  showStatus("Getting your location...");
  updatePreviewForLocationStatus(
    "Location request is in progress; the preview shows its current status.",
  );

  try {
    geolocation.getCurrentPosition(
      (position) => {
        if (!finishLocationRequest(requestId)) {
          return;
        }

        appState.latitude = position.coords.latitude;
        appState.longitude = position.coords.longitude;
        appState.locationUpdatedAt = new Date().toISOString();
        appState.locationStatus = "available";
        if (
          !updatePreviewForLocationStatus(
            "Location received; the labelled preview was updated.",
          )
        ) {
          showStatus("Location received successfully.");
        }
      },
      (error) => {
        if (!finishLocationRequest(requestId)) {
          return;
        }

        appState.latitude = null;
        appState.longitude = null;
        appState.locationUpdatedAt = null;

        if (error.code === 1) {
          appState.locationStatus = "denied";
          if (
            !updatePreviewForLocationStatus(
              "Location access was denied; the preview was updated without coordinates.",
              "error",
            )
          ) {
            showStatus(
              "Location access was denied. Allow location access in your browser settings, then try again.",
              "error",
            );
          }
        } else if (error.code === 3) {
          appState.locationStatus = "timed-out";
          if (
            !updatePreviewForLocationStatus(
              "The location request timed out; the preview was updated without coordinates.",
              "error",
            )
          ) {
            showStatus("The location request timed out. Check your signal and try again.", "error");
          }
        } else {
          appState.locationStatus = "unavailable";
          if (
            !updatePreviewForLocationStatus(
              "Location is unavailable; the preview was updated without coordinates.",
              "error",
            )
          ) {
            showStatus(
              "Your location could not be determined. Check that location services are enabled, then try again.",
              "error",
            );
          }
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  } catch (error) {
    console.error("Location request failed:", error);
    if (finishLocationRequest(requestId)) {
      appState.latitude = null;
      appState.longitude = null;
      appState.locationUpdatedAt = null;
      appState.locationStatus = "unavailable";
      if (
        !updatePreviewForLocationStatus(
          "Location is unavailable; the preview was updated without coordinates.",
          "error",
        )
      ) {
        showStatus(
          "Your location could not be requested. Check your browser settings and try again.",
          "error",
        );
      }
    }
  }
}

const openCameraButton = globalThis.document?.getElementById("open-camera-button");
openCameraButton?.addEventListener("click", openCamera);

const capturePhotoButton = globalThis.document?.getElementById("capture-photo-button");
capturePhotoButton?.addEventListener("click", capturePhoto);

const refreshLocationButton = globalThis.document?.getElementById("refresh-location-button");
refreshLocationButton?.addEventListener("click", refreshLocation);

const retakePhotoButton = globalThis.document?.getElementById("retake-photo-button");
retakePhotoButton?.addEventListener("click", retakePhoto);

const downloadImageButton = globalThis.document?.getElementById("download-image-button");
downloadImageButton?.addEventListener("click", downloadImage);

const SpeechRecognitionConstructor =
  globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
const voiceDisclosureAcknowledgment = globalThis.document?.getElementById(
  "voice-disclosure-acknowledgment",
);
const startVoiceButton = globalThis.document?.getElementById("start-voice-button");
const stopVoiceButton = globalThis.document?.getElementById("stop-voice-button");
let voiceRecognition = null;
let voiceRecognitionActive = false;
let voiceRecognitionErrorMessage = null;
let voiceStopRequested = false;

function updateVoiceControls() {
  if (voiceDisclosureAcknowledgment) {
    voiceDisclosureAcknowledgment.disabled = !SpeechRecognitionConstructor;
  }
  if (startVoiceButton) {
    startVoiceButton.disabled =
      !SpeechRecognitionConstructor ||
      !voiceDisclosureAcknowledgment?.checked ||
      voiceRecognitionActive;
  }
  if (stopVoiceButton) {
    stopVoiceButton.disabled = !voiceRecognitionActive;
  }
}

function normalizeVoiceCommand(transcript) {
  return transcript
    .toLowerCase()
    .trim()
    .replace(/^\p{P}+|\p{P}+$/gu, "")
    .trim();
}

if (!SpeechRecognitionConstructor) {
  showStatus(
    "Voice recognition is not supported in this browser. You can continue using the manual controls.",
  );
} else {
  updateVoiceControls();
  voiceDisclosureAcknowledgment?.addEventListener("change", () => {
    updateVoiceControls();
    if (!voiceDisclosureAcknowledgment.checked && voiceRecognitionActive) {
      voiceStopRequested = true;
      voiceRecognition?.stop();
    }
  });

  startVoiceButton?.addEventListener("click", () => {
    if (!voiceDisclosureAcknowledgment?.checked || voiceRecognitionActive) {
      return;
    }

    try {
      voiceRecognition = new SpeechRecognitionConstructor();
      voiceRecognition.continuous = false;
      voiceRecognition.interimResults = false;
      const processedResults = new Set();
      voiceRecognition.onresult = (event) => {
        if (!voiceDisclosureAcknowledgment?.checked) {
          return;
        }

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result.isFinal) {
            continue;
          }

          const command = normalizeVoiceCommand(result[0]?.transcript ?? "");
          const resultKey = `${index}:${command}`;
          if (processedResults.has(resultKey)) {
            continue;
          }
          processedResults.add(resultKey);

          if (
            ![
              "take photo",
              "refresh location",
              "retake photo",
              "download image",
            ].includes(command)
          ) {
            showStatus(
              "I didn't recognize that command. Try take photo, refresh location, retake photo, or download image.",
            );
            continue;
          }

          showStatus(`Voice command recognized: ${command}.`);
          switch (command) {
            case "take photo":
              capturePhoto();
              break;
            case "refresh location":
              refreshLocation();
              break;
            case "retake photo":
              retakePhoto();
              break;
            case "download image":
              downloadImage();
              break;
          }
        }
      };
      voiceRecognition.onstart = () => {
        voiceRecognitionActive = true;
        updateVoiceControls();
        showStatus("Voice recognition is listening.");
      };
      voiceRecognition.onend = () => {
        voiceRecognitionActive = false;
        updateVoiceControls();
        if (!voiceRecognitionErrorMessage && voiceStopRequested) {
          showStatus("Voice recognition stopped.");
        }
        voiceStopRequested = false;
      };
      voiceRecognition.onerror = (event) => {
        console.error("Voice recognition failed:", event.error);
        const messages = {
          "not-allowed":
            "Microphone permission was denied. Allow microphone access in browser settings to use voice recognition.",
          "service-not-allowed":
            "The speech-recognition service is unavailable or not permitted. You can try again or use the manual controls.",
          "audio-capture":
            "No usable microphone was found. Check your microphone or use the manual controls.",
          network:
            "The speech-recognition service could not be reached. Check your connection or use the manual controls.",
          "language-not-supported":
            "The selected language is not supported for speech recognition.",
          "no-speech": "No speech was detected. Try speaking after starting voice recognition.",
          aborted: "Voice recognition was stopped before it finished.",
        };
        voiceRecognitionErrorMessage =
          messages[event.error] ??
          "Voice recognition encountered an error. You can try again or use the manual controls.";
        showStatus(voiceRecognitionErrorMessage, "error");
      };
      voiceRecognitionErrorMessage = null;
      voiceStopRequested = false;
      voiceRecognition.start();
      voiceRecognitionActive = true;
      updateVoiceControls();
      showStatus("Starting voice recognition...");
    } catch (error) {
      console.error("Voice recognition could not be started:", error);
      voiceRecognition = null;
      voiceRecognitionActive = false;
      updateVoiceControls();
      showStatus("Voice recognition could not be started. You can try again.", "error");
    }
  });

  stopVoiceButton?.addEventListener("click", () => {
    if (!voiceRecognitionActive || !voiceRecognition) {
      return;
    }

    try {
      voiceStopRequested = true;
      voiceRecognition.stop();
    } catch (error) {
      voiceStopRequested = false;
      console.error("Voice recognition could not be stopped:", error);
      showStatus("Voice recognition could not be stopped cleanly.", "error");
    }
  });
}
