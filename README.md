# 发卡网系统（324云系统 / Card-Shop）

一套**可本地部署、开箱即用**的发卡网系统：完整用户端（移动端风格 SPA）+ 完整管理后台 + 分站分销后台。技术栈：Node.js + Express + 原生 JS 前端，支持 **本地 JSON 文件**与 **MongoDB** 双存储，零构建、零外部 CDN、可离线运行。内置 PWA（手机可直接安装为 APP）。

---

## 一、功能清单

### 用户端（手机/PC 浏览器访问）
- **账号体系**：邮箱验证码注册/登录、邮箱+密码登录、邮箱验证码找回密码、图形验证码防机器人、60 秒发送限频、异地登录检测与安全提醒、改密、注销
- **首页**：轮播 Banner（可跳转分类）、快捷宫格、全局搜索（历史/热搜）、热门推荐瀑布流
- **分类/商品**：两级分类、综合/销量/价格/新品筛选、商品详情（图轮播/库存/收藏/分享）
- **交易链路**：购物车（勾选/批量/实时合计）→ 结算（地址/优惠券/费用明细）→ 支付（微信/支付宝/虎皮椒真实渠道 + 模拟支付 + **手动转账收款**）→ **自动发货卡密实时展示 + 一键复制** → 订单管理（6 状态/取消/确认收货/售后/物流）
- **手动转账支付**：后台开启后，买家可选「手动转账」→ 扫码付款到商家个人微信/支付宝 → 上传付款凭证 → 商家确认收款 → 自动发卡（无支付接口也能卖货）
- **个人中心**：会员等级（5 级成长体系）、积分（消费返利/兑换余额或优惠券/明细）、收藏、地址、资料编辑、头像上传
- **客服中心**：在线对话（关键词自动回复 + 轮询）、工单系统、FAQ 分类搜索
- **分站/分销**：三级架构（总站 → 专业分站 → 普通分站），用户可自助开通/升级分站（余额扣费，价格由上级设置），分站可上架总站商品（售价不得低于上级同款价，差价计入分站余额），独立分站后台 `/branch.html`
- **消息通知**：系统/订单/活动分类、未读红点、全部已读
- **APP 化**：PWA 支持，手机浏览器打开后「添加到主屏幕 / 安装应用」

### 后台管理端（PC 浏览器访问）
- **数据概览**：今日/累计销售额、订单数、用户数、库存卡密、待办、近 7 天趋势、热销 TOP5、低库存预警
- **商品管理**：CRUD、上下架、批量加卡密（文本多行/Excel/CSV 导入/自动生成，同批次自动去重）、卡密列表（未用/已用/全部）
- **分类 / 轮播 / 优惠券 / FAQ**：完整 CRUD（优惠券支持满减、折扣、积分兑换、时间倒置校验）
- **订单管理**：6 状态筛选、搜索、详情（含卡密）、手动发货、确认收款、强制退款（自动恢复卡密/库存/返还优惠券）、**一键导出 CSV**（按筛选条件）
- **售后管理**：同意退款 / 驳回（复用退款逻辑）
- **用户管理**：搜索、禁用踢下线、调积分、调余额、改密码
- **分站管理**：开通/禁用分站、设置分站开通价格、查看下级分站、分销统计
- **客服**：在线对话、工单处理、消息广播
- **系统设置**：站点信息、支付开关与密钥、积分比例、自动取消/确认参数、管理员改密

---

## 二、本地部署

### 环境要求
- Node.js ≥ 16（推荐 18+）
- 无需数据库即可运行（数据存 `data/db.json`）；云部署可选用 MongoDB

### 快速启动

**Windows**：双击 `启动服务.bat`（自动安装依赖并启动）；或双击 `后台启动.vbs`（无黑窗口后台运行）

**手动方式**
```bash
npm install      # 安装依赖（只需一次）
npm start        # 启动服务，默认端口 3000
```

### 访问地址与默认账号

| 入口 | 地址 |
|---|---|
| 用户端 | http://localhost:3000/index.html |
| 管理后台 | http://localhost:3000/admin.html |
| 分站后台 | http://localhost:3000/branch.html |

| 角色 | 账号 | 密码 |
|---|---|---|
| 管理后台 | `admin` | `admin123`（部署后请立即修改） |

> 首次启动会生成演示数据（含演示账号 `demo@example.com / 123456`、16 个种子商品与 3440 张随机卡密），用于本地体验。**上线部署前必须执行 `node scripts/prepare-production.js` 清空全部演示/测试数据**（仅保留站点配置），避免假卡密对外出售。

