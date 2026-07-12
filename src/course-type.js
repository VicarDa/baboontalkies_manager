export const COURSE_TYPE_LABELS = Object.freeze({
  trial: '试课',
  filipino: '菲教',
  european: '欧教',
  group: '一对多',
  unknown: '未知',
  other: '其他'
});

export const COURSE_TYPE_KEYWORDS = Object.freeze({
  trial: ['试课', '试听'],
  filipino: ['菲教'],
  european: ['欧教', '歐教'],
  group: ['一对多', '一對多'],
  unknown: ['未知'],
  other: ['其他']
});

const includesAnyKeyword = (lowerText, keywords) =>
  keywords.some(keyword => lowerText.includes(String(keyword).toLowerCase()));

export function normalizeCourseType(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const lowerText = raw.toLowerCase();

  if (includesAnyKeyword(lowerText, COURSE_TYPE_KEYWORDS.trial)) {
    return COURSE_TYPE_LABELS.trial;
  }
  if (includesAnyKeyword(lowerText, COURSE_TYPE_KEYWORDS.filipino)) {
    return COURSE_TYPE_LABELS.filipino;
  }
  if (includesAnyKeyword(lowerText, COURSE_TYPE_KEYWORDS.european)) {
    return COURSE_TYPE_LABELS.european;
  }
  if (includesAnyKeyword(lowerText, COURSE_TYPE_KEYWORDS.group)) {
    return COURSE_TYPE_LABELS.group;
  }
  if (includesAnyKeyword(lowerText, COURSE_TYPE_KEYWORDS.unknown)) {
    return COURSE_TYPE_LABELS.unknown;
  }
  if (includesAnyKeyword(lowerText, COURSE_TYPE_KEYWORDS.other)) {
    return COURSE_TYPE_LABELS.other;
  }

  return raw;
}

export function isTrialCourseType(value) {
  return normalizeCourseType(value) === COURSE_TYPE_LABELS.trial;
}

export function isKnownRegularCourseType(value) {
  const normalized = normalizeCourseType(value);
  return [
    COURSE_TYPE_LABELS.filipino,
    COURSE_TYPE_LABELS.european,
    COURSE_TYPE_LABELS.group,
    COURSE_TYPE_LABELS.other
  ].includes(normalized);
}
