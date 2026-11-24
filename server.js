'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 500;
const WAIT_MS = 10 * 60 * 1000;     // 相手が来ない部屋は10分で破棄

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, maxPayload: 8192 });
const rooms = new Map();            // code -> { code, host, guest, timer }

function newCode() {
  for (let n = 0; n < 50; n++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return null;
}
const sendJson = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  rooms.delete(room.code);
  clearTimeout(room.timer);
  const peer = ws.role === 'host' ? room.guest : room.host;
  if (peer && peer.room) {
    peer.room = null;
    sendJson(peer, { t: 'left' });
    peer.close();
  }
}

wss.on('connection', ws => {
  ws.alive = true; ws.room = null; ws.role = null;
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const s = data.toString();

    // 対戦中は相手へそのまま中継
    if (ws.room && ws.room.guest) {
      const peer = ws.role === 'host' ? ws.room.guest : ws.room.host;
      if (peer.readyState === 1) peer.send(s);
      return;
    }

    let m; try { m = JSON.parse(s); } catch (e) { return; }
    if (!m || ws.room) return;

    if (m.t === 'create') {
      if (rooms.size >= MAX_ROOMS) return sendJson(ws, { t: 'error', reason: 'busy' });
      const code = newCode();
      if (!code) return sendJson(ws, { t: 'error', reason: 'busy' });
      const room = { code, host: ws, guest: null, timer: null };
      room.timer = setTimeout(() => { if (!room.guest) { sendJson(ws, { t: 'left' }); leave(ws); ws.close(); } }, WAIT_MS);
      rooms.set(code, room);
      ws.room = room; ws.role = 'host';
      sendJson(ws, { t: 'created', code });
    } else if (m.t === 'join') {
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) return sendJson(ws, { t: 'error', reason: 'notfound' });
      if (room.guest) return sendJson(ws, { t: 'error', reason: 'full' });
      room.guest = ws; ws.room = room; ws.role = 'guest';
      clearTimeout(room.timer);
      sendJson(room.host, { t: 'paired' });
      sendJson(ws, { t: 'paired' });
    }
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});

// 無通信切断（Renderのプロキシ対策＋死んだ接続の掃除）
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.alive) return ws.terminate();
    ws.alive = false; ws.ping();
  });
}, 25000);

server.listen(PORT, () => console.log('listening on ' + PORT));
