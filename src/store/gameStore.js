import { create } from 'zustand';
import { createGame, play, isFinished } from '../lib/gameLogic';
import { getBotMove } from '../lib/bot';
import { playTone } from '../lib/audio';
import { fireworks } from '../lib/celebration';
import { saveBotGame, clearBotSave } from '../lib/botSave';
import {
  createHostPeer,
  createGuestPeer,
  shareUrl,
  clearRoomFromUrl,
  randomRoomCode,
} from '../lib/peer';

// Живые объекты Peer/DataConnection не храним в zustand state.
let peerInstance = null;
let connInstance = null;

function destroyPeer() {
  try {
    if (connInstance) connInstance.close();
  } catch { /* ignore */ }
  try {
    if (peerInstance) peerInstance.destroy();
  } catch { /* ignore */ }
  peerInstance = null;
  connInstance = null;
}

function send(msg) {
  if (connInstance && connInstance.open) {
    try {
      connInstance.send(msg);
    } catch (e) {
      console.warn('peer send failed', e);
    }
  }
}

export const useGameStore = create((set, get) => ({
  mode: 'menu', // menu | local | bot | online | connecting
  difficulty: 'medium',
  game: createGame('X'),
  playerMark: 'X',
  status: 'idle', // idle | waiting | playing | finished | error
  selectedMode: null,
  showWinModal: false,

  // online
  roomCode: null,
  shareLink: null,
  onlineRole: null, // 'host' | 'guest'
  peerError: null,
  opponentConnected: false,

  setSelectedMode: (selectedMode) => set({ selectedMode }),
  setDifficulty: (difficulty) => set({ difficulty }),
  clearPeerError: () => set({ peerError: null }),

  startLocal: () => {
    destroyPeer();
    clearRoomFromUrl();
    set({
      mode: 'local',
      game: createGame('X'),
      status: 'playing',
      showWinModal: false,
      playerMark: null,
      roomCode: null,
      shareLink: null,
      onlineRole: null,
      opponentConnected: false,
      peerError: null,
    });
  },

  startBot: (difficulty = 'medium') => {
    destroyPeer();
    clearRoomFromUrl();
    clearBotSave();
    set({
      mode: 'bot',
      difficulty,
      game: createGame('X'),
      status: 'playing',
      showWinModal: false,
      playerMark: 'X',
      roomCode: null,
      shareLink: null,
      onlineRole: null,
      opponentConnected: false,
      peerError: null,
    });
  },

  resumeBot: (saved) => {
    if (!saved?.game) return;
    destroyPeer();
    clearRoomFromUrl();
    set({
      mode: 'bot',
      difficulty: saved.difficulty || 'medium',
      game: saved.game,
      status: 'playing',
      showWinModal: false,
      playerMark: 'X',
      roomCode: null,
      shareLink: null,
      onlineRole: null,
      opponentConnected: false,
      peerError: null,
    });
  },

  createOnlineRoom: () => {
    destroyPeer();
    set({
      mode: 'connecting',
      status: 'waiting',
      game: createGame('X'),
      playerMark: 'X',
      onlineRole: 'host',
      opponentConnected: false,
      showWinModal: false,
      peerError: null,
      roomCode: null,
      shareLink: null,
    });

    let created = createHostPeer();
    let peer = created.peer;
    peerInstance = peer;

    const finishHostReady = (id) => {
      const link = shareUrl(id);
      set({
        roomCode: id,
        shareLink: link,
        mode: 'online',
        status: 'waiting',
      });
    };

    peer.on('open', (id) => {
      finishHostReady(id);
    });

    peer.on('error', (err) => {
      console.warn('peer host error', err);
      if (err?.type === 'unavailable-id') {
        try { peer.destroy(); } catch { /* ignore */ }
        created = createHostPeer(randomRoomCode(6));
        peer = created.peer;
        peerInstance = peer;
        peer.on('open', (id) => finishHostReady(id));
        peer.on('error', (e2) => {
          set({
            peerError: e2?.message || 'Не удалось создать комнату',
            status: 'error',
            mode: 'menu',
          });
          destroyPeer();
        });
        wireHostConnection(peer);
        return;
      }
      set({
        peerError: err?.message || 'Ошибка PeerJS',
        status: 'error',
        mode: 'menu',
      });
      destroyPeer();
    });

    wireHostConnection(peer);
  },

  joinOnlineRoom: (code) => {
    const room = (code || '').trim().toUpperCase();
    if (room.length < 4) {
      set({ peerError: 'Введите код комнаты' });
      return;
    }

    destroyPeer();
    set({
      mode: 'connecting',
      status: 'waiting',
      game: createGame('X'),
      playerMark: 'O',
      onlineRole: 'guest',
      opponentConnected: false,
      showWinModal: false,
      peerError: null,
      roomCode: room,
      shareLink: shareUrl(room),
    });

    const peer = createGuestPeer();
    peerInstance = peer;

    peer.on('open', () => {
      const conn = peer.connect(room, { reliable: true });
      connInstance = conn;

      conn.on('open', () => {
        set({
          mode: 'online',
          status: 'playing',
          opponentConnected: true,
        });
        conn.send({ type: 'hello', role: 'guest' });
      });

      conn.on('data', (data) => handleRemoteMessage(data));

      conn.on('close', () => {
        const { status, mode: m } = get();
        if (m === 'online' && status === 'playing') {
          set({
            peerError: 'Соперник отключился',
            opponentConnected: false,
            status: 'error',
          });
        } else {
          set({ opponentConnected: false });
        }
      });

      conn.on('error', () => {
        set({
          peerError: 'Не удалось подключиться к комнате. Проверьте код.',
          status: 'error',
          mode: 'menu',
        });
        destroyPeer();
      });
    });

    peer.on('error', (err) => {
      console.warn('peer guest error', err);
      set({
        peerError:
          err?.type === 'peer-unavailable'
            ? 'Комната не найдена. Проверьте код или создайте новую.'
            : err?.message || 'Ошибка подключения',
        status: 'error',
        mode: 'menu',
      });
      destroyPeer();
    });
  },

  makeMove: (board, cell) => {
    const { game, mode, difficulty, playerMark, status } = get();
    if (status !== 'playing' || isFinished(game)) return false;

    if (mode === 'bot' && game.current !== playerMark) return false;
    if (mode === 'online' && game.current !== playerMark) return false;

    const next = play(game, board, cell);
    if (!next) {
      playTone('error');
      return false;
    }
    playTone('move');
    set({ game: next });

    if (mode === 'online') {
      send({ type: 'move', board, cell, mark: playerMark });
    }

    if (isFinished(next)) {
      playTone('win');
      if (next.winner !== 'D') fireworks();
      set({ status: 'finished', showWinModal: true });
      if (mode === 'bot') clearBotSave();
      return true;
    }

    if (mode === 'bot') {
      saveBotGame({ difficulty, game: next });
    }

    if (mode === 'bot' && next.current === 'O') {
      setTimeout(() => {
        const current = get().game;
        if (isFinished(current) || current.current !== 'O') return;
        const move = getBotMove(current, difficulty, 'O');
        if (move) {
          const after = play(current, move[0], move[1]);
          if (after) {
            playTone('move');
            const finished = isFinished(after);
            if (finished) {
              playTone('win');
              if (after.winner !== 'D') fireworks();
              clearBotSave();
            } else {
              saveBotGame({ difficulty, game: after });
            }
            set({
              game: after,
              status: finished ? 'finished' : 'playing',
              showWinModal: finished,
            });
          }
        }
      }, 280 + Math.random() * 220);
    }
    return true;
  },

  requestRematch: () => {
    const { mode, onlineRole } = get();
    if (mode !== 'online') return;
    if (onlineRole === 'host') {
      const fresh = createGame('X');
      set({
        game: fresh,
        status: 'playing',
        showWinModal: false,
        playerMark: 'X',
      });
      send({ type: 'rematch', game: fresh });
    } else {
      send({ type: 'rematch-request' });
    }
  },

  resetGame: () => {
    const { mode, difficulty } = get();
    if (mode === 'bot') get().startBot(difficulty);
    else if (mode === 'local') get().startLocal();
    else if (mode === 'online') get().requestRematch();
  },

  backToMenu: () => {
    destroyPeer();
    clearRoomFromUrl();
    set({
      mode: 'menu',
      game: createGame('X'),
      status: 'idle',
      showWinModal: false,
      roomCode: null,
      shareLink: null,
      onlineRole: null,
      opponentConnected: false,
      peerError: null,
      playerMark: 'X',
    });
  },

  leaveToMenu: () => {
    get().backToMenu();
  },
}));

