/* ============================================================
   数据 & 工具函数来自 common.js（data, model, buildModel,
   formatNumber, getPrice, getGiftName, getLocation, parseLocation）
   最优算法来自 mixed.js（MIXED_ALGO：混合礼物 Pareto 前沿）
   ============================================================ */

/* ============================================================
   1. 测量最长礼物名 & 设置列宽（CSS 变量）
   ============================================================ */
function measureGiftNameColumn() {
    const isMobile = window.innerWidth < 900;
    // 收集所有可能的礼物名
    const allNames = [];
    model.forEach(r => {
        allNames.push(r.name100, r.name200, r.name400);
    });

    // 创建隐藏测量元素（使用与 .col-giftname 相同的字体）
    const measurer = document.createElement('span');
    measurer.style.position = 'absolute';
    measurer.style.visibility = 'hidden';
    measurer.style.whiteSpace = 'nowrap';
    measurer.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    measurer.style.fontSize = isMobile ? '12px' : '14px';
    document.body.appendChild(measurer);

    let maxWidth = 0;
    allNames.forEach(name => {
        if (!name) return;
        if (isMobile && name.includes('-')) {
            // 移动端考虑 splitGiftName 拆分后的最宽片段
            const idx = name.indexOf('-');
            measurer.textContent = name.substring(0, idx);
            maxWidth = Math.max(maxWidth, measurer.offsetWidth);
            measurer.textContent = name.substring(idx);
            maxWidth = Math.max(maxWidth, measurer.offsetWidth);
        } else {
            measurer.textContent = name;
            maxWidth = Math.max(maxWidth, measurer.offsetWidth);
        }
    });

    document.body.removeChild(measurer);

    // 加上 td padding 余量（左右共约 20px）
    const pcWidth = maxWidth + 24;
    // 移动端：最长名一半宽度 + 少量余量，让内容均分换行
    const mobileWidth = Math.ceil(maxWidth * 0.55);

    document.documentElement.style.setProperty('--giftname-width', pcWidth + 'px');
    document.documentElement.style.setProperty('--giftname-width-mobile', mobileWidth + 'px');
}

measureGiftNameColumn();

/* ============================================================
   4. UI 引用
   ============================================================ */
const tbody = document.getElementById("tbody");
const rolesDiv = document.getElementById("roles");
const toggleRaw = document.getElementById("toggleRaw");
const toggleBadge = document.getElementById("toggleBadge");
const btnSkinSelect = document.getElementById("btnSkinSelect");
const btnSelectAll = document.getElementById("btnSelectAll");
const skinBadge = document.getElementById("skinBadge");
const chartSvg = document.getElementById("chartSvg");
const chartInfo = document.getElementById("chartInfo");
const chartTooltip = document.getElementById("chartTooltip");
const bestCharsContent = document.getElementById("bestCharsContent");
const strategiesContainer = document.getElementById("strategiesContainer");
const strategyCountEl = document.getElementById("strategyCount");

/* ============================================================
   2. 曲线状态（混合礼物最优曲线）
   ============================================================ */
let curve = null;          // MIXED_ALGO.buildCurve 的结果（缓存）
let currentIdx = 0;        // 当前选中曲线点下标
let lastSelectedKey = '';  // 曲线缓存 key（由角色选择决定）

const DEFAULT_AVG_GIFT = 210; // 默认选中约 21 天一个角色

function getSelectedModel() {
    const sel = [];
    model.forEach((r, i) => {
        const cb = document.getElementById("r" + i);
        if (cb && cb.checked) sel.push(r);
    });
    return sel;
}

function pickIndexNear(avgGift) {
    const pts = curve ? curve.points : [];
    if (pts.length === 0) return -1;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => {
        const d = Math.abs(p.avgGift - avgGift);
        if (d < bd) { bd = d; best = i; }
    });
    return best;
}

function ensureCurve() {
    const sel = getSelectedModel();
    const key = sel.map(r => r.name).join(',');
    if (!curve || key !== lastSelectedKey) {
        const prevAvg = (curve && currentIdx >= 0 && currentIdx < curve.points.length)
            ? curve.points[currentIdx].avgGift
            : DEFAULT_AVG_GIFT;
        curve = MIXED_ALGO.buildCurve(sel);
        lastSelectedKey = key;
        currentIdx = pickIndexNear(prevAvg);
    }
    return curve;
}

