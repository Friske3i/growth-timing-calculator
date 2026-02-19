/**
 * @file script.js
 * @description Growth Timing Calculator logic.
 * Refactored to separate business logic from UI handling.
 */

/* =========================================
   Constants & Configuration
   ========================================= */
const BASE_GROWTH_TIME = 240;
const BUFF_PER_UNIQUE_CROP = 0.025;
const GARDEN_GROWTH_SPEED_BUFF = 0.5;
const GREENHOUSE_GROWTH_SPEED_BUFF = 0.5;

/* =========================================
   Business Logic
   ========================================= */

/**
 * Handles calculations for growth timing and optimization.
 */
class GrowthCalculator {
    constructor() {
        this.cropTimes = this._generateCropTimes();
    }

    /**
     * Generates growth times for unique crops (0-12) based on the formula.
     * @returns {Object} Map of ID to growth time (minutes).
     * @private
     */
    _generateCropTimes() {
        return Array.from({ length: 13 }, (_, id) => {
            const speedMultiplier = 1 + (id * BUFF_PER_UNIQUE_CROP) + GARDEN_GROWTH_SPEED_BUFF + GREENHOUSE_GROWTH_SPEED_BUFF;
            return BASE_GROWTH_TIME / speedMultiplier;
        }).reduce((acc, time, id) => {
            acc[id] = time;
            return acc;
        }, {});
    }

    /**
     * Finds the combination of crops that best matches the target duration.
     * Uses Dynamic Programming.
     * 
     * @param {number} target - Target duration in minutes.
     * @param {number} minId - Minimum unique crop ID allowed.
     * @param {number} maxId - Maximum unique crop ID allowed.
     * @returns {Object} plan - { target, achieved, diff, crops: Array }
     */
    findOptimalPlan(target, minId = 0, maxId = 12) {
        // Buffer to allow slightly overshooting if it yields better results (though we usually want <=?)
        // Original logic allowed searching up to target + 180
        const maxSearch = Math.ceil(target + 180);

        // DP State: reachable[time] = object
        // We use an array where index matches time (rounded to integer minutes).
        const reachable = new Array(maxSearch + 1).fill(null);
        reachable[0] = { source: 'start', count: 0, idSum: 0 };

        for (let t = 0; t <= maxSearch; t++) {
            if (!reachable[t]) continue;

            for (const [idStr, time] of Object.entries(this.cropTimes)) {
                const id = parseInt(idStr);
                if (id < minId || id > maxId) continue;

                // IMPORTANT: Rounding time to nearest integer (minute) for array indexing.
                // In a perfect simulation we might want float precision, but for this DP a minute grid is sufficient/expected.
                const duration = Math.round(time);
                const nextT = t + duration;

                if (nextT > maxSearch) continue;

                const newCount = reachable[t].count + 1;
                const newIdSum = reachable[t].idSum + id;

                // Decision Logic:
                // 1. Max Count (more crops = more efficient logic usually?)
                // 2. Max ID Sum (higher IDs preferred if counts equal)
                let replace = false;
                if (!reachable[nextT]) {
                    replace = true;
                } else {
                    if (newCount > reachable[nextT].count) {
                        replace = true;
                    } else if (newCount === reachable[nextT].count) {
                        if (newIdSum > reachable[nextT].idSum) {
                            replace = true;
                        }
                    }
                }

                if (replace) {
                    reachable[nextT] = {
                        lastCrop: id,
                        prevTime: t,
                        count: newCount,
                        idSum: newIdSum,
                        timeUsed: time // Store exact float time for reconstruction if needed, though we use int for DP
                    };
                }
            }
        }

        // Find best result
        // Criteria: 
        // 1. Min Diff to target
        // 2. Max Count
        // 3. Max ID Sum
        let bestTime = 0;
        let minDiff = Infinity;
        let bestCount = -1;
        let bestIdSum = -1;

        for (let t = 0; t <= maxSearch; t++) {
            if (!reachable[t]) continue;

            const diff = Math.abs(t - target);

            if (diff < minDiff) {
                minDiff = diff;
                bestTime = t;
                bestCount = reachable[t].count;
                bestIdSum = reachable[t].idSum;
            } else if (diff === minDiff) {
                if (reachable[t].count > bestCount) {
                    bestTime = t;
                    bestCount = reachable[t].count;
                    bestIdSum = reachable[t].idSum;
                } else if (reachable[t].count === bestCount) {
                    if (reachable[t].idSum > bestIdSum) {
                        bestTime = t;
                        bestCount = reachable[t].count;
                        bestIdSum = reachable[t].idSum;
                    }
                }
            }
        }

        // Reconstruct path
        const crops = [];
        let curr = bestTime;
        while (curr > 0) {
            const info = reachable[curr];
            if (!info || info.source === 'start') break;

            crops.push({
                id: info.lastCrop,
                // Use the exact float time associated with the crop ID for display accuracy
                time: this.cropTimes[info.lastCrop]
            });
            curr = info.prevTime;
        }

        return {
            target: target,
            achieved: bestTime,
            diff: minDiff,
            crops: crops.reverse()
        };
    }
}

