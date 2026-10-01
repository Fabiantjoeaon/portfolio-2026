import assert from 'node:assert/strict';
import test from 'node:test';
import { bindSoundCloudPlayback } from '../src/main/utils/soundCloudPlayback.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const frames = [{}, {}], widgets = new Map();
  const holds = new Set();
  const audio = { setExternalPlayback(frame, playing) { playing ? holds.add(frame) : holds.delete(frame); } };
  const Widget = frame => {
    const callbacks = new Map();
    const widget = { callbacks, paused: true, bind: (event, fn) => callbacks.set(event, fn),
      unbind: event => callbacks.delete(event), pause() { this.paused = true; },
      isPaused: cb => cb(widget.paused) };
    widgets.set(frame, widget); return widget;
  };
  Widget.Events = Object.fromEntries(['PLAY','PAUSE','FINISH','ERROR','READY'].map(v=>[v,v]));
  return { frames, widgets, holds, audio, Widget, root: { querySelectorAll: () => frames } };
}

test('SoundCloud play, pause, finish and errors release only their own audio hold', async () => {
  const f=fixture();const destroy=bindSoundCloudPlayback(f.root,{getAudio:()=>f.audio,load:()=>Promise.resolve(f.Widget)});
  await settle();const [a,b]=f.frames.map(frame=>f.widgets.get(frame));
  a.callbacks.get('PLAY')();b.callbacks.get('PLAY')();assert.equal(f.holds.size,2);
  a.callbacks.get('PAUSE')();assert.equal(f.holds.size,1);
  b.callbacks.get('FINISH')();assert.equal(f.holds.size,0);
  a.callbacks.get('PLAY')();a.callbacks.get('ERROR')();assert.equal(f.holds.size,0);
  a.paused=false;a.callbacks.get('READY')();assert.equal(f.holds.size,1);
  destroy();assert.equal(f.holds.size,0);assert.equal(a.callbacks.size,0);assert.equal(a.paused,true);
});

test('leaving About while the SDK is loading does not attach stale players', async () => {
  const f=fixture();let resolve;
  const destroy=bindSoundCloudPlayback(f.root,{getAudio:()=>f.audio,load:()=>new Promise(r=>resolve=r)});
  destroy();resolve(f.Widget);await settle();assert.equal(f.widgets.size,0);assert.equal(f.holds.size,0);
});
