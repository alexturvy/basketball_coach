from pydantic import BaseModel
from typing import List, Optional, Dict

class ProgressiveFeedback(BaseModel):
    clipNumber: int
    feedback: str
    keyAreas: List[str]
    tips: List[str]
    timestamp: str

class CoachingResponse(BaseModel):
    feedback: str
    drillSuggestion: Optional[str] = None
    technique: Optional[str] = None
    tips: Optional[List[str]] = None

class AnalysisSession(BaseModel):
    sessionId: str
    feedbackList: List[ProgressiveFeedback] = []
    keyThemes: List[str] = []
    skillLevel: str = "intermediate"
    saturated: bool = False
    consolidatedFeedback: Optional[CoachingResponse] = None
    currentDrill: Optional[str] = None
    drillPhase: str = "watching"

# Simple in-memory store. Replace with Redis or DB in production.
analysis_sessions: Dict[str, AnalysisSession] = {}

MAX_FEEDBACK_ROUNDS = 6
SATURATION_THRESHOLD = 5
