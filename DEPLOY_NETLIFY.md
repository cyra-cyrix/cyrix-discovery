# Deploying CYRA Discovery to Netlify

Step-by-step instructions for the multi-device pilot. The app is a Vite build plus two
small Netlify Functions and Netlify Blobs for shared storage — all on the free tier.

Data is stored **centrally**, which is what lets an invitation open on a department
head's own phone and the interview appear on the Innovation Team's dashboard.

---

## 1. Create a Netlify account

1. Go to [netlify.com](https://www.netlify.com) → **Sign up**.
2. Sign up with the GitHub account that holds (or will hold) this repository —
   it makes step 2 one click. Email signup works too.
3. No payment details are needed.

## 2. Connect the GitHub repository

> If the code isn't on GitHub yet: create a repository, then from the project folder
> `git init && git add . && git commit -m "CYRA Discovery"` and push per GitHub's instructions.

1. In Netlify: **Add new site → Import an existing project → GitHub**.
2. Authorize Netlify and pick the repository.
3. **If this app lives in a subdirectory of the repository** (e.g. `cyrix-discovery/`
   next to other projects), set **Base directory** to `cyrix-discovery`. If the app is
   the repository root, leave it empty.
4. The included `netlify.toml` supplies the rest automatically.

**Netlify Drop will not work for the pilot.** Dragging `dist/` deploys the static site
only — no functions, so no shared storage. Use the Git flow.

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

**Two are required.** Set both under **Site configuration → Environment variables**, then
redeploy (env vars are read at request time by the functions, but a redeploy is the
simplest way to be certain).

| Variable | Value | Why |
|---|---|---|
| `ADMIN_TOKEN` | a long random string — generate with `openssl rand -hex 24` | The Innovation Team's access token. Verified **server-side**; a wrong token cannot read a single record. Give it only to the Innovation Team and Founders. |
| `ANTHROPIC_API_KEY` | your Anthropic key | Lets the server run the real interviewer and write reports. Participants never hold a key. |

> **Never prefix either with `VITE_`.** Anything prefixed `VITE_` is compiled into the
> public JavaScript bundle and readable by anyone who visits the site.

**If `ANTHROPIC_API_KEY` is missing** the pilot still runs end to end, but every
participant gets the built-in offline interviewer and an offline report instead of
Claude. Check `Settings → Connected` and one test interview before sending invitations.

**Netlify Blobs** (the pilot's datastore) needs no configuration — it is provisioned
automatically for the site.

## 6. How to deploy

1. After connecting the repo (step 2), click **Deploy site**.
2. Netlify installs dependencies, runs the build, and publishes `dist/` — usually under a minute.
3. You get a URL like `https://<random-name>.netlify.app`. Rename it under
   **Site configuration → Site details → Change site name** (e.g. `cyrix-discovery.netlify.app`).
4. Smoke-test:
   - `/#innovation` → access gate → dashboard (the landing page)
   - **People** → add a person → generate their invite link → open it in a private window → participant portal
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
| Dashboard says "Server unreachable" / login says "Could not reach the server" | The functions did not deploy. Check **Deploys → Functions** lists `api` and `analysis-background`, and that **Base directory** is set so `netlify/functions` is found. |
| Login rejects the right token | `ADMIN_TOKEN` is unset or differs on the site. Set it under Environment variables and redeploy. |
| Interviews complete but reports read as generic | `ANTHROPIC_API_KEY` is missing, so the offline analyst wrote them. Set the key and re-interview. |
| Invite says "already completed" unexpectedly | An invitation is single-use by design. Regenerate a link for that person. |
| A participant's report never arrives | The background function failed. The transcript is still stored — check **Functions → analysis-background** logs; the person's interview will show `analysis_failed` with a reason. |
| Deployed an old version | Check **Deploys** for the latest build; clear the browser cache or hard-reload (the HTML is no-cached by Netlify, assets are fingerprinted). |
| Blank page after deploy | Almost always a mis-set publish directory — must be `dist` relative to the base directory. |
| `/api/*` returns the HTML page | The SPA fallback is shadowing the API. Keep the `/api/*` function ahead of the `/*` → `/index.html` redirect in `netlify.toml`. |

---

## A note on GitHub Actions

Not included, deliberately: Netlify's Git integration **is** the automatic deployment —
every push to `main` builds and publishes. A GitHub Actions workflow would duplicate
that with extra secrets to manage (`NETLIFY_AUTH_TOKEN`, site ID) and no benefit at this
stage. Revisit only if builds must run inside your own CI for policy reasons.
