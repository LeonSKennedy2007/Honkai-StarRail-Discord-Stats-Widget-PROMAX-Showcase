if (process.env.GITHUB_ACTIONS !== "true") {
    require("dotenv").config();
}
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const HSR_UID = process.env.HSR_UID;
const ENKA_HSR_URL = `https://enka.network/api/hsr/uid/${HSR_UID}`;

const SRRES_BASE = "https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/";
const SRRES_CHARS_URL = `${SRRES_BASE}index_min/en/characters.json`;

const ENKA_PFPS_URL =
    "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/hsr/pfps.json";
const ENKA_UI_BASE = "https://enka.network";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const DISCORD_TARGETS = [
    { clientId: DISCORD_CLIENT_ID, botToken: DISCORD_BOT_TOKEN },
];
if (process.env.DISCORD_CLIENT_ID_2 && process.env.DISCORD_BOT_TOKEN_2) {
    DISCORD_TARGETS.push({
        clientId: process.env.DISCORD_CLIENT_ID_2,
        botToken: process.env.DISCORD_BOT_TOKEN_2,
    });
}

const ROTATE_HOURS = Number(process.env.ROTATE_HOURS ?? 6);

const PROGRESS_BARS = [

    { key: "bar_1", label: "Progress toward goal 1", percent: 50 },
    { key: "bar_2", label: "Progress toward goal 2", percent: 75 },
];

const UA = { "User-Agent": "HSR-Stats-Widget/1.0 (+github-actions)" };

const regionMap = {
    ASIA: "Asia",
    EUR: "Europe",
    EUROPE: "Europe",
    USA: "America",
    AMERICA: "America",
    CHT: "TW/HK/MO",
    CN: "China",
};

let _charsIndex = null;
async function getCharsIndex() {
    if (_charsIndex) return _charsIndex;
    const { data } = await axios.get(SRRES_CHARS_URL, { timeout: 10000, headers: UA });
    _charsIndex = data ?? {};
    return _charsIndex;
}

async function getShowcasedCharacter(detail) {
    try {
        const showcase = detail.avatarDetailList ?? [];
        let showcased = null;

        if (showcase.length > 0) {

            const rotationIndex =
                Math.floor(Date.now() / (ROTATE_HOURS * 3600 * 1000)) % showcase.length;
            showcased = showcase[rotationIndex];
            console.log(
                `Rotation: slot ${rotationIndex + 1}/${showcase.length} (changes every ${ROTATE_HOURS}h)`
            );
        }

        if (showcased) {
            const chars = await getCharsIndex();
            const c = chars[String(showcased.avatarId)];

            if (c) {

                let name = c.name;
                if (!name || name.includes("{NICKNAME}")) {
                    name = detail.nickname || "Trailblazer";
                }

                const imageUrl = c.portrait ? `${SRRES_BASE}${c.portrait}` : null;

                return {
                    imageUrl,
                    name,
                    level: showcased.level ?? null,
                    eidolon: showcased.rank ?? 0,
                };
            }
        }

        const pfpId = detail.headIcon;
        if (pfpId) {
            const { data: pfps } = await axios.get(ENKA_PFPS_URL, { timeout: 10000, headers: UA });
            const iconPath = pfps[String(pfpId)]?.Icon;
            if (iconPath) {
                return { imageUrl: `${ENKA_UI_BASE}${iconPath}`, name: null, level: null, eidolon: 0 };
            }
        }

        return { imageUrl: null, name: null, level: null, eidolon: 0 };
    } catch (err) {
        console.warn("Could not resolve character image:", err.message);
        return { imageUrl: null, name: null, level: null, eidolon: 0 };
    }
}

const HOYO_STATS_MAX_AGE_H = Number(process.env.HOYO_STATS_MAX_AGE_H ?? 48);

function readHoyoStats() {
    try {
        const p = path.join(__dirname, "hoyo_stats.json");
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, "utf8"));

        if (data.generated_at) {
            const ageH = (Date.now() / 1000 - data.generated_at) / 3600;
            if (ageH > HOYO_STATS_MAX_AGE_H) {
                console.warn(
                    `hoyo_stats.json is ${ageH.toFixed(1)}h old (limit ${HOYO_STATS_MAX_AGE_H}h) — ` +
                    "skipping clear stats. Is the HoyoLab cookie expired?"
                );
                return null;
            }
        }

        console.log("Found hoyo_stats.json — merging MoC/PF/APC fields.");
        return data;
    } catch (e) {
        console.warn("Could not read hoyo_stats.json:", e.message);
        return null;
    }
}