/* ============================================================
   3. 工具函数（index.html 专用）
   ============================================================ */
// 拆分地点为店名和区域（用于移动端两行显示）
function splitLocation(loc) {
    const match = loc.match(/^(.*?)\(([^)]+)\)$/);
    if (match) {
        return { name: match[1].trim(), area: `(${match[2].trim()})` };
    }
    return { name: loc, area: '' };
}

// 拆分礼物名：将 "-" 及其后面的部分放到下一行（仅移动端）
function splitGiftName(name, isMobile) {
    if (!isMobile || !name || !name.includes('-')) return name;
    const idx = name.indexOf('-');
    const before = name.substring(0, idx);
    const after = name.substring(idx); // 包含 "-"
    return `${before}<br>${after}`;
}

// 档位徽标
function tierBadge(t) {
    return `<span class="tier-badge tier-${t}">${t}档</span>`;
}

/* ============================================================
   4. 初始化角色复选框
   ============================================================ */
let skinCount = 0;
const roleRows = [];
model.forEach((r, i) => {
    if (r.hasSkin) skinCount++;
    const skinLabel = r.hasSkin ? ' <span class="skin-badge">皮肤</span>' : '';
    roleRows.push(`
                        <label class="role">
                            <input type="checkbox" id="r${i}" checked>
                            ${r.name}${skinLabel}
                        </label>`);
});
rolesDiv.innerHTML = roleRows.join('');
skinBadge.textContent = skinCount;

/* ============================================================
   6.5 偏好持久化
   ============================================================ */
function savePreferences() {
    const prefs = {
        roles: model.map((r, i) => {
            const cb = document.getElementById("r" + i);
            return cb ? cb.checked : true;
        }),
        showRaw: toggleRaw.checked
    };
    try {
        localStorage.setItem('gift-calc-prefs', JSON.stringify(prefs));
    } catch (e) { /* quota exceeded */ }
}

function loadPreferences() {
    try {
        const raw = localStorage.getItem('gift-calc-prefs');
        if (!raw) return;
        const prefs = JSON.parse(raw);
        if (prefs.roles && Array.isArray(prefs.roles)) {
            prefs.roles.forEach((checked, i) => {
                const cb = document.getElementById("r" + i);
                if (cb) cb.checked = checked;
            });
        }
        if (typeof prefs.showRaw === 'boolean') {
            toggleRaw.checked = prefs.showRaw;
        }
    } catch (e) { /* corrupt data */ }
}

/* ============================================================
   7. 折叠控制
   ============================================================ */
function applyFoldState() {
    const hidden = !toggleRaw.checked;
    const rawElements = document.querySelectorAll('.raw-col, .raw-group-header');
    rawElements.forEach(el => el.classList.toggle('hidden-raw', hidden));
    toggleBadge.textContent = hidden ? '折叠' : '展开';
}

toggleRaw.checked = false;
loadPreferences();
applyFoldState();

/* ============================================================
   5. 主表格渲染（混合礼物）
   ============================================================ */
function renderMainTable(plan, isMobile) {
    const rows = [];
    plan.forEach(r => {
        const span = r.gifts.length;
        // 地点：仅在该角色内部合并相邻同店
        const locRows = r.gifts.map(g => g.location);
        const locSpan = new Array(span).fill(1);
        for (let i = span - 2; i >= 0; i--) {
            if (locRows[i] === locRows[i + 1]) { locSpan[i] = locSpan[i + 1] + 1; locSpan[i + 1] = 0; }
        }
        r.gifts.forEach((g, gi) => {
            const giftNameDisplay = splitGiftName(g.name, isMobile);
            let locationDisplay = g.location;
            if (isMobile) {
                const parts = splitLocation(g.location);
                locationDisplay = parts.area ? `${parts.name}<br>${parts.area}` : parts.name;
            }
            const locCell = locSpan[gi] > 0
                ? `<td class="col-location" rowspan="${locSpan[gi]}">${locationDisplay}</td>`
                : '';
            const roleCell = gi === 0
                ? `<td class="col-role" rowspan="${span}">${r.name}</td>`
                : '';
            const rawCells = gi === 0
                ? `<td class="raw-col" rowspan="${span}">${r.c100}</td>
                   <td class="raw-col" rowspan="${span}">${r.c200}</td>
                   <td class="raw-col" rowspan="${span}">${r.c400}</td>
                   <td class="raw-col" rowspan="${span}">${r.e200}</td>
                   <td class="raw-col" rowspan="${span}">${r.e400}</td>`
                : '';
            const totalCells = gi === 0
                ? `<td class="col-gift" rowspan="${span}">${r.G}</td>
                   <td class="col-cost" rowspan="${span}">${formatNumber(r.C)}</td>`
                : '';
            rows.push(`
                            <tr>
                                ${roleCell}
                                ${rawCells}
                                <td class="col-tier">${tierBadge(g.tier)}</td>
                                <td class="col-giftname">${giftNameDisplay}</td>
                                <td class="col-gift">${g.count}</td>
                                ${locCell}
                                <td class="col-cost">${formatNumber(g.subtotal)}</td>
                                ${totalCells}
                            </tr>`);
        });
    });
    tbody.innerHTML = rows.join('');
}

