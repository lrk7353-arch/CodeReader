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

    expect(changelog).toContain("1.0.0-rc.3");
    expect(changelog).toContain("1.0.0-rc.2");
    expect(readme).toContain("Current channel: `1.0.0-rc.3`");
    expect(chineseReadme).toContain("1.0.0-rc.3 候选版");
    expect(changelog).toContain("0.11.0-beta.4");
    expect(changelog).toContain("0.10.0");
    expect(changelog).toContain("0.1.0");
    expect(history).toContain("升级与数据兼容性");
    expect(history).toContain("1.0.0-rc.3");
    expect(history).toContain("0.10.x");
    expect(history).toContain("0.11.x");
    expect(history).toContain("不支持的操作");
    expect(changelog).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);
    expect(history).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);

    expectLocalMarkdownLinksToExist(changelog, root);
    expectLocalMarkdownLinksToExist(history, resolve(root, "docs/history"));
  });

  it("describes the approved product-reset decision consistently", () => {
    const documentationIndex = read("docs/README.md");
    const decision = read("docs/architecture/2026-08-09-product-reset-decision.md");
    const plan = read("docs/plans/2026-08-09-product-reset-plan.md");
    const r0Baseline = read("docs/plans/2026-08-09-product-reset-r0-baseline.md");
    const r0Evidence = read("docs/plans/2026-08-09-product-reset-r0-evidence.md");

    expect(documentationIndex).toContain("Current accepted product reset records:");
    expect(documentationIndex).toContain("accepted decision restoring");
    expect(documentationIndex).toContain("accepted product, architecture");
    expect(documentationIndex).not.toContain("Current product reset proposals:");
    expect(documentationIndex).not.toContain("proposed decision restoring");
    expect(decision).toContain("**状态：** Accepted");
    expect(plan).toContain("**状态：** Accepted");
    expect(r0Baseline).toContain("[R0 隔离门禁证据](2026-08-09-product-reset-r0-evidence.md)");
    expect(r0Evidence).toContain("`vite@8.1.4`");
    expect(r0Evidence).not.toMatch(/\/(?:home|Users)\//i);

    expectLocalMarkdownLinksToExist(documentationIndex, resolve(root, "docs"));
    expectLocalMarkdownLinksToExist(r0Baseline, resolve(root, "docs/plans"));
  });

  it("keeps R4 positioning honest about validation targets and maintainer acceptance", () => {
    const readme = read("README.md");
    const chineseReadme = read("README.zh-CN.md");
    const changelog = read("CHANGELOG.md");
    const history = read("docs/history/version-history.zh-CN.md");
    const publicSpec = read("docs/release/public-release-notes.zh-CN.md");
    const evidence = read("docs/plans/2026-08-12-product-reset-r4-evidence.md");
    const deferred = read("docs/plans/待处理问题及其优先级.md");

    expect(readme).toContain("project map and reading path");
    expect(readme).toContain("validation targets, not published SLAs");
    expect(chineseReadme).toContain("从项目地图和推荐阅读路径出发");
    expect(chineseReadme).toContain("不是公开 SLA");
    expect(changelog).toContain("产品复位候选");
    expect(history).not.toContain("未发布的产品复位候选");
    expect(history).toContain("R4 的三类真实项目人工使用验收已经完成并通过");
    expect(history).toContain("当前未完成范围仅是 R5");
    expect(publicSpec).toContain("只是内部验证目标，不是 SLA");
    expect(evidence).toContain("维护者已完成人工使用并整体通过");
    expect(evidence).toContain("Sol `high` 独立监督");
    expect(evidence).toContain("R4 通过不等于 R5、1.0 或公开发布完成");
    expect(evidence).toContain("不冒充外部用户项目或真实用户研究");
    expect(deferred).toContain("R4 维护者真实使用验收");

    for (const [owner, markdown] of [
      [root, readme],
      [root, chineseReadme],
      [root, changelog],
      [resolve(root, "docs/history"), history],
      [resolve(root, "docs/release"), publicSpec],
      [resolve(root, "docs/plans"), evidence],
      [resolve(root, "docs/plans"), deferred]
    ]) {
      expect(markdown).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);
      expectLocalMarkdownLinksToExist(markdown, owner);
    }
  });

  it("keeps R5 package smoke separate from the complete native product journey", () => {
    const runbook = read("docs/release/github-release.md");
    const evidence = read("docs/plans/2026-08-12-product-reset-r5-evidence.md");
    const deferred = read("docs/plans/待处理问题及其优先级.md");

    expect(runbook).toContain("Package smoke and the complete product journey are separate gates");
    expect(runbook).toContain("verify-journeys");
    expect(evidence).toContain("候选执行中，未 `PASS`，未公开发布");
    expect(evidence).toContain("Windows ARM64");
    expect(evidence).toContain("windowsAuthenticodeSigned: false");
    expect(deferred).toContain("已转入 R5 原生旅程门禁");
    expect(deferred).toContain("当前状态：R5 阻塞项");

    for (const [owner, markdown] of [
      [resolve(root, "docs/release"), runbook],
      [resolve(root, "docs/plans"), evidence],
      [resolve(root, "docs/plans"), deferred]
    ]) {
      expect(markdown).not.toMatch(/\uFFFD|(?:Ã.|Â.|â..)/);
      expectLocalMarkdownLinksToExist(markdown, owner);
    }
  });
});
