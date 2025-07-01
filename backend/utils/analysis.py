from .session import AnalysisSession, CoachingResponse
from .parsing import extract_key_areas, extract_tips
from typing import List
import google.generativeai as genai
import os

# Gemini configuration is done once here
if os.environ.get("GOOGLE_API_KEY"):
    genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')


def consolidate_session_feedback(session: AnalysisSession) -> CoachingResponse:
    """Consolidate all feedback from a session into final assessment."""
    all_feedback = " ".join([f.feedback for f in session.feedbackList])
    all_areas = list({area for f in session.feedbackList for area in f.keyAreas})
    all_tips = list({tip for f in session.feedbackList for tip in f.tips})

    consolidation_prompt = (
        f"Based on {len(session.feedbackList)} basketball dribbling video clips, "
        "provide a comprehensive assessment.\n\n"
        f"Accumulated feedback: {all_feedback}\n\n"
        f"Key areas identified: {', '.join(all_areas)}\n\n"
        "Please consolidate this into:\n"
        "1. A comprehensive assessment highlighting the main patterns\n"
        "2. The top 3 most important areas to focus on\n"
        "3. Specific drill recommendation based on the identified needs\n"
        "4. Primary technique focus area\n"
    )

    try:
        consolidation_response = model.generate_content([consolidation_prompt])
        consolidated_text = consolidation_response.text

        feedback = CoachingResponse(
            feedback=consolidated_text,
            tips=extract_tips(consolidated_text),
        )
        if not feedback.technique and all_areas:
            feedback.technique = all_areas[0]
        return feedback
    except Exception as e:
        # Basic fallback
        return CoachingResponse(
            feedback=f"Based on {len(session.feedbackList)} clips, focus on {', '.join(all_areas[:3])}",
            technique=all_areas[0] if all_areas else "Ball Control",
            tips=all_tips[:3],
            drillSuggestion="Basic Stationary Dribble",
        )
