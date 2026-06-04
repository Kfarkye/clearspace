
# Truth - V1 Complete

Truth is a premium, ultra-minimalist intelligence layer designed with absolute precision, generous whitespace, and a sophisticated warm alabaster, sand, and bronze aesthetic. 

## 10 Power-User Prompts (Moving from Demo to Utility)

To see the true power of Truth's dynamic artifact generation and tool calling, try these 10 advanced prompts. They demonstrate how the app adapts its UI to your exact intent.

### Workspace & Productivity
1. **The Triage:** 
   > "I have 15 minutes before my next meeting. Give me a workspace brief of only my urgent emails and any action items due today."
2. **The Prepk at my schedule for today. For my next meeting, draft a quick summary of the last 3 emails from the attendees."aration:** 
   > "Loo
3. **The Workflow Generator:** 
   > "Give me a sidebar menu of my active workflows: one for checking my priority inbox, one for live sports scores, and one for my compliance checklist."

### Sports & Betting Markets
4. **The Deep Analysis:** 
   > "Give me the sharp analysis and betting angles for the Lakers vs. Nuggets game tonight, specifically focusing on the Under for total points based on recent pace trends."
5. **The Live Action:** 
   > "What's the live win probability for the Chiefs game, and are there any live player prop edges I should look at right now?"
6. **The Consensus Check:** 
   > "Show me the betting angles for the Arsenal match. I want to see the exact ticket vs. money splits to identify where the sharp money is moving."

### Travel Healthcare Logistics
7. **The Contract Optimizer:** 
   > "I'm an ICU RN looking for a contract in California starting next month. Show me the top 3 highest-paying job matches and flag any compliance items I need to renew before then."
8. **The Compliance Audit:** 
   > "Give me a full audit of my credentialing status. What's missing or expiring in the next 30 days that will block me from taking a new allied health placement?"

### Code & Automation
9. **The Data Parser:** 
   > "Write a Python script using pandas to parse a CSV of historical NFL scores, calculate the rolling 3-game point differential for each team, and output the top 5 teams."
10. **The Cross-Domain Operator:** 
    > "I need to lock in for the next 2 hours. Give me a sidebar with my pending action items, and write a Node.js script I can run to automatically set my Slack status to 'Deep Work'."

---

## Standard Chat Mode
Truth now includes a mode switcher in the top header. 
- **Operator Mode:** Strict, terse, artifact-driven responses.
- **Standard Mode:** A relaxed, friendly, conversational Gemini persona for general inquiries.

---

## The Google Workspace Integration (Phase 2 & 3)

Truth is now wired up with **Gemini Tool Calling**. When you ask about your schedule or emails, Gemini will automatically trigger the `get_workspace_context` tool, execute the functions in `services/apiClient.ts`, and render the live data into the glassmorphic artifact.

### Your Next Steps (The OAuth Flow)

Currently, `App.tsx` passes a `mock_oauth_token` to the API client, and `apiClient.ts` returns realistic mock data so you can test the tool calling immediately. To connect this to your actual Google account, follow these detailed steps:

1. **Google Cloud Setup (Detailed):**
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - **Project:** Click the project dropdown at the top left. Create a new project, or if you have hit your account quota, select a hardly used existing project to bypass the limit.
   - **Enable APIs:** 
     - In the left sidebar, navigate to **APIs & Services** > **Library**.
     - Search for and enable the **Gmail API**, **Google Calendar API**, and **Google Tasks API**.
   - **OAuth Consent Screen:**
     - In the left sidebar, go to **APIs & Services** > **OAuth consent screen**.
     - Choose **External** (unless you have a Google Workspace org) and click Create.
     - **App name:** Enter "Truth Local Dev" (this is just the display name you will see when logging in).
     - **User support email / Developer contact:** Enter your own email address.
     - Under "Test users", add your own Google email address so you can log in during development.
   - **Create Credentials:**
     - In the left sidebar, go to **APIs & Services** > **Credentials**.
     - Click **+ CREATE CREDENTIALS** at the top and select **OAuth client ID**.
     - **Application type:** Web application.
     - **Name:** "Truth Web Client" (This is just an internal label for you, it can be anything).
     - **Authorized JavaScript origins:** You must enter the exact URL where your app is running. 
       - *If running in this Cloud Environment:* Look at the URL bar of the preview window, or click the button to "Open in New Tab". Copy that exact URL (it will look something like `https://random-string-3000.preview.app`).
       - *If running locally on your machine:* It is usually `http://localhost:3000` or `http://localhost:5173`.
       - **Important:** Do *not* include a trailing slash at the end (e.g., use `https://my-app.com`, not `https://my-app.com/`).
     - **Authorized redirect URIs:** Enter the exact same URL you used for the JavaScript origin.
     - Click Create. Save your **Client ID**.

2. **Frontend Authentication:**
   - Install an OAuth provider like `@react-oauth/google`.
   - Wrap your app in the provider using the Client ID you just created.
   - Replace the "Connect" button in `App.tsx` with the Google Login flow.
   - Request the following scopes during login:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/tasks.readonly`

3. **Swap the Token:**
   - Once the user logs in, save their `access_token` to state.
   - In `App.tsx`, inside the `handleSendMessage` function, replace `const mockToken = "mock_oauth_token_123";` with your real access token.
   - In `services/apiClient.ts`, uncomment the actual `fetch()` logic inside the workspace functions.

The architecture is fully complete. Once you drop in the real token, Truth will instantly render your live inbox and calendar.
