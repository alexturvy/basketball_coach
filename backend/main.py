from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import google.generativeai as genai
import os
from dotenv import load_dotenv
import tempfile
from typing import List, Optional, Dict, Any

load_dotenv()

app = FastAPI()

origins = [
    "http://localhost:3000",  # React app default port
    "https://basketball-coach.vercel.app",  # Your specific Vercel deployment
    "https://alexturvy.com",  # Your custom domain
    "*"  # Allow all origins for debugging
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
      "http://localhost:3000",
      "https://basketball-coach.vercel.app",
      "https://alexturvy.com"
    ],
    allow_credentials=False,  # Set to False when using wildcard
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

class ImageData(BaseModel):
    image: str

class CoachingResponse(BaseModel):
    feedback: str
    drillSuggestion: Optional[str] = None
    technique: Optional[str] = None
    tips: Optional[List[str]] = None

class ProgressiveFeedback(BaseModel):
    clipNumber: int
    feedback: str
    keyAreas: List[str]
    tips: List[str]
    timestamp: str

class DrillExample(BaseModel):
    title: str
    url: str
    duration: str
    focus: str

class DrillInfo(BaseModel):
    category: str
    description: str
    youtube_examples: List[DrillExample]
    key_points: List[str]
    common_mistakes: List[str]

class AnalysisSession(BaseModel):
    sessionId: str
    feedbackList: List[ProgressiveFeedback] = []
    keyThemes: List[str] = []
    skillLevel: str = "intermediate"
    saturated: bool = False
    consolidatedFeedback: Optional[CoachingResponse] = None
    currentDrill: Optional[str] = None
    drillPhase: str = "watching"  # watching, practicing, completed

# Configure Gemini API
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

# In-memory storage for analysis sessions (use Redis in production)
analysis_sessions: Dict[str, AnalysisSession] = {}

# Configuration for progressive analysis
MAX_FEEDBACK_ROUNDS = 6
SATURATION_THRESHOLD = 5

# Research-based basketball dribbling expertise (2024)
BASKETBALL_COACHING_INSIGHTS = {
    "fundamental_techniques": {
        "hand_position": "Ball controlled with fingertips, not palm. Hand spread wide over top of ball with fingers evenly spaced. Palm directly over ball so it bounces into fingertips.",
        "wrist_action": "Quick, controlled wrist snap to push ball to floor. Extend elbow and snap wrist at bottom of movement.",
        "ball_height": "Keep dribble low, ideally below waist/knees. Higher dribbles are easier to steal.",
        "body_position": "Drop hip, bend knees, feet shoulder-width apart. Athletic stance for control.",
        "visual_focus": "Eyes up after mastering basics. Court vision essential for game situations."
    },
    "common_mistakes": {
        "palm_dribbling": "Using palm instead of fingertips reduces control and speed",
        "high_dribbling": "Ball bouncing above waist makes it vulnerable to steals",
        "stiff_hands": "Rigid hands prevent proper ball control and feel",
        "eyes_down": "Looking at ball limits court awareness and passing opportunities",
        "upper_arm_movement": "Excessive arm movement instead of wrist control",
        "stationary_only": "Over-emphasis on stationary drills without movement"
    },
    "elite_coaching_principles": {
        "functional_training": "Practice dribbling on the move with defensive pressure, not just stationary",
        "dual_hand_development": "Equal skill development with both hands is crucial",
        "progressive_difficulty": "Master basics before advanced moves. Build muscle memory through repetition",
        "game_realistic": "Focus on moves that translate to actual game situations",
        "positive_reinforcement": "Find what players do well and build on it",
        "habit_formation": "Correct bad habits immediately before they become ingrained"
    },
    "technical_focus_areas": {
        "fingertip_control": "Primary contact point for maximum ball control and agility",
        "rhythm_consistency": "Steady, controlled dribbling pace that can be varied as needed",
        "change_of_pace": "Ability to speed up and slow down dribble for tactical advantage",
        "change_of_direction": "Sharp direction changes while maintaining control",
        "protection": "Using body and off-hand to shield ball from defenders",
        "transition_ready": "Ability to quickly move from dribble to pass or shot"
    }
}

