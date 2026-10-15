import React from 'react';
import { assetTags, selectedLibraryEntries } from '../../../services/asset-library/model.ts';
import {
  AssetDeleteDialog,
  AssetFolderCoverDialog,
  AssetMoveDialog,
  AssetNameDialog,
  AssetPreviewDialog,
  AssetTagsDialog,
  AssetUploadDialog,
} from './AssetLibraryDialogs.jsx';

export default function AssetLibraryOverlays({ controller: c }) {
  const { dialog, library, closeDialog } = c;
  const item = library.assets.find((item) => item.id === c.preview);
  const selection = dialog?.type === 'delete' ? selectedLibraryEntries(library, dialog.keys) : null;
  // The preview stays mounted underneath an edit dialog, preserving native playback and focus.
  return (
    <>
      {item && (
        <AssetPreviewDialog
          item={item}
          library={library}
          onClose={() => c.setPreview(null)}
          onRename={() =>
            c.show('rename', [`asset:${item.id}`], { entry: { kind: 'asset', value: item } })
          }
          onEditTags={() => c.show('tags', [`asset:${item.id}`], { initial: assetTags(item) })}
          onDownload={() => c.download([`asset:${item.id}`])}
          onCreateCanvas={() => c.createCanvas([`asset:${item.id}`])}
        />
      )}
      {dialog?.type === 'create-folder' && (
        <AssetNameDialog
          title="新建文件夹"
          onClose={closeDialog}
          onSave={(name) => !!c.createFolder(name, dialog.parentId)}
        />
      )}
      {dialog?.type === 'rename' && (
        <AssetNameDialog
          title="重命名"
          initial={dialog.entry.value.name}
          maximum={dialog.entry.kind === 'folder' ? 20 : 50}
          onClose={closeDialog}
          onSave={(name) => c.rename(dialog.keys[0], name)}
        />
      )}
      {dialog?.type === 'folder-cover' && dialog.entry?.kind === 'folder' && (
        <AssetFolderCoverDialog
          folder={dialog.entry.value}
          library={library}
          onClose={closeDialog}
          onSave={(assetId) => c.setFolderCover(dialog.entry.value.id, assetId)}
        />
      )}
      {dialog?.type === 'upload' && (
        <AssetUploadDialog
          library={library}
          currentFolder={c.folder}
          onClose={closeDialog}
          onCreateFolder={c.createFolder}
          onSave={c.saveUpload}
        />
      )}
      {(dialog?.type === 'tags' || dialog?.type === 'filter') && (
        <AssetTagsDialog
          library={library}
          filter={dialog.type === 'filter'}
          batch={dialog.batch}
          initial={dialog.type === 'filter' ? c.tags : dialog.initial}
          onClose={closeDialog}
          onSave={(value) =>
            dialog.type === 'filter' ? c.applyTags(value) : c.tag(dialog.keys, value)
          }
        />
      )}
      {dialog?.type === 'move' && (
        <AssetMoveDialog
          library={library}
          keys={dialog.keys}
          onClose={closeDialog}
          onCreateFolder={c.createFolder}
          onSave={(target) => c.move(dialog.keys, target)}
        />
      )}
      {dialog?.type === 'delete' && (
        <AssetDeleteDialog
          count={selection.assets.length}
          folderCount={selection.folders.length}
          onClose={closeDialog}
          onSave={() => c.remove(dialog.keys)}
        />
      )}
    </>
  );
}