/* =========================================
   UI Logic
   ========================================= */

/**
 * Manages UI interactions and updates.
 */
class AppUI {
    constructor(calculator) {
        this.calculator = calculator;
        this.elements = {
            // Inputs
            curr: this._getDateTimeElements('curr'),
            cont: this._getDateTimeElements('cont'),
            nextHours: document.getElementById('next-hours'),
            nextMinutes: document.getElementById('next-minutes'),
            contestTiming: document.getElementById('contest-timing'),
            contestTimingValue: document.getElementById('contest-timing-value'),
            uniqueMin: document.getElementById('unique-min'),
            uniqueMax: document.getElementById('unique-max'),
            uniqueMinVal: document.getElementById('unique-min-val'),
            uniqueMaxVal: document.getElementById('unique-max-val'),
            uniqueTrack: document.getElementById('unique-slider-track'),
            calcBtn: document.getElementById('calculate-btn'),

            // Output
            resultSection: document.getElementById('result-section'),
            totalTimeDisplay: document.getElementById('total-time-display'),
            diffDisplay: document.getElementById('diff-display'),
            planList: document.getElementById('plan-list')
        };

        this.init();
    }

    _getDateTimeElements(prefix) {
        return {
            year: document.getElementById(`${prefix}-year`),
            month: document.getElementById(`${prefix}-month`),
            day: document.getElementById(`${prefix}-day`),
            hour: document.getElementById(`${prefix}-hour`),
            min: document.getElementById(`${prefix}-min`),
            picker: document.getElementById(`${prefix}-date-picker`),
            pickerBtn: document.querySelector(`#${prefix}-date-picker + .calendar-btn`) // Assumes btn is next sibling
        };
    }

    init() {
        this._setupDefaults();
        this._setupListeners();
        this._updateUniqueSliderTrack();
    }

    _setupDefaults() {
        // Default Current Time
        const now = new Date();
        this._setDateTimeInputs(this.elements.curr, now);

        // Default Contest Start (Next X:15)
        const contestStart = new Date(now);
        if (contestStart.getMinutes() >= 15) {
            contestStart.setHours(contestStart.getHours() + 1);
        }
        contestStart.setMinutes(15);
        this._setDateTimeInputs(this.elements.cont, contestStart);

        // Ensure readonly minutes are consistent
        if (this.elements.cont.min) this.elements.cont.min.value = 15;
    }

    _setupListeners() {
        // Date Pickers
        this._setupDatePicker(this.elements.curr);
        this._setupDatePicker(this.elements.cont);

        // Contest Timing Slider
        this.elements.contestTiming.addEventListener('input', (e) => {
            this.elements.contestTimingValue.textContent = `${e.target.value} min`;
        });

        // Unique Crop Range Sliders
        this.elements.uniqueMin.addEventListener('input', () => this._handleMinSlide());
        this.elements.uniqueMax.addEventListener('input', () => this._handleMaxSlide());

        // Calculate Button
        this.elements.calcBtn.addEventListener('click', () => this.calculateSchedule());
    }

    _setupDatePicker(group) {
        if (!group.picker || !group.pickerBtn) return;

        group.pickerBtn.addEventListener('click', () => {
            if (group.picker.showPicker) {
                const currentVal = this._getDateStr(group);
                if (currentVal) group.picker.value = currentVal;
                group.picker.showPicker();
            } else {
                group.picker.click();
            }
        });

        group.picker.addEventListener('change', (e) => {
            if (!e.target.value) return;
            const [y, m, d] = e.target.value.split('-').map(Number);
            group.year.value = y;
            group.month.value = m;
            group.day.value = d;
        });
    }

