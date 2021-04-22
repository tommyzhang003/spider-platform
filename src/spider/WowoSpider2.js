const mongoose = require('mongoose')
const resourcesSchema = require('../models/crawler_resources')
const BaseSpider = require('./BaseSpider')
const _ = require('lodash')
const Resources = mongoose.model('resources', resourcesSchema)
const failedRequestSchema = require('../models/failed_request')
const FailedRequest = mongoose.model('failed_request', failedRequestSchema)
const NON_ADULT = 'non-adult'
const ADULT = 'adult'

class WowoSpider extends BaseSpider {

    constructor(options) {
        super(options)
        this.name = 'wowo'
        this.deltaFetch = true
    }

    async _saveItem(detail) {
        const query = await Resources.findOneAndUpdate({
            year: detail.year,
            resource_category: detail.resource_category,
            classification: detail.classification,
            $or: [{title: detail.title}, {alias: new RegExp(detail.title)}]
        }, detail, {upsert: true})
    }

    async _updateItem(detail) {
        const query = await Resources.updateOne({
            source_link: detail.source_link
        }, detail, {upsert: true})
    }

    async getList({page, response, request, data, job}) {
        const {context, pageNo, channel, config, category} = data
        try {
            let result = await page.$$eval('.list ul li', (els, lastDetailLink, classification, category) => {
                const details = []
                let goNextPage = true
                for (let i = 0; i < els.length; i++) {
                    let el = els[i]
                    let detailLink = el.querySelector('.li_img a').getAttribute('href')
                    let sourceId = detailLink
                    let coverFull = el.querySelector('img').getAttribute('src')
                    let title = el.querySelector('.li_text .name a').textContent
                    if (`http://www.97wowo.com${detailLink}` === lastDetailLink) {
                        goNextPage = false
                        break
                    }
                    details.push({
                        title,
                        classification,
                        resource_category: category,
                        source_link: `http://www.97wowo.com${detailLink}`,
                        url: `http://www.97wowo.com${detailLink}`,
                        source_id: sourceId,
                        cover_full_url: coverFull,
                    })
                }
                return {
                    goNextPage,
                    details
                }
            }, context.lastDetailLink, channel, category)

            // result.details = result.details.slice(0, 2)

            await this.updateState(pageNo, result.details[0])


            if(result.goNextPage && context.lastDetailLink) {
                this.pushNextPage(pageNo+1, channel, context)
            }

            result.details.forEach(detail => {
                this.save(detail)
                this.add({
                    request: {
                        url: detail.url
                    },
                    config: {
                        client: 'puppeteer',
                        method: 'getDetail',
                    },
                    pageNo,
                    channel,
                    category,
                    context
                })
            })
        } catch (e) {
            this.saveFailedRequest(request, channel, config.method, config.client, 0)
        }
    }

    async getDetail({page, response, request, data}) {
        try {
            let detail = await page.evaluate((classification, sourceLink) => {
                // let inputEl = document.getElementById('lin1k0')
                let ulEl = document.getElementById('ul1')
                let series = ulEl ? ulEl.querySelectorAll('.dinput') : []
                let imgEl = document.querySelector('.detail_img>img')
                let titleEl = document.querySelector('.detail_name .name')
                let playListEl = document.querySelectorAll('#stab_11 ul li a')
                let navEl = document.querySelectorAll('.stit a')
                let genre = navEl.length === 3 && navEl[2] ? navEl[2].textContent : null
                let detail = {
                    series: [],
                    genre: genre,
                    source_link: sourceLink,
                    // video_download_url: inputEl ? inputEl.value : '',
                    cover_thumbnails_url: imgEl ? imgEl.getAttribute('src') : '',
                    title: titleEl ? titleEl.textContent : ''
                }
                series = Array.from(series).map((el, index) => {
                    let spanEl = el.querySelector('span')
                    let episode = spanEl && spanEl.textContent ? spanEl.textContent : index + ''
                    let url = el.querySelector('input[type=text]').value
                    return {
                        video_download_url: url,
                        episode_name: episode
                    }
                })
                detail.is_series = series.length > 1 ? true : false
                if (series.length > 1) {
                    detail.is_series = true
                    detail.series = series
                } else {
                    detail.video_download_url = series[0] && series[0].video_download_url
                }
                document.querySelectorAll('.dlall dl').forEach((el, index) => {
                    let strs = el.textContent.replace(/\s+/g, '').split('：')
                    let value = strs.length > 1 ? strs[1] : null
                    switch (index) {
                        case 1:
                            detail.series_is_ended = classification === 'series' && value && value.indexOf('全') > -1
                            break
                        case 4:
                            detail.year = value
                            break
                        case 5:
                            detail.releaseDate = value
                            break
                        case 3:
                            detail.director = value
                            break
                        case 0:
                            detail.starring = value
                            break
                        default:
                    }
                })
                return detail
            }, data.channel, page.url())
            this.update(detail)
        } catch (e) {
            // this.saveFailedRequest(request)
        }
    }

    pushNextPage(pageNo, channel, category, context) {
        this.add({
            request: {
                url: `http://www.97wowo.com/mov/index${pageNo === 1 ? '' : pageNo}.html`,
            },
            config: {
                ignoreRepeat: true,
                client: 'puppeteer',
                method: 'getList',
            },
            category,
            pageNo,
            channel,
            context
        })
    }

    runFromLast(lastDetailLink) {
        // 重上一次爬取位置执行（增量爬取）
        this.pushNextPage(1, 'series', NON_ADULT, {
            lastDetailLink: lastDetailLink,
        })
    }

    runFromCurrent() {
        // 从当前位置爬取（全量爬取）
        let start = 1
        let end = 2
        for(start; start <= end; start++) {
            this.pushNextPage(start, 'series', NON_ADULT, {})
        }
    }

    runFromFailed(taskId) {
        // 从失败的请求中执行（失败重试）
        FailedRequest.find({task_id: this.queueName}).cursor().on('data', data => {
            // 如果数据库查询出来的为空，则应该关闭队列
            const doc = data.toObject()
            this.add({
                request: {
                    url: doc.link,
                },
                config: {
                    client: doc.client,
                    method: doc.parse_method,
                },
                category: NON_ADULT,
                channel: doc.channel,
                context: {}
            })
        }).on('close', () => {
            this.queueLogger.info('失败请求已全部重新执行')
        }).on('end', () => {
            this.queueLogger.info('关闭')
        })
    }

    run() {
        this.getState(async (lastDetailLink) => {
            if(this.deltaFetch && lastDetailLink) {
                this.runFromLast(lastDetailLink)
            } else {
                await this.setState()
                this.runFromCurrent()
            }
        })
    }
}

module.exports = WowoSpider
