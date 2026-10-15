import { Scissors } from 'lucide-react';
import icons from './clip-mode-icons.json';

/** Exact three LibTV icons from the archived dictionary; default uses source Lucide. */
export default function VideoComposeModeIcon({ mode, size = 14 }) {
  if (!mode?.icon || mode.icon === 'lucide:scissors') return <Scissors size={size} />;
  const icon = mode.icon.startsWith('libtv:') && icons[mode.icon.slice(6)];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      fill="none"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
