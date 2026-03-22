let peer;
let socket;
let phoneData = null;
let overlayDismissed = false;

let baseMatrix = [];
let attractionMatrix = [];
let colorsAmount = 8;

const makeRandomMatrix = () => {
    baseMatrix = [];
    for (let i = 0; i < colorsAmount; i++) {
        const cols = [];
        for (let j = 0; j < colorsAmount; j++) {
            let v = Math.random() * 2 - 1;
            if (Math.abs(v) < 0.15) v = (v >= 0 ? 1 : -1) * 0.5;
            cols.push(v);
        }
        baseMatrix.push(cols);
    }
    attractionMatrix = baseMatrix.map(row => [...row]);
};

const servers = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19302'
    }]
};

const dismissOverlay = () => {
    if (overlayDismissed) return;
    overlayDismissed = true;
    const overlay = document.getElementById('qr-overlay');
    if (overlay) {
        overlay.classList.add('hide');
        setTimeout(() => overlay.remove(), 700);
    }
};

const init = () => {
    initSocket();
    initParticleLife();
}

const initSocket = async () => {
    socket = io.connect("/");
    socket.on("connect", () => {
        const url = `${new URL(`/controller.html?id=${socket.id}`, window.location)}`;
        const typeNumber = 4;
        const errorCorrectionLevel = 'L';
        const qr = qrcode(typeNumber, errorCorrectionLevel);
        qr.addData(url);
        qr.make();
        document.getElementById('qr-code').innerHTML = qr.createImgTag(7);
    });

    socket.on('signal', (myId, signal, peerId) => {
        if (!peer || peer.destroyed) {
            peer = new SimplePeer({
                initiator: false,
                config: servers
            });

            peer.on('signal', data => {
                socket.emit('signal', peerId, data);
            });

            peer.on('connect', () => {
                document.getElementById('qr-card').classList.add('is-connected');
            });

            peer.on('data', (data) => {
                const parsed = JSON.parse(data);

                if (parsed.action === 'shuffleMatrix') {
                    makeRandomMatrix();
                    return;
                } else {
                    phoneData = parsed;
                    dismissOverlay();
                }
            });

            peer.on('close', () => {
                // Mark as destroyed so the next incoming signal creates a fresh peer
                peer.destroyed = true;
                phoneData = null;
            });

            peer.on('error', () => {
                if (!peer.destroyed) peer.destroy();
                phoneData = null;
            });
        }

        peer.signal(signal);
    });
};

