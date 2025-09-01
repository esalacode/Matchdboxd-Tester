# Matchboxd – Vercel deploy (two-panel)
This version deploys on **Vercel**. API route at `/api/ratings`.

**Deploy**
1. New GitHub repo → upload files.
2. Vercel: Add New → Project → Import repo. Framework: **Other** (no build).
3. Build command: *(none)*. Output directory: *(root)*.
4. Deploy and test:
   - API: `/api/ratings?user=eddieslb`
   - UI: enter usernames in both panels, click **Fetch** or **Fetch both**.

`vercel.json` pins Node 20 for the serverless function.
