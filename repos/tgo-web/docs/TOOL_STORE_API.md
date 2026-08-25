# 工具商店 API 接口规范

本文档定义了工具商店功能所需的后端接口规范，包括请求参数和响应格式。

## 1. 获取工具列表

获取工具商店中的工具列表，支持分页、搜索和分类筛选。

- **URL**: `GET /v1/tool-store/tools`
- **Auth**: Required (Bearer Token)

### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `limit` | number | 否 | 每页数量，默认 20 |
| `search` | string | 否 | 搜索关键词（匹配名称、描述、标签、作者） |
| `category` | string | 否 | 分类 ID（如: model, tool, agent, all） |
| `featured` | boolean | 否 | 是否仅获取精选工具 |

### 响应格式

```json
{
  "data": [
    {
      "id": "uuid-string",
      "name": "工具名称",
      "title": "显示标题",
      "description": "简短描述",
      "long_description": "详细描述（支持 Markdown）",
      "author": "作者名称",
      "author_handle": "作者标识",
      "category": "tool",
      "tags": ["Tag1", "Tag2"],
      "downloads": 12500,
      "rating": 4.8,
      "rating_count": 156,
      "version": "1.0.0",
      "last_updated": "2024-01-11T10:00:00Z",
      "featured": true,
      "verified": true,
      "icon": "🔗",
      "screenshots": ["url1", "url2"],
      "requirements": ["Node.js >= 16"],
      "changelog": "更新说明文字",
      "is_installed": false
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "has_next": true,
    "has_prev": false
  }
}
```

## 2. 获取工具详情

获取特定工具的完整信息，包括 API 方法定义。

- **URL**: `GET /v1/tool-store/tools/{id}`
- **Auth**: Required

### 响应格式

```json
{
  "id": "uuid-string",
  "name": "工具名称",
  "...": "其他基础字段同列表",
  "methods": [
    {
      "id": "method-id",
      "name": "方法名称",
      "description": "方法描述",
      "parameters": [
        {
          "name": "param_name",
          "type": "string",
          "required": true,
          "description": "参数描述",
          "example": "示例值"
        }
      ],
      "return_type": "Promise<string>",
      "example": "代码示例"
    }
  ]
}
```

## 3. 获取分类列表

获取工具商店的所有分类及其图标。

- **URL**: `GET /v1/tool-store/categories`

### 响应格式

```json
[
  { "id": "all", "label": "全部", "icon": "Grid3X3" },
  { "id": "model", "label": "模型", "icon": "Brain" },
  { "id": "tool", "label": "工具", "icon": "Wrench" }
]
```

## 4. 安装工具

将商店中的工具安装到当前项目。

- **URL**: `POST /v1/tool-store/tools/{id}/install`
- **Auth**: Required

### 请求体

```json
{
  "project_id": "current-project-id"
}
```

### 响应格式

```json
{
  "success": true,
  "message": "Tool installed successfully",
  "installed_tool_id": "new-project-tool-uuid"
}
```

## 5. 卸载工具

从项目中移除已安装的商店工具。

- **URL**: `DELETE /v1/tool-store/tools/{id}/uninstall`
- **Auth**: Required

### 响应格式

```json
{
  "success": true,
  "message": "Tool uninstalled successfully"
}
```
