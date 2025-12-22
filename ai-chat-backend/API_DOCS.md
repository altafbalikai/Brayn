# AI-Chat Backend API Reference

This document describes the backend HTTP APIs implemented in the `ai-chat-backend` service.
Base URL prefix used in `app.js`: `/api`

- Auth routes mounted at: `/api/auth`
- Conversation routes mounted at: `/api/conversations`
- LLM routes mounted at: `/api/llm`
- Summary routes mounted at: `/api/summary`

General notes
- Auth: JWT-based auth. Protected routes require the `auth.middleware` which expects a valid JWT in the `Authorization: Bearer <token>` header or similar configured method.
- Rate limiting: `/api/auth` is protected by a stricter rate limiter (login/signup attempts limited).
- Cache middleware: Some conversation endpoints use `cacheMiddleware` to reduce DB load (see specific endpoints).
- Request bodies are JSON. Max JSON body size configured in `app.js` (defaults to 10mb).

---

## 1) Authentication

All auth endpoints are mounted under `/api/auth`.

### POST /api/auth/signup
- Auth: public
- Purpose: Create a new user account
- Validations: `signupValidation` (email, password, optional name)
- Request body (JSON):
  {
    "email": "user@example.com",
    "password": "secret123",
    "name": "Optional Name"
  }
- Responses:
  - 201 Created: `{ id, email, name }` with `Location` header `/users/:id`
  - 400 Bad Request: validation errors
  - 409 Conflict: user already exists

### POST /api/auth/login
- Auth: public
- Purpose: Authenticate and receive an access token (and refresh token via cookie)
- Validations: `loginValidation`
- Request body:
  { "email": "user@example.com", "password": "secret" }
- Responses:
  - 200 OK: `{ user: { id, email, name }, accessToken }` and sets refresh token cookie (if present).
  - 400 Bad Request: missing fields
  - 401 Unauthorized: invalid credentials

Notes: The controller sets a refresh token cookie via `setRefreshCookie` when available. The refresh endpoint accepts a refresh token either in the cookie or in the JSON body (depending on client behavior).

### POST /api/auth/refresh
- Auth: public (requires refresh token via cookie or body)
- Purpose: Rotate/refresh access token
- Validations: `refreshValidation`
- Request body (optional if cookie used): `{ "refreshToken": "..." }`
- Responses:
  - 200 OK: `{ user: { id, email, name }, accessToken }` (may also rotate refresh cookie)
  - 400 Bad Request: missing refresh token
  - 401 Unauthorized: invalid/expired refresh token

### POST /api/auth/logout
- Auth: public (expects refresh token in cookie or body)
- Purpose: Revoke refresh token and clear cookie
- Validations: `refreshValidation`
- Request body (optional if cookie used): `{ "refreshToken": "..." }`
- Responses:
  - 204 No Content — success
  - 400 Bad Request — missing refresh token

### POST /api/auth/request-password-reset
- Auth: public
- Purpose: Initiate password reset flow (send email)
- Validations: `requestPasswordResetValidation` (email)
- Request body: `{ "email": "user@example.com" }`
- Responses: 200 OK `{ ok: true }` (always success to avoid enumeration)

### POST /api/auth/reset-password
- Auth: public
- Purpose: Complete password reset using token
- Validations: `resetPasswordValidation` (token, newPassword)
- Request body: `{ "token": "...", "newPassword": "..." }`
- Responses: 200 OK `{ ok: true }` or 4xx on invalid token

### POST /api/auth/change-password
- Auth: required (JWT)
- Purpose: Change password for authenticated user
- Validations: `changePasswordValidation` (currentPassword, newPassword)
- Request body: `{ "currentPassword": "...", "newPassword": "..." }`
- Responses: 200 OK `{ ok: true }`, 401 Unauthorized if not authenticated

---

## 2) Conversations
All conversation endpoints are mounted under `/api/conversations`. The router applies `auth.middleware` globally, so all routes require a valid access token.

### POST /api/conversations/
- Auth: required
- Purpose: Create a new conversation for the current user
- Validations: `createConversationValidation` (agentId, optional title)
- Request body: `{ "agentId": "default", "title": "My chat" }
- Responses:
  - 201 Created: returns the conversation object (including `_id`, `createdAt`, etc.)

Behavior: After creation, the controller also initializes `state.messages[conversationId] = []` in the frontend slice by convention.

### GET /api/conversations/my
- Auth: required
- Purpose: List conversations belonging to the authenticated user
- Validations: `listConversationsValidation` (query `agent`, `page`, `limit`)
- Query params: `?agent=<agentId>&page=1&limit=50`
- Caching: `cacheMiddleware(60000)` — responses cached for 60 seconds
- Responses: 200 OK: paginated list object (service returns `{ items: [...], hasMore?, page? }` or array)

### POST /api/conversations/:cid/messages
- Auth: required
- Purpose: Add a message to a conversation (usually used for persisting user or assistant messages)
- Validations: `addMessageValidation` (body `role`, `text`)
- Path param: `:cid` — conversation id
- Request body: `{ "role": "user" | "assistant", "text": "Message text" }
- Responses:
  - 201 Created: returns saved message document

