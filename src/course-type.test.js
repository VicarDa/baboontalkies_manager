import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COURSE_TYPE_LABELS,
  isKnownRegularCourseType,
  isTrialCourseType,
  normalizeCourseType
} from './course-type.js';

test('recognizes normal UTF-8 Chinese trial class labels', () => {
  assert.equal(normalizeCourseType('试课'), COURSE_TYPE_LABELS.trial);
  assert.equal(normalizeCourseType('试听'), COURSE_TYPE_LABELS.trial);
  assert.equal(isTrialCourseType('试课'), true);
});

test('does not recognize mojibake text as a valid trial class label', () => {
  assert.notEqual(normalizeCourseType('璇曟'), COURSE_TYPE_LABELS.trial);
  assert.notEqual(normalizeCourseType('璇曞惉'), COURSE_TYPE_LABELS.trial);
  assert.equal(isTrialCourseType('璇曟'), false);
});

test('does not treat unknown labels as trial classes', () => {
  assert.equal(normalizeCourseType('未知'), COURSE_TYPE_LABELS.unknown);
  assert.equal(isTrialCourseType('未知'), false);
});

test('normalizes regular course labels from normal UTF-8 Chinese', () => {
  assert.equal(normalizeCourseType('菲教25分钟'), COURSE_TYPE_LABELS.filipino);
  assert.equal(normalizeCourseType('欧教'), COURSE_TYPE_LABELS.european);
  assert.equal(normalizeCourseType('一对多'), COURSE_TYPE_LABELS.group);
});

test('counts only known non-trial course labels as regular classes', () => {
  assert.equal(isKnownRegularCourseType('菲教'), true);
  assert.equal(isKnownRegularCourseType('欧教'), true);
  assert.equal(isKnownRegularCourseType('一对多'), true);
  assert.equal(isKnownRegularCourseType('其他'), true);
  assert.equal(isKnownRegularCourseType('试课'), false);
  assert.equal(isKnownRegularCourseType('未知'), false);
  assert.equal(isKnownRegularCourseType('璇曟'), false);
});
