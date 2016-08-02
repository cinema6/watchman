'use strict';

const Q = require('q');
const ld = require('lodash');
const requestUtils = require('cwrx/lib/requestUtils.js');
const url = require('url');
const util = require('util');

class HubspotError extends Error {
    constructor(code, body) {
        super(`Hubspot request error ${code}: ${util.inspect(body)}`);
        this.code = code;
        this.body = body;
    }
}

module.exports = class Hubspot {
    constructor(apiKey) {
        if(!apiKey) {
            throw new Error('Must pass an api key');
        }

        this.apiRoot = {
            protocol: 'https',
            hostname: 'api.hubapi.com',
            query: {
                hapikey: apiKey
            }
        };
        this.maxRetries = 3;
    }

    retryOnRateLimit(method, options, attempt) {
        const rateLimitCode = 429;
        return requestUtils.qRequest(method, options).then(response => {
            const code = response.response.statusCode;

            if (code !== rateLimitCode) {
                return response;
            }

            if (attempt === this.maxRetries) {
                throw new HubspotError(code, response.body);
            }

            const randomWait = ld.random(1000, (attempt + 2) * 1000);
            return new Promise(resolve => (
                setTimeout(() => {
                    resolve();
                }, randomWait)
            )).then(() => (
                this.retryOnRateLimit(method, options, attempt + 1)
            ));
        });
    }

    hubspotRequest(method, pathname, body) {
        const options = {
            uri: url.format(ld.assign({ }, this.apiRoot, {
                pathname: pathname
            }))
        };
        if (body) {
            options.json = body;
        }
        return this.retryOnRateLimit(method, options, 0);
    }

    getContactByEmail(email) {
        const pathname = `/contacts/v1/contact/email/${email}/profile`;
        return this.hubspotRequest('get', pathname).then(response => {
            const code = response.response.statusCode;
            switch(code) {
            case 200:
                return response.body;
            case 404:
                return null;
            default:
                return Q.reject(new HubspotError(code, response.body));
            }
        });
    }

    deleteContact(vid) {
        const pathname = `/contacts/v1/contact/vid/${vid}`;
        return this.hubspotRequest('delete', pathname).then(response => {
            const code = response.response.statusCode;

            if(code !== 200) {
                return Q.reject(new HubspotError(code, response.body));
            }

            return response.body;
        });
    }

    updateContact(vid, updates) {
        const pathname = `/contacts/v1/contact/vid/${vid}/profile`;
        return this.hubspotRequest('post', pathname, updates).then(response => {
            var code = response.response.statusCode;
            if(code === 204) {
                return response.body;
            } else {
                return Q.reject(new HubspotError(code, response.body));
            }
        });
    }

    createContact(contact) {
        const pathname = '/contacts/v1/contact';
        return this.hubspotRequest('post', pathname, contact).then(response => {
            const code = response.response.statusCode;
            if(code === 200) {
                return response.body;
            } else {
                return Q.reject(new HubspotError(code, response.body));
            }
        });
    }
};
