const { describe, test } = require("node:test");
const assert = require("node:assert");
const {
    normalizeDailyViewDays,
    classifyDay,
    buildDailyList,
    periodUptime,
    parseDayKey,
    hasHourlyData,
    buildHourlyList,
    heartbeatTimeToMs,
    buildPeriods,
} = require("../../server/daily-view");
const { UptimeCalculator } = require("../../server/uptime-calculator");

const DAY = 86400;
// 2026-11-15 00:00:00 UTC
const TODAY = 1794700800;

describe("Daily view", () => {
    test("normalizeDailyViewDays() clamps to 0..365 integers", () => {
        assert.strictEqual(normalizeDailyViewDays(90), 90);
        assert.strictEqual(normalizeDailyViewDays("180"), 180);
        assert.strictEqual(normalizeDailyViewDays(90.7), 90);
        assert.strictEqual(normalizeDailyViewDays(-5), 0);
        assert.strictEqual(normalizeDailyViewDays(1000), 365);
        assert.strictEqual(normalizeDailyViewDays(null), 0);
        assert.strictEqual(normalizeDailyViewDays(undefined), 0);
        assert.strictEqual(normalizeDailyViewDays("abc"), 0);
        assert.strictEqual(normalizeDailyViewDays(true), 0);
    });

    test("classifyDay() colours by uptime with a 95 % threshold", () => {
        assert.strictEqual(classifyDay({ up: 100, down: 0 }), "up");
        assert.strictEqual(classifyDay({ up: 99, down: 1 }), "partial");
        assert.strictEqual(classifyDay({ up: 95, down: 5 }), "partial");
        assert.strictEqual(classifyDay({ up: 94, down: 6 }), "down");
        assert.strictEqual(classifyDay({ up: 0, down: 10 }), "down");
    });

    test("classifyDay() handles maintenance and missing data", () => {
        assert.strictEqual(classifyDay({ up: 0, down: 0, maintenance: 12 }), "maintenance");
        assert.strictEqual(classifyDay({ up: 50, down: 0, maintenance: 3 }), "maintenance");
        assert.strictEqual(classifyDay({ up: 50, down: 1, maintenance: 3 }), "partial");
        assert.strictEqual(classifyDay({ up: 0, down: 0 }), "missing");
        assert.strictEqual(classifyDay(undefined), "missing");
        assert.strictEqual(classifyDay(null), "missing");
    });

    test("buildDailyList() returns one entry per day, oldest first, with placeholders", () => {
        const data = [
            { timestamp: TODAY, up: 10, down: 0, avgPing: 12.4 },
            { timestamp: TODAY - 2 * DAY, up: 99, down: 1, avgPing: 20 },
        ];
        const list = buildDailyList(data, 4, TODAY);

        assert.strictEqual(list.length, 4);
        assert.deepStrictEqual(
            list.map((d) => d.date),
            ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]
        );
        assert.deepStrictEqual(
            list.map((d) => d.status),
            ["missing", "partial", "missing", "up"]
        );
        assert.strictEqual(list[3].uptime, 1);
        assert.strictEqual(list[3].ping, 12);
        assert.strictEqual(list[1].uptime, 0.99);
        assert.strictEqual(list[0].uptime, null);
        assert.strictEqual(list[0].ping, null);
    });

    test("buildDailyList() ignores data outside the range and tolerates bad input", () => {
        const data = [{ timestamp: TODAY - 10 * DAY, up: 1, down: 0 }];
        assert.deepStrictEqual(
            buildDailyList(data, 2, TODAY).map((d) => d.status),
            ["missing", "missing"]
        );
        assert.deepStrictEqual(buildDailyList(undefined, 0, TODAY), []);
        assert.strictEqual(buildDailyList(null, 3, TODAY).length, 3);
    });

    test("buildDailyList() reports no ping for days without a successful check", () => {
        const list = buildDailyList([{ timestamp: TODAY, up: 0, down: 5, avgPing: 0 }], 1, TODAY);
        assert.strictEqual(list[0].ping, null);
        assert.strictEqual(list[0].uptime, 0);
    });

    test("periodUptime() sums checks over the period and ignores empty days", () => {
        const list = buildDailyList(
            [
                { timestamp: TODAY, up: 90, down: 10 },
                { timestamp: TODAY - DAY, up: 100, down: 0 },
                { timestamp: TODAY - 2 * DAY, up: 0, down: 0, maintenance: 5 },
            ],
            5,
            TODAY
        );
        assert.strictEqual(periodUptime(list), 0.95);
        assert.strictEqual(periodUptime(buildDailyList([], 5, TODAY)), null);
        assert.strictEqual(periodUptime([]), null);
    });

    test("getUptimeCalculator() lets concurrent callers wait for the same init()", async (t) => {
        const monitorID = 987654;
        let initCalls = 0;

        t.mock.method(UptimeCalculator.prototype, "init", async function () {
            initCalls++;
            await new Promise((resolve) => setTimeout(resolve, 20));
            this.loaded = true;
        });
        t.after(() => UptimeCalculator.remove(monitorID));

        // What each caller sees at the moment it gets its calculator
        const seen = await Promise.all([
            UptimeCalculator.getUptimeCalculator(monitorID).then((c) => c.loaded),
            UptimeCalculator.getUptimeCalculator(monitorID).then((c) => c.loaded),
        ]);

        assert.deepStrictEqual(seen, [true, true]);
        assert.strictEqual(initCalls, 1);
    });

    test("getUptimeCalculator() retries after a failed init()", async (t) => {
        const monitorID = 987655;
        let fail = true;

        t.mock.method(UptimeCalculator.prototype, "init", async function () {
            if (fail) {
                throw new Error("database not ready");
            }
        });
        t.after(() => UptimeCalculator.remove(monitorID));

        await assert.rejects(UptimeCalculator.getUptimeCalculator(monitorID), /database not ready/);
        fail = false;
        assert.ok(await UptimeCalculator.getUptimeCalculator(monitorID));
    });

    test("parseDayKey() accepts only real dates inside the view", () => {
        assert.strictEqual(parseDayKey("2026-11-15", TODAY, 90), TODAY);
        assert.strictEqual(parseDayKey("2026-11-14", TODAY, 90), TODAY - DAY);
        assert.strictEqual(parseDayKey("2026-08-18", TODAY, 90), TODAY - 89 * DAY);
        assert.strictEqual(parseDayKey("2026-08-17", TODAY, 90), null);
        assert.strictEqual(parseDayKey("2026-11-16", TODAY, 90), null);
        assert.strictEqual(parseDayKey("2026-02-30", TODAY, 365), null);
        assert.strictEqual(parseDayKey("2026-11-15T00:00:00Z", TODAY, 90), null);
        assert.strictEqual(parseDayKey("15.11.2026", TODAY, 90), null);
        assert.strictEqual(parseDayKey(undefined, TODAY, 90), null);
    });

    test("hasHourlyData() covers the last 30 days", () => {
        assert.strictEqual(hasHourlyData(TODAY, TODAY), true);
        assert.strictEqual(hasHourlyData(TODAY - 29 * DAY, TODAY), true);
        assert.strictEqual(hasHourlyData(TODAY - 30 * DAY, TODAY), false);
    });

    test("buildHourlyList() returns 24 hours with status and uptime", () => {
        const hours = {
            [TODAY + 2 * 3600]: { up: 50, down: 10 },
            [TODAY + 3 * 3600]: { up: 60, down: 0 },
        };
        const list = buildHourlyList((key) => hours[key], TODAY);

        assert.strictEqual(list.length, 24);
        assert.strictEqual(list[0].start, TODAY);
        assert.strictEqual(list[23].start, TODAY + 23 * 3600);
        assert.strictEqual(list[0].status, "missing");
        assert.strictEqual(list[2].status, "down");
        assert.strictEqual(list[2].uptime, 0.8333);
        assert.strictEqual(list[3].status, "up");
    });

    test("heartbeatTimeToMs() reads database times as UTC", () => {
        assert.strictEqual(heartbeatTimeToMs("2026-11-15 02:14:00.000"), Date.UTC(2026, 10, 15, 2, 14));
        assert.strictEqual(heartbeatTimeToMs("2026-11-15T02:14:00Z"), Date.UTC(2026, 10, 15, 2, 14));
        assert.strictEqual(heartbeatTimeToMs(new Date(Date.UTC(2026, 10, 15))), Date.UTC(2026, 10, 15));
        assert.ok(Number.isNaN(heartbeatTimeToMs(null)));
    });

    describe("buildPeriods()", () => {
        const start = TODAY * 1000;
        const end = start + DAY * 1000;
        const at = (h, m = 0) => start + (h * 60 + m) * 60 * 1000;
        const tomorrow = end + 1000;

        test("an outage inside the day", () => {
            const periods = buildPeriods(
                { status: 1 },
                [
                    { status: 0, time: at(2, 14) },
                    { status: 1, time: at(2, 31) },
                ],
                start,
                end,
                tomorrow
            );
            assert.deepStrictEqual(periods, [
                {
                    type: "down",
                    start: at(2, 14),
                    end: at(2, 31),
                    startsBefore: false,
                    endsAfter: false,
                    ongoing: false,
                },
            ]);
        });

        test("an outage from the day before that goes on into the next day", () => {
            const periods = buildPeriods({ status: 0 }, [], start, end, tomorrow);
            assert.deepStrictEqual(periods, [
                { type: "down", start, end, startsBefore: true, endsAfter: true, ongoing: false },
            ]);
        });

        test("an outage that is still going on today", () => {
            const now = at(10);
            const periods = buildPeriods({ status: 1 }, [{ status: 0, time: at(9) }], start, end, now);
            assert.deepStrictEqual(periods, [
                { type: "down", start: at(9), end: now, startsBefore: false, endsAfter: false, ongoing: true },
            ]);
        });

        test("maintenance followed by an outage, repeated DOWN beats merged", () => {
            const periods = buildPeriods(
                { status: 1 },
                [
                    { status: 3, time: at(1) },
                    { status: 0, time: at(2) },
                    { status: 0, time: at(2, 30) },
                    { status: 1, time: at(3) },
                ],
                start,
                end,
                tomorrow
            );
            assert.deepStrictEqual(
                periods.map((p) => [p.type, p.start, p.end]),
                [
                    ["maintenance", at(1), at(2)],
                    ["down", at(2), at(3)],
                ]
            );
        });

        test("no previous beat, beats outside the day and PENDING are ignored", () => {
            const periods = buildPeriods(
                null,
                [
                    { status: 0, time: start - 1000 },
                    { status: 2, time: at(4) },
                    { status: 1, time: at(5) },
                    { status: 0, time: end + 1000 },
                ],
                start,
                end,
                end + 5000
            );
            assert.deepStrictEqual(periods, []);
        });
    });
});
