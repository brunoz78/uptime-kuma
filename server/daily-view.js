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

/** Hourly statistics are kept by the uptime calculator for this many days */
const HOURLY_DAYS = 30;

const STATUS_DOWN = 0;
const STATUS_MAINTENANCE = 3;

/**
 * Validate the date of a day detail request
 * @param {string} date Date as YYYY-MM-DD (UTC)
 * @param {number} todayKey Unix timestamp (seconds) of today 00:00 UTC
 * @param {number} days Number of days of the daily view, today included
 * @returns {number|null} Unix timestamp (seconds) of that day 00:00 UTC, null if invalid or outside the view
 */
function parseDayKey(date, todayKey, days) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return null;
    }
    const ms = Date.parse(date + "T00:00:00Z");
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
        return null;
    }
    const key = ms / 1000;
    if (key > todayKey || key < todayKey - (days - 1) * SECONDS_PER_DAY) {
        return null;
    }
    return key;
}

/**
 * Whether hourly statistics exist for the whole day
 * @param {number} dayKey Unix timestamp (seconds) of the day 00:00 UTC
 * @param {number} todayKey Unix timestamp (seconds) of today 00:00 UTC
 * @returns {boolean} True if hourly data is kept for that day
 */
function hasHourlyData(dayKey, todayKey) {
    return dayKey >= todayKey - (HOURLY_DAYS - 1) * SECONDS_PER_DAY;
}

/**
 * Build the 24 hours of a day
 * @param {(key: number) => object|undefined} getHour Returns the hourly data of the uptime calculator for a key
 * @param {number} dayKey Unix timestamp (seconds) of the day 00:00 UTC
 * @returns {Array<{start: number, status: string, uptime: number|null, up: number, down: number}>} 24 entries, start in unix seconds
 */
function buildHourlyList(getHour, dayKey) {
    const result = [];
    for (let i = 0; i < 24; i++) {
        const start = dayKey + i * 3600;
        const data = getHour(start);
        const up = Number(data?.up) || 0;
        const down = Number(data?.down) || 0;
        result.push({
            start,
            status: classifyDay(data),
            uptime: up + down > 0 ? Math.round((up / (up + down)) * 10000) / 10000 : null,
            up,
            down,
        });
    }
    return result;
}

/**
 * Convert a heartbeat time from the database to milliseconds.
 * The database stores UTC times as "YYYY-MM-DD HH:mm:ss.SSS".
 * @param {string|Date} time Heartbeat time
 * @returns {number} Milliseconds since epoch, NaN if unknown
 */
function heartbeatTimeToMs(time) {
    if (time instanceof Date) {
        return time.getTime();
    }
    if (typeof time !== "string") {
        return NaN;
    }
    let iso = time.trim().replace(" ", "T");
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) {
        iso += "Z";
    }
    return Date.parse(iso);
}

/**
 * Category of a heartbeat status for the list of outages
 * @param {number} status Heartbeat status
 * @returns {"down"|"maintenance"|null} Category, null for UP and PENDING
 */
function periodType(status) {
    if (status === STATUS_DOWN) {
        return "down";
    }
    if (status === STATUS_MAINTENANCE) {
        return "maintenance";
    }
    return null;
}

/**
 * Outages and maintenance of one day, built from the important heartbeats (the status changes)
 * @param {{status: number}|null} previousBeat Last important heartbeat before the day, null if none
 * @param {Array<{status: number, time: number}>} beats Important heartbeats of the day, time in ms
 * @param {number} dayStart Start of the day in ms
 * @param {number} dayEnd End of the day (start of the next day) in ms
 * @param {number} now Current time in ms
 * @returns {Array<{type: string, start: number, end: number, startsBefore: boolean, endsAfter: boolean, ongoing: boolean}>} Periods in ms, oldest first
 */
function buildPeriods(previousBeat, beats, dayStart, dayEnd, now) {
    const result = [];
    const limit = Math.min(dayEnd, now);

    let currentType = previousBeat ? periodType(previousBeat.status) : null;
    let currentStart = dayStart;
    let startsBefore = currentType !== null;

    const sorted = (beats || [])
        .filter((beat) => Number.isFinite(beat.time) && beat.time >= dayStart && beat.time < limit)
        .sort((a, b) => a.time - b.time);

    for (const beat of sorted) {
        const type = periodType(beat.status);
        if (type === currentType) {
            continue;
        }
        if (currentType !== null) {
            result.push({
                type: currentType,
                start: currentStart,
                end: beat.time,
                startsBefore,
                endsAfter: false,
                ongoing: false,
            });
        }
        currentType = type;
        currentStart = beat.time;
        startsBefore = false;
    }

    if (currentType !== null && currentStart < limit) {
        result.push({
            type: currentType,
            start: currentStart,
            end: limit,
            startsBefore,
            endsAfter: now >= dayEnd,
            ongoing: now < dayEnd,
        });
    }

    return result;
}

module.exports = {
    MAX_DAYS,
    PARTIAL_THRESHOLD,
    HOURLY_DAYS,
    normalizeDailyViewDays,
    classifyDay,
    buildDailyList,
    periodUptime,
    parseDayKey,
    hasHourlyData,
    buildHourlyList,
    heartbeatTimeToMs,
    buildPeriods,
};
