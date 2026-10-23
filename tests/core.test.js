// 시간 점프 수직선 v1.0 핵심 로직 점검: node tests/core.test.js
// HTML 안의 CORE 구간(시간 계산, 문항 은행, 오류 진단)을 그대로 꺼내서 실행한다.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'time-jump-numberline.html'), 'utf8');
const m = html.match(/\/\* ==== CORE:BEGIN ==== \*\/([\s\S]*?)\/\* ==== CORE:END ==== \*\//);
if (!m) throw new Error('CORE 구간을 찾지 못했어요.');
const C = new Function(m[1] + '\nreturn CORE;')();

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('실패:', name, '\n  ', e.message); } };
const dx = (q, h, mi, s) => C.diagnose(q, { h, m: mi, s });
const task = id => C.TASKS.find(x => x.id === id);

// 1) 화면 자가점검과 같은 경계 사례
C.selfCheckCases().forEach(c => t('자가점검: ' + c.name, () => assert.strictEqual(c.got, c.expect)));

// 2) 평가 과제 T1~T5: 정답과 각 오류 유형
t('T1 정답', () => assert.ok(dx(task('T1'), 9, 40, 0).ok));
t('T1 9시 70분은 60분 넘김', () => assert.strictEqual(dx(task('T1'), 9, 70, 0).type, 'carry60'));
t('T2 정답', () => assert.ok(dx(task('T2'), 10, 20, 0).ok));
t('T2 9시 80분 = 60분 넘김', () => assert.strictEqual(dx(task('T2'), 9, 80, 0).type, 'carry60'));
t('T2 10시 80분(값은 다름)도 60분 넘김', () => assert.strictEqual(dx(task('T2'), 10, 80, 0).type, 'carry60'));
t('T3 정답 45분', () => assert.ok(dx(task('T3'), 0, 45, 0).ok));
t('T3 85분 = 100분 받아내림', () => assert.strictEqual(dx(task('T3'), 0, 85, 0).type, 'borrow100'));
t('T3 1시간 15분 = 순서 무시', () => assert.strictEqual(dx(task('T3'), 1, 15, 0).type, 'order'));
t('T3 40분 = 기타', () => assert.strictEqual(dx(task('T3'), 0, 40, 0).type, 'other'));
t('T3 0시간 135분은 정답이 아님(60분 이상)', () => assert.ok(!dx(task('T3'), 0, 135, 0).ok));
t('T4 정답 11시 20분', () => assert.ok(dx(task('T4'), 11, 20, 0).ok));
t('T4 11시 60분 = 100분 받아내림', () => assert.strictEqual(dx(task('T4'), 11, 60, 0).type, 'borrow100'));
t('T4 12시 20분 = 기타', () => assert.strictEqual(dx(task('T4'), 12, 20, 0).type, 'other'));
t('T5 정답 2분 15초', () => assert.ok(dx(task('T5'), 0, 2, 15).ok));
t('T5 1분 75초 = 초-분 단위', () => assert.strictEqual(dx(task('T5'), 0, 1, 75).type, 'sec60'));
t('T5 0분 135초 = 초-분 단위', () => assert.strictEqual(dx(task('T5'), 0, 0, 135).type, 'sec60'));
t('T5 2분 20초 = 기타', () => assert.strictEqual(dx(task('T5'), 0, 2, 20).type, 'other'));

// 3) 시각 표기와 12시 경계
t('정오는 오후 12시', () => assert.strictEqual(C.fmtClock(C.T(12, 0)), '오후 12시'));
t('자정은 오전 12시', () => assert.strictEqual(C.fmtClock(0), '오전 12시'));
t('시계 숫자는 0이 아니라 12', () => { assert.strictEqual(C.clockParts(C.T(12, 30)).h12, 12); assert.strictEqual(C.clockParts(C.T(0, 30)).h12, 12); });
t('오후 1시 = 1', () => assert.strictEqual(C.clockParts(C.T(13, 5)).h12, 1));
t('하루를 넘으면 처음으로', () => assert.strictEqual(C.fmtClock(C.add(C.T(23, 50), C.T(0, 20))), '오전 12시 10분'));

