const mongoose = require('mongoose')

module.exports = new mongoose.Schema({
    id: String,
    host: String, // 网站名称
    channel: String, // 网站频道
    page_no: Number, // 页码
    page_link: String, // 分页链接
    detail_untreated: Number, // 当前页面详情总数
    detail_treated: Number, // 当前页面详情已处理总数
    page_response_status: Number, // 分页请求状态
    detail_link: String, // 详情页面链接
    detail_response_status: Number, // 详情页面请求状态
})