/* ============================================================
   5.5 当前方案组成卡
   ============================================================ */
function renderPlanSummary(plan, point) {
    let n100 = 0, n200 = 0, n400 = 0;
    plan.forEach(r => { n100 += r.c; n200 += r.b; n400 += r.a; });
    const total = n100 + n200 + n400;
    const pct = v => total ? ((v / total) * 100).toFixed(0) + '%' : '0%';
    bestCharsContent.innerHTML = `
        共 <strong>${formatNumber(point.totalGift)}</strong> 件礼物 · 人均方斯 <strong>${formatNumber(Math.round(point.avgCost))}</strong><br>
        <span class="mix-badge mix-400">400档 ${formatNumber(n400)} 件（${pct(n400)}）</span>
        <span class="mix-badge mix-200">200档 ${formatNumber(n200)} 件（${pct(n200)}）</span>
        <span class="mix-badge mix-100">100档 ${formatNumber(n100)} 件（${pct(n100)}）</span>`;
}

/* ============================================================
   8. 曲线绘图
   ============================================================ */
function isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getChartColors() {
    if (isDarkMode()) {
        return {
            grid: '#3a3d50',
            axis: '#5a5e78',
            tickLabel: '#8a8ea8',
            axisTitle: '#9a9eb8',
            dot: '#7aa2f0',
            handleFill: '#7aa2f0',
            handleStroke: '#252836',
            bg: '#252836'
        };
    }
    return {
        grid: '#e8ecf4',
        axis: '#b0bed8',
        tickLabel: '#6a7a9a',
        axisTitle: '#4a5e7a',
        dot: '#1a3a6a',
        handleFill: '#1a3a6a',
        handleStroke: '#ffffff',
        bg: '#ffffff'
    };
}

