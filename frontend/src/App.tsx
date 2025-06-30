import React, { useRef, useEffect, useState } from 'react';
import './App.css';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<string>("Waiting for video feed...");

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
            })
            .catch(error => {
              console.error('Error sending video feed:', error);
              setFeedback("Error: Could not connect to backend.");
            });
        }
      }
    }, 5000); // Send frame every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Basketball Coach AI</h1>
        <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }}></video>
        <canvas ref={canvasRef} style={{ border: '1px solid black' }}></canvas>
        <p>{feedback}</p>
      </header>
    </div>
  );
}

export default App;
