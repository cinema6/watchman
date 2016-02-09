'use strict';

var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

var ENDED_STATUS = 'expired';

module.exports = function(data, options, config) {
    var apiRoot = config.cwrx.api.root;
    var authEndpoint = apiRoot + config.cwrx.api.auth.endpoint + '/login';
    var campaignEndpoint = apiRoot + config.cwrx.api.campaigns.endpoint;
    var log = logger.getLog();

    return Q.resolve().then(function() {
        if(data.campaign && data.campaign.id) {
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
                        status: ENDED_STATUS
                    },
                    jar: true
                });
            }).then(function(response) {
                var statusCode = response.response.statusCode;
                var body = response.body;
                if(statusCode !== 200) {
                    log.warn('Error updating campaign status, code: %1 body: %2', statusCode,
                        JSON.stringify(body));
                }
            });
        }
    });
};
