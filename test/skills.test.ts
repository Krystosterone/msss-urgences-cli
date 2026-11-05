// The agent skills: one shared answer standard, and none of the unsafe rules
// the M0 audit removed (docs/m0-benchmark.md). Offline, reads files only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.agents/skills';
const SKILLS = readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, 'SKILL.md')));
const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');

test('there are five skills, each with frontmatter, a CLI reference and the answer standard', () => {
  assert.deepEqual(SKILLS.sort(), [
    'quebec-sante-chirurgies',
    'quebec-sante-cliniques',
    'quebec-sante-urgences',
    'quebec-sante-urgences-children',
    'quebec-sante-urgences-cumulatif',
  ]);
  for (const s of SKILLS) {
    const body = read(s, 'SKILL.md');
    assert.match(body, new RegExp(`^---\\nname: ${s}\\ndescription: .+\\n`), `${s}: frontmatter`);
    assert.ok(existsSync(join(ROOT, s, 'references', 'cli-reference.md')), `${s}: cli-reference.md`);
    assert.ok(body.includes('(references/answer-standard.md)'), `${s}: SKILL.md links the answer standard`);
  }
});

test('every skill carries the same answer standard', () => {
  const canonical = read('quebec-sante-urgences', 'references', 'answer-standard.md');
  for (const s of SKILLS) {
    assert.equal(read(s, 'references', 'answer-standard.md'), canonical, `${s}: answer-standard.md differs`);
  }
  for (const code of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']) {
    assert.ok(canonical.includes(`| ${code} |`), `answer standard lists ${code}`);
  }
  for (const must of ['911', 'Info-Santé 811', 'not a wait time', 'weekly']) {
    assert.ok(canonical.includes(must), `answer standard says "${must}"`);
  }
});

// Rules and phrasings the M0 audit removed. A skill that brings one back
// should fail here before it reaches an answer.
const BANNED: Array<[RegExp, string]> = [
  [/rank sainte-justine/i, 'hardcoded pediatric ranking'],
  [/hardcoded (pediatric )?ranking/i, 'hardcoded ranking'],
  [/quieter choice|calmest choice/i, 'recommendation template'],
  [/skip the ER/i, 'clinic openings as a reason to skip the ER'],
  [/the ER is the right choice/i, 'no clinic openings as a reason for the ER'],
  [/has capacity today|capacity today/i, 'past clinic offers as current capacity'],
  [/shortest (non-priority )?wait/i, 'occupancy as a wait time'],
  [/better odds of being seen/i, 'offer counts as personal odds'],
  [/lower `?occupancyPct`? = quieter = better/i, 'occupancy as "better"'],
  [/best time to go/i, 'history as advice on when to go'],
  [/clinic data is \*\*daily\*\*|updates daily/i, 'wrong clinic cadence (it is weekly)'],
];

test('no skill file contains a rule the M0 audit removed', () => {
  for (const s of SKILLS) {
    for (const f of ['SKILL.md', join('references', 'cli-reference.md')]) {
      const text = read(s, f);
      for (const [re, why] of BANNED) {
        assert.ok(!re.test(text), `${s}/${f}: ${why} (${re})`);
      }
    }
  }
});

test('ER skills put the emergency step and the triage caveat in the body', () => {
  for (const s of ['quebec-sante-urgences', 'quebec-sante-urgences-children']) {
    const body = read(s, 'SKILL.md');
    assert.match(body, /911/, `${s}: 911`);
    assert.match(body, /triage/i, `${s}: triage`);
  }
  const clinics = read('quebec-sante-cliniques', 'SKILL.md');
  assert.match(clinics, /weekly/i, 'cliniques: says the file is weekly');
  assert.match(clinics, /never decides between a clinic and the ER/i, 'cliniques: no ER routing');
});
