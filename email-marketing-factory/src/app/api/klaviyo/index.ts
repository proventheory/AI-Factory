import { NextResponse } from "next/server"

import axios from "axios"


export async function createProfile(email: string, first_name: string, last_name: string) {

    const data = { email, first_name, last_name }

    const response = await axios.post('https://a.klaviyo.com/api/profiles', { data: { type: 'profile', 'attributes': data } }, {
        headers: {
            'Content-Type': 'application/vnd.api+json',
            'revision': '2024-10-15',
            'Accept': 'application/vnd.api+json',
            'Authorization': `Klaviyo-API-Key ${process.env.Klaviyo_API_Key}`
        }
    })

    if (response?.data)
        return NextResponse.json({}, { status: 200 })
    else
        return NextResponse.json({}, { status: 500 })
}