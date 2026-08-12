# CodeReader 产品复位 R0 隔离门禁证据

**状态：** 已完成的 R0 隔离复核；不是 R5 原生发布证据

**日期：** 2026-08-09
**候选基线提交：** `f28e3b65072755f2de5cca2079cc2bbad9f224a8`

## 隔离方法与候选指纹

复核在仓库外、POSIX 临时目录中进行。创建后先以 `realpath` 和目录不等断言确认该目录不位于项目根目录；随后以归档式副本复制当前候选工作树，排除 `.git`、`node_modules`、`dist`、任意 `target`、`artifacts` 和 `.temp`。复制后再次断言锁文件和 R0 基线存在，而排除目录不存在。

在副本中执行 `npm ci`，不复用共享工作树的 `node_modules`；安装成功，安装了 239 个包。`npm ls vite --depth=0` 确认实际版本为 `vite@8.1.4`，与锁文件和 `package.json` 一致。Rust 构建也在副本的独立 `src-tauri/target` 中完成。

### 可复算候选树哈希

要求：从候选根目录执行，使用 Node `>=24.15.0`（只使用 `node:crypto`、`node:fs/promises` 和 `node:path`），无需 `.git`、网络或写权限。排除任何层级名为 `.git`、`node_modules`、`dist`、`target`、`artifacts`、`.temp` 的目录，以及两份运行后生成的报告：

- `docs/plans/2026-08-09-product-reset-r0-baseline.md`
- `docs/plans/2026-08-09-product-reset-r0-evidence.md`

其余所有常规文件均纳入。遇到符号链接、设备或其他非常规目录项时命令会失败，避免静默漏算。文件按相对路径的 Unicode 码元顺序排列；先为每个文件计算内容 SHA-256，再将 `relative-path + NUL + content-sha256-hex + LF` 的 UTF-8 记录串联，并计算该串联流的 SHA-256。输出格式固定为 `files=<count> tree-sha256=<hex>`。

```bash
node --input-type=module <<'NODE'
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const excludedDirectories = new Set([
  ".git", "node_modules", "dist", "target", "artifacts", ".temp"
]);
const excludedFiles = new Set([
  "docs/plans/2026-08-09-product-reset-r0-baseline.md",
  "docs/plans/2026-08-09-product-reset-r0-evidence.md"
]);
const files = [];

async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await walk(absolutePath, relativePath);
    } else if (entry.isFile()) {
      if (!excludedFiles.has(relativePath)) files.push(relativePath);
    } else {
      throw new Error(`unsupported candidate entry: ${relativePath}`);
    }
  }
}

await walk(process.cwd());
files.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
const tree = createHash("sha256");
for (const relativePath of files) {
  const contentHash = createHash("sha256").update(await readFile(relativePath)).digest("hex");
  tree.update(`${relativePath}\0${contentHash}\n`, "utf8");
}
console.log(`files=${files.length} tree-sha256=${tree.digest("hex")}`);
NODE
```

第二轮复算结果如下；两处均使用上面的命令，且两份运行后报告本身不参与候选树：

| 候选位置 | 输出 |
| --- | --- |
| 共享候选 | `files=236 tree-sha256=ae170d80ade6481cd8c8b398e4b5da349d8e26eb0590bf61534845d4146fd25c` |
| 仓库外隔离副本 | `files=236 tree-sha256=ae170d80ade6481cd8c8b398e4b5da349d8e26eb0590bf61534845d4146fd25c` |

该指纹只标识候选内容，不包含源码、提示词、模型响应、凭据、用户数据或绝对路径。

## 工具版本

| 工具 | 值 |
| --- | --- |
| Node | `v24.15.0` |
| npm | `11.12.1` |
| Vite（锁定安装） | `8.1.4` |
| rustc | `1.96.1 (31fca3adb 2026-06-26)` |
| Cargo | `1.96.1 (356927216 2026-06-26)` |

## 脱敏门禁摘要

下表的“标准化摘要”是稳定、无路径的 `key=value` 文本。SHA-256 对该文本的 UTF-8 字节计算；原始标准输出不提交，因为其可能带有本机路径或其他不应导出的内容。

| 门禁 | 命令 | 退出码 | 计数 | 标准化摘要 | SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| 格式 | `npm run format:check` | 0 | 不适用 | `gate=format;command=npm run format:check;exit=0;summary=prettier-ok` | `0fd1d42ace4ad8e3dc08c7f213382cca1abd4a701eed21868da829d92162bbe4` |
| 前端 lint | `npm run lint` | 0 | 不适用 | `gate=lint;command=npm run lint;exit=0;summary=eslint-ok` | `5f8200f63e7a6633faa9601401c22efe7547703ffde8f2f35379586f633693e3` |
| 前端测试 | `npm test` | 0 | 40 个文件、278 项 | `gate=test;command=npm test;exit=0;test_files=40;tests=278` | `c2a24f37b822d8f46a9aa01bee9db9a981a34a98bf4c9c0a1318f9cf618662eb` |
| 前端构建 | `npm run build` | 0 | 2,958 个模块 | `gate=build;command=npm run build;exit=0;vite=8.1.4;modules=2958` | `d9795f9ca0ff94a40fd2611f3135e2f47e1b0dc079805bc01964eff2cea7fc95` |
| Rust 检查 | `npm run cargo:check` | 0 | 不适用 | `gate=cargo-check;command=npm run cargo:check;exit=0;summary=codereader-check-ok` | `fe06c18880913aa7075b28a74487de23f83956073dbdf2ef22dedafec01e36a9` |
| Rust 测试 | `npm run cargo:test` | 0 | 113 项、0 failed | `gate=cargo-test;command=npm run cargo:test;exit=0;tests=113;failed=0` | `99542e6d800265e2f8db7b065d8e44ec8bdcaef450977987847219284dbd4d92` |
| Rust lint | `npm run cargo:clippy` | 0 | 不适用 | `gate=cargo-clippy;command=npm run cargo:clippy;exit=0;warnings=0` | `242635410ad1916e3d99714767e27f67faaddaac2745fd0e186549927fed9916` |

## 个人路径隐私扫描

从候选根目录执行以下只读 Bash 命令。它检查 R0 基线、R0 证据、产品复位计划/决策、文档索引和项目指令；发现 POSIX 用户主目录、Windows 用户目录或 WSL UNC 用户路径时退出 1。正则使用字符类避免扫描命令和说明自身成为匹配项。无匹配时 `rg` 返回 1，而尾部断言将整个命令的退出码转换为 0。

```bash
if rg -n -i \
  -e '/[h]ome/[^/]+/' \
  -e 'C:\\[U]sers\\' \
  -e '\\\\(?:[w]sl\.localhost|[w]sl\$)\\' \
  docs/plans/2026-08-09-product-reset-r0-baseline.md \
  docs/plans/2026-08-09-product-reset-r0-evidence.md \
  docs/plans/2026-08-09-product-reset-plan.md \
  docs/architecture/2026-08-09-product-reset-decision.md \
  docs/README.md \
  AGENTS.md
then
  exit 1
else
  status=$?
  test "$status" -eq 1
fi
```

第二轮实际结果：无输出，退出码 `0`。

## 未验证范围

本证据不替代原生端到端人工流程（包括 1180px 与 760px 窄窗口、原生选择器、重启恢复和双项目竞态），也不替代 R5 的 Windows/Linux x64/ARM64 包、安装/启动 smoke、校验和、SPDX SBOM、制品证明或 Authenticode 验证。
