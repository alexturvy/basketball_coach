from typing import List


def extract_key_areas(feedback_text: str) -> List[str]:
    """Extract key skill areas from feedback text."""
    areas: List[str] = []
    text_lower = feedback_text.lower()

    if "control" in text_lower or "grip" in text_lower:
        areas.append("Ball Control")
    if any(word in text_lower for word in ["rhythm", "timing", "consistency"]):
        areas.append("Rhythm & Timing")
    if any(word in text_lower for word in ["posture", "stance", "position"]):
        areas.append("Body Position")
    if "height" in text_lower or "bounce" in text_lower:
        areas.append("Dribble Height")
    if any(word in text_lower for word in ["hand", "finger"]):
        areas.append("Hand Technique")
    if any(word in text_lower for word in ["head", "eyes", "awareness"]):
        areas.append("Court Awareness")

    return areas


def extract_tips(feedback_text: str) -> List[str]:
    """Extract actionable tips from feedback text."""
    lines = feedback_text.split("\n")
    tips: List[str] = []

    for line in lines:
        line = line.strip()
        if any(starter in line.lower() for starter in [
            "tip:", "try", "focus on", "practice", "work on", "remember"]):
            clean_tip = line.lstrip("\u2022-*123456789. ").strip()
            if clean_tip and len(clean_tip) > 10:
                tips.append(clean_tip)

    if not tips:
        sentences = feedback_text.split(".")
        for sentence in sentences:
            if any(word in sentence.lower() for word in [
                "should", "try", "focus", "keep", "maintain", "improve"]):
                clean_sentence = sentence.strip()
                if len(clean_sentence) > 15:
                    tips.append(clean_sentence)

    return tips[:3]
