import React, { useRef, useEffect, useState } from 'react';
import './App.css';

const MOTION_THRESHOLD = 50000;
const SEQUENCE_DURATION = 8000; // 8 seconds of video - better for analyzing dribbling patterns
const ANALYSIS_INTERVAL = 12000; // Analyze every 12 seconds to avoid overwhelming API

interface CoachingResponse {
  feedback: string;
  drillSuggestion?: string;
  technique?: string;
  tips?: string[];
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  
  const [feedback, setFeedback] = useState<string>("Waiting for video feed...");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [currentDrill, setCurrentDrill] = useState<string | null>(null);
  const [coachingData, setCoachingData] = useState<CoachingResponse | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("beginner");
  const [availableDrills, setAvailableDrills] = useState<any>({});
  
  const prevFrameData = useRef<Uint8ClampedArray | null>(null);
  const lastAnalysisTime = useRef<number>(0);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: 640, 
            height: 480, 
            frameRate: 30 
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Wait for video metadata to load
          videoRef.current.onloadedmetadata = () => {
            console.log("Video metadata loaded, dimensions:", videoRef.current?.videoWidth, "x", videoRef.current?.videoHeight);
          };
          
          // Setup MediaRecorder for video sequences with fallback codec
          let mediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9' };
          if (!MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType)) {
            mediaRecorderOptions = { mimeType: 'video/webm' };
            if (!MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType)) {
              mediaRecorderOptions = {}; // Use default
            }
          }
          
          const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
          mediaRecorderRef.current = mediaRecorder;
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              videoChunksRef.current.push(event.data);
            }
          };
          
          mediaRecorder.onstop = () => {
            const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
            videoChunksRef.current = [];
            analyzeVideoSequence(videoBlob);
          };
        }
      } catch (err) {
        console.error("Error accessing camera: ", err);
        setFeedback("Error: Could not access camera. Please check permissions.");
      }
    }

    setupCamera();
  }, []);

  const analyzeVideoSequence = async (videoBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('video', videoBlob, 'sequence.webm');
      formData.append('drill', currentDrill || 'general');

      const response = await fetch('http://localhost:8000/analyze_sequence', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setCoachingData(data);
      setFeedback(data.feedback);
      
      if (data.drillSuggestion && !currentDrill) {
        setCurrentDrill(data.drillSuggestion);
      }
    } catch (error) {
      console.error('Error analyzing video sequence:', error);
      setFeedback("Error: Could not analyze video sequence.");
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && canvasRef.current && mediaRecorderRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        // Check if video has valid dimensions before proceeding
        if (context && video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

          const currentFrameData = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let motionDetected = false;

          if (prevFrameData.current) {
            let diff = 0;
            for (let i = 0; i < currentFrameData.length; i += 4) {
              diff += Math.abs(currentFrameData[i] - prevFrameData.current[i]);
              diff += Math.abs(currentFrameData[i + 1] - prevFrameData.current[i + 1]);
              diff += Math.abs(currentFrameData[i + 2] - prevFrameData.current[i + 2]);
            }
            if (diff > MOTION_THRESHOLD) {
              motionDetected = true;
            }
          }

          prevFrameData.current = currentFrameData;

          const currentTime = Date.now();
          
          // Start recording when motion is detected
          if (motionDetected && !isRecording && (currentTime - lastAnalysisTime.current > ANALYSIS_INTERVAL)) {
            setIsRecording(true);
            mediaRecorderRef.current.start();
            setFeedback("Recording dribbling sequence...");
            
            // Stop recording after SEQUENCE_DURATION
            setTimeout(() => {
              if (mediaRecorderRef.current && isRecording) {
                mediaRecorderRef.current.stop();
                setIsRecording(false);
                lastAnalysisTime.current = currentTime;
              }
            }, SEQUENCE_DURATION);
          }
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isRecording, currentDrill]);

  const startDrill = (drillName: string) => {
    setCurrentDrill(drillName);
    setFeedback(`Starting ${drillName} drill. Begin dribbling!`);
  };

  const stopDrill = () => {
    setCurrentDrill(null);
    setFeedback("Drill stopped. Ready for general analysis.");
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Basketball Coach AI</h1>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <div>
            <video ref={videoRef} autoPlay playsInline muted width="640" height="480"></video>
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
            
            <div style={{ marginTop: '10px' }}>
              <div style={{ 
                padding: '10px', 
                backgroundColor: isRecording ? '#ff4444' : '#333', 
                borderRadius: '5px',
                color: 'white'
              }}>
                {isRecording && '🔴 Recording...'}
                <p>{feedback}</p>
              </div>
            </div>
          </div>
          
          <div style={{ minWidth: '300px', textAlign: 'left' }}>
            <h3>Current Drill</h3>
            {currentDrill ? (
              <div>
                <p><strong>{currentDrill}</strong></p>
                <button onClick={stopDrill} style={{ padding: '5px 10px' }}>
                  Stop Drill
                </button>
              </div>
            ) : (
              <div>
                <p>No active drill</p>
                
                <div style={{ marginBottom: '10px' }}>
                  <label>Skill Level: </label>
                  <select 
                    value={selectedCategory} 
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{ marginLeft: '5px', padding: '2px' }}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {selectedCategory === 'beginner' && (
                    <>
                      <button onClick={() => startDrill('Basic Stationary Dribble')} style={{ padding: '5px 10px' }}>
                        Basic Stationary Dribble
                      </button>
                      <button onClick={() => startDrill('Righty-Lefty Drill')} style={{ padding: '5px 10px' }}>
                        Righty-Lefty Drill
                      </button>
                      <button onClick={() => startDrill('Red Light Green Light')} style={{ padding: '5px 10px' }}>
                        Red Light Green Light
                      </button>
                      <button onClick={() => startDrill('Space Man Drill')} style={{ padding: '5px 10px' }}>
                        Space Man Drill
                      </button>
                    </>
                  )}
                  
                  {selectedCategory === 'intermediate' && (
                    <>
                      <button onClick={() => startDrill('Dribbling Around Cones')} style={{ padding: '5px 10px' }}>
                        Dribbling Around Cones
                      </button>
                      <button onClick={() => startDrill('Follow the Leader')} style={{ padding: '5px 10px' }}>
                        Follow the Leader
                      </button>
                      <button onClick={() => startDrill('Head Up Dribbling')} style={{ padding: '5px 10px' }}>
                        Head Up Dribbling
                      </button>
                      <button onClick={() => startDrill('Engine & Caboose Drill')} style={{ padding: '5px 10px' }}>
                        Engine & Caboose
                      </button>
                    </>
                  )}
                  
                  {selectedCategory === 'advanced' && (
                    <>
                      <button onClick={() => startDrill('One on One Dribbling')} style={{ padding: '5px 10px' }}>
                        One on One Dribbling
                      </button>
                      <button onClick={() => startDrill('Sharks & Minnows')} style={{ padding: '5px 10px' }}>
                        Sharks & Minnows
                      </button>
                      <button onClick={() => startDrill('Change Direction Drill')} style={{ padding: '5px 10px' }}>
                        Change Direction
                      </button>
                      <button onClick={() => startDrill('Dribble Around Defenders')} style={{ padding: '5px 10px' }}>
                        Dribble Around Defenders
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {coachingData && (
              <div style={{ marginTop: '20px' }}>
                <h3>Coaching Analysis</h3>
                {coachingData.technique && (
                  <p><strong>Technique:</strong> {coachingData.technique}</p>
                )}
                {coachingData.tips && coachingData.tips.length > 0 && (
                  <div>
                    <strong>Tips:</strong>
                    <ul style={{ textAlign: 'left' }}>
                      {coachingData.tips.map((tip, index) => (
                        <li key={index}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {coachingData.drillSuggestion && (
                  <p><strong>Suggested Drill:</strong> {coachingData.drillSuggestion}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}

export default App;
