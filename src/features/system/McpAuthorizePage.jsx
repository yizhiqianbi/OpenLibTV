import '../shared/secondary/styles.css';
import React, { useEffect, useRef, useState } from 'react';
import { Monitor } from 'lucide-react';
import { STATIC } from '../shared/secondary/libtvAssets.js';

const oauthScopes = {
  'libtv:account:read': ['确认你的身份', 'PenStudio 账号 ID 与昵称'],
  'libtv:project:read': ['读取你的项目', '画布结构、节点与项目状态'],
  'libtv:project:write': ['修改你的项目', '在既有画布上应用改动'],
  'libtv:media:write': ['上传素材到你的账号', '图片 / 视频 / 音频写入你的素材库'],
  'libtv:task:write': ['创建生成任务并读取结果', '提交生成、查询任务状态与产物'],
  'libtv:export:write': ['读取导出成品', '导出就绪状态与成品链接'],
};

function McpAuthorize({ login, user, asset, toast }) {
  const query = new URLSearchParams(location.search),
    transaction = query.get('transaction')?.trim(),
    callback = query.get('callback')?.trim(),
    scopes = (query.get('scope') || '').trim().split(/\s+/).filter(Boolean).slice(0, 32),
    client = query.get('client') || 'generic',
    valid =
      !!transaction &&
      transaction.length <= 8192 &&
      callback === 'https://mcp.liblib.tv/oauth/login/callback';
  const prompted = useRef(false),
    [status, setStatus] = useState('consent');
  useEffect(() => {
    if (valid && !user && !prompted.current) {
      prompted.current = true;
      login();
    }
  }, [valid, user, login]);
  if (!valid)
    return (
      <main className="mcp-page">
        <section className="mcp-card">
          <h1 className="mcp-title">授权请求无效</h1>
          <p className="mcp-byline">链接不完整或已过期，请回到客户端重新发起连接。</p>
        </section>
      </main>
    );
  if (user?.localWorkspace)
    return (
      <main className="mcp-page">
        <section className="mcp-card">
          <h1 className="mcp-title">账号授权暂不可用</h1>
          <p className="mcp-byline">当前版本使用本地工作区，尚未接入账号和 MCP 授权服务。</p>
        </section>
      </main>
    );
  if (!user)
    return (
      <main className="mcp-page">
        <section className="mcp-card">
          <h1 className="mcp-title">登录</h1>
          <p className="mcp-byline">请先登录 PenStudio，登录后继续授权。</p>
          <button className="mcp-allowButton" onClick={login}>
            登录
          </button>
        </section>
      </main>
    );
  const clientIcon =
    client === 'chatgpt'
      ? 'chatgpt.2sorx693dva_x.png'
      : client === 'codex'
        ? 'codex.2ihityca9dmfk.png'
        : null;
  function decide() {
    setStatus('submitting');
    setTimeout(() => {
      setStatus('error');
      toast?.('授权服务尚未连接，当前为前端演示');
    }, 600);
  }
  return (
    <main className="mcp-page">
      <section className="mcp-card">
        <div className="mcp-pair">
          <span className="mcp-clientBadge">
            {clientIcon ? (
              <img className="mcp-clientIcon" src={asset(STATIC + clientIcon)} alt="" />
            ) : (
              <Monitor size={24} />
            )}
          </span>
          <span className="mcp-dots" />
          <span className="mcp-mark">
            <img src="/assets/penstudio-mark.svg" alt="PenStudio" />
          </span>
        </div>
        <h1 className="mcp-title">此应用想要访问 PenStudio</h1>
        <p className="mcp-byline">
          代表 <b>{user.name}</b> 的 PenStudio 账号
        </p>
        {scopes.length > 0 && (
          <div className="mcp-allow">
            <header className="mcp-allowHeader">这将允许此应用访问：</header>
            <ul className="mcp-scopeList">
              {scopes.map((scope) => (
                <li className="mcp-scopeItem" key={scope}>
                  <span className="mcp-scopeTitle">{oauthScopes[scope]?.[0] || scope}</span>
                  {oauthScopes[scope] && (
                    <small className="mcp-scopeDetail">{oauthScopes[scope][1]}</small>
                  )}
                </li>
              ))}
            </ul>
            <div className="mcp-rawScope">scope: {scopes.join(' ')}</div>
          </div>
        )}
        {status === 'submitting' ? (
          <p className="mcp-status" role="status">
            正在提交授权决定...
          </p>
        ) : (
          <>
            {status === 'error' && (
              <p className="mcp-status" role="alert">
                授权未完成，请重试。如果仍然失败，请回到客户端重新发起连接。
              </p>
            )}
            <div className="mcp-actions">
              <button className="mcp-denyButton" onClick={decide}>
                拒绝
              </button>
              <button className="mcp-allowButton" onClick={decide}>
                允许
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default McpAuthorize;