### GET /api/conversations/:cid/messages
- Auth: required
- Purpose: Retrieve messages for a conversation (paginated)
- Validations: `getMessagesValidation` (query `page`, `limit`)
- Query params: `?page=1&limit=50`
- Caching: `cacheMiddleware(30000)` — responses cached for 30 seconds
- Responses: 200 OK: expected shape `{ items: [...messages], hasMore?: bool, page?: number }` or array depending on service

Notes: The frontend expects `GET /api/conversations/:id/messages` to return `items` or `messages` (the slice handles multiple shapes). Thunks call `conversationService.getMessages(conversationId, page, limit)`.

---

## 3) LLM (LLM interaction)
Routes mounted under `/api/llm` and protected by `auth.middleware`.

### POST /api/llm/ask
- Auth: required
- Purpose: Send a user message to the LLM (Gemini in this app), persist the user message, assemble recent context, call the LLM service, persist assistant reply, and return both saved messages and LLM reply text.
- Validations: `askValidation` (body `message`, `conversationId`)
- Request body:
  {
    "message": "Hello, what's the weather?",
    "conversationId": "<conversationId>"
  }
- Controller flow (see `llm.controller.ask`):
  1. Save user message (ConversationService.addMessage)
  2. Load recent messages (last N messages)
  3. Optionally include latest conversation summary as system memory
  4. Call Gemini (`askGemini`) with memory+context
  5. Save assistant reply (ConversationService.addMessage)
  6. Return `{ success: true, reply, userMessage, aiMessage }`
- Responses:
  - 200 OK: `{ success: true, reply: "...", userMessage: { ... }, aiMessage: { ... } }`
  - 400 Bad Request: if `message` missing

---

## 4) Summary
Routes under `/api/summary` and protected by `auth.middleware`.

### POST /api/summary/:conversationId
- Auth: required
- Purpose: Generate or refresh a conversation summary via `summary.service`.
- Path param: `:conversationId`
- Request body: none required
- Responses:
  - 200 OK: returns summary object (shape depends on `summary.service`)

---

## 5) Health & metrics
These endpoints are defined directly on `app` (no `/api/auth` prefix):

### GET /health
- Purpose: Basic health check
- Response: 200 OK `{ status: 'ok' }`

### GET /metrics
- Purpose: Basic application metrics (uptime, memory, DB connection)
- Response: 200 OK: JSON with status, timestamp, uptime, memory usage, database connected flag, environment

---

## 6) Notes for frontend integration
- Authentication: Frontend should store `accessToken` and send `Authorization: Bearer <accessToken>` on protected requests. Refresh tokens are set as cookies by the backend and used by `/api/auth/refresh`.
- Conversation message storage: Frontend stores messages keyed by conversation id (`state.conversation.messages[conversationId]`). When selecting a conversation the frontend dispatches `fetchMessages({ conversationId, page: 1, append: false })` to load messages.
- API shapes: The backend may return messages either as `items` or top-level arrays; the frontend slice handles both (`items || messages || data`).
- Rate limiting: `/api/auth` has stronger limits. Avoid hammering login endpoints in automated tests.
- Caching: List and get messages endpoints use short cache windows (60s and 30s respectively). Use cache-busting query params if you need immediate consistency during testing.

---

## 7) Example cURL requests
- Login:

```bash
curl -X POST https://your-api.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'
```

- List conversations:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "https://your-api.example.com/api/conversations/my?page=1&limit=20"
```

- Get messages for a conversation:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "https://your-api.example.com/api/conversations/63f...abc/messages?page=1&limit=50"
```

- Ask LLM:

```bash
curl -X POST https://your-api.example.com/api/llm/ask \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","conversationId":"63f...abc"}'
```

---

## 8) Where to look in code
- Routes: `src/routes/*.js` (`auth.routes.js`, `conversation.routes.js`, `llm.routes.js`, `summary.routes.js`)
- Controllers: `src/controllers/*.controller.js` (implement request handling)
- Services: `src/services/*` (business logic & DB interactions). Key services: `conversation.service.js`, `auth.service.js`, `gemini.service.js`, `summary.service.js`.
- Middleware: `src/middlewares/*.js` (`auth.middleware.js`, `cache.middleware.js`, `validation.middleware.js`)


---

If you want, I can also generate a Swagger / OpenAPI JSON from these routes and controllers to serve at `/api-docs` (the app already supports Swagger when `ENABLE_SWAGGER` is enabled). Would you like me to create a starter OpenAPI spec file for you? 
