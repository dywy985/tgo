/**
 * Markdown 渲染功能验证工具
 * 自动化测试和验证 Markdown 渲染是否正常工作
 */

interface ValidationResult {
  passed: boolean;
  message: string;
  details?: any;
}

interface ValidationReport {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: Array<{
    category: string;
    test: string;
    result: ValidationResult;
  }>;
}

/**
 * 验证 Markdown 组件是否已加载
 */
export const validateMarkdownComponentLoaded = (): ValidationResult => {
  try {
    const markdownElements = document.querySelectorAll('.markdown-content');
    
    if (markdownElements.length > 0) {
      return {
        passed: true,
        message: `找到 ${markdownElements.length} 个 Markdown 内容元素`,
        details: {
          count: markdownElements.length,
          elements: Array.from(markdownElements).map((el, i) => ({
            index: i,
            hasWhiteClass: el.classList.contains('markdown-white'),
            childrenCount: el.children.length
          }))
        }
      };
    } else {
      return {
        passed: false,
        message: '未找到 Markdown 内容元素，可能没有包含 stream_data 的消息',
        details: { hint: '请确保有包含 stream_data 的消息在页面上' }
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: `验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: { error }
    };
  }
};

/**
 * 验证 Markdown 样式是否正确加载
 */
export const validateMarkdownStyles = (): ValidationResult => {
  try {
    // 检查是否有 markdown.css 的样式规则
    const styleSheets = Array.from(document.styleSheets);
    let hasMarkdownStyles = false;
    
    for (const sheet of styleSheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        const markdownRules = rules.filter(rule => 
          rule.cssText.includes('markdown-content') || 
          rule.cssText.includes('markdown-white')
        );
        
        if (markdownRules.length > 0) {
          hasMarkdownStyles = true;
          break;
        }
      } catch (e) {
        // CORS 限制，跳过外部样式表
        continue;
      }
    }
    
    if (hasMarkdownStyles) {
      return {
        passed: true,
        message: 'Markdown 样式已正确加载',
        details: { stylesFound: true }
      };
    } else {
      return {
        passed: false,
        message: 'Markdown 样式可能未正确加载',
        details: { 
          hint: '检查 src/styles/markdown.css 是否在 src/index.css 中导入',
          stylesFound: false
        }
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: `样式验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: { error }
    };
  }
};

/**
 * 验证 Markdown 元素是否正确渲染
 */
export const validateMarkdownElements = (): ValidationResult => {
  try {
    const markdownContainers = document.querySelectorAll('.markdown-content');
    
    if (markdownContainers.length === 0) {
      return {
        passed: false,
        message: '没有找到 Markdown 容器',
        details: { hint: '请确保页面上有包含 stream_data 的消息' }
      };
    }
    
    const foundElements: Record<string, number> = {};
    const elementSelectors = {
      'h1': 'h1',
      'h2': 'h2',
      'h3': 'h3',
      'p': 'p',
      'code': 'code',
      'pre': 'pre',
      'a': 'a',
      'ul': 'ul',
      'ol': 'ol',
      'li': 'li',
      'blockquote': 'blockquote',
      'table': 'table',
      'strong': 'strong',
      'em': 'em'
    };
    
    markdownContainers.forEach(container => {
      Object.entries(elementSelectors).forEach(([name, selector]) => {
        const elements = container.querySelectorAll(selector);
        foundElements[name] = (foundElements[name] || 0) + elements.length;
      });
    });
    
    const foundCount = Object.values(foundElements).reduce((sum, count) => sum + count, 0);
    
    if (foundCount > 0) {
      return {
        passed: true,
        message: `找到 ${foundCount} 个 Markdown 元素`,
        details: { elements: foundElements }
      };
    } else {
      return {
        passed: false,
        message: 'Markdown 容器中没有找到任何元素',
        details: { 
          hint: '可能 Markdown 内容为空或渲染失败',
          foundElements
        }
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: `元素验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: { error }
    };
  }
};

/**
 * 验证链接是否有正确的安全属性
 */
export const validateLinkSecurity = (): ValidationResult => {
  try {
    const markdownLinks = document.querySelectorAll('.markdown-content a');
    
    if (markdownLinks.length === 0) {
      return {
        passed: true,
        message: '没有找到链接（可能当前内容不包含链接）',
        details: { linksCount: 0 }
      };
    }
    
    let allLinksSecure = true;
    const linkDetails: Array<{ href: string; hasTarget: boolean; hasRel: boolean }> = [];
    
    markdownLinks.forEach(link => {
      const hasTarget = link.getAttribute('target') === '_blank';
      const hasRel = link.getAttribute('rel')?.includes('noopener') || false;
      
      linkDetails.push({
        href: link.getAttribute('href') || '',
        hasTarget,
        hasRel
      });
      
      if (!hasTarget || !hasRel) {
        allLinksSecure = false;
      }
    });
    
    if (allLinksSecure) {
      return {
        passed: true,
        message: `所有 ${markdownLinks.length} 个链接都有正确的安全属性`,
        details: { linksCount: markdownLinks.length, links: linkDetails }
      };
    } else {
      return {
        passed: false,
        message: '部分链接缺少安全属性',
        details: { 
          linksCount: markdownLinks.length,
          links: linkDetails,
          hint: '链接应该有 target="_blank" 和 rel="noopener noreferrer"'
        }
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: `链接安全验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: { error }
    };
  }
};

/**
 * 验证代码块是否有语言标签
 */
export const validateCodeBlocks = (): ValidationResult => {
  try {
    const codeBlocks = document.querySelectorAll('.markdown-content pre');
    
    if (codeBlocks.length === 0) {
      return {
        passed: true,
        message: '没有找到代码块（可能当前内容不包含代码块）',
        details: { codeBlocksCount: 0 }
      };
    }
    
    const codeBlockDetails: Array<{ hasLanguageLabel: boolean; content: string }> = [];
    
    codeBlocks.forEach(block => {
      const hasLanguageLabel = block.previousElementSibling?.classList.contains('code-language') ||
                               block.parentElement?.querySelector('.code-language') !== null;
      const content = block.textContent?.substring(0, 50) || '';
      
      codeBlockDetails.push({
        hasLanguageLabel,
        content: content + (content.length >= 50 ? '...' : '')
      });
    });
    
    return {
      passed: true,
      message: `找到 ${codeBlocks.length} 个代码块`,
      details: { 
        codeBlocksCount: codeBlocks.length,
        blocks: codeBlockDetails
      }
    };
  } catch (error) {
    return {
      passed: false,
      message: `代码块验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: { error }
    };
  }
};

/**
 * 验证白色文本样式（蓝色背景消息）
 */
export const validateWhiteTextStyle = (): ValidationResult => {
  try {
    const whiteMarkdown = document.querySelectorAll('.markdown-white');
    
    if (whiteMarkdown.length === 0) {
      return {
        passed: true,
        message: '没有找到白色文本的 Markdown（可能没有 AI 助手消息）',
        details: { whiteMarkdownCount: 0 }
      };
    }
    
    const styleDetails: Array<{ hasWhiteClass: boolean; parentBgColor: string }> = [];
    
    whiteMarkdown.forEach(element => {
      const parent = element.closest('.bg-blue-500');
      styleDetails.push({
        hasWhiteClass: element.classList.contains('markdown-white'),
        parentBgColor: parent ? 'blue-500' : 'unknown'
      });
    });
    
    return {
      passed: true,
      message: `找到 ${whiteMarkdown.length} 个白色文本的 Markdown 元素`,
      details: { 
        whiteMarkdownCount: whiteMarkdown.length,
        styles: styleDetails
      }
    };
  } catch (error) {
    return {
      passed: false,
      message: `白色文本样式验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
      details: { error }
    };
  }
};

/**
 * 运行所有验证测试
 */
export const runAllValidations = (): ValidationReport => {
  console.log('🔍 开始运行 Markdown 渲染功能验证...');
  console.log('');
  
  const tests = [
    { category: '组件加载', test: 'Markdown 组件加载', fn: validateMarkdownComponentLoaded },
    { category: '样式加载', test: 'Markdown 样式加载', fn: validateMarkdownStyles },
    { category: '元素渲染', test: 'Markdown 元素渲染', fn: validateMarkdownElements },
    { category: '安全性', test: '链接安全属性', fn: validateLinkSecurity },
    { category: '代码块', test: '代码块渲染', fn: validateCodeBlocks },
    { category: '样式', test: '白色文本样式', fn: validateWhiteTextStyle }
  ];
  
  const results: ValidationReport['results'] = [];
  let passedTests = 0;
  let failedTests = 0;
  
  tests.forEach(({ category, test, fn }) => {
    console.log(`📋 测试: ${category} - ${test}`);
    const result = fn();
    
    results.push({ category, test, result });
    
    if (result.passed) {
      passedTests++;
      console.log(`  ✅ ${result.message}`);
    } else {
      failedTests++;
      console.log(`  ❌ ${result.message}`);
    }
    
    if (result.details) {
      console.log('  详情:', result.details);
    }
    console.log('');
  });
  
  const report: ValidationReport = {
    totalTests: tests.length,
    passedTests,
    failedTests,
    results
  };
  
  console.log('='.repeat(60));
  console.log(`📊 验证报告: ${passedTests}/${tests.length} 测试通过`);
  console.log('='.repeat(60));
  
  if (failedTests === 0) {
    console.log('🎉 所有测试通过！Markdown 渲染功能正常工作。');
  } else {
    console.log(`⚠️ ${failedTests} 个测试失败，请检查上述详情。`);
  }
  
  return report;
};

// 在开发环境中将验证函数添加到全局对象
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).validateMarkdownComponentLoaded = validateMarkdownComponentLoaded;
  (window as any).validateMarkdownStyles = validateMarkdownStyles;
  (window as any).validateMarkdownElements = validateMarkdownElements;
  (window as any).validateLinkSecurity = validateLinkSecurity;
  (window as any).validateCodeBlocks = validateCodeBlocks;
  (window as any).validateWhiteTextStyle = validateWhiteTextStyle;
  (window as any).runAllValidations = runAllValidations;
  
  console.log('🔍 Markdown 验证工具已加载');
  console.log('🔍 使用 runAllValidations() 运行所有验证测试');
}