# Basketball coaching knowledge base with comprehensive dribbling drills from YMCA curriculum
DRILL_PROMPTS = {
    "general": """You are an elite basketball skills trainer analyzing this dribbling technique.

RESEARCH-BASED COACHING APPROACH:
- Ball control comes from FINGERTIPS, not palm. Look for finger spread and wrist snap.
- Proper dribble height is BELOW WAIST - high dribbles are easy to steal.
- EYES UP indicates court awareness - essential for game situations.
- Body should be in ATHLETIC STANCE (hip dropped, knees bent, shoulder-width apart).
- Focus on RHYTHM and ability to change pace/direction while maintaining control.

CRITICAL: Analyze technique regardless of video quality. Your job is basketball coaching, not video critique.

Evaluate these research-backed fundamentals:
1. FINGERTIP CONTROL: Is the ball contacted with fingertips? Hand spread wide?
2. BALL HEIGHT: Is dribble kept low (below waist) for protection?
3. WRIST ACTION: Quick, controlled snaps vs arm movement?
4. BODY POSITION: Athletic stance with bent knees and hip drop?
5. VISUAL AWARENESS: Eyes up or down? Court vision development?
6. RHYTHM: Consistent pace with ability to change speed?

COACHING PHILOSOPHY:
- Find positive elements first - what is the player doing well?
- Identify ONE primary area for improvement (don't overwhelm)
- Provide specific, actionable feedback based on elite training methods
- Suggest functional drills that apply to game situations

Be encouraging while providing expert-level technique analysis.""",

    # BEGINNER DRILLS
    "Righty-Lefty Drill": """Elite coaching analysis for ambidextrous skill development.

RESEARCH-BASED EVALUATION:
- EQUAL HAND STRENGTH: Both hands should show similar control and confidence
- FINGERTIP CONTROL: Ball contacted with fingertips on both sides
- CONSISTENT HEIGHT: Ball should stay below waist with both hands
- SMOOTH TRANSITIONS: No hesitation or awkwardness when switching
- RHYTHM MAINTENANCE: Steady pace throughout hand changes

Analyze this right-left dribbling sequence:
1. BILATERAL SKILL: Is control equal between right and left hands?
2. TRANSITION QUALITY: Smooth, confident hand switches or hesitant?
3. BALL PROTECTION: Consistent low dribble height with both hands?
4. STANCE STABILITY: Athletic position maintained during switches?
5. CONFIDENCE INDICATORS: Hesitation patterns or fluid movement?

PROVIDE: What they do well with each hand, primary area for bilateral improvement, specific tip for equal hand development.""",

    "Basic Stationary Dribble": """Analyze this fundamental stationary dribbling using elite coaching standards.

RESEARCH-BASED EVALUATION CRITERIA:
1. FINGERTIP CONTROL: Is ball contacted with fingertips (not palm)? Hand spread wide over ball?
2. DRIBBLE HEIGHT: Is ball kept below waist for protection? (High dribbles = easy steals)
3. WRIST ACTION: Quick wrist snaps vs excessive arm movement?
4. ATHLETIC STANCE: Hip dropped, knees bent, feet shoulder-width apart?
5. VISUAL FOCUS: Eyes up for court awareness or down watching ball?
6. RHYTHM CONSISTENCY: Steady, controlled pace with relaxed hands?

ELITE COACHING FOCUS:
- Fingertip control is the foundation of all advanced moves
- Low dribbles are protected dribbles
- Relaxed hands (not stiff) provide better feel and control
- Eyes up enables game transition and court awareness

Provide specific feedback on technique fundamentals and actionable improvement tips.""",

    "Space Man Drill": """Evaluate this space awareness dribbling. Check:
1. Maintaining consistent spacing from other players
2. Ball control while moving around designated area
3. Head up awareness of surroundings
4. Consistent dribble height and rhythm
5. Body control and balance

This drill develops court awareness and ball control simultaneously.""",

    "Red Light Green Light": """Analyze this stop-and-go dribbling drill. Assess:
1. Quick stops while maintaining ball control
2. Immediate response to commands
3. Proper dribbling stance during stops
4. Smooth transitions between speeds
5. Listening skills and ball control coordination

Focus on reaction time and ball security during changes.""",

    # INTERMEDIATE DRILLS
    "Dribbling Around Cones": """Evaluate this cone weaving drill. Check:
1. Ball control while changing direction around cones
2. Consistent dribble height through course
3. Body positioning during direction changes
4. Speed control and rhythm
5. Using appropriate hand for each direction

This develops agility and directional ball control.""",

    "Follow the Leader": """Analyze this mirroring dribbling drill. Focus on:
1. Ability to copy different dribbling patterns
2. Ball control while watching and copying
3. Coordination between observation and execution
4. Maintaining rhythm while adapting
5. Quick adjustments to new patterns

Emphasize adaptability and visual processing.""",

    "Head Up Dribbling": """Elite court awareness analysis - the skill that separates elite players.

RESEARCH INSIGHT: Eyes up dribbling is essential for game application. Elite players develop this through deliberate practice.

EVALUATE GAME-READINESS:
1. VISUAL DISCIPLINE: Are eyes consistently up or occasionally dropping to ball?
2. BALL SECURITY: Does control suffer when eyes are up?
3. CONFIDENCE LEVEL: Hesitation or fluid movement without visual ball contact?
4. PERIPHERAL AWARENESS: Can player sense ball position without direct look?
5. MULTI-TASKING: Ability to process visual information while maintaining control?

COACHING FOCUS:
- This separates recreational from competitive players
- Court vision enables passing, spacing, and decision-making
- Must be practiced until it becomes automatic

PROVIDE: Visual discipline assessment, control quality when eyes up, specific tip for developing court awareness while dribbling.""",

    "Engine & Caboose Drill": """Analyze this partner spacing drill. Focus on:
1. Maintaining consistent distance while dribbling
2. Ball control while following partner's movements
3. Coordination and rhythm matching
4. Awareness of partner's position
5. Smooth directional changes

Develops court awareness and ball control.""",

    # ADVANCED DRILLS
    "One on One Dribbling": """Evaluate this 5-second defensive pressure sequence. Check:
1. Ball protection under defensive pressure throughout the sequence
2. Use of body to shield the ball consistently
3. Multiple change of pace attempts to beat defender
4. Ball control maintenance while being pressured
5. Decision making and adaptability under pressure
6. Progression of moves and counter-moves during the sequence

This is crucial for game-situation ball handling. Look for sustained pressure response.""",

    "Sharks & Minnows": """Analyze this pressure dribbling game. Assess:
1. Ball control while avoiding defenders
2. Change of direction to escape pressure
3. Court awareness and spatial recognition
4. Confidence under multiple defenders
5. Quick decision making

Emphasize survival dribbling and protection.""",

    "Change Direction Drill": """Evaluate this reaction-based dribbling. Check:
1. Quick direction changes on command
2. Ball control during rapid reversals
3. Body positioning during changes
4. Acceleration after direction change
5. Maintaining balance throughout

Focus on explosive directional changes.""",

    "Dribble Around Defenders": """Analyze this stationary defender weaving. Focus on:
1. Ball control in tight spaces
2. Proper use of either hand as needed
3. Body positioning to protect ball
4. Low, controlled dribbles near defenders
5. Smooth weaving pattern

This develops close-quarters ball handling skills."""
}

