import mysql from 'mysql2/promise';

async function checkScarlettFull() {
    const connection = await mysql.createConnection({
        host: 'rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com',
        port: 3306,
        user: 'baboontalkies',
        password: 'Kiki101422!',
        database: 'baboontalkies'
    });

    console.log('查询Scarlett的完整会员卡数据（包括time_num字段）...\n');

    const [rows] = await connection.execute(
        `SELECT student, mobile, class_card_type, card_times_left, arranged_times, time_num, create_time
         FROM yuekebao_student_cardnum
         WHERE student LIKE '%Scarlett%' OR student LIKE '%沈沐兮%'
         ORDER BY class_card_type, card_times_left DESC`
    );

    console.log(`找到 ${rows.length} 条Scarlett相关记录:\n`);
    rows.forEach((row, index) => {
        console.log(`记录${index + 1}:`);
        console.log(`  学生: ${row.student}`);
        console.log(`  手机: ${row.mobile}`);
        console.log(`  课程类型: ${row.class_card_type}`);
        console.log(`  剩余课时: ${row.card_times_left}`);
        console.log(`  已排课数: ${row.arranged_times}`);
        console.log(`  time_num: ${row.time_num}`);
        console.log(`  创建时间: ${row.create_time}`);
        console.log('');
    });

    // 模拟API查询条件
    console.log('\n使用API查询条件 WHERE time_num > 0:');
    const [apiRows] = await connection.execute(
        `SELECT student, class_card_type, card_times_left, arranged_times
         FROM yuekebao_student_cardnum
         WHERE (student LIKE '%Scarlett%' OR student LIKE '%沈沐兮%')
         AND time_num > 0
         ORDER BY class_card_type`
    );

    console.log(`\nAPI将返回 ${apiRows.length} 条记录:`);
    apiRows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.class_card_type}: 剩余${row.card_times_left}课时, 已排${row.arranged_times}次`);
    });

    await connection.end();
}

checkScarlettFull().catch(console.error);
