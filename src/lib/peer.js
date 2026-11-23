/**
 * P2P-транспорт на Trystero (WebRTC без своего сервера).
 * Сигналинг идёт через публичные Nostr-реле (несколько сразу — если одно лежит, работают другие).
 * Игровые данные идут напрямую между браузерами.
 *
 * (В этой версии Trystero стратегия Nostr — по умолчанию, импорт из 'trystero'.)
 * Если Nostr-реле недоступны в вашей сети, замените импорт на один из:
 *   'trystero/torrent'  — WebTorrent-трекеры
 *   'trystero/mqtt'     — публичные MQTT-брокеры
 */
import { joinRoom } from 'trystero';

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
  const room = joinRoom({ appId: APP_ID, rtcConfig: RTC_CONFIG }, code, {
    onJoinError: (d) => console.warn('trystero join error', d),
  });
  const action = room.makeAction('msg');

  let send;
  if (Array.isArray(action)) {
    // Старый API (<= 0.21): [send, receive]
    const [sendMsg, getMsg] = action;
    getMsg((data, peerId) => handlers.onMessage?.(data, peerId));
    send = (data, peerId) => sendMsg(data, peerId);
  } else {
    // Новый API (>= 0.25): action.send / action.onMessage
    action.onMessage = (data, meta) => handlers.onMessage?.(data, meta?.peerId);
    send = (data, peerId) => action.send(data, peerId ? { target: peerId } : undefined);
  }

  const onJoin = (peerId) => handlers.onJoin?.(peerId);
  const onLeave = (peerId) => handlers.onLeave?.(peerId);
  if (typeof room.onPeerJoin === 'function') {
    room.onPeerJoin(onJoin);
    room.onPeerLeave(onLeave);
  } else {
    room.onPeerJoin = onJoin;
    room.onPeerLeave = onLeave;
  }

  return { send, leave: () => room.leave() };
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
