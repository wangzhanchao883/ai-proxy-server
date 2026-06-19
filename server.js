// server.js — AI 问答代理服务器
// 部署到 Render，通过激活码鉴权，保护 LLM API Key

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 激活码白名单 ──
// 环境变量 ACTIVATION_CODES = "CODE1,CODE2,CODE3"
const activationCodes = new Set(
  (process.env.ACTIVATION_CODES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

console.log(`[启动] 已加载 ${activationCodes.size} 个激活码`);

// ── 限流：每个激活码每分钟最多 10 次 ──
const RATE_LIMIT_WINDOW_MS = 60 * 1000;    // 60 秒
const RATE_LIMIT_MAX = 10;                  // 最多 10 次
const rateLimitMap = new Map();             // code → [timestamp1, timestamp2...]

function checkRateLimit(code) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(code) || [];
  // 清理 60 秒前的时间戳
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(code, recent);

  if (recent.length >= RATE_LIMIT_MAX) {
    return false; // 超限
  }
  recent.push(now);
  rateLimitMap.set(code, recent);
  return true;
}

// ── 通用中间件 ──
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(express.static('public'));

// ── 鉴权中间件（保护 /ask 路由） ──
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const parts = authHeader.split(' ');
  const code = (parts[0] === 'Bearer' && parts[1]) ? parts[1] : '';

  if (!code || !activationCodes.has(code)) {
    return res.status(401).json({ error: '无效的激活码' });
  }

  // 限流检查
  if (!checkRateLimit(code)) {
    return res.status(429).json({ error: '请求太频繁，请稍后再试' });
  }

  req.activationCode = code; // 透传给下游（备用）
  next();
}

// ── 健康检查 ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── 主问答路由 ──
app.post('/ask', authMiddleware, async (req, res) => {
  const question = req.body.question;

  // 参数校验
  if (typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'question 不能为空，且必须是字符串' });
  }

  // 读取环境变量
  const llmUrl = process.env.LLM_API_URL;
  const llmKey = process.env.LLM_API_KEY;
  const llmModel = process.env.LLM_MODEL;

  if (!llmUrl || !llmKey || !llmModel) {
    console.error('[错误] 缺少 LLM 环境变量（LLM_API_URL / LLM_API_KEY / LLM_MODEL）');
    return res.status(500).json({ error: '服务器配置不完整，请联系管理员' });
  }

  try {
    const response = await axios.post(
      `${llmUrl}/v1/chat/completions`,
      {
        model: llmModel,
        messages: [{ role: 'user', content: question }],
      },
      {
        headers: {
          'Authorization': `Bearer ${llmKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const answer = response.data.choices?.[0]?.message?.content || '';
    res.json({ answer });
  } catch (err) {
    // 安全日志：不打印完整 API Key
    const keyPreview = llmKey.slice(0, 4) + '...';
    console.error('[LLM 请求失败] Key=' + keyPreview, err.message);

    const detail = err.response?.statusText || err.message || '未知错误';
    res.status(502).json({ error: '请求失败', detail });
  }
});

// ── 启动 ──
// Vercel 环境: export app, 本地环境: listen
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