# Enhanced drill system with YouTube examples and detailed instructions
DRILL_DATABASE = {
    "Basic Stationary Dribble": {
        "category": "beginner",
        "description": "Master fundamental ball control with proper fingertip technique and low dribbling",
        "youtube_examples": [
            {
                "title": "Proper Stationary Dribbling Form",
                "url": "https://www.youtube.com/watch?v=KtOOhXFFR8c",
                "duration": "2:30",
                "focus": "Fingertip control and proper hand position"
            },
            {
                "title": "Basketball Dribbling Fundamentals",
                "url": "https://www.youtube.com/watch?v=P3AuN-J1MBA",
                "duration": "3:15",
                "focus": "Low dribble technique and body position"
            }
        ],
        "key_points": [
            "Use fingertips, not palm",
            "Keep dribble below waist height",
            "Maintain athletic stance",
            "Eyes up for court awareness",
            "Relax hands for better control"
        ],
        "common_mistakes": [
            "Using palm instead of fingertips",
            "Dribbling too high",
            "Stiff, tense hands",
            "Looking down at the ball"
        ]
    },
    "Righty-Lefty Drill": {
        "category": "beginner",
        "description": "Develop equal skill with both hands through controlled hand switches",
        "youtube_examples": [
            {
                "title": "Two-Hand Dribbling Development",
                "url": "https://www.youtube.com/watch?v=8sGWIpePgzM",
                "duration": "4:10",
                "focus": "Smooth transitions between hands"
            },
            {
                "title": "Ambidextrous Dribbling Drills",
                "url": "https://www.youtube.com/watch?v=2xCQJ1xhJP8",
                "duration": "3:30",
                "focus": "Equal skill development with both hands"
            }
        ],
        "key_points": [
            "Equal control with both hands",
            "Smooth hand transitions",
            "Consistent ball height",
            "Maintain body balance"
        ],
        "common_mistakes": [
            "Favoring dominant hand",
            "Uneven ball height between hands",
            "Rushing the transitions"
        ]
    },
    "Head Up Dribbling": {
        "category": "intermediate",
        "description": "Develop court awareness while maintaining ball control",
        "youtube_examples": [
            {
                "title": "Head Up Dribbling Drills",
                "url": "https://www.youtube.com/watch?v=vQiMKJZWUlw",
                "duration": "3:45",
                "focus": "Visual awareness while dribbling"
            }
        ],
        "key_points": [
            "Eyes focused ahead, not on ball",
            "Develop peripheral vision",
            "Confidence in ball handling",
            "Multi-tasking abilities"
        ],
        "common_mistakes": [
            "Glancing down at ball",
            "Losing control when looking up",
            "Tensing up when multitasking"
        ]
    },
    "Crossover Drill": {
        "category": "intermediate",
        "description": "Master the crossover dribble with proper form and timing",
        "youtube_examples": [
            {
                "title": "Perfect Crossover Technique",
                "url": "https://www.youtube.com/watch?v=KtOOhXFFR8c",
                "duration": "4:45",
                "focus": "Low, tight, quick crossover fundamentals"
            },
            {
                "title": "NBA Crossover Breakdown",
                "url": "https://www.youtube.com/watch?v=vQiMKJZWUlw",
                "duration": "6:20",
                "focus": "Game application and timing"
            }
        ],
        "key_points": [
            "Keep crossover low (below knees)",
            "Pound ball hard into ground",
            "Stay low in athletic stance",
            "Use body fakes to sell the move",
            "Explode in new direction after crossover"
        ],
        "common_mistakes": [
            "Crossing over too high",
            "Telegraphing the move",
            "Not changing pace after crossover",
            "Standing up during the move"
        ]
    },
    "One on One Dribbling": {
        "category": "advanced",
        "description": "Maintain ball control under defensive pressure",
        "youtube_examples": [
            {
                "title": "Dribbling Under Pressure",
                "url": "https://www.youtube.com/watch?v=2xCQJ1xhJP8",
                "duration": "5:20",
                "focus": "Ball protection and change of pace"
            },
            {
                "title": "1v1 Pressure Drills",
                "url": "https://www.youtube.com/watch?v=P3AuN-J1MBA",
                "duration": "4:55",
                "focus": "Game-realistic defensive scenarios"
            }
        ],
        "key_points": [
            "Use body to shield ball",
            "Change of pace to create space",
            "Low, protected dribbles",
            "Quick decision making",
            "Keep defender on your hip"
        ],
        "common_mistakes": [
            "Exposing ball to defender",
            "Predictable rhythm",
            "Panic under pressure",
            "Picking up dribble too early"
        ]
    }
}

