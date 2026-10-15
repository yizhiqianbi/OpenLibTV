import React, { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { useLocalState } from '../../hooks/useLocalState.ts';
import { createFilmDocument } from '../../services/interactive-film/document.ts';
import {
  listFilmDocuments,
  saveFilmDocument,
  copyFilmDocument,
  renameFilmDocument,
  deleteFilmDocument,
  restoreFilmDocument,
  subscribeFilmDocuments,
} from '../../services/interactive-film/repository.ts';

function sortEntries(entries, mode) {
  return [...entries].sort((a, b) => {
    if (mode === 'name')
      return String(a.name || a.title || '').localeCompare(
        String(b.name || b.title || ''),
        'zh-CN',
      );
    return (
      Number(b.updatedAt || b.date || b.updatedAtMs || b.createdAtMs || 0) -
      Number(a.updatedAt || a.date || a.updatedAtMs || a.createdAtMs || 0)
    );
  });
}

function isDescendantFolder(items, folderId, candidateId) {
  let parentId = items.find((item) => item.id === candidateId)?.folder ?? null;
  const visited = new Set();
  while (parentId && !visited.has(parentId)) {
    if (parentId === folderId) return true;
    visited.add(parentId);
    parentId = items.find((item) => item.id === parentId)?.folder ?? null;
  }
  return false;
}

export default function ProjectPage({ navigate, login, user, toast }) {
  const [films, setFilms] = useState([]),
    [filmError, setFilmError] = useState('');
  const refreshFilms = useCallback(() => {
    try {
      setFilms(listFilmDocuments());
      setFilmError('');
    } catch (error) {
      setFilmError(error.message);
    }
  }, []);
  useEffect(() => {
    refreshFilms();
    return subscribeFilmDocuments(refreshFilms);
  }, [refreshFilms]);
  const filmAction = (action) => {
    try {
      action();
      setMenu(null);
    } catch (error) {
      setFilmError(error.message);
    }
  };
  const createFilm = () =>
    filmAction(() => {
      const film = createFilmDocument();
      saveFilmDocument(film);
      navigate('/interactive-film?projectId=' + encodeURIComponent(film.id));
    });
  const [projects, setProjects] = useLocalState('libtv-projects', []),
    [query, setQuery] = useState(''),
    [modal, setModal] = useState(null),
    [name, setName] = useState(''),
    [trash, setTrash] = useState(false),
    [folder, setFolder] = useState(null),
    [menu, setMenu] = useState(null),
    [sort, setSort] = useState('updated'),
    [moveTarget, setMoveTarget] = useState(null);
  const add = () => {
    if (!user) return login();
    setModal('folder');
    setName('新建文件夹');
  };
  const create = () => {
    if (!user) return login();
    const id = crypto.randomUUID();
    setProjects((p) => [
      ...p,
      { id, name: '未命名项目', type: 'project', folder, date: Date.now() },
    ]);
    navigate('/canvas?projectId=' + id);
  };
  const shown = sortEntries(
    projects.filter((p) => !!p.deleted === trash && p.folder === folder && p.name.includes(query)),
    sort,
  );
  const shownFilms = folder
    ? []
    : sortEntries(
        films.filter((film) => Boolean(film.deletedAt) === trash && film.title.includes(query)),
        sort,
      );
  const movingId = modal?.type === 'move' ? modal.projectId : menu;
  const moveFolders = projects.filter(
    (item) =>
      item.type === 'folder' &&
      !item.deleted &&
      item.id !== movingId &&
      !isDescendantFolder(projects, movingId, item.id),
  );
  return (
    <div className="project-page page-inner">
      <div className="project-toolbar">
        <div className="row">
          <button
            className="text-button"
            onClick={() => {
              if (trash) {
                setTrash(false);
              } else if (folder) setFolder(null);
              else navigate('/');
            }}
          >
            <Icon name="back" size={14} /> 返回
          </button>
          <span className="vertical-divider" />
          <strong>
            {trash ? '回收站' : folder ? projects.find((p) => p.id === folder)?.name : '全部项目'}
          </strong>
        </div>
        <div className="row">
          <div className="search-field">
            <Icon name="search" />
            <input
              placeholder="搜索项目"
              aria-label="搜索项目"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className="soft-button"
            onClick={() => {
              setTrash(!trash);
              setFolder(null);
            }}
          >
            <Icon name="trash" /> {trash ? '全部项目' : '回收站'}
          </button>
          <button className="soft-button" onClick={add}>
            <Icon name="folder-add" /> 新建文件夹
          </button>
          <label className="project-sort">
            <span>排序</span>
            <select
              aria-label="排序项目"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="updated">最近更新</option>
              <option value="name">名称</option>
            </select>
          </label>
        </div>
      </div>
      <div className="project-grid">
        {!trash && (
          <article className="project-card">
            <button className="project-thumb new-project" onClick={create}>
              <Icon name="add" size={24} />
              <strong>开始创作</strong>
            </button>
            <p>创建新的视频项目</p>
          </article>
        )}
        {!trash && !folder && (
          <article className="project-card">
            <button className="project-thumb new-project" onClick={createFilm}>
              <Icon name="add" size={24} />
              <strong>互动影游</strong>
            </button>
            <p>创建分支剧情与互动玩法</p>
          </article>
        )}
        {shownFilms.map((film) => (
          <article className="project-card" key={film.id}>
            <button
              className="project-thumb film-project-thumb"
              onClick={() =>
                !trash && navigate('/interactive-film?projectId=' + encodeURIComponent(film.id))
              }
            >
              <Icon name="artboard" size={56} />
              <span className="film-project-badge">互动影游</span>
            </button>
            <div className="project-card-label">
              <span>{film.title}</span>
              <div className="popover-anchor">
                <button
                  aria-label={`影游项目菜单 ${film.title}`}
                  className="icon-button"
                  onClick={() => setMenu(menu === film.id ? null : film.id)}
                >
                  <Icon name="more" />
                </button>
                {menu === film.id && (
                  <div className="popover project-menu">
                    {trash ? (
                      <>
                        <button onClick={() => filmAction(() => restoreFilmDocument(film.id))}>
                          恢复
                        </button>
                        <button
                          onClick={() =>
                            filmAction(() => deleteFilmDocument(film.id, { permanent: true }))
                          }
                        >
                          永久删除
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setModal({ filmId: film.id });
                            setName(film.title);
                            setMenu(null);
                          }}
                        >
                          重命名
                        </button>
                        <button onClick={() => filmAction(() => copyFilmDocument(film.id))}>
                          复制
                        </button>
                        <button onClick={() => filmAction(() => deleteFilmDocument(film.id))}>
                          移至回收站
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
        {shown.map((p) => (
          <article className="project-card" key={p.id}>
            <button
              className="project-thumb"
              onDoubleClick={() =>
                p.type === 'folder' ? setFolder(p.id) : navigate('/canvas?projectId=' + p.id)
              }
              onClick={() =>
                p.type === 'folder' ? setFolder(p.id) : navigate('/canvas?projectId=' + p.id)
              }
            >
              <Icon name={p.type === 'folder' ? 'folder' : 'artboard'} size={56} />
            </button>
            <div className="project-card-label">
              <span>{p.name}</span>
              <div className="popover-anchor">
                <button
                  aria-label="项目菜单"
                  className="icon-button"
                  onClick={() => setMenu(menu === p.id ? null : p.id)}
                >
                  <Icon name="more" />
                </button>
                {menu === p.id && (
                  <div className="popover project-menu">
                    {trash ? (
                      <>
                        <button
                          onClick={() => {
                            setProjects((ps) =>
                              ps.map((x) => (x.id === p.id ? { ...x, deleted: false } : x)),
                            );
                            setMenu(null);
                          }}
                        >
                          恢复
                        </button>
                        <button
                          onClick={() => {
                            setProjects((ps) => ps.filter((x) => x.id !== p.id));
                            setMenu(null);
                          }}
                        >
                          永久删除
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setModal(p.id);
                            setName(p.name);
                            setMenu(null);
                          }}
                        >
                          重命名
                        </button>
                        <button
                          onClick={() => {
                            setMoveTarget(p.folder || null);
                            setModal({ type: 'move', projectId: p.id });
                            setMenu(null);
                          }}
                        >
                          移动到文件夹
                        </button>
                        <button
                          onClick={() => {
                            setProjects((ps) => [
                              ...ps,
                              { ...p, id: crypto.randomUUID(), name: p.name + ' 副本' },
                            ]);
                            setMenu(null);
                          }}
                        >
                          复制
                        </button>
                        <button
                          onClick={() => {
                            setProjects((ps) =>
                              ps.map((x) => (x.id === p.id ? { ...x, deleted: true } : x)),
                            );
                            setMenu(null);
                            toast('已移入回收站');
                          }}
                        >
                          移至回收站
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {filmError && (
        <p role="alert">
          {filmError}
          <button onClick={refreshFilms}>重试读取影游项目</button>
        </p>
      )}
      {shown.length === 0 && shownFilms.length === 0 && (
        <div className="projects-empty">
          {trash ? '回收站为空' : query ? '没有找到相关项目' : '暂无项目'}
        </div>
      )}
      {modal && (
        <Modal
          onClose={() => setModal(null)}
          className="small-modal"
          title={
            modal?.type === 'move' ? '移动到文件夹' : modal === 'folder' ? '新建文件夹' : '重命名'
          }
        >
          {modal?.type === 'move' ? (
            <>
              <h2>移动到文件夹</h2>
              <label>
                目标文件夹
                <select
                  className="form-input"
                  autoFocus
                  aria-label="目标文件夹"
                  value={moveTarget || ''}
                  onChange={(event) => setMoveTarget(event.target.value || null)}
                >
                  <option value="">全部项目</option>
                  {moveFolders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <h2>{modal === 'folder' ? '新建文件夹' : '重命名'}</h2>
              <label>
                名称
                <input
                  className="form-input"
                  autoFocus
                  maxLength={50}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </>
          )}
          <div className="modal-buttons">
            <button className="soft-button" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className="white-button"
              disabled={modal?.type !== 'move' && !name.trim()}
              onClick={() => {
                if (modal?.type === 'move') {
                  setProjects((ps) =>
                    ps.map((project) =>
                      project.id === modal.projectId ? { ...project, folder: moveTarget } : project,
                    ),
                  );
                  setModal(null);
                  return;
                }
                if (modal?.filmId) {
                  filmAction(() => renameFilmDocument(modal.filmId, name.trim()));
                  setModal(null);
                  return;
                }
                setProjects((ps) =>
                  modal === 'folder'
                    ? [
                        ...ps,
                        {
                          id: crypto.randomUUID(),
                          name: name.trim(),
                          type: 'folder',
                          folder,
                          date: Date.now(),
                        },
                      ]
                    : ps.map((p) => (p.id === modal ? { ...p, name: name.trim() } : p)),
                );
                setModal(null);
              }}
            >
              确定
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
