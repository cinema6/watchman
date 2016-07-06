'use strict';

const JsonProducer = require('rc-kinesis').JsonProducer;
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const ld = require('lodash');
const moment = require('moment');

module.exports = function factory(config) {
    const watchmanStream = new JsonProducer(
        config.kinesis.producer.stream,
        config.kinesis.producer
    );
    const request = new CwrxRequest(config.appCreds);
    const paymentsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint);
    const paymentMethodsEndpoints = resolveURL(paymentsEndpoint, 'methods');
    const paymentPlansEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.paymentPlans.endpoint
    );

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const org = data.org;
        const now = moment(data.date);
        const nextPaymentDate = org.nextPaymentDate && moment(org.nextPaymentDate);

        if (!nextPaymentDate || nextPaymentDate.isAfter(now)) {
            return undefined;
        }

        return Promise.all([
            request.get({ url: paymentMethodsEndpoints, qs: { org: org.id } }),
            request.get({ url: `${paymentPlansEndpoint}/${org.paymentPlanId}` })
        ]).then(ld.unzip).then(ld.spread(ld.spread((paymentMethods, paymentPlan) => {
            const paymentMethod = ld.find(paymentMethods, { default: true });

            if (!paymentMethod) {
                throw new Error('Org ' + org.id + ' has no payment methods.');
            }

            return watchmanStream.produce({
                type: 'paymentRequired',
                data: {
                    org,
                    paymentPlan,
                    paymentMethod,
                    date: data.date
                }
            });
        })));
    });
};