# Add Crossover Drill prompt
DRILL_PROMPTS["Crossover Drill"] = """Elite crossover technique analysis based on NBA fundamentals.

RESEARCH STANDARDS (Allen Iverson, Kyrie Irving methodology):
- LOW CROSSOVER: Ball must stay below knees for protection
- HARD POUND: Aggressive dribble into ground for quick return
- BODY SELL: Use fakes and body positioning to deceive
- EXPLOSIVE FINISH: Quick direction change after crossover
- TIGHT TO BODY: Ball stays close, not wide and vulnerable

ANALYZE CROSSOVER EXECUTION:
1. DRIBBLE HEIGHT: Is crossover kept low (below knees) for security?
2. BALL SPEED: Hard pound into ground for quick ball return?
3. BODY MECHANICS: Low stance, good fake to sell the move?
4. TIMING: Proper setup dribbles before executing crossover?
5. EXPLOSION: Quick direction change and acceleration after?
6. BALL SECURITY: Tight to body or exposed to imaginary defender?

ELITE COACHING:
- "Low, tight, quick" - fundamental crossover mantra
- Setup is crucial - don't telegraph the move
- Explosion after crossover creates separation

PROVIDE: Crossover mechanics assessment, timing analysis, specific improvement for game effectiveness."""

# Drill categories for progression based on YMCA curriculum
DRILL_CATEGORIES = {
    "beginner": [
        "Basic Stationary Dribble",
        "Righty-Lefty Drill", 
        "Red Light Green Light",
        "Space Man Drill"
    ],
    "intermediate": [
        "Dribbling Around Cones",
        "Follow the Leader",
        "Head Up Dribbling",
        "Crossover Drill",
        "Engine & Caboose Drill"
    ],
    "advanced": [
        "One on One Dribbling",
        "Sharks & Minnows", 
        "Change Direction Drill",
        "Dribble Around Defenders"
    ]
}

