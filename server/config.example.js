/**
 * config.example.js - 真实支付/短信/邮件服务配置样例
 *
 * 使用方法：
 *   1. 复制本文件为 config.js（同目录）：cp config.example.js config.js
 *   2. 填入你的商户参数 / 短信密钥 / 发件邮箱后保存，重启服务生效
 *   3. 未填写（或删除 config.js）时，系统自动回退：
 *      - 支付：模拟支付（下单即成功、自动发卡）
 *      - 短信：验证码本地直显（开发/演示）
 *      - 邮件：重置链接本地直显（开发/演示）
 *
 * 所有字段也可用环境变量覆盖（见各节注释），便于服务器部署。
 */
module.exports = {
  /**
   * 支付渠道
   * 只要渠道关键参数填全，该渠道即启用真实支付；否则该渠道在收银台回退模拟。
   */
  pay: {
    /** 微信支付（Native 扫码支付，V3 API） */
    wechat: {
      appid: '',        // 微信开放平台/公众号 AppID（商户号关联）
      mchid: '',        // 微信支付商户号
      serialNo: '',     // 商户 API 证书序列号
      privateKey: '',   // 商户 API 私钥（apiclient_key.pem 的完整内容，PKCS8 格式）
      apiV3Key: '',     // APIv3 密钥（商户平台设置的 32 位密钥）
      platformCert: '', // 微信支付平台证书（wechatpay_xxx.pem 完整内容，用于回调验签；留空则跳过验签，仅限内网调试）
      notifyUrl: '',    // 支付回调地址（公网可访问，如 https://your.domain.com/api/pay/notify/wechat；留空自动取请求域名）
      returnUrl: ''     // 支付完成回跳页（可选）
      // 环境变量：WX_APPID / WX_MCHID / WX_SERIAL_NO / WX_PRIVATE_KEY / WX_API_V3_KEY / WX_PLATFORM_CERT / WX_NOTIFY_URL
    },

    /** 支付宝（电脑网站支付 alipay.trade.page.pay） */
    alipay: {
      appId: '',        // 支付宝开放平台应用 AppID
      privateKey: '',   // 应用私钥（RSA2，-----BEGIN PRIVATE KEY----- 开头）
      publicKey: '',    // 支付宝公钥（应用公钥证书对应的支付宝公钥）
      notifyUrl: '',    // 支付回调地址（公网可访问，如 https://your.domain.com/api/pay/notify/alipay；留空自动取请求域名）
      returnUrl: ''     // 支付完成回跳页（可选）
      // 环境变量：ALI_APP_ID / ALI_PRIVATE_KEY / ALI_PUBLIC_KEY / ALI_NOTIFY_URL
    }
  },

  /**
   * 短信服务（发送验证码）
   * 二选一填全即可；都未配置时验证码本地直显。
   */
  sms: {
    /** 阿里云短信（需先开通短信服务并申请签名、模板） */
    aliyun: {
      accessKeyId: '',      // RAM 访问密钥 AccessKey ID
      accessKeySecret: '',  // AccessKey Secret
      signName: '',         // 短信签名（如：发卡网）
      templateCode: '',     // 短信模板 CODE（模板内容需含 ${code} 变量）
      // 环境变量：ALI_SMS_AK / ALI_SMS_SK / ALI_SMS_SIGN / ALI_SMS_TMPL
    },

    /** 腾讯云短信 */
    tencent: {
      secretId: '',         // 腾讯云 SecretId
      secretKey: '',        // 腾讯云 SecretKey
      sdkAppId: '',         // 短信应用 SDKAppID
      signName: '',         // 短信签名
      templateId: '',       // 短信模板 ID（模板内容需含 {1} 变量）
      // 环境变量：TENCENT_SMS_ID / TENCENT_SMS_KEY / TENCENT_SMS_APPID / TENCENT_SMS_SIGN / TENCENT_SMS_TMPL
    }
  },

  /**
   * 邮件服务（用于邮箱找回密码发送重置邮件）
   * 未配置时，重置链接本地直显（devLink），配置后自动真实发送。
   * QQ 邮箱必填：user = 你的 QQ 邮箱，pass = 授权码（不是 QQ 密码！）
   */
  mail: {
    host: 'smtp.qq.com',   // SMTP 服务器（QQ：smtp.qq.com；163：smtp.163.com）
    port: 465,             // 465 = SSL（推荐）；或用 25/587 配合 secure:false
    secure: true,          // 465 用 true，25/587 用 false
    user: '你的QQ邮箱@qq.com', // 发件邮箱账号
    pass: '16位授权码',       // 授权码（QQ邮箱→设置→账户→开启SMTP后获取）
    from: ''               // 可选，显示发件人，留空用 user
    // 环境变量：SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM / SMTP_SECURE
  }
};
