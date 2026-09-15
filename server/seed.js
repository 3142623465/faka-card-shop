/**
 * seed.js - 种子数据
 * 首次启动（数据库为空）时自动写入演示数据；也可手动执行 node server/seed.js 重建。
 */
const db = require('./db');
const util = require('./util');

function build() {
  const d = db.emptyDb();
  const now = util.now();
  const id = (entity) => {
    d.seq[entity] = (d.seq[entity] || 0) + 1;
    return d.seq[entity];
  };

  /* ---------- 站点设置 ---------- */
  d.settings = {
    siteName: '秒发卡',
    slogan: '卡密秒发 · 售后无忧',
    logo: '/img/logo.svg',
    icp: '赣ICP备00000000号',
    contactPhone: '400-000-0000',
    contactQQ: '800000000',
    contactWechat: 'miaofaka',
    payWechat: true,
    payAlipay: true,
    paySandbox: true,
    wechatMchId: '',
    wechatApiKey: '',
    wechatAppId: '',
    wechatCertPath: '',
    wechatSerialNo: '',
    wechatPrivateKey: '',
    wechatPlatformCert: '',
    alipayAppId: '',
    alipayPrivateKey: '',
    alipayPublicKey: '',
    alipayGateway: 'openapi.alipay.com',
    xunhuEnabled: false,
    xunhuAppId: '',
    xunhuAppSecret: '',
    xunhuGateway: 'https://api.xunhupay.com/payment/do.html',
    pointsRate: 1,            // 1 元 = 1 积分
    registerPoints: 50,       // 注册赠送积分
    autoConfirmDays: 7,       // 发货后自动确认收货天数
    pendingCancelMinutes: 30, // 未支付自动取消分钟
    hotKeywords: ['话费充值', '视频会员', '游戏点券', '激活码', '音乐会员', 'Steam'],
    guidePages: [
      { title: '海量卡密', desc: '游戏点卡、话费、会员、激活码应有尽有', icon: 'gift' },
      { title: '自动发货', desc: '付款成功，卡密立即到账，无需等待', icon: 'zap' },
      { title: '安全可靠', desc: '正品保障，7×24 小时在线客服', icon: 'shield' }
    ],
    defaultAvatar: '/img/avatar.svg',
    adminUsername: 'admin',
    adminPasswordHash: util.hashPassword('admin123')
  };

  /* ---------- 分类（两级） ---------- */
  function cat(name, icon, parentId, sort) {
    const c = { id: id('categories'), name, icon, parentId: parentId || null, sort: sort || 0, status: 1 };
    d.categories.push(c);
    return c;
  }
  const c1 = cat('游戏充值', 'game', null, 1);
  cat('王者荣耀', '', c1.id, 1);
  cat('和平精英', '', c1.id, 2);
  cat('英雄联盟', '', c1.id, 3);
  cat('Steam 点卡', '', c1.id, 4);
  const c2 = cat('视频会员', 'video', null, 2);
  cat('爱奇艺', '', c2.id, 1);
  cat('腾讯视频', '', c2.id, 2);
  cat('优酷', '', c2.id, 3);
  cat('哔哩哔哩', '', c2.id, 4);
  const c3 = cat('音乐会员', 'music', null, 3);
  cat('QQ 音乐', '', c3.id, 1);
  cat('网易云音乐', '', c3.id, 2);
  const c4 = cat('话费充值', 'phone', null, 4);
  cat('移动话费', '', c4.id, 1);
  cat('联通话费', '', c4.id, 2);
  cat('电信话费', '', c4.id, 3);
  const c5 = cat('软件激活', 'software', null, 5);
  cat('Windows', '', c5.id, 1);
  cat('Office', '', c5.id, 2);
  const c6 = cat('直播娱乐', 'live', null, 6);
  cat('抖音直播', '', c6.id, 1);
  cat('其他卡密', '', c6.id, 2);

  /* ---------- 商品 ---------- */
  function product(categoryId, name, subtitle, price, originalPrice, type, opts = {}) {
    const p = {
      id: id('products'),
      categoryId,
      name, subtitle,
      price, originalPrice,
      images: opts.images || ['/img/p' + (1 + (d.products.length % 8)) + '.svg'],
      type,                                    // auto 自动发货 / manual 手动发货
      stock: type === 'manual' ? (opts.stock || 0) : 0,
      detail: opts.detail || '',
      isHot: !!opts.isHot,
      sort: opts.sort || 0,
      status: 1,
      keywords: opts.keywords || '',
      cardNote: opts.cardNote || '',
      cardPrefix: opts.cardPrefix || '',
      cardCodeLen: opts.cardCodeLen || 16,
      cardSecretLen: opts.cardSecretLen || 8,
      cardCharset: opts.cardCharset || 'alnum',
      sales: opts.sales || 0,
      createdAt: now - Math.floor(Math.random() * 30) * 86400
    };
    d.products.push(p);
    return p;
  }

  const catId = (name) => (d.categories.find((c) => c.name === name) || {}).id;

  const p1 = product(catId('王者荣耀'), '王者荣耀点券 1000点券 直充', '王者点券自动到账，秒发秒到', 98, 100, 'auto', { isHot: 1, sort: 1, sales: 356, keywords: '王者荣耀 点券 充值', cardNote: '卡密为兑换码，需在官网兑换后到账', cardPrefix: 'WZ', cardCodeLen: 14 });
  product(catId('王者荣耀'), '王者荣耀点券 500点券 直充', '小面额点券，充得快', 50, 50, 'auto', { sort: 2, sales: 212, keywords: '王者 点券', cardPrefix: 'WZ', cardCodeLen: 14 });
  product(catId('和平精英'), '和平精英 UC 1000 直充', '和平精英服饰币卡密', 95, 100, 'auto', { isHot: 1, sort: 3, sales: 288, keywords: '和平精英 UC', cardPrefix: 'HP', cardCodeLen: 14 });
  product(catId('Steam 点卡'), 'Steam 50 美元充值卡', '美区 Steam 充值卡密，全球通用码', 345, 360, 'auto', { isHot: 1, sort: 4, sales: 168, keywords: 'steam 充值', cardNote: '兑换地址 store.steampowered.com/account/redeem', cardPrefix: 'ST', cardCodeLen: 15 });
  product(catId('爱奇艺'), '爱奇艺黄金 VIP 月卡', '爱奇艺黄金会员，手机/电脑/平板通用', 19.9, 25, 'auto', { sort: 5, sales: 430, keywords: '爱奇艺 会员', cardPrefix: 'IQ', cardCodeLen: 16 });
  product(catId('腾讯视频'), '腾讯视频 VIP 月卡', '腾讯视频会员月卡，全端通用', 20, 25, 'auto', { isHot: 1, sort: 6, sales: 520, keywords: '腾讯视频 会员', cardPrefix: 'TX', cardCodeLen: 16 });
  product(catId('优酷'), '优酷 VIP 月卡', '优酷会员月卡，直充到账', 15, 19.9, 'auto', { sort: 7, sales: 190, keywords: '优酷 会员', cardPrefix: 'YK', cardCodeLen: 16 });
  product(catId('哔哩哔哩'), '哔哩哔哩大会员月卡', 'B 站大会员，高清番剧任看', 22, 25, 'auto', { sort: 8, sales: 240, keywords: 'b站 大会员', cardPrefix: 'BIL', cardCodeLen: 16 });
  product(catId('QQ 音乐'), 'QQ音乐豪华绿钻月卡', '豪华绿钻，畅听无损音乐', 12, 15, 'auto', { sort: 9, sales: 310, keywords: 'qq音乐 绿钻', cardPrefix: 'QM', cardCodeLen: 16 });
  product(catId('网易云音乐'), '网易云音乐黑胶VIP月卡', '黑胶 VIP，高品质音乐', 10, 12.8, 'auto', { sort: 10, sales: 275, keywords: '网易云 黑胶', cardPrefix: 'WY', cardCodeLen: 16 });
  product(catId('移动话费'), '中国移动 100 元话费慢充', '慢充 24 小时内到账，部分地区可快充', 98.5, 100, 'auto', { isHot: 1, sort: 11, sales: 680, keywords: '移动 话费', cardNote: '虚拟号码充值，请确认手机号归属地', cardPrefix: 'YD', cardCodeLen: 18, cardCharset: 'num' });
  product(catId('联通话费'), '中国联通 50 元话费慢充', '联通话费慢充，全国通用', 49, 50, 'auto', { sort: 12, sales: 410, keywords: '联通 话费', cardPrefix: 'LT', cardCodeLen: 18, cardCharset: 'num' });
  product(catId('Windows'), 'Windows 10 专业版激活码', '正版零售密钥，永久激活', 30, 199, 'auto', { sort: 13, sales: 156, keywords: 'windows 激活码', cardNote: '仅支持 Windows 10 专业版，不包安装', cardPrefix: 'WIN', cardCodeLen: 20 });
  product(catId('Office'), 'Office 365 家庭版 一年订阅', '正版订阅，支持 6 人共用', 248, 498, 'auto', { sort: 14, sales: 98, keywords: 'office 365', cardNote: '订阅码需绑定微软账号', cardPrefix: 'OF', cardCodeLen: 20 });
  product(catId('抖音直播'), '抖音直播币 1000 钻', '抖音直播打赏钻石，自动充值', 95, 100, 'auto', { sort: 15, sales: 134, keywords: '抖音 直播币', cardPrefix: 'DY', cardCodeLen: 16, cardCharset: 'num' });
  product(catId('其他卡密'), '京东E卡 100 元面值', '京东自营 E 卡卡密，官方直发', 99, 100, 'manual', { sort: 16, sales: 88, keywords: '京东 e卡', stock: 66, cardNote: '手动发货，拍下后 24 小时内联系客服领取' });

  /* ---------- 卡密（自动发货商品） ---------- */
  for (const p of d.products.filter((x) => x.type === 'auto')) {
    const n = p.sales > 300 ? 300 : (p.sales > 150 ? 200 : 120);
    for (let i = 0; i < n; i++) {
      d.cards.push({
        id: id('cards'), productId: p.id,
        code: util.genCardCode(p, i),
        secret: util.genCardSecret(p),
        status: 'unused', orderId: 0, usedAt: 0, createdAt: now
      });
    }
  }

  /* ---------- 轮播图 ---------- */
  d.banners = [
    { id: id('banners'), title: '新用户专享 50 积分', image: '/img/banner1.svg', linkType: 'none', link: '', sort: 1, status: 1 },
    { id: id('banners'), title: '话费充值低至 9.8 折', image: '/img/banner2.svg', linkType: 'category', link: String(catId('话费充值')), sort: 2, status: 1 },
    { id: id('banners'), title: '视频会员卡密直发', image: '/img/banner3.svg', linkType: 'category', link: String(catId('视频会员')), sort: 3, status: 1 }
  ];

  /* ---------- 优惠券 ---------- */
  d.coupons = [
    { id: id('coupons'), name: '新人专享满 50 减 10', type: 'fullcut', threshold: 50, amount: 10, discount: 1, total: 500, claimed: 0, startAt: now - 86400, endAt: now + 30 * 86400, pointsCost: 0, status: 1 },
    { id: id('coupons'), name: '满 200 减 30', type: 'fullcut', threshold: 200, amount: 30, discount: 1, total: 300, claimed: 0, startAt: now - 86400, endAt: now + 30 * 86400, pointsCost: 0, status: 1 },
    { id: id('coupons'), name: '9.5 折券（满 100 可用）', type: 'discount', threshold: 100, amount: 0, discount: 0.95, total: 200, claimed: 0, startAt: now - 86400, endAt: now + 15 * 86400, pointsCost: 100, status: 1 }
  ];

  /* ---------- FAQ ---------- */
  d.faqs = [
    { id: id('faqs'), category: '发货问题', question: '付款后多久发货？卡密在哪里查看？', answer: '本站商品均为自动发货：付款成功后卡密立即发放，请到「我的订单 → 订单详情 → 卡密信息」查看并复制使用。手动发货商品由商家在 24 小时内发货。', sort: 1 },
    { id: id('faqs'), category: '发货问题', question: '卡密无法使用或已被使用怎么办？', answer: '请先在订单详情中核对卡密是否复制完整。若仍无法使用，请在「订单详情 → 申请售后」中提交退货退款申请，并上传凭证图片，管理员会尽快处理。', sort: 2 },
    { id: id('faqs'), category: '售后问题', question: '支持退款吗？如何申请？', answer: '支持。在订单详情页点击「申请售后」，选择「仅退款」或「退货退款」，填写原因并上传凭证后提交，管理员会在 24 小时内处理。', sort: 3 },
    { id: id('faqs'), category: '售后问题', question: '退款后多久到账？', answer: '售后审核通过后，款项将原路退回（模拟环境即时到账）。到账时间取决于支付渠道。', sort: 4 },
    { id: id('faqs'), category: '账户问题', question: '忘记密码怎么办？', answer: '在登录页点击「找回密码」，通过手机号验证码验证后即可重置密码。', sort: 5 },
    { id: id('faqs'), category: '优惠券', question: '优惠券怎么领取和使用？', answer: '进入「我的 → 优惠券 → 领券中心」领取优惠券，结算时勾选符合条件的优惠券即可抵扣。', sort: 6 },
    { id: id('faqs'), category: '积分会员', question: '积分如何获得？会员等级怎么提升？', answer: '购物实付金额按 1 元 = 1 积分累计，注册赠送 50 积分。累计消费达到 500/2000/5000/10000 元分别升级白银/黄金/钻石/至尊会员。', sort: 7 },
    { id: id('faqs'), category: '其他', question: '联系客服的方式有哪些？', answer: '您可通过「客服中心」在线对话（支持自动回复与人工转接）、提交工单，或拨打客服电话、添加客服微信/QQ 联系我们。', sort: 8 }
  ];

  /* ---------- 测试用户（demo / 123456） ---------- */
  d.users.push({
    id: id('users'), phone: '', email: 'demo@example.com',
    passwordHash: util.hashPassword('123456'),
    nickname: '演示用户', avatar: '/img/avatar.svg', gender: '男', birthday: '1998-06-18',
    points: 100, level: 1, levelName: '普通会员', totalSpend: 0,
    status: 1, needBind: false, isThird: false,
    createdAt: now - 10 * 86400, lastLoginAt: now - 2 * 86400
  });
  d.pointsLogs.push({
    id: id('pointsLogs'), userId: 1, change: 100, balance: 100,
    type: 'earn', desc: '测试账号初始积分', createdAt: now - 10 * 86400
  });
  d.messages.push({
    id: id('messages'), userId: 1, type: 'system',
    title: '欢迎加入秒发卡', content: '亲爱的演示用户，欢迎来到秒发卡！本站所有卡密均为自动发货，付款后立即到账。测试账号密码：123456',
    isRead: 0, createdAt: now - 10 * 86400
  });
  d.addresses.push({
    id: id('addresses'), userId: 1, name: '张三', phone: '13900001111',
    region: '江西省 赣州市 南康区', detail: '龙岭镇测试路 1 号', isDefault: 1, createdAt: now - 5 * 86400
  });

  return d;
}

function run() {
  const d = db.load();
  if (d.settings && process.argv[2] !== '--force') {
    console.log('[seed] 数据库已存在，跳过初始化。如需重建：node server/seed.js --force');
    return;
  }
  const fresh = build();
  require('fs').writeFileSync(db.DB_FILE, JSON.stringify(fresh, null, 2), 'utf8');
  console.log('[seed] 种子数据初始化完成：');
  console.log('  - 管理后台：http://localhost:3000/admin.html  账号 admin / 密码 admin123');
  console.log('  - 用户端  ：http://localhost:3000/index.html  测试账号 demo@example.com / 123456');
}

if (require.main === module) run();

module.exports = { build };
