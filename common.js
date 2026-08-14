/* ============================================================
   common.js — 共享建模 & 工具函数（数据见 data.js）
   需先加载 data.js（浏览器按 <script> 顺序，Node 测试先 vm 加载）
   ============================================================ */

/* ============================================================
   1. 数据层
   ------------------------------------------------------------
   角色数据由 data.js 提供（const data = [...]）。
   本文件只负责建模与工具函数，不再包含数据。
   ============================================================ */

/* ============================================================
   2. 建模 + 校验
   ============================================================ */
function buildModel(raw) {
    return raw.map(r => {
        const ok =
            Number.isFinite(r.c100) &&
            Number.isFinite(r.c200) &&
            Number.isFinite(r.c400) &&
            r.c100 > 0 && r.c200 > 0 && r.c400 > 0;
        if (!ok) {
            console.warn("非法数据：", r);
            return null;
        }
        return {
            ...r,
            e200: Math.ceil(r.c200 - 2 * r.c100),
            e400: Math.ceil((r.c400 - 4 * r.c100) / 3)
        };
    }).filter(Boolean);
}

const model = buildModel(data);

/* ============================================================
   3. 工具函数
   ============================================================ */
function formatNumber(num) {
    return Math.round(num)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function choose(r, T) {
    if (r.e400 <= T) return 400;
    if (r.e200 <= T) return 200;
    return 100;
}

function getPrice(r, t) {
    return t === 100 ? r.c100 : t === 200 ? r.c200 : r.c400;
}

function getGiftName(r, t) {
    return t === 100 ? r.name100 : t === 200 ? r.name200 : r.name400;
}

function getLocation(r, t) {
    return t === 100 ? r.l100 : t === 200 ? r.l200 : r.l400;
}

// 解析地点为 name + area（用于排序）
function parseLocation(loc) {
    const idx = loc.lastIndexOf('(');
    if (idx !== -1 && loc.endsWith(')')) {
        const name = loc.substring(0, idx).trim();
        const area = loc.substring(idx + 1, loc.length - 1).trim();
        return { name, area };
    }
    return { name: loc, area: '' };
}
