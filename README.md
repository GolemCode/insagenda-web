# INSAgenda Web

A lightweight web version of INSAgenda that mirrors the Android app's functionality without modifying the existing Android project.

## Features
- Load calendar events from an ICS URL
- Parse and display daily events
- Derive course filters from specific sub-group codes in DESCRIPTION or SUMMARY fallback
- Filter events by selected courses
- Navigate days (previous/next) while skipping empty weekend days
- Persist URL and selected filters in localStorage

## Run as Web App
- Open `index.html` directly in a modern browser, or
- Serve the `web/` directory with any static server (e.g. `npx serve web`).

## Run as Mobile App (Capacitor)

### Prerequisites
- Node.js installed
- Android Studio (for Android)
- Xcode (for iOS, macOS only)

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Add platforms:
   ```bash
   npm run cap:add
   ```

3. Copy web assets:
   ```bash
   npm run cap:copy
   ```

4. Sync changes:
   ```bash
   npm run cap:sync
   ```

5. Open in native IDE:
   ```bash
   # Android
   npm run cap:open:android
   
   # iOS
   npm run cap:open:ios
   ```

## Configure ICS URL
- Click the gear icon at the top right to set or update the ICS URL
- The URL is saved in your browser's localStorage
- In mobile app, this bypasses CORS restrictions 