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
    var orgsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);

    return function checkPaymentRequired(event) {
        var data = event.data;
        var org = data.org;
        var paymentPlanStart = org.paymentPlanStart && moment(org.paymentPlanStart);
        var nextPaymentDate = org.nextPaymentDate && moment(org.nextPaymentDate);

        function needsPayment(lastPayment) {
            var today = moment(data.date);
            var nextPaymentDate = lastPayment && moment(lastPayment.createdAt).add(1, 'month');

            return !lastPayment || nextPaymentDate.isSameOrBefore(today, 'day');
        }

        function produceRecord() {
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
                            paymentMethod: paymentMethod,
                            date: data.date
                        }
                    });
                });
        }

        function updateOrg(nextPaymentDate) {
            return request.put({
                url: orgsEndpoint + '/' + org.id,
                json: {
                    nextPaymentDate: nextPaymentDate.format()
                }
            });
        }

        if (nextPaymentDate) {
            if (nextPaymentDate.isSameOrBefore(moment(data.date))) {
                return produceRecord();
            }

            return q();
        }

        if (!(org.paymentPlanId in config.paymentPlans) || !paymentPlanStart) {
            return q();
        }

        if (paymentPlanStart.isAfter(moment(data.date), 'day')) {
            return updateOrg(paymentPlanStart).thenResolve(undefined);
        }

        return request.get({ url: paymentsEndpoint, qs: { org: org.id } })
            .spread(function checkPayments(payments) {
                var today = moment(data.date);
                var lastPayment = ld.find(payments, { status: 'settled' });
                var paymentRequired = needsPayment(lastPayment);
                var nextPaymentDate = paymentRequired ?
                    today : moment(lastPayment.createdAt).add(1, 'month');

                return updateOrg(nextPaymentDate).then(function() {
                    if (paymentRequired) {
                        return produceRecord();
                    }
                });
            })
            .thenResolve(undefined);
    };
};
