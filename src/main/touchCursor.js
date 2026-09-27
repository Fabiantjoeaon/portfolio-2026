import { gsap } from 'gsap';
import dispatcher from '@/shared/dispatcher';
import { getFlag } from '@/offscreen/lib/query';
import './styles/touch.css';

/** Relative dragging gives touch users a persistent hover without covering it. */
export function initTouchCursor(api, canvas) {
  if (!getFlag('touchExperience')) return null;
  document.body.classList.add('is-touch-experience');
  const cursor = document.createElement('button');
  cursor.className = 'touch-cursor';
  cursor.type = 'button';
  cursor.setAttribute('aria-label', 'Drag to preview projects');
  cursor.innerHTML = '<span class="touch-cursor-shape"><i></i><i></i><i></i><i></i><b>+</b></span>';
  const hint = document.createElement('div');
  hint.className = 'touch-instructions';
  hint.setAttribute('aria-live', 'polite');
  hint.innerHTML = '<span class="touch-project-name"></span><span class="touch-instruction-label">[ DRAG TO EXPLORE ]</span>';
  document.body.append(cursor, hint);
  const label = hint.querySelector('.touch-instruction-label');
  const name = hint.querySelector('.touch-project-name');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready = false, active = false, project = null, drag = null, frame = 0;
  let x = innerWidth * 0.5, y = innerHeight * 0.5;
  const clamp = () => {
    x = Math.min(innerWidth - 28, Math.max(28, x));
    const landscape = innerWidth > innerHeight;
    y = Math.min(innerHeight - (landscape ? 64 : 90), Math.max(landscape ? 64 : 100, y));
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };
  const send = () => {
    frame = 0;
    api.trigger({ name: 'pointermove', fireAtStart: true }, {
      type: 'pointermove', clientX: x, clientY: y, x, y, pointerType: 'touch', isPrimary: true,
    });
  };
  const schedule = () => { clamp(); if (!frame) frame = requestAnimationFrame(send); };
  const sync = () => {
    const next = ready && location.pathname === '/' && !document.body.classList.contains('is-loading');
    if (active === next) return;
    active = next;
    cursor.inert = !active;
    cursor.setAttribute('aria-hidden', String(!active));
    hint.setAttribute('aria-hidden', String(!active));
    cursor.style.pointerEvents = active ? 'auto' : 'none';
    if (!active) { drag = null; cursor.classList.remove('is-dragging'); }
    gsap.to([cursor, hint], { autoAlpha: active ? 1 : 0, duration: reduced ? 0 : active ? 0.7 : 0.35, overwrite: true });
    gsap.to(cursor.firstElementChild, { scale: active ? 1 : 0.5, rotation: active ? 0 : -45,
      duration: reduced ? 0 : 0.7, ease: 'power3.out', overwrite: true });
    if (active) schedule();
  };
  const open = () => {
    if (!active) return;
    if (project) window.openProject(project.slug);
    else api.trigger({ name: 'click' }, { clientX: x, clientY: y, pointerType: 'touch' });
  };
  const down = event => {
    if (!active || !event.isPrimary || event.button !== 0 || drag) return;
    if (event.target !== canvas && !cursor.contains(event.target)) return;
    event.preventDefault();
    drag = { id: event.pointerId, lastX: event.clientX, lastY: event.clientY, distance: 0,
      cursor: cursor.contains(event.target), target: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId);
    cursor.classList.add('is-dragging');
  };
  const move = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.lastX, dy = event.clientY - drag.lastY;
    drag.distance += Math.hypot(dx, dy);
    x += dx; y += dy;
    drag.lastX = event.clientX; drag.lastY = event.clientY;
    schedule();
  };
  const end = (event, cancelled = false) => {
    if (!drag || drag.id !== event.pointerId) return;
    const ended = drag;
    drag = null;
    cursor.classList.remove('is-dragging');
    if (ended.target.hasPointerCapture(event.pointerId)) ended.target.releasePointerCapture(event.pointerId);
    if (cancelled || ended.distance > 6) return;
    if (ended.cursor) open();
    else { x = event.clientX; y = event.clientY; schedule(); }
  };
  canvas.addEventListener('pointerdown', down, { passive: false });
  cursor.addEventListener('pointerdown', down, { passive: false });
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', event => end(event));
  window.addEventListener('pointercancel', event => end(event, true));
  for (const element of [canvas, cursor]) element.addEventListener('lostpointercapture', event => end(event, true));
  cursor.addEventListener('click', event => { if (event.detail === 0) open(); });
  cursor.addEventListener('keydown', event => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction || !active) return;
    event.preventDefault(); x += direction[0] * 24; y += direction[1] * 24; schedule();
  });
  dispatcher.on('touchControls', ({ enabled }) => { ready = enabled; sync(); });
  dispatcher.on('touchProject', data => {
    project = data.project;
    name.textContent = project?.name ?? '';
    label.textContent = project ? '[ TAP + TO OPEN PROJECT ]' : '[ DRAG TO EXPLORE ]';
    cursor.classList.toggle('has-project', Boolean(project));
    cursor.setAttribute('aria-label', project ? `Open ${project.name}. Drag to explore.` : 'Drag to preview projects');
  });
  for (const event of ['routeChanged', 'siteEntered', 'pageClosed']) dispatcher.on(event, sync);
  window.addEventListener('resize', () => { if (active) schedule(); else clamp(); });
  cursor.inert = true;
  clamp();
  return { get active() { return active; } };
}
