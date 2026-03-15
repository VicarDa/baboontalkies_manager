import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: '34.87.145.27',
  port: 3306,
  user: 'dev',
  password: '3.@d?*|X|GLc;0%z',
  database: 'baboon'
});

const [rows] = await connection.execute(`
  SELECT teacher, student, class_date, class_start_time, class_end_time, course_type
  FROM yuekebao_classtime
  WHERE teacher = 'Hersel'
    AND class_date >= '2026-01-26'
    AND class_date <= '2026-02-01'
  ORDER BY class_date, class_start_time
`);

console.log('\n📊 Hersel 老师的课程详情 (2026-01-26 ~ 2026-02-01):');
console.log('='.repeat(80));
rows.forEach((row, i) => {
  console.log(`${i+1}. ${row.class_date} ${row.class_start_time}-${row.class_end_time} | ${row.student} | 类型: ${row.course_type}`);
});
console.log('='.repeat(80));
console.log(`\n总计: ${rows.length} 节课`);

// 统计课程类型
const typeCounts = {};
rows.forEach(row => {
  typeCounts[row.course_type] = (typeCounts[row.course_type] || 0) + 1;
});
console.log('\n课程类型统计:');
Object.entries(typeCounts).forEach(([type, count]) => {
  console.log(`  ${type}: ${count} 节`);
});

await connection.end();