def parse_coaching_response(response_text: str, drill_type: str) -> CoachingResponse:
    """Parse the AI response into structured coaching data"""
    try:
        lines = response_text.strip().split('\n')
        feedback_lines = []
        tips = []
        technique = None
        drill_suggestion = None
        
        current_section = "feedback"
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Look for section headers
            if "tips:" in line.lower() or "suggestions:" in line.lower():
                current_section = "tips"
                continue
            elif "technique:" in line.lower():
                current_section = "technique"
                technique = line.split(":", 1)[1].strip() if ":" in line else line
                continue
            elif "drill:" in line.lower() or "recommend:" in line.lower():
                current_section = "drill"
                drill_suggestion = line.split(":", 1)[1].strip() if ":" in line else line
                continue
            
            # Process content based on current section
            if current_section == "feedback":
                feedback_lines.append(line)
            elif current_section == "tips":
                if line.startswith(('•', '-', '*', '1.', '2.', '3.', '4.', '5.')):
                    tips.append(line.lstrip('•-*123456789. '))
                else:
                    tips.append(line)
        
        # If no specific drill suggestion and not in a specific drill, suggest one
        if not drill_suggestion and drill_type == "general":
            # Intelligent drill suggestion based on feedback content
            response_lower = response_text.lower()
            
            # Check for specific technique mentions
            if any(word in response_lower for word in ["crossover", "cross over"]):
                drill_suggestion = "Crossover Practice"
            elif any(word in response_lower for word in ["between legs", "between the legs"]):
                drill_suggestion = "Between the Legs"
            elif any(word in response_lower for word in ["behind back", "behind the back"]):
                drill_suggestion = "Behind the Back"
            elif any(word in response_lower for word in ["figure 8", "figure eight"]):
                drill_suggestion = "Figure 8 Dribble"
            elif any(word in response_lower for word in ["hesitation", "hesitate"]):
                drill_suggestion = "Hesitation Dribble"
            elif any(word in response_lower for word in ["in and out", "in-and-out"]):
                drill_suggestion = "In-and-Out Dribble"
            
            # Check for skill level indicators
            elif any(word in response_lower for word in ["basic", "fundamental", "beginner", "start"]):
                if "control" in response_lower or "fingertip" in response_lower:
                    drill_suggestion = "Stationary Ball Slaps"
                elif "power" in response_lower or "strength" in response_lower:
                    drill_suggestion = "Pound Dribble"
                else:
                    drill_suggestion = "Basic Stationary Dribble"
            elif any(word in response_lower for word in ["advanced", "complex", "combination"]):
                drill_suggestion = "Combination Moves"
            elif any(word in response_lower for word in ["height", "high", "low"]):
                drill_suggestion = "High-Low Dribble"
            elif "quick" in response_lower and "hands" in response_lower:
                drill_suggestion = "Spider Dribble"
            
            # Default progression based on common issues
            else:
                drill_suggestion = "Basic Stationary Dribble"
        
        feedback = ' '.join(feedback_lines) if feedback_lines else response_text
        
        return CoachingResponse(
            feedback=feedback,
            technique=technique,
            tips=tips if tips else None,
            drillSuggestion=drill_suggestion
        )
    except Exception as e:
        return CoachingResponse(
            feedback=response_text,
            tips=["Focus on consistent ball control and proper form"]
        )

@app.get("/")
def read_root():
    return {"Hello": "Basketball Coach AI"}

@app.get("/drills")
def get_drills():
    """Get all available drills organized by skill level"""
    return {
        "categories": DRILL_CATEGORIES,
        "drills": list(DRILL_PROMPTS.keys()),
        "drill_database": DRILL_DATABASE
    }

@app.get("/drill/{drill_name}")
def get_drill_details(drill_name: str):
    """Get detailed information about a specific drill including YouTube examples"""
    if drill_name not in DRILL_DATABASE:
        return {"error": "Drill not found"}
    
    drill_info = DRILL_DATABASE[drill_name].copy()
    drill_info["prompt"] = DRILL_PROMPTS.get(drill_name, DRILL_PROMPTS["general"])
    return drill_info

