import { normalizeTextMotion } from '../domain/text-motion-model.js';
const STYLE_ID = 'libtv-timed-text-motion-style';
const vars = [
  '--libtv-text-motion-duration',
  '--libtv-text-motion-delay',
  '--libtv-text-motion-iterations',
  '--libtv-text-motion-amplitude',
  '--libtv-text-motion-start',
];
const targets = (cue) => {
  const wrappers = [...cue.querySelectorAll('.hf-anim')];
  return wrappers.length ? wrappers : [...cue.querySelectorAll('[data-libtv-text]')].slice(0, 1);
};
const frames = {
  fade: 'from {opacity:0} to {opacity:1}',
  'fade-out': 'from {opacity:1} to {opacity:0}',
  'spring-up': 'from {opacity:0;transform:translateY(28px)} to {opacity:1;transform:translateY(0)}',
  'blur-in':
    'from {opacity:0;filter:blur(14px);transform:scale(1.06)} to {opacity:1;filter:blur(0);transform:scale(1)}',
  'zoom-in': 'from {opacity:0;transform:scale(1.12)} to {opacity:1;transform:scale(1)}',
  'slide-left':
    'from {opacity:0;transform:translateX(64px)} to {opacity:1;transform:translateX(0)}',
  'slide-right':
    'from {opacity:0;transform:translateX(-64px)} to {opacity:1;transform:translateX(0)}',
  'wipe-in': 'from {clip-path:inset(0 100% 0 0)} to {clip-path:inset(0 0 0 0)}',
  pulse:
    '0% {opacity:0;transform:scale(.92)} 70% {opacity:1;transform:scale(1.06)} 100% {opacity:1;transform:scale(1)}',
  wave: '0%,100% {transform:translateY(0)} 50% {transform:translateY(calc(var(--libtv-text-motion-amplitude) * -1))}',
};
function installStyle(document) {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    Object.entries(frames)
      .map(([name, keyframes]) => `@keyframes libtv-timed-text-${name} {${keyframes}}`)
      .join('\n') +
    `
[data-libtv-motion-none-visible] {visibility:inherit !important}
[data-libtv-motion-none-visible]:not([data-libtv-motion-target]) {opacity:1 !important}
[data-libtv-motion-none-visible][data-libtv-motion-target] {opacity:1}
[data-libtv-motion-target][data-anim], [data-libtv-motion-target][data-libtv-text-motion] {display:inline-block;animation-duration:var(--libtv-text-motion-duration);animation-delay:calc(var(--libtv-text-motion-start,0s) + var(--libtv-text-motion-delay,0s));animation-iteration-count:var(--libtv-text-motion-iterations,1);animation-fill-mode:both}
` +
    [...Object.keys(frames), 'fade-in']
      .map((name) => {
        const timing =
          name === 'fade-out'
            ? 'ease-in'
            : ['spring-up', 'pulse'].includes(name)
              ? 'cubic-bezier(.18,.89,.32,1.28)'
              : ['wave', 'wipe-in'].includes(name)
                ? 'ease-in-out'
                : 'ease-out';
        return `[data-libtv-motion-target][data-anim="${name}"], [data-libtv-motion-target][data-libtv-text-motion="${name}"] {animation-name:libtv-timed-text-${name === 'fade-in' ? 'fade' : name};animation-timing-function:${timing}}`;
      })
      .join('\n');
  document.head.appendChild(style);
}
export function syncTextMotionStart(cue) {
  const start = Math.max(0, Number(cue.getAttribute('data-start')) || 0);
  for (const target of cue.querySelectorAll('[data-libtv-motion-target]'))
    target.style.setProperty(vars[4], `${Math.round(start * 1000) / 1000}s`);
}
export function applyTextMotion(document, cue, value) {
  if (!cue) return false;
  const motion = normalizeTextMotion(value),
    elements = targets(cue);
  const scripted = Boolean(
    document.querySelector('.hf-anim') &&
    [...document.scripts].some((script) => script.id !== 'libtv-hyperframes-runtime'),
  );
  const compatible = scripted && ['fade-in', 'fade-out', 'wave'].includes(motion.type);
  const delegated = scripted && !compatible,
    custom = delegated && motion.type !== 'none',
    owned = !delegated || compatible;
  cue.setAttribute('data-anim', compatible ? 'none' : motion.type);
  if (motion.type === 'none' || compatible || custom) cue.removeAttribute('data-anim-duration');
  else cue.setAttribute('data-anim-duration', String(Math.round(motion.durationMs) / 1000));
  if ((owned && motion.type !== 'none') || (delegated && motion.type === 'none'))
    installStyle(document);
  for (const target of elements) {
    target.setAttribute('data-anim', compatible ? 'none' : motion.type);
    target.removeAttribute('data-anim-duration');
    if (compatible) target.setAttribute('data-libtv-text-motion', motion.type);
    else target.removeAttribute('data-libtv-text-motion');
    target.toggleAttribute(
      'data-libtv-motion-none-visible',
      compatible || (delegated && motion.type === 'none'),
    );
    if (owned && motion.type !== 'none') {
      target.setAttribute('data-libtv-motion-target', '');
      target.style.removeProperty('opacity');
      [
        `${motion.durationMs}ms`,
        `${motion.delayMs}ms`,
        String(motion.iterations),
        `${motion.amplitudePx}px`,
      ].forEach((value, index) => target.style.setProperty(vars[index], value));
    } else {
      target.removeAttribute('data-libtv-motion-target');
      for (const variable of vars) target.style.removeProperty(variable);
      target.style.removeProperty('animation-delay');
      target.style.removeProperty('animation-iteration-count');
    }
  }
  syncTextMotionStart(cue);
  return true;
}
export function readTextMotion(cue) {
  if (!cue) return normalizeTextMotion();
  const elements = targets(cue),
    target = elements[0];
  const type =
    elements
      .find((element) => element.hasAttribute('data-libtv-text-motion'))
      ?.getAttribute('data-libtv-text-motion') ??
    cue.getAttribute('data-anim') ??
    elements.find((element) => element.hasAttribute('data-anim'))?.getAttribute('data-anim');
  const rawDuration = Number(
    cue.getAttribute('data-anim-duration') || target?.getAttribute('data-anim-duration'),
  );
  const durationMs =
    rawDuration > 0
      ? Math.round(rawDuration * 1000)
      : parseFloat(target?.style.getPropertyValue(vars[0]));
  return normalizeTextMotion({
    type,
    ...(Number.isFinite(durationMs) ? { durationMs } : {}),
    ...Object.fromEntries(
      ['delayMs', 'iterations', 'amplitudePx']
        .map((name, index) => [name, parseFloat(target?.style.getPropertyValue(vars[index + 1]))])
        .filter(([, value]) => Number.isFinite(value)),
    ),
  });
}
