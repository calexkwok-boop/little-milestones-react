// Client-side video export for reels — captures a <canvas> being drawn in
// real time (via reelExportDraw.js) into an actual video file, so it can be
// handed to navigator.share({ files: [...] }) and reach Instagram (or
// anything else) as real media instead of only a web link. Silent by design
// — the reel's music is unlicensed iTunes preview clips, streamed live and
// never persisted as a file; baking it into a downloadable export is a
// licensing problem this deliberately avoids. See the plan doc
// ("Export reel to video, share to Instagram") for the full reasoning.
import { CANVAS_W, CANVAS_H, buildExportTimeline, preloadAssets, drawFrameAt } from './reelExportDraw.js';

const CANDIDATE_MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATE_MIME_TYPES.find(t => MediaRecorder.isTypeSupported(t)) || null;
}

export function isReelExportSupported() {
  return typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    && !!pickSupportedMimeType();
}

// Two-phase progress: preloading assets (0-0.3) then the real-time capture
// itself (0.3-1.0) — preload is comparatively quick but not instant, and a
// progress bar that sits at 0% while photos/videos fetch reads as hung.
function scaledProgress(phase, phaseProgress) {
  return phase === 'preload' ? phaseProgress * 0.3 : 0.3 + phaseProgress * 0.7;
}

export async function exportReelToVideo({ slides, monthLabel, quote, stats, onProgress, signal }) {
  const mimeType = pickSupportedMimeType();
  if (!mimeType) throw new Error('Video export is not supported in this browser.');

  const timeline = buildExportTimeline(slides, { monthLabel, quote, stats });
  const assets = await preloadAssets(timeline, p => onProgress?.(scaledProgress('preload', p)));
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_500_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const recordingDone = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error'));
  });

  recorder.start(200); // flush progressively rather than buffering one huge blob at the very end

  await new Promise((resolve) => {
    const startTime = performance.now();
    function frame(now) {
      if (signal?.aborted) { recorder.stop(); resolve(); return; }
      const elapsed = now - startTime;
      drawFrameAt(ctx, timeline, Math.min(elapsed, timeline.totalMs), assets);
      onProgress?.(scaledProgress('capture', Math.min(1, elapsed / timeline.totalMs)));
      if (elapsed >= timeline.totalMs) { recorder.stop(); resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  const blob = await recordingDone;
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
  return { blob, mimeType, durationMs: timeline.totalMs };
}

// A distinct, later check from isReelExportSupported() — Web Share's OS-level
// file-size limits (roughly ~50MB on some platforms) can reject a share even
// when the upfront capability check passed, so this needs the *actual*
// rendered file, not just a feature-detect.
export function canShareVideoFile(file, { title } = {}) {
  const shareData = { files: [file], title: title || 'Patina reel', text: 'Made with Patina' };
  return typeof navigator.canShare === 'function' && navigator.canShare(shareData) ? shareData : null;
}

export function blobToShareableFile(blob, mimeType) {
  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  return new File([blob], `patina-reel.${ext}`, { type: mimeType });
}
