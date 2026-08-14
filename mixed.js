/* ============================================================
   mixed.js — 「混搭礼物最优法」模块（全新算法，不沿用旧阈值算法）
   ============================================================

   ▸ 旧算法：给定阈值 T，每个角色只能选一种档位（100/200/400），
     礼物数 = ⌈54100 / 档位⌉，通过扫描 T 得到“人均礼物-人均方斯”曲线。

   ▸ 新算法：允许同一个角色混合使用三档礼物（例如
     「133 个 400 档 + 9 个 100 档」恰好凑满 54100 好感，
     比只送 136 个 400 档更省方斯）。
     步骤：
       1) 对每个角色枚举全部合法混搭 (a×100档, b×200档, c×400档)，
          求出该角色在 (礼物数, 方斯) 平面上的帕累托前沿；
       2) 把全部角色的前沿做“背包式”合并，得到全体的
          “平均天数 — 人均方斯”帕累托最优曲线；
       3) 曲线上每个点都对应一份可展开的完整方案
          （各角色混搭明细 + 按地点排序的购物清单）。

   ▸ 约束（用户要求）：任何一样礼物不足 minCount 件的方案一律丢弃。
     minCount 由玩家在界面上选择（默认 10，0 表示不限制）；
     实现方式：枚举时直接把 1~(minCount-1) 件的“补法”抬到
     minCount 件或归零，因此算法输出的每个方案都天然满足
     “每样礼物 ≥ minCount 件”，玩家不需要为了几件礼物专程跑一趟商店。

   纯算法部分（mixedCharFrontier / mixedCombine）不依赖 DOM，
   可直接在 Node 中单测（见 test-mixed.js）。
   ============================================================ */

const MIXED_CONFIG = Object.freeze({
    favorTarget: 54100, // 每个角色练满所需好感（与原算法一致：⌈54100/档位⌉）
    minCount: 10        // 任何一样礼物不足 10 件的方案作废（界面可调，此为回退默认值）
});

/* ============================================================
   1. 单角色混搭帕累托前沿
   ------------------------------------------------------------
   返回 [{a,b,c,n,cost,favor}]：
     a/b/c = 100/200/400 档礼物件数（每项要么是 0，要么 ≥ minCount）
     n     = 总礼物数，cost = 总方斯，favor = 实际好感（≥ favorTarget）
   数组按 n 升序排列，且 cost 严格递减（帕累托前沿）。
   ------------------------------------------------------------
   正确性说明：对任意合法的混搭 (a,b,c)，若 a > 0 则把 a 降到
   “凑满好感所需的最小值”（不足 minCount 时抬到 minCount），
   礼物数与方斯都不增，说明只枚举最小 a 就足以覆盖全部
   帕累托最优解；其余候选点由后面的 Pareto 过滤淘汰。
   ============================================================ */
function mixedCharFrontier(r, minCount) {
    const FAVOR = MIXED_CONFIG.favorTarget;
    const MIN = (minCount === undefined || minCount === null) ? MIXED_CONFIG.minCount : minCount;
    const aMax = Math.ceil(FAVOR / 100);
    const bMax = Math.ceil(FAVOR / 200);
    const cMax = Math.ceil(FAVOR / 400);

    // 合法件数集合：0 或 [MIN, max]
    function validCounts(max) {
        const arr = [0];
        for (let v = MIN; v <= max; v++) arr.push(v);
        return arr;
    }
    const cList = validCounts(cMax);
    const bList = validCounts(bMax);

    const cand = new Map(); // n -> 最小 cost 的混搭
    for (const c of cList) {
        const restBC = FAVOR - 400 * c;
        for (const b of bList) {
            const rest = restBC - 200 * b;
            let a;
            if (rest <= 0) {
                a = 0;
            } else {
                a = Math.ceil(rest / 100);
                // 需要补 1~(MIN-1) 件的方案作废：按 MIN 件买（作为另一个候选参与竞争）
                if (a > 0 && a < MIN) a = MIN;
            }
            if (a > aMax) continue; // 理论不可达，仅作防御
            const n = a + b + c;
            const cost = a * r.c100 + b * r.c200 + c * r.c400;
            const prev = cand.get(n);
            if (prev === undefined || cost < prev.cost) {
                cand.set(n, { a, b, c, n, cost, favor: 100 * a + 200 * b + 400 * c });
            }
        }
    }

    const sorted = Array.from(cand.values()).sort((x, y) => x.n - y.n);
    const frontier = [];
    let minCost = Infinity;
    for (const p of sorted) {
        if (p.cost < minCost) {
            frontier.push(p);
            minCost = p.cost;
        }
    }
    return frontier;
}

