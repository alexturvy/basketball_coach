# 🏀 Basketball Dribbling Coach AI

An intelligent basketball coaching application that uses computer vision and AI to analyze dribbling techniques and provide personalized feedback. Built with ESPN-inspired design and progressive clip analysis.

## ✨ Features

### 🎯 Smart Analysis System
- **Progressive Assessment**: Analyzes 5 video clips for comprehensive evaluation
- **Manual Controls**: Start/pause analysis with user control
- **Real-time Progress**: Visual recording countdown and clip progress tracking
- **Session Management**: Maintains context across multiple clips

### 🤖 AI-Powered Coaching
- **Technique Analysis**: Detailed evaluation of ball control, rhythm, and posture
- **Personalized Feedback**: Clipboard-style feedback display with accumulated insights
- **Drill Recommendations**: Intelligent suggestions based on skill assessment
- **Robust Processing**: Works in any lighting/background conditions

### 📱 User Experience
- **ESPN-Inspired Design**: Professional sports app aesthetic
- **Responsive Layout**: Works on desktop and mobile devices
- **Motion Detection**: Automatic recording trigger when dribbling starts
- **Error Recovery**: Network retry logic and graceful error handling

### 🎮 Drill System
- **Beginner Drills**: Basic Stationary Dribble, Righty-Lefty Practice
- **Intermediate Drills**: Cone Weaving, Head Up Dribbling
- **Advanced Drills**: One-on-One Pressure, Complex Combinations
- **Structured Progression**: YMCA curriculum-based skill development

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm
- Python 3.8+
- Google AI API key ([Get one here](https://ai.google.dev/))
- Camera-enabled device
- Modern web browser (Chrome recommended)

### Backend Setup
1. **Create virtual environment (from project root):**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Configure environment:**
   ```bash
   # Create .env file in the backend folder
   echo "GOOGLE_API_KEY=your_google_api_key_here" > backend/.env
   ```

4. **Start the server (from project root):**
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup
1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm start
   ```

4. **Open in browser:**
   ```
   http://localhost:3000
   ```

## 📖 How to Use

### Getting Started
1. **Allow camera access** when prompted by your browser
2. **Position yourself** 3-6 feet from the camera
3. **Click "Start Analysis"** to begin the assessment
4. **Start dribbling** to trigger automatic recording

### The Analysis Process
1. **Recording Phase**: Each clip records for 10 seconds with visual countdown
2. **Processing Phase**: AI analyzes technique and provides feedback
3. **Review Phase**: Check clipboard-style feedback after each clip
4. **Progress Tracking**: Watch your progress through 5 total clips
5. **Final Assessment**: Receive comprehensive evaluation and drill recommendations

### Understanding Feedback
- **Technique Analysis**: Ball control, rhythm, posture, and awareness
- **Key Areas**: Identified skill areas for improvement
- **Actionable Tips**: Specific suggestions for better technique
- **Drill Suggestions**: Personalized practice recommendations

## 🏀 Enhanced Drill System with YouTube Examples

### Beginner Level
- **Basic Stationary Dribble**: Master fingertip control and athletic stance
- **Righty-Lefty Drill**: Develop equal skill with both hands
- **Red Light Green Light**: Practice stop-and-go control
- **Space Man Drill**: Build court awareness

### Intermediate Level
- **Head Up Dribbling**: Develop court vision while maintaining control
- **Crossover Drill**: Master NBA-level crossover technique (low, tight, quick)
- **Dribbling Around Cones**: Improve agility and direction changes
- **Follow the Leader**: Enhance adaptability and coordination

### Advanced Level
- **One on One Dribbling**: Handle defensive pressure with ball protection
- **Sharks & Minnows**: Master pressure situations
- **Change Direction Drill**: Perfect explosive directional changes
- **Dribble Around Defenders**: Navigate tight spaces

### New Drill Flow (Watch → Practice → Feedback)
1. **Watch Phase**: View YouTube examples with key points and common mistakes
2. **Practice Phase**: AI-guided practice with real-time feedback
3. **Feedback Phase**: Targeted improvement suggestions based on elite coaching

## 🛠️ Technical Architecture

### Frontend Stack
- **React 19** with TypeScript
- **ESPN-inspired CSS** with custom properties
- **MediaRecorder API** for video capture
- **Canvas API** for motion detection
- **Modern Hooks** for state management

### Backend Stack
- **FastAPI** with async support
- **Google Gemini 1.5 Flash** for AI analysis
- **Pydantic** for data validation
- **CORS middleware** for cross-origin requests
- **Session management** for progressive analysis

### AI Integration
- **Video Processing**: Supports WebM format under 20MB
- **Robust Prompting**: Technique-focused analysis regardless of video quality
- **Error Handling**: Graceful degradation and retry logic
- **Progressive Learning**: Accumulates insights across multiple clips

## 🎨 Design Philosophy

### ESPN-Inspired Aesthetic
- **Professional Sports Look**: Clean, modern interface
- **Basketball Color Scheme**: Orange, red, and court green
- **Responsive Grid Layout**: Adapts to all screen sizes
- **Animated Components**: Smooth transitions and feedback

### User-Centered Design
- **Minimal Text**: Focus on visual feedback over verbose instructions
- **Intuitive Controls**: Clear start/pause functionality
- **Progress Indicators**: Always know where you are in the process
- **Error Recovery**: Helpful messages and retry options

## 🔧 Configuration

### Environment Variables
```bash
# Backend (.env)
GOOGLE_API_KEY=your_google_api_key_here

# Frontend (optional)
REACT_APP_API_URL=http://localhost:8000  # Custom backend URL
```

### Video Settings
- **Recording Duration**: 10 seconds per clip
- **Analysis Interval**: 12 seconds between clips
- **Motion Threshold**: Configurable sensitivity
- **Video Format**: WebM with VP8 codec

### AI Configuration
- **Model**: Google Gemini 1.5 Flash
- **Timeout**: 60 seconds per request
- **Retry Logic**: Up to 3 attempts for network failures
- **Saturation Threshold**: 5 clips for complete assessment

## 🚦 Troubleshooting

### Common Issues
1. **Camera Access Denied**: Check browser permissions and use HTTPS
2. **Backend Connection Failed**: Ensure backend is running on port 8000
3. **Analysis Timeout**: Check internet connection and API key
4. **Poor Video Quality**: App works in any conditions - keep trying!

### Browser Support
- **Chrome**: Full support (recommended)
- **Firefox**: Full support
- **Safari**: Supported with some limitations
- **Edge**: Full support

### Performance Tips
- **Good Lighting**: While not required, it helps with motion detection
- **Stable Internet**: Ensures reliable analysis processing
- **Clear Space**: 3-6 feet from camera works best
- **Regular Dribbling**: Consistent motion triggers recording

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for:
- Code style and formatting
- Pull request process
- Issue reporting
- Feature requests

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Google AI** for Gemini API
- **YMCA** for basketball curriculum guidance
- **ESPN** for design inspiration
- **Basketball coaching community** for feedback and testing

---

**Ready to improve your dribbling? Start your analysis now!** 🏀✨