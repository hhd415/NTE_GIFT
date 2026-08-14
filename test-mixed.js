/* ============================================================
   test-mixed.js — mixed.js 算法单元测试（Node 环境）
   运行：node test-mixed.js
   ============================================================ */
'use strict';

const fs = require('fs');
const vm = require('vm');

const dataSrc = fs.readFileSync(require('path').join(__dirname, 'data.js'), 'utf8');
const commonSrc = fs.readFileSync(require('path').join(__dirname, 'common.js'), 'utf8');
const mixedSrc = fs.readFileSync(require('path').join(__dirname, 'mixed.js'), 'utf8');

const sandbox = {
    console,
    Infinity, NaN, Math, Number, Map, Set, Array, Object, JSON,
    Int16Array, Int32Array, Float64Array, Uint8Array,
    parseFloat, parseInt, String, Boolean, Date, RegExp,
    performance: require('perf_hooks').performance
};
// 注意：不定义 document / window，mixed.js 的 UI 部分会被跳过
vm.createContext(sandbox);
vm.runInContext(dataSrc, sandbox, { filename: 'data.js' });
vm.runInContext(commonSrc, sandbox, { filename: 'common.js' });
vm.runInContext(mixedSrc, sandbox, { filename: 'mixed.js' });
// 顶层 const/let 不挂在 sandbox 上，需要再跑一段脚本把它们导出
vm.runInContext(
    'this.__MIXED_TEST__ = { model: model, mixedCharFrontier: mixedCharFrontier, mixedCombine: mixedCombine, MIXED_CONFIG: MIXED_CONFIG };',
    sandbox,
    { filename: 'export.js' }
);

const model = sandbox.__MIXED_TEST__.model;
const mixedCharFrontier = sandbox.__MIXED_TEST__.mixedCharFrontier;
const mixedCombine = sandbox.__MIXED_TEST__.mixedCombine;
const MIXED_CONFIG = sandbox.__MIXED_TEST__.MIXED_CONFIG;
const F = MIXED_CONFIG.favorTarget;
const MIN = MIXED_CONFIG.minCount;

let ok = true;
function assert(cond, msg) {
    if (!cond) {
        ok = false;
        console.error('  ❌ FAIL:', msg);
    }
}

console.log('favorTarget =', F, ' minCount =', MIN, ' 角色数 =', model.length);

/* ---------- 1. 单角色前沿基本性质 ---------- */
console.log('\n[1] 单角色前沿性质');
for (const r of model) {
    const f = mixedCharFrontier(r);
    assert(f.length >= 2, r.name + ' 前沿点数异常: ' + f.length);
    let prevN = -1, prevCost = Infinity;
    for (const p of f) {
        assert(p.n > prevN, r.name + ' n 未严格递增');
        assert(p.cost < prevCost, r.name + ' cost 未严格递减');
        assert(p.a === 0 || p.a >= MIN, r.name + ' a=' + p.a + ' 违反最小件数');
        assert(p.b === 0 || p.b >= MIN, r.name + ' b=' + p.b + ' 违反最小件数');
        assert(p.c === 0 || p.c >= MIN, r.name + ' c=' + p.c + ' 违反最小件数');
        assert(p.favor >= F, r.name + ' 好感不足: ' + p.favor);
        assert(p.favor === 100 * p.a + 200 * p.b + 400 * p.c, r.name + ' favor 计算错误');
        assert(p.cost === p.a * r.c100 + p.b * r.c200 + p.c * r.c400, r.name + ' cost 计算错误');
        prevN = p.n; prevCost = p.cost;
    }
    assert(f[0].n === Math.ceil(F / 400), r.name + ' 最小礼物数应为 ' + Math.ceil(F / 400) + ' 实为 ' + f[0].n);
    assert(f[f.length - 1].n === Math.ceil(F / 100), r.name + ' 最大礼物数应为 ' + Math.ceil(F / 100) + ' 实为 ' + f[f.length - 1].n);
    console.log('  ' + r.name + ': 前沿 ' + f.length + ' 点, n ∈ [' + f[0].n + ', ' + f[f.length - 1].n + ']');
}

