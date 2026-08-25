import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Globe, Check, ChevronDown } from 'lucide-react';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

const languages: Language[] = [
  { code: 'system', name: 'Auto', nativeName: 'Auto', flag: '🌐' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' }
];

type Placement = 'bottom' | 'right';

interface LanguageSelectorProps {
  variant?: 'icon' | 'button';
  placement?: Placement; // dropdown placement relative to the trigger
  usePortal?: boolean; // render dropdown in a portal to avoid clipping
}

/**
 * Language Selector Component
 * variant="icon" 仅显示图标（适合窄侧边栏）；variant="button" 显示图标+文字
 * placement 控制下拉方向：bottom(默认) 或 right（适合贴边窄栏）
 */
const LanguageSelector: React.FC<LanguageSelectorProps> = ({ variant = 'icon', placement = 'bottom', usePortal = true }) => {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [pref, setPref] = useState<string>(() => {
    try { return localStorage.getItem('tgo-language') || 'system'; } catch { return 'system'; }
  });

  const mapToSupportedLang = (lng?: string | null): 'zh' | 'en' => {
    const code = (lng || '').toLowerCase();
    if (code.startsWith('zh')) return 'zh';
    return 'en';
  };

  const detectSystemLanguage = (): 'zh' | 'en' => {
    if (typeof navigator !== 'undefined') {
      const cand = (Array.isArray((navigator as any).languages) && (navigator as any).languages[0]) || (navigator as any).language;
      return mapToSupportedLang(cand);
    }
    return 'zh';
  };

  const normalizedCode = useMemo(() => (i18n.language || 'zh').split('-')[0], [i18n.language]);
  const selectedCode = (pref === 'system' || pref === 'auto') ? 'system' : (normalizedCode as 'zh' | 'en');
  const currentLanguage = languages.find(lang => lang.code === selectedCode) || languages[0];

  const currentNativeName = selectedCode === 'system'
    ? t('settings.language.followSystem', 'Auto')
    : currentLanguage.nativeName;

  const handleLanguageChange = (languageCode: string) => {
    if (languageCode === 'system' || languageCode === 'auto') {
      const resolved = detectSystemLanguage();
      i18n.changeLanguage(resolved);
      try { localStorage.setItem('tgo-language', 'system'); } catch {}
      try { document.documentElement.setAttribute('lang', resolved); } catch {}
      setPref('system');
    } else {
      i18n.changeLanguage(languageCode);
      try { localStorage.setItem('tgo-language', languageCode); } catch {}
      try { document.documentElement.setAttribute('lang', languageCode); } catch {}
      setPref(languageCode);
    }
    setIsOpen(false);
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'tgo-language') {
        setPref(e.newValue || 'system');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);


  const dropdownPosition = placement === 'right'
    ? 'left-full ml-2 top-0'
    : 'right-0 top-full mt-1';

  // Compute fixed position for portal dropdown to avoid clipping by parent overflow/stacking contexts
  useEffect(() => {
    if (!isOpen || !usePortal) return;
    const calc = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 192; // w-48
      const gap = 8;
      let top = 0;
      let left = 0;
      if (placement === 'right') {
        top = Math.max(8, Math.min(window.innerHeight - 8, rect.top));
        left = Math.min(window.innerWidth - menuWidth - 8, rect.right + gap);
      } else {
        top = Math.min(window.innerHeight - 8, rect.bottom + gap);
        left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth));
      }
      setMenuPos({ top, left });
    };
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('scroll', calc, true);
    };
  }, [isOpen, placement, usePortal]);

  return (
    <div className="relative" ref={anchorRef}>
      {/* Trigger */}
      {variant === 'icon' ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Select language"
          title={currentNativeName}
        >
          <span className="text-base" role="img" aria-label={currentLanguage.name}>{currentLanguage.flag}</span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          aria-label="Select language"
        >
          <Globe className="w-4 h-4" />
          <span className="hidden sm:inline">{currentLanguage.flag}</span>
          <span className="hidden md:inline">{currentNativeName}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Dropdown */}
      {isOpen && (
        usePortal
          ? (
              <>
                {createPortal(
                  <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />, document.body
                )}
                {createPortal(
                  <div
                    className="fixed w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-[1000]"
                    style={{ top: menuPos.top, left: menuPos.left }}
                  >
                    <div className="py-1">
                      {languages.map((language) => (
                        <button
                          key={language.code}
                          onClick={() => handleLanguageChange(language.code)}
                          className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                            selectedCode === language.code ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-lg" role="img" aria-label={language.name}>{language.flag}</span>
                            <div className="text-left min-w-0">
                              <div className="font-medium truncate">{language.code === 'system' ? t('settings.language.followSystem', 'Auto') : language.nativeName}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{language.name}</div>
                            </div>
                          </div>
                          {selectedCode === language.code && (
                            <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>,
                  document.body
                )}
              </>
            )
          : (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                <div className={`absolute ${dropdownPosition} w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20`}>
                  <div className="py-1">
                    {languages.map((language) => (
                      <button
                        key={language.code}
                        onClick={() => handleLanguageChange(language.code)}
                        className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                          selectedCode === language.code ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-lg" role="img" aria-label={language.name}>{language.flag}</span>
                          <div className="text-left min-w-0">
                            <div className="font-medium truncate">{language.code === 'system' ? t('settings.language.followSystem', 'Auto') : language.nativeName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{language.name}</div>
                          </div>
                        </div>
                        {selectedCode === language.code && (
                          <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )
      )}
    </div>
  );
};

export default LanguageSelector;
