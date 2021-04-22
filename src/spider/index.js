const WowoSpider = require('./WowoSpider')
const BtTowSpider = require('./BtTowSpider')
const ExpressSpider = require('./ExpressSpider')
const WowoSpider2 = require('./WowoSpider2')

module.exports = {
    'bt2': BtTowSpider,
    'wowo': WowoSpider,
    'wowo2': WowoSpider2,
    'express': ExpressSpider
}
