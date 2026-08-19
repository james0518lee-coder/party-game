// ===== 手機與桌面語音／音效 =====
let partyGameVoice = null;
let currentUtterance = null;
let speechUnlocked = false;
let specialAudioCtx = null;
let speechEnabled = true;

try {
  speechEnabled = localStorage.getItem("partyGameSpeechEnabled") !== "false";
} catch (_) {
  speechEnabled = true;
}

function loadChineseVoice() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  partyGameVoice =
    voices.find((voice) => voice.lang === "zh-TW") ||
    voices.find((voice) => voice.lang?.startsWith("zh-TW")) ||
    voices.find((voice) => voice.lang?.startsWith("zh")) ||
    voices[0] ||
    null;
}

function unlockAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!specialAudioCtx) specialAudioCtx = new AudioCtx();
    if (specialAudioCtx.state === "suspended") {
      specialAudioCtx.resume().catch(() => {});
    }
  } catch (error) {
    console.warn("音效啟動失敗", error);
  }
}

function createUtterance(text, rate = 0.95) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = partyGameVoice?.lang || "zh-TW";
  utterance.rate = rate;
  utterance.pitch = 1;
  utterance.volume = 1;
  if (partyGameVoice) utterance.voice = partyGameVoice;
  return utterance;
}

function unlockSpeech(announce = true) {
  unlockAudio();
  if (!speechEnabled || !("speechSynthesis" in window)) return;

  try {
    loadChineseVoice();
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const utterance = createUtterance(announce ? "語音功能已開啟" : "開始", 1);
    currentUtterance = utterance;
    utterance.onstart = () => {
      speechUnlocked = true;
    };
    utterance.onend = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };
    utterance.onerror = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn("語音啟動失敗", error);
  }
}

function speakCommand(text) {
  if (!speechEnabled || !text || !("speechSynthesis" in window)) return;

  try {
    loadChineseVoice();
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = createUtterance(text);
    currentUtterance = utterance;
    utterance.onend = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };
    utterance.onerror = (event) => {
      console.warn("指令語音播放失敗", event.error || event, {
        speechUnlocked,
        language: utterance.lang
      });
      if (currentUtterance === utterance) currentUtterance = null;
    };
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn("指令語音播放失敗", error);
  }
}

function playSpecialChime() {
  try {
    unlockAudio();
    if (!specialAudioCtx || specialAudioCtx.state !== "running") return;

    const oscillator = specialAudioCtx.createOscillator();
    const gain = specialAudioCtx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, specialAudioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, specialAudioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, specialAudioCtx.currentTime + 0.25);
    oscillator.connect(gain);
    gain.connect(specialAudioCtx.destination);
    oscillator.start();
    oscillator.stop(specialAudioCtx.currentTime + 0.25);
  } catch (error) {
    console.warn("特別格音效播放失敗", error);
  }
}

function updateVoiceButton() {
  const button = document.getElementById("btn-toggle-voice");
  if (!button) return;
  button.textContent = speechEnabled ? "🔊 語音：開啟" : "🔇 語音：關閉";
  button.classList.toggle("voice-off", !speechEnabled);
  button.setAttribute("aria-pressed", String(speechEnabled));
}

if ("speechSynthesis" in window) {
  loadChineseVoice();
  window.speechSynthesis.addEventListener("voiceschanged", loadChineseVoice);
}

const voiceToggleButton = document.getElementById("btn-toggle-voice");
if (voiceToggleButton) {
  updateVoiceButton();
  voiceToggleButton.addEventListener("click", () => {
    speechEnabled = !speechEnabled;
    try {
      localStorage.setItem("partyGameSpeechEnabled", String(speechEnabled));
    } catch (_) {}
    updateVoiceButton();

    if (speechEnabled) {
      unlockSpeech(true);
    } else if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      currentUtterance = null;
    }
  });
}

window.addEventListener("pagehide", () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
});

