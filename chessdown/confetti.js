const confettiCanvas = document.getElementById('confetti-canvas');
const ctx = confettiCanvas.getContext('2d');

let confettis = [];
let confettiActive = false;

function resizeCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const colors = ['#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22'];

class Confetti {
    constructor(customColors) {
        this.x = Math.random() * confettiCanvas.width;
        this.y = Math.random() * confettiCanvas.height - confettiCanvas.height;
        this.size = Math.random() * 10 + 5;
        const palette = customColors && customColors.length > 0 ? customColors : colors;
        this.color = palette[Math.floor(Math.random() * palette.length)];
        this.speedY = Math.random() * 3 + 2;
        this.speedX = Math.random() * 2 - 1;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 10 - 5;
    }

    update() {
        this.y += this.speedY;
        this.x += this.speedX;
        this.rotation += this.rotationSpeed;

        if (this.y > confettiCanvas.height) {
            this.y = -10;
            this.x = Math.random() * confettiCanvas.width;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

function animateConfetti() {
    if (!confettiActive) {
        ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        return;
    }
    
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    
    confettis.forEach(c => {
        c.update();
        c.draw();
    });
    
    requestAnimationFrame(animateConfetti);
}

function fireConfetti(customColors = null, amount = 150) {
    confettis = [];
    for (let i = 0; i < amount; i++) {
        confettis.push(new Confetti(customColors));
    }
    confettiActive = true;
    animateConfetti();
    
    // Stop after 5 seconds
    setTimeout(() => {
        confettiActive = false;
    }, 5000);
}
