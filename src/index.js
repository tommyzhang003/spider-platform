const mongoose = require('mongoose')
const spiders = require('./spider')

class Scraper {
    constructor() {
        this.connectDB()
        this.tasks = {}
    }

    connectDB() {
        mongoose.connect('mongodb://localhost/resources', {useFindAndModify: false, useNewUrlParser: true});
        const db = mongoose.connection;
        db.on('error', console.error.bind(console, 'connection error:'));
        db.once('open', function () {
            console.log('连接成功')
        })
    }

    genTaskId() {
        return Date.now()
    }

    getRuningState(taskId) {
        const spider = this.tasks[taskId]
        if(spider) {
            spider.getRunningState()
        }
    }

    resumeTask(taskId) {
        const task = this.tasks[taskId]
        if(task) {
            task.resume()
        }
    }

    pauseTask(taskId) {
        const task = this.tasks[taskId]
        if(task) {
            task.pause()
        }
    }

    runTask({spiderName, command, timer, client, taskId}) {
        const Spider = spiders[spiderName]
        if(Spider && Spider.constructor) {
            let _taskId = taskId || this.genTaskId()
            if(command === 'retry') {
                _taskId = taskId || this.genTaskId()
            } else {
                _taskId = this.genTaskId()
            }
            const spider = new Spider({
                taskId: _taskId,
                command,
                timer,
                client
            })
            this.tasks = {
                [taskId]: spider
            }
            if(command === 'retry') {
                spider.runFromFailed(taskId)
            } else {
                spider.run()
            }
        }
    }

}

const scraper = new Scraper()
scraper.runTask({
    spiderName: 'wowo2',
    command: 'run', // 增量爬取/全量爬取/重试
    timer: '', //定时任务
    client: '', // 请求客户端
    taskId: '1608111750890'
})