function wireHostConnection(peer) {
  peer.on('connection', (conn) => {
    if (connInstance && connInstance.open) {
      try { conn.close(); } catch { /* ignore */ }
      return;
    }
    connInstance = conn;

    conn.on('open', () => {
      const state = useGameStore.getState();
      useGameStore.setState({
        opponentConnected: true,
        status: state.status === 'waiting' ? 'playing' : state.status,
        mode: 'online',
      });
      conn.send({
        type: 'sync',
        game: useGameStore.getState().game,
        hostMark: 'X',
      });
    });

    conn.on('data', (data) => handleRemoteMessage(data));

    conn.on('close', () => {
      const { status, mode } = useGameStore.getState();
      if (mode === 'online' && (status === 'playing' || status === 'waiting')) {
        useGameStore.setState({
          peerError: 'Соперник отключился',
          opponentConnected: false,
          status: status === 'playing' ? 'error' : 'waiting',
        });
      } else {
        useGameStore.setState({ opponentConnected: false });
      }
      connInstance = null;
    });

    conn.on('error', (err) => {
      console.warn('host conn error', err);
    });
  });
}

function handleRemoteMessage(data) {
  if (!data || typeof data !== 'object') return;
  const store = useGameStore.getState();

  switch (data.type) {
    case 'hello':
      break;
    case 'sync': {
      if (store.onlineRole !== 'guest') break;
      const g = data.game || createGame('X');
      useGameStore.setState({
        game: g,
        playerMark: 'O',
        status: isFinished(g) ? 'finished' : 'playing',
        showWinModal: isFinished(g),
        opponentConnected: true,
        mode: 'online',
      });
      break;
    }
    case 'move': {
      if (store.status !== 'playing' && store.status !== 'waiting') break;
      const { board, cell } = data;
      const current = useGameStore.getState().game;
      if (current.current === store.playerMark) break;
      const next = play(current, board, cell);
      if (!next) break;
      playTone('move');
      const finished = isFinished(next);
      if (finished) {
        playTone('win');
        if (next.winner !== 'D') fireworks();
      }
      useGameStore.setState({
        game: next,
        status: finished ? 'finished' : 'playing',
        showWinModal: finished,
        opponentConnected: true,
      });
      break;
    }
    case 'rematch': {
      const fresh = data.game || createGame('X');
      useGameStore.setState({
        game: fresh,
        status: 'playing',
        showWinModal: false,
        playerMark: store.onlineRole === 'host' ? 'X' : 'O',
      });
      playTone('click');
      break;
    }
    case 'rematch-request': {
      if (store.onlineRole === 'host') {
        useGameStore.getState().requestRematch();
      }
      break;
    }
    default:
      break;
  }
}