/* ============================================================
   2. 多角色合并帕累托前沿
   ------------------------------------------------------------
   输入 chars：参与计算的角色数组（含 c100/c200/c400）。
   输出 [{n, cost, mixes}]：
     n     = 全部角色礼物总数（n / 角色数 / 10 = 平均天数/角色）
     cost  = 全部角色总方斯
     mixes = 长度等于 chars 的数组，mixes[i] 是第 i 个角色的混搭
             {a,b,c,n,cost,favor}（直接来自该角色的前沿）
   数组按 n 升序排列，且 cost 严格递减。

   实现：逐角色做动态规划。对每个可达礼物总数 N 只保留最小
   方斯；每层结束把“被更少礼物 + 更省方斯的点支配”的 N 剪掉
   （被支配的状态无论后面怎么加礼物都不可能翻盘）。
   为还原方案，每层记录 choiceLayers[i][N] = 第 i 个角色在
   总数为 N 时选择的前沿点下标。
   ============================================================ */
function mixedCombine(chars, minCount) {
    const m = chars.length;
    if (m === 0) return [];

    const aMax = Math.ceil(MIXED_CONFIG.favorTarget / 100);
    const maxN = m * aMax;
    const INF = Infinity;

    const frontiers = chars.map(function (r) { return mixedCharFrontier(r, minCount); });
    const choiceLayers = new Array(m); // 每层 Int32Array：N -> 该角色的前沿点下标

    let cost = new Float64Array(maxN + 1).fill(INF);
    cost[0] = 0;
    let validNs = [0]; // 未被支配的 N（升序，cost 严格递减）

    for (let i = 0; i < m; i++) {
        const F = frontiers[i];
        const next = new Float64Array(maxN + 1).fill(INF);
        const choices = new Int32Array(maxN + 1).fill(-1);

        for (const N of validNs) {
            const cN = cost[N];
            for (let j = 0; j < F.length; j++) {
                const p = F[j];
                const n2 = N + p.n;
                if (n2 > maxN) break; // F 按 n 升序，后面的只会更大
                const cand = cN + p.cost;
                if (cand < next[n2]) {
                    next[n2] = cand;
                    choices[n2] = j;
                }
            }
        }

        // 剪枝：保留 cost 随 N 严格递减的 N
        const kept = [];
        let runMin = INF;
        for (let N = 0; N <= maxN; N++) {
            if (next[N] < runMin) {
                runMin = next[N];
                kept.push(N);
            } else {
                next[N] = INF;
            }
        }

        cost = next;
        validNs = kept;
        choiceLayers[i] = choices;
    }

    // 回溯还原每个前沿点的完整方案
    const result = [];
    for (const N of validNs) {
        const mixes = new Array(m);
        let cur = N;
        for (let i = m - 1; i >= 0; i--) {
            const j = choiceLayers[i][cur];
            mixes[i] = frontiers[i][j];
            cur -= mixes[i].n;
        }
        result.push({ n: N, cost: cost[N], mixes });
    }
    return result;
}

/* ============================================================
   3. 浏览器 UI（挂在第三个视图「混搭礼物最优法」上）
   ============================================================ */
