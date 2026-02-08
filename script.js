
const CROP_TIMES = {
    0: 180,
    1: 174,
    2: 168,
    3: 162,
    4: 156,
    5: 150,
    6: 144,
    7: 138,
    8: 132,
    9: 126,
    10: 120,
    11: 114,
    12: 108
};

// Sort times for efficiency (though lookup is O(1), for iteration order might matter)
const SORTED_CROP_KEYS = Object.keys(CROP_TIMES).map(Number).sort((a, b) => b - a); // 12, 11, ... 0

document.addEventListener('DOMContentLoaded', () => {
    // Set default current time
    const now = new Date();
    updateDateTimeInputs('curr', now);

    // Set default contest start time (Next X:15)
    const contestStart = new Date(now);
    if (contestStart.getMinutes() >= 15) {
        contestStart.setHours(contestStart.getHours() + 1);
    }
    contestStart.setMinutes(15);
    updateDateTimeInputs('cont', contestStart);

    // No need for change listener on contest minute as it is readonly/fixed in HTML logic now (mostly)
    // But we might want to ensure 'cont-min' is always 15 if code changes
    document.getElementById('cont-min').value = 15;

    // Calendar sync setup
    setupDatePicker('curr');
    setupDatePicker('cont');

    const timingSlider = document.getElementById('contest-timing');
    const timingValue = document.getElementById('contest-timing-value');

    timingSlider.addEventListener('input', (e) => {
        timingValue.textContent = `${e.target.value} min`;
    });

    document.getElementById('calculate-btn').addEventListener('click', calculateSchedule);
});

function setupDatePicker(prefix) {
    const picker = document.getElementById(`${prefix}-date-picker`);
    const btn = picker.nextElementSibling; // the calendar button

    // Open picker logic
    btn.addEventListener('click', () => {
        // Try showPicker API (modern browsers)
        if (picker.showPicker) {
            // Update picker value from current fields before showing
            const currentVal = getDateStrFromInputs(prefix);
            if (currentVal) picker.value = currentVal;
            picker.showPicker();
        } else {
            // Fallback: focus/click might work in some browsers, but showPicker is standard now
            picker.click();
        }
    });

    // When picker changes, update fields
    picker.addEventListener('change', (e) => {
        if (!e.target.value) return;
        const [y, m, d] = e.target.value.split('-').map(Number);
        document.getElementById(`${prefix}-year`).value = y;
        document.getElementById(`${prefix}-month`).value = m;
        document.getElementById(`${prefix}-day`).value = d;
    });
}

function updateDateTimeInputs(prefix, date) {
    document.getElementById(`${prefix}-year`).value = date.getFullYear();
    document.getElementById(`${prefix}-month`).value = date.getMonth() + 1;
    document.getElementById(`${prefix}-day`).value = date.getDate();
    document.getElementById(`${prefix}-hour`).value = date.getHours();
    document.getElementById(`${prefix}-min`).value = date.getMinutes();
}

function getDateStrFromInputs(prefix) {
    const y = document.getElementById(`${prefix}-year`).value;
    const m = document.getElementById(`${prefix}-month`).value.padStart(2, '0');
    const d = document.getElementById(`${prefix}-day`).value.padStart(2, '0');
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
}

function getDateTimeFromInputs(prefix) {
    const y = parseInt(document.getElementById(`${prefix}-year`).value);
    const m = parseInt(document.getElementById(`${prefix}-month`).value) - 1;
    const d = parseInt(document.getElementById(`${prefix}-day`).value);
    const h = parseInt(document.getElementById(`${prefix}-hour`).value);
    const min = parseInt(document.getElementById(`${prefix}-min`).value);

    // Basic validation
    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(h) || isNaN(min)) return null;

    return new Date(y, m, d, h, min);
}

function calculateSchedule() {
    const currentTime = getDateTimeFromInputs('curr');
    const contestStart = getDateTimeFromInputs('cont');
    const nextHours = parseInt(document.getElementById('next-hours').value) || 0;
    const nextMinutes = parseInt(document.getElementById('next-minutes').value) || 0;
    const contestTiming = parseInt(document.getElementById('contest-timing').value) || 0;

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

    // Formula: Total = (ContestStart - Current) - NextGrowthWait + ContestTiming
    // Actually, "ContestStart - Current" is the window we have. 
    // BUT, we have to wait 'nextGrowthMinutes' from NOW until the CURRENT crop is done.
    // So the available 'free' time starts from (Current + nextGrowthMinutes).
    // The target is to land at (ContestStart + ContestTiming).
    // So calculation is: 
    // Target Duration = (ContestStart + ContestTiming) - (Current + nextGrowthMinutes) in minutes

    // Let's re-verify the user's formula:
    // "コンテスト開始日時 - 現在時刻 - 次の成長までの時間 + コンテスト中の成長タイミング"
    // (ContestStart - Current) = diffMinutes
    // diffMinutes - nextGrowthMinutes + contestTiming

    let totalTargetMinutes = diffMinutes - nextGrowthMinutes + contestTiming;

    if (totalTargetMinutes <= 0) {
        // This implies we are already too late or just on time?
        // If negative, it means we don't even have time to finish the current crop before the target point?
        // User said "Next growth"
        alert("Calculated total growth time is negative or zero. Please check inputs.");
        return;
    }

    // Optimization: Find combination of crops that sum closest to totalTargetMinutes
    const plan = findOptimalPlan(totalTargetMinutes);

    displayResults(plan, currentTime, nextGrowthMinutes);
}

