import type { SVGAttributes } from 'react'

const BgGradient = (props: SVGAttributes<SVGElement>) => {
  return (
    <svg width='769' height='1136' viewBox='0 0 769 1136' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <g filter='url(#filter0_f_2_1083)'>
        <ellipse
          cx='-7.42672'
          cy='567.983'
          rx='477.858'
          ry='263.729'
          transform='rotate(173.519 -7.42672 567.983)'
          fill='#C5CEFF'
          fillOpacity='0.6'
        />
      </g>
      <defs>
        <filter
          id='filter0_f_2_1083'
          x='-783.179'
          y='0.392212'
          width='1551.51'
          height='1135.18'
          filterUnits='userSpaceOnUse'
          color-interpolation-filters='sRGB'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend mode='normal' in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur stdDeviation='150' result='effect1_foregroundBlur_2_1083' />
        </filter>
      </defs>
    </svg>
  )
}

export default BgGradient
