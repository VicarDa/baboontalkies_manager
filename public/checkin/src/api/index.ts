import axios from "axios"






export interface IpageDate<T> {
    list: T[],
    pagination: {
        page: number,
        size: number,
        total: number
    }
}

let base = ''

export default async function api<T = unknown>(url: string, data?: any, method: 'GET' | 'POST' = 'GET') {
    return new Promise<T>((res, rej) => {
        axios({
            url: base + url,
            data,
            method,

        }).then(result => {
            const data = result.data as any
            if (data.code === 1000) {
                res(data.data)
            } else {
                rej(data.msg)
            }
        }).catch(err => {
            rej(err)
        })
    })

}





