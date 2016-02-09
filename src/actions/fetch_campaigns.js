'use strict';

var JsonProducer = require('../producers/JsonProducer.js');
var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

module.exports = function(data, options, config) {
    var apiRoot = config.cwrx.api.root;
    var authEndpoint = apiRoot + config.cwrx.api.auth.endpoint + '/login';
    var campaignEndpoint = apiRoot + config.cwrx.api.campaigns.endpoint;
    var log = logger.getLog();
    var prefix = (options.prefix) ? options.prefix + '_' : '';
    var producerConfig = config.kinesis.producer;
    var status = (options.status) ? options.status : 'active';
    var watchmanProducer = new JsonProducer(producerConfig.stream, producerConfig);    

    return requestUtils.qRequest('post', {
        url: authEndpoint,
        json: {
            email: config.secrets.email,
            password: config.secrets.password
        },
        jar: true
    }).then(function() {
        return requestUtils.qRequest('get', {
            url: campaignEndpoint,
            json: true,
            jar: true,
            qs: {
                statuses: status
            }
        });
    }).then(function(response) {
        var statusCode = response.response.statusCode;
        var body = response.body;
        if(statusCode === 200) {
            return Q.allSettled(body.map(function(campaign) {
                return watchmanProducer.produce({
                    type: prefix + 'campaignPulse',
                    data: {
                        campaign: campaign
                    }
                });
            })).then(function(results) {
                results.forEach(function(result) {
                    if (result.state !== 'fulfilled') {
                        var reason = result.reason;
                        log.warn('Error producing into %1 stream: %2', producerConfig.stream,
                            reason);
                    }
                });
            });
        } else {
            log.warn('Error requesting campaigns, code: %1 body: %2', statusCode,
                JSON.stringify(body));
        }
    });
};
