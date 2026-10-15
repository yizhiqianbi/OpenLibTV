import React, { useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

function PluginVideo({ src, muted, setMuted }) {
  const video = useRef(null),
    [progress, setProgress] = useState(0);
  return (
    <>
      <video
        ref={video}
        src={src}
        autoPlay
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onTimeUpdate={(e) =>
          setProgress(
            e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0,
          )
        }
        onClick={() => (video.current.paused ? video.current.play() : video.current.pause())}
      />
      <div
        className="plugin-video-progress"
        role="progressbar"
        aria-label="视频播放进度"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      <button
        className="plugin-mute"
        aria-label={muted ? '取消静音' : '静音'}
        onClick={() => setMuted((v) => !v)}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </>
  );
}

export default PluginVideo;
