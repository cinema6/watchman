'use strict';

var JsonProducer = require('../producers/JsonProducer.js');
var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

module.exports = function(data, options, config) {
    var apiRoot = config.cwrx.api.root;
    var appCreds = config.appCreds;
    var analyticsEndpoint = apiRoot + config.cwrx.api.analytics.endpoint;
    var campaignEndpoint = apiRoot + config.cwrx.api.campaigns.endpoint;
    var fetchAnalytics = options.analytics || false;
    var log = logger.getLog();
    var prefix = (options.prefix) ? options.prefix + '_' : '';
    var producerConfig = config.kinesis.producer;
    var statuses = (options.statuses) ? options.statuses : ['active'];
    var watchmanProducer = new JsonProducer(producerConfig.stream, producerConfig);

    function getCampaigns() {
        return requestUtils.makeSignedRequest(appCreds, 'get', {
            url: campaignEndpoint,
            json: true,
            jar: true,
            qs: {
                statuses: statuses.join(',')
            }
        }).then(function(response) {
            var statusCode = response.response.statusCode;
            var body = response.body;
            if(statusCode === 200) {
                return body.map(function(campaign) {
                    return {
                        campaign: campaign
                    };
                });
            } else {
                log.warn('Error requesting campaigns, code: %1 body: %2', statusCode,
                    JSON.stringify(body));
                return [];
            }
        });
    }
    
    function getAnalytics(data) {
        var campaignIds = data.map(function(dataEntry) {
            return dataEntry.campaign.id;
        });
        return Q.resolve().then(function() {
            if(fetchAnalytics && campaignIds.length > 0) {
                return requestUtils.makeSignedRequest(appCreds, 'get', {
                    url: analyticsEndpoint + '/campaigns',
                    json: true,
                    jar: true,
                    qs: {
                        ids: campaignIds.join(',')
                    }
                }).then(function(response) {
                    var statusCode = response.response.statusCode;
                    var body = response.body;
                    if(statusCode === 200) {
                        return body.map(function(analytics, index) {
                            return {
                                campaign: data[index].campaign,
                                analytics: analytics
                            };
                        });
                    } else {
                        log.warn('Error requesting analytics, code: %1 body: %2', statusCode,
                            JSON.stringify(body));
                        return data;
                    }
                });
            } else {
                return data;
            }
        });
    }
    
    function produceResults(data) {
        return Q.allSettled(data.map(function(dataEntry) {
            return watchmanProducer.produce({
                type: prefix + 'campaignPulse',
                data: dataEntry
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
    }

    return getCampaigns()
        .then(getAnalytics)
        .then(produceResults);
};
