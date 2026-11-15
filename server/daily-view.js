/**
 * Daily view for status pages: one bar per (UTC) day.
 * Pure helpers, the data comes from UptimeCalculator.getDataArray(n, "day").
 */

const SECONDS_PER_DAY = 86400;
const MAX_DAYS = 365;

/** A day with failed checks is still "partial" (orange) at or above this uptime, below it is "down" (red) */
const PARTIAL_THRESHOLD = 0.95;

/**
 * Turn any stored or submitted value into a valid number of days
 * @param {any} value Value from the client or the database
 * @returns {number} Integer between 0 (off) and 365
 */
function normalizeDailyViewDays(value) {
    if (typeof value !== "number" && typeof value !== "string") {
        return 0;
    }
    const num = Math.floor(Number(value));
    if (!Number.isFinite(num) || num <= 0) {
        return 0;
    }
    return Math.min(MAX_DAYS, num);
}

/**
 * Decide the colour of one day
 * @param {{up: number, down: number, maintenance?: number}|null|undefined} data Daily data of the uptime calculator
 * @returns {"up"|"partial"|"down"|"maintenance"|"missing"} Status of the day
 */
function classifyDay(data) {
    if (!data) {
        return "missing";
    }

    const up = Number(data.up) || 0;
    const down = Number(data.down) || 0;
    const maintenance = Number(data.maintenance) || 0;

    if (down === 0) {
        if (maintenance > 0) {
            return "maintenance";
        }
        return up > 0 ? "up" : "missing";
    }

    return up / (up + down) >= PARTIAL_THRESHOLD ? "partial" : "down";
}

/**
 * Build the list of days for one monitor
 * @param {Array<object>|null|undefined} dataArray Result of UptimeCalculator.getDataArray(days, "day")
 * @param {number} days Number of days, today included
 * @param {number} todayKey Unix timestamp (seconds) of today 00:00 UTC
 * @returns {Array<{date: string, status: string, uptime: number|null, ping: number|null, up: number, down: number, maintenance: number}>} One entry per day, oldest first
 */
function buildDailyList(dataArray, days, todayKey) {
    const byKey = new Map();
    for (const data of dataArray || []) {
        if (data && data.timestamp !== undefined) {
            byKey.set(Number(data.timestamp), data);
        }
    }

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
        const key = todayKey - i * SECONDS_PER_DAY;
        const data = byKey.get(key);
        const up = Number(data?.up) || 0;
        const down = Number(data?.down) || 0;
        const total = up + down;
        const avgPing = Number(data?.avgPing);

        result.push({
            date: new Date(key * 1000).toISOString().slice(0, 10),
            status: classifyDay(data),
            uptime: total > 0 ? Math.round((up / total) * 10000) / 10000 : null,
            ping: up > 0 && Number.isFinite(avgPing) ? Math.round(avgPing) : null,
            up,
            down,
            maintenance: Number(data?.maintenance) || 0,
        });
    }

    return result;
}

/**
 * Uptime over the whole list, weighted by the number of checks
 * @param {Array<{up: number, down: number}>} list Result of buildDailyList()
 * @returns {number|null} Uptime between 0 and 1, null if there was no check at all
 */
function periodUptime(list) {
    let up = 0;
    let down = 0;
    for (const day of list) {
        up += day.up;
        down += day.down;
    }
    return up + down > 0 ? up / (up + down) : null;
}

module.exports = {
    MAX_DAYS,
    PARTIAL_THRESHOLD,
    normalizeDailyViewDays,
    classifyDay,
    buildDailyList,
    periodUptime,
};
