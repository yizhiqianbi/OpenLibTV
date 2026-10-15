import { UserRound, Box, Layers, Camera, Lightbulb } from 'lucide-react';
export const presets = [
  ['character', '角色', UserRound],
  ['cube', '立方体', Box],
  ['sphere', '球体', Box],
  ['cylinder', '圆柱体', Box],
  ['plane', '平面', Layers],
  ['camera', '机位', Camera],
];

// The source add menu exposes the three authored light constructors as
// separate actions. Keep the lightType as menu metadata so the editor can
// create the right Three light on the first render instead of requiring a
// second inspector mutation.
export const lightPresets = [
  ['light', '平行光', Lightbulb, 'directional'],
  ['light', '点光', Lightbulb, 'point'],
  ['light', '聚光', Lightbulb, 'spot'],
];
export const iconFor = (o) =>
  o.type === 'camera'
    ? Camera
    : o.type === 'character'
      ? UserRound
      : o.type === 'light'
        ? Lightbulb
        : Box;

export function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
