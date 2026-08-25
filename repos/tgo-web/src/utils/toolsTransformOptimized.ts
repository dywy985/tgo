/**
 * Optimized Tool Tools Transformation Utilities
 * Consolidates all Tool tool transformation logic using base patterns
 */

import { BaseTransformerClass, TransformUtils } from './base/BaseTransform';
import type {
  ToolSummary,
  ToolResponse,
  ToolStoreItem,
  AiTool
} from '@/types';

/**
 * Tool Summary to Store Item Transformer
 */
export class ToolSummaryToStoreItemTransformer extends BaseTransformerClass<ToolSummary, ToolStoreItem> {
  transform(toolSummary: ToolSummary): ToolStoreItem {
    return {
      id: toolSummary.id,
      name: TransformUtils.sanitizeString(toolSummary.name),
      title: TransformUtils.createDisplayName(toolSummary.title_zh || toolSummary.title, toolSummary.name),
      title_zh: toolSummary.title_zh,
      title_en: toolSummary.title_en,
      description: TransformUtils.sanitizeString(toolSummary.description_zh || toolSummary.description, '暂无描述'),
      description_zh: toolSummary.description_zh,
      description_en: toolSummary.description_en,
      version: TransformUtils.sanitizeString(toolSummary.version, '1.0.0'),
      category: TransformUtils.sanitizeString(toolSummary.category, '其他'),
      categories: TransformUtils.transformToStoreCategories(toolSummary.category),
      tags: TransformUtils.extractTags(toolSummary.tags),
      
      // Use short_no as author field for better identification
      author: TransformUtils.sanitizeString(toolSummary.short_no) || 
              TransformUtils.getAuthor(toolSummary.tool_source_type),
      authorHandle: `@${(toolSummary.short_no || TransformUtils.getAuthor(toolSummary.tool_source_type))
        .toLowerCase().replace(/\s+/g, '')}`,
      
      // Generate metrics based on execution count
      rating: TransformUtils.generateRating(toolSummary.execution_count),
      ratingCount: Math.floor((toolSummary.execution_count || 0) / 10) || 1,
      downloads: TransformUtils.sanitizeNumber(toolSummary.execution_count),
      
      // Format dates and status
      lastUpdated: TransformUtils.formatDate(toolSummary.created_at),
      featured: (toolSummary.execution_count || 0) > 100,
      verified: toolSummary.status === 'ACTIVE',
      
      // Default UI fields
      icon: '🔧',
      screenshots: [],
      longDescription: TransformUtils.sanitizeString(toolSummary.description, '暂无描述'),
      requirements: [],
      changelog: '',
      methods: [],
      
      // Preserve API fields
      isInstalled: toolSummary.is_installed || false,
      input_schema: toolSummary.input_schema,
      short_no: toolSummary.short_no || undefined,
    };
  }
}

/**
 * Store Item to Tool Tool Transformer
 */
export class StoreItemToAiToolTransformer extends BaseTransformerClass<ToolStoreItem, AiTool> {
  transform(storeItem: ToolStoreItem): AiTool {
    // Determine status based on installation and verification
    const status = storeItem.isInstalled ? 'active' : 
                   storeItem.verified ? 'available' : 'inactive';

    return {
      id: storeItem.id,
      name: storeItem.name,
      title: TransformUtils.createDisplayName(storeItem.title_zh || storeItem.title, storeItem.name),
      description: storeItem.description_zh || storeItem.description,
      category: TransformUtils.transformCategory(storeItem.categories?.[0]?.slug || storeItem.category || null),
      status: TransformUtils.transformToolStatus(status as any),
      version: storeItem.version || '1.0.0',
      author: storeItem.author || 'TGO',
      lastUpdated: storeItem.lastUpdated || '',
      usageCount: storeItem.downloads || 0,
      rating: storeItem.rating || 0,
      tags: storeItem.tags || [],
      
      // Optional fields with reasonable defaults
      capabilities: (storeItem.tags && storeItem.tags.length > 0) ? storeItem.tags : undefined,
      successRate: (storeItem.rating || 0) >= 4.0 ? 0.95 : 0.85,
      avgResponseTime: TransformUtils.generateAvgResponseTime(),
      config: {
        featured: storeItem.featured,
        verified: storeItem.verified,
        ratingCount: storeItem.ratingCount,
      },
      
      // Schema handling - prioritize API schema, fallback to methods
      input_schema: storeItem.input_schema || 
                   TransformUtils.createSchemaFromMethods(storeItem.methods || []),
      
      // Preserve short_no from API
      short_no: storeItem.short_no,
    };
  }
}

/**
 * Tool Response to Tool Tool Transformer
 */
