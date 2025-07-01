import { useRef, useState, useEffect } from 'react';

export interface UseVideoRecorderOptions {
  onStop?: (blob: Blob) => void;
}

export function useVideoRecorder(options: UseVideoRecorderOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
          const recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
          recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            chunksRef.current = [];
            options.onStop?.(blob);
          };
          mediaRecorderRef.current = recorder;
        }
      } catch (err) {
        console.error('Camera setup failed', err);
      }
    }
    setupCamera();
  }, []);

  return {
    videoRef,
    ready,
    start: () => mediaRecorderRef.current?.start(),
    stop: () => mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop(),
  };
}
