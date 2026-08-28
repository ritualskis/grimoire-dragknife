import fs from 'fs';
import vm from 'vm';

var realPrint = (typeof process !== 'undefined' && process.stdout) ? function(s){ process.stdout.write(s + '\n'); } : (typeof print !== 'undefined' ? print : (typeof console !== 'undefined' && console.log ? console.log.bind(console) : function(){}));
var print = realPrint;
var load = function(p) { vm.runInThisContext(fs.readFileSync(p, 'utf8')); };
var window = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
if (!window.addEventListener) window.addEventListener = function() {};
if (typeof global !== 'undefined') global.window = window;
var domCallbacks = [];
var document = typeof document !== 'undefined' ? document : {
  documentElement: {},
  addEventListener: function(evt, fn){ if (evt === 'DOMContentLoaded') domCallbacks.push(fn); },
  getElementById: function(){ return { value:'1.25', textContent:'', addEventListener:function(){}, getContext:function(){ return typeof Proxy !== 'undefined' ? new Proxy({ measureText: function(){ return {width:10}; } }, { get: function(target, prop){ return prop in target ? target[prop] : function(){}; } }) : { drawImage:function(){}, measureText:function(){ return {width:10}; } }; }, style:{}, classList:{ add:function(){}, remove:function(){}, toggle:function(){} } }; },
  querySelectorAll: function(){ return []; }
};
if (typeof global !== 'undefined') global.document = document;
var getComputedStyle = function() { return { getPropertyValue: function() { return '#00e676'; } }; };
if (typeof global !== 'undefined') global.getComputedStyle = getComputedStyle;
load('src/js/unit-format-service.js');
load('src/js/gcode-parser.js');
load('src/js/drag-knife-processor.js');
load('src/js/canvas-visualizer.js');
load('src/js/app.js');

// Trigger DOMContentLoaded callbacks so SAMPLE_CATALOG is exposed on window
domCallbacks.forEach(function(fn) { try { fn(); } catch(e){ print('INIT_ERR_FULL: ' + e.stack + ' msg=' + e.message); } });

var keys = ['edge-gauntlet', 'right-angle', 'star', 'box', 'hexagon-notches', 'text-letter'];
var errs = [];
keys.forEach(function(k) {
  var catalog = window.SAMPLE_CATALOG || (typeof SAMPLE_CATALOG !== 'undefined' ? SAMPLE_CATALOG : null);
  if (!catalog || !catalog[k] || !catalog[k].generator) {
    errs.push(k + ' missing from catalog');
    return;
  }
  var gen = catalog[k].generator;
  var raw = typeof gen === 'function' ? gen() : gen;
  var lines = raw.split("\n");
  if (lines.length < 5) errs.push(k + ' emitted under 5 lines (' + lines.length + ')');
  var pRes = new GCodeParser().parse(raw);
  if (!pRes.contours || pRes.contours.length === 0) errs.push(k + ' parsed 0 contours');
});

if (errs.length > 0) {
  print('CALLBACKS_COUNT: ' + domCallbacks.length); print('CATALOG_DEBUG: ' + typeof window.SAMPLE_CATALOG + ' keys=' + Object.keys(window.SAMPLE_CATALOG || {})); print('SAMPLE_VERIFY_FAILED: ' + errs.join('; '));
} else {
  print('SAMPLE_VERIFY_SUCCESS');
}
