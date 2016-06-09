'use strict';

var Q = require('q');
var ld = require('lodash');
var requestUtils = require('cwrx/lib/requestUtils.js');
var url = require('url');

function Hubspot(apiKey) {
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
            if(response.response.statusCode === 200) {
                return response.body;
            } else {
                return Q.reject(response.body);
            }
        });
    },
    deleteContact: function(vid) {
        return requestUtils.qRequest('delete', {
            uri: url.format(ld.assignIn({ }, this.apiRoot, {
                pathname: '/contacts/v1/contact/vid/' + vid
            }))
        }).then(function(response) {
            if(response.response.statusCode === 200) {
                return response.body;
            } else {
                return Q.reject(response.body);
            }
        });
    }
};
module.exports = Hubspot;
