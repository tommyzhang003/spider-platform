const mongoose = require('mongoose')

module.exports = new mongoose.Schema({
    id: String,
    name: String,
    channel: String,
    last_detail_link: String
})
