// Worker for ScummVM Engine
// Mock the absolute minimum to satisfy scummvm.js
self.window = self;
globalThis.window = self;

var eventListeners = {};

function addEvent(type, listener) {
    if (!eventListeners[type]) eventListeners[type] = [];
    eventListeners[type].push(listener);
}
function removeEvent(type, listener) {
    if (eventListeners[type]) {
        eventListeners[type] = eventListeners[type].filter(l => l !== listener);
    }
}

function ensureElementMethods(el) {
    if (!el) return;
    if (!el.addEventListener) el.addEventListener = addEvent;
    if (!el.removeEventListener) el.removeEventListener = removeEvent;
    if (!el.getBoundingClientRect) el.getBoundingClientRect = function() { return { left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480 }; };
    if (!el.style) el.style = {};
    if (!el.querySelector) el.querySelector = function() { return el; };
    if (!el.appendChild) el.appendChild = function() {};
    if (!el.setAttribute) el.setAttribute = function() {};
    if (!el.removeAttribute) el.removeAttribute = function() {};
    if (!el.focus) el.focus = function() {};
    if (!el.blur) el.focus = function() {};
}

function createMockElement(id) {
    var el = {
        id: id,
        firstElementChild: { innerHTML: "" },
        innerText: "",
        value: "",
    };
    ensureElementMethods(el);
    return el;
}

self.document = {
    getElementById: function(id) {
        if (id === 'canvas') return self.document.querySelector('#canvas');
        return createMockElement(id);
    },
    querySelector: function(selector) {
        if (selector === '#canvas' || selector === 'canvas') {
            var c = self.Module ? self.Module.canvas : null;
            if (c) {
                ensureElementMethods(c);
                return c;
            }
        }
        return createMockElement('mock');
    },
    documentElement: createMockElement('html'),
    body: createMockElement('body'),
    title: ""
};
ensureElementMethods(self.document);
ensureElementMethods(self);

self.screen = { width: 640, height: 480 };
self.speechSynthesis = {
    getVoices: function() { return []; },
    speak: function() {},
    cancel: function() {},
    pause: function() {},
    resume: function() {}
};

self.emscripten_set_window_title = function(title) {
    self.document.title = title;
};
self.addEventListener = addEvent;
self.removeEventListener = removeEvent;

class AudioContext {
    constructor() {
        this.sampleRate = 44100;
        this.destination = {};
        this.currentTime = 0;
        this.state = 'running';
    }
    createScriptProcessor() { return { connect: function() {}, disconnect: function() {}, onaudioprocess: null }; }
    createBufferSource() { return {}; }
    createGain() { return { connect: function() {}, gain: { value: 1 } }; }
    createOscillator() { return { connect: function() {}, start: function() {}, stop: function() {} }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
}
self.AudioContext = AudioContext;
self.webkitAudioContext = AudioContext;

self.onmessage = function(e) {
    if (e.data.type === 'init') {
        var canvas = e.data.canvas;
        if (!canvas.style) canvas.style = {};
        if (!canvas.getBoundingClientRect) {
            canvas.getBoundingClientRect = function() { return { left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480 }; };
        }
        if (!canvas.addEventListener) canvas.addEventListener = addEvent;
        if (!canvas.removeEventListener) canvas.removeEventListener = removeEvent;
        
        runScummVM(canvas);
    } else if (e.data.type === 'event') {
        var ev = e.data.event;
        ev.preventDefault = function() {};
        ev.stopPropagation = function() {};
        ev.target = self.Module.canvas;
        if (e.data.rect && self.Module && self.Module.canvas) {
            self.Module.canvas.getBoundingClientRect = function() { return e.data.rect; };
        }
        if (eventListeners[ev.type]) {
            eventListeners[ev.type].forEach(l => l(ev));
        }
    }
};

function runScummVM(canvas) {
    self.Module = {
        ENVIRONMENT: 'WORKER', // Force worker mode
        canvas: canvas,
        arguments: ['--path=/data/', 'neverhood'],
        print: function(text) { console.log(text); },
        printErr: function(text) { console.error(text); },
        setStatus: function(text) {
            self.postMessage({ type: 'status', text: text });
        },
        preRun: [function() {
            FS.mkdir('/saves');
            var ini = `[neverhood]
description=The Neverhood
path=/data/
engineid=neverhood
gameid=neverhood
language=en
`;
            FS.writeFile('/scummvm.ini', ini);
        }],
        onRuntimeInitialized: function() {
            console.log('Worker: ScummVM Runtime Initialized');
        }
    };

    importScripts('engine_v2.js');
}
