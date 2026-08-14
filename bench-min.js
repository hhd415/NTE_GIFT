/* ============================================================
   bench-min.js — 实测 minCount（最低允许礼物件数）对计算量的影响
   运行：node bench-min.js
   ============================================================ */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const commonSrc = fs.readFileSync(path.join(__dirname, 'common.js'), 'utf8');
const mixedSrc = fs.readFileSync(path.join(__dirname, 'mixed.js'), 'utf8');

function bench(minCount) {
    const sandbox = {
        console, Infinity, NaN, Math, Number, Map, Set, Array, Object, JSON,
        Int16Array, Int32Array, Float64Array, Uint8Array,
        parseFloat, parseInt, String, Boolean, Date, RegExp,
        performance: require('perf_hooks').performance
    };
    vm.createContext(sandbox);
    vm.runInContext(commonSrc, sandbox, { filename: 'common.js' });
    vm.runInContext(mixedSrc, sandbox, { filename: 'mixed.js' });
    vm.runInContext(
        'this.__T__ = { model: model, mixedCharFrontier: mixedCharFrontier, mixedCombine: mixedCombine };',
        sandbox, { filename: 'export.js' }
    );
    const { model, mixedCharFrontier, mixedCombine } = sandbox.__T__;

    mixedCombine(model, minCount); // 预热（JIT）
    const t0 = sandbox.performance.now();
    const fr = mixedCombine(model, minCount);
    const ms = sandbox.performance.now() - t0;

    let maxF = 0;
    let enumTotal = 0;
    for (const r of model) {
        const f = mixedCharFrontier(r, minCount);
        if (f.length > maxF) maxF = f.length;
        enumTotal += f.length;
    }
    return { minCount, ms, points: fr.length, maxF, enumTotal };
}

console.log('minCount | mixedCombine(18角色) | 全局前沿 | 单角色前沿(最大/合计)');
console.log('---------|----------------------|----------|------------------------');
for (const m of [0, 1, 2, 3, 5, 8, 9, 12, 20, 50, 100]) {
    const r = bench(m);
    console.log(
        String(m).padStart(8) + ' | ' +
        r.ms.toFixed(1).padStart(19) + 'ms | ' +
        String(r.points).padStart(8) + ' | ' +
        String(r.maxF).padStart(4) + ' / ' + r.enumTotal
    );
}
