const mongoose = require('mongoose')

module.exports = new mongoose.Schema({
    id: String,
    host: String,
    channel: String,
    link: String,
    client: String,
    parse_method: String,
    status: Number,
    task_id: Number
})
