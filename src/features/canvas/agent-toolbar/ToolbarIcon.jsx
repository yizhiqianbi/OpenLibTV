import { Clapperboard } from 'lucide-react';
import icons from './toolbar-icons.json';

export default function ToolbarIcon({ name, size = 16, className = '' }) {
  const icon = icons[name];
  if (!icon) return <Clapperboard size={size} className={className} aria-hidden="true" />;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width || 24} ${icon.height || 24}`}
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