@app.get("/drills/category/{category}")
def get_drills_by_category(category: str):
    """Get all drills in a specific category with their details"""
    if category not in DRILL_CATEGORIES:
        return {"error": "Category not found"}
    
    drills_in_category = []
    for drill_name in DRILL_CATEGORIES[category]:
        if drill_name in DRILL_DATABASE:
            drill_info = DRILL_DATABASE[drill_name].copy()
            drill_info["name"] = drill_name
            drills_in_category.append(drill_info)
    
    return {
        "category": category,
        "drills": drills_in_category
    }

@app.post("/analyze_sequence")
async def analyze_sequence(video: UploadFile = File(...), drill: str = Form("general")):
    """Analyze a video sequence for basketball coaching feedback"""
    try:
        # Read video content
        content = await video.read()
        print(f"Received video: {len(content)} bytes")
        
        # Get the appropriate prompt for the drill type
        prompt = DRILL_PROMPTS.get(drill, DRILL_PROMPTS["general"])
        
        # Use proper inline video data for small videos (<20MB)
        video_size_mb = len(content) / (1024 * 1024)
        print(f"Video size: {video_size_mb:.2f} MB")
        
        if video_size_mb < 20:
            # Use inline data approach (recommended for small videos)
            print("Using inline video data approach...")
            response = model.generate_content([
                prompt,
                {
                    "inline_data": {
                        "mime_type": "video/webm",
                        "data": content  # Raw bytes, not base64
                    }
                }
            ])
            print("Inline video analysis successful")
        else:
            # Use File API for larger videos
            print("Video too large, using File API approach...")
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            try:
                # Upload video to Gemini
                print(f"Uploading video file: {temp_file_path}")
                video_file = genai.upload_file(path=temp_file_path)
                print(f"Video uploaded. File name: {video_file.name}, initial state: {video_file.state.name}")
                
                # Wait for file to become active
                import time
                max_wait_time = 60
                wait_time = 0
                
                while video_file.state.name == "PROCESSING" and wait_time < max_wait_time:
                    print(f"Waiting for video processing... ({wait_time}s)")
                    time.sleep(3)
                    video_file = genai.get_file(video_file.name)
                    wait_time += 3
                
                if video_file.state.name != "ACTIVE":
                    raise Exception(f"Video file failed to process. Final state: {video_file.state.name}")
                
                print("File is ACTIVE, generating content...")
                response = model.generate_content([prompt, video_file])
                print("File upload analysis successful")
                
                # Clean up Gemini file
                try:
                    genai.delete_file(video_file.name)
                    print(f"Cleaned up Gemini file: {video_file.name}")
                except Exception as cleanup_error:
                    print(f"Warning: Could not clean up Gemini file: {cleanup_error}")
                    
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                    print("Cleaned up temporary file")
        
        # Parse response into structured format
        coaching_response = parse_coaching_response(response.text, drill)
        
        return coaching_response.dict()
        
    except Exception as e:
        print(f"Analysis failed: {str(e)}")
        return CoachingResponse(
            feedback=f"Error analyzing video: {str(e)}",
            tips=["Try recording a clearer video with good lighting"]
        ).dict()

