/* test-cards.js - 卡密管理增强回归：连续编号生成 / Excel导入 / CSV导出 / 随机生成 */
const BASE = 'http://localhost:3000/api';
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { passed++; console.log('PASS ' + name + (extra ? ' ' + extra : '')); } else { failed++; console.log('FAIL ' + name + (extra ? ' ' + extra : '')); } };

async function j(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json();
}
async function raw(path, token) {
  const r = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, buf, text: buf.toString('utf8') };
}

(async () => {
  const cap = await j('/auth/captcha');
  const login = await j('/auth/login', { method: 'POST', body: { email: 'admin', password: 'admin123', captchaToken: cap.data.token, captchaCode: cap.data.devCode } });
  const tk = login.data && login.data.token;
  ok('admin 登录', !!tk);

  // 1) 创建测试商品（自动发货）
  const cp = await j('/admin/products', { method: 'POST', token: tk, body: { categoryId: 1, name: '__test-cards__', price: 1, type: 'auto', status: 1, cardCodeLen: 16, cardSecretLen: 8, cardCharset: 'alnum' } });
  const pid = cp.data && cp.data.id;
  ok('创建测试商品 id=' + pid, !!pid);

  // 2) 连续编号自动生成：前缀 WZ3345ABCD 起始 678 数量 100
  const gen = await j('/admin/products/' + pid + '/cards', { method: 'POST', token: tk, body: { autoGenerate: true, count: 100, prefix: 'WZ3345ABCD', startNo: 678 } });
  ok('连续编号生成 100 条', gen.data && gen.data.added === 100, 'added=' + (gen.data && gen.data.added));
  // 分页上限 50，翻页拉全量验证
  const p1 = await j('/admin/products/' + pid + '/cards?status=unused&page=1&size=50', { token: tk });
  const p2 = await j('/admin/products/' + pid + '/cards?status=unused&page=2&size=50', { token: tk });
  const cards = [...p1.data.list, ...p2.data.list];
  ok('分页拉全 100 条', p1.data.total === 100 && cards.length === 100, 'total=' + p1.data.total);
  const seqCodes = cards.filter((c) => c.code.startsWith('WZ3345ABCD')).map((c) => c.code);
  const seqNums = seqCodes.map((c) => parseInt(c.replace('WZ3345ABCD', ''))).sort((a, b) => a - b);
  ok('卡号从 678 连续递增', seqNums.length === 100 && seqNums[0] === 678 && seqNums[99] === 777, '678..' + seqNums[99]);
  const unique = new Set(seqCodes).size;
  ok('卡号各不相同', unique === 100);
  ok('密钥已随机生成', cards.filter((c) => c.secret).length === 100);
  ok('库存=100', cards.length === 100);

  // 3) Excel 导入（构造 xlsx buffer -> base64）
  const XLSX = require('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['卡号', '密钥'],
    ['IMPORT001', 'sec001'],
    ['IMPORT002', 'sec002'],
    ['IMPORT001', 'dup-ignore'],   // 重复应被跳过
    ['', 'empty-row']               // 空卡号跳过
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const imp = await j('/admin/products/' + pid + '/cards/import', { method: 'POST', token: tk, body: { data: buf.toString('base64'), filename: 'cards.xlsx' } });
  ok('xlsx 导入 2 条/跳 1 重复/跳 1 空', imp.data && imp.data.added === 2 && imp.data.duplicated === 1, JSON.stringify(imp.data));
  const g2 = await j('/admin/products/' + pid + '/cards?status=all&page=1&size=200', { token: tk });
  ok('导入后共 102 条', g2.data.total === 102, 'total=' + g2.data.total);
  ok('库存同步 102', g2.data.unused === 102);

  // 4) CSV 导入
  const csv = '卡号,密钥\nCSV001,secA\nCSV002,secB\n';
  const impCsv = await j('/admin/products/' + pid + '/cards/import', { method: 'POST', token: tk, body: { data: Buffer.from(csv).toString('base64'), filename: 'cards.csv' } });
  ok('csv 导入 2 条', impCsv.data && impCsv.data.added === 2, JSON.stringify(impCsv.data));

  // 5) 导出 CSV（全部 / 未使用）
  const expAll = await raw('/admin/products/' + pid + '/cards/export?status=all', tk);
  ok('导出全部 200 状态=200', expAll.status === 200);
  ok('导出含 BOM 与表头', expAll.buf[0] === 0xEF && expAll.buf[1] === 0xBB && expAll.buf[2] === 0xBF && expAll.text.includes('卡号,密钥,状态,售出时间'), 'first3=' + JSON.stringify(expAll.buf.slice(0, 3).toString('hex')));
  ok('导出含连续编号卡', expAll.text.includes('WZ3345ABCD678'));
  ok('导出含导入卡', expAll.text.includes('CSV001'));
  const expUnused = await raw('/admin/products/' + pid + '/cards/export?status=unused', tk);
  ok('导出未使用筛选生效', expUnused.text.includes('未使用') && !expUnused.text.includes('已使用'));

  // 6) 随机生成仍正常（不带前缀）
  const rnd = await j('/admin/products/' + pid + '/cards', { method: 'POST', token: tk, body: { autoGenerate: true, count: 5 } });
  ok('随机生成 5 条', rnd.data && rnd.data.added === 5, JSON.stringify(rnd.data));
  const g3 = await j('/admin/products/' + pid + '/cards?status=unused&page=1&size=300', { token: tk });
  const rndCodes = g3.data.list.filter((c) => c.code.length === 16 && !c.code.startsWith('WZ') && !c.code.startsWith('IMPORT') && !c.code.startsWith('CSV'));
  ok('随机卡为 16 位', rndCodes.length === 5);

  // 7) 清理测试商品（连带卡密）
  const del = await j('/admin/products/' + pid, { method: 'DELETE', token: tk });
  ok('清理测试商品', del.code === 0);
  const g4 = await j('/admin/products/' + pid + '/cards?status=all', { token: tk });
  ok('商品删除后无卡密', g4.data.total === 0 || g4.data.list.length === 0);

  console.log('\n===== RESULT: ' + passed + ' passed / ' + failed + ' failed =====');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
