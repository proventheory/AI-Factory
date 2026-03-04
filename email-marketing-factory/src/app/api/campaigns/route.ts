import { NextResponse } from 'next/server'

import axios from 'axios'

import { Parser } from 'xml2js'

import * as cheerio from 'cheerio'


export async function POST(req: Request) {
    try {

        const { sitemap, page, limit } = await req.json()

        const sitemapUrl = sitemap.url
        const type = sitemap.type

        if (!sitemapUrl && !type) return NextResponse.json({ data: null }, { status: 500 })

        const response = await axios.get(sitemapUrl);
        const domain = new URL(sitemapUrl).hostname.replace('www.', '')

        const parser = new Parser();
        const jsonData = await parser.parseStringPromise(response.data);

        if (jsonData.urlset.url) {

            const updateLimit = type == 'shopify' ? 100 : limit

            const paginated = jsonData.urlset.url.slice((page - 1) * updateLimit, (page - 1) * updateLimit + updateLimit)

            console.log('sitemap_type====', type)

            if (type == 'drupal' || type == 'ecommerce') {

                const others: { src: string, title: string, productUrl: string }[] = [];

                const productDataPromises = paginated.map(async (url: any) => {
                    let pattern: string = 'products';

                    if (!url.loc[0].includes(pattern)) pattern = 'product';

                    if (url.loc[0].includes(pattern)) {
                        if (url['image:image'] && url['image:image'].length > 0) {
                            url['image:image'].forEach((ele: any) => {
                                others.push({
                                    src: ele['image:loc'][0],
                                    title: url.loc[0].split(pattern)[1].replace(/-/g, ' ').replace(/\//g, ''),
                                    productUrl: url.loc[0],
                                });
                            });
                        }
                    }

                    try {
                        const productResponse = await axios.get(url.loc[0]);

                        if (productResponse?.data) {
                            const $ = cheerio.load(productResponse.data);
                            const imgSrc = $('img[loading="eager"]').attr('src') ? $('img[loading="eager"]').attr('src') : $('img[loading="lazy"]').attr('src');

                            if (imgSrc && !imgSrc.includes('.gif') && !imgSrc.includes('gif;')) {
                                const fullImgSrc = imgSrc?.includes(domain.split('.')[0]) || imgSrc?.includes('bigcommerce') || imgSrc?.includes('.com/') ? imgSrc : domain.concat(imgSrc || '');

                                return {
                                    src: fullImgSrc,
                                    title: url.loc[0].split(domain)[1]?.replace(`/${pattern}/`, '').replace(/-/g, ' ').replace(/\//g, ''),
                                    productUrl: url.loc[0],
                                };
                            }
                        }
                    } catch (error) {
                    }

                    return null;
                });

                const productData = await Promise.all(productDataPromises);

                const productList = productData.filter(item => item !== null);

                return NextResponse.json({ data: productList.concat(others).length ? productList.concat(others) : null }, { status: 200 });
            } else if (type == 'bigcommerce') {

                const productDataPromises = paginated.map(async (url: any) => {

                    try {

                        if (!jsonData.urlset["$"]["xmlns:image"]) {

                            const productResponse = await axios.get(url.loc[0]);

                            if (productResponse?.data) {
                                const $ = cheerio.load(productResponse.data);

                                return {
                                    src: $('meta[property="og:image"]').attr('content'), title: url.loc[0].split(domain)[1]?.replaceAll('-', ' ')
                                        .replaceAll('/', ''), productUrl: url.loc[0]
                                };
                            }
                        }

                    } catch (error) {

                    }
                })

                const productData = await Promise.all(productDataPromises);

                const productList = productData.filter(item => item != null);

                return NextResponse.json({ data: productList.length ? productList : null }, { status: 200 });

            } else if (type == 'shopify') {
                const productDataPromises = paginated.map(async (url: any) => {
                    if (url.loc[0].search('product') > -1 && url["image:image"] && url["image:image"].length > 0) {

                        return { src: url["image:image"][0]["image:loc"][0], title: url.loc[0].split('product')[1]?.replaceAll('-', ' ').replaceAll('/', ''), productUrl: url.loc[0] }
                    }

                })

                const productData = await Promise.all(productDataPromises);

                const productList = productData.filter(item => item != null);

                return NextResponse.json({ data: productList.length ? productList : null }, { status: 200 });

            }

        } else {
            return NextResponse.json({ data: null }, { status: 500 });
        }
    } catch (error) {

        console.log('error', error)

        return NextResponse.json({ data: null }, { status: 500 });
    }
}

export async function GET() {

    // const sitemapURL = "https://torchdrinks.com/product-sitemap1.xml"
    // const sitemapURL = "https://nuggmeal.com/sitemap_products_1.xml?from=7665289396278&to=7665290412086"
    const sitemapURL = "https://nuggmeal.com/products/cotton-candy"

    const response = await axios.get(sitemapURL)

    

    const parser = new Parser();

    return NextResponse.json({ data: response.data}, { status: 200 });

    const jsonData = await parser.parseStringPromise(response.data)

    const productDataPromises = jsonData.urlset.url.map(async (url: any, index: number) => {

        if (index == 0) {

            const productResponse = await axios.get(url.loc[0]);

            console.log(url.loc[0])

            if (productResponse?.data) {
                const $ = cheerio.load(productResponse.data);
                const imgSrc = $('img[loading="eager"]').attr('src');

                return { data: productResponse.data, imgSrc };

            }
        }
    })

    const productData = await Promise.all(productDataPromises)

    const productList = productData.filter(item => item != null);

    return NextResponse.json({ data: productList }, { status: 200 });



}