export class ToolResponseToAiToolTransformer extends BaseTransformerClass<ToolResponse, AiTool> {
  transform(toolResponse: ToolResponse): AiTool {
    return {
      id: toolResponse.id,
      name: TransformUtils.sanitizeString(toolResponse.name),
      title: TransformUtils.createDisplayName(toolResponse.title_zh || toolResponse.title, toolResponse.name),
      description: TransformUtils.sanitizeString(toolResponse.description_zh || toolResponse.description, '暂无描述'),
      version: TransformUtils.sanitizeString(toolResponse.version, '1.0.0'),
      category: TransformUtils.transformCategory(toolResponse.category),
      tags: TransformUtils.extractTags(toolResponse.tags),
      status: TransformUtils.transformToolStatus(toolResponse.status),
      author: TransformUtils.getAuthor(toolResponse.tool_source_type),
      lastUpdated: TransformUtils.formatDate(toolResponse.updated_at),
      usageCount: TransformUtils.sanitizeNumber(toolResponse.execution_count),
      rating: TransformUtils.generateRating(toolResponse.execution_count),
      
      // Optional fields
      config: toolResponse.meta_data || undefined,
      capabilities: toolResponse.tags || undefined,
      successRate: TransformUtils.generateSuccessRate(toolResponse.execution_count),
      avgResponseTime: TransformUtils.generateAvgResponseTime(),
      input_schema: toolResponse.input_schema,
    };
  }
}

/**
 * Tool Tool to Store Item Transformer (reverse transformation)
 */
export class AiToolToStoreItemTransformer extends BaseTransformerClass<AiTool, ToolStoreItem> {
  transform(toolTool: AiTool): ToolStoreItem {
    return {
      id: toolTool.id,
      name: toolTool.name,
      title: TransformUtils.createDisplayName(toolTool.title, toolTool.name),
      title_zh: (toolTool as any).title_zh,
      title_en: (toolTool as any).title_en,
      description: toolTool.description,
      description_zh: (toolTool as any).description_zh,
      description_en: (toolTool as any).description_en,
      author: toolTool.author,
      authorHandle: `@${(toolTool.author || 'tgo').toLowerCase().replace(/\s+/g, '')}`,
      version: toolTool.version,
      category: toolTool.category,
      categories: TransformUtils.transformToStoreCategories(toolTool.category),
      tags: toolTool.tags,
      rating: toolTool.rating,
      ratingCount: Math.floor(toolTool.usageCount / 10),
      downloads: toolTool.usageCount,
      lastUpdated: toolTool.lastUpdated,
      featured: toolTool.rating >= 4.5,
      verified: toolTool.status === 'active',
      icon: '',
      screenshots: [],
      longDescription: toolTool.description,
      requirements: [],
      changelog: '',
      input_schema: toolTool.input_schema,
      short_no: toolTool.short_no,
    };
  }
}

// Create transformer instances
const toolSummaryToStoreItemTransformer = new ToolSummaryToStoreItemTransformer();
const storeItemToAiToolTransformer = new StoreItemToAiToolTransformer();
const toolResponseToAiToolTransformer = new ToolResponseToAiToolTransformer();
const toolToolToStoreItemTransformer = new AiToolToStoreItemTransformer();

/**
 * Optimized transformation functions using the new pattern
 */
export const OptimizedTransforms = {
  // Single item transformations
  toolSummaryToStoreItem: (item: ToolSummary): ToolStoreItem => 
    toolSummaryToStoreItemTransformer.transform(item),
  
  storeItemToAiTool: (item: ToolStoreItem): AiTool => 
    storeItemToAiToolTransformer.transform(item),
  
  toolResponseToAiTool: (item: ToolResponse): AiTool => 
    toolResponseToAiToolTransformer.transform(item),
  
  toolToolToStoreItem: (item: AiTool): ToolStoreItem => 
    toolToolToStoreItemTransformer.transform(item),

  // Batch transformations
  toolSummariesToStoreItems: (items: ToolSummary[]): ToolStoreItem[] => 
    toolSummaryToStoreItemTransformer.transformMany(items),
  
  storeItemsToAiTools: (items: ToolStoreItem[]): AiTool[] => 
    storeItemToAiToolTransformer.transformMany(items),
  
  toolResponsesToAiTools: (items: ToolResponse[]): AiTool[] => 
    toolResponseToAiToolTransformer.transformMany(items),
  
  toolToolsToStoreItems: (items: AiTool[]): ToolStoreItem[] => 
    toolToolToStoreItemTransformer.transformMany(items),
};

// Register transformers for global access (using TransformRegistry)
import { TransformRegistry } from './base/BaseTransform';
TransformRegistry.register('toolSummaryToStoreItem', toolSummaryToStoreItemTransformer);
TransformRegistry.register('storeItemToAiTool', storeItemToAiToolTransformer);
TransformRegistry.register('toolResponseToAiTool', toolResponseToAiToolTransformer);
TransformRegistry.register('toolToolToStoreItem', toolToolToStoreItemTransformer);

// Export individual transformers for direct use
export {
  toolSummaryToStoreItemTransformer,
  storeItemToAiToolTransformer,
  toolResponseToAiToolTransformer,
  toolToolToStoreItemTransformer,
};

// Backward compatibility exports (can be removed after migration)
export const transformToolSummaryToStoreItem = OptimizedTransforms.toolSummaryToStoreItem;
export const transformStoreItemToAiTool = OptimizedTransforms.storeItemToAiTool;
export const transformToolResponseToAiTool = OptimizedTransforms.toolResponseToAiTool;
export const transformAiToolToStoreItem = OptimizedTransforms.toolToolToStoreItem;
export const transformToolSummariesToStoreItems = OptimizedTransforms.toolSummariesToStoreItems;

export default OptimizedTransforms;