function drawChart(curvePoints) {
    const svg = chartSvg;
    const c = getChartColors();
    const W = 480, H = 480;
    const pad = { left: 70, right: 17, top: 36, bottom: 48 };
    const pw = W - pad.left - pad.right;
    const ph = H - pad.top - pad.bottom;

    let html = '';

    if (curvePoints.length < 2) {
        html += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="15" fill="${c.tickLabel}">请选择角色</text>`;
        svg.innerHTML = html;
        svg._curvePoints = [];
        return null;
    }

    let minGift = Infinity, maxGift = -Infinity;
    let minCost = Infinity, maxCost = -Infinity;
    curvePoints.forEach(p => {
        if (p.avgGift < minGift) minGift = p.avgGift;
        if (p.avgGift > maxGift) maxGift = p.avgGift;
        if (p.avgCost < minCost) minCost = p.avgCost;
        if (p.avgCost > maxCost) maxCost = p.avgCost;
    });

    const giftPad = Math.max((maxGift - minGift) * 0.08, 5);
    const costPad = Math.max((maxCost - minCost) * 0.08, 500);
    minGift -= giftPad; maxGift += giftPad;
    minCost -= costPad; maxCost += costPad;

    const rangeGift = maxGift - minGift || 1;
    const rangeCost = maxCost - minCost || 1;

    function x(p) { return pad.left + (p.avgGift - minGift) / rangeGift * pw; }
    function y(p) { return pad.top + ph - (p.avgCost - minCost) / rangeCost * ph; }

    // Grid lines (horizontal)
    for (let i = 0; i <= 5; i++) {
        const gy = pad.top + ph * i / 5;
        html += `<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}" stroke="${c.grid}" stroke-width="1"/>`;
    }
    // Grid lines (vertical)
    for (let i = 0; i <= 4; i++) {
        const gx = pad.left + pw * i / 4;
        html += `<line x1="${gx}" y1="${pad.top}" x2="${gx}" y2="${H - pad.bottom}" stroke="${c.grid}" stroke-width="1"/>`;
    }

    // Axes
    html += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${H - pad.bottom}" stroke="${c.axis}" stroke-width="1.5"/>`;
    html += `<line x1="${pad.left}" y1="${H - pad.bottom}" x2="${W - pad.right}" y2="${H - pad.bottom}" stroke="${c.axis}" stroke-width="1.5"/>`;

    // Y axis tick labels
    for (let i = 0; i <= 4; i++) {
        const val = minCost + rangeCost * i / 4;
        const gy = pad.top + ph - ph * i / 4;
        html += `<text x="${pad.left - 6}" y="${gy + 4}" text-anchor="end" font-size="11" fill="${c.tickLabel}">${formatNumber(Math.round(val))}</text>`;
    }

    // X axis tick labels
    for (let i = 0; i <= 4; i++) {
        const val = minGift + rangeGift * i / 4;
        const gx = pad.left + pw * i / 4;
        html += `<text x="${gx}" y="${H - pad.bottom + 16}" text-anchor="middle" font-size="11" fill="${c.tickLabel}">${Math.round(val)}</text>`;
    }

    // Y axis title
    html += `<text x="12" y="${H / 2}" text-anchor="middle" font-size="12" fill="${c.axisTitle}" font-weight="500" transform="rotate(-90, 12, ${H / 2})">← 平均方斯消耗</text>`;
    // X axis title
    html += `<text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="${c.axisTitle}" font-weight="500">平均礼物次数 →</text>`;

    // 最优曲线折线（连接全部 Pareto 点）
    const d = curvePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
    html += `<path d="${d}" fill="none" stroke="${c.dot}" stroke-width="1.5" opacity="0.75"/>`;

    // 当前可拖拽圆点
    if (currentIdx >= 0 && currentIdx < curvePoints.length) {
        const cp = curvePoints[currentIdx];
        html += `<circle cx="${x(cp).toFixed(1)}" cy="${y(cp).toFixed(1)}" r="11" fill="${c.handleFill}" stroke="${c.handleStroke}" stroke-width="3" id="dragHandle"/>`;
    }

    svg.innerHTML = html;

    // Store for drag lookup
    svg._curvePoints = curvePoints;
    svg._x = x;
    svg._y = y;
    svg._pad = pad;

    return curvePoints[currentIdx] || null;
}

/* ============================================================
   9. 图表拖拽 + 悬停提示
   ============================================================ */
