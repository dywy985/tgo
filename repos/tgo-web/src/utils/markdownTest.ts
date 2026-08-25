/**
 * Markdown 渲染功能测试工具
 * 用于在浏览器控制台中测试 Markdown 渲染功能
 */

/**
 * 测试用的 Markdown 内容示例
 */
export const markdownExamples = {
  basic: `# 标题 1
## 标题 2
### 标题 3

这是一段普通文本，包含**粗体**和*斜体*。

这是另一段文本，包含~~删除线~~。`,

  lists: `## 列表示例

### 无序列表
- 项目 1
- 项目 2
  - 子项目 2.1
  - 子项目 2.2
- 项目 3

### 有序列表
1. 第一项
2. 第二项
3. 第三项`,

  code: `## 代码示例

### 行内代码
使用 \`console.log()\` 输出日志。

### 代码块
\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet('World');
\`\`\`

\`\`\`python
def greet(name):
    print(f"Hello, {name}!")

greet("World")
\`\`\``,

  links: `## 链接和图片

### 链接
访问 [Google](https://www.google.com) 搜索信息。

### 图片
![示例图片](https://via.placeholder.com/300x200)`,

  blockquote: `## 引用

> 这是一段引用文本。
> 可以包含多行。
>
> 甚至可以包含**格式化**的文本。`,

  table: `## 表格

| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 25   | 北京 |
| 李四 | 30   | 上海 |
| 王五 | 28   | 广州 |`,

  mixed: `# AI 助手回复示例

你好！我是 AI 助手，很高兴为你服务。

## 功能介绍

我可以帮助你完成以下任务：

1. **回答问题** - 提供准确的信息和解答
2. **代码帮助** - 编写和调试代码
3. **文档生成** - 创建各种格式的文档

### 代码示例

这是一个简单的 JavaScript 函数：

\`\`\`javascript
function calculateSum(a, b) {
  return a + b;
}

const result = calculateSum(5, 3);
console.log(result); // 输出: 8
\`\`\`

### 重要提示

> **注意**: 请确保在使用代码前进行充分测试。

### 相关链接

- [官方文档](https://example.com/docs)
- [API 参考](https://example.com/api)

---

如果你有任何问题，随时问我！`,

  aiResponse: `根据你的需求，我为你准备了以下解决方案：

## 方案概述

这个方案包含三个主要步骤：

1. **数据准备** - 收集和整理必要的数据
2. **处理流程** - 执行核心业务逻辑
3. **结果验证** - 确保输出符合预期

### 实现代码

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

async function processUser(user: User): Promise<void> {
  // 验证用户数据
  if (!user.email) {
    throw new Error('Email is required');
  }
  
  // 处理用户信息
  console.log(\`Processing user: \${user.name}\`);
  
  // 保存到数据库
  await saveToDatabase(user);
}
\`\`\`

### 注意事项

> ⚠️ **重要**: 
> - 确保所有必填字段都已填写
> - 验证邮箱格式的正确性
> - 处理可能的异常情况

### 测试结果

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 数据验证 | ✅ 通过 | 所有字段验证正常 |
| 业务逻辑 | ✅ 通过 | 处理流程正确 |
| 异常处理 | ✅ 通过 | 错误处理完善 |

希望这个方案能帮到你！如有疑问，请随时提问。`
};

/**
 * 在控制台打印 Markdown 示例
 */
export const printMarkdownExamples = (): void => {
  console.log('📝 Markdown 渲染测试示例');
  console.log('');
  console.log('可用的示例:');
  console.log('- markdownExamples.basic - 基本格式');
  console.log('- markdownExamples.lists - 列表');
  console.log('- markdownExamples.code - 代码块');
  console.log('- markdownExamples.links - 链接和图片');
  console.log('- markdownExamples.blockquote - 引用');
  console.log('- markdownExamples.table - 表格');
  console.log('- markdownExamples.mixed - 混合格式');
  console.log('- markdownExamples.aiResponse - AI 回复示例');
  console.log('');
  console.log('使用方法:');
  console.log('1. 复制任意示例内容');
  console.log('2. 在聊天界面发送包含 stream_data 的消息');
  console.log('3. 查看 Markdown 渲染效果');
};

/**
 * 测试 Markdown 渲染是否正常工作
 */
