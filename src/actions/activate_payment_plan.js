'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var ld = require('lodash');
var moment = require('moment');
var q = require('q');
var logger = require('cwrx/lib/logger');
var inspect = require('util').inspect;

module.exports = function activatePaymentPlanFactory(config) {
    var log = logger.getLog();
    var watchmanStream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var request = new CwrxRequest(config.appCreds);
    var orgsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);
    var promotionsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.promotions.endpoint);

    return function activatePaymentPlan(event) {
        var data = event.data;
        var campaign = data.campaign;
        var now = moment(data.date);
        var orgEndpoint = orgsEndpoint + '/' + campaign.org;

        return request.get({ url: orgEndpoint }).spread(function getPromotions(org) {
            var promotionIds = ld.map(org.promotions, 'id');
            var paymentPlan = config.paymentPlans[org.paymentPlanId];

            if (org.paymentPlanStart || !org.paymentPlanId) {
                return;
            }

            return (
                promotionIds.length > 0 ?
                    request.get({ url: promotionsEndpoint, qs: { ids: promotionIds.join(',') } }) :
                    q([])
            ).spread(function updateOrg(promotions) {
                var freeTrials = ld.filter(promotions, { type: 'freeTrial' });
                var trialLength = ld.sum(freeTrials.map(ld.property('data.trialLength')));

                return request.put({
                    url: orgEndpoint,
                    json: ld.merge({}, org, {
                        paymentPlanStart: moment(now).add(trialLength, 'days').format()
                    })
                }).spread(function fulfillPromotions() {
                    return q.all(freeTrials.map(function(promotion) {
                        return watchmanStream.produce({
                            type: 'promotionFulfilled',
                            data: {
                                org: org,
                                promotion: promotion,
                                paymentPlan: paymentPlan
                            }
                        }).catch(function logError(reason) {
                            log.error(
                                'Failed to fulfill promotion %1: %2',
                                promotion.id, inspect(reason)
                            );
                        });
                    }));
                });
            });
        }).thenResolve(undefined);
    };
};