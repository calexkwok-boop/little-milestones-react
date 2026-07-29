import { useState, useEffect, useRef } from 'react';
import { Icon } from '../icons';
import { PATINA_JAR_QUESTIONS, PATINA_JAR_RECORD_MAX_MS } from '../constants.js';

const MIME_CANDIDATES = ['video/mp4;codecs=h264,aac', 'video/webm;codecs=vp9,opus', 'video/webm'];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function PatinaJarRecordScreen({ kid, year, monthIndex, onCancel, onUploadToCloudinary, onSave }) {
  const [facingMode, setFacingMode] = useState('environment');
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [streamReady, setStreamReady] = useState(false);

  const videoPreviewRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const elapsedTimerRef = useRef(null);
  const autoStopTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStreamReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("This browser can't access the camera to record — try a different browser or device.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: true }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
      setMediaError('');
      setStreamReady(true);
    }).catch(() => {
      setMediaError("Couldn't access the camera to record this month's question — check your camera and microphone permissions and try again.");
    });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  useEffect(() => () => {
    clearInterval(elapsedTimerRef.current);
    clearTimeout(autoStopTimerRef.current);
  }, []);

  async function handleRecordingStop() {
    if (chunksRef.current.length === 0) return;
    const mimeType = chunksRef.current[0].type || 'video/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `patina-jar.${ext}`, { type: mimeType });
    setUploading(true);
    try {
      const videoUrl = await onUploadToCloudinary(file, 'video');
      await onSave({ year, monthIndex, videoUrl });
    } catch {
      setMediaError("Couldn't save this recording — check your connection and try again.");
      setUploading(false);
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = handleRecordingStop;
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setElapsedMs(0);
    const startedAt = Date.now();
    elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    autoStopTimerRef.current = setTimeout(stopRecording, PATINA_JAR_RECORD_MAX_MS);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    clearInterval(elapsedTimerRef.current);
    clearTimeout(autoStopTimerRef.current);
    setRecording(false);
  }

  const firstName = kid.name.split(' ')[0];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#171311', zIndex: 40 }}>
      <video ref={videoPreviewRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 }}>
        <button onClick={onCancel} disabled={uploading} style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'default' : 'pointer' }}>
          <Icon name="ti-x" />
        </button>
        <span style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, fontFamily: "'Urbanist', sans-serif" }}>
          {kid.name} · {new Date(year, monthIndex - 1, 1).toLocaleDateString('en-US', { month: 'long' })}
        </span>
        {recording ? (
          <span style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 999, fontFamily: "'Urbanist', sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E05C6A', animation: 'spin 1.2s ease-in-out infinite alternate' }} />
            {formatElapsed(elapsedMs)}
          </span>
        ) : (
          <button
            onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
            disabled={uploading}
            style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'default' : 'pointer' }}
          >
            <Icon name="ti-refresh" />
          </button>
        )}
      </div>

      {mediaError && (
        <div style={{ position: 'absolute', top: 62, left: 14, right: 14, background: 'rgba(196,160,156,0.92)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 2 }}>
          <Icon name="ti-alert-circle" style={{ color: '#fff', fontSize: 15, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, color: '#fff' }}>{mediaError}</span>
        </div>
      )}

      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 108, background: 'rgba(0,0,0,0.46)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '14px 14px 12px', textAlign: 'center', zIndex: 2 }}>
        <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 8px' }}>Ask {firstName}</p>
        <p style={{ fontSize: 17, color: '#fff', fontWeight: 700, margin: 0, lineHeight: 1.4 }}>{PATINA_JAR_QUESTIONS[monthIndex]}</p>
      </div>

      <div style={{ position: 'absolute', bottom: 22, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        {uploading ? (
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: "'Urbanist', sans-serif", display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="ti-loader-2" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }} /> Saving…
          </span>
        ) : (
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={!streamReady && !recording}
            style={{ width: 62, height: 62, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.85)', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {recording
              ? <span style={{ width: 24, height: 24, borderRadius: 6, background: '#E05C6A' }} />
              : <span style={{ width: 50, height: 50, borderRadius: '50%', background: '#E05C6A' }} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default PatinaJarRecordScreen;
