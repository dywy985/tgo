import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Info } from 'lucide-react';

/**
 * Test component to verify language switching functionality
 * This component can be temporarily added to test the i18n implementation
 */
const LanguageSwitchingTest: React.FC = () => {
  const { t, i18n } = useTranslation();

  const testTranslations = [
    { key: 'common.settings', expected: { zh: '设置', en: 'Settings' } },
    { key: 'common.about', expected: { zh: '关于', en: 'About' } },
    { key: 'auth.logout', expected: { zh: '退出登录', en: 'Logout' } },
    { key: 'settings.title', expected: { zh: '设置', en: 'Settings' } },
    { key: 'settings.language.title', expected: { zh: '语言设置', en: 'Language Settings' } },
    { key: 'about.version', expected: { zh: '版本', en: 'Version' } },
  ];

  const currentLang = i18n.language?.split('-')[0] || 'zh';

  const switchLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-800">Language Switching Test</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">Current Language: <strong>{currentLang}</strong></p>
            <div className="flex gap-2">
              <button
                onClick={() => switchLanguage('zh')}
                className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                  currentLang === 'zh' 
                    ? 'bg-blue-100 text-blue-700 border-blue-300' 
                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                中文 (Chinese)
              </button>
              <button
                onClick={() => switchLanguage('en')}
                className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                  currentLang === 'en' 
                    ? 'bg-blue-100 text-blue-700 border-blue-300' 
                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                English
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-3">Translation Tests</h3>
            <div className="space-y-2">
              {testTranslations.map((test, index) => {
                const actualValue = t(test.key);
                const expectedValue = test.expected[currentLang as keyof typeof test.expected];
                const isCorrect = actualValue === expectedValue;
                
                return (
                  <div key={index} className="flex items-center gap-3 p-2 rounded-md bg-gray-50">
                    {isCorrect ? (
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">
                        {test.key}
                      </div>
                      <div className="text-xs text-gray-600">
                        Expected: <span className="font-mono">{expectedValue}</span> | 
                        Actual: <span className="font-mono">{actualValue}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-3">Live Translation Examples</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-blue-50 rounded-md">
                <h4 className="font-medium text-blue-800">{t('common.settings')}</h4>
                <p className="text-sm text-blue-600">{t('settings.subtitle')}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-md">
                <h4 className="font-medium text-green-800">{t('settings.language.title')}</h4>
                <p className="text-sm text-green-600">{t('settings.language.description')}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-md">
                <h4 className="font-medium text-purple-800">{t('common.about')}</h4>
                <p className="text-sm text-purple-600">{t('about.version')}: 1.0.0</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-md">
                <h4 className="font-medium text-orange-800">{t('settings.account.title')}</h4>
                <p className="text-sm text-orange-600">{t('auth.user')} / {t('auth.agent')}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-800 mb-3">Persistence Test</h3>
            <div className="p-3 bg-yellow-50 rounded-md">
              <p className="text-sm text-yellow-800">
                <strong>Instructions:</strong> Switch languages above, then refresh the page. 
                The selected language should persist.
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                Storage key: <span className="font-mono">tgo-language</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LanguageSwitchingTest;