@app.post("/progressive_analysis")
async def progressive_analysis(video: UploadFile = File(...), sessionId: str = Form(...)):
    """Progressive clip-by-clip analysis with feedback accumulation"""
    import datetime
    import uuid
    
    try:
        # Get or create analysis session
        if sessionId not in analysis_sessions:
            print(f"Creating new session: {sessionId}")
            analysis_sessions[sessionId] = AnalysisSession(sessionId=sessionId)
        else:
            print(f"Using existing session: {sessionId} with {len(analysis_sessions[sessionId].feedbackList)} existing clips")
        
        session = analysis_sessions[sessionId]
        
        # Check if session is already saturated
        if session.saturated:
            print(f"Session {sessionId} is already saturated")
            return {
                "saturated": True,
                "consolidatedFeedback": session.consolidatedFeedback.dict() if session.consolidatedFeedback else None,
                "feedbackList": [f.dict() for f in session.feedbackList]
            }
        
        # Read video content
        content = await video.read()
        clip_number = len(session.feedbackList) + 1
        
        print(f"Processing clip {clip_number} for session {sessionId}")
        
        # Enhanced prompt for progressive analysis with research-based coaching
        progressive_prompt = f"""You are an elite basketball skills trainer analyzing clip #{clip_number} of 5.
        
        ELITE COACHING METHODOLOGY (Research-Based 2024):
        - FINGERTIP CONTROL: Ball must be controlled with fingertips, not palm
        - LOW DRIBBLE: Proper height is below waist - high dribbles get stolen
        - WRIST SNAP: Quick wrist action, not excessive arm movement
        - ATHLETIC STANCE: Hip dropped, knees bent, feet shoulder-width apart
        - EYES UP: Court vision essential for game application
        - RHYTHM MASTERY: Consistent pace with change-of-speed capability
        
        CRITICAL: Focus on basketball technique analysis, ignore video quality completely.
        
        Analyze using elite training standards:
        1. HAND TECHNIQUE: Fingertip contact, proper hand spread, wrist snap quality
        2. BALL PROTECTION: Dribble height, body positioning, control under pressure
        3. STANCE & POSTURE: Athletic position, balance, movement readiness
        4. COURT AWARENESS: Head position, visual focus, game readiness
        5. RHYTHM & PACE: Consistency, ability to change speeds, control quality
        
        For clip #{clip_number}, provide:
        - What the player is doing WELL (positive reinforcement)
        - ONE primary technique focus area for improvement
        - Specific, actionable coaching tip based on elite training methods
        
        Remember: Elite coaches find positives first, then target ONE key improvement. Build confidence while developing skill."""
        
        # Analyze the video clip
        video_size_mb = len(content) / (1024 * 1024)
        print(f"Video size: {video_size_mb:.2f} MB")
        
        if video_size_mb < 20:
            response = model.generate_content([
                progressive_prompt,
                {
                    "inline_data": {
                        "mime_type": "video/webm",
                        "data": content
                    }
                }
            ])
        else:
            # File API fallback for larger videos
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
            
            try:
                video_file = genai.upload_file(path=temp_file_path)
                
                # Wait for processing
                import time
                wait_time = 0
                while video_file.state.name == "PROCESSING" and wait_time < 30:
                    time.sleep(2)
                    video_file = genai.get_file(video_file.name)
                    wait_time += 2
                
                if video_file.state.name != "ACTIVE":
                    raise Exception(f"Video processing failed: {video_file.state.name}")
                
                response = model.generate_content([progressive_prompt, video_file])
                genai.delete_file(video_file.name)
            finally:
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
        
        # Parse feedback and extract key areas
        feedback_text = response.text
        key_areas = extract_key_areas(feedback_text)
        tips = extract_tips(feedback_text)
        
        # Create progressive feedback entry
        progressive_feedback = ProgressiveFeedback(
            clipNumber=clip_number,
            feedback=feedback_text,
            keyAreas=key_areas,
            tips=tips,
            timestamp=datetime.datetime.now().isoformat()
        )
        
        # Add to session
        session.feedbackList.append(progressive_feedback)
        
        # Update session themes
        session.keyThemes = list(set(session.keyThemes + key_areas))
        
        # Check for saturation
        if len(session.feedbackList) >= SATURATION_THRESHOLD:
            print(f"Reaching saturation for session {sessionId}")
            consolidated = consolidate_session_feedback(session)
            session.consolidatedFeedback = consolidated
            session.saturated = True
            
            return {
                "clipNumber": clip_number,
                "feedback": progressive_feedback.dict(),
                "saturated": True,
                "consolidatedFeedback": consolidated.dict(),
                "feedbackList": [f.dict() for f in session.feedbackList],
                "keyThemes": session.keyThemes
            }
        
        # Return current feedback
        return {
            "clipNumber": clip_number,
            "feedback": progressive_feedback.dict(),
            "saturated": False,
            "progress": f"{len(session.feedbackList)}/{SATURATION_THRESHOLD}",
            "feedbackList": [f.dict() for f in session.feedbackList],
            "keyThemes": session.keyThemes
        }
        
    except Exception as e:
        print(f"Progressive analysis failed: {str(e)}")
        return {
            "error": f"Error analyzing video: {str(e)}",
            "clipNumber": len(analysis_sessions.get(sessionId, AnalysisSession(sessionId=sessionId)).feedbackList) + 1
        }

def extract_key_areas(feedback_text: str) -> List[str]:
    """Extract key skill areas from feedback"""
    areas = []
    text_lower = feedback_text.lower()
    
    if "control" in text_lower or "grip" in text_lower:
        areas.append("Ball Control")
    if "rhythm" in text_lower or "timing" in text_lower or "consistency" in text_lower:
        areas.append("Rhythm & Timing")
    if "posture" in text_lower or "stance" in text_lower or "position" in text_lower:
        areas.append("Body Position")
    if "height" in text_lower or "bounce" in text_lower:
        areas.append("Dribble Height")
    if "hand" in text_lower or "finger" in text_lower:
        areas.append("Hand Technique")
    if "head" in text_lower or "eyes" in text_lower or "awareness" in text_lower:
        areas.append("Court Awareness")
    
    return areas

