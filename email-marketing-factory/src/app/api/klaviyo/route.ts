import { NextResponse } from 'next/server'

import { createProfile } from '.'


export async function POST(req: Request) {
    try {

        const { email, first_name, last_name } = await req.json()

        return await createProfile(email, first_name, last_name)

    } catch (error) {

        return NextResponse.json({}, { status: 500 })
    }
}

