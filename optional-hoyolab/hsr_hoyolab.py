import asyncio
import json
import os
import time
from pathlib import Path

import genshin

_MAX_STARS = {"moc": 36, "pf": 12, "apc": 12}

def _fmt(mode, key="moc") -> str | None:
    if mode is None or getattr(mode, "has_data", True) is False:
        return None
    stars = getattr(mode, "total_stars", 0) or 0
    return f"{stars}/{_MAX_STARS.get(key, 36)}⭐"

def _score(mode) -> str | None:
    if mode is None or getattr(mode, "has_data", True) is False:
        return None
    floors = getattr(mode, "floors", None) or []
    if not floors:
        return None
    top = max(floors, key=lambda f: getattr(f, "id", 0) or 0)
    score = getattr(top, "score", 0) or 0
    return f"{score:,} pts" if score else None

def _season_name(mode) -> str:
    seasons = getattr(mode, "seasons", None) or []
    if seasons:
        return (getattr(seasons[0], "name", "") or "").strip()
    return (getattr(mode, "name", "") or "").strip()

def _cycles(mode) -> int:
    return sum((getattr(f, "round_num", 0) or 0) for f in (getattr(mode, "floors", None) or []))

def _detail(mode, key) -> str | None:
    if mode is None or getattr(mode, "has_data", True) is False:
        return None
    bits = []
    if key in ("pf", "apc") and (pts := _score(mode)):
        bits.append(pts)
    if key == "moc" and (c := _cycles(mode)):
        bits.append(f"{c} cycles")
    body = ", ".join(bits)
    name = _season_name(mode)
    if name and body:
        return f"{name}: {body}"
    return name or body or None

def _anomaly_parts(data) -> tuple[str | None, str | None, list]:
    if not data:
        print("Anomaly Arbitration: API returned an empty payload.")
        return None, None, []

    recs = [r for r in (data.get("challenge_peak_records") or [])
            if r.get("has_challenge_record")]
    brief = data.get("challenge_peak_best_record_brief") or {}

    mob = brief.get("mob_stars") or 0
    boss = brief.get("boss_stars") or 0
    medal_raw = brief.get("challenge_peak_rank_icon_type") or ""
    rec = None
    if mob or boss or medal_raw:

        rec = next((r for r in recs
                    if (r.get("mob_stars") or 0) == mob
                    and (r.get("boss_stars") or 0) == boss), None)
    elif recs:

        rec = recs[0]
        mob = rec.get("mob_stars") or 0
        boss = rec.get("boss_stars") or 0

    if rec is not None and not medal_raw:
        medal_raw = ((rec.get("boss_record") or {}).get("challenge_peak_rank_icon_type") or "")
    medal = medal_raw.replace("_", " ").strip().title()
    if not (mob or boss or medal):
        print("Anomaly Arbitration: no clear record in response; keys:", list(data.keys()))
        return None, None, []

    total = f"{mob + boss}⭐ • {medal}" if medal else f"{mob + boss}⭐"

    body = f"Knights {mob}/9⭐, King {boss}⭐"
    season = (((rec or {}).get("group") or {}).get("name_mi18n") or "").strip()
    detail = f"{season}: {body}" if season else body

    team = [a.get("id") for a in (((rec or {}).get("boss_record") or {}).get("avatars") or [])
            if a.get("id")]
    return total, detail, team

async def _grab(label: str, coro, out: dict, key: str, fmt=_fmt) -> None:
    try:
        value = fmt(await coro)
        if value:
            out[key] = value
    except genshin.errors.DataNotPublic:
        print(
            f"{label}: target UID's battle records are PRIVATE. "
            "Enable them: HoyoLab -> Settings -> Privacy Settings -> Battle Chronicle."
        )
    except genshin.errors.InvalidCookies:
        print(f"{label}: cookie expired/invalid — refresh HOYO_LTUID_V2 / HOYO_LTOKEN_V2 secrets.")
    except Exception as e:
        print(f"{label} fetch failed:", e)

async def _build_cookies() -> dict:
    ltuid = os.environ["HOYO_LTUID_V2"]
    stoken = os.environ.get("HOYO_STOKEN", "").strip()
    mid = os.environ.get("HOYO_MID", "").strip()

    if stoken and mid:

        from genshin.client.manager.cookie import fetch_cookie_with_stoken_v2

        fresh = await fetch_cookie_with_stoken_v2(
            {"stoken": stoken, "mid": mid}, token_types=[2]
        )
        print("Auto-refreshed ltoken_v2 from stoken.")
        return {"ltuid_v2": ltuid, "ltmid_v2": mid, "ltoken_v2": fresh["ltoken_v2"]}

    print("No HOYO_STOKEN/HOYO_MID set — using static HOYO_LTOKEN_V2 (may expire).")
    return {"ltuid_v2": ltuid, "ltoken_v2": os.environ["HOYO_LTOKEN_V2"]}

async def main() -> None:
    uid = int(os.environ["HSR_UID"])
    try:
        cookies = await _build_cookies()
    except genshin.errors.InvalidCookies:
        raise SystemExit(
            "stoken rejected — it is revoked (password changed?). "
            "Re-run optional-hoyolab/get_stoken.py locally and update the secrets."
        )
    client = genshin.Client(cookies, game=genshin.Game.STARRAIL)

    out: dict = {"generated_at": int(time.time())}

    async def mode_fields(label, coro, key):
        res = {}
        await _grab(label, coro, res, "mode", fmt=lambda m: m)
        mode = res.get("mode")
        if mode is None:
            return
        if (v := _fmt(mode, key)):
            out[key] = v
        if key in ("pf", "apc") and (p := _score(mode)):
            out[f"{key}_pts"] = p
        if (d := _detail(mode, key)):
            out[f"{key}_detail"] = d

    await mode_fields("Memory of Chaos", client.get_starrail_challenge(uid), "moc")
    await mode_fields("Pure Fiction", client.get_starrail_pure_fiction(uid), "pf")
    await mode_fields("Apocalyptic Shadow", client.get_starrail_apc_shadow(uid), "apc")
    aa_res = {}
    await _grab("Anomaly Arbitration", client.get_anomaly_arbitration(uid, raw=True),
                aa_res, "raw", fmt=lambda d: d)
    if aa_res.get("raw") is not None:
        total, detail, team = _anomaly_parts(aa_res["raw"])
        if total:
            out["aa"] = total
        if detail:
            out["aa_detail"] = detail
        if team:
            out["aa_team_ids"] = team

    try:
        user = await client.get_starrail_user(uid)
        out["active_days"] = user.stats.active_days
    except Exception as e:
        print("Stats fetch failed:", e)

    target = Path(__file__).resolve().parent.parent / "hoyo_stats.json"
    target.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Wrote", target, "->", out)

if __name__ == "__main__":
    asyncio.run(main())
