'use strict';

var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

module.exports = function(data, options, config) {
    var apiRoot = config.cwrx.api.root;
    var authEndpoint = apiRoot + config.cwrx.api.auth.endpoint + '/login';
    var campaignEndpoint = apiRoot + config.cwrx.api.campaigns.endpoint;
    var log = logger.getLog();
    var status = options.status;

    return Q.resolve().then(function() {
        if(data.campaign && data.campaign.id && status) {
            var campaignId = data.campaign.id;
            return requestUtils.qRequest('post', {
                url: authEndpoint,
                json: {
                    email: config.secrets.email,
                    password: config.secrets.password
                },
                jar: true
            }).then(function() {
                return requestUtils.qRequest('put', {
                    url: campaignEndpoint + '/' + campaignId,
                    json: {
                        status: status
                    },
                    jar: true
                });
            }).then(function(response) {
                var statusCode = response.response.statusCode;
                var body = response.body;
                if(statusCode !== 200) {
                    log.warn('Error updating campaign status to %1, code: %2 body: %3', status,
                        statusCode, JSON.stringify(body));
                }
            });
        }
    });
};