> 端口修改：`PORT=8080 npm start`

---

## 三、环境变量与敏感配置

项目通过 `.env` 文件或平台环境变量注入敏感配置（`server/config.js` 已移除一切明文密钥）。复制 `.env.example` 为 `.env` 填写：

| 变量 | 说明 |
|---|---|
| `PORT` | 服务端口，默认 3000 |
| `MONGODB_URI` | MongoDB 连接串；留空则使用本地 JSON 文件存储 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | QQ 邮箱 SMTP（发验证码/找回密码邮件），授权码从 QQ 邮箱设置获取 |
| `NODE_ENV` | 设为 `production` 后自动阻断验证码 devCode 直显 |
| `ALLOW_DEVCODE` | 仅内部调试：生产模式显式放行 devCode（用完必须关闭） |

支付密钥（微信/支付宝/虎皮椒）既可在后台「系统设置」填写，也支持环境变量注入（`WX_APPID`、`WX_PRIVATE_KEY`、`ALI_APP_ID`、`ALI_PRIVATE_KEY`、`XUNHU_APPID`、`XUNHU_APPSECRET` 等，见 `server/config.js`）。

> 安全说明：`config.js`、`.env`、`_token.txt` 等均已加入 `.gitignore`，不会随代码提交；生产环境务必通过平台环境变量注入密钥（对应历史缺陷 H-2）。

---

## 四、本地验证码说明

开发模式（未设置 `NODE_ENV=production`）下，邮箱验证码以 `devCode` 字段**直显返回**（响应中的 `devCode` 即 6 位验证码，页面自动填入即可），便于本地调试。生产模式自动阻断直显（对应缺陷 M-6）。

---

## 五、数据管理

- 数据文件：`data/db.json`（首次启动自动生成演示数据；每天首次启动自动备份到 `backups/`，保留 14 天）
- **上线部署前清理（必须执行）**：`node scripts/prepare-production.js` —— 保留站点配置，清空商品/分类/卡密（含随机假卡密）/演示账号/优惠券/FAQ/轮播等全部业务数据，重置 id 计数器；执行前自动备份
- **保留站点设置并重建演示数据（仅开发/演示用）**：`node scripts/reset-demo-data.js`（自动备份原数据）
- 手动备份：`node scripts/backup-db.js`
- 错误日志：`logs/error-YYYYMMDD.log`（自动按天滚动）

---

## 六、项目结构

```
card-shop/
├── api/index.js            # Vercel Serverless 入口（含 rawBody 捕获，微信回调验签依赖）
├── server/
│   ├── server.js           # 服务入口（.env 加载、安全响应头、自动备份、定时任务、日志）
│   ├── db.js               # 数据层（JSON 文件 / MongoDB 双模式，防抖落盘）
│   ├── util.js             # 工具（scrypt 密码哈希、加密安全随机卡密、HTML 过滤、分页）
│   ├── auth.js             # 登录态中间件（user/admin/branch 三角色）
│   ├── seed.js             # 演示数据种子（16 商品 / 23 分类 / 3440 卡密，库存已同步）
│   ├── config.js           # 配置（仅读环境变量，无明文密钥）
│   ├── logger.js           # 轻量日志模块（按天滚动）
│   ├── settle.js           # 支付成功结算（扣库存→发卡→积分→消息，幂等保护）
│   ├── payments.js         # 微信 Native / 支付宝适配器（AES-256-GCM 解密、RSA2 验签）
│   ├── xunhu.js            # 虎皮椒支付适配器
│   ├── sms.js / mail.js / captcha.js   # 短信/邮件/图形验证码
│   ├── branch-sign.js      # 分站邀请/价格校验
│   └── routes/             # auth / shop / user / admin / pay / branch
├── public/                 # 前端（index.html / admin.html / branch.html + js/css/img + PWA）
├── scripts/                # reset-demo-data.js / backup-db.js / 测试脚本等
├── test-reports/           # 自动化测试脚本与测试报告（api-test-round3.js 为当前主回归套件）
├── data/                   # 运行时数据库（自动生成，已 gitignore）
├── uploads/                # 运行时上传目录（自动创建，已 gitignore）
├── .env.example            # 环境变量模板（复制为 .env 填写）
├── 启动服务.bat / 后台启动.vbs
└── vercel.json / render.yaml  # 云部署配置
```

