from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import google.generativeai as genai
import os
from dotenv import load_dotenv
import tempfile
from typing import List, Optional

load_dotenv()

app = FastAPI()

origins = [
    "http://localhost:3000",  # React app default port
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ImageData(BaseModel):
    image: str

class CoachingResponse(BaseModel):
    feedback: str
    drillSuggestion: Optional[str] = None
    technique: Optional[str] = None
    tips: Optional[List[str]] = None

# Configure Gemini API
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

# Basketball coaching knowledge base with comprehensive dribbling drills from YMCA curriculum
DRILL_PROMPTS = {
    "general": """Analyze this basketball dribbling video sequence. Focus on:
1. Hand position and ball control
2. Dribbling rhythm and consistency  
3. Body posture and stance
4. Ball height and bounce consistency
5. Overall technique

Provide specific coaching feedback and suggest a drill to improve the most important area that needs work.""",

    # BEGINNER DRILLS
    "Righty-Lefty Drill": """Analyze this right-left hand dribbling drill. Evaluate:
1. Control when switching from right to left hand
2. Consistent ball height with both hands
3. Smooth transition at the switch point
4. Body balance during hand changes
5. Keeping head up while switching hands

Focus on developing equal skill with both hands.""",

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
    "One on One Dribbling": """Evaluate this defensive pressure drill. Check:
1. Ball protection under defensive pressure
2. Use of body to shield the ball
3. Change of pace to beat defender
4. Ball control while being pressured
5. Decision making under pressure

This is crucial for game-situation ball handling.""",

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
        # Save uploaded video to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            content = await video.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Get the appropriate prompt for the drill type
        prompt = DRILL_PROMPTS.get(drill, DRILL_PROMPTS["general"])
        
        # Upload video to Gemini
        video_file = genai.upload_file(path=temp_file_path)
        
        # Generate content with video
        response = model.generate_content([
            prompt,
            video_file
        ])
        
        # Clean up temporary file
        os.unlink(temp_file_path)
        
        # Parse response into structured format
        coaching_response = parse_coaching_response(response.text, drill)
        
        return coaching_response.dict()
        
    except Exception as e:
        return CoachingResponse(
            feedback=f"Error analyzing video: {str(e)}",
            tips=["Try recording a clearer video with good lighting"]
        ).dict()

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
