from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64
import google.generativeai as genai
import os
from dotenv import load_dotenv

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

# Configure Gemini API
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.post("/video_feed")
async def video_feed(image_data: ImageData):
    try:
        # Decode the base64 image data
        # The data comes as "data:image/jpeg;base64,...", so we split off the header
        header, encoded_image = image_data.image.split(",", 1)
        decoded_image = base64.b64decode(encoded_image)

        # Send to Gemini for analysis
        response = model.generate_content(["Analyze this image for basketball dribbling form and provide concise feedback.", {'mime_type': 'image/jpeg', 'data': decoded_image}])
        
        return {"message": response.text}
    except Exception as e:
        return {"message": f"Error processing image or Gemini API call: {e}"}
