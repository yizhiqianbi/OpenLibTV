import {
  ArrowLeft,
  ChevronDown,
  X,
  Sparkles,
  Download,
  Share2,
  Check,
  HelpCircle,
  Layers,
  Eye,
} from 'lucide-react';
export function CanvasHeader({
  agentOpen,
  chatShare,
  copyCanvas,
  documentReady,
  loadError,
  login,
  menu,
  navigate,
  notify,
  onClose,
  readonly,
  rename,
  saved,
  saveError,
  onRetrySave,
  setAgentOpen,
  setDialog,
  setMenu,
  setRename,
  setShareUrl,
  setSurface,
  setTitle,
  surface,
  title,
  user,
}) {
  return (
    <>
      {chatShare ? (
        <header className="cv-chat-header">
          <div>
            <button title="回到主页" onClick={() => navigate?.('/')}>
              PenStudio
            </button>
            <span>{title}</span>
            <button onClick={() => setSurface(surface === 'workflow' ? 'storyboard' : 'workflow')}>
              <Layers size={15} />
              {surface === 'workflow' ? '工作流' : '故事板'}
            </button>
          </div>
          <button
            className="cv-primary"
            onClick={() => (user ? navigate?.('/canvas?agent=true') : login?.())}
          >
            立即体验PenStudio
          </button>
        </header>
      ) : readonly ? (
        <header className="cv-topbar cv-public-header">
          <div className="cv-public-title">
            <span>{title}</span>
            <button
              aria-label="只读模式信息"
              title="只读模式，如需创建请点击复制项目"
              onClick={() => notify('只读模式，如需创建请点击复制项目')}
            >
              <Eye size={14} />
            </button>
          </div>
          <nav className="cv-view-switch" aria-label="画布模式">
            <button
              className={surface === 'workflow' ? 'active' : ''}
              onClick={() => setSurface('workflow')}
            >
              <Share2 size={16} />
              工作流
            </button>
            <button
              className={surface === 'storyboard' ? 'active' : ''}
              onClick={() => setSurface('storyboard')}
            >
              <Layers size={16} />
              故事板
            </button>
          </nav>
          <div className="cv-public-actions">
            <button
              className="cv-primary"
              disabled={!documentReady || !!loadError}
              onClick={copyCanvas}
            >
              复制项目
            </button>
            <button aria-label="关闭" onClick={() => (onClose ? onClose() : navigate?.('/show'))}>
              <X size={18} />
            </button>
          </div>
        </header>
      ) : (
        <header className="cv-topbar">
          <div className="cv-top-left">
            <button title="返回" onClick={() => navigate?.('/project')}>
              <ArrowLeft size={18} />
            </button>
            <button className="cv-brand" onClick={() => navigate?.('/')}>
              Pen<span>Studio</span>
            </button>
            <i />
            {rename ? (
              <input
                className="cv-title-input"
                disabled={!documentReady}
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setRename(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setRename(false);
                }}
              />
            ) : (
              <button
                className="cv-project-title"
                disabled={!documentReady}
                onClick={() => setMenu(menu === 'project' ? null : 'project')}
              >
                {title}
                <ChevronDown size={14} />
              </button>
            )}
            <span className="cv-save-state">
              <Check size={12} />
              {!documentReady ? (
                loadError ? (
                  '加载失败'
                ) : (
                  '加载中…'
                )
              ) : saveError ? (
                <button type="button" title="本机保存失败，当前画布已保留" onClick={onRetrySave}>
                  重试保存画布
                </button>
              ) : saved ? (
                '已保存'
              ) : (
                '保存中…'
              )}
            </span>
          </div>
          <div className="cv-top-right">
            <button title="快捷键" onClick={() => setDialog('shortcuts')}>
              <HelpCircle size={17} />
            </button>
            <button aria-label="导出" disabled={!documentReady} onClick={() => setDialog('export')}>
              <Download size={16} />
              <span>导出</span>
            </button>
            <button
              disabled={!documentReady}
              onClick={() => {
                setShareUrl('');
                setDialog('share');
              }}
            >
              <Share2 size={16} />
              分享
            </button>
            <button
              className="cv-publish"
              disabled={!documentReady}
              onClick={() => setDialog('publish')}
            >
              发布作品
            </button>
            <button title="PenStudio Agent" onClick={() => setAgentOpen(!agentOpen)}>
              <Sparkles size={17} />
            </button>
            <span className="cv-avatar">{(user?.nickname || user?.name || 'L')[0]}</span>
          </div>
        </header>
      )}
    </>
  );
}
