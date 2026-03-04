 const rearrangeOjbect =  (arr: { url: string, id: string, title: string }[]) => {

     const oddArray = []
     const evenArray = []

     for (let i = 0; i < arr.length; i++) { 
         if (i % 2) 
            oddArray.push(arr[i])
        else 
            evenArray.push(arr[i])
    }

     return oddArray.concat(evenArray)
}

export {rearrangeOjbect }