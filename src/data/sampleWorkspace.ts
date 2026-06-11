import type {
  CodeNode,
  Explanation,
  ProjectGuide,
  ProjectTreeNode,
  SampleFile
} from "../types/explanation";
import { sampleFiles as originalSampleFiles } from "./sampleProject";

export const sampleProjectId = "project:sample-auth-flow";
export const sampleProjectRoot = "examples/small";

const appCode = `import { loginUser } from "./login-controller";

type LoginForm = {
  email: string;
  password: string;
};

export async function handleLoginForm(form: LoginForm) {
  const result = await loginUser(form);

  if (!result.ok) {
    return { status: 401, message: "登录失败" };
  }

  return { status: 200, userId: result.userId };
}
`;

const userStoreCode = `export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
};

const users: UserRecord[] = [
  {
    id: "user-001",
    email: "demo@example.com",
    displayName: "Demo User",
    passwordHash: "hash:demo-password"
  }
];

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  return users.find((user) => user.email === email);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return passwordHash === \`hash:\${password}\`;
}
`;

const loginFile: SampleFile = {
  ...originalSampleFiles[0],
  projectId: sampleProjectId,
  projectRoot: sampleProjectRoot,
  relativePath: "login-controller.ts",
  source: "sample",
  isLoaded: true,
  capability: codeCapability(originalSampleFiles[0].code)
};

const appFile = sampleFile(
  "sample-app-entry",
  "app.ts",
  appCode,
  [
    node("sample-app-file", "app.ts", "file", "app.ts", 1, 16),
    node("sample-app-import", "app.ts", "import", 'import { loginUser }', 1, 1),
    node("sample-app-function", "app.ts", "function", "handleLoginForm", 8, 16),
    node("sample-app-block", "app.ts", "block", "if", 11, 13)
  ],
  [
    explanation(
      "sample-exp-app-file",
      "app.ts",
      "file",
      "app.ts",
      "这个文件接收登录表单，并把认证结果转换成界面或接口可以使用的状态。",
      "它先调用登录业务函数，再分别处理失败与成功返回。",
      "它是示例项目的入口，连接用户输入与认证模块。",
      1,
      16
    ),
    explanation(
      "sample-exp-app-function",
      "app.ts",
      "function",
      "handleLoginForm",
      "这个异步函数提交邮箱和密码，并返回登录状态。",
      "函数把业务层的 ok 结果转换为 401 或 200 状态。",
      "它让入口层不需要知道用户查询和密码校验的细节。",
      8,
      16
    ),
    explanation(
      "sample-exp-app-block",
      "app.ts",
      "block",
      "登录失败分支",
      "这个分支在认证失败时立即返回 401。",
      "提前返回会阻止后续成功结果被构造。",
      "它把认证失败明确映射为入口层的拒绝响应。",
      11,
      13
    )
  ]
);

const userStoreFile = sampleFile(
  "sample-user-store",
  "user-store.ts",
  userStoreCode,
  [
    node("sample-store-file", "user-store.ts", "file", "user-store.ts", 1, 23),
    node("sample-store-find", "user-store.ts", "function", "findUserByEmail", 17, 19),
    node("sample-store-verify", "user-store.ts", "function", "verifyPassword", 21, 23)
  ],
  [
    explanation(
      "sample-exp-store-file",
      "user-store.ts",
      "file",
      "user-store.ts",
      "这个文件定义用户记录，并提供按邮箱查找用户和校验密码的函数。",
      "内存数组在示例中扮演数据源，两个查询函数隐藏了具体存储方式。",
      "它是认证流程的数据层，向登录业务提供用户和密码信息。",
      1,
      23
    ),
    explanation(
      "sample-exp-store-find",
      "user-store.ts",
      "function",
      "findUserByEmail",
      "这个函数按邮箱查找第一条匹配的用户记录。",
      "找不到用户时会返回 undefined，调用方必须处理这个分支。",
      "它为登录流程提供用户身份查询能力。",
      17,
      19
    ),
    explanation(
      "sample-exp-store-verify",
      "user-store.ts",
      "function",
      "verifyPassword",
      "这个函数比较示例密码与保存的哈希字符串。",
      "当前写法只用于演示数据流，不是真实安全密码算法。",
      "它代表认证流程中的凭据校验边界。",
      21,
      23,
      ["真实项目必须使用可靠的密码哈希库，不能直接拼接字符串。"]
    )
  ]
);

