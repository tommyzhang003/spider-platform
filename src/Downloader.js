const got = require('got')
const fs = require('fs')
const path = require('path')
const FileType = require('file-type')
const _ = require('lodash')
const EventEmitter = require('events').EventEmitter
const {Readable, Duplex} = require('stream')
const async = require('async')
const FastDownloader = require('fast-download')
const sanitize = require('sanitize-filename')
const mime = require('mime-types')

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
        this.request = got({
            url: dl.url,
            method: 'GET',
            headers: this.headers
        }).on('response', response => {
            response.on('error', (errr) => {
                console.log(errr)
            })
            response.on('end', () => {
                this.emit('end')
            })
            response.on('data', (data) => {
                this.position += data.length
                if(this.buffers) {
                    // console.log(3333)
                    this.buffers.push(data)
                } else {
                    dl.buffers.push(data)
                    dl.read(0)
                }
                if(this.position === this.size) {
                    // console.log(this.size)
                    // this.emit('end')
                }
            })
        })
    }

    abort() {
        this.request.cancel()
    }

    startPiping() {
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
        this.request = null
        this.chunkSize = null
        this.buffers = []
        this.options = {
            ...props,
            start: 0
        }
    }

    _read(size) {
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

    getFileNameFromContentDisposition() {
        const contentDisposition = this.headers['content-disposition']
        if(!contentDisposition || !contentDisposition.includes('filename=')){
            return ''
        }
        let filename = "";
        let filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        let matches = filenameRegex.exec(contentDisposition);
        if (matches && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
        }

        return filename ? sanitize(filename) : "";
    }

    removeQueryString(url) {
        return url.split(/[?#]/)[0]
    }

    deduceFileNameFromUrl() {
        const cleanUrl = this.removeQueryString(this.url)
        const baseName = sanitize(path.basename(cleanUrl))
        return baseName
    }

    removeExtension(str) {
        const arr = str.split('.')
        if (arr.length == 1) {
            return str;
        }
        return arr.slice(0, -1).join('.')
    }

    getFileNameFromContentType() {
        let extension = mime.extension(this.headers['content-type'])
        let url = this.removeQueryString(this.url)
        const fileNameWithoutExtension = this.removeExtension(path.basename(url))
        return `${sanitize(fileNameWithoutExtension)}.${extension}`
    }

    deduceFileName() {
        const fileNameFromContentDisposition = this.getFileNameFromContentDisposition()
        if(fileNameFromContentDisposition) return fileNameFromContentDisposition
        if(path.extname(this.url)) {
            const fileNameFromUrl = this.deduceFileNameFromUrl()
            if(fileNameFromUrl) return fileNameFromUrl
        }
        const fileNameFromContentType = this.getFileNameFromContentType()
        if(fileNameFromContentType) return fileNameFromContentType
        return sanitize(url)
    }

    getFileName() {
        if(this.options.fileName) {
            this.fileName =  this.options.fileName
        } else {
            this.fileName = this.deduceFileName()
        }
        return this.fileName
    }

    openFile(append) {
        // const fileName = this.getFileName()
        this.fileStream = fs.createWriteStream(path.join(__dirname, this.fileName), {
            flags: append ? 'a' : 'w'
        })
        this.fileStream.on('error', () => {
            this.abort()
        })
        this.fileStream.on('finish', () => {
            this.emit('done')
        })
        this.fileStream.on('open', () => {
            this.pipe(this.fileStream)
            this.size = this.fileSize - this.options.start
            this.chunkSize = Math.ceil(this.size / 5)
            const acceptRanges = this.headers['accept-ranges'] === 'bytes'
            if(acceptRanges) {
                this.chunkDownload()
            } else {
                this.normalDownload()
            }
        })
    }

    normalDownload() {
        this.request = got({
            url: this.url,
            method: 'GET',
        }).on('response',async response => {
            // const result = await FileType.fromStream(response)
            // console.log(result)
            response.on('data', data => {
                this.buffers.push(data)
                this.read(0)
            })
            response.on('end', () => {
                this.buffers.push(null)
                this.read(0)
            })
        })
    }

    chunkDownload() {
        const chunkNumbers = _.range(Math.ceil(this.size / this.chunkSize))
        const tasks = chunkNumbers.map(chunkNumber => {
            return new Promise(resolve => {
                const chunk = new Chunk({dl: this, number: chunkNumber})
                this.chunks.push(chunk)
                chunk.on('end', () => {
                    if(!chunk.buffers) {
                        this.chunks.shift()
                        let completeChunk
                        while(this.chunks[0] && this.chunks[0].position === this.chunks[0].size) {
                            completeChunk = this.chunks.shift()
                            this.buffers = this.buffers.concat(completeChunk.buffers)
                        }
                        if(this.chunks[0]) {
                            this.chunks[0].startPiping()
                        }
                    }

                    resolve(chunkNumber)
                })
                if(chunkNumber === 0) {
                    chunk.startPiping()
                }
            })
        })
        Promise.all(tasks).then(values => {
            this.buffers.push(null)
            this.read(0)
        }).catch(err => {
            this.abort()
        })
    }

    abort() {
        if(this.request) {
            this.request.cancel()
        }
        this.chunks.forEach(chunk => {
            chunk.abort()
        })
        if(this.fileStream) {
            this.unpipe(this.fileStream)
            this.fileStream.end()
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
                this.getFileName()
                fs.stat(path.join(__dirname, this.fileName), (error, stat) => {
                    if(error) {
                        this.openFile(false)
                        return
                    }
                    this.options.start = stat.size
                    this.openFile(true)
                })
            }
        } catch (e) {
            console.log(e)
        }

    }
}

const downloader = new Downloader({
    fileName: '1.mp4',
    url: 'https://media.w3.org/2010/05/sintel/trailer_hd.mp4'
    // url: 'https://sf1-dycdn-tos.pstatp.com/obj/ies-music/storm_cover_54000f759a35db02122f28b1747f5a50'
})

// new FastDownloader('https://media.w3.org/2010/05/sintel/trailer_hd.mp4', {
//     destFile: path.join(__dirname, '1.mp4')
// })

// downloader.start('http://vipxz.bocai-zuida.com/2012/信条.BD1280高清中英双字版.mp4')
downloader.start()

