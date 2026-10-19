import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForDemoPurposesOnly12345",
  authDomain: "demo-app.firebaseapp.com",
  projectId: "demo-app",
  storageBucket: "demo-app.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

// Firebaseの初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// アプリケーション状態
let state = {
  userId: null,
  userName: '',
  roomId: null,
  isHost: false,
  roomData: null,
  history: []
};

// Canvas 関連
let canvas, ctx;
let isDrawing = false;
let drawHistory = [];
let currentColor = '#000000';
let currentSize = 5;
let isEraser = false;

// UI要素の取得
const screens = {
  lobby: document.getElementById('screen-lobby'),
  waiting: document.getElementById('screen-waiting'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result')
};

// 初期化処理
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const userCred = await signInAnonymously(auth);
    state.userId = userCred.user.uid;
    console.log("Logged in anonymously:", state.userId);
  } catch (err) {
    console.error("Auth Error:", err);
  }

  setupEventListeners();
  initCanvas();
});

// タブ切替等のイベント設定
function setupEventListeners() {
  document.getElementById('tab-create-btn').addEventListener('click', () => switchTab('create'));
  document.getElementById('tab-join-btn').addEventListener('click', () => switchTab('join'));

  document.getElementById('btn-create-room').addEventListener('click', handleCreateRoom);
  document.getElementById('btn-join-room').addEventListener('click', handleJoinRoom);
  document.getElementById('btn-start-game').addEventListener('click', handleStartGame);
  document.getElementById('btn-submit-turn').addEventListener('click', handleSubmitTurn);
  document.getElementById('btn-back-lobby').addEventListener('click', () => location.reload());

  // カラーパレットプリセット
  document.querySelectorAll('.btn-color-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentColor = e.target.dataset.color;
      isEraser = false;
      document.getElementById('color-picker').value = currentColor;
    });
  });

  document.getElementById('color-picker').addEventListener('change', (e) => {
    currentColor = e.target.value;
    isEraser = false;
  });

  document.getElementById('brush-size').addEventListener('input', (e) => {
    currentSize = e.target.value;
  });

  document.getElementById('btn-eraser').addEventListener('click', () => {
    isEraser = true;
  });

  document.getElementById('btn-undo').addEventListener('click', undoCanvas);
  document.getElementById('btn-clear').addEventListener('click', clearCanvas);
}

function showScreen(screenName) {
  Object.keys(screens).forEach(key => {
    screens[key].classList.remove('active');
  });
  screens[screenName].classList.add('active');
}

function switchTab(tab) {
  document.getElementById('tab-create-btn').classList.toggle('active', tab === 'create');
  document.getElementById('tab-join-btn').classList.toggle('active', tab === 'join');
  document.getElementById('panel-create').classList.toggle('active', tab === 'create');
  document.getElementById('panel-join').classList.toggle('active', tab === 'join');
}

// 6桁のランダムルームコード生成
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ルーム作成処理
async function handleCreateRoom() {
  const nameInput = document.getElementById('player-name').value.trim();
  if (!nameInput) return alert('名前を入力してください');

  state.userName = nameInput;
  state.isHost = true;
  state.roomId = generateRoomCode();

  const rounds = parseInt(document.getElementById('input-rounds').value, 10);

  const roomRef = doc(db, 'rooms', state.roomId);
  const roomData = {
    roomId: state.roomId,
    hostId: state.userId,
    status: 'waiting',
    rounds: rounds,
    players: [{ id: state.userId, name: state.userName }],
    turnOrder: [],
    currentTurnIndex: 0,
    history: []
  };

  await setDoc(roomRef, roomData);
  subscribeToRoom(state.roomId);
  showScreen('waiting');
}

