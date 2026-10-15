import { lazy, Suspense } from 'react';
import NodeCanvas from './NodeCanvas.jsx';

const StudioEditor = lazy(() => import('../studio/StudioEditor.jsx'));

export function CanvasPage(props) {
  return props.path?.startsWith('/animation-preview') ? (
    <Suspense fallback={<div className="cv-auth-wait">项目加载中...</div>}>
      <StudioEditor key={props.path + window.location.search} {...props} />
    </Suspense>
  ) : (
    <NodeCanvas {...props} />
  );
}

export default CanvasPage;
