# Basketball Coach AI - Launch Instructions

## Quick Start Guide

### 1. Navigate to Project Directory
```bash
cd /Users/alexturvy/basketball_coach
```

### 2. Backend Setup & Launch

**Terminal 1 - Backend:**
```bash
# From the project root
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Start the FastAPI server
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will be available at: http://localhost:8000

### 3. Frontend Setup & Launch

**Terminal 2 - Frontend:**
```bash
# Navigate to frontend directory (from project root)
cd frontend

# Install Node.js dependencies
npm install

# Start the React development server
npm start
```

The frontend will automatically open at: http://localhost:3000

## API Key Setup (Already Done)

Your Google API key has been securely added to `backend/.env` and is excluded from git commits via `.gitignore`. The key is:
- ✅ Set in `backend/.env` 
- ✅ Protected from git commits
- ✅ Ready to use

## Using the Application

### The Coaching Flow:

1. **Initial Assessment**: 
   - Allow camera access when prompted
   - Start dribbling naturally in front of the camera
   - The coach will analyze your technique for 8 seconds

2. **Get Your Results**:
   - Review "What I Noticed" - personalized assessment of your dribbling
   - See recommended drills based on your skill level and areas for improvement

3. **Practice Drills**:
   - Select from AI-recommended drills tailored to your needs
   - Get real-time feedback on your drill performance
   - The coach analyzes your execution and provides improvement tips

4. **Continue Training**:
   - Practice multiple drills or restart assessment anytime
   - Build skills progressively with intelligent recommendations

## Troubleshooting

-### Backend Issues:
- **Port 8000 in use**: Change port with `uvicorn backend.main:app --reload --port 8001`
- **Missing dependencies**: Re-run `pip install -r backend/requirements.txt`
- **API key error**: Verify `.env` file exists in backend directory

### Frontend Issues:
- **Port 3000 in use**: React will offer alternative port automatically
- **Camera not working**: Check browser permissions and try HTTPS
- **Can't connect to backend**: Ensure backend is running on port 8000

## Available Drills by Skill Level

### Beginner Drills:
- Basic Stationary Dribble
- Righty-Lefty Drill
- Red Light Green Light
- Space Man Drill

### Intermediate Drills:
- Dribbling Around Cones
- Follow the Leader
- Head Up Dribbling
- Engine & Caboose Drill

### Advanced Drills:
- One on One Dribbling
- Sharks & Minnows
- Change Direction Drill
- Dribble Around Defenders

## System Features

- **Intelligent Assessment**: Analyzes your dribbling and creates personalized training plans
- **Coach-Like Flow**: Initial assessment → Results → Recommended drills → Performance feedback
- **8-Second Video Analysis**: Captures complete dribbling patterns for meaningful analysis
- **YMCA-Based Curriculum**: Professional youth basketball training drills
- **AI Coaching**: Google Gemini provides technique analysis and tips
- **Adaptive Recommendations**: Drills suggested based on your specific needs and skill level
- **Real-time Performance Feedback**: Immediate coaching during drill practice

## Support

For issues or questions, check the README.md file or review the application logs in the terminal windows.
