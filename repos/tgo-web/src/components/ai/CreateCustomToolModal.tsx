import React, { useState, useRef, useEffect } from 'react';
import { X, Wrench, XCircle, ExternalLink, ChevronDown, Settings } from 'lucide-react';
import { useAIStore } from '@/stores';
import { useToast } from './ToolToastProvider';
import { parseOpenAPISchema, getMethodColorClass, type ParsedEndpoint, type AutoDetectedAuth } from '@/utils/schemaParser';
import AuthMethodModal, { type AuthConfig } from './AuthMethodModal';
import ApiTestModal from './ApiTestModal';
import type { ToolCategory } from '@/types';

interface CreateCustomToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CustomToolFormData {
  name: string;
  description: string;
  category: ToolCategory;
  endpoint: string;
  apiKey: string;
  tags: string[];
  schema: string;
}

interface FormErrors {
  name?: string;
  description?: string;
  endpoint?: string;
  schema?: string;
}

interface SchemaTemplate {
  name: string;
  content: string;
}

// 预定义的Schema模板
const SCHEMA_TEMPLATES: SchemaTemplate[] = [
  {
    name: '天气(JSON)',
    content: `{
  "openapi": "3.1.0",
  "info": {
    "title": "Get weather data",
    "description": "Retrieves current weather data for a location.",
    "version": "v1.0.0"
  },
  "servers": [
    {
      "url": "https://weather.example.com"
    }
  ],
  "paths": {
    "/location": {
      "get": {
        "description": "Get temperature for a specific location",
        "operationId": "GetCurrentWeather",
        "parameters": [
          {
            "name": "location",
            "in": "query",
            "description": "The city and state to retrieve the weather for",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "deprecated": false
      }
    }
  },
  "components": {
    "schemas": {}
  }
}`
  },
  {
    name: '宠物商店(YAML)',
    content: `# Taken from https://github.com/OAI/OpenAPI-Specification/blob/main/examples/v3.0/petstore.yaml

openapi: "3.0.0"
info:
  version: 1.0.0
  title: Swagger Petstore
  license:
    name: MIT
servers:
  - url: https://petstore.swagger.io/v1
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      tags:
        - pets
      parameters:
        - name: limit
          in: query
          description: How many items to return at one time (max 100)
          required: false
          schema:
            type: integer
            maximum: 100
            format: int32
      responses:
        '200':
          description: A paged array of pets
          headers:
            x-next:
              description: A link to the next page of responses
              schema:
                type: string
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pets"
        default:
          description: unexpected error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
    post:
      summary: Create a pet
      operationId: createPets
      tags:
        - pets
      responses:
        '201':
          description: Null response
        default:
          description: unexpected error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
  /pets/{petId}:
    get:
      summary: Info for a specific pet
      operationId: showPetById
      tags:
        - pets
      parameters:
        - name: petId
          in: path
          required: true
          description: The id of the pet to retrieve
          schema:
            type: string
      responses:
        '200':
          description: Expected response to a valid request
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
        default:
          description: unexpected error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
components:
  schemas:
    Pet:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        tag:
          type: string
    Pets:
      type: array
      maxItems: 100
      items:
        $ref: "#/components/schemas/Pet"
    Error:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: integer
          format: int32
        message:
          type: string`
  },
  {
    name: '用户管理API (复杂示例)',
    content: `{
  "openapi": "3.0.3",
  "info": {
    "title": "User Management API",
    "description": "A comprehensive user management API with validation",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://api.example.com/v1"
    }
  ],
  "paths": {
    "/users": {
      "get": {
        "summary": "List users",
        "description": "Retrieve a paginated list of users with filtering options",
        "operationId": "listUsers",
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "description": "Page number for pagination",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "default": 1,
              "example": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "description": "Number of users per page",
            "required": false,
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 20,
              "example": 20
            }
          },
          {
            "name": "status",
            "in": "query",
            "description": "Filter users by status",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["active", "inactive", "pending"],
              "example": "active"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of users retrieved successfully"
          }
        }
      },
      "post": {
        "summary": "Create user",
        "description": "Create a new user account",
        "operationId": "createUser",
        "requestBody": {
          "description": "User data for creation",
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["name", "email"],
                "properties": {
                  "name": {
                    "type": "string",
                    "minLength": 2,
                    "maxLength": 100,
                    "description": "Full name of the user",
                    "example": "John Doe"
                  },
                  "email": {
                    "type": "string",
                    "format": "email",
                    "description": "Email address (must be unique)",
                    "example": "john.doe@example.com"
                  },
                  "age": {
                    "type": "integer",
                    "minimum": 13,
                    "maximum": 120,
                    "description": "User's age",
                    "example": 25
                  },
                  "role": {
                    "type": "string",
                    "enum": ["user", "admin", "moderator"],
                    "default": "user",
                    "description": "User role in the system"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "User created successfully"
          }
        }
      }
    },
    "/users/{userId}": {
      "get": {
        "summary": "Get user by ID",
        "description": "Retrieve a specific user by their ID",
        "operationId": "getUserByIdWithVeryLongOperationNameToTestTruncation",
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "description": "Unique identifier for the user",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid",
              "example": "123e4567-e89b-12d3-a456-426614174000"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "User retrieved successfully"
          }
        }
      }
    },
    "/users/{userId}/preferences/notifications/settings": {
      "put": {
        "summary": "Update user notification preferences",
        "description": "Update detailed notification preferences for a specific user",
        "operationId": "updateUserNotificationPreferencesWithExtremelyLongOperationNameForTruncationTesting",
        "parameters": [
          {
            "name": "userId",
            "in": "path",
            "description": "Unique identifier for the user",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "requestBody": {
          "description": "Notification preferences to update",
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "emailNotifications": {
                    "type": "boolean",
                    "description": "Enable email notifications"
                  },
                  "pushNotifications": {
                    "type": "boolean",
                    "description": "Enable push notifications"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Preferences updated successfully"
          }
        }
      }
    }
  }
}`
  },
  {
    name: 'API鉴权示例 (自动检测)',
    content: `{
  "openapi": "3.0.3",
  "info": {
    "title": "Secure API Example",
    "description": "API with various authentication methods for auto-detection testing",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://api.secure-example.com/v1"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/users": {
      "get": {
        "summary": "List users (Bearer Auth)",
        "description": "Get list of users using global Bearer authentication",
        "operationId": "listUsersWithBearerAuth",
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "description": "Number of users to return",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100,
              "default": 20
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Users retrieved successfully"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/admin/users": {
      "get": {
        "summary": "Admin list users (API Key)",
        "description": "Admin endpoint with API key authentication",
        "operationId": "adminListUsers",
        "security": [
          {
            "apiKeyAuth": []
          }
        ],
        "responses": {
          "200": {
            "description": "Admin users retrieved successfully"
          }
        }
      }
    },
    "/public/stats": {
      "get": {
        "summary": "Public statistics (No Auth)",
        "description": "Public endpoint with no authentication required",
        "operationId": "getPublicStats",
        "security": [],
        "responses": {
          "200": {
            "description": "Statistics retrieved successfully"
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "JWT Bearer token authentication"
      },
      "apiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
        "description": "API key authentication via header"
      },
      "basicAuth": {
        "type": "http",
        "scheme": "basic",
        "description": "Basic HTTP authentication"
      }
    }
  }
}`
  },
  {
    name: '空白模版',
    content: `{
  "openapi": "3.1.0",
  "info": {
    "title": "Untitled",
    "description": "Your OpenAPI specification",
    "version": "v1.0.0"
  },
  "servers": [
    {
      "url": ""
    }
  ],
  "paths": {},
  "components": {
    "schemas": {}
  }
}`
  }
];