const initParticleLife = () => {
    const canvas = document.getElementById('canvas');
    const ctx    = canvas.getContext('2d');

    let width  = 0;
    let height = 0;

    const resize = () => {
        width  = canvas.width  = window.innerWidth;
        height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    const particleAmount = 1000;
    let particleRadius = 3;

    const maxDistance   = Math.min(width, height) * 0.1;
    const repulsionZone = 0.3;

    const deltaT      = 0.05;
    const frictionHL  = 0.3;
    const forceScale  = 8;
    let maxSpeed    = 2;

    const frictionFactor = Math.pow(0.5, deltaT / frictionHL);

    let gravity = { x: 0, y: 0 };

    const colors = {
        red:     '#ff4444',
        green:   '#44ff88',
        blue:    '#4488ff',
        yellow:  '#ffdd44',
        orange:  '#ff8833',
        purple:  '#cc44ff',
        cyan:    '#00ddff',
        pink:    '#ff44aa',
        lime:    '#aaff00',
        white:   '#ffffff',
    };

    const colorKeys = Object.keys(colors);

    const force = (r, a) => {
        if (r < repulsionZone) {
            return (r / repulsionZone) - 1;
        } 
        
        else if (r < 1) {
            const mid = (repulsionZone + 1) / 2;
            return a * (1 - Math.abs(r - mid) / (1 - mid));
        }
        return 0;
    };

    makeRandomMatrix();

    let particles = [];

    const createParticle = (index) => ({
        positionX:  Math.random() * width,
        positionY:  Math.random() * height,
        velocityX:  0,
        velocityY:  0,
        color:      colorKeys[index % colorsAmount],
        colorIndex: index % colorsAmount,
    });

    const spawnParticles = () => {
        particles = [];
        for (let i = 0; i < particleAmount; i++) particles.push(createParticle(i));
    };

    spawnParticles();

    const applyPhoneDataRules = () => {
        if (!phoneData || !phoneData.permissions || !phoneData.sensors) return;

        const permissions = phoneData.permissions;
        const sensors = phoneData.sensors;

        if (permissions.Gyro === 'granted') {
            const tiltX = (Math.max(-180, Math.min(180, sensors.tiltX)) + 180) / 360;
            maxSpeed = 3 + (sensors.gyroMagnitude / 50) * 7;
            particleRadius = 2 + Math.pow(tiltX, 3) * 10;
        }

        if (permissions.Microphone === 'granted') {
            const shift = (sensors.bassEnergy / 100);
            for (let i = 0; i < colorsAmount; i++) {
                for (let j = 0; j < colorsAmount; j++) {
                    attractionMatrix[i][j] = Math.max(-1, baseMatrix[i][j] - shift);
                }
            }
        } 
        
        else {
            attractionMatrix = baseMatrix.map(row => [...row]);
        }

        if (permissions.Battery === 'granted') {
            const newColorsAmount = Math.ceil(sensors.battery / 10);

            if (newColorsAmount > colorsAmount) {
                colorsAmount = newColorsAmount;
                const newColorIndex = colorsAmount - 1;
                makeRandomMatrix();
                const count = Math.floor(particleAmount / colorsAmount);
                for (let i = 0; i < count; i++) {
                    particles.push({
                        positionX:  Math.random() * width,
                        positionY:  Math.random() * height,
                        velocityX:  0,
                        velocityY:  0,
                        colorIndex: newColorIndex,
                        color:      colorKeys[newColorIndex],
                    });
                }
            } 
            
            else if (newColorsAmount < colorsAmount) {
                colorsAmount = newColorsAmount;
                makeRandomMatrix();
                particles = particles.filter(p => p.colorIndex < colorsAmount);
            }                        
        }

        if (permissions.Orientation === 'granted') {
            const compassMap = {
                'N':  { gx:  0,            gy: -1            },
                'NE': { gx:  1/Math.SQRT2, gy: -1/Math.SQRT2 },
                'E':  { gx:  1,            gy:  0            },
                'SE': { gx:  1/Math.SQRT2, gy:  1/Math.SQRT2 },
                'S':  { gx:  0,            gy:  1            },
                'SW': { gx: -1/Math.SQRT2, gy:  1/Math.SQRT2 },
                'W':  { gx: -1,            gy:  0            },
                'NW': { gx: -1/Math.SQRT2, gy: -1/Math.SQRT2 },
            };

            const direction = compassMap[sensors.compassOrientation];

            if (direction) {
                const tiltStrength = Math.abs(sensors.tiltY) / 90;
                gravity.x = direction.gx * tiltStrength * 3;
                gravity.y = direction.gy * tiltStrength * 3;
            } 
            
            else {
                gravity.x = 0;
                gravity.y = 0;
            }
        }
    };

    const updateParticles = () => {
        applyPhoneDataRules();

        for (let i = 0; i < particles.length; i++) {
            let fx = 0, fy = 0;
            const pi = particles[i];

            for (let j = 0; j < particles.length; j++) {
                if (i === j) continue;
                const pj = particles[j];

                let dx = pj.positionX - pi.positionX;
                let dy = pj.positionY - pi.positionY;

                if (dx >  width  * 0.5) dx -= width;
                if (dx < -width  * 0.5) dx += width;
                if (dy >  height * 0.5) dy -= height;
                if (dy < -height * 0.5) dy += height;

                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0 || dist > maxDistance) continue;

                const r = dist / maxDistance;
                const f = force(r, attractionMatrix[pi.colorIndex][pj.colorIndex]);

                fx += (dx / dist) * f;
                fy += (dy / dist) * f;
            }

            pi.velocityX = pi.velocityX * frictionFactor + fx * forceScale * deltaT;
            pi.velocityY = pi.velocityY * frictionFactor + fy * forceScale * deltaT;

            pi.velocityX += gravity.x;
            pi.velocityY += gravity.y;

            const speed = Math.sqrt(pi.velocityX * pi.velocityX + pi.velocityY * pi.velocityY);
            if (speed > maxSpeed) {
                const scale = maxSpeed / speed;
                pi.velocityX *= scale;
                pi.velocityY *= scale;
            }
        }

        for (const p of particles) {
            p.positionX = ((p.positionX + p.velocityX) % width  + width)  % width;
            p.positionY = ((p.positionY + p.velocityY) % height + height) % height;
        }
    };

    const drawParticles = () => {
        for (const p of particles) {
            ctx.fillStyle = colors[p.color];
            ctx.beginPath();
            ctx.arc(p.positionX, p.positionY, particleRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    const draw = () => {
        ctx.fillStyle = '#080a0f';
        ctx.fillRect(0, 0, width, height);
        drawParticles();
    };

    let paused = false;

    const loop = () => {
        if (!paused) {
            updateParticles();
            draw();
        }
        requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
};

init();