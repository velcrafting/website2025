import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createModuleLoader } from '../editor/_module-loader.mjs';

const repository = 'velcrafting/micro-engine';
const url = `https://github.com/${repository}`;
const enrolled = `## Current Focus\n## Start Here\n## Public Builds\n- [Micro Engine](${url})\n`;
const withdrawn = '## Current Focus\n## Start Here\n## Public Builds\n';
const org = '## What We Build\n## Start Here\n## Recommended Pins\n## Public Builds\n';
let state = 'enrolled';
const calls = [];
const fixtureFetch = async (raw, init) => {
  const path = new URL(raw).pathname;
  calls.push({ path, revalidate: init?.next?.revalidate });
  if (path.startsWith('/repos/')) {
    const identity = path.slice('/repos/'.length);
    if (identity === repository && state === 'absent') return new Response('', { status: 404 });
    if (identity === repository && state === 'unknown') return new Response('', { status: 503 });
    return new Response(JSON.stringify({
      full_name: identity === repository && state === 'renamed' ? 'velcrafting/different' : identity,
      html_url: `https://github.com/${identity}`,
      private: identity === repository && state === 'private',
      default_branch: 'trunk', archived: false, language: 'JavaScript', topics: [],
    }));
  }
  if (path === '/velcrafting/velcrafting/trunk/README.md') {
    return new Response(state === 'withdrawn' ? withdrawn : enrolled);
  }
  if (path === '/Vel-Labs/.github/trunk/profile/README.md') {
    return new Response(org, { status: state === 'partial' ? 503 : 200 });
  }
  return new Response('', { status: 404 });
};
const loader = createModuleLoader({ fetchImpl: fixtureFetch, stubs: {
  '@/lib/seo': { buildMetadata: value => value },
}});
const { extractReadmeIndex, PERSONAL_README } = loader.load('src/lib/github/readme-index.ts');
const { readReadmeIndexes, readRepoMetadata, DAILY_REVALIDATE_SECONDS } = loader.load('src/lib/github/portfolio-source.ts');
const { buildPortfolioView } = loader.load('src/lib/portfolio-view.ts');
const { default: Page } = loader.load('src/app/projects/page.tsx');
const entries = extractReadmeIndex(enrolled, PERSONAL_README).entries;
assert.equal(entries[0].section, 'Public Builds');
assert.equal(entries[0].label, 'Micro Engine');

const readme = await readReadmeIndexes(fixtureFetch);
assert.equal(readme.complete, true);
assert.ok(calls.some(call => call.path.includes('/trunk/README.md')));
assert.ok(!calls.some(call => call.path.includes('/main/')));
assert.ok(calls.every(call => call.revalidate === DAILY_REVALIDATE_SECONDS));

const duplicate = { ...entries[0], owner: 'VELCRAFTING', repo: 'MICRO-ENGINE' };
const publicMetadata = await readRepoMetadata([entries[0], duplicate], fixtureFetch);
assert.equal(Object.keys(publicMetadata.byRepo).length, 1);
assert.equal(buildPortfolioView({ readmeEntries: [entries[0], duplicate], readmeComplete: true,
  metadata: publicMetadata, editorial: [] }).cards.length, 1);

const render = async (q = 'micro-engine') => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ q }) }));
let html = await render();
assert.match(html, /<article[^>]*data-project-repository="velcrafting\/micro-engine"/);
assert.match(html, /Micro Engine/);
assert.match(html, /href="https:\/\/github.com\/velcrafting\/micro-engine"/);
assert.doesNotMatch(html, /Version /, 'missing release note invents no version');
for (state of ['private', 'absent', 'unknown', 'renamed']) {
  html = await render();
  assert.doesNotMatch(html, /data-project-repository="velcrafting\/micro-engine"/, state);
  assert.doesNotMatch(html, /href="https:\/\/github.com\/velcrafting\/micro-engine"/, state);
  assert.doesNotMatch(html, /Micro Engine/, 'withheld entries do not name new projects');
  const metadata = await readRepoMetadata(entries, fixtureFetch);
  const view = buildPortfolioView({ readmeEntries: entries, readmeComplete: true, metadata,
    editorial: [{ ...entries[0], label: 'Authored case study', lane: 'local-first-ai' }] });
  assert.equal(view.cards.length, 1, 'authored story survives');
  assert.equal(view.cards[0].url, '', 'failed repository cannot regain an editorial link');
}
state = 'withdrawn';
html = await render();
assert.doesNotMatch(html, /data-project-repository="velcrafting\/micro-engine"/);
assert.match(html, /No projects match this filter/);
assert.equal(buildPortfolioView({ readmeEntries: [], readmeComplete: true,
  metadata: { byRepo: {}, unknown: [], unavailable: [], complete: true }, editorial: [] }).cards.length, 0,
'complete empty indexes must not restore managed entries');
state = 'partial';
html = await render();
assert.match(html, /serving the committed baseline for both indexes/);
assert.doesNotMatch(html, /data-project-repository="velcrafting\/micro-engine"/);
state = 'enrolled';
html = await render('does-not-match');
assert.doesNotMatch(html, /data-project-repository="velcrafting\/micro-engine"/);
assert.match(html, /No projects match this filter/);
html = await render('risqpost');
assert.match(html, /Risqpost/);
assert.doesNotMatch(html, /data-project-repository=/, 'local story invents no repository admission');
// Historical public metadata may supply facts, but cannot establish a current public link.
let baselineReadme = readme;
const baselineLoader = createModuleLoader({ fetchImpl: fixtureFetch, stubs: {
  '@/lib/seo': { buildMetadata: value => value },
  '@/lib/github/portfolio-source': {
    readReadmeIndexes: async () => baselineReadme,
    readRepoMetadata: async () => ({ byRepo: {}, unknown: [], unavailable: [], complete: true }),
  },
  '@/lib/portfolio-projects': {
    projectLanes: [{ id: 'mcp-tooling', title: 'Tooling' }],
    laneById: () => ({ id: 'mcp-tooling', title: 'Tooling' }),
    portfolioProjects: [{ slug: 'micro-engine', name: 'Authored baseline story', lane: 'mcp-tooling',
      status: 'active', summary: 'micro-engine authored content', proves: 'Fixture preservation',
      stack: [], links: [{ label: 'Repository', href: url }] }],
  },
} });
const baselineMetadata = baselineLoader.load('src/lib/github/fallback.ts').FALLBACK_METADATA;
baselineMetadata[repository] = publicMetadata.byRepo[repository];
const baselinePage = baselineLoader.load('src/app/projects/page.tsx').default;
for (const editorialOnly of [false, true]) {
  if (editorialOnly) baselineReadme = { ...readme, extractions: [{ entries: [], found: ['Public Builds'], missing: [] }] };
  const baselineHtml = renderToStaticMarkup(await baselinePage({ searchParams: Promise.resolve({ q: 'micro-engine' }) }));
  assert.match(baselineHtml, /Authored baseline story/, 'historical metadata preserves authored text');
  assert.doesNotMatch(baselineHtml, /data-project-repository=/, 'historical public facts do not create a current marker');
  assert.doesNotMatch(baselineHtml, /href="https:\/\/github.com\/velcrafting\/micro-engine"/,
    'historical public facts do not create a current repository link');
}
console.log('Projects pilot: Public Builds, non-main default branch, canonical casefold, public admission, article marker, editorials, historical-baseline admission, withdrawal, partial fallback and query filter passed (synthetic route HTML).');
