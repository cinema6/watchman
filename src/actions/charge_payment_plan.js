'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var moment = require('moment');
var logger = require('cwrx/lib/logger');
var inspect = require('util').inspect;

module.exports = function chargePaymentPlanFactory(config) {
    var watchmanStream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var request = new CwrxRequest(config.appCreds);
    var paymentsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint);
    var orgsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);
    var log = logger.getLog();

    return function chargePaymentPlan(event) {
        var data = event.data;
        var options = event.options;
        var today = moment(data.date);
        var org = data.org;
        var paymentMethod = data.paymentMethod;
        var paymentPlan = data.paymentPlan;

        return request.post({
            url: paymentsEndpoint,
            qs: { org: org.id, target: options.target },
            json: {
                paymentMethod: paymentMethod.token,
                amount: paymentPlan.price,
                description: JSON.stringify({
                    eventType: 'credit',
                    source: 'braintree',
                    target: options.target,
                    paymentPlanId: paymentPlan.id
                })
            }
        }).spread(function handleSuccess(payment) {
            return request.put({
                url: orgsEndpoint + '/' + org.id,
                json: {
                    nextPaymentDate: moment(today).add(1, 'month').format()
                }
            }).then(function produceRecord() {
                return watchmanStream.produce({
                    type: 'chargedPaymentPlan',
                    data: {
                        org: org,
                        paymentPlan: paymentPlan,
                        payment: payment
                    }
                });
            }, function logError(reason) {
                log.error(
                    'Failed to update org(%1)\'s nextPaymentDate: %2.',
                    org.id, inspect(reason)
                );
            });
        }).catch(function handleFailure(reason) {
            if (/^4/.test(reason.statusCode)) {
                return watchmanStream.produce({
                    type: 'chargePaymentPlanFailure',
                    data: {
                        org: org,
                        paymentPlan: paymentPlan,
                        paymentMethod: paymentMethod
                    }
                });
            }

            throw reason;
        }).thenResolve(undefined);
    };
};
