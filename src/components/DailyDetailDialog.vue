<template>
    <!-- Rendered at the end of <body>, so no parent element can cover the dialog -->
    <Teleport to="body">
        <div ref="modal" class="modal fade" tabindex="-1" data-testid="daily-detail-dialog">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <div>
                            <h5 class="modal-title">{{ monitorName }}</h5>
                            <div class="small text-secondary">{{ formattedDate }}</div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" :aria-label="$t('Close')" />
                    </div>

                    <div class="modal-body">
                        <div v-if="loading" class="text-center py-4">
                            <div class="spinner-border text-secondary" role="status"></div>
                        </div>

                        <div v-else-if="error" class="text-danger">{{ $t("dailyDetailLoadError") }}</div>

                        <template v-else-if="detail">
                            <!-- Summary of the day -->
                            <div class="d-flex align-items-center flex-wrap gap-2 mb-2">
                                <span class="status-pill" :class="detail.summary.status">
                                    {{ statusLabel(detail.summary.status) }}
                                </span>
                                <span v-if="detail.summary.uptime !== null" class="fw-bold">
                                    {{ $t("dailyViewUptime", [formatPercent(detail.summary.uptime)]) }}
                                </span>
                            </div>
                            <div v-if="detail.summary.up + detail.summary.down > 0" class="small">
                                {{
                                    $t("dailyDetailChecks", [
                                        formatNumber(detail.summary.up),
                                        formatNumber(detail.summary.down),
                                    ])
                                }}
                            </div>
                            <div v-if="detail.summary.avgPing !== null" class="small">
                                {{
                                    $t("dailyDetailResponse", [
                                        detail.summary.avgPing,
                                        detail.summary.minPing ?? "–",
                                        detail.summary.maxPing ?? "–",
                                    ])
                                }}
                            </div>

                            <!-- Hours -->
                            <h6 class="mt-4 mb-2">{{ $t("dailyDetailHours") }}</h6>
                            <template v-if="detail.hourly">
                                <div class="hour-bar">
                                    <div
                                        v-for="hour in detail.hourly"
                                        :key="hour.start"
                                        class="hour"
                                        :class="hour.status"
                                        :title="hourTitle(hour)"
                                    ></div>
                                </div>
                                <div class="hour-labels">
                                    <span
                                        v-for="label in hourLabels"
                                        :key="label.position"
                                        :style="{ left: label.position + '%', transform: label.transform }"
                                    >
                                        {{ label.text }}
                                    </span>
                                </div>
                            </template>
                            <div v-else class="small text-secondary">
                                {{ $t("dailyDetailHoursUnavailable", [detail.hourlyDays]) }}
                            </div>

                            <!-- Outages and maintenance -->
                            <h6 class="mt-4 mb-2">{{ $t("dailyDetailPeriods") }}</h6>
                            <div v-if="detail.periods === null" class="small text-secondary">
                                {{ $t("dailyDetailPeriodsUnavailable", [detail.keepDays]) }}
                            </div>
                            <ul v-else-if="detail.periods.length > 0" class="period-list">
                                <li v-for="period in detail.periods" :key="period.start">
                                    <span class="dot" :class="period.type"></span>
                                    <span class="period-time">
                                        {{ formatTime(period.start) }} – {{ formatTime(period.end) }}
                                    </span>
                                    <span class="text-secondary">
                                        {{ period.type === "down" ? $t("Down") : $t("statusMaintenance") }},
                                        {{ formatDuration(period.end - period.start) }}
                                        <template v-if="period.startsBefore">
                                            · {{ $t("dailyDetailFromPreviousDay") }}
                                        </template>
                                        <template v-if="period.endsAfter">· {{ $t("dailyDetailContinues") }}</template>
                                        <template v-if="period.ongoing">· {{ $t("dailyDetailOngoing") }}</template>
                                    </span>
                                </li>
                            </ul>
                            <div v-else class="small">
                                {{
                                    detail.summary.down > 0 ? $t("dailyDetailRetriedChecks") : $t("dailyDetailNoOutage")
                                }}
                            </div>

                            <div class="small text-secondary mt-4">{{ $t("dailyDetailLocalTime") }}</div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script>
import axios from "axios";
import { Modal } from "bootstrap";