/**
 * 创建自定义工具弹窗组件
 */
const CreateCustomToolModal: React.FC<CreateCustomToolModalProps> = ({
  isOpen,
  onClose
}) => {
  const { createTool } = useAIStore();
  const { showToast } = useToast();
  
  const [formData, setFormData] = useState<CustomToolFormData>({
    name: '',
    description: '',
    category: 'productivity',
    endpoint: '',
    apiKey: '',
    tags: [],
    schema: ''
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [isCreating, setIsCreating] = useState(false);
  const [showExamplesDropdown, setShowExamplesDropdown] = useState(false);
  const [parsedEndpoints, setParsedEndpoints] = useState<ParsedEndpoint[]>([]);
  const [isParsingSchema, setIsParsingSchema] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig>({ type: 'none' });
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ParsedEndpoint | null>(null);

  const examplesDropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (examplesDropdownRef.current && !examplesDropdownRef.current.contains(event.target as Node)) {
        setShowExamplesDropdown(false);
      }
    };

    if (showExamplesDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }

    return undefined;
  }, [showExamplesDropdown]);

  // 解析Schema内容
  useEffect(() => {
    const parseSchema = async () => {
      if (!formData.schema.trim()) {
        setParsedEndpoints([]);
        // 重置鉴权配置当schema为空时
        if (authConfig.type !== 'none') {
          setAuthConfig({ type: 'none' });
        }
        return;
      }

      setIsParsingSchema(true);

      try {
        // Use the enhanced async parser
        const endpoints = await parseOpenAPISchema(formData.schema);
        setParsedEndpoints(endpoints);

        // 自动检测并配置鉴权
        if (endpoints.length > 0) {
          // 查找第一个有自动检测鉴权的端点
          const endpointWithAuth = endpoints.find(endpoint => endpoint.autoDetectedAuth);

          if (endpointWithAuth?.autoDetectedAuth && authConfig.type === 'none') {
            const autoAuthConfig = convertAutoDetectedAuth(endpointWithAuth.autoDetectedAuth);
            setAuthConfig(autoAuthConfig);

            // 显示自动检测成功的提示
            const authTypeText = endpointWithAuth.autoDetectedAuth.type === 'header' ? '请求头' : '查询参数';
            const sourceText = endpointWithAuth.autoDetectedAuth.source === 'operation' ? '操作级别' : '全局级别';

            setTimeout(() => {
              showToast(
                'success',
                '鉴权自动配置',
                `已从OpenAPI规范检测到${authTypeText}鉴权 (${sourceText})`
              );
            }, 500); // 延迟显示，避免与解析成功提示冲突
          }
        } else {
          // 如果没有找到端点，重置鉴权配置
          if (authConfig.type !== 'none') {
            setAuthConfig({ type: 'none' });
          }
        }
      } catch (error) {
        console.error('Schema parsing error:', error);
        setParsedEndpoints([]);
        // 解析失败时重置鉴权配置
        if (authConfig.type !== 'none') {
          setAuthConfig({ type: 'none' });
        }
      } finally {
        setIsParsingSchema(false);
      }
    };

    parseSchema();
  }, [formData.schema]);

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = '请输入工具名称';
    } else if (formData.name.length > 50) {
      newErrors.name = '工具名称不能超过50个字符';
    }
    
    if (!formData.schema.trim()) {
      newErrors.schema = '请输入Schema配置';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setIsCreating(true);
      
      // 模拟API调用
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 使用store创建工具
      createTool({
        name: formData.name,
        description: formData.description,
        category: formData.category,
        endpoint: formData.endpoint,
        author: '自定义',
        tags: formData.tags,
        version: 'v1.0.0'
      });
      
      showToast('success', '创建成功', `自定义工具 "${formData.name}" 已创建`);
      handleClose();
    } catch (error) {
      console.error('创建自定义工具失败:', error);
      showToast('error', '创建失败', '创建自定义工具时发生错误，请重试');
    } finally {
      setIsCreating(false);
    }
  };

  // 处理弹窗关闭
  const handleClose = () => {
    if (isCreating) return;
    
    setFormData({
      name: '',
      description: '',
      category: 'productivity',
      endpoint: '',
      apiKey: '',
      tags: [],
      schema: ''
    });
    setErrors({});
    onClose();
  };

  // 处理输入变化
  const handleInputChange = (field: keyof CustomToolFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // 清除错误
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // 处理模板选择
  const handleTemplateSelect = (template: SchemaTemplate) => {
    handleInputChange('schema', template.content);
    setShowExamplesDropdown(false);
  };

  // 切换例子下拉菜单
  const toggleExamplesDropdown = () => {
    setShowExamplesDropdown(!showExamplesDropdown);
  };

  // 处理鉴权配置保存
  const handleAuthSave = (config: AuthConfig) => {
    setAuthConfig(config);
  };

  // 检查是否为自动检测的鉴权
  const isAutoDetectedAuth = () => {
    if (parsedEndpoints.length === 0) return false;

    const endpointWithAuth = parsedEndpoints.find(endpoint => endpoint.autoDetectedAuth);
    const autoAuth = endpointWithAuth?.autoDetectedAuth;

    return autoAuth && (
      (authConfig.type === autoAuth.type && authConfig.key === autoAuth.key) ||
      (authConfig.type !== 'none' && autoAuth.type !== 'none')
    );
  };

  // 获取鉴权显示文本
  const getAuthDisplayText = () => {
    const endpointWithAuth = parsedEndpoints.find(endpoint => endpoint.autoDetectedAuth);
    const autoAuth = endpointWithAuth?.autoDetectedAuth;

    if (authConfig.type === 'none') {
      if (autoAuth && autoAuth.type !== 'none') {
        return `自动检测: ${autoAuth.type === 'header' ? '请求头' : '查询参数'}`;
      }
      return '无';
    } else if (authConfig.type === 'header') {
      return `请求头 (${authConfig.headerPrefix?.toUpperCase()})`;
    } else if (authConfig.type === 'query') {
      return '查询参数';
    }
    return '无';
  };

  // 将自动检测的鉴权转换为AuthConfig
  const convertAutoDetectedAuth = (autoAuth: AutoDetectedAuth): AuthConfig => {
    return {
      type: autoAuth.type,
      headerPrefix: autoAuth.headerPrefix,
      key: autoAuth.key,
      value: '', // 用户需要填入实际的API密钥
    };
  };

  // 处理测试按钮点击
  const handleTestEndpoint = (endpoint: ParsedEndpoint, e?: React.MouseEvent) => {
    // Prevent any form submission or event bubbling
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 如果端点有自动检测的鉴权配置，且当前鉴权为默认状态，则应用自动检测的配置
    if (endpoint.autoDetectedAuth && authConfig.type === 'none') {
      const autoAuthConfig = convertAutoDetectedAuth(endpoint.autoDetectedAuth);
      setAuthConfig(autoAuthConfig);
    }

    setSelectedEndpoint(endpoint);
    setShowTestModal(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">创建自定义工具</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isCreating}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {/* 工具名称 */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                <Wrench className="w-4 h-4 text-yellow-600" />
                <span>名称 <span className="text-red-500">*</span></span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${
                  errors.name ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                placeholder="输入工具名称"
                disabled={isCreating}
                maxLength={50}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-500 flex items-center space-x-1">
                  <XCircle className="w-4 h-4" />
                  <span>{errors.name}</span>
                </p>
              )}
            </div>

            {/* Schema配置 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                  <span>Schema <span className="text-red-500">*</span></span>
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    className="flex items-center space-x-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                    onClick={() => window.open('https://swagger.io/specification/', '_blank')}
                  >
                    <span>查看 OpenAPI-Swagger 规范</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <div className="relative" ref={examplesDropdownRef}>
                    <button
                      type="button"
                      className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-700 transition-colors"
                      onClick={toggleExamplesDropdown}
                    >
                      <span>例子</span>
                      <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showExamplesDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* 下拉菜单 */}
                    {showExamplesDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                        <div className="py-1">
                          {SCHEMA_TEMPLATES.map((template, index) => (
                            <button
                              key={index}
                              type="button"
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              onClick={() => handleTemplateSelect(template)}
                            >
                              {template.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <textarea
                value={formData.schema}
                onChange={(e) => handleInputChange('schema', e.target.value)}
                rows={12}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 resize-none font-mono text-sm ${
                  errors.schema ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                placeholder="输入OpenAPI Schema配置..."
                disabled={isCreating}
              />
              {errors.schema && (
                <p className="mt-1 text-sm text-red-500 flex items-center space-x-1">
                  <XCircle className="w-4 h-4" />
                  <span>{errors.schema}</span>
                </p>
              )}
            </div>

            {/* 可用工具表格 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">可用工具</h3>
                {isParsingSchema && (
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <div className="animate-spin w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full"></div>
                    <span>解析中...</span>
                  </div>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">方法</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">路径</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedEndpoints.length > 0 ? (
                      parsedEndpoints.map((endpoint, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm text-gray-900">{endpoint.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{endpoint.description}</td>
                          <td className={`px-4 py-3 text-sm font-medium ${getMethodColorClass(endpoint.method)}`}>
                            {endpoint.method.toLowerCase()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{endpoint.path}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleTestEndpoint(endpoint);
                              }}
                              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                            >
                              测试
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                          {formData.schema.trim() ? '未找到有效的API端点' : '请输入OpenAPI Schema以查看可用工具'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 鉴权方法 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-gray-700">鉴权方法</h3>
                  {isAutoDetectedAuth() && (
                    <span
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full"
                      title="从OpenAPI规范自动检测的鉴权配置"
                    >
                      自动检测
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                   onClick={() => setShowAuthModal(true)}>
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm text-gray-600">{getAuthDisplayText()}</span>
                  {parsedEndpoints.find(endpoint => endpoint.autoDetectedAuth) && (
                    <span className="text-xs text-gray-400 mr-8">
                      {(() => {
                        const endpointWithAuth = parsedEndpoints.find(endpoint => endpoint.autoDetectedAuth);
                        const autoAuth = endpointWithAuth?.autoDetectedAuth;
                        return autoAuth?.description ? (
                          <span title={autoAuth.description}>
                            {autoAuth.schemeName}
                          </span>
                        ) : null;
                      })()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAuthModal(true);
                  }}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              disabled={isCreating}
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              disabled={isCreating}
            >
              <span>{isCreating ? '保存中...' : '保存'}</span>
            </button>
          </div>
        </form>

        {/* 鉴权方法设置弹窗 */}
        <AuthMethodModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSave={handleAuthSave}
          initialConfig={authConfig}
        />

        {/* API测试弹窗 */}
        <ApiTestModal
          isOpen={showTestModal}
          onClose={() => setShowTestModal(false)}
          endpoint={selectedEndpoint}
          authConfig={authConfig}
          onAuthConfigChange={handleAuthSave}
        />
      </div>
    </div>
  );
};

export default CreateCustomToolModal;
