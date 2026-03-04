import { NextResponse } from 'next/server'

interface RequestBody {
    type: string;
    page: number;
    limit: number;  
    search: string;
}

export async function POST(req: Request) {
    try {

        const data: RequestBody = await req.json()

        const request = data.search ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(data.search)}&page=${data.page}&client_id=${process.env.UNSPLASH_ACCESS_KEY}` : `https://api.unsplash.com/photos/?page=${data.page}&client_id=${process.env.UNSPLASH_ACCESS_KEY}`

        console.log('request', request)

        const response = await fetch(request).then(data => {
            if (!data.ok) {
                throw new Error(`HTTP error! Status: ${data.status}`);
            }

            return data.json();
        })

        return NextResponse.json({ data: response }, { status: 200 });

    } catch (error) {

        return NextResponse.json({ data: null }, { status: 500 });
    }
}