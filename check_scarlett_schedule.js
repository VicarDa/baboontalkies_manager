import mysql from 'mysql2/promise';

async function checkScarlettSchedule() {
    const connection = await mysql.createConnection({
        host: '34.87.145.27',
        port: 3306,
        user: 'dev',
        password: '3.@d?*|X|GLc;0%z',
        database: 'baboon'
    });

    console.log('查询Scarlett的未来90天课程...\n');

    const [rows] = await connection.execute(
        `SELECT class_date, class_start_time, teacher, time_num
         FROM yuekebao_classtime
         WHERE (student LIKE '%Scarlett%' OR student LIKE '%沈沐兮%')
         AND class_date >= CURDATE()
         AND class_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)
         ORDER BY class_date, class_start_time`
    );

    console.log(`找到 ${rows.length} 节未来90天的课程:\n`);

    if (rows.length > 0) {
        console.log('前10节课程:');
        rows.slice(0, 10).forEach((row, index) => {
            const dateStr = row.class_date instanceof Date ? row.class_date.toISOString().split('T')[0] : row.class_date;
            console.log(`  ${index + 1}. ${dateStr} ${row.class_start_time} - ${row.teacher} (扣${row.time_num}次)`);
        });

        if (rows.length > 10) {
            console.log(`  ... 还有 ${rows.length - 10} 节课`);
        }
    }

    console.log(`\n总计: ${rows.length} 节课`);

    // 统计扣课次数
    const totalDeductions = rows.reduce((sum, row) => sum + row.time_num, 0);
    console.log(`总扣课次数: ${totalDeductions} 次`);

    // 会员卡数据
    const [cardRows] = await connection.execute(
        `SELECT class_card_type, card_times_left, arranged_times
         FROM yuekebao_student_cardnum
         WHERE (student LIKE '%Scarlett%' OR student LIKE '%沈沐兮%')
         AND card_times_left > 0`
    );

    console.log('\n会员卡数据:');
    cardRows.forEach(card => {
        console.log(`  ${card.class_card_type}: 剩余${card.card_times_left}次, 已排${card.arranged_times}次`);
        const unscheduled = card.card_times_left - totalDeductions;
        console.log(`    未排课时数计算: ${card.card_times_left} - ${totalDeductions} = ${unscheduled}`);
    });

    await connection.end();
}

checkScarlettSchedule().catch(console.error);