function setupChartDrag() {
    let dragging = false;

    function getSVGPos(e) {
        const rect = chartSvg.getBoundingClientRect();
        const vb = chartSvg.viewBox.baseVal;
        const svgAspect = vb.width / vb.height;
        const elemAspect = rect.width / rect.height;
        let drawW, drawH, offX, offY;
        if (elemAspect > svgAspect) {
            drawH = rect.height;
            drawW = rect.height * svgAspect;
            offX = (rect.width - drawW) / 2;
            offY = 0;
        } else {
            drawW = rect.width;
            drawH = rect.width / svgAspect;
            offX = 0;
            offY = (rect.height - drawH) / 2;
        }
        const sx = vb.width / drawW;
        const sy = vb.height / drawH;
        const tx = (e.touches && e.touches[0]) ? e.touches[0] : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null);
        const cx = tx ? tx.clientX : e.clientX;
        const cy = tx ? tx.clientY : e.clientY;
        return {
            x: (cx - rect.left - offX) * sx,
            y: (cy - rect.top - offY) * sy,
            screenX: cx,
            screenY: cy
        };
    }

    function findNearest(svgX, svgY) {
        const pts = chartSvg._curvePoints;
        const fx = chartSvg._x;
        const fy = chartSvg._y;
        if (!pts || !fx || !fy) return null;
        let best = null, bestD = Infinity;
        pts.forEach(p => {
            const dx = fx(p) - svgX, dy = fy(p) - svgY;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = p; }
        });
        return best;
    }

    function snapTo(near) {
        if (near) {
            const idx = chartSvg._curvePoints.indexOf(near);
            if (idx !== -1 && idx !== currentIdx) {
                currentIdx = idx;
                update();
            }
        }
    }

    function showTooltip(near, screenX, screenY) {
        if (!near) { hideTooltip(); return; }
        const n = near;
        chartTooltip.innerHTML = `
            人均方斯：<strong>${formatNumber(Math.round(n.avgCost))}</strong><br>
            人均所需礼物数：<strong>${Math.round(n.avgGift)}</strong><br>
            平均天数：<strong>${(n.avgGift / MIXED_ALGO.GIFTS_PER_DAY).toFixed(1)}</strong><br>
            总方斯：<strong>${formatNumber(n.totalCost)}</strong>
        `;
        const parent = chartTooltip.parentElement;
        const pr = parent.getBoundingClientRect();
        let left = screenX - pr.left + 14;
        let top = screenY - pr.top - 14;
        if (left + 170 > pr.width) left = screenX - pr.left - 185;
        if (top + 120 > pr.height) top = screenY - pr.top - 135;
        if (left < 0) left = 4;
        if (top < 0) top = 4;
        chartTooltip.style.left = left + 'px';
        chartTooltip.style.top = top + 'px';
        chartTooltip.classList.add('visible');
    }

    function hideTooltip() {
        chartTooltip.classList.remove('visible');
    }

    function onDown(e) {
        const pos = getSVGPos(e);
        const near = findNearest(pos.x, pos.y);
        if (!near) return;

        snapTo(near);
        dragging = true;
        const h = document.getElementById('dragHandle');
        if (h) h.style.cursor = 'grabbing';
        showTooltip(near, pos.screenX, pos.screenY);
        e.preventDefault();
    }

    function onMove(e) {
        const pos = getSVGPos(e);
        const near = findNearest(pos.x, pos.y);
        if (dragging) {
            e.preventDefault();
            snapTo(near);
            showTooltip(near, pos.screenX, pos.screenY);
        } else if (chartSvg.contains(e.target)) {
            showTooltip(near, pos.screenX, pos.screenY);
        } else {
            hideTooltip();
        }
    }

    function onUp(e) {
        if (!dragging) return;
        dragging = false;

        const pos = getSVGPos(e);
        const near = findNearest(pos.x, pos.y);
        snapTo(near);

        const h = document.getElementById('dragHandle');
        if (h) h.style.cursor = 'grab';
    }

    function onLeave() {
        if (!dragging) hideTooltip();
    }

    chartSvg.addEventListener('mousedown', onDown);
    chartSvg.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    chartSvg.addEventListener('mouseleave', onLeave);
}

setupChartDrag();

/* ============================================================
   10. 主更新逻辑
   ============================================================ */
function update() {
    const cv = ensureCurve();
    const isMobile = window.innerWidth < 900;

    if (cv.points.length === 0) {
        tbody.innerHTML = '';
        drawChart([]);
        chartInfo.innerHTML = '请至少选择一个角色';
        bestCharsContent.innerHTML = '请选择角色后查看混合礼物最优方案';
        return;
    }

    if (currentIdx < 0 || currentIdx >= cv.points.length) currentIdx = 0;
    const point = cv.points[currentIdx];
    const plan = cv.reconstruct(point.totalGift);

    renderMainTable(plan, isMobile);

    // 折叠状态
    applyFoldState();

    // 更新曲线图
    drawChart(cv.points);

    // 更新曲线信息行
    const days = point.avgGift / MIXED_ALGO.GIFTS_PER_DAY;
    chartInfo.innerHTML = `平均 <strong>${days.toFixed(1)}</strong> 天一个角色（人均所需礼物数 / 10）`;

    // 更新当前方案组成卡
    renderPlanSummary(plan, point);
}

/* ============================================================
   11. 事件绑定
   ============================================================ */
// 角色筛选复选框变化 → 刷新
rolesDiv.addEventListener('change', function() {
    savePreferences();
    update();
});

// 原始数据开关变化 → 刷新
toggleRaw.addEventListener('change', function() {
    savePreferences();
    update();
});

btnSkinSelect.addEventListener('click', function (e) {
    e.stopPropagation();
    model.forEach((r, i) => {
        const cb = document.getElementById("r" + i);
        if (cb) {
            cb.checked = r.hasSkin;
        }
    });
    savePreferences();
    update();
});

