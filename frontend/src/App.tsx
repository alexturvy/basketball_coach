import React, { useRef, useEffect, useState } from 'react';
import './App.css';

const MAX_RETRIES = 3; // Maximum retry attempts for failed requests

interface CoachingResponse {
  feedback: string;
  drillSuggestion?: string;
  technique?: string;
  tips?: string[];
}

interface DrillExample {
  title: string;
  url: string;
  duration: string;
  focus: string;
}

interface DrillInfo {
  category: string;
  description: string;
  youtube_examples: DrillExample[];
  key_points: string[];
  common_mistakes: string[];
}

type AppPhase = 'initial' | 'assessing' | 'results' | 'drilling' | 'drill-watching' | 'drill-practicing';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  
  const [phase, setPhase] = useState<AppPhase>('initial');
  const [feedback, setFeedback] = useState<string>("Ready to analyze your dribbling");
  const [isAnalysisActive, setIsAnalysisActive] = useState<boolean>(false);
  const [currentDrill, setCurrentDrill] = useState<string | null>(null);
  const [initialAssessment, setInitialAssessment] = useState<CoachingResponse | null>(null);
  const [drillFeedback, setDrillFeedback] = useState<CoachingResponse | null>(null);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [videoPaused, setVideoPaused] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [assessmentClips, setAssessmentClips] = useState(0);
  const [cumulativeFeedback, setCumulativeFeedback] = useState<string[]>([]);
  const [skillAreas, setSkillAreas] = useState<Set<string>>(new Set());
  const [baselineComplete, setBaselineComplete] = useState<boolean>(false);
  const [consolidatedAssessment, setConsolidatedAssessment] = useState<CoachingResponse | null>(null);
  const [selectedDrillInfo, setSelectedDrillInfo] = useState<DrillInfo | null>(null);
  const [drillPhase, setDrillPhase] = useState<'watching' | 'practicing' | 'completed'>('watching');
  
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
    setIsRecording(true);
    setRecordingProgress(0);
    setIsAnalysisActive(true);
    setFeedback("Recording...");
  };

  const stopRecording = () => {
    setIsRecording(false);
    setRecordingProgress(0);
    // Call analyzeVideoSequence with the recorded blob
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
        signal: AbortSignal.timeout(60000), // 60 second timeout for 10-second videos
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
        // Optimistically add a 'Processing...' entry if not already present
        setCumulativeFeedback(prev => {
          if (prev.length === assessmentClips) {
            return [...prev, 'Processing...'];
          }
          return prev;
        });
        
        if (data.feedbackList) {
          setCumulativeFeedback(prev => {
            // Replace the last entry (which should be 'Processing...') with the new feedback
            const updated = [...prev];
            updated[updated.length - 1] = data.feedbackList[data.feedbackList.length - 1].feedback;
            return updated;
          });
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
          setAssessmentClips(prev => prev + 1);
          setIsAnalysisActive(false);
          setIsRecording(false);
          setRecordingProgress(0);
          pauseVideo();
        } else {
          // Continue assessment - pause after feedback and wait for manual next
          setFeedback(`Clip ${data.clipNumber} analyzed - Click Next Clip to continue`);
          setAssessmentClips(prev => prev + 1);
          setIsAnalysisActive(false);
          setIsRecording(false);
          setRecordingProgress(0);
          pauseVideo();
        }
      } else if (phase === 'drilling' || phase === 'drill-practicing') {
        // Use drill-specific feedback endpoint
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
          setFeedback(`Practice complete - Check your feedback below`);
          setIsAnalysisActive(false);
          setIsRecording(false);
          setRecordingProgress(0);
          pauseVideo();
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
      setIsRecording(false);
      setIsAnalysisActive(false);
      setRecordingProgress(0);
      
      // Reset state so user can try again
      setTimeout(() => {
        if (phase === 'assessing') {
          setPhase('initial');
          setFeedback("Ready to analyze your dribbling. Please ensure good lighting and try again.");
        }
      }, 4000);
    }
  };

  const startDrill = async (drillName: string) => {
    try {
      // Fetch drill information including YouTube examples
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/drill/${drillName}`);
      if (response.ok) {
        const drillInfo = await response.json();
        setSelectedDrillInfo(drillInfo);
        setCurrentDrill(drillName);
        setPhase('drill-watching');
        setDrillPhase('watching');
        setDrillFeedback(null);
        setFeedback(`Learning ${drillName} - Watch the examples first`);
      }
    } catch (error) {
      console.error('Error fetching drill info:', error);
      // Fallback to old behavior
      setCurrentDrill(drillName);
      setPhase('drilling');
      setDrillFeedback(null);
      setFeedback(`Starting ${drillName} drill. Begin dribbling to get feedback!`);
    }
  };
  
  const startDrillPractice = () => {
    setPhase('drill-practicing');
    setDrillPhase('practicing');
    setIsAnalysisActive(true);
    setFeedback('Ready to practice! Start dribbling to begin recording.');
    resumeVideo();
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
    setSelectedDrillInfo(null);
    setDrillPhase('watching');
    setIsAnalysisActive(false);
    setVideoPaused(false);
    setFeedback("Ready to analyze your dribbling");
    resumeVideo();
  };

  // Clipboard component for feedback display
  const ClipboardFeedback = () => {
    if (!cumulativeFeedback || cumulativeFeedback.length === 0) return null;
    
    return (
      <div className="clipboard">
        <div className="clipboard-header">Analysis Notes ({cumulativeFeedback.length}/5)</div>
        {cumulativeFeedback.map((feedback, index) => (
          <div key={`clip-${index}-${Date.now()}`} className="clipboard-item">
            <div className="clipboard-item-header">Clip {index + 1}</div>
            <div className="clipboard-item-content">{feedback || 'Processing...'}</div>
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
  
  // Simple recording countdown (removed duplicate progress component)
  const RecordingCountdown = () => {
    if (!isRecording) return null;
    
    const remaining = Math.ceil((100 - recordingProgress) * 100 / 1000);
    return (
      <div className="recording-countdown">
        🔴 Recording: {remaining}s
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
              isAnalysisActive ? 'status-analyzing' :
              videoPaused ? 'status-paused' : 'status-ready'
            }`}>
              <div className="status-icon">
                {isAnalysisActive ? '⟳' : videoPaused ? '⏸' : '●'}
              </div>
              <span>{feedback}</span>
            </div>
            
            <RecordingCountdown />
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
                      onClick={() => {
                        const suggDrill = (baselineComplete ? consolidatedAssessment : initialAssessment)!.drillSuggestion!;
                        console.log('Starting recommended drill:', suggDrill);
                        startDrill(suggDrill);
                      }} 
                    >
                      🎯 {(baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion}
                    </button>
                  )}
                  
                  {(() => {
                    // Available drills that exist in our database
                    const availableDrills = ['Basic Stationary Dribble', 'Righty-Lefty Drill', 'Head Up Dribbling', 'Crossover Drill'];
                    const drills = [];
                    const hasControl = skillAreas.has('Ball Control');
                    const hasRhythm = skillAreas.has('Rhythm & Timing');
                    const hasPosition = skillAreas.has('Body Position');
                    
                    if (hasControl) drills.push('Basic Stationary Dribble');
                    if (hasRhythm) drills.push('Righty-Lefty Drill');
                    if (hasPosition) drills.push('Head Up Dribbling');
                    
                    // Add crossover for intermediate skills
                    if (skillAreas.size >= 2) drills.push('Crossover Drill');
                    
                    const recommendedDrill = (baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion;
                    const filteredDrills = drills.filter(drill => drill !== recommendedDrill && availableDrills.includes(drill));
                    
                    return Array.from(new Set(filteredDrills)).slice(0, 2).map((drill, index) => (
                      <button 
                        key={`drill-${index}-${drill}`}
                        className="btn"
                        onClick={() => {
                          console.log('Starting drill:', drill);
                          startDrill(drill);
                        }} 
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

            {/* Drill Watching Phase */}
            {phase === 'drill-watching' && currentDrill && selectedDrillInfo && (
              <div>
                <h3>📺 Learn: {currentDrill}</h3>
                
                <div className="card primary">
                  <h4>Drill Overview</h4>
                  <p>{selectedDrillInfo.description}</p>
                </div>
                
                {selectedDrillInfo.youtube_examples.length > 0 && (
                  <div>
                    <h4>🎥 Watch These Examples</h4>
                    {selectedDrillInfo.youtube_examples.map((example, index) => (
                      <div key={index} className="card" style={{ marginBottom: 'var(--spacing-md)' }}>
                        <h4>{example.title}</h4>
                        <p><strong>Focus:</strong> {example.focus}</p>
                        <p><strong>Duration:</strong> {example.duration}</p>
                        <a 
                          href={example.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn primary"
                          style={{ width: '100%', marginTop: 'var(--spacing-sm)' }}
                        >
                          🎥 Watch on YouTube
                        </a>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="card">
                  <h4>🎯 Key Points to Focus On</h4>
                  <ul style={{ paddingLeft: 'var(--spacing-lg)', fontSize: '0.9rem' }}>
                    {selectedDrillInfo.key_points.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>
                
                <div className="card warning">
                  <h4>⚠️ Common Mistakes to Avoid</h4>
                  <ul style={{ paddingLeft: 'var(--spacing-lg)', fontSize: '0.9rem' }}>
                    {selectedDrillInfo.common_mistakes.map((mistake, index) => (
                      <li key={index}>{mistake}</li>
                    ))}
                  </ul>
                </div>

                <div className="btn-grid">
                  <button 
                    className="btn primary"
                    onClick={startDrillPractice}
                    style={{ width: '100%' }}
                  >
                    🏀 Start Practicing
                  </button>
                  
                  <button 
                    className="btn secondary"
                    onClick={restartAssessment}
                  >
                    🔄 Back to Analysis
                  </button>
                </div>
              </div>
            )}
            
            {/* Drill Practicing Phase */}
            {phase === 'drill-practicing' && currentDrill && (
              <div>
                <h3>🏀 Practice: {currentDrill}</h3>
                
                {selectedDrillInfo && (
                  <div className="card primary">
                    <h4>Remember to Focus On:</h4>
                    <ul style={{ paddingLeft: 'var(--spacing-lg)', fontSize: '0.85rem' }}>
                      {selectedDrillInfo.key_points.slice(0, 3).map((point, index) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {drillFeedback && (
                  <div className="card success">
                    <h4>📝 Practice Feedback</h4>
                    <p>{drillFeedback.feedback}</p>
                  </div>
                )}

                <div className="btn-grid">
                  <button 
                    className="btn danger"
                    onClick={stopDrill}
                  >
                    ⏹️ Stop Practice
                  </button>
                  
                  <button 
                    className="btn secondary"
                    onClick={() => setPhase('drill-watching')}
                  >
                    📺 Review Examples
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

            {/* Legacy Drilling Phase */}
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
