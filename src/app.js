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
    const isError = type === "error";
    statusElement.setAttribute("role", isError ? "alert" : "status");
    statusElement.setAttribute("aria-live", isError ? "assertive" : "polite");
    statusElement.dataset.statusType = isError ? "error" : "status";
    statusElement.textContent = message;
  }
}

function restoreFocusIfLost(wasFocused, control) {
  if (!wasFocused || !control || control.disabled) {
    return;
  }

  const activeElement = globalThis.document?.activeElement;
  if (
    activeElement &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  ) {
    return;
  }

  try {
    control.focus({ preventScroll: true });
  } catch {
    control.focus();
  }
}

function reportUnexpectedFailure(operation, error, message) {
  console.error(`${operation} failed:`, error);
  showStatus(message, "error");
}

function getCameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Camera access was denied or the permission prompt was dismissed. Allow camera access for this site in your browser settings, then choose Open Camera to retry.";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No usable camera was found. Connect or enable a camera, then choose Open Camera to retry.";
  }

  if (error?.name === "NotReadableError") {
    return "The camera could not be opened and may be in use by another app. Close other apps using the camera, then choose Open Camera to retry.";
  }

  if (error?.name === "AbortError") {
    return "Camera startup was interrupted. Choose Open Camera to try again.";
  }

  if (error?.name === "SecurityError") {
    return "The browser blocked camera access. Check this site's browser permissions and use HTTPS or localhost, then choose Open Camera to retry.";
  }

  return "The camera could not be started. Check that a camera is connected and allowed in your browser settings, then choose Open Camera to retry.";
}

