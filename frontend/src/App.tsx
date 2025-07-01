import React, { useRef, useEffect, useState } from 'react';
import './App.css';

const MOTION_THRESHOLD = 25000; // Lower threshold = more sensitive
const SEQUENCE_DURATION = 5000; // 5 seconds of video - smaller files for better processing
const ANALYSIS_INTERVAL = 12000; // Analyze every 12 seconds to avoid overwhelming API
const MAX_RETRIES = 3; // Maximum retry attempts for failed requests

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
  const [feedback, setFeedback] = useState<string>("Ready to analyze your dribbling");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isAnalysisActive, setIsAnalysisActive] = useState<boolean>(false);
  const [currentDrill, setCurrentDrill] = useState<string | null>(null);
  const [initialAssessment, setInitialAssessment] = useState<CoachingResponse | null>(null);
  const [drillFeedback, setDrillFeedback] = useState<CoachingResponse | null>(null);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [videoPaused, setVideoPaused] = useState<boolean>(false);
  const [recordingProgress, setRecordingProgress] = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [retryCount, setRetryCount] = useState<number>(0);
  
  // Progressive assessment state
  const [assessmentClips, setAssessmentClips] = useState<number>(0);
  const [cumulativeFeedback, setCumulativeFeedback] = useState<string[]>([]);
  const [skillAreas, setSkillAreas] = useState<Set<string>>(new Set());
  const [baselineComplete, setBaselineComplete] = useState<boolean>(false);
  const [consolidatedAssessment, setConsolidatedAssessment] = useState<CoachingResponse | null>(null);
  
  const prevFrameData = useRef<Uint8ClampedArray | null>(null);
  const lastAnalysisTime = useRef<number>(0);

  useEffect(() => {
    async function setupCamera() {
      console.log('Basketball Coach: Setting up camera...');
      console.log('API URL:', process.env.REACT_APP_API_URL || 'http://localhost:8000');
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
            setCameraReady(true);
          };
          
          // Setup MediaRecorder for video sequences with better codec fallbacks
          let mediaRecorderOptions: MediaRecorderOptions = {};
          
          // Try different codecs in order of preference - prioritize smaller files
          const codecs = [
            'video/webm;codecs=vp8', // Better compression
            'video/webm;codecs=vp9',
            'video/webm',
            'video/mp4',
            '' // Default
          ];
          
          for (const codec of codecs) {
            const options = codec ? { 
              mimeType: codec,
              videoBitsPerSecond: 500000 // 500kbps for smaller files
            } : { videoBitsPerSecond: 500000 };
            if (!codec || MediaRecorder.isTypeSupported(codec)) {
              mediaRecorderOptions = options;
              console.log('Using MediaRecorder codec:', codec || 'default');
              break;
            }
          }
          
          let mediaRecorder: MediaRecorder;
          
          try {
            mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
            console.log('MediaRecorder created successfully');
          } catch (codecError) {
            console.error('MediaRecorder creation failed, trying default:', codecError);
            // Fallback to default (no codec specified)
            mediaRecorder = new MediaRecorder(stream);
            console.log('MediaRecorder created with default codec');
          }
          
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
        setError("Could not access camera. Please check permissions and ensure you're using HTTPS.");
        setFeedback("Error: Could not access camera. Please check permissions.");
      }
    }

    setupCamera();
  }, []);

  const startAnalysis = async () => {
    // Clear any existing session to start fresh
    const oldSessionId = localStorage.getItem('basketballCoachSessionId');
    if (oldSessionId) {
      try {
        await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/session/${oldSessionId}`, {
          method: 'DELETE',
        });
        console.log('Cleared old session:', oldSessionId);
      } catch (error) {
        console.warn('Failed to clear old session:', error);
      }
      localStorage.removeItem('basketballCoachSessionId');
    }
    
    // Generate a new session ID for fresh analysis
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('basketballCoachSessionId', newSessionId);
    console.log('Starting new analysis with session ID:', newSessionId);
    
    // Reset local state to ensure fresh start
    setAssessmentClips(0);
    setCumulativeFeedback([]);
    setSkillAreas(new Set());
    setBaselineComplete(false);
    setConsolidatedAssessment(null);
    setRetryCount(0);
    setRecordingProgress(0);
    
    setIsAnalysisActive(true);
    setPhase('assessing');
    setFeedback("Recording...");
    resumeVideo();
  };

  const pauseVideo = () => {
    setVideoPaused(true);
    if (videoRef.current) {
      videoRef.current.style.opacity = '0.6';
    }
  };

  const resumeVideo = () => {
    setVideoPaused(false);
    if (videoRef.current) {
      videoRef.current.style.opacity = '1';
    }
  };

  const nextClip = () => {
    setIsAnalysisActive(true);
    setFeedback("Recording...");
    resumeVideo();
  };

  const analyzeVideoSequence = async (videoBlob: Blob, attempt: number = 1) => {
    try {
      console.log('Sending video for progressive analysis...', videoBlob.size, 'bytes', `(attempt ${attempt})`);
      
      // Generate or use existing session ID
      let sessionId = localStorage.getItem('basketballCoachSessionId');
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('basketballCoachSessionId', sessionId);
        console.log('Generated new session ID:', sessionId);
      } else {
        console.log('Using existing session ID:', sessionId);
      }
      
      const formData = new FormData();
      formData.append('video', videoBlob, 'sequence.webm');
      formData.append('sessionId', sessionId);

      setFeedback(attempt > 1 ? `Retrying analysis (${attempt}/${MAX_RETRIES})...` : 'Analyzing your dribbling technique...');

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/progressive_analysis`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Progressive analysis response:', data);
      console.log('Backend says clipNumber:', data.clipNumber, 'saturated:', data.saturated, 'feedbackList length:', data.feedbackList?.length);
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      if (phase === 'initial' || phase === 'assessing') {
        // Update feedback list with new clip
        if (data.feedbackList) {
          setCumulativeFeedback(data.feedbackList.map((f: any) => f.feedback));
          console.log('Updated feedbackList:', data.feedbackList.length, 'items');
          
          // Update skill areas from key themes
          if (data.keyThemes) {
            setSkillAreas(new Set(data.keyThemes));
          }
        }
        
        if (data.saturated && data.consolidatedFeedback) {
          // Assessment is complete - show consolidated results
          setBaselineComplete(true);
          setConsolidatedAssessment(data.consolidatedFeedback);
          setPhase('results');
          setFeedback("Assessment Complete");
          setAssessmentClips(data.clipNumber); // Use actual clip number from backend
          setIsAnalysisActive(false);
          pauseVideo();
        } else {
          // Continue assessment - pause after feedback
          setFeedback("Clip Analyzed");
          setAssessmentClips(data.clipNumber);
          setIsAnalysisActive(false);
          pauseVideo();
        }
      } else if (phase === 'drilling') {
        // Use old endpoint for drill-specific feedback
        const drillFormData = new FormData();
        drillFormData.append('video', videoBlob, 'sequence.webm');
        drillFormData.append('drill', currentDrill || 'general');

        const drillResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/analyze_sequence`, {
          method: 'POST',
          body: drillFormData,
        });

        if (drillResponse.ok) {
          const drillData = await drillResponse.json();
          setDrillFeedback(drillData);
          setFeedback(`${currentDrill} - ${drillData.feedback}`);
        }
      }
    } catch (error) {
      console.error('Error analyzing video sequence:', error);
      
      // Check if this is a network error and we can retry
      const isNetworkError = error instanceof TypeError || 
                            (error instanceof Error && error.message.includes('Failed to fetch'));
      
      if (isNetworkError && attempt < MAX_RETRIES) {
        console.log(`Network error detected, retrying in 2 seconds... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        setFeedback(`Connection failed, retrying in 2 seconds... (${attempt}/${MAX_RETRIES})`);
        
        setTimeout(() => {
          analyzeVideoSequence(videoBlob, attempt + 1);
        }, 2000);
        return;
      }
      
      // Provide specific error messages
      let errorMessage = 'Unknown error occurred';
      if (error instanceof TypeError || (error instanceof Error && error.message.includes('Failed to fetch'))) {
        errorMessage = 'Unable to connect to analysis service. Please check your internet connection and try again.';
      } else if (error instanceof Error && error.name === 'AbortError') {
        errorMessage = 'Analysis timed out. Please try again with better lighting and video quality.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setFeedback(`Analysis failed: ${errorMessage}`);
      setRetryCount(0); // Reset retry count
      
      // Reset state so user can try again
      setTimeout(() => {
        if (phase === 'assessing') {
          setPhase('initial');
          setFeedback("Ready to analyze your dribbling. Please ensure good lighting and try again.");
        }
      }, 4000);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
            
            // Debug motion detection every 2 seconds
            if (Date.now() % 2000 < 200) {
              console.log('Motion diff:', diff, 'Threshold:', MOTION_THRESHOLD, 'Motion detected:', diff > MOTION_THRESHOLD);
            }
            
            if (diff > MOTION_THRESHOLD) {
              motionDetected = true;
            }
          }

          prevFrameData.current = currentFrameData;

          const currentTime = Date.now();
          const timeSinceLastAnalysis = currentTime - lastAnalysisTime.current;
          
          // Debug recording conditions
          if (motionDetected && Date.now() % 2000 < 200) {
            console.log('Recording conditions:', {
              motionDetected,
              isRecording,
              timeSinceLastAnalysis,
              analysisInterval: ANALYSIS_INTERVAL,
              phase,
              mediaRecorderExists: !!mediaRecorderRef.current
            });
          }
          
          // Start recording when motion is detected AND analysis is active
          if (motionDetected && !isRecording && isAnalysisActive && (timeSinceLastAnalysis > ANALYSIS_INTERVAL) && mediaRecorderRef.current) {
            console.log('🔴 Starting recording...');
            setIsRecording(true);
            setRecordingProgress(0);
            
            try {
              mediaRecorderRef.current.start();
              console.log('MediaRecorder.start() called successfully');
              
              const startTime = Date.now();
              
              // Progress tracking interval
              const progressInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(100, (elapsed / SEQUENCE_DURATION) * 100);
                setRecordingProgress(progress);
                
                const remaining = Math.ceil((SEQUENCE_DURATION - elapsed) / 1000);
                setFeedback(`Recording... ${remaining}s`);
                
                if (elapsed >= SEQUENCE_DURATION) {
                  clearInterval(progressInterval);
                }
              }, 100);
              
              // Stop recording after SEQUENCE_DURATION
              setTimeout(() => {
                console.log('⏹️ Stopping recording after timeout...');
                clearInterval(progressInterval);
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                  mediaRecorderRef.current.stop();
                  console.log('MediaRecorder.stop() called');
                }
                setIsRecording(false);
                setRecordingProgress(0);
                lastAnalysisTime.current = currentTime;
              }, SEQUENCE_DURATION);
              
            } catch (recordError) {
              console.error('Failed to start recording:', recordError);
              setIsRecording(false);
            }
          }
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isRecording, currentDrill, phase, isAnalysisActive]);

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const consolidateFeedback = (feedbackArray: string[], tips: string[], skills: Set<string>): CoachingResponse => {
    // Consolidate multiple feedback pieces into comprehensive assessment
    const allFeedback = feedbackArray.join(' ');
    
    // Extract common themes and patterns
    const themes = [];
    if (allFeedback.toLowerCase().includes('control')) themes.push('needs improved ball control');
    if (allFeedback.toLowerCase().includes('rhythm')) themes.push('should focus on consistent rhythm');
    if (allFeedback.toLowerCase().includes('posture')) themes.push('requires better body positioning');
    if (allFeedback.toLowerCase().includes('height')) themes.push('needs to work on dribble height consistency');
    
    // Determine skill level from patterns
    let skillLevel = 'intermediate';
    const beginnerTerms = ['basic', 'fundamental', 'beginner', 'learning'];
    const advancedTerms = ['advanced', 'complex', 'sophisticated', 'excellent'];
    
    if (beginnerTerms.some(term => allFeedback.toLowerCase().includes(term))) {
      skillLevel = 'beginner';
    } else if (advancedTerms.some(term => allFeedback.toLowerCase().includes(term))) {
      skillLevel = 'advanced';
    }
    
    // Create consolidated feedback
    const consolidatedText = `Based on ${feedbackArray.length} clips, I've identified your key areas: ${Array.from(skills).join(', ')}. ${themes.length > 0 ? 'Focus areas: ' + themes.join(', ') + '.' : ''}`;
    
    // Deduplicate tips
    const uniqueTips = Array.from(new Set(tips));
    
    // Suggest appropriate drill based on skill level and identified areas
    let drillSuggestion = 'Basic Stationary Dribble';
    if (skillLevel === 'beginner') {
      if (skills.has('Ball Control')) drillSuggestion = 'Basic Stationary Dribble';
      else if (skills.has('Hand Technique')) drillSuggestion = 'Righty-Lefty Drill';
    } else if (skillLevel === 'intermediate') {
      if (skills.has('Body Position')) drillSuggestion = 'Head Up Dribbling';
      else drillSuggestion = 'Dribbling Around Cones';
    } else {
      drillSuggestion = 'One on One Dribbling';
    }
    
    return {
      feedback: consolidatedText,
      technique: Array.from(skills)[0] || 'Ball Control',
      tips: uniqueTips.slice(0, 5), // Top 5 tips
      drillSuggestion
    };
  };

  const restartAssessment = async () => {
    // Clear session on backend
    const sessionId = localStorage.getItem('basketballCoachSessionId');
    if (sessionId) {
      try {
        await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/session/${sessionId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn('Failed to clear session:', error);
      }
      localStorage.removeItem('basketballCoachSessionId');
    }
    
    // Reset local state
    setPhase('initial');
    setCurrentDrill(null);
    setInitialAssessment(null);
    setDrillFeedback(null);
    setAssessmentClips(0);
    setCumulativeFeedback([]);
    setSkillAreas(new Set());
    setBaselineComplete(false);
    setConsolidatedAssessment(null);
    setIsAnalysisActive(false);
    setVideoPaused(false);
    setFeedback("Ready to analyze your dribbling");
    resumeVideo();
  };

  // Clipboard component for feedback display
  const ClipboardFeedback = () => {
    if (cumulativeFeedback.length === 0) return null;
    
    return (
      <div className="clipboard">
        <div className="clipboard-header">Analysis Notes</div>
        {cumulativeFeedback.map((feedback, index) => (
          <div key={index} className="clipboard-item">
            <div className="clipboard-item-header">Clip {index + 1}</div>
            <div className="clipboard-item-content">{feedback}</div>
          </div>
        ))}
      </div>
    );
  };

  // Progress dots component
  const ProgressDots = () => (
    <div className="progress-compact">
      <div className="progress-dots">
        {[...Array(5)].map((_, index) => (
          <div 
            key={index} 
            className={`progress-dot ${
              index < assessmentClips ? 'completed' : 
              index === assessmentClips ? 'active' : ''
            }`}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{assessmentClips}/5</span>
    </div>
  );
  
  // Recording progress component
  const RecordingProgress = () => {
    if (!isRecording || recordingProgress === 0) return null;
    
    return (
      <div className="recording-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill recording" 
            style={{ width: `${recordingProgress}%` }}
          />
        </div>
        <div className="recording-timer">
          📹 Recording: {Math.ceil((100 - recordingProgress) * 50 / 1000)}s
        </div>
      </div>
    );
  };

  // Error boundary with ESPN styling
  if (error) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>🏀 Basketball Dribbling Coach</h1>
          <div className="error-container">
            <h3>⚠️ Setup Issue</h3>
            <p>{error}</p>
            <div className="card" style={{ textAlign: 'left', marginTop: 'var(--spacing-lg)' }}>
              <h4>Troubleshooting Steps:</h4>
              <ul>
                <li>Make sure you're using HTTPS (not HTTP)</li>
                <li>Check browser permissions for camera access</li>
                <li>Try refreshing the page</li>
                <li>Try a different browser (Chrome works best)</li>
              </ul>
            </div>
            <button 
              className="btn primary"
              onClick={() => window.location.reload()} 
              style={{ marginTop: 'var(--spacing-lg)' }}
            >
              🔄 Reload Page
            </button>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>🏀 Basketball Dribbling Coach</h1>
        
        {!cameraReady && (
          <div className="card warning">
            <p>📹 Setting up camera... Please allow camera access when prompted.</p>
          </div>
        )}
        
        <div className="main-container">
          {/* Video Section */}
          <div className="video-section">
            <div className="video-container">
              <video ref={videoRef} autoPlay playsInline muted></video>
              <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
            </div>
            
            <div className={`status-minimal ${
              isRecording ? 'status-recording' : 
              isAnalysisActive ? 'status-analyzing' :
              videoPaused ? 'status-paused' : 'status-ready'
            }`}>
              <div className="status-icon">
                {isRecording ? '●' : isAnalysisActive ? '⟳' : videoPaused ? '⏸' : '●'}
              </div>
              <span>{feedback}</span>
            </div>
            
            <RecordingProgress />
          </div>
          
          {/* Coaching Panel */}
          <div className="coaching-panel">
            
            {/* Initial Phase */}
            {phase === 'initial' && (
              <div>
                <h3>🏀 Dribbling Analysis</h3>
                <div className="card primary">
                  <h4>Ready to Start</h4>
                  <p>Position yourself in front of the camera and click when ready.</p>
                  <button 
                    className="btn primary"
                    onClick={startAnalysis}
                    style={{ width: '100%', marginTop: 'var(--spacing-md)' }}
                  >
                    🎯 Start Analysis
                  </button>
                </div>
                
                <div className="card" style={{ marginTop: 'var(--spacing-md)' }}>
                  <h4>📹 Recording Tips</h4>
                  <ul style={{ fontSize: '0.85rem', lineHeight: '1.4', paddingLeft: 'var(--spacing-md)' }}>
                    <li>Stand 3-6 feet from camera</li>
                    <li>Works in any lighting conditions</li>
                    <li>Click Start Analysis, then dribble</li>
                    <li>Each clip records for 5 seconds</li>
                    <li>Works with any background/setting</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Assessing Phase */}
            {phase === 'assessing' && (
              <div>
                <h3>Analysis in Progress</h3>
                <ProgressDots />
                
                <ClipboardFeedback />
                
                {!isAnalysisActive && !baselineComplete && (
                  <button 
                    className="btn primary"
                    onClick={nextClip}
                    style={{ width: '100%', marginTop: 'var(--spacing-md)' }}
                  >
                    📹 Next Clip
                  </button>
                )}
                
                {skillAreas.size > 0 && (
                  <div className="skill-tags">
                    {Array.from(skillAreas).map((area, index) => (
                      <span key={index} className="skill-tag">{area}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results Phase */}
            {phase === 'results' && (baselineComplete ? consolidatedAssessment : initialAssessment) && (
              <div>
                <h3>📊 Results</h3>
                
                <ClipboardFeedback />
                
                {skillAreas.size > 0 && (
                  <div className="skill-tags">
                    {Array.from(skillAreas).map((area, index) => (
                      <span key={index} className="skill-tag">{area}</span>
                    ))}
                  </div>
                )}
                
                <div className="card primary">
                  <h4>Assessment Summary</h4>
                  <p>{(baselineComplete ? consolidatedAssessment : initialAssessment)?.feedback}</p>
                </div>

                <h4>🏀 Training Drills</h4>
                <div className="btn-grid">
                  {(baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion && (
                    <button 
                      className="btn primary"
                      onClick={() => startDrill((baselineComplete ? consolidatedAssessment : initialAssessment)!.drillSuggestion!)} 
                    >
                      🎯 {(baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion}
                    </button>
                  )}
                  
                  {(() => {
                    const drills = [];
                    const hasControl = skillAreas.has('Ball Control');
                    const hasRhythm = skillAreas.has('Rhythm & Timing');
                    const hasPosition = skillAreas.has('Body Position');
                    
                    if (hasControl) drills.push('Basic Stationary Dribble');
                    if (hasRhythm) drills.push('Red Light Green Light');
                    if (hasPosition) drills.push('Head Up Dribbling');
                    
                    const recommendedDrill = (baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion;
                    const filteredDrills = drills.filter(drill => drill !== recommendedDrill);
                    
                    return Array.from(new Set(filteredDrills)).slice(0, 2).map((drill, index) => (
                      <button 
                        key={index}
                        className="btn"
                        onClick={() => startDrill(drill)} 
                      >
                        🏀 {drill}
                      </button>
                    ));
                  })()}
                </div>
                
                <button 
                  className="btn secondary"
                  onClick={restartAssessment}
                  style={{ marginTop: 'var(--spacing-lg)', width: '100%' }}
                >
                  🔄 New Analysis
                </button>
              </div>
            )}

            {/* Drilling Phase */}
            {phase === 'drilling' && currentDrill && (
              <div>
                <h3>🎯 {currentDrill}</h3>
                
                {drillFeedback && (
                  <div className="card success">
                    <h4>Performance Notes</h4>
                    <p>{drillFeedback.feedback}</p>
                  </div>
                )}

                <div className="btn-grid">
                  <button 
                    className="btn danger"
                    onClick={stopDrill}
                  >
                    ⏹️ Stop
                  </button>
                  
                  <button 
                    className="btn secondary"
                    onClick={restartAssessment}
                  >
                    🔄 New Analysis
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
