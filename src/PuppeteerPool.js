const puppeteer = require('puppeteer')

class PuppeteerInstance {
    constructor(props) {
        this.id = props.id
        this.totalPages = 0
        this.lastPageOpenedAt = Date.now()
        this.sessionPool = props.sessionPool
    }

    launch() {
        this.browserPromise = new Promise(async (resolve, reject) => {
            try {
                this.session = this.sessionPool.getSession()
                const browser = await puppeteer.launch()
                resolve(browser)
            } catch (e) {
                reject(e)
            }
        })
    }

}

class PuppeteerPool {
    constructor(props) {
        this.idlePages = []
        this.activePages = 0
        this.browserCounter = 0
        this.activeInstances = {}
        this.retireInstances = {}
        this.sessionPool = props.sessionPool
        this.pagesToInstancesMap = new WeakMap()
        this.instanceKillerInterval = setInterval(this.killRetiredInstances, 60 * 1000)
    }

    async newPage() {
        // let idlePage
        // while (idlePage = this.idlePages.shift()) {
        //
        // }
        return this.openNewTab()
    }

    async recyclePage(page) {
        await page.close()
    }

    killRetiredInstances() {
        Object.keys(this.retireInstances).forEach(id => {
            const instance = this.retireInstances[id]
            if(Date.now() - instance.lastPageOpenedAt > 300 * 1000) {
                this.killInstance(instance)
            }
        })
    }

    async killInstance(instance) {
        const {id, browserPromise} = instance
        delete this.retireInstances[id]
        try {
            const browser = await browserPromise
            await browser.close()
        } catch (e) {

        }
    }

    async openNewTab() {
        let instance = Object.values(this.activeInstances).find(inst => inst.activePages < 50)
        if (!instance) instance = await this.launchInstance()
        this.incrementPageCount(instance)
        instance.activePages++
        try {
            const browser = await instance.browserPromise
            const context = browser.defaultBrowserContext()
            const page = await context.newPage()
            this.pagesToInstancesMap.set(page, instance)
            return page
        } catch (e) {
            this.retireInstance(instance)
        }
    }

    incrementPageCount(instance) {
        instance.lastPageOpenedAt = Date.now()
        instance.totalPages++
        if (instance.totalPages >= 100) {
            this.retireInstance()
        }
    }

    retireInstance(instance) {
        const {id} = instance
        if (this.activeInstances[id]) {
            this.retireInstances[id] = instance
            delete this.activeInstances[id]
        }
    }

    launchInstance() {
        const id = this.browserCounter++
        const instance = new PuppeteerInstance({
            id,
            sessionPool: this.sessionPool
        })
        this.activeInstances[id] = instance
        this.initBrowser(instance)
        return instance
    }

    initBrowser(instance) {
        instance.launch()
    }

}

module.exports = PuppeteerPool
