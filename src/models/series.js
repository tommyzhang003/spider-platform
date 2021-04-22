const mongoose = require('mongoose')

module.exports= new mongoose.Schema({
    episode_name: String,
    video_play_url: String,
    video_download_url: String,
    download_finished: {
        type: Boolean,
        default: false
    }
})
