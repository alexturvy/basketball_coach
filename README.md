# Basketball Coach AI

An intelligent basketball coaching application that uses computer vision and AI to analyze dribbling techniques and provide real-time feedback.

## Features

- **Real-time Video Analysis**: Records 3-second video sequences when motion is detected
- **Basketball-Specific Coaching**: Tailored feedback for different dribbling techniques
- **Drill System**: Structured practice drills with specific feedback
- **AI-Powered Analysis**: Uses Google's Gemini AI for intelligent coaching insights

## Setup

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file with your Google API key:
   ```
   GOOGLE_API_KEY=your_google_api_key_here
   ```

5. Start the backend server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

## How It Works

1. **Motion Detection**: The app continuously monitors for movement in the video feed
2. **Sequence Recording**: When motion is detected, it records a 3-second video sequence
3. **AI Analysis**: The video is sent to Google's Gemini AI for basketball-specific analysis
4. **Coaching Feedback**: Receive structured feedback including:
   - Technical analysis
   - Specific tips for improvement
   - Drill suggestions

## Available Drills

- **Basic Stationary Dribble**: Focus on fundamental ball control
- **Crossover Practice**: Work on change of direction moves
- **Between the Legs**: Practice advanced dribbling techniques
- **Behind the Back**: Master complex ball handling skills

## Usage

1. Allow camera access when prompted
2. Start with general analysis or select a specific drill
3. Begin dribbling - the app will automatically detect motion and start recording
4. Receive real-time coaching feedback and tips
5. Follow suggested drills to improve specific techniques

## Technologies Used

- **Frontend**: React, TypeScript, HTML5 Video API
- **Backend**: FastAPI, Python
- **AI**: Google Gemini 1.5 Flash
- **Video Processing**: MediaRecorder API, WebM format