    _setDateTimeInputs(group, date) {
        group.year.value = date.getFullYear();
        group.month.value = date.getMonth() + 1;
        group.day.value = date.getDate();
        group.hour.value = date.getHours();
        group.min.value = date.getMinutes();
    }

    _getDateStr(group) {
        const y = group.year.value;
        const m = group.month.value.padStart(2, '0');
        const d = group.day.value.padStart(2, '0');
        if (!y || !m || !d) return null;
        return `${y}-${m}-${d}`;
    }

    _getDateTime(group) {
        const y = parseInt(group.year.value);
        const m = parseInt(group.month.value) - 1;
        const d = parseInt(group.day.value);
        const h = parseInt(group.hour.value);
        const min = parseInt(group.min.value);

        if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(h) || isNaN(min)) return null;
        return new Date(y, m, d, h, min);
    }

    _handleMinSlide() {
        const min = parseInt(this.elements.uniqueMin.value);
        const max = parseInt(this.elements.uniqueMax.value);
        if (min > max) {
            this.elements.uniqueMin.value = max;
        }
        this._updateUniqueSliderTrack();
    }

    _handleMaxSlide() {
        const min = parseInt(this.elements.uniqueMin.value);
        const max = parseInt(this.elements.uniqueMax.value);
        if (max < min) {
            this.elements.uniqueMax.value = min;
        }
        this._updateUniqueSliderTrack();
    }

    _updateUniqueSliderTrack() {
        const min = parseInt(this.elements.uniqueMin.value);
        const max = parseInt(this.elements.uniqueMax.value);
        const total = 12;

        this.elements.uniqueMinVal.textContent = min;
        this.elements.uniqueMaxVal.textContent = max;

        const leftPercent = (min / total) * 100;
        const rightPercent = (max / total) * 100;

        this.elements.uniqueTrack.style.background = `linear-gradient(to right, var(--input-bg) ${leftPercent}%, var(--accent) ${leftPercent}%, var(--accent) ${rightPercent}%, var(--input-bg) ${rightPercent}%)`;
    }

    calculateSchedule() {
        const currentTime = this._getDateTime(this.elements.curr);
        const contestStart = this._getDateTime(this.elements.cont);
        const nextHours = parseInt(this.elements.nextHours.value) || 0;
        const nextMinutes = parseInt(this.elements.nextMinutes.value) || 0;
        const contestTiming = parseInt(this.elements.contestTiming.value) || 0;
        const uniqueMin = parseInt(this.elements.uniqueMin.value) || 0;
        const uniqueMax = parseInt(this.elements.uniqueMax.value) || 12;

        if (!currentTime || !contestStart) {
            alert("Please enter valid dates and times.");
            return;
        }

        const diffMs = contestStart - currentTime;
        if (diffMs < 0) {
            alert("Contest start time must be in the future.");
            return;
        }

        const diffMinutes = Math.floor(diffMs / 60000);
        const nextGrowthMinutes = (nextHours * 60) + nextMinutes;

        // Target Calculation:
        // Window = (ContestStart - Current)
        // Usable = Window - NextGrowthWait
        // Target Reach = Usable + ContestTiming (allows finishing inside contest)
        let totalTargetMinutes = diffMinutes - nextGrowthMinutes + contestTiming;

        if (totalTargetMinutes <= 0) {
            alert("Calculated total growth time is negative or zero. Please check inputs.");
            return;
        }

        const plan = this.calculator.findOptimalPlan(totalTargetMinutes, uniqueMin, uniqueMax);
        this._displayResults(plan, currentTime, nextGrowthMinutes);
    }

    _displayResults(plan, startTime, initialDelayMinutes) {
        this.elements.resultSection.style.display = 'block';
        this.elements.totalTimeDisplay.textContent = `${plan.achieved} min`;

        const realDiff = plan.achieved - plan.target;
        this.elements.diffDisplay.textContent = `${realDiff > 0 ? '+' : ''}${realDiff} min`;
        this.elements.diffDisplay.style.color = realDiff === 0 ? '#38bdf8' : '#f59e0b';

        this.elements.planList.innerHTML = '';

        // --- Result Grouping & Rendering ---
        // Groups sequential crops of the same type
        const groups = this._groupCrops(plan.crops, startTime, initialDelayMinutes);
        const initialFinishTime = new Date(startTime.getTime() + initialDelayMinutes * 60000);

        // 1. Initial Prep
        if (groups.length > 0) {
            this._addTimelineItem(
                startTime,
                initialFinishTime,
                "Preparation",
                `Set Unique Crop to <strong class='highlight-id'>${groups[0].id}</strong>`
            );
        } else {
            this._addTimelineItem(startTime, initialFinishTime, "Wait", "Wait for current crop");
        }

        // 2. Groups
        groups.forEach((group, idx) => {
            // Active Phase
            this._addTimelineItem(
                group.startTime,
                group.endTime,
                "Growing",
                `Unique Crop <strong>${group.id}</strong> <span class='group-count'>x${group.count}</span>`,
                `(Duration: ${parseFloat(group.timePerCrop.toFixed(1))}m each)`
            );

            // Prep for Next
            const nextGroup = groups[idx + 1];
            if (nextGroup) {
                // Prep window during last crop of current group
                this._addTimelineItem(
                    group.lastStart,
                    group.endTime,
                    "Preparation",
                    `Change to <strong class='highlight-id'>${nextGroup.id}</strong>`
                );
            }
        });

        // 3. Final Target
        const lastTime = groups.length > 0 ? groups[groups.length - 1].endTime : initialFinishTime;
        const liFinal = document.createElement('li');
        liFinal.className = 'timeline-item';
        liFinal.style.borderColor = 'transparent';
        liFinal.innerHTML = `
            <span class="time-label">${this._formatDate(lastTime)}</span>
            <span class="action-label">🏁 Target Reached</span>
        `;
        this.elements.planList.appendChild(liFinal);

        this.elements.resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    _groupCrops(crops, startTime, initialDelayMinutes) {
        if (!crops || crops.length === 0) return [];

        const groups = [];
        let currentT = new Date(startTime.getTime() + initialDelayMinutes * 60000);
        let tempTime = new Date(currentT);

        let currentGroup = {
            id: crops[0].id,
            timePerCrop: crops[0].time,
            count: 1,
            startTime: new Date(currentT)
        };

        // Advance time for first crop
        tempTime = new Date(tempTime.getTime() + crops[0].time * 60000);

        for (let i = 1; i < crops.length; i++) {
            const crop = crops[i];
            if (crop.id === currentGroup.id) {
                currentGroup.count++;
                tempTime = new Date(tempTime.getTime() + crop.time * 60000);
            } else {
                currentGroup.endTime = new Date(tempTime);
                currentGroup.lastStart = new Date(tempTime.getTime() - currentGroup.timePerCrop * 60000);
                groups.push(currentGroup);

                currentGroup = {
                    id: crop.id,
                    timePerCrop: crop.time,
                    count: 1,
                    startTime: new Date(tempTime)
                };
                tempTime = new Date(tempTime.getTime() + crop.time * 60000);
            }
        }
        currentGroup.endTime = new Date(tempTime);
        currentGroup.lastStart = new Date(tempTime.getTime() - currentGroup.timePerCrop * 60000);
        groups.push(currentGroup);

        return groups;
    }

    _addTimelineItem(start, end, label, content, sub = "") {
        const li = document.createElement('li');
        li.className = 'timeline-item';

        let typeClass = "";
        if (label === "Preparation") typeClass = "type-prep";
        else if (label === "Growing") typeClass = "type-grow";

        li.innerHTML = `
            <span class="time-label">${this._formatDate(start)} 〜 ${this._formatDate(end)}</span>
            <div class="timeline-content ${typeClass}">
                <span class="type-badge">${label}</span>
                <div class="main-content">${content}</div>
                ${sub ? `<div class="sub-content">${sub}</div>` : ''}
            </div>
        `;
        this.elements.planList.appendChild(li);
    }

    _formatDate(date) {
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const h = date.getHours().toString().padStart(2, '0');
        const min = date.getMinutes().toString().padStart(2, '0');
        return `${m}/${d} ${h}:${min}`;
    }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    const calculator = new GrowthCalculator();
    new AppUI(calculator);
});
