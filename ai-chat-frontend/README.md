# AI Chat Frontend

A modern, minimal React frontend for the AI Chat backend application.

## Features

- 🔐 Authentication (Login/Signup)
- 💬 Real-time chat interface
- 📝 Conversation management
- 🎨 Modern, minimal UI with Tailwind CSS
- 🔄 Redux for state management
- 🛣️ React Router for navigation

## Tech Stack

- React 18
- React Router v6
- Redux Toolkit
- Axios
- Tailwind CSS
- Vite

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (optional, defaults to `http://localhost:4000/api`):

```
VITE_API_URL=http://localhost:4000/api
```

**Note:** Make sure your backend's `FRONTEND_ORIGIN` environment variable is set to `http://localhost:3000` (or the port you're using) to allow CORS requests.

3. Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Build

```bash
npm run build
```

## Project Structure

Canonical layout used by this project (follow these paths when adding new code):

```
src/
  ├── api/            # HTTP client + thin service wrappers (src/api/*)
  │   ├── axios.js
  │   └── services/*
  ├── app/            # App-level setup (store, root config)
  │   └── store.js
  ├── features/       # Feature folders with RTK slices and thunks
  │   ├── auth/
  │   └── conversations/
  ├── routes/         # Route helpers and protected route components
  ├── components/     # Reusable UI components
  ├── pages/          # Route pages (Login, Signup, Chat)
  ├── utils/          # Utilities (cache, grouping, helpers)
  └── main.jsx        # App entry
```

Note on legacy duplicates

- This project previously had `src/services/` and `src/store/` folders that duplicated code. Those legacy folders have been removed in favor of the canonical layout above. If you see copies elsewhere, prefer the `src/api/*` and `src/features/*` locations as the single source of truth.

Example cleanup command (run from `ai-chat-frontend`):

```bash
git rm -r src/services src/store
git commit -m "chore: remove legacy duplicate service and store folders"
```
