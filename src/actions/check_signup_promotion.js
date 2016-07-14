'use strict';

var q               = require('q'),
    util            = require('util'),
    ld              = require('lodash'),
    rcKinesis       = require('rc-kinesis'),
    logger          = require('cwrx/lib/logger.js'),
    Status          = require('cwrx/lib/enums.js').Status,
    requestUtils    = require('cwrx/lib/requestUtils.js');

// Check if a user signed up with a promotion; if so, add the promotion to their org's promotions
// array and publish a 'promotionFulfilled' event.
module.exports = function(config) {
    return function (event) {
        var log = logger.getLog();
        var appCreds = config.appCreds;
        var producerConfig = config.kinesis.producer;
        var promotionsConfig = config.promotions;
        var watchmanProducer = new rcKinesis.JsonProducer(producerConfig.stream, producerConfig);
        var user = event.data.user;

        if (!user || !user.promotion) {
            return q();
        }

        // Fetch the user's org + promotion
        var orgUrl = config.cwrx.api.root + config.cwrx.api.orgs.endpoint,
            promUrl = config.cwrx.api.root + config.cwrx.api.promotions.endpoint;

        return q.all([
            requestUtils.makeSignedRequest(appCreds, 'get', { url: orgUrl + '/' + user.org }),
            requestUtils.makeSignedRequest(appCreds, 'get', { url: promUrl + '/' + user.promotion })
        ])
        .spread(function(orgResp, promResp) {
            if (orgResp.response.statusCode !== 200) {
                return q.reject({
                    message: 'Error fetching org',
                    reason: { code: orgResp.response.statusCode, body: orgResp.body }
                });
            }
            if (promResp.response.statusCode !== 200) {
                log.warn('Failed fetching promotion %1, skipping: %2, %3',
                         user.promotion, promResp.response.statusCode, promResp.body);
                return q();
            }
            var org = orgResp.body, promotion = promResp.body,
                promotionConfig = ld.find(promotionsConfig, { type: promotion.type });

            if (!promotionConfig || promotion.status !== Status.Active) {
                log.warn('User %1 has invalid promotion %2, skipping', user.id, promotion.id);
                return q();
            }

            org.promotions = org.promotions || [];

            // Warn and exit if org already has this same promotion
            var existing = org.promotions.some(function(promWrapper) {
                return promWrapper.id === promotion.id;
            });
            if (existing) {
                log.warn('Org %1 already has signup promotion %2, not re-applying',
                         org.id, promotion.id);
                return q();
            }

            // Add the new promotion to the org's promotions array and PUT the org
            var now = new Date();
            org.promotions.push({
                id: promotion.id,
                created: now,
                lastUpdated: now,
                status: Status.Active
            });

            return requestUtils.makeSignedRequest(appCreds, 'put', {
                url: orgUrl + '/' + org.id,
                json: org
            })
            .then(function(putResp) {
                if (putResp.response.statusCode !== 200) {
                    return q.reject({
                        message: 'Error editing org',
                        reason: { code: putResp.response.statusCode, body: putResp.body }
                    });
                }
                org = putResp.body;

                log.info('Applied signup promotion %1 from user %2 to org %3',
                         promotion.id, user.id, org.id);

                if (promotionConfig.fulfillImmediately) {
                    // Produce promotionFulfilled event so credit can be created
                    return watchmanProducer.produce({
                        type: 'promotionFulfilled',
                        data: {
                            org: org,
                            promotion: promotion,
                            date: event.data.date
                        }
                    });
                }
            });
        })
        .catch(function(error) {
            log.error('Error checking signup promotion on user %1: %2', util.inspect(error));
        });
    };
};
