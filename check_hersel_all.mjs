import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: '34.87.145.27',
  port: 3306,
  user: 'dev',
  password: '3.@d?*|X|GLc;0%z',
  database: 'baboon'
});

// 查询所有 Hersel 的课程
const [allRows] = await connection.execute(`
  SELECT course_type, COUNT(*) as count
  FROM yuekebao_classtime
  WHERE teacher = 'Hersel'
  GROUP BY course_type
`);

console.log('\n📊 Hersel 老师所有课程类型统计:');
console.table(allRows);

// 查询试课详情
const [trialRows] = await connection.execute(`
  SELECT teacher, student, class_date, class_start_time, course_type
  FROM yuekebao_classtime
  WHERE teacher = 'Hersel' AND course_type = '试课'
  ORDER BY class_date
  LIMIT 20
`);

if (trialRows.length > 0) {
  console.log(`\n✅ 找到 ${trialRows.length} 节试课:`);
  trialRows.forEach((row, i) => {
    console.log(`  ${i+1}. ${row.class_date} ${row.class_start_time} | ${row.student}`);
  });
} else {
  console.log('\n❌ 没有找到任何试课记录');
}

await connection.end();
