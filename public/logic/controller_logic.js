const computerId = new URLSearchParams(window.location.search).get('id');
let socket;
let peer;
let permissionResults;
let originalPermissions;
let sensorInformation = null;

const sensorState = {
    vertical: 'N/A',
    horizontal: 'N/A',
    gyroMagnitude: 0,
    compassOrientation: null,
    batteryPercentage: 1,
};

const servers = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const compassDegrees = {
    'N': 0, 'NE': 45, 'E': 90, 'SE': 135,
    'S': 180, 'SW': 225, 'W': 270, 'NW': 315
};

// ── Bar helpers ───────────────────────────────────────
const setBar = (id, pct) => {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
};

const setTiltBar = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    const clamped = Math.max(-90, Math.min(90, parseFloat(value) || 0));
    const pct = ((clamped + 90) / 180) * 100;
    el.style.width = Math.abs(pct - 50) + '%';
    el.style.left  = clamped < 0 ? pct + '%' : '50%';
};

const updateCompass = (dir) => {
    const deg = compassDegrees[dir];
    if (deg === undefined) return;
    document.getElementById('compass-arrow').setAttribute(
        'transform', `rotate(${deg} 50 50)`
    );
    document.getElementById('compass-label-text').textContent = dir;
};

// ── Apply permission states to UI after perms granted ─
const applyPermissionStates = () => {
    const panels = [
        { panelId: 'panel-gyro',      key: 'Gyro',        badgeId: 'badge-gyro',       toggleId: 'toggle-gyro' },
        { panelId: 'panel-mic',        key: 'Microphone',  badgeId: 'badge-mic',        toggleId: 'toggle-mic' },
        { panelId: 'panel-battery',    key: 'battery',     badgeId: 'badge-battery',    toggleId: 'toggle-battery' },
        { panelId: 'panel-direction',  key: 'Orientation', badgeId: 'badge-direction',  toggleId: 'toggle-direction' },
    ];

    for (const { panelId, key, badgeId, toggleId } of panels) {
        const status   = permissionResults[key];
        const panel    = document.getElementById(panelId);
        const badgeEl  = document.getElementById(badgeId);
        const toggleEl = document.getElementById(toggleId);

        if (status === 'granted') {
            badgeEl.textContent = 'active';
            badgeEl.className   = 'permission-badge badge-granted';
            toggleEl.classList.add('can-toggle', 'is-on');
            toggleEl.addEventListener('click', () => {
                const on = permissionResults[key] === 'denied';
                permissionResults[key] = on ? originalPermissions[key] : 'denied';
                toggleEl.classList.toggle('is-on',  on);
                toggleEl.classList.toggle('is-off', !on);
                badgeEl.textContent = on ? 'active' : 'muted';
                badgeEl.className   = on
                    ? 'permission-badge badge-granted'
                    : 'permission-badge badge-muted';
                panel.classList.toggle('panel-muted', !on);
            });
        } else {
            badgeEl.textContent = status === 'impossible' ? 'unavailable' : 'denied';
            badgeEl.className   = 'permission-badge badge-denied';
            panel.classList.add('panel-disabled');
            toggleEl.disabled = true;
            toggleEl.classList.add('no-toggle');
        }
    }
};

// ── Live UI update ────────────────────────────────────
const startUILoop = () => {
    setInterval(() => {
        if (!sensorInformation?.sensors) return;
        const s = sensorInformation.sensors;
        setTiltBar('bar-tiltX', s.tiltX);
        setBar('bar-tiltY', (Math.abs(parseFloat(s.tiltY) || 0) / 90) * 100);
        setBar('bar-gyro',    s.gyroMagnitude);
        setBar('bar-mic',     s.bassEnergy);
        setBar('bar-battery', s.battery);
        if (s.compassOrientation) updateCompass(s.compassOrientation);
    }, 80);
};

// ── Init ──────────────────────────────────────────────
const init = () => {
    initSocket();

    document.getElementById('btn').addEventListener('click', async () => {
        const allAsked = await permissionRequests();
        if (allAsked) {
            applyPermissionStates();
            dataCollection();
            dismissPermOverlay();
            document.getElementById('app').classList.remove('hidden');
            startUILoop();
        }
    });

    document.getElementById('btn-shuffle').addEventListener('click', () => {
        if (peer && peer.connected) {
            peer.send(JSON.stringify({ action: 'shuffleMatrix' }));
        }
        const btn = document.getElementById('btn-shuffle');
        btn.classList.add('spinning');
        setTimeout(() => btn.classList.remove('spinning'), 600);
    });
};

const dismissPermOverlay = () => {
    const overlay = document.getElementById('perm-overlay');
    overlay.classList.add('hide');
    setTimeout(() => overlay.remove(), 700);
};

// ── Permissions ───────────────────────────────────────
const permissionRequests = async () => {
    const results = {
        Orientation: 'denied', Gyro: 'denied',
        Microphone: 'denied',  battery: 'denied',
    };
    results.Orientation = await requestOrientation();
    results.Gyro        = await requestGyro();
    results.battery     = await requestBattery();
    results.Microphone  = await requestMicrophone();
    permissionResults   = results;
    originalPermissions = { ...results };
    return Object.values(results);
};

