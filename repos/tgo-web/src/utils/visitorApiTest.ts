/**
 * 访客API测试工具
 * 用于测试访客属性更新功能
 */

import { visitorApiService } from '@/services/visitorApi';
import type { VisitorAttributesUpdateRequest } from '@/services/visitorApi';

/**
 * 测试访客属性更新功能
 */
export const testVisitorAttributeUpdate = async (visitorId: string): Promise<void> => {
  console.log('🧪 开始测试访客属性更新功能...');

  try {
    // 1. 测试基本信息更新
    console.log('🧪 测试基本信息更新...');
    const basicInfoUpdate: VisitorAttributesUpdateRequest = {
      name: '测试用户',
      email: 'test@example.com',
      phone_number: '+86 138-0000-0000'
    };

    const basicInfoResponse = await visitorApiService.updateVisitorAttributes(visitorId, basicInfoUpdate);
    console.log('✅ 基本信息更新成功:', basicInfoResponse);

    // 2. 测试公司和职位信息更新
    console.log('🧪 测试公司和职位信息更新...');
    const companyUpdate: VisitorAttributesUpdateRequest = {
      company: '测试科技有限公司',
      job_title: '产品经理',
      source: '官网咨询'
    };

    const companyResponse = await visitorApiService.updateVisitorAttributes(visitorId, companyUpdate);
    console.log('✅ 公司信息更新成功:', companyResponse);

    // 3. 测试自定义属性更新
    console.log('🧪 测试自定义属性更新...');
    const customAttributesUpdate: VisitorAttributesUpdateRequest = {
      custom_attributes: {
        '兴趣爱好': '阅读、旅行',
        '购买意向': '高',
        '预算范围': '10万-50万',
        '决策周期': '3个月内'
      }
    };

    const customAttributesResponse = await visitorApiService.updateVisitorAttributes(visitorId, customAttributesUpdate);
    console.log('✅ 自定义属性更新成功:', customAttributesResponse);

    // 4. 测试备注更新
    console.log('🧪 测试备注更新...');
    const noteUpdate: VisitorAttributesUpdateRequest = {
      note: '这是一个重要的潜在客户，对我们的产品表现出浓厚兴趣，需要重点跟进。已安排下周进行产品演示。'
    };

    const noteResponse = await visitorApiService.updateVisitorAttributes(visitorId, noteUpdate);
    console.log('✅ 备注更新成功:', noteResponse);

    // 5. 测试综合更新
    console.log('🧪 测试综合更新...');
    const comprehensiveUpdate: VisitorAttributesUpdateRequest = {
      name: '综合测试用户',
      email: 'comprehensive@test.com',
      phone_number: '+86 139-0000-0000',
      company: '综合测试科技有限公司',
      job_title: '技术总监',
      source: '朋友推荐',
      note: '这是一个综合功能测试的备注信息，包含了所有可更新的字段。',
      custom_attributes: {
        '测试类型': '综合测试',
        '测试时间': new Date().toISOString(),
        '测试状态': '进行中',
        '优先级': '高'
      }
    };

    const comprehensiveResponse = await visitorApiService.updateVisitorAttributes(visitorId, comprehensiveUpdate);
    console.log('✅ 综合更新成功:', comprehensiveResponse);

    console.log('🎉 所有访客属性更新测试通过！');

  } catch (error) {
    console.error('❌ 访客属性更新测试失败:', error);
    throw error;
  }
};

/**
 * 测试获取访客信息功能
 */
export const testGetVisitor = async (visitorId: string): Promise<void> => {
  console.log('🧪 开始测试获取访客信息功能...');

  try {
    const visitorResponse = await visitorApiService.getVisitor(visitorId);
    console.log('✅ 获取访客信息成功:', visitorResponse);

    // 测试数据转换
    const transformedVisitor = visitorApiService.transformToVisitor(visitorResponse);
    console.log('✅ 访客数据转换成功:', transformedVisitor);

    console.log('🎉 获取访客信息测试通过！');

  } catch (error) {
    console.error('❌ 获取访客信息测试失败:', error);
    throw error;
  }
};

/**
 * 测试访客数据转换功能
 */
export const testVisitorDataTransform = async (visitorId: string): Promise<void> => {
  console.log('🧪 开始测试访客数据转换功能...');

  try {
    const visitorResponse = await visitorApiService.getVisitor(visitorId);
    console.log('✅ 获取访客信息成功:', visitorResponse);

    const transformedVisitor = visitorApiService.transformToVisitor(visitorResponse);
    console.log('✅ 访客数据转换成功:', transformedVisitor);

    console.log('🎉 访客数据转换测试通过！');

  } catch (error) {
    console.error('❌ 访客数据转换测试失败:', error);
    throw error;
  }
};

/**
 * 运行所有访客API测试
 */
export const runAllVisitorApiTests = async (visitorId: string): Promise<void> => {
  console.log('🚀 开始运行所有访客API测试...');

  try {
    await testGetVisitor(visitorId);
    await testVisitorDataTransform(visitorId);
    await testVisitorAttributeUpdate(visitorId);

    console.log('🎉 所有访客API测试完成！');

  } catch (error) {
    console.error('❌ 访客API测试失败:', error);
  }
};

/**
 * 在浏览器控制台中暴露测试函数
 */
if (typeof window !== 'undefined') {
  (window as any).testVisitorAttributeUpdate = testVisitorAttributeUpdate;
  (window as any).testGetVisitor = testGetVisitor;
  (window as any).testVisitorDataTransform = testVisitorDataTransform;
  (window as any).runAllVisitorApiTests = runAllVisitorApiTests;

  console.log('🧪 访客API测试工具已加载');
  console.log('🧪 使用 testVisitorAttributeUpdate("visitor_id") 测试属性更新');
  console.log('🧪 使用 testGetVisitor("visitor_id") 测试获取访客信息');
  console.log('🧪 使用 testVisitorDataTransform("visitor_id") 测试数据转换');
  console.log('🧪 使用 runAllVisitorApiTests("visitor_id") 运行所有测试');
}
