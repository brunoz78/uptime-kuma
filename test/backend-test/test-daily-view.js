const { describe, test } = require("node:test");
const assert = require("node:assert");
const { normalizeDailyViewDays, classifyDay, buildDailyList, periodUptime } = require("../../server/daily-view");

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
});
