'use strict';

var Q = require('q');
var ld = require('lodash');
var requestUtils = require('cwrx/lib/requestUtils.js');
var url = require('url');

function Hubspot(apiKey) {
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
}
Hubspot.prototype = {
    getContactByEmail: function(email) {
        return requestUtils.qRequest('get', {
            uri: url.format(ld.assignIn({ }, this.apiRoot, {
                pathname: '/contacts/v1/contact/email/' + email + '/profile'
            }))
        }).then(function(response) {
            var code = response.response.statusCode;
            switch(code) {
            case 200:
                return response.body;
            case 404:
                return null;
            default:
                return Q.reject(new Error(`code ${code}, body: ${response.body}`));
            }
        });
    },
    deleteContact: function(vid) {
        return requestUtils.qRequest('delete', {
            uri: url.format(ld.assignIn({ }, this.apiRoot, {
                pathname: '/contacts/v1/contact/vid/' + vid
            }))
        }).then(function(response) {
            var code = response.response.statusCode;
            if(code === 200) {
                return response.body;
            } else {
                return Q.reject(new Error(`code ${code}, body: ${response.body}`));
            }
        });
    },
    updateContact: function(vid, updates) {
        return requestUtils.qRequest('post', {
            uri: url.format(ld.assignIn({ }, this.apiRoot, {
                pathname: '/contacts/v1/contact/vid/' + vid + '/profile'
            })),
            json: updates
        }).then(function(response) {
            var code = response.response.statusCode;
            if(code === 204) {
                return response.body;
            } else {
                return Q.reject(new Error(`code ${code}, body: ${response.body}`));
            }
        });
    },
    createContact: function(contact) {
        return requestUtils.qRequest('post', {
            uri: url.format(ld.assignIn({ }, this.apiRoot, {
                pathname: '/contacts/v1/contact'
            })),
            json: contact
        }).then(function(response) {
            var code = response.response.statusCode;
            if(code === 200) {
                return response.body;
            } else {
                return Q.reject(new Error(`code ${code}, body: ${response.body}`));
            }
        });
    }
};
module.exports = Hubspot;