export const sampleFiles: SampleFile[] = [appFile, loginFile, userStoreFile];

export const sampleProjectNodes: ProjectTreeNode[] = sampleFiles.map((file) => ({
  id: file.id,
  name: file.name,
  path: file.path,
  relativePath: file.relativePath ?? file.name,
  kind: "file",
  capability: file.capability
}));

export const sampleProjectGuide: ProjectGuide = {
  projectId: sampleProjectId,
  rootPath: sampleProjectRoot,
  generatedAt: "2026-06-11T00:00:00.000Z",
  mapItems: [
    mapItem(appFile, "entry", "示例应用入口；可进行结构化解释。"),
    mapItem(loginFile, "business", "登录认证核心业务；可进行结构化解释。"),
    mapItem(userStoreFile, "data", "用户数据与凭据校验边界；可进行结构化解释。")
  ],
  readingPath: [
    pathStep(appFile, 1, "entry", "先从入口理解表单如何进入认证流程。"),
    pathStep(loginFile, 2, "business", "再阅读登录分支、用户查询和密码校验。"),
    pathStep(userStoreFile, 3, "data", "最后补全用户数据来源与安全边界。")
  ],
  progress: {
    total: 3,
    unread: 3,
    read: 0,
    understood: 0,
    questioned: 0,
    suspicious: 0,
    needsReexplain: 0
  }
};

function sampleFile(
  id: string,
  name: string,
  code: string,
  codeNodes: CodeNode[],
  explanations: Explanation[]
): SampleFile {
  return {
    id,
    name,
    path: `${sampleProjectRoot}/${name}`,
    projectId: sampleProjectId,
    projectRoot: sampleProjectRoot,
    relativePath: name,
    language: "typescript",
    code,
    codeNodes,
    explanations,
    capability: codeCapability(code),
    source: "sample",
    isLoaded: true
  };
}

function codeCapability(code: string) {
  return {
    previewKind: "code" as const,
    canPreview: true,
    canExplain: true,
    language: "typescript" as const,
    sizeBytes: code.length
  };
}

function node(
  id: string,
  fileName: string,
  nodeType: CodeNode["nodeType"],
  name: string,
  startLine: number,
  endLine: number
): CodeNode {
  return {
    id,
    filePath: `${sampleProjectRoot}/${fileName}`,
    nodeType,
    name,
    startLine,
    endLine,
    codeHash: `sha256:${id}`,
    anchorText: name
  };
}

function explanation(
  id: string,
  fileName: string,
  targetType: Explanation["targetType"],
  targetName: string,
  codeMeaning: string,
  localMeaning: string,
  globalMeaning: string,
  startLine: number,
  endLine: number,
  riskNotes: string[] = []
): Explanation {
  return {
    id,
    filePath: `${sampleProjectRoot}/${fileName}`,
    targetType,
    targetName,
    startLine,
    endLine,
    codeHash: `sha256:${id}`,
    anchorText: targetName,
    codeMeaning,
    localMeaning,
    globalMeaning,
    riskNotes,
    readerNotes: ["沿推荐阅读路径切换文件，可以看到入口、业务和数据层如何衔接。"],
    status: "valid",
    readingState: "unread",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z"
  };
}

function mapItem(file: SampleFile, role: "entry" | "business" | "data", reason: string) {
  return {
    id: `sample-map-${file.id}`,
    fileId: file.id,
    relativePath: file.relativePath ?? file.name,
    role,
    reason
  };
}

function pathStep(
  file: SampleFile,
  position: number,
  role: "entry" | "business" | "data",
  reason: string
) {
  return {
    id: `sample-path-${file.id}`,
    position,
    fileId: file.id,
    relativePath: file.relativePath ?? file.name,
    role,
    reason,
    readingState: "unread" as const
  };
}
