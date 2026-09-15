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
   * 安全提醒：授权码属于敏感凭据，推荐改用环境变量 SMTP_USER / SMTP_PASS 注入，
   *   环境变量优先级高于本文件，避免密钥随代码分发。
   */
  mail: {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    // 环境变量优先（SMTP_USER / SMTP_PASS），避免授权码明文随代码分发（H-2）
    user: process.env.SMTP_USER || '3099960285@qq.com',
    pass: process.env.SMTP_PASS || 'xfhdzreujddrdgif',
    from: process.env.SMTP_FROM || '3099960285@qq.com'
  }
};
