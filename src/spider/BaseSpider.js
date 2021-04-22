const Queue = require('bull')
const puppeteer = require('puppeteer')
const mkdirp = require('mkdirp')
const md5Hex = require('md5-hex')
const os = require('os')
const path = require('path')
const sizeOf = require('image-size')
const FastDownload = require('fast-download')
const winston = require("winston")
const {EventEmitter} = require('events')
const got = require('got')
const HttpsProxyAgent = require('https-proxy-agent')
const HttpProxyAgent = require('http-proxy-agent')
const SessionPool = require('../SessionPool')
const moment = require('moment')
const momentDurationFormatSetup = require("moment-duration-format")
const mongoose = require('mongoose')
const siteSchema = require('../models/crawler_site')
const failedRequestSchema = require('../models/failed_request')
const FailedRequest = mongoose.model('failed_request', failedRequestSchema)
const SiteInfo = mongoose.model('crawler_site', siteSchema)
const redis = require("redis")
const rebloom = require('redis-rebloom')
rebloom(redis)

momentDurationFormatSetup(moment)


class BaseSpider extends EventEmitter {
    constructor(options) {
        super()
        this.queueName = options.taskId
        this.assumedTotalCount = 0
        this.assumedHandledCount = 0
        this.failedCount = 0
        this.savetedCount = 0
        this.proxyUrls = []
        this.pagePool = new WeakMap()
        this.startAt = Date.now()
        this.nextCustomUrlIndex = 0
        this.lastDetailLink = null
        this.sessionPool = new SessionPool()
        this.initLogger()
        this.initBloomFilter()
        this.initQueue()
    }

    async setState() {
        const siteInfo = new SiteInfo({
            name: 'http://www.97wowo.com',
            channel: 'series'
        })
        await siteInfo.save().catch(err => console.error(err))
    }

    async updateState(pageNo, detail) {
        if (pageNo === 1 && detail) {
            await SiteInfo.findOneAndUpdate({
                name: 'http://www.97wowo.com',
                channel: 'series'
            }, {last_detail_link: detail.source_link})
        }
    }

    getState(callback) {
        //初始化爬虫上一次状态，方便断点续爬
        SiteInfo.findOne({name: 'http://www.97wowo.com', channel: 'series'}, (err, siteInfo) => {
            if(err) {
                callback()
                return
            }
            callback(siteInfo && siteInfo.last_detail_link)
            this.lastDetailLink = siteInfo && siteInfo.last_detail_link
        })
    }

