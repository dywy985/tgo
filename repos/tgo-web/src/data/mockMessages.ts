import type { Message } from '@/types';

export const mockMessages: Message[] = [
  {
    id: '1',
    type: 'system',
    content: '今天 10:30',
    timestamp: '2024-05-01T10:30:00Z'
  },
  {
    id: '2',
    type: 'visitor',
    content: '你好，我想问下我的订单 #ORD123 到哪了？',
    fromInfo: { name: '悟空', avatar: 'https://i.pravatar.cc/64?img=30', channel_id: 'visitor-1', channel_type: 1 },
    platform: 'wechat',
    avatar: 'https://i.pravatar.cc/64?img=30',
    timestamp: '2024-05-01T10:30:15Z',
    aiInfo: {
      title: '订单信息 #ORD123',
      status: '已识别',
      details: {
        status: '已发货',
        product: '智能降噪耳机 Pro',
        tracking: '顺丰 SF987654321'
      },
      actions: [
        { label: '插入物流信息', type: 'primary' },
        { label: '查看详情', type: 'secondary' }
      ]
    }
  },
  {
    id: '3',
    type: 'staff',
    content: '您好！我来帮您查询订单状态。',
    fromInfo: { name: '袁杰', avatar: 'https://i.pravatar.cc/40?img=0', channel_id: 'staff-1', channel_type: 1 },
    avatar: 'https://i.pravatar.cc/40?img=0',
    timestamp: '2024-05-01T10:30:30Z'
  },
  {
    id: '4',
    type: 'staff',
    content: '您的订单 #ORD123 已经发货，物流信息如下：\n\n📦 智能降噪耳机 Pro\n🚚 顺丰快递：SF987654321\n📍 当前状态：运输中\n🕐 预计送达：明天下午',
    fromInfo: { name: '袁杰', avatar: 'https://i.pravatar.cc/40?img=0', channel_id: 'staff-1', channel_type: 1 },
    avatar: 'https://i.pravatar.cc/40?img=0',
    timestamp: '2024-05-01T10:31:00Z'
  },
  {
    id: '5',
    type: 'visitor',
    content: '太好了！谢谢你的帮助 👍',
    fromInfo: { name: '悟空', avatar: 'https://i.pravatar.cc/64?img=30', channel_id: 'visitor-1', channel_type: 1 },
    platform: 'wechat',
    avatar: 'https://i.pravatar.cc/64?img=30',
    timestamp: '2024-05-01T10:31:15Z'
  },
  {
    id: '6',
    type: 'visitor',
    content: '对了，我还想问一下这个耳机的保修期是多久？',
    fromInfo: { name: '悟空', avatar: 'https://i.pravatar.cc/64?img=30', channel_id: 'visitor-1', channel_type: 1 },
    platform: 'wechat',
    avatar: 'https://i.pravatar.cc/64?img=30',
    timestamp: '2024-05-01T10:31:45Z',
    aiInfo: {
      title: '产品保修咨询',
      status: '待处理',
      details: {
        product: '智能降噪耳机 Pro',
        category: '保修政策'
      },
      actions: [
        { label: '插入保修信息', type: 'primary' },
        { label: '转接技术支持', type: 'secondary' }
      ]
    }
  },
  {
    id: '7',
    type: 'staff',
    content: '智能降噪耳机 Pro 享有 2 年质保服务，包括：\n\n✅ 硬件故障免费维修\n✅ 电池性能保障\n✅ 全国联保服务\n\n如果您在使用过程中遇到任何问题，随时联系我们的客服团队。',
    fromInfo: { name: '袁杰', avatar: 'https://i.pravatar.cc/40?img=0', channel_id: 'staff-1', channel_type: 1 },
    avatar: 'https://i.pravatar.cc/40?img=0',
    timestamp: '2024-05-01T10:32:30Z'
  },
  {
    id: '8',
    type: 'visitor',
    content: '明白了，非常感谢！',
    fromInfo: { name: '悟空', avatar: 'https://i.pravatar.cc/64?img=30', channel_id: 'visitor-1', channel_type: 1 },
    platform: 'wechat',
    avatar: 'https://i.pravatar.cc/64?img=30',
    timestamp: '2024-05-01T10:32:45Z'
  },
  {
    id: '9',
    type: 'system',
    content: '客户满意度评价：⭐⭐⭐⭐⭐ (5/5)',
    timestamp: '2024-05-01T10:33:00Z'
  }
];
