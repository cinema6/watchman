'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var CwrxRequest = require('../../lib/CwrxRequest');
var resolveURL = require('url').resolve;
var ld = require('lodash');
var moment = require('moment');
var q = require('q');

module.exports = function checkPaymentRequiredFactory(config) {
    var watchmanStream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var request = new CwrxRequest(config.appCreds);
    var paymentsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint);
    var paymentMethodsEndpoints = resolveURL(paymentsEndpoint, 'methods');

    return function checkPaymentRequired(event) {
        var data = event.data;
        var org = data.org;

        function needsPayment(lastPayment) {
            var today = moment(data.date);
            var nextPaymentDate = lastPayment && moment(lastPayment.createdAt).add(1, 'month');

            return !lastPayment || nextPaymentDate.isSameOrBefore(today, 'day');
        }

        if (!(org.paymentPlanId in config.paymentPlans)) { return q(); }

        return request.get({ url: paymentsEndpoint, qs: { org: org.id } })
            .spread(function checkPayments(payments) {
                var lastSuccessfulPayment = ld.find(payments, { status: 'settled' });

                if (!needsPayment(lastSuccessfulPayment)) { return; }

                return request.get({ url: paymentMethodsEndpoints, qs: { org: org.id } })
                    .spread(function getDefaultPaymentMethod(paymentMethods) {
                        var paymentMethod = ld.find(paymentMethods, { default: true });

                        if (!paymentMethod) {
                            throw new Error('Org ' + org.id + ' has no payment methods.');
                        }

                        return watchmanStream.produce({
                            type: 'paymentRequired',
                            data: {
                                org: org,
                                paymentPlan: config.paymentPlans[org.paymentPlanId],
                                paymentMethod: paymentMethod
                            }
                        });
                    });
            })
            .thenResolve(undefined);
    };
};
