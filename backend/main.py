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
    allow_origins=["*"],  # Allow all origins for now
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

class AnalysisSession(BaseModel):
    sessionId: str
    feedbackList: List[ProgressiveFeedback] = []
    keyThemes: List[str] = []
    skillLevel: str = "intermediate"
    saturated: bool = False
    consolidatedFeedback: Optional[CoachingResponse] = None

# Configure Gemini API
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

# In-memory storage for analysis sessions (use Redis in production)
analysis_sessions: Dict[str, AnalysisSession] = {}

# Configuration for progressive analysis
MAX_FEEDBACK_ROUNDS = 6
SATURATION_THRESHOLD = 5

# Basketball coaching knowledge base with comprehensive dribbling drills from YMCA curriculum
DRILL_PROMPTS = {
    "general": """Analyze this 5-second basketball dribbling video sequence. Focus on:
1. Hand position and ball control throughout the sequence
2. Dribbling rhythm, timing, and consistency over multiple bounces
3. Body posture, balance, and stance stability
4. Ball height consistency and bounce control patterns
5. Overall technique progression during the sequence
6. Any improvements or deterioration in form over time

Provide specific coaching feedback and suggest a drill to improve the most important area that needs work. Look for patterns across the full sequence, not just individual moments.""",

    # BEGINNER DRILLS
    "Righty-Lefty Drill": """Analyze this 5-second right-left hand dribbling sequence. Evaluate:
1. Control when switching from right to left hand multiple times
2. Consistent ball height with both hands throughout the sequence
3. Smooth transitions at each switch point
4. Body balance during hand changes
5. Keeping head up while switching hands
6. Improvement in switching speed and confidence over the sequence

Focus on developing equal skill with both hands and smooth transitions.""",

    "Basic Stationary Dribble": """Analyze this basic stationary dribbling practice. Evaluate:
1. Ball control with fingertips vs palm
2. Consistent ball height (waist level)
3. Steady rhythm and timing
4. Proper stance (athletic position)
5. Eyes up vs looking at ball

Rate the performance and provide specific tips for improvement.""",

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

    "Head Up Dribbling": """Assess this visual awareness drill. Evaluate:
1. Maintaining ball control without looking down
2. Response accuracy to visual hand signals
3. Peripheral vision development
4. Confidence in ball handling
5. Multi-tasking ability (dribbling + watching)

This critical skill separates good dribblers from great ones.""",

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
        "drills": list(DRILL_PROMPTS.keys())
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
        
        # Enhanced prompt for progressive analysis
        progressive_prompt = f"""Analyze this basketball dribbling video clip #{clip_number}. 
        
        Focus on these key areas and provide specific, actionable feedback:
        1. Ball control and hand positioning
        2. Dribble height consistency and rhythm
        3. Body posture and athletic stance
        4. Head position and court awareness
        5. Overall technique improvement areas
        
        This is clip #{clip_number} in a progressive assessment. Provide:
        - Specific feedback on what you observe
        - 2-3 key improvement areas
        - 2-3 actionable tips
        
        Be concise but specific about technique details."""
        
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
