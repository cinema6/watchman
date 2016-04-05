'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');
var util = require('util');

var DEFAULT_FETCH_NUMBER = 50;

var __ut__ = (global.jasmine !== undefined) ? true : false;

var __private__ = {
    /**
    * GETs a given endpoint given app credentials and query params.
    */
    getRequest: function(appCreds, endpoint, query) {
        var log = logger.getLog();
        return requestUtils.makeSignedRequest(appCreds, 'get', {
            url: endpoint,
            json: true,
            qs: query
        }).then(function(response) {
            var body = response.body;
            var statusCode = response.response.statusCode;
            if(statusCode === 200) {
                return response;
            } else {
                log.warn('Error getting %1 with query params %2, code: %3 body: %4', endpoint,
                    util.inspect(query), statusCode, body);
                return Q.reject(body);
            }
        });
    },

    /**
    * Gets an array of campaigns and resolves with a campaign data object whose keys are campaign
    * ids.
    */
    getCampaigns: function(appCreds, endpoint, query) {
        return __private__.getRequest(appCreds, endpoint, query).then(function(response) {
            var body = response.body;
            var campData = { };
            body.forEach(function(campaign) {
                campData[campaign.id] = {
                    campaign: campaign
                };
            });
            return campData;
        });
    },

    /**
    * Populates a campaign data object with any available analytics for the campaign.
    */
    getAnalytics: function(campData, appCreds, endpoint) {
        var campaignIds = Object.keys(campData);
        return Q.resolve().then(function() {
            if(campaignIds.length > 0) {
                return __private__.getRequest(appCreds, endpoint, {
                    ids: campaignIds.join(',')
                }).then(function(response) {
                    var body = response.body;
                    body.forEach(function(analytics) {
                        campData[analytics.campaignId].analytics = analytics;
                    });
                    return campData;
                });
            } else {
                return campData;
            }
        });
    },

    /**
    * Produces data concerning each campaign in the campaign data object to the watchman stream.
    */
    produceResults: function(producer, campData, prefix) {
        var log = logger.getLog();
        var prefixStr = (prefix) ? prefix + '_' : '';
        return Q.allSettled(Object.keys(campData).map(function(id) {
            return producer.produce({
                type: prefixStr + 'campaignPulse',
                data: campData[id]
            });
        })).then(function(results) {
            results.forEach(function(result) {
                if (result.state !== 'fulfilled') {
                    var reason = result.reason;
                    log.warn('Error producing into %1 stream: %2', producer.streamName, reason);
                }
            });
        });
    },

    /**
    * Gets the total number of campaigns with a given list of statuses.
    */
    getNumCampaigns: function(appCreds, campaignEndpoint, statuses) {
        return __private__.getRequest(appCreds, campaignEndpoint, {
            fields: 'id',
            limit: 1,
            statuses: statuses.join(',')
        }).then(function(response) {
            var range = response.response.headers['content-range'];
            var match = range.match(/\d+-\d+\/(\d+)/);
            if(match) {
                return parseInt(match[1]);
            } else {
                return Q.reject('Unrecognized Content-Range header ' + range);
            }
        });
    }
};

function factory(config) {
    return function action(event) {
        var options = event.options;
        var apiRoot = config.cwrx.api.root;
        var appCreds = config.appCreds;
        var analyticsEndpoint = apiRoot + config.cwrx.api.analytics.endpoint + '/campaigns';
        var campaignEndpoint = apiRoot + config.cwrx.api.campaigns.endpoint;
        var fetchAnalytics = options.analytics || false;
        var fetchNumber = options.number || DEFAULT_FETCH_NUMBER;
        var log = logger.getLog();
        var prefix = options.prefix;
        var producerConfig = config.kinesis.producer;
        var statuses = (options.statuses) ? options.statuses : ['active'];
        var watchmanProducer = new JsonProducer(producerConfig.stream, producerConfig);

        return __private__.getNumCampaigns(appCreds, campaignEndpoint, statuses)
            .then(function(numCampaigns) {
                var skipNumbers = [];
                for(var i=0;i<numCampaigns;i+=fetchNumber) {
                    skipNumbers.push(i);
                }
                return Q.allSettled(skipNumbers.map(function(skipNumber) {
                    return __private__.getCampaigns(appCreds, campaignEndpoint, {
                        limit: fetchNumber,
                        skip: skipNumber,
                        sort: 'id,1',
                        statuses: statuses.join(',')
                    }).then(function(campData) {
                        if(fetchAnalytics) {
                            return __private__.getAnalytics(campData, appCreds, analyticsEndpoint);
                        } else {
                            return campData;
                        }
                    }).then(function(campData) {
                        return __private__.produceResults(watchmanProducer, campData, prefix);
                    });
                })).then(function(results) {
                    results.filter(function(result) {
                        return result.state !== 'fulfilled';
                    }).forEach(function(result, index) {
                        var reason = result.reason;
                        log.warn('Error requesting page %1 of campaigns: %2', index, reason);
                    });
                });
            });
    };
}

// Expose private functions for unit testing
if (__ut__){
    factory.__private__ = __private__;
}
module.exports = factory;
