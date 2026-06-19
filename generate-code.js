// generate-code.js — 生成激活码：XXXX-XXXX-XXXX（大写字母+数字）
// 用法：node generate-code.js

const crypto = require('crypto');

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomChar() {
  const bytes = crypto.randomBytes(1);
  return CHARS[bytes[0] % CHARS.length];
}

function generateSegment(length) {
  let segment = '';
  for (let i = 0; i < length; i++) {
    segment += randomChar();
  }
  return segment;
}

function generateCode() {
  const parts = [4, 4, 4]; // XXXX-XXXX-XXXX
  return parts.map(len => generateSegment(len)).join('-');
}

console.log(generateCode());