if (typeof document !== 'undefined' && typeof window !== 'undefined' && typeof model !== 'undefined') {
    (function () {
        const mixedView = document.getElementById('mixedView');
        if (!mixedView) return; // 页面未挂载该视图时静默退出

        const mixedChartSvg = document.getElementById('mixedChartSvg');
        const mixedChartInfo = document.getElementById('mixedChartInfo');
        const mixedChartTooltip = document.getElementById('mixedChartTooltip');
        const mixedPointCount = document.getElementById('mixedPointCount');
        const mixedComputeTime = document.getElementById('mixedComputeTime');
        const mixedDetail = document.getElementById('mixedDetail');
        const mixedListBody = document.getElementById('mixedListBody');
        const btnSaveMixed = document.getElementById('btnSaveMixed');
        const mixedMinSelect = document.getElementById('mixedMinSelect');
        const mixedMinHint = document.getElementById('mixedMinHint');

        const state = {
            sig: null,      // 角色选择 + minCount 签名（变了才重算）
            chars: null,    // 当前参与计算的角色
            frontier: null, // mixedCombine 结果
            selIdx: null,   // 当前选中的前沿点下标
            minCount: MIXED_CONFIG.minCount, // 单样礼物最低件数
            computeMs: 0    // 最近一次计算耗时
        };
        let mixedViewOpen = false;

        /* ---------- 角色选择 ---------- */
        function selectionSignature() {
            let s = '';
            model.forEach(function (r, i) {
                const cb = document.getElementById('r' + i);
                s += (cb && cb.checked) ? '1' : '0';
            });
            return s;
        }

        function selectedChars() {
            const out = [];
            model.forEach(function (r, i) {
                const cb = document.getElementById('r' + i);
                if (cb && cb.checked) out.push(r);
            });
            return out;
        }

        /* 缓存计算：角色选择 / minCount 不变则不重算；返回 true 表示发生了重算 */
        function ensureComputed() {
            let minCount = MIXED_CONFIG.minCount;
            if (mixedMinSelect) {
                const v = parseInt(mixedMinSelect.value, 10);
                if (Number.isFinite(v) && v >= 0) minCount = v;
            }
            const sig = selectionSignature() + '|m' + minCount;
            if (state.sig === sig && state.frontier) return false;
            const chars = selectedChars();
            const t0 = performance.now();
            const frontier = mixedCombine(chars, minCount);
            state.computeMs = performance.now() - t0;
            state.sig = sig;
            state.chars = chars;
            state.frontier = frontier;
            state.minCount = minCount;

            if (frontier.length > 0) {
                // 默认选中：平均礼物数最接近 210（约 21 天/角色，与旧算法初始一致）
                let best = 0, bestD = Infinity;
                frontier.forEach(function (p, idx) {
                    const d = Math.abs(p.n / chars.length - 210);
                    if (d < bestD) { bestD = d; best = idx; }
                });
                state.selIdx = best;
            } else {
                state.selIdx = null;
            }
            return true;
        }

        function currentPoint() {
            if (!state.frontier || state.selIdx === null) return null;
            return state.frontier[state.selIdx];
        }

        function daysOf(p) {
            return p.n / (10 * state.chars.length);
        }

        function avgCostOf(p) {
            return p.cost / state.chars.length;
        }

        /* ---------- 图表 ---------- */
        function mixedDrawChart() {
            const svg = mixedChartSvg;
            if (!svg) return;
            const c = getChartColors();
            const W = 480, H = 480;
            const pad = { left: 70, right: 17, top: 36, bottom: 48 };
            const pw = W - pad.left - pad.right;
            const ph = H - pad.top - pad.bottom;
            const pts = state.frontier || [];
            const m = state.chars ? state.chars.length : 0;
            let html = '';

            if (pts.length < 1 || m === 0) {
                html += '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" font-size="15" fill="' + c.tickLabel + '">请至少选择一个角色</text>';
                svg.innerHTML = html;
                svg._mixedPts = [];
                mixedChartInfo.innerHTML = '请至少选择一个角色';
                return;
            }

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            pts.forEach(function (p) {
                const x = daysOf(p), y = avgCostOf(p);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            });
            const xPad = Math.max((maxX - minX) * 0.08, 0.3);
            const yPad = Math.max((maxY - minY) * 0.08, 500);
            minX -= xPad; maxX += xPad;
            minY -= yPad; maxY += yPad;
            const rangeX = maxX - minX || 1;
            const rangeY = maxY - minY || 1;

            function x(p) { return pad.left + (daysOf(p) - minX) / rangeX * pw; }
            function y(p) { return pad.top + ph - (avgCostOf(p) - minY) / rangeY * ph; }

            // 网格
            for (let i = 0; i <= 5; i++) {
                const gy = pad.top + ph * i / 5;
                html += '<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (W - pad.right) + '" y2="' + gy + '" stroke="' + c.grid + '" stroke-width="1"/>';
            }
            for (let i = 0; i <= 4; i++) {
                const gx = pad.left + pw * i / 4;
                html += '<line x1="' + gx + '" y1="' + pad.top + '" x2="' + gx + '" y2="' + (H - pad.bottom) + '" stroke="' + c.grid + '" stroke-width="1"/>';
            }

            // 坐标轴
            html += '<line x1="' + pad.left + '" y1="' + pad.top + '" x2="' + pad.left + '" y2="' + (H - pad.bottom) + '" stroke="' + c.axis + '" stroke-width="1.5"/>';
            html += '<line x1="' + pad.left + '" y1="' + (H - pad.bottom) + '" x2="' + (W - pad.right) + '" y2="' + (H - pad.bottom) + '" stroke="' + c.axis + '" stroke-width="1.5"/>';

            // Y 轴刻度（人均方斯）
            for (let i = 0; i <= 4; i++) {
                const val = minY + rangeY * i / 4;
                const gy = pad.top + ph - ph * i / 4;
                html += '<text x="' + (pad.left - 6) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="' + c.tickLabel + '">' + formatNumber(Math.round(val)) + '</text>';
            }
            // X 轴刻度（平均天数）
            for (let i = 0; i <= 4; i++) {
                const val = minX + rangeX * i / 4;
                const gx = pad.left + pw * i / 4;
                html += '<text x="' + gx + '" y="' + (H - pad.bottom + 16) + '" text-anchor="middle" font-size="11" fill="' + c.tickLabel + '">' + val.toFixed(1) + '</text>';
            }

            // 轴标题
            html += '<text x="12" y="' + (H / 2) + '" text-anchor="middle" font-size="12" fill="' + c.axisTitle + '" font-weight="500" transform="rotate(-90, 12, ' + (H / 2) + ')">← 人均方斯</text>';
            html += '<text x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="12" fill="' + c.axisTitle + '" font-weight="500">平均天数（天/角色）→</text>';

            // 散点（帕累托前沿，方斯随天数严格下降）
            pts.forEach(function (p) {
                html += '<circle cx="' + x(p).toFixed(1) + '" cy="' + y(p).toFixed(1) + '" r="3.5" fill="' + c.dot + '" opacity="0.55"/>';
            });

            // 可拖拽手柄
            const sel = currentPoint();
            if (sel) {
                html += '<circle cx="' + x(sel).toFixed(1) + '" cy="' + y(sel).toFixed(1) + '" r="11" fill="' + c.handleFill + '" stroke="' + c.handleStroke + '" stroke-width="3" id="mixedDragHandle"/>';
            }

            svg.innerHTML = html;
            svg._mixedPts = pts;
            svg._mixedX = x;
            svg._mixedY = y;
            svg._mixedPad = pad;

            if (sel) {
                mixedChartInfo.innerHTML = '混搭最优曲线：共 <strong>' + pts.length + '</strong> 个方案 · 当前平均 <strong>' +
                    daysOf(sel).toFixed(1) + '</strong> 天/角色 · 人均 <strong>' +
                    formatNumber(Math.round(avgCostOf(sel))) + '</strong> 方斯';
            }
        }

        /* ---------- 明细（各角色混搭 + 购物清单） ---------- */
        function mixedRenderDetail() {
            if (!mixedDetail) return;
            const p = currentPoint();
            if (!p || !state.chars || state.chars.length === 0) {
                mixedDetail.innerHTML = '<div class="empty-state">请至少选择一个角色</div>';
                return;
            }

            let html = '';
            html += '<div class="mixed-detail-summary">' +
                '<span>平均 <strong>' + daysOf(p).toFixed(1) + '</strong> 天/角色</span>' +
                '<span>总礼物 <strong>' + formatNumber(p.n) + '</strong></span>' +
                '<span>总方斯 <strong>' + formatNumber(Math.round(p.cost)) + '</strong></span>' +
                '<span>方案 <strong>' + (state.selIdx + 1) + '</strong> / ' + state.frontier.length + '</span>' +
                '</div>';

            // 各角色混搭明细
            const rows = state.chars.map(function (r, i) {
                const mx = p.mixes[i];
                function tierCell(t, cnt) {
                    if (cnt <= 0) return '<span class="tier-none">—</span>';
                    return '<span class="tier-name">' + getGiftName(r, t) + '</span><span class="tier-count">×' + cnt + '</span>';
                }
                const over = mx.favor - MIXED_CONFIG.favorTarget;
                const overHtml = over <= 0
                    ? '<span class="over-zero">精准 ✓</span>'
                    : '<span class="over-plus">+' + over + '</span>';
                return '<tr>' +
                    '<td class="col-role">' + r.name + (r.hasSkin ? ' <span class="skin-badge">皮肤</span>' : '') + '</td>' +
                    '<td class="mixed-tier-cell">' + tierCell(100, mx.a) + '</td>' +
                    '<td class="mixed-tier-cell">' + tierCell(200, mx.b) + '</td>' +
                    '<td class="mixed-tier-cell">' + tierCell(400, mx.c) + '</td>' +
                    '<td class="col-gift">' + mx.n + '</td>' +
                    '<td class="col-cost">' + formatNumber(mx.cost) + '</td>' +
                    '<td class="col-over">' + overHtml + '</td>' +
                    '</tr>';
            }).join('');

            html += '<div class="table-wrap mixed-table-wrap"><table class="mixed-detail-table">' +
                '<thead><tr><th>角色</th><th>100档礼物</th><th>200档礼物</th><th>400档礼物</th><th>礼物总数</th><th>方斯</th><th>溢出好感</th></tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
                '<tfoot><tr><td>合计</td><td></td><td></td><td></td>' +
                '<td class="col-gift">' + formatNumber(p.n) + '</td>' +
                '<td class="col-cost">' + formatNumber(Math.round(p.cost)) + '</td><td></td></tr></tfoot>' +
                '</table></div>';

            // 购物清单（同名 + 同地点的礼物合并为一条）
            const items = new Map();
            state.chars.forEach(function (r, i) {
                const mx = p.mixes[i];
                [[100, mx.a], [200, mx.b], [400, mx.c]].forEach(function (pair) {
                    const t = pair[0], cnt = pair[1];
                    if (!cnt) return;
                    const name = getGiftName(r, t);
                    const loc = getLocation(r, t);
                    const key = name + '|' + loc;
                    if (!items.has(key)) items.set(key, { name: name, loc: loc, price: getPrice(r, t), count: 0 });
                    items.get(key).count += cnt;
                });
            });
            const itemRows = Array.from(items.values())
                .sort(function (a, b) {
                    const pa = parseLocation(a.loc), pb = parseLocation(b.loc);
                    const c1 = pa.area.localeCompare(pb.area, undefined, { sensitivity: 'base' });
                    if (c1) return c1;
                    const c2 = pa.name.localeCompare(pb.name, undefined, { sensitivity: 'base' });
                    if (c2) return c2;
                    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                })
                .map(function (it) {
                    return '<tr>' +
                        '<td class="col-giftname">' + it.name + '</td>' +
                        '<td class="col-location">' + it.loc + '</td>' +
                        '<td>' + formatNumber(it.price) + '</td>' +
                        '<td class="col-gift">' + it.count + '</td>' +
                        '<td class="col-cost">' + formatNumber(it.price * it.count) + '</td>' +
                        '</tr>';
                }).join('');

            html += '<h4 class="mixed-sub-title">🛒 购物清单（按地点排序）</h4>';
            html += '<div class="mixed-shop-note">✅ ' + mixedMinNote() + '</div>';
            html += '<div class="table-wrap mixed-table-wrap"><table class="mixed-shop-table">' +
                '<thead><tr><th>礼物名</th><th>地点</th><th>单价</th><th>数量</th><th>合计方斯</th></tr></thead>' +
                '<tbody>' + itemRows + '</tbody></table></div>';

            mixedDetail.innerHTML = html;
        }

        /* ---------- 全部最优方案列表（0.1 天粒度去重） ---------- */
        function mixedRenderList() {
            if (!mixedListBody) return;
            const pts = state.frontier || [];
            const m = state.chars ? state.chars.length : 0;

            if (m === 0 || pts.length === 0) {
                mixedListBody.innerHTML = '<tr><td colspan="5" class="empty-state">请至少选择一个角色</td></tr>';
                mixedPointCount.textContent = '0 个最优方案';
                if (mixedComputeTime) mixedComputeTime.textContent = '';
                return;
            }

            // 每个 0.1 天粒度只保留最省方斯的一个方案
            const buckets = new Map();
            pts.forEach(function (p, idx) {
                const key = Math.round(daysOf(p) * 10);
                const best = buckets.get(key);
                if (!best || p.cost < best.cost) buckets.set(key, { idx: idx, p: p });
            });
            const rows = Array.from(buckets.values()).sort(function (a, b) { return a.idx - b.idx; });

            mixedListBody.innerHTML = rows.map(function (row) {
                const p = row.p;
                const sel = row.idx === state.selIdx ? ' class="selected"' : '';
                return '<tr data-idx="' + row.idx + '"' + sel + '>' +
                    '<td>' + daysOf(p).toFixed(1) + ' 天</td>' +
                    '<td>' + (p.n / m).toFixed(1) + '</td>' +
                    '<td>' + formatNumber(Math.round(p.cost / m)) + '</td>' +
                    '<td>' + formatNumber(p.n) + '</td>' +
                    '<td>' + formatNumber(Math.round(p.cost)) + '</td>' +
                    '</tr>';
            }).join('');

            mixedPointCount.textContent = pts.length + ' 个最优方案';
            if (mixedComputeTime) mixedComputeTime.textContent = '计算耗时 ' + Math.round(state.computeMs) + ' ms';
        }

        /* ---------- 选中某个前沿点 ---------- */
        function mixedSelect(idx) {
            if (!state.frontier || idx < 0 || idx >= state.frontier.length) return;
            if (idx === state.selIdx) return; // 未变化，跳过重绘（拖拽时避免反复重建图表）
            state.selIdx = idx;
            mixedDrawChart();
            mixedRenderDetail();
            if (mixedListBody) {
                mixedListBody.querySelectorAll('tr').forEach(function (tr) {
                    tr.classList.toggle('selected', parseInt(tr.dataset.idx, 10) === idx);
                });
            }
        }

        /* ---------- 单样礼物最低件数（minCount）文案 ---------- */
        function mixedMinNote() {
            if (state.minCount === 0) return '未限制单样礼物的最低件数';
            return '清单中每一样礼物均不少于 ' + state.minCount +
                ' 件（任何礼物不足 ' + state.minCount + ' 件的方案已被算法剔除）';
        }

        function updateMixedMinHint() {
            if (!mixedMinHint) return;
            mixedMinHint.textContent = state.minCount === 0
                ? '允许同一角色混搭 100/200/400 档礼物；未限制单样礼物的最低件数'
                : '允许同一角色混搭 100/200/400 档礼物；任何礼物不足 ' + state.minCount + ' 件的方案已被剔除';
        }

        function mixedRenderAll() {
            updateMixedMinHint();
            mixedDrawChart();
            mixedRenderDetail();
            mixedRenderList();
        }

        /* ---------- 拖拽 + 悬停提示 ---------- */
        function setupMixedDrag() {
            let dragging = false;

            function getSVGPos(e) {
                const rect = mixedChartSvg.getBoundingClientRect();
                const vb = mixedChartSvg.viewBox.baseVal;
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
                const pts = mixedChartSvg._mixedPts;
                const fx = mixedChartSvg._mixedX;
                const fy = mixedChartSvg._mixedY;
                if (!pts || !fx || !fy) return -1;
                let best = -1, bestD = Infinity;
                pts.forEach(function (p, idx) {
                    const dx = fx(p) - svgX, dy = fy(p) - svgY;
                    const d = dx * dx + dy * dy;
                    if (d < bestD) { bestD = d; best = idx; }
                });
                return best;
            }

            function hideTooltip() {
                mixedChartTooltip.classList.remove('visible');
            }

            function showTooltip(idx, screenX, screenY) {
                if (idx < 0 || !state.frontier) { hideTooltip(); return; }
                const p = state.frontier[idx];
                const m = state.chars.length;
                mixedChartTooltip.innerHTML =
                    '平均天数：<strong>' + daysOf(p).toFixed(1) + '</strong> 天/角色<br>' +
                    '人均礼物：<strong>' + (p.n / m).toFixed(1) + '</strong><br>' +
                    '人均方斯：<strong>' + formatNumber(Math.round(p.cost / m)) + '</strong><br>' +
                    '总礼物：<strong>' + formatNumber(p.n) + '</strong><br>' +
                    '总方斯：<strong>' + formatNumber(Math.round(p.cost)) + '</strong><br>' +
                    '方案 ' + (idx + 1) + ' / ' + state.frontier.length;
                const parent = mixedChartTooltip.parentElement;
                const pr = parent.getBoundingClientRect();
                let left = screenX - pr.left + 14;
                let top = screenY - pr.top - 14;
                if (left + 170 > pr.width) left = screenX - pr.left - 185;
                if (top + 100 > pr.height) top = screenY - pr.top - 125;
                if (left < 0) left = 4;
                if (top < 0) top = 4;
                mixedChartTooltip.style.left = left + 'px';
                mixedChartTooltip.style.top = top + 'px';
                mixedChartTooltip.classList.add('visible');
            }

            function onDown(e) {
                const pos = getSVGPos(e);
                const idx = findNearest(pos.x, pos.y);
                if (idx < 0) return;
                mixedSelect(idx);
                dragging = true;
                const h = document.getElementById('mixedDragHandle');
                if (h) h.style.cursor = 'grabbing';
                showTooltip(idx, pos.screenX, pos.screenY);
                e.preventDefault();
            }

            function onMove(e) {
                const pos = getSVGPos(e);
                const idx = findNearest(pos.x, pos.y);
                if (dragging) {
                    e.preventDefault();
                    if (idx >= 0) mixedSelect(idx);
                    showTooltip(idx, pos.screenX, pos.screenY);
                } else if (mixedChartSvg.contains(e.target)) {
                    showTooltip(idx, pos.screenX, pos.screenY);
                } else {
                    hideTooltip();
                }
            }

            function onUp(e) {
                if (!dragging) return;
                dragging = false;
                const pos = getSVGPos(e);
                const idx = findNearest(pos.x, pos.y);
                if (idx >= 0) mixedSelect(idx);
                const h = document.getElementById('mixedDragHandle');
                if (h) h.style.cursor = 'grab';
            }

            function onLeave() {
                if (!dragging) hideTooltip();
            }

            mixedChartSvg.addEventListener('mousedown', onDown);
            mixedChartSvg.addEventListener('touchstart', onDown, { passive: false });
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchend', onUp);
            mixedChartSvg.addEventListener('mouseleave', onLeave);
        }

        /* ---------- 列表点击切换 ---------- */
        if (mixedListBody) {
            mixedListBody.addEventListener('click', function (e) {
                if (!e.target || !e.target.closest) return;
                const tr = e.target.closest('tr[data-idx]');
                if (tr) mixedSelect(parseInt(tr.dataset.idx, 10));
            });
        }

        /* ---------- 单样礼物最低件数切换（签名变化触发重算） ---------- */
        if (mixedMinSelect) {
            mixedMinSelect.addEventListener('change', function () {
                if (!mixedViewOpen) return;
                if (ensureComputed()) mixedRenderAll();
            });
        }

        /* ---------- 保存当前方案截图 ---------- */
        if (btnSaveMixed) {
            btnSaveMixed.addEventListener('click', async function () {
                const p = currentPoint();
                if (!p) { alert('请先选择角色'); return; }
                const card = document.getElementById('mixedDetailCard');
                btnSaveMixed.disabled = true;
                btnSaveMixed.textContent = '⏳ 保存中...';
                try {
                    const canvas = await html2canvas(card, {
                        backgroundColor: isDarkMode() ? '#252836' : '#ffffff',
                        scale: 2,
                        useCORS: true,
                        logging: false
                    });
                    const link = document.createElement('a');
                    link.download = '异环混搭方案_' + daysOf(p).toFixed(1) + '天.png';
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                } catch (e) {
                    alert('截图失败：' + e.message);
                }
                btnSaveMixed.textContent = '📷 保存当前方案截图';
                btnSaveMixed.disabled = false;
            });
        }

        /* ---------- 与旧视图联动 ---------- */
        // 角色选择 / 旧图表拖拽等都会调用 update()：仅当本视图打开且选择变化时才重算
        const _mixedBaseUpdate = (typeof update === 'function') ? update : function () { };
        update = function () {
            _mixedBaseUpdate();
            if (!mixedViewOpen) return;
            if (ensureComputed()) mixedRenderAll();
        };

        // 视图切换：接管第三个 Tab
        const _mixedBaseSwitch = (typeof switchView === 'function') ? switchView : function () { };
        switchView = function (viewName) {
            if (viewName === 'mixed') {
                mixedViewOpen = true;
                if (typeof chartView !== 'undefined') chartView.classList.add('view-hidden');
                if (typeof strategyView !== 'undefined') strategyView.classList.add('view-hidden');
                mixedView.classList.remove('view-hidden');
                if (ensureComputed()) {
                    mixedRenderAll();
                } else {
                    // 已缓存：重绘（可能刚切换过暗色模式等）
                    mixedDrawChart();
                    mixedRenderDetail();
                    mixedRenderList();
                }
            } else {
                mixedViewOpen = false;
                mixedView.classList.add('view-hidden');
                _mixedBaseSwitch(viewName);
            }
            if (typeof viewTabs !== 'undefined') {
                viewTabs.forEach(function (tab) {
                    tab.classList.toggle('active', tab.dataset.view === viewName);
                });
            }
        };

        // 暗色模式切换：仅重绘图表的配色
        const mixedDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mixedDarkQuery.addEventListener('change', function () {
            if (mixedViewOpen) mixedDrawChart();
        });

        setupMixedDrag();
    })();
}
