<template>
    <div ref="wrap" class="daily-wrap" data-testid="daily-heartbeat-bar">
        <div
            class="daily-bar"
            :class="{ dense: layout.gap === 0 }"
            :style="{ gap: layout.gap + 'px', width: barWidth + 'px' }"
            @mouseleave="hovered = null"
        >
            <div
                v-for="(day, index) in visibleList"
                :key="day.date"
                class="daily-beat"
                :class="day.status"
                :style="{ width: layout.width + 'px' }"
                :aria-label="tooltipLines(day).join(', ')"
                :role="day.status === 'missing' ? null : 'button'"
                :tabindex="day.status === 'missing' ? null : 0"
                @mouseenter="hover(day, index)"
                @click="select(day, index)"
                @keydown.enter.prevent="select(day, index)"
                @keydown.space.prevent="select(day, index)"
            ></div>
        </div>

        <div class="daily-legend" :style="{ width: barWidth + 'px' }">
            <span>{{ $t("dailyViewDays", [visibleList.length]) }}</span>
            <span v-if="barWidth >= 110">{{ $t("dailyViewToday") }}</span>
        </div>

        <div v-if="hovered" class="daily-tooltip" :style="tooltipStyle" role="tooltip">
            <div v-for="(line, i) in tooltipLines(hovered.day)" :key="i" :class="{ 'fw-bold': i === 0 }">
                {{ line }}
            </div>
        </div>
    </div>
</template>

<script>
const SECONDS_PER_DAY = 86400;

/** Candidate layouts, widest first: gap between the bars and their minimum width in px */
const LAYOUTS = [
    { gap: 2, minWidth: 3 },
    { gap: 1, minWidth: 2 },
    { gap: 0, minWidth: 1 },
];
const MAX_BEAT_WIDTH = 10;
const TOOLTIP_WIDTH = 190;