def extract_tips(feedback_text: str) -> List[str]:
    """Extract actionable tips from feedback"""
    lines = feedback_text.split('\n')
    tips = []
    
    for line in lines:
        line = line.strip()
        if any(starter in line.lower() for starter in ['tip:', 'try', 'focus on', 'practice', 'work on', 'remember']):
            clean_tip = line.lstrip('•-*123456789. ').strip()
            if clean_tip and len(clean_tip) > 10:  # Filter out very short tips
                tips.append(clean_tip)
    
    # If no structured tips found, extract sentences with action words
    if not tips:
        sentences = feedback_text.split('.')
        for sentence in sentences:
            if any(word in sentence.lower() for word in ['should', 'try', 'focus', 'keep', 'maintain', 'improve']):
                clean_sentence = sentence.strip()
                if len(clean_sentence) > 15:
                    tips.append(clean_sentence)
    
    return tips[:3]  # Return top 3 tips

def consolidate_session_feedback(session: AnalysisSession) -> CoachingResponse:
    """Consolidate all feedback from a session into final assessment"""
    
    all_feedback = " ".join([f.feedback for f in session.feedbackList])
    all_areas = list(set([area for f in session.feedbackList for area in f.keyAreas]))
    all_tips = list(set([tip for f in session.feedbackList for tip in f.tips]))
    
    # Create consolidation prompt
    consolidation_prompt = f"""Based on {len(session.feedbackList)} basketball dribbling video clips, provide a comprehensive assessment.
    
    Accumulated feedback: {all_feedback}
    
    Key areas identified: {', '.join(all_areas)}
    
    Please consolidate this into:
    1. A comprehensive assessment (2-3 sentences) highlighting the main patterns and themes
    2. The top 3 most important areas to focus on
    3. Specific drill recommendation based on the identified needs
    4. Primary technique focus area
    
    Format your response clearly with sections."""
    
    try:
        consolidation_response = model.generate_content([consolidation_prompt])
        consolidated_text = consolidation_response.text
        
        # Parse the consolidated response
        consolidated_feedback = parse_coaching_response(consolidated_text, "consolidation")
        
        # Enhance with session data
        if not consolidated_feedback.tips:
            consolidated_feedback.tips = all_tips[:3]
        
        if not consolidated_feedback.technique and all_areas:
            consolidated_feedback.technique = all_areas[0]
            
        return consolidated_feedback
        
    except Exception as e:
        print(f"Consolidation failed: {e}")
        # Fallback consolidation
        return CoachingResponse(
            feedback=f"Based on {len(session.feedbackList)} clips, main focus areas are: {', '.join(all_areas[:3])}",
            technique=all_areas[0] if all_areas else "Ball Control",
            tips=all_tips[:3],
            drillSuggestion="Basic Stationary Dribble"
        )

@app.get("/session/{sessionId}")
def get_session(sessionId: str):
    """Get current session state"""
    if sessionId not in analysis_sessions:
        return {"error": "Session not found"}
    
    session = analysis_sessions[sessionId]
    return {
        "sessionId": sessionId,
        "feedbackList": [f.dict() for f in session.feedbackList],
        "keyThemes": session.keyThemes,
        "saturated": session.saturated,
        "consolidatedFeedback": session.consolidatedFeedback.dict() if session.consolidatedFeedback else None,
        "progress": f"{len(session.feedbackList)}/{SATURATION_THRESHOLD}"
    }

@app.delete("/session/{sessionId}")
def reset_session(sessionId: str):
    """Reset/clear a session"""
    if sessionId in analysis_sessions:
        del analysis_sessions[sessionId]
    return {"message": f"Session {sessionId} reset"}

@app.post("/video_feed")
async def video_feed(image_data: ImageData):
    """Legacy endpoint for single image analysis"""
    try:
        # Decode the base64 image data
        header, encoded_image = image_data.image.split(",", 1)
        decoded_image = base64.b64decode(encoded_image)

        # Send to Gemini for analysis
        response = model.generate_content([
            "Analyze this basketball dribbling image. Provide brief coaching feedback on form and technique.", 
            {'mime_type': 'image/jpeg', 'data': decoded_image}
        ])
        
        return {"message": response.text}
    except Exception as e:
        return {"message": f"Error processing image: {e}"}
