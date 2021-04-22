const got = require('got')
const fs = require('fs')
const path = require('path')
const FileType = require('file-type')
const _ = require('lodash')
const EventEmitter = require('events').EventEmitter
const {Readable, Duplex, pipeline} = require('stream')
const async = require('async')
const FastDownloader = require('fast-download')

class Chunk extends EventEmitter{
    constructor({dl, number}) {
        super()
        this.dl = dl
        this.buffers = []
        this.offset = dl.options.start + number * dl.chunkSize
        this.size = Math.min(dl.chunkSize, dl.size - number * dl.chunkSize)
        this.position = 0
        this.headers = {
            range: `bytes=${this.offset}-${this.offset + this.size - 1}`
        }
        // console.log(this.offset)

        // this.writeStream.on('finish', () => {
        //     console.log('快下载完成')
        // })
        // pipeline(got.stream(dl.url, {
        //     method: 'GET',
        //     headers: this.headers
        // }), fs.createWriteStream(path.join(__dirname, '1.mp4'), {
        //     flags: 'a',
        //     start: this.offset
        // }), (err) => {
        //     if(err) {
        //         console.log(err)
        //         return
        //     }
        //     console.log(111)
        //     this.emit('end')
        // })


        const stream = got.stream(dl.url, {
            method: 'GET',
            headers: this.headers
        })

        console.log(stream instanceof Readable)

        stream.on('data', data => {
            console.log(data.length)
        })

        // got({
        //     url: dl.url,
        //     isStream: true,
        //     method: 'GET',
        //     headers: this.headers
        // }).on('data', data => {
        //     console.log(data)
        //     // console.log(res instanceof Readable)
        //     // res.pipe(this.writeStream)
        //     // res.on('end', () => {
        //     //     this.emit('end')
        //     // })
        // })
    }

    startPiping() {
        // console.log(this.buffers)
        this.dl.buffers = this.dl.buffers.concat(this.buffers)
        this.buffers = null
        this.dl.read(0)
    }
}


class Downloader extends Readable {
    constructor(props) {
        super(props)
        this.headers = null
        this.fileSize = null
        // this.start = 0
        this.fileStream = null
        this.size = null
        this.chunks = []
        this.url = props.url
        this.chunkSize = null
        this.buffers = []
        this.options = {
            start: 0
        }
    }

    _read() {
        // console.log(this.buffers)
        if(this.buffers.length === 0) {
            this.push(Buffer.alloc(0))
            return
        }
        const loop = () => {
            let buffer = this.buffers.shift()
            if(buffer === undefined) return
            if(buffer === null) {
                this.push(null)
                return
            }
            if(this.push(buffer)) {
                loop()
            }
        }
        loop()
    }

    openFile() {
        console.log(this.fileSize)
        this.size = this.fileSize - this.options.start
        this.chunkSize = Math.ceil(this.size / 3)
        const acceptRanges = this.headers['accept-ranges'] === 'bytes'
        if(acceptRanges) {
            const chunkNumbers = _.range(Math.ceil(this.size / this.chunkSize))
            const tasks = chunkNumbers.map(chunkNumber => {
                return new Promise(resolve => {
                    const chunk = new Chunk({dl: this, number: chunkNumber})
                    chunk.on('end', () => {
                        resolve(chunkNumber)
                    })
                })
            })
            // console.log(tasks.length)
            Promise.all(tasks).then(values => {
                console.log(values)
            })
        }
    }

     async start() {
        try {
            const response = await got({
                method: "HEAD",
                url: this.url
            })
            if(response.statusCode === 200) {
                this.headers = response.headers
                this.fileSize = this.headers['content-length']
                fs.stat(path.join(__dirname, 'index910.js'), (error, stat) => {
                    if(error) {
                        this.openFile()
                        return
                    }
                    console.log(stat)
                    this.openFile()
                })
            }
        } catch (e) {
            console.log(e)
        }

    }
}

const downloader = new Downloader({
    url: 'https://media.w3.org/2010/05/sintel/trailer_hd.mp4'
})

// new FastDownloader('https://media.w3.org/2010/05/sintel/trailer_hd.mp4', {
//     destFile: path.join(__dirname, '1.mp4')
// })

// downloader.start('http://vipxz.bocai-zuida.com/2012/信条.BD1280高清中英双字版.mp4')
downloader.start()

