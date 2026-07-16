# Deploying CYRIX Discovery to Netlify

Step-by-step instructions for the first internal deployment. The app is a fully
static Vite build — no server, no database — so Netlify's free tier is sufficient.

---

## 1. Create a Netlify account

1. Go to [netlify.com](https://www.netlify.com) → **Sign up**.
2. Sign up with the GitHub account that holds (or will hold) this repository —
   it makes step 2 one click. Email signup works too.
3. No payment details are needed.

## 2. Connect the GitHub repository

> If the code isn't on GitHub yet: create a repository, then from the project folder
> `git init && git add . && git commit -m "CYRIX Discovery"` and push per GitHub's instructions.

1. In Netlify: **Add new site → Import an existing project → GitHub**.
2. Authorize Netlify and pick the repository.
3. **If this app lives in a subdirectory of the repository** (e.g. `cyrix-discovery/`
   next to other projects), set **Base directory** to `cyrix-discovery`. If the app is
   the repository root, leave it empty.
4. The included `netlify.toml` supplies the rest automatically.

**No GitHub?** Use **Netlify Drop** instead: run `npm run build` locally and drag the
`dist/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Instant, but
every update is a manual re-drag — prefer the Git flow.

## 3. Build command

```
npm run build
```

(Already set in `netlify.toml`.) Note: the build does **not** type-check — run
`npm run typecheck` locally before pushing.

## 4. Publish directory

```
dist
```

(Also already set in `netlify.toml`; relative to the base directory.)

## 5. Environment variables

**None are required.** The app is fully client-side:

- The Claude API key is **not** a build-time variable. It is entered by the Innovation
  Team in the app's Settings and stored only in that browser's localStorage.
- **Never** add an Anthropic API key as a `VITE_*` variable — anything prefixed `VITE_`
  is baked into the public JavaScript bundle and readable by anyone.
- The Innovation Dashboard access code lives in `src/App.tsx` (`ACCESS_CODE`). Change it
  before deploying. It is a convenience gate, not security — real auth arrives with the backend.

## 6. How to deploy

1. After connecting the repo (step 2), click **Deploy site**.
2. Netlify installs dependencies, runs the build, and publishes `dist/` — usually under a minute.
3. You get a URL like `https://<random-name>.netlify.app`. Rename it under
   **Site configuration → Site details → Change site name** (e.g. `cyrix-discovery.netlify.app`).
4. Smoke-test (see checklist in the main README / final verification section):
   - `/#innovation` → access gate → dashboard
   - Generate an invite in **Invites**, open it in a private window → participant portal
   - The bare URL → "This conversation is by invitation."

## 7. How to update deployments

- **Git flow:** push to the connected branch (`main`). Netlify builds and publishes
  automatically — this is the built-in CI/CD; no extra tooling needed.
- Watch progress under **Deploys**. Every deploy is kept; **roll back** by opening a
  previous deploy → **Publish deploy**.
- **Drop flow:** rebuild locally and drag `dist/` onto the site's **Deploys** page.

## 8. Custom domain (later)

1. **Domain management → Add a domain** (e.g. `discovery.cyrix.in`).
2. In your DNS (wherever `cyrix.in` is managed), add the record Netlify shows —
   typically a `CNAME` from `discovery` to `<site>.netlify.app`.
3. Wait for DNS to propagate (minutes to a few hours). Netlify verifies automatically.

## 9. HTTPS

Automatic. Netlify provisions a free Let's Encrypt certificate for both the
`*.netlify.app` URL and any custom domain (a few minutes after DNS verifies), and
renews it forever. Under **Domain management → HTTPS**, enable **Force HTTPS**.

## 10. Common deployment issues

| Symptom | Cause → fix |
|---|---|
| Build fails: "vite: not found" or wrong Node | Set **Base directory** correctly (step 2.3) so `package.json` is found; if Node version issues appear, add `NODE_VERSION=20` under Environment variables. |
| Site loads but fonts look wrong | Google Fonts are loaded from the internet — corporate networks that block `fonts.googleapis.com` will fall back to system fonts. Cosmetic only. |
| Invite link shows "isn't valid" | The link was truncated in WhatsApp/email — tokens are exactly 12 characters after `#invite/`. Regenerate and share the full URL. |
| "Disabled" links still open on participant phones | Expected today: revocation state lives in the Innovation Team's browser until a backend exists (see `src/invites.ts`). Treat links as private. |
| Live AI doesn't respond on participant devices | The Claude API key lives per-browser (Settings). Participant devices without it automatically use the built-in interviewer — by design. |
| Deployed an old version | Check **Deploys** for the latest build; clear the browser cache or hard-reload (the HTML is no-cached by Netlify, assets are fingerprinted). |
| Blank page after deploy | Almost always a mis-set publish directory — must be `dist` relative to the base directory. |

---

## A note on GitHub Actions

Not included, deliberately: Netlify's Git integration **is** the automatic deployment —
every push to `main` builds and publishes. A GitHub Actions workflow would duplicate
that with extra secrets to manage (`NETLIFY_AUTH_TOKEN`, site ID) and no benefit at this
stage. Revisit only if builds must run inside your own CI for policy reasons.
