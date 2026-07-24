# Replication Guide

Complete walkthrough from zero to a live, self-updating widget. One-time effort: roughly 30 minutes. After that everything runs on GitHub's servers — your computer does not need to be on.

## Prerequisites

- A GitHub account
- A Discord account
- Python 3.10+ and Node 18+ installed locally (only needed during setup)
- Your 9-digit HSR UID, with **Show Character Details** enabled in-game (Profile → showcase settings) and **Battle Chronicle** set to public on HoyoLab (Profile → Settings → Privacy)

## Part 1 — Discord application + widget

Discord's widget editor is behind a feature flag; aamiaa's script handles everything.

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications), press `Ctrl+Shift+I` → Console (type `allow pasting` if prompted).
2. Paste the script from [aamiaa's WidgetCreator gist](https://gist.github.com/aamiaa/7cdd590e3949cd654758bc90bcb4710b) and press Enter. Solve captcha/2FA if prompted.
3. It creates an application, a widget, adds it to your profile, and copies a command to your clipboard — paste that into a terminal and run it once (this initializes the widget identity).
4. Note the **Application ID** (General Information) and the **bot token** (embedded in the copied command, or Bot tab → Reset Token). You'll need both as secrets.
5. Get your **Discord User ID**: Discord → Settings → Advanced → enable Developer Mode, then right-click your own name → Copy User ID.

If the widget editor tab disappears later, re-enable it with this console snippet, then open your app → Games → Widget:

```js
let wpRequire = webpackChunkdiscord_developers.push([[Symbol()], {}, r => r]);
webpackChunkdiscord_developers.pop();
Object.values(wpRequire.c).find(x => x?.exports?.A?.createOverride).exports.A
    .createOverride("2026-03-widget-config-editor", 1);
```

## Part 2 — Automated setup (recommended)

The wizard does everything else: HoyoLab login (long-lived stoken for permanent cookie auto-refresh), validation against Enka and the record API, a Discord test PATCH, GitHub repo creation, encrypted secrets, and the first workflow run.

```bash
pip install -r setup_requirements.txt
python setup_wizard.py
```

You'll be asked for: your HSR UID, HoyoLab email + password (see the account note below), the Discord Application ID / User ID / bot token, and a GitHub classic PAT with `repo` + `workflow` scopes ([create one here](https://github.com/settings/tokens/new?scopes=repo,workflow)). Password prompts hide your typing; a captcha may open in your browser; a verification code may be emailed. The PAT can be deleted after setup.

**Which HoyoLab account?** Anomaly Arbitration data is only served for the cookie owner's own UID (API restriction, retcode 10104). If you want AA on the widget, log in with the account that owns the displayed UID. If you skip AA, a throwaway HoyoLab account works for everything else — your main only needs public battle records.

### Manual alternative

1. Create a private GitHub repo and upload every file in this project.
2. Run `python optional-hoyolab/get_stoken.py` locally — it prints `HOYO_LTUID_V2`, `HOYO_MID`, `HOYO_STOKEN`.
3. Add repo secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `HSR_UID` | your 9-digit UID |
   | `DISCORD_CLIENT_ID` | Application ID |
   | `DISCORD_USER_ID` | your Discord user ID |
   | `DISCORD_BOT_TOKEN` | bot token |
   | `HOYO_LTUID_V2` / `HOYO_MID` / `HOYO_STOKEN` | printed by get_stoken.py |
   | `DISCORD_CLIENT_ID_2` / `DISCORD_BOT_TOKEN_2` | optional second widget app |

4. Actions → Update HSR Widget → Run workflow.

## Part 3 — Bind the fields

The first successful run registers the data fields on your application. Then in the widget editor (app → Games → Widget), set each component's Value Type to **User Data**, click the pencil next to Data Field, and type the field name (case-sensitive). Enable Fallback with a placeholder for the battle-record fields.

| Slot | Value (big text) | Label (small text) |
|---|---|---|
| Hero image | `image` (image type) | — |
| Title/subtitle | `char` → "Name • Lv. 80 • E1" | `uid`, `world`, `nickname` as desired |
| MoC | `moc_str` → "Memory of Chaos 36/36⭐" | `moc_detail` → "Season: 48 cycles" |
| Pure Fiction | `pf_str` | `pf_detail` → "Season: 115,640 pts" |
| Apoc. Shadow | `apc_str` | `apc_detail` |
| Anomaly Arb. | `aa_str` (or `aa` for "7⭐ • Gold") | `aa_detail` → "Season: Knights 5/9⭐, King 2⭐" |
| Best team | `aa_team_str` → "Current Best Team" | `aa_team` → "Name, Name, Name, Name" |
| Stats | `su` (Simulated Universe), `days_txt` (active days) | `su_str`, `days_str` |
| Progress bars | `bar_1`, `bar_2` (numbers 0-100, set max to 100) | `bar_1_str`, `bar_2_str` |

Compact spares also exist: `moc`, `pf`, `apc`, `pf_pts`, `apc_pts`.

## Configuration knobs

- **Progress bars**: edit the `PROGRESS_BARS` array at the top of `hsrUser.js` (labels + percents; hand-maintained).
- **Achievement total**: `ACH_TOTAL` env in `update.yml` if you re-add achievement fields.
- **Rotation speed**: `ROTATE_HOURS` in `update.yml` (match the cron).
- **Stale-data guard**: `HOYO_STATS_MAX_AGE_H` (default 48h) drops battle-record fields if the Python stage has been failing.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Run fails: `Invalid Form Body (50035)` | Over the ~30 dynamic-field cap — remove fields from `hsrUser.js` |
| A slot shows its fallback text | Field name typo (case-sensitive), or a number field bound to a Text slot — use the `_txt` text variants |
| `stoken rejected` in the log | Account password changed — re-run `get_stoken.py`, update the three secrets |
| `[10104] Cannot view real-time notes of other users` on AA | Cookie account ≠ displayed UID; AA is own-account only |
| `DataNotPublic` on MoC/PF/APC | Displayed account's Battle Chronicle is private on HoyoLab |
| Widget looks stale | Discord caches profiles — Ctrl+R the client; data refreshes on the 6h cron |
| Every push shows a failed run | Workflow YAML error — check Actions → the run's annotation |

## FAQ

**Does my computer need to stay on?** No. The schedule runs on GitHub-hosted runners. Local tools are only used during setup.

**How fresh is the data?** Each run fetches live data; the cron fires every 6 hours (GitHub may delay scheduled runs by a few minutes). Trigger manually anytime from the Actions tab.

**Can I run two widgets?** Yes. Same application: add a second widget config in the editor — it reads the same fields automatically. Different application: set the `DISCORD_CLIENT_ID_2` / `DISCORD_BOT_TOKEN_2` secrets and both apps receive the data each run (the second app still needs the Part 1 scaffolding).

**Is the stoken safe in GitHub secrets?** Secrets are encrypted and never shown again; the repo should stay private. Changing the HoyoLab account's password instantly revokes the stoken if you ever want out.
