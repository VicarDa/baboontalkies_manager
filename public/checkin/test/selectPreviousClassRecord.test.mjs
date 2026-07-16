import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPreviousClassRecord } from '../src/teacher/selectPreviousClassRecord.ts';

test('selects the latest earlier lesson when ClassIn changes courseId', () => {
  const current = {
    classId: '1108912049',
    courseId: '308070187',
    studId: '79855796',
    classBtime: 1783922400,
  };
  const july11 = {
    classId: '1108327829',
    courseId: '307984491',
    studId: '79855796',
    classBtime: 1783764000,
  };

  assert.deepEqual(
    selectPreviousClassRecord([current, july11], current),
    [july11]
  );
});
