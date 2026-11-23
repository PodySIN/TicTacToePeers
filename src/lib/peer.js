/**
 * P2P-транспорт на Trystero (WebRTC без своего сервера).
 * Сигналинг идёт через публичные Nostr-реле (несколько сразу — если одно лежит, работают другие).
 * Игровые данные идут напрямую между браузерами.
 *
 * Если Nostr-реле недоступны в вашей сети, замените импорт на один из:
 *   'trystero/torrent'  — WebTorrent-трекеры
 *   'trystero/mqtt'     — публичные MQTT-брокеры
 */
import { joinRoom } from 'trystero/nostr';

const APP_ID = 'neon-ultimate-ttt-v1';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

/**
 * Открыть комнату. handlers: { onJoin(peerId), onLeave(peerId), onMessage(data, peerId) }
 * Возвращает { send(data, peerId?), leave() }.
 */
export function openRoom(code, handlers) {
  const room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, code);
  const [sendMsg, getMsg] = room.makeAction('msg');
  getMsg((data, peerId) => handlers.onMessage?.(data, peerId));
  room.onPeerJoin((peerId) => handlers.onJoin?.(peerId));
  room.onPeerLeave((peerId) => handlers.onLeave?.(peerId));
  return {
    send: (data, peerId) => sendMsg(data, peerId),
    leave: () => room.leave(),
  };
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomRoomCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return s;
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