/* ---------- 1b. 可选 minCount（玩家可调）下的前沿性质 ---------- */
console.log('\n[1b] 可选 minCount 前沿性质');
for (const mCount of [0, 1, 5, 9, 20, 100]) {
    for (const r of model) {
        const f = mixedCharFrontier(r, mCount);
        assert(f.length > 0, r.name + ' m=' + mCount + ' 前沿为空');
        let prevN = -1, prevCost = Infinity;
        for (const p of f) {
            assert(p.n > prevN, r.name + ' m=' + mCount + ' n 未严格递增');
            assert(p.cost < prevCost, r.name + ' m=' + mCount + ' cost 未严格递减');
            assert(p.a === 0 || p.a >= mCount, r.name + ' m=' + mCount + ' a=' + p.a + ' 违反最小件数');
            assert(p.b === 0 || p.b >= mCount, r.name + ' m=' + mCount + ' b=' + p.b + ' 违反最小件数');
            assert(p.c === 0 || p.c >= mCount, r.name + ' m=' + mCount + ' c=' + p.c + ' 违反最小件数');
            assert(p.favor >= F, r.name + ' m=' + mCount + ' 好感不足: ' + p.favor);
            prevN = p.n; prevCost = p.cost;
        }
    }
    const fr = mixedCombine(model, mCount);
    assert(fr.length > 0, 'm=' + mCount + ' 全局前沿为空');
    for (const p of fr) {
        for (const mx of p.mixes) {
            assert(mx.a === 0 || mx.a >= mCount, 'm=' + mCount + ' 全局 a 违反最小件数');
            assert(mx.b === 0 || mx.b >= mCount, 'm=' + mCount + ' 全局 b 违反最小件数');
            assert(mx.c === 0 || mx.c >= mCount, 'm=' + mCount + ' 全局 c 违反最小件数');
            assert(100 * mx.a + 200 * mx.b + 400 * mx.c >= F, 'm=' + mCount + ' 全局好感不足');
        }
    }
    console.log('  minCount=' + String(mCount).padStart(3) + ': 单角色前沿 OK, 全局前沿 ' + fr.length + ' 点');
}
console.log('  通过');

/* ---------- 2. 哈索尔特特征点 ---------- */
console.log('\n[2] 哈索尔特特征点');
const h = model[0];
const fh = mixedCharFrontier(h);
// n=146 的最优混搭：125×400 + 21×200 = 54,200 好感（默认 minCount=20 下第一个混合点）
const p146 = fh.find(p => p.n === 146);
assert(p146 && p146.a === 0 && p146.b === 21 && p146.c === 125, '125×400+21×200 特征点缺失');
if (p146) assert(p146.cost === 125 * 20000 + 21 * 5000, '特征点成本错: ' + p146.cost);
// 同 n=146 的次优混搭（126×400+20×200, cost 2,620,000）必须被帕累托过滤淘汰
assert(!fh.some(p => p.a === 0 && p.b === 20 && p.c === 126), '被支配的 126×400+20×200 点不应留在前沿上');
const p136 = fh.find(p => p.n === 136);
assert(p136 && p136.a === 0 && p136.b === 0 && p136.c === 136, '全 400 档点缺失');
const p541 = fh.find(p => p.n === 541);
assert(p541 && p541.a === 541 && p541.b === 0 && p541.c === 0, '全 100 档点缺失');
console.log('  n=136 -> cost', fh[0].cost, '| n=146 -> cost', p146 && p146.cost, '| n=541 -> cost', p541 && p541.cost);

/* ---------- 3. 哈索尔全枚举暴力校验 ---------- */
console.log('\n[3] 哈索尔全枚举暴力校验（约 2000 万组合）…');
{
    const t0 = Date.now();
    const aMax = Math.ceil(F / 100), bMax = Math.ceil(F / 200), cMax = Math.ceil(F / 400);
    const best = new Map(); // n -> min cost
    for (let c = 0; c <= cMax; c++) {
        if (c > 0 && c < MIN) continue;
        for (let b = 0; b <= bMax; b++) {
            if (b > 0 && b < MIN) continue;
            for (let a = 0; a <= aMax; a++) {
                if (a > 0 && a < MIN) continue;
                if (100 * a + 200 * b + 400 * c < F) continue;
                const n = a + b + c;
                const cost = a * h.c100 + b * h.c200 + c * h.c400;
                const cur = best.get(n);
                if (cur === undefined || cost < cur) best.set(n, cost);
            }
        }
    }
    const sorted = Array.from(best.entries()).sort((x, y) => x[0] - y[0]);
    const pf = [];
    let run = Infinity;
    for (const [n, cost] of sorted) if (cost < run) { pf.push({ n, cost }); run = cost; }
    console.log('  暴力枚举耗时', Date.now() - t0, 'ms, 暴力前沿', pf.length, '点');
    assert(pf.length === fh.length, '暴力前沿点数 ' + pf.length + ' ≠ 算法 ' + fh.length);
    if (pf.length === fh.length) {
        pf.forEach((q, i) => {
            assert(q.n === fh[i].n && q.cost === fh[i].cost, '前沿点不一致 @' + i + ' (' + q.n + ',' + q.cost + ') vs (' + fh[i].n + ',' + fh[i].cost + ')');
        });
    }
    console.log('  暴力校验通过');
}

