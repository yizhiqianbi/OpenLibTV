import { useCallback, useEffect, useRef, useState } from 'react';
import { useData, useLocalState } from '../data.js';
import { readStoredString, writeStoredString } from '../services/storage.ts';
import { LOCAL_WORKSPACE_USER } from '../services/workspace-access.ts';

export function useAppUI(navigateTo) {
  const [modal, setModal] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [plugins, setPlugins] = useState(false);
  const [help, setHelp] = useState(false);
  const [account, setAccount] = useState(false);
  const [notification, setNotification] = useState('');
  const user = LOCAL_WORKSPACE_USER;
  const [theme, setTheme] = useLocalState('libtv-theme', 'dark');
  const [promo, setPromo] = useLocalState('libtv-promo-banner', true);
  const [collapsed, setCollapsed] = useLocalState('libtv-sidebar-collapsed', false);
  const [newcomer, setNewcomer] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const config = useData('shell-config', {});
  const notificationTimer = useRef();

  const toast = useCallback((message) => {
    clearTimeout(notificationTimer.current);
    setNotification(message);
    notificationTimer.current = setTimeout(() => setNotification(''), 4500);
  }, []);
  useEffect(() => () => clearTimeout(notificationTimer.current), []);

  const login = useCallback(() => toast('当前版本使用本地工作区，无需登录'), [toast]);
  const member = useCallback(() => setModal('member'), []);
  const navigate = useCallback(
    (url) => {
      navigateTo(url);
      setDrawer(false);
      setPlugins(false);
      setHelp(false);
      setAccount(false);
    },
    [navigateTo],
  );

  const dismissNewcomer = useCallback(() => {
    setNewcomer(false);
    try {
      writeStoredString('libtv_login_guide_popup', new Date().toDateString());
    } catch {
      // Dismissal still applies for this mounted session if browser storage is full.
    }
  }, []);
  useEffect(() => {
    if (user) {
      setNewcomer(false);
      return;
    }
    if (readStoredString('libtv_login_guide_popup') === new Date().toDateString()) return;
    const timer = setTimeout(() => setNewcomer(true), config.newcomer?.showDelayMs || 10000);
    return () => clearTimeout(timer);
  }, [user, config.newcomer?.showDelayMs]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--promo-height', promo ? '60px' : '0px');
  }, [theme, promo]);
  useEffect(() => {
    const timer = setInterval(() => setBannerIndex((index) => (index + 1) % 3), 6000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const closeMenus = (event) => {
      if (event.key !== 'Escape') return;
      setDrawer(false);
      setPlugins(false);
      setHelp(false);
      setAccount(false);
    };
    window.addEventListener('keydown', closeMenus);
    return () => window.removeEventListener('keydown', closeMenus);
  }, []);

  return {
    modal,
    setModal,
    drawer,
    setDrawer,
    plugins,
    setPlugins,
    help,
    setHelp,
    account,
    setAccount,
    notification,
    setNotification,
    user,
    theme,
    setTheme,
    promo,
    setPromo,
    collapsed,
    setCollapsed,
    newcomer: newcomer && !user,
    setNewcomer,
    bannerIndex,
    setBannerIndex,
    config,
    toast,
    login,
    member,
    navigate,
    dismissNewcomer,
  };
}