// ルーム参加処理
async function handleJoinRoom() {
  const nameInput = document.getElementById('player-name').value.trim();
  const roomCode = document.getElementById('input-room-code').value.trim();

  if (!nameInput) return alert('名前を入力してください');
  if (!roomCode) return alert('ルームコードを入力してください');

  state.userName = nameInput;
  state.roomId = roomCode;
  state.isHost = false;

  const roomRef = doc(db, 'rooms', state.roomId);
  const docSnap = await getDoc(roomRef);

  if (!docSnap.exists()) {
    return alert('指定されたルームが見つかりません');
  }

  const roomData = docSnap.data();
  if (roomData.status !== 'waiting') {
    return alert('このゲームは既に開始されているか、終了しています');
  }

  const alreadyJoined = roomData.players.some(p => p.id === state.userId);
  if (!alreadyJoined) {
    await updateDoc(roomRef, {
      players: arrayUnion({ id: state.userId, name: state.userName })
    });
  }

  subscribeToRoom(state.roomId);
  showScreen('waiting');
}

// リアルタイムリスナー設定
function subscribeToRoom(roomId) {
  const roomRef = doc(db, 'rooms', roomId);

  onSnapshot(roomRef, (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    state.roomData = data;

    // ヘッダー情報表示
    document.getElementById('room-badge').classList.remove('hidden');
    document.getElementById('display-room-code').textContent = roomId;

    if (data.status === 'waiting') {
      updateWaitingScreen(data);
    } else if (data.status === 'playing') {
      updateGameScreen(data);
    } else if (data.status === 'finished') {
      updateResultScreen(data);
    }
  });
}

// 待機画面の更新
function updateWaitingScreen(data) {
  document.getElementById('lobby-room-code').textContent = data.roomId;
  document.getElementById('display-rounds').textContent = data.rounds;
  
  const totalTurns = data.players.length * data.rounds;
  document.getElementById('total-turns-estimate').textContent = totalTurns;

  const playerListEl = document.getElementById('player-list');
  playerListEl.innerHTML = '';
  document.getElementById('player-count').textContent = data.players.length;

  data.players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.id === data.hostId) {
      const tag = document.createElement('span');
      tag.className = 'host-tag';
      tag.textContent = 'ホスト';
      li.appendChild(tag);
    }
    playerListEl.appendChild(li);
  });

  if (state.isHost) {
    document.getElementById('host-controls').classList.remove('hidden');
    document.getElementById('guest-waiting-msg').classList.add('hidden');
  } else {
    document.getElementById('host-controls').classList.add('hidden');
    document.getElementById('guest-waiting-msg').classList.remove('hidden');
  }
}

// ゲーム開始処理（ホストのみ）
async function handleStartGame() {
  if (state.roomData.players.length < 1) {
    return alert('参加者が不足しています');
  }

  // プレイヤーの順番をシャッフル
  const shuffledPlayers = [...state.roomData.players].sort(() => Math.random() - 0.5);
  const turnOrder = shuffledPlayers.map(p => p.id);

  const roomRef = doc(db, 'rooms', state.roomId);
  await updateDoc(roomRef, {
    status: 'playing',
    turnOrder: turnOrder,
    currentTurnIndex: 0
  });
}

// ゲーム画面の更新
function updateGameScreen(data) {
  showScreen('game');

  const totalTurns = data.turnOrder.length * data.rounds;
  const currentTurn = data.currentTurnIndex + 1;

  document.getElementById('current-turn-num').textContent = currentTurn;
  document.getElementById('total-turns-num').textContent = totalTurns;

  const activePlayerId = data.turnOrder[data.currentTurnIndex % data.turnOrder.length];
  const activePlayer = data.players.find(p => p.id === activePlayerId);

  document.getElementById('current-player-name').textContent = activePlayer ? activePlayer.name : '???';

  const isMyTurn = activePlayerId === state.userId;

  if (isMyTurn) {
    document.getElementById('panel-my-turn').classList.remove('hidden');
    document.getElementById('panel-others-turn').classList.add('hidden');
    resizeCanvas();
  } else {
    document.getElementById('panel-my-turn').classList.add('hidden');
    document.getElementById('panel-others-turn').classList.remove('hidden');
    document.getElementById('active-player-name').textContent = activePlayer ? activePlayer.name : '???';
  }

  // タイムライン描画更新
  renderTimeline(data.history || []);
}