btnSelectAll.addEventListener('click', function (e) {
    e.stopPropagation();
    model.forEach((r, i) => {
        const cb = document.getElementById("r" + i);
        if (cb) {
            cb.checked = true;
        }
    });
    savePreferences();
    update();
});

// 移动端角色筛选折叠/展开
const roleFilterHeader = document.getElementById('roleFilterHeader');
const roleToggleArrow = document.getElementById('roleToggleArrow');
const rolesContainer = document.getElementById('roles');

function isMobile() {
    return window.innerWidth < 900;
}

roleFilterHeader.addEventListener('click', function () {
    if (!isMobile()) return;
    const open = rolesContainer.classList.toggle('open');
    roleToggleArrow.classList.toggle('open', open);
});

// 窗口尺寸变化时重新渲染
let resizeTimer;
window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        measureGiftNameColumn();
        update();
    }, 300);
});

update();

/* ============================================================
   12. 公告栏弹窗
   ============================================================ */
const announcementBar = document.getElementById('announcementBar');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');

announcementBar.addEventListener('click', function () {
    modalOverlay.classList.add('open');
});

modalClose.addEventListener('click', function () {
    modalOverlay.classList.remove('open');
});

modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) {
        modalOverlay.classList.remove('open');
    }
});

/* ============================================================
   12.5 计算说明弹窗
   ============================================================ */
const helpBtn = document.getElementById('helpBtn');
const helpOverlay = document.getElementById('helpOverlay');
const helpClose = document.getElementById('helpClose');

helpBtn.addEventListener('click', function () {
    helpOverlay.classList.add('open');
});

helpClose.addEventListener('click', function () {
    helpOverlay.classList.remove('open');
});

helpOverlay.addEventListener('click', function (e) {
    if (e.target === helpOverlay) {
        helpOverlay.classList.remove('open');
    }
});

/* ============================================================
   13. 暗色模式实时监听
   ============================================================ */
const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
darkModeQuery.addEventListener('change', function() {
    update();
});

/* ============================================================
   14. 补礼物计算（按当前混合方案比例分摊）
   ============================================================ */
const LEVEL_XP = [100, 500, 1000, 2000, 3500, 5000, 7000, 9000, 12000, 16000];
const CUMULATIVE_XP = (() => {
    const cum = [0];
    for (let i = 0; i < LEVEL_XP.length; i++) {
        cum.push(cum[i] + LEVEL_XP[i]);
    }
    return cum; // CUMULATIVE_XP[lv] = total XP needed to reach level lv
})();
const MAX_XP = CUMULATIVE_XP[10]; // 56100 total to reach level 10

const gcChar = document.getElementById('gcChar');
const gcLevel = document.getElementById('gcLevel');
const gcExp = document.getElementById('gcExp');
const gcResult = document.getElementById('gcResult');

function initGiftCalc() {
    // Populate character select
    model.forEach((r, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = r.name;
        gcChar.appendChild(opt);
    });
    updateGiftCalc();
}

