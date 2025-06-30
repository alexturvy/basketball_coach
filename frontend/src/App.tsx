import React, { useRef, useEffect, useState } from 'react';
import './App.css';

const MOTION_THRESHOLD = 100000; // Adjust this value based on sensitivity needed
const MIN_SEND_INTERVAL = 1000; // Minimum time in ms between sending frames

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<string>("Waiting for video feed...");
  const prevFrameData = useRef<Uint8ClampedArray | null>(null);
  const lastSentTime = useRef<number>(0);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera: ", err);
      }
    }

    setupCamera();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

          const currentFrameData = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let motionDetected = false;

          if (prevFrameData.current) {
            let diff = 0;
            for (let i = 0; i < currentFrameData.length; i += 4) { // Check R, G, B channels
              diff += Math.abs(currentFrameData[i] - prevFrameData.current[i]);
              diff += Math.abs(currentFrameData[i + 1] - prevFrameData.current[i + 1]);
              diff += Math.abs(currentFrameData[i + 2] - prevFrameData.current[i + 2]);
            }
            if (diff > MOTION_THRESHOLD) {
              motionDetected = true;
            }
          } else {
            // First frame, always send to establish baseline
            motionDetected = true;
          }

          prevFrameData.current = currentFrameData;

          const currentTime = Date.now();
          if (motionDetected && (currentTime - lastSentTime.current > MIN_SEND_INTERVAL)) {
            const imageData = canvas.toDataURL('image/jpeg');

            fetch('http://localhost:8000/video_feed', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ image: imageData }),
            })
              .then(response => response.json())
              .then(data => {
                setFeedback(data.message);
                lastSentTime.current = currentTime;
              })
              .catch(error => {
                console.error('Error sending video feed:', error);
                setFeedback("Error: Could not connect to backend.");
              });
          }
        }
      }
    }, 200); // Check for motion every 200ms

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Basketball Coach AI</h1>
        <video ref={videoRef} autoPlay playsInline muted width="640" height="480"></video>
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        <p>{feedback}</p>
      </header>
    </div>
  );
}

export default App;
