# 发卡网系统（Card-Shop）

一套**可本地部署、开箱即用**的发卡网系统：完整用户端（移动端风格 SPA）+ 完整后台管理端，Node.js + Express + 原生 JS + JSON 文件数据库，零构建、零外部 CDN、可离线运行。已内置 **PWA（手机可直接安装为 APP）**，并附 APP 打包指引。

---

## 一、功能清单

### 用户端（手机/PC 浏览器访问）
- **启动引导**：首次安装 3 页引导页 → 品牌启动页（2 秒自动进入首页）
- **账号体系**：手机验证码登录（本地开发直接显示验证码）、密码登录、微信/QQ 一键登录（首次强制绑定手机）、注册、双渠道找回密码（手机验证码 / QQ 邮箱验证链接）、**异地登录检测与安全提醒**、改密、注销
- **首页**：轮播 Banner（可跳转）、4×2 快捷宫格、全局搜索（历史/热搜）、热门推荐瀑布流
- **分类/商品**：两级分类（左分栏）、综合/销量/价格/新品筛选、网格/列表切换、商品详情（图轮播/库存/收藏/**一键分享**）
- **交易链路**：购物车（勾选/批量/左滑删除/实时合计）→ 结算（地址/优惠券/费用明细）→ 微信/支付宝模拟支付 → **自动发货卡密实时展示 + 一键复制** → 订单管理（6 状态筛选/取消/确认收货/售后/物流）
- **个人中心**：会员等级（5 级成长体系）、积分（消费返利/兑换优惠券/明细）、收藏、地址、资料编辑、头像上传
- **客服中心**：在线对话（关键词智能自动回复 + 3 秒轮询接收客服消息）、工单系统、FAQ 分类搜索
- **分站/分销**：分三级（超级管理员 → 专业分站 → 普通分站），前端可直接开通/升级分站（专业/普通，价格由上级设置），注册账号即分站账号；分站可上架/下架总站商品（售价不得低于上级同款），分站管理内嵌于个人中心，另有独立分站后台 /branch.html
- **消息通知**：系统/订单/活动分类、未读红点、全部已读
- **系统设置**：账号安全（改密/注销）、推送开关、深色模式、清缓存、关于（协议/备案/联系方式）
- **APP 化**：PWA 支持，手机浏览器打开后可「添加到主屏幕 / 安装应用」，全屏独立运行、支持离线缓存（详见「八、APP 部署」）

### 后台管理端（PC 浏览器访问）
- **数据概览**：今日/累计销售额、订单数、用户数、库存卡密、待办、近 7 天趋势图、热销 TOP5、低库存预警
- **商品管理**：CRUD、上下架、批量加卡密（文本多行 / JSON / 自动生成）、卡密列表（未用/已用/全部）
- **分类 / 轮播 / 优惠券 / FAQ**：完整 CRUD，优惠券支持满减、折扣、积分兑换
- **订单管理**：6 状态筛选、搜索、详情（含卡密）、手动发货、强制退款（自动恢复卡密/库存/返还优惠券/扣回积分）
- **售后管理**：同意退款 / 驳回（复用退款逻辑）
- **用户管理**：搜索、禁用踢下线、调积分、改昵称
- **分站管理**：开通/禁用分站、设置专业/普通分站开通价格、查看下级分站、分站分销统计
- **客服**：在线对话（实时轮询回复）、工单处理、消息广播（全员/指定用户）
- **系统设置**：站点信息、支付开关、积分比例、自动取消/确认参数、管理员改密

---

## 二、部署方法（本地）

### 环境要求
- [Node.js](https://nodejs.org/) ≥ 14（推荐 16+）
- 无需任何数据库，数据保存在 `data/db.json`（JSON 文件）

### 快速启动

**Windows**：双击 `启动服务.bat`（自动安装依赖并启动）

**macOS / Linux**：在项目目录执行

```bash
chmod +x start.sh && ./start.sh
```

**手动方式**

```bash
# 1. 安装依赖（只需一次）
npm install

# 2. 启动服务
npm start
```

### 访问地址

| 入口 | 地址 |
|---|---|
| 用户端 | http://localhost:3000/index.html |
| 管理后台 | http://localhost:3000/admin.html |
| 分站后台 | http://localhost:3000/branch.html（分站管理员入口，个人中心内嵌管理同源） |

> 端口可通过环境变量修改：`PORT=8080 npm start`

### 默认账号

| 角色 | 账号 | 密码 |
|---|---|---|
| 管理后台 | `admin` | `admin123` |
| 测试用户 | `13800000000` | `123456`（含默认地址、100 积分） |

---

## 三、本地验证码说明

系统发短信接口在**本地环境自动降级为直显验证码**：调用「获取验证码」后，响应中的 `devCode` 字段即 6 位验证码，页面上直接填入即可（如验证码登录、注册、找回密码、绑定手机）。接入真实短信服务商后会自动切换为真实短信。

---

## 四、数据管理

- 数据文件：`data/db.json`（首次启动自动生成演示数据）
- 上传图片：`uploads/` 目录（自动创建）
- 重置为干净演示数据：停止服务后删除 `data/db.json`，或执行 `npm run seed`
- 强制重建种子：`node server/seed.js --force`

---

## 五、项目结构

```
card-shop/
├── server/                # 后端
│   ├── server.js          # 服务入口（Express，含回调 body 解析）
│   ├── db.js              # JSON 文件数据库（原子写、防抖落盘）
│   ├── util.js            # 通用工具（密码/令牌/卡密生成）
│   ├── auth.js            # 登录态中间件
│   ├── seed.js            # 演示数据种子
│   ├── backup-db.js        # 数据库备份（scripts/）
│   ├── settle.js          # 支付成功结算公共模块（扣库存→自动发卡→积分/消息）
│   ├── payments.js        # 真实支付适配器（微信 Native / 支付宝电脑网站，缺配置自动回退模拟）
│   ├── sms.js             # 真实短信适配器（阿里云/腾讯云，缺密钥自动回退本地直显）
│   ├── config.example.js  # 商户/短信配置样例（复制为 config.js 填写）
│   └── routes/            # 路由
│       ├── auth.js        # 注册/登录/找回/第三方/发送验证码
│       ├── shop.js        # 商城浏览（游客可访问）
│       ├── user.js        # 用户业务（购物车/订单/售后/客服…，含支付路由）
│       ├── pay.js         # 支付回调（微信 /api/pay/notify/wechat、支付宝 /api/pay/notify/alipay）
│       └── admin.js       # 管理后台接口
├── public/                # 前端
│   ├── index.html         # 用户端入口
│   ├── admin.html         # 管理后台入口
│   ├── manifest.webmanifest # PWA 应用清单（APP 安装配置）
│   ├── sw.js              # PWA Service Worker（离线缓存）
│   ├── css/               # 样式（base.css 用户端 / admin.css 后台）
│   ├── js/                # api.js / util.js / qrcode.js（自研二维码）/ app.js / admin.js
│   └── img/               # 本地 SVG 图标、占位图、APP 图标（icon-192/512.png）
├── scripts/gen-assets.js  # 图片资源生成脚本
├── data/                  # 运行时数据库（自动生成）
├── uploads/               # 运行时上传目录（自动创建）
└── 启动服务.bat / start.sh # 一键启动脚本
```

---

## 六、核心 API 摘要

接口前缀：`/api`

| 模块 | 接口 |
|---|---|
| 认证 | `POST /auth/send-code` `/auth/register` `/auth/login` `/auth/login-code` `/auth/third-login` `/auth/bind-phone` `/auth/reset` `/auth/send-reset-email` `/auth/reset-email` |
| 商城 | `GET /shop/banners` `/shop/categories` `/shop/products` `/shop/products/:id` `/shop/hot-keywords` `/shop/faqs` `/shop/coupons` `/shop/site` |
| 用户 | `GET/POST/PUT /user/addresses` `GET/POST/DELETE /user/favorites/:pid` `GET/POST/PUT/DELETE /user/cart` `POST /user/coupons/claim/:couponId` `POST /user/orders` `POST /user/orders/:id/pay`（支付成功自动发卡）`POST /user/orders/:id/cancel|confirm|aftersale` `GET /user/messages` `/user/points-logs` `/user/tickets` `/user/chat` |
| 管理 | `POST /admin/login` `GET /admin/stats` 商品/分类/卡密/订单/售后/用户/优惠券/轮播/FAQ/工单/对话/消息/设置全套 CRUD |

认证方式：`Authorization: Bearer <token>`（用户端 token 存 `localStorage.token`，管理端存 `localStorage.admin_token`）

---

## 七、注意事项

- 支付支持「真实支付 + 模拟回退」：在 `server/config.js` 填全微信/支付宝商户参数后自动走真实支付；未配置时回退**模拟支付**（下单即成功、自动发卡），本地演示零成本
- 短信支持「真实短信 + 本地直显回退」：填全阿里云/腾讯云短信密钥后真实发送；未配置时验证码以 `devCode` 直显
- 密码使用 SHA-256 加盐存储；请部署后第一时间修改管理员默认密码
- 数据文件为本地 JSON，多实例部署请勿共享同一数据目录
- 真实支付回调必须在公网可访问（HTTPS 最佳），否则商户平台无法通知到系统（详见「十一、服务器部署」）

---

## 八、APP 部署（手机安装 / 安卓打包）

系统已内置 PWA（Progressive Web App）支持，无需应用商店即可在手机上以「APP」形态运行，提供三种方式：

### 方式一：PWA 直接安装（推荐，最快）
1. 将系统部署到一台电脑或云服务器（`./start.sh` 启动）
2. 手机与服务器处于同一局域网时，浏览器打开 `http://<服务器IP>:3000/index.html`
3. 按浏览器提示安装：
   - **安卓 Chrome/Edge**：地址栏右侧出现「安装应用」图标，或菜单 →「安装应用 / 添加到主屏幕」
   - **iPhone Safari**：分享按钮 →「添加到主屏幕」
4. 安装后以**全屏独立窗口**运行，带 APP 图标（`发卡网`），核心页面支持离线打开

> PWA 要求 HTTPS 或 localhost。局域网 IP 访问若无法安装，可用内网穿透（如 cpolar、花生壳）或部署到服务器加 HTTPS（免费证书：Let's Encrypt）。

### 方式二：HBuilderX 云打包 APK（无需本地安卓环境）
1. 下载安装 [HBuilderX](https://www.dcloud.io/hbuilderx.html)（免费）
2. 新建 5+ App 项目（或 uni-app 项目），选择「WebView 模式」
3. 首页指向你的部署地址：`http://<服务器IP>:3000/index.html`（manifest.json → App常用其它设置 → 启动页面/入口）
4. 「发行 → 原生App-云打包」，使用公共测试证书即可生成 **APK 安装包**
5. 将 APK 发给手机直接安装

### 方式三：Capacitor 打包（标准 Android APK）
1. 安装 [Node.js](https://nodejs.org/) 与 [Android Studio](https://developer.android.com/studio)
2. 在项目目录执行：
   ```bash
   npm install @capacitor/core @capacitor/cli
   npx cap init 发卡网 com.example.cardshop --web-dir public
   npx cap add android
   npx cap sync
   ```
3. 用 Android Studio 打开 `android/` 目录 → Build → Build APK
4. 生成 `app-debug.apk` 可直接安装；正式发布需配置签名

> 无论哪种方式，后端 Node 服务都需保持运行（本地电脑 / 云服务器均可）。

---

## 九、接入真实微信 / 支付宝支付

系统已内置微信 Native 扫码支付与支付宝电脑网站支付，**无需改代码**，只需配置商户参数。

### 1. 复制配置样例并填写

```bash
cd card-shop/server
cp config.example.js config.js
vi config.js
```

### 2. 微信支付（扫码支付，V3 API）

在 `config.js` 的 `pay.wechat` 填入：

| 字段 | 获取方式 |
|---|---|
| `appid` | 公众号/开放平台 AppID（需与商户号关联） |
| `mchid` | 微信支付商户号 |
| `serialNo` | 商户 API 证书序列号（商户平台 → API 安全） |
| `privateKey` | 商户 API 私钥 `apiclient_key.pem` 的完整内容（PKCS8） |
| `apiV3Key` | APIv3 密钥（商户平台自行设置的 32 位随机串） |
| `platformCert` | 微信支付平台证书（用于回调验签；**留空则跳过验签，仅限内网调试**，生产必填） |
| `notifyUrl` | 回调地址，如 `https://你的域名/api/pay/notify/wechat`（留空自动取请求域名） |

填写完整后，收银台「确认支付」即展示**微信扫码二维码**（由内置自研 QR 生成器本地绘制，无需外网）。

### 3. 支付宝（电脑网站支付）

在 `pay.alipay` 填入：

| 字段 | 获取方式 |
|---|---|
| `appId` | 支付宝开放平台应用 AppID |
| `privateKey` | 应用私钥（RSA2，`-----BEGIN PRIVATE KEY-----` 开头） |
| `publicKey` | 支付宝公钥（开放平台 → 公钥管理） |
| `notifyUrl` | 回调地址，如 `https://你的域名/api/pay/notify/alipay` |

填写完整后，收银台「确认支付」即跳转**支付宝收银台**（iframe 内完成支付）。

### 4. 验证与回退

- 启动后登录用户端 → 下单 → 收银台选择渠道支付
- 真实渠道参数**不全**时，该渠道自动回退**模拟支付**（下单即成功、自动发卡），不影响演示与开发
- 真实下单失败（网络/证书问题）也会自动回退模拟，保证功能可用；服务日志会打印失败原因
- 所有字段均支持环境变量覆盖：`WX_APPID / WX_MCHID / WX_SERIAL_NO / WX_PRIVATE_KEY / WX_API_V3_KEY / WX_PLATFORM_CERT / WX_NOTIFY_URL / WX_RETURN_URL / ALI_APP_ID / ALI_PRIVATE_KEY / ALI_PUBLIC_KEY / ALI_NOTIFY_URL`

> 提示：微信 Native 需要已认证的服务号或开放平台移动应用；支付宝电脑网站支付需已签约产品。回调验签在未配置平台证书时跳过，**生产环境必须配置**并启用 HTTPS。

---

## 十、接入真实短信

系统已内置阿里云 / 腾讯云短信发送，**无需改代码**，只需在 `server/config.js` 的 `sms` 节配置密钥（二选一）：

### 阿里云短信

```js
sms: {
  aliyun: {
    accessKeyId: '你的AccessKey ID',
    accessKeySecret: '你的AccessKey Secret',
    signName: '发卡网',        // 已审核通过的短信签名
    templateCode: 'SMS_1234567890'  // 已审核通过的模板（含 ${code} 变量）
  }
}
```

### 腾讯云短信

```js
sms: {
  tencent: {
    secretId: '你的SecretId',
    secretKey: '你的SecretKey',
    sdkAppId: '1400123456',   // 短信应用 SDKAppID
    signName: '发卡网',
    templateId: '123456'      // 已审核通过的模板（含 {1} 变量）
  }
}
```

### 回退规则

- 未配置任何短信服务 → 验证码本地直显（响应 `devCode`），页面自动填入即可
- 配置了真实服务但发送失败 → 接口返回失败原因，页面提示检查配置；删除配置即恢复本地直显
- 环境变量覆盖：`ALI_SMS_AK / ALI_SMS_SK / ALI_SMS_SIGN / ALI_SMS_TMPL`、`TENCENT_SMS_ID / TENCENT_SMS_KEY / TENCENT_SMS_APPID / TENCENT_SMS_SIGN / TENCENT_SMS_TMPL`

---

## 十一、服务器部署与 HTTPS（生产环境）

### 方案一：宝塔面板（推荐新手，全程图形化）

1. 服务器安装宝塔面板，软件商店安装 **Node.js 版本管理器**（选 18+）与 **Nginx**
2. 上传项目到 `/www/wwwroot/card-shop`（**不含** `node_modules`、`data`、`uploads`）
3. SSH 执行：
   ```bash
   cd /www/wwwroot/card-shop
   npm install --production
   cp server/config.example.js server/config.js   # 填写商户/短信参数（可选）
   ```
4. 宝塔 → 网站 → 添加 Node 项目：启动文件 `server/server.js`，端口 `3000`，勾选开机自启
5. **域名与 HTTPS**：网站 → Node 项目 → 域名绑定（解析 A 记录到服务器 IP）→ SSL → Let's Encrypt 一键申请 → 开启「强制 HTTPS」
6. 宝塔 Nginx 会自动反向代理到 3000 端口，浏览器访问 `https://你的域名` 即进入用户端

### 方案二：手动部署（Ubuntu/Debian 示例）

```bash
# 1. 安装 Node.js 18+ 与 PM2
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 2. 上传项目并安装依赖
cd /var/www/card-shop
npm install --production

# 3. 复制并填写真实配置（可选）
cp server/config.example.js server/config.js

# 4. PM2 守护进程（开机自启）
pm2 start server/server.js --name card-shop
pm2 save && pm2 startup

# 5. 安装 Nginx 反向代理
sudo apt-get install -y nginx
sudo tee /etc/nginx/sites-available/card-shop > /dev/null <<'EOF'
server {
    listen 80;
    server_name 你的域名;   # 已解析到本机的域名

    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/card-shop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. 申请免费 HTTPS 证书（Let's Encrypt）
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名    # 自动签发并配置 443/强制跳转
```

完成后访问 `https://你的域名`（用户端）、`https://你的域名/admin.html`（管理后台）。

### 回调地址与内网穿透

真实支付回调要求公网可达：在 `config.js` 中把 `notifyUrl` 填成 `https://你的域名/api/pay/notify/wechat`（支付宝同理）。本地开发可用内网穿透（cpolar / ngrok / 花生壳）将 3000 端口映射到公网临时地址，并把该地址填入 notifyUrl。

---

## 十二、PWA 上线（手机秒变 APP）

系统已内置 `manifest.webmanifest` 与 `sw.js`，**部署到 HTTPS 域名后自动具备 PWA 能力**：

1. 完成「十一」的部署（HTTPS 是 PWA 安装的前提，localhost 除外）
2. 手机浏览器打开 `https://你的域名`
3. 安装应用：安卓 Chrome/Edge 地址栏出现「安装」图标；iPhone Safari 用分享 →「添加到主屏幕」
4. 安装后以全屏独立窗口运行，带 `发卡网` 图标，核心页面离线可用（Service Worker 缓存）

> 修改了前端文件后，浏览器会自动更新缓存；若想强制刷新版本，重启服务并硬刷新一次即可。
