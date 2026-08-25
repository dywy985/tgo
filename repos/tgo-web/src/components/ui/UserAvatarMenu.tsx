import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cog, Info, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';

interface UserAvatarMenuProps {
  size?: number; // avatar size in px
  onSettingsClick?: () => void;
  onAboutClick?: () => void;
}

const UserAvatarMenu: React.FC<UserAvatarMenuProps> = ({ size = 40, onSettingsClick, onAboutClick }) => {
  const { t } = useTranslation();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const avatarUrl = user?.avatar_url || undefined;
  const initials = useMemo(() => (user?.nickname || user?.username || 'U').slice(0, 1).toUpperCase(), [user]);

  useEffect(() => {
    if (!open) return;
    const calc = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 220;
      const gap = 8;
      const top = Math.min(window.innerHeight - 8, rect.bottom + gap);
      const left = Math.min(window.innerWidth - menuWidth - 8, rect.left);
      setPos({ top, left });
    };
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('scroll', calc, true);
    };
  }, [open]);

  const Avatar = (
    <div
      className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 text-gray-700 flex items-center justify-center cursor-pointer hover:opacity-90 transition"
      style={{ width: size, height: size }}
      onClick={() => setOpen(!open)}
      title={user?.nickname || user?.username || 'User'}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold text-lg select-none">{initials}</span>
      )}
    </div>
  );

  return (
    <div className="relative" ref={anchorRef}>
      {Avatar}
      {open && (
        <>
          {createPortal(<div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />, document.body)}
          {createPortal(
            <div
              className="fixed z-[1000] w-56 bg-white rounded-md shadow-lg border border-gray-200"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {user?.nickname || user?.username || t('auth.notLoggedIn', '未登录')}
                </div>
                {isAuthenticated && (
                  <div className="text-xs text-gray-500 truncate">
                    {user?.role === 'agent' ? t('auth.agent', 'Agent') : t('auth.user', 'User')}
                  </div>
                )}
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setOpen(false); onSettingsClick?.(); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Cog className="w-4 h-4" />
                  <span>{t('common.settings', '设置')}</span>
                </button>
                <button
                  onClick={() => { setOpen(false); onAboutClick?.(); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Info className="w-4 h-4" />
                  <span>{t('common.about', '关于')}</span>
                </button>
                {isAuthenticated && (
                  <button
                    onClick={async () => {
                      setOpen(false);
                      try {
                        await logout();
                      } catch (error) {
                        console.error('Logout failed:', error);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('auth.logout', '退出登录')}</span>
                  </button>
                )}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
};

export default UserAvatarMenu;
