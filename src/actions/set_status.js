'use strict';

var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

module.exports = function(config) {
    return function (event) {
        var data = event.data;
        var options = event.options;
        var apiRoot = config.cwrx.api.root;
        var appCreds = config.appCreds;
        var campaignEndpoint = apiRoot + config.cwrx.api.campaigns.endpoint;
        var log = logger.getLog();
        var status = options.status;

        return Q.resolve().then(function() {
            if(data.campaign && data.campaign.id && status) {
                var campaignId = data.campaign.id;
                return requestUtils.makeSignedRequest(appCreds, 'put', {
                    url: campaignEndpoint + '/' + campaignId,
                    json: {
                        status: status
                    }
                }).then(function(response) {
                    var statusCode = response.response.statusCode;
                    var body = response.body;
                    if(statusCode === 200) {
                        log.info('Changed status of campaign %1 (%2) from %3 to %4',
                            data.campaign.name, campaignId, data.campaign.status, status);
                    } else {
                        log.error('Error updating status of campaign %1 (%2) from  %3 to %4,' +
                            ' code: %5 body: %6', data.campaign.name, campaignId,
                            data.campaign.status, status, statusCode, JSON.stringify(body));
                    }
                });
            }
        });
    };
};