export default {
    props: {
        /** Slug of the status page */
        slug: {
            type: String,
            default: null,
        },
    },
    data() {
        return {
            modal: null,
            monitorName: "",
            date: null,
            detail: null,
            loading: false,
            error: false,
            requestCounter: 0,
        };
    },
    computed: {
        formattedDate() {
            if (!this.date) {
                return "";
            }
            const options = { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" };
            try {
                return new Date(this.date + "T00:00:00Z").toLocaleDateString(this.$i18n.locale, options);
            } catch (_) {
                return this.date;
            }
        },

        /**
         * Labels below the hour bar, every six hours, in local time
         * @returns {Array<{position: number, text: string}>} Labels with their position in percent
         */
        hourLabels() {
            if (!this.detail?.hourly) {
                return [];
            }
            // The outer labels stay inside the bar
            const labels = [0, 6, 12, 18].map((i) => ({
                position: (i / 24) * 100,
                transform: i === 0 ? "none" : "translateX(-50%)",
                text: this.formatTime(this.detail.hourly[i].start * 1000),
            }));
            labels.push({
                position: 100,
                transform: "translateX(-100%)",
                text: this.formatTime((this.detail.hourly[23].start + 3600) * 1000),
            });
            return labels;
        },
    },
    mounted() {
        this.modal = new Modal(this.$refs.modal);
    },
    beforeUnmount() {
        this.modal?.dispose();
    },
    methods: {
        /**
         * Open the dialog and load the details of a day
         * @param {object} monitor Monitor (id, name)
         * @param {object} day Day entry of the daily view
         * @returns {void}
         */
        show(monitor, day) {
            this.monitorName = monitor.name;
            this.date = day.date;
            this.detail = null;
            this.error = false;
            this.loading = true;
            this.modal.show();

            const request = ++this.requestCounter;
            const url = `/api/status-page/heartbeat-daily/${encodeURIComponent(this.slug)}/${monitor.id}/${day.date}`;

            axios
                .get(url)
                .then((res) => {
                    if (request === this.requestCounter) {
                        this.detail = res.data;
                    }
                })
                .catch((error) => {
                    if (request === this.requestCounter) {
                        this.error = true;
                    }
                    console.log(error);
                })
                .finally(() => {
                    if (request === this.requestCounter) {
                        this.loading = false;
                    }
                });
        },

        statusLabel(status) {
            const labels = {
                up: this.$t("Up"),
                partial: this.$t("dailyViewPartial"),
                down: this.$t("Down"),
                maintenance: this.$t("statusMaintenance"),
                missing: this.$t("dailyViewNoData"),
            };
            return labels[status];
        },

        formatPercent(value) {
            return Math.round(value * 10000) / 100;
        },

        formatNumber(value) {
            return new Intl.NumberFormat(this.$i18n.locale).format(value);
        },

        /**
         * Local time of day
         * @param {number} ms Milliseconds since epoch
         * @returns {string} e.g. 14:05
         */
        formatTime(ms) {
            return new Date(ms).toLocaleTimeString(this.$i18n.locale, { hour: "2-digit", minute: "2-digit" });
        },

        /**
         * Human readable duration
         * @param {number} ms Duration in milliseconds
         * @returns {string} e.g. 2 Std. 5 Min.
         */
        formatDuration(ms) {
            const minutes = Math.round(ms / 60000);
            if (minutes < 1) {
                return this.$t("dailyDetailLessThanMinute");
            }
            if (minutes < 60) {
                return this.$t("dailyDetailMinutes", [minutes]);
            }
            if (minutes % 60 === 0) {
                return this.$t("dailyDetailHoursOnly", [minutes / 60]);
            }
            return this.$t("dailyDetailHoursMinutes", [Math.floor(minutes / 60), minutes % 60]);
        },

        hourTitle(hour) {
            const range = `${this.formatTime(hour.start * 1000)}–${this.formatTime((hour.start + 3600) * 1000)}`;
            if (hour.uptime === null) {
                return `${range}: ${this.statusLabel(hour.status)}`;
            }
            return `${range}: ${this.formatPercent(hour.uptime)} %`;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.status-pill {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 50rem;
    color: #fff;
    font-size: 13px;
    font-weight: bold;
    background-color: #adb5bd;

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
}

.hour-bar {
    display: flex;
    gap: 2px;
    height: 28px;
}

.hour {
    flex: 1 1 0;
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
}

.hour-labels {
    position: relative;
    height: 18px;
    margin-top: 2px;
    font-size: 12px;
    color: $secondary-text;

    span {
        position: absolute;
        white-space: nowrap;
    }
}

.period-list {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 6px;
        padding: 4px 0;
    }
}

.period-time {
    font-weight: bold;
    font-variant-numeric: tabular-nums;
}

.dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;

    &.down {
        background-color: $danger;
    }

    &.maintenance {
        background-color: $maintenance;
    }
}

.dark {
    .hour.missing {
        background-color: #2c3440;
    }
}
</style>