// ターン提出処理
async function handleSubmitTurn() {
  const answer = document.getElementById('input-answer').value.trim();
  if (!answer) return alert('描いたものの名前を入力してください');

  const imageData = canvas.toDataURL('image/png');

  const turnRecord = {
    playerId: state.userId,
    playerName: state.userName,
    image: imageData,
    answer: answer,
    turnIndex: state.roomData.currentTurnIndex
  };

  const nextTurnIndex = state.roomData.currentTurnIndex + 1;
  const totalTurns = state.roomData.turnOrder.length * state.roomData.rounds;

  const roomRef = doc(db, 'rooms', state.roomId);

  if (nextTurnIndex >= totalTurns) {
    // 最終ターン完了 -> リザルトへ
    await updateDoc(roomRef, {
      history: arrayUnion(turnRecord),
      status: 'finished'
    });
  } else {
    await updateDoc(roomRef, {
      history: arrayUnion(turnRecord),
      currentTurnIndex: nextTurnIndex
    });
  }

  // 入力フォームとキャンバスクリア
  document.getElementById('input-answer').value = '';
  clearCanvas();
}

// 履歴タイムラインの表示
function renderTimeline(history) {
  const container = document.getElementById('history-timeline');
  container.innerHTML = '';

  if (history.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#999;">まだ絵が描かれていません</p>';
    return;
  }

  history.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'history-item';

    const img = document.createElement('img');
    img.src = item.image;

    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const author = document.createElement('div');
    author.className = 'author';
    author.textContent = `${item.playerName} さんの絵`;

    const idx = document.createElement('div');
    idx.className = 'turn-idx';
    idx.textContent = `第 ${index + 1} ターン`;

    meta.appendChild(author);
    meta.appendChild(idx);

    div.appendChild(img);
    div.appendChild(meta);

    container.appendChild(div);
  });
}

// 結果画面の更新
function updateResultScreen(data) {
  showScreen('result');

  const listContainer = document.getElementById('result-list');
  listContainer.innerHTML = '';

  const history = data.history || [];

  history.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'result-card';

    const img = document.createElement('img');
    img.src = item.image;

    const info = document.createElement('div');
    info.className = 'result-info';

    const player = document.createElement('div');
    player.className = 'player';
    player.textContent = `第 ${index + 1} ターン: ${item.playerName}`;

    const answer = document.createElement('div');
    answer.className = 'answer';
    answer.textContent = item.answer;

    info.appendChild(player);
    info.appendChild(answer);

    card.appendChild(img);
    card.appendChild(info);

    listContainer.appendChild(card);

    if (index < history.length - 1) {
      const arrow = document.createElement('div');
      arrow.className = 'arrow-divider';
      arrow.textContent = '⬇';
      listContainer.appendChild(arrow);
    }
  });
}

// === キャンバス描画機能 ===
function initCanvas() {
  canvas = document.getElementById('paint-canvas');
  ctx = canvas.getContext('2d');

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);

  saveState();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== rect.width || canvas.height !== rect.height) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
  }
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startDrawing(e) {
  isDrawing = true;
  const pos = getPos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getPos(e);

  ctx.lineWidth = currentSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isEraser) {
    ctx.strokeStyle = '#ffffff';
  } else {
    ctx.strokeStyle = currentColor;
  }

  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

function stopDrawing() {
  if (isDrawing) {
    isDrawing = false;
    ctx.closePath();
    saveState();
  }
}

function handleTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    startDrawing(e.touches[0]);
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    draw(e.touches[0]);
  }
}

function saveState() {
  if (drawHistory.length >= 10) drawHistory.shift();
  drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function undoCanvas() {
  if (drawHistory.length > 1) {
    drawHistory.pop();
    const previousState = drawHistory[drawHistory.length - 1];
    ctx.putImageData(previousState, 0, 0);
  } else if (drawHistory.length === 1) {
    clearCanvas();
  }
}

function clearCanvas() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawHistory = [];
  saveState();
}