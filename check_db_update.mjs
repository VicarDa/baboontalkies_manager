import mysql from 'mysql2/promise';

async function checkDatabase() {
  const connection = await mysql.createConnection({
    host: '34.143.219.245',
    port: 3306,
    user: 'dev',
    password: '3.@d?*|X|GLc;0%z',
    database: 'baboon'
  });

  try {
    console.log('📊 检查数据库最后更新时间...\n');

    // 检查课程数据表
    const [courseRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total_count,
        MAX(create_time) as last_update,
        MIN(class_date) as earliest_date,
        MAX(class_date) as latest_date
      FROM yuekebao_classtime
    `);
    
    console.log('📅 课程数据表 (yuekebao_classtime):');
    console.log('   总记录数:', courseRows[0].total_count);
    console.log('   最后更新时间:', courseRows[0].last_update);
    console.log('   最早课程日期:', courseRows[0].earliest_date);
    console.log('   最晚课程日期:', courseRows[0].latest_date);
    console.log('');

    // 检查最近的几条课程记录
    const [recentCourses] = await connection.execute(`
      SELECT class_date, class_start_time, teacher, student, create_time
      FROM yuekebao_classtime
      ORDER BY create_time DESC
      LIMIT 5
    `);
    
    console.log('📝 最近5条课程记录:');
    recentCourses.forEach((row, i) => {
      console.log(`   ${i+1}. ${row.class_date} ${row.class_start_time} - ${row.teacher} - ${row.student}`);
      console.log(`      创建时间: ${row.create_time}`);
    });
    console.log('');

    // 检查会员卡数据表
    const [cardRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total_count,
        MAX(create_time) as last_update,
        SUM(card_times_left) as total_remaining
      FROM yuekebao_student_cardnum
    `);
    
    console.log('💳 会员卡数据表 (yuekebao_student_cardnum):');
    console.log('   总记录数:', cardRows[0].total_count);
    console.log('   最后更新时间:', cardRows[0].last_update);
    console.log('   总剩余课时:', cardRows[0].total_remaining);
    console.log('');

    // 检查最近的几条会员卡记录
    const [recentCards] = await connection.execute(`
      SELECT student, class_card_type, card_times_left, arranged_times, create_time
      FROM yuekebao_student_cardnum
      ORDER BY create_time DESC
      LIMIT 5
    `);
    
    console.log('📝 最近5条会员卡记录:');
    recentCards.forEach((row, i) => {
      console.log(`   ${i+1}. ${row.student} - ${row.class_card_type}`);
      console.log(`      剩余: ${row.card_times_left}, 已排: ${row.arranged_times}, 创建: ${row.create_time}`);
    });

  } finally {
    await connection.end();
  }
}

checkDatabase().catch(console.error);
