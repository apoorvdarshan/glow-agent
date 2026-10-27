// YouCam API (Perfect Corp) client. India-region accounts are served from
// makeupar.com; set YOUCAM_BASE to the perfectcorp.com host for other regions.
// Tasks are asynchronous: start one, then poll. Units are charged only when a
// task succeeds.

import { ANALYSIS_ACTIONS } from "./report.js";

export class YouCamError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Friendly messages for the photo errors people actually hit.
const PHOTO_ERRORS = {
  error_below_min_image_size: "That photo is too small. Use one at least 480 pixels on the short side.",
  error_exceed_max_image_size: "That photo is too large. Try a smaller one.",
  error_src_face_too_small: "Move closer: your face should fill most of the frame.",
  error_face_position_too_small: "Move closer: your face should fill most of the frame.",
  error_src_face_out_of_bound: "Center your face so it's fully inside the frame.",
  error_face_position_out_of_boundary: "Center your face so it's fully inside the frame.",
  error_face_position_invalid: "Make sure your whole face is visible.",
  error_face_angle_invalid: "Look straight at the camera.",
  error_lighting_dark: "It's too dark. Face a window or a lamp and try again.",
  error_insufficient_lighting: "It's too dark. Face a window or a lamp and try again.",
};

export function photoErrorMessage(code) {
  return PHOTO_ERRORS[code] ?? "YouCam couldn't process that photo. Try a clear, front-facing selfie in good light.";
}

export function createYouCam(env, fetcher = fetch) {
  const base = `${env.YOUCAM_BASE ?? "https://yce-api-01.makeupar.com"}/s2s/v2.0`;
  const headers = { Authorization: `Bearer ${env.YOUCAM_API_KEY}`, "Content-Type": "application/json" };

  async function call(method, path, body) {
    const res = await fetcher(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json.status && json.status !== 200)) {
      throw new YouCamError(json.error ?? `YouCam ${method} ${path} failed`, json.error_code ?? "YouCamError", res.status);
    }
    return json.data;
  }

  async function task(kind, payload) {
    const data = await call("POST", `/task/${kind}`, payload);
    if (!data?.task_id) throw new YouCamError("YouCam did not return a task id", "NoTaskId", 502);
    return data.task_id;
  }

  // Returns { status: "running" } or { status: "success", results } or
  // { status: "error", code, message }.
  async function poll(kind, taskId) {
    const data = await call("GET", `/task/${kind}/${encodeURIComponent(taskId)}`);
    if (data.task_status === "success") return { status: "success", results: data.results };
    if (data.task_status === "error") {
      const code = data.error ?? "unknown_error";
      return { status: "error", code, message: photoErrorMessage(code) };
    }
    return { status: "running" };
  }

  return {
    // Registers a file, then uploads the bytes to the pre-signed URL YouCam returns.
    async upload(bytes, contentType) {
      const data = await call("POST", "/file", {
        files: [{ content_type: contentType, file_name: `selfie.${contentType === "image/png" ? "png" : "jpg"}`, file_size: bytes.byteLength }],
      });
      const file = data?.files?.[0];
      const put = file?.requests?.[0];
      if (!file?.file_id || !put?.url) throw new YouCamError("YouCam did not return an upload URL", "NoUploadUrl", 502);
      const res = await fetcher(put.url, { method: put.method ?? "PUT", headers: put.headers ?? { "Content-Type": contentType }, body: bytes });
      if (!res.ok) throw new YouCamError(`Upload failed with ${res.status}`, "UploadFailed", 502);
      return file.file_id;
    },

    startSkinAnalysis(source) {
      return task("skin-analysis", {
        ...source,
        dst_actions: ANALYSIS_ACTIONS,
        miniserver_args: { enable_mask_overlay: false },
        format: "json",
      });
    },
    pollSkinAnalysis: (taskId) => poll("skin-analysis", taskId),

    startMakeup(source, effects) {
      return task("makeup-vto", { ...source, effects, version: "1.0" });
    },
    pollMakeup: (taskId) => poll("makeup-vto", taskId),
  };
}

// source for a task: an uploaded file id or a public image URL.
export function sourceFrom({ fileId, imageUrl }) {
  if (fileId) return { src_file_id: fileId };
  if (imageUrl) return { src_file_url: imageUrl };
  throw new YouCamError("A photo is required", "MissingPhoto", 400);
}

// Makeup VTO effect for one product shade.
export function makeupEffect(category, shade) {
  switch (category) {
    case "foundation":
      return { category, palettes: [{ color: shade.hex, colorIntensity: 60, glowIntensity: 40, coverageIntensity: 45 }] };
    case "concealer":
      return { category, palettes: [{ color: shade.hex, colorIntensity: 55, colorUnderEyeIntensity: 60, coverageLevel: 55 }] };
    case "lip_color": {
      const palette = { color: shade.hex, texture: shade.texture ?? "satin", colorIntensity: 70 };
      if (palette.texture === "gloss") Object.assign(palette, { gloss: 60, transparencyIntensity: 30 });
      return { category, shape: { name: "original" }, palettes: [palette], style: { type: "full" } };
    }
    case "blush":
      return { category, pattern: { name: "1color1" }, palettes: [{ color: shade.hex, texture: "matte", colorIntensity: 45 }] };
    default:
      throw new YouCamError(`Try-on isn't available for ${category}`, "UnsupportedTryOn", 400);
  }
}
