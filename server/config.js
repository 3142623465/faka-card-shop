/**
 * config.js - 你的实际配置（复制自 config.example.js，按需填写）
 * 填好后保存并重启服务生效。
 * 注意：本文件已在 .gitignore 中，不会随代码提交。
 */
module.exports = {
  pay: {
    wechat: {
      appid: '', mchid: '', serialNo: '', privateKey: '', apiV3Key: '', platformCert: '', notifyUrl: '', returnUrl: ''
    },
    alipay: {
      appId: '', privateKey: '', publicKey: '', notifyUrl: '', returnUrl: ''
    }
  },
  sms: {
    aliyun: { accessKeyId: '', accessKeySecret: '', signName: '', templateCode: '' },
    tencent: { secretId: '', secretKey: '', sdkAppId: '', signName: '', templateId: '' }
  },
  /* ===== QQ 邮箱（邮箱找回密码发信） =====
   * 1. 登录 QQ 邮箱网页版 → 设置 → 账户 → 找到「POP3/SMTP服务」→ 开启 → 按提示获取「授权码」
   * 2. 把下面 user 换成你的 QQ 邮箱，pass 换成那串 16 位授权码（不是 QQ 密码）
   * 安全提醒（H-2 已修复）：授权码属于敏感凭据，已从代码中移除明文，必须通过环境变量或 .env 注入：
   *   SMTP_USER / SMTP_PASS；未配置时邮件功能将不可用（启动时会给出警告）。
   */
  mail: {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    // 环境变量优先（SMTP_USER / SMTP_PASS），避免授权码明文随代码分发（H-2）
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  }
};
