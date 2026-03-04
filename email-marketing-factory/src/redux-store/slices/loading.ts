// Third-party Imports
import { createSlice } from '@reduxjs/toolkit'


export type loadingState = {

    visible: boolean
    content: string
    commonVisible: boolean
}

// Constants
const initialState: loadingState = {
    visible: false,
    commonVisible: false,
    content: 'processing'
}

export const loadingSlice = createSlice({
    name: 'loading',
    initialState,
    reducers: {

        loadingPrecess: (state, action) => {
            const { visible, content, commonVisible } = action.payload

            state.content = content
            state.visible = visible
            state.commonVisible = commonVisible
        }
    }
})

export const {

    loadingPrecess

} = loadingSlice.actions

export default loadingSlice.reducer