export const testMarkdownRendering = (): void => {
  console.log('🧪 测试 Markdown 渲染功能...');
  console.log('');

  // 检查 MarkdownContent 组件是否已加载
  const markdownElements = document.querySelectorAll('.markdown-content');
  console.log(`📋 找到 ${markdownElements.length} 个 Markdown 内容元素`);

  if (markdownElements.length > 0) {
    console.log('✅ Markdown 组件已正确加载');
    
    markdownElements.forEach((element, index) => {
      console.log(`  元素 ${index + 1}:`, {
        hasWhiteClass: element.classList.contains('markdown-white'),
        childrenCount: element.children.length,
        textLength: element.textContent?.length || 0
      });
    });
  } else {
    console.log('⚠️ 未找到 Markdown 内容元素');
    console.log('提示: 请确保有包含 stream_data 的消息');
  }

  console.log('');
  console.log('💡 测试建议:');
  console.log('1. 发送一条包含 Markdown 格式的消息');
  console.log('2. 检查消息是否正确渲染为 HTML');
  console.log('3. 验证代码块、列表、链接等元素的样式');
  console.log('4. 测试在蓝色背景（客服消息）和白色背景（访客消息）下的显示效果');
};

/**
 * 检查 Markdown 相关的依赖是否已安装
 */
export const checkMarkdownDependencies = (): void => {
  console.log('🔍 检查 Markdown 依赖...');
  console.log('');

  const dependencies = [
    'react-markdown',
    'remark-gfm',
    'rehype-raw',
    'rehype-sanitize'
  ];

  console.log('需要的依赖包:');
  dependencies.forEach(dep => {
    console.log(`  - ${dep}`);
  });

  console.log('');
  console.log('✅ 如果应用正常运行，说明所有依赖已正确安装');
  console.log('');
  console.log('💡 如果遇到问题，请运行:');
  console.log('npm install react-markdown remark-gfm rehype-raw rehype-sanitize');
};

/**
 * 显示 Markdown 语法帮助
 */
export const showMarkdownHelp = (): void => {
  console.log('📚 Markdown 语法帮助');
  console.log('');
  console.log('# 标题 1');
  console.log('## 标题 2');
  console.log('### 标题 3');
  console.log('');
  console.log('**粗体文本**');
  console.log('*斜体文本*');
  console.log('~~删除线~~');
  console.log('');
  console.log('- 无序列表项');
  console.log('1. 有序列表项');
  console.log('');
  console.log('[链接文本](https://example.com)');
  console.log('![图片描述](https://example.com/image.jpg)');
  console.log('');
  console.log('`行内代码`');
  console.log('');
  console.log('```language');
  console.log('代码块');
  console.log('```');
  console.log('');
  console.log('> 引用文本');
  console.log('');
  console.log('| 表头1 | 表头2 |');
  console.log('|-------|-------|');
  console.log('| 单元格1 | 单元格2 |');
};

/**
 * 运行所有 Markdown 测试
 */
export const runAllMarkdownTests = (): void => {
  console.log('🚀 开始运行 Markdown 渲染功能测试...');
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  checkMarkdownDependencies();
  console.log('='.repeat(60));
  console.log('');

  testMarkdownRendering();
  console.log('='.repeat(60));
  console.log('');

  printMarkdownExamples();
  console.log('='.repeat(60));
  console.log('');

  showMarkdownHelp();
  console.log('='.repeat(60));
  console.log('');

  console.log('🎉 测试完成！');
  console.log('');
  console.log('💡 使用说明:');
  console.log('- checkMarkdownDependencies() - 检查依赖');
  console.log('- testMarkdownRendering() - 测试渲染');
  console.log('- printMarkdownExamples() - 查看示例');
  console.log('- showMarkdownHelp() - 语法帮助');
  console.log('- runAllMarkdownTests() - 运行所有测试');
};

// 在开发环境中将测试函数添加到全局对象
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).markdownExamples = markdownExamples;
  (window as any).checkMarkdownDependencies = checkMarkdownDependencies;
  (window as any).testMarkdownRendering = testMarkdownRendering;
  (window as any).printMarkdownExamples = printMarkdownExamples;
  (window as any).showMarkdownHelp = showMarkdownHelp;
  (window as any).runAllMarkdownTests = runAllMarkdownTests;
  
  console.log('🧪 Markdown 测试工具已加载');
  console.log('🧪 使用 runAllMarkdownTests() 运行所有测试');
}
