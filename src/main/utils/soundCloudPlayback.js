let widgetApi;

function loadWidgetApi() {
  if (window.SC?.Widget) return Promise.resolve(window.SC.Widget);
  if (!widgetApi) widgetApi = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.async = true;
    script.onload = () => window.SC?.Widget ? resolve(window.SC.Widget) : reject(new Error('SoundCloud Widget API unavailable'));
    script.onerror = () => { script.remove(); reject(new Error('SoundCloud Widget API failed to load')); };
    document.head.appendChild(script);
  }).catch(error => { widgetApi = null; throw error; });
  return widgetApi;
}

/** Keep the saved mute preference intact; every player owns its own temporary hold. */
export function bindSoundCloudPlayback(root, { getAudio = () => window.audio, load = loadWidgetApi } = {}) {
  const frames = [...root.querySelectorAll('iframe[src^="https://w.soundcloud.com/player/"]')];
  const players = [];
  let disposed = false;
  if (frames.length) load().then(Widget => {
    if (disposed) return;
    for (const frame of frames) {
      const widget = Widget(frame);
      let heldAudio;
      const release = () => { heldAudio?.setExternalPlayback(frame, false); heldAudio = null; };
      const play = () => {
        if (disposed) return;
        heldAudio = getAudio();
        heldAudio?.setExternalPlayback(frame, true);
      };
      const sync = () => widget.isPaused(paused => { if (!disposed) paused ? release() : play(); });
      const bindings = [
        [Widget.Events.PLAY, play], [Widget.Events.PAUSE, release],
        [Widget.Events.FINISH, release], [Widget.Events.ERROR, release],
        [Widget.Events.READY, sync],
      ];
      for (const [event, listener] of bindings) widget.bind(event, listener);
      players.push({ widget, bindings, release });
    }
  }).catch(error => { if (!disposed) console.warn('[SoundCloud]', error); });
  return () => {
    disposed = true;
    for (const { widget, bindings, release } of players) {
      for (const [event] of bindings) widget.unbind(event);
      widget.pause();
      release();
    }
  };
}
