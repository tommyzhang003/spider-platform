const {Cookie, CookieJar} = require('tough-cookie')
const crypto = require('crypto')

class Session {
    constructor(props) {
        this.cookieJar = new CookieJar()
        this.usageCount = 0
        this.maxUsageCount = 50
        this.id = `session_${this.cryptoRandomObjectId(10)}`
    }

    cryptoRandomObjectId(length) {
        length = length || 17

        const chars = 'abcdefghijklmnopqrstuvwxyzABCEDFGHIJKLMNOPQRSTUVWXYZ0123456789'
        const bytes = crypto.randomBytes(length);
        let str = ''
        for (let i = bytes.length - 1; i >= 0; i--) { str += chars[(bytes[i] | 0) % chars.length] }
        return str
    }

    markGood() {
        this.usageCount += 1
    }

    setCookieFromResponse(response) {
        const headers = response.headers
        const cookieHeader = headers['set-cookie'] || ''
        try {
            const cookies = Array.isArray(cookieHeader) ? cookieHeader.map(cookie => Cookie.parse(cookie)) : [Cookie.parse(cookieHeader)]
            const errorMessages = []
            cookies.forEach(cookie => {
                try {
                    this.cookieJar.setCookieSync(cookie, response.url, {ignoreError: false})
                } catch (e) {
                    errorMessages.push(e.message)
                }
            })
            if(errorMessages.length) {
                console.error(`Could not set cookies.`)
            }
        } catch (e) {
            throw new Error(cookieHeader)
        }
    }

    getCookieString(url) {
        const cookieString = this.cookieJar.getCookieStringSync(url, {})
        return cookieString
    }

    setPuppeteerCookies(cookies, url) {
        const normalizedCookies = cookies.map(puppeteerCookie => {
            const isExpiresValid = puppeteerCookie.expires && typeof puppeteerCookie.expires === 'number'
            const expires = isExpiresValid ? new Date(puppeteerCookie.expires * 1000) : new Date(Date.now() + (3000 * 1000))
            const domain = typeof puppeteerCookie.domain === 'string' && puppeteerCookie.domain.startsWith('.')
                ? puppeteerCookie.domain.slice(1)
                : puppeteerCookie.domain
            return new Cookie({
                key: puppeteerCookie.name,
                value: puppeteerCookie.value,
                expires,
                domain,
                path: puppeteerCookie.path,
                secure: puppeteerCookie.secure,
                httpOnly: puppeteerCookie.httpOnly,
            })
        })
        const errorMessages = []
        normalizedCookies.forEach(cookie => {
            try {
                this.cookieJar.setCookieSync(cookie, url, { ignoreError: false });
            } catch (e) {
                errorMessages.push(e.message);
            }
        })
        if(errorMessages.length) {
            console.error(`Could not set cookies.`)
        }
    }

    getPuppeteerCookies(url) {
        const cookies = this.cookieJar.getCookiesSync(url)
        return cookies.map(cookie => {
            return {
                name: cookie.key,
                value: cookie.value,
                expires: new Date(cookie.expires).getTime(),
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
            }
        })
    }
}

module.exports = Session
