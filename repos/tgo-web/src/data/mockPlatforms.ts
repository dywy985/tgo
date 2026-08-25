import type { Platform, PlatformStatusConfig, PlatformTypeConfig } from '@/types';

export const mockPlatforms: Platform[] = [
  {
    id: 'website',
    name: '官网客服',
    icon: 'Globe',
    iconColor: 'text-blue-600',
    status: 'connected',
    statusText: '已连接',
    statusColor: 'bg-green-500',
    type: 'website',
    description: '官方网站客服接入平台',
    config: {
      domain: 'https://example.com',
      embedCode: '<script>...</script>'
    }
  },
  {
    id: 'wechat',
    name: '微信公众号',
    icon: 'MessageSquare',
    iconColor: 'text-green-600',
    status: 'connected',
    statusText: '已连接',
    statusColor: 'bg-green-500',
    type: 'wechat',
    description: '微信公众号消息接入',
    config: {
      appId: 'wx1234567890',
      appSecret: '***hidden***',
      token: 'your_token'
    }
  },
  {
    id: 'tiktok',
    name: '抖音',
    icon: 'Video',
    iconColor: 'text-black',
    status: 'unconfigured',
    statusText: '未配置',
    statusColor: 'bg-gray-400',
    type: 'tiktok',
    description: '抖音私信接入平台',
    config: {}
  },
  {
    id: 'email',
    name: '邮件接入',
    icon: 'Mail',
    iconColor: 'text-red-600',
    status: 'error',
    statusText: '连接失败',
    statusColor: 'bg-red-500',
    type: 'email',
    description: '邮件客服接入平台',
    config: {
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      username: 'support@example.com',
      lastError: 'Authentication failed'
    }
  },
  {
    id: 'phone',
    name: '电话呼叫中心',
    icon: 'Phone',
    iconColor: 'text-gray-500',
    status: 'disabled',
    statusText: '未启用',
    statusColor: 'bg-gray-400',
    type: 'phone',
    description: '电话客服接入平台',
    config: {}
  },
  {
    id: 'custom',
    name: '自定义平台 (Webhook/API)',
    icon: 'Webhook',
    iconColor: 'text-purple-600',
    status: 'pending',
    statusText: '待配置',
    statusColor: 'bg-yellow-400',
    type: 'custom',
    description: '通过Webhook和API接入的自定义平台',
    config: {
      webhookUrl: 'https://api.example.com/webhook/ch_abc123xyz',
      secretKey: 'sk_test_1234567890abcdef',
      outgoingUrl: '',
      outgoingToken: ''
    }
  }
];

// 平台状态配置
export const PLATFORM_STATUS: Record<string, PlatformStatusConfig> = {
  connected: {
    label: '已连接',
    bgColor: 'bg-green-500',
    textColor: 'text-green-600'
  },
  pending: {
    label: '待配置',
    bgColor: 'bg-yellow-400',
    textColor: 'text-yellow-600'
  },
  unconfigured: {
    label: '未配置',
    bgColor: 'bg-gray-400',
    textColor: 'text-gray-500'
  },
  disabled: {
    label: '未启用',
    bgColor: 'bg-gray-400',
    textColor: 'text-gray-500'
  },
  error: {
    label: '连接失败',
    bgColor: 'bg-red-500',
    textColor: 'text-red-600'
  }
};

// 平台类型配置
export const PLATFORM_TYPES: Record<string, PlatformTypeConfig> = {
  website: {
    label: '官网客服',
    color: 'text-blue-600'
  },
  wechat: {
    label: '微信公众号',
    color: 'text-green-600'
  },
  tiktok: {
    label: '抖音',
    color: 'text-black'
  },
  email: {
    label: '邮件接入',
    color: 'text-red-600'
  },
  phone: {
    label: '电话呼叫中心',
    color: 'text-gray-500'
  },
  custom: {
    label: '自定义平台',
    color: 'text-purple-600'
  }
};

// 默认的自定义平台配置
export const DEFAULT_CUSTOM_CONFIG = {
  webhookUrl: '',
  secretKey: '',
  outgoingUrl: '',
  outgoingToken: '',
  enabled: false
} as const;

