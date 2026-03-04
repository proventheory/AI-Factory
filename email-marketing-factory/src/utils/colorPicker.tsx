'use client'

import React, { useRef, useState } from 'react'

import { HexColorInput, HexColorPicker } from "react-colorful";

import { ClickAwayListener, Fade, Input, Popper } from '@mui/material'

import Paper from '@mui/material/Paper'


type CustomColorPicker = {
  color: string;
  onChangeColor: (newColor: string) => void;
};

const CusotmColorPicker: React.FC<CustomColorPicker> = ({ color, onChangeColor }) => {

  const anchorRef = useRef<HTMLDivElement | null>(null)

  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const [isValid, setIsValid] = useState<boolean>(true);

  const validateHexColor = (color: string) => {

    const hexRegex = /^#([0-9a-fA-F]{6})$/;

    return hexRegex.test(color);
  };


  const handleMenuClose = (event: MouseEvent | TouchEvent): void => {
    if (anchorRef.current && anchorRef.current.contains(event.target as HTMLElement)) {
      return
    }

    setIsMenuOpen(false)
  }

  return (<div>
    <div
      ref={anchorRef}
      onClick={() => setIsMenuOpen(prev => !prev)}
      className='flex flex-row gap-1'
    >
      <div className='h-[30px] w-[30px] rounded border border-black ' style={{ backgroundColor: color }} />
      <Input
        className={`text-[15px] text-black`}
        onChange={e => {
          console.log('isValid', isValid)
          if (validateHexColor(e.target.value)) setIsValid(true)
          else setIsValid(false)
        }
        }
        value={color}
        placeholder='Type a color'
      />
    </div>
    <Popper
      placement='bottom-start'
      anchorEl={anchorRef.current}
      transition
      open={isMenuOpen}
      disablePortal
      className='z-[4]'
    >
      {({ TransitionProps }) => (
        <Fade {...TransitionProps} style={{ transformOrigin: 'right top' }}>
          <Paper elevation={6} className='p-4' style={{ marginBlockStart: '1px'}}>
            <ClickAwayListener onClickAway={handleMenuClose}>
              <div className='flex flex-col gap-1'>
                <HexColorPicker
                  color={color}
                  onChange={newColor => onChangeColor(newColor)}
                />
                <HexColorInput
                  color={color}
                  onChange={newColor => onChangeColor(newColor)}
                  prefixed
                  className='w-full mt-4 rounded py-2 px-2.5 border text-sm'
                  style={{ borderColor: 'var(--mui-palette-divider)', borderRadius: 'var(--mui-shape-borderRadius)' }}
                />
              </div>
            </ClickAwayListener>
          </Paper>
        </Fade>
      )}
    </Popper>
  </div>)
}

export default CusotmColorPicker