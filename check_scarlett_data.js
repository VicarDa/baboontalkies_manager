import mysql from 'mysql2/promise';

async function checkScarlettData() {
    const connection = await mysql.createConnection({
        host: '34.143.219.245',
        port: 3306,
        user: 'dev',
        password: '3.@d?*|X|GLc;0%z',
        database: 'baboon'
    });

    console.log('查询Scarlett的会员卡数据...\n');

    const [rows] = await connection.execute(
        `SELECT student, mobile, class_card_type, card_times_left, arranged_times
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
        console.log('');
    });

    await connection.end();
}

checkScarlettData().catch(console.error);
