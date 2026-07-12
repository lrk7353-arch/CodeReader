import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function expectLocalMarkdownLinksToExist(markdown, owner) {
  const links = [...markdown.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)].map(
    (match) => match[1]
  );
  for (const link of links) {
    if (/^(?:https?:|mailto:)/i.test(link)) {
      continue;
    }
    expect(existsSync(resolve(owner, link)), owner + " -> " + link).toBe(true);
  }
}

describe("public documentation", () => {
  it("keeps the bilingual README entry points and the complete Chinese user guide", () => {
    const englishReadme = read("README.md");
    const chineseReadme = read("README.zh-CN.md");

    expect(englishReadme).toContain("[简体中文](README.zh-CN.md)");
    expect(englishReadme).toContain("Install, remove, and troubleshoot");
    expect(englishReadme).toContain("sudo apt remove codereader");
    expect(englishReadme).toContain("Blank window on Windows");
    expect(chineseReadme).toContain("[English](README.md)");
    expect(chineseReadme).toContain("安装与首次启动");
    expect(chineseReadme).toContain("卸载与本地数据");
    expect(chineseReadme).toContain("常见问题与排障");
    expect(chineseReadme).toContain("验证下载文件");
    expect(chineseReadme).toContain("Windows 未签名提示");
    expect(chineseReadme).toContain("所有普通文件会显示在左侧树中");
    expect(chineseReadme).toContain("Windows 10 22H2 或 Windows 11");
    expect(chineseReadme).toContain("Linux，glibc 2.35");
    expect(chineseReadme).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);

    expectLocalMarkdownLinksToExist(englishReadme, root);
    expectLocalMarkdownLinksToExist(chineseReadme, root);
  });

  it("keeps a user-facing Release-page contract separate from the maintainer runbook", () => {
    const runbook = read("docs/release/github-release.md");
    const publicSpec = read("docs/release/public-release-notes.zh-CN.md");

    expect(runbook).toContain("public-release-notes.zh-CN.md");
    expect(publicSpec).toContain("十个平台安装包");
    expect(publicSpec).toContain("SHA256SUMS");
    expect(publicSpec).toContain("Authenticode");
    expect(publicSpec).toContain("native-smoke");
    expect(publicSpec).toContain("不是已经发布的软件");
    expect(publicSpec).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);

    expectLocalMarkdownLinksToExist(runbook, resolve(root, "docs/release"));
    expectLocalMarkdownLinksToExist(publicSpec, resolve(root, "docs/release"));
  });

  it("keeps a release-feedback intake and a non-destructive monitoring procedure", () => {
    const issueForm = read(".github/ISSUE_TEMPLATE/release_feedback.yml");
    const monitoring = read("docs/release/post-release-monitoring.md");

    expect(issueForm).toContain('labels: ["release-feedback"]');
    expect(issueForm).toContain("Windows NSIS setup.exe");
    expect(issueForm).toContain("Linux AppImage");
    expect(issueForm).toContain("I matched the downloaded file to SHA256SUMS.");
    expect(issueForm).toContain("Do not include source code, prompts");
    expect(monitoring).toContain("Immediate rollback triggers");
    expect(monitoring).toContain("Do not silently replace an existing asset or reuse a tag.");
    expect(monitoring).toContain("first 7 days");
    expect(monitoring).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);
  });

  it("keeps a readable, non-corrupted public history across supported versions", () => {
    const changelog = read("CHANGELOG.md");
    const history = read("docs/history/version-history.zh-CN.md");
    const readme = read("README.md");
    const chineseReadme = read("README.zh-CN.md");

    expect(changelog).toContain("1.0.0-rc.2");
    expect(readme).toContain("Current channel: `1.0.0-rc.2`");
    expect(chineseReadme).toContain("1.0.0-rc.2 候选版");
    expect(changelog).toContain("0.11.0-beta.4");
    expect(changelog).toContain("0.10.0");
    expect(changelog).toContain("0.1.0");
    expect(history).toContain("升级与数据兼容性");
    expect(history).toContain("0.10.x");
    expect(history).toContain("0.11.x");
    expect(history).toContain("不支持的操作");
    expect(changelog).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);
    expect(history).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);

    expectLocalMarkdownLinksToExist(changelog, root);
    expectLocalMarkdownLinksToExist(history, resolve(root, "docs/history"));
  });
});