function findOptimalPlan(target) {
    const maxSearch = target + 180;
    // reachable[t] = { lastCrop: id, prevTime: t_prev, count: c, idSum: s }
    const reachable = new Array(maxSearch + 1).fill(null);

    reachable[0] = { source: 'start', count: 0, idSum: 0 };

    // DP
    for (let t = 0; t <= maxSearch; t++) {
        if (!reachable[t]) continue;

        for (const [idStr, time] of Object.entries(CROP_TIMES)) {
            const id = parseInt(idStr);
            const nextT = t + time;

            if (nextT > maxSearch) continue;

            const newCount = reachable[t].count + 1;
            const newIdSum = reachable[t].idSum + id;

            // Priority for storing at nextT:
            // 1. Max Count
            // 2. Max ID Sum (if counts equal)

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
                    idSum: newIdSum
                };
            }
        }
    }

    // Find best result
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
            time: CROP_TIMES[info.lastCrop]
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

function displayResults(plan, startTime, initialDelayMinutes) {
    const resultSection = document.getElementById('result-section');
    const totalTimeDisplay = document.getElementById('total-time-display');
    const diffDisplay = document.getElementById('diff-display');
    const planList = document.getElementById('plan-list');

    resultSection.style.display = 'block';
    totalTimeDisplay.textContent = `${plan.achieved} min`;

    const realDiff = plan.achieved - plan.target;
    diffDisplay.textContent = `${realDiff > 0 ? '+' : ''}${realDiff} min`;
    if (realDiff === 0) diffDisplay.style.color = '#38bdf8';
    else diffDisplay.style.color = '#f59e0b';

    planList.innerHTML = '';

    // Group crops
    const groups = [];
    let currentT = new Date(startTime.getTime() + initialDelayMinutes * 60000);
    const initialFinishTime = new Date(currentT);

    if (plan.crops.length > 0) {
        let currentGroup = {
            id: plan.crops[0].id,
            timePerCrop: plan.crops[0].time,
            count: 1,
            startTime: new Date(currentT)
        };

        let tempTime = new Date(currentT.getTime() + plan.crops[0].time * 60000);

        for (let i = 1; i < plan.crops.length; i++) {
            const crop = plan.crops[i];
            if (crop.id === currentGroup.id) {
                currentGroup.count++;
                tempTime = new Date(tempTime.getTime() + crop.time * 60000);
            } else {
                currentGroup.endTime = new Date(tempTime);
                // Last start time is needed for the NEXT prep window
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
    }

    // Render Logic: Sequential
    // 1. Initial Wait / Prep
    // 2. Group 1 Active
    // 3. Prep for Group 2 (During last crop of Group 1) -> Set Group 2
    // 4. Group 2 Active
    // ...

    // Step 1: Initial Wait / Prep
    if (groups.length > 0) {
        const firstGroup = groups[0];
        addTimelineItem(planList,
            startTime,
            initialFinishTime,
            "Preparation",
            `Set Unique Crop to <strong class='highlight-id'>${firstGroup.id}</strong>`
        );
    } else {
        addTimelineItem(planList, startTime, initialFinishTime, "Wait", "Wait for current crop");
    }

    groups.forEach((group, idx) => {
        // Active Phase
        addTimelineItem(planList,
            group.startTime,
            group.endTime,
            "Growing",
            `Unique Crop <strong>${group.id}</strong> <span class='group-count'>x${group.count}</span>`,
            `(Duration: ${group.timePerCrop}m each)`
        );

        // Prep Next Phase (if exists)
        const nextGroup = groups[idx + 1];
        if (nextGroup) {
            // The prep window is effectively the duration of the LAST crop of the current group.
            // From group.lastStart to group.endTime
            addTimelineItem(planList,
                group.lastStart,
                group.endTime,
                "Preparation",
                `Change to <strong class='highlight-id'>${nextGroup.id}</strong>`
            );
        }
    });

    // Final
    const lastTime = groups.length > 0 ? groups[groups.length - 1].endTime : initialFinishTime;
    const liFinal = document.createElement('li');
    liFinal.className = 'timeline-item';
    liFinal.style.borderColor = 'transparent';
    liFinal.innerHTML = `
        <span class="time-label">${formatDate(lastTime)}</span>
        <span class="action-label">🏁 Target Reached</span>
    `;
    planList.appendChild(liFinal);

    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function addTimelineItem(container, start, end, label, content, sub = "") {
    const li = document.createElement('li');
    li.className = 'timeline-item';

    let typeClass = "";
    if (label === "Preparation") typeClass = "type-prep";
    else if (label === "Growing") typeClass = "type-grow";

    li.innerHTML = `
        <span class="time-label">${formatDate(start)} 〜 ${formatDate(end)}</span>
        <div class="timeline-content ${typeClass}">
            <span class="type-badge">${label}</span>
            <div class="main-content">${content}</div>
            ${sub ? `<div class="sub-content">${sub}</div>` : ''}
        </div>
    `;
    container.appendChild(li);
}

function formatDate(date) {
    // Format: MM/DD HH:mm
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${m}/${d} ${h}:${min}`;
}
