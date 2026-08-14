/* ============================================================
   mixed.js — 混合礼物最优算法模块
   ------------------------------------------------------------
   允许单角色混合赠送 100/200/400 档礼物，计算
   「平均天数 – 人均方斯」的最优曲线（Pareto 前沿）。

   关键规则：
   · 每个角色需要总好感 ≥ TOTAL_FAVOR（54100）。
   · 方案用 (a, b, c) 表示 = (400档件数, 200档件数, 100档件数)。
   · ≥9 件规则：某个角色方案中，只要它用到的一种档位礼物
     件数在 1~8 之间，该方案即作废，避免玩家专门跑去买几件。

   依赖 common.js（getGiftName / getLocation / getPrice）。
   ============================================================ */

const MIXED_ALGO = {
    TOTAL_FAVOR: 54100,
    MIN_GIFT: 9,
    GIFTS_PER_DAY: 10,

    /* ------------------------------------------------------------
       1. 单角色 Pareto 前沿
       枚举所有合法 (a,b,c)，保留互不支配的点。
       返回 [{ a, b, c, G, C }, ...]，按 G 升序、C 严格递减。
       G = 总件数，C = 总方斯。
       ------------------------------------------------------------ */
    computeCharFrontier(r) {
        const TOTAL = this.TOTAL_FAVOR;
        const MIN = this.MIN_GIFT;
        const cands = [];
        const A_MAX = Math.ceil(TOTAL / 400);

        for (let a = 0; a <= A_MAX; a++) {
            if (a > 0 && a < MIN) continue; // 400档件数 1~8 → 作废
            const bMax = Math.max(0, Math.ceil((TOTAL - 400 * a) / 200));
            for (let b = 0; b <= bMax; b++) {
                if (b > 0 && b < MIN) continue; // 200档件数 1~8 → 作废
                const need = TOTAL - 400 * a - 200 * b;
                const c = need > 0 ? Math.ceil(need / 100) : 0;
                if (c > 0 && c < MIN) continue; // 100档件数 1~8 → 作废
                cands.push({
                    a, b, c,
                    G: a + b + c,
                    C: a * r.c400 + b * r.c200 + c * r.c100
                });
            }
        }

        // Pareto 过滤：按 G 升序，C 严格递减才保留
        cands.sort((x, y) => x.G - y.G || x.C - y.C);
        const res = [];
        let bestC = Infinity;
        for (const p of cands) {
            if (p.C < bestC) { bestC = p.C; res.push(p); }
        }
        return res;
    },

    /* ------------------------------------------------------------
       2. 全局最优曲线（背包 DP）
       把每个角色前沿作为独立物品集，按总礼物数最小化总方斯。
       返回 { points, reconstruct(totalGift), minTotal, maxTotal, n }。
       points: [{ totalGift, avgGift, totalCost, avgCost }, ...]
       ------------------------------------------------------------ */
    buildCurve(selectedModel) {
        const n = selectedModel.length;
        if (n === 0) {
            return { points: [], reconstruct: () => [], minTotal: 0, maxTotal: 0, n: 0, frontiers: [] };
        }

        const frontiers = selectedModel.map(r => this.computeCharFrontier(r));
        const minTotal = frontiers.reduce((s, f) => s + f[0].G, 0);
        const maxTotal = frontiers.reduce((s, f) => s + f[f.length - 1].G, 0);

        const INF = Infinity;
        let dp = new Float64Array(maxTotal + 1).fill(INF);
        dp[0] = 0;
        const parents = [];
        for (let ci = 0; ci < n; ci++) {
            const f = frontiers[ci];
            const newDp = new Float64Array(maxTotal + 1).fill(INF);
            const par = new Int32Array(maxTotal + 1).fill(-1);
            for (let t = 0; t <= maxTotal; t++) {
                const cur = dp[t];
                if (!Number.isFinite(cur)) continue;
                for (let k = 0; k < f.length; k++) {
                    const nt = t + f[k].G;
                    if (nt > maxTotal) break; // 前沿按 G 升序，超出即止
                    const nc = cur + f[k].C;
                    if (nc < newDp[nt]) { newDp[nt] = nc; par[nt] = t; }
                }
            }
            dp = newDp;
            parents.push(par);
        }

        // 曲线点：总方斯严格递减才保留
        const pointTotals = [];
        let bestC = Infinity;
        for (let t = minTotal; t <= maxTotal; t++) {
            const c = dp[t];
            if (!Number.isFinite(c)) continue;
            if (c < bestC) { bestC = c; pointTotals.push(t); }
        }
        const points = pointTotals.map(t => ({
            totalGift: t,
            avgGift: t / n,
            totalCost: dp[t],
            avgCost: dp[t] / n
        }));

        /* --------------------------------------------------------
           3. 重建指定总件数对应的每角色方案
           返回 [{ ...角色, a, b, c, G, C, gifts:[{tier,count,name,location,price,subtotal}] }]
           -------------------------------------------------------- */
        const reconstruct = (totalGift) => {
            const counts = new Array(n);
            let t = totalGift;
            for (let ci = n - 1; ci >= 0; ci--) {
                const prev = parents[ci][t];
                counts[ci] = t - prev;
                t = prev;
            }
            return selectedModel.map((r, i) => {
                const f = frontiers[i];
                const g = counts[i];
                // 前沿按 G 升序 → 二分查找
                let lo = 0, hi = f.length - 1, entry = null;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1;
                    if (f[mid].G === g) { entry = f[mid]; break; }
                    if (f[mid].G < g) lo = mid + 1; else hi = mid - 1;
                }
                const e = entry || f[0];
                const gifts = [];
                if (e.a > 0) gifts.push({ tier: 400, count: e.a, name: getGiftName(r, 400), location: getLocation(r, 400), price: getPrice(r, 400), subtotal: e.a * r.c400 });
                if (e.b > 0) gifts.push({ tier: 200, count: e.b, name: getGiftName(r, 200), location: getLocation(r, 200), price: getPrice(r, 200), subtotal: e.b * r.c200 });
                if (e.c > 0) gifts.push({ tier: 100, count: e.c, name: getGiftName(r, 100), location: getLocation(r, 100), price: getPrice(r, 100), subtotal: e.c * r.c100 });
                return {
                    ...r,
                    a: e.a, b: e.b, c: e.c,
                    G: e.G, C: e.C,
                    gifts
                };
            });
        };

        return { points, reconstruct, minTotal, maxTotal, n, frontiers };
    },

    /* ------------------------------------------------------------
       4. 里程碑方案
       对每个整数平均天数 D，取「平均礼物数 ≤ D×10」且总方斯最小的
       曲线点，作为 D 天内最省的方案。
       返回 [{ days, daysActual, avgGift, avgCost, totalCost, point, plan }]
       ------------------------------------------------------------ */
    buildMilestoneStrategies(curve) {
        if (!curve || curve.points.length === 0) return [];
        const pts = curve.points;
        const first = pts[0], last = pts[pts.length - 1];
        const minDays = Math.ceil(first.avgGift / this.GIFTS_PER_DAY);
        const maxDays = Math.ceil(last.avgGift / this.GIFTS_PER_DAY);
        const strategies = [];

        for (let D = minDays; D <= maxDays; D++) {
            const cap = D * this.GIFTS_PER_DAY; // 平均件数上限
            // 找 avgGift ≤ cap 的最右点
            let lo = 0, hi = pts.length - 1, idx = -1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (pts[mid].avgGift <= cap) { idx = mid; lo = mid + 1; }
                else hi = mid - 1;
            }
            if (idx < 0) continue;
            const p = pts[idx];
            strategies.push({
                days: D,
                daysActual: p.avgGift / this.GIFTS_PER_DAY,
                avgGift: p.avgGift,
                avgCost: p.avgCost,
                totalCost: p.totalCost,
                point: p,
                plan: curve.reconstruct(p.totalGift)
            });
        }
        return strategies;
    }
};
