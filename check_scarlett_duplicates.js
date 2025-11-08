import mysql from 'mysql2/promise';

async function checkDuplicates() {
    const connection = await mysql.createConnection({
        host: 'rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com',
        port: 3306,
        user: 'baboontalkies',
        password: 'Kiki101422!',
        database: 'baboontalkies'
    });

    console.log('检查Scarlett的所有记录（包括可能的重复）...\n');

    // 查询所有Scarlett记录（不加任何过滤条件）
    const [allRows] = await connection.execute(
        `SELECT student, mobile, class_card_type, card_times_left, arranged_times, time_num
         FROM yuekebao_student_cardnum
         WHERE student LIKE '%Scarlett%' OR student LIKE '%沈沐兮%'
         ORDER BY class_card_type, card_times_left DESC`
    );

    console.log(`数据库中共有 ${allRows.length} 条Scarlett记录:\n`);
    allRows.forEach((row, index) => {
        console.log(`记录${index + 1}: ${row.class_card_type} | 余${row.card_times_left}次 | 已排${row.arranged_times}次 | time_num=${row.time_num}`);
    });

    // 按课程类型分组统计
    console.log('\n按课程类型分组:');
    const typeMap = {};
    allRows.forEach(row => {
        const type = row.class_card_type;
        if (!typeMap[type]) {
            typeMap[type] = [];
        }
        typeMap[type].push({
            remaining: row.card_times_left,
            scheduled: row.arranged_times
        });
    });

    Object.keys(typeMap).forEach(type => {
        console.log(`\n${type}:`);
        typeMap[type].forEach((item, idx) => {
            console.log(`  记录${idx + 1}: 余${item.remaining}次, 已排${item.scheduled}次`);
        });
        console.log(`  小计: ${typeMap[type].length} 条记录`);
    });

    await connection.end();
}

checkDuplicates().catch(console.error);
