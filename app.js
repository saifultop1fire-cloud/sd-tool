const firebaseConfig = {
  apiKey: "AIzaSyB4Q6Hrgl5E4EjtPKqJfNZW71Z0VyqDKB8",
  authDomain: "voice-sd.firebaseapp.com",
  databaseURL: "https://voice-sd-default-rtdb.firebaseio.com",
  projectId: "voice-sd",
  storageBucket: "voice-sd.firebasestorage.app",
  messagingSenderId: "588842989156",
  appId: "1:588842989156:web:46d26678c7ccdfedca9171",
  measurementId: "G-4HNFS31FCJ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let currentUser = null;
let currentCoins = 0;
let rawUploadedImage = null; 
let removedBgImage = null;   

// Dynamic checkered background injection for canvas
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  .transparent-checkered {
    background-color: #121214;
    background-image: linear-gradient(45deg, #1c1c21 25%, transparent 25%),
                      linear-gradient(-45deg, #1c1c21 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, #1c1c21 75%),
                      linear-gradient(-45deg, transparent 75%, #1c1c21 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  }
`;
document.head.appendChild(styleSheet);

// Web Audio API Synthesizer (Ambient sound wave during load)
let audioCtx = null;
let oscillator = null;
let gainNode = null;

function startGeneratingSynthSound() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(110, audioCtx.currentTime); 
    oscillator.frequency.linearRampToValueAtTime(120, audioCtx.currentTime + 5);
    
    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime); 

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
  } catch (e) {
    console.log("Web Audio blocked: ", e);
  }
}

function stopGeneratingSynthSound() {
  try {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
    }
    if (audioCtx) {
      audioCtx.close();
    }
  } catch (e) {
    console.log(e);
  }
}

// PWA install
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-banner').classList.remove('hidden');
});

document.getElementById('btn-install').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      document.getElementById('install-banner').classList.add('hidden');
    }
  }
});

document.getElementById('btn-close-banner').addEventListener('click', () => {
  document.getElementById('install-banner').classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }

  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
    localStorage.setItem('pending_referral', refCode);
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('main-workspace').classList.remove('hidden');
      initUserProfile();
      loadUserSongs();
    } else {
      document.getElementById('auth-screen').classList.remove('hidden');
      document.getElementById('main-workspace').classList.add('hidden');
    }
  });
});

// Email password auth
document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const specifiedRef = document.getElementById('ref-input').value;
  
  if (specifiedRef) {
    localStorage.setItem('pending_referral', specifiedRef);
  }

  showLoading("Checking credentials...");
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      Swal.fire("Error", err.message, "error");
    }
  }
  hideLoading();
});

document.getElementById('btn-google-auth').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  showLoading("Signing with Google...");
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
  hideLoading();
});

function initUserProfile() {
  const userRef = db.ref(`users/${currentUser.uid}`);
  userRef.once('value', async (snapshot) => {
    let data = snapshot.val();
    const today = new Date().toDateString();

    if (!data) {
      let initialCoins = 10;
      data = {
        name: currentUser.displayName || "Client",
        email: currentUser.email,
        coins: initialCoins,
        lastLogin: today
      };

      const pendingRef = localStorage.getItem('pending_referral');
      if (pendingRef && pendingRef !== currentUser.uid) {
        db.ref(`users/${pendingRef}/coins`).transaction(current => (current || 0) + 15);
        db.ref(`users/${pendingRef}/referrals/${currentUser.uid}`).set(today);
        data.coins += 15;
        localStorage.removeItem('pending_referral');
        Swal.fire("Bonus Credited", "You earned 15 referral credits!", "success");
      }

      await userRef.set(data);
    } else {
      if (data.lastLogin !== today) {
        data.coins = (data.coins || 0) + 10;
        data.lastLogin = today;
        await userRef.update({ coins: data.coins, lastLogin: today });
        Swal.fire("Daily Log In", "10 daily credits added!", "success");
      }
    }

    currentCoins = data.coins;
    updateUIProfile(data);
  });

  db.ref(`users/${currentUser.uid}/coins`).on('value', snap => {
    currentCoins = snap.val() || 0;
    document.getElementById('coin-balance').textContent = currentCoins;
  });
}

function updateUIProfile(data) {
  document.getElementById('user-display-name').textContent = data.name;
  document.getElementById('user-avatar').src = currentUser.photoURL || "https://img.icons8.com/bubbles/100/user.png";
  document.getElementById('refer-link').textContent = `${window.location.origin}?ref=${currentUser.uid}`;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-btn').forEach(el => el.classList.remove('sidebar-item-active'));
  
  document.getElementById(tabId).classList.remove('hidden');
  const activeBtnMap = {
    'tab-create': 'btn-create',
    'tab-my-music': 'btn-my-music',
    'tab-removebg': 'btn-removebg',
    'tab-chat': 'btn-chat',
    'tab-earn': 'btn-earn'
  };
  document.getElementById(activeBtnMap[tabId]).classList.add('sidebar-item-active');
  if (window.innerWidth < 768) {
    document.getElementById('mobile-menu').classList.add('hidden');
  }
}

// Creator switch
let activeCreatorMode = "prompt";
function switchCreatorMode(mode) {
  activeCreatorMode = mode;
  document.getElementById('mode-btn-prompt').className = "py-2.5 px-6 text-xs font-bold border-b-2 transition outline-none " + 
    (mode === 'prompt' ? 'border-green-500 text-green-500' : 'border-transparent text-zinc-400 hover:text-white');
  document.getElementById('mode-btn-lyrics').className = "py-2.5 px-6 text-xs font-bold border-b-2 transition outline-none " + 
    (mode === 'lyrics' ? 'border-green-500 text-green-500' : 'border-transparent text-zinc-400 hover:text-white');

  if (mode === 'prompt') {
    document.getElementById('creator-prompt-group').classList.remove('hidden');
    document.getElementById('creator-lyrics-group').classList.add('hidden');
  } else {
    document.getElementById('creator-prompt-group').classList.add('hidden');
    document.getElementById('creator-lyrics-group').classList.remove('hidden');
  }
}

function setMusicPreset(style) {
  if (activeCreatorMode === "prompt") {
    document.getElementById('music-prompt').value = style;
  } else {
    document.getElementById('music-lyrics-style').value = style;
  }
}

// Generate music (Direct Client-Side to avoid Netlify Function 10s timeout limit)
document.getElementById('btn-generate-music').addEventListener('click', async () => {
  let promptVal = "";
  if (activeCreatorMode === "prompt") {
    promptVal = document.getElementById('music-prompt').value.trim();
  } else {
    const lyrics = document.getElementById('music-lyrics').value.trim();
    const style = document.getElementById('music-lyrics-style').value.trim();
    if (!lyrics) return Swal.fire("Input Required", "Lyrics are required!", "warning");
    promptVal = `Generate track using these lyrics: "${lyrics}". Genre structure: "${style || 'melodic acoustic nasheed'}"`;
  }

  if (!promptVal) return Swal.fire("Input Required", "Describe your music first!", "warning");
  if (currentCoins < 9) return Swal.fire("Credits Low", "9 credits are required!", "warning");

  switchTab('tab-my-music');
  document.getElementById('generating-card').classList.remove('hidden');
  
  initCustomPlayer("", "Synthesizing Layers...", promptVal.substring(0, 45) + "...");
  document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc animate-spin text-green-500";
  startGeneratingSynthSound();

  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.floor(Math.random() * 3) + 1;
    if (progress > 98) progress = 98;
    updateGenerationProgress(progress);
  }, 1000);

  try {
    // 1. Direct fetch call to Hugging Face
    const hfResponse = await fetch("https://api-inference.huggingface.co/models/facebook/musicgen-small", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: promptVal,
        options: { wait_for_model: true }
      })
    });

    if (!hfResponse.ok) throw new Error("Hugging Face model failed to load.");
    const audioBlob = await hfResponse.blob();

    // 2. Direct Signed upload to Cloudinary using CryptoJS
    const cloudName = "dp2fkubbd";
    const apiKey = "812228737222237";
    const apiSecret = "LCXD86YMtVDJBJ5_7vrJ3IAEMtM";
    const uploadPreset = "SDCHAT";
    const timestamp = Math.round((new Date()).getTime() / 1000);

    const signatureString = `timestamp=${timestamp}&upload_preset=${uploadPreset}${apiSecret}`;
    const signature = CryptoJS.SHA1(signatureString).toString();

    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('upload_preset', uploadPreset);
    formData.append('timestamp', timestamp.toString());
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
      method: "POST",
      body: formData
    });

    const cloudinaryData = await cloudinaryResponse.json();
    if (cloudinaryData.error) throw new Error(cloudinaryData.error.message);

    clearInterval(progressInterval);
    updateGenerationProgress(100);

    // DB Update
    await db.ref(`users/${currentUser.uid}/coins`).transaction(curr => curr - 9);
    const newSongRef = db.ref(`users/${currentUser.uid}/songs`).push();
    const finalSong = {
      title: activeCreatorMode === "prompt" ? "Prompt Design Track" : "Lyrics Crafted Track",
      prompt: promptVal.substring(0, 70) + "...",
      url: cloudinaryData.secure_url,
      duration: Math.round(cloudinaryData.duration || 15),
      timestamp: Date.now()
    };
    await newSongRef.set(finalSong);

    stopGeneratingSynthSound();
    document.getElementById('generating-card').classList.add('hidden');
    initCustomPlayer(cloudinaryData.secure_url, finalSong.title, finalSong.prompt);

  } catch (err) {
    clearInterval(progressInterval);
    stopGeneratingSynthSound();
    document.getElementById('generating-card').classList.add('hidden');
    closeGlobalPlayer();
    Swal.fire("Failed", err.message || "Serverless generation failed. Try later.", "error");
  }
});

function updateGenerationProgress(percent) {
  document.getElementById('generation-progress-bar').style.width = `${percent}%`;
  document.getElementById('generation-percent').textContent = percent;
  document.getElementById('player-seek-slider').value = percent;
  document.getElementById('player-current-time').textContent = `Load ${percent}%`;
}

function loadUserSongs() {
  db.ref(`users/${currentUser.uid}/songs`).on('value', snap => {
    const container = document.getElementById('songs-container');
    container.innerHTML = '';
    const songs = snap.val();
    if (!songs) {
      document.getElementById('no-songs-msg').classList.remove('hidden');
      return;
    }
    document.getElementById('no-songs-msg').classList.add('hidden');

    Object.keys(songs).forEach(id => {
      const song = songs[id];
      const card = document.createElement('div');
      card.className = "card p-5 rounded-2xl flex flex-col justify-between space-y-4";
      card.innerHTML = `
        <div class="flex items-center gap-4">
          <div class="p-3 bg-green-500/10 text-green-500 rounded-xl text-xs font-bold">
            <i class="fa-solid fa-play cursor-pointer" onclick="initCustomPlayer('${song.url}', '${song.title.replace(/'/g, "\\'")}', '${song.prompt.replace(/'/g, "\\'")}')"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="font-bold text-xs text-white truncate">${song.title}</h4>
            <p class="text-[10px] text-zinc-400 truncate">${song.prompt}</p>
          </div>
        </div>
        <div class="flex justify-between items-center text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
          <span>Duration: ${song.duration}s</span>
          <span class="text-green-500 cursor-pointer hover:underline" onclick="initCustomPlayer('${song.url}', '${song.title.replace(/'/g, "\\'")}', '${song.prompt.replace(/'/g, "\\'")}')">Listen</span>
        </div>
      `;
      container.appendChild(card);
    });
  });
}

// Audio Engine (Bottom custom player)
let audioObj = null;
let activeSongUrl = null;

function initCustomPlayer(url, title, prompt) {
  document.getElementById('global-player-bar').classList.remove('hidden');
  document.getElementById('player-song-title').textContent = title;
  document.getElementById('player-song-prompt').textContent = prompt;
  document.getElementById('player-download-btn').href = url || "#";

  if (!url) return; 

  if (audioObj && activeSongUrl === url) {
    toggleGlobalPlay();
    return;
  }

  if (audioObj) {
    audioObj.pause();
  }

  audioObj = new Audio(url);
  activeSongUrl = url;
  audioObj.play();
  document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-pause"></i>';
  document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc animate-spin text-green-500";

  const slider = document.getElementById('player-seek-slider');
  audioObj.addEventListener('timeupdate', () => {
    const curTime = audioObj.currentTime;
    const duration = audioObj.duration || 0;
    
    document.getElementById('player-current-time').textContent = formatAudioTime(curTime);
    if (!isNaN(duration)) {
      document.getElementById('player-duration').textContent = formatAudioTime(duration);
      slider.value = (curTime / duration) * 100;
    }
  });

  slider.oninput = () => {
    if (audioObj && audioObj.duration) {
      audioObj.currentTime = (slider.value / 100) * audioObj.duration;
    }
  };

  audioObj.addEventListener('ended', () => {
    document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-play"></i>';
    document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc text-green-500";
  });
}

function formatAudioTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function toggleGlobalPlay() {
  if (!audioObj) return;
  if (audioObj.paused) {
    audioObj.play();
    document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-pause"></i>';
    document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc animate-spin text-green-500";
  } else {
    audioObj.pause();
    document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-play"></i>';
    document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc text-green-500";
  }
}

function rewindAudio() {
  if (audioObj) audioObj.currentTime = Math.max(0, audioObj.currentTime - 5);
}

function forwardAudio() {
  if (audioObj) audioObj.currentTime = Math.min(audioObj.duration || 0, audioObj.currentTime + 5);
}

function closeGlobalPlayer() {
  if (audioObj) audioObj.pause();
  document.getElementById('global-player-bar').classList.add('hidden');
}

// --- PHOTO BACKGROUND REMOVER ---
document.getElementById('image-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      rawUploadedImage = event.target.result;
      document.getElementById('image-preview').src = rawUploadedImage;
      document.getElementById('image-preview').classList.remove('hidden');
      document.getElementById('upload-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('btn-remove-bg').addEventListener('click', async () => {
  if (!rawUploadedImage) return Swal.fire("Required", "Select an image!", "warning");
  if (currentCoins < 2) return Swal.fire("Credits Low", "2 credits needed!", "warning");

  showLoading("Removing Background...");
  try {
    const res = await fetch("/.netlify/functions/removebg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: rawUploadedImage })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    removedBgImage = data.image; 
    await db.ref(`users/${currentUser.uid}/coins`).transaction(curr => curr - 2);

    document.getElementById('bg-editor').classList.remove('hidden');
    document.getElementById('btn-download-image').classList.remove('hidden');
    changeImageBg('transparent');

  } catch (err) {
    Swal.fire("Processing Error", err.message || "Internal processing failed.", "error");
  }
  hideLoading();
});

function changeImageBg(color) {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (color === 'transparent') {
      canvas.className = "max-w-full mx-auto rounded-lg shadow-lg border border-zinc-850 transparent-checkered";
    } else {
      canvas.className = "max-w-full mx-auto rounded-lg shadow-lg border border-zinc-850";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
  };
  img.src = removedBgImage;
}

document.getElementById('btn-download-image').addEventListener('click', () => {
  const canvas = document.getElementById('bg-canvas');
  const link = document.createElement('a');
  link.download = 'removed_bg_image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// --- OPENROUTER DIRECT CHATBOT ---
document.getElementById('btn-send-message').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

async function sendChatMessage() {
  const txt = document.getElementById('chat-input').value.trim();
  if (!txt) return;

  const chatMessages = document.getElementById('chat-messages');
  chatMessages.innerHTML += `
    <div class="flex gap-3 justify-end">
      <div class="bg-green-600 p-3 rounded-2xl max-w-[80%] text-xs text-white">${txt}</div>
    </div>
  `;
  document.getElementById('chat-input').value = '';
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemma-2-9b-it:free",
        messages: [{ role: "user", content: txt }]
      })
    });
    const data = await res.json();
    const reply = data.choices[0].message.content;

    chatMessages.innerHTML += `
      <div class="flex gap-3">
        <div class="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center text-xs"><i class="fa-solid fa-robot"></i></div>
        <div class="bg-zinc-800 p-3 rounded-xl max-w-[80%] text-xs text-zinc-200">${reply}</div>
      </div>
    `;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (err) {
    chatMessages.innerHTML += `<p class="text-[10px] text-red-500">Connection error. Please try again.</p>`;
  }
}

// --- COIN EARN SYSTEM ---
let selectedAdClicks = 10;
let selectedReward = 5;
let completedAdClicks = 0;
let isAdTimerRunning = false;

function selectAdPack(clicks, reward) {
  selectedAdClicks = clicks;
  selectedReward = reward;
  completedAdClicks = 0;
  
  document.querySelectorAll('.ad-pack-btn').forEach(btn => btn.classList.remove('border-green-500'));
  document.getElementById('ad-workspace').classList.remove('hidden');
  document.getElementById('ad-clicks-count').textContent = '0';
  document.getElementById('ad-target-clicks').textContent = clicks;
}

document.getElementById('btn-open-ad').addEventListener('click', () => {
  if (isAdTimerRunning) return;
  
  window.open("https://omg10.com/4/11206208", "_blank");

  isAdTimerRunning = true;
  document.getElementById('ad-timer-container').classList.remove('hidden');
  document.getElementById('btn-open-ad').disabled = true;
  document.getElementById('btn-open-ad').textContent = "Pending 10s Verification...";

  let progress = 0;
  const progressBar = document.getElementById('ad-progress');
  progressBar.style.width = '0%';

  const interval = setInterval(() => {
    progress += 10;
    progressBar.style.width = `${progress}%`;

    if (progress >= 100) {
      clearInterval(interval);
      isAdTimerRunning = false;
      document.getElementById('ad-timer-container').classList.add('hidden');
      document.getElementById('btn-open-ad').disabled = false;
      document.getElementById('btn-open-ad').textContent = "Open Ad Link";

      completedAdClicks++;
      document.getElementById('ad-clicks-count').textContent = completedAdClicks;

      if (completedAdClicks >= selectedAdClicks) {
        db.ref(`users/${currentUser.uid}/coins`).transaction(curr => (curr || 0) + selectedReward);
        Swal.fire("Reward Granted", `${selectedReward} credits have been added to your account!`, "success");
        document.getElementById('ad-workspace').classList.add('hidden');
      }
    }
  }, 1000);
});

function copyReferLink() {
  const refText = document.getElementById('refer-link').textContent;
  navigator.clipboard.writeText(refText);
  Swal.fire("Copied", "Your referral link was copied!", "success");
}

function showLoading(msg) {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

document.getElementById('btn-logout').addEventListener('click', () => auth.signOut());    gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime); 

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
  } catch (e) {
    console.log("Web Audio blocked: ", e);
  }
}

function stopGeneratingSynthSound() {
  try {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
    }
    if (audioCtx) {
      audioCtx.close();
    }
  } catch (e) {
    console.log(e);
  }
}

// PWA install
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-banner').classList.remove('hidden');
});

document.getElementById('btn-install').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      document.getElementById('install-banner').classList.add('hidden');
    }
  }
});

document.getElementById('btn-close-banner').addEventListener('click', () => {
  document.getElementById('install-banner').classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }

  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
    localStorage.setItem('pending_referral', refCode);
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('main-workspace').classList.remove('hidden');
      initUserProfile();
      loadUserSongs();
    } else {
      document.getElementById('auth-screen').classList.remove('hidden');
      document.getElementById('main-workspace').classList.add('hidden');
    }
  });
});

// Email password auth
document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const specifiedRef = document.getElementById('ref-input').value;
  
  if (specifiedRef) {
    localStorage.setItem('pending_referral', specifiedRef);
  }

  showLoading("Checking credentials...");
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      Swal.fire("Error", err.message, "error");
    }
  }
  hideLoading();
});

document.getElementById('btn-google-auth').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  showLoading("Signing with Google...");
  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
  hideLoading();
});

function initUserProfile() {
  const userRef = db.ref(`users/${currentUser.uid}`);
  userRef.once('value', async (snapshot) => {
    let data = snapshot.val();
    const today = new Date().toDateString();

    if (!data) {
      let initialCoins = 10;
      data = {
        name: currentUser.displayName || "Client",
        email: currentUser.email,
        coins: initialCoins,
        lastLogin: today
      };

      const pendingRef = localStorage.getItem('pending_referral');
      if (pendingRef && pendingRef !== currentUser.uid) {
        db.ref(`users/${pendingRef}/coins`).transaction(current => (current || 0) + 15);
        db.ref(`users/${pendingRef}/referrals/${currentUser.uid}`).set(today);
        data.coins += 15;
        localStorage.removeItem('pending_referral');
        Swal.fire("Bonus Credited", "You earned 15 referral credits!", "success");
      }

      await userRef.set(data);
    } else {
      if (data.lastLogin !== today) {
        data.coins = (data.coins || 0) + 10;
        data.lastLogin = today;
        await userRef.update({ coins: data.coins, lastLogin: today });
        Swal.fire("Daily Log In", "10 daily credits added!", "success");
      }
    }

    currentCoins = data.coins;
    updateUIProfile(data);
  });

  db.ref(`users/${currentUser.uid}/coins`).on('value', snap => {
    currentCoins = snap.val() || 0;
    document.getElementById('coin-balance').textContent = currentCoins;
  });
}

function updateUIProfile(data) {
  document.getElementById('user-display-name').textContent = data.name;
  document.getElementById('user-avatar').src = currentUser.photoURL || "https://img.icons8.com/bubbles/100/user.png";
  document.getElementById('refer-link').textContent = `${window.location.origin}?ref=${currentUser.uid}`;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-btn').forEach(el => el.classList.remove('sidebar-item-active'));
  
  document.getElementById(tabId).classList.remove('hidden');
  const activeBtnMap = {
    'tab-create': 'btn-create',
    'tab-my-music': 'btn-my-music',
    'tab-removebg': 'btn-removebg',
    'tab-chat': 'btn-chat',
    'tab-earn': 'btn-earn'
  };
  document.getElementById(activeBtnMap[tabId]).classList.add('sidebar-item-active');
  if (window.innerWidth < 768) {
    document.getElementById('mobile-menu').classList.add('hidden');
  }
}

// Creator switch
let activeCreatorMode = "prompt";
function switchCreatorMode(mode) {
  activeCreatorMode = mode;
  document.getElementById('mode-btn-prompt').className = "py-2.5 px-6 text-xs font-bold border-b-2 transition outline-none " + 
    (mode === 'prompt' ? 'border-green-500 text-green-500' : 'border-transparent text-zinc-400 hover:text-white');
  document.getElementById('mode-btn-lyrics').className = "py-2.5 px-6 text-xs font-bold border-b-2 transition outline-none " + 
    (mode === 'lyrics' ? 'border-green-500 text-green-500' : 'border-transparent text-zinc-400 hover:text-white');

  if (mode === 'prompt') {
    document.getElementById('creator-prompt-group').classList.remove('hidden');
    document.getElementById('creator-lyrics-group').classList.add('hidden');
  } else {
    document.getElementById('creator-prompt-group').classList.add('hidden');
    document.getElementById('creator-lyrics-group').classList.remove('hidden');
  }
}

function setMusicPreset(style) {
  if (activeCreatorMode === "prompt") {
    document.getElementById('music-prompt').value = style;
  } else {
    document.getElementById('music-lyrics-style').value = style;
  }
}

// Generate music
document.getElementById('btn-generate-music').addEventListener('click', async () => {
  let promptVal = "";
  if (activeCreatorMode === "prompt") {
    promptVal = document.getElementById('music-prompt').value.trim();
  } else {
    const lyrics = document.getElementById('music-lyrics').value.trim();
    const style = document.getElementById('music-lyrics-style').value.trim();
    if (!lyrics) return Swal.fire("Input Required", "Lyrics are required!", "warning");
    promptVal = `Generate track using these lyrics: "${lyrics}". Genre structure: "${style || 'melodic acoustic nasheed'}"`;
  }

  if (!promptVal) return Swal.fire("Input Required", "Describe your music first!", "warning");
  if (currentCoins < 9) return Swal.fire("Credits Low", "9 credits are required!", "warning");

  // ১. ডাইনামিক প্রগ্রেস কার্ড প্রদর্শন
  switchTab('tab-my-music');
  document.getElementById('generating-card').classList.remove('hidden');
  
  // কাস্টম প্লেয়ার অ্যাক্টিভ করে সিন্থ সাইরেন হিউম অন করা
  initCustomPlayer("", "Synthesizing Layers...", promptVal.substring(0, 45) + "...");
  document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc animate-spin text-green-500";
  startGeneratingSynthSound();

  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.floor(Math.random() * 4) + 1;
    if (progress > 98) progress = 98;
    updateGenerationProgress(progress);
  }, 1000);

  try {
    // Netlify Functions endpoint call (সরাসরি কল)
    const res = await fetch('/.netlify/functions/music', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptVal })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    clearInterval(progressInterval);
    updateGenerationProgress(100);

    // ডেবিট কয়েন
    await db.ref(`users/${currentUser.uid}/coins`).transaction(curr => curr - 9);
    const newSongRef = db.ref(`users/${currentUser.uid}/songs`).push();
    const finalSong = {
      title: activeCreatorMode === "prompt" ? "Prompt Design Track" : "Lyrics Crafted Track",
      prompt: promptVal.substring(0, 70) + "...",
      url: data.url,
      duration: data.duration,
      timestamp: Date.now()
    };
    await newSongRef.set(finalSong);

    // লাইভ সিন্থ হিউম অফ করে জেনারেটেড গান স্বয়ংক্রিয়ভাবে অডিও প্লেয়ারে চালু
    stopGeneratingSynthSound();
    document.getElementById('generating-card').classList.add('hidden');
    initCustomPlayer(data.url, finalSong.title, finalSong.prompt);

  } catch (err) {
    clearInterval(progressInterval);
    stopGeneratingSynthSound();
    document.getElementById('generating-card').classList.add('hidden');
    closeGlobalPlayer();
    Swal.fire("Failed", "Serverless generation failed. Try later.", "error");
  }
});

function updateGenerationProgress(percent) {
  document.getElementById('generation-progress-bar').style.width = `${percent}%`;
  document.getElementById('generation-percent').textContent = percent;
  document.getElementById('player-seek-slider').value = percent;
  document.getElementById('player-current-time').textContent = `Load ${percent}%`;
}

function loadUserSongs() {
  db.ref(`users/${currentUser.uid}/songs`).on('value', snap => {
    const container = document.getElementById('songs-container');
    container.innerHTML = '';
    const songs = snap.val();
    if (!songs) {
      document.getElementById('no-songs-msg').classList.remove('hidden');
      return;
    }
    document.getElementById('no-songs-msg').classList.add('hidden');

    Object.keys(songs).forEach(id => {
      const song = songs[id];
      const card = document.createElement('div');
      card.className = "card p-5 rounded-2xl flex flex-col justify-between space-y-4";
      card.innerHTML = `
        <div class="flex items-center gap-4">
          <div class="p-3 bg-green-500/10 text-green-500 rounded-xl text-xs font-bold">
            <i class="fa-solid fa-play cursor-pointer" onclick="initCustomPlayer('${song.url}', '${song.title.replace(/'/g, "\\'")}', '${song.prompt.replace(/'/g, "\\'")}')"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="font-bold text-xs text-white truncate">${song.title}</h4>
            <p class="text-[10px] text-zinc-400 truncate">${song.prompt}</p>
          </div>
        </div>
        <div class="flex justify-between items-center text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
          <span>Duration: ${song.duration}s</span>
          <span class="text-green-500 cursor-pointer hover:underline" onclick="initCustomPlayer('${song.url}', '${song.title.replace(/'/g, "\\'")}', '${song.prompt.replace(/'/g, "\\'")}')">Listen</span>
        </div>
      `;
      container.appendChild(card);
    });
  });
}

// Audio Engine (Bottom custom bar)
let audioObj = null;
let activeSongUrl = null;

function initCustomPlayer(url, title, prompt) {
  document.getElementById('global-player-bar').classList.remove('hidden');
  document.getElementById('player-song-title').textContent = title;
  document.getElementById('player-song-prompt').textContent = prompt;
  document.getElementById('player-download-btn').href = url || "#";

  if (!url) return; 

  if (audioObj && activeSongUrl === url) {
    toggleGlobalPlay();
    return;
  }

  if (audioObj) {
    audioObj.pause();
  }

  audioObj = new Audio(url);
  activeSongUrl = url;
  audioObj.play();
  document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-pause"></i>';
  document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc animate-spin text-green-500";

  const slider = document.getElementById('player-seek-slider');
  audioObj.addEventListener('timeupdate', () => {
    const curTime = audioObj.currentTime;
    const duration = audioObj.duration || 0;
    
    document.getElementById('player-current-time').textContent = formatAudioTime(curTime);
    if (!isNaN(duration)) {
      document.getElementById('player-duration').textContent = formatAudioTime(duration);
      slider.value = (curTime / duration) * 100;
    }
  });

  slider.oninput = () => {
    if (audioObj && audioObj.duration) {
      audioObj.currentTime = (slider.value / 100) * audioObj.duration;
    }
  };

  audioObj.addEventListener('ended', () => {
    document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-play"></i>';
    document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc text-green-500";
  });
}

function formatAudioTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function toggleGlobalPlay() {
  if (!audioObj) return;
  if (audioObj.paused) {
    audioObj.play();
    document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-pause"></i>';
    document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc animate-spin text-green-500";
  } else {
    audioObj.pause();
    document.getElementById('player-play-pause-btn').innerHTML = '<i class="fa-solid fa-play"></i>';
    document.getElementById('music-indicator-icon').className = "fa-solid fa-compact-disc text-green-500";
  }
}

function rewindAudio() {
  if (audioObj) audioObj.currentTime = Math.max(0, audioObj.currentTime - 5);
}

function forwardAudio() {
  if (audioObj) audioObj.currentTime = Math.min(audioObj.duration || 0, audioObj.currentTime + 5);
}

function closeGlobalPlayer() {
  if (audioObj) audioObj.pause();
  document.getElementById('global-player-bar').classList.add('hidden');
}

// --- PHOTO BACKGROUND REMOVER ---
document.getElementById('image-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      rawUploadedImage = event.target.result;
      document.getElementById('image-preview').src = rawUploadedImage;
      document.getElementById('image-preview').classList.remove('hidden');
      document.getElementById('upload-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('btn-remove-bg').addEventListener('click', async () => {
  if (!rawUploadedImage) return Swal.fire("Required", "Select an image!", "warning");
  if (currentCoins < 2) return Swal.fire("Credits Low", "2 credits needed!", "warning");

  showLoading("Removing Background...");
  try {
    const res = await fetch("/.netlify/functions/removebg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: rawUploadedImage })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    removedBgImage = data.image; 
    await db.ref(`users/${currentUser.uid}/coins`).transaction(curr => curr - 2);

    document.getElementById('bg-editor').classList.remove('hidden');
    document.getElementById('btn-download-image').classList.remove('hidden');
    changeImageBg('transparent');

  } catch (err) {
    Swal.fire("Processing Error", "Internal processing failed.", "error");
  }
  hideLoading();
});

function changeImageBg(color) {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.src = removedBgImage;

  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (color !== 'transparent') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
  };
}

document.getElementById('btn-download-image').addEventListener('click', () => {
  const canvas = document.getElementById('bg-canvas');
  const link = document.createElement('a');
  link.download = 'removed_bg_image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

// --- SUPPORT CHATBOT ---
document.getElementById('btn-send-message').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

async function sendChatMessage() {
  const txt = document.getElementById('chat-input').value.trim();
  if (!txt) return;

  const chatMessages = document.getElementById('chat-messages');
  chatMessages.innerHTML += `
    <div class="flex gap-3 justify-end">
      <div class="bg-green-600 p-3 rounded-2xl max-w-[80%] text-xs text-white">${txt}</div>
    </div>
  `;
  document.getElementById('chat-input').value = '';
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const res = await fetch("/.netlify/functions/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: txt }] })
    });
    const data = await res.json();
    const reply = data.choices[0].message.content;

    chatMessages.innerHTML += `
      <div class="flex gap-3">
        <div class="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center text-xs"><i class="fa-solid fa-robot"></i></div>
        <div class="bg-zinc-800 p-3 rounded-xl max-w-[80%] text-xs text-zinc-200">${reply}</div>
      </div>
    `;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (err) {
    chatMessages.innerHTML += `<p class="text-[10px] text-red-500">Connection error. Please try again.</p>`;
  }
}

// --- COIN EARN SYSTEM ---
let selectedAdClicks = 10;
let selectedReward = 5;
let completedAdClicks = 0;
let isAdTimerRunning = false;

function selectAdPack(clicks, reward) {
  selectedAdClicks = clicks;
  selectedReward = reward;
  completedAdClicks = 0;
  
  document.querySelectorAll('.ad-pack-btn').forEach(btn => btn.classList.remove('border-green-500'));
  document.getElementById('ad-workspace').classList.remove('hidden');
  document.getElementById('ad-clicks-count').textContent = '0';
  document.getElementById('ad-target-clicks').textContent = clicks;
}

document.getElementById('btn-open-ad').addEventListener('click', () => {
  if (isAdTimerRunning) return;
  
  window.open("https://omg10.com/4/11206208", "_blank");

  isAdTimerRunning = true;
  document.getElementById('ad-timer-container').classList.remove('hidden');
  document.getElementById('btn-open-ad').disabled = true;
  document.getElementById('btn-open-ad').textContent = "Pending 10s Verification...";

  let progress = 0;
  const progressBar = document.getElementById('ad-progress');
  progressBar.style.width = '0%';

  const interval = setInterval(() => {
    progress += 10;
    progressBar.style.width = `${progress}%`;

    if (progress >= 100) {
      clearInterval(interval);
      isAdTimerRunning = false;
      document.getElementById('ad-timer-container').classList.add('hidden');
      document.getElementById('btn-open-ad').disabled = false;
      document.getElementById('btn-open-ad').textContent = "Open Ad Link";

      completedAdClicks++;
      document.getElementById('ad-clicks-count').textContent = completedAdClicks;

      if (completedAdClicks >= selectedAdClicks) {
        db.ref(`users/${currentUser.uid}/coins`).transaction(curr => (curr || 0) + selectedReward);
        Swal.fire("Reward Granted", `${selectedReward} credits have been added to your account!`, "success");
        document.getElementById('ad-workspace').classList.add('hidden');
      }
    }
  }, 1000);
});

function copyReferLink() {
  const refText = document.getElementById('refer-link').textContent;
  navigator.clipboard.writeText(refText);
  Swal.fire("Copied", "Your referral link was copied!", "success");
}

function showLoading(msg) {
  document.getElementById('loading-text').textContent = msg;
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

document.getElementById('btn-logout').addEventListener('click', () => auth.signOut());
