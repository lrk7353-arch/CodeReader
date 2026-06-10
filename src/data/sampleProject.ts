import type { SampleFile } from "../types/explanation";

const loginControllerCode = `import { findUserByEmail, verifyPassword } from "./user-store";

type LoginRequest = {
  email: string;
  password: string;
};

type LoginResult =
  | { ok: true; userId: string; displayName: string }
  | { ok: false; reason: "missing_input" | "invalid_credentials" };

export async function loginUser(request: LoginRequest): Promise<LoginResult> {
  const email = request.email.trim().toLowerCase();
  const password = request.password;

  if (!email || !password) {
    return { ok: false, reason: "missing_input" };
  }

  const user = await findUserByEmail(email);

  if (!user) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    return { ok: false, reason: "invalid_credentials" };
  }

  return {
    ok: true,
    userId: user.id,
    displayName: user.displayName
  };
}
`;

export const sampleFiles: SampleFile[] = [
  {
    id: "small-login-controller",
    name: "login-controller.ts",
    path: "examples/small/login-controller.ts",
    language: "typescript",
    code: loginControllerCode,
    codeNodes: [
      {
        id: "sample-target-login-controller-file",
        filePath: "examples/small/login-controller.ts",
        nodeType: "file",
        name: "login-controller.ts",
        startLine: 1,
        endLine: 37,
        codeHash: "sha256:sample-login-controller-file",
        anchorText: 'import { findUserByEmail, verifyPassword } from "./user-store";'
      },
      {
        id: "sample-target-login-controller-import",
        filePath: "examples/small/login-controller.ts",
        nodeType: "import",
        name: 'import { findUserByEmail, verifyPassword } from "./user-store";',
        startLine: 1,
        endLine: 1,
        codeHash: "sha256:sample-login-controller-import",
        anchorText: 'import { findUserByEmail, verifyPassword } from "./user-store";'
      },
      {
        id: "sample-target-login-user-export",
        filePath: "examples/small/login-controller.ts",
        nodeType: "export",
        name: "export async function loginUser",
        startLine: 12,
        endLine: 37,
        codeHash: "sha256:sample-login-user-export",
        anchorText: "export async function loginUser(request: LoginRequest): Promise<LoginResult> {"
      },
      {
        id: "sample-target-login-user-function",
        filePath: "examples/small/login-controller.ts",
        nodeType: "function",
        name: "loginUser",
        startLine: 12,
        endLine: 37,
        symbolId: "function:examples/small/login-controller.ts:loginUser",
        codeHash: "sha256:sample-login-user",
        anchorText: "export async function loginUser(request: LoginRequest): Promise<LoginResult> {"
      },
      {
        id: "sample-target-missing-input-block",
        filePath: "examples/small/login-controller.ts",
        nodeType: "block",
        name: "if",
        startLine: 16,
        endLine: 18,
        symbolId: "block:examples/small/login-controller.ts:16-18",
        codeHash: "sha256:sample-missing-input",
        anchorText: "if (!email || !password) {"
      },
      {
        id: "sample-target-missing-user-block",
        filePath: "examples/small/login-controller.ts",
        nodeType: "block",
        name: "if",
        startLine: 22,
        endLine: 24,
        symbolId: "block:examples/small/login-controller.ts:22-24",
        codeHash: "sha256:sample-missing-user",
        anchorText: "if (!user) {"
      },
      {
        id: "sample-target-password-mismatch-block",
        filePath: "examples/small/login-controller.ts",
        nodeType: "block",
        name: "if",
        startLine: 28,
        endLine: 30,
        symbolId: "block:examples/small/login-controller.ts:28-30",
        codeHash: "sha256:sample-password-mismatch",
        anchorText: "if (!passwordMatches) {"
      }
    ],
    explanations: [
      {
        id: "exp-file-login-controller",
        filePath: "examples/small/login-controller.ts",
        targetType: "file",
        targetName: "login-controller.ts",
        codeMeaning: "这个文件定义了登录请求、登录结果，以及一个处理登录流程的异步函数。",
        localMeaning: "它把输入清洗、用户查找、密码校验和结果返回放在同一个清晰流程里。",
        globalMeaning: "它是认证功能的入口文件之一，决定用户能否从提交表单进入已登录状态。",
        riskNotes: ["需要确认错误原因是否会暴露过多登录信息。"],
        readerNotes: ["先看 LoginResult 类型，再读 loginUser 的分支返回。"],
        status: "valid",
        readingState: "unread",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z"
      },
      {
        id: "exp-line-normalize-email",
        filePath: "examples/small/login-controller.ts",
        targetType: "line",
        startLine: 13,
        endLine: 13,
        codeHash: "sha256:sample-normalize-email",
        anchorText: "const email = request.email.trim().toLowerCase();",
        codeMeaning: "这一行把用户输入的邮箱去掉首尾空格，并统一转换成小写。",
        localMeaning: "后续查询用户时会使用这个标准化后的邮箱，减少大小写或空格造成的匹配失败。",
        globalMeaning: "它让登录入口更稳定，是认证流程中输入清洗的一部分。",
        riskNotes: ["这里只处理了格式清洗，没有验证邮箱格式是否有效。"],
        readerNotes: ["重点理解 trim 和 toLowerCase 是两个连续的字符串处理动作。"],
        status: "valid",
        readingState: "unread",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z"
      },
      {
        id: "exp-block-empty-input",
        filePath: "examples/small/login-controller.ts",
        targetType: "block",
        targetName: "missing input guard",
        startLine: 16,
        endLine: 18,
        codeHash: "sha256:sample-missing-input",
        anchorText: "if (!email || !password)",
        codeMeaning: "这个条件分支检查邮箱或密码是否为空。",
        localMeaning: "它在真正查询用户前拦截明显无效的输入，避免无意义的数据库访问。",
        globalMeaning: "它是登录流程的第一道防线，保证后续认证逻辑只处理基本完整的请求。",
        riskNotes: ["如果前端也做了校验，后端仍然需要保留这类防线。"],
        readerNotes: ["这里的感叹号表示取反，!email 可以理解为邮箱为空或不存在。"],
        status: "valid",
        readingState: "unread",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z"
      },
      {
        id: "exp-function-login-user",
        filePath: "examples/small/login-controller.ts",
        targetType: "function",
        targetName: "loginUser",
        startLine: 12,
        endLine: 37,
        symbolId: "function:loginUser",
        codeHash: "sha256:sample-login-user",
        anchorText: "export async function loginUser",
        codeMeaning: "这个函数接收登录请求，并返回登录成功或失败的结构化结果。",
        localMeaning: "它按输入检查、用户查询、密码校验、成功返回的顺序组织登录逻辑。",
        globalMeaning: "它是认证模块中连接用户输入和登录状态的核心函数。",
        riskNotes: ["需要确认调用方是否限制重复提交和暴力尝试。"],
        readerNotes: ["async 表示函数内部可以等待异步查询和密码校验完成。"],
        status: "valid",
        readingState: "unread",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z"
      }
    ]
  }
];
