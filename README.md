# HSR-Stats — Honkai: Star Rail Discord Profile Widget

Auto-updating Discord Dynamic Profile Widget for your Honkai: Star Rail account. Runs entirely on a free GitHub Actions schedule — no server, no database, and nothing on your computer after setup.

Inspired by [MeYashverma/Genshin-Stats](https://github.com/MeYashverma/Genshin-Stats), extended for HSR's endgame data.

## What it shows

- **Rotating showcase banner** — cycles through your in-game character showcase every 6 hours, with name, level, and eidolon (E0 included).
- **All four endgame modes**, formatted for widget slots (title carries the stars, label carries the detail):
  - Memory of Chaos `36/36⭐` — season name + total cycles consumed
  - Pure Fiction `12/12⭐` — season name + final-stage score
  - Apocalyptic Shadow `12/12⭐` — season name + final-stage score
  - Anomaly Arbitration — best record as `Knights x/9⭐, King y⭐`, plus the king-stage clear team resolved to character names ("Current Best Team")
- **Account stats** — Simulated Universe max world, active days, nickname/UID/region.
- **Custom progress bars** — hand-maintained percent fields for personal goals.
- **Self-refreshing auth** — a long-lived HoyoLab `stoken` mints a fresh cookie every run, so the integration never dies to cookie expiry.

## How it works

Every 6 hours a GitHub Actions job runs two stages and sends a single PATCH to Discord's widget identity endpoint:

1. `optional-hoyolab/hsr_hoyolab.py` (Python, [genshin.py](https://github.com/thesadru/genshin.py)) — refreshes the HoyoLab cookie from the stoken, fetches MoC / Pure Fiction / Apocalyptic Shadow / Anomaly Arbitration battle records, and writes `hoyo_stats.json`.
2. `hsrUser.js` (Node) — fetches public profile data from [Enka.Network](https://enka.network), picks the showcase character for the current 6-hour slot, resolves names/art from [StarRailRes](https://github.com/Mar-7th/StarRailRes), merges the battle records, and PATCHes everything to Discord.

## Known constraints (so you don't rediscover them)

- **Clear data requires a HoyoLab cookie.** HoYo removed `challengeInfo` from the public showcase packet, so Enka (and every cookie-free source) cannot serve MoC/PF/APC/AA. The battle-record API is the only path.
- **Anomaly Arbitration is own-account only** (API retcode 10104). MoC/PF/APC can be read for any UID with public battle records using any account's cookie, but AA requires the cookie owner's own UID — so the stoken must belong to the displayed account if you want AA.
- **Discord caps dynamic fields at roughly 30 per application.** This project pushes 29. Exceeding the cap fails the whole PATCH with `Invalid Form Body (50035)`.
- **Text widget slots cannot read number-typed fields.** Numbers are pushed only for progress-bar use; every displayable value also exists as text.
- The record API serves only the **current and previous season** per mode — no lifetime archive exists anywhere.

## Setup

See **[SETUP.md](SETUP.md)** for the full replication guide, including the automated setup wizard, Discord widget creation, and field binding reference.

## Credits

- [MeYashverma/Genshin-Stats](https://github.com/MeYashverma/Genshin-Stats) and [toastylol/Genshin-Stats](https://github.com/toastylol/Genshin-Stats) — original concept
- [Enka.Network](https://enka.network) — public profile data
- [Mar-7th/StarRailRes](https://github.com/Mar-7th/StarRailRes) — character names and art
- [thesadru/genshin.py](https://github.com/thesadru/genshin.py) — HoyoLab API client
- [aamiaa's widget creator](https://gist.github.com/aamiaa/7cdd590e3949cd654758bc90bcb4710b) — Discord widget scaffolding
