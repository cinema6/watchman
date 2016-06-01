'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;

module.exports = function chargePaymentPlanFactory(config) {
    var watchmanStream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var request = new CwrxRequest(config.appCreds);
    var paymentsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint);

    return function chargePaymentPlan(event) {
        var data = event.data;
        var options = event.options;
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
                    target: options.target
                })
            }
        }).spread(function handleSuccess(payment) {
            return watchmanStream.produce({
                type: 'chargedPaymentPlan',
                data: {
                    org: org,
                    paymentPlan: paymentPlan,
                    payment: payment
                }
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
