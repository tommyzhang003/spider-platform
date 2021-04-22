const SeriesSchema = require('./series')
const mongoose = require('mongoose')

module.exports = new mongoose.Schema({
    id: String,
    source_link: String,
    source_from: String,
    source_id: String,
    classification: String,// 区分电影、电视剧、综艺、动漫
    resource_category: String, //区分成人还是非成人内容
    genre: String, //区分科幻、大陆剧，日韩剧、动作，经典三级
    title: String,
    alias: String,
    country: String,
    year: String,
    releaseDate: String,
    director: String,
    writer: String,
    starring: String,
    imdbLink: String,
    rating: String,
    storyLine: String,
    cover_full: Object,
    cover_thumbnails: Object,
    cover_full_url: String,
    video_play_url: String,
    video_download_url: String,
    cover_thumbnails_url: String,
    tabs: [String],
    keywords: [String],
    duration: Number,
    series: [SeriesSchema],
    is_series: {
        type: Boolean,
        default: false
    },
    cover_full_finished: {
        type: Boolean,
        default: false
    },
    cover_thumbnails_finished: {
        type: Boolean,
        default: false
    },
    playSource_finished: {
        type: Boolean,
        default: false,
    },
    series_is_ended: {
        type: Boolean,
        default: false
    },
    series_finished: {
        type: Boolean,
        default: false
    },
    finished: {
        type: Boolean,
        default: false
    },
    timer: {
        type: String,
        default: '0 0 1 ? * 4 *'
    },
})
