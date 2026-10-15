import { Type, Image as ImageIcon, Video, Music2, FileText, Scissors, Link2 } from 'lucide-react';
export const TYPES = [
  { type: 'text', label: '文本', description: '剧本、广告词、品牌文案', icon: Type },
  { type: 'image', label: '图片', description: '海报、分镜、角色设计', icon: ImageIcon },
  { type: 'video', label: '视频', description: '创意广告、动画、电影', icon: Video },
  { type: 'audio', label: '音频', description: '配音、音乐、音效', icon: Music2 },
  { type: 'script-v2', label: '脚本', description: '结构化脚本与分镜创作', icon: FileText },
  { type: 'video-clip', label: '智能剪辑', description: '在时间轴中编排视频素材', icon: Scissors },
  { type: 'reference', label: '参考', description: '记录灵感、说明和参考内容', icon: Link2 },
];
export const typeInfo = (t) =>
  TYPES.find((i) => i.type === (['script', 'storyboard'].includes(t) ? 'script-v2' : t)) || {
    label: t === 'shot-breakdown' ? '逐帧拉片' : '图片',
    icon: ImageIcon,
  };