function setCameraPreviewMessage(message) {
  const previewRegion = globalThis.document?.getElementById("live-camera-preview");
  if (!previewRegion) {
    return;
  }

  const video = previewRegion.querySelector("video");
  if (video) {
    video.srcObject = null;
  }
  const fallbackMessage = document.createElement("p");
  fallbackMessage.textContent = message;
  previewRegion.replaceChildren(fallbackMessage);
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
      setCameraPreviewMessage(
        "Camera access needs a secure page. Open this site using HTTPS or localhost, then retry.",
      );
      showStatus(
        "Camera access requires a secure page. Use HTTPS or localhost, then choose Open Camera to retry.",
        "error",
      );
    } else {
      setCameraPreviewMessage(
        "Camera access is not available in this browser. You can still use any photo already captured.",
      );
      showStatus(
        "Camera access is unavailable in this browser or page context. Use a supported browser or page context, then choose Open Camera to retry.",
        "error",
      );
    }
    return;
  }

  let stream = activeCameraStream;
  const openCameraHadFocus = document.activeElement === openCameraButton;

  try {
    appState.currentOperation = "opening-camera";
    if (openCameraButton) {
      openCameraButton.disabled = true;
    }
    capturePhotoButton.disabled = true;
    showStatus("Requesting camera access...");

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
        setCameraPreviewMessage(
          "The camera feed ended. Check the camera connection and permission, then choose Open Camera to retry.",
        );
        showStatus(
          "The camera feed ended. Check the camera connection and permission, then choose Open Camera to retry.",
          "error",
        );
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

    try {
      setCameraPreviewMessage(
        "The camera preview is unavailable. Fix the issue described below, then choose Open Camera to retry.",
      );
      showStatus(getCameraErrorMessage(error), "error");
    } catch (recoveryError) {
      reportUnexpectedFailure(
        "Camera recovery",
        recoveryError,
        "The camera could not be started. Use Open Camera to retry, or continue with any photo already captured.",
      );
    }
  } finally {
    appState.currentOperation = null;
    if (openCameraButton) {
      openCameraButton.disabled = false;
    }
    restoreFocusIfLost(
      openCameraHadFocus,
      capturePhotoButton && !capturePhotoButton.disabled
        ? capturePhotoButton
        : openCameraButton,
    );
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

  let renderVersion = null;
  let previewRegion = null;
  let previousChildren = null;
  const previousWorkflowState = appState.workflowState;
  const previousLabelledPreview = appState.labelledPreview;
  let previewWasReplaced = false;

  try {
    previewRegion = document.getElementById("labelled-photo-preview");
    if (!previewRegion) {
      showStatus("The labelled photo preview is unavailable on this page.", "error");
      return false;
    }

    observePreviewResize(previewRegion);
    renderVersion = ++previewRenderVersion;
    const existingPreview = appState.workflowState === workflowStates.previewReady;
    if (!silent) {
      showStatus(
        existingPreview
          ? "Updating the labelled photo preview..."
          : "Composing the labelled photo preview...",
      );
    }

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

    previousChildren = [...previewRegion.childNodes];
    previewRegion.replaceChildren(previewImage);
    previewWasReplaced = true;
    if (appState.workflowState === workflowStates.capturedPhoto) {
      if (!transitionWorkflow(workflowStates.previewReady)) {
        throw new Error(appState.statusMessage);
      }
    } else if (appState.workflowState !== workflowStates.previewReady) {
      previewRegion.replaceChildren(...previousChildren);
      return false;
    }

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
    if (renderVersion === null || renderVersion === previewRenderVersion) {
      if (previewWasReplaced && previewRegion && previousChildren) {
        try {
          previewRegion.replaceChildren(...previousChildren);
        } catch (restoreError) {
          console.error("Previous labelled preview could not be restored:", restoreError);
        }
      }
      appState.labelledPreview = previousLabelledPreview;
      if (
        previousWorkflowState === workflowStates.capturedPhoto &&
        appState.workflowState === workflowStates.previewReady
      ) {
        appState.workflowState = workflowStates.capturedPhoto;
      }
      const previousPreviewIsValid = Boolean(
        previousLabelledPreview?.status === "preview-ready" &&
        previousLabelledPreview.photo === appState.activePhoto,
      );
      const downloadImageButton = document.getElementById("download-image-button");
      if (downloadImageButton) {
        downloadImageButton.disabled = !previousPreviewIsValid;
      }
      reportUnexpectedFailure(
        "Labelled photo preview",
        error,
        previousPreviewIsValid
          ? "The updated preview could not be created. Your previous labelled preview is still available; try refreshing location again."
          : "The labelled photo preview could not be created. Your captured photo and capture time are still available; try refreshing location to rebuild the preview or retake the photo.",
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
  const openCameraButton = document.getElementById("open-camera-button");
  const previewRegion = document.getElementById("live-camera-preview");
  const video = previewRegion?.querySelector("video");
  const capturePhotoHadFocus = document.activeElement === capturePhotoButton;

  if (appState.currentOperation || appState.workflowState !== workflowStates.noPhoto) {
    showStatus("A photo cannot be captured in the current workflow state.", "error");
    restoreFocusIfLost(capturePhotoHadFocus, openCameraButton);
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
    restoreFocusIfLost(capturePhotoHadFocus, openCameraButton);
    return;
  }

  try {
    appState.currentOperation = "capturing-photo";
    if (capturePhotoButton) {
      capturePhotoButton.disabled = true;
    }
    showStatus("Capturing photo...");

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
    if (appState.workflowState === workflowStates.noPhoto && capturePhotoButton) {
      try {
        capturePhotoButton.disabled = !isVideoCaptureReady(video, activeCameraStream);
      } catch (error) {
        capturePhotoButton.disabled = true;
        reportUnexpectedFailure(
          "Camera readiness check",
          error,
          "The camera is not ready to capture. Choose Open Camera to reconnect, then try again.",
        );
      }
    }
    restoreFocusIfLost(
      capturePhotoHadFocus,
      appState.workflowState === workflowStates.noPhoto
        ? capturePhotoButton && !capturePhotoButton.disabled
          ? capturePhotoButton
          : openCameraButton
        : retakePhotoButton,
    );
  }
}

function retakePhoto() {
  const retakePhotoButton = document.getElementById("retake-photo-button");
  const capturePhotoButton = document.getElementById("capture-photo-button");
  const downloadImageButton = document.getElementById("download-image-button");
  const livePreviewRegion = document.getElementById("live-camera-preview");
  const video = livePreviewRegion?.querySelector("video");
  const canCaptureImmediately = isVideoCaptureReady(video, activeCameraStream);
  const retakePhotoHadFocus = document.activeElement === retakePhotoButton;

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

  let previousChildren;
  try {
    const labelledPreviewRegion = document.getElementById("labelled-photo-preview");
    if (!labelledPreviewRegion) {
      throw new Error("The labelled photo preview is unavailable on this page.");
    }

    previousChildren = [...labelledPreviewRegion.childNodes];
    const emptyPreview = document.createElement("p");
    emptyPreview.textContent = "Your labelled photo will appear here.";
    labelledPreviewRegion.replaceChildren(emptyPreview);
  } catch (error) {
    reportUnexpectedFailure(
      "Photo retake",
      error,
      "The photo could not be cleared safely, so your current photo and preview were kept. Try retaking again.",
    );
    restoreFocusIfLost(retakePhotoHadFocus, retakePhotoButton);
    return;
  }

  if (!transitionWorkflow(workflowStates.noPhoto)) {
    try {
      document
        .getElementById("labelled-photo-preview")
        ?.replaceChildren(...(previousChildren ?? []));
    } catch (error) {
      console.error("The previous photo preview could not be restored:", error);
    }
    showStatus(appState.statusMessage, "error");
    restoreFocusIfLost(retakePhotoHadFocus, retakePhotoButton);
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

  showStatus(
    canCaptureImmediately
      ? "Photo cleared. You can take another photo."
      : "Photo cleared. Open the camera to take another photo.",
  );
  restoreFocusIfLost(
    retakePhotoHadFocus,
    canCaptureImmediately ? capturePhotoButton : document.getElementById("open-camera-button"),
  );
}

function downloadImage() {
  const downloadImageButton = document.getElementById("download-image-button");
  const downloadImageHadFocus = document.activeElement === downloadImageButton;
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
  let anchor = null;
  try {
    appState.currentOperation = "downloading-image";
    if (downloadImageButton) {
      downloadImageButton.disabled = true;
    }

    anchor = document.createElement("a");
    anchor.href = preview.renderedImage;
    anchor.download = `geosnap-${date}-${hours}-${minutes}-${seconds}.png`;
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
    try {
      anchor?.remove();
    } catch (error) {
      console.error("Temporary download link could not be removed:", error);
    }
    appState.currentOperation = null;
    if (downloadImageButton) {
      downloadImageButton.disabled = false;
    }
    restoreFocusIfLost(downloadImageHadFocus, downloadImageButton);
  }
}

let locationRequestId = 0;

function finishLocationRequest(requestId) {
  if (requestId !== locationRequestId) {
    return false;
  }

  appState.locationRequestInProgress = false;
  try {
    const refreshLocationButton = document.getElementById("refresh-location-button");
    if (refreshLocationButton) {
      refreshLocationButton.disabled = false;
    }
  } catch (error) {
    console.error("Location control could not be re-enabled:", error);
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
        "Location is unavailable because this browser does not support geolocation; the preview was updated without coordinates. Photo capture remains available. Choose Refresh Location to try again in a supported browser.",
        "error",
      )
    ) {
      showStatus(
        "Location is unavailable because geolocation is not supported in this browser. Photo capture, preview, retake, and download remain available without location.",
        "error",
      );
    }
    return;
  }

  const requestId = ++locationRequestId;
  appState.locationRequestInProgress = true;
  appState.locationStatus = "loading";
  appState.latitude = null;
  appState.longitude = null;
  appState.locationUpdatedAt = null;
  try {
    const refreshLocationButton = document.getElementById("refresh-location-button");
    if (refreshLocationButton) {
      refreshLocationButton.disabled = true;
    }
    showStatus("Getting your location...");
    updatePreviewForLocationStatus(
      "Location request is in progress; the preview shows its current status.",
    );

    geolocation.getCurrentPosition(
      (position) => {
        if (
          requestId !== locationRequestId ||
          !appState.locationRequestInProgress
        ) {
          return;
        }

        let message = "Location received successfully.";
        let messageType = "status";
        try {
          const latitude = position?.coords?.latitude;
          const longitude = position?.coords?.longitude;
          if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
          ) {
            throw new Error("The browser returned invalid location coordinates.");
          }

          appState.latitude = latitude;
          appState.longitude = longitude;
          appState.locationUpdatedAt = new Date().toISOString();
          appState.locationStatus = "available";
          message = "Location received; the labelled preview was updated.";
        } catch (error) {
          console.error("Location result could not be used:", error);
          appState.latitude = null;
          appState.longitude = null;
          appState.locationUpdatedAt = null;
          appState.locationStatus = "unavailable";
          message =
            "The location result could not be used. The photo remains available without coordinates; choose Refresh Location to try again.";
          messageType = "error";
        } finally {
          finishLocationRequest(requestId);
        }

        try {
          if (!updatePreviewForLocationStatus(message, messageType)) {
            showStatus(message, messageType);
          }
        } catch (error) {
          reportUnexpectedFailure(
            "Location preview update",
            error,
            "Location could not be displayed. Your photo and existing preview remain available; choose Refresh Location to try again.",
          );
        }
      },
      (error) => {
        if (
          requestId !== locationRequestId ||
          !appState.locationRequestInProgress
        ) {
          return;
        }

        appState.latitude = null;
        appState.longitude = null;
        appState.locationUpdatedAt = null;
        let message;
        let messageType = "error";

        try {
          if (error?.code === 1) {
            appState.locationStatus = "denied";
            message =
              "Location access was denied or the permission prompt was dismissed. Allow location access for this site in your browser settings, then choose Refresh Location to retry. Photo capture remains available without location.";
          } else if (error?.code === 3) {
            appState.locationStatus = "timed-out";
            message =
              "The location request timed out. Check your signal or location services, then choose Refresh Location to retry. Photo capture remains available without location.";
          } else {
            appState.locationStatus = "unavailable";
            message =
              "Your location could not be determined. Check that location services are enabled, then choose Refresh Location to retry. Photo capture remains available without location.";
          }
        } catch (unexpectedError) {
          console.error("Location error could not be handled:", unexpectedError);
          appState.locationStatus = "unavailable";
          message =
            "Location is unavailable. Your photo workflow can continue without coordinates; choose Refresh Location to retry.";
        } finally {
          finishLocationRequest(requestId);
        }

        try {
          const previewMessage = {
            denied:
              "Location access was denied or the permission prompt was dismissed; the preview was updated without coordinates. Choose Refresh Location to try again.",
            "timed-out":
              "The location request timed out; the preview was updated without coordinates. Choose Refresh Location to try again.",
            unavailable:
              "Location is unavailable; the preview was updated without coordinates. Choose Refresh Location to try again.",
          }[appState.locationStatus];
          if (!updatePreviewForLocationStatus(previewMessage, messageType)) {
            showStatus(message, messageType);
          }
        } catch (unexpectedError) {
          reportUnexpectedFailure(
            "Location error recovery",
            unexpectedError,
            "Location is unavailable, but photo capture, preview, retake, and download remain available without coordinates.",
          );
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
          "Location is unavailable; the preview was updated without coordinates. Choose Refresh Location to try again.",
          "error",
        )
      ) {
        showStatus(
          "Your location could not be requested. Check this site's browser permissions and location services, then choose Refresh Location to retry. Photo capture remains available without location.",
          "error",
        );
      }
    }
  }
}

function runActionSafely(action, failureMessage) {
  try {
    const result = action();
    if (result && typeof result.then === "function") {
      result.catch((error) =>
        reportUnexpectedFailure("Photo workflow action", error, failureMessage),
      );
    }
  } catch (error) {
    reportUnexpectedFailure("Photo workflow action", error, failureMessage);
  }
}

const openCameraButton = globalThis.document?.getElementById("open-camera-button");
openCameraButton?.addEventListener("click", () =>
  runActionSafely(
    openCamera,
    "The camera action could not be completed. Choose Open Camera to retry, or continue with any photo already captured.",
  ),
);

const capturePhotoButton = globalThis.document?.getElementById("capture-photo-button");
capturePhotoButton?.addEventListener("click", () =>
  runActionSafely(
    capturePhoto,
    "The photo could not be captured. Check the live camera feed and try again.",
  ),
);

const refreshLocationButton = globalThis.document?.getElementById("refresh-location-button");
refreshLocationButton?.addEventListener("click", () =>
  runActionSafely(
    refreshLocation,
    "Location could not be refreshed. Your photo workflow can continue without location; choose Refresh Location to try again.",
  ),
);

const retakePhotoButton = globalThis.document?.getElementById("retake-photo-button");
retakePhotoButton?.addEventListener("click", () =>
  runActionSafely(
    retakePhoto,
    "The photo could not be retaken. Your current photo and preview remain available.",
  ),
);

const downloadImageButton = globalThis.document?.getElementById("download-image-button");
downloadImageButton?.addEventListener("click", () =>
  runActionSafely(
    downloadImage,
    "The image could not be downloaded. Your labelled preview remains available; try again.",
  ),
);

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
let voiceSessionHadFocus = false;

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

function recoverVoiceRecognition(error, message) {
  console.error("Voice recognition failed:", error);
  voiceRecognitionErrorMessage = message;
  voiceStopRequested = false;
  voiceRecognitionActive = false;
  const shouldRestoreFocus = voiceSessionHadFocus;
  voiceSessionHadFocus = false;
  const recognition = voiceRecognition;
  voiceRecognition = null;
  try {
    recognition?.abort?.();
  } catch (abortError) {
    console.error("Voice recognition could not be aborted during recovery:", abortError);
  }
  try {
    updateVoiceControls();
  } catch (controlError) {
    console.error("Voice controls could not be reset:", controlError);
  }
  restoreFocusIfLost(shouldRestoreFocus, startVoiceButton);
  showStatus(message, "error");
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
    try {
      updateVoiceControls();
      if (!voiceDisclosureAcknowledgment.checked && voiceRecognitionActive) {
        voiceStopRequested = true;
        voiceRecognition?.stop();
      }
    } catch (error) {
      recoverVoiceRecognition(
        error,
        "Voice recognition could not be stopped after the disclosure changed. Use the Stop voice recognition button or manual controls.",
      );
    }
  });

  startVoiceButton?.addEventListener("click", () => {
    if (!voiceDisclosureAcknowledgment?.checked || voiceRecognitionActive) {
      return;
    }

    voiceSessionHadFocus = document.activeElement === startVoiceButton;
    try {
      voiceRecognition = new SpeechRecognitionConstructor();
      voiceRecognition.continuous = false;
      voiceRecognition.interimResults = false;
      const processedResults = new Set();
      voiceRecognition.onresult = (event) => {
        try {
          if (!voiceDisclosureAcknowledgment?.checked) {
            return;
          }

          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (!result.isFinal) {
              continue;
            }

            const transcript = result[0]?.transcript ?? "";
            const command = normalizeVoiceCommand(transcript);
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
              const recognizedText = transcript.trim().slice(0, 120);
              showStatus(
                recognizedText
                  ? `Recognized speech: "${recognizedText}". This is not a supported command. Try take photo, refresh location, retake photo, or download image.`
                  : "I couldn't understand that speech. Try take photo, refresh location, retake photo, or download image.",
                "error",
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
        } catch (error) {
          recoverVoiceRecognition(
            error,
            "The speech result could not be processed. Start voice recognition to try again, or use the manual controls.",
          );
        }
      };
      voiceRecognition.onstart = () => {
        try {
          voiceRecognitionActive = true;
          updateVoiceControls();
          restoreFocusIfLost(voiceSessionHadFocus, stopVoiceButton);
          showStatus("Voice recognition is listening.");
        } catch (error) {
          recoverVoiceRecognition(
            error,
            "Voice recognition could not continue. Start it again or use the manual controls.",
          );
        }
      };
      voiceRecognition.onend = () => {
        try {
          const shouldRestoreFocus =
            voiceSessionHadFocus &&
            (document.activeElement === stopVoiceButton ||
              document.activeElement === document.body ||
              document.activeElement === document.documentElement);
          voiceRecognitionActive = false;
          updateVoiceControls();
          voiceSessionHadFocus = false;
          restoreFocusIfLost(shouldRestoreFocus, startVoiceButton);
          if (!voiceRecognitionErrorMessage && voiceStopRequested) {
            showStatus("Voice recognition stopped.");
          }
          voiceStopRequested = false;
        } catch (error) {
          recoverVoiceRecognition(
            error,
            "Voice recognition ended unexpectedly. Start it again or use the manual controls.",
          );
        }
      };
      voiceRecognition.onerror = (event) => {
        const messages = {
          "not-allowed":
            "Microphone permission was denied. Allow microphone access for this site in browser settings, then start voice recognition again or use the manual controls.",
          "service-not-allowed":
            "The speech-recognition service is unavailable or not permitted. You can try again or use the manual controls.",
          "audio-capture":
            "No usable microphone was found. Check your microphone or use the manual controls.",
          network:
            "The speech-recognition service could not be reached. Check your connection or use the manual controls.",
          "language-not-supported":
            "The selected language is not supported for speech recognition.",
          "no-speech":
            "No speech was detected. Start voice recognition again and speak after it begins listening, or use the manual controls.",
          aborted:
            "Voice recognition was interrupted. Start it again to retry, or use the manual controls.",
        };
        recoverVoiceRecognition(
          event?.error,
          messages[event?.error] ??
            "Voice recognition encountered an unexpected error. Start it again to retry, or use the manual controls.",
        );
      };
      voiceRecognitionErrorMessage = null;
      voiceStopRequested = false;
      voiceRecognition.start();
      voiceRecognitionActive = true;
      updateVoiceControls();
      restoreFocusIfLost(voiceSessionHadFocus, stopVoiceButton);
      showStatus("Starting voice recognition...");
    } catch (error) {
      const recognition = voiceRecognition;
      voiceRecognition = null;
      voiceRecognitionActive = false;
      voiceStopRequested = false;
      const shouldRestoreFocus = voiceSessionHadFocus;
      voiceSessionHadFocus = false;
      updateVoiceControls();
      try {
        recognition?.abort?.();
      } catch (abortError) {
        console.error("Voice recognition could not be aborted after startup failed:", abortError);
      }
      console.error("Voice recognition could not be started:", error);
      restoreFocusIfLost(shouldRestoreFocus, startVoiceButton);
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
      recoverVoiceRecognition(
        error,
        "Voice recognition could not stop normally and was reset. Start it again to retry, or use the manual controls.",
      );
    }
  });
}
