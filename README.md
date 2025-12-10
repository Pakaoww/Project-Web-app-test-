# Pre-order USA Shop (Prototype)

Minimal prototype for a pre-order shop that imports products from the USA and lets users browse by brand and add items to a session-backed cart.

Quick start

1. Install dependencies:

```powershell
npm install
```

2. Run in development (uses `nodemon`):

```powershell
npm run dev
```

3. Open http://localhost:3000 in your browser.

Authentication
- Register at `/login.html` (register form) or use the login form to sign in.
- Dashboard is at `/dashboard` (protected). The server uses session cookies to keep you logged in.

Developer notes
- Session secret is in `index.js` — change before deploying.
- Users are stored in `data/app.db` (SQLite).

Notes
- This prototype uses a static `data/products.json` list and session-based cart. Replace with a real DB and authentication for production.
- Update the session secret in `index.js` before deploying.