function updateGiftCalc() {
    const charIdx = parseInt(gcChar.value);
    const currentLv = parseInt(gcLevel.value);
    const xpForCurrentLv = LEVEL_XP[currentLv];
    // Update max on exp input
    gcExp.max = xpForCurrentLv;
    const currentExp = Math.min(parseInt(gcExp.value) || 0, xpForCurrentLv);
    const r = model[charIdx];

    if (!r) {
        gcResult.innerHTML = '<div class="result-sub">请选择角色</div>';
        return;
    }

    // XP already earned in current level
    const effectiveExp = currentExp;
    // Remaining XP: from current level remaining to level 10
    const remainingInCurrent = Math.max(0, xpForCurrentLv - effectiveExp);
    const remainingAfterCurrent = MAX_XP - CUMULATIVE_XP[currentLv + 1];
    const remainingTotal = remainingInCurrent + Math.max(0, remainingAfterCurrent);

    if (remainingTotal <= 0) {
        gcResult.innerHTML = '<div class="result-main">✅ 已满级！当前角色已达到 10 级。</div>';
        return;
    }

    // 阶梯式计算：9级以下部分享受+5%加成，9级及以上部分按基础值
    let xpBelow9 = 0;  // 9级以下（享受+5%加成）
    let xpAbove9 = 0;  // 9级及以上（基础值）

    if (currentLv < 9) {
        // 当前等级剩余经验（当前等级 < 9，享受加成）
        xpBelow9 += remainingInCurrent;
        // 当前等级+1 到 8 级的经验
        for (let lv = currentLv + 1; lv < 9 && lv < 10; lv++) {
            xpBelow9 += LEVEL_XP[lv];
        }
        // 9级到10级的经验（不享受加成）
        for (let lv = Math.max(9, currentLv + 1); lv < 10; lv++) {
            xpAbove9 += LEVEL_XP[lv];
        }
    } else {
        // 当前等级 >= 9，全部不享受加成
        xpAbove9 = remainingTotal;
    }

    // 读取当前曲线方案中该角色的混合礼物组合
    let gifts = null;
    if (curve && curve.points.length > 0) {
        const idx = (currentIdx >= 0 && currentIdx < curve.points.length) ? currentIdx : 0;
        const plan = curve.reconstruct(curve.points[idx].totalGift);
        const entry = plan.find(p => p.name === r.name);
        if (entry && entry.gifts.length > 0) gifts = entry.gifts;
    }
    // 兜底：该角色不在当前选择中 → 用最便宜的 100 档
    if (!gifts) {
        gifts = [{ tier: 100, count: Math.ceil(MAX_XP / 100), name: r.name100, price: r.c100 }];
    }

    const planFavor = gifts.reduce((s, g) => s + g.tier * g.count, 0);
    const effectiveFavor = xpBelow9 / 1.05 + xpAbove9; // 需要的等效好感
    const lines = gifts.map(g => {
        const count = Math.max(0, Math.ceil(effectiveFavor * g.count / planFavor));
        return { tier: g.tier, name: g.name, price: g.price, count };
    }).filter(g => g.count > 0);
    const totalCount = lines.reduce((s, g) => s + g.count, 0);
    const totalCost = lines.reduce((s, g) => s + g.count * g.price, 0);

    let html = '';
    if (xpBelow9 > 0) {
        html += `<div class="result-sub">✨ ≤8级部分 ${formatNumber(xpBelow9)} 经验享受 +5% 好感(可能有1个礼物的误差)</div>`;
    }
    lines.forEach(g => {
        html += `<div class="result-main">${g.name}：${g.count} 个</div>`;
    });
    html += `<div class="result-sub">合计 ${totalCount} 件 · 共 ${formatNumber(totalCost)} 方斯</div>`;

    gcResult.innerHTML = html;
}

gcChar.addEventListener('change', updateGiftCalc);
gcLevel.addEventListener('change', updateGiftCalc);
gcExp.addEventListener('input', updateGiftCalc);

// Initialize after model is ready
const _origUpdate = update;
update = function() {
    _origUpdate();
    if (gcChar.options.length === 0) initGiftCalc();
    else updateGiftCalc();
    // 同步更新策略视图
    updateStrategyView();
};

// Also init on first load
if (typeof model !== 'undefined' && model.length > 0) {
    initGiftCalc();
}

/* ============================================================
   15. 方案对比视图（里程碑最省方案 + 地点购物清单）
   ============================================================ */
let strategiesCacheKey = '';

function computeStrategies() {
    if (!curve || curve.points.length === 0) return [];
    return MIXED_ALGO.buildMilestoneStrategies(curve);
}

