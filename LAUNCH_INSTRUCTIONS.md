# Basketball Coach AI - Launch Instructions

## Quick Start Guide

### 1. Navigate to Project Directory
```bash
cd /Users/alexturvy/basketball_coach
```

### 2. Backend Setup & Launch

**Terminal 1 - Backend:**
```bash
# Navigate to backend directory
cd backend

# Activate virtual environment (create if it doesn't exist)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
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

## Testing the Application

1. **Allow Camera Access**: When prompted, grant camera permissions
2. **Select Skill Level**: Choose Beginner, Intermediate, or Advanced
3. **Pick a Drill**: Select from skill-appropriate drills
4. **Start Dribbling**: The app will detect motion and record 3-second sequences
5. **Get Feedback**: Receive AI-powered coaching analysis

## Troubleshooting

### Backend Issues:
- **Port 8000 in use**: Change port with `uvicorn main:app --reload --port 8001`
- **Missing dependencies**: Re-run `pip install -r requirements.txt`
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

- **Video Sequence Analysis**: Records 3-second clips when motion detected
- **YMCA-Based Curriculum**: Professional youth basketball training drills
- **AI Coaching**: Google Gemini provides technique analysis and tips
- **Progressive Training**: Skill-based drill recommendations
- **Real-time Feedback**: Immediate coaching insights

## Support

For issues or questions, check the README.md file or review the application logs in the terminal windows.