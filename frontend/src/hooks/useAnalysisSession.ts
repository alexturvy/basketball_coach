import { useState } from 'react';

interface ProgressiveResponse {
  clipNumber: number;
  saturated: boolean;
  feedback: { feedback: string };
  consolidatedFeedback?: any;
  feedbackList?: { feedback: string }[];
  keyThemes?: string[];
}

export function useAnalysisSession() {
  const [phase, setPhase] = useState<'initial' | 'assessing' | 'results'>('initial');
  const [cumulative, setCumulative] = useState<string[]>([]);
  const [consolidated, setConsolidated] = useState<any>(null);

  async function sendClip(blob: Blob) {
    let sessionId = localStorage.getItem('basketballCoachSessionId');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('basketballCoachSessionId', sessionId);
    }
    const fd = new FormData();
    fd.append('video', blob, 'clip.webm');
    fd.append('sessionId', sessionId);
    const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/progressive_analysis`, { method: 'POST', body: fd });
    const data: ProgressiveResponse = await res.json();
    if (data.feedbackList) {
      setCumulative(data.feedbackList.map(f => f.feedback));
    }
    if (data.saturated && data.consolidatedFeedback) {
      setConsolidated(data.consolidatedFeedback);
      setPhase('results');
    }
  }

  return { phase, setPhase, cumulative, consolidated, sendClip };
}
