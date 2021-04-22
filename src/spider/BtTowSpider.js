const Result = require('../Result')
const mongoose = require('mongoose')
const resourcesSchema = require('../models/crawler_resources')
const _ = require('lodash')
const Resources = mongoose.model('resources', resourcesSchema)

class BtTowParser {
    async getList({page, data}) {
        let result = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.bt_img ul li')).map(el => {
                let detailLink = el.querySelector('h3 a').getAttribute('href')
                let sourceId = detailLink.match(/\d+/)[0]
                let coverFull = el.querySelector('img').getAttribute('data-original')
                return {
                    url: detailLink,
                    type: 'detail',
                    sourceId,
                    coverFull,
                }
            })
        })
        result = result.slice(0, 2)
        return new Result({next: 'getDetail', data: result})
    }
    async getDetail({page, data}) {
        let detail = await page.evaluate((coverFull, sourceId) => {
            let imgEl = document.querySelector('.mi_cont .dyimg>img')
            let titleEl = document.querySelector('.moviedteail_tt h1')
            let detail = {
                cover_full_url: coverFull,
                source_id: sourceId,
                cover_thumbnails_url: imgEl.getAttribute('src'),
                title: titleEl.textContent
            }
            document.querySelectorAll('.moviedteail_list li').forEach((el, index) => {
                let strs = el.textContent.split('：')
                let value = strs.length > 1 ? strs[1] : null
                switch (index) {
                    case 0:
                        detail.genre = value
                        break
                    case 1:
                        detail.country = value
                        break
                    case 2:
                        detail.year = value
                        break
                    case 3:
                        detail.alias = value
                        break
                    case 4:
                        detail.releaseDate = value
                        break
                    case 5:
                        detail.director = value
                        break
                    case 6:
                        detail.writer = value
                        break
                    case 7:
                        detail.starring = value
                        break
                    case 8:
                        detail.imdbLink = value
                        break
                    case 9:
                        detail.rating = value
                        break
                    default:
                }
            })
            let descEl = document.querySelector('.yp_context')
            detail.storyLine = descEl.textContent
            return detail
        }, data.coverFull, data.sourceId)

        const resources = new Resources(detail)
        await resources.save().catch(err => console.log(err))
        return new Result({data: detail})
    }

    async run(taskType) {
        if(taskType === 'download') {
            // const result = await this.runDownload()
            // return result
        } else {
            let pages = _.range(1, 2)
            let data = pages.map(page => {
                let listUrl = `https://www.bttwo.com/new-movie/page/${page}`
                return {
                    url: listUrl,
                    context: {
                        classification: 'movie'
                    }
                }
            })
            return new Result({next: 'getList', data: data})
        }
    }
}

module.exports = BtTowParser
