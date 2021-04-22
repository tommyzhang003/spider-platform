const Result = require('../Result')

class ExpressSpider {

    constructor(options) {
        this.name = 'express'
    }

    async getDetail({page, response}) {
        // const title = await page.title
        // console.log(response.body)
        if(response.body === '<html><body>You are being <a href="https://www.expressvpn.com/verify">redirected</a>.</body></html>') {
            return new Result({
                next: 'getDetail',
                needToRequest: true,
                data: {
                    request: {
                        headers: {
                            "content-type": "application/x-www-form-urlencoded",
                        },
                        method: 'POST',
                        url: "https://www.expressvpn.com/verify",
                        body: "utf8=%E2%9C%93&authenticity_token=6%2BccQin22wJ%2BUCM22KtrJlm19UxmHEHlsUEqgTyJgkdmakvEroOOzp0vi8GA4RifRgpkYAkKphnRkx62UqmDyw%3D%3D&verification_code=262675&commit=Continue"
                    },
                }
            })
        } else {
            // console.log(response.body)
        }
        // console.log(response.statusCode)
    }

    login() {
        return new Result({
            next: 'getDetail', needToRequest: true, data: {
                request: {
                    headers: {
                        "content-type": "application/x-www-form-urlencoded",
                    },
                    url: 'https://www.expressvpn.com/sessions',
                    method: 'POST',
                    form: {
                        "utf8": "✓",
                        "authenticity_token": "QHAzJskVmowL+DSKnINW1mEpBFF8JbBL6Dylu6sZxIHhiwiU3P35mI8aCPOTWTdc/bD43aple4stUtSElUY8nQ==",
                        "location_fragment": "",
                        "redirect_path": "",
                        "email": "rekea001@gmail.com",
                        "password": "Abc123456!",
                        "commit": "Sign In"
                    },
                    body: "utf8=%E2%9C%93&authenticity_token=S%2FbU3bY55fvkvF9qVGbnGBdD46xjIj2Yzjc2M7GuvrzGe4NbMUywNwfD950MLJShCPxygAw02mSu5QIE346%2FMA%3D%3D&location_fragment=&redirect_path=&email=tommyzhang003%40gmail.com&password=GoYNXkik&commit=Sign+In"
                }
            }
        })
    }

    getApiData({response}) {
        console.log(response.body)
    }

    getLogin() {
        return new Result({
            next: 'getDetail',
            needToRequest: true,
            data: [
                {
                    request: {
                        url: 'https://www.expressvpn.com/sign-in',
                        method: 'GET',
                    }
                },
            ]
        })
    }

    run(taskType) {
        return new Result({
            next: 'getLogin', needToRequest: true, data: {
                // request: {
                //     headers: {
                //         "accept": "application/json",
                //         "accept-language": "zh-CN,zh;q=0.9",
                //         "app_unique": "fbf1c0a3a8e72354ad413d0433166b0f",
                //         "cache-control": "no-cache",
                //         "callid": "lws2TWgUiqG",
                //         "content-type": "application/json",
                //         "debugcountry": "CN",
                //     },
                //     url: "http://dev-test.bo.center/gw/bobo/v2/getWebToken?isSmallApp=false&deviceId=fbf1c0a3a8e72354ad413d0433166b0f",
                //     method: 'GET',
                //     // headers: {
                //     //     cookie: "_fbp=fb.1.1607071581971.395083247; xv_tt=1; xvid=UhdOHW-LpyAEgVa4PDmfI8hm4IQ8YCDiemaqobaUINI%3D; xv_ab=%7B%7D; xvgtm=%7B%22location%22%3A%22US%22%2C%22logged_in%22%3Afalse%2C%22report_aid_to_ga%22%3Afalse%7D; _xv_web_frontend_session=dTlJclFQbGp2T2pia3loYkx3Vk50d1lHYmtQazBXZzExbnpzckwxMUpRdjhxUW53VnowcGJoMnMzVVVqTXVRR0FqUXRwU1lDYTcvbWREak5uYkszTDJuRzlUSXoyRXRNbHQzZmVXS0dlV3hXNzQ1d0FQb0x2OWxnUUU3cmVIVm1SSTh4WllqbFNhTFl5Rnp0UkpGbVJ3PT0tLVkrUzQ1cEt1dmVCQVNKeXkzQTdhbGc9PQ%3D%3D--f475f3d8c637b008905647ad59c6f4d5825041e5; landing_page=https://www.expressvpn.com/sign-in; _ga=GA1.2.1136474270.1607071609; _gid=GA1.2.1561351976.1607071609; _gat=1; _gcl_au=1.1.331674971.1607071609; tatari-cookie-test=37985080; tatari-session-cookie=e774f525-50de-5ca4-e9fc-f9769ce219e8; t-ip=1; _uetsid=3fa43290360d11ebbe9d639eafeaa34a; _uetvid=3fa49420360d11ebae88d389cf9dd39b; SnapABugRef=https%3A%2F%2Fwww.expressvpn.com%2Fsign-in%20https%3A%2F%2Fwww.expressvpn.com%2Fverify; SnapABugHistory=1#; SnapABugUserAlias=%23; SnapABugVisit=1#1607071610"
                //     // }
                // }
                request: {
                    url: 'https://www.expressvpn.com',
                    method: 'GET',
                    // body: "utf8=%E2%9C%93&authenticity_token=QHAzJskVmowL%2BDSKnINW1mEpBFF8JbBL6Dylu6sZxIHhiwiU3P35mI8aCPOTWTdc%2FbD43aple4stUtSElUY8nQ%3D%3D&location_fragment=&redirect_path=&email=rekea001%40gmail.com&password=Abc123456%21&commit=Sign+In"
                }
            }
        })
    }
}

module.exports = ExpressSpider
