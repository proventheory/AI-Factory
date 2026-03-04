
// Third-party Imports
import { toast } from 'react-toastify'

export const success = (message: string) => {
    return (
        toast.success(`${message}`, {
            hideProgressBar: false,
            style: {
                padding: '16px',
                color: 'var(--mui-palette-primary-main)',
                border: '1px solid var(--mui-palette-primary-main)',
                backgroundColor: 'var(--mui-palette-background-paper)'
            },
            className: 'custom-toast',
            theme: 'colored',
            closeButton: false,
            progressStyle: {
                backgroundColor: 'var(--mui-palette-primary-main)'
            }
        })
    )

}
