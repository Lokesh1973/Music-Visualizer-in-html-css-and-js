window.onload = () => {
    var visualizer = new Visualizer();
    window.onresize = () => { visualizer.resize(); };
}
class Analyser {
    constructor(audio, smoothTime, color, scale, min, max, offset, radius, isAlpha) {
        this.audio = audio;
        this.visual = this.audio.visual;
        this.scale = scale;
        this.radius = radius;
        this.isAlpha = isAlpha;
        this.color = color;
        this.audioContext = this.audio.audioContext;
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.frequencyNum = 1024;
        this.hz = 22028;
        this.analyser.smoothingTimeConstant = smoothTime;
        this.filterLP = this.audioContext.createBiquadFilter();
        this.filterHP = this.audioContext.createBiquadFilter();
        this.filterLP.type = "lowpass";
        this.filterLP.frequency.value = max;
        this.maxHz = max;
        this.minHz = min;
        this.offset = offset;
        this.radiusOffset = 16 * this.offset;
        this.count = 0;
        this.stockSpectrums = [];
        this.sourceStart = Math.ceil(this.frequencyNum * this.minHz / this.hz);
        this.sourceEnd = Math.round(this.frequencyNum * this.maxHz / this.hz);
        this.sourceLength = this.sourceEnd - this.sourceStart + 1;
        this.adjustOffset = Math.round(this.sourceLength * 0.15);
        this.distLength = 120;
        this.interval = (this.sourceLength - 1) / (this.distLength - 1);
        this.totalLength = Math.round(this.distLength * 3 / 2);
    }
    adjustFrequency(i, avr) {
        var f = Math.max(0, this.spectrums[this.sourceStart + i] - avr) * this.scale;
        var offset = i - this.sourceStart;
        var ratio = offset / this.adjustOffset;
        f *= Math.max(0, Math.min(1, 5 / 6 * (ratio - 1) * (ratio - 1) * (ratio - 1) + 1));
        return f;
    }
    update() {
        var spectrums = new Float32Array(this.frequencyNum);
        if (this.audio.isReady) {
            this.analyser.getFloatFrequencyData(spectrums);
            this.stockSpectrums.push(spectrums);
        }
        if (this.count < this.offset) { this.spectrums = new Float32Array(this.frequencyNum); }
        else {
            if (this.audio.isReady) {
                var _spectrums = this.stockSpectrums[0];
                if (!isFinite(_spectrums[0])) { this.spectrums = new Float32Array(this.frequencyNum); }
                else { this.spectrums = _spectrums; }
                this.stockSpectrums.shift();
            } else { this.spectrums = new Float32Array(this.frequencyNum); }
        }
        if (this.audio.isReady) { this.count++; }
        var canvasContext = this.visual.canvasContext;
        canvasContext.strokeStyle = this.color;
        canvasContext.fillStyle = this.color;
        var avr = 0;
        for (var i = this.sourceStart; i <= this.sourceEnd; i++) { avr += this.spectrums[i]; }
        avr /= this.sourceLength;
        avr = !this.audio.isReady || avr === 0 ? avr : Math.min(-40, Math.max(avr, -60));
        canvasContext.beginPath();
        var frequencyArray = [];
        for (var i = 0; i < this.distLength; i++) {
            var n1 = Math.floor(i * this.interval);
            var n2 = n1 + 1;
            var n0 = Math.abs(n1 - 1);
            var n3 = n1 + 2;
            n2 = n2 > this.sourceLength - 1 ? (this.sourceLength - 1) * 2 - n2 : n2;
            n3 = n3 > this.sourceLength - 1 ? (this.sourceLength - 1) * 2 - n3 : n3;
            var p0 = this.adjustFrequency(n0, avr);
            var p1 = this.adjustFrequency(n1, avr);
            var p2 = this.adjustFrequency(n2, avr);
            var p3 = this.adjustFrequency(n3, avr);
            var mu = i * this.interval - n1;
            var mu2 = mu * mu;
            var a0 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
            var a1 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
            var a2 = -0.5 * p0 + 0.5 * p2;
            var targetFrequency = a0 * mu * mu2 + a1 * mu2 + a2 * mu + p1;
            targetFrequency = Math.max(0, targetFrequency);
            frequencyArray.push(targetFrequency);
            var pos = this.visual.calculatePolarCoord((i + this.visual.tick + this.offset) / (this.totalLength - 1), this.radius + targetFrequency + 3);
            canvasContext.lineTo(pos.x + this.radiusOffset, pos.y + this.radiusOffset);
        }
        for (var i = 1; i <= this.distLength; i++) {
            var targetFrequency = frequencyArray[this.distLength - i];
            var pos = this.visual.calculatePolarCoord((i / 2 + this.distLength - 1 + this.visual.tick + this.offset) / (this.totalLength - 1),
                this.radius + targetFrequency + 3);
            canvasContext.lineTo(pos.x + this.radiusOffset, pos.y + this.radiusOffset);
        }
        for (var i = this.distLength; i > 0; i--) {
            var targetFrequency = frequencyArray[this.distLength - i];
            var pos = this.visual.calculatePolarCoord((i / 2 + this.distLength - 1 + this.visual.tick + this.offset) / (this.totalLength - 1),
                this.radius - targetFrequency - 3);
            canvasContext.lineTo(pos.x + this.radiusOffset, pos.y + this.radiusOffset);
        }
        for (var i = this.distLength - 1; i >= 0; i--) {
            var targetFrequency = frequencyArray[i];
            var pos = this.visual.calculatePolarCoord((i + this.visual.tick + this.offset) / (this.totalLength - 1), this.radius - targetFrequency - 3);
            canvasContext.lineTo(pos.x + this.radiusOffset, pos.y + this.radiusOffset);
        }
        canvasContext.fill();
    }
}
class Audio {
    constructor(_visual) {
        this.visual = _visual;
        this.audioContext = window.AudioContext ? new AudioContext : new webkitAudioContext();
        this.fileReader = new FileReader();
        this.isReady = false;
        this.count = 0;
    }
    init() {
        this.analyser_1 = new Analyser(this, 0.75, "#ff0000", 5, 1, 600, 3, 450, true);
        this.analyser_2 = new Analyser(this, 0.67, "#ff7b00", 4.5, 1, 600, 2, 450, false);
        this.analyser_3 = new Analyser(this, 0.5, "#d0ff00", 4, 1, 600, 1, 450, true);
        this.analyser_4 = new Analyser(this, 0.33, "#001aff", 3.5, 1, 600, 0, 450, false);
        this.render();
        document.getElementById("choose-file").addEventListener("change", function (e) { this.fileReader.readAsArrayBuffer(e.target.files[0]); }.bind(this));
        var _this = this;
        this.fileReader.onload = function () {
            _this.audioContext.decodeAudioData(_this.fileReader.result, function (buffer) {
                if (_this.source) { _this.source.stop(); }
                _this.source = _this.audioContext.createBufferSource();
                _this.source.buffer = buffer;
                _this.source.loop = false;
                _this.connectNode(buffer);
                _this.isReady = true;
            });
        };
    }
    connectNode(buffer) {
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = buffer;
        this.source.loop = false;
        this.source.connect(this.analyser_1.analyser);
        this.source.connect(this.analyser_2.analyser);
        this.source.connect(this.analyser_3.analyser);
        this.source.connect(this.analyser_4.analyser);
        this.source.connect(this.audioContext.destination);
        this.source.start(0);
    }
    render() {
        this.visual.draw();
        requestAnimationFrame(this.render.bind(this));
    }
}
class Visualizer {
    constructor() {
        this.canvas = document.getElementById("visualizer");
        this.canvasContext = this.canvas.getContext("2d");
        this.resize();
        this.circleR = 450;
        this.audio = new Audio(this);
        this.audio.init();
        this.tick = 0;
    }
    resize() {
        this.canvasW = this.canvas.width = window.innerWidth * 2;
        this.canvasH = this.canvas.height = window.innerHeight * 2;
    }
    calculatePolarCoord(a, b) {
        var x = Math.cos(a * 2 * Math.PI) * b;
        var y = Math.sin(a * 2 * Math.PI) * b * 0.95;
        return { x: x, y: y };
    }
    draw() {
        this.tick += 0.075;
        var canvasContext = this.canvasContext;
        canvasContext.save();
        canvasContext.clearRect(0, 0, this.canvasW, this.canvasH);
        canvasContext.translate(this.canvasW / 2, this.canvasH / 2);
        canvasContext.lineWidth = 3;
        this.audio.analyser_1.update();
        this.audio.analyser_2.update();
        this.audio.analyser_3.update();
        this.audio.analyser_4.update();
        canvasContext.restore();
    }
}