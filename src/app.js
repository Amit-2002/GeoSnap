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

const openCameraButton = globalThis.document?.getElementById("open-camera-button");
openCameraButton?.addEventListener("click", openCamera);
