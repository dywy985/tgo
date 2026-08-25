import React, { useState, useEffect } from 'react';
import { X, HelpCircle } from 'lucide-react';

/**
 * 鉴权类型枚举
 */
export type AuthType = 'none' | 'header' | 'query';

/**
 * 鉴权头部前缀类型
 */
export type AuthHeaderPrefix = 'basic' | 'bearer' | 'custom';

/**
 * 鉴权配置接口
 */
export interface AuthConfig {
  type: AuthType;
  headerPrefix?: AuthHeaderPrefix;
  key?: string;
  value?: string;
}

interface AuthMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: AuthConfig) => void;
  initialConfig?: AuthConfig;
}

/**
 * 鉴权方法设置弹窗组件
 */
const AuthMethodModal: React.FC<AuthMethodModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialConfig
}) => {
  const [authType, setAuthType] = useState<AuthType>(initialConfig?.type || 'none');
  const [headerPrefix, setHeaderPrefix] = useState<AuthHeaderPrefix>(initialConfig?.headerPrefix || 'custom');
  const [key, setKey] = useState(initialConfig?.key || '');
  const [value, setValue] = useState(initialConfig?.value || '');

  // 当 initialConfig 改变时或模态框打开时更新状态
  // 这确保了自动检测的鉴权配置能够正确显示在模态框中
  useEffect(() => {
    if (initialConfig && isOpen) {
      setAuthType(initialConfig.type || 'none');
      setHeaderPrefix(initialConfig.headerPrefix || 'custom');
      setKey(initialConfig.key || '');
      setValue(initialConfig.value || '');
    }
  }, [initialConfig, isOpen]);

  // 处理保存
  const handleSave = () => {
    const config: AuthConfig = {
      type: authType,
      ...(authType === 'header' && { headerPrefix }),
      ...(authType !== 'none' && { key, value })
    };
    
    onSave(config);
    onClose();
  };

  // 处理取消
  const handleCancel = () => {
    // 重置为初始值
    setAuthType(initialConfig?.type || 'none');
    setHeaderPrefix(initialConfig?.headerPrefix || 'custom');
    setKey(initialConfig?.key || '');
    setValue(initialConfig?.value || '');
    onClose();
  };

  // 获取键名占位符
  const getKeyPlaceholder = () => {
    if (authType === 'header') {
      return 'Authorization';
    } else if (authType === 'query') {
      return 'api_key';
    }
    return '';
  };

  // 获取值占位符
  const getValuePlaceholder = () => {
    if (authType === 'header') {
      if (headerPrefix === 'basic') {
        return 'Basic <credentials>';
      } else if (headerPrefix === 'bearer') {
        return 'Bearer <token>';
      } else {
        return '输入 API Key';
      }
    } else if (authType === 'query') {
      return '输入 API Key';
    }
    return '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">鉴权方法</h2>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 鉴权类型 */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-4">鉴权类型</h3>
            <div className="grid grid-cols-3 gap-3">
              <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                authType === 'none' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="authType"
                  value="none"
                  checked={authType === 'none'}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 mr-2 flex items-center justify-center ${
                  authType === 'none' ? 'border-blue-500' : 'border-gray-300'
                }`}>
                  {authType === 'none' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">无</span>
              </label>

              <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                authType === 'header' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="authType"
                  value="header"
                  checked={authType === 'header'}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 mr-2 flex items-center justify-center ${
                  authType === 'header' ? 'border-blue-500' : 'border-gray-300'
                }`}>
                  {authType === 'header' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">请求头</span>
              </label>

              <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                authType === 'query' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input
                  type="radio"
                  name="authType"
                  value="query"
                  checked={authType === 'query'}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded-full border-2 mr-2 flex items-center justify-center ${
                  authType === 'query' ? 'border-blue-500' : 'border-gray-300'
                }`}>
                  {authType === 'query' && (
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-700">查询参数</span>
              </label>
            </div>
          </div>

          {/* 鉴权头部前缀 - 仅在选择请求头时显示 */}
          {authType === 'header' && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-4">鉴权头部前缀</h3>
              <div className="grid grid-cols-3 gap-3">
                <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  headerPrefix === 'basic' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="headerPrefix"
                    value="basic"
                    checked={headerPrefix === 'basic'}
                    onChange={(e) => setHeaderPrefix(e.target.value as AuthHeaderPrefix)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 mr-2 flex items-center justify-center ${
                    headerPrefix === 'basic' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {headerPrefix === 'basic' && (
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-700">Basic</span>
                </label>

                <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  headerPrefix === 'bearer' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="headerPrefix"
                    value="bearer"
                    checked={headerPrefix === 'bearer'}
                    onChange={(e) => setHeaderPrefix(e.target.value as AuthHeaderPrefix)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 mr-2 flex items-center justify-center ${
                    headerPrefix === 'bearer' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {headerPrefix === 'bearer' && (
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-700">Bearer</span>
                </label>

                <label className={`relative flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  headerPrefix === 'custom' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="headerPrefix"
                    value="custom"
                    checked={headerPrefix === 'custom'}
                    onChange={(e) => setHeaderPrefix(e.target.value as AuthHeaderPrefix)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 mr-2 flex items-center justify-center ${
                    headerPrefix === 'custom' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {headerPrefix === 'custom' && (
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-700">Custom</span>
                </label>
              </div>
            </div>
          )}

          {/* 键和值输入 - 仅在非"无"类型时显示 */}
          {authType !== 'none' && (
            <>
              {/* 键 */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <label className="text-sm font-medium text-gray-700">键</label>
                  <HelpCircle className="w-4 h-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder={getKeyPlaceholder()}
                />
              </div>

              {/* 值 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">值</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder={getValuePlaceholder()}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthMethodModal;