export default {
    props: {
        /** ID of the monitor */
        monitorId: {
            type: Number,
            required: true,
        },
        /** Number of days to show, today included */
        days: {
            type: Number,
            required: true,
        },
    },
    emits: ["select"],
    data() {
        return {
            wrapWidth: 0,
            hovered: null,
            resizeObserver: null,
        };
    },
    computed: {
        /**
         * The days of this monitor, exactly `days` entries, oldest first.
         * Days the server did not send are filled with grey placeholders.
         * @returns {Array<object>} List of days
         */
        fullList() {
            const count = Math.max(0, Math.min(365, Math.floor(this.days || 0)));
            const list = (this.$root.dailyHeartbeatList[this.monitorId] || []).slice(-count);
            const missing = count - list.length;

            if (missing <= 0) {
                return list;
            }

            let firstKey;
            if (list.length > 0) {
                firstKey = Date.parse(list[0].date + "T00:00:00Z") / 1000;
            } else {
                firstKey = Math.floor(Date.now() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY + SECONDS_PER_DAY;
            }

            const placeholders = [];
            for (let i = missing; i >= 1; i--) {
                placeholders.push({
                    date: new Date((firstKey - i * SECONDS_PER_DAY) * 1000).toISOString().slice(0, 10),
                    status: "missing",
                    uptime: null,
                    ping: null,
                });
            }
            return placeholders.concat(list);
        },

        /**
         * Gap, bar width and number of bars that fit into the available width
         * @returns {{gap: number, width: number, count: number}} Layout
         */
        layout() {
            const total = this.fullList.length;
            const available = this.wrapWidth;

            if (total === 0 || available <= 0) {
                return { gap: 1, width: 2, count: total };
            }

            for (const candidate of LAYOUTS) {
                // Fractional widths are fine, the bar should fill the available width
                const width = (available - candidate.gap * (total - 1)) / total;
                if (width >= candidate.minWidth) {
                    return { gap: candidate.gap, width: Math.min(MAX_BEAT_WIDTH, width), count: total };
                }
            }

            // Not even 1px per day: hide the oldest days
            return { gap: 0, width: 1, count: Math.max(1, Math.floor(available)) };
        },

        visibleList() {
            return this.fullList.slice(-this.layout.count);
        },

        /**
         * Width of the whole bar in px, the legend below uses the same width
         * @returns {number} Width
         */
        barWidth() {
            const count = this.visibleList.length;
            if (count === 0) {
                return 0;
            }
            return Math.min(this.wrapWidth, count * (this.layout.width + this.layout.gap) - this.layout.gap);
        },

        tooltipStyle() {
            if (!this.hovered) {
                return {};
            }
            const pitch = this.layout.width + this.layout.gap;
            const offset = Math.max(0, this.wrapWidth - this.barWidth);
            const center = offset + this.hovered.index * pitch + this.layout.width / 2;
            const left = Math.min(Math.max(0, center - TOOLTIP_WIDTH / 2), this.wrapWidth - TOOLTIP_WIDTH);
            return {
                left: left + "px",
                width: TOOLTIP_WIDTH + "px",
            };
        },
    },
    mounted() {
        this.measure();
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(() => this.measure());
            this.resizeObserver.observe(this.$refs.wrap);
        } else {
            window.addEventListener("resize", this.measure);
        }
    },
    beforeUnmount() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        } else {
            window.removeEventListener("resize", this.measure);
        }
    },
    methods: {
        /**
         * Remember the available width
         * @returns {void}
         */
        measure() {
            if (this.$refs.wrap) {
                this.wrapWidth = this.$refs.wrap.clientWidth;
            }
        },

        /**
         * Show the tooltip of a day
         * @param {object} day Day entry
         * @param {number} index Index in the visible list
         * @returns {void}
         */
        hover(day, index) {
            this.hovered = { day, index };
        },

        /**
         * Open the details of a day. Days without data have no details.
         * @param {object} day Day entry
         * @param {number} index Index in the visible list
         * @returns {void}
         */
        select(day, index) {
            if (day.status === "missing") {
                this.hover(day, index);
                return;
            }
            // The dialog shows the details, the tooltip would only stay behind it
            this.hovered = null;
            this.$emit("select", day);
        },

        /**
         * Localized date of a day entry
         * @param {string} date Date as YYYY-MM-DD (UTC)
         * @returns {string} Formatted date
         */
        formatDate(date) {
            const options = { timeZone: "UTC", weekday: "short", year: "numeric", month: "short", day: "numeric" };
            try {
                return new Date(date + "T00:00:00Z").toLocaleDateString(this.$i18n.locale, options);
            } catch (_) {
                return date;
            }
        },

        /**
         * Text lines of the tooltip
         * @param {object} day Day entry
         * @returns {string[]} Lines, the date first
         */
        tooltipLines(day) {
            const lines = [this.formatDate(day.date)];

            if (day.status === "missing") {
                lines.push(this.$t("dailyViewNoData"));
                return lines;
            }

            const labels = {
                up: this.$t("Up"),
                partial: this.$t("dailyViewPartial"),
                down: this.$t("Down"),
                maintenance: this.$t("statusMaintenance"),
            };
            lines.push(labels[day.status]);

            if (day.uptime !== null && day.uptime !== undefined) {
                lines.push(this.$t("dailyViewUptime", [Math.round(day.uptime * 10000) / 100]));
            }
            if (day.ping !== null && day.ping !== undefined) {
                lines.push(this.$t("dailyViewAvgPing", [day.ping]));
            }
            return lines;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.daily-wrap {
    position: relative;
    width: 100%;
}

.daily-bar {
    display: flex;
    align-items: stretch;
    height: 30px;
    margin-left: auto;
    overflow: hidden;

    &.dense .daily-beat {
        border-radius: 0;
    }
}

.daily-beat {
    flex: 0 0 auto;
    min-width: 0;
    border-radius: 2px;
    background-color: #dfe3e8;

    &.up {
        background-color: $primary;
    }

    &.partial {
        background-color: $warning;
    }

    &.down {
        background-color: $danger;
    }

    &.maintenance {
        background-color: $maintenance;
    }

    &:not(.missing) {
        cursor: pointer;
    }

    &:hover,
    &:focus-visible {
        opacity: 0.7;
        outline: none;
    }
}

.daily-legend {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
    margin-left: auto;
    font-size: 12px;
    color: $secondary-text;
    white-space: nowrap;
}

.daily-tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    z-index: 10;
    padding: 6px 10px;
    border-radius: 8px;
    background-color: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    pointer-events: none;
}

.dark {
    .daily-beat.missing {
        background-color: #2c3440;
    }

    .daily-tooltip {
        background-color: $dark-header-bg;
        color: $dark-font-color;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    }
}
</style>
