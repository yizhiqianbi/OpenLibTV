import React, { lazy, Suspense } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { asset } from '../../data.js';
const Membership = lazy(() => import('../../features/membership/MembershipModal.jsx'));

export default function GlobalOverlays({ ui }) {
  const { modal, setModal, config, toast, user, login, notification, setNotification } = ui;
  return (
    <Suspense fallback={null}>
      {(modal === 'member' || modal === 'points') && (
        <Membership
          mode={modal}
          user={user}
          login={login}
          toast={toast}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'contact' && (
        <Modal className="small-modal" title="联系客服" onClose={() => setModal(null)}>
          <h2>联系客服</h2>
          <p>原站 LibTV 客服（公开样本）</p>
          <img className="contact-qr" src={asset(config.contact?.url)} alt="LibTV 官方客服二维码" />
          <p className="muted">遇到问题？请联系客服获取帮助</p>
        </Modal>
      )}
      {notification && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {notification}
          <button aria-label="关闭通知" onClick={() => setNotification('')}>
            <Icon name="close-s" size={14} />
          </button>
        </div>
      )}
    </Suspense>
  );
}
