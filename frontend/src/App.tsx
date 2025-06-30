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
      console.log('Sending video for analysis...', videoBlob.size, 'bytes');
      console.log('API URL:', process.env.REACT_APP_API_URL || 'http://localhost:8000');
      
      const formData = new FormData();
      formData.append('video', videoBlob, 'sequence.webm');
      formData.append('drill', currentDrill || 'general');

      setFeedback('Sending video to AI for analysis...');

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/analyze_sequence`, {
        method: 'POST',
        body: formData,
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Analysis response:', data);
      
      if (phase === 'initial' || phase === 'assessing') {
        // Progressive assessment phase - accumulate feedback
        const newClipCount = assessmentClips + 1;
        setAssessmentClips(newClipCount);
        
        // Add new feedback to cumulative collection
        const newFeedback = [...cumulativeFeedback, data.feedback];
        setCumulativeFeedback(newFeedback);
        
        // Accumulate tips
        if (data.tips) {
          const newTips = [...allTips, ...data.tips];
          setAllTips(newTips);
        }
        
        // Extract and categorize skill areas
        const newSkillAreas = new Set(skillAreas);
        const feedbackLower = data.feedback.toLowerCase();
        if (feedbackLower.includes('control')) newSkillAreas.add('Ball Control');
        if (feedbackLower.includes('rhythm') || feedbackLower.includes('timing')) newSkillAreas.add('Rhythm & Timing');
        if (feedbackLower.includes('posture') || feedbackLower.includes('stance')) newSkillAreas.add('Body Position');
        if (feedbackLower.includes('height') || feedbackLower.includes('bounce')) newSkillAreas.add('Ball Height');
        if (feedbackLower.includes('hand') || feedbackLower.includes('fingertip')) newSkillAreas.add('Hand Technique');
        setSkillAreas(newSkillAreas);
        
        if (newClipCount >= MAX_ASSESSMENT_CLIPS) {
          // Complete baseline assessment - consolidate all feedback
          setBaselineComplete(true);
          const consolidatedFeedback = consolidateFeedback(newFeedback, allTips, newSkillAreas);
          setConsolidatedAssessment(consolidatedFeedback);
          setPhase('results');
          setFeedback(`Baseline assessment complete! Analyzed ${newClipCount} clips.`);
        } else {
          // Continue assessment
          setFeedback(`Clip ${newClipCount}/${MAX_ASSESSMENT_CLIPS} analyzed. Keep dribbling for more assessment data...`);
        }
      } else if (phase === 'drilling') {
        // Drill-specific feedback
        setDrillFeedback(data);
        setFeedback(`${currentDrill} - ${data.feedback}`);
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

  const restartAssessment = () => {
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

  // Simple error boundary
  if (error) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>🏀 Basketball Dribbling Coach</h1>
          <div style={{ 
            padding: '20px', 
            backgroundColor: '#f8d7da', 
            color: '#721c24',
            borderRadius: '8px',
            maxWidth: '600px',
            margin: '20px'
          }}>
            <h3>⚠️ Setup Issue</h3>
            <p>{error}</p>
            <p><strong>Troubleshooting:</strong></p>
            <ul style={{ textAlign: 'left' }}>
              <li>Make sure you're using HTTPS (not HTTP)</li>
              <li>Check browser permissions for camera access</li>
              <li>Try refreshing the page</li>
              <li>Try a different browser (Chrome works best)</li>
            </ul>
            <button 
              onClick={() => window.location.reload()} 
              style={{ 
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
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
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#fff3cd', 
            borderRadius: '8px',
            color: '#333',
            marginBottom: '20px',
            maxWidth: '600px'
          }}>
            <p>📹 Setting up camera... Please allow camera access when prompted.</p>
          </div>
        )}
        
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
                <h3>Building Your Assessment...</h3>
                <div style={{ 
                  padding: '15px', 
                  backgroundColor: '#fff3cd', 
                  borderRadius: '8px',
                  color: '#333'
                }}>
                  <p>🔍 Collecting clip {assessmentClips + 1} of {MAX_ASSESSMENT_CLIPS}</p>
                  <p>I'm analyzing your dribbling patterns across multiple sequences to build a comprehensive evaluation.</p>
                  <p>Keep dribbling naturally!</p>
                  
                  {assessmentClips > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <strong>Progress:</strong>
                      <div style={{ 
                        width: '100%', 
                        backgroundColor: '#e0e0e0', 
                        borderRadius: '10px', 
                        marginTop: '5px' 
                      }}>
                        <div style={{ 
                          width: `${(assessmentClips / MAX_ASSESSMENT_CLIPS) * 100}%`, 
                          backgroundColor: '#28a745', 
                          height: '8px', 
                          borderRadius: '10px' 
                        }}></div>
                      </div>
                      <small>{assessmentClips}/{MAX_ASSESSMENT_CLIPS} clips collected</small>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Results Phase */}
            {phase === 'results' && (baselineComplete ? consolidatedAssessment : initialAssessment) && (
              <div>
                <h3>📊 {baselineComplete ? 'Comprehensive Assessment' : 'Assessment Results'}</h3>
                
                {baselineComplete && (
                  <div style={{ 
                    padding: '15px', 
                    backgroundColor: '#e8f4fd', 
                    borderRadius: '8px',
                    color: '#333',
                    marginBottom: '15px'
                  }}>
                    <p><strong>✅ Baseline Complete!</strong> Analyzed {assessmentClips} video clips</p>
                    <p><strong>Skill Areas Identified:</strong> {Array.from(skillAreas).join(', ')}</p>
                  </div>
                )}
                
                <div style={{ 
                  padding: '15px', 
                  backgroundColor: '#d4edda', 
                  borderRadius: '8px',
                  color: '#333',
                  marginBottom: '15px'
                }}>
                  <h4>What I Noticed:</h4>
                  <p>{(baselineComplete ? consolidatedAssessment : initialAssessment)?.feedback}</p>
                  
                  {(baselineComplete ? consolidatedAssessment : initialAssessment)?.technique && (
                    <p><strong>Key Focus Area:</strong> {(baselineComplete ? consolidatedAssessment : initialAssessment)?.technique}</p>
                  )}
                  
                  {(() => {
                    const currentAssessment = baselineComplete ? consolidatedAssessment : initialAssessment;
                    return currentAssessment?.tips && currentAssessment.tips.length > 0 && (
                      <div>
                        <strong>Improvement Tips:</strong>
                        <ul>
                          {currentAssessment.tips.map((tip, index) => (
                            <li key={index}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>

                <h4>Recommended Drills:</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Show drill suggestion from assessment */}
                  {(baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion && (
                    <button 
                      onClick={() => startDrill((baselineComplete ? consolidatedAssessment : initialAssessment)!.drillSuggestion!)} 
                      style={{ 
                        padding: '12px 15px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      🎯 {(baselineComplete ? consolidatedAssessment : initialAssessment)?.drillSuggestion} (Recommended)
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
                    ));
                  })()
                  }
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