// 4) 바늘 각도: 앞으로 가면 단조 증가(360도에서 튀지 않음), 되돌리면 같은 만큼 감소
t('바늘 각도 단조 증가', () => {
  let prev = C.handAngles(C.T(11, 0));
  for (let s = C.T(11, 0); s <= C.T(13, 0); s += 30) {
    const a = C.handAngles(s);
    assert.ok(a.m >= prev.m && a.h >= prev.h && a.s >= prev.s);
    prev = a;
  }
});
t('1분 = 분침 6도, 시침 0.5도 / 1초 = 초침 6도', () => {
  const a = C.handAngles(60), b = C.handAngles(0);
  assert.strictEqual(a.m - b.m, 6); assert.strictEqual(a.h - b.h, 0.5); assert.strictEqual(C.handAngles(1).s, 6);
});

// 5) 점프
t('정각까지: 9시 40분 → +20분', () => assert.strictEqual(C.jumpFor('fill', 1, C.T(9, 40), 'min'), 1200));
t('정각까지: 이미 정각이면 없음', () => assert.strictEqual(C.jumpFor('fill', 1, C.T(10, 0), 'min'), null));
t('거꾸로 정각까지: 12시 10분 → -10분', () => assert.strictEqual(C.jumpFor('fill', -1, C.T(12, 10), 'min'), -600));
t('분 채우기: 1분 45초 → +15초', () => assert.strictEqual(C.jumpFor('fill', 1, C.T(10, 31, 45), 'sec'), 15));
t('거꾸로 -1시간', () => assert.strictEqual(C.jumpFor('h', -1, C.T(12, 10), 'min'), -3600));

// 6) 문항 은행 점검
const all = C.TASKS.concat(C.PRACTICE);
t('문항 번호가 겹치지 않음', () => assert.strictEqual(new Set(all.map(q => q.id)).size, all.length));
t('평가 과제 5개, 연습 문항 15개 이상', () => { assert.strictEqual(C.TASKS.length, 5); assert.ok(C.PRACTICE.length >= 15); });
t('연습 문항: 세 유형이 고르게(각 5개 이상), 초 단위 3개 이상', () => {
  ['end', 'dur', 'start'].forEach(k => assert.ok(C.PRACTICE.filter(q => q.type === k).length >= 5, k));
  assert.ok(C.PRACTICE.filter(q => q.unit === 'sec').length >= 3);
});
t('연습 문항 대부분이 정각(분 단위 문항) 또는 분 경계(초 단위 문항)를 넘음', () => {
  const crossing = C.PRACTICE.filter(q => {
    const sol = C.solve(q), B = q.unit === 'sec' ? 60 : 3600;
    const a = sol.anchor, b = sol.anchor + sol.total;
    return Math.floor(Math.min(a, b) / B) !== Math.floor(Math.max(a, b) / B);
  });
  assert.ok(crossing.length / C.PRACTICE.length >= 0.85, `${crossing.length}/${C.PRACTICE.length}`);
});
t('모든 문항: 정답이 정답으로 판정되고, 정답 입력값이 60 미만', () => all.forEach(q => {
  const sol = C.solve(q);
  const f = sol.kind === 'time' ? C.timeFields(sol.sec) : C.durFields(sol.sec);
  assert.ok(f.m < 60 && f.s < 60, q.id);
  assert.ok(C.diagnose(q, f).ok, q.id + ' 정답 판정');
}));
t('모든 문항: 글에 시각·길이가 빠짐없이 채워짐', () => all.forEach(q => {
  const tx = C.questionText(q);
  assert.ok(!/[{}]/.test(tx.story + tx.ask), q.id + ' 자리표시자');
  if (q.start != null) assert.ok(tx.story.includes(C.fmtClock(q.start, q.unit === 'sec')), q.id + ' 시작');
  if (q.end != null) assert.ok(tx.story.includes(C.fmtClock(q.end, q.unit === 'sec')), q.id + ' 끝');
}));
t('오류 4종이 연습 문항에서 모두 유발됨', () => {
  const seen = new Set();
  C.PRACTICE.forEach(q => C.errorProcedures(q, C.solve(q)).forEach(p => {
    const sol = C.solve(q);
    // 절차 결과가 정답과 다를 때만 오류로 센다
    const correct = C.diagnose(q, p.f).ok;
    if (!correct) seen.add(p.type);
  }));
  ['carry60', 'borrow100', 'order', 'sec60'].forEach(e => assert.ok(seen.has(e), e));
});
t('모든 문항: 오류 절차 입력이 해당 유형으로 판정됨(정답과 다른 경우)', () => all.forEach(q => {
  C.errorProcedures(q, C.solve(q)).forEach(p => {
    const d = C.diagnose(q, p.f);
    if (!d.ok) assert.ok(['borrow100', 'order', 'carry60', 'sec60'].includes(d.type), q.id);
  });
}));
t('시간 표기에 해당하는 학교 일과: 오전 8시 이전/오후 5시 이후 없음', () => all.forEach(q => {
  [q.start, q.end].filter(x => x != null).forEach(x => assert.ok(x >= C.T(8, 30) && x <= C.T(16, 0), q.id));
}));

