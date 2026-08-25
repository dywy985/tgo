# Git Hooks

本目录包含项目的 Git hooks，用于自动化开发工作流。

## 安装

### 方式 1: 配置 Git 使用此目录（推荐）

```bash
git config core.hooksPath .githooks
```

这会让 Git 使用 `.githooks/` 目录中的所有 hooks，而不是默认的 `.git/hooks/`。

### 方式 2: 手动复制

```bash
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## 可用的 Hooks

### pre-commit

**功能**: 当 `bootstrap.sh` 被修改时，自动运行 `build-bootstrap.sh` 重新生成 `bootstrap_cn.sh`。

**触发条件**: 提交包含 `bootstrap.sh` 的更改

**行为**:
1. 检测到 `bootstrap.sh` 在暂存区
2. 运行 `./build-bootstrap.sh`
3. 将生成的 `bootstrap_cn.sh` 添加到暂存区
4. 继续提交

**示例**:
```bash
$ git add bootstrap.sh
$ git commit -m "Update bootstrap script"
[pre-commit] bootstrap.sh changed. Running build-bootstrap.sh...
=== Building Bootstrap Scripts ===
[INFO] Generating bootstrap_cn.sh from bootstrap.sh...
[INFO] Generated bootstrap_cn.sh (544 lines)
...
[pre-commit] bootstrap_cn.sh regenerated and added to commit.
[main abc123d] Update bootstrap script
 2 files changed, 10 insertions(+), 5 deletions(-)
```

## 禁用 Hooks

如果需要临时禁用 hooks：

```bash
# 单次提交禁用
git commit --no-verify

# 永久禁用（不推荐）
git config core.hooksPath ""
```

## 故障排除

### Hook 没有执行

1. 检查 hook 文件是否可执行：
   ```bash
   ls -la .githooks/pre-commit
   ```

2. 检查 Git 配置：
   ```bash
   git config core.hooksPath
   ```

3. 手动测试 hook：
   ```bash
   .githooks/pre-commit
   ```

### Hook 执行失败

如果 hook 执行失败，检查：
1. `build-bootstrap.sh` 是否存在且可执行
2. `bootstrap.sh` 语法是否正确
3. 查看错误信息并修复

## 相关文档

- [Bootstrap 构建系统](../docs/BOOTSTRAP_BUILD_SYSTEM.md)
- [主 README](../README.md)

