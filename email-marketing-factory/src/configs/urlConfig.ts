const urlConfig = () => { 

    if (process.env.PUBLIC_DOMAIN) return process.env.PUBLIC_DOMAIN
    else return "https://focuz.ai"
}

export default urlConfig
