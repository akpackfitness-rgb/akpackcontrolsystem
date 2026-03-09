# AK Pack Fitness — Setup Guide

## What You Need
- A Google account
- A GitHub account (free)
- 15 minutes

---

## STEP 1: Create Your Google Sheet

1. Go to [sheets.new](https://sheets.new) to create a new Google Sheet
2. Name it: **AK Pack Fitness**
3. In Extensions → Apps Script, paste the contents of `google-apps-script.js`
4. Run the `setupSheets()` function once — this creates the correct sheet structure automatically

### Sheet Structure Created Automatically:

**Sheet 1 — Members**
| MemberID | Name | Phone | StartDate | ExpiryDate |
|----------|------|-------|-----------|------------|
| AK-001 | John Doe | 0712345678 | 01/01/2025 | 31/12/2025 |

**Sheet 2 — Attendance**
| Date | Time | MemberID | Name | Status |
|------|------|----------|------|--------|
| (auto-filled) | | | | |

> **Date format:** DD/MM/YYYY (e.g. 15/06/2025)

---

## STEP 2: Share Your Google Sheet (for Reading)

1. Click **Share** (top right)
2. Under "General access", change to **Anyone with the link**
3. Set permission to **Viewer**
4. Copy the link

Your **Spreadsheet ID** is the long string in the URL:
```
https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID_HERE]/edit
```

---

## STEP 3: Deploy the Apps Script (for Writing)

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Paste the full contents of `google-apps-script.js`
3. Click **Deploy → New Deployment**
4. Settings:
   - **Type:** Web App
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Click **Deploy**
6. **Copy the Web App URL** (looks like: `https://script.google.com/macros/s/ABC123.../exec`)

---

## STEP 4: Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `ak-pack-fitness`)
2. Upload all project files:
   - `index.html`
   - `admin.html`
   - `history.html`
   - `style.css`
   - `script.js`
3. Go to **Settings → Pages**
4. Source: **Deploy from a branch**
5. Branch: `main` / `root`
6. Click **Save**

Your site will be live at:
```
https://[your-username].github.io/ak-pack-fitness/
```

---

## STEP 5: Connect Everything

1. Open your live site (or `index.html` locally)
2. The **Setup Required** screen will appear automatically
3. Enter:
   - **Spreadsheet ID** (from Step 2)
   - **Apps Script URL** (from Step 3)
4. Click **SAVE & CONNECT**

The setup is saved in the browser's local storage — you only need to do this once per device.

---

## Pages

| Page | URL | Purpose |
|------|-----|---------|
| Attendance Terminal | `/index.html` | Reception tablet — members check in |
| Admin Monitor | `/admin.html` | Live attendance dashboard |
| History | `/history.html` | Full attendance log with filters |

---

## Adding Members

Add members directly to the **Members** sheet in Google Sheets:

| Column | Format | Example |
|--------|--------|---------|
| MemberID | Any unique ID | AK-001 |
| Name | Full name | JANE SMITH |
| Phone | Phone number | 0712345678 |
| StartDate | DD/MM/YYYY | 01/06/2025 |
| ExpiryDate | DD/MM/YYYY | 31/07/2025 |

---

## Membership Status Logic

| Condition | Status | Color |
|-----------|--------|-------|
| Expiry > 3 days away | Active | 🟢 Green |
| Expiry in 1–3 days | Warning / Renewing Soon | 🟡 Yellow |
| Expiry today or past | Expired | 🔴 Red |

---

## Admin Access

The Admin Monitor and History pages are accessible via their direct URLs. To add password protection:

**Option A (Simple):** Share the URLs only with staff — don't link them publicly.

**Option B (GitHub Pages):** Add a simple JavaScript password prompt at the top of `admin.html` and `history.html`:

```javascript
const adminPass = prompt("Enter admin password:");
if (adminPass !== "YOUR_PASSWORD") {
  document.body.innerHTML = "<h1>Access Denied</h1>";
}
```

---

## Troubleshooting

**"Member ID not found"**
- Check the MemberID in your Members sheet matches exactly (case-insensitive)
- Make sure the spreadsheet is shared publicly (Anyone with link → Viewer)
- Verify the Spreadsheet ID is correct in Settings

**Attendance not recording**
- Check the Apps Script URL is correct in Settings
- Make sure the Web App is deployed with "Anyone" access
- Check the browser console for errors (F12)

**Admin page shows no data**
- Same spreadsheet ID check as above
- The Attendance sheet must be named exactly `Attendance`

---

## File Structure

```
ak-pack-fitness/
├── index.html              ← Attendance Terminal (reception)
├── admin.html              ← Admin Monitor Dashboard
├── history.html            ← Attendance History + Filters
├── style.css               ← All styling
├── script.js               ← All logic + Google Sheets integration
├── google-apps-script.js   ← Paste into Google Apps Script editor
└── SETUP_GUIDE.md          ← This file
```

---

*AK Pack Fitness Attendance System — Built for GitHub Pages + Google Sheets*
