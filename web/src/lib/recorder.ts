import { currentScene } from "../state/share";

// Records the 3D view straight from the WebGL canvas into a WebM video, then saves it.
// Frames are only drawn when something changes, so the video advances with the action.

let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];

export function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

export function isRecording() {
  return !!rec && rec.state === "recording";
}

export function startRecording(): boolean {
  const canvas = currentScene()?.canvas;
  if (!canvas || !canRecord()) return false;
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const stream = canvas.captureStream(60);
  rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 16_000_000 } : undefined);
  chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start(250);
  return true;
}

export function stopRecording(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (!rec) return resolve();
    const r = rec;
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      chunks = [];
      rec = null;
      resolve();
    };
    r.stop();
    r.stream.getTracks().forEach((t) => t.stop());
  });
}