---

## 七、核心 API 摘要

接口前缀：`/api`

| 模块 | 接口 |
|---|---|
| 认证 | `POST /auth/send-email-code`（注册/登录/找回/绑定场景）`POST /auth/register-email` `POST /auth/login`（账号+密码+图形验证码，管理员同入口）`POST /auth/reset-email-code` `GET /auth/captcha` |
| 商城 | `GET /shop/banners` `/shop/categories` `/shop/products` `/shop/products/:id` `/shop/hot-keywords` `/shop/faqs` `/shop/coupons` `/shop/site` `/shop/branch-shop` |
| 用户 | `GET/POST/PUT/DELETE /user/addresses` `GET/POST/DELETE /user/favorites/:pid` `GET/POST/PUT/DELETE /user/cart` `POST /user/orders` `POST /user/orders/:id/pay`（simulate/manual/wechat/alipay/xunhu）`POST /user/orders/:id/cancel|confirm|aftersale|pay-proof` `GET /user/orders` `GET /user/points-logs` `GET/POST /user/tickets` `GET/POST /user/chat` `POST /user/open-branch` |
| 分站 | `POST /branch/login` `GET /branch/products` `POST /branch/products`（上架，含加价下限校验）`GET /branch/orders` 等 |
| 管理 | `GET /admin/stats` `GET /admin/orders` `GET /admin/orders/export`（CSV 导出）商品/分类/卡密/订单/售后/用户/优惠券/轮播/FAQ/工单/消息/设置全套 CRUD |

认证方式：`Authorization: Bearer <token>`（用户 `token` / 管理 `admin_token` / 分站 `branch_token`）

---

## 八、自动测试与回归

```bash
# 主回归套件（107 项断言，覆盖公开/认证/用户/管理/分站/安全/手动支付，适配邮箱体系）
node test-reports/api-test-round3.js

# 手动支付专项（37 项，含 H-3 回归：确认收款→自动发卡）
node test-reports/api-test-manual-pay.js
```

> `test-reports/api-test-{public,user,admin,branch,security}.js` 为早期（手机号体系）历史脚本，仅作存档；请以 round3 + manual-pay 为准。测试会产生临时数据，请在测试库执行，结束后可用 `node scripts/reset-demo-data.js` 一键还原干净演示数据。

---

## 九、云部署

> **上线前（无论何种部署方式）务必执行 `node scripts/prepare-production.js`**，清空演示商品、随机假卡密与演示账号，仅保留站点配置；随后在后台自行创建真实商品并导入真实卡密。

### Vercel（Serverless，推荐前端体验）
1. 推送代码到 GitHub，Vercel 导入仓库（框架预设 Other，构建命令 `npm run build`，输出目录 `public`）
2. 环境变量：`MONGODB_URI`（必填，数据持久化）、`SMTP_USER`/`SMTP_PASS`、`NODE_ENV=production`
3. `vercel.json` 已配置 API 路由与函数超时（30s），无需改动

### Render（Web Service）
1. `render.yaml` 已提供一键部署模板，填入你的 GitHub 仓库地址
2. 环境变量：`MONGODB_URI`（Render 后台填写）、`SMTP_USER`/`SMTP_PASS`

### 传统服务器（宝塔 / PM2 + Nginx）
1. `npm install --production && pm2 start server/server.js --name card-shop`
2. Nginx 反向代理到 3000 端口，配置 HTTPS（回调与 PWA 需要）
3. 环境变量同 `.env.example`

> 生产模式（`NODE_ENV=production`）会自动阻断验证码 devCode 直显；未注入 `SMTP_PASS` 时会给出安全警告。

---

## 十、注意事项

- 支付支持「真实渠道 + 模拟回退」：后台填全微信/支付宝/虎皮椒参数后走真实支付；未配置时回退模拟支付（下单即成功、自动发卡），本地演示零成本
- **微信支付回调验签依赖原始请求体**：本地 `server.js` 与 Vercel 入口 `api/index.js` 均已实现 `rawBody` 捕获；未配置平台证书时回调会被拒绝（不会免费发货）
- 密码使用 **scrypt** 慢哈希存储；卡密/订单号使用 `crypto.randomBytes` 加密安全随机
- 数据文件为本地 JSON 时，多实例部署请勿共享同一数据目录；生产建议 MongoDB
- 真实支付回调必须在公网可访问（HTTPS 最佳）