    initLogger() {
        this.queueLogger = winston.createLogger({
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({
                    filename: `logs/queue/task_queue_${this.queueName}.log`
                }),
            ],
            format: winston.format.combine(
                winston.format.label({
                    label: 'queueManager'
                }),
                winston.format.colorize({
                    colors: {error: 'red'}
                }),
                winston.format.timestamp(),
                winston.format.printf((info) => {
                    return `${info.timestamp} - ${info.label}:[${info.level}]: ${info.message}`
                })
            )
        })
    }

    initBloomFilter() {
        this.client = redis.createClient()
        this.client.bf_reserve('request_handled', '0.01', '100000000', (err, result) => {
            if(err) {
                return
            }
            this.queueLogger.info('The request handled bloom filter init sucess')
        })
        this.client.bf_reserve(`failed_${this.queueName}`, '0.01', '10000000', (err, result) => {
            if(err) {
                return
            }
            this.queueLogger.info('The failed bloom filter init success')
        })
    }

    initQueue() {
        this.queue = new Queue(`task_queue_${this.queueName}`)
        this.initEvent()
        this.initProcess()

    }

    initEvent() {
        this.queue.on('error', (error) => {
            this.queueLogger.error(`An error occured ${error}`)
        })
        this.queue.on('completed', async (job, result) => {
            try {
                const {request} = job.data
                if(this.assumedTotalCount) {
                    this.assumedHandledCount++
                }
                const isLocallyConsistent = this.assumedTotalCount <= this.assumedHandledCount
                if (isLocallyConsistent) {
                    const endAt = Date.now()
                    const totalTime = endAt - this.startAt
                    this.queueLogger.info(`All the jobs has completed，save ${this.savetedCount} items. total time ${moment.duration(totalTime, 'milliseconds').format('hh小时mm分ss秒')}`)
                    if (this.browser) {
                        await this.browser.close()
                        this.browser = null
                    }
                    this.sessionPool = null
                    this.queue.close().then(() => {
                        this.queueLogger.info(`The task queue ${this.queueName} has closed`)
                        this.queue = null
                    })
                    this.emit('completed')
                }
                this.removeFailedRequest(request)
            } catch (e) {
                this.queueLogger.error(e.message)
            } finally {
            }

        })
        this.queue.on('active', (job, jobPromise) => {
            const {request = {}} = job.data
            this.queueLogger.info(`A job has started. ${request.url ? request.url : ''}`)
        })
        this.queue.on('failed', async (job, error) => {
            const {config, request, channel} = job.data
            if (this.pagePool.has(job)) {
                const page = this.pagePool.get(job)
                if (page) {
                    await page.close()
                }
                this.pagePool.delete(job)
            }
            if (job.opts.attempts === job.attemptsMade) {
                this.failedCount++
                this.saveFailedRequest(request, channel, config.method, config.client, 404)
            }
            const isLocallyConsistent = this.assumedTotalCount <= this.failedCount + this.assumedHandledCount
            this.queueLogger.error(`A job failed with reason ${error.message}. config=${JSON.stringify(config)}. url=${request.url}`)
            if (isLocallyConsistent) {
                const endAt = Date.now()
                const totalTime = endAt - this.startAt
                this.queueLogger.info(`All the jobs has completed，save ${this.savetedCount} items. total time ${moment.duration(totalTime, 'milliseconds').format('hh小时mm分ss秒')}`)
                if (this.browser) {
                    await this.browser.close()
                    this.browser = null
                }
                this.sessionPool = null
                this.queue.close().then(() => {
                    this.queueLogger.info(`The task queue ${this.queueName} has closed`)
                    this.queue = null
                })
                this.emit('completed')
            }
        })
    }

    initProcess() {
        this.queue.process('html', 10, async (job, done) => {
            let clientResult = null
            try {
                const {request, config, model} = job.data
                const {method, client, ignoreRepeat} = config
                if (client && request) {
                    if (client === 'puppeteer') {
                        clientResult = await this.puppeteerClient(request)
                    } else if (client === 'downloadClient') {
                        clientResult = await this.downloadClient(request, model)
                    } else {
                        clientResult = await this.gotClient(request)
                    }
                } else {
                    done(new Error(`请求客户端没有设置或者请求地址为空`))
                    return
                }
                if (clientResult && clientResult.page) {
                    this.pagePool.set(job, clientResult.page)
                }
                if(clientResult && clientResult.response) {
                    let statusCode
                    if(typeof clientResult.response.status === 'function') {
                        statusCode = clientResult.response.status()
                    } else {
                        statusCode = clientResult.response.statusCode
                    }
                    if(statusCode === 404) {
                        done(new Error(`the page is not found`))
                        return
                    }
                }
                if (typeof this[method] === 'function') {
                    let result = await this[method]({...clientResult, request,  data: job.data, job})
                    done(result)
                } else {
                    done()
                }
            } catch (e) {
                done(e)
            } finally {
                if (this.pagePool.has(job)) {
                    this.pagePool.delete(job)
                }
                if (clientResult && clientResult.page) {
                    await clientResult.page.close()
                }
            }
        })
    }

    getPuppeteerCookies(url) {
        const cookies = this.sessionPool.getCookiesSync(url)
        return cookies.map(toughCookie => {
            return {
                name: toughCookie.key,
                value: toughCookie.value,
                expires: new Date(toughCookie.expires).getTime(),
                domain: toughCookie.domain,
                path: toughCookie.path,
                secure: toughCookie.secure,
                httpOnly: toughCookie.httpOnly,
            }
        })
    }

    async puppeteerClient(request) {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                // headless: false
            })
            this.puppeteerSessionn = this.sessionPool.getSession()
        }
        const {url} = request
        let page = await this.browser.newPage()

        const cookieStr = this.puppeteerSessionn.getPuppeteerCookies(url)
        await page.setCookie(...cookieStr)

        let response = await page.goto(url, {waitUntil: 'domcontentloaded'})

        const loadUrl = page.url()
        const cookies = await page.cookies(loadUrl)
        this.puppeteerSessionn.setPuppeteerCookies(cookies, loadUrl)

        return {
            page,
            response
        }
    }

    async gotClient(request) {
        const session = this.sessionPool.getSession()
        const proxyUrl = this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
        console.log(`代理地址是${proxyUrl}`)

        const cookies = session.getCookieString(request.url)
        const {headers = {}} = request
        if(cookies) {
            headers.cookie = cookies
        }
        const gotOptions = {
            url: request.url,
            "headers": {
                ...headers,
                "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36",
            },
            method: request.method,
            // form: request.form,
        }
        if(request.method === 'POST') {
            gotOptions.body = request.body
        }
        if (proxyUrl) {
            const http = new HttpProxyAgent(proxyUrl);
            const https = new HttpsProxyAgent(proxyUrl);

            gotOptions.agent = { http, https }
        }
        const response = await got(gotOptions)

        session.setCookieFromResponse(response)

        console.log(`状态吗是${response.statusCode}`)
        // console.log(response.headers['set-cookie'])
        return {
            response
        }
    }

    async downloadClient(request, model) {
        if (!url) return
        return new Promise((resolve, reject) => {
            const {source_id} = model
            let saveDir = `${os.homedir()}/crawlers-download`
            let _id = md5Hex(`rich-${source_id}`)
            let md5Id = md5Hex(_id + 'rich-images')
            let [first, second, third] = [md5Id.substr(0, 1), md5Id.substr(1, 1), md5Id.substr(2, 1)]
            let imagesRelativeFilePath = `/images/${first}/${second}/${third}/${_id}.jpeg`
            let file_path = path.join(saveDir, imagesRelativeFilePath)
            mkdirp.sync(path.dirname(file_path))
            const fastDownload = new FastDownload(url, {
                destFile: file_path,
                resumeFile: true,
            }, (error, dl) => {
                if (error) {
                    reject(error)
                    return
                }
                dl.on('error', error => reject(error))
                dl.on('end', async () => {
                    const dimensions = sizeOf(file_path)
                    resolve({
                        filePath: file_path,
                        dimensions: dimensions
                    })
                })
            })
        })
    }

    async hasRepeat(request) {
        // 用redis判断是否有重复请求
        let promise = new Promise((resolve, reject) => {
            this.client.bf_add('request_handled', request.url, (err, result) => {
                if(err) {
                    reject(err)
                    return
                }
                resolve(result)
            })
        })
        let exsis = await promise
        return exsis
    }

    async add(data, opts) {
        const {config} = data
        const {ignoreRepeat} = config
        const isExsis = await this.hasRepeat(data.request)
        if(ignoreRepeat || isExsis) {
            this.assumedTotalCount++
            this.queue.add('html', data, {
                ...opts,
                attempts: 2,
                removeOnComplete: true,
                removeOnFail: true
            })
        }
    }

    _saveItem(model) {
        // 子类重写逻辑
    }

    _updateItem(model) {
        // 子类重写逻辑
    }

    update(model) {
        this._updateItem(model)
    }

    save(model) {
        // 爬虫保存数据方法
        this.savetedCount++
        this._saveItem(model)
    }

    resume() {
        this.queue.resume(true).then(() => {
            this.queueLogger.info('恢复队列')
        })
    }

    pause() {
        this.queue.parse(true, true).then(res => {
            this.queueLogger.info('暂停成功')
        })
    }

    removeFailedRequest(request) {
        if(request) {
            this.client.bf_exists(`failed_${this.queueName}`, request.url, (err, result) => {
                if(err) {
                    this.queueLogger.error(err)
                    return
                }
                if(result === 1) {
                    FailedRequest.findOneAndDelete({link: request.url}).catch(e => {
                        this.queueLogger.error(e)
                    })
                }
            })
        }
    }

    _saveFailedToDB(request, channel, parseMethod, client, status) {
        try {
            if(request) {
                const url = new URL(request.url)
                const failedRequest = new FailedRequest({
                    host: url.host,
                    channel: channel,
                    link: url.href,
                    parse_method: parseMethod,
                    status: status,
                    task_id: this.queueName,
                    client
                })
                failedRequest.save().catch(e => {
                    this.queueLogger.error(e)
                })
            }
        } catch (e) {
            this.queueLogger.error(e)
        }
    }

    _saveToBloomFilter(request, channel, parseMethod, client, status) {
        this.client.bf_add(`failed_${this.queueName}`, request.url, (err, result) => {
            if(err) {
                this.queueLogger.error(err)
                return
            }
            if(result === 1) {
                this._saveFailedToDB(request, channel, parseMethod, client, status)
            } else {
                this.queueLogger.info(`this ${request.url} has exsis`)
            }
        })
    }

    saveFailedRequest(request, channel, parseMethod, client, status) {
        // 保存本脆任务失败的请求，方便任务重新执行
        this._saveToBloomFilter(request, channel, parseMethod, client, status)
    }

    getRunningState() {
        // 获取爬虫运行状态
        return {
            handleCount: this.assumedHandledCount,
            failedCount: this.failedCount,
            saveCount: this.savetedCount
        }
    }
}

module.exports = BaseSpider
