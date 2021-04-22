const Session = require('./Session')

class SessionPool {
    constructor(props) {
        this.sessions = []
        this.maxPoolSize = 2
    }

    createSession() {
        const session = new Session()
        this.sessions.push(session)
        return session
    }

    pickSession() {
        const index = Math.floor(Math.random() * this.sessions.length)
        return this.sessions[index]
    }

    getSession() {
        if(this.sessions.length < this.maxPoolSize) {
            return this.createSession()
        }
        const session = this.pickSession()
        return session
    }
}

module.exports = SessionPool
