// Sound and desktop-notification alerts.
//
// Browsers only allow audio after a user gesture, so unlockAlerts() must be
// called from a click handler (the "Enable Alerts" button).

let audioContext = null;

export async function unlockAlerts() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return { sound: false, notifications: false };
  }

  audioContext ||= new AudioContextClass();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  let notifications = false;

  if ("Notification" in window) {
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;

    notifications = permission === "granted";
  }

  return { sound: audioContext.state === "running", notifications };
}

function beep(frequency, startTime, duration) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0.6, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

// level 20: one low beep. level 30: two high beeps.
export function playAlertSound(level) {
  if (!audioContext || audioContext.state !== "running") {
    return;
  }

  const now = audioContext.currentTime;

  if (level >= 30) {
    beep(1000, now, 0.2);
    beep(1000, now + 0.3, 0.2);
  } else {
    beep(600, now, 0.2);
  }
}

export function showNotification(stock) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    new Notification(`${stock.symbol} +${stock.change}% at $${stock.price.toFixed(2)}`, {
      body: stock.headline || "Matched all scanner criteria",
      tag: stock.symbol,
    });
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}
