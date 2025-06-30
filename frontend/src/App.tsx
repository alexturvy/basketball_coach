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

type AppPhase = 'initial' | 'assessing' | 'results' | 'drilling';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  
  const [phase, setPhase] = useState<AppPhase>('initial');
  const [feedback, setFeedback] = useState<string>("Basketball Dribbling Coach - Start dribbling to begin your assessment!");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [currentDrill, setCurrentDrill] = useState<string | null>(null);
  const [initialAssessment, setInitialAssessment] = useState<CoachingResponse | null>(null);
  const [drillFeedback, setDrillFeedback] = useState<CoachingResponse | null>(null);
  const [recommendedDrills, setRecommendedDrills] = useState<string[]>([]);
  
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
          let mediaRecorderOptions: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9' };
          if (!MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType!)) {
            mediaRecorderOptions = { mimeType: 'video/webm' };
            if (!MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType!)) {
              mediaRecorderOptions = { mimeType: 'video/webm' }; // Use basic webm as fallback
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

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/analyze_sequence`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (phase === 'initial' || phase === 'assessing') {
        // Initial assessment phase
        setInitialAssessment(data);
        setPhase('results');
        setFeedback("Analysis complete! Here's what I noticed...");
        
        // Set recommended drills based on assessment
        const drills = [];
        if (data.drillSuggestion) drills.push(data.drillSuggestion);
        
        // Add skill-appropriate drills based on feedback content
        const feedbackLower = data.feedback.toLowerCase();
        if (feedbackLower.includes('beginner') || feedbackLower.includes('basic')) {
          drills.push('Basic Stationary Dribble', 'Righty-Lefty Drill');
        } else if (feedbackLower.includes('intermediate')) {
          drills.push('Head Up Dribbling', 'Dribbling Around Cones');
        } else if (feedbackLower.includes('advanced')) {
          drills.push('One on One Dribbling', 'Sharks & Minnows');
        }
        
        setRecommendedDrills(Array.from(new Set(drills))); // Remove duplicates
      } else if (phase === 'drilling') {
        // Drill-specific feedback
        setDrillFeedback(data);
        setFeedback(`${currentDrill} - ${data.feedback}`);
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
          
          // Start recording when motion is detected - behavior depends on phase
          if (motionDetected && !isRecording && (currentTime - lastAnalysisTime.current > ANALYSIS_INTERVAL)) {
            setIsRecording(true);
            mediaRecorderRef.current.start();
            
            if (phase === 'initial') {
              setPhase('assessing');
              setFeedback("Analyzing your dribbling technique...");
            } else if (phase === 'drilling') {
              setFeedback(`Recording ${currentDrill} performance...`);
            }
            
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
  }, [isRecording, currentDrill, phase]);

  const startDrill = (drillName: string) => {
    setCurrentDrill(drillName);
    setPhase('drilling');
    setDrillFeedback(null);
    setFeedback(`Starting ${drillName} drill. Begin dribbling to get feedback!`);
  };

  const stopDrill = () => {
    setCurrentDrill(null);
    setPhase('results');
    setDrillFeedback(null);
    setFeedback("Drill stopped. Choose another drill or restart assessment.");
  };

  const restartAssessment = () => {
    setPhase('initial');
    setCurrentDrill(null);
    setInitialAssessment(null);
    setDrillFeedback(null);
    setRecommendedDrills([]);
    setFeedback("Basketball Dribbling Coach - Start dribbling to begin your assessment!");
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🏀 Basketball Dribbling Coach</h1>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {/* Video Feed */}
          <div>
            <video ref={videoRef} autoPlay playsInline muted width="640" height="480"></video>
            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
            
            <div style={{ marginTop: '10px' }}>
              <div style={{ 
                padding: '15px', 
                backgroundColor: isRecording ? '#ff4444' : '#333', 
                borderRadius: '8px',
                color: 'white',
                fontSize: '16px'
              }}>
                {isRecording && '🔴 Recording...'}
                <p style={{ margin: 0 }}>{feedback}</p>
              </div>
            </div>
          </div>
          
          {/* Coaching Panel */}
          <div style={{ minWidth: '350px', textAlign: 'left' }}>
            
            {/* Initial Phase */}
            {phase === 'initial' && (
              <div>
                <h3>Welcome to Your Personal Dribbling Coach!</h3>
                <p>I'll analyze your dribbling and create a personalized training plan.</p>
                <div style={{ 
                  padding: '15px', 
                  backgroundColor: '#e8f4fd', 
                  borderRadius: '8px',
                  color: '#333',
                  marginTop: '10px'
                }}>
                  <p><strong>🎯 Ready to start?</strong></p>
                  <p>Just start dribbling in front of the camera. I'll watch your technique and give you specific areas to work on!</p>
                </div>
              </div>
            )}

            {/* Assessing Phase */}
            {phase === 'assessing' && (
              <div>
                <h3>Analyzing Your Technique...</h3>
                <div style={{ 
                  padding: '15px', 
                  backgroundColor: '#fff3cd', 
                  borderRadius: '8px',
                  color: '#333'
                }}>
                  <p>🔍 I'm watching your dribbling form, rhythm, and control...</p>
                  <p>Keep dribbling naturally - this will only take a moment!</p>
                </div>
              </div>
            )}

            {/* Results Phase */}
            {phase === 'results' && initialAssessment && (
              <div>
                <h3>📊 Assessment Results</h3>
                
                <div style={{ 
                  padding: '15px', 
                  backgroundColor: '#d4edda', 
                  borderRadius: '8px',
                  color: '#333',
                  marginBottom: '15px'
                }}>
                  <h4>What I Noticed:</h4>
                  <p>{initialAssessment.feedback}</p>
                  
                  {initialAssessment.technique && (
                    <p><strong>Key Focus Area:</strong> {initialAssessment.technique}</p>
                  )}
                  
                  {initialAssessment.tips && initialAssessment.tips.length > 0 && (
                    <div>
                      <strong>Quick Tips:</strong>
                      <ul>
                        {initialAssessment.tips.map((tip, index) => (
                          <li key={index}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <h4>Recommended Drills:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recommendedDrills.map((drill, index) => (
                    <button 
                      key={index}
                      onClick={() => startDrill(drill)} 
                      style={{ 
                        padding: '12px 15px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      🎯 {drill}
                    </button>
                  ))}
                </div>
                
                <button 
                  onClick={restartAssessment}
                  style={{ 
                    padding: '10px 15px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    marginTop: '15px',
                    fontSize: '14px'
                  }}
                >
                  🔄 New Assessment
                </button>
              </div>
            )}

            {/* Drilling Phase */}
            {phase === 'drilling' && currentDrill && (
              <div>
                <h3>🎯 {currentDrill}</h3>
                
                <div style={{ 
                  padding: '15px', 
                  backgroundColor: '#fff3cd', 
                  borderRadius: '8px',
                  color: '#333',
                  marginBottom: '15px'
                }}>
                  <p>Practice this drill and I'll give you real-time feedback on your performance!</p>
                </div>

                {drillFeedback && (
                  <div style={{ 
                    padding: '15px', 
                    backgroundColor: '#d4edda', 
                    borderRadius: '8px',
                    color: '#333',
                    marginBottom: '15px'
                  }}>
                    <h4>Performance Feedback:</h4>
                    <p>{drillFeedback.feedback}</p>
                    
                    {drillFeedback.tips && drillFeedback.tips.length > 0 && (
                      <div>
                        <strong>Improvement Tips:</strong>
                        <ul>
                          {drillFeedback.tips.map((tip, index) => (
                            <li key={index}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={stopDrill}
                    style={{ 
                      padding: '10px 15px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    ⏹️ Stop Drill
                  </button>
                  
                  <button 
                    onClick={restartAssessment}
                    style={{ 
                      padding: '10px 15px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 New Assessment
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}

export default App;
