/**
 * Synthetic project fixtures for Beta4 real-project validation. These are
 * NOT real third-party source code; they are generated fixtures used to
 * exercise the scanner, structure list, and context builder at scale without
 * bundling real project source in the repo.
 *
 * - medium: ~120 files across multiple languages, a few long files.
 * - stress: one very long file (3000+ lines), one file with 200+ structure
 *   nodes, a non-UTF-8 binary blob, and a deep directory tree.
 *
 * The fixtures are metadata-only (file paths, sizes, languages) so the
 * scanner/preview boundary logic can be unit-tested without real source.
 */

export interface SyntheticFileEntry {
  path: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
  canPreview: boolean;
  skipReason?: string;
}

export interface SyntheticProjectFixture {
  name: string;
  description: string;
  files: SyntheticFileEntry[];
  expectedTruncated: boolean;
  expectedSkipReasons: Record<string, number>;
}

export const mediumProjectFixture: SyntheticProjectFixture = {
  name: "medium-multilang",
  description:
    "Synthetic medium project: ~120 files across TypeScript, Python, SQL, JSON, Markdown; a few 800-line files.",
  files: [
    ...Array.from({ length: 60 }, (_, i) => ({
      path: `src/module-${Math.floor(i / 10)}/file-${i}.ts`,
      language: "typescript",
      sizeBytes: 4000 + i * 10,
      lineCount: 120 + i,
      canPreview: true
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      path: `src/py/pkg-${i}/service-${i}.py`,
      language: "python",
      sizeBytes: 3000 + i * 5,
      lineCount: 90 + i,
      canPreview: true
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
      path: `db/migration-${i}.sql`,
      language: "sql",
      sizeBytes: 800 + i,
      lineCount: 25 + i,
      canPreview: true
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      path: `docs/doc-${i}.md`,
      language: "markdown",
      sizeBytes: 2000 + i * 20,
      lineCount: 50 + i,
      canPreview: true
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      path: `config/env-${i}.json`,
      language: "json",
      sizeBytes: 500 + i,
      lineCount: 15,
      canPreview: true
    }))
  ],
  expectedTruncated: false,
  expectedSkipReasons: {}
};

export const stressProjectFixture: SyntheticProjectFixture = {
  name: "stress-longfiles-deepdirs",
  description:
    "Synthetic stress project: one 3000-line file, one file with 200+ structure nodes, a binary blob, a non-UTF-8 file, and a 10-level deep directory tree.",
  files: [
    {
      path: "src/generated-bundle.ts",
      language: "typescript",
      sizeBytes: 120000,
      lineCount: 3000,
      canPreview: true
    },
    {
      path: "src/huge-structure.ts",
      language: "typescript",
      sizeBytes: 45000,
      lineCount: 1200,
      canPreview: true
    },
    {
      path: "assets/icon.png",
      language: "binary",
      sizeBytes: 24000,
      lineCount: 0,
      canPreview: false,
      skipReason: "binary"
    },
    {
      path: "data/legacy-GBK.txt",
      language: "text",
      sizeBytes: 8000,
      lineCount: 200,
      canPreview: false,
      skipReason: "invalid_utf8"
    },
    ...Array.from({ length: 8 }, (_, depth) => ({
      path: `deep/${Array.from({ length: depth + 1 }, (_, j) => `level-${j}`).join("/")}/leaf.ts`,
      language: "typescript",
      sizeBytes: 500,
      lineCount: 15,
      canPreview: true
    }))
  ],
  expectedTruncated: false,
  expectedSkipReasons: {
    binary: 1,
    invalid_utf8: 1
  }
};

export const syntheticFixtures = {
  medium: mediumProjectFixture,
  stress: stressProjectFixture
};
