# 🚀 Basketball Coach Deployment Guide

## Step-by-Step Deployment (No Coding Experience Required)

### Part 1: Deploy the Backend API (5 minutes)

1. **Go to Render.com**
   - Visit: https://render.com
   - Click "Get Started for Free"
   - Sign up with your GitHub account (the same one connected to your basketball_coach repo)

2. **Create New Web Service**
   - Click "New +" button
   - Select "Web Service"
   - Choose "Connect a repository"
   - Select your `basketball_coach` repository
   - **Important**: Set "Root Directory" to `backend`

3. **Configure the Service**
   - **Name**: `basketball-coach-api`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Select "Free" (it's perfectly fine for this app)

4. **Add Environment Variable**
   - In "Environment Variables" section:
   - **Key**: `GOOGLE_API_KEY`
   - **Value**: 
   - Click "Add"

5. **Deploy**
   - Click "Create Web Service"
   - Wait 3-5 minutes for deployment to complete
   - You'll get a URL like: `https://basketball-coach-api.onrender.com`
   - **SAVE THIS URL** - you'll need it for Part 2

### Part 2: Deploy the Frontend (3 minutes)

1. **Go to Vercel.com**
   - Visit: https://vercel.com
   - Click "Start Deploying"
   - Sign up with your GitHub account

2. **Import Your Repository**
   - Click "Add New..." → "Project"
   - Find your `basketball_coach` repository
   - Click "Import"

3. **Configure the Project**
   - **Framework Preset**: Vercel will detect "Create React App" automatically
   - **Root Directory**: Leave empty (default)
   - **Build Command**: Leave default
   - **Output Directory**: Leave default

4. **Add Environment Variable**
   - Click "Environment Variables"
   - **Name**: `REACT_APP_API_URL`
   - **Value**: `https://basketball-coach-api.onrender.com` (use the URL from Part 1)
   - Click "Add"

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes for deployment
   - You'll get a URL like: `https://basketball-coach-abc123.vercel.app`

### Part 3: Connect to Your Domain (10 minutes)

1. **In Vercel Dashboard**
   - Go to your basketball-coach project
   - Click "Settings" tab
   - Click "Domains" in the sidebar
   - Click "Add Domain"
   - Enter: `alexturvy.com/basketball_coach`
   - Click "Add"

2. **Get DNS Instructions**
   - Vercel will show you DNS records to add
   - **Copy these exactly** - you'll need them for Namecheap

3. **In Namecheap Dashboard**
   - Log into your Namecheap account
   - Go to "Domain List"
   - Click "Manage" next to alexturvy.com
   - Click "Advanced DNS" tab

4. **Add DNS Records**
   - Click "Add New Record"
   - Follow the exact instructions Vercel gave you
   - Usually it's a CNAME record pointing to Vercel

5. **Wait for Propagation**
   - DNS changes take 10-60 minutes to propagate
   - Test by visiting `alexturvy.com/basketball_coach`

## 🎯 Final Result

Your app will be live at:
- **Main URL**: `alexturvy.com/basketball_coach`
- **Backup URL**: The Vercel URL (if domain setup has issues)

## 💰 Costs

- **Render**: FREE (up to 750 hours/month)
- **Vercel**: FREE (100GB bandwidth/month)
- **Google Gemini API**: ~$0.01 per video analysis

## 🆘 If You Get Stuck

**Common Issues:**

1. **Backend deployment fails**:
   - Check that "Root Directory" is set to `backend` in Render
   - Verify the Google API key is correctly entered

2. **Frontend can't connect to backend**:
   - Make sure the `REACT_APP_API_URL` environment variable is correct
   - Try the backend URL directly in your browser - you should see `{"Hello": "Basketball Coach AI"}`

3. **Domain not working**:
   - DNS changes can take up to 24 hours
   - Use the direct Vercel URL while waiting

**Need Help?**
- Render Support: https://render.com/docs
- Vercel Support: https://vercel.com/help
- Or ask me for help with any specific error messages!

## 🔧 Making Updates

After initial deployment, any time you push changes to GitHub:
- **Backend**: Automatically redeploys on Render
- **Frontend**: Automatically redeploys on Vercel

Just use your normal git commands:
```bash
git add .
git commit -m "your changes"
git push
```

Both services will automatically update!
