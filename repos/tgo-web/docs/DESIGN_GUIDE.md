# Tgo AI 界面设计规范指南 (Modern AI-Centric Design)

本指南旨在定义 Tgo Web 端 AI 管理模块（AI 员工、工具、工作流）的设计语言，确保后续开发能保持视觉一致性与交互的一致性。

## 1. 设计风格定位
**风格类型**：现代简约 SaaS 风格 + 科技未来感 (Modern Minimalist SaaS with Tech-Future Accents)
**核心关键词**：呼吸感 (Spacious)、通透 (Translucent)、圆润 (Soft Edges)、层级 (Hierarchy)。

---

## 2. 基础色彩与背景 (Base & Backgrounds)

### 背景色
*   **浅色模式**：主背景采用 `#f8fafc` (Slate 50)，内容容器（如卡片、面板）采用 `white`。
*   **暗黑模式**：主背景采用 `gray-950`，内容容器采用 `gray-900`。

### 品牌色
*   **Primary (AI 员工)**：Blue-600 (`#2563eb`) - 代表专业与效率。
*   **Secondary (工作流)**：Purple-600 (`#9333ea`) - 代表自动化与逻辑。
*   **Accent (工具)**：Indigo-600 (`#4f46e5`) - 代表集成与扩展。

### 边框与阴影
*   **边框**：统一使用极浅的边框 `border-gray-200/50` 或 `border-gray-100/50`。
*   **阴影**：
    *   常规态：`shadow-sm`。
    *   悬停态：`shadow-xl` 并伴随位移 `hover:-translate-y-1`。

---

## 3. 圆角规范 (Border Radius)
我们采用大圆角方案以增强产品的亲和力和现代感：
*   **小元素 (按钮、输入框)**：`rounded-xl` (0.75rem)。
*   **标准卡片 (Card)**：`rounded-2xl` (1rem)。
*   **大型容器/横幅 (Banner/Modal)**：`rounded-3xl` (1.5rem) 或 `rounded-[2rem]`。

---

## 4. 核心组件模版 (Component Patterns)

### 4.1 吸顶导航 (Sticky Header)
*   **效果**：`bg-white/80 backdrop-blur-xl`。
*   **布局**：左侧为标题+副标题，右侧为搜索框（Search Bar）与主操作按钮（CTA）。
*   **搜索框**：采用 `bg-gray-100/50` 圆角设计，聚焦时增加 `ring-2 ring-blue-500/20`。

### 4.2 列表卡片 (Item Card)
*   **结构**：
    1.  **左上图标**：使用圆角底盒 + 主题色图标。
    2.  **右上菜单**：收纳“编辑、删除、复制”于 `MoreVertical` 菜单中。
    3.  **信息层级**：标题加粗 -> 副标题/状态标签 -> 描述文字 (line-clamp-2)。
    4.  **底部操作**：主动作采用充满式按钮，次动作为图标按钮。

### 4.3 装饰横幅 (Feature Banner)
*   **视觉**：使用线性渐变 (如 `from-blue-600 to-indigo-700`)。
*   **元素**：左侧大图标 + 文案，右侧快捷筛选或辅助信息。
*   **纹理**：叠加半透明的几何纹理（如 `cubes.png`）增加细节质感。

---

## 5. 画布节点设计 (Canvas Nodes)
*   **造型**：`rounded-[1.5rem]`，厚重的描边与大阴影。
*   **侧边条**：节点左侧增加 4px 宽的彩色装饰条，用于区分节点类型（如 LLM 为青色，Agent 为蓝色）。
*   **连接点 (Handles)**：自定义圆点，增加白色边框与悬停放大效果。

---

## 6. 交互动画 (Interaction & Motion)
*   **进入动画**：列表加载时使用 `animate-in fade-in slide-in-from-bottom-4`。
*   **加载反馈**：使用渐进式的骨架屏 (`Skeleton`) 或带品牌色的旋转器 (`Loader2`)。
*   **状态切换**：所有的按钮、卡片悬停均需配置 `transition-all duration-300`。

---

## 7. 文本规范 (Typography)
*   **标题**：`font-bold text-gray-900 tracking-tight`。
*   **标签/元数据**：`text-[10px] font-bold uppercase tracking-widest text-gray-400`。
*   **代码/ID**：使用 `font-mono` 以体现技术属性。