async function syncHsrStats() {
    try {
        const res = await axios.get(ENKA_HSR_URL, { timeout: 10000, headers: UA });
        const detail = res.data.detailInfo;
        if (!detail) throw new Error("Player profile is private or not found.");

        const rec = detail.recordInfo ?? {};
        const region = regionMap[res.data.region] ?? res.data.region ?? "Unknown";

        const character = await getShowcasedCharacter(detail);
        const { imageUrl } = character;
        const characterLabel = character.name
            ? `${character.name}${character.level ? ` • Lv. ${character.level}` : ""}` +
              ` • E${character.eidolon ?? 0}`
            : null;

        if (imageUrl) console.log(`Character image: ${imageUrl}`);
        if (characterLabel) console.log(`Character: ${characterLabel}`);

        const signature =
            detail.signature && detail.signature.trim() !== ""
                ? `"${detail.signature.substring(0, 60)}"`
                : '"No signature"';

        const su =
            rec.maxRogueChallengeScore != null && rec.maxRogueChallengeScore > 0
                ? `World ${rec.maxRogueChallengeScore}`
                : "—";

        const dynamic = [
            { type: 1, name: "nickname", value: detail.nickname ?? "Trailblazer" },
            { type: 1, name: "uid", value: `UID ${HSR_UID}` },
            { type: 1, name: "world", value: `${region} • EQ ${detail.worldLevel ?? "-"}` },

            { type: 1, name: "su_str", value: "Simulated Universe" },
            { type: 1, name: "su", value: su },

            { type: 2, name: "chars_count", value: Number(rec.avatarCount ?? 0) },
            { type: 2, name: "cones_count", value: Number(rec.equipmentCount ?? 0) },
        ];

        for (const bar of PROGRESS_BARS) {
            dynamic.push({ type: 1, name: `${bar.key}_str`, value: bar.label });
            dynamic.push({ type: 2, name: bar.key, value: bar.percent });
        }
        void signature;

        const hoyo = readHoyoStats();
        if (hoyo) {

            if (hoyo.moc) {
                dynamic.push({ type: 1, name: "moc_str", value: `Memory of Chaos ${hoyo.moc}` });
                dynamic.push({ type: 1, name: "moc", value: hoyo.moc });
            }

            for (const k of ["moc_detail", "pf_detail", "apc_detail"]) {
                if (hoyo[k]) dynamic.push({ type: 1, name: k, value: hoyo[k] });
            }
            if (hoyo.pf) {
                dynamic.push({ type: 1, name: "pf_str", value: `Pure Fiction ${hoyo.pf}` });
                dynamic.push({ type: 1, name: "pf", value: hoyo.pf });
            }
            if (hoyo.pf_pts) {
                dynamic.push({ type: 1, name: "pf_pts", value: hoyo.pf_pts });
            }
            if (hoyo.apc) {
                dynamic.push({ type: 1, name: "apc_str", value: `Apocalyptic Shadow ${hoyo.apc}` });
                dynamic.push({ type: 1, name: "apc", value: hoyo.apc });
            }
            if (hoyo.apc_pts) {
                dynamic.push({ type: 1, name: "apc_pts", value: hoyo.apc_pts });
            }
            if (hoyo.aa) {
                dynamic.push({ type: 1, name: "aa_str", value: "Anomaly Arbitration" });
                dynamic.push({ type: 1, name: "aa", value: hoyo.aa });
            }
            if (hoyo.aa_detail) {
                dynamic.push({ type: 1, name: "aa_detail", value: hoyo.aa_detail });
            }

            if (Array.isArray(hoyo.aa_team_ids) && hoyo.aa_team_ids.length > 0) {
                try {
                    const chars = await getCharsIndex();
                    const names = hoyo.aa_team_ids.map((id) => {
                        let n = chars[String(id)]?.name || `#${id}`;
                        if (n.includes("{NICKNAME}")) n = "Trailblazer";
                        return n;
                    });
                    dynamic.push({ type: 1, name: "aa_team_str", value: "Current Best Team" });
                    dynamic.push({ type: 1, name: "aa_team", value: names.join(", ") });
                } catch (e) {
                    console.warn("Could not resolve AA team names:", e.message);
                }
            }
            if (hoyo.active_days != null) {
                dynamic.push({ type: 1, name: "days_str", value: "Active Days" });
                dynamic.push({ type: 1, name: "days_txt", value: String(hoyo.active_days) });
            }
        }

        if (imageUrl) {
            dynamic.push({ type: 3, name: "image", value: { url: imageUrl } });
        }
        if (characterLabel) {
            dynamic.push({ type: 1, name: "char", value: characterLabel });
        }

        const payload = { data: { dynamic } };

        for (const target of DISCORD_TARGETS) {
            const discordApiUrl =
                `https://discord.com/api/v9/applications/${target.clientId}` +
                `/users/${DISCORD_USER_ID}/identities/0/profile`;

            const response = await axios.patch(discordApiUrl, payload, {
                headers: {
                    Authorization: `Bot ${target.botToken}`,
                    "Content-Type": "application/json",
                },
            });

            console.log(`Synced HSR widget (app ${target.clientId}) for ` +
                `${detail.nickname}. Status: ${response.status}`);
        }
    } catch (error) {
        if (error.response) {
            console.error("Discord/Enka API Error:", error.response.status,
                JSON.stringify(error.response.data, null, 2));
            process.exit(1);
        } else {
            console.error("Request Error:", error.message);
            process.exit(1);
        }
    }
}

syncHsrStats();