const requestOrientation = async () => {
    try {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            const p = await DeviceOrientationEvent.requestPermission();
            if (p !== 'granted') return 'denied';
        } else if (typeof DeviceOrientationEvent === 'undefined') {
            return 'impossible';
        }
        const hasData = await new Promise(resolve => {
            const t = setTimeout(() => resolve(false), 500);
            window.addEventListener('deviceorientation', e => {
                clearTimeout(t);
                resolve(e.alpha !== null || e.beta !== null || e.gamma !== null);
            }, { once: true });
        });
        if (hasData) {
            window.addEventListener('deviceorientation', event => {
                sensorState.vertical   = event.beta  !== null ? event.beta.toFixed(1)  : 'N/A';
                sensorState.horizontal = event.gamma !== null ? event.gamma.toFixed(1) : 'N/A';
                if (event.webkitCompassHeading !== undefined) {
                    const h = event.webkitCompassHeading;
                    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
                    sensorState.compassOrientation = dirs[Math.round(h / 45) % 8];
                } else if (event.absolute && event.alpha !== null) {
                    const h = (360 - event.alpha) % 360;
                    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
                    sensorState.compassOrientation = dirs[Math.round(h / 45) % 8];
                }
            });
        }
        return hasData ? 'granted' : 'impossible';
    } catch { return 'impossible'; }
};

const requestGyro = async () => {
    try {
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
            const p = await DeviceMotionEvent.requestPermission();
            if (p !== 'granted') return 'denied';
        } else if (typeof DeviceMotionEvent === 'undefined') {
            return 'impossible';
        }
        const hasData = await new Promise(resolve => {
            const t = setTimeout(() => resolve(false), 500);
            window.addEventListener('devicemotion', e => {
                clearTimeout(t);
                resolve(e.rotationRate?.alpha !== null);
            }, { once: true });
        });
        if (hasData) {
            window.addEventListener('devicemotion', event => {
                const { alpha, beta, gamma } = event.rotationRate ?? {};
                if (alpha == null) return;
                const raw = Math.sqrt(alpha ** 2 + beta ** 2 + gamma ** 2);
                sensorState.gyroMagnitude = Math.min(Math.round((raw / 500) * 100), 100);
            });
        }
        return hasData ? 'granted' : 'impossible';
    } catch { return 'impossible'; }
};

let micStream, audioContext, analyser;
const requestMicrophone = async () => {
    try {
        micStream    = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new AudioContext();
        analyser     = audioContext.createAnalyser();
        analyser.fftSize = 256;
        audioContext.createMediaStreamSource(micStream).connect(analyser);
        return 'granted';
    } catch { return 'denied'; }
};

const requestBattery = async () => {
    if (!navigator.getBattery) return 'impossible';
    const battery = await navigator.getBattery();
    sensorState.batteryPercentage = Math.round(battery.level * 100);
    battery.addEventListener('levelchange', () => {
        sensorState.batteryPercentage = Math.round(battery.level * 100);
    });
    return 'granted';
};

// ── Data collection ───────────────────────────────────
// permissionResults is mutated directly by toggles — just send it as-is
const dataCollection = () => {
    setInterval(() => {
        const sensorData = {
            tiltY:              sensorState.horizontal,
            tiltX:              sensorState.vertical,
            gyroMagnitude:      sensorState.gyroMagnitude,
            bassEnergy:         microphoneData(),
            compassOrientation: sensorState.compassOrientation,
            battery:            sensorState.batteryPercentage,
        };
        sensorInformation = { permissions: permissionResults, sensors: sensorData };
        if (peer && peer.connected) {
            peer.send(JSON.stringify(sensorInformation));
        }
    }, 100);
};

const microphoneData = () => {
    if (!analyser) return 1;
    const dataArray  = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    analyser.smoothingTimeConstant = 0.3;
    const bassRange  = Math.floor(dataArray.length * 0.1);
    const bassSlice  = dataArray.slice(0, bassRange);
    const bassAvg    = bassSlice.reduce((s, v) => s + v, 0) / bassRange;
    const dynamicMax = Math.max(...dataArray) || 1;
    return Math.min(Math.round((bassAvg / dynamicMax) * 99) + 1, 1000);
};

// ── Wake lock ─────────────────────────────────────────
const requestWakeLock = async () => {
    try { await navigator.wakeLock.request('screen'); } catch {}
};
requestWakeLock();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
});

// ── Socket / peer ─────────────────────────────────────
const initSocket = () => {
    socket = io.connect('/');
    socket.on('connect', () => {
        peer = new SimplePeer({ initiator: true, config: servers });
        peer.on('signal', data => socket.emit('signal', computerId, data));
        peer.on('connect', () => {
            if (sensorInformation) peer.send(JSON.stringify(sensorInformation));
        });
    });
    socket.on('signal', (myId, signal, peerId) => {
        if (peer && !peer.destroyed) peer.signal(signal);
    });
};

init();
