import React, { useRef, useEffect, useState } from 'react';
import './App.css';

const MOTION_THRESHOLD = 25000; // Lower threshold = more sensitive
const SEQUENCE_DURATION = 5000; // 5 seconds of video - smaller files for better processing
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
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Progressive assessment state
  const [assessmentClips, setAssessmentClips] = useState<number>(0);
  const [cumulativeFeedback, setCumulativeFeedback] = useState<string[]>([]);
  const [allTips, setAllTips] = useState<string[]>([]);
  const [skillAreas, setSkillAreas] = useState<Set<string>>(new Set());
  const [baselineComplete, setBaselineComplete] = useState<boolean>(false);
  const [consolidatedAssessment, setConsolidatedAssessment] = useState<CoachingResponse | null>(null);
  
  const MAX_ASSESSMENT_CLIPS = 4; // Collect 4 clips for baseline assessment
  
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

  const analyzeVideoSequence = async (videoBlob: Blob) => {
    try {
      console.log('Sending video for progressive analysis...', videoBlob.size, 'bytes');
      
      // Generate or use existing session ID
      let sessionId = localStorage.getItem('basketballCoachSessionId');
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('basketballCoachSessionId', sessionId);
      }
      
      const formData = new FormData();
      formData.append('video', videoBlob, 'sequence.webm');
      formData.append('sessionId', sessionId);

      setFeedback('Analyzing your dribbling technique...');

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/progressive_analysis`, {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Progressive analysis response:', data);
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      if (phase === 'initial' || phase === 'assessing') {
        // Update feedback list with new clip
        if (data.feedbackList) {
          setCumulativeFeedback(data.feedbackList.map((f: any) => f.feedback));
          
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
          setFeedback(`Assessment complete! Analyzed ${data.feedbackList?.length || 5} clips and identified key areas for improvement.`);
        } else {
          // Continue assessment
          const progress = data.progress || `${data.clipNumber}/5`;
          setFeedback(`Clip ${data.clipNumber} analyzed. Progress: ${progress}. Keep dribbling for more data...`);
          setAssessmentClips(data.clipNumber);
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
      const errorMessage = error instanceof Error ? error.message : 'Connection failed.';
      setFeedback(`Error: Could not analyze video sequence. ${errorMessage}`);
      
      // Reset state so user can try again
      setTimeout(() => {
        if (phase === 'assessing') {
          setPhase('initial');
          setFeedback("Analysis failed. Try again by starting to dribble.");
        }
      }, 3000);
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
          
          // Start recording when motion is detected - behavior depends on phase
          if (motionDetected && !isRecording && (timeSinceLastAnalysis > ANALYSIS_INTERVAL) && mediaRecorderRef.current) {
            console.log('🔴 Starting recording...');
            setIsRecording(true);
            
            try {
              mediaRecorderRef.current.start();
              console.log('MediaRecorder.start() called successfully');
              
              if (phase === 'initial') {
                setPhase('assessing');
                setFeedback("Analyzing your dribbling technique...");
              } else if (phase === 'drilling') {
                setFeedback(`Recording ${currentDrill} performance...`);
              }
              
              // Stop recording after SEQUENCE_DURATION
              setTimeout(() => {
                console.log('⏹️ Stopping recording after timeout...');
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                  mediaRecorderRef.current.stop();
                  console.log('MediaRecorder.stop() called');
                }
                setIsRecording(false);
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
    setAllTips([]);
    setSkillAreas(new Set());
    setBaselineComplete(false);
    setConsolidatedAssessment(null);
    setFeedback("Basketball Dribbling Coach - Start dribbling to begin your assessment!");
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
            
            <div className={`status-indicator ${isRecording ? 'recording' : ''}`}>
              {isRecording && <span className="loading"></span>}
              {isRecording ? 'LIVE RECORDING' : 'READY TO ANALYZE'}
              <div style={{ fontSize: '0.9rem', marginTop: '4px', opacity: 0.9 }}>
                {feedback}
              </div>
            </div>
          </div>
          
          {/* Coaching Panel */}
          <div className="coaching-panel">
            
            {/* Initial Phase */}
            {phase === 'initial' && (
              <div>
                <h3>Welcome to Your Personal Dribbling Coach!</h3>
                <p>I'll analyze your dribbling and create a personalized training plan.</p>
                <div className="card primary">
                  <h4>🎯 Ready to Start?</h4>
                  <p>Just start dribbling in front of the camera. I'll watch your technique and give you specific areas to work on!</p>
                </div>
              </div>
            )}

            {/* Assessing Phase */}
            {phase === 'assessing' && (
              <div>
                <h3>Building Your Assessment</h3>
                <div className="card warning">
                  <h4>🔍 Analyzing Clip {assessmentClips} of 5</h4>
                  <p>I'm collecting feedback across multiple sequences to build a comprehensive evaluation.</p>
                  <p><strong>Keep dribbling naturally!</strong></p>
                  
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${(assessmentClips / 5) * 100}%` }}
                      ></div>
                    </div>
                    <div className="progress-text">{assessmentClips}/5 clips analyzed</div>
                  </div>
                </div>

                {/* Show accumulated feedback as it builds */}
                {cumulativeFeedback.length > 0 && (
                  <div>
                    <h4>📝 Live Analysis Feed</h4>
                    <div className="feedback-list">
                      {cumulativeFeedback.map((feedback, index) => (
                        <div key={index} className="feedback-item">
                          <div className="feedback-header">
                            Clip {index + 1}
                          </div>
                          <div className="feedback-content">{feedback}</div>
                        </div>
                      ))}
                    </div>
                    
                    {skillAreas.size > 0 && (
                      <div className="card success">
                        <h4>🎯 Key Areas Identified</h4>
                        <div className="skill-tags">
                          {Array.from(skillAreas).map((area, index) => (
                            <span key={index} className="skill-tag">{area}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Results Phase */}
            {phase === 'results' && (baselineComplete ? consolidatedAssessment : initialAssessment) && (
              <div>
                <h3>📊 {baselineComplete ? 'Comprehensive Assessment' : 'Assessment Results'}</h3>
                
                {baselineComplete && (
                  <div className="card success">
                    <h4>✅ Assessment Complete!</h4>
                    <p>Analyzed {assessmentClips} video clips</p>
                    {skillAreas.size > 0 && (
                      <div>
                        <strong>Skill Areas Identified:</strong>
                        <div className="skill-tags">
                          {Array.from(skillAreas).map((area, index) => (
                            <span key={index} className="skill-tag">{area}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Show feedback history in results */}
                {cumulativeFeedback.length > 0 && (
                  <div>
                    <h4>📋 Your Analysis Journey</h4>
                    <details className="collapsible">
                      <summary>
                        View All {cumulativeFeedback.length} Analysis Clips
                      </summary>
                      <div className="collapsible-content">
                        <div className="feedback-list">
                          {cumulativeFeedback.map((feedback, index) => (
                            <div key={index} className="feedback-item">
                              <div className="feedback-header">
                                Clip {index + 1}
                              </div>
                              <div className="feedback-content">{feedback}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  </div>
                )}
                
                <div className="card primary">
                  <h4>🎯 Final Assessment</h4>
                  <p>{(baselineComplete ? consolidatedAssessment : initialAssessment)?.feedback}</p>
                  
                  {(baselineComplete ? consolidatedAssessment : initialAssessment)?.technique && (
                    <p><strong>Primary Focus Area:</strong> {(baselineComplete ? consolidatedAssessment : initialAssessment)?.technique}</p>
                  )}
                  
                  {(() => {
                    const currentAssessment = baselineComplete ? consolidatedAssessment : initialAssessment;
                    return currentAssessment?.tips && currentAssessment.tips.length > 0 && (
                      <div>
                        <strong>Key Improvement Tips:</strong>
                        <ul>
                          {currentAssessment.tips.map((tip, index) => (
                            <li key={index}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>

                <h4>🏀 Recommended Training</h4>
                <div className="btn-grid">
                  {/* Show drill suggestion from assessment */}
                  {(baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion && (
                    <button 
                      className="btn primary"
                      onClick={() => startDrill((baselineComplete ? consolidatedAssessment : initialAssessment)!.drillSuggestion!)} 
                    >
                      🎯 {(baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion}
                      <small style={{ fontSize: '0.8rem', opacity: 0.9 }}>(Recommended)</small>
                    </button>
                  )}
                  
                  {/* Additional skill-appropriate drills */}
                  {(() => {
                    const drills = [];
                    const hasControl = skillAreas.has('Ball Control');
                    const hasRhythm = skillAreas.has('Rhythm & Timing');
                    const hasPosition = skillAreas.has('Body Position');
                    
                    if (hasControl) drills.push('Basic Stationary Dribble', 'Righty-Lefty Drill');
                    if (hasRhythm) drills.push('Red Light Green Light');
                    if (hasPosition) drills.push('Head Up Dribbling');
                    if (skillAreas.size > 2) drills.push('Dribbling Around Cones');
                    
                    // Remove the already recommended drill
                    const recommendedDrill = (baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion;
                    const filteredDrills = drills.filter(drill => drill !== recommendedDrill);
                    
                    return Array.from(new Set(filteredDrills)).slice(0, 3).map((drill, index) => (
                      <button 
                        key={index}
                        className="btn"
                        onClick={() => startDrill(drill)} 
                      >
                        🏀 {drill}
                      </button>
                    ));
                  })()
                  }
                </div>
                
                <button 
                  className="btn secondary"
                  onClick={restartAssessment}
                  style={{ marginTop: 'var(--spacing-lg)', width: '100%' }}
                >
                  🔄 Start New Assessment
                </button>
              </div>
            )}

            {/* Drilling Phase */}
            {phase === 'drilling' && currentDrill && (
              <div>
                <h3>🎯 {currentDrill}</h3>
                
                <div className="card warning">
                  <h4>🏀 Drill In Progress</h4>
                  <p>Practice this drill and I'll give you real-time feedback on your performance!</p>
                </div>

                {drillFeedback && (
                  <div className="card success">
                    <h4>📊 Performance Feedback</h4>
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

                <div className="btn-grid">
                  <button 
                    className="btn danger"
                    onClick={stopDrill}
                  >
                    ⏹️ Stop Drill
                  </button>
                  
                  <button 
                    className="btn secondary"
                    onClick={restartAssessment}
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