/* ---------- 4. 全 18 角色合并 + 性能 ---------- */
console.log('\n[4] 全角色合并');
{
    const t0 = Date.now();
    const fr = mixedCombine(model);
    const ms = Date.now() - t0;
    console.log('  mixedCombine(18) 耗时 ' + ms + ' ms, 前沿 ' + fr.length + ' 点');
    let pN = -1, pC = Infinity;
    for (const p of fr) {
        assert(p.n > pN && p.cost < pC, '全局前沿非严格单调');
        assert(p.mixes.length === model.length, 'mixes 长度');
        p.mixes.forEach((mx) => {
            assert(mx.a === 0 || mx.a >= MIN, '全局 a 违反最小件数');
            assert(mx.b === 0 || mx.b >= MIN, '全局 b 违反最小件数');
            assert(mx.c === 0 || mx.c >= MIN, '全局 c 违反最小件数');
            assert(100 * mx.a + 200 * mx.b + 400 * mx.c >= F, '全局好感不足');
        });
        pN = p.n; pC = p.cost;
    }
    const sumAll400 = model.reduce((s, r) => s + Math.ceil(F / 400) * r.c400, 0);
    const sumAll100 = model.reduce((s, r) => s + Math.ceil(F / 100) * r.c100, 0);
    assert(fr[0].n === model.length * Math.ceil(F / 400) && fr[0].cost === sumAll400, '全 400 档端点错: ' + fr[0].n + ',' + fr[0].cost + ' 期望 ' + model.length * Math.ceil(F / 400) + ',' + sumAll400);
    assert(fr[fr.length - 1].n === model.length * Math.ceil(F / 100) && fr[fr.length - 1].cost === sumAll100, '全 100 档端点错');
    const avgDays0 = fr[0].n / (10 * model.length);
    const avgDays1 = fr[fr.length - 1].n / (10 * model.length);
    console.log('  平均天数范围 ' + avgDays0.toFixed(1) + ' ~ ' + avgDays1.toFixed(1) + ' 天/角色, 人均方斯范围 ' +
        Math.round(fr[fr.length - 1].cost / model.length) + ' ~ ' + Math.round(fr[0].cost / model.length));

    // 对照旧算法：21 天/角色 附近的新算法点
    let bestIdx = 0, bestD = Infinity;
    fr.forEach((p, i) => {
        const d = Math.abs(p.n / model.length - 210);
        if (d < bestD) { bestD = d; bestIdx = i; }
    });
    const near = fr[bestIdx];
    console.log('  21 天/角色附近：' + (near.n / (10 * model.length)).toFixed(1) + ' 天, 人均方斯 ' + Math.round(near.cost / model.length));
}

/* ---------- 5. 单角色合并一致性 ---------- */
console.log('\n[5] 单角色合并一致性');
{
    const fr1 = mixedCombine([model[0]]);
    assert(fr1.length === fh.length, '单角色合并点数 ' + fr1.length + ' ≠ ' + fh.length);
    if (fr1.length === fh.length) {
        fr1.forEach((p, i) => assert(p.n === fh[i].n && p.cost === fh[i].cost, '单角色合并点不一致 @' + i));
    }
    console.log('  通过');
}

/* ---------- 6. 双角色交叉验证（直接两两组合再过滤，与 DP 结果比对） ---------- */
console.log('\n[6] 双角色交叉验证');
{
    const A = model[0], B = model[1];
    const fA = mixedCharFrontier(A), fB = mixedCharFrontier(B);
    const best = new Map();
    fA.forEach(pa => fB.forEach(pb => {
        const n = pa.n + pb.n, cost = pa.cost + pb.cost;
        const cur = best.get(n);
        if (cur === undefined || cost < cur) best.set(n, cost);
    }));
    const sorted = Array.from(best.entries()).sort((x, y) => x[0] - y[0]);
    const pf = [];
    let run = Infinity;
    for (const [n, cost] of sorted) if (cost < run) { pf.push({ n, cost }); run = cost; }
    const fr2 = mixedCombine([A, B]);
    assert(pf.length === fr2.length, '双角色前沿点数 ' + pf.length + ' ≠ ' + fr2.length);
    if (pf.length === fr2.length) {
        pf.forEach((q, i) => assert(q.n === fr2[i].n && q.cost === fr2[i].cost, '双角色前沿点不一致 @' + i));
    }
    console.log('  通过, 前沿 ' + pf.length + ' 点');
}

console.log('\n' + (ok ? '✅ 全部测试通过' : '❌ 存在失败项'));
process.exit(ok ? 0 : 1);