// 7) 요약과 CSV
t('summarize와 CSV', () => {
  const recs = [
    { id: 'a', ts: 1, mode: 'eval', pid: 'S1', task: 'T2', qid: 'T2', qtype: 'end', outcome: 'retry', ms: 20000, attempts: 2, answers: ['9시 80분', '10시 20분'], errors: ['carry60'], help: 0, stalls: [{ t: 7, phase: '답 입력 중' }], jumps: '9시 40분 → +20분 → 10시 → +20분 → 10시 20분', memo: '"메모", 쉼표', usab: 'slow' },
    { id: 'b', ts: 2, mode: 'eval', pid: 'S2', task: 'T2', qid: 'T2', qtype: 'end', outcome: 'first', ms: 10000, attempts: 1, answers: ['10시 20분'], errors: [], help: 0, stalls: [], jumps: '', memo: '', usab: '' },
    { id: 'c', ts: 3, mode: 'practice', pid: 'S1', task: '연습', qid: 'P01', qtype: 'end', outcome: 'first', ms: 1000, attempts: 1, answers: [], errors: [], help: 0, stalls: [], jumps: '' },
  ];
  const sm = C.summarize(recs);
  const t2 = sm.tasks.find(x => x.id === 'T2');
  assert.strictEqual(t2.n, 2); assert.strictEqual(t2.first, 1); assert.strictEqual(t2.retry, 1); assert.strictEqual(t2.succ, 1);
  assert.strictEqual(sm.errors.find(e => e.type === 'carry60').total, 1);
  assert.strictEqual(sm.stalls.length, 1);
  const csv = C.toCSV(recs);
  assert.ok(csv.split('\n').length === 4);
  assert.ok(csv.includes('"""메모"", 쉼표"'));
});

// 8) 금지 표현 점검(학습효과를 암시하는 말)
t('학습효과를 암시하는 표현이 없음', () => {
  const visible = html.replace(/<style[\s\S]*?<\/style>/g, '');
  ['향상', '개선 효과', '효과가 있', '실력이 늘'].forEach(w => assert.ok(!visible.includes(w), w));
});
t('외부 자원을 쓰지 않음', () => {
  assert.ok(!/<script[^>]+src=/i.test(html));
  assert.ok(!/<link[^>]+href=/i.test(html));
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket)\b/.test(html));
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(html));
});

console.log(`\n통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
