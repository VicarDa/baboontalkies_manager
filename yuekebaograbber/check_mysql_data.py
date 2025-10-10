#!/usr/bin/env python3
import pymysql
import sys

def connect_and_query():
    try:
        # 连接数据库
        connection = pymysql.connect(
            host='localhost',
            user='root',
            password='123456',
            database='yuekebao',
            charset='utf8mb4'
        )

        cursor = connection.cursor()

        print("=" * 60)
        print("MySQL数据库连接成功！")
        print("数据库: yuekebao")
        print("表: yuekebao_classtime")
        print("=" * 60)

        # 查询1: 总记录数
        print("\n1. 总记录数:")
        cursor.execute("SELECT COUNT(*) as total_count FROM yuekebao_classtime;")
        result = cursor.fetchone()
        print(f"   总共有 {result[0]} 条课程记录")

        # 查询2: 日期范围
        print("\n2. 课程日期范围:")
        cursor.execute("SELECT MIN(class_date) as earliest_date, MAX(class_date) as latest_date FROM yuekebao_classtime;")
        result = cursor.fetchone()
        print(f"   最早日期: {result[0]}")
        print(f"   最晚日期: {result[1]}")

        # 查询3: 最近10天课程分布
        print("\n3. 最近10天课程分布:")
        cursor.execute("SELECT class_date, COUNT(*) as count FROM yuekebao_classtime GROUP BY class_date ORDER BY class_date DESC LIMIT 10;")
        results = cursor.fetchall()
        print("   日期        | 课程数量")
        print("   " + "-" * 25)
        for row in results:
            print(f"   {row[0]}  | {row[1]}")

        # 查询4: 未来30天课程数量
        print("\n4. 未来30天课程数量:")
        cursor.execute("SELECT COUNT(*) as future_30days_count FROM yuekebao_classtime WHERE class_date >= CURDATE() AND class_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY);")
        result = cursor.fetchone()
        print(f"   未来30天内有 {result[0]} 条课程记录")

        # 查询5: 当前日期和30天后日期
        print("\n5. 日期信息:")
        cursor.execute("SELECT CURDATE() as current_date, DATE_ADD(CURDATE(), INTERVAL 30 DAY) as future_30days_date;")
        result = cursor.fetchone()
        print(f"   当前日期: {result[0]}")
        print(f"   30天后日期: {result[1]}")

        print("\n" + "=" * 60)
        print("查询完成！")

    except pymysql.Error as e:
        print(f"数据库连接或查询错误: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"其他错误: {e}")
        sys.exit(1)
    finally:
        if 'connection' in locals():
            connection.close()

if __name__ == "__main__":
    connect_and_query()