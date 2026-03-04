
import { NextResponse } from 'next/server'


export async function GET() {


  // const { data } = await supabase.from('profiles_brand').select('data, id')

  // const updated: { data: object, id: string }[] = []

  // data?.forEach(ele => {
  //   ele.data.fonts.forEach((fontObj: any) => {
  //     fontObj.fontFamily = fontObj.font;
  //     delete fontObj.font
  //   })

  //   updated.push({
  //     data: ele.data, id: ele.id
  //   })

  // });

  const updated:{data:string, id: string}[] = []

//   updated.map(async (ele) => {

//     await supabase.from('profiles_brand').update({ data: ele.data }).eq('id', ele.id)
    
//     console.log('id', ele.id)

//   })

  return NextResponse.json({ data: updated }, { status: 200 });

}
