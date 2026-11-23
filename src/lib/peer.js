/**
 * PeerJS helpers.
 * Библиотека подключается с CDN в index.html (window.Peer).
 * Используется публичный брокер 0.peerjs.com — свой сервер не нужен.
 * Игровые данные идут напрямую между браузерами (WebRTC DataConnection).
 */

function getPeerCtor() {
  if (typeof window !== 'undefined' && window.Peer) return window.Peer;
  throw new Error('PeerJS не загружен. Проверьте CDN в index.html');
}

const PEER_OPTS = {
  debug: 0,
};

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomRoomCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return s;
}

/** Host: Peer id = код комнаты */
export function createHostPeer(roomCode) {
  const Peer = getPeerCtor();
  const code = roomCode || randomRoomCode(6);
  const peer = new Peer(code, PEER_OPTS);
  return { peer, roomCode: code };
}

/** Guest: случайный id, потом peer.connect(roomCode) */
export function createGuestPeer() {
  const Peer = getPeerCtor();
  return new Peer(PEER_OPTS);
}

export function shareUrl(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  url.hash = '';
  return url.toString();
}

export function parseRoomFromUrl() {
  try {
    const u = new URL(window.location.href);
    const code = (u.searchParams.get('room') || '').trim().toUpperCase();
    return code.length >= 4 ? code : null;
  } catch {
    return null;
  }
}

export function clearRoomFromUrl() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has('room')) return;
    u.searchParams.delete('room');
    const q = u.searchParams.toString();
    window.history.replaceState({}, '', u.pathname + (q ? `?${q}` : '') + u.hash);
  } catch {
    /* ignore */
  }
}
