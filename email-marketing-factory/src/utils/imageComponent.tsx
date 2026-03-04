import { useState } from 'react'

import Image from 'next/image'

type CustomImage = {
    src: string, alt: string, height: any, width: any, layout?: string, className?: string, style?: React.CSSProperties
}

const ImageComponent: React.FC<CustomImage> = ({ src, alt, height, width, className, style }) => {

    const [isLoading, setIsLoading] = useState(true)

    return <>{src ? <Image
        alt={alt}
        loading="lazy"
        width={width}
        className={`${isLoading ? 'filter to-blue-300' : ''} ${className ? className : ''}`}
        src={
            isLoading
                ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
                : `${src.startsWith('https') ? src : 'https://'.concat(src)}`
        }
        height={height}
        onLoad={() => setIsLoading(false)}
        style={{ width: '100%', height: 'auto', ...style }}
    /> : <></>}</>
}


export default ImageComponent