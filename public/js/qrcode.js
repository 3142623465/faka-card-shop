/**
 * qrcode.js - 极简 QR 码生成器（本地实现，无外部依赖）
 * 支持：Byte 模式、纠错等级 M、版本 1-20，输出 SVG
 * 用于微信 Native 支付扫码展示等场景
 */
(function (global) {
  'use strict';

  /* ---- 版本 1-20（ECC=M）RS 块结构：[[块数, 每块数据码字, 每块纠错码字], ...]（源自 ISO/IEC 18004 标准表） ---- */
  const EC_TABLE = {
    1: [[1, 16, 10]], 2: [[1, 28, 16]], 3: [[1, 44, 26]], 4: [[2, 32, 18]],
    5: [[2, 43, 24]], 6: [[4, 27, 16]], 7: [[4, 31, 18]], 8: [[2, 38, 22], [2, 39, 22]],
    9: [[3, 36, 22], [2, 37, 22]], 10: [[4, 43, 26], [1, 44, 26]], 11: [[1, 50, 30], [4, 51, 30]],
    12: [[6, 36, 22], [2, 37, 22]], 13: [[8, 37, 22], [1, 38, 22]], 14: [[4, 40, 24], [5, 41, 24]],
    15: [[5, 41, 24], [5, 42, 24]], 16: [[7, 45, 28], [3, 46, 28]], 17: [[10, 46, 28], [1, 47, 28]],
    18: [[9, 43, 26], [4, 44, 26]], 19: [[3, 44, 26], [11, 45, 26]], 20: [[3, 41, 26], [13, 42, 26]]
  };
  /* alignment 图案中心坐标（版本 2-20；v1 无；v2-6 仅右下角 1 个）*/
  const ALIGN = {
    2: [18], 3: [22], 4: [26], 5: [30], 6: [34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
    11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
    15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
    18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90]
  };

  /* GF(256) 本原多项式 */
  function buildGF() {
    const exp = new Array(512), log = new Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = x;
      log[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    return { exp, log };
  }
  const GF = buildGF();
  const gexp = GF.exp, glog = GF.log;

  function gfMul(a, b) { if (!a || !b) return 0; return gexp[(glog[a] + glog[b]) % 255]; }

  /** 生成 RS 生成多项式（纠错码），返回高次在前（monic，首项系数 1） */
  function rsGeneratorPoly(degree) {
    // 先构建低次在前：[常数项, ..., 最高次(1)]
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], gexp[i]);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly.reverse(); // 转为高次在前
  }

  /** 对一段数据计算纠错码 */
  function rsEncode(data, degree) {
    const gen = rsGeneratorPoly(degree);
    const rem = new Array(degree).fill(0);
    for (const b of data) {
      const factor = b ^ rem[0];
      rem.shift();
      rem.push(0);
      for (let j = 0; j < degree; j++) rem[j] ^= gfMul(gen[j + 1], factor);
    }
    return rem;
  }

  /** 选择最小版本（Byte 模式，ECC M） */
  function chooseVersion(dataLen) {
    for (let v = 1; v <= 20; v++) {
      const dataCap = EC_TABLE[v].reduce((s, b) => s + b[0] * b[1], 0);
      // 模式指示符 4bit + 字符计数 + 数据位（UTF-8 字节）
      const bits = 4 + (v <= 9 ? 8 : 16) + dataLen * 8;
      if (bits <= dataCap * 8) return v;
    }
    return -1;
  }

  const _te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  function toUTF8(s) { return _te ? _te.encode(String(s)) : Buffer.from(String(s), 'utf8'); }

  function buildData(version, data) {
    const u8 = toUTF8(data);
    const dataCap = EC_TABLE[version].reduce((s, b) => s + b[0] * b[1], 0) * 8;
    const bits = [];
    const pushBits = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    pushBits(0b0100, 4);                      // Byte 模式指示符
    pushBits(u8.length, version <= 9 ? 8 : 16); // 字符计数
    for (const b of u8) pushBits(b, 8);       // 数据
    pushBits(0, Math.min(4, dataCap - bits.length)); // 终止符（最多 4 个 0）
    while (bits.length % 8 !== 0) bits.push(0);      // 补零到字节边界
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
      bytes.push(v);
    }
    const blocks = EC_TABLE[version];
    const ecPerBlock = blocks[0][2];
    const total = blocks.reduce((s, b) => s + b[0] * (b[1] + b[2]), 0);
    const dataTotal = blocks.reduce((s, b) => s + b[0] * b[1], 0);
    // 填充到容量
    const pad = [0xec, 0x11];
    let i = 0;
    while (bytes.length < dataTotal) bytes.push(pad[i++ % 2]);
    // 分组
    const groups = [];
    for (const [count, dLen, ecLen] of blocks) {
      for (let k = 0; k < count; k++) groups.push({ data: bytes.splice(0, dLen), ec: null, ecLen });
    }
    for (const g of groups) g.ec = rsEncode(g.data, g.ecLen);
    // 交织数据 + 交织纠错
    const dataSeq = [], ecSeq = [];
    const maxD = Math.max(...groups.map((g) => g.data.length));
    const maxE = Math.max(...groups.map((g) => g.ec.length));
    for (let c = 0; c < maxD; c++) for (const g of groups) if (c < g.data.length) dataSeq.push(g.data[c]);
    for (let c = 0; c < maxE; c++) for (const g of groups) if (c < g.ec.length) ecSeq.push(g.ec[c]);
    const full = dataSeq.concat(ecSeq);
    while (full.length < total) full.push(0);
    return full;
  }

  /** 将数据位填入矩阵（之字形，放置时直接应用掩码；col<=6 时列对左移，最后为 (1,0)） */
  function placeData(matrix, size, dataBits, mask) {
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      const c0 = col <= 6 ? col - 1 : col; // 跳过 timing 列：6→5, 4→3, 2→1，末列对为 (1,0)
      const c1 = c0 - 1;
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (const x of [c0, c1]) {
          if (x < 0) continue;
          if (matrix[row][x] === null) {
            let dark = bitIdx < dataBits.length ? dataBits[bitIdx] === 1 : false;
            if (maskCond(mask, row, x)) dark = !dark;
            matrix[row][x] = dark;
            bitIdx++;
          }
        }
      }
      upward = !upward;
    }
  }

  /** 功能图形 */
  function placeFunctionPatterns(matrix, size, version) {
    const set = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) matrix[r][c] = v; };
    // Finder + 分隔符
    for (const [fr, fc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const inF = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        // 黑 = 外边框(1 圈) 或 中心 3×3；其余内部为白
        const v = inF && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(fr + r, fc + c, v);
      }
    }
    // Alignment（先于 timing：库的 setup 顺序为 probe → adjust → timing，timing 跳过已占格子）
    const alignPos = ALIGN[version] || [];
    if (alignPos.length) {
      for (const r of alignPos) for (const c of alignPos) {
        if (matrix[r][c] !== null) continue;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          set(r + dr, c + dc, dist !== 1);
        }
      }
    }
    // Timing（跳过已被 alignment/finder 占用的格子）
    for (let i = 8; i < size - 8; i++) {
      if (matrix[6][i] === null) set(6, i, i % 2 === 0);
      if (matrix[i][6] === null) set(i, 6, i % 2 === 0);
    }
    // Dark module
    set(size - 8, 8, true);
    // 版本信息（v7+）
    if (version >= 7) {
      const bits = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >> i) & 1) === 1;
        const a = Math.floor(i / 3), b = i % 3;
        set(size - 11 + b, a, bit);
        set(a, size - 11 + b, bit);
      }
    }
  }

  function versionBits(version) {
    let d = version;
    for (let i = 0; i < 12; i++) d = (d << 1) ^ ((d >> 11) * 0x1f25);
    return (version << 12) | d;
  }

  function formatBits(ecLevelBits, mask) {
    const data = (ecLevelBits << 3) | mask;
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    return ((data << 10) | rem) ^ 0x5412;
  }

  /** 放置格式信息（垂直 col8 + 水平 row8，dark module 固定为黑） */
  function placeFormat(matrix, size, fmt) {
    // vertical（col 8）
    for (let i = 0; i < 15; i++) {
      let r;
      if (i < 6) r = i;
      else if (i < 8) r = i + 1;
      else r = size - 15 + i;
      matrix[r][8] = ((fmt >> i) & 1) === 1;
    }
    // horizontal（row 8）
    for (let i = 0; i < 15; i++) {
      let c;
      if (i < 8) c = size - i - 1;
      else if (i < 9) c = 15 - i - 1 + 1; // i=8 → col 7
      else c = 15 - i - 1;                // i=9..14 → col 5..0
      matrix[8][c] = ((fmt >> i) & 1) === 1;
    }
    matrix[size - 8][8] = true; // dark module
  }

  /** 掩码条件（QR 标准 8 种掩码，参数 r=行 c=列） */
  function maskCond(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: return false;
    }
  }

  /** 罚分评估 */
  function penalty(matrix, size) {
    let score = 0;
    // 1) 行/列连续同色 ≥5
    const run = (list) => {
      let n = 1, s = 0;
      for (let i = 1; i < list.length; i++) {
        if (list[i] === list[i - 1]) n++;
        else { if (n >= 5) s += 3 + (n - 5); n = 1; }
      }
      if (n >= 5) s += 3 + (n - 5);
      return s;
    };
    for (let r = 0; r < size; r++) score += run(matrix[r]);
    for (let c = 0; c < size; c++) { const col = []; for (let r = 0; r < size; r++) col.push(matrix[r][c]); score += run(col); }
    // 2) 2×2 同色块
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = matrix[r][c];
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) score += 3;
    }
    // 3) 1011101 模式（前后各 4 白）
    const finder = [true, false, true, true, true, false, true];
    for (let r = 0; r < size; r++) {
      const row = matrix[r];
      for (let c = 0; c <= size - 7; c++) {
        if (finder.every((v, k) => row[c + k] === v)) {
          if ((c + 7 < size ? !row[c + 7] : false) && (c + 8 < size ? !row[c + 8] : false) && (c + 9 < size ? !row[c + 9] : false) && (c + 10 < size ? !row[c + 10] : false)) score += 40;
          if ((c - 1 >= 0 ? !row[c - 1] : false) && (c - 2 >= 0 ? !row[c - 2] : false) && (c - 3 >= 0 ? !row[c - 3] : false) && (c - 4 >= 0 ? !row[c - 4] : false)) score += 40;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r = 0; r <= size - 7; r++) {
        if (finder.every((v, k) => matrix[r + k][c] === v)) {
          if ((r + 7 < size ? !matrix[r + 7][c] : false) && (r + 8 < size ? !matrix[r + 8][c] : false) && (r + 9 < size ? !matrix[r + 9][c] : false) && (r + 10 < size ? !matrix[r + 10][c] : false)) score += 40;
          if ((r - 1 >= 0 ? !matrix[r - 1][c] : false) && (r - 2 >= 0 ? !matrix[r - 2][c] : false) && (r - 3 >= 0 ? !matrix[r - 3][c] : false) && (r - 4 >= 0 ? !matrix[r - 4][c] : false)) score += 40;
        }
      }
    }
    // 4) 暗模块占比
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (matrix[r][c]) dark++;
    const pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function bitArray(bytes) {
    const bits = [];
    for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    return bits;
  }

  /**
   * 生成 QR 矩阵（boolean 二维数组，不含 quiet zone），返回 { size, matrix, version, mask }
   */
  function make(text) {
    const u8 = toUTF8(text);
    const version = chooseVersion(u8.length);
    if (version < 0) throw new Error('内容过长，超出 QR 容量');
    const size = version * 4 + 17;
    const codewords = buildData(version, text);
    const dataBits = bitArray(codewords);

    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const m = Array.from({ length: size }, () => new Array(size).fill(null));
      placeFunctionPatterns(m, size, version);
      placeFormat(m, size, formatBits(0b00, mask)); // ECC M
      placeData(m, size, dataBits, mask);
      const score = penalty(m, size);
      if (!best || score < best.score) best = { matrix: m, mask, score, version, size };
    }
    return best;
  }

  /** 输出 SVG */
  function toSVG(text, opts) {
    const { size: block = 5, margin = 4, dark = '#000', light = '#fff' } = opts || {};
    const q = make(String(text));
    const dim = q.size + margin * 2;
    const cells = [];
    for (let r = 0; r < q.size; r++) {
      for (let c = 0; c < q.size; c++) {
        if (q.matrix[r][c]) cells.push(`${c + margin},${r + margin}`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim * block}" height="${dim * block}">` +
      `<rect width="100%" height="100%" fill="${light}"/>` +
      `<path d="${cells.map((p) => `M${p.split(',')[0]} ${p.split(',')[1]}h1v1h-1z`).join('')}" fill="${dark}"/>` +
      `</svg>`;
  }

  /** 输出 Data URL（用于 <img>） */
  function toDataURL(text, opts) {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(toSVG(text, opts))));
  }

  global.QRCode = { make, toSVG, toDataURL };
})(typeof window !== 'undefined' ? window : globalThis);
