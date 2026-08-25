import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MessagePayloadType, type PayloadSystem, SystemMessageExtraItem } from '@/types';

interface SystemMessageProps {
  payload: PayloadSystem;
}

/**
 * 解析系统消息模板，将 {0}, {1} 等占位符替换为 extra 中的对应名称
 * @param template 模板字符串，如 "您已接入人工客服，客服{0} 将为您服务"
 * @param extra 额外信息数组，如 [{ uid: "xxx", name: "Administrator" }]
 * @returns 解析后的内容片段数组
 */
function parseSystemMessageContent(
  template: string,
  extra?: SystemMessageExtraItem[]
): React.ReactNode[] {
  if (!extra || extra.length === 0) {
    return [template];
  }

  const result: React.ReactNode[] = [];
  // 匹配 {0}, {1}, {2} 等占位符
  const regex = /\{(\d+)\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    // 添加占位符之前的普通文本
    if (match.index > lastIndex) {
      result.push(template.slice(lastIndex, match.index));
    }

    // 获取占位符索引
    const placeholderIndex = parseInt(match[1], 10);
    const extraItem = extra[placeholderIndex];

    if (extraItem?.name) {
      // 用高亮样式包裹名称
      result.push(
        <span
          key={`extra-${placeholderIndex}`}
          className="font-medium text-gray-600 dark:text-gray-300 mx-0.5"
        >
          {extraItem.name}
        </span>
      );
    } else {
      // 如果没有找到对应的 extra，保留原占位符
      result.push(match[0]);
    }

    lastIndex = regex.lastIndex;
  }

  // 添加最后一段普通文本
  if (lastIndex < template.length) {
    result.push(template.slice(lastIndex));
  }

  return result;
}

/**
 * 系统消息组件
 * 显示类似微信的 "xxx加入群聊" 风格的系统通知
 */
const SystemMessage: React.FC<SystemMessageProps> = ({ payload }) => {
  const { t } = useTranslation();

  const localizedContent = useMemo(() => {
    const { type, extra } = payload;
    const hasExtra = extra && extra.length > 0;

    switch (type) {
      case MessagePayloadType.SYSTEM_STAFF_ASSIGNED:
        return parseSystemMessageContent(
          t('chat.messages.system.staffAssigned', 'You have been connected to customer service. Agent {0} will assist you.'),
          extra
        );
      case MessagePayloadType.SESSION_TRANSFERRED:
        return parseSystemMessageContent(
          t('chat.messages.system.sessionTransferred', 'Session transferred. Agent {0} has transferred you to Agent {1}.'),
          extra
        );
      case MessagePayloadType.SYSTEM_SESSION_CLOSED:
        if (!hasExtra) {
          return [t('chat.messages.system.sessionClosedEmpty', 'Session ended.')];
        }
        return parseSystemMessageContent(
          t('chat.messages.system.sessionClosed', 'Session ended. Agent {0} has completed the service.'),
          extra
        );
      case MessagePayloadType.MEMORY_CLEARED:
        return [t('chat.messages.system.memoryCleared', 'Memory cleared, AI will restart the conversation')];
      default:
        // Fallback to original content for unknown types
        return parseSystemMessageContent(payload.content, payload.extra);
    }
  }, [payload, t]);

  return (
    <div className="flex justify-center my-3">
      <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-gray-100/80 dark:bg-gray-700/50 text-[11px] text-gray-500 dark:text-gray-400 max-w-[90%]">
        <span className="text-center leading-relaxed">
          {localizedContent}
        </span>
      </div>
    </div>
  );
};

export default SystemMessage;