function renderStrategies(strategies) {
    if (strategies.length === 0) {
        strategiesContainer.innerHTML = '<div class="empty-state">请至少选择一个角色</div>';
        strategyCountEl.textContent = '0 种方案';
        return;
    }

    strategyCountEl.textContent = strategies.length + ' 种方案';

    let html = '<div class="strategies-grid">';

    strategies.forEach(strat => {
        // 按地点聚合成购物清单
        const byLoc = new Map();
        strat.plan.forEach(r => {
            r.gifts.forEach(g => {
                let loc = byLoc.get(g.location);
                if (!loc) {
                    const pl = parseLocation(g.location);
                    loc = { area: pl.area, name: pl.name, rows: [] };
                    byLoc.set(g.location, loc);
                }
                let row = loc.rows.find(x => x.tier === g.tier && x.name === g.name);
                if (!row) {
                    row = { tier: g.tier, name: g.name, price: g.price, count: 0, subtotal: 0, chars: [] };
                    loc.rows.push(row);
                }
                row.count += g.count;
                row.subtotal += g.subtotal;
                row.chars.push(r.name);
            });
        });

        const locs = Array.from(byLoc.values()).sort((a, b) => {
            const areaComp = a.area.localeCompare(b.area, undefined, { sensitivity: 'base' });
            if (areaComp !== 0) return areaComp;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        let bodyRows = '';
        locs.forEach(loc => {
            const span = loc.rows.length;
            loc.rows.forEach((row, i) => {
                const locCell = i === 0
                    ? `<td class="col-location" rowspan="${span}">${loc.area ? `${loc.name}(${loc.area})` : loc.name}</td>`
                    : '';
                const recipients = row.chars.join('、');
                bodyRows += `
                            <tr>
                                ${locCell}
                                <td class="col-tier">${tierBadge(row.tier)}</td>
                                <td class="col-giftname">${row.name}<br><span class="gift-recipients">送给：${recipients}</span></td>
                                <td class="col-gift">${row.count}</td>
                                <td class="col-price">${formatNumber(row.price)}</td>
                                <td class="col-cost">${formatNumber(row.subtotal)}</td>
                            </tr>`;
            });
        });

        html += `
                    <div class="strategy-card">
                        <div class="strategy-header">
                            <span class="t-label">平均天数（${strat.days} 天内最省）</span><br>
                            <span class="t-value">${strat.daysActual.toFixed(1)} 天</span>
                            <span class="stat-group">
                                <span>人均礼物 <strong>${strat.avgGift.toFixed(1)}</strong></span>
                                <span>人均方斯 <strong>${formatNumber(Math.round(strat.avgCost))}</strong></span>
                                <span>总方斯 <strong>${formatNumber(strat.totalCost)}</strong></span>
                            </span>
                        </div>
                        <div class="strategy-body">
                            <table>
                                <thead>
                                    <tr>
                                        <th>地点</th>
                                        <th>档位</th>
                                        <th>礼物名</th>
                                        <th>数量</th>
                                        <th>单价</th>
                                        <th>小计</th>
                                    </tr>
                                </thead>
                                <tbody>${bodyRows}</tbody>
                            </table>
                        </div>
                    </div>`;
    });

    html += '</div>';
    strategiesContainer.innerHTML = html;
}

function updateStrategyView(force) {
    if (!curve || curve.points.length === 0) {
        strategiesContainer.innerHTML = '<div class="empty-state">请至少选择一个角色</div>';
        strategyCountEl.textContent = '0 种方案';
        strategiesCacheKey = lastSelectedKey;
        return;
    }
    if (force || strategiesCacheKey !== lastSelectedKey) {
        renderStrategies(computeStrategies());
        strategiesCacheKey = lastSelectedKey;
    }
}

/* ============================================================
   16. 视图切换
   ============================================================ */
const chartView = document.getElementById("chartView");
const strategyView = document.getElementById("strategyView");
const viewTabs = document.querySelectorAll(".view-tab");

function switchView(viewName) {
    if (viewName === 'chart') {
        chartView.classList.remove('view-hidden');
        strategyView.classList.add('view-hidden');
    } else {
        chartView.classList.add('view-hidden');
        strategyView.classList.remove('view-hidden');
        ensureCurve();
        updateStrategyView(true);
    }
    viewTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === viewName);
    });
}

viewTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        switchView(this.dataset.view);
    });
});

/* ============================================================
   17. 一键保存全部截图
   ============================================================ */
async function saveAllScreenshots() {
    const cards = document.querySelectorAll('.strategy-card');
    if (cards.length === 0) {
        alert('没有可保存的方案');
        return;
    }
    const btn = document.getElementById('btnSaveAll');
    btn.disabled = true;

    for (let i = 0; i < cards.length; i++) {
        btn.textContent = `⏳ ${i + 1}/${cards.length}...`;
        try {
            const canvas = await html2canvas(cards[i], {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                logging: false,
            });
            const tValue = cards[i].querySelector('.t-value').textContent.trim();
            const filename = '异环礼物方案_' + tValue.replace(/\s+/g, '_') + '.png';
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            alert(`第 ${i + 1} 个截图失败：` + e.message);
        }
    }

    btn.textContent = '📷 一键保存全部截图';
    btn.disabled = false;
